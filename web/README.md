# bookalert web

The dashboard for bookalert. Sign in, register the Booking.com searches you want
watched, and browse what each run discovered.

- Next.js 15 (App Router) + React 19 + TypeScript
- Supabase for auth (cookie sessions via `@supabase/ssr`) and data
- Plain CSS in `app/globals.css`, dark mode via `prefers-color-scheme`

## Environment variables

Two, both required, both public by design — the anon key only grants what the
row level security policies allow:

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → Project API keys → `anon` `public` |

Copy `.env.example` to `.env.local` and fill both in. `.env.local` is gitignored;
never commit real keys.

## Run locally

```bash
cd web
npm install
cp .env.example .env.local   # then edit in your real values
npm run dev                  # http://localhost:3000
```

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm start           # serve the production build
```

Signing in needs a real Supabase project. With placeholder values the build and
dev server still start, and `/login` reports that the deployment is not
configured rather than crashing.

## Deploying to Vercel

1. Import the repo and set **Root Directory** to `web`. Vercel then detects
   Next.js and needs no build/output overrides.
2. Add both environment variables above for Production, Preview and Development.
3. In Supabase → Authentication → URL Configuration, set the Site URL to the
   deployed origin and add it to the redirect allow list, so confirmation emails
   link back to the right place.

Email confirmation is a Supabase setting. If it is on, a new account has to click
the emailed link before it can sign in — the sign-up form says so.

## How it fits together

- `middleware.ts` refreshes the Supabase session cookie on every request and
  redirects signed-out visitors to `/login` (the pages re-check as a backstop).
- `lib/supabase/server.ts` builds a request-scoped client for Server Components
  and Server Actions; `lib/supabase/browser.ts` is the client-side equivalent,
  used only by the login form.
- `app/actions.ts` holds every mutation (add, pause/resume, delete, sign out).
  Each one validates its input, revalidates the affected paths, and returns a
  readable message instead of surfacing a Postgres error.
- Reads rely on row level security: a plain `.select()` returns only the signed-in
  user's rows, so nothing filters by `user_id` except inserts.

## Pages

| Route | Purpose |
| --- | --- |
| `/login` | Email + password sign in and sign up on one form |
| `/` | Add a search; a card per search with its state, last run and totals |
| `/searches/[id]` | One search: settings, findings newest first, run history |

Findings are *first sightings*. A property appears once, the first time it was
ever seen on that search, so the list is a log of what is new rather than a
snapshot of current results.
