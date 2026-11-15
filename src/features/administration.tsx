import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../auth/Auth';
import type { Business, Category, Employee, Reason, Role } from '../api/types';
import {
  ErrorBox,
  Feedback,
  Field,
  Form,
  Heading,
  Input,
  Loading,
  Modal,
  num,
  str,
  Table,
  useAction,
  useApiQuery,
} from '../components/ui';

function StaffFields({
  employee,
  privileged = true,
  owner = false,
}: {
  employee?: Employee;
  privileged?: boolean;
  owner?: boolean;
}) {
  return (
    <>
      <Input name="firstName" label="First name" value={employee?.first_name} maxLength={30} />
      <Input name="lastName" label="Last name" value={employee?.last_name} maxLength={30} />
      {!employee && (
        <>
          <Input name="email" label="Email address" type="email" maxLength={50} />
          <Input
            name="password"
            label="Initial password"
            type="password"
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
          />
        </>
      )}
      <Input
        name="jobTitle"
        label="Job title"
        value={employee?.job_title || (owner ? 'Owner' : '')}
        maxLength={100}
      />
      <Field label="Role">
        <select
          name="role"
          defaultValue={employee?.role || (owner ? 'OWNER' : 'CLERK')}
          disabled={owner}
        >
          {(owner
            ? ['OWNER']
            : privileged
              ? ['OWNER', 'MANAGER', 'CLERK', 'CASHIER']
              : ['CLERK', 'CASHIER']
          ).map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      {employee && (
        <Field label="Account status">
          <select name="status" defaultValue={employee.status}>
            {['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      )}
      {!employee && (
        <p className="form-hint span-2">
          Password must be 12–72 characters and at most 72 UTF-8 bytes. Share demo credentials
          directly. Account verification and email delivery follow the server’s configuration.
        </p>
      )}
    </>
  );
}
function staffBody(data: FormData) {
  return {
    firstName: str(data, 'firstName'),
    lastName: str(data, 'lastName'),
    email: str(data, 'email'),
    password: String(data.get('password') || ''),
    jobTitle: str(data, 'jobTitle'),
    role: str(data, 'role') as Role,
  };
}
export { Team as Employees } from './team';
export function Platform() {
  const { api } = useAuth();
  const businesses = useApiQuery<Business[]>('/api/platform/businesses');
  const action = useAction();
  const [create, setCreate] = useState(false);
  return (
    <>
      <Heading
        eyebrow="PLATFORM ADMINISTRATION"
        title="Business workspaces"
        description="Provision independent businesses and their first owners."
      >
        <button
          className="button primary"
          onClick={() => {
            action.clear();
            setCreate(true);
          }}
        >
          <Plus size={17} /> Create business
        </button>
      </Heading>
      <div className="notice info">
        Platform access covers business metadata and provisioning. Sign in with a tenant employee
        account to access its operations.
      </div>
      <Feedback action={action} />
      <section className="panel">
        <ErrorBox error={businesses.error} />
        {businesses.isLoading ? (
          <Loading />
        ) : (
          <Table
            rows={businesses.data || []}
            columns={[
              { title: 'Business', render: (b) => <strong>{b.name}</strong> },
              { title: 'ID', render: (b) => b.id },
              { title: 'Currency', render: (b) => b.currency },
              { title: 'Default threshold', render: (b) => b.default_threshold },
              {
                title: 'Public demo',
                render: (b) => (
                  <Link className="text-link" to={`/store/${b.id}`}>
                    Open storefront ↗
                  </Link>
                ),
              },
            ]}
          />
        )}
      </section>
      {create && (
        <Modal title="Create business workspace" close={() => setCreate(false)}>
          <Feedback action={action} />
          <Form
            pending={action.pending}
            submit="Create business & owner"
            onSubmit={(data) =>
              action.run(
                () =>
                  api('/api/platform/businesses', 'POST', {
                    name: str(data, 'name'),
                    locationName: str(data, 'locationName'),
                    currency: str(data, 'currency'),
                    defaultThreshold: num(data, 'defaultThreshold'),
                    owner: { ...staffBody(data), role: 'OWNER' },
                  }),
                'Business created.',
                () => setCreate(false),
              )
            }
          >
            <Input name="name" label="Business name" maxLength={120} />
            <Input name="locationName" label="First location" maxLength={80} />
            <Input name="currency" label="Currency (3-letter code)" value="JMD" maxLength={3} />
            <Input
              name="defaultThreshold"
              label="Default stock threshold"
              type="number"
              min={0}
              step="1"
              value={3}
            />
            <h3 className="span-2">First owner account</h3>
            <StaffFields owner />
          </Form>
        </Modal>
      )}
    </>
  );
}
export function CatalogSettings() {
  const { api } = useAuth();
  const categories = useApiQuery<Category[]>('/api/categories');
  const reasons = useApiQuery<Reason[]>('/api/inventory/reasons');
  const action = useAction();
  const [modal, setModal] = useState<'category' | 'reason' | null>(null);
  const [category, setCategory] = useState<Category>();
  const [deleting, setDeleting] = useState<Category>();
  return (
    <>
      <Feedback action={action} />
      <div className="two-column">
        <section className="panel">
          <div className="panel-heading">
            <h2>Categories</h2>
            <button
              className="button secondary small"
              onClick={() => {
                setCategory(undefined);
                setModal('category');
              }}
            >
              Add category
            </button>
          </div>
          <ErrorBox error={categories.error} />
          <Table
            rows={categories.data || []}
            columns={[
              { title: 'Name', render: (c) => c.name },
              {
                title: '',
                render: (c) => (
                  <div className="actions">
                    <button
                      className="text-button"
                      onClick={() => {
                        setCategory(c);
                        setModal('category');
                      }}
                    >
                      Edit
                    </button>
                    <button className="text-button danger-text" onClick={() => setDeleting(c)}>
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Movement reasons</h2>
          <button className="button secondary small" onClick={() => setModal('reason')}>
            Add reason
          </button>
        </div>
        <ErrorBox error={reasons.error} />
        <Table
          rows={reasons.data || []}
          columns={[
            { title: 'Code', render: (r) => <code>{r.code}</code> },
            { title: 'Label', render: (r) => r.label },
          ]}
        />
      </section>
      {modal && (
        <Modal
          title={
            modal === 'category'
              ? category
                ? 'Edit category'
                : 'Add category'
              : 'Add movement reason'
          }
          close={() => setModal(null)}
        >
          <Feedback action={action} />
          <Form
            pending={action.pending}
            onSubmit={(data) =>
              action.run(
                () =>
                  modal === 'category'
                    ? api(
                        '/api/categories' + (category ? '/' + category.id : ''),
                        category ? 'PUT' : 'POST',
                        { name: str(data, 'name') },
                      )
                    : api('/api/inventory/reasons', 'POST', {
                        code: str(data, 'code'),
                        label: str(data, 'name'),
                      }),
                'Settings saved.',
                () => setModal(null),
              )
            }
          >
            {modal === 'reason' && (
              <Input name="code" label="Reason code (UPPERCASE_WITH_UNDERSCORES)" maxLength={80} />
            )}
            <Input
              name="name"
              label="Name / label"
              value={category && modal === 'category' ? category.name : ''}
            />
          </Form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Delete category" close={() => setDeleting(undefined)}>
          <p>Delete {deleting.name}? Categories referenced by products cannot be deleted.</p>
          <Feedback action={action} />
          <button
            className="button danger-button"
            disabled={action.pending}
            onClick={() =>
              action.run(
                () => api('/api/categories/' + deleting.id, 'DELETE'),
                'Category deleted.',
                () => setDeleting(undefined),
              )
            }
          >
            Delete category
          </button>
        </Modal>
      )}
    </>
  );
}
