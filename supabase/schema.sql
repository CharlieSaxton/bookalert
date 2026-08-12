-- bookalert · Supabase schema
-- Idempotent: safe to paste into the Supabase SQL editor more than once.
--
-- Access model
--   Dashboard (Next.js on Vercel) connects with the ANON key, so every query is
--   filtered by the RLS policies below: a signed-in user only ever sees rows that
--   trace back to their own auth.uid().
--   The Python worker (GitHub Actions cron) connects with the SERVICE_ROLE key,
--   which bypasses RLS entirely -- that is how runs and findings get written.
--   Never expose the service_role key to the browser.

-- ---------------------------------------------------------------------------
-- searches -- one monitored Booking.com search per row
-- ---------------------------------------------------------------------------
create table if not exists public.searches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  label       text not null,
  search_url  text not null,
  alert_email text not null,
  -- null = alert on every new property; 8.5 = only alert at rating >= 8.5.
  -- Booking's own filters have no 8.5 step, so the worker applies this.
  min_rating  numeric(3, 1),
  max_pages   int not null default 2 check (max_pages between 1 and 5),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- runs -- one row per scrape attempt, for history and error surfacing
-- ---------------------------------------------------------------------------
create table if not exists public.runs (
  id            uuid primary key default gen_random_uuid(),
  search_id     uuid not null references public.searches (id) on delete cascade,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running'
                  check (status in ('running', 'ok', 'error')),
  scraped_count int not null default 0,
  new_count     int not null default 0,
  error         text
);

-- ---------------------------------------------------------------------------
-- findings -- every property ever seen for a search, one row per property
-- ---------------------------------------------------------------------------
create table if not exists public.findings (
  id          uuid primary key default gen_random_uuid(),
  search_id   uuid not null references public.searches (id) on delete cascade,
  -- Kept when a run is pruned, so the finding itself survives.
  run_id      uuid references public.runs (id) on delete set null,
  -- Stable Booking.com slug, e.g. 'my/parkroyal-penang-resort'.
  property_id text not null,
  name        text not null,
  url         text not null,
  price       text,
  rating      numeric(3, 1),
  first_seen  timestamptz not null default now(),
  notified    boolean not null default false,
  -- The "only genuinely new properties" guarantee. The worker inserts with
  -- on conflict (search_id, property_id) do nothing, so a repeat sighting is a
  -- no-op in the database rather than something app logic has to remember.
  unique (search_id, property_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists findings_search_first_seen_idx
  on public.findings (search_id, first_seen desc);
create index if not exists runs_search_started_at_idx
  on public.runs (search_id, started_at desc);
create index if not exists searches_user_id_idx on public.searches (user_id);
create index if not exists searches_active_idx on public.searches (active);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.searches enable row level security;
alter table public.runs enable row level security;
alter table public.findings enable row level security;

-- searches: full CRUD, but only over your own rows.
drop policy if exists searches_select_own on public.searches;
create policy searches_select_own on public.searches
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists searches_insert_own on public.searches;
create policy searches_insert_own on public.searches
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists searches_update_own on public.searches;
create policy searches_update_own on public.searches
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists searches_delete_own on public.searches;
create policy searches_delete_own on public.searches
  for delete to authenticated
  using (user_id = auth.uid());

-- runs and findings: read-only for users, reachable through their own searches.
-- Writes come from the worker on the service_role key, which skips RLS.
drop policy if exists runs_select_own on public.runs;
create policy runs_select_own on public.runs
  for select to authenticated
  using (
    exists (
      select 1
      from public.searches s
      where s.id = runs.search_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists findings_select_own on public.findings;
create policy findings_select_own on public.findings
  for select to authenticated
  using (
    exists (
      select 1
      from public.searches s
      where s.id = findings.search_id
        and s.user_id = auth.uid()
    )
  );
