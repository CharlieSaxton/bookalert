# bookalert

Watches Booking.com searches around the clock and emails you the moment a property you
have never seen before shows up in one of them. Runs entirely on free tiers.

## How it fits together

| Piece | Runs on | Job |
| --- | --- | --- |
| `web/` | Vercel (free) | Dashboard: sign up, add/pause/delete searches, browse findings and run history |
| `supabase/` | Supabase (free) | Postgres + Auth. Holds accounts, searches, runs, findings |
| `src/` | GitHub Actions (free) | Every 20 minutes: scrape each active search, store new properties, send alerts |

The scraper drives headless Chromium through Playwright, because Booking.com renders
its result cards client-side and lazy-loads them as you scroll.

## The "only new finds" guarantee

`findings` has a `unique (search_id, property_id)` constraint, and the worker inserts
with `resolution=ignore-duplicates`. A property already on file is a database no-op, so
the rows that come back from an insert are exactly the ones nobody has seen before —
those, and only those, become an alert. Nothing depends on app logic remembering
correctly, and a property that disappears and returns later is still not "new".

## Setup

1. **Supabase** — create a project, open the SQL editor, run `supabase/schema.sql`.
2. **Vercel** — import this repo, set the root directory to `web`, and add
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Project
   Settings → API).
3. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   - `SUPABASE_URL` — same URL as above
   - `SUPABASE_SERVICE_ROLE_KEY` — the service role key; bypasses RLS so the worker can
     write. Never put this in Vercel or any client-side config.
   - `RESEND_API_KEY` — from resend.com, for sending the alert emails
4. Sign up in the dashboard, then add a search.

Without `RESEND_API_KEY` the worker prints the email it would have sent instead of
sending it, which makes local runs safe.

## Building a search URL

Run the search on booking.com with every filter you want applied, then copy the URL out
of the address bar — tracking parameters are stripped automatically. Filters live in the
`nflt` parameter; `supabase/seed_penang.sql` documents a worked example.

`min_rating` is applied by the worker, not by Booking, because Booking's review-score
filter only steps in whole points (8+, 9+). Set it to 8.5 and the URL to the 8+ band to
get a genuine 8.5 floor.

## Running the worker locally

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... .venv/bin/python -m src.main
```

Scrape a single URL without touching the database:

```bash
.venv/bin/python src/scraper.py "<booking search url>" 2
```
