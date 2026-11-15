import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/Auth';
import { App } from '../app/App';
import { grant, snapshot } from './identity-fixtures';

function mount(path = '/login') {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email address'), 'owner@test.local');
  await user.type(screen.getByLabelText('Password'), 'example-password');
  await user.click(screen.getByRole('button', { name: 'Sign in to workspace' }));
}
function stubBackend(
  options: {
    purpose?: string;
    branchError?: boolean;
    branches?: unknown[];
    pendingBranches?: boolean;
    role?: string;
  } = {},
) {
  const fetcher = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    if (path === '/api/v1/auth/login')
      return new Response(JSON.stringify({ ...grant, purpose: options.purpose || 'FULL' }));
    if (path === '/api/v1/auth/me')
      return new Response(
        JSON.stringify({
          ...snapshot,
          role: options.role || snapshot.role,
          purpose: options.purpose || 'FULL',
        }),
      );
    if (path === '/api/business')
      return new Response(
        JSON.stringify({ id: 2, name: 'Auto Parts', currency: 'JMD', default_threshold: 3 }),
      );
    if (path === '/api/v1/branches') {
      if (options.pendingBranches) return new Promise<Response>(() => {});
      if (options.branchError)
        return new Response(
          JSON.stringify({ detail: 'Branch access denied', requestId: 'branches-403' }),
          { status: 403 },
        );
      return new Response(JSON.stringify(options.branches || [{ id: 7, name: 'Main', active: 1 }]));
    }
    return new Response(JSON.stringify(path.includes('summary') ? {} : []));
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
describe('Orvexa shell and navigation', () => {
  it('protects deep links and preserves the existing sign-in and public routes', () => {
    mount('/app/counts');
    expect(screen.getByRole('heading', { name: 'Let’s get to work.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orvexa by Osyntra home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Visit a demo storefront' })).toHaveAttribute(
      'href',
      '/store',
    );
  });
  it('renders a useful not-found route', () => {
    mount('/not-a-route');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to workspace' })).toHaveAttribute('href', '/');
  });
  it('shows branch loading instead of empty-stock success', async () => {
    stubBackend({ pendingBranches: true });
    const user = mount();
    await signIn(user);
    await screen.findByText('Loading your business and permitted branches…');
    expect(screen.queryByText(/All clear/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent orders' })).not.toBeInTheDocument();
  });
  it('shows a retryable workspace error with its server request reference', async () => {
    stubBackend({ branchError: true });
    const user = mount();
    await signIn(user);
    await screen.findByRole('heading', { name: 'Workspace unavailable' });
    expect(screen.getByRole('alert')).toHaveTextContent('branches-403');
    expect(screen.getByRole('button', { name: 'Retry loading workspace' })).toBeInTheDocument();
    expect(screen.queryByText(/All clear/)).not.toBeInTheDocument();
  });
  it('does not load stock when no permitted active branch exists', async () => {
    const fetcher = stubBackend({ branches: [] });
    const user = mount();
    await signIn(user);
    await screen.findByRole('heading', { name: 'No permitted active branches' });
    expect(fetcher.mock.calls.some((c) => c[0].includes('/api/inventory'))).toBe(false);
  });
  it('does not navigate to tenant pages for restricted authentication', async () => {
    const fetcher = stubBackend({ purpose: 'MFA_ENROLL' });
    const user = mount();
    await signIn(user);
    await screen.findByRole('heading', { name: 'MFA enrollment required' });
    expect(
      screen.queryByRole('navigation', { name: 'Workspace navigation' }),
    ).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some((c) => c[0].endsWith('/api/business'))).toBe(false);
  });
  it('exposes updated clerk navigation and an accessible mobile menu', async () => {
    stubBackend({ role: 'INVENTORY_CLERK' });
    const user = mount();
    await signIn(user);
    await screen.findByRole('heading', { name: 'Welcome back, Demo.' });
    expect(screen.getByRole('link', { name: 'Stock counts' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Point of sale' })).not.toBeInTheDocument();
    const open = screen.getByRole('button', { name: 'Open menu' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    await user.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(open).toHaveAttribute('aria-controls', 'workspace-navigation');
  });
  it('shows connectivity loss without asserting server success', async () => {
    mount();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fireEvent(window, new Event('offline'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('You’re offline'));
  });
});
