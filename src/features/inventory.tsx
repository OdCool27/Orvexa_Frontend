import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Plus, ScanLine } from 'lucide-react';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import { useWorkspace } from '../app/workspace';
import { CommandIds, query, saveDownload } from '../api/client';
import type { Count, OpeningImport, Product, Reason, Row, Stock } from '../api/types';
import {
  Badge,
  ErrorBox,
  Feedback,
  Field,
  Form,
  Heading,
  Input,
  Loading,
  Modal,
  num,
  Pager,
  str,
  Table,
  useAction,
  useApiQuery,
} from '../components/ui';
import { date, shortId } from '../lib/format';
import { ValuedAdjustment } from './inventory-operations';
import { InventoryLinks } from '../components/InventoryUI';
import { displayAverage } from '../lib/inventory';

export function Inventory() {
  const { api, user } = useAuth();
  const { locationId, business } = useWorkspace();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Stock>();
  const [mode, setMode] = useState<'OPENING' | 'MOVEMENT' | 'THRESHOLD' | null>(null);
  const [valued, setValued] = useState<{ productId?: string; locationId: number }>();
  const action = useAction();
  const ids = useRef(new CommandIds());
  const stock = useApiQuery<Stock[]>(
    '/api/inventory' + query({ locationId, ...filters, limit: 25, offset }),
    !!locationId,
    true,
  );
  const reasons = useApiQuery<Reason[]>('/api/inventory/reasons');
  const [productSearch, setProductSearch] = useState('');
  const products = useApiQuery<Product[]>(
    '/api/products' + query({ search: productSearch, limit: 200 }),
    mode === 'OPENING',
  );
  const [openingProduct, setOpeningProduct] = useState('');
  function open(next: typeof mode, row?: Stock) {
    ids.current.clear();
    action.clear();
    setSelected(row);
    setMode(next);
  }
  return (
    <>
      <Heading
        eyebrow="STOCK CONTROL"
        title="Inventory"
        description="Know what’s on hand, committed, and ready to sell."
      >
        {can(user, 'manage') && (
          <button
            className="button primary"
            disabled={!locationId}
            onClick={() => setValued({ locationId: locationId! })}
          >
            Receive / adjust stock
          </button>
        )}
        {can(user, 'manage') && (
          <button className="button secondary" onClick={() => open('OPENING')}>
            <Plus size={17} /> Opening stock
          </button>
        )}
      </Heading>
      <InventoryLinks />
      <p className="notice info">
        Opening balances and quantity-only receipts use catalogue-cost estimates. Use valued
        receiving for actual acquisition costs. Existing values can include estimates; their
        acquisition source is not available here.
      </p>
      {!mode && <Feedback action={action} />}
      <section className="panel">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
            setOffset(0);
          }}
        >
          <input name="search" placeholder="Search product or SKU…" aria-label="Search stock" />
          <select name="lowStock" aria-label="Low stock filter">
            <option value="">All stock levels</option>
            <option value="true">Low stock</option>
          </select>
          <label className="checkbox">
            <input type="checkbox" name="outOfStock" value="true" /> Out of stock only
          </label>
          <button className="button secondary">Apply filters</button>
          <button
            type="button"
            className="button secondary"
            disabled={action.pending || !locationId}
            onClick={() =>
              action.run(
                async () =>
                  saveDownload(
                    await api<Blob>(
                      '/api/reports/stock.csv' + query({ locationId }),
                      'GET',
                      undefined,
                      true,
                    ),
                    'stock-report.csv',
                  ),
                'Stock export downloaded.',
              )
            }
            hidden={!can(user, 'reports')}
          >
            <Download size={16} /> Export
          </button>
        </form>
        <ErrorBox error={stock.error} />
        {stock.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={stock.data || []}
            empty="No initialized stock at this location. Add opening stock for an existing product."
            columns={[
              {
                title: 'Product',
                render: (s) => (
                  <Link className="cell-stack" to={`/app/products/${s.product_id}`}>
                    <strong>{s.item_name}</strong>
                    <small>{s.sku}</small>
                  </Link>
                ),
              },
              { title: 'On hand', render: (s) => <strong>{s.quantity_on_hand}</strong> },
              { title: 'Reserved', render: (s) => s.quantity_reserved },
              {
                title: 'Available',
                render: (s) => (
                  <span className={s.low_stock ? 'danger-text' : 'quantity'}>
                    {s.available_quantity}
                  </span>
                ),
              },
              { title: 'Threshold', render: (s) => s.reorder_level },
              ...(can(user, 'reports')
                ? [
                    {
                      title: 'Recorded stock value',
                      render: (s: Stock) =>
                        s.stock_value == null
                          ? 'Unavailable'
                          : `${business?.currency} ${s.stock_value}`,
                    },
                    {
                      title: 'Display average / base unit',
                      render: (s: Stock) => {
                        const average = displayAverage(s.stock_value, s.quantity_on_hand);
                        return average == null
                          ? s.quantity_on_hand === 0
                            ? 'No on-hand units'
                            : 'Unavailable'
                          : `${business?.currency} ${average}`;
                      },
                    },
                  ]
                : []),
              {
                title: 'Status',
                render: (s) => (
                  <Badge
                    value={
                      s.available_quantity === 0
                        ? 'OUT_OF_STOCK'
                        : s.low_stock
                          ? 'LOW_STOCK'
                          : 'ACTIVE'
                    }
                  />
                ),
              },
              {
                title: 'Actions',
                render: (s) =>
                  can(user, 'manage') && (
                    <div className="actions inventory-row-actions">
                      <button
                        className="text-button"
                        onClick={() =>
                          setValued({ productId: s.product_id, locationId: locationId! })
                        }
                      >
                        Adjust valued stock
                      </button>
                      <button className="text-button" onClick={() => open('MOVEMENT', s)}>
                        Quantity-only movement
                      </button>
                      <button className="text-button" onClick={() => open('THRESHOLD', s)}>
                        Threshold
                      </button>
                    </div>
                  ),
              },
            ]}
          />
        )}
        <Pager offset={offset} count={stock.data?.length || 0} setOffset={setOffset} />
      </section>
      {can(user, 'reports') && (
        <p className="form-hint">
          The display average divides recorded server value by on-hand quantity, rounded to six
          places. It is a display ratio, not authoritative posted COGS. The server posts movement
          and sale costs. Saleable availability excludes expired batches.
        </p>
      )}
      {valued && <ValuedAdjustment {...valued} close={() => setValued(undefined)} />}
      {mode && (
        <Modal
          title={
            mode === 'OPENING'
              ? 'Enter opening stock'
              : mode === 'THRESHOLD'
                ? 'Set product reorder threshold'
                : `Stock movement · ${selected?.sku}`
          }
          close={() => {
            if (!action.pending) setMode(null);
          }}
        >
          <Feedback action={action} />
          {mode === 'THRESHOLD' && (
            <p className="muted">
              This is a business-wide product threshold. Saving applies it at every location; stock
              quantities are unchanged.
            </p>
          )}
          {mode === 'OPENING' && (
            <>
              <p className="muted">
                Opening quantities initialize untracked products with estimated catalogue costs. Use
                valued receiving for actual costs or tracked batches.
              </p>
              <Field label="Find product">
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search name or SKU"
                />
              </Field>
              <ErrorBox error={products.error} />
            </>
          )}
          <Form
            pending={action.pending}
            onSubmit={(data) =>
              action.run(
                async () => {
                  const product = mode === 'OPENING' ? openingProduct : selected!.product_id;
                  const path = `/api/inventory/${product}`;
                  const location = query({ locationId });
                  if (mode === 'THRESHOLD') {
                    await api(path + '/reorder-level' + location, 'PUT', {
                      reorderLevel: num(data, 'quantity'),
                    });
                    return;
                  }
                  const body =
                    mode === 'OPENING'
                      ? {
                          quantityOnHand: num(data, 'quantity'),
                          reorderLevel: num(data, 'reorderLevel'),
                          reason: str(data, 'reason'),
                          notes: str(data, 'notes') || null,
                        }
                      : {
                          type: str(data, 'type'),
                          quantity: num(data, 'quantity'),
                          reason: str(data, 'reason'),
                          notes: str(data, 'notes') || null,
                        };
                  const requestId = ids.current.for({ product, locationId, body, mode });
                  await api(path + (mode === 'MOVEMENT' ? '/movements' : '') + location, 'POST', {
                    ...body,
                    requestId,
                  });
                },
                'Inventory updated.',
                () => {
                  setMode(null);
                  ids.current.clear();
                },
              )
            }
          >
            {mode === 'OPENING' && (
              <div className="span-2">
                <Field label="Product">
                  <select
                    required
                    value={openingProduct}
                    onChange={(e) => setOpeningProduct(e.target.value)}
                  >
                    <option value="">Choose product</option>
                    {products.data
                      ?.filter((p) => p.productKind !== 'PARENT')
                      .map((p) => (
                        <option value={p.itemId} key={p.itemId}>
                          {p.sku} · {p.itemName}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
            )}
            {mode === 'MOVEMENT' && (
              <Field label="Movement type">
                <select name="type">
                  <option value="RECEIPT">Receipt · add units</option>
                  <option value="DAMAGE">Damage · remove units</option>
                  <option value="CORRECTION">Correction · signed change</option>
                </select>
              </Field>
            )}
            <Input
              name="quantity"
              label={
                mode === 'THRESHOLD'
                  ? 'Reorder level'
                  : mode === 'OPENING'
                    ? 'Opening quantity'
                    : 'Quantity / signed correction'
              }
              type="number"
              min={mode === 'MOVEMENT' ? undefined : 0}
              step="1"
              value={mode === 'THRESHOLD' ? selected?.reorder_level : undefined}
            />
            {mode === 'OPENING' && (
              <Input
                name="reorderLevel"
                label="Reorder level"
                type="number"
                min={0}
                step="1"
                value={business?.default_threshold ?? 3}
              />
            )}{' '}
            {mode !== 'THRESHOLD' && (
              <>
                <Field label="Reason">
                  <select
                    name="reason"
                    required
                    defaultValue={mode === 'OPENING' ? 'OPENING_COUNT' : 'RECEIPT'}
                  >
                    {reasons.data?.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Input name="notes" label="Notes (optional)" required={false} maxLength={500} />
                <p className="form-hint span-2">
                  Quantity-only receipts estimate value from catalogue cost. Use valued receiving
                  when acquisition cost is known. Receipts and damage use positive quantities.
                  Corrections use a nonzero signed change. Every movement is attributed to your
                  account.
                </p>
              </>
            )}
          </Form>
        </Modal>
      )}
    </>
  );
}
export function Movements() {
  const { locationId, business } = useWorkspace();
  const { user } = useAuth();
  const [offset, setOffset] = useState(0);
  const [productId, setProductId] = useState('');
  const result = useApiQuery<Row[]>(
    '/api/inventory/movements' + query({ locationId, productId, limit: 25, offset }),
    !!locationId,
  );
  return (
    <>
      <Heading
        eyebrow="TRACEABILITY"
        title="Stock movements"
        description="Every reservation, receipt, sale, and correction in one ledger."
      />
      <section className="panel">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setProductId(str(new FormData(e.currentTarget), 'product'));
            setOffset(0);
          }}
        >
          <input name="product" placeholder="Product UUID (optional)" aria-label="Product ID" />
          <button className="button secondary">Filter ledger</button>
        </form>
        <ErrorBox error={result.error} />
        {result.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={result.data || []}
            columns={[
              { title: 'When', render: (r) => date(r.created_at) },
              {
                title: 'Movement',
                render: (r) => (
                  <span className="cell-stack">
                    <strong>{String(r.movement_type)}</strong>
                    <small>{String(r.reason)}</small>
                  </span>
                ),
              },
              {
                title: 'Product',
                render: (r) => (
                  <Link to={`/app/products/${r.product_id}`}>{shortId(String(r.product_id))}</Link>
                ),
              },
              { title: 'On-hand Δ', render: (r) => String(r.delta_on_hand) },
              { title: 'Reserved Δ', render: (r) => String(r.delta_reserved) },
              {
                title: 'Balance',
                render: (r) => `${r.on_hand_after} on hand / ${r.reserved_after} reserved`,
              },
              {
                title: 'Actor',
                render: (r) => `${r.actor_kind}${r.actor_id ? ' #' + r.actor_id : ''}`,
              },
              ...(can(user, 'reports')
                ? [
                    {
                      title: 'Value delta / after',
                      render: (r: Row) =>
                        `${business?.currency} ${r.value_delta ?? 'Unavailable'} / ${r.value_after ?? 'Unavailable'}`,
                    },
                  ]
                : []),
              { title: 'Reference', render: (r) => String(r.reference_id || 'Not provided') },
              { title: 'Notes', render: (r) => String(r.notes || '—') },
            ]}
          />
        )}
        <Pager offset={offset} count={result.data?.length || 0} setOffset={setOffset} />
      </section>
    </>
  );
}
export function Counts() {
  const { api } = useAuth();
  const { locationId } = useWorkspace();
  const result = useApiQuery<Count[]>('/api/counts');
  const action = useAction();
  const navigate = useNavigate();
  return (
    <>
      <Heading
        eyebrow="INVENTORY ACCURACY"
        title="Stock counts"
        description="Count, save, review. Keep the shop running while you work."
      >
        <button
          className="button primary"
          disabled={action.pending || !locationId}
          onClick={() =>
            action.run(async () => {
              const c = await api<Count>('/api/counts', 'POST', { locationId });
              navigate('/app/counts/' + c.id);
            }, 'Count started.')
          }
        >
          <Plus size={17} /> Start count
        </button>
      </Heading>
      <Feedback action={action} />
      <section className="panel">
        <div className="panel-heading">
          <h2>Recent sessions</h2>
          <span className="muted">Up to 200 sessions · all locations</span>
        </div>
        <ErrorBox error={result.error} />
        {result.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={result.data || []}
            columns={[
              {
                title: 'Session',
                render: (c) => (
                  <Link className="text-link" to={'/app/counts/' + c.id}>
                    Count {shortId(c.id)}
                  </Link>
                ),
              },
              { title: 'Location', render: (c) => c.location_id },
              { title: 'Created', render: (c) => date(c.created_at) },
              { title: 'Status', render: (c) => <Badge value={c.status} /> },
              {
                title: '',
                render: (c) => (
                  <Link to={'/app/counts/' + c.id}>
                    {c.status === 'DRAFT' ? 'Resume count' : 'Review'}
                  </Link>
                ),
              },
            ]}
          />
        )}
      </section>
    </>
  );
}
export function CountDetail() {
  const { id } = useParams();
  const { api, user } = useAuth();
  const count = useApiQuery<Count>(`/api/counts/${id}`);
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  if (count.isLoading) return <Loading />;
  if (!count.data) return <ErrorBox error={count.error} />;
  const c = count.data;
  return (
    <>
      <Link className="back-link" to="/app/counts">
        <ArrowLeft size={16} /> Stock counts
      </Link>
      <Heading
        eyebrow={`LOCATION ${c.location_id}`}
        title={`Count ${shortId(c.id)}`}
        description="Stock remains sellable. Any balance changes after counting must be reviewed."
      >
        <Badge value={c.status} />
      </Heading>
      <InventoryLinks />
      {!confirm && <Feedback action={action} />}
      <section className="panel padded">
        <h2>Discrepancy review</h2>
        <p>
          {c.lines?.filter((l) => l.variance !== 0).length || 0} lines differ. Shortage:{' '}
          {(c.lines || []).reduce((sum, l) => sum + Math.max(0, -l.variance), 0)} base units.
          Overage: {(c.lines || []).reduce((sum, l) => sum + Math.max(0, l.variance), 0)} base
          units.
        </p>
        <p>
          These totals describe counted quantities, not financial loss. Tracked products require an
          explicit{' '}
          <Link className="text-link" to="/app/batches">
            batch count review
          </Link>
          ; select this count's branch in the header. Only untracked sellable products belong in
          aggregate counts.
        </p>
      </section>
      {c.status === 'DRAFT' && (
        <section className="panel padded">
          <div className="section-title">
            <ScanLine size={22} />
            <div>
              <h2>Scan or enter a product</h2>
              <p className="muted">
                Saving a code replaces its counted total; it does not add to it.
              </p>
            </div>
          </div>
          <Form
            pending={action.pending}
            submit="Save count line"
            onSubmit={(data) =>
              action.run(
                () =>
                  api(`/api/counts/${id}/lines`, 'PUT', {
                    code: str(data, 'code'),
                    quantity: num(data, 'quantity'),
                  }),
                'Count line saved.',
                () => {
                  if (input.current) {
                    input.current.value = '';
                    input.current.focus();
                  }
                },
              )
            }
          >
            <Field label="SKU or barcode">
              <input autoFocus ref={input} required name="code" autoComplete="off" />
            </Field>
            <Input name="quantity" label="Total counted" type="number" min={0} step="1" value={1} />
          </Form>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Counted products</h2>
          <span className="muted">{c.lines?.length || 0} lines</span>
        </div>
        <Table
          rows={c.lines || []}
          columns={[
            { title: 'SKU', render: (r) => r.sku },
            { title: 'Expected', render: (r) => r.expected_quantity },
            { title: 'Counted', render: (r) => r.counted_quantity },
            {
              title: 'Variance',
              render: (r) => (
                <strong className={r.variance ? 'danger-text' : 'quantity'}>
                  {r.variance > 0 ? '+' : ''}
                  {r.variance}
                </strong>
              ),
            },
          ]}
        />
        <div className="panel-footer actions">
          {c.status === 'DRAFT' && (
            <button
              className="button primary"
              disabled={action.pending || !c.lines?.length}
              onClick={() =>
                action.run(
                  () => api(`/api/counts/${id}/submit`, 'POST'),
                  'Count submitted for approval.',
                )
              }
            >
              Submit for approval
            </button>
          )}
          {c.status === 'SUBMITTED' && can(user, 'manage') && (
            <>
              <button
                className="button secondary"
                disabled={action.pending}
                onClick={() =>
                  action.run(
                    () => api(`/api/counts/${id}/reopen`, 'POST'),
                    'Count reopened. Recount and save affected lines before submitting.',
                  )
                }
              >
                Reopen to recount
              </button>
              <button className="button primary" onClick={() => setConfirm(true)}>
                Approve differences
              </button>
            </>
          )}
        </div>
      </section>
      {confirm && (
        <Modal
          title="Approve stock count"
          close={() => {
            if (!action.pending) setConfirm(false);
          }}
        >
          <p>
            Apply all reviewed count differences at location {c.location_id}? Approval fails if a
            counted balance changed or would fall below reserved stock.
          </p>
          <Feedback action={action} />
          <button
            className="button primary"
            disabled={action.pending}
            onClick={() =>
              action.run(
                () => api(`/api/counts/${id}/approve`, 'POST'),
                'Count approved and stock updated.',
                () => setConfirm(false),
              )
            }
          >
            Approve and update inventory
          </button>
        </Modal>
      )}
    </>
  );
}
export function Imports() {
  const { api } = useAuth();
  const { locationId } = useWorkspace();
  const [preview, setPreview] = useState<OpeningImport>();
  const [csv, setCsv] = useState('');
  const action = useAction();
  const [resume, setResume] = useState('');
  const errors = preview?.lines.some((l) => l.error);
  return (
    <>
      <Heading
        eyebrow="ONBOARD YOUR STOCK"
        title="Opening stock import"
        description="Preview first. Initialize quantities for products already in your catalog."
      >
        <button
          className="button secondary"
          disabled={action.pending}
          onClick={() =>
            action.run(
              async () =>
                saveDownload(
                  await api<Blob>('/api/imports/opening/template', 'GET', undefined, true),
                  'opening-stock.csv',
                ),
              'Template downloaded.',
            )
          }
        >
          <Download size={16} /> CSV template
        </button>
      </Heading>
      <Feedback action={action} />
      <div className="two-column">
        <section className="panel padded">
          <h2>1. Prepare your CSV</h2>
          <p className="muted">
            Exact columns: sku,quantity,reorderLevel. Up to 1,000 rows. Existing stock needs a count
            or movement.
          </p>
          <Field label="CSV file">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  action.run(async () => {
                    if (f.size > 1000000) throw new Error('CSV must be at most 1 MB.');
                    setCsv(await f.text());
                    setPreview(undefined);
                  }, 'CSV loaded. Review and preview.');
              }}
            />
          </Field>
          <Field label="CSV contents">
            <textarea
              className="csv-editor"
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview(undefined);
              }}
              placeholder={'sku,quantity,reorderLevel\nFILTER-001,10,3'}
            />
          </Field>
          <button
            className="button primary"
            disabled={action.pending || !csv || !locationId}
            onClick={() =>
              action.run(
                async () =>
                  setPreview(
                    await api<OpeningImport>('/api/imports/opening/preview', 'POST', {
                      locationId,
                      csv,
                    }),
                  ),
                'Preview created. No stock changed.',
              )
            }
          >
            Validate & preview
          </button>
        </section>
        <section className="panel padded">
          <h2>Resume a saved preview</h2>
          <p className="muted">
            Use the import ID from a previous preview to review its saved state.
          </p>
          <Field label="Import ID">
            <input value={resume} onChange={(e) => setResume(e.target.value)} />
          </Field>
          <button
            className="button secondary"
            disabled={!resume || action.pending}
            onClick={() =>
              action.run(
                async () =>
                  setPreview(
                    await api<OpeningImport>('/api/imports/opening/' + encodeURIComponent(resume)),
                  ),
                'Preview loaded.',
              )
            }
          >
            Load preview
          </button>
        </section>
      </div>
      {preview && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>2. Review preview</h2>
              <p className="muted">
                Import {preview.id} · Location {preview.location_id}
              </p>
            </div>
            <Badge value={preview.status} />
          </div>
          <Table
            rows={preview.lines}
            columns={[
              { title: 'Row', render: (l) => l.row_number },
              { title: 'SKU', render: (l) => l.sku },
              { title: 'Quantity', render: (l) => l.quantity ?? '—' },
              { title: 'Threshold', render: (l) => l.reorder_level ?? '—' },
              {
                title: 'Validation',
                render: (l) =>
                  l.error ? (
                    <span className="danger-text">{l.error}</span>
                  ) : (
                    <Badge value="VALID" />
                  ),
              },
            ]}
          />
          <div className="panel-footer">
            <p className="muted">
              {errors
                ? 'Fix row errors and create a new preview before committing.'
                : 'Commit revalidates every line and applies all quantities in one transaction.'}
            </p>
            <button
              className="button primary"
              disabled={!!errors || preview.status === 'COMMITTED' || action.pending}
              onClick={() =>
                action.run(
                  async () =>
                    setPreview(
                      await api<OpeningImport>(`/api/imports/opening/${preview.id}/commit`, 'POST'),
                    ),
                  'Opening stock committed.',
                )
              }
            >
              Commit opening stock
            </button>
          </div>
        </section>
      )}
    </>
  );
}
