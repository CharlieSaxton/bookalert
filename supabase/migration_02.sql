-- bookalert · migration: one search can alert several people
--
-- Idempotent; safe to re-run. Adds searches.alert_emails and backfills it from the
-- original scalar alert_email. alert_email is kept (nullable) so an older worker or a
-- half-deployed dashboard cannot break, but it is deprecated: alert_emails is the
-- source of truth and the trigger below keeps the scalar pointing at the first entry.

alter table public.searches
  add column if not exists alert_emails text[] not null default '{}';

update public.searches
set alert_emails = array[alert_email]
where cardinality(alert_emails) = 0
  and alert_email is not null;

alter table public.searches alter column alert_email drop not null;

-- A search with no recipients silently alerts nobody, which looks identical to
-- "nothing new was found". Refuse to store that state.
alter table public.searches drop constraint if exists searches_alert_emails_not_empty;
alter table public.searches
  add constraint searches_alert_emails_not_empty
  check (cardinality(alert_emails) > 0);

create or replace function public.sync_alert_email()
returns trigger
language plpgsql
as $$
begin
  new.alert_email := new.alert_emails[1];
  return new;
end;
$$;

drop trigger if exists searches_sync_alert_email on public.searches;
create trigger searches_sync_alert_email
  before insert or update of alert_emails on public.searches
  for each row execute function public.sync_alert_email();

-- ---------------------------------------------------------------------------
-- Availability tracking
--
-- Property-level "have I seen this before?" answers "a brand-new property was
-- listed" but not "a room opened up at a place I already know about". A property
-- drops out of Booking's results when it has no availability for the dates, and
-- reappears when it does. Recording that transition lets a known property alert
-- again when it comes back, without alerting every run while it merely stays
-- available.
-- ---------------------------------------------------------------------------
alter table public.findings
  add column if not exists available boolean not null default true;
alter table public.findings
  add column if not exists last_seen timestamptz not null default now();
alter table public.findings
  add column if not exists times_seen int not null default 1;

create index if not exists findings_search_available_idx
  on public.findings (search_id, available);

-- runs.new_count counts first-ever discoveries; returning properties are counted
-- separately so the dashboard can tell the two apart.
alter table public.runs
  add column if not exists returned_count int not null default 0;
