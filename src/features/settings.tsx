import { useState } from 'react';
import { useAuth } from '../auth/Auth';
import { can } from '../auth/permissions';
import { useWorkspace } from '../app/workspace';
import type { Location } from '../api/types';
import type { BranchPreferences, Preferences } from '../api/configuration';
import { managesBusiness } from '../lib/configuration';
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
  num,
  str,
  Table,
  useAction,
  useApiQuery,
} from '../components/ui';
import { ReloadDraft, SettingsLinks, useRevisionEditor } from '../components/ConfigurationUI';
import { CatalogSettings } from './administration';

function PreferenceEditor({ initial }: { initial: Preferences }) {
  const { draft, action, save, reload, generation } = useRevisionEditor(
    initial,
    '/api/v1/settings',
  );
  return (
    <section className="panel padded">
      <h2>Receipts and branch controls</h2>
      <p>
        Business defaults apply to branches that inherit them. Branch registration and tax rates
        remain business-wide.
      </p>
      <Feedback action={action} />
      <ReloadDraft pending={action.pending} reload={() => void reload()} />
      <Form
        key={`${draft.revision}-${generation}`}
        pending={action.pending}
        onSubmit={(data) =>
          void save({
            revision: draft.revision,
            receiptName: str(data, 'receiptName'),
            receiptFooter: str(data, 'receiptFooter'),
            lowStockNotifications: data.has('lowStockNotifications'),
            allowBranchPriceMode: data.has('allowBranchPriceMode'),
          })
        }
      >
        <Input
          name="receiptName"
          label="Receipt name"
          value={draft.receipt_name}
          required={false}
          maxLength={120}
        />
        <Field label="Receipt footer" hint="A blank receipt name uses your business name.">
          <textarea
            name="receiptFooter"
            defaultValue={draft.receipt_footer}
            maxLength={500}
            rows={3}
          />
        </Field>
        <Field label="Low-stock notification preference">
          <input
            type="checkbox"
            name="lowStockNotifications"
            defaultChecked={!!draft.low_stock_notifications}
          />
        </Field>
        <Field
          label="Allow branch price-mode overrides"
          hint="Allows permitted branch administrators to choose inclusive or exclusive pricing. Turning this off makes branches inherit the effective tax policy."
        >
          <input
            type="checkbox"
            name="allowBranchPriceMode"
            defaultChecked={!!draft.allow_branch_price_mode}
          />
        </Field>
      </Form>
      <p className="form-hint">
        Notification preference storage is available; delivery configuration is a later phase.
      </p>
    </section>
  );
}

export function SettingsPage() {
  const { api, user, identity } = useAuth();
  const { business } = useWorkspace();
  const preferences = useApiQuery<Preferences>('/api/v1/settings');
  const editable = managesBusiness(user, identity);
  const action = useAction();
  return (
    <>
      <Heading
        eyebrow="BUSINESS CONFIGURATION"
        title="Workspace settings"
        description="Keep your business identity and shared defaults together."
      />
      <SettingsLinks />
      <section className="panel padded">
        <h2>Business details</h2>
        <Feedback action={action} />
        <p className="muted">
          Currency cannot change once stock, purchasing or order history exists.
        </p>
        {business &&
          (editable ? (
            <Form
              pending={action.pending}
              onSubmit={(data) =>
                void action.run(
                  () =>
                    api('/api/business', 'PUT', {
                      name: str(data, 'name'),
                      currency: str(data, 'currency').toUpperCase(),
                      defaultThreshold: num(data, 'defaultThreshold'),
                    }),
                  'Business details saved.',
                )
              }
            >
              <Input name="name" label="Business name" value={business.name} maxLength={100} />
              <Input
                name="currency"
                label="Currency (ISO code)"
                value={business.currency}
                minLength={3}
                maxLength={3}
              />
              <Input
                name="defaultThreshold"
                label="Default stock threshold"
                type="number"
                min={0}
                step="1"
                value={business.default_threshold}
              />
            </Form>
          ) : (
            <p>
              {business.name} · {business.currency}. Business-wide changes require an Owner or
              Administrator with all-branch access.
            </p>
          ))}
      </section>
      <ErrorBox error={preferences.error} />
      {preferences.isLoading ? (
        <Loading />
      ) : (
        preferences.data &&
        (editable ? (
          <PreferenceEditor initial={preferences.data} />
        ) : (
          <section className="panel padded">
            <h2>Shared preferences</h2>
            <p>Receipt: {preferences.data.receipt_name || business?.name}</p>
            <p>Footer: {preferences.data.receipt_footer || 'None'}</p>
            <p>
              Low-stock notifications: {preferences.data.low_stock_notifications ? 'On' : 'Off'}
            </p>
            <p>
              Branch price-mode overrides:{' '}
              {preferences.data.allow_branch_price_mode ? 'Allowed' : 'Disabled'}
            </p>
          </section>
        ))
      )}
      <CatalogSettings />
    </>
  );
}

function BranchEditor({
  branch,
  initial,
  allowPrice,
}: {
  branch: Location;
  initial: BranchPreferences;
  allowPrice: boolean;
}) {
  const { draft, action, save, reload, generation } = useRevisionEditor(
    initial,
    `/api/v1/branches/${branch.id}/settings`,
  );
  return (
    <>
      <p>
        Effective receipt: <strong>{draft.effective.receipt_name}</strong> ·{' '}
        {draft.effective.price_mode === 'INCLUSIVE' ? 'Tax-inclusive' : 'Tax-exclusive'} prices ·
        Low-stock notifications {draft.effective.low_stock_notifications ? 'on' : 'off'}
      </p>
      <p className="setup-note">Effective footer: {draft.effective.receipt_footer || 'None'}</p>
      <Feedback action={action} />
      <ReloadDraft pending={action.pending} reload={() => void reload()} />
      <Form
        key={`${draft.overrides.revision}-${generation}`}
        pending={action.pending}
        onSubmit={(data) =>
          void save({
            revision: draft.overrides.revision,
            receiptName: data.has('customName') ? str(data, 'receiptName') : null,
            receiptFooter: data.has('customFooter') ? str(data, 'receiptFooter') : null,
            lowStockNotifications:
              str(data, 'notifications') === '' ? null : str(data, 'notifications') === 'on',
            priceMode: allowPrice ? str(data, 'priceMode') || null : null,
          })
        }
      >
        <Field
          label="Use branch receipt name"
          hint="Unchecked inherits the business receipt name. A custom blank name falls back to the business name."
        >
          <input
            type="checkbox"
            name="customName"
            defaultChecked={draft.overrides.receipt_name != null}
          />
        </Field>
        <Input
          name="receiptName"
          label="Branch receipt name"
          value={draft.overrides.receipt_name || ''}
          required={false}
          maxLength={120}
        />
        <Field
          label="Use branch receipt footer"
          hint="Unchecked inherits; checked with an empty footer explicitly clears it."
        >
          <input
            type="checkbox"
            name="customFooter"
            defaultChecked={draft.overrides.receipt_footer != null}
          />
        </Field>
        <Field label="Branch receipt footer">
          <textarea
            name="receiptFooter"
            defaultValue={draft.overrides.receipt_footer || ''}
            maxLength={500}
            rows={3}
          />
        </Field>
        <Field label="Low-stock notifications">
          <select
            name="notifications"
            defaultValue={
              draft.overrides.low_stock_notifications == null
                ? ''
                : draft.overrides.low_stock_notifications
                  ? 'on'
                  : 'off'
            }
          >
            <option value="">Inherit business preference</option>
            <option value="on">On for this branch</option>
            <option value="off">Off for this branch</option>
          </select>
        </Field>
        {allowPrice ? (
          <Field label="Branch price mode">
            <select name="priceMode" defaultValue={draft.overrides.price_mode || ''}>
              <option value="">Inherit effective tax policy</option>
              <option value="INCLUSIVE">Tax-inclusive prices</option>
              <option value="EXCLUSIVE">Tax-exclusive prices</option>
            </select>
          </Field>
        ) : (
          <p className="form-hint">
            Branch price mode is controlled by the business.{' '}
            {draft.overrides.price_mode &&
              'A dormant override is stored. Saving these preferences clears that override; effective prices already inherit the business policy.'}
          </p>
        )}
      </Form>
    </>
  );
}

function BranchSettings({ branch, allowPrice }: { branch: Location; allowPrice: boolean }) {
  const { api, user } = useAuth();
  const settings = useApiQuery<BranchPreferences>(`/api/v1/branches/${branch.id}/settings`);
  const action = useAction();
  const editable = can(user, 'settings');
  return (
    <section className="panel padded">
      <h2>{branch.name}</h2>
      <Badge value={branch.active ? 'ACTIVE' : 'INACTIVE'} />
      {editable && (
        <>
          <Feedback action={action} />
          <Form
            pending={action.pending}
            onSubmit={(data) =>
              void action.run(
                () =>
                  api(`/api/v1/branches/${branch.id}`, 'PUT', {
                    name: str(data, 'name'),
                    active: data.has('active'),
                  }),
                'Branch updated.',
              )
            }
          >
            <Input name="name" label="Branch name" value={branch.name} maxLength={100} />
            <Field label="Branch is active">
              <input name="active" type="checkbox" defaultChecked={!!branch.active} />
            </Field>
          </Form>
        </>
      )}
      <ErrorBox error={settings.error} />
      {settings.isLoading ? (
        <Loading />
      ) : (
        settings.data &&
        (editable ? (
          <BranchEditor branch={branch} initial={settings.data} allowPrice={allowPrice} />
        ) : (
          <>
            <p>Receipt: {settings.data.effective.receipt_name}</p>
            <p>Price mode: {settings.data.effective.price_mode}</p>
            <p>
              Low-stock notifications:{' '}
              {settings.data.effective.low_stock_notifications ? 'On' : 'Off'}
            </p>
          </>
        ))
      )}
    </section>
  );
}

export function BranchSettingsPage() {
  const { api, user, identity } = useAuth();
  const branches = useApiQuery<Location[]>('/api/v1/branches');
  const preferences = useApiQuery<Preferences>('/api/v1/settings');
  const [selected, setSelected] = useState<number>();
  const [create, setCreate] = useState(false);
  const action = useAction();
  const current = branches.data?.find((b) => b.id === selected);
  return (
    <>
      <Heading
        title="Branch settings"
        description="Manage permitted branches, including inactive branches, and choose which preferences they inherit."
      >
        {managesBusiness(user, identity) && (
          <button
            className="button primary"
            onClick={() => {
              action.clear();
              setCreate(true);
            }}
          >
            Add branch
          </button>
        )}
      </Heading>
      <SettingsLinks />
      <ErrorBox error={branches.error || preferences.error} />
      {branches.isLoading ? (
        <Loading />
      ) : (
        <section className="panel">
          <Table
            rows={branches.data || []}
            columns={[
              { title: 'Branch', render: (b) => b.name },
              {
                title: 'Status',
                render: (b) => <Badge value={b.active ? 'ACTIVE' : 'INACTIVE'} />,
              },
              {
                title: 'Settings',
                render: (b) => (
                  <button className="text-button" onClick={() => setSelected(b.id)}>
                    Open {b.name}
                  </button>
                ),
              },
            ]}
          />
        </section>
      )}
      {current && preferences.data && (
        <BranchSettings
          key={current.id}
          branch={current}
          allowPrice={!!preferences.data.allow_branch_price_mode}
        />
      )}
      {create && (
        <Modal
          title="Add branch"
          close={() => {
            if (!action.pending) setCreate(false);
          }}
        >
          <Feedback action={action} />
          <Form
            pending={action.pending}
            submit="Create branch"
            onSubmit={(data) =>
              void action.run(
                () => api<Location>('/api/v1/branches', 'POST', { name: str(data, 'name') }),
                'Branch created.',
                () => setCreate(false),
              )
            }
          >
            <Input name="name" label="Branch name" maxLength={100} />
          </Form>
        </Modal>
      )}
    </>
  );
}
