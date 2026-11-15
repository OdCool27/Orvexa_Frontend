import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './Auth';
import { identityApi, type MfaSetup } from '../api/identity';
import { Feedback, Field, Form, Input, str, useAction } from '../components/ui';
import { LocalMailPreview, OneTimeCodes } from './AccountUI';
import { date } from '../lib/format';

export function Enrollment() {
  const { identity, sessionApi, rotate } = useAuth();
  const action = useAction();
  const [setup, setSetup] = useState<MfaSetup>();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expired = !!setup && Date.parse(setup.expiresAt) <= now;
  return (
    <section>
      <h3>MFA enrollment required</h3>
      <p>
        Add Orvexa to an authenticator using the manual setup key. Owners and Osyntra platform staff
        must use MFA.
      </p>
      <Feedback action={action} />
      <Form
        submit={setup ? 'Generate a new setup key' : 'Set up authenticator'}
        pending={action.pending}
        onSubmit={(data) =>
          action.run(
            async () =>
              setSetup(
                await sessionApi<MfaSetup>(
                  '/api/v1/auth/mfa/setup',
                  'POST',
                  identity?.purpose === 'FULL'
                    ? { password: String(data.get('password') || '') }
                    : {},
                ),
              ),
            'Setup key generated. Previous pending keys are replaced.',
          )
        }
      >
        {identity?.purpose === 'FULL' && (
          <div className="span-2">
            <Input
              name="password"
              label="Current password"
              type="password"
              autoComplete="current-password"
            />
          </div>
        )}
      </Form>
      {setup && (
        <div className="auth-next-step">
          <Field label="Manual authenticator setup key">
            <input
              name="authenticatorSecret"
              readOnly
              value={setup.secret}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <p className="form-hint">
            TOTP · SHA1 · 6 digits · 30 seconds. Expires {date(setup.expiresAt)}.
          </p>
          <a className="text-link" href={setup.otpauthUri}>
            Open an installed authenticator
          </a>
          {expired ? (
            <p role="alert" className="danger-text">
              This setup expired. Generate a new key.
            </p>
          ) : (
            <Form
              submit="Confirm authenticator"
              pending={action.pending}
              onSubmit={(data) =>
                action.run(
                  () => rotate('/api/v1/auth/mfa/confirm', { code: str(data, 'code') }),
                  '',
                )
              }
            >
              <div className="span-2">
                <Field label="Authenticator code">
                  <input
                    name="code"
                    required
                    pattern="[0-9]{6}"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    minLength={6}
                    maxLength={6}
                  />
                </Field>
              </div>
            </Form>
          )}
        </div>
      )}
    </section>
  );
}
export function MfaChallenge() {
  const { rotate } = useAuth();
  const action = useAction();
  const [recovery, setRecovery] = useState(false);
  const [reset, setReset] = useState(false);
  return (
    <section>
      <h3>MFA verification required</h3>
      <p>
        Enter a current authenticator code{recovery ? ' or use a saved one-time recovery code' : ''}
        . A code can be used only once.
      </p>
      <Feedback action={action} />
      {reset ? (
        <>
          <p className="notice info">
            Replacing your authenticator revokes all sessions and consumes a recovery code. You must
            enroll a new authenticator afterward.
          </p>
          <Form
            pending={action.pending}
            submit="Replace lost authenticator"
            onSubmit={(data) =>
              action.run(
                () =>
                  rotate('/api/v1/auth/mfa/recover', {
                    password: String(data.get('password') || ''),
                    recoveryCode: str(data, 'recoveryCode'),
                  }),
                '',
              )
            }
          >
            <Input
              name="password"
              label="Current password"
              type="password"
              autoComplete="current-password"
            />
            <Input
              name="recoveryCode"
              label="Unused recovery code"
              type="password"
              autoComplete="off"
            />
            <label className="checkbox span-2">
              <input required type="checkbox" /> Revoke all sessions and replace my authenticator.
            </label>
          </Form>
          <button className="text-button" onClick={() => setReset(false)}>
            Back to verification
          </button>
        </>
      ) : (
        <>
          <Form
            pending={action.pending}
            submit="Verify and continue"
            onSubmit={(data) =>
              action.run(
                () =>
                  rotate(
                    '/api/v1/auth/mfa/verify',
                    recovery
                      ? { recoveryCode: str(data, 'recoveryCode') }
                      : { code: str(data, 'code') },
                  ),
                '',
              )
            }
          >
            <div className="span-2">
              {recovery ? (
                <Input
                  name="recoveryCode"
                  label="Recovery code"
                  type="password"
                  autoComplete="off"
                />
              ) : (
                <Field label="Authenticator code">
                  <input
                    name="code"
                    required
                    pattern="[0-9]{6}"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    minLength={6}
                    maxLength={6}
                    autoFocus
                  />
                </Field>
              )}
            </div>
          </Form>
          <div className="account-links">
            <button
              className="text-button"
              onClick={() => {
                action.clear();
                setRecovery(!recovery);
              }}
            >
              {recovery ? 'Use authenticator code' : 'Use recovery code'}
            </button>
            <button
              className="text-button"
              onClick={() => {
                action.clear();
                setReset(true);
              }}
            >
              Replace a lost authenticator
            </button>
          </div>
        </>
      )}
    </section>
  );
}
export function RequiredAccess() {
  const { identity, recoveryCodes, logout } = useAuth();
  const action = useAction();
  if (recoveryCodes.length) return <OneTimeCodes />;
  if (!identity) return null;
  return (
    <>
      <Feedback action={action} />
      {identity.purpose === 'MFA_ENROLL' ? (
        <Enrollment />
      ) : identity.purpose === 'MFA_CHALLENGE' ? (
        <MfaChallenge />
      ) : identity.purpose === 'VERIFY_EMAIL' ? (
        <section>
          <h3>Email verification required</h3>
          <p>
            Verify {identity.email} using the single-use link delivered by your configured email
            service. After confirmation, sign in again.
          </p>
          <button
            className="button primary"
            disabled={action.pending}
            onClick={() =>
              action.run(
                () => identityApi.requestEmail(identity.email),
                'If applicable, a verification email has been queued. Older links are invalidated.',
              )
            }
          >
            Resend verification email
          </button>
          <Link className="text-link" to="/verify-email">
            Enter or open a verification link
          </Link>
          <LocalMailPreview />
        </section>
      ) : null}
      <button className="text-button" onClick={logout}>
        Sign out of this session
      </button>
    </>
  );
}
