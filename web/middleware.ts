import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/login'];

/**
 * Refreshes the Supabase session cookie on every navigation and gates the
 * protected pages. Doing the gate here rather than only in the pages means an
 * unauthenticated request gets a real 307 instead of streaming a page shell
 * first — the pages keep their own check as a backstop.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  let signedIn = false;
  try {
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch {
    // Supabase unreachable: treat as signed out and let /login report the problem.
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!signedIn && !isPublic) return redirectTo('/login', request, response);
  if (signedIn && isPublic) return redirectTo('/', request, response);

  return response;
}

/** Redirect while preserving any session cookies the refresh just wrote. */
function redirectTo(pathname: string, request: NextRequest, carrying: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';

  const redirect = NextResponse.redirect(url);
  for (const cookie of carrying.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
