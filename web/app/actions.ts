'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import type { CreateSearchState, MutationState } from '@/lib/form-state';

const BOOKING_PREFIX = 'https://www.booking.com/';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function createSearch(
  _previous: CreateSearchState,
  formData: FormData,
): Promise<CreateSearchState> {
  const values = {
    label: text(formData, 'label'),
    search_url: text(formData, 'search_url'),
    alert_email: text(formData, 'alert_email'),
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

  if (!EMAIL_RE.test(values.alert_email)) {
    return { status: 'error', error: 'Enter a valid email address for the alerts.', values };
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
    alert_email: values.alert_email,
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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/');
  redirect('/login');
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
