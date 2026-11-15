import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/Auth';
import { App } from '../app/App';
import { grant, snapshot } from './identity-fixtures';

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
type Call = { path: string; method: string; body: unknown };
function backend({ restricted = false, invites = [] as unknown[], postFail = false } = {}) {
  const calls: Call[] = [];
  let posts = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      const path = new URL(url).pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(String(options.body)) : undefined;
      calls.push({ path, method, body });
      let value: unknown = [];
      if (path.endsWith('/login')) value = grant;
      else if (path.endsWith('/me'))
        value = {
          ...snapshot,
          role: 'MANAGER',
          mfaRequired: false,
          memberships: [
            { ...snapshot.memberships[0], role: 'MANAGER', all_branches: restricted ? 0 : 1 },
          ],
        };
      else if (path === '/api/business')
        value = { id: 2, name: 'Auto Parts', currency: 'JMD', default_threshold: 3 };
      else if (path === '/api/v1/branches') value = [{ id: 7, name: 'Main', active: 1 }];
      else if (path === '/api/v1/memberships')
        value = [
          {
            ...snapshot.memberships[0],
            role: 'MANAGER',
            all_branches: restricted ? 0 : 1,
            branchIds: restricted ? [7] : [],
          },
        ];
      else if (path === '/api/v1/business/memberships')
        value = [
          {
            id: 90,
            user_id: 22,
            email: 'cashier@test.local',
            first_name: 'Staff',
            last_name: 'Cashier',
            role: 'CASHIER',
            status: 'ACTIVE',
            job_title: 'Cashier',
            all_branches: 0,
          },
          {
            id: 91,
            user_id: 23,
            email: 'owner@test.local',
            first_name: 'Business',
            last_name: 'Owner',
            role: 'OWNER',
            status: 'ACTIVE',
            job_title: 'Owner',
            all_branches: 1,
          },
        ];
      else if (path === '/api/v1/invitations') {
        if (method === 'POST') {
          posts++;
          if (postFail && posts === 1)
            return new Response('{"detail":"Queue attempt failed"}', { status: 503 });
          value = { id: 'new-invite', status: 'PENDING' };
        } else value = invites;
      } else if (method === 'DELETE') return new Response(null, { status: 204 });
      return new Response(JSON.stringify(value));
    }),
  );
  return calls;
}
async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email address'), 'manager@test.local');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'example-password');
  await user.click(screen.getByRole('button', { name: 'Sign in to workspace' }));
  await user.click(await screen.findByRole('link', { name: 'Team' }));
  await screen.findByText('cashier@test.local');
}
describe('membership-based staff administration', () => {
  it('limits manager grants to operational roles and permitted branches', async () => {
    const calls = backend({ restricted: true });
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('button', { name: 'Invite employee' }));
    await user.type(screen.getByLabelText('Recipient email'), 'new@test.local');
    expect(screen.getByLabelText('All current and future branches')).toBeDisabled();
    expect(screen.getByLabelText('Membership role').querySelectorAll('option')).toHaveLength(2);
    await user.click(screen.getByLabelText('Main'));
    await user.click(screen.getByRole('button', { name: 'Queue invitation' }));
    await screen.findByText(
      'Invitation queued. Check delivery status; queueing does not prove email delivery.',
    );
    expect(
      calls.find((c) => c.path === '/api/v1/invitations' && c.method === 'POST')?.body,
    ).toEqual({ role: 'CASHIER', allBranches: false, branchIds: [7], email: 'new@test.local' });
  });
  it('requires explicit replacement grants and updates membership IDs without editing global names', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    expect(screen.getAllByRole('button', { name: 'Edit membership' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Edit membership' }));
    expect(
      screen.getByText(/does not return this person’s existing branch IDs/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Main'));
    await user.click(screen.getByLabelText('I confirm this replacement of branch access.'));
    await user.clear(screen.getByLabelText('Job title'));
    await user.type(screen.getByLabelText('Job title'), 'Senior cashier');
    await user.click(screen.getByRole('button', { name: 'Save membership' }));
    await screen.findByText('Membership saved.');
    expect(
      calls.find((c) => c.path === '/api/v1/business/memberships/90' && c.method === 'PUT')?.body,
    ).toEqual({
      role: 'CASHIER',
      allBranches: false,
      branchIds: [7],
      jobTitle: 'Senior cashier',
      status: 'ACTIVE',
    });
  });
  it('renders expired invitations accurately and does not offer their acceptance or revocation', async () => {
    backend({
      invites: [
        {
          id: 'expired',
          email: 'expired@test.local',
          role: 'CASHIER',
          all_branches: 1,
          status: 'PENDING',
          expires_ms: Date.now() - 1000,
        },
      ],
    });
    const user = mount();
    await login(user);
    await screen.findByText('Expired');
    expect(screen.queryByRole('button', { name: 'Revoke invitation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reissue invitation' })).toBeInTheDocument();
  });
  it('keeps partial revoke/reissue failure explicit and does not revoke twice on retry', async () => {
    const calls = backend({
      postFail: true,
      invites: [
        {
          id: 'pending-invite',
          email: 'pending@test.local',
          role: 'CASHIER',
          all_branches: 1,
          status: 'PENDING',
          expires_ms: Date.now() + 600000,
        },
      ],
    });
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('button', { name: 'Reissue invitation' }));
    await user.click(screen.getByRole('button', { name: 'Revoke & issue replacement' }));
    await screen.findByRole('alert');
    expect(screen.getByText(/replacement has not yet been confirmed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revoke & issue replacement' }));
    await screen.findByText(
      'Invitation queued. Check delivery status; queueing does not prove email delivery.',
    );
    expect(
      calls.filter((c) => c.path === '/api/v1/invitations/pending-invite' && c.method === 'DELETE'),
    ).toHaveLength(1);
    expect(
      calls.filter((c) => c.path === '/api/v1/invitations' && c.method === 'POST'),
    ).toHaveLength(2);
  });
  it('rejects an empty explicit branch grant before sending an invitation', async () => {
    const calls = backend({ restricted: true });
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('button', { name: 'Invite employee' }));
    await user.type(screen.getByLabelText('Recipient email'), 'new@test.local');
    await user.click(screen.getByRole('button', { name: 'Queue invitation' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one permitted branch'),
    );
    expect(calls.some((c) => c.path === '/api/v1/invitations' && c.method === 'POST')).toBe(false);
  });
});
