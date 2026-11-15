import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Inbox, LoaderCircle, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/Auth';
import { ApiError } from '../api/client';
import { label } from '../lib/format';

export function useApiQuery<T>(path: string, enabled = true, poll = false) {
  const { api, user } = useAuth();
  return useQuery<T>({
    queryKey: [user?.id, user?.businessId, user?.membershipId, path],
    queryFn: ({ signal }) => api<T>(path, 'GET', undefined, false, signal),
    enabled,
    refetchInterval: poll ? 15000 : false,
  });
}
export function useAction() {
  const cache = useQueryClient();
  const lock = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState(false);
  async function run(task: () => Promise<unknown>, message = 'Changes saved.', after?: () => void) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    setSuccess('');
    try {
      await task();
      await cache.invalidateQueries();
      setSuccess(message);
      after?.();
    } catch (failure) {
      setError(failure);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return {
    run,
    pending,
    error,
    success,
    clear: () => {
      setError(null);
      setSuccess('');
    },
  };
}
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="notice danger" role="alert">
      <AlertCircle size={18} />
      <div>
        <strong>{error instanceof Error ? error.message : 'Something went wrong.'}</strong>
        {error instanceof ApiError && error.requestId && (
          <small className="error-reference">Request reference: {error.requestId}</small>
        )}
        {error instanceof ApiError && error.fields.length > 0 && (
          <ul>
            {error.fields.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
export function Feedback({ action }: { action: ReturnType<typeof useAction> }) {
  return (
    <>
      <ErrorBox error={action.error} />
      {action.success && (
        <div className="notice success" role="status">
          {action.success}
        </div>
      )}
    </>
  );
}
export function Loading({ text = 'Loading workspace…' }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} /> {text}
    </div>
  );
}
export function Empty({
  text = 'No records yet. Your next step starts here.',
  children,
}: {
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow || 'YOUR WORKSPACE'}</p>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      <div className="actions">{children}</div>
    </header>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`badge ${['ACTIVE', 'COMPLETE', 'COMPLETED', 'OWNER_REVIEWED', 'APPROVED', 'FULFILLED'].includes(value) ? 'green' : ['EXPIRED', 'PAYMENT_FAILED', 'DEACTIVATED', 'NEEDS_REVIEW', 'UNVERIFIED'].includes(value) ? 'red' : 'neutral'}`}
    >
      {label(value)}
    </span>
  );
}
export function Field({
  label: title,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{title}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Input({
  name,
  label: title,
  type = 'text',
  value,
  required = true,
  ...props
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  maxLength?: number;
  minLength?: number;
  autoComplete?: string;
}) {
  return (
    <Field label={title}>
      <input name={name} type={type} defaultValue={value} required={required} {...props} />
    </Field>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <dialog
      ref={(el) => {
        ref.current = el;
        if (el && !el.open) el.showModal();
      }}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Form({
  children,
  onSubmit,
  pending,
  disabled,
  submit = 'Save changes',
}: {
  children: ReactNode;
  onSubmit: (data: FormData) => void;
  pending?: boolean;
  disabled?: boolean;
  submit?: string;
}) {
  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!pending && !disabled) onSubmit(new FormData(event.currentTarget));
      }}
    >
      <fieldset disabled={pending || disabled}>
        <div className="form-grid">{children}</div>
        <div className="form-footer">
          <button className="button primary" type="submit">
            {pending && <LoaderCircle size={16} className="spin" />}
            {pending ? 'Working…' : submit}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export const str = (data: FormData, key: string) => String(data.get(key) || '').trim();
export const num = (data: FormData, key: string) => Number(str(data, key));
export function Table<T>({
  rows,
  columns,
  empty,
}: {
  rows: T[];
  columns: { title: string; render: (row: T) => ReactNode }[];
  empty?: string;
}) {
  return rows.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c, j) => (
                <td key={j}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty text={empty} />
  );
}
export function Pager({
  offset,
  count,
  setOffset,
  size = 25,
}: {
  offset: number;
  count: number;
  setOffset: (value: number) => void;
  size?: number;
}) {
  return (
    <div className="pager">
      <span>{count ? `${offset + 1}–${offset + count}` : 'No results'}</span>
      <button
        className="button secondary small"
        disabled={!offset}
        onClick={() => setOffset(Math.max(0, offset - size))}
      >
        <ArrowLeft size={14} /> Previous
      </button>
      <button
        className="button secondary small"
        disabled={count < size}
        onClick={() => setOffset(offset + size)}
      >
        Next <ArrowRight size={14} />
      </button>
    </div>
  );
}
export function RawTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return <Empty />;
  const keys = Object.keys(rows[0]);
  return (
    <Table
      rows={rows}
      columns={keys.map((key) => ({
        title: label(key),
        render: (row: Record<string, unknown>) => (
          <span className="raw-cell">
            {typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key] ?? '—')}
          </span>
        ),
      }))}
    />
  );
}
