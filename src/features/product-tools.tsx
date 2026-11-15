import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import { CommandIds, query, saveDownload } from '../api/client';
import type { Product } from '../api/types';
import type { ProductUnit } from '../api/catalogue';
import {
  Badge,
  ErrorBox,
  Feedback,
  Field,
  Form,
  Input,
  Loading,
  str,
  Table,
  useAction,
  useApiQuery,
} from '../components/ui';
import { unitDecimal } from '../lib/catalogue';
import { ProductEditor } from './ProductEditor';
import { useProductFamily } from './catalogue-queries';

export function ProductVariants({ product }: { product: Product }) {
  const { user } = useAuth();
  const family = useProductFamily(product.productKind === 'PARENT');
  const [create, setCreate] = useState(false);
  if (product.productKind === 'VARIANT')
    return (
      <section className="panel padded">
        <h2>Variant identity</h2>
        <p>
          Key: {product.variantKey} ·{' '}
          <Link className="text-link" to={`/app/products/${product.parentId}`}>
            Open parent product
          </Link>
        </p>
        <p>SKU, barcode, pricing, tax and stock belong to this sellable variant.</p>
      </section>
    );
  if (product.productKind !== 'PARENT') return null;
  return (
    <section className="panel padded">
      <div className="panel-heading">
        <h2>Product variants</h2>
        {can(user, 'manage') && product.active && (
          <button className="button primary" onClick={() => setCreate(true)}>
            Add variant
          </button>
        )}
      </div>
      <p>
        This parent groups products. Select a variant to edit its price, barcode, units, tax or
        stock settings. Archive active variants before archiving the parent.
      </p>
      <ErrorBox error={family.error} />
      {family.isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={(family.data || []).filter((p) => p.parentId === product.itemId)}
          columns={[
            {
              title: 'Variant',
              render: (p) => (
                <Link className="text-link" to={`/app/products/${p.itemId}`}>
                  {p.itemName}
                </Link>
              ),
            },
            { title: 'Key / SKU', render: (p) => `${p.variantKey} · ${p.sku}` },
            { title: 'Status', render: (p) => <Badge value={p.active ? 'ACTIVE' : 'ARCHIVED'} /> },
          ]}
        />
      )}
      {create && <ProductEditor parent={product} done={() => setCreate(false)} />}
    </section>
  );
}
function Units({ product }: { product: Product }) {
  const { api, user } = useAuth();
  const units = useApiQuery<ProductUnit[]>(`/api/v1/catalogue/products/${product.itemId}/units`);
  const action = useAction();
  const conversion = useAction();
  const ids = useRef(new CommandIds());
  const [result, setResult] = useState<{
    baseQuantity: number;
    input: string;
    unit: string;
    purpose: string;
  }>();
  return (
    <section className="panel padded">
      <h2>Purchase and sale units</h2>
      <p>
        Base unit: <strong>{product.unitOfMeasure}</strong>. A conversion must produce whole base
        units; the server validates the result.
      </p>
      <ErrorBox error={units.error} />
      {units.isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={units.data || []}
          columns={[
            { title: 'Unit', render: (u) => u.code },
            { title: 'Base-unit factor', render: (u) => u.factor },
            {
              title: 'Allowed operations',
              render: (u) =>
                [u.purchase_allowed && 'Purchase', u.sale_allowed && 'Sale']
                  .filter(Boolean)
                  .join(', '),
            },
          ]}
        />
      )}
      {can(user, 'manage') && product.active && (
        <>
          <h3>Add a conversion unit</h3>
          <p className="form-hint">
            Factors are immutable. For a different pack size, add a new unit code. At least one
            allowed operation is required.
          </p>
          <Feedback action={action} />
          <Form
            pending={action.pending}
            submit="Add unit"
            onSubmit={(data) =>
              void action.run(async () => {
                const body = {
                  code: str(data, 'code'),
                  factor: unitDecimal(str(data, 'factor')),
                  purchaseAllowed: data.has('purchaseAllowed'),
                  saleAllowed: data.has('saleAllowed'),
                };
                if (!body.purchaseAllowed && !body.saleAllowed)
                  throw new Error('Allow purchases or sales for this unit.');
                await api(`/api/v1/catalogue/products/${product.itemId}/units`, 'POST', {
                  ...body,
                  requestId: ids.current.for(body),
                });
              }, 'Conversion unit saved.')
            }
          >
            <Field label="Unit code">
              <input
                name="code"
                required
                pattern="[A-Z][A-Z0-9_]{0,19}"
                maxLength={20}
                placeholder="CASE_12"
              />
            </Field>
            <Field label="Base units per conversion unit">
              <input name="factor" inputMode="decimal" required placeholder="12" />
            </Field>
            <Field label="Allow purchases">
              <input name="purchaseAllowed" type="checkbox" defaultChecked />
            </Field>
            <Field label="Allow sales">
              <input name="saleAllowed" type="checkbox" defaultChecked />
            </Field>
          </Form>
        </>
      )}
      <h3>Check a conversion</h3>
      <Feedback action={conversion} />
      <Form
        pending={conversion.pending}
        disabled={!units.data?.length}
        submit="Check conversion"
        onSubmit={(data) =>
          void conversion.run(async () => {
            setResult(undefined);
            const body = {
              unit: str(data, 'unit'),
              quantity: unitDecimal(str(data, 'quantity'), true),
              purpose: str(data, 'purpose'),
            };
            const response = await api<{ baseQuantity: number }>(
              `/api/v1/catalogue/products/${product.itemId}/convert`,
              'POST',
              body,
            );
            setResult({
              ...response,
              input: body.quantity,
              unit: body.unit,
              purpose: body.purpose,
            });
          }, 'Conversion checked.')
        }
      >
        <Field label="Conversion unit">
          <select name="unit" required defaultValue="">
            <option value="" disabled>
              Choose a unit
            </option>
            {units.data?.map((u) => (
              <option key={u.code}>{u.code}</option>
            ))}
          </select>
        </Field>
        <Input name="quantity" label="Conversion quantity" value="1" />
        <Field label="Conversion purpose">
          <select name="purpose">
            <option value="PURCHASE">Purchase</option>
            <option value="SALE">Sale</option>
          </select>
        </Field>
      </Form>
      {result && (
        <p role="status">
          Server result: {result.input} {result.unit} ({result.purpose.toLowerCase()}) ={' '}
          <strong>
            {result.baseQuantity} {product.unitOfMeasure}
          </strong>
          . This check does not change stock.
        </p>
      )}
      <p className="form-hint">
        If a unit save response is lost, retry the unchanged form to reuse its command ID, or reload
        the product to inspect its units.
      </p>
    </section>
  );
}
function Labels({ product }: { product: Product }) {
  const { api, user } = useAuth();
  const action = useAction();
  const [width, setWidth] = useState('100');
  const [height, setHeight] = useState('30');
  const [preview, setPreview] = useState<Blob>();
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!preview) {
      setUrl('');
      return;
    }
    const value = URL.createObjectURL(preview);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [preview]);
  useEffect(() => {
    setPreview(undefined);
  }, [product.barcode]);
  function path(format: string) {
    if (
      !/^\d+$/.test(width) ||
      !/^\d+$/.test(height) ||
      +width < 50 ||
      +width > 150 ||
      +height < 20 ||
      +height > 80
    )
      throw new Error('Choose label dimensions 50–150 mm wide and 20–80 mm high.');
    return (
      `/api/v1/catalogue/products/${product.itemId}/label` +
      query({ format, widthMm: +width, heightMm: +height })
    );
  }
  return (
    <section className="panel padded">
      <h2>Barcode and printable labels</h2>
      <p>{product.barcode ? `Current code: ${product.barcode}` : 'No barcode assigned.'}</p>
      <p>
        Manufacturer codes can be entered when editing the product. Generated ORV- codes identify
        products inside Orvexa; they are not GS1-registered GTINs. Generation preserves any existing
        barcode.
      </p>
      <Feedback action={action} />
      {can(user, 'manage') && product.active && !product.barcode && (
        <button
          className="button secondary"
          disabled={action.pending}
          onClick={() =>
            void action.run(
              () => api(`/api/v1/catalogue/products/${product.itemId}/barcode`, 'POST'),
              'Internal barcode assigned. Reload this product if a response is lost; an existing code is preserved.',
            )
          }
        >
          Generate internal barcode
        </button>
      )}
      {product.barcode && (
        <>
          <Form
            pending={action.pending}
            submit="Preview label"
            onSubmit={() =>
              void action.run(async () => {
                setPreview(undefined);
                setPreview(await api<Blob>(path('png'), 'GET', undefined, true));
              }, 'Label preview loaded.')
            }
          >
            <Field label="Label width (mm)">
              <input
                type="number"
                min={50}
                max={150}
                step={1}
                value={width}
                onChange={(e) => {
                  setWidth(e.target.value);
                  setPreview(undefined);
                }}
                required
              />
            </Field>
            <Field label="Label height (mm)">
              <input
                type="number"
                min={20}
                max={80}
                step={1}
                value={height}
                onChange={(e) => {
                  setHeight(e.target.value);
                  setPreview(undefined);
                }}
                required
              />
            </Field>
          </Form>
          {url && (
            <figure className="label-preview">
              <img src={url} alt={`CODE128 label for ${product.itemName}: ${product.barcode}`} />
              <figcaption>
                {width} × {height} mm. Print at actual size; do not stretch or shrink the barcode.
              </figcaption>
            </figure>
          )}
          <div className="actions">
            {['pdf', 'svg', 'png'].map((format) => (
              <button
                key={format}
                className="button secondary"
                disabled={action.pending}
                onClick={() =>
                  void action.run(async () => {
                    saveDownload(
                      await api<Blob>(path(format), 'GET', undefined, true),
                      `label-${product.itemId}.${format}`,
                    );
                  }, 'Label downloaded.')
                }
              >
                {format === 'pdf' ? 'Download PDF to print' : `Download ${format.toUpperCase()}`}
              </button>
            ))}
          </div>
          <p className="form-hint">
            The server checks minimum barcode module width. If a label is too narrow for a long
            code, increase the width.
          </p>
        </>
      )}
    </section>
  );
}
function Tracking({ product }: { product: Product }) {
  const { api, user, identity } = useAuth();
  const action = useAction();
  const ids = useRef(new CommandIds());
  const [confirmed, setConfirmed] = useState<boolean>();
  const allowed =
    can(user, 'manage') &&
    !!identity?.memberships.some((m) => m.id === user?.membershipId && !!m.all_branches);
  return (
    <section className="panel padded">
      <h2>Batch and expiry tracking</h2>
      <p>
        Configure batch tracking before recording stock. A different tracking mode requires a
        distinct SKU after stock or sale history exists; all branch stock and reservations must be
        zero when configuring it.
      </p>
      <p>
        The product read API does not expose the current tracking flag.{' '}
        {confirmed === undefined
          ? 'Current mode is unavailable here.'
          : `Last confirmed server mode: ${confirmed ? 'enabled' : 'disabled'}.`}{' '}
        Batch codes and optional expiry dates are recorded when receiving stock.
      </p>
      <Feedback action={action} />
      {allowed && product.active ? (
        <Form
          pending={action.pending}
          submit="Set tracking mode"
          onSubmit={(data) =>
            void action.run(async () => {
              const body = { enabled: str(data, 'enabled') === 'true' };
              const response = await api<{ batch_tracked: number }>(
                `/api/v1/inventory/products/${product.itemId}/tracking`,
                'POST',
                { ...body, requestId: ids.current.for(body) },
              );
              setConfirmed(!!response.batch_tracked);
              ids.current.clear();
            }, 'Tracking configuration saved.')
          }
        >
          <Field label="Requested tracking mode">
            <select name="enabled" required defaultValue="">
              <option value="" disabled>
                Choose explicitly
              </option>
              <option value="true">Track batches and optional expiry</option>
              <option value="false">Do not track batches</option>
            </select>
          </Field>
        </Form>
      ) : (
        <p className="form-hint">
          An Owner, Administrator or Manager with all-branch access can configure tracking on an
          active product.
        </p>
      )}
    </section>
  );
}
export function ProductTools({ product }: { product: Product }) {
  return (
    <>
      <Units product={product} />
      <Labels product={product} />
      <Tracking product={product} />
    </>
  );
}
