import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/Auth';
import { useSessionQuery } from '../auth/queries';
import { SessionNotice } from '../auth/AccountUI';
import type { Membership } from '../api/identity';
import {
  Badge,
  ErrorBox,
  Feedback,
  Form,
  Heading,
  Input,
  Loading,
  Modal,
  num,
  str,
  useAction,
} from '../components/ui';
import { label } from '../lib/format';
import { uncertainSessionChange } from '../lib/identity';
import { Brand } from '../components/Brand';

export function BusinessAccess({ embedded = false }: { embedded?: boolean }) {
  const { identity, rotate, sessionApi, requireSignIn } = useAuth();
  const navigate = useNavigate();
  const action = useAction();
  const memberships = useSessionQuery<Membership[]>('/api/v1/memberships');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<Membership>();
  return (
    <section>
      {!embedded && (
        <Heading
          eyebrow="YOUR BUSINESS MEMBERSHIPS"
          title="Business workspaces"
          description="Choose a business, create your own, or join using an invitation."
        />
      )}
      {!embedded && <SessionNotice />}
      {!selected && <Feedback action={action} />}
      <ErrorBox error={memberships.error} />
      {memberships.isLoading ? (
        <Loading text="Loading memberships…" />
      ) : (
        <div className="membership-list">
          {memberships.data?.map((m) => (
            <article key={m.id}>
              <div>
                <strong>{m.business_name}</strong>
                <small>
                  {label(m.role)} ·{' '}
                  {m.all_branches
                    ? 'All branches'
                    : `${m.branchIds?.length || 0} permitted branches`}
                </small>
              </div>
              {m.status !== 'ACTIVE' ? (
                <Badge value={m.status} />
              ) : m.id === identity?.activeMembershipId ? (
                <Badge value="CURRENT" />
              ) : (
                <button
                  className="button secondary small"
                  disabled={action.pending}
                  onClick={() => setSelected(m)}
                >
                  Open workspace
                </button>
              )}
            </article>
          ))}
          {memberships.data?.length === 0 && (
            <p className="muted">
              You have no memberships yet. Create a business or accept an invitation from its owner.
            </p>
          )}
        </div>
      )}
      <div className="actions">
        <button className="button primary" onClick={() => setCreate(!create)}>
          {create ? 'Cancel creation' : 'Create a business'}
        </button>
        <Link className="text-link" to="/accept-invitation">
          Join with an invitation
        </Link>
        <Link className="text-link" to="/account/security">
          Account & security
        </Link>
      </div>
      {create && (
        <div className="panel padded">
          <h3>Create your business</h3>
          <p className="muted">
            You become the owner. All sessions are revoked; sign in again and complete required
            owner MFA afterward.
          </p>
          <Form
            pending={action.pending}
            submit="Create business"
            onSubmit={(data) =>
              action.run(async () => {
                try {
                  await sessionApi('/api/v1/businesses', 'POST', {
                    name: str(data, 'name'),
                    locationName: str(data, 'locationName'),
                    currency: str(data, 'currency'),
                    defaultThreshold: num(data, 'defaultThreshold'),
                  });
                } catch (error) {
                  uncertainSessionChange(
                    error,
                    requireSignIn,
                    'Business creation could not be confirmed. Sign in again and review memberships before creating another business.',
                  );
                }
                requireSignIn(
                  'Business created. Sign in again to complete owner MFA and select your workspace.',
                );
                navigate('/login');
              }, '')
            }
          >
            <Input name="name" label="Business name" maxLength={120} />
            <Input name="locationName" label="First branch name" maxLength={80} />
            <Input name="currency" label="Currency code" value="JMD" minLength={3} maxLength={3} />
            <Input
              name="defaultThreshold"
              label="Default stock threshold"
              type="number"
              min={0}
              step="1"
              value={3}
            />
          </Form>
        </div>
      )}
      {selected && (
        <Modal title="Switch business workspace" close={() => setSelected(undefined)}>
          <p>
            Switch to {selected.business_name}? Unsaved forms and the staff cart are cleared.
            Existing reservations and payments remain on the server and must be reviewed in their
            original business.
          </p>
          <Feedback action={action} />
          <button
            className="button primary"
            disabled={action.pending}
            onClick={() =>
              action.run(
                () => rotate('/api/v1/auth/business', { membershipId: selected.id }),
                '',
                () => navigate('/app'),
              )
            }
          >
            Switch to {selected.business_name}
          </button>
        </Modal>
      )}
    </section>
  );
}
export function BusinessSwitcher() {
  const { identity, user } = useAuth();
  if (!user || user.operator) return null;
  const active = identity?.memberships.find((m) => m.id === identity.activeMembershipId);
  return (
    <Link to="/businesses" className="business-switcher" aria-label="Switch business workspace">
      {active?.business_name || 'Business workspace'} <span>Switch</span>
    </Link>
  );
}
export function BusinessPage() {
  const { user, logout } = useAuth();
  return (
    <main className="page standalone-page">
      <div className="store-toolbar">
        <Brand />
        <div className="actions">
          {user && (
            <Link className="button secondary" to="/app">
              Back to workspace
            </Link>
          )}
          <button className="button secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
      <BusinessAccess />
    </main>
  );
}
