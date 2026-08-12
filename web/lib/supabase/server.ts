import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseConfig } from '@/lib/env';

/**
 * Supabase client bound to the request's cookie jar, for Server Components,
 * Server Actions and Route Handlers.
 */
export async function createClient() {
  const { url, anonKey } = supabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The middleware refreshes the
          // session on every request, so it is safe to ignore this here.
        }
      },
    },
  });
}

/** The signed-in user, or null. Never throws on a missing/expired session. */
export async function getSessionUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
