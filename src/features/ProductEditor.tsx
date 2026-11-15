import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/Auth';
import { ApiError } from '../api/client';
import type { Category, Product } from '../api/types';
import {
  Feedback,
  Field,
  Form,
  Input,
  Modal,
  str,
  num,
  useAction,
  useApiQuery,
  ErrorBox,
} from '../components/ui';
import { moneyText } from '../lib/catalogue';
import { useProductFamily } from './catalogue-queries';

export function ProductEditor({
  product,
  parent,
  done,
}: {
  product?: Product;
  parent?: Product;
  done: () => void;
}) {
  const { api } = useAuth();
  const action = useAction();
  const [uncertain, setUncertain] = useState(false);
  const [kind, setKind] = useState(product?.productKind || (parent ? 'VARIANT' : 'SIMPLE'));
  const categories = useApiQuery<Category[]>('/api/categories');
  const family = useProductFamily(kind === 'VARIANT' && !parent && !product);
  return (
    <Modal
      title={
        product ? 'Edit product' : parent ? `Add variant of ${parent.itemName}` : 'Add product'
      }
      close={() => {
        if (!action.pending) done();
      }}
    >
      <Feedback action={action} />
      <ErrorBox error={categories.error || family.error} />
      {uncertain && (
        <div className="notice danger">
          <div>
            The create result is uncertain.{' '}
            <Link className="text-link" to="/app/products" onClick={done}>
              Check the catalogue
            </Link>{' '}
            for this SKU before opening a new create form. No automatic retry was made.
          </div>
        </div>
      )}
      <Form
        pending={action.pending}
        disabled={
          uncertain ||
          categories.isPending ||
          !!categories.error ||
          (kind === 'VARIANT' && !parent && !product && (family.isPending || !!family.error))
        }
        submit={product ? 'Save product' : 'Create product'}
        onSubmit={(data) =>
          void action.run(
            async () => {
              const body = {
                sku: str(data, 'sku'),
                barcode: kind === 'PARENT' ? null : str(data, 'barcode') || null,
                itemName: str(data, 'itemName'),
                itemDescription: str(data, 'itemDescription'),
                unitPrice:
                  kind === 'PARENT'
                    ? String(product?.unitPrice ?? 0)
                    : moneyText(str(data, 'unitPrice')),
                cost: kind === 'PARENT' ? String(product?.cost ?? 0) : moneyText(str(data, 'cost')),
                categoryId: str(data, 'categoryId') ? num(data, 'categoryId') : null,
                unitOfMeasure: product?.unitOfMeasure || str(data, 'unitOfMeasure'),
                minStockThreshold: str(data, 'minStockThreshold')
                  ? num(data, 'minStockThreshold')
                  : null,
                productKind: kind,
                parentId:
                  kind === 'VARIANT'
                    ? product?.parentId || parent?.itemId || str(data, 'parentId')
                    : null,
                variantKey:
                  kind === 'VARIANT' ? product?.variantKey || str(data, 'variantKey') : null,
              };
              try {
                await api(
                  `/api/products${product ? `/${product.itemId}` : ''}`,
                  product ? 'PUT' : 'POST',
                  body,
                );
              } catch (error) {
                if (
                  !product &&
                  error instanceof ApiError &&
                  ((error.status === 0 && error.code !== 'OFFLINE') || error.status >= 500)
                )
                  setUncertain(true);
                throw error;
              }
            },
            'Product saved.',
            done,
          )
        }
      >
        <Field
          label="Product type"
          hint={
            product
              ? 'Product type, parent and variant key are immutable.'
              : 'Parents group variants and cannot be sold or stocked directly.'
          }
        >
          <select
            name="productKind"
            value={kind}
            disabled={!!product || !!parent}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="SIMPLE">Simple product</option>
            <option value="PARENT">Parent / product family</option>
            <option value="VARIANT">Sellable variant</option>
          </select>
        </Field>
        {kind === 'VARIANT' && (
          <>
            {product || parent ? (
              <p>
                Parent:{' '}
                <Link
                  className="text-link"
                  to={`/app/products/${product?.parentId || parent?.itemId}`}
                >
                  {parent?.itemName || product?.parentId}
                </Link>
              </p>
            ) : (
              <Field label="Parent product">
                <select name="parentId" required defaultValue="">
                  <option value="" disabled>
                    Choose an active parent
                  </option>
                  {family.data
                    ?.filter((p) => p.active && p.productKind === 'PARENT')
                    .map((p) => (
                      <option key={p.itemId} value={p.itemId}>
                        {p.itemName} · {p.sku}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field
              label="Variant key"
              hint="A unique key within the parent, such as BLUE_LARGE. It cannot be changed later."
            >
              <input
                name="variantKey"
                defaultValue={product?.variantKey || ''}
                required
                maxLength={80}
                readOnly={!!product}
              />
            </Field>
          </>
        )}
        <Input name="itemName" label="Product name" value={product?.itemName} maxLength={120} />
        <Input name="sku" label="SKU" value={product?.sku} maxLength={50} />
        {kind !== 'PARENT' && (
          <>
            <Input
              name="barcode"
              label="Manufacturer or existing barcode (optional)"
              value={product?.barcode || ''}
              required={false}
              maxLength={255}
            />
            <Input
              name="unitPrice"
              label="Selling price"
              type="number"
              min={0}
              step="0.01"
              value={product?.unitPrice ?? 0}
            />
            <Input
              name="cost"
              label="Reference unit cost"
              type="number"
              min={0}
              step="0.01"
              value={product?.cost ?? 0}
            />
          </>
        )}
        <Field label="Category">
          <select name="categoryId" defaultValue={product?.categoryId || ''}>
            <option value="">Uncategorized</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Base unit"
          hint="Immutable after creation. Add purchase/sale conversion units on the product page."
        >
          <input
            name="unitOfMeasure"
            defaultValue={product?.unitOfMeasure || 'EACH'}
            readOnly={!!product}
            pattern="[A-Z][A-Z0-9_]{0,19}"
            maxLength={20}
            required
          />
        </Field>
        <Input
          name="minStockThreshold"
          label="Minimum stock (optional)"
          type="number"
          min={0}
          max={2147483647}
          step="1"
          value={product?.minStockThreshold ?? ''}
          required={false}
        />
        <p className="form-hint span-2">
          The product threshold applies independently at each branch. Blank uses the business
          default. Reference unit cost is not a branch’s weighted-average inventory cost. Configure
          tax and optional batch tracking after saving.
        </p>
        <div className="span-2">
          <Field label="Description">
            <textarea
              name="itemDescription"
              required
              maxLength={255}
              defaultValue={product?.itemDescription}
            />
          </Field>
        </div>
      </Form>
    </Modal>
  );
}
