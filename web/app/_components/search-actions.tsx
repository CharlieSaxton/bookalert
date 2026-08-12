'use client';

import { useActionState, useState } from 'react';
import { deleteSearch, setSearchActive } from '@/app/actions';
import { emptyMutationState } from '@/lib/form-state';

type Props = {
  id: string;
  label: string;
  active: boolean;
  /** Set on the detail page so a delete returns to the dashboard. */
  redirectTo?: '/';
};

export function SearchActions({ id, label, active, redirectTo }: Props) {
  const [toggleState, toggleAction, isToggling] = useActionState(
    setSearchActive,
    emptyMutationState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteSearch, emptyMutationState);
  const [confirming, setConfirming] = useState(false);

  const error = toggleState.error ?? deleteState.error;

  return (
    <div className={confirming ? 'row-actions row-actions-open' : 'row-actions'}>
      {confirming ? (
        <>
          <p className="field-hint">
            Delete <strong>{label}</strong>? Its run history and every finding go with it. This
            cannot be undone.
          </p>
          <div className="row-actions">
            <form action={deleteAction}>
              <input type="hidden" name="id" value={id} />
              {redirectTo ? <input type="hidden" name="redirect_to" value={redirectTo} /> : null}
              <button type="submit" className="btn btn-danger" disabled={isDeleting}>
                {isDeleting ? 'Deleting…' : 'Yes, delete it'}
              </button>
            </form>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setConfirming(false)}
              disabled={isDeleting}
            >
              Keep it
            </button>
          </div>
        </>
      ) : (
        <>
          <form action={toggleAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="active" value={active ? 'false' : 'true'} />
            <button type="submit" className="btn" disabled={isToggling}>
              {isToggling ? 'Saving…' : active ? 'Pause' : 'Resume'}
            </button>
          </form>
          <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </>
      )}

      {error ? (
        <p className="notice notice-error" role="alert" style={{ flexBasis: '100%' }}>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
