import { useEffect, useState } from 'react';
import { useAuth } from '../auth/Auth';
import { useWorkspace } from '../app/workspace';
import { useSessionQuery } from '../auth/queries';
import { LocalMailPreview } from '../auth/AccountUI';
import type { BusinessMember, Invitation, InviteRequest, Membership } from '../api/identity';
import type { Location, Role } from '../api/types';
import {
  Badge,
  ErrorBox,
  Feedback,
  Field,
  Form,
  Heading,
  Input,
  Loading,
  Modal,
  str,
  Table,
  useAction,
  useApiQuery,
} from '../components/ui';
import { assignableRoles, invitationStatus } from '../lib/identity';
import { date, label } from '../lib/format';

function GrantsForm({
  initialRole = 'CASHIER',
  initialAll = false,
  branches,
  roles,
  canGrantAll,
  onSubmit,
  pending,
  editing = false,
  children,
  submit,
}: {
  initialRole?: Role;
  initialAll?: boolean;
  branches: Location[];
  roles: Role[];
  canGrantAll: boolean;
  onSubmit: (grant: Omit<InviteRequest, 'email'>, data: FormData) => void;
  pending: boolean;
  editing?: boolean;
  children?: React.ReactNode;
  submit: string;
}) {
  const [role, setRole] = useState<Role>(initialRole === 'CLERK' ? 'INVENTORY_CLERK' : initialRole);
  const [all, setAll] = useState(initialAll);
  const [ids, setIds] = useState<number[]>([]);
  return (
    <Form
      pending={pending}
      submit={submit}
      onSubmit={(data) => {
        onSubmit({ role, allBranches: all, branchIds: all ? [] : ids }, data);
      }}
    >
      {children}
      <Field label="Membership role">
        <select
          value={role}
          onChange={(e) => {
            const next = e.target.value as Role;
            setRole(next);
            if (next === 'OWNER') setAll(true);
          }}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {label(r)}
            </option>
          ))}
        </select>
      </Field>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={all}
          disabled={!canGrantAll || role === 'OWNER'}
          onChange={(e) => setAll(e.target.checked)}
        />{' '}
        All current and future branches
      </label>
      {!all && (
        <div className="span-2">
          <fieldset className="branch-grants">
            <legend>Permitted branches</legend>
            {branches.map((b) => (
              <label className="checkbox" key={b.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(b.id)}
                  onChange={(e) =>
                    setIds(e.target.checked ? [...ids, b.id] : ids.filter((id) => id !== b.id))
                  }
                />
                {b.name}
              </label>
            ))}
          </fieldset>
          {editing && (
            <>
              <p className="form-hint">
                The API does not return this person’s existing branch IDs. Select the complete
                replacement grant set; saving replaces previous branch access.
              </p>
              <label className="checkbox">
                <input type="checkbox" required /> I confirm this replacement of branch access.
              </label>
            </>
          )}
        </div>
      )}
    </Form>
  );
}
export function Team() {
  const { user, identity, api, requireSignIn } = useAuth();
  const { locations } = useWorkspace();
  const members = useApiQuery<BusinessMember[]>('/api/v1/business/memberships');
  const invitations = useApiQuery<Invitation[]>('/api/v1/invitations', true, true);
  const mine = useSessionQuery<Membership[]>('/api/v1/memberships');
  const action = useAction();
  const [editing, setEditing] = useState<BusinessMember>();
  const [invite, setInvite] = useState(false);
  const [reissue, setReissue] = useState<Invitation>();
  const [revoking, setRevoking] = useState<Invitation>();
  const [revoked, setRevoked] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const own = mine.data?.find((m) => m.id === identity?.activeMembershipId);
  const canGrantAll = !!own?.all_branches;
  const roles = assignableRoles(user?.role).filter((r) => r !== 'OWNER' || canGrantAll);
  function checkGrant(grant: Omit<InviteRequest, 'email'>) {
    if (!grant.allBranches && !grant.branchIds.length)
      throw new Error('Choose at least one permitted branch.');
  }
  function closeInvite() {
    setInvite(false);
    setReissue(undefined);
    setRevoked(false);
    void invitations.refetch();
  }
  return (
    <>
      <Heading
        eyebrow="BUSINESS MEMBERSHIPS"
        title="Your team"
        description="Invite people into this business with explicit roles and branch access."
      >
        <button
          className="button primary"
          disabled={!roles.length}
          onClick={() => {
            action.clear();
            setInvite(true);
          }}
        >
          Invite employee
        </button>
      </Heading>
      {!editing && !invite && !reissue && !revoking && <Feedback action={action} />}
      <section className="panel">
        <div className="panel-heading">
          <h2>Business members</h2>
          <span className="muted">Names belong to each global identity</span>
        </div>
        <ErrorBox error={members.error || mine.error} />
        {members.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={members.data || []}
            columns={[
              {
                title: 'Person',
                render: (m) => (
                  <span className="cell-stack">
                    <strong>
                      {m.first_name} {m.last_name}
                    </strong>
                    <small>{m.email}</small>
                  </span>
                ),
              },
              { title: 'Role', render: (m) => <Badge value={m.role} /> },
              { title: 'Job title', render: (m) => m.job_title },
              {
                title: 'Branch grant',
                render: (m) => (m.all_branches ? 'All branches' : 'Explicit branches'),
              },
              { title: 'Status', render: (m) => <Badge value={m.status} /> },
              {
                title: '',
                render: (m) =>
                  roles.includes(m.role === 'CLERK' ? 'INVENTORY_CLERK' : m.role) && (
                    <button
                      className="text-button"
                      onClick={() => {
                        action.clear();
                        setEditing(m);
                      }}
                    >
                      Edit membership
                    </button>
                  ),
              },
            ]}
          />
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Invitations</h2>
          <span className="muted">Up to 200 scoped records</span>
        </div>
        <ErrorBox error={invitations.error} />
        <Table
          rows={invitations.data || []}
          columns={[
            { title: 'Recipient', render: (i) => i.email },
            { title: 'Role', render: (i) => label(i.role) },
            { title: 'Expires', render: (i) => date(new Date(i.expires_ms).toISOString()) },
            { title: 'Status', render: (i) => <Badge value={invitationStatus(i, now)} /> },
            {
              title: 'Actions',
              render: (i) =>
                roles.includes(i.role) && (
                  <div className="actions">
                    {invitationStatus(i, now) === 'PENDING' && (
                      <button
                        className="text-button danger-text"
                        onClick={() => {
                          action.clear();
                          setRevoking(i);
                        }}
                      >
                        Revoke invitation
                      </button>
                    )}
                    {i.status !== 'ACCEPTED' && (
                      <button
                        className="text-button"
                        onClick={() => {
                          action.clear();
                          setRevoked(invitationStatus(i, now) !== 'PENDING');
                          setReissue(i);
                        }}
                      >
                        Reissue invitation
                      </button>
                    )}
                  </div>
                ),
            },
          ]}
        />
      </section>
      <LocalMailPreview />
      {editing && (
        <Modal title="Edit business membership" close={() => setEditing(undefined)}>
          <p>
            {editing.email} · Names and passwords are managed by the person’s global identity.
            Updating a membership revokes that person’s sessions.
          </p>
          <Feedback action={action} />
          <GrantsForm
            initialRole={editing.role}
            initialAll={!!editing.all_branches}
            branches={locations}
            roles={roles}
            canGrantAll={canGrantAll}
            pending={action.pending}
            editing
            submit="Save membership"
            onSubmit={(grant, data) =>
              action.run(
                async () => {
                  checkGrant(grant);
                  await api(`/api/v1/business/memberships/${editing.id}`, 'PUT', {
                    ...grant,
                    status: str(data, 'status'),
                    jobTitle: str(data, 'jobTitle'),
                  });
                  if (editing.user_id === user?.id)
                    requireSignIn(
                      'Your membership was changed and sessions were revoked. Sign in again.',
                    );
                },
                'Membership saved.',
                () => setEditing(undefined),
              )
            }
          >
            <Input name="jobTitle" label="Job title" value={editing.job_title} maxLength={100} />
            <Field label="Membership status">
              <select name="status" defaultValue={editing.status}>
                <option>ACTIVE</option>
                <option>DEACTIVATED</option>
              </select>
            </Field>
          </GrantsForm>
        </Modal>
      )}
      {(invite || reissue) && (
        <Modal
          title={reissue ? 'Reissue staff invitation' : 'Invite an employee'}
          close={closeInvite}
        >
          <p>
            {reissue
              ? 'Reissuing creates a fresh single-use invitation. Confirm its role and complete branch grants; old individual branch IDs are not returned by the list API.'
              : 'Invite a new or existing Orvexa identity. The server queues its single-use link using the configured email delivery. No account password is set here.'}
          </p>
          {reissue && (
            <p className="notice info">
              {revoked
                ? 'The old link is expired or revoked. A replacement has not yet been confirmed.'
                : 'Submitting revokes the original link before creating its replacement. If issuing fails, the original stays revoked.'}
            </p>
          )}
          <Feedback action={action} />
          <GrantsForm
            initialRole={reissue?.role}
            initialAll={!!reissue?.all_branches}
            branches={locations}
            roles={roles}
            canGrantAll={canGrantAll}
            pending={action.pending}
            editing={!!reissue}
            submit={reissue ? 'Revoke & issue replacement' : 'Queue invitation'}
            onSubmit={(grant, data) =>
              action.run(
                async () => {
                  checkGrant(grant);
                  if (reissue && !revoked) {
                    await api(`/api/v1/invitations/${reissue.id}`, 'DELETE');
                    setRevoked(true);
                  }
                  await api('/api/v1/invitations', 'POST', {
                    ...grant,
                    email: reissue?.email || str(data, 'email'),
                  });
                },
                'Invitation queued. Check delivery status; queueing does not prove email delivery.',
                closeInvite,
              )
            }
          >
            {reissue ? (
              <p className="span-2">
                Recipient: <strong>{reissue.email}</strong>
              </p>
            ) : (
              <div className="span-2">
                <Input name="email" label="Recipient email" type="email" maxLength={50} />
              </div>
            )}
          </GrantsForm>
        </Modal>
      )}
      {revoking && (
        <Modal title="Revoke invitation" close={() => setRevoking(undefined)}>
          <p>
            Revoke the unused link sent to {revoking.email}? It will no longer permit acceptance.
          </p>
          <Feedback action={action} />
          <button
            className="button danger-button"
            disabled={action.pending}
            onClick={() =>
              action.run(
                () => api(`/api/v1/invitations/${revoking.id}`, 'DELETE'),
                'Invitation revoked.',
                () => setRevoking(undefined),
              )
            }
          >
            Confirm revocation
          </button>
        </Modal>
      )}
    </>
  );
}
