import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/Auth';
import { ApiError, CommandIds } from '../api/client';
import { Feedback, useAction } from '../components/ui';
export interface SaleAttempt {
  path: string;
  body: Record<string, unknown>;
  after?: (response: unknown) => void | Promise<void>;
}
export function useSaleCommand(inspect: (attempt: SaleAttempt) => Promise<boolean>) {
  const { api } = useAuth();
  const action = useAction();
  const ids = useRef(new CommandIds());
  const [uncertain, setUncertain] = useState<SaleAttempt>();
  const [checked, setChecked] = useState(false);
  async function post(command: SaleAttempt) {
    setChecked(false);
    try {
      const response = await api(command.path, 'POST', command.body);
      setUncertain(undefined);
      ids.current.clear();
      await command.after?.(response);
    } catch (error) {
      const ambiguous =
        error instanceof ApiError &&
        ((error.status === 0 && error.code !== 'OFFLINE') ||
          error.status >= 500 ||
          error.status === 408);
      setUncertain((current) => current || (ambiguous ? command : undefined));
      throw error;
    }
  }
  return {
    ...action,
    blocked: !!uncertain,
    checked,
    send: (
      path: string,
      body: Record<string, unknown> | (() => Record<string, unknown>),
      after?: (response: unknown) => void | Promise<void>,
    ) => {
      if (uncertain) return Promise.resolve();
      return action.run(async () => {
        const value = typeof body === 'function' ? body() : body;
        await post({
          path,
          body: { ...value, requestId: ids.current.for({ path, body: value }) },
          after,
        });
      }, 'Server response received. Check the saved state.');
    },
    inspect: () =>
      uncertain
        ? action.run(async () => {
            setChecked(false);
            const retry = await inspect(uncertain);
            if (retry) setChecked(true);
            else {
              setUncertain(undefined);
              ids.current.clear();
            }
          }, 'Latest server state loaded. Review the result before continuing.')
        : Promise.resolve(),
    retry: () =>
      uncertain && checked
        ? action.run(
            () => post(uncertain),
            'Original command response received. Check the saved state.',
          )
        : Promise.resolve(),
  };
}
export function SaleCommandFeedback({ command }: { command: ReturnType<typeof useSaleCommand> }) {
  return (
    <>
      <Feedback action={command} />
      {command.blocked && (
        <div className="notice danger" role="alert">
          <div>
            <strong>The result is uncertain. Do not start another checkout or payment.</strong>
            <p>
              Keep this screen open. Load saved server state before retrying the unchanged command.
              After leaving or reloading, inspect order/payment history and resolve any hold before
              a new sale.
            </p>
            <div className="actions">
              <button
                className="button secondary"
                disabled={command.pending}
                onClick={() => void command.inspect()}
              >
                Check saved state
              </button>
              {command.checked && (
                <button
                  className="button secondary"
                  disabled={command.pending}
                  onClick={() => void command.retry()}
                >
                  Retry original command
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function useCheckoutConnection() {
  const [state, setState] = useState({ online: navigator.onLine, connectedAt: Date.now() });
  useEffect(() => {
    const online = () => setState({ online: true, connectedAt: Date.now() });
    const offline = () => setState((current) => ({ ...current, online: false }));
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);
  return state;
}
