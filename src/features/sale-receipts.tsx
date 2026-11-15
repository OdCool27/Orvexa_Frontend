import { useRef, useState } from 'react';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import { saveDownload } from '../api/client';
import type { Sale } from '../api/checkout';
import { Feedback, Form, Input, useAction, str } from '../components/ui';
import { SaleCommandFeedback, useSaleCommand } from './sale-command';

export function ReceiptTools({ order, reload }: { order: Sale; reload: () => Promise<unknown> }) {
  const { api, user } = useAuth();
  const action = useAction();
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  const [queued, setQueued] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const command = useSaleCommand(async () => {
    await reload();
    return true;
  });
  if (order.payment_state !== 'CONFIRMED')
    return (
      <section className="panel padded">
        <h2>Receipt</h2>
        <p>A sale receipt becomes available only after the server confirms payment.</p>
      </section>
    );
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"><title>Orvexa receipt</title><style>body{font:13px monospace;padding:20px;color:#111;background:white}img{width:180px;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}@page{margin:12mm}</style></head><body><img src="${window.location.origin}/assets/orvexa-dark.png" alt="Orvexa"><pre>${escaped}</pre></body></html>`;
  return (
    <section className="panel padded">
      <h2>Receipt and delivery</h2>
      <p>
        Original saved sale amounts. Later returns/refunds have separate records and do not rewrite
        this receipt.
      </p>
      <Feedback action={action} />
      <div className="actions">
        <button
          className="button secondary"
          disabled={action.pending}
          onClick={() =>
            void action.run(async () => {
              const body = await api<Blob>(
                `/api/v1/checkout/orders/${order.id}/receipt?format=text`,
                'GET',
                undefined,
                true,
              );
              setReady(false);
              setText(await body.text());
            }, 'Receipt loaded.')
          }
        >
          Preview receipt
        </button>
        {['pdf', 'html', 'text'].map((format) => (
          <button
            key={format}
            className="button secondary"
            disabled={action.pending}
            onClick={() =>
              void action.run(
                async () =>
                  saveDownload(
                    await api<Blob>(
                      `/api/v1/checkout/orders/${order.id}/receipt?format=${format}`,
                      'GET',
                      undefined,
                      true,
                    ),
                    `receipt-${order.id}.${format === 'text' ? 'txt' : format}`,
                  ),
                'Receipt downloaded.',
              )
            }
          >
            Download {format.toUpperCase()}
          </button>
        ))}
        {text && (
          <button
            className="button primary"
            disabled={!ready}
            onClick={() => {
              frame.current?.contentWindow?.focus();
              frame.current?.contentWindow?.print();
            }}
          >
            Print receipt
          </button>
        )}
      </div>
      {text && (
        <iframe
          ref={frame}
          className="receipt-frame"
          title="Printable saved receipt"
          sandbox="allow-same-origin allow-modals"
          srcDoc={document}
          onLoad={() => setReady(true)}
        />
      )}
      {can(user, 'checkout') && (
        <>
          <h3>Email receipt</h3>
          <SaleCommandFeedback command={command} />
          {queued && (
            <p role="status">Receipt email queued to {queued}. Delivery is not confirmed.</p>
          )}
          <Form
            pending={command.pending}
            disabled={command.blocked}
            submit="Queue receipt email"
            onSubmit={(data) => {
              const email = str(data, 'email');
              void command.send(
                `/api/v1/checkout/orders/${order.id}/receipt-email`,
                { email },
                () => setQueued(email),
              );
            }}
          >
            <Input name="email" label="Receipt email address" type="email" maxLength={120} />
            <p className="form-hint">
              Use the customer’s requested address. Queueing is not proof of delivery; real sending
              depends on the configured mail provider.
            </p>
          </Form>
        </>
      )}
    </section>
  );
}
