import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Store,
  ShieldCheck,
  Package,
  Truck,
  Users,
  ShoppingCart,
  ArrowRight,
  Sprout,
} from 'lucide-react';
import { useAuth } from '../auth/Auth';
import type { OnboardingStep, StepCode, StepStatus } from '../api/configuration';
import { managesBusiness, onboardingProgress } from '../lib/configuration';
import {
  Badge,
  ErrorBox,
  Feedback,
  Field,
  Form,
  Heading,
  Loading,
  Modal,
  str,
  useAction,
  useApiQuery,
} from '../components/ui';
import { ReloadDraft, SettingsLinks } from '../components/ConfigurationUI';

const stages = [
  {
    step: 'BUSINESS_DETAILS',
    title: 'Make it your business',
    icon: Building2,
    path: '/app/settings',
    text: 'Confirm the business name, currency and receipt identity.',
  },
  {
    step: 'BRANCHES',
    title: 'Set up your branches',
    icon: Store,
    path: '/app/settings/branches',
    text: 'Create or activate a branch. Each branch keeps its own inventory.',
  },
  {
    step: 'TAX_REVIEW',
    title: 'Review Jamaica tax setup',
    icon: ShieldCheck,
    path: '/app/settings/tax',
    text: 'Confirm seller registration and review effective product classifications with your accountant or TAJ.',
  },
  {
    step: 'CATALOG',
    title: 'Build your catalogue',
    icon: Package,
    path: '/app/products',
    text: 'Add an active sellable product, build a family of variants, or use the guided CSV/XLSX catalogue import.',
  },
  {
    step: 'OPENING_STOCK',
    title: 'Bring stock onto the shelf',
    icon: Truck,
    path: '/app/purchasing',
    text: 'Create a supplier and purchase order, then receive goods with actual acquisition costs. You can also enter opening balances or a direct valued receipt.',
  },
  {
    step: 'STAFF',
    title: 'Invite your team',
    icon: Users,
    path: '/app/employees',
    text: 'Invite staff with the right role and branch access. An active non-owner membership passes this check.',
  },
  {
    step: 'POS_TEST',
    title: 'Complete your first sale',
    icon: ShoppingCart,
    path: '/app/pos',
    text: 'Complete a sale with a successful payment record. The current development simulator may not pass this check; you can skip this step for now.',
  },
] satisfies { step: StepCode; title: string; icon: typeof Package; path: string; text: string }[];

export function OnboardingCard() {
  const { user, identity } = useAuth();
  const allowed = managesBusiness(user, identity);
  const steps = useApiQuery<OnboardingStep[]>('/api/v1/onboarding', allowed, true);
  if (!allowed) return null;
  const progress = onboardingProgress(steps.data || []);
  return (
    <section className="panel padded setup-summary" aria-label="Business setup progress">
      <Sprout size={36} aria-hidden="true" />
      <div>
        <h2>Your next chapter starts here</h2>
        <p>
          {steps.isLoading
            ? 'Loading saved setup progress…'
            : steps.error
              ? 'Saved setup progress is unavailable.'
              : `${progress.complete} of 7 steps complete · ${progress.skipped} skipped${progress.review ? ` · ${progress.review} need review` : ''}`}
        </p>
        <ErrorBox error={steps.error} />
        {steps.data && !steps.error && (
          <progress aria-label="Verified setup completion" value={progress.complete} max={7} />
        )}
      </div>
      <Link className="button secondary" to="/app/onboarding">
        Resume setup <ArrowRight size={16} />
      </Link>
    </section>
  );
}

export function TaxSetupGuidance() {
  const { user, identity } = useAuth();
  const allowed = managesBusiness(user, identity);
  const steps = useApiQuery<OnboardingStep[]>('/api/v1/onboarding', allowed, true);
  const tax = steps.data?.find((s) => s.step === 'TAX_REVIEW');
  if (!allowed || !tax || tax.ready) return null;
  return (
    <div className="notice info">
      <div>
        Tax setup needs review. Registered checkout requires an effective Owner-reviewed policy and
        product classifications.{' '}
        <Link className="text-link" to="/app/settings/tax">
          Review tax setup
        </Link>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const { user, identity, api } = useAuth();
  const allowed = managesBusiness(user, identity);
  const steps = useApiQuery<OnboardingStep[]>('/api/v1/onboarding', allowed, true);
  const [editing, setEditing] = useState<OnboardingStep>();
  const [generation, setGeneration] = useState(0);
  const action = useAction();
  if (!allowed)
    return (
      <>
        <Heading title="Business setup access" />
        <p>An Owner or Administrator with all-branch access can manage this checklist.</p>
        <Link to="/app">Open dashboard</Link>
      </>
    );
  const progress = onboardingProgress(steps.data || []);
  return (
    <>
      <Heading
        eyebrow="WELCOME TO ORVEXA"
        title="Grow into your workspace"
        description="Take one step at a time. Saved progress follows your business, and the dashboard is always available."
      >
        <Link className="button secondary" to="/app">
          Open dashboard
        </Link>
      </Heading>
      <SettingsLinks />
      <section className="overview-banner">
        <div>
          <p className="eyebrow">A PLACE TO START</p>
          <h2>
            {steps.isLoading
              ? 'Loading saved progress…'
              : steps.error
                ? 'Saved progress unavailable'
                : `${progress.complete} of 7 steps complete`}
          </h2>
          <p>
            {steps.data &&
              !steps.error &&
              `${progress.skipped} skipped · ${progress.review} need review. `}
            Skipping keeps a step available for later; it does not configure the feature.
          </p>
          {steps.data && !steps.error && (
            <progress aria-label="Verified setup completion" value={progress.complete} max={7} />
          )}
        </div>
        <Sprout className="setup-hero-art" size={100} strokeWidth={1} aria-hidden="true" />
      </section>
      <ErrorBox error={steps.error} />
      {steps.error && (
        <button className="button secondary" onClick={() => void steps.refetch()}>
          Retry saved progress
        </button>
      )}
      {steps.isLoading ? (
        <Loading />
      ) : (
        <ol className="setup-grid">
          {stages.map((stage, index) => {
            const saved = steps.data?.find((s) => s.step === stage.step);
            return (
              <li className="panel padded setup-step" key={stage.step}>
                <div className="setup-illustration" aria-hidden="true">
                  <span>{index + 1}</span>
                  <stage.icon size={42} strokeWidth={1.4} />
                </div>
                <h2>{stage.title}</h2>
                <p>{stage.text}</p>
                {saved && (
                  <>
                    <Badge value={saved.needsReview ? 'NEEDS_REVIEW' : saved.status} />
                    <p className="form-hint">
                      {saved.ready
                        ? 'Server prerequisites met. Confirm completion when you are ready.'
                        : 'Server prerequisites are not met yet.'}
                    </p>
                    {saved.notes && <p className="setup-note">{saved.notes}</p>}
                  </>
                )}
                <div className="actions">
                  <Link className="text-link" to={stage.path}>
                    Open step <ArrowRight size={15} />
                  </Link>
                  <button
                    className="button secondary small"
                    disabled={!saved}
                    onClick={() => {
                      action.clear();
                      setEditing(saved);
                    }}
                  >
                    Update progress
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {editing && (
        <Modal
          title={`Progress: ${stages.find((s) => s.step === editing.step)?.title}`}
          close={() => {
            if (!action.pending) setEditing(undefined);
          }}
        >
          <p>Save notes to resume after signing in again. Changes are stored on the server.</p>
          <Feedback action={action} />
          <ReloadDraft
            pending={action.pending}
            reload={() =>
              void action.run(async () => {
                const rows = await api<OnboardingStep[]>('/api/v1/onboarding');
                const latest = rows.find((s) => s.step === editing.step);
                if (!latest) throw new Error('This setup step is unavailable.');
                setEditing(latest);
                setGeneration((v) => v + 1);
              }, 'Latest progress loaded; previous draft discarded.')
            }
          />
          <Form
            key={`${editing.revision}-${generation}`}
            pending={action.pending}
            submit="Save progress"
            onSubmit={(data) =>
              void action.run(
                () =>
                  api(`/api/v1/onboarding/${editing.step}`, 'PUT', {
                    revision: editing.revision,
                    status: str(data, 'status') as StepStatus,
                    notes: str(data, 'notes'),
                  }),
                'Progress saved.',
                () => setEditing(undefined),
              )
            }
          >
            <Field
              label="Progress status"
              hint={
                !editing.ready
                  ? 'Complete becomes available when the server prerequisites are met.'
                  : 'The server checks prerequisites again when saving.'
              }
            >
              <select
                name="status"
                defaultValue={editing.needsReview ? 'IN_PROGRESS' : editing.status}
              >
                <option value="NOT_STARTED">Not started / reset</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="COMPLETE" disabled={!editing.ready}>
                  Complete
                </option>
                <option value="SKIPPED">Skip for now</option>
              </select>
            </Field>
            <Field label="Notes">
              <textarea name="notes" maxLength={500} defaultValue={editing.notes} rows={4} />
            </Field>
          </Form>
        </Modal>
      )}
    </>
  );
}
