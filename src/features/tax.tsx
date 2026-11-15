import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/Auth';
import { CommandIds, query } from '../api/client';
import type { Product } from '../api/types';
import {
  readVersions,
  type Classification,
  type Policy,
  type TaxAssignment,
  type TaxRate,
  type TaxTemplate,
} from '../api/configuration';
import {
  effectiveInstant,
  effectiveVersion,
  managesBusiness,
  validateRate,
} from '../lib/configuration';
import { EffectiveDate, SettingsLinks } from '../components/ConfigurationUI';
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
  Pager,
  str,
  Table,
  useAction,
  useApiQuery,
} from '../components/ui';

function useVersions<T>(path: string, enabled = true) {
  const { user, api } = useAuth();
  return useQuery({
    queryKey: [user?.id, user?.businessId, user?.membershipId, path, 'all-versions'],
    enabled,
    refetchInterval: 30000,
    queryFn: ({ signal }) =>
      readVersions<T>((p) => api<T[]>(p, 'GET', undefined, false, signal), path),
  });
}
function ReviewFields() {
  const { user } = useAuth();
  const [verified, setVerified] = useState(false);
  return (
    <>
      {user?.role === 'OWNER' ? (
        <Field
          label="Owner review confirmation"
          hint="Confirm only after checking registration, eligibility and effective dates with TAJ or your accountant. This records your review, not legal certification."
        >
          <input
            type="checkbox"
            name="verified"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
        </Field>
      ) : (
        <p className="form-hint">
          An Administrator can propose rules. Only an Owner can record verification by creating a
          new version.
        </p>
      )}
      <Field label="Review reference / note">
        <textarea name="verificationNote" maxLength={500} rows={3} required={verified} />
      </Field>
    </>
  );
}
function VersionForm({
  kind,
  initial,
  close,
}: {
  kind: 'policy' | 'rate';
  initial?: Policy | TaxTemplate | TaxRate;
  close: () => void;
}) {
  const { api } = useAuth();
  const action = useAction();
  const ids = useRef(new CommandIds());
  const [registration, setRegistration] = useState(
    initial && 'registration_status' in initial ? initial.registration_status : 'NOT_REGISTERED',
  );
  const [classification, setClassification] = useState<Classification>(
    initial && 'classification' in initial ? initial.classification : 'TAXABLE',
  );
  const policy = initial && 'registration_status' in initial ? initial : undefined;
  const rate = initial && 'classification' in initial ? initial : undefined;
  const illustrative = !!rate && (!('illustrative' in rate) || !!rate.illustrative);
  return (
    <Modal
      title={kind === 'policy' ? 'New seller policy version' : 'New tax profile version'}
      close={() => {
        if (!action.pending) close();
      }}
    >
      <p>
        Creates an immutable version. Existing receipts retain their historical tax snapshots. A
        future version does not apply until its effective time.
      </p>
      {illustrative && (
        <div className="notice info">
          This example remains marked illustrative, including after Owner review. Verify eligibility
          before use.
        </div>
      )}
      <Feedback action={action} />
      <Form
        pending={action.pending}
        submit="Create version"
        onSubmit={(data) =>
          void action.run(
            async () => {
              const common = {
                effectiveFrom: effectiveInstant(str(data, 'effectiveFrom')),
                verified: data.has('verified'),
                verificationNote: str(data, 'verificationNote'),
              };
              const code = str(data, 'code');
              const body =
                kind === 'policy'
                  ? {
                      ...common,
                      registrationStatus: registration,
                      registrationNumber: str(data, 'registrationNumber'),
                      priceMode: str(data, 'priceMode'),
                    }
                  : {
                      ...common,
                      label: str(data, 'label'),
                      classification,
                      ratePercent: validateRate(str(data, 'ratePercent'), classification),
                      illustrative,
                    };
              const path =
                kind === 'policy'
                  ? '/api/v1/tax/policies'
                  : `/api/v1/tax/profiles/${encodeURIComponent(code)}/versions`;
              await api(path, 'POST', { ...body, requestId: ids.current.for({ path, body }) });
            },
            'New tax version saved.',
            close,
          )
        }
      >
        {kind === 'policy' ? (
          <>
            <Field label="Seller registration">
              <select
                name="registrationStatus"
                value={registration}
                onChange={(e) => setRegistration(e.target.value as Policy['registration_status'])}
              >
                <option value="NOT_REGISTERED">Not registered for sales GCT</option>
                <option value="REGISTERED">Registered for sales GCT</option>
              </select>
            </Field>
            <Input
              name="registrationNumber"
              label="Registration reference"
              required={registration === 'REGISTERED'}
              maxLength={80}
              value={policy?.registration_number}
            />
            <Field label="Business price mode">
              <select name="priceMode" defaultValue={policy?.price_mode || 'EXCLUSIVE'}>
                <option value="EXCLUSIVE">Tax-exclusive prices</option>
                <option value="INCLUSIVE">Tax-inclusive prices</option>
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field
              label="Profile code"
              hint="An uppercase letter followed by letters, numbers or underscores; at most 40 characters."
            >
              <input
                name="code"
                defaultValue={rate?.code}
                pattern="[A-Z][A-Z0-9_]{0,39}"
                maxLength={40}
                required
                readOnly={!!rate}
              />
            </Field>
            <Input name="label" label="Profile label" value={rate?.label} maxLength={120} />
            <Field label="Product classification">
              <select
                name="classification"
                value={classification}
                onChange={(e) => setClassification(e.target.value as Classification)}
              >
                <option value="TAXABLE">Taxable</option>
                <option value="ZERO_RATED">Zero-rated</option>
                <option value="EXEMPT">Exempt</option>
              </select>
            </Field>
            <Field
              label="Rate percentage"
              hint="Enter the reviewed rate. Exempt and zero-rated both require 0, but are distinct classifications."
            >
              <input
                name="ratePercent"
                inputMode="decimal"
                required
                defaultValue={rate?.rate_percent || ''}
                pattern="[0-9]{1,3}(\.[0-9]{1,4})?"
              />
            </Field>
          </>
        )}
        <EffectiveDate />
        <ReviewFields />
      </Form>
      <p className="form-hint">
        If a response is lost, keep this form open and retry the unchanged draft to reuse its
        command ID. After closing or reloading, check history before creating another version.
      </p>
    </Modal>
  );
}

function versionTime(row: { effective_from_ms: number }) {
  return new Date(row.effective_from_ms).toLocaleString();
}
function AssignmentEditor({ product, rates }: { product: Product; rates: TaxRate[] }) {
  const { api } = useAuth();
  const path = `/api/v1/products/${product.itemId}/tax`;
  const assignments = useVersions<TaxAssignment>(path);
  const action = useAction();
  const ids = useRef(new CommandIds());
  const current = effectiveVersion(assignments.data || []);
  const currentRate = current && effectiveVersion(rates.filter((r) => r.code === current.code));
  const codes = [...new Set(rates.map((r) => r.code))];
  return (
    <section className="panel padded">
      <h3>
        {product.itemName} · {product.sku}
      </h3>
      <p>
        Effective classification by browser clock:{' '}
        {current
          ? `${current.code} · ${currentRate ? `${currentRate.classification} · ${currentRate.rate_percent}% · ${currentRate.verified ? 'Owner reviewed' : 'Not reviewed'}` : 'No effective rate; not ready for registered checkout'}`
          : 'Unassigned'}
      </p>
      <ErrorBox error={assignments.error} />
      <Feedback action={action} />
      <Form
        pending={action.pending}
        disabled={!codes.length}
        submit="Create classification version"
        onSubmit={(data) =>
          void action.run(async () => {
            const body = {
              code: str(data, 'code'),
              effectiveFrom: effectiveInstant(str(data, 'effectiveFrom')),
            };
            await api(path, 'POST', { ...body, requestId: ids.current.for(body) });
          }, 'Product classification saved.')
        }
      >
        <Field label="Tax profile">
          <select name="code" required defaultValue="">
            <option value="" disabled>
              Choose a profile
            </option>
            {codes.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </Field>
        <EffectiveDate />
      </Form>
      <p className="form-hint">
        A profile must have an effective Owner-reviewed rate for registered checkout. Changing
        assignment creates a new version; it does not change earlier sales. If a response is lost,
        retry the unchanged form before navigating away.
      </p>
      {assignments.isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={assignments.data || []}
          columns={[
            { title: 'Profile', render: (a) => a.code },
            { title: 'Effective from (local)', render: versionTime },
          ]}
        />
      )}
    </section>
  );
}
function ProductClassifications({ rates }: { rates: TaxRate[] }) {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Product>();
  const products = useApiQuery<Product[]>('/api/products' + query({ search, limit: 25, offset }));
  return (
    <section className="panel padded">
      <h2>3. Classify sellable products</h2>
      <p>
        Choose an effective profile for each sellable product. Parent products are not sold
        directly.
      </p>
      <Field label="Find product by name, SKU or barcode">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
      </Field>
      <ErrorBox error={products.error} />
      {products.isLoading ? (
        <Loading />
      ) : (
        <Table
          rows={(products.data || []).filter((p) => p.productKind !== 'PARENT')}
          columns={[
            { title: 'Product', render: (p) => `${p.itemName} · ${p.sku}` },
            {
              title: 'Classification',
              render: (p) => (
                <button className="text-button" onClick={() => setSelected(p)}>
                  Classify {p.sku}
                </button>
              ),
            },
          ]}
        />
      )}
      <Pager offset={offset} count={products.data?.length || 0} size={25} setOffset={setOffset} />
      {selected && <AssignmentEditor key={selected.itemId} product={selected} rates={rates} />}
    </section>
  );
}

export function ProductTaxSettings({ product }: { product: Product }) {
  const { user, identity } = useAuth();
  const allowed = managesBusiness(user, identity) && product.active;
  const rates = useVersions<TaxRate>('/api/v1/tax/profiles', allowed);
  if (!allowed)
    return (
      <section className="panel padded">
        <h2>Product tax classification</h2>
        <p>
          An Owner or Administrator with all-branch access can classify active products in tax
          settings.
        </p>
      </section>
    );
  return (
    <>
      <ErrorBox error={rates.error} />
      {rates.isLoading ? (
        <Loading />
      ) : (
        !rates.error && <AssignmentEditor product={product} rates={rates.data || []} />
      )}
    </>
  );
}

export function TaxSettingsPage() {
  const { user, identity } = useAuth();
  const allowed = managesBusiness(user, identity);
  const policies = useVersions<Policy>('/api/v1/tax/policies', allowed);
  const rates = useVersions<TaxRate>('/api/v1/tax/profiles', allowed);
  const templates = useApiQuery<TaxTemplate[]>('/api/v1/tax/templates', allowed);
  const [modal, setModal] = useState<{
    kind: 'policy' | 'rate';
    initial?: Policy | TaxRate | TaxTemplate;
  }>();
  if (!allowed)
    return (
      <>
        <Heading title="Tax setup access" />
        <p>
          An Owner or Administrator with all-branch access can manage business-wide tax
          configuration.
        </p>
      </>
    );
  const policy = effectiveVersion(policies.data || []);
  return (
    <>
      <Heading
        eyebrow="JAMAICA-GUIDED CONFIGURATION"
        title="Tax setup"
        description="Review registration first, then product classifications. Amounts are calculated by the backend."
      />
      <SettingsLinks />
      <div className="notice info">
        <div>
          <strong>Owner review is required before production use.</strong>
          <p>
            Check current rules and eligibility with Tax Administration Jamaica or your accountant.
            Examples are illustrative; this screen does not certify legal compliance. Imported-goods
            acquisition costs are separate from sales tax.
          </p>
        </div>
      </div>
      <section className="panel padded">
        <h2>How these choices differ</h2>
        <div className="tax-explainer">
          <p>
            <strong>Nonregistered seller</strong>
            <br />
            Business registration status; the backend does not collect sales GCT for this seller.
          </p>
          <p>
            <strong>Zero-rated product</strong>
            <br />A distinct product classification with a zero rate. Eligibility needs review.
          </p>
          <p>
            <strong>Exempt product</strong>
            <br />A separate classification, also requiring a zero rate. Do not substitute it for
            seller registration.
          </p>
        </div>
      </section>
      <ErrorBox error={policies.error || rates.error || templates.error} />
      {policies.isLoading || rates.isLoading ? (
        <Loading />
      ) : (
        <>
          <section className="panel padded">
            <div className="panel-heading">
              <h2>1. Seller registration and pricing</h2>
              <button
                className="button primary"
                disabled={!!policies.error}
                onClick={() => setModal({ kind: 'policy', initial: policy })}
              >
                New policy version
              </button>
            </div>
            <p>
              Effective by browser clock:{' '}
              <strong>
                {policy?.registration_status.replaceAll('_', ' ').toLowerCase() ||
                  'No effective policy'}
              </strong>{' '}
              · {policy?.price_mode.toLowerCase()} ·{' '}
              {policy?.verified ? 'Owner reviewed' : 'Not Owner reviewed'}
            </p>
            {!policy?.verified && (
              <div className="notice danger">
                The default or current policy has not been Owner reviewed. An unverified registered
                policy blocks checkout.
              </div>
            )}
            <p className="form-hint">
              Every time below uses {Intl.DateTimeFormat().resolvedOptions().timeZone}. The server
              decides the effective version at checkout. Versions cannot be edited or deleted.
            </p>
            <Table
              rows={policies.data || []}
              columns={[
                { title: 'Effective from (local)', render: versionTime },
                {
                  title: 'Registration',
                  render: (p) => `${p.registration_status} ${p.registration_number}`,
                },
                { title: 'Price mode', render: (p) => p.price_mode },
                {
                  title: 'Review',
                  render: (p) => (
                    <>
                      <Badge value={p.verified ? 'OWNER_REVIEWED' : 'UNVERIFIED'} />
                      <p>{p.verification_note}</p>
                    </>
                  ),
                },
              ]}
            />
          </section>
          <section className="panel padded">
            <div className="panel-heading">
              <h2>2. Product tax profiles</h2>
              <button
                className="button secondary"
                disabled={!!rates.error}
                onClick={() => setModal({ kind: 'rate' })}
              >
                Create custom profile
              </button>
            </div>
            <p>
              Start with a custom rate or explicitly choose a backend example. Examples never apply
              automatically.
            </p>
            <div className="actions">
              {(templates.data || []).map((t) => (
                <button
                  key={t.code}
                  className="button secondary small"
                  disabled={!!rates.error}
                  onClick={() => setModal({ kind: 'rate', initial: t })}
                >
                  Use example: {t.label} ({t.rate_percent}%)
                </button>
              ))}
            </div>
            <Table
              rows={rates.data || []}
              columns={[
                {
                  title: 'Profile',
                  render: (r) => (
                    <>
                      {r.code}
                      <p>{r.label}</p>
                    </>
                  ),
                },
                {
                  title: 'Classification / rate',
                  render: (r) => `${r.classification} · ${r.rate_percent}%`,
                },
                { title: 'Effective from (local)', render: versionTime },
                {
                  title: 'Review',
                  render: (r) => (
                    <>
                      {r.verified ? 'Owner reviewed' : 'Unverified'}
                      {r.illustrative ? ' · Illustrative example' : ''}
                      <p>{r.verification_note}</p>
                    </>
                  ),
                },
                {
                  title: 'Version',
                  render: (r) => (
                    <button
                      className="text-button"
                      onClick={() => setModal({ kind: 'rate', initial: r })}
                    >
                      New version of {r.code}
                    </button>
                  ),
                },
              ]}
            />
          </section>
          {!rates.error && <ProductClassifications rates={rates.data || []} />}
        </>
      )}
      {modal && <VersionForm {...modal} close={() => setModal(undefined)} />}
    </>
  );
}
