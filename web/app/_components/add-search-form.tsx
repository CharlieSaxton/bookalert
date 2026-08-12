'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createSearch } from '@/app/actions';
import { emptyCreateState } from '@/lib/form-state';

export function AddSearchForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, formAction, isPending] = useActionState(createSearch, emptyCreateState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'created') formRef.current?.reset();
  }, [state.status]);

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
          <label htmlFor="alert_email">Alert email</label>
          <input
            id="alert_email"
            name="alert_email"
            type="email"
            className="input"
            required
            defaultValue={kept?.alert_email ?? defaultEmail}
          />
          <p className="field-hint">Where new properties get sent.</p>
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
        <button type="submit" className="btn btn-primary btn-lg" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add search'}
        </button>
        <span className="field-hint">Watching starts immediately; alerts arrive by email.</span>
      </div>
    </form>
  );
}
