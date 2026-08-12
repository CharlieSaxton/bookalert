/**
 * Rules for the two email lists a search carries — who gets alerted and who may
 * view it — shared by the Server Actions and the forms that call them so an
 * address the browser accepts is never rejected by the server, or the reverse.
 * Kept out of the `'use server'` module, which may only export async functions.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Shown whenever the last recipient would be removed. A search with an empty
 * list still runs on schedule — it just tells nobody, which looks identical to
 * "nothing new was found".
 */
export const LAST_RECIPIENT_ERROR =
  'A search needs at least one recipient — with none it would keep running and alert nobody. Add another address first.';

/**
 * Shown when the owner tries to share a search with their own address. It would
 * grant nothing they do not already have, and it would then sit in the list
 * looking like a second person.
 */
export const SHARING_WITH_YOURSELF =
  'That is your own address — you already have full access to this search.';

/** Trimmed and lowercased: the exact form that gets stored. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/** Case-insensitive membership, so `Sam@x.com` cannot be added twice. */
export function containsEmail(list: readonly string[], email: string): boolean {
  const target = normaliseEmail(email);
  return list.some((entry) => normaliseEmail(entry) === target);
}
