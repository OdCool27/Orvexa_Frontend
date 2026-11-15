import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/Auth';
import { Field, useAction } from './ui';
import { effectiveInstant, localDateTime } from '../lib/configuration';

export function SettingsLinks() {
  return (
    <nav className="actions setup-links" aria-label="Setup pages">
      <Link className="text-link" to="/app/onboarding">
        Setup checklist
      </Link>
      <Link className="text-link" to="/app/settings">
        Business settings
      </Link>
      <Link className="text-link" to="/app/settings/branches">
        Branch settings
      </Link>
      <Link className="text-link" to="/app/settings/tax">
        Jamaica tax setup
      </Link>
    </nav>
  );
}

export function EffectiveDate() {
  const [value, setValue] = useState(() => localDateTime());
  let preview = '';
  try {
    preview = effectiveInstant(value);
  } catch {
    /* Browser and submission validation explain invalid input. */
  }
  return (
    <Field
      label="Effective from"
      hint={`Local time: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. ${preview ? `UTC: ${preview}` : 'Choose a valid local date and time.'} The backend clock decides when a version applies.`}
    >
      <input
        name="effectiveFrom"
        type="datetime-local"
        step="1"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </Field>
  );
}

// A refetch must not silently replace a dirty form or adopt a newer revision.
// Only a confirmed save or the explicit discard/reload action replaces it.
export function useRevisionEditor<T>(initial: T, path: string) {
  const { api } = useAuth();
  const [draft, setDraft] = useState(initial);
  const [generation, setGeneration] = useState(0);
  const action = useAction();
  return {
    draft,
    action,
    generation,
    save: (body: unknown) =>
      action.run(async () => {
        setDraft(await api<T>(path, 'PUT', body));
        setGeneration((v) => v + 1);
      }, 'Saved to your business.'),
    reload: () =>
      action.run(async () => {
        setDraft(await api<T>(path));
        setGeneration((v) => v + 1);
      }, 'Latest configuration loaded. Your previous draft was discarded.'),
  };
}

export function ReloadDraft({ reload, pending }: { reload: () => void; pending: boolean }) {
  return (
    <button className="button secondary small" type="button" disabled={pending} onClick={reload}>
      Discard draft and reload
    </button>
  );
}
