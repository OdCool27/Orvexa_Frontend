import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '../app/workspace';
import type { PurchaseOrder, Supplier } from '../api/inventory';
import { query } from '../api/client';
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
  PurchaseUnitPicker,
  useInventoryCommand,
} from '../components/InventoryUI';
import { acquisitionCost, isoDate } from '../lib/inventory';
import { unitDecimal } from '../lib/catalogue';
import { date, shortId } from '../lib/format';

type Line = { id: string; productId: string; unit: string; quantity: string; unitCost: string };
const newLine = (): Line => ({
  id: crypto.randomUUID(),
  productId: '',
  unit: '',
  quantity: '1',
  unitCost: '0',
});
function PurchaseCreate({ suppliers, close }: { suppliers: Supplier[]; close: () => void }) {
  const { locationId } = useWorkspace();
  const [branch] = useState(locationId);
  const command = useInventoryCommand();
  const [lines, setLines] = useState<Line[]>([newLine()]);
  function edit(id: string, change: Partial<Line>) {
    setLines((rows) => rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }
  return (
    <Modal
      title="Create purchase order"
      close={() => {
        if (!command.pending) close();
      }}
    >
      <p>
        Receive at <strong>{branch && <BranchName id={branch} />}</strong>. This order records
        acquisition cost, separate from sales tax. Quantities use each selected purchase unit;
        Orvexa records its factor and total value.
      </p>
      <InventoryFeedback command={command} />
      <Form
        pending={command.pending}
        disabled={command.blocked || !branch}
        submit="Create purchase order"
        onSubmit={(data) =>
          void command.send(
            '/api/v1/purchasing/orders',
            () => {
              if (new Set(lines.map((l) => l.productId)).size !== lines.length)
                throw new Error('Choose each product once per purchase order.');
              return {
                locationId: branch,
                supplierId: str(data, 'supplierId'),
                lines: lines.map((l) => {
                  if (!l.productId || !l.unit)
                    throw new Error('Choose a product and purchase unit for every line.');
                  return {
                    productId: l.productId,
                    unit: l.unit,
                    quantity: unitDecimal(l.quantity, true),
                    unitCost: acquisitionCost(l.unitCost),
                  };
                }),
              };
            },
            'Purchase order created. Open it from the order list to receive goods.',
            close,
          )
        }
      >
        <Field label="Supplier">
          <select name="supplierId" required defaultValue="">
            <option value="">Choose an active supplier</option>
            {suppliers
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        {lines.map((line, i) => (
          <fieldset className="operation-line span-2" key={line.id}>
            <legend>Purchase line {i + 1}</legend>
            <div className="form-grid">
              <ProductPicker
                label={`Product ${i + 1}`}
                value={line.productId}
                change={(productId) => edit(line.id, { productId, unit: '' })}
              />
              <PurchaseUnitPicker
                label={`Purchase unit ${i + 1}`}
                product={line.productId}
                value={line.unit}
                change={(unit) => edit(line.id, { unit })}
              />
              <Field label={`Purchase quantity ${i + 1}`}>
                <input
                  required
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => edit(line.id, { quantity: e.target.value })}
                />
              </Field>
              <Field
                label={`Acquisition cost per purchase unit ${i + 1}`}
                hint="Business currency; up to six decimal places."
              >
                <input
                  required
                  inputMode="decimal"
                  value={line.unitCost}
                  onChange={(e) => edit(line.id, { unitCost: e.target.value })}
                />
              </Field>
            </div>
            {lines.length > 1 && (
              <button
                type="button"
                className="text-button danger-text"
                onClick={() => setLines((rows) => rows.filter((l) => l.id !== line.id))}
              >
                Remove purchase line {i + 1}
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
          Add purchase line
        </button>
      </Form>
    </Modal>
  );
}
export function PurchasingPage() {
  const { locationId } = useWorkspace();
  const [offset, setOffset] = useState(0);
  const [supplierOffset, setSupplierOffset] = useState(0);
  const orders = useApiQuery<PurchaseOrder[]>(
    '/api/v1/purchasing/orders' + query({ limit: 25, offset }),
  );
  const suppliers = useApiQuery<Supplier[]>(
    '/api/v1/purchasing/suppliers' + query({ limit: 200, offset: supplierOffset }),
  );
  const [create, setCreate] = useState(false);
  const [supplier, setSupplier] = useState(false);
  const command = useInventoryCommand();
  return (
    <>
      <Heading
        eyebrow="ACQUISITION & RECEIVING"
        title="Purchasing & suppliers"
        description="Orders across permitted branches. New orders use the active branch shown in the header."
      >
        <button
          className="button primary"
          disabled={!locationId || !suppliers.data?.some((s) => s.active)}
          onClick={() => setCreate(true)}
        >
          Create purchase order
        </button>
        <button className="button secondary" onClick={() => setSupplier(true)}>
          Add supplier
        </button>
      </Heading>
      <InventoryLinks />
      {!locationId && (
        <div className="notice info">
          Choose an active permitted branch before creating a purchase order.
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Purchase orders</h2>
        </div>
        <ErrorBox error={orders.error} />
        {orders.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={orders.data || []}
            columns={[
              {
                title: 'Order',
                render: (o) => (
                  <Link className="text-link" to={`/app/purchasing/${o.id}`}>
                    PO {shortId(o.id)}
                  </Link>
                ),
              },
              { title: 'Branch', render: (o) => <BranchName id={o.location_id} /> },
              { title: 'Currency', render: (o) => o.currency },
              { title: 'Status', render: (o) => <Badge value={o.status} /> },
              { title: 'Created', render: (o) => date(new Date(o.created_ms).toISOString()) },
            ]}
          />
        )}
        <Pager offset={offset} count={orders.data?.length || 0} setOffset={setOffset} />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Supplier directory</h2>
        </div>
        <ErrorBox error={suppliers.error} />
        {suppliers.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={suppliers.data || []}
            columns={[
              { title: 'Name', render: (s) => s.name },
              { title: 'Email', render: (s) => s.email || 'Not provided' },
              {
                title: 'Status',
                render: (s) => <Badge value={s.active ? 'ACTIVE' : 'INACTIVE'} />,
              },
            ]}
          />
        )}
        <Pager
          size={200}
          offset={supplierOffset}
          count={suppliers.data?.length || 0}
          setOffset={setSupplierOffset}
        />
        <p className="form-hint padded">
          Order creation uses the currently displayed supplier page. Supplier editing and
          deactivation are not available here.
        </p>
      </section>
      {create && <PurchaseCreate suppliers={suppliers.data || []} close={() => setCreate(false)} />}
      {supplier && (
        <Modal
          title="Add supplier"
          close={() => {
            if (!command.pending) setSupplier(false);
          }}
        >
          <InventoryFeedback command={command} />
          <Form
            pending={command.pending}
            disabled={command.blocked}
            submit="Save supplier"
            onSubmit={(data) =>
              void command.send(
                '/api/v1/purchasing/suppliers',
                { name: str(data, 'name'), email: str(data, 'email') || null },
                'Supplier saved.',
                () => setSupplier(false),
              )
            }
          >
            <Input name="name" label="Supplier name" maxLength={120} />
            <Input
              name="email"
              label="Supplier email (optional)"
              type="email"
              required={false}
              maxLength={120}
            />
          </Form>
        </Modal>
      )}
    </>
  );
}
export function PurchaseDetail() {
  const { id } = useParams();
  const order = useApiQuery<PurchaseOrder>(`/api/v1/purchasing/orders/${id}`, true, true);
  const { locationId } = useWorkspace();
  const [receive, setReceive] = useState(false);
  const [cancel, setCancel] = useState(false);
  if (order.isLoading) return <Loading />;
  if (!order.data) return <ErrorBox error={order.error} />;
  const po = order.data;
  return (
    <>
      <Link className="back-link" to="/app/purchasing">
        Back to purchasing
      </Link>
      <Heading
        title={`Purchase order ${shortId(po.id)}`}
        description={`Currency ${po.currency} · quantities and values come from the server.`}
      >
        <Badge value={po.status} />
        {['OPEN', 'PARTIAL'].includes(po.status) && (
          <button className="button primary" onClick={() => setReceive(true)}>
            Receive goods
          </button>
        )}
        {po.status === 'OPEN' && (
          <button className="button secondary" onClick={() => setCancel(true)}>
            Cancel unreceived order
          </button>
        )}
      </Heading>
      <InventoryLinks />
      <ErrorBox error={order.error} />
      <section className="panel padded">
        <h2>
          Receiving branch: <BranchName id={po.location_id} />
        </h2>
        {locationId !== po.location_id && (
          <div className="notice info">
            This order belongs to its receiving branch. Changing the header branch does not retarget
            this order.
          </div>
        )}
        <p>
          Supplier ID: {po.supplier_id}. Receipts add actual acquisition value; outgoing stock uses
          the branch’s current weighted-average basis on the server. Prior sales keep their
          historical cost snapshots.
        </p>
        <Table
          rows={po.lines || []}
          columns={[
            { title: 'Product', render: (l) => <ProductName id={l.product_id} /> },
            {
              title: 'Ordered purchase units',
              render: (l) => `${l.unit_quantity} ${l.unit_code} · factor ${l.factor}`,
            },
            {
              title: 'Base units ordered / received',
              render: (l) => `${l.ordered_quantity} / ${l.received_quantity}`,
            },
            {
              title: 'Base units remaining',
              render: (l) => l.ordered_quantity - l.received_quantity,
            },
            { title: 'Cost per purchase unit', render: (l) => `${po.currency} ${l.unit_cost}` },
            {
              title: 'Ordered / received value',
              render: (l) => `${po.currency} ${l.total_value} / ${l.received_value}`,
            },
          ]}
        />
      </section>
      <section className="panel padded">
        <h2>Goods receipt history</h2>
        <Table
          rows={po.receipts || []}
          columns={[
            { title: 'Receipt ID', render: (r) => r.id },
            { title: 'Recorded', render: (r) => date(new Date(r.created_ms).toISOString()) },
          ]}
        />
        <p className="form-hint">
          This view shows receipt IDs/dates and cumulative received quantities/value. Individual
          receipt lines are not available here; stock movement history retains the ledger changes.
        </p>
      </section>
      {receive && <PurchaseReceive key={po.id} order={po} close={() => setReceive(false)} />}
      {cancel && <PurchaseCancel order={po} close={() => setCancel(false)} />}
    </>
  );
}
function PurchaseReceive({ order, close }: { order: PurchaseOrder; close: () => void }) {
  const command = useInventoryCommand();
  return (
    <Modal
      title="Receive purchase-order goods"
      close={() => {
        if (!command.pending) close();
      }}
    >
      <p>
        Receive at <BranchName id={order.location_id} />. Enter quantities in each PO purchase unit,
        not base units. Leave unreceived lines blank. A tracked product needs its batch code; omit
        batch/expiry for untracked products. Existing batch expiry cannot change.
      </p>
      <InventoryFeedback command={command} />
      <Form
        pending={command.pending}
        disabled={command.blocked}
        submit="Confirm goods receipt"
        onSubmit={(data) =>
          void command.send(
            `/api/v1/purchasing/orders/${order.id}/receive`,
            () => {
              const lines = (order.lines || [])
                .filter((l) => str(data, `quantity-${l.product_id}`))
                .map((l) => ({
                  productId: l.product_id,
                  quantity: unitDecimal(str(data, `quantity-${l.product_id}`), true),
                  batchCode: str(data, `batch-${l.product_id}`) || null,
                  expiresOn: isoDate(str(data, `expiry-${l.product_id}`)),
                }));
              if (!lines.length) throw new Error('Enter a quantity for at least one product.');
              return { lines };
            },
            'Goods received. Remaining quantities and stock have been refreshed.',
            close,
          )
        }
      >
        {order.lines
          ?.filter((l) => l.received_quantity < l.ordered_quantity)
          .map((l) => (
            <fieldset className="operation-line span-2" key={l.product_id}>
              <legend>
                <ProductName id={l.product_id} />
              </legend>
              <p>
                {l.ordered_quantity - l.received_quantity} base units remain. Receipt unit:{' '}
                {l.unit_code}, snapshotted factor {l.factor}.
              </p>
              <div className="form-grid">
                <Input
                  name={`quantity-${l.product_id}`}
                  label={`Receive quantity (${l.unit_code})`}
                  required={false}
                />
                <Input
                  name={`batch-${l.product_id}`}
                  label="Receipt batch code (if tracked)"
                  required={false}
                  maxLength={80}
                />
                <Input
                  name={`expiry-${l.product_id}`}
                  label="Receipt expiry date (optional)"
                  type="date"
                  required={false}
                />
              </div>
            </fieldset>
          ))}
        <p className="form-hint span-2">
          Receipt quantities and acquisition values are validated and posted atomically. The final
          receipt consumes the exact remaining value on the server. Over-receiving is rejected.
        </p>
      </Form>
    </Modal>
  );
}
function PurchaseCancel({ order, close }: { order: PurchaseOrder; close: () => void }) {
  const command = useInventoryCommand();
  return (
    <Modal
      title="Cancel purchase order"
      close={() => {
        if (!command.pending) close();
      }}
    >
      <p>
        Cancel unreceived order {shortId(order.id)} at <BranchName id={order.location_id} />? Only
        completely unreceived OPEN orders can be cancelled.
      </p>
      <InventoryFeedback command={command} />
      <button
        className="button danger-button"
        disabled={command.pending || command.blocked}
        onClick={() =>
          void command.send(
            `/api/v1/purchasing/orders/${order.id}/cancel`,
            {},
            'Purchase order cancelled.',
            close,
          )
        }
      >
        Confirm order cancellation
      </button>
    </Modal>
  );
}
