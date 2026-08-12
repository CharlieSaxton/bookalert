/**
 * Shapes shared between the Server Actions and the forms that call them.
 * Kept out of the `'use server'` module, which may only export async functions.
 */

export type CreateSearchState = {
  status: 'idle' | 'error' | 'created';
  error?: string;
  /** Echoed back on failure so the user does not lose what they typed. */
  values?: Record<string, string>;
};

export const emptyCreateState: CreateSearchState = { status: 'idle' };

export type MutationState = { error?: string };

export const emptyMutationState: MutationState = {};
