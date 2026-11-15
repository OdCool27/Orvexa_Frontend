import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import type { Reversal, Sale } from '../api/checkout';
import { saleMoney } from '../lib/checkout';
import { wholeQuantity } from '../lib/inventory';
import {
  Badge,
  ErrorBox,
  Field,
  Form,
  Input,
  Loading,
  Modal,
  str,
  Table,
  useApiQuery,
} from '../components/ui';
import { SaleCommandFeedback, useSaleCommand } from './sale-command';

export function externalReference(value: string) {
  if (!/^[A-Za-z0-9._:/-]{1,100}$/.test(value))
    throw new Error('Use 1–100 letters, numbers or . _ : / - for the external reference.');
  return value;
}
export function Reversals({ order, reload }: { order: Sale; reload: () => Promise<unknown> }) {
  const { user } = useAuth();
  const rows = useApiQuery<Reversal[]>(`/api/v1/checkout/orders/${order.id}/reversals`, true, true);
  const [request, setRequest] = useState(false);
  const [selected, setSelected] = useState<string>();
  const eligible =
    can(user, 'checkout') &&
    order.payment_state === 'CONFIRMED' &&
    ['COMPLETED', 'FULFILLED'].includes(order.status);
  return (
    <section className="panel padded">
      <div className="panel-heading">
        <h2>Returns and refunds</h2>
        {eligible && (
          <button
            className="button secondary"
            disabled={!!rows.error || rows.isPending}
            onClick={() => setRequest(true)}
          >
            Request return / refund
          </button>
        )}
      </div>
      <p>
        Request → management review → explicit refund confirmation. Refund-only does not restock; a
        resellable physical return restores historical stock/cost. Original sale receipts remain
        unchanged.
      </p>
      <ErrorBox error={rows.error} />
      {rows.isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={rows.data || []}
          columns={[
            {
              title: 'Request',
              render: (r) => (
                <button className="text-button" onClick={() => setSelected(r.id)}>
                  {r.type} {r.id}
                </button>
              ),
            },
            { title: 'Status', render: (r) => <Badge value={r.status} /> },
            { title: 'Recorded amount', render: (r) => saleMoney(r.amount_cents, order.currency) },
            { title: 'Reason', render: (r) => r.reason },
          ]}
        />
      )}
      {request && <ReversalRequest order={order} close={() => setRequest(false)} reload={reload} />}
      {selected && (
        <ReversalReview
          id={selected}
          order={order}
          close={() => setSelected(undefined)}
          reload={reload}
        />
      )}
    </section>
  );
}
function ReversalRequest({
  order,
  close,
  reload,
}: {
  order: Sale;
  close: () => void;
  reload: () => Promise<unknown>;
}) {
  const { api, user } = useAuth();
  const [type, setType] = useState('');
  const previous = useQuery({
    queryKey: [user?.id, user?.businessId, user?.membershipId, 'reversal-remaining', order.id],
    retry: false,
    queryFn: async ({ signal }) => {
      const rows = await api<Reversal[]>(
        `/api/v1/checkout/orders/${order.id}/reversals`,
        'GET',
        undefined,
        false,
        signal,
      );
      return Promise.all(
        rows
          .filter((r) => r.status !== 'REJECTED')
          .map((r) =>
            api<Reversal>(`/api/v1/checkout/reversals/${r.id}`, 'GET', undefined, false, signal),
          ),
      );
    },
  });
  const remaining = order.lines.map((line) => ({
    ...line,
    remaining:
      line.quantity -
      (previous.data || []).reduce(
        (sum, r) =>
          sum +
          (r.lines || [])
            .filter((l) => l.product_id === line.product_id)
            .reduce((qty, l) => qty + l.quantity, 0),
        0,
      ),
  }));
  const command = useSaleCommand(async () => {
    await reload();
    const result = await previous.refetch();
    if (result.error) throw result.error;
    return true;
  });
  return (
    <Modal
      title="Request an approved sale reversal"
      close={() => {
        if (!command.pending && !command.blocked) close();
      }}
    >
      <p>
        Quantities below are whole sold base units. Pending/approved/completed requests already
        consume their quantities; rejected requests do not. The server calculates the refundable
        amount from historical snapshots. No money or stock changes when requesting.
      </p>
      <SaleCommandFeedback command={command} />
      <ErrorBox error={previous.error} />
      <Form
        pending={command.pending}
        disabled={command.blocked || previous.isPending || !!previous.error}
        submit="Save reversal request"
        onSubmit={(data) =>
          void command.send(
            `/api/v1/checkout/orders/${order.id}/reversals`,
            () => {
              const lines = remaining
                .filter((l) =>
                  type === 'CANCEL' ? l.remaining > 0 : str(data, l.product_id || ''),
                )
                .map((l) => {
                  const quantity =
                    type === 'CANCEL' ? l.remaining : wholeQuantity(str(data, l.product_id || ''));
                  if (quantity > l.remaining)
                    throw new Error(
                      'Requested quantity exceeds the remaining sold units. Reload and review.',
                    );
                  return { productId: l.product_id, quantity };
                });
              if (!type || !lines.length)
                throw new Error('Choose a reversal type and at least one remaining sold unit.');
              return {
                type,
                reason: str(data, 'reason'),
                resellable: type === 'RETURN' && data.has('resellable'),
                lines,
              };
            },
            async () => {
              await reload();
              close();
            },
          )
        }
      >
        <Field label="Reversal type">
          <select required value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Choose explicitly</option>
            {order.status === 'FULFILLED' && (
              <option value="RETURN">Physical return with refund</option>
            )}
            <option value="REFUND">Refund only, no restocking</option>
            {order.status === 'COMPLETED' && (
              <option value="CANCEL">Cancel every remaining unfulfilled unit</option>
            )}
          </select>
        </Field>
        {previous.isPending && <Loading text="Checking remaining sold quantities..." />}
        {previous.isSuccess &&
          remaining.map((l) => (
            <div className="span-2" key={l.product_id}>
              <strong>
                {l.item_name} · {l.sku}
              </strong>
              <p>
                {l.remaining} of {l.quantity} sold base units remain available for a request.
              </p>
              {type !== 'CANCEL' && l.remaining > 0 && (
                <Input
                  name={l.product_id || ''}
                  label={`Reversal quantity for ${l.sku}`}
                  type="number"
                  min={1}
                  max={l.remaining}
                  step="1"
                  required={false}
                />
              )}
            </div>
          ))}
        {type === 'RETURN' && (
          <Field
            label="Returned goods are resellable"
            hint="Restores original allocated batches and historical value only after approved completion. Expired returned batches remain unsellable."
          >
            <input name="resellable" type="checkbox" />
          </Field>
        )}
        {type === 'CANCEL' && (
          <p>
            All remaining unfulfilled units will be included and restocked when management confirms
            completion.
          </p>
        )}
        <Field label="Reversal reason">
          <textarea required name="reason" maxLength={500} rows={3} />
        </Field>
      </Form>
    </Modal>
  );
}
function ReversalReview({
  id,
  order,
  close,
  reload,
}: {
  id: string;
  order: Sale;
  close: () => void;
  reload: () => Promise<unknown>;
}) {
  const { user } = useAuth();
  const row = useApiQuery<Reversal>(`/api/v1/checkout/reversals/${id}`, true, true);
  const [mode, setMode] = useState<'review' | 'complete'>();
  if (row.isLoading)
    return (
      <Modal title="Loading reversal" close={close}>
        <Loading />
      </Modal>
    );
  if (!row.data)
    return (
      <Modal title="Reversal unavailable" close={close}>
        <ErrorBox error={row.error} />
      </Modal>
    );
  const reversal = row.data;
  return (
    <Modal title={`${reversal.type} · ${reversal.status}`} close={close}>
      <ErrorBox error={row.error} />
      <p>{reversal.reason}</p>
      <p>
        Amount: <strong>{saleMoney(reversal.amount_cents, order.currency)}</strong> · Net{' '}
        {saleMoney(reversal.net_cents, order.currency)} · Tax{' '}
        {saleMoney(reversal.tax_cents, order.currency)} ·{' '}
        {reversal.type === 'CANCEL'
          ? 'Restores remaining unfulfilled stock'
          : reversal.resellable
            ? 'Resellable return'
            : 'No restocking'}
      </p>
      <Table
        rows={reversal.lines || []}
        columns={[
          {
            title: 'Product',
            render: (l) =>
              order.lines.find((o) => o.product_id === l.product_id)?.sku || l.product_id,
          },
          { title: 'Base quantity', render: (l) => l.quantity },
          { title: 'Saved line amount', render: (l) => saleMoney(l.total_cents, order.currency) },
        ]}
      />
      {can(user, 'manage') && reversal.status === 'REQUESTED' && (
        <button className="button secondary" onClick={() => setMode('review')}>
          Review reversal
        </button>
      )}
      {can(user, 'manage') && reversal.status === 'APPROVED' && (
        <button className="button primary" onClick={() => setMode('complete')}>
          Confirm refund / reversal completion
        </button>
      )}
      {reversal.status === 'COMPLETED' && (
        <p role="status">
          Completed using {reversal.refund_method}. External reference:{' '}
          {reversal.external_reference || 'Not required'}. The original receipt remains the original
          sale document.
        </p>
      )}
      {mode && (
        <ReversalDecision
          key={`${id}-${mode}`}
          reversal={reversal}
          order={order}
          mode={mode}
          close={() => setMode(undefined)}
          reload={async () => {
            await reload();
            const result = await row.refetch();
            if (result.error) throw result.error;
            return result.data;
          }}
        />
      )}
    </Modal>
  );
}
function ReversalDecision({
  reversal,
  order,
  mode,
  close,
  reload,
}: {
  reversal: Reversal;
  order: Sale;
  mode: 'review' | 'complete';
  close: () => void;
  reload: () => Promise<Reversal | undefined>;
}) {
  const [approve, setApprove] = useState('');
  const provider = order.payments.find((p) => p.successful)?.provider;
  const method =
    provider === 'CASH'
      ? 'CASH'
      : provider === 'MANUAL_TERMINAL'
        ? 'EXTERNAL_MANUAL'
        : provider === 'SIMULATOR'
          ? 'SIMULATED'
          : undefined;
  const command = useSaleCommand(async () => {
    const fresh = await reload();
    if (!fresh) throw new Error('Reversal state is unavailable.');
    return fresh.status === (mode === 'review' ? 'REQUESTED' : 'APPROVED');
  });
  return (
    <Modal
      title={mode === 'review' ? 'Management reversal review' : 'Confirm actual refund completion'}
      close={() => {
        if (!command.pending && !command.blocked) close();
      }}
    >
      <p>
        Original payment: {provider || 'Unavailable'} · Amount{' '}
        {saleMoney(reversal.amount_cents, order.currency)}.{' '}
        {mode === 'complete'
          ? 'This records confirmation; it does not send funds to a bank.'
          : 'Approval alone does not return funds or stock.'}
      </p>
      <SaleCommandFeedback command={command} />
      <Form
        pending={command.pending}
        disabled={
          command.blocked ||
          (mode === 'complete' && (!method || !Number.isSafeInteger(reversal.amount_cents)))
        }
        submit={mode === 'review' ? 'Save management decision' : 'Record confirmed refund'}
        onSubmit={(data) =>
          void command.send(
            `/api/v1/checkout/reversals/${reversal.id}/${mode === 'review' ? 'review' : 'complete'}`,
            () =>
              mode === 'review'
                ? { approve: approve === 'yes' }
                : {
                    confirmed: true,
                    method,
                    externalReference:
                      method === 'EXTERNAL_MANUAL'
                        ? externalReference(str(data, 'externalReference'))
                        : null,
                  },
            async () => {
              await reload();
              close();
            },
          )
        }
      >
        {mode === 'review' ? (
          <Field label="Management decision">
            <select value={approve} onChange={(e) => setApprove(e.target.value)} required>
              <option value="">Choose a decision</option>
              <option value="yes">Approve</option>
              <option value="no">Reject</option>
            </select>
          </Field>
        ) : (
          <>
            <p>
              {method === 'CASH'
                ? 'Confirm the cash refund has actually been given to the customer.'
                : method === 'EXTERNAL_MANUAL'
                  ? 'Verify the external terminal refund first, then record its reference.'
                  : method === 'SIMULATED'
                    ? 'Development simulation only; no funds are moved.'
                    : 'Original payment method is unavailable. Do not guess a refund method.'}
            </p>
            {method === 'EXTERNAL_MANUAL' && (
              <Input
                name="externalReference"
                label="External terminal refund reference"
                maxLength={100}
              />
            )}
          </>
        )}
        <Field
          label={
            mode === 'review'
              ? 'I reviewed the quantities, amount and stock-restocking choice'
              : 'I confirm the stated refund outcome and stock-restocking choice'
          }
        >
          <input type="checkbox" required />
        </Field>
      </Form>
    </Modal>
  );
}
