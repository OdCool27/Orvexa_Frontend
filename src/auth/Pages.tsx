import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from './Auth';
import {
  AuthFrame,
  AuthLinks,
  CredentialsForm,
  LocalMailPreview,
  SessionNotice,
} from './AccountUI';
import { RequiredAccess } from './AccessSteps';
import { BusinessAccess } from '../features/businesses';
import { identityApi } from '../api/identity';
import { Feedback, Form, Input, str, useAction } from '../components/ui';
import { PasswordFields } from './AccountUI';
import { validatePassword, uncertainSessionChange } from '../lib/identity';
import { useLinkToken } from '../lib/useLinkToken';

export function LoginPage({ platform = false }: { platform?: boolean }) {
  const { identity, user, recoveryCodes, logout, transitioning } = useAuth();
  if (user && user.operator === platform)
    return <Navigate to={platform ? '/platform/businesses' : '/app'} replace />;
  return (
    <AuthFrame
      platform={platform}
      title={platform ? 'Osyntra staff sign-in' : 'Let’s get to work.'}
    >
      <SessionNotice />
      {recoveryCodes.length ? (
        <RequiredAccess />
      ) : identity && identity.operator !== platform ? (
        <section>
          <h3>{platform ? 'Tenant account detected' : 'Osyntra staff account detected'}</h3>
          <p>
            Platform staff and tenant workspaces use separate authority. Continue to the correct
            workspace or sign out.
          </p>
          <Link className="button primary" to={identity.operator ? '/platform/login' : '/login'}>
            Open {identity.operator ? 'staff console' : 'tenant sign-in'}
          </Link>
          <button className="text-button" onClick={logout}>
            Sign out
          </button>
        </section>
      ) : identity ? (
        recoveryCodes.length || identity.purpose !== 'FULL' ? (
          <RequiredAccess />
        ) : transitioning ? (
          <p role="status">Updating your secure session…</p>
        ) : platform ? (
          <p>No platform administration role is assigned to this account.</p>
        ) : (
          <>
            <h3>Choose or create a business</h3>
            <BusinessAccess embedded />
            <button className="text-button" onClick={logout}>
              Sign out
            </button>
          </>
        )
      ) : (
        <>
          <p className="muted">
            {platform
              ? 'Sign in using your Osyntra staff identity.'
              : 'Sign in with your account to access your businesses.'}
          </p>
          <CredentialsForm />
          <AuthLinks platform={platform} />
        </>
      )}
    </AuthFrame>
  );
}
export function RegisterPage() {
  const action = useAction();
  const [sent, setSent] = useState(false);
  return (
    <AuthFrame title="Create your Orvexa account">
      <p className="muted">
        One identity can join multiple businesses. Verify your email before creating a workspace.
      </p>
      <Feedback action={action} />
      {sent ? (
        <>
          <p>
            If registration is applicable, verification instructions have been queued. The response
            does not reveal whether an email already has an account.
          </p>
          <Link className="button primary" to="/login">
            Sign in to continue
          </Link>
        </>
      ) : (
        <Form
          submit="Create account"
          pending={action.pending}
          onSubmit={(data) =>
            action.run(async () => {
              await identityApi.register({
                firstName: str(data, 'firstName'),
                lastName: str(data, 'lastName'),
                email: str(data, 'email'),
                password: validatePassword(
                  String(data.get('password') || ''),
                  String(data.get('confirmation') || ''),
                ),
              });
              setSent(true);
            }, 'If applicable, verification instructions have been queued.')
          }
        >
          <Input name="firstName" label="First name" maxLength={30} />
          <Input name="lastName" label="Last name" maxLength={30} />
          <div className="span-2">
            <Input
              name="email"
              label="Email address"
              type="email"
              autoComplete="email"
              maxLength={50}
            />
          </div>
          <PasswordFields />
        </Form>
      )}
      <AuthLinks />
    </AuthFrame>
  );
}
export function ForgotPasswordPage() {
  const action = useAction();
  return (
    <AuthFrame title="Reset your password">
      <p>
        Enter your account email. If the request is applicable, the configured email service queues
        an expiring link. MFA remains enabled.
      </p>
      <Feedback action={action} />
      <Form
        pending={action.pending}
        submit="Request reset link"
        onSubmit={(data) =>
          action.run(
            () => identityApi.requestEmail(str(data, 'email'), true),
            'If applicable, password reset instructions have been queued.',
          )
        }
      >
        <div className="span-2">
          <Input
            name="email"
            label="Email address"
            type="email"
            autoComplete="email"
            maxLength={50}
          />
        </div>
      </Form>
      <Link className="text-link" to="/login">
        Back to sign-in
      </Link>
    </AuthFrame>
  );
}
export function VerifyEmailPage() {
  const token = useLinkToken();
  const { identity, requireSignIn } = useAuth();
  const action = useAction();
  const [complete, setComplete] = useState(false);
  return (
    <AuthFrame title="Verify your email">
      <Feedback action={action} />
      {complete ? (
        <>
          <p>Email verification completed. Existing sessions were revoked.</p>
          <Link className="button primary" to="/login">
            Sign in again
          </Link>
        </>
      ) : (
        <>
          <p>
            Confirm the single-use token from your verification link. Expired, replaced or
            already-used tokens require a new link.
          </p>
          <Form
            pending={action.pending}
            submit="Confirm email verification"
            onSubmit={(data) =>
              action.run(async () => {
                try {
                  await identityApi.verifyEmail(str(data, 'token'));
                } catch (error) {
                  uncertainSessionChange(
                    error,
                    requireSignIn,
                    'Verification could not be confirmed. Sign in again to check email status before retrying the link.',
                  );
                }
                requireSignIn('Email verified. Sign in again to continue.');
                setComplete(true);
              }, 'Email verified.')
            }
          >
            <div className="span-2">
              <Input
                name="token"
                label="Verification token"
                value={token}
                autoComplete="off"
                maxLength={100}
              />
            </div>
          </Form>
          <h3>Need a new link?</h3>
          <Form
            pending={action.pending}
            submit="Request verification link"
            onSubmit={(data) =>
              action.run(
                () => identityApi.requestEmail(str(data, 'email')),
                'If applicable, verification instructions have been queued.',
              )
            }
          >
            <div className="span-2">
              <Input
                name="email"
                label="Email address"
                type="email"
                value={identity?.email}
                autoComplete="email"
                maxLength={50}
              />
            </div>
          </Form>
          {identity && <LocalMailPreview />}
          <Link className="text-link" to="/login">
            Back to sign-in
          </Link>
        </>
      )}
    </AuthFrame>
  );
}
export function ResetPasswordPage() {
  const token = useLinkToken();
  const { requireSignIn } = useAuth();
  const action = useAction();
  const [complete, setComplete] = useState(false);
  return (
    <AuthFrame title="Choose a new password">
      <Feedback action={action} />
      {complete ? (
        <>
          <p>Password reset completed. MFA is unchanged and existing sessions were revoked.</p>
          <Link className="button primary" to="/login">
            Sign in again
          </Link>
        </>
      ) : (
        <>
          <p>
            Use the token from your reset link. A failed or expired link does not change your
            password.
          </p>
          <Form
            pending={action.pending}
            submit="Save new password"
            onSubmit={(data) =>
              action.run(async () => {
                try {
                  await identityApi.resetPassword(
                    str(data, 'token'),
                    validatePassword(
                      String(data.get('password') || ''),
                      String(data.get('confirmation') || ''),
                    ),
                  );
                } catch (error) {
                  uncertainSessionChange(
                    error,
                    requireSignIn,
                    'Password reset could not be confirmed. Sign in again or request a new reset link; no successful reset is assumed.',
                  );
                }
                requireSignIn('Password reset. Sign in again; MFA remains enabled.');
                setComplete(true);
              }, 'Password reset completed.')
            }
          >
            <div className="span-2">
              <Input
                name="token"
                label="Reset token"
                value={token}
                autoComplete="off"
                maxLength={100}
              />
            </div>
            <PasswordFields />
          </Form>
          <Link className="text-link" to="/forgot-password">
            Request another link
          </Link>
        </>
      )}
    </AuthFrame>
  );
}
export function AcceptInvitationPage() {
  const token = useLinkToken();
  const { identity, recoveryCodes, sessionApi, requireSignIn, logout } = useAuth();
  const action = useAction();
  const [existing, setExisting] = useState(true);
  const [complete, setComplete] = useState(false);
  const canAccept =
    identity && ['FULL', 'VERIFY_EMAIL'].includes(identity.purpose) && !recoveryCodes.length;
  return (
    <AuthFrame title="Join a business">
      <Feedback action={action} />
      <SessionNotice />
      {complete ? (
        <>
          <p>
            Invitation accepted. Sign in again to load your updated memberships and any required
            owner MFA.
          </p>
          <Link className="button primary" to="/login">
            Sign in again
          </Link>
        </>
      ) : (
        <>
          <p>
            Use a valid invitation token. The server verifies the recipient, expiry, issuer
            authority and branch grants. Expired, revoked or already-used links require a
            replacement from the business.
          </p>
          {identity?.operator ? (
            <section>
              <h3>Use a separate merchant identity</h3>
              <p>Osyntra platform identities cannot join tenant businesses.</p>
              <button className="button secondary" onClick={logout}>
                Sign out and use a merchant account
              </button>
            </section>
          ) : identity && !canAccept ? (
            <RequiredAccess />
          ) : (
            <>
              <label className="checkbox">
                <input
                  checked={existing}
                  type="checkbox"
                  onChange={(e) => setExisting(e.target.checked)}
                  disabled={!!identity}
                />{' '}
                I already have an Orvexa account
              </label>
              {existing && !identity ? (
                <>
                  <p className="muted">
                    Sign in here with the email that received the invitation. The invitation token
                    stays only on this page.
                  </p>
                  <CredentialsForm />
                </>
              ) : null}
              {(!existing || canAccept) && (
                <>
                  <p className="muted">
                    {canAccept
                      ? `Accepting as ${identity.email}. A different recipient must sign out first.`
                      : 'Create the recipient’s global identity using this invitation.'}
                  </p>
                  <Form
                    pending={action.pending}
                    submit="Accept invitation"
                    onSubmit={(data) =>
                      action.run(async () => {
                        const invitationToken = str(data, 'token');
                        try {
                          if (canAccept)
                            await sessionApi('/api/v1/invitations/accept', 'POST', {
                              token: invitationToken,
                            });
                          else
                            await identityApi.acceptNewInvitation({
                              token: invitationToken,
                              firstName: str(data, 'firstName'),
                              lastName: str(data, 'lastName'),
                              password: validatePassword(
                                String(data.get('password') || ''),
                                String(data.get('confirmation') || ''),
                              ),
                            });
                        } catch (error) {
                          uncertainSessionChange(
                            error,
                            requireSignIn,
                            'Invitation acceptance could not be confirmed. Sign in again and review memberships before retrying.',
                          );
                        }
                        requireSignIn('Invitation accepted. Sign in again to select the business.');
                        setComplete(true);
                      }, 'Invitation accepted.')
                    }
                  >
                    <div className="span-2">
                      <Input
                        name="token"
                        label="Invitation token"
                        value={token}
                        autoComplete="off"
                        maxLength={100}
                      />
                    </div>
                    {!canAccept && (
                      <>
                        <Input name="firstName" label="First name" maxLength={30} />
                        <Input name="lastName" label="Last name" maxLength={30} />
                        <PasswordFields />
                      </>
                    )}
                  </Form>
                </>
              )}
              {identity && (
                <button className="text-button" onClick={logout}>
                  Sign out and use another account
                </button>
              )}
            </>
          )}
        </>
      )}
      <Link className="text-link" to="/login">
        Back to sign-in
      </Link>
    </AuthFrame>
  );
}
