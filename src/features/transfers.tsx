import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '../app/workspace';
import { query } from '../api/client';
import type { Transfer } from '../api/inventory';
import {
  Badge,
  ErrorBox,
  Field,
  Form,
  Heading,
  Input,
  Loading,
  Modal,
  Pager,
  str,
  Table,
  useApiQuery,
} from '../components/ui';
import {
  BranchName,
  InventoryFeedback,
  InventoryLinks,
  ProductName,
  ProductPicker,
  useInventoryCommand,
} from '../components/InventoryUI';
import { wholeQuantity } from '../lib/inventory';
import { date, shortId } from '../lib/format';

type Line = { id: string; productId: string; quantity: string; batchCode: string };
const newLine = (): Line => ({
  id: crypto.randomUUID(),
  productId: '',
  quantity: '1',
  batchCode: '',
});
export function TransfersPage() {
  const { locations } = useWorkspace();
  const [offset, setOffset] = useState(0);
  const [create, setCreate] = useState(false);
  const transfers = useApiQuery<Transfer[]>(
    '/api/v1/inventory/transfers' + query({ limit: 25, offset }),
    true,
    true,
  );
  return (
    <>
      <Heading
        title="Branch transfers"
        description="Request, dispatch, then receive. Both branches must be permitted by your membership."
      >
        <button
          className="button primary"
          disabled={locations.length < 2}
          onClick={() => setCreate(true)}
        >
          Request transfer
        </button>
      </Heading>
      <InventoryLinks />
      {locations.length < 2 && (
        <div className="notice info">
          Transfer creation needs two active permitted branches. Ask an Owner or Administrator to
          review branch setup/access.
        </div>
      )}
      <section className="panel">
        <ErrorBox error={transfers.error} />
        {transfers.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={transfers.data || []}
            columns={[
              {
                title: 'Transfer',
                render: (t) => (
                  <Link className="text-link" to={`/app/transfers/${t.id}`}>
                    Transfer {shortId(t.id)}
                  </Link>
                ),
              },
              { title: 'Source', render: (t) => <BranchName id={t.source_id} /> },
              { title: 'Destination', render: (t) => <BranchName id={t.destination_id} /> },
              { title: 'Status', render: (t) => <Badge value={t.status} /> },
              { title: 'Requested', render: (t) => date(new Date(t.created_ms).toISOString()) },
            ]}
          />
        )}
        <Pager offset={offset} count={transfers.data?.length || 0} setOffset={setOffset} />
      </section>
      {create && <TransferCreate close={() => setCreate(false)} />}
    </>
  );
}
function TransferCreate({ close }: { close: () => void }) {
  const { locations, locationId } = useWorkspace();
  const command = useInventoryCommand();
  const [source, setSource] = useState(String(locationId || ''));
  const [destination, setDestination] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  function edit(id: string, change: Partial<Line>) {
    setLines((rows) => rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }
  return (
    <Modal
      title="Request branch transfer"
      close={() => {
        if (!command.pending) close();
      }}
    >
      <p>
        A request does not reserve or move stock. Dispatch removes source stock/value and holds it
        in transit; receiving adds it at the destination. For tracked stock choose one explicit
        batch per product; move multiple batches in separate transfers.
      </p>
      <InventoryFeedback command={command} />
      <Form
        pending={command.pending}
        disabled={command.blocked}
        submit="Save transfer request"
        onSubmit={() =>
          void command.send(
            '/api/v1/inventory/transfers',
            () => {
              if (!source || !destination || source === destination)
                throw new Error('Choose two different permitted branches.');
              if (new Set(lines.map((l) => l.productId)).size !== lines.length)
                throw new Error('Choose each product once per transfer.');
              return {
                sourceId: +source,
                destinationId: +destination,
                lines: lines.map((l) => {
                  if (!l.productId) throw new Error('Choose a product for every line.');
                  return {
                    productId: l.productId,
                    quantity: wholeQuantity(l.quantity),
                    batchCode: l.batchCode.trim() || null,
                  };
                }),
              };
            },
            'Transfer requested. Open its detail to dispatch when goods leave.',
            close,
          )
        }
      >
        <Field label="Transfer source">
          <select value={source} required onChange={(e) => setSource(e.target.value)}>
            <option value="">Choose source</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Transfer destination">
          <select value={destination} required onChange={(e) => setDestination(e.target.value)}>
            <option value="">Choose destination</option>
            {locations
              .filter((l) => l.id !== +source)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        {lines.map((line, i) => (
          <fieldset className="operation-line span-2" key={line.id}>
            <legend>Transfer line {i + 1}</legend>
            <div className="form-grid">
              <ProductPicker
                label={`Transfer product ${i + 1}`}
                value={line.productId}
                change={(productId) => edit(line.id, { productId })}
              />
              <Field label={`Transfer base quantity ${i + 1}`}>
                <input
                  type="number"
                  min={1}
                  max={2147483647}
                  step={1}
                  required
                  value={line.quantity}
                  onChange={(e) => edit(line.id, { quantity: e.target.value })}
                />
              </Field>
              <Field label={`Source batch code ${i + 1} (if tracked)`}>
                <input
                  maxLength={80}
                  value={line.batchCode}
                  onChange={(e) => edit(line.id, { batchCode: e.target.value })}
                />
              </Field>
            </div>
            {lines.length > 1 && (
              <button
                className="text-button danger-text"
                type="button"
                onClick={() => setLines((rows) => rows.filter((l) => l.id !== line.id))}
              >
                Remove transfer line {i + 1}
              </button>
            )}
          </fieldset>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={lines.length >= 100}
          onClick={() => setLines((rows) => [...rows, newLine()])}
        >
          Add transfer line
        </button>
      </Form>
    </Modal>
  );
}
export function TransferDetail() {
  const { id } = useParams();
  const result = useApiQuery<Transfer>(`/api/v1/inventory/transfers/${id}`, true, true);
  const [mode, setMode] = useState<'dispatch' | 'receive' | 'cancel'>();
  const { business } = useWorkspace();
  if (result.isLoading) return <Loading />;
  if (!result.data) return <ErrorBox error={result.error} />;
  const transfer = result.data;
  return (
    <>
      <Link className="back-link" to="/app/transfers">
        Back to transfers
      </Link>
      <Heading
        title={`Transfer ${shortId(transfer.id)}`}
        description="In-transit goods remain separate from destination stock until receipt is posted."
      >
        <Badge value={transfer.status} />
        {transfer.status === 'REQUESTED' && (
          <>
            <button className="button primary" onClick={() => setMode('dispatch')}>
              Dispatch goods
            </button>
            <button className="button secondary" onClick={() => setMode('cancel')}>
              Cancel requested transfer
            </button>
          </>
        )}
        {['DISPATCHED', 'PARTIAL'].includes(transfer.status) && (
          <button className="button primary" onClick={() => setMode('receive')}>
            Receive transfer
          </button>
        )}
      </Heading>
      <InventoryLinks />
      <ErrorBox error={result.error} />
      <section className="panel padded">
        <h2>
          <BranchName id={transfer.source_id} /> → <BranchName id={transfer.destination_id} />
        </h2>
        <p>
          These branches are fixed for this transfer. Dispatch uses available source stock and its
          server-calculated acquisition value. A dispatched transfer cannot be cancelled;
          receive/reconcile the remaining goods.
        </p>
        <Table
          rows={transfer.lines || []}
          columns={[
            {
              title: 'Product / batch',
              render: (l) => (
                <>
                  <ProductName id={l.product_id} />
                  <p>
                    {l.batch_code || 'Untracked'} · {l.expires_on || 'No expiry'}
                  </p>
                </>
              ),
            },
            { title: 'Requested base units', render: (l) => l.quantity },
            { title: 'Received base units', render: (l) => l.received_quantity },
            { title: 'In transit (server)', render: (l) => l.in_transit_quantity },
            {
              title: 'In-transit value',
              render: (l) => `${business?.currency} ${l.in_transit_value}`,
            },
          ]}
        />
        <p className="form-hint">
          Received quantity is cumulative. Partial receipts preserve the server’s remaining transit
          value. Loss/write-off of missing in-transit stock cannot be automated here.
        </p>
      </section>
      {mode && (
        <TransferCommand
          key={`${transfer.id}-${mode}`}
          transfer={transfer}
          mode={mode}
          close={() => setMode(undefined)}
        />
      )}
    </>
  );
}
function TransferCommand({
  transfer,
  mode,
  close,
}: {
  transfer: Transfer;
  mode: 'dispatch' | 'receive' | 'cancel';
  close: () => void;
}) {
  const command = useInventoryCommand();
  return (
    <Modal
      title={
        mode === 'dispatch'
          ? 'Confirm transfer dispatch'
          : mode === 'cancel'
            ? 'Cancel transfer request'
            : 'Receive in-transit goods'
      }
      close={() => {
        if (!command.pending) close();
      }}
    >
      <p>
        {mode === 'dispatch'
          ? 'Confirm goods are leaving the source. Stock and value leave the source and become in transit.'
          : mode === 'cancel'
            ? 'Cancel this un-dispatched request? No stock has moved.'
            : 'Confirm quantities physically received at the destination, in whole base units. Leave untouched products blank.'}
      </p>
      <InventoryFeedback command={command} />
      <Form
        pending={command.pending}
        disabled={command.blocked}
        submit={
          mode === 'dispatch'
            ? 'Confirm dispatch'
            : mode === 'cancel'
              ? 'Confirm transfer cancellation'
              : 'Confirm transfer receipt'
        }
        onSubmit={(data) =>
          void command.send(
            `/api/v1/inventory/transfers/${transfer.id}/${mode}`,
            () => {
              if (mode !== 'receive') return {};
              const quantities = Object.fromEntries(
                (transfer.lines || [])
                  .filter((l) => str(data, l.product_id))
                  .map((l) => {
                    const qty = wholeQuantity(str(data, l.product_id));
                    if (qty > l.in_transit_quantity)
                      throw new Error(
                        'Receipt exceeds the displayed in-transit quantity. Reload and review.',
                      );
                    return [l.product_id, qty];
                  }),
              );
              if (!Object.keys(quantities).length)
                throw new Error('Enter a received quantity for at least one product.');
              return { quantities };
            },
            `Transfer ${mode} confirmed by the server.`,
            close,
          )
        }
      >
        {mode === 'receive' &&
          transfer.lines
            ?.filter((l) => l.in_transit_quantity > 0)
            .map((l) => (
              <div className="span-2" key={l.product_id}>
                <ProductName id={l.product_id} />
                <p>{l.in_transit_quantity} base units remain in transit.</p>
                <Input
                  name={l.product_id}
                  label={`Receive base units for ${l.product_id}`}
                  type="number"
                  min={1}
                  max={l.in_transit_quantity}
                  step="1"
                  required={false}
                />
              </div>
            ))}
        <Field label="I reviewed the transfer branches and quantities">
          <input type="checkbox" required />
        </Field>
      </Form>
    </Modal>
  );
}
