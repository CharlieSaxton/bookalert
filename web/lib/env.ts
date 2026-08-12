/**
 * Supabase connection details. Both are public by design: the anon key only ever
 * grants what the row level security policies allow.
 *
 * Read lazily so a missing variable surfaces as a handled error inside a request
 * rather than crashing at module load (which would take down the whole route).
 */
export function supabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  return { url, anonKey };
}
