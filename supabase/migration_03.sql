-- bookalert · migration 03: share a search with other people
--
-- Idempotent. Sharing is keyed on email rather than user id so an invite can be
-- issued before the invitee has an account; it takes effect the moment they sign
-- up with that address. The owner keeps full control -- shared viewers can read the
-- search, its runs and its findings, and nothing else.

alter table public.searches
  add column if not exists shared_with text[] not null default '{}';

create or replace function public.current_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.can_read_search(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.searches s
    where s.id = target
      and (
        s.user_id = auth.uid()
        or public.current_email() <> '' and public.current_email() = any (s.shared_with)
      )
  );
$$;

-- searches: owners keep CRUD; viewers get read-only via the shared_with list.
drop policy if exists searches_select_own on public.searches;
create policy searches_select_own on public.searches
  for select to authenticated
  using (
    user_id = auth.uid()
    or (public.current_email() <> '' and public.current_email() = any (shared_with))
  );

-- Only the owner may modify or delete; sharing must not hand over the keys.
drop policy if exists searches_update_own on public.searches;
create policy searches_update_own on public.searches
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists runs_select_own on public.runs;
create policy runs_select_own on public.runs
  for select to authenticated
  using (public.can_read_search(runs.search_id));

drop policy if exists findings_select_own on public.findings;
create policy findings_select_own on public.findings
  for select to authenticated
  using (public.can_read_search(findings.search_id));
