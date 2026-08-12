'use client';

import { useState, useTransition } from 'react';
import { addRecipient, removeRecipient } from '@/app/actions';
import type { MutationState } from '@/lib/form-state';
import {
  LAST_RECIPIENT_ERROR,
  containsEmail,
  isValidEmail,
  normaliseEmail,
} from '@/lib/recipients';

type Props = {
  searchId: string;
  emails: string[];
};

/**
 * Live recipient list. Each change hits the database immediately; the actions
 * revalidate this route, so `emails` comes back updated on its own and there is
 * no local copy of the list to drift out of sync.
 */
export function RecipientsEditor({ searchId, emails }: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const isLastOne = emails.length <= 1;

  function save(work: () => Promise<MutationState>, onSaved?: () => void) {
    setError(null);
    startSaving(async () => {
      const result = await work();
      if (result.error) setError(result.error);
      else onSaved?.();
    });
  }

  function add() {
    const address = normaliseEmail(draft);
    if (address === '') {
      setError('Type an email address, then press Add.');
      return;
    }
    if (!isValidEmail(address)) {
      setError(`"${draft.trim()}" is not a valid email address.`);
      return;
    }
    if (containsEmail(emails, address)) {
      setError(`${address} already gets these alerts.`);
      return;
    }
    save(
      () => addRecipient(searchId, address),
      () => setDraft(''),
    );
  }

  function remove(email: string) {
    if (isLastOne) {
      setError(LAST_RECIPIENT_ERROR);
      return;
    }
    save(() => removeRecipient(searchId, email));
  }

  return (
    <div className="stack" style={{ gap: 'var(--s3)' }}>
      {emails.length === 0 ? (
        <p className="field-hint">
          Nobody is on this list. Until you add an address, this search keeps running and tells no
          one.
        </p>
      ) : (
        <ul className="chips">
          {emails.map((email) => (
            <li key={email} className="badge chip">
              <span>{email}</span>
              <button
                type="button"
                className="chip-x"
                onClick={() => remove(email)}
                disabled={isSaving}
                aria-disabled={isLastOne || undefined}
                aria-label={`Remove ${email}`}
                title={isLastOne ? 'A search needs at least one recipient.' : `Remove ${email}`}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="recipient-add">
        <input
          id={`recipient-${searchId}`}
          className="input"
          type="email"
          inputMode="email"
          autoComplete="off"
          aria-label="Add an alert recipient"
          placeholder="name@example.com"
          value={draft}
          disabled={isSaving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter is the fast path for adding several addresses in a row.
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Add'}
        </button>
      </div>

      {error ? (
        <p className="notice notice-error" role="alert">
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
