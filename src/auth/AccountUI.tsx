import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from '../components/Brand';
import { ErrorBox, Feedback, Form, Input, Loading, str, useAction } from '../components/ui';
import { useAuth } from './Auth';
import { useSessionQuery } from './queries';
import type { MailPreview } from '../api/identity';
import { date } from '../lib/format';

export function AuthFrame({
  title,
  children,
  platform = false,
}: {
  title: string;
  children: ReactNode;
  platform?: boolean;
}) {
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand surface="dark" />
        <div>
          <span className="overline light">
            {platform ? 'OSYNTRA STAFF ACCESS' : 'A CLEARER VIEW OF YOUR BUSINESS'}
          </span>
          <h1>
            {platform ? (
              <>
                A separate space.
                <br />
                <em>For platform staff.</em>
              </>
            ) : (
              <>
                Every product.
                <br />
                Every movement.
                <br />
                <em>One workspace.</em>
              </>
            )}
          </h1>
          <p>
            {platform
              ? 'Platform administration uses separate staff authority and mandatory MFA. Tenant roles never grant platform access.'
              : 'Bring your inventory, people, and sales together. Built for the way your business works.'}
          </p>
        </div>
        <div className="login-foot">
          Inventory, in sync. <span>ORVEXA BY OSYNTRA</span>
        </div>
      </section>
      <main className="login-panel">
        <div className="login-card account-card">
          <span className="overline">
            {platform ? 'OSYNTRA ADMINISTRATION' : 'WELCOME TO ORVEXA'}
          </span>
          <h2>{title}</h2>
          {children}
        </div>
        <p className="account-footer">Orvexa by Osyntra · Online workspace</p>
      </main>
    </div>
  );
}
export function PasswordFields() {
  return (
    <>
      <Input
        name="password"
        label="Password"
        type="password"
        minLength={12}
        maxLength={72}
        autoComplete="new-password"
      />
      <Input
        name="confirmation"
        label="Confirm password"
        type="password"
        minLength={12}
        maxLength={72}
        autoComplete="new-password"
      />
      <p className="form-hint span-2">
        Use 12–72 characters and at most 72 UTF-8 bytes. Passwords are never stored in this browser.
      </p>
    </>
  );
}
export function CredentialsForm() {
  const { login } = useAuth();
  const action = useAction();
  return (
    <>
      <Feedback action={action} />
      <Form
        submit="Sign in to workspace"
        pending={action.pending}
        onSubmit={(data) =>
          action.run(() => login(str(data, 'email'), String(data.get('password') || '')), '')
        }
      >
        <div className="span-2">
          <Input
            name="email"
            label="Email address"
            type="email"
            autoComplete="username"
            maxLength={50}
          />
        </div>
        <div className="span-2">
          <Input
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            maxLength={72}
          />
        </div>
      </Form>
    </>
  );
}
export function AuthLinks({ platform = false }: { platform?: boolean }) {
  return (
    <nav className="account-links" aria-label="Account links">
      <Link to="/forgot-password">Forgot password?</Link>
      {!platform && <Link to="/register">Create an account</Link>}
      <Link to={platform ? '/login' : '/platform/login'}>
        {platform ? 'Tenant workspace sign-in' : 'Osyntra staff sign-in'} <ArrowUpRight size={13} />
      </Link>
      {!platform && <Link to="/store">Visit a demo storefront</Link>}
    </nav>
  );
}
export function LocalMailPreview() {
  const [open, setOpen] = useState(false);
  const messages = useSessionQuery<MailPreview[]>('/api/v1/auth/mail-preview', open);
  if (!import.meta.env.DEV) return null;
  return (
    <section className="mail-preview">
      <button className="text-button" onClick={() => setOpen(!open)}>
        {open ? 'Hide local email preview' : 'Local email preview'}
      </button>
      {open && (
        <>
          <p className="form-hint">
            Development only. The server must explicitly enable loopback preview; results are
            limited to mail you receive or issue. A queued message does not prove external delivery.
          </p>
          <ErrorBox error={messages.error} />
          {messages.isLoading ? (
            <Loading text="Loading your preview messages…" />
          ) : (
            messages.data?.map((m) => {
              const urls = m.body.match(/https?:\/\/[^\s]+/g) || [];
              return (
                <details key={m.id}>
                  <summary>
                    {m.subject} · {m.recipient}
                  </summary>
                  <p className="muted">
                    {date(new Date(m.created_ms).toISOString())} · {m.status}
                  </p>
                  <pre>{m.body}</pre>
                  {urls.map((url, i) => {
                    try {
                      const parsed = new URL(url);
                      if (
                        !['/verify-email', '/reset-password', '/accept-invitation'].includes(
                          parsed.pathname,
                        )
                      )
                        return null;
                      return (
                        <Link key={i} className="text-link" to={parsed.pathname + parsed.search}>
                          Open account link
                        </Link>
                      );
                    } catch {
                      return null;
                    }
                  })}
                </details>
              );
            })
          )}
          {messages.data?.length === 0 && (
            <p className="muted">No scoped preview messages are available.</p>
          )}
        </>
      )}
    </section>
  );
}
export function SessionNotice() {
  const { notice } = useAuth();
  return notice ? (
    <div role="status" className="notice info">
      {notice}
    </div>
  ) : null;
}
export function SessionPending() {
  return (
    <main className="page">
      <Loading text="Securing your session and clearing the previous workspace…" />
    </main>
  );
}
export function OneTimeCodes() {
  const { recoveryCodes, acknowledgeRecovery, logout } = useAuth();
  const [saved, setSaved] = useState(false);
  return (
    <section aria-label="Save recovery codes">
      <h3>Save your recovery codes</h3>
      <p>
        These one-time codes are shown only now. Store them securely outside this browser. They can
        restore access if you lose your authenticator.
      </p>
      <pre className="recovery-codes" aria-label="Recovery codes">
        {recoveryCodes.join('\n')}
      </pre>
      <label className="checkbox">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I
        saved these codes securely.
      </label>
      <div className="actions">
        <button className="button primary" disabled={!saved} onClick={acknowledgeRecovery}>
          Continue securely
        </button>
        <button className="button secondary" onClick={logout}>
          Sign out
        </button>
      </div>
    </section>
  );
}
