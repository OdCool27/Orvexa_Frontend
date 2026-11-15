import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import type { PaymentAttempt, Sale } from '../api/checkout';
import {
  Badge,
  ErrorBox,
  Field,
  Form,
  Heading,
  Input,
  Loading,
  Modal,
  str,
  Table,
  useApiQuery,
} from '../components/ui';
import { BranchName } from '../components/InventoryUI';
import { paymentCanStart, saleMoney } from '../lib/checkout';
import { date } from '../lib/format';
import { SaleSummary } from './SaleSummary';
import {
  SaleCommandFeedback,
  useSaleCommand,
  useCheckoutConnection,
  type SaleAttempt,
} from './sale-command';
import { Reversals, externalReference } from './sale-reversals';
import { ReceiptTools } from './sale-receipts';

export function SaleDetail() {
  const { id } = useParams();
  return <SaleDetailInner key={id} id={id!} />;
}
function SaleDetailInner({ id }: { id: string }) {
  const { user } = useAuth();
  const order = useApiQuery<Sale>(`/api/orders/${id}`, true, true);
  const payments = useApiQuery<PaymentAttempt[]>(
    `/api/v1/checkout/orders/${id}/payments`,
    true,
    true,
  );
  const [now, setNow] = useState(Date.now());
  const { online, connectedAt } = useCheckoutConnection();
  const [mode, setMode] = useState<'payment' | 'cancel' | 'fulfill'>();
  const [reconcile, setReconcile] = useState<string>();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function reload() {
    const [sale, attempts] = await Promise.all([order.refetch(), payments.refetch()]);
    if (sale.error || attempts.error) throw sale.error || attempts.error;
    return { sale: sale.data!, attempts: attempts.data! };
  }
  useEffect(() => {
    if (online) void reload().catch(() => undefined);
  }, [online, connectedAt]);
  async function inspect(command: SaleAttempt) {
    const fresh = await reload();
    if (command.path.endsWith('/payments'))
      return (
        fresh.sale.status === 'RESERVED' &&
        fresh.sale.payment_state === 'NOT_STARTED' &&
        !fresh.attempts.some((p) => ['PENDING', 'UNKNOWN'].includes(p.status))
      );
    if (command.path.endsWith('/cancel'))
      return fresh.sale.status === 'RESERVED' && fresh.sale.payment_state === 'NOT_STARTED';
    if (command.path.endsWith('/fulfill')) return fresh.sale.status === 'COMPLETED';
    return false;
  }
  if (order.isLoading) return <Loading />;
  if (!order.data) return <ErrorBox error={order.error} />;
  const sale = order.data;
  const remaining = Math.max(0, Math.ceil((sale.expires_at_ms - now) / 1000));
  const unresolved =
    ['PENDING', 'UNKNOWN'].includes(sale.payment_state) ||
    !!payments.data?.some((p) => ['PENDING', 'UNKNOWN'].includes(p.status));
  const mayPay =
    online &&
    order.dataUpdatedAt >= connectedAt &&
    payments.dataUpdatedAt >= connectedAt &&
    paymentCanStart(sale, now) &&
    !unresolved &&
    !payments.isPending &&
    !payments.error &&
    !order.error;
  const mayFulfill =
    sale.status === 'COMPLETED' &&
    sale.payment_state === 'CONFIRMED' &&
    (can(user, 'manage') || ['CLERK', 'INVENTORY_CLERK'].includes(user?.role || ''));
  return (
    <>
      <Link className="back-link" to="/app/orders">
        All orders
      </Link>
      <Heading
        eyebrow="SAVED SALE & PAYMENT"
        title={`Order ${sale.id}`}
        description={`Branch ${sale.location_id} · ${sale.channel} · ${date(sale.created_at)}`}
      >
        <Badge value={sale.status} />
        <Badge value={sale.payment_state || 'STATE_UNAVAILABLE'} />
        <Link className="button secondary" to="/app/pos">
          Open POS
        </Link>
      </Heading>
      <p>
        Saved branch: <BranchName id={sale.location_id} />. Header changes do not retarget this
        sale.
      </p>
      <ErrorBox error={order.error || payments.error} />
      <button
        className="button secondary small"
        onClick={() => void reload().catch(() => undefined)}
      >
        Refresh saved sale and payment state
      </button>
      {!online && (
        <div className="notice danger" role="alert">
          Payment actions are unavailable while offline. Reconnect and refresh saved status before
          continuing.
        </div>
      )}
      {unresolved ? (
        <div className="notice danger" role="alert">
          Payment is pending or UNKNOWN. Stock remains held even after the normal reservation timer.
          Do not charge again or cancel the hold. An authorized manager must verify the external
          outcome and reconcile it.
        </div>
      ) : (
        sale.status === 'RESERVED' && (
          <div className="notice info">
            {remaining
              ? `Stock reserved · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining by browser clock.`
              : 'Reservation time elapsed. Payment is disabled; refresh to confirm server expiry.'}
          </div>
        )
      )}
      {sale.tax_snapshot_version === 0 && (
        <div className="notice info">
          Historical order: tax was not reconstructed. Do not treat missing legacy tax details as a
          newly verified calculation.
        </div>
      )}
      <section className="panel padded">
        <h2>Historical sale amounts</h2>
        <SaleSummary quote={sale} discount={sale.discount_cents} />
        <div className="actions">
          {can(user, 'checkout') && mayPay && (
            <button className="button primary" onClick={() => setMode('payment')}>
              Choose payment method
            </button>
          )}
          {can(user, 'checkout') &&
            sale.status === 'RESERVED' &&
            sale.payment_state === 'NOT_STARTED' &&
            !unresolved && (
              <button
                className="button secondary"
                disabled={!online || !!order.error || !!payments.error}
                onClick={() => setMode('cancel')}
              >
                Release unpaid reservation
              </button>
            )}
          {mayFulfill && (
            <button
              className="button secondary"
              disabled={!online}
              onClick={() => setMode('fulfill')}
            >
              Confirm goods handed over
            </button>
          )}
        </div>
      </section>
      <section className="panel padded">
        <h2>Payment attempts</h2>
        <p>
          Cash is a staff confirmation. Manual terminal records do not contact a bank or collect
          card details. Refresh/reconcile an existing attempt before another payment.
        </p>
        <Table
          rows={payments.data || []}
          columns={[
            {
              title: 'Provider / status',
              render: (p) => (
                <>
                  {p.provider}
                  <p>
                    <Badge value={p.status} />
                  </p>
                </>
              ),
            },
            { title: 'Saved amount', render: (p) => saleMoney(p.amount_cents, p.currency) },
            { title: 'Reference', render: (p) => p.external_reference || 'Not recorded' },
            { title: 'Recorded', render: (p) => date(new Date(p.created_ms).toISOString()) },
            {
              title: 'Reconciliation',
              render: (p) =>
                can(user, 'manage') &&
                ['PENDING', 'UNKNOWN'].includes(p.status) && (
                  <button
                    className="text-button"
                    disabled={!online}
                    onClick={() => setReconcile(p.id)}
                  >
                    Reconcile {p.id}
                  </button>
                ),
            },
          ]}
        />
      </section>
      <ReceiptTools key={`${sale.id}-receipt`} order={sale} reload={reload} />
      <Reversals key={`${sale.id}-reversals`} order={sale} reload={reload} />
      <section className="panel padded">
        <h2>Saved order events</h2>
        <Table
          rows={sale.events || []}
          columns={[
            { title: 'When', render: (e) => date(e.created_at) },
            { title: 'Action', render: (e) => e.action },
            { title: 'Actor', render: (e) => `${e.actor_kind} ${e.actor_id || ''}` },
            { title: 'Reason', render: (e) => e.reason || 'Not provided' },
          ]}
        />
      </section>
      {mode && (
        <SaleAction
          key={`${sale.id}-${mode}`}
          sale={sale}
          mode={mode}
          close={() => setMode(undefined)}
          inspect={inspect}
          mayPay={mayPay}
          reload={reload}
        />
      )}
      {reconcile && payments.data?.find((p) => p.id === reconcile) && (
        <ReconcilePayment
          key={reconcile}
          payment={payments.data.find((p) => p.id === reconcile)!}
          sale={sale}
          close={() => setReconcile(undefined)}
          reload={reload}
        />
      )}
    </>
  );
}
function SaleAction({
  sale,
  mode,
  close,
  inspect,
  mayPay,
  reload,
}: {
  sale: Sale;
  mode: 'payment' | 'cancel' | 'fulfill';
  close: () => void;
  inspect: (attempt: SaleAttempt) => Promise<boolean>;
  mayPay: boolean;
  reload: () => Promise<unknown>;
}) {
  const command = useSaleCommand(inspect);
  const [provider, setProvider] = useState('CASH');
  const title =
    mode === 'payment'
      ? 'Confirm payment recording'
      : mode === 'cancel'
        ? 'Release unpaid reserved stock'
        : 'Confirm fulfillment';
  return (
    <Modal
      title={title}
      close={() => {
        if (!command.pending && !command.blocked) close();
      }}
    >
      <p>
        Order {sale.id} · {saleMoney(sale.total_cents, sale.currency)}.{' '}
        {mode === 'cancel'
          ? 'Only an unpaid, unresolved-attempt-free reservation can be released.'
          : mode === 'fulfill'
            ? 'Confirm these goods have actually been handed over. This allows a later physical return request.'
            : 'Review the saved amount and choose how payment is recorded.'}
      </p>
      <SaleCommandFeedback command={command} />
      <Form
        pending={command.pending}
        disabled={command.blocked || !navigator.onLine || (mode === 'payment' && !mayPay)}
        submit={
          mode === 'payment'
            ? 'Confirm selected payment'
            : mode === 'cancel'
              ? 'Confirm reservation release'
              : 'Record goods handed over'
        }
        onSubmit={(data) =>
          void command.send(
            mode === 'payment'
              ? `/api/v1/checkout/orders/${sale.id}/payments`
              : `/api/orders/${sale.id}/${mode}`,
            () =>
              mode === 'payment'
                ? {
                    provider,
                    simulatorOutcome:
                      provider === 'SIMULATOR' ? str(data, 'simulatorOutcome') : null,
                  }
                : { reason: str(data, 'reason') },
            async () => {
              await reload();
              close();
            },
          )
        }
      >
        {mode === 'payment' ? (
          <>
            <Field label="Payment provider">
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="CASH">Cash — record received funds</option>
                <option value="MANUAL_TERMINAL">
                  External terminal — pending manual reconciliation
                </option>
                {import.meta.env.VITE_SHOW_PAYMENT_SIMULATOR === 'true' && (
                  <option value="SIMULATOR">Development simulator — no real funds</option>
                )}
              </select>
            </Field>
            <p>
              {provider === 'CASH'
                ? 'Confirm the customer’s cash has been received before submitting. This commits stock and records a successful cash payment.'
                : provider === 'MANUAL_TERMINAL'
                  ? 'Creates an UNKNOWN hold only. Use your external terminal separately; a manager must verify its result/reference. This app does not charge a card.'
                  : 'Development only. No funds move; the server must also explicitly enable its simulator.'}
            </p>
            {provider === 'SIMULATOR' && (
              <Field label="Simulator result">
                <select name="simulatorOutcome">
                  <option value="CONFIRMED">Confirmed (simulated)</option>
                  <option value="DECLINED">Declined (simulated)</option>
                  <option value="UNKNOWN">Unknown (held, requires reconciliation)</option>
                </select>
              </Field>
            )}
          </>
        ) : (
          <Input name="reason" label="Operation reason" maxLength={500} />
        )}
        <Field
          label={
            mode === 'payment'
              ? provider === 'CASH'
                ? 'I confirm the cash has actually been received'
                : 'I understand this provider’s recorded outcome and external verification requirements'
              : 'I confirm this operation and the saved branch'
          }
        >
          <input type="checkbox" required />
        </Field>
      </Form>
    </Modal>
  );
}
function ReconcilePayment({
  payment,
  sale,
  close,
  reload,
}: {
  payment: PaymentAttempt;
  sale: Sale;
  close: () => void;
  reload: () => Promise<{ sale: Sale; attempts: PaymentAttempt[] }>;
}) {
  const eventId = useRef(crypto.randomUUID());
  const [outcome, setOutcome] = useState('');
  const command = useSaleCommand(async () => {
    const fresh = await reload();
    return fresh.attempts.some(
      (p) => p.id === payment.id && ['PENDING', 'UNKNOWN'].includes(p.status),
    );
  });
  return (
    <Modal
      title="Management payment reconciliation"
      close={() => {
        if (!command.pending && !command.blocked) close();
      }}
    >
      <p>
        {payment.provider} · {saleMoney(payment.amount_cents, payment.currency)}. Verify the actual
        external result before choosing an outcome. Never release a hold just because a terminal
        timed out. If stock/batches have expired, a confirmed sale may be blocked; externally
        void/refund the terminal charge before recording VOIDED.
      </p>
      <SaleCommandFeedback command={command} />
      <Form
        pending={command.pending}
        disabled={command.blocked || !navigator.onLine}
        submit="Record verified payment outcome"
        onSubmit={(data) =>
          void command.send(
            `/api/v1/checkout/payments/${payment.id}/reconcile`,
            () => ({
              outcome,
              externalReference: externalReference(str(data, 'externalReference')),
              eventId: eventId.current,
            }),
            async () => {
              await reload();
              close();
            },
          )
        }
      >
        <Field label="Verified payment outcome">
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} required>
            <option value="">Choose verified outcome</option>
            <option value="CONFIRMED">Confirmed externally — complete sale</option>
            <option value="DECLINED">Verified unsuccessful — release stock</option>
            <option value="VOIDED">External void/refund verified — release stock</option>
          </select>
        </Field>
        <Input
          name="externalReference"
          label="Verified external transaction / void reference"
          maxLength={100}
        />
        <Field label="I verified the external outcome and reference">
          <input type="checkbox" required />
        </Field>
      </Form>
      <p className="form-hint">
        Sale {sale.id}. The original event and request IDs are retained for retries.
      </p>
    </Modal>
  );
}
