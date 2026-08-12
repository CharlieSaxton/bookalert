'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import type { CreateSearchState, MutationState } from '@/lib/form-state';
import {
  LAST_RECIPIENT_ERROR,
  containsEmail,
  isValidEmail,
  normaliseEmail,
} from '@/lib/recipients';

const BOOKING_PREFIX = 'https://www.booking.com/';

/** A row the update did not match: deleted, or owned by another account. */
const NO_SUCH_SEARCH = 'That search is no longer available on this account. Reload the page.';

export async function createSearch(
  _previous: CreateSearchState,
  formData: FormData,
): Promise<CreateSearchState> {
  const values = {
    label: text(formData, 'label'),
    search_url: text(formData, 'search_url'),
    min_rating: text(formData, 'min_rating'),
    max_pages: text(formData, 'max_pages'),
  };

  const user = await getSessionUser();
  if (!user) {
    return { status: 'error', error: 'Your session has expired. Sign in again.', values };
  }

  if (!values.search_url) {
    return { status: 'error', error: 'Paste the Booking.com search URL you want watched.', values };
  }
  if (!values.search_url.startsWith(BOOKING_PREFIX)) {
    return {
      status: 'error',
      error: `The search URL must start with ${BOOKING_PREFIX} — open Booking.com, run the search you want, then copy the address bar.`,
      values,
    };
  }
  if (values.search_url.length > 4000) {
    return { status: 'error', error: 'That URL is too long to store.', values };
  }

  const recipients: string[] = [];
  for (const raw of formData.getAll('alert_emails')) {
    if (typeof raw !== 'string') continue;
    const address = normaliseEmail(raw);
    if (address === '') continue;
    if (!isValidEmail(address)) {
      return { status: 'error', error: `"${raw.trim()}" is not a valid email address.`, values };
    }
    if (containsEmail(recipients, address)) {
      return { status: 'error', error: `${address} is listed twice. Remove the duplicate.`, values };
    }
    recipients.push(address);
  }

  if (recipients.length === 0) {
    return {
      status: 'error',
      error: 'Add at least one email address to alert, otherwise this search would tell nobody.',
      values,
    };
  }

  let minRating: number | null = null;
  if (values.min_rating !== '') {
    minRating = Number(values.min_rating);
    if (!Number.isFinite(minRating) || minRating < 0 || minRating > 10) {
      return { status: 'error', error: 'Minimum rating must be a number between 0 and 10.', values };
    }
  }

  const maxPages = values.max_pages === '' ? 2 : Number(values.max_pages);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) {
    return { status: 'error', error: 'Pages to scan must be a whole number from 1 to 5.', values };
  }

  const label = values.label.slice(0, 160) || labelFromUrl(values.search_url);

  const supabase = await createClient();
  const { error } = await supabase.from('searches').insert({
    user_id: user.id,
    label,
    search_url: values.search_url,
    alert_emails: recipients,
    min_rating: minRating,
    max_pages: maxPages,
    active: true,
  });

  if (error) {
    return { status: 'error', error: describeDbError(error.message), values };
  }

  revalidatePath('/');
  return { status: 'created' };
}

export async function setSearchActive(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const id = text(formData, 'id');
  const active = text(formData, 'active') === 'true';
  if (!id) return { error: 'Missing search id.' };

  const supabase = await createClient();
  const { error } = await supabase.from('searches').update({ active }).eq('id', id);
  if (error) return { error: describeDbError(error.message) };

  revalidatePath('/');
  revalidatePath(`/searches/${id}`);
  return {};
}

export async function deleteSearch(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const id = text(formData, 'id');
  const redirectTo = text(formData, 'redirect_to');
  if (!id) return { error: 'Missing search id.' };

  const supabase = await createClient();
  const { error } = await supabase.from('searches').delete().eq('id', id);
  if (error) return { error: describeDbError(error.message) };

  revalidatePath('/');
  if (redirectTo === '/') redirect('/');
  return {};
}

export async function addRecipient(searchId: string, email: string): Promise<MutationState> {
  if (!searchId) return { error: 'Missing search id.' };

  const address = normaliseEmail(email);
  if (!isValidEmail(address)) return { error: `"${email.trim()}" is not a valid email address.` };

  const supabase = await createClient();
  const current = await readRecipients(supabase, searchId);
  if ('error' in current) return current;

  if (containsEmail(current.emails, address)) {
    return { error: `${address} already gets these alerts.` };
  }

  return writeRecipients(supabase, searchId, [...current.emails, address]);
}

export async function removeRecipient(searchId: string, email: string): Promise<MutationState> {
  if (!searchId) return { error: 'Missing search id.' };

  const address = normaliseEmail(email);
  if (!isValidEmail(address)) return { error: `"${email.trim()}" is not a valid email address.` };

  const supabase = await createClient();
  const current = await readRecipients(supabase, searchId);
  if ('error' in current) return current;

  if (!containsEmail(current.emails, address)) {
    return { error: `${address} is not on this search's recipient list.` };
  }
  if (current.emails.length <= 1) return { error: LAST_RECIPIENT_ERROR };

  const remaining = current.emails.filter((entry) => normaliseEmail(entry) !== address);
  return writeRecipients(supabase, searchId, remaining);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/');
  redirect('/login');
}

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * The list as it stands right now. Postgres has no "append to array" through
 * PostgREST, so both recipient actions read then write; two edits to the same
 * search in the same instant can lose one. Acceptable — a search belongs to a
 * single account and these edits are hand-driven.
 */
async function readRecipients(
  supabase: Db,
  searchId: string,
): Promise<{ emails: string[] } | { error: string }> {
  const { data, error } = await supabase
    .from('searches')
    .select('alert_emails')
    .eq('id', searchId)
    .maybeSingle();

  if (error) return { error: describeDbError(error.message) };
  if (!data) return { error: NO_SUCH_SEARCH };

  const raw: unknown = data.alert_emails;
  const emails = Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    : [];
  return { emails };
}

async function writeRecipients(
  supabase: Db,
  searchId: string,
  emails: string[],
): Promise<MutationState> {
  // RLS scopes the update to rows this account owns, so someone else's search
  // simply matches nothing — hence the empty check rather than a permission one.
  const { data, error } = await supabase
    .from('searches')
    .update({ alert_emails: emails })
    .eq('id', searchId)
    .select('id');

  if (error) return { error: describeDbError(error.message) };
  if (!data || data.length === 0) return { error: NO_SUCH_SEARCH };

  revalidatePath('/');
  revalidatePath(`/searches/${searchId}`);
  return {};
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** "London · 15 Sep" style fallback label pulled from the search's destination. */
function labelFromUrl(rawUrl: string): string {
  try {
    const params = new URL(rawUrl).searchParams;
    const destination = params.get('ss') ?? params.get('dest_id');
    const checkin = params.get('checkin');
    if (destination && checkin) return `${destination} · from ${checkin}`;
    if (destination) return destination;
  } catch {
    // Fall through to the generic label.
  }
  return 'Untitled search';
}

/** Turns Postgres/PostgREST noise into something a person can act on. */
function describeDbError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'The database refused that change for this account. Try signing out and back in.';
  }
  if (lower.includes('does not exist') || lower.includes('schema cache')) {
    return 'The database schema is not ready yet. Run the bookalert migrations, then retry.';
  }
  if (lower.includes('duplicate key')) {
    return 'You already have a search with those details.';
  }
  if (lower.includes('fetch failed') || lower.includes('network')) {
    return 'Could not reach the database. Check your connection and retry.';
  }
  return 'The database rejected that change. Please retry.';
}
