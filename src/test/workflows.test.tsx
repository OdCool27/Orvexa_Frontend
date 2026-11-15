import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/Auth';
import { App } from '../app/App';
import { grant, snapshot } from './identity-fixtures';

const productId = '7001b002-aa54-4dd4-b739-f052467247a5';
const orderId = '98d02032-aa54-4dd4-b739-f052467247a5';
const cart = {
  net_cents: 200000,
  tax_cents: 0,
  price_mode: 'EXCLUSIVE',
  seller_registration_status: 'NOT_REGISTERED',
  seller_tax_verified: 0,
  lines: [
    {
      id: productId,
      sku: 'FILTER',
      item_name: 'Air filter',
      quantity: 1,
      available: 6,
      price_cents: 200000,
      net_cents: 200000,
      tax_cents: 0,
      total_cents: 200000,
      discount_percent: '0',
      discount_reason: '',
      tax_classification: 'NON_REGISTERED',
      tax_rate_percent: '0',
      tax_verified: 0,
      tax_illustrative: 0,
    },
  ],
  total_cents: 200000,
  currency: 'JMD',
  sufficientStock: true,
  reserved: false,
};
const order = {
  payment_state: 'NOT_STARTED',
  net_cents: 200000,
  tax_cents: 0,
  discount_cents: 0,
  tax_snapshot_version: 1,
  price_mode: 'EXCLUSIVE',
  seller_registration_status: 'NOT_REGISTERED',
  seller_tax_verified: 0,
  id: orderId,
  location_id: 7,
  channel: 'POS',
  status: 'RESERVED',
  total_cents: 200000,
  currency: 'JMD',
  expires_at_ms: Date.now() + 300000,
  created_at: '2026-11-13 12:00:00',
  lines: [
    {
      product_id: productId,
      sku: 'FILTER',
      item_name: 'Air filter',
      quantity: 1,
      price_cents: 200000,
      net_cents: 200000,
      tax_cents: 0,
      total_cents: 200000,
      discount_percent: '0',
      discount_reason: '',
      tax_classification: 'NON_REGISTERED',
      tax_rate_percent: '0',
      tax_verified: 0,
      tax_illustrative: 0,
    },
  ],
  refunds: [],
  payments: [],
  events: [],
};
function mount(path: string) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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
beforeEach(() => {
  sessionStorage.clear();
});
describe('integrated route and API workflows', () => {
  it('retains selected location through guarded POS and count routes', async () => {
    const calls: { path: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        const path = new URL(url).pathname;
        const body = options.body ? JSON.parse(String(options.body)) : undefined;
        calls.push({ path, body });
        let value: unknown = [];
        if (path === '/api/v1/auth/login') value = grant;
        else if (path === '/api/v1/auth/me') value = snapshot;
        else if (path === '/api/business')
          value = { id: 2, name: 'Auto Parts', currency: 'JMD', default_threshold: 3 };
        else if (path === '/api/v1/branches') value = [{ id: 7, name: 'Main', active: 1 }];
        else if (path === '/api/v1/checkout/catalogue')
          value = [
            {
              id: productId,
              item_name: 'Air filter',
              sku: 'FILTER',
              unit_of_measure: 'EACH',
              price_cents: 200000,
              available: 6,
            },
          ];
        else if (path === '/api/products')
          value = [{ itemId: productId, itemName: 'Air filter', sku: 'FILTER', unitPrice: 2000 }];
        else if (path === '/api/orders/cart') value = cart;
        else if (path === '/api/orders' && options.method === 'POST') value = order;
        else if (path.startsWith('/api/orders/')) value = order;
        else if (path === '/api/counts' && options.method === 'POST')
          value = { id: 'count-1', location_id: 7, status: 'DRAFT', lines: [] };
        else if (path === '/api/counts/count-1')
          value = { id: 'count-1', location_id: 7, status: 'DRAFT', lines: [] };
        else if (path.includes('/reports/')) value = {};
        return new Response(JSON.stringify(value));
      }),
    );
    const user = mount('/login');
    await user.type(screen.getByLabelText('Email address'), 'owner@test.local');
    await user.type(screen.getByLabelText('Password'), 'example-password');
    await user.click(screen.getByRole('button', { name: 'Sign in to workspace' }));
    await user.click(await screen.findByRole('link', { name: 'Point of sale' }));
    await user.click(await screen.findByRole('button', { name: /Air filter/ }));
    const reserve = await screen.findByRole('button', { name: 'Reserve & continue' });
    await waitFor(() => expect(reserve).toBeEnabled());
    await user.click(reserve);
    await user.click(await screen.findByRole('button', { name: 'Confirm reservation' }));
    await screen.findByRole('button', { name: 'Choose payment method' });
    expect(calls.find((c) => c.path === '/api/orders/cart')?.body).toEqual({
      locationId: 7,
      lines: [{ productId, quantity: 1 }],
    });
    expect(calls.find((c) => c.path === '/api/orders' && c.body)?.body).toMatchObject({
      locationId: 7,
      lines: [{ productId, quantity: 1 }],
      requestId: expect.any(String),
    });
    await user.click(screen.getByRole('link', { name: 'Stock counts' }));
    const start = await screen.findByRole('button', { name: 'Start count' });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);
    await screen.findByRole('heading', { name: 'Scan or enter a product' });
    expect(calls.find((c) => c.path === '/api/counts' && c.body)?.body).toEqual({ locationId: 7 });
  });
  it('saves public checkout access and sends only its order token for payment', async () => {
    sessionStorage.setItem('osyntra:cart:2', JSON.stringify([{ productId, quantity: 1 }]));
    let paid = false;
    const calls: { path: string; headers: Headers; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        const path = new URL(url).pathname;
        const body = options.body ? JSON.parse(String(options.body)) : undefined;
        calls.push({ path, headers: options.headers as Headers, body });
        let value: unknown;
        if (path.endsWith('/cart')) value = cart;
        else if (path.endsWith('/orders'))
          value = { ...order, channel: 'ONLINE', accessToken: 'customer-capability' };
        else {
          if (path.endsWith('/payment')) paid = true;
          value = { ...order, channel: 'ONLINE', status: paid ? 'COMPLETED' : 'RESERVED' };
        }
        return new Response(JSON.stringify(value));
      }),
    );
    const user = mount('/store/2/cart');
    const reserve = await screen.findByRole('button', { name: 'Reserve & continue' });
    await waitFor(() => expect(reserve).toBeEnabled());
    await user.click(reserve);
    await screen.findByRole('heading', { name: 'Order & payment' });
    await user.click(await screen.findByRole('button', { name: 'Process simulated payment' }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/payment'))).toBe(true));
    await screen.findByText('Completed');
    expect(sessionStorage.getItem(`osyntra:order:2:${orderId}`)).toBe('customer-capability');
    expect(sessionStorage.getItem('osyntra:cart:2')).toBeNull();
    const payment = calls.find((c) => c.path.endsWith('/payment'))!;
    expect(payment.headers.get('X-Order-Token')).toBe('customer-capability');
    expect(payment.headers.has('Authorization')).toBe(false);
    expect(payment.body).toMatchObject({
      method: 'CASH',
      successful: true,
      requestId: expect.any(String),
    });
  });
});
