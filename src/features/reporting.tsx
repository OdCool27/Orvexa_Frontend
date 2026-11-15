import { useState } from 'react';
import { OnboardingCard } from './onboarding';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  Package,
  ShoppingCart,
  TriangleAlert,
} from 'lucide-react';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import { useWorkspace } from '../app/workspace';
import { query, saveDownload } from '../api/client';
import type { Order, Row, Sales, Stock, Summary } from '../api/types';
import {
  Badge,
  ErrorBox,
  Feedback,
  Heading,
  Loading,
  Pager,
  str,
  Table,
  useAction,
  useApiQuery,
} from '../components/ui';
import { date, label, money, shortId } from '../lib/format';

export function Dashboard() {
  const { user } = useAuth();
  const { business, locationId } = useWorkspace();
  const manager = can(user, 'reports');
  const summary = useApiQuery<Summary>(
    '/api/reports/summary' + query({ locationId }),
    manager && !!locationId,
    true,
  );
  const low = useApiQuery<Stock[]>(
    '/api/inventory' + query({ locationId, lowStock: true, limit: 5 }),
    !!locationId,
    true,
  );
  const orders = useApiQuery<Order[]>('/api/orders?limit=5', true, true);
  const sales = useApiQuery<Sales>('/api/reports/sales', manager, true);
  return (
    <>
      <Heading
        eyebrow="BUSINESS AT A GLANCE"
        title={`Welcome back, ${user?.firstName}.`}
        description="Here’s what’s happening across your workspace."
      >
        {can(user, 'checkout') && (
          <Link className="button primary" to="/app/pos">
            <ShoppingCart size={17} /> New sale
          </Link>
        )}
      </Heading>
      <OnboardingCard />
      <div className="overview-banner">
        <div>
          <span className="overline">A LITTLE CLARITY GOES A LONG WAY</span>
          <h2>Your inventory. Working together.</h2>
          <p>From the shelf to the checkout, every movement stays connected.</p>
        </div>
        <div className="banner-art">
          <Boxes size={90} strokeWidth={1} />
          <span className="art-orbit" />
        </div>
      </div>
      <ErrorBox error={summary.error || sales.error} />
      {manager && (
        <div className="stat-grid">
          {[
            {
              label: 'Active products',
              value: summary.data?.total_products,
              icon: Package,
              detail: 'Across your catalog',
            },
            {
              label: 'Units on hand',
              value: summary.data?.total_units,
              icon: Boxes,
              detail: 'At the selected location',
            },
            {
              label: 'Low-stock products',
              value: summary.data?.low_stock_products,
              icon: TriangleAlert,
              detail: 'At or below threshold',
            },
            {
              label: 'Recorded net revenue',
              value: sales.data
                ? money(sales.data.net_revenue_cents, business?.currency)
                : undefined,
              icon: CircleDollarSign,
              detail: 'All dates · all locations',
            },
          ].map((s) => (
            <div className="stat-card" key={s.label}>
              <div className="stat-label">
                <span>{s.label}</span>
                <s.icon size={18} />
              </div>
              <strong>{s.value ?? '—'}</strong>
              <small>{s.detail}</small>
            </div>
          ))}
        </div>
      )}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Needs your attention</h2>
              <p className="muted">Availability at the selected location</p>
            </div>
            <Link to="/app/inventory" className="text-link">
              View inventory <ArrowUpRight size={16} />
            </Link>
          </div>
          <ErrorBox error={low.error} />
          {!locationId ? (
            <p className="empty">
              Choose or activate a permitted branch to see stock availability.
            </p>
          ) : low.isLoading ? (
            <Loading />
          ) : (
            <Table
              rows={low.data || []}
              empty="All clear. No low-stock products at this location."
              columns={[
                {
                  title: 'Product',
                  render: (s) => (
                    <span className="cell-stack">
                      <strong>{s.item_name}</strong>
                      <small>{s.sku}</small>
                    </span>
                  ),
                },
                {
                  title: 'Available',
                  render: (s) => <strong className="danger-text">{s.available_quantity}</strong>,
                },
                {
                  title: 'Status',
                  render: (s) => (
                    <Badge value={s.available_quantity === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK'} />
                  ),
                },
              ]}
            />
          )}
        </section>
        <section className="panel padded quick-actions">
          <span className="overline">KEEP THINGS MOVING</span>
          <h2>Your next step</h2>
          {[
            {
              to: '/app/products',
              name: 'Explore your catalog',
              sub: 'Find products and compatibility',
              icon: Package,
            },
            {
              to: '/app/inventory',
              name: 'Check stock levels',
              sub: 'On hand, reserved, available',
              icon: Boxes,
            },
            ...(can(user, 'counts')
              ? [
                  {
                    to: '/app/counts',
                    name: 'Start a stock count',
                    sub: 'Save progress as you go',
                    icon: Package,
                  },
                ]
              : []),
            {
              to: `/store/${user?.businessId}`,
              name: 'Visit your storefront',
              sub: 'See the customer experience',
              icon: ShoppingCart,
            },
          ].map((a) => (
            <Link key={a.to} to={a.to}>
              <span className="quick-icon">
                <a.icon size={19} />
              </span>
              <span>
                <strong>{a.name}</strong>
                <small>{a.sub}</small>
              </span>
              <ArrowRight size={16} />
            </Link>
          ))}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent orders</h2>
            <p className="muted">POS and online, sharing one inventory</p>
          </div>
          <Link to="/app/orders" className="text-link">
            All orders <ArrowUpRight size={16} />
          </Link>
        </div>
        <ErrorBox error={orders.error} />
        <Table
          rows={orders.data || []}
          columns={[
            {
              title: 'Order',
              render: (o) => (
                <Link className="text-link" to={'/app/orders/' + o.id}>
                  #{shortId(o.id)}
                </Link>
              ),
            },
            { title: 'Channel', render: (o) => <Badge value={o.channel} /> },
            { title: 'Date', render: (o) => date(o.created_at) },
            { title: 'Status', render: (o) => <Badge value={o.status} /> },
            { title: 'Total', render: (o) => money(o.total_cents, o.currency) },
          ]}
        />
      </section>
    </>
  );
}
export function Reports() {
  const { api } = useAuth();
  const { locationId, business } = useWorkspace();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'byDate' | 'byChannel' | 'byProduct'>('byDate');
  const action = useAction();
  const summary = useApiQuery<Summary>(
    '/api/reports/summary' + query({ locationId }),
    !!locationId,
  );
  const sales = useApiQuery<Sales>('/api/reports/sales' + query(filters));
  return (
    <>
      <Heading
        eyebrow="OPERATIONAL INSIGHT"
        title="Reports"
        description="Understand your stock and simulated sales performance."
      >
        <button
          className="button secondary"
          disabled={!locationId || action.pending}
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
              'Stock CSV downloaded.',
            )
          }
        >
          Export stock CSV
        </button>
      </Heading>
      <Feedback action={action} />
      <ErrorBox error={summary.error || sales.error} />
      <section className="panel padded">
        <h2>Stock · selected location</h2>
        <div className="metric-row">
          <div>
            <span>Stocked products</span>
            <strong>{summary.data?.stocked_products ?? '—'}</strong>
          </div>
          <div>
            <span>On-hand units</span>
            <strong>{summary.data?.total_units ?? '—'}</strong>
          </div>
          <div>
            <span>Out of stock</span>
            <strong>{summary.data?.out_of_stock_products ?? '—'}</strong>
          </div>
          <div>
            <span>Cost estimate</span>
            <strong>
              {summary.data
                ? money(summary.data.inventory_cost_estimate_cents, business?.currency)
                : '—'}
            </strong>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Simulated sales · all locations</h2>
            <p className="muted">Inclusive UTC dates. No real funds processed.</p>
          </div>
        </div>
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
          }}
        >
          <label>
            From (UTC)
            <input name="from" type="date" />
          </label>
          <label>
            To (UTC)
            <input name="to" type="date" />
          </label>
          <select name="channel" aria-label="Sales channel">
            <option value="">All channels</option>
            <option>POS</option>
            <option>ONLINE</option>
          </select>
          <button className="button secondary">Apply</button>
        </form>
        {sales.isLoading ? (
          <Loading />
        ) : (
          sales.data && (
            <>
              <div className="metric-row padded">
                <div>
                  <span>Gross revenue</span>
                  <strong>{money(sales.data.gross_revenue_cents, business?.currency)}</strong>
                </div>
                <div>
                  <span>Refunded</span>
                  <strong>{money(sales.data.refunded_cents, business?.currency)}</strong>
                </div>
                <div>
                  <span>Net revenue</span>
                  <strong>{money(sales.data.net_revenue_cents, business?.currency)}</strong>
                </div>
                <div>
                  <span>Completed payments</span>
                  <strong>{sales.data.completed_simulated_payments}</strong>
                </div>
              </div>
              <div className="tabs">
                {(['byDate', 'byChannel', 'byProduct'] as const).map((t) => (
                  <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
                    {t === 'byDate' ? 'By date' : t === 'byChannel' ? 'By channel' : 'By product'}
                  </button>
                ))}
              </div>
              <Table
                rows={sales.data[tab]}
                columns={(tab === 'byDate'
                  ? ['date', 'sales', 'gross_revenue_cents', 'refunded_cents']
                  : tab === 'byChannel'
                    ? ['channel', 'sales', 'gross_revenue_cents', 'refunded_cents']
                    : [
                        'sku',
                        'item_name',
                        'units',
                        'gross_revenue_cents',
                        'sale_cost_estimate_cents',
                        'gross_profit_estimate_cents',
                      ]
                ).map((key) => ({
                  title: label(key.replace('_cents', '')),
                  render: (row: Row) =>
                    key.endsWith('_cents')
                      ? money(Number(row[key]), business?.currency)
                      : String(row[key] ?? '—'),
                }))}
              />
              <p className="panel-footer muted">
                Product cost and profit are gross estimates before refunds. Refund totals follow the
                original sale cohort; these are operational demo reports.
              </p>
            </>
          )
        )}
      </section>
    </>
  );
}
export function Audit() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const result = useApiQuery<Row[]>('/api/audit' + query({ ...filters, offset, limit: 25 }));
  return (
    <>
      <Heading
        eyebrow="ACCOUNTABILITY"
        title="Audit activity"
        description="Review recorded business and employee actions. Quantitative changes appear in the movement ledger."
      />
      <section className="panel">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({
              entityType: str(new FormData(e.currentTarget), 'entityType'),
              entityId: str(new FormData(e.currentTarget), 'entityId'),
            });
            setOffset(0);
          }}
        >
          <input
            name="entityType"
            placeholder="Entity type, e.g. EMPLOYEE"
            aria-label="Entity type"
          />
          <input name="entityId" placeholder="Entity ID" aria-label="Entity ID" />
          <button className="button secondary">Filter activity</button>
        </form>
        <ErrorBox error={result.error} />
        {result.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={result.data || []}
            columns={[
              { title: 'When', render: (r) => date(r.createdAt) },
              { title: 'Action', render: (r) => String(r.action) },
              { title: 'Actor', render: (r) => '#' + r.userId },
              { title: 'Entity', render: (r) => `${r.entityType} · ${r.entityId}` },
              {
                title: 'Changes',
                render: (r) => (
                  <details>
                    <summary>View details</summary>
                    <pre>{JSON.stringify({ before: r.oldValue, after: r.newValue }, null, 2)}</pre>
                  </details>
                ),
              },
            ]}
          />
        )}
        <Pager offset={offset} count={result.data?.length || 0} setOffset={setOffset} />
      </section>
    </>
  );
}
