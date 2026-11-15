import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/Auth';
import { App } from '../app/App';
import { grant, snapshot } from './identity-fixtures';
import {
  validatePassword,
  invitationStatus,
  assignableRoles,
  uncertainSessionChange,
} from '../lib/identity';
import { ApiError } from '../api/client';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}
function mount(path = '/login') {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
async function credentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email address'), 'owner@test.local');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'example-password');
  await user.click(screen.getByRole('button', { name: 'Sign in to workspace' }));
}
async function passwords(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Password', { exact: true }), 'new-example-password');
  await user.type(screen.getByLabelText('Confirm password'), 'new-example-password');
}
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('account links and registration', () => {
  it('strips verification capabilities from history and waits for explicit confirmation', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('{"message":"Email verified; sign in again"}'));
    vi.stubGlobal('fetch', fetcher);
    const user = mount('/verify-email?token=single-use-capability');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/verify-email'));
    expect(screen.getByTestId('location')).not.toHaveTextContent('token=');
    expect(fetcher).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm email verification' }));
    await screen.findByText('Email verification completed. Existing sessions were revoked.');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ token: 'single-use-capability' });
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });
  it('shows expired verification failure without asserting success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"detail":"Token is invalid, expired, revoked or already used"}', {
          status: 400,
        }),
      ),
    );
    const user = mount('/verify-email?token=expired');
    await user.click(screen.getByRole('button', { name: 'Confirm email verification' }));
    await screen.findByRole('alert');
    expect(
      screen.queryByText('Email verification completed. Existing sessions were revoked.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request verification link' })).toBeInTheDocument();
  });
  it('registers a global identity without inventing a tenant or persisted session', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('{"message":"If applicable, queued"}', { status: 202 }));
    vi.stubGlobal('fetch', fetcher);
    const user = mount('/register');
    await user.type(screen.getByLabelText('First name'), 'New');
    await user.type(screen.getByLabelText('Last name'), 'Person');
    await user.type(screen.getByLabelText('Email address'), 'new@test.local');
    await passwords(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('link', { name: 'Sign in to continue' });
    expect(fetcher.mock.calls[0][0]).toContain('/api/v1/auth/register');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      firstName: 'New',
      lastName: 'Person',
      email: 'new@test.local',
      password: 'new-example-password',
    });
    expect(localStorage.length).toBe(0);
  });
  it('uses generic reset-request outcomes without enumerating accounts', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('{"message":"If applicable, queued"}', { status: 202 }));
    vi.stubGlobal('fetch', fetcher);
    const user = mount('/forgot-password');
    await user.type(screen.getByLabelText('Email address'), 'unknown@test.local');
    await user.click(screen.getByRole('button', { name: 'Request reset link' }));
    await screen.findByText('If applicable, password reset instructions have been queued.');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ email: 'unknown@test.local' });
  });
  it('confirms password reset with the link token and requires a fresh sign-in', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"message":"Password reset"}'));
    vi.stubGlobal('fetch', fetcher);
    const user = mount('/reset-password?token=reset-capability');
    await passwords(user);
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    await screen.findByText(
      'Password reset completed. MFA is unchanged and existing sessions were revoked.',
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      token: 'reset-capability',
      password: 'new-example-password',
    });
    expect(screen.getByTestId('location')).not.toHaveTextContent('token=');
  });
  it('accepts a new-account invitation anonymously with no employee credential header', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"reauthenticationRequired":true}'));
    vi.stubGlobal('fetch', fetcher);
    const user = mount('/accept-invitation?token=invite-capability');
    await user.click(screen.getByLabelText('I already have an Orvexa account'));
    await user.type(screen.getByLabelText('First name'), 'New');
    await user.type(screen.getByLabelText('Last name'), 'Person');
    await passwords(user);
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await screen.findByText(/Invitation accepted. Sign in again to load/);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      token: 'invite-capability',
      firstName: 'New',
      lastName: 'Person',
      password: 'new-example-password',
    });
    expect(fetcher.mock.calls[0][1].headers.has('Authorization')).toBe(false);
  });
  it('retains the invitation in memory during existing-account sign-in and sends only its token', async () => {
    const calls: { path: string; body: unknown; headers: Headers }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        const path = new URL(url).pathname;
        calls.push({
          path,
          body: options.body ? JSON.parse(String(options.body)) : undefined,
          headers: options.headers as Headers,
        });
        return new Response(
          JSON.stringify(
            path.endsWith('/login')
              ? { ...grant, purpose: 'VERIFY_EMAIL' }
              : path.endsWith('/me')
                ? { ...snapshot, purpose: 'VERIFY_EMAIL' }
                : { reauthenticationRequired: true },
          ),
        );
      }),
    );
    const user = mount('/accept-invitation?token=existing-account-capability');
    await credentials(user);
    await user.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    await screen.findByText(/Invitation accepted. Sign in again to load/);
    const accepted = calls.find((c) => c.path.endsWith('/invitations/accept'))!;
    expect(accepted.body).toEqual({ token: 'existing-account-capability' });
    expect(accepted.headers.get('Authorization')).toBe('Bearer test-session-token');
  });
  it('does not report expired invitation acceptance as successful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"detail":"Token is invalid, expired, revoked or already used"}', {
          status: 400,
        }),
      ),
    );
    const user = mount('/accept-invitation?token=expired');
    await user.click(screen.getByLabelText('I already have an Orvexa account'));
    await user.type(screen.getByLabelText('First name'), 'New');
    await user.type(screen.getByLabelText('Last name'), 'Person');
    await passwords(user);
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await screen.findByRole('alert');
    expect(
      screen.queryByText(/Invitation accepted. Sign in again to load/),
    ).not.toBeInTheDocument();
  });
});
describe('MFA account flows', () => {
  it('requires password and an unused recovery code before replacing a lost authenticator', async () => {
    let recovered = false;
    const calls: { path: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        const path = new URL(url).pathname;
        calls.push({ path, body: options.body ? JSON.parse(String(options.body)) : undefined });
        if (path.endsWith('/mfa/recover')) {
          recovered = true;
          return new Response(JSON.stringify({ ...grant, purpose: 'MFA_ENROLL' }));
        }
        return new Response(
          JSON.stringify(
            path.endsWith('/login')
              ? { ...grant, purpose: 'MFA_CHALLENGE' }
              : {
                  ...snapshot,
                  purpose: recovered ? 'MFA_ENROLL' : 'MFA_CHALLENGE',
                  mfa_enabled: recovered ? 0 : 1,
                },
          ),
        );
      }),
    );
    const user = mount();
    await credentials(user);
    await user.click(await screen.findByRole('button', { name: 'Replace a lost authenticator' }));
    await user.type(screen.getByLabelText('Current password'), 'example-password');
    await user.type(screen.getByLabelText('Unused recovery code'), 'unused-recovery');
    await user.click(screen.getByLabelText('Revoke all sessions and replace my authenticator.'));
    await user.click(screen.getByRole('button', { name: 'Replace lost authenticator' }));
    await screen.findByRole('button', { name: 'Set up authenticator' });
    expect(calls.find((c) => c.path.endsWith('/mfa/recover'))?.body).toEqual({
      password: 'example-password',
      recoveryCode: 'unused-recovery',
    });
    expect(calls.some((c) => c.path.endsWith('/mfa/setup'))).toBe(false);
  });
  it('prevents a platform identity from accepting tenant invitations in the UI', async () => {
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith('/login')
              ? grant
              : {
                  ...snapshot,
                  operator: true,
                  platformRole: 'PROVISIONER',
                  role: 'OPERATOR',
                  businessId: null,
                  activeMembershipId: null,
                },
          ),
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    const user = mount('/accept-invitation?token=tenant-token');
    await credentials(user);
    await screen.findByRole('heading', { name: 'Use a separate merchant identity' });
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some((c) => c[0].endsWith('/invitations/accept'))).toBe(false);
  });
  it('enrolls explicitly, recovers from an incorrect code, and holds workspace access until codes are saved', async () => {
    let confirmed = false;
    let attempts = 0;
    const fetcher = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/login'))
        return new Response(JSON.stringify({ ...grant, purpose: 'MFA_ENROLL' }));
      if (path.endsWith('/me'))
        return new Response(
          JSON.stringify({ ...snapshot, purpose: confirmed ? 'FULL' : 'MFA_ENROLL' }),
        );
      if (path.endsWith('/mfa/setup'))
        return new Response(
          JSON.stringify({
            secret: 'LOCAL-TEST-SETUP',
            otpauthUri: 'otpauth://totp/test',
            expiresAt: new Date(Date.now() + 600000).toISOString(),
          }),
        );
      if (path.endsWith('/mfa/confirm')) {
        if (!attempts++)
          return new Response('{"detail":"Incorrect authenticator code"}', { status: 401 });
        confirmed = true;
        return new Response(
          JSON.stringify({ ...grant, recoveryCodes: ['recovery-one', 'recovery-two'] }),
        );
      }
      if (path === '/api/business')
        return new Response('{"id":2,"name":"Auto Parts","currency":"JMD","default_threshold":3}');
      if (path === '/api/v1/branches') return new Response('[{"id":7,"name":"Main","active":1}]');
      return new Response('[]');
    });
    vi.stubGlobal('fetch', fetcher);
    const user = mount();
    await credentials(user);
    await screen.findByRole('heading', { name: 'MFA enrollment required' });
    expect(fetcher.mock.calls.some((c) => c[0].endsWith('/mfa/setup'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Set up authenticator' }));
    await screen.findByDisplayValue('LOCAL-TEST-SETUP');
    await user.type(screen.getByLabelText('Authenticator code'), '000001');
    await user.click(screen.getByRole('button', { name: 'Confirm authenticator' }));
    await screen.findByRole('alert');
    expect(screen.getByDisplayValue('LOCAL-TEST-SETUP')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Authenticator code'));
    await user.type(screen.getByLabelText('Authenticator code'), '000002');
    await user.click(screen.getByRole('button', { name: 'Confirm authenticator' }));
    await screen.findByRole('heading', { name: 'Save your recovery codes' });
    expect(
      screen.queryByRole('navigation', { name: 'Workspace navigation' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue securely' })).toBeDisabled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    await user.click(screen.getByLabelText('I saved these codes securely.'));
    await user.click(screen.getByRole('button', { name: 'Continue securely' }));
    await screen.findByRole('heading', { name: 'Welcome back, Demo.' });
  });
  it('uses a recovery code without submitting a fabricated authenticator code', async () => {
    const calls: { path: string; body: unknown }[] = [];
    let verified = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        const path = new URL(url).pathname;
        calls.push({ path, body: options.body ? JSON.parse(String(options.body)) : undefined });
        if (path.endsWith('/mfa/verify')) {
          verified = true;
          return new Response(JSON.stringify(grant));
        }
        if (path.endsWith('/login'))
          return new Response(JSON.stringify({ ...grant, purpose: 'MFA_CHALLENGE' }));
        if (path.endsWith('/me'))
          return new Response(
            JSON.stringify({
              ...snapshot,
              purpose: verified ? 'FULL' : 'MFA_CHALLENGE',
              activeMembershipId: verified ? null : 3,
              businessId: verified ? null : 2,
              role: verified ? null : 'OWNER',
            }),
          );
        return new Response('[]');
      }),
    );
    const user = mount();
    await credentials(user);
    await user.click(await screen.findByRole('button', { name: 'Use recovery code' }));
    await user.type(screen.getByLabelText('Recovery code'), 'unused-recovery');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));
    await screen.findByRole('heading', { name: 'Choose or create a business' });
    expect(calls.find((c) => c.path.endsWith('/mfa/verify'))?.body).toEqual({
      recoveryCode: 'unused-recovery',
    });
  });
  it('distinguishes Osyntra staff login from tenant access before MFA enrollment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith('/login')
                ? { ...grant, purpose: 'MFA_ENROLL' }
                : {
                    ...snapshot,
                    operator: true,
                    platformRole: 'PROVISIONER',
                    purpose: 'MFA_ENROLL',
                    role: 'OPERATOR',
                    businessId: null,
                    activeMembershipId: null,
                  },
            ),
          ),
      ),
    );
    const user = mount();
    await credentials(user);
    await screen.findByRole('heading', { name: 'Osyntra staff account detected' });
    expect(screen.getByRole('link', { name: 'Open staff console' })).toHaveAttribute(
      'href',
      '/platform/login',
    );
    expect(screen.queryByRole('button', { name: 'Set up authenticator' })).not.toBeInTheDocument();
  });
});
describe('identity constraints', () => {
  it('requires reconciliation after unknown session-revoking results while retaining clear validation failures', () => {
    const signIn = vi.fn();
    expect(() =>
      uncertainSessionChange(new ApiError('Lost response', 0), signIn, 'Sign in to reconcile'),
    ).toThrow('Sign in to reconcile');
    expect(signIn).toHaveBeenCalledWith('Sign in to reconcile');
    signIn.mockClear();
    const offline = new ApiError('Not sent', 0, [], 'OFFLINE');
    expect(() => uncertainSessionChange(offline, signIn, 'Unknown')).toThrow('Not sent');
    expect(signIn).not.toHaveBeenCalled();
    expect(() =>
      uncertainSessionChange(new ApiError('Invalid token', 400), signIn, 'Unknown'),
    ).toThrow('Invalid token');
    expect(signIn).not.toHaveBeenCalled();
  });
  it('validates UTF-8 length and confirmation before sending new passwords', () => {
    expect(() => validatePassword('🔒'.repeat(20))).toThrow('UTF-8');
    expect(() => validatePassword('valid-example-password', 'different')).toThrow('match');
    expect(validatePassword('valid-example-password')).toBe('valid-example-password');
  });
  it('uses expiry timestamps and least-privilege role options', () => {
    expect(invitationStatus({ status: 'PENDING', expires_ms: 1 }, 2)).toBe('EXPIRED');
    expect(invitationStatus({ status: 'ACCEPTED', expires_ms: 1 }, 2)).toBe('ACCEPTED');
    expect(assignableRoles('MANAGER')).toEqual(['CASHIER', 'INVENTORY_CLERK']);
    expect(assignableRoles('ADMINISTRATOR')).not.toContain('OWNER');
  });
});
describe('session revocation screens', () => {
  it('clears local access when revoking all server sessions cannot be confirmed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        if (path.endsWith('/logout-all'))
          return new Response('{"detail":"Temporarily unavailable"}', { status: 503 });
        if (path.endsWith('/login')) return new Response(JSON.stringify(grant));
        if (path.endsWith('/me')) return new Response(JSON.stringify(snapshot));
        if (path === '/api/business')
          return new Response(
            '{"id":2,"name":"Auto Parts","currency":"JMD","default_threshold":3}',
          );
        if (path === '/api/v1/branches') return new Response('[{"id":7,"name":"Main","active":1}]');
        return new Response('[]');
      }),
    );
    const user = mount();
    await credentials(user);
    await user.click(await screen.findByRole('link', { name: 'Account & security' }));
    await user.click(await screen.findByRole('button', { name: 'Sign out all sessions' }));
    await user.click(screen.getByRole('button', { name: 'Confirm revocation' }));
    await screen.findByText(/Revocation of all server sessions could not be confirmed/);
    expect(
      screen.queryByRole('navigation', { name: 'Workspace navigation' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to workspace' })).toBeInTheDocument();
  });
});
