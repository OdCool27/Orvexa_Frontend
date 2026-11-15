import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import {
  basketPayload,
  discountPercent,
  paymentCanStart,
  safeAmount,
  type BasketLine,
} from '../lib/checkout';
import type { Sale, PaymentAttempt, Reversal } from '../api/checkout';
import { SaleDetail } from '../features/sale';
import { PosPage } from '../features/pos';
import { SaleCommandFeedback, useSaleCommand } from '../features/sale-command';
import { Brand } from '../components/Brand';
import { AuthFrame } from '../auth/AccountUI';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  user: { id: 1, businessId: 2, membershipId: 3, role: 'OWNER', operator: false },
}));
vi.mock('../auth/Auth', () => ({ useAuth: () => ({ api: mocks.api, user: mocks.user }) }));
vi.mock('../app/workspace', () => ({
  useWorkspace: () => ({
    locationId: 7,
    business: { currency: 'JMD' },
    locations: [{ id: 7, name: 'Main' }],
  }),
}));
vi.mock('../features/onboarding', () => ({ TaxSetupGuidance: () => null }));

const line = {
  product_id: 'p1',
  sku: 'PART',
  item_name: 'Air filter',
  quantity: 2,
  price_cents: 1000,
  net_cents: 1800,
  tax_cents: 270,
  total_cents: 2070,
  tax_classification: 'STANDARD',
  tax_rate_percent: '15',
  tax_rule_label: 'Saved policy',
  tax_verified: 1,
  tax_illustrative: 0,
  discount_percent: '10',
  discount_reason: 'Promotion',
};
const makeSale = (changes: Partial<Sale> = {}): Sale => ({
  id: 'sale1',
  location_id: 7,
  channel: 'POS',
  status: 'RESERVED',
  payment_state: 'NOT_STARTED',
  expires_at_ms: Date.now() + 300000,
  created_at: '2026-11-14 12:00:00',
  simulated: false,
  discount_cents: 200,
  tax_snapshot_version: 1,
  net_cents: 1800,
  tax_cents: 270,
  total_cents: 2070,
  currency: 'JMD',
  price_mode: 'EXCLUSIVE',
  seller_registration_status: 'REGISTERED',
  seller_tax_verified: 1,
  lines: [line],
  payments: [],
  events: [],
  ...changes,
});
const basket: BasketLine = {
  productId: 'p1',
  name: 'Air filter',
  sku: 'PART',
  baseUnit: 'EACH',
  unitCode: 'BASE',
  quantity: '2',
};
function mount(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/app/orders/sale1']}>
        <Routes>
          <Route path="/app/orders/:id" element={node} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
let sale: Sale;
let attempts: PaymentAttempt[];
let reversals: Reversal[];
beforeEach(() => {
  onlineManager.setOnline(true);
  mocks.api.mockReset();
  mocks.user.role = 'OWNER';
  sale = makeSale();
  attempts = [];
  reversals = [];
  mocks.api.mockImplementation(
    async (path: string, method = 'GET', body?: Record<string, unknown>) => {
      if (path === '/api/orders/sale1') return structuredClone(sale);
      if (path.endsWith('/payments') && method === 'GET') return structuredClone(attempts);
      if (path.endsWith('/reversals') && method === 'GET') return structuredClone(reversals);
      if (path.startsWith('/api/v1/checkout/reversals/'))
        return structuredClone(reversals.find((r) => path.endsWith(r.id)));
      if (path.includes('/checkout/catalogue'))
        return [
          {
            id: 'p1',
            sku: 'PART',
            item_name: 'Air filter',
            unit_of_measure: 'EACH',
            available: 6,
            price_cents: 1000,
          },
        ];
      if (path.endsWith('/units')) return [{ code: 'CASE', factor: '6', sale_allowed: 1 }];
      if (path === '/api/orders/cart')
        return { ...sale, lines: [{ ...line, id: 'p1' }], sufficientStock: true };
      if (path.endsWith('/payments') && method === 'POST') {
        const status = body?.provider === 'CASH' ? 'CONFIRMED' : 'UNKNOWN';
        sale = {
          ...sale,
          status: status === 'CONFIRMED' ? 'COMPLETED' : 'RESERVED',
          payment_state: status,
        };
        attempts = [
          {
            id: 'pay1',
            provider: body?.provider as PaymentAttempt['provider'],
            status,
            amount_cents: 2070,
            currency: 'JMD',
            created_ms: Date.now(),
            external_reference: null,
          },
        ];
        return attempts[0];
      }
      return [];
    },
  );
});
describe('F5 payload and state boundaries', () => {
  it('sends base quantities or exact unit decimals, never browser amounts', () => {
    expect(basketPayload([basket], 7)).toEqual({
      locationId: 7,
      lines: [{ productId: 'p1', quantity: 2 }],
    });
    expect(basketPayload([{ ...basket, unitCode: 'CASE', quantity: '0.500000' }], 7)).toEqual({
      locationId: 7,
      lines: [{ productId: 'p1', unitCode: 'CASE', unitQuantity: '0.500000' }],
    });
  });
  it.each(['0', '1.5', '100001', '-1'])('rejects invalid base quantity %s', (quantity) =>
    expect(() => basketPayload([{ ...basket, quantity }], 7)).toThrow(),
  );
  it.each(['100.01', '-1', '1e2', '1.001'])('rejects invalid discount %s', (value) =>
    expect(() => discountPercent(value)).toThrow(),
  );
  it('requires a reason for positive discounts and preserves the decimal string', () => {
    expect(() => basketPayload([basket], 7, '2.50')).toThrow('reason');
    expect(basketPayload([basket], 7, '2.50', ' Manager adjustment ')).toMatchObject({
      discountPercent: '2.50',
      discountReason: 'Manager adjustment',
    });
  });
  it('prevents payment after expiry, on a hold, and on unsafe amounts', () => {
    expect(paymentCanStart(makeSale())).toBe(true);
    expect(paymentCanStart(makeSale({ expires_at_ms: Date.now() - 1 }))).toBe(false);
    expect(paymentCanStart(makeSale({ payment_state: 'UNKNOWN' }))).toBe(false);
    expect(paymentCanStart(makeSale({ total_cents: Number.MAX_SAFE_INTEGER + 1 }))).toBe(false);
    expect(safeAmount(-1)).toBe(false);
  });
});
describe('F5 saved sales', () => {
  it('shows escaped receipt text in a sandbox without script permission', async () => {
    sale.status = 'COMPLETED';
    sale.payment_state = 'CONFIRMED';
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (...args) =>
      args[0].includes('/receipt?')
        ? { text: async () => '<script>bad()</script> & saved totals' }
        : original(...args),
    );
    const user = mount(<SaleDetail />);
    await user.click(await screen.findByRole('button', { name: 'Preview receipt' }));
    const frame = await screen.findByTitle('Printable saved receipt');
    expect(frame).toHaveAttribute('sandbox', 'allow-same-origin allow-modals');
    expect(frame.getAttribute('srcdoc')).toContain(
      '&lt;script&gt;bad()&lt;/script&gt; &amp; saved totals',
    );
    expect(frame.getAttribute('srcdoc')).toContain('/assets/orvexa-dark.png');
  });
  it('withholds management refund approval from cashiers', async () => {
    mocks.user.role = 'CASHIER';
    sale.status = 'FULFILLED';
    sale.payment_state = 'CONFIRMED';
    reversals = [
      {
        id: 'rev1',
        order_id: sale.id,
        type: 'RETURN',
        status: 'REQUESTED',
        reason: 'Returned sealed',
        resellable: 1,
        amount_cents: 1035,
        net_cents: 900,
        tax_cents: 135,
        created_ms: Date.now(),
        lines: [],
      },
    ];
    const user = mount(<SaleDetail />);
    await user.click(await screen.findByRole('button', { name: 'RETURN rev1' }));
    await screen.findByRole('dialog', { name: 'RETURN · REQUESTED' });
    expect(screen.queryByRole('button', { name: 'Review reversal' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm refund / reversal completion' }),
    ).not.toBeInTheDocument();
  });
  it('reconciles a lost successful payment response without issuing a second payment', async () => {
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (...args) => {
      const result = await original(...args);
      if (args[0].endsWith('/payments') && args[1] === 'POST')
        throw new ApiError('Response lost', 0);
      return result;
    });
    const user = mount(<SaleDetail />);
    await user.click(await screen.findByRole('button', { name: 'Choose payment method' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Confirm selected payment' }));
    await user.click(await screen.findByRole('button', { name: 'Close dialog' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check saved state' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Check saved state' })).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: 'Retry original command' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm selected payment' })).toBeDisabled();
    expect(
      mocks.api.mock.calls.filter((c) => c[0].endsWith('/payments') && c[1] === 'POST'),
    ).toHaveLength(1);
  });
  it('completes an approved cash refund only after explicit management confirmation', async () => {
    sale.status = 'FULFILLED';
    sale.payment_state = 'CONFIRMED';
    sale.payments = [
      {
        provider: 'CASH',
        method: 'CASH',
        successful: 1,
        amount_cents: 2070,
        created_at: sale.created_at,
      },
    ];
    reversals = [
      {
        id: 'rev1',
        order_id: sale.id,
        type: 'RETURN',
        status: 'APPROVED',
        reason: 'Returned sealed',
        resellable: 1,
        amount_cents: 1035,
        net_cents: 900,
        tax_cents: 135,
        created_ms: Date.now(),
        lines: [
          { product_id: 'p1', quantity: 1, net_cents: 900, tax_cents: 135, total_cents: 1035 },
        ],
      },
    ];
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (...args) => {
      if (args[0].endsWith('/rev1/complete')) {
        reversals[0].status = 'COMPLETED';
        reversals[0].refund_method = 'CASH';
        return reversals[0];
      }
      return original(...args);
    });
    const user = mount(<SaleDetail />);
    await user.click(await screen.findByRole('button', { name: 'RETURN rev1' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm refund / reversal completion' }),
    );
    const dialog = screen.getAllByRole('dialog').at(-1)!;
    expect(dialog).toHaveTextContent('cash refund has actually been given');
    expect(mocks.api.mock.calls.some((c) => c[0].endsWith('/complete'))).toBe(false);
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Record confirmed refund' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/api/v1/checkout/reversals/rev1/complete', 'POST', {
        confirmed: true,
        method: 'CASH',
        externalReference: null,
        requestId: expect.any(String),
      }),
    );
    await screen.findByText(/Completed using CASH/);
  });
  it('subtracts requested quantities and prevents choosing physical returns before fulfillment', async () => {
    sale.status = 'COMPLETED';
    sale.payment_state = 'CONFIRMED';
    reversals = [
      {
        id: 'rev1',
        order_id: sale.id,
        type: 'REFUND',
        status: 'REQUESTED',
        reason: 'Adjustment',
        resellable: 0,
        amount_cents: 1035,
        net_cents: 900,
        tax_cents: 135,
        created_ms: Date.now(),
        lines: [
          { product_id: 'p1', quantity: 1, net_cents: 900, tax_cents: 135, total_cents: 1035 },
        ],
      },
    ];
    const user = mount(<SaleDetail />);
    await user.click(await screen.findByRole('button', { name: 'Request return / refund' }));
    await screen.findByText('1 of 2 sold base units remain available for a request.');
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByRole('option', { name: /Development simulator/ }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('option', { name: 'Physical return with refund' }),
    ).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Reversal type'), 'REFUND');
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  });
  it('confirms cash explicitly and then renders server-confirmed state', async () => {
    const user = mount(<SaleDetail />);
    await user.click(await screen.findByRole('button', { name: 'Choose payment method' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm selected payment' }));
    await screen.findAllByText('Confirmed', { selector: '.badge' });
    expect(mocks.api).toHaveBeenCalledWith(
      '/api/v1/checkout/orders/sale1/payments',
      'POST',
      expect.objectContaining({ provider: 'CASH', requestId: expect.any(String) }),
    );
    expect(screen.queryByRole('button', { name: 'Choose payment method' })).not.toBeInTheDocument();
  });
  it('records manual-terminal UNKNOWN without offering another payment or cancellation', async () => {
    const user = mount(<SaleDetail />);
    await user.click(await screen.findByRole('button', { name: 'Choose payment method' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Payment provider'), 'MANUAL_TERMINAL');
    expect(within(dialog).getByText(/Creates an UNKNOWN hold only/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm selected payment' }));
    await screen.findByText(/Stock remains held even after/);
    expect(screen.queryByRole('button', { name: 'Choose payment method' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Release unpaid reservation' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reconcile pay1' })).toBeInTheDocument();
  });
  it('does not give a cashier management reconciliation controls', async () => {
    mocks.user.role = 'CASHIER';
    sale.payment_state = 'UNKNOWN';
    sale.expires_at_ms = 1;
    attempts = [
      {
        id: 'pay1',
        provider: 'MANUAL_TERMINAL',
        status: 'UNKNOWN',
        amount_cents: 2070,
        currency: 'JMD',
        created_ms: Date.now(),
        external_reference: null,
      },
    ];
    mount(<SaleDetail />);
    await screen.findByText(/Stock remains held even after/);
    expect(screen.queryByRole('button', { name: /Reconcile pay1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose payment method' })).not.toBeInTheDocument();
  });
  it('disables expired unpaid reservations', async () => {
    sale.expires_at_ms = 1;
    mount(<SaleDetail />);
    await screen.findByText(/Reservation time elapsed/);
    expect(screen.queryByRole('button', { name: 'Choose payment method' })).not.toBeInTheDocument();
  });
  it('blocks payment when connectivity is lost', async () => {
    mount(<SaleDetail />);
    await screen.findByRole('button', { name: 'Choose payment method' });
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByRole('alert')).toHaveTextContent('unavailable while offline');
    expect(screen.queryByRole('button', { name: 'Choose payment method' })).not.toBeInTheDocument();
  });
  it('keeps fulfillment restricted to backend-authorized inventory roles', async () => {
    mocks.user.role = 'CASHIER';
    sale.status = 'COMPLETED';
    sale.payment_state = 'CONFIRMED';
    mount(<SaleDetail />);
    await screen.findByText('Historical sale amounts');
    expect(
      screen.queryByRole('button', { name: 'Confirm goods handed over' }),
    ).not.toBeInTheDocument();
  });
  it('offers physical restocking only on fulfilled sales and submits quantities, not amounts', async () => {
    sale.status = 'FULFILLED';
    sale.payment_state = 'CONFIRMED';
    const user = mount(<SaleDetail />);
    await user.click(await screen.findByRole('button', { name: 'Request return / refund' }));
    const dialog = screen.getByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Save reversal request' })).toBeEnabled(),
    );
    await user.selectOptions(within(dialog).getByLabelText('Reversal type'), 'RETURN');
    await user.type(within(dialog).getByLabelText('Reversal quantity for PART'), '1');
    await user.click(within(dialog).getByLabelText(/Returned goods are resellable/));
    await user.type(within(dialog).getByLabelText('Reversal reason'), 'Returned unopened');
    await user.click(within(dialog).getByRole('button', { name: 'Save reversal request' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/api/v1/checkout/orders/sale1/reversals', 'POST', {
        type: 'RETURN',
        resellable: true,
        reason: 'Returned unopened',
        lines: [{ productId: 'p1', quantity: 1 }],
        requestId: expect.any(String),
      }),
    );
  });
  it('reports receipt email as queued, with delivery unconfirmed', async () => {
    sale.status = 'COMPLETED';
    sale.payment_state = 'CONFIRMED';
    const user = mount(<SaleDetail />);
    await user.type(await screen.findByLabelText('Receipt email address'), 'receipt@test.local');
    await user.click(screen.getByRole('button', { name: 'Queue receipt email' }));
    await screen.findByText(
      'Receipt email queued to receipt@test.local. Delivery is not confirmed.',
    );
  });
});
function Recovery({ inspect }: { inspect: () => Promise<boolean> }) {
  const command = useSaleCommand(inspect);
  return (
    <>
      <button
        disabled={command.blocked || command.pending}
        onClick={() => void command.send('/pay', { provider: 'CASH' })}
      >
        Pay
      </button>
      <SaleCommandFeedback command={command} />
    </>
  );
}
describe('F5 uncertain command recovery', () => {
  it('requires a read before retry and reuses the exact original request', async () => {
    mocks.api.mockRejectedValueOnce(new ApiError('Connection lost', 0)).mockResolvedValue({});
    const inspect = vi.fn().mockResolvedValue(true);
    const user = mount(<Recovery inspect={inspect} />);
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    expect(await screen.findByRole('button', { name: 'Check saved state' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry original command' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Check saved state' }));
    await user.click(await screen.findByRole('button', { name: 'Retry original command' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
    expect(inspect).toHaveBeenCalledOnce();
    expect(mocks.api.mock.calls[1]).toEqual(mocks.api.mock.calls[0]);
  });
  it('does not retry when the saved outcome resolves the command', async () => {
    mocks.api.mockRejectedValue(new ApiError('Gateway timeout', 504));
    const user = mount(<Recovery inspect={async () => false} />);
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    await user.click(await screen.findByRole('button', { name: 'Check saved state' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Check saved state' })).not.toBeInTheDocument(),
    );
    expect(mocks.api).toHaveBeenCalledOnce();
  });
  it('retains the block if an exact retry also fails offline', async () => {
    mocks.api
      .mockRejectedValueOnce(new ApiError('Connection lost', 0))
      .mockRejectedValueOnce(new ApiError('Offline', 0, [], 'OFFLINE'));
    const user = mount(<Recovery inspect={async () => true} />);
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    await user.click(await screen.findByRole('button', { name: 'Check saved state' }));
    await user.click(await screen.findByRole('button', { name: 'Retry original command' }));
    await screen.findByText('Offline');
    expect(screen.getByRole('button', { name: 'Pay' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Retry original command' }),
    ).not.toBeInTheDocument();
  });
});
describe('F5 POS and brand placement', () => {
  it('chooses logo shades from placement and keeps an accessible home link', () => {
    mount(
      <>
        <Brand />
        <AuthFrame title="Sign in">
          <p>Account form</p>
        </AuthFrame>
      </>,
    );
    const logos = screen.getAllByRole('img', { name: 'Orvexa' });
    expect(logos[0]).toHaveAttribute('src', '/assets/orvexa-dark.png');
    expect(logos[1]).toHaveAttribute('src', '/assets/orvexa-light.png');
    expect(screen.getAllByRole('link', { name: 'Orvexa by Osyntra home' })).toHaveLength(2);
  });
  it('supports scan focus and keyboard checkout review with server amounts', async () => {
    const user = mount(<PosPage />);
    await user.keyboard('{F2}');
    expect(screen.getByLabelText('Scan SKU or barcode')).toHaveFocus();
    await user.click(await screen.findByRole('button', { name: /Air filter.*PART/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reserve & continue' })).toBeEnabled(),
    );
    await user.keyboard('{F8}');
    expect(
      await screen.findByRole('dialog', { name: 'Review checkout reservation' }),
    ).toHaveTextContent('20.70');
  });
  it('disables reservation on insufficient server stock', async () => {
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(async (...args) =>
      args[0] === '/api/orders/cart' ? { ...sale, sufficientStock: false } : original(...args),
    );
    const user = mount(<PosPage />);
    await user.click(await screen.findByRole('button', { name: /Air filter.*PART/ }));
    await screen.findByText(/Insufficient saleable stock/);
    expect(screen.getByRole('button', { name: 'Reserve & continue' })).toBeDisabled();
  });
});
