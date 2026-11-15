import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/Auth';
import { App } from '../app/App';
import { workspaceIdentity } from '../api/identity';
import { readVersions, type OnboardingStep } from '../api/configuration';
import {
  effectiveInstant,
  effectiveVersion,
  localDateTime,
  managesBusiness,
  onboardingProgress,
  validateRate,
} from '../lib/configuration';
import { grant, snapshot } from './identity-fixtures';

describe('configuration rules', () => {
  it('requires the active membership to have business-wide administration access', () => {
    const user = workspaceIdentity(snapshot)!;
    expect(managesBusiness(user, snapshot)).toBe(true);
    expect(
      managesBusiness(user, {
        ...snapshot,
        memberships: [{ ...snapshot.memberships[0], all_branches: 0 }],
      }),
    ).toBe(false);
    expect(managesBusiness({ ...user, role: 'MANAGER' }, snapshot)).toBe(false);
    expect(managesBusiness({ ...user, membershipId: 999 }, snapshot)).toBe(false);
    expect(managesBusiness({ ...user, operator: true }, snapshot)).toBe(false);
  });
  it('excludes skipped and stale completed steps from valid completion', () => {
    const rows = [
      { status: 'COMPLETE', ready: true },
      { status: 'COMPLETE', ready: false, needsReview: true },
      { status: 'SKIPPED', ready: true },
    ] as OnboardingStep[];
    expect(onboardingProgress(rows)).toEqual({ complete: 1, skipped: 1, review: 1 });
  });
  it.each(['100.0001', '1e1', '-1', '0.00001', '1,5', ''])(
    'rejects unsupported rate %s',
    (value) => {
      expect(() => validateRate(value, 'TAXABLE')).toThrow();
    },
  );
  it('preserves decimal text and distinguishes exempt and zero-rated', () => {
    expect(validateRate('12.3456', 'TAXABLE')).toBe('12.3456');
    expect(validateRate('0.0000', 'ZERO_RATED')).toBe('0.0000');
    expect(validateRate('0', 'EXEMPT')).toBe('0');
    expect(() => validateRate('1', 'EXEMPT')).toThrow(/zero/);
    expect(() => validateRate('1', 'ZERO_RATED')).toThrow(/zero/);
  });
  it('converts local effective dates explicitly and rejects invalid input', () => {
    const date = new Date('2026-11-14T15:30:15Z');
    expect(effectiveInstant(localDateTime(date))).toBe(date.toISOString());
    expect(effectiveInstant(localDateTime(date) + '.123')).toBe('2026-11-14T15:30:15.123Z');
    expect(() => effectiveInstant('invalid')).toThrow();
    expect(() => effectiveInstant('1969-01-01T12:00')).toThrow();
  });
  it('finds the effective version beyond pages of future versions', async () => {
    const future = Array.from({ length: 200 }, (_, i) => ({ effective_from_ms: 3000 + i }));
    const read = vi.fn(async (path: string) =>
      path.includes('offset=200') ? [{ effective_from_ms: 500 }] : future,
    );
    const versions = await readVersions(read, '/policies');
    expect(read).toHaveBeenCalledTimes(2);
    expect(effectiveVersion(versions, 1000)?.effective_from_ms).toBe(500);
    expect(effectiveVersion(versions, 100)).toBeUndefined();
  });
});

type Call = { path: string; method: string; body: Record<string, unknown> };
function backend({
  role = 'OWNER',
  allBranches = true,
  conflict = false,
  lostResponse = false,
  noActive = false,
  dormantPrice = false,
  progressError = false,
} = {}) {
  const calls: Call[] = [];
  let settings = {
    revision: 0,
    receipt_name: 'Original',
    receipt_footer: 'Thanks',
    low_stock_notifications: 1,
    allow_branch_price_mode: dormantPrice ? 0 : 1,
  };
  let steps = [
    'BUSINESS_DETAILS',
    'BRANCHES',
    'TAX_REVIEW',
    'CATALOG',
    'OPENING_STOCK',
    'STAFF',
    'POS_TEST',
  ].map((step) => ({
    step,
    revision: 0,
    status: 'NOT_STARTED',
    notes: '',
    ready: step === 'BUSINESS_DETAILS',
    needsReview: false,
  }));
  let postAttempts = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      const path = new URL(url).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(String(options.body)) : {};
      calls.push({ path, method, body });
      let value: unknown = [];
      if (path.endsWith('/login')) value = grant;
      else if (path.endsWith('/me'))
        value = {
          ...snapshot,
          role,
          memberships: [{ ...snapshot.memberships[0], role, all_branches: allBranches ? 1 : 0 }],
        };
      else if (path === '/api/business')
        value = { id: 2, name: 'Auto Parts', currency: 'JMD', default_threshold: 3 };
      else if (path === '/api/v1/branches')
        value = [{ id: 7, name: 'Main', active: noActive ? 0 : 1 }];
      else if (path === '/api/v1/settings') {
        if (method === 'PUT') {
          if (conflict && body.revision === 0) {
            settings = { ...settings, revision: 1, receipt_name: 'Other editor' };
            return new Response(
              '{"detail":"Configuration revision changed; reload before saving"}',
              { status: 409 },
            );
          }
          settings = {
            revision: settings.revision + 1,
            receipt_name: body.receiptName,
            receipt_footer: body.receiptFooter,
            low_stock_notifications: body.lowStockNotifications ? 1 : 0,
            allow_branch_price_mode: body.allowBranchPriceMode ? 1 : 0,
          };
        }
        value = settings;
      } else if (path === '/api/v1/branches/7/settings')
        value = {
          effective: { ...settings, price_mode: 'EXCLUSIVE', branch_revision: 0 },
          overrides: { revision: 0, price_mode: dormantPrice ? 'INCLUSIVE' : null },
        };
      else if (path === '/api/v1/onboarding') {
        if (progressError)
          return new Response('{"detail":"Progress service unavailable"}', { status: 503 });
        value = steps;
      } else if (path.startsWith('/api/v1/onboarding/') && method === 'PUT') {
        const step = path.split('/').pop();
        steps = steps.map((s) =>
          s.step === step ? { ...s, ...body, revision: s.revision + 1 } : s,
        );
        value = steps.find((s) => s.step === step);
      } else if (path === '/api/v1/tax/templates') {
        value = [
          {
            code: 'EXAMPLE',
            label: 'Server sample',
            classification: 'TAXABLE',
            rate_percent: '7.2500',
          },
        ];
      } else if (path === '/api/v1/tax/policies') {
        if (method === 'POST') {
          postAttempts++;
          if (lostResponse && postAttempts === 1) throw new TypeError('Failed to fetch');
          value = { id: 'new-policy', ...body };
        } else
          value = [
            {
              id: 'default',
              effective_from_ms: 0,
              registration_status: 'NOT_REGISTERED',
              registration_number: '',
              price_mode: 'EXCLUSIVE',
              verified: 0,
              verification_note: 'Unverified default',
            },
          ];
      }
      return new Response(JSON.stringify(value));
    }),
  );
  return calls;
}
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
async function login(user: ReturnType<typeof mount>) {
  await user.type(screen.getByLabelText('Email address'), 'owner@test.local');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'example-password');
  await user.click(screen.getByRole('button', { name: 'Sign in to workspace' }));
  await screen.findByRole('heading', { name: 'Welcome back, Demo.' });
}
async function settingsPage(user: ReturnType<typeof mount>) {
  await user.click(screen.getByRole('link', { name: 'Settings' }));
  await screen.findByRole('heading', { name: 'Receipts and branch controls' });
}

describe('F2 workflows', () => {
  it('keeps the dashboard available without inventing progress when setup cannot load', async () => {
    backend({ progressError: true });
    const user = mount();
    await login(user);
    expect(await screen.findByText('Saved setup progress is unavailable.')).toBeInTheDocument();
    expect(screen.queryByText(/0 of 7 steps complete/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Resume setup/ }));
    expect(
      await screen.findByRole('heading', { name: 'Saved progress unavailable' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry saved progress' })).toBeInTheDocument();
  });
  it('keeps example rates server-supplied and marked illustrative after owner review', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await settingsPage(user);
    await user.click(screen.getByRole('link', { name: 'Jamaica tax setup' }));
    await user.click(
      await screen.findByRole('button', { name: 'Use example: Server sample (7.2500%)' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/^Rate percentage/)).toHaveValue('7.2500');
    await user.click(within(dialog).getByLabelText(/^Owner review confirmation/));
    await user.type(within(dialog).getByLabelText('Review reference / note'), 'Example reviewed');
    await user.click(within(dialog).getByRole('button', { name: 'Create version' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      calls.find((c) => c.path === '/api/v1/tax/profiles/EXAMPLE/versions' && c.method === 'POST')
        ?.body,
    ).toMatchObject({ ratePercent: '7.2500', illustrative: true, verified: true });
  });
  it('rejects a nonzero exempt profile before sending a tax version', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await settingsPage(user);
    await user.click(screen.getByRole('link', { name: 'Jamaica tax setup' }));
    await user.click(
      await screen.findByRole('button', { name: 'Use example: Server sample (7.2500%)' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Product classification'), 'EXEMPT');
    await user.click(within(dialog).getByRole('button', { name: 'Create version' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('require a zero percentage');
    expect(calls.some((c) => c.path.includes('/versions') && c.method === 'POST')).toBe(false);
  });
  it('hides disallowed branch price controls and explains clearing a dormant override', async () => {
    const calls = backend({ dormantPrice: true });
    const user = mount();
    await login(user);
    await settingsPage(user);
    await user.click(screen.getByRole('link', { name: 'Branch settings' }));
    await user.click(await screen.findByRole('button', { name: 'Open Main' }));
    await screen.findByText(/Saving these preferences clears that override/);
    expect(screen.queryByLabelText('Branch price mode')).not.toBeInTheDocument();
    const form = screen.getByLabelText(/^Use branch receipt footer/).closest('form')!;
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === '/api/v1/branches/7/settings' && c.method === 'PUT'),
      ).toBeTruthy(),
    );
    expect(
      calls.find((c) => c.path === '/api/v1/branches/7/settings' && c.method === 'PUT')?.body
        .priceMode,
    ).toBeNull();
  });
  it('keeps the dashboard and inactive branch recovery available without loading stock', async () => {
    const calls = backend({ noActive: true });
    const user = mount();
    await login(user);
    expect(
      screen.getByRole('heading', { name: 'No permitted active branches' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/All clear/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Create or activate a branch' }));
    await user.click(await screen.findByRole('button', { name: 'Open Main' }));
    expect(await screen.findByLabelText('Branch is active')).not.toBeChecked();
    expect(calls.some((c) => c.path === '/api/inventory')).toBe(false);
  });
  it('saves skipped progress and notes, then resumes from the server', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: 'Setup checklist' }));
    await user.click((await screen.findAllByRole('button', { name: 'Update progress' }))[2]);
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('option', { name: 'Complete' })).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText(/^Progress status/), 'SKIPPED');
    await user.type(within(dialog).getByLabelText('Notes'), 'Review with accountant');
    await user.click(within(dialog).getByRole('button', { name: 'Save progress' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.path.endsWith('/TAX_REVIEW') && c.method === 'PUT')?.body).toEqual({
      revision: 0,
      status: 'SKIPPED',
      notes: 'Review with accountant',
    });
    await user.click(screen.getByRole('link', { name: 'Open dashboard' }));
    expect(await screen.findByText('0 of 7 steps complete · 1 skipped')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Resume setup/ }));
    await user.click((await screen.findAllByRole('button', { name: 'Update progress' }))[2]);
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Notes')).toHaveValue('Review with accountant');
    expect(within(dialog).getByLabelText(/^Progress status/)).toHaveValue('SKIPPED');
  });
  it('preserves a conflicting settings draft until explicit reload, then uses the latest revision', async () => {
    const calls = backend({ conflict: true });
    const user = mount();
    await login(user);
    await settingsPage(user);
    const name = screen.getByLabelText('Receipt name');
    await user.clear(name);
    await user.type(name, 'My draft');
    const panel = name.closest('section')!;
    await user.click(within(panel).getByRole('button', { name: 'Save changes' }));
    await screen.findByText(/Configuration revision changed/);
    expect(name).toHaveValue('My draft');
    await user.click(within(panel).getByRole('button', { name: 'Discard draft and reload' }));
    await waitFor(() => expect(screen.getByLabelText('Receipt name')).toHaveValue('Other editor'));
    await user.click(within(panel).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/api/v1/settings' && c.method === 'PUT')).toHaveLength(
        2,
      ),
    );
    expect(
      calls.filter((c) => c.path === '/api/v1/settings' && c.method === 'PUT')[1].body.revision,
    ).toBe(1);
  });
  it('distinguishes inherited fields, an explicitly empty footer and notifications off', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await settingsPage(user);
    await user.click(screen.getByRole('link', { name: 'Branch settings' }));
    await user.click(await screen.findByRole('button', { name: 'Open Main' }));
    await user.click(await screen.findByLabelText(/^Use branch receipt footer/));
    await user.selectOptions(
      screen.getByLabelText('Low-stock notifications', { exact: true }),
      'off',
    );
    const form = screen.getByLabelText(/^Use branch receipt footer/).closest('form')!;
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === '/api/v1/branches/7/settings' && c.method === 'PUT'),
      ).toBeTruthy(),
    );
    expect(
      calls.find((c) => c.path === '/api/v1/branches/7/settings' && c.method === 'PUT')?.body,
    ).toEqual({
      revision: 0,
      receiptName: null,
      receiptFooter: '',
      lowStockNotifications: false,
      priceMode: null,
    });
  });
  it('hides business-wide controls for a restricted administrator', async () => {
    const calls = backend({ role: 'ADMINISTRATOR', allBranches: false });
    const user = mount();
    await login(user);
    expect(screen.queryByRole('link', { name: 'Setup checklist' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Settings' }));
    await user.click(screen.getByRole('link', { name: 'Jamaica tax setup' }));
    await screen.findByRole('heading', { name: 'Tax setup access' });
    expect(calls.some((c) => c.path === '/api/v1/tax/policies')).toBe(false);
  });
  it('retries an unchanged tax policy with the same command ID and requires an owner review note', async () => {
    const calls = backend({ lostResponse: true });
    const user = mount();
    await login(user);
    await settingsPage(user);
    await user.click(screen.getByRole('link', { name: 'Jamaica tax setup' }));
    await user.click(await screen.findByRole('button', { name: 'New policy version' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/^Owner review confirmation/));
    expect(within(dialog).getByLabelText('Review reference / note')).toBeRequired();
    await user.type(
      within(dialog).getByLabelText('Review reference / note'),
      'Owner checked registration',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Create version' }));
    await within(dialog).findByRole('alert');
    await user.click(within(dialog).getByRole('button', { name: 'Create version' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const posts = calls.filter((c) => c.path === '/api/v1/tax/policies' && c.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[0].body).toEqual(posts[1].body);
    expect(posts[0].body.verified).toBe(true);
    expect(posts[0].body.requestId).toEqual(expect.any(String));
  });
  it('lets an administrator propose a policy without presenting owner verification controls', async () => {
    const calls = backend({ role: 'ADMINISTRATOR' });
    const user = mount();
    await login(user);
    await settingsPage(user);
    await user.click(screen.getByRole('link', { name: 'Jamaica tax setup' }));
    await user.click(await screen.findByRole('button', { name: 'New policy version' }));
    expect(screen.queryByLabelText(/^Owner review confirmation/)).not.toBeInTheDocument();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create version' }),
    );
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === '/api/v1/tax/policies' && c.method === 'POST'),
      ).toBeTruthy(),
    );
    expect(
      calls.find((c) => c.path === '/api/v1/tax/policies' && c.method === 'POST')?.body.verified,
    ).toBe(false);
  });
});
