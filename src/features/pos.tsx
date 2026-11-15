import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import { useWorkspace } from '../app/workspace';
import { query, ApiError } from '../api/client';
import type { PosItem, Sale, SaleQuote } from '../api/checkout';
import type { Order } from '../api/types';
import type { ProductUnit } from '../api/catalogue';
import { basketPayload, safeAmount, saleMoney, type BasketLine } from '../lib/checkout';
import {
  ErrorBox,
  Feedback,
  Field,
  Form,
  Heading,
  Loading,
  Modal,
  Pager,
  str,
  Table,
  useAction,
  useApiQuery,
} from '../components/ui';
import { useSaleCommand, SaleCommandFeedback, useCheckoutConnection } from './sale-command';
import { SaleSummary } from './SaleSummary';
import { TaxSetupGuidance } from './onboarding';

function BasketEditor({
  line,
  change,
  remove,
  locked,
}: {
  line: BasketLine;
  change: (line: BasketLine) => void;
  remove: () => void;
  locked: boolean;
}) {
  const units = useApiQuery<ProductUnit[]>(`/api/v1/catalogue/products/${line.productId}/units`);
  return (
    <fieldset className="operation-line" disabled={locked}>
      <legend>
        {line.name} · {line.sku}
      </legend>
      <ErrorBox error={units.error} />
      <div className="form-grid">
        <Field label={`Sale unit for ${line.sku}`}>
          <select
            value={line.unitCode}
            onChange={(e) => change({ ...line, unitCode: e.target.value, quantity: '1' })}
          >
            <option value="BASE">Base unit ({line.baseUnit})</option>
            {units.data
              ?.filter((u) => u.sale_allowed)
              .map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code} · {u.factor} base units
                </option>
              ))}
          </select>
        </Field>
        <Field label={`Quantity for ${line.sku}`}>
          <input
            inputMode={line.unitCode === 'BASE' ? 'numeric' : 'decimal'}
            value={line.quantity}
            onChange={(e) => change({ ...line, quantity: e.target.value })}
          />
        </Field>
      </div>
      <button className="text-button danger-text" onClick={remove}>
        Remove {line.sku}
      </button>
    </fieldset>
  );
}
export function PosPage() {
  const { api, user } = useAuth();
  const { locationId, business, locations } = useWorkspace();
  const navigate = useNavigate();
  const { online, connectedAt } = useCheckoutConnection();
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [percent, setPercent] = useState('');
  const [reason, setReason] = useState('');
  const [review, setReview] = useState(false);
  const [notice, setNotice] = useState('');
  const [recent, setRecent] = useState<Order[]>();
  const scanInput = useRef<HTMLInputElement>(null);
  const scan = useAction();
  const command = useSaleCommand(async () => {
    setRecent(await api<Order[]>('/api/orders?limit=10&offset=0'));
    return true;
  });
  const locked = command.pending || command.blocked || !online;
  const catalogue = useApiQuery<PosItem[]>(
    '/api/v1/checkout/catalogue' + query({ locationId, search, limit: 24, offset }),
    !!locationId && online,
    true,
  );
  let payload: ReturnType<typeof basketPayload> | undefined;
  let validation = '';
  try {
    if (lines.length && locationId) payload = basketPayload(lines, locationId, percent, reason);
  } catch (error) {
    validation = (error as Error).message;
  }
  const quote = useQuery<SaleQuote>({
    queryKey: [
      user?.id,
      user?.businessId,
      user?.membershipId,
      'pos-quote',
      locationId,
      lines,
      percent,
      reason,
    ],
    queryFn: ({ signal }) => api<SaleQuote>('/api/orders/cart', 'POST', payload, false, signal),
    enabled: !!payload && online && !command.blocked,
    retry: false,
    refetchInterval: 15000,
  });
  useEffect(() => {
    if (online && payload) void quote.refetch();
  }, [online, connectedAt]);
  const canReserve =
    !!payload &&
    !!quote.data?.sufficientStock &&
    safeAmount(quote.data.total_cents) &&
    !quote.error &&
    !command.error &&
    quote.dataUpdatedAt >= connectedAt &&
    !quote.isFetching &&
    !locked &&
    !scan.pending;
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.repeat || document.querySelector('dialog[open]')) return;
      if (event.key === 'F2') {
        event.preventDefault();
        scanInput.current?.focus();
      }
      if (event.key === 'F8') {
        event.preventDefault();
        if (canReserve) setReview(true);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [canReserve]);
  function add(item: PosItem) {
    if (locked || lines.length >= 100) return;
    setNotice('');
    setLines((current) => {
      const existing = current.find((l) => l.productId === item.id);
      if (existing) {
        if (existing.unitCode !== 'BASE') {
          setNotice(
            `${item.sku} already uses a conversion unit. Review its basket quantity; this scan did not add another pack.`,
          );
          return current;
        }
        return current.map((l) =>
          l.productId === item.id ? { ...l, quantity: String(Number(l.quantity || '0') + 1) } : l,
        );
      }
      return [
        ...current,
        {
          productId: item.id,
          name: item.item_name,
          sku: item.sku,
          baseUnit: item.unit_of_measure,
          unitCode: 'BASE',
          quantity: '1',
        },
      ];
    });
  }
  return (
    <>
      <Heading
        eyebrow="ONLINE POINT OF SALE"
        title="Point of sale"
        description={`Branch: ${locations.find((l) => l.id === locationId)?.name || 'Choose a branch'} · F2 scan · F8 review checkout`}
      >
        <Link className="button secondary" to="/app/orders">
          Open saved orders
        </Link>
      </Heading>
      <TaxSetupGuidance />
      <p className="form-hint">
        Walk-in sale. No customer account is required; receipt email is optional after confirmed
        payment. Checkout does not currently support customer linkage.
      </p>
      {!review && <SaleCommandFeedback command={command} />}
      {recent && (
        <section className="panel padded">
          <h2>Recent orders for reconciliation</h2>
          <p>
            Do not identify an order solely by its total. Open the saved record, or retry the
            original reservation command with its unchanged ID.
          </p>
          <Table
            rows={recent}
            columns={[
              {
                title: 'Order',
                render: (o) => (
                  <Link className="text-link" to={`/app/orders/${o.id}`}>
                    {o.id}
                  </Link>
                ),
              },
              { title: 'Status', render: (o) => o.status },
              { title: 'Total', render: (o) => saleMoney(o.total_cents, o.currency) },
            ]}
          />
        </section>
      )}
      {!online && (
        <div className="notice danger" role="alert">
          Online checkout is unavailable. Reconnect and refresh server prices before reserving or
          paying.
        </div>
      )}
      <div className="pos-workbench">
        <section className="panel padded">
          <h2>Scan or find products</h2>
          <Feedback action={scan} />
          {notice && <p role="status">{notice}</p>}
          <Form
            pending={scan.pending}
            disabled={locked}
            submit="Add scanned product"
            onSubmit={(data) =>
              void scan.run(async () => {
                const found = await api<PosItem[]>(
                  '/api/v1/checkout/catalogue' +
                    query({ locationId, code: str(data, 'code'), limit: 2 }),
                );
                if (found.length !== 1)
                  throw new Error(
                    found.length
                      ? 'This code is ambiguous. Review catalogue codes.'
                      : 'No active sellable product matches this exact code.',
                  );
                add(found[0]);
                if (scanInput.current) {
                  scanInput.current.value = '';
                  scanInput.current.focus();
                }
              }, 'Product added or highlighted for review.')
            }
          >
            <Field label="Scan SKU or barcode">
              <input
                ref={scanInput}
                name="code"
                required
                autoFocus
                autoComplete="off"
                maxLength={255}
              />
            </Field>
          </Form>
          <form
            className="filters"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(str(new FormData(event.currentTarget), 'search'));
              setOffset(0);
            }}
          >
            <input
              name="search"
              aria-label="Search POS products"
              placeholder="Search name or SKU"
              maxLength={120}
            />
            <button className="button secondary">Find products</button>
          </form>
          <ErrorBox error={catalogue.error} />
          {catalogue.isLoading ? (
            <Loading />
          ) : (
            <div className="pos-products">
              {catalogue.data?.map((item) => (
                <button
                  className="pos-product"
                  key={item.id}
                  disabled={locked || lines.length >= 100}
                  onClick={() => add(item)}
                >
                  <strong>{item.item_name}</strong>
                  <span>{item.sku}</span>
                  <span>{saleMoney(item.price_cents, business?.currency || 'JMD')}</span>
                  <small>{item.available} saleable base units · tax confirmed in basket</small>
                </button>
              ))}
            </div>
          )}
          {catalogue.data?.length === 0 && (
            <p className="empty">
              No sellable products match. Add products and receive stock before making a sale.
            </p>
          )}
          <Pager
            size={24}
            count={catalogue.data?.length || 0}
            offset={offset}
            setOffset={setOffset}
          />
        </section>
        <section className="panel padded">
          <h2>Basket</h2>
          {!lines.length && (
            <p className="empty">Scan a product or choose it from the catalogue.</p>
          )}
          {lines.map((line) => (
            <BasketEditor
              key={line.productId}
              line={line}
              locked={locked}
              change={(next) =>
                setLines((rows) => rows.map((l) => (l.productId === next.productId ? next : l)))
              }
              remove={() => setLines((rows) => rows.filter((l) => l.productId !== line.productId))}
            />
          ))}
          {can(user, 'manage') && (
            <fieldset disabled={locked}>
              <details>
                <summary>Authorized manual discount</summary>
                <Field
                  label="Manual discount percentage"
                  hint="The greatest applicable automatic/manual percentage applies once, without stacking."
                >
                  <input
                    value={percent}
                    inputMode="decimal"
                    onChange={(e) => setPercent(e.target.value)}
                  />
                </Field>
                <Field label="Manual discount reason">
                  <textarea
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
              </details>
            </fieldset>
          )}
          {validation && (
            <div className="notice danger" role="alert">
              {validation}
            </div>
          )}
          <ErrorBox error={quote.error} />
          {quote.isFetching && <Loading text="Refreshing server prices and tax..." />}
          {quote.data && !validation && (
            <>
              <SaleSummary quote={quote.data} />
              {!quote.data.sufficientStock && (
                <div className="notice danger" role="alert">
                  Insufficient saleable stock. Reduce the quantity or receive stock; nothing has
                  been reserved.
                </div>
              )}
            </>
          )}
          <button
            className="button secondary small"
            disabled={!online || command.blocked || command.pending || !payload}
            onClick={() => {
              command.clear();
              void quote.refetch();
            }}
          >
            Refresh basket prices
          </button>
          <button className="button primary" disabled={!canReserve} onClick={() => setReview(true)}>
            Reserve & continue
          </button>
          <p className="form-hint">
            A price preview does not reserve stock. Checkout rechecks prices, tax, batch expiry and
            availability atomically.
          </p>
        </section>
      </div>
      {review && quote.data && (
        <Modal
          title="Review checkout reservation"
          close={() => {
            if (!command.pending) setReview(false);
          }}
        >
          <p>
            Reserve these goods at{' '}
            <strong>{locations.find((l) => l.id === locationId)?.name}</strong>? Review the final
            saved amounts again before confirming payment. No funds are processed by reserving.
          </p>
          <SaleSummary quote={quote.data} />
          <button
            className="button primary"
            disabled={!canReserve}
            onClick={() =>
              void command.send(
                '/api/orders',
                () => {
                  if (!online || !payload)
                    throw new Error('Refresh your online basket before checkout.');
                  return payload;
                },
                (response) => {
                  const order = response as Sale;
                  if (!order?.id)
                    throw new ApiError(
                      'Reservation result was incomplete. Check saved state before retrying.',
                      0,
                    );
                  navigate(`/app/orders/${order.id}`);
                },
              )
            }
          >
            Confirm reservation
          </button>
          {command.pending && <Loading text="Reserving stock..." />}
          {command.blocked && (
            <button className="button secondary" onClick={() => setReview(false)}>
              Return to reconciliation notice
            </button>
          )}
          <SaleCommandFeedback command={command} />
        </Modal>
      )}
    </>
  );
}
