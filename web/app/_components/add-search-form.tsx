'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createSearch } from '@/app/actions';
import { emptyCreateState } from '@/lib/form-state';
import { containsEmail, isValidEmail, normaliseEmail } from '@/lib/recipients';

export function AddSearchForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, formAction, isPending] = useActionState(createSearch, emptyCreateState);
  const formRef = useRef<HTMLFormElement>(null);

  // Recipients are React state rather than form fields, so a failed submit
  // keeps them without needing the action to echo them back.
  const [recipients, setRecipients] = useState<string[]>(() => startingRecipients(defaultEmail));
  const [draft, setDraft] = useState('');
  const [recipientError, setRecipientError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status !== 'created') return;
    formRef.current?.reset();
    setRecipients(startingRecipients(defaultEmail));
    setDraft('');
    setRecipientError(null);
  }, [state.status, defaultEmail]);

  function addRecipient() {
    const address = normaliseEmail(draft);
    if (address === '') {
      setRecipientError('Type an email address, then press Add.');
      return;
    }
    if (!isValidEmail(address)) {
      setRecipientError(`"${draft.trim()}" is not a valid email address.`);
      return;
    }
    if (containsEmail(recipients, address)) {
      setRecipientError(`${address} is already on the list.`);
      return;
    }
    setRecipients((current) => [...current, address]);
    setDraft('');
    setRecipientError(null);
  }

  function removeRecipient(email: string) {
    setRecipients((current) => current.filter((entry) => entry !== email));
    setRecipientError(null);
  }

  const kept = state.values;

  return (
    <form ref={formRef} action={formAction} className="stack" style={{ gap: 'var(--s4)' }}>
      <div className="form-grid">
        <div className="field field-wide">
          <label htmlFor="search_url">Booking.com search URL</label>
          <input
            id="search_url"
            name="search_url"
            className="input"
            inputMode="url"
            required
            placeholder="https://www.booking.com/searchresults.html?ss=..."
            defaultValue={kept?.search_url}
            aria-describedby="search_url-hint"
          />
          <p className="field-hint" id="search_url-hint">
            Run the search on Booking.com with your dates and filters, then paste the address bar
            here.
          </p>
        </div>

        <div className="field">
          <label htmlFor="label">Label</label>
          <input
            id="label"
            name="label"
            className="input"
            maxLength={160}
            placeholder="Lisbon, October"
            defaultValue={kept?.label}
            aria-describedby="label-hint"
          />
          <p className="field-hint" id="label-hint">
            Optional. Defaults to the destination in the URL.
          </p>
        </div>

        <div className="field">
          <label htmlFor="min_rating">Minimum rating</label>
          <input
            id="min_rating"
            name="min_rating"
            type="number"
            className="input"
            min={0}
            max={10}
            step={0.1}
            placeholder="Any"
            defaultValue={kept?.min_rating}
          />
          <p className="field-hint">Optional, 0–10. Lower-rated finds are ignored.</p>
        </div>

        <div className="field">
          <label htmlFor="max_pages">Pages to scan</label>
          <input
            id="max_pages"
            name="max_pages"
            type="number"
            className="input"
            min={1}
            max={5}
            step={1}
            defaultValue={kept?.max_pages ?? '2'}
          />
          <p className="field-hint">1–5. Each page is roughly 25 properties.</p>
        </div>

        <div className="field field-wide">
          <label htmlFor="recipient_draft">Alert recipients</label>
          <div className="recipient-add">
            <input
              id="recipient_draft"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="name@example.com"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter adds an address instead of submitting the whole form.
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addRecipient();
                }
              }}
              aria-describedby="recipient_draft-hint"
            />
            <button type="button" className="btn" onClick={addRecipient}>
              Add
            </button>
          </div>

          {recipients.length > 0 ? (
            <ul className="chips">
              {recipients.map((email) => (
                <li key={email} className="badge chip">
                  <span>{email}</span>
                  <button
                    type="button"
                    className="chip-x"
                    onClick={() => removeRecipient(email)}
                    aria-label={`Remove ${email}`}
                    title={`Remove ${email}`}
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notice notice-error">
              <span>
                Add at least one address. A search with no recipients keeps running and alerts
                nobody.
              </span>
            </p>
          )}

          <p className="field-hint" id="recipient_draft-hint">
            Everyone listed gets the same email when this search turns up a property it has never
            seen. Press Enter or Add for each address.
          </p>

          {recipientError ? (
            <p className="notice notice-error" role="alert">
              <span>{recipientError}</span>
            </p>
          ) : null}

          {recipients.map((email) => (
            <input key={email} type="hidden" name="alert_emails" value={email} />
          ))}
        </div>
      </div>

      {state.status === 'error' && state.error ? (
        <p className="notice notice-error" role="alert">
          <span>{state.error}</span>
        </p>
      ) : null}

      {state.status === 'created' ? (
        <p className="notice notice-ok" role="status">
          <span>
            <strong>Search added.</strong> It will be picked up on the next scheduled run.
          </span>
        </p>
      ) : null}

      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={isPending || recipients.length === 0}
        >
          {isPending ? 'Adding…' : 'Add search'}
        </button>
        <span className="field-hint">
          {recipients.length === 0
            ? 'Add a recipient above to enable this.'
            : 'Watching starts immediately; alerts arrive by email.'}
        </span>
      </div>
    </form>
  );
}

/** The signed-in address, pre-filled so the common case is already done. */
function startingRecipients(defaultEmail: string): string[] {
  const address = normaliseEmail(defaultEmail);
  return isValidEmail(address) ? [address] : [];
}
