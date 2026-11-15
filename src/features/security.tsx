import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/Auth';
import { useSessionQuery } from '../auth/queries';
import { Enrollment } from '../auth/AccessSteps';
import { AuthFrame, LocalMailPreview, OneTimeCodes, SessionNotice } from '../auth/AccountUI';
import type { ActiveSession } from '../api/identity';
import type { Row } from '../api/types';
import {
  Badge,
  ErrorBox,
  Feedback,
  Form,
  Heading,
  Input,
  Loading,
  Modal,
  Pager,
  str,
  Table,
  useAction,
} from '../components/ui';
import { date } from '../lib/format';

export function SecurityPage({
  platform = false,
  standalone = false,
}: {
  platform?: boolean;
  standalone?: boolean;
}) {
  const { identity, sessionApi, rotate, requireSignIn, recoveryCodes } = useAuth();
  const sessions = useSessionQuery<ActiveSession[]>('/api/v1/auth/sessions');
  const [offset, setOffset] = useState(0);
  const events = useSessionQuery<Row[]>(`/api/v1/auth/security-events?limit=25&offset=${offset}`);
  const action = useAction();
  const [revoke, setRevoke] = useState<string>();
  const [enroll, setEnroll] = useState(false);
  const [disable, setDisable] = useState(false);
  if (recoveryCodes.length) return <OneTimeCodes />;
  const content = (
    <>
      <Heading
        eyebrow="YOUR GLOBAL IDENTITY"
        title="Account & security"
        description="These settings apply to your identity across every business."
      />
      <SessionNotice />
      {!revoke && !disable && <Feedback action={action} />}
      <section className="panel padded">
        <h2>
          {identity?.first_name} {identity?.last_name}
        </h2>
        <p>{identity?.email}</p>
        <Link className="text-link" to="/forgot-password">
          Request a password reset
        </Link>
        <div className="actions">
          <Badge value={identity?.email_verified ? 'EMAIL_VERIFIED' : 'VERIFY_EMAIL'} />
          <Badge value={identity?.mfa_enabled ? 'MFA_ENABLED' : 'MFA_NOT_ENABLED'} />
        </div>
        <p className="muted">
          {identity?.mfaRequired
            ? 'MFA is mandatory for your Owner or platform role.'
            : 'An authenticator adds another check at sign-in.'}
        </p>
        <div className="actions">
          {!identity?.mfa_enabled && (
            <button className="button primary" onClick={() => setEnroll(!enroll)}>
              Enable authenticator MFA
            </button>
          )}
          {!!identity?.mfa_enabled && !identity.mfaRequired && (
            <button className="button secondary" onClick={() => setDisable(true)}>
              Disable optional MFA
            </button>
          )}
        </div>
        {enroll && <Enrollment />}
        <LocalMailPreview />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Active sessions</h2>
            <p className="muted">
              The server does not identify which row is this browser. Revoking it may sign you out.
            </p>
          </div>
          <button className="button secondary" onClick={() => setRevoke('ALL')}>
            Sign out all sessions
          </button>
        </div>
        <ErrorBox error={sessions.error} />
        {sessions.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={sessions.data || []}
            columns={[
              { title: 'Session', render: (s) => <code>{s.id.slice(0, 8)}</code> },
              { title: 'Membership', render: (s) => s.membership_id ?? 'No business selected' },
              { title: 'Created', render: (s) => date(new Date(s.created_ms).toISOString()) },
              { title: 'Last active', render: (s) => date(new Date(s.last_seen_ms).toISOString()) },
              { title: 'Expires', render: (s) => date(new Date(s.expires_ms).toISOString()) },
              {
                title: '',
                render: (s) => (
                  <button className="text-button danger-text" onClick={() => setRevoke(s.id)}>
                    Revoke session
                  </button>
                ),
              },
            ]}
          />
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Your security activity</h2>
        </div>
        <ErrorBox error={events.error} />
        <Table
          rows={events.data || []}
          columns={[
            { title: 'When', render: (e) => date(new Date(Number(e.created_ms)).toISOString()) },
            { title: 'Action', render: (e) => String(e.action) },
            { title: 'Business', render: (e) => String(e.business_id ?? 'Identity') },
            { title: 'Details', render: (e) => String(e.details ?? '—') },
          ]}
        />
        <Pager offset={offset} count={events.data?.length || 0} setOffset={setOffset} />
      </section>
      {revoke && (
        <Modal
          title={revoke === 'ALL' ? 'Sign out every session' : 'Revoke session'}
          close={() => setRevoke(undefined)}
        >
          <p>
            {revoke === 'ALL'
              ? 'Revoke all active sessions, including this browser?'
              : 'Revoke this session? If it belongs to this browser, sign in again afterward.'}
          </p>
          <Feedback action={action} />
          <button
            className="button danger-button"
            disabled={action.pending}
            onClick={() =>
              action.run(
                async () => {
                  if (revoke === 'ALL') {
                    try {
                      await sessionApi('/api/v1/auth/logout-all', 'POST');
                    } catch (error) {
                      requireSignIn(
                        'Signed out locally. Revocation of all server sessions could not be confirmed; sign in again to review active sessions.',
                      );
                      throw error;
                    }
                    requireSignIn('All sessions revoked. Sign in again.');
                  } else {
                    await sessionApi(`/api/v1/auth/sessions/${revoke}`, 'DELETE');
                    await sessionApi('/api/v1/auth/me');
                  }
                },
                'Session revoked.',
                () => setRevoke(undefined),
              )
            }
          >
            Confirm revocation
          </button>
        </Modal>
      )}
      {disable && (
        <Modal title="Disable optional MFA" close={() => setDisable(false)}>
          <p>
            This revokes all sessions and removes recovery codes. Owners and platform staff cannot
            disable mandatory MFA.
          </p>
          <Feedback action={action} />
          <Form
            pending={action.pending}
            submit="Disable MFA"
            onSubmit={(data) =>
              action.run(
                () =>
                  rotate('/api/v1/auth/mfa/disable', {
                    password: String(data.get('password') || ''),
                    code: str(data, 'code'),
                  }),
                'MFA disabled.',
                () => setDisable(false),
              )
            }
          >
            <Input
              name="password"
              label="Current password"
              type="password"
              autoComplete="current-password"
            />
            <Input name="code" label="Authenticator code" minLength={6} maxLength={6} />
          </Form>
        </Modal>
      )}
    </>
  );
  return platform || standalone ? (
    <AuthFrame
      title={platform ? 'Osyntra staff security' : 'Your account & security'}
      platform={platform}
    >
      <Link className="text-link" to={platform ? '/platform/businesses' : '/businesses'}>
        Back to {platform ? 'staff console' : 'business workspaces'}
      </Link>
      {content}
    </AuthFrame>
  ) : (
    content
  );
}
