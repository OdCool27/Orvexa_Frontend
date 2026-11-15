import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../auth/Auth';
import { grant, snapshot } from './identity-fixtures';

function Harness() {
  const { user, identity, notice, login, logout, api } = useAuth();
  return (
    <>
      <span>{user ? `${user.firstName}:${user.businessId}` : 'Signed out'}</span>
      <span>{identity?.purpose}</span>
      <p>{notice}</p>
      <button onClick={() => login('owner@test.local', 'example-password').catch(() => {})}>
        Sign in
      </button>
      <button onClick={() => api('/api/products').catch(() => {})}>Load products</button>
      <button onClick={logout}>Sign out</button>
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
function mockSession(purpose = grant.purpose) {
  return vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('/login')
            ? { ...grant, purpose }
            : url.endsWith('/me')
              ? { ...snapshot, purpose }
              : {},
        ),
      ),
  );
}
describe('Bearer session foundation', () => {
  it('exchanges credentials once and keeps the Bearer token out of storage', async () => {
    localStorage.clear();
    sessionStorage.clear();
    const fetcher = mockSession();
    vi.stubGlobal('fetch', fetcher);
    const cache = mount();
    fireEvent.click(screen.getByText('Sign in'));
    await screen.findByText('Demo:2');
    expect(fetcher.mock.calls[0][0]).toContain('/api/v1/auth/login');
    fireEvent.click(screen.getByText('Load products'));
    await waitFor(() =>
      expect(fetcher.mock.calls.some((c) => c[0].endsWith('/products'))).toBe(true),
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    cache.setQueryData(['tenant-data'], { private: true });
    fireEvent.click(screen.getByText('Sign out'));
    expect(cache.getQueryData(['tenant-data'])).toBeUndefined();
    expect(screen.getByText('Signed out')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetcher.mock.calls.some((c) => c[0].endsWith('/logout'))).toBe(true),
    );
  });
  it('clears identity and cache when a session is revoked', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith('/products')
        ? new Response('', { status: 401 })
        : new Response(JSON.stringify(url.endsWith('/login') ? grant : snapshot)),
    );
    vi.stubGlobal('fetch', fetcher);
    const cache = mount();
    fireEvent.click(screen.getByText('Sign in'));
    await screen.findByText('Demo:2');
    cache.setQueryData(['tenant'], 123);
    fireEvent.click(screen.getByText('Load products'));
    await screen.findByText('Signed out');
    expect(cache.getQueryData(['tenant'])).toBeUndefined();
    expect(screen.getByText(/expired or was revoked/)).toBeInTheDocument();
  });
  it.each(['VERIFY_EMAIL', 'MFA_ENROLL', 'MFA_CHALLENGE'] as const)(
    'does not grant workspace access to %s sessions',
    async (purpose) => {
      const fetcher = mockSession(purpose);
      vi.stubGlobal('fetch', fetcher);
      mount();
      fireEvent.click(screen.getByText('Sign in'));
      await screen.findByText(purpose);
      expect(screen.getByText('Signed out')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Load products'));
      expect(fetcher.mock.calls.some((c) => c[0].endsWith('/products'))).toBe(false);
    },
  );
  it('does not infer a tenant for a full session with no selected membership', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith('/login')
                ? grant
                : { ...snapshot, role: null, businessId: null, activeMembershipId: null },
            ),
          ),
      ),
    );
    mount();
    fireEvent.click(screen.getByText('Sign in'));
    await screen.findByText('FULL');
    expect(screen.getByText('Signed out')).toBeInTheDocument();
  });
  it('keeps local sign-out effective when server revocation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/logout')
          ? new Response('', { status: 503 })
          : new Response(JSON.stringify(url.endsWith('/login') ? grant : snapshot)),
      ),
    );
    mount();
    fireEvent.click(screen.getByText('Sign in'));
    await screen.findByText('Demo:2');
    fireEvent.click(screen.getByText('Sign out'));
    await screen.findByText(/revocation could not be confirmed/);
    expect(screen.getByText('Signed out')).toBeInTheDocument();
  });
  it('does not let an old 401 clear the replacement session', async () => {
    let resolve: (response: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/products')
          ? new Promise<Response>((r) => {
              resolve = r;
            })
          : new Response(JSON.stringify(url.endsWith('/login') ? grant : snapshot)),
      ),
    );
    mount();
    fireEvent.click(screen.getByText('Sign in'));
    await screen.findByText('Demo:2');
    fireEvent.click(screen.getByText('Load products'));
    fireEvent.click(screen.getByText('Sign out'));
    fireEvent.click(screen.getByText('Sign in'));
    await screen.findByText('Demo:2');
    resolve(new Response('', { status: 401 }));
    await waitFor(() => expect(screen.getByText('Demo:2')).toBeInTheDocument());
  });
});
