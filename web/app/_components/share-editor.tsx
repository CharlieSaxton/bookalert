'use client';

import { useState, useTransition } from 'react';
import { shareSearch, unshareSearch } from '@/app/actions';
import type { MutationState } from '@/lib/form-state';
import {
  SHARING_WITH_YOURSELF,
  containsEmail,
  isValidEmail,
  normaliseEmail,
} from '@/lib/recipients';

type Props = {
  searchId: string;
  /** The signed-in owner's address, refused here for the same reason the server refuses it. */
  ownerEmail: string;
  viewers: string[];
};

/**
 * Live viewer list, a sibling of the recipients editor: same chips, same field,
 * same immediate save. Only rendered for the owner — everyone else cannot write
 * this column at all.
 */
export function ShareEditor({ searchId, ownerEmail, viewers }: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

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
      setError('Type an email address, then press Share.');
      return;
    }
    if (!isValidEmail(address)) {
      setError(`"${draft.trim()}" is not a valid email address.`);
      return;
    }
    if (normaliseEmail(ownerEmail) === address) {
      setError(SHARING_WITH_YOURSELF);
      return;
    }
    if (containsEmail(viewers, address)) {
      setError(`${address} can already see this search.`);
      return;
    }
    save(
      () => shareSearch(searchId, address),
      () => setDraft(''),
    );
  }

  function remove(email: string) {
    save(() => unshareSearch(searchId, email));
  }

  return (
    <div className="stack" style={{ gap: 'var(--s3)' }}>
      {viewers.length === 0 ? (
        <p className="field-hint">Nobody else can see this search yet.</p>
      ) : (
        <ul className="chips">
          {viewers.map((email) => (
            <li key={email} className="badge chip">
              <span>{email}</span>
              <button
                type="button"
                className="chip-x"
                onClick={() => remove(email)}
                disabled={isSaving}
                aria-label={`Stop sharing with ${email}`}
                title={`Stop sharing with ${email}`}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="recipient-add">
        <input
          id={`share-${searchId}`}
          className="input"
          type="email"
          inputMode="email"
          autoComplete="off"
          aria-label="Share this search with an email address"
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
          {isSaving ? 'Saving…' : 'Share'}
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
