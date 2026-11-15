import { TaxSetupGuidance } from './onboarding';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Download,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import type { Workspace } from '../app/workspace';
import { Brand } from '../components/Brand';
import { ApiError, CommandIds, query, request, saveDownload } from '../api/client';
import type { Cart, CartLine, Order, Product, PublicProduct } from '../api/types';
import {
  Badge,
  Empty,
  ErrorBox,
  Feedback,
  Field,
  Form,
  Heading,
  Input,
  Loading,
  Modal,
  Pager,
  str,
  Table,
  useAction,
  useApiQuery,
} from '../components/ui';
import { date, majorToCents, money, shortId } from '../lib/format';

interface Item {
  id: string;
  name: string;
  sku: string;
  price: number;
  available?: number;
}
const tokenKey = (business: string, id: string) => `osyntra:order:${business}:${id}`;
const cartKey = (business: string) => `osyntra:cart:${business}`;
function loadCart(business: string): CartLine[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(cartKey(business)) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter(
          (l): l is CartLine =>
            typeof l.productId === 'string' && Number.isInteger(l.quantity) && l.quantity > 0,
        )
      : [];
  } catch {
    return [];
  }
}
function publicToken(business: string, id: string) {
  try {
    return sessionStorage.getItem(tokenKey(business, id)) || undefined;
  } catch {
    return undefined;
  }
}
function rememberedOrders(business: string) {
  try {
    return Object.keys(sessionStorage)
      .filter((k) => k.startsWith(`osyntra:order:${business}:`))
      .map((k) => k.split(':').at(-1)!)
      .slice(-5);
  } catch {
    return [];
  }
}
function PublicHeader({ businessId }: { businessId?: string }) {
  return (
    <header className="public-header">
      <Brand />
      <nav>
        <Link to={businessId ? `/store/${businessId}` : '/store'}>Shop</Link>
        {businessId && (
          <Link to={`/store/${businessId}/cart`}>
            <ShoppingCart size={17} /> Cart
          </Link>
        )}
        <Link to="/login" className="button secondary small">
          Employee sign in <ArrowRight size={15} />
        </Link>
      </nav>
    </header>
  );
}
export function StoreEntry() {
  const navigate = useNavigate();
  const ids = String(import.meta.env.VITE_DEMO_BUSINESS_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="public-page">
      <PublicHeader />
      <main className="store-container">
        <div className="store-hero">
          <span className="overline">THE ORVEXA STOREFRONT</span>
          <h1>
            Find what you need.
            <br />
            <em>See what’s in stock.</em>
          </h1>
          <p>Open a demo business storefront using its numeric business ID.</p>
        </div>
        <section className="panel padded narrow">
          <Form
            submit="Open storefront"
            onSubmit={(data) => navigate('/store/' + str(data, 'business'))}
          >
            <Input type="number" min={1} step="1" name="business" label="Business ID" />
          </Form>
          <p className="muted">
            Find business IDs in the operator workspace. Each storefront uses its business’s first
            active location.
          </p>
          {ids.map((id) => (
            <Link className="button secondary" key={id} to={'/store/' + id}>
              Business {id} <ArrowRight size={16} />
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
export function Storefront() {
  const { businessId = '' } = useParams();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [cart, setCart] = useState(() => loadCart(businessId));
  const [notice, setNotice] = useState('');
  const action = useAction();
  const [currency, setCurrency] = useState<string>();
  const result = useQuery({
    queryKey: ['public', businessId, 'products', filters, offset],
    queryFn: () =>
      request<PublicProduct[]>(
        `/api/storefront/${businessId}/products` + query({ ...filters, limit: 24, offset }),
      ),
    refetchInterval: 15000,
  });
  useEffect(() => {
    setCart(loadCart(businessId));
    setCurrency(undefined);
    setOffset(0);
  }, [businessId]);
  async function add(p: PublicProduct) {
    await action.run(async () => {
      const next = cart.map((line) => ({ ...line }));
      const existing = next.find((l) => l.productId === p.id);
      if (existing) existing.quantity++;
      else next.push({ productId: p.id, quantity: 1 });
      const preview = await request<Cart>(`/api/storefront/${businessId}/cart`, {
        method: 'POST',
        body: { lines: next },
      });
      sessionStorage.setItem(cartKey(businessId), JSON.stringify(next));
      setCart(next);
      setCurrency(preview.currency);
      setNotice(`${p.name} added to cart.`);
    }, '');
  }
  return (
    <div className="public-page">
      <PublicHeader businessId={businessId} />
      <main className="store-container">
        <div className="store-hero">
          <div>
            <span className="overline">BUSINESS {businessId} · LOCAL DEMO</span>
            <h1>
              The right part.
              <br />
              <em>A confident start.</em>
            </h1>
            <p>
              Search products and recorded vehicle compatibility.
              <br />
              Live availability, shared with the store.
            </p>
          </div>
          <Boxes size={150} strokeWidth={0.8} />
        </div>
        <div className="store-toolbar">
          <div>
            <h2>Explore the catalog</h2>
            <p className="muted">Payments are simulated. No real funds are processed.</p>
          </div>
          <Link className="button primary" to={`/store/${businessId}/cart`}>
            <ShoppingBag size={17} /> Cart · {cart.reduce((s, l) => s + l.quantity, 0)}
          </Link>
        </div>
        <section className="panel">
          <form
            className="filters"
            onSubmit={(e) => {
              e.preventDefault();
              setFilters(
                Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>,
              );
              setOffset(0);
            }}
          >
            <div className="search-field">
              <Search size={17} />
              <input
                name="search"
                placeholder="Search products or SKU…"
                aria-label="Search storefront"
              />
            </div>
            <input name="make" placeholder="Vehicle make" aria-label="Make" />
            <input name="model" placeholder="Model" aria-label="Model" />
            <input
              name="year"
              type="number"
              min={1886}
              max={2200}
              placeholder="Year"
              aria-label="Year"
            />
            <button className="button secondary">Find products</button>
            <details className="advanced-filter">
              <summary>Engine, trim, category & barcode</summary>
              <div className="filters">
                <input name="engine" placeholder="Engine (if known)" aria-label="Engine" />
                <input name="trim" placeholder="Trim (if known)" aria-label="Trim" />
                <input name="category" placeholder="Category name" aria-label="Category name" />
                <input name="barcode" placeholder="Exact barcode" aria-label="Exact barcode" />
              </div>
            </details>
          </form>
        </section>
        <Feedback action={action} />
        {notice && (
          <div className="notice success" role="status">
            {notice} <Link to={`/store/${businessId}/cart`}>View cart →</Link>
          </div>
        )}
        <ErrorBox error={result.error} />
        {result.isLoading ? (
          <Loading />
        ) : result.data?.length ? (
          <div className="product-grid">
            {result.data.map((p) => (
              <article className="store-product" key={p.id}>
                <div className="store-product-art">
                  <Package size={65} strokeWidth={1} />
                  <Badge value={p.available > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK'} />
                </div>
                <div className="store-product-info">
                  <small className="overline">
                    {p.category || 'PRODUCT'} · {p.sku}
                  </small>
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                  <span className="availability">
                    {p.available} available · {p.unitOfMeasure}
                  </span>
                  <div className="store-product-bottom">
                    <strong>
                      {currency
                        ? money(majorToCents(p.price), currency)
                        : Number(p.price).toFixed(2)}
                    </strong>
                    <button
                      className="button primary small"
                      disabled={p.available < 1 || action.pending}
                      onClick={() => add(p)}
                    >
                      <Plus size={16} /> Add to cart
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          !result.error && (
            <Empty text="No matching products. Adjust your search or check the business ID." />
          )
        )}
        {!currency && !!result.data?.length && (
          <p className="muted">
            Catalog amounts are shown in business currency. The cart confirms the currency and
            authoritative total.
          </p>
        )}
        <Pager offset={offset} count={result.data?.length || 0} size={24} setOffset={setOffset} />
        {rememberedOrders(businessId).length > 0 && (
          <section className="panel padded">
            <h2>Your orders in this tab</h2>
            <div className="actions">
              {rememberedOrders(businessId).map((id) => (
                <Link
                  className="button secondary small"
                  key={id}
                  to={`/store/${businessId}/orders/${id}`}
                >
                  #{shortId(id)}
                </Link>
              ))}
            </div>
          </section>
        )}
        <footer className="public-footer">
          Structured compatibility only · Demo fixtures are not manufacturer guarantees
        </footer>
      </main>
    </div>
  );
}
export function Checkout({ publicStore = false }: { publicStore?: boolean }) {
  const { businessId = '' } = useParams();
  const context = useOutletContext<Workspace | undefined>();
  const { user } = useAuth();
  return (
    <>
      {!publicStore && <TaxSetupGuidance />}
      <CheckoutInner
        key={publicStore ? `public-${businessId}` : `${user?.id}-${context?.locationId}`}
        publicStore={publicStore}
        businessId={businessId}
        context={context}
      />
    </>
  );
}
function CheckoutInner({
  publicStore,
  businessId,
  context,
}: {
  publicStore: boolean;
  businessId: string;
  context?: Workspace;
}) {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [lines, setLines] = useState<CartLine[]>(() => (publicStore ? loadCart(businessId) : []));
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<Order>();
  const action = useAction();
  const ids = useRef(new CommandIds());
  const [uncertain, setUncertain] = useState(false);
  const [started, setStarted] = useState(false);
  const locationId = context?.locationId;
  const base = publicStore ? `/api/storefront/${businessId}` : '/api/orders';
  const products = useQuery({
    queryKey: ['checkout-products', publicStore, businessId, locationId, search],
    queryFn: async (): Promise<Item[]> =>
      publicStore
        ? (
            await request<PublicProduct[]>(
              `/api/storefront/${businessId}/products` + query({ search, limit: 24 }),
            )
          ).map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: p.price,
            available: p.available,
          }))
        : (await api<Product[]>('/api/products' + query({ search, limit: 24 }))).map((p) => ({
            id: p.itemId,
            name: p.itemName,
            sku: p.sku,
            price: p.unitPrice,
          })),
    enabled: !publicStore,
  });
  const cart = useQuery({
    queryKey: ['cart', publicStore, businessId, locationId, lines],
    queryFn: () =>
      publicStore
        ? request<Cart>(base + '/cart', { method: 'POST', body: { lines } })
        : api<Cart>(base + '/cart', 'POST', { locationId, lines }),
    enabled: lines.length > 0,
    refetchInterval: 15000,
  });
  function change(next: CartLine[]) {
    if (order || uncertain || action.pending) return;
    setLines(next);
    ids.current.clear();
    if (publicStore)
      try {
        sessionStorage.setItem(cartKey(businessId), JSON.stringify(next));
      } catch {
        action.run(async () => {
          throw new Error('Tab storage is unavailable. Enable session storage before checkout.');
        });
      }
  }
  function add(id: string) {
    const existing = lines.find((l) => l.productId === id);
    change(
      existing
        ? lines.map((l) => (l.productId === id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...lines, { productId: id, quantity: 1 }],
    );
  }
  async function scan(data: FormData) {
    const code = str(data, 'code');
    await action.run(async () => {
      const barcode = await api<Product[]>('/api/products' + query({ barcode: code, limit: 200 }));
      if (barcode.length) {
        add(barcode[0].itemId);
        return;
      }
      let offset = 0;
      while (true) {
        const list = await api<Product[]>(
          '/api/products' + query({ search: code, limit: 200, offset }),
        );
        const found = list.find((p) => p.sku === code);
        if (found) {
          add(found.itemId);
          return;
        }
        if (list.length < 200) break;
        offset += 200;
      }
      throw new Error('No active product matches this exact SKU or barcode.');
    }, 'Product added.');
  }
  async function reserve() {
    setStarted(true);
    await action.run(async () => {
      const payload = { ...(publicStore ? {} : { locationId }), lines };
      const requestId = ids.current.for({ base, ...payload });
      let created: Order;
      try {
        created = publicStore
          ? await request<Order>(base + '/orders', {
              method: 'POST',
              body: { ...payload, requestId },
            })
          : await api<Order>('/api/orders', 'POST', { ...payload, requestId });
      } catch (error) {
        if (
          publicStore &&
          (!(error instanceof ApiError) || error.status === 0 || error.status >= 500)
        )
          setUncertain(true);
        throw error;
      }
      if (publicStore) {
        try {
          if (!created.accessToken)
            throw new Error('Checkout did not return an order access token.');
          sessionStorage.setItem(tokenKey(businessId, created.id), created.accessToken);
          sessionStorage.removeItem(cartKey(businessId));
        } catch {
          setOrder(created);
          setUncertain(true);
          throw new Error(
            'The order was reserved but its access token could not be saved. Keep this page open and contact staff, or let the five-minute reservation expire.',
          );
        }
        navigate(`/store/${businessId}/orders/${created.id}`);
      } else {
        setOrder(created);
        setLines([]);
      }
    }, 'Stock reserved for five minutes.');
  }
  const body = (
    <>
      <Heading
        eyebrow={publicStore ? 'SIMULATED ONLINE CHECKOUT' : 'COUNTER WORKSPACE'}
        title={publicStore ? 'Your cart' : 'Point of sale'}
        description={
          publicStore
            ? 'Confirm live availability, then simulate your payment.'
            : 'Scan a product, build the cart, and complete a simulated sale.'
        }
      >
        {publicStore && (
          <Link className="button secondary" to={`/store/${businessId}`}>
            <ArrowLeft size={16} /> Keep shopping
          </Link>
        )}
      </Heading>
      <Feedback action={action} />
      {uncertain && (
        <div className="notice danger" role="alert">
          The checkout result is uncertain. A reservation may exist. Avoid submitting another order;
          wait at least five minutes for stock release or ask staff for assistance.
        </div>
      )}
      {order ? (
        <>
          <OrderPanel
            order={order}
            publicStore={publicStore}
            businessId={businessId}
            onChanged={setOrder}
          />
          {!publicStore && (
            <div className="actions panel-footer">
              <Link to={'/app/orders/' + order.id} className="button secondary">
                Open order
              </Link>
              {order.status !== 'RESERVED' && (
                <button
                  className="button primary"
                  onClick={() => {
                    setOrder(undefined);
                    setStarted(false);
                    ids.current.clear();
                  }}
                >
                  Start another sale
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className={publicStore ? 'checkout-public' : 'checkout-grid'}>
          {!publicStore && (
            <section className="panel padded">
              <h2>Find a product</h2>
              <form
                className="scan-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  scan(new FormData(form)).then(() => form.reset());
                }}
              >
                <Field label="Scan SKU or barcode">
                  <input
                    name="code"
                    required
                    autoFocus
                    autoComplete="off"
                    placeholder="Scan, then Enter"
                    disabled={action.pending}
                  />
                </Field>
                <button className="button secondary" disabled={action.pending}>
                  Add exact code
                </button>
              </form>
              <div className="search-field">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products…"
                  aria-label="Search POS products"
                />
              </div>
              <ErrorBox error={products.error} />
              <div className="pos-products">
                {products.data?.map((p) => (
                  <button key={p.id} disabled={action.pending} onClick={() => add(p.id)}>
                    <span className="product-icon">
                      <Package size={20} />
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.sku}</small>
                    </span>
                    <Plus size={17} />
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="panel cart-panel">
            <div className="panel-heading">
              <h2>Current cart</h2>
              <Badge value={publicStore ? 'ONLINE' : 'POS'} />
            </div>
            <ErrorBox error={cart.error} />
            {!lines.length ? (
              <Empty text="Your cart is empty. Add a product to get started." />
            ) : cart.isLoading ? (
              <Loading />
            ) : (
              <div className="cart-lines">
                {lines.map((l) => {
                  const server = cart.data?.lines.find((s) => s.id === l.productId);
                  return (
                    <div className="cart-line" key={l.productId}>
                      <div>
                        <strong>{server?.item_name || shortId(l.productId)}</strong>
                        <small>
                          {server?.sku} · {server?.available ?? '—'} available
                        </small>
                        {server && (
                          <small>{money(server.price_cents, cart.data?.currency)} each</small>
                        )}
                      </div>
                      <div className="quantity-control">
                        <button
                          aria-label="Decrease quantity"
                          disabled={action.pending}
                          onClick={() =>
                            change(
                              lines.map((x) =>
                                x.productId === l.productId
                                  ? { ...x, quantity: Math.max(1, x.quantity - 1) }
                                  : x,
                              ),
                            )
                          }
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          aria-label={`Quantity ${server?.sku || l.productId}`}
                          value={l.quantity}
                          type="number"
                          min={1}
                          max={100000}
                          step="1"
                          disabled={action.pending}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isInteger(n) && n > 0 && n <= 100000)
                              change(
                                lines.map((x) =>
                                  x.productId === l.productId ? { ...x, quantity: n } : x,
                                ),
                              );
                          }}
                        />
                        <button
                          aria-label="Increase quantity"
                          disabled={action.pending}
                          onClick={() => add(l.productId)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${server?.sku || 'product'}`}
                        disabled={action.pending}
                        onClick={() => change(lines.filter((x) => x.productId !== l.productId))}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="cart-total">
              <span>Total</span>
              <strong>
                {cart.data && lines.length ? money(cart.data.total_cents, cart.data.currency) : '—'}
              </strong>
            </div>
            {cart.data && !cart.data.sufficientStock && (
              <div className="notice danger">
                Some quantities exceed available stock. Adjust the cart before checkout.
              </div>
            )}
            <div className="padded">
              <button
                className="button primary full"
                disabled={
                  !lines.length ||
                  !cart.data?.sufficientStock ||
                  cart.isFetching ||
                  action.pending ||
                  uncertain ||
                  (!publicStore && !locationId)
                }
                onClick={reserve}
              >
                {action.pending
                  ? 'Reserving…'
                  : started
                    ? 'Retry same checkout'
                    : 'Reserve & continue'}
                <ArrowRight size={17} />
              </button>
              <p className="form-hint">
                A cart does not reserve stock. Checkout reserves for five minutes. All payments are
                simulated.
              </p>
            </div>
          </section>
        </div>
      )}
    </>
  );
  return publicStore ? (
    <div className="public-page">
      <PublicHeader businessId={businessId} />
      <main className="store-container">{body}</main>
    </div>
  ) : (
    body
  );
}
function OrderPanel({
  order: initialOrder,
  publicStore = false,
  businessId = '',
  onChanged,
}: {
  order: Order;
  publicStore?: boolean;
  businessId?: string;
  onChanged?: (o: Order) => void;
}) {
  const { api, user } = useAuth();
  const cache = useQueryClient();
  const action = useAction();
  const ids = useRef(new CommandIds());
  const [confirm, setConfirm] = useState<'cancel' | 'fulfill' | 'return' | 'refund' | null>(null);
  const [method, setMethod] = useState('CASH');
  const [outcome, setOutcome] = useState('true');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const base = publicStore
    ? `/api/storefront/${businessId}/orders/${initialOrder.id}`
    : `/api/orders/${initialOrder.id}`;
  const token = publicToken(businessId, initialOrder.id);
  const live = useQuery({
    queryKey: ['order-panel', publicStore, businessId, initialOrder.id],
    queryFn: () => (publicStore ? request<Order>(base, { token }) : api<Order>(base)),
    initialData: initialOrder,
    refetchInterval: 10000,
  });
  const order = live.data;
  async function send(command: string, body: Record<string, unknown>) {
    const payload = { ...body, requestId: ids.current.for({ id: order.id, command, ...body }) };
    const updated = publicStore
      ? await request<Order>(base + '/' + command, { method: 'POST', body: payload, token })
      : await api<Order>(base + '/' + command, 'POST', payload);
    cache.setQueryData(['order-panel', publicStore, businessId, initialOrder.id], updated);
    onChanged?.(updated);
    await cache.invalidateQueries();
  }
  const remaining = Math.max(0, Math.ceil((order.expires_at_ms - now) / 1000));
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Order #{shortId(order.id)}</h2>
            <p className="muted">
              {date(order.created_at)} · {order.channel} · Location {order.location_id}
            </p>
          </div>
          <Badge value={order.status} />
        </div>
        <Feedback action={action} />
        <ErrorBox error={live.error} />
        <Table
          rows={order.lines || []}
          columns={[
            {
              title: 'Product',
              render: (l) => (
                <span className="cell-stack">
                  <strong>{l.item_name}</strong>
                  <small>{l.sku}</small>
                </span>
              ),
            },
            { title: 'Quantity', render: (l) => l.quantity },
            { title: 'Unit price', render: (l) => money(l.price_cents, order.currency) },
            {
              title: 'Line total',
              render: (l) =>
                l.total_cents == null
                  ? 'Server line total unavailable'
                  : money(l.total_cents, order.currency),
            },
          ]}
        />
        <div className="cart-total">
          <span>Order total</span>
          <strong>{money(order.total_cents, order.currency)}</strong>
        </div>
        {!!order.refunds?.length && (
          <div className="notice info">
            A full simulated refund has been recorded. Inventory depends on cancellation or physical
            return state.
          </div>
        )}
        {order.status === 'RESERVED' && (publicStore || can(user, 'checkout')) && (
          <div className="payment-area">
            <div className="notice info">
              {remaining
                ? `Stock reserved · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining`
                : 'Reservation time elapsed. Refresh to confirm expiry; payment will recheck on the server.'}
            </div>
            <h3>Simulate payment</h3>
            <p className="muted">No card or bank details. No real funds processed.</p>
            <div className="filters">
              <Field label="Payment method">
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="CASH">Simulated cash</option>
                  <option value="CARD">Simulated card</option>
                </select>
              </Field>
              <Field label="Demo outcome">
                <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                  <option value="true">Successful payment</option>
                  <option value="false">Failed payment</option>
                </select>
              </Field>
              <button
                className="button primary"
                disabled={action.pending || !remaining}
                onClick={() =>
                  action.run(
                    () => send('payment', { method, successful: outcome === 'true' }),
                    'Simulated payment processed.',
                  )
                }
              >
                Process simulated payment
              </button>
            </div>
          </div>
        )}
        <div className="panel-footer actions">
          <button
            className="button secondary"
            disabled={action.pending}
            onClick={() =>
              action.run(
                async () =>
                  saveDownload(
                    publicStore
                      ? await request<Blob>(base + '/receipt', { token, download: true })
                      : await api<Blob>(base + '/receipt', 'GET', undefined, true),
                    `simulated-receipt-${order.id}.txt`,
                  ),
                'Receipt downloaded.',
              )
            }
          >
            <Download size={16} /> Receipt
          </button>
          {['RESERVED', 'COMPLETED'].includes(order.status) &&
            (publicStore || can(user, 'checkout')) && (
              <button className="button secondary" onClick={() => setConfirm('cancel')}>
                Cancel order
              </button>
            )}
          {!publicStore && order.status === 'COMPLETED' && can(user, 'fulfill') && (
            <button className="button primary" onClick={() => setConfirm('fulfill')}>
              Mark fulfilled
            </button>
          )}
          {!publicStore && order.status === 'FULFILLED' && can(user, 'manage') && (
            <button className="button secondary" onClick={() => setConfirm('return')}>
              Record full return
            </button>
          )}
          {!publicStore &&
            ['COMPLETED', 'FULFILLED', 'RETURNED', 'CANCELLED'].includes(order.status) &&
            !order.refunds?.length &&
            can(user, 'manage') && (
              <button className="button secondary" onClick={() => setConfirm('refund')}>
                Refund only
              </button>
            )}
        </div>
      </section>
      {!!order.events?.length && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Order activity</h2>
          </div>
          <Table
            rows={order.events}
            columns={[
              { title: 'When', render: (r) => date(r.created_at) },
              { title: 'Action', render: (r) => String(r.action) },
              {
                title: 'Actor',
                render: (r) => `${r.actor_kind}${r.actor_id ? ' #' + r.actor_id : ''}`,
              },
              { title: 'Reason', render: (r) => String(r.reason || '—') },
            ]}
          />
        </section>
      )}
      {confirm && (
        <Modal
          title={
            confirm === 'return'
              ? 'Record physical return'
              : confirm === 'refund'
                ? 'Record simulated refund'
                : confirm === 'fulfill'
                  ? 'Fulfill order'
                  : 'Cancel order'
          }
          close={() => setConfirm(null)}
        >
          <p className="muted">
            {confirm === 'return'
              ? 'Full-order return. Only resellable stock is restored; a simulated refund is recorded.'
              : confirm === 'refund'
                ? 'This records a full simulated refund without changing inventory.'
                : confirm === 'cancel'
                  ? order.status === 'COMPLETED'
                    ? 'Cancel this unfulfilled paid order, restore all stock, and record a simulated refund?'
                    : 'Release all reserved stock for this order?'
                  : 'Confirm the paid order has been handed over or dispatched.'}
          </p>
          <Feedback action={action} />
          <Form
            pending={action.pending}
            submit="Confirm action"
            onSubmit={(data) =>
              action.run(
                () =>
                  send(confirm, {
                    reason: str(data, 'reason'),
                    ...(confirm === 'return'
                      ? { resellable: data.get('resellable') === 'on' }
                      : {}),
                  }),
                'Order updated.',
                () => setConfirm(null),
              )
            }
          >
            <div className="span-2">
              <Input name="reason" label="Reason / notes" maxLength={500} />
              {confirm === 'return' && (
                <label className="checkbox">
                  <input name="resellable" type="checkbox" /> Returned goods are resellable (restore
                  stock)
                </label>
              )}
            </div>
          </Form>
        </Modal>
      )}
    </>
  );
}
export function Orders() {
  const [offset, setOffset] = useState(0);
  const result = useApiQuery<Order[]>('/api/orders' + query({ limit: 25, offset }), true, true);
  return (
    <>
      <Heading
        eyebrow="SHARED COMMERCE"
        title="Order history"
        description="Every channel. One authoritative inventory. Showing all locations."
      />
      <section className="panel">
        <ErrorBox error={result.error} />
        {result.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={result.data || []}
            columns={[
              {
                title: 'Order',
                render: (o) => (
                  <Link className="text-link" to={'/app/orders/' + o.id}>
                    #{shortId(o.id)}
                  </Link>
                ),
              },
              { title: 'Date', render: (o) => date(o.created_at) },
              { title: 'Channel', render: (o) => <Badge value={o.channel} /> },
              { title: 'Location', render: (o) => o.location_id },
              { title: 'Status', render: (o) => <Badge value={o.status} /> },
              { title: 'Total', render: (o) => money(o.total_cents, o.currency) },
            ]}
          />
        )}
        <Pager offset={offset} count={result.data?.length || 0} setOffset={setOffset} />
      </section>
    </>
  );
}
export function OrderDetail() {
  const { id } = useParams();
  const order = useApiQuery<Order>('/api/orders/' + id, true, true);
  return (
    <>
      <Link className="back-link" to="/app/orders">
        <ArrowLeft size={16} /> All orders
      </Link>
      <Heading
        eyebrow="ORDER DETAIL"
        title="Sale & fulfillment"
        description="Payment, physical stock, and fulfillment have separate recorded actions."
      />
      <ErrorBox error={order.error} />
      {order.isLoading ? <Loading /> : order.data && <OrderPanel key={id} order={order.data} />}
    </>
  );
}
export function PublicOrder() {
  const { businessId = '', id = '' } = useParams();
  const token = publicToken(businessId, id);
  const order = useQuery({
    queryKey: ['public-order', businessId, id],
    queryFn: () => request<Order>(`/api/storefront/${businessId}/orders/${id}`, { token }),
    enabled: !!token,
    refetchInterval: 10000,
  });
  return (
    <div className="public-page">
      <PublicHeader businessId={businessId} />
      <main className="store-container">
        <Heading
          eyebrow="YOUR ONLINE ORDER"
          title="Order & payment"
          description="Keep this tab’s stored order access to view your receipt or cancel an eligible order."
        />
        {!token ? (
          <div className="notice danger">
            Order access is unavailable in this tab. Your order token is required and cannot be
            recovered publicly. Ask staff for assistance, or let an unpaid reservation expire.
          </div>
        ) : (
          <>
            <ErrorBox error={order.error} />
            {order.isLoading ? (
              <Loading />
            ) : (
              order.data && (
                <OrderPanel key={id} order={order.data} publicStore businessId={businessId} />
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
