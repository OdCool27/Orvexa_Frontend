import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import { useWorkspace } from '../app/workspace';
import { ApiError, CommandIds } from '../api/client';
import type { ProductUnit } from '../api/catalogue';
import { useProductFamily } from '../features/catalogue-queries';
import { ErrorBox, Feedback, Field, useAction, useApiQuery } from './ui';

export function InventoryLinks() {
  const { user } = useAuth();
  return (
    <nav className="actions setup-links" aria-label="Inventory operations">
      <Link className="text-link" to="/app/inventory">
        Stock
      </Link>
      <Link className="text-link" to="/app/batches">
        Batches & expiry
      </Link>
      {can(user, 'manage') && (
        <>
          <Link className="text-link" to="/app/purchasing">
            Purchasing & suppliers
          </Link>
          <Link className="text-link" to="/app/transfers">
            Branch transfers
          </Link>
        </>
      )}
      {can(user, 'counts') && (
        <Link className="text-link" to="/app/counts">
          Stock counts
        </Link>
      )}
      <Link className="text-link" to="/app/movements">
        Movement audit
      </Link>
    </nav>
  );
}
export function BranchName({ id }: { id: number }) {
  const { locations } = useWorkspace();
  return <>{locations.find((l) => l.id === id)?.name || `Branch ${id}`}</>;
}
export function ProductName({ id }: { id: string }) {
  const products = useProductFamily();
  const product = products.data?.find((p) => p.itemId === id);
  return (
    <Link className="text-link" to={`/app/products/${id}`}>
      {product ? `${product.itemName} · ${product.sku}` : id}
    </Link>
  );
}
export function ProductPicker({
  value,
  change,
  label = 'Product',
}: {
  value: string;
  change: (value: string) => void;
  label?: string;
}) {
  const products = useProductFamily();
  return (
    <>
      <ErrorBox error={products.error} />
      <Field label={label}>
        <select
          value={value}
          required
          onChange={(e) => change(e.target.value)}
          disabled={products.isPending || !!products.error}
        >
          <option value="">Choose an active sellable product</option>
          {products.data
            ?.filter((p) => p.active && p.productKind !== 'PARENT')
            .map((p) => (
              <option key={p.itemId} value={p.itemId}>
                {p.sku} · {p.itemName}
              </option>
            ))}
        </select>
      </Field>
    </>
  );
}
export function PurchaseUnitPicker({
  product,
  value,
  change,
  label = 'Purchase unit',
}: {
  product: string;
  value: string;
  change: (value: string) => void;
  label?: string;
}) {
  const units = useApiQuery<ProductUnit[]>(
    `/api/v1/catalogue/products/${product}/units`,
    !!product,
  );
  return (
    <>
      <ErrorBox error={units.error} />
      <Field label={label}>
        <select
          value={value}
          required
          disabled={!product || units.isPending || !!units.error}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">Choose a purchase-enabled unit</option>
          {units.data
            ?.filter((u) => u.purchase_allowed)
            .map((u) => (
              <option key={u.code} value={u.code}>
                {u.code} · factor {u.factor}
              </option>
            ))}
        </select>
      </Field>
    </>
  );
}
type Attempt = { path: string; body: object; message: string; after?: () => void };
export function useInventoryCommand() {
  const { api } = useAuth();
  const action = useAction();
  const ids = useRef(new CommandIds());
  const [attempt, setAttempt] = useState<Attempt>();
  async function post(command: Attempt) {
    try {
      await api(command.path, 'POST', command.body);
    } catch (error) {
      if (
        error instanceof ApiError &&
        ((error.status === 0 && error.code !== 'OFFLINE') || error.status >= 500)
      )
        setAttempt(command);
      else setAttempt(undefined);
      throw error;
    }
    setAttempt(undefined);
    ids.current.clear();
  }
  return {
    ...action,
    blocked: !!attempt,
    send: (path: string, body: object | (() => object), message: string, after?: () => void) => {
      if (attempt) return Promise.resolve();
      return action.run(
        async () => {
          const payload = typeof body === 'function' ? body() : body;
          await post({
            path,
            body: { ...payload, requestId: ids.current.for({ path, body: payload }) },
            message,
            after,
          });
        },
        message,
        after,
      );
    },
    retry: () =>
      attempt ? action.run(() => post(attempt), attempt.message, attempt.after) : Promise.resolve(),
  };
}
export function InventoryFeedback({
  command,
}: {
  command: ReturnType<typeof useInventoryCommand>;
}) {
  return (
    <>
      <Feedback action={command} />
      {command.blocked && (
        <div className="notice danger" role="alert">
          <div>
            The result is uncertain. Keep this screen open and retry the exact same command safely,
            or reconcile the saved history before creating another operation.{' '}
            <button
              className="button secondary small"
              disabled={command.pending}
              onClick={() => void command.retry()}
            >
              Retry same command
            </button>
          </div>
        </div>
      )}
    </>
  );
}
