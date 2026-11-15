import { ProductEditor } from './ProductEditor';
import { ProductTools, ProductVariants } from './product-tools';
import { ProductTaxSettings } from './tax';
import { lookupCatalogueProduct } from '../lib/catalogue';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Package, Plus, Search } from 'lucide-react';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import { query } from '../api/client';
import type { Category, Fitment, Product } from '../api/types';
import {
  Badge,
  ErrorBox,
  Feedback,
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
import { majorToCents, money } from '../lib/format';
import { useWorkspace } from '../app/workspace';

export function Catalog() {
  const { user, api } = useAuth();
  const navigate = useNavigate();
  const scanner = useAction();
  const { business } = useWorkspace();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [create, setCreate] = useState(false);
  const products = useApiQuery<Product[]>(
    '/api/products' + query({ ...filters, limit: 25, offset }),
  );
  const categories = useApiQuery<Category[]>('/api/categories');
  return (
    <>
      <Heading
        eyebrow="CATALOG"
        title="Your products"
        description="A well-organized catalog. The foundation of connected inventory."
      >
        {can(user, 'manage') && (
          <>
            <Link className="button secondary" to="/app/imports/catalogue">
              Import catalogue
            </Link>
            <button className="button primary" onClick={() => setCreate(true)}>
              <Plus size={17} /> Add product
            </button>
          </>
        )}
      </Heading>
      <section className="panel padded">
        <h2>Find an exact product</h2>
        <p>
          Use a keyboard barcode scanner and press Enter, or type an exact SKU/barcode. Leading
          zeros are preserved.
        </p>
        <Feedback action={scanner} />
        <Form
          pending={scanner.pending}
          submit="Open scanned product"
          onSubmit={(data) =>
            void scanner.run(async () => {
              const found = await lookupCatalogueProduct(
                (path) => api<Product[]>(path),
                str(data, 'code'),
              );
              navigate(`/app/products/${found.itemId}`);
            })
          }
        >
          <Input
            name="code"
            label="Scan catalogue SKU or barcode"
            autoComplete="off"
            maxLength={255}
          />
        </Form>
      </section>
      <section className="panel">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
            setOffset(0);
          }}
        >
          <div className="search-field">
            <Search size={17} />
            <input name="search" aria-label="Search products" placeholder="Search name or SKU…" />
          </div>
          <select name="category" aria-label="Category">
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.id}>{c.name}</option>
            ))}
          </select>
          <input name="barcode" aria-label="Exact barcode" placeholder="Exact barcode" />
          <button className="button secondary">Search</button>
          <details className="advanced-filter">
            <summary>Vehicle filters & archived</summary>
            <div className="filters">
              <input name="make" aria-label="Vehicle make" placeholder="Make" />
              <input name="model" aria-label="Vehicle model" placeholder="Model" />
              <input
                name="year"
                aria-label="Vehicle year"
                type="number"
                min={1886}
                max={2200}
                placeholder="Year"
              />
              <input name="engine" aria-label="Vehicle engine" placeholder="Engine (if known)" />
              <input name="trim" aria-label="Vehicle trim" placeholder="Trim (if known)" />
              <label className="checkbox">
                <input name="includeInactive" value="true" type="checkbox" /> Include archived
              </label>
            </div>
          </details>
        </form>
        <ErrorBox error={products.error} />
        {products.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={products.data || []}
            empty="No products match. Add your first product or adjust the filters."
            columns={[
              {
                title: 'Product',
                render: (p) => (
                  <Link to={`/app/products/${p.itemId}`} className="product-cell">
                    <span className="product-icon">
                      <Package size={20} />
                    </span>
                    <span>
                      <strong>{p.itemName}</strong>
                      <small>{p.sku}</small>
                    </span>
                  </Link>
                ),
              },
              { title: 'Category', render: (p) => p.category || 'Uncategorized' },
              {
                title: 'Price',
                render: (p) => money(majorToCents(p.unitPrice), business?.currency),
              },
              {
                title: 'Unit / type',
                render: (p) => `${p.unitOfMeasure} · ${p.productKind || 'SIMPLE'}`,
              },
              {
                title: 'Status',
                render: (p) => <Badge value={p.active ? 'ACTIVE' : 'ARCHIVED'} />,
              },
              {
                title: '',
                render: (p) => (
                  <Link aria-label={`View ${p.itemName}`} to={`/app/products/${p.itemId}`}>
                    <ArrowUpRight size={18} />
                  </Link>
                ),
              },
            ]}
          />
        )}
        <Pager offset={offset} count={products.data?.length || 0} setOffset={setOffset} />
      </section>
      {create && <ProductEditor done={() => setCreate(false)} />}
    </>
  );
}
export function ProductDetail() {
  const { id } = useParams();
  const { api, user } = useAuth();
  const navigate = useNavigate();
  const { business } = useWorkspace();
  const action = useAction();
  const product = useApiQuery<Product>(`/api/products/${id}`);
  const fitments = useApiQuery<Fitment[]>(`/api/products/${id}/fitments`);
  const [edit, setEdit] = useState(false);
  const [fitment, setFitment] = useState(false);
  const [archive, setArchive] = useState(false);
  if (product.isLoading) return <Loading />;
  if (!product.data) return <ErrorBox error={product.error} />;
  const p = product.data;
  return (
    <>
      <Link className="back-link" to="/app/products">
        <ArrowLeft size={16} /> Products
      </Link>
      <Heading eyebrow={p.sku} title={p.itemName} description={p.itemDescription}>
        {can(user, 'manage') && p.active && (
          <>
            <button className="button secondary" onClick={() => setArchive(true)}>
              Archive
            </button>
            <button className="button primary" onClick={() => setEdit(true)}>
              Edit product
            </button>
          </>
        )}
      </Heading>
      <Feedback action={action} />
      <div className="stat-grid">
        <div className="stat-card">
          <span>Selling price</span>
          <strong>{money(majorToCents(p.unitPrice), business?.currency)}</strong>
        </div>
        <div className="stat-card">
          <span>Reference unit cost</span>
          <strong>{money(majorToCents(p.cost), business?.currency)}</strong>
        </div>
        <div className="stat-card">
          <span>Barcode</span>
          <strong className="compact-number">{p.barcode || 'Not assigned'}</strong>
        </div>
        <div className="stat-card">
          <span>Status</span>
          <Badge value={p.active ? 'ACTIVE' : 'ARCHIVED'} />
        </div>
      </div>
      <ProductVariants key={p.itemId} product={p} />
      {p.productKind !== 'PARENT' && (
        <>
          <ProductTools key={`${p.itemId}-tools`} product={p} />
          <ProductTaxSettings key={`${p.itemId}-tax`} product={p} />
        </>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Verified vehicle compatibility</h2>
            <p className="muted">
              Matches come from recorded sources. Engine and trim restrictions apply.
            </p>
          </div>
          {can(user, 'manage') && p.active && (
            <button className="button secondary" onClick={() => setFitment(true)}>
              <Plus size={16} /> Add fitment
            </button>
          )}
        </div>
        <ErrorBox error={fitments.error} />
        <Table
          rows={fitments.data || []}
          empty="No verified compatibility records linked to this product."
          columns={[
            { title: 'Vehicle', render: (f) => `${f.make} ${f.model}` },
            { title: 'Years', render: (f) => `${f.year_from}–${f.year_to}` },
            { title: 'Engine / trim', render: (f) => `${f.engine || 'Any'} / ${f.trim || 'Any'}` },
            { title: 'Source', render: (f) => f.source },
            {
              title: '',
              render: (f) =>
                can(user, 'manage') &&
                p.active && (
                  <button
                    className="text-button danger-text"
                    disabled={action.pending}
                    onClick={() =>
                      action.run(
                        () => api(`/api/products/${id}/fitments/${f.id}`, 'DELETE'),
                        'Fitment unlinked.',
                      )
                    }
                  >
                    Unlink
                  </button>
                ),
            },
          ]}
        />
      </section>
      {edit && <ProductEditor product={p} done={() => setEdit(false)} />}
      {archive && (
        <Modal title="Archive product" close={() => setArchive(false)}>
          <p>
            This removes {p.itemName} from active catalog searches. Sales and stock history remain
            available.
          </p>
          <button
            disabled={action.pending}
            className="button danger-button"
            onClick={() =>
              action.run(
                () => api(`/api/products/${id}`, 'DELETE'),
                'Product archived.',
                () => {
                  setArchive(false);
                  navigate('/app/products');
                },
              )
            }
          >
            Archive product
          </button>
        </Modal>
      )}
      {fitment && (
        <Modal title="Add verified fitment" close={() => setFitment(false)}>
          <Feedback action={action} />
          <Form
            pending={action.pending}
            submit="Create and link fitment"
            onSubmit={(data) =>
              action.run(
                async () => {
                  const f = await api<Fitment>('/api/fitments', 'POST', {
                    make: str(data, 'make'),
                    model: str(data, 'model'),
                    yearFrom: num(data, 'yearFrom'),
                    yearTo: num(data, 'yearTo'),
                    engine: str(data, 'engine') || null,
                    trim: str(data, 'trim') || null,
                    source: str(data, 'source'),
                    verified: data.get('verified') === 'on',
                  });
                  await api(`/api/products/${id}/fitments/${f.id}`, 'POST');
                },
                'Fitment linked.',
                () => setFitment(false),
              )
            }
          >
            <Input name="make" label="Make" />
            <Input name="model" label="Model" />
            <Input name="yearFrom" label="Year from" type="number" min={1886} max={2200} />
            <Input name="yearTo" label="Year to" type="number" min={1886} max={2200} />
            <Input name="engine" label="Engine (optional)" required={false} />
            <Input name="trim" label="Trim (optional)" required={false} />
            <div className="span-2">
              <Input name="source" label="Verification source" maxLength={500} />
              <label className="checkbox">
                <input type="checkbox" name="verified" required /> I verified this fitment against
                the supplied source.
              </label>
            </div>
          </Form>
        </Modal>
      )}
    </>
  );
}
