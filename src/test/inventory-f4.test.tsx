import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/Auth';
import { App } from '../app/App';
import { acquisitionCost, displayAverage, isoDate, wholeQuantity } from '../lib/inventory';
import { grant, snapshot } from './identity-fixtures';

const productId = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const poId = '33333333-3333-4333-8333-333333333333';
const transferId = '44444444-4444-4444-8444-444444444444';
const batchId = '55555555-5555-4555-8555-555555555555';
describe('F4 quantity, cost and expiry rules', () => {
  it('preserves acquisition decimals and validates six-place costs', () => {
    expect(acquisitionCost('1234567890.123456')).toBe('1234567890.123456');
    for (const value of ['-1', '1e2', '1.1234567', '10000000000', ''])
      expect(() => acquisitionCost(value)).toThrow();
  });
  it('calculates only an exact decimal display ratio and handles zero stock', () => {
    expect(displayAverage('100.000001', 3)).toBe('33.333334');
    expect(displayAverage('999999999999999999.999999', 3)).toBe('333333333333333333.333333');
    expect(displayAverage('0', 0)).toBeNull();
    expect(displayAverage(undefined, 1)).toBeNull();
  });
  it('bounds whole quantities and validates UTC calendar dates without timezone shifts', () => {
    expect(wholeQuantity('2147483647')).toBe(2147483647);
    expect(wholeQuantity('0', true)).toBe(0);
    for (const value of ['0', '1.5', '2147483648', '-1'])
      expect(() => wholeQuantity(value)).toThrow();
    expect(isoDate('2024-02-29')).toBe('2024-02-29');
    expect(isoDate('')).toBeNull();
    for (const value of ['2026-02-29', '2026-13-01', '0000-01-01'])
      expect(() => isoDate(value)).toThrow();
  });
});
type Call = { path: string; method: string; body: Record<string, any>; search: URLSearchParams };
function backend({
  role = 'OWNER',
  restricted = false,
  uncertainReceipt = false,
  receiveConflict = false,
  batchConflict = false,
  supplierLost = false,
  forbidden = false,
} = {}) {
  const calls: Call[] = [];
  let receiptAttempts = 0;
  let supplierAttempts = 0;
  let received = 0;
  let transferStatus = 'REQUESTED';
  let transferReceived = 0;
  let batchQuantity = 9;
  const completedReceipts = new Set<string>();
  const suppliers = [
    { id: supplierId, name: 'Parts Supplier', email: 'parts@test.local', active: 1 },
  ];
  const po = () => ({
    id: poId,
    supplier_id: supplierId,
    location_id: 7,
    currency: 'JMD',
    status: received === 24 ? 'RECEIVED' : received ? 'PARTIAL' : 'OPEN',
    created_ms: Date.now(),
    lines: [
      {
        product_id: productId,
        unit_code: 'CASE_12',
        unit_quantity: '2',
        factor: '12',
        unit_cost: '1200.123456',
        ordered_quantity: 24,
        received_quantity: received,
        total_value: '2400.246912',
        received_value: received ? '600.061728' : '0',
      },
    ],
    receipts: received ? [{ id: 'receipt-1', created_ms: Date.now() }] : [],
  });
  const transfer = () => ({
    id: transferId,
    source_id: 7,
    destination_id: 8,
    status: transferStatus,
    created_ms: Date.now(),
    lines: [
      {
        product_id: productId,
        quantity: 4,
        received_quantity: transferReceived,
        batch_code: null,
        expires_on: null,
        dispatched_value: '40',
        received_value: String(transferReceived * 10),
        in_transit_quantity: ['DISPATCHED', 'PARTIAL'].includes(transferStatus)
          ? 4 - transferReceived
          : 0,
        in_transit_value: transferStatus === 'REQUESTED' ? '0' : String(40 - transferReceived * 10),
      },
    ],
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      const parsed = new URL(url);
      const path = parsed.pathname;
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(String(options.body)) : {};
      calls.push({ path, method, body, search: parsed.searchParams });
      let value: unknown = [];
      if (path.endsWith('/login')) value = grant;
      else if (path.endsWith('/me'))
        value = {
          ...snapshot,
          role,
          memberships: [{ ...snapshot.memberships[0], role, all_branches: restricted ? 0 : 1 }],
        };
      else if (path === '/api/business')
        value = { id: 2, name: 'Auto Parts', currency: 'JMD', default_threshold: 3 };
      else if (path === '/api/v1/branches')
        value = restricted
          ? [{ id: 7, name: 'Main', active: 1 }]
          : [
              { id: 7, name: 'Main', active: 1 },
              { id: 8, name: 'North', active: 1 },
            ];
      else if (path === '/api/products')
        value = [
          {
            itemId: productId,
            sku: 'PART',
            itemName: 'Test part',
            itemDescription: 'A part',
            productKind: 'SIMPLE',
            active: true,
            unitPrice: 20,
            cost: 10,
            unitOfMeasure: 'EACH',
            categoryId: null,
            category: null,
            barcode: null,
            minStockThreshold: 3,
          },
        ];
      else if (path.endsWith('/units'))
        value = [
          { code: 'EACH', factor: '1', purchase_allowed: 1, sale_allowed: 1 },
          { code: 'CASE_12', factor: '12', purchase_allowed: 1, sale_allowed: 1 },
          { code: 'SALE_ONLY', factor: '1', purchase_allowed: 0, sale_allowed: 1 },
        ];
      else if (path === '/api/inventory')
        value = [
          {
            product_id: productId,
            location_id: +parsed.searchParams.get('locationId')!,
            sku: 'PART',
            item_name: parsed.searchParams.get('locationId') === '8' ? 'North stock' : 'Main stock',
            quantity_on_hand: 3,
            quantity_reserved: 1,
            available_quantity: 2,
            reorder_level: 3,
            low_stock: 1,
            stock_value: parsed.searchParams.get('locationId') === '8' ? '200' : '100.000001',
          },
        ];
      else if (path === '/api/v1/purchasing/suppliers') {
        if (method === 'POST') {
          supplierAttempts++;
          if (supplierLost && supplierAttempts === 1) throw new TypeError('Connection lost');
          suppliers.push({ id: 'new-supplier', name: body.name, email: body.email, active: 1 });
        }
        value = method === 'POST' ? suppliers.at(-1) : suppliers;
      } else if (path === '/api/v1/purchasing/orders') value = method === 'POST' ? po() : [po()];
      else if (path === `/api/v1/purchasing/orders/${poId}`) value = po();
      else if (path === `/api/v1/purchasing/orders/${poId}/receive`) {
        receiptAttempts++;
        if (receiveConflict)
          return new Response(
            '{"detail":"Received quantity exceeds the purchase-order remainder"}',
            { status: 409 },
          );
        if (!completedReceipts.has(body.requestId)) {
          received += 6;
          completedReceipts.add(body.requestId);
        }
        if (uncertainReceipt && receiptAttempts === 1) throw new TypeError('Connection lost');
        value = po();
      } else if (path === '/api/v1/inventory/batches')
        value = [
          {
            id: batchId,
            product_id: productId,
            location_id: 7,
            code: 'LOT-A',
            expires_on: '2020-01-01',
            quantity_on_hand: batchQuantity,
            quantity_reserved: 1,
            available: batchQuantity - 1,
          },
        ];
      else if (path === `/api/v1/inventory/batches/${batchId}/count`) {
        if (batchConflict) {
          batchQuantity = 12;
          return new Response('{"detail":"Batch stock changed; recount before approving"}', {
            status: 409,
          });
        }
        batchQuantity = body.countedQuantity;
        value = { id: batchId, quantity_on_hand: batchQuantity };
      } else if (path === '/api/v1/inventory/transfers')
        value = method === 'POST' ? transfer() : [transfer()];
      else if (path.startsWith(`/api/v1/inventory/transfers/${transferId}`)) {
        if (forbidden) return new Response('{"detail":"Branch not found"}', { status: 404 });
        if (path.endsWith('/dispatch')) transferStatus = 'DISPATCHED';
        if (path.endsWith('/receive')) {
          transferReceived += body.quantities[productId];
          transferStatus = transferReceived === 4 ? 'RECEIVED' : 'PARTIAL';
        }
        value = transfer();
      } else if (path === '/api/counts')
        value = [
          { id: 'count-1', location_id: 7, status: 'SUBMITTED', created_at: '2026-11-14 10:00:00' },
        ];
      else if (path === '/api/counts/count-1')
        value = {
          id: 'count-1',
          location_id: 7,
          status: 'SUBMITTED',
          lines: [
            {
              product_id: productId,
              sku: 'PART',
              expected_quantity: 10,
              counted_quantity: 8,
              variance: -2,
            },
          ],
        };
      else if (path === '/api/counts/count-1/approve')
        return new Response(
          '{"detail":"Stock changed during counting; reopen, recount and resubmit"}',
          { status: 409 },
        );
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
async function purchasing(user: ReturnType<typeof mount>) {
  await user.click(screen.getByRole('link', { name: 'Purchasing' }));
  await screen.findByRole('heading', { name: 'Purchasing & suppliers' });
}
async function openPO(user: ReturnType<typeof mount>) {
  await purchasing(user);
  await user.click(await screen.findByRole('link', { name: /^PO / }));
  await screen.findByRole('button', { name: 'Receive goods' });
}
async function receive(user: ReturnType<typeof mount>) {
  await user.click(screen.getByRole('button', { name: 'Receive goods' }));
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText('Receive quantity (CASE_12)'), '0.5');
  await user.click(within(dialog).getByRole('button', { name: 'Confirm goods receipt' }));
}
describe('F4 branch inventory and approvals', () => {
  it('switches stock/cost queries and discards a prior branch adjustment draft', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    await screen.findByText('Main stock');
    expect(screen.getByText('JMD 33.333334')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Receive / adjust stock' }));
    await screen.findByRole('dialog');
    await user.selectOptions(screen.getByLabelText('Active location'), '8');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await screen.findByText('North stock');
    expect(
      calls.some((c) => c.path === '/api/inventory' && c.search.get('locationId') === '8'),
    ).toBe(true);
  });
  it('hides cost and management navigation from inventory clerks', async () => {
    backend({ role: 'INVENTORY_CLERK' });
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    await screen.findByText('Main stock');
    expect(screen.queryByText('Recorded stock value')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Receive / adjust stock' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Purchasing' })).not.toBeInTheDocument();
  });
  it('posts a reasoned, explicitly approved valued receipt with exact decimal cost', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: 'Inventory' }));
    await user.click(await screen.findByRole('button', { name: 'Receive / adjust stock' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Product'), productId);
    await user.selectOptions(await within(dialog).findByLabelText('Purchase unit'), 'EACH');
    await user.type(within(dialog).getByLabelText('Adjustment quantity in selected unit'), '2');
    await user.clear(within(dialog).getByLabelText('Acquisition cost per selected unit'));
    await user.type(
      within(dialog).getByLabelText('Acquisition cost per selected unit'),
      '123.123456',
    );
    await user.type(within(dialog).getByLabelText('Approval reason'), 'Confirmed delivery');
    await user.click(within(dialog).getByLabelText('I reviewed and approve this stock adjustment'));
    await user.click(within(dialog).getByRole('button', { name: 'Approve and post stock change' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === '/api/v1/inventory/adjustments')).toBeTruthy(),
    );
    expect(calls.find((c) => c.path === '/api/v1/inventory/adjustments')?.body).toMatchObject({
      locationId: 7,
      productId,
      unit: 'EACH',
      quantity: '2',
      unitCost: '123.123456',
      reason: 'Confirmed delivery',
      type: 'RECEIPT',
    });
  });
  it('shows stale batch-count conflicts without silently adopting a newer expected balance', async () => {
    const calls = backend({ batchConflict: true });
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: 'Batches & expiry' }));
    await user.click(await screen.findByRole('button', { name: 'Review count for LOT-A' }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Counted base units'));
    await user.type(within(dialog).getByLabelText('Counted base units'), '8');
    await user.type(
      within(dialog).getByLabelText('Batch count approval reason'),
      'Physical recount',
    );
    await user.click(within(dialog).getByLabelText('I reviewed this batch count discrepancy'));
    await user.click(within(dialog).getByRole('button', { name: 'Approve batch discrepancy' }));
    await within(dialog).findByText('Batch stock changed; recount before approving');
    expect(within(dialog).getByLabelText('Counted base units')).toHaveValue(8);
    expect(calls.find((c) => c.path.endsWith('/count'))?.body.expectedQuantity).toBe(9);
  });
  it('requests past-due/soon-due alerts from the server with the selected horizon', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: 'Batches & expiry' }));
    await screen.findByText('LOT-A');
    await user.selectOptions(screen.getByLabelText('Batch expiry filter'), 'expiring');
    await user.selectOptions(screen.getByLabelText('Expiry alert horizon'), '7');
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.path.endsWith('/batches') &&
            c.search.get('expiring') === 'true' &&
            c.search.get('days') === '7',
        ),
      ).toBe(true),
    );
    expect(screen.getByText(/not a promise that it can be sold/)).toBeInTheDocument();
  });
  it('shows discrepancy totals and preserves submitted status when approval conflicts', async () => {
    backend();
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: 'Stock counts' }));
    await user.click(await screen.findByRole('link', { name: /^Count / }));
    await screen.findByRole('heading', { name: 'Discrepancy review' });
    expect(screen.getByText(/Shortage: 2 base units/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve differences' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Approve and update inventory',
      }),
    );
    await screen.findByText('Stock changed during counting; reopen, recount and resubmit');
    expect(screen.queryByText('Count approved and stock updated.')).not.toBeInTheDocument();
  });
});
describe('F4 purchasing and command recovery', () => {
  it('creates a purchase order with snapshottable units and six-place cost input', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await purchasing(user);
    await user.click(screen.getByRole('button', { name: 'Create purchase order' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Supplier'), supplierId);
    await user.selectOptions(within(dialog).getByLabelText('Product 1'), productId);
    await user.selectOptions(await within(dialog).findByLabelText('Purchase unit 1'), 'CASE_12');
    expect(within(dialog).queryByRole('option', { name: /SALE_ONLY/ })).not.toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Purchase quantity 1'));
    await user.type(within(dialog).getByLabelText('Purchase quantity 1'), '2');
    await user.clear(within(dialog).getByLabelText(/^Acquisition cost per purchase unit 1/));
    await user.type(
      within(dialog).getByLabelText(/^Acquisition cost per purchase unit 1/),
      '1200.123456',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Create purchase order' }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.path.endsWith('/purchasing/orders') && c.method === 'POST'),
      ).toBeTruthy(),
    );
    expect(
      calls.find((c) => c.path.endsWith('/purchasing/orders') && c.method === 'POST')?.body,
    ).toMatchObject({
      locationId: 7,
      supplierId,
      lines: [{ productId, unit: 'CASE_12', quantity: '2', unitCost: '1200.123456' }],
    });
  });
  it('receives a partial purchase quantity using the PO unit and preserves the receiving branch', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await openPO(user);
    await user.selectOptions(screen.getByLabelText('Active location'), '8');
    await screen.findByText(/does not retarget this order/);
    await receive(user);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Partial')).toBeTruthy();
    expect(calls.find((c) => c.path.endsWith('/receive'))?.body.lines).toEqual([
      { productId, quantity: '0.5', batchCode: null, expiresOn: null },
    ]);
    expect(calls.find((c) => c.path.endsWith('/receive'))?.body).not.toHaveProperty('locationId');
  });
  it('keeps a rejected over-receipt visible without claiming any stock update', async () => {
    backend({ receiveConflict: true });
    const user = mount();
    await login(user);
    await openPO(user);
    await receive(user);
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Received quantity exceeds the purchase-order remainder');
    expect(within(dialog).getByLabelText('Receive quantity (CASE_12)')).toHaveValue('0.5');
    expect(
      screen.queryByText('Goods received. Remaining quantities and stock have been refreshed.'),
    ).not.toBeInTheDocument();
  });
  it('freezes an uncertain receipt and retries the identical command once', async () => {
    const calls = backend({ uncertainReceipt: true });
    const user = mount();
    await login(user);
    await openPO(user);
    await receive(user);
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText(/The result is uncertain/);
    expect(within(dialog).getByLabelText('Receive quantity (CASE_12)')).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Retry same command' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const writes = calls.filter((c) => c.path.endsWith('/receive'));
    expect(writes).toHaveLength(2);
    expect(writes[0].body).toEqual(writes[1].body);
    expect(screen.getByText('24 / 6')).toBeInTheDocument();
  });
  it('retries supplier creation with its original request ID after a lost response', async () => {
    const calls = backend({ supplierLost: true });
    const user = mount();
    await login(user);
    await purchasing(user);
    await user.click(screen.getByRole('button', { name: 'Add supplier' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Supplier name'), 'New Supplier');
    await user.click(within(dialog).getByRole('button', { name: 'Save supplier' }));
    await within(dialog).findByText(/The result is uncertain/);
    await user.click(within(dialog).getByRole('button', { name: 'Retry same command' }));
    await screen.findByText('New Supplier');
    const writes = calls.filter((c) => c.path.endsWith('/suppliers') && c.method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[0].body).toEqual(writes[1].body);
  });
});
describe('F4 transfer lifecycle', () => {
  it('dispatches before receiving and shows server in-transit balances separately', async () => {
    const calls = backend();
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: 'Transfers' }));
    await user.click(await screen.findByRole('link', { name: /^Transfer / }));
    await user.click(await screen.findByRole('button', { name: 'Dispatch goods' }));
    let dialog = screen.getByRole('dialog');
    await user.click(
      within(dialog).getByLabelText('I reviewed the transfer branches and quantities'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Confirm dispatch' }));
    await screen.findByRole('button', { name: 'Receive transfer' });
    expect(
      screen.queryByRole('button', { name: 'Cancel requested transfer' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('JMD 40')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Receive transfer' }));
    dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Receive base units for/), '2');
    await user.click(
      within(dialog).getByLabelText('I reviewed the transfer branches and quantities'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Confirm transfer receipt' }));
    await screen.findByText('JMD 20');
    expect(calls.find((c) => c.path.endsWith('/receive'))?.body.quantities).toEqual({
      [productId]: 2,
    });
  });
  it('disables transfer creation when two permitted active branches are unavailable', async () => {
    backend({ role: 'MANAGER', restricted: true });
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: 'Transfers' }));
    expect(await screen.findByRole('button', { name: 'Request transfer' })).toBeDisabled();
  });
  it('shows forbidden/inaccessible branch state without leaking a transfer detail', async () => {
    backend({ forbidden: true });
    const user = mount();
    await login(user);
    await user.click(screen.getByRole('link', { name: 'Transfers' }));
    await user.click(await screen.findByRole('link', { name: /^Transfer / }));
    await screen.findByText('Branch not found');
    expect(screen.queryByRole('button', { name: 'Dispatch goods' })).not.toBeInTheDocument();
  });
});
