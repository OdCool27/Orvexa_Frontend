import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../auth/Auth';
import { grant, snapshot } from './identity-fixtures';

function Harness() {
  const {
    user,
    identity,
    notice,
    transitioning,
    recoveryCodes,
    acknowledgeRecovery,
    login,
    rotate,
    api,
    sessionApi,
  } = useAuth();
  const [result, setResult] = useState('');
  return (
    <>
      <output>{user ? `Business ${user.businessId}` : 'No workspace'}</output>
      <output>{identity?.purpose}</output>
      <output>Codes {recoveryCodes.length}</output>
      <p>{notice}</p>
      {transitioning && <p>Switching</p>}
      <p>{result}</p>
      <button onClick={() => login('owner@test.local', 'example-password')}>Login</button>
      <button onClick={() => rotate('/api/v1/auth/business', { membershipId: 9 }).catch(() => {})}>
        Switch
      </button>
      <button
        onClick={() => rotate('/api/v1/auth/mfa/confirm', { code: '123456' }).catch(() => {})}
      >
        Confirm MFA
      </button>
      <button onClick={() => rotate('/api/v1/auth/mfa/verify', { code: '123456' }).catch(() => {})}>
        Verify MFA
      </button>
      <button onClick={acknowledgeRecovery}>Acknowledge</button>
      <button
        onClick={() =>
          api<{ secret: string }>('/api/products')
            .then((r) => setResult(r.secret))
            .catch(() => setResult('Old result ignored'))
        }
      >
        Load
      </button>
      <button onClick={() => sessionApi('/api/products').catch(() => setResult('Scope denied'))}>
        Escape scope
      </button>
    </>
  );
}
function mount() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <AuthProvider>
        <Harness />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return cache;
}
const json = (data: unknown) => new Response(JSON.stringify(data));
describe('session rotation and tenant isolation', () => {
  it('clears the old cache immediately and ignores late tenant responses during a switch', async () => {
    let resolveSwitch: (r: Response) => void = () => {};
    let resolveOld: (r: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith('/login')) return json({ ...grant, accessToken: 'session-A' });
        if (url.endsWith('/business'))
          return new Promise<Response>((r) => {
            resolveSwitch = r;
          });
        if (url.endsWith('/products'))
          return new Promise<Response>((r) => {
            resolveOld = r;
          });
        const next = (options.headers as Headers).get('Authorization') === 'Bearer session-B';
        return json(next ? { ...snapshot, businessId: 8, activeMembershipId: 9 } : snapshot);
      }),
    );
    const cache = mount();
    fireEvent.click(screen.getByText('Login'));
    await screen.findByText('Business 2');
    cache.setQueryData(['private-A'], { secret: 'A' });
    fireEvent.click(screen.getByText('Load'));
    fireEvent.click(screen.getByText('Switch'));
    expect(screen.getByText('No workspace')).toBeInTheDocument();
    expect(cache.getQueryData(['private-A'])).toBeUndefined();
    await act(async () => resolveSwitch(json({ ...grant, accessToken: 'session-B' })));
    await screen.findByText('Business 8');
    await act(async () => resolveOld(json({ secret: 'Leaked A' })));
    await screen.findByText('Old result ignored');
    expect(screen.queryByText('Leaked A')).not.toBeInTheDocument();
  });
  it('forces reauthentication for an ambiguous token-switch result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/business')) throw new TypeError('Connection lost');
        return json(url.endsWith('/login') ? grant : snapshot);
      }),
    );
    mount();
    fireEvent.click(screen.getByText('Login'));
    await screen.findByText('Business 2');
    fireEvent.click(screen.getByText('Switch'));
    await screen.findByText(/session change could not be confirmed/);
    expect(screen.getByText('No workspace')).toBeInTheDocument();
    expect(screen.queryByText('FULL')).not.toBeInTheDocument();
  });
  it('retains the challenge after a rejected code without granting tenant access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/verify'))
          return new Response('{"detail":"Code rejected"}', { status: 401 });
        return json(
          url.endsWith('/login')
            ? { ...grant, purpose: 'MFA_CHALLENGE' }
            : { ...snapshot, purpose: 'MFA_CHALLENGE' },
        );
      }),
    );
    mount();
    fireEvent.click(screen.getByText('Login'));
    await screen.findByText('MFA_CHALLENGE');
    fireEvent.click(screen.getByText('Verify MFA'));
    await screen.findByText('Code rejected');
    expect(screen.getByText('MFA_CHALLENGE')).toBeInTheDocument();
    expect(screen.getByText('No workspace')).toBeInTheDocument();
  });
  it('requires saving newly issued recovery codes before workspace access', async () => {
    let confirmed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/confirm')) {
          confirmed = true;
          return json({ ...grant, recoveryCodes: ['first', 'second'] });
        }
        return json(
          url.endsWith('/login')
            ? { ...grant, purpose: 'MFA_ENROLL' }
            : { ...snapshot, purpose: confirmed ? 'FULL' : 'MFA_ENROLL' },
        );
      }),
    );
    mount();
    fireEvent.click(screen.getByText('Login'));
    await screen.findByText('MFA_ENROLL');
    fireEvent.click(screen.getByText('Confirm MFA'));
    await screen.findByText('Codes 2');
    expect(screen.getByText('No workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Acknowledge'));
    await screen.findByText('Business 2');
  });
  it('preserves once-only recovery codes if loading the replacement profile fails', async () => {
    let issued = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/confirm')) {
          issued = true;
          return json({ ...grant, recoveryCodes: ['save-this-code'] });
        }
        if (issued && url.endsWith('/me')) throw new TypeError('Lost profile response');
        return json(
          url.endsWith('/login')
            ? { ...grant, purpose: 'MFA_ENROLL' }
            : { ...snapshot, purpose: 'MFA_ENROLL' },
        );
      }),
    );
    mount();
    fireEvent.click(screen.getByText('Login'));
    await screen.findByText('MFA_ENROLL');
    fireEvent.click(screen.getByText('Confirm MFA'));
    await screen.findByText('Codes 1');
    expect(screen.getByText('No workspace')).toBeInTheDocument();
    expect(screen.queryByText('MFA_ENROLL')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/session change could not be confirmed/)).toBeInTheDocument(),
    );
  });
  it('does not let the identity request helper bypass active-business API restrictions', async () => {
    const fetcher = vi.fn(async (url: string) => json(url.endsWith('/login') ? grant : snapshot));
    vi.stubGlobal('fetch', fetcher);
    mount();
    fireEvent.click(screen.getByText('Login'));
    await screen.findByText('Business 2');
    fireEvent.click(screen.getByText('Escape scope'));
    await screen.findByText('Scope denied');
    expect(fetcher.mock.calls.some((c) => c[0].endsWith('/products'))).toBe(false);
  });
});
