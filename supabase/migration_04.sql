-- bookalert · migration 04: richer findings, deeper scans
--
-- Idempotent.

-- What the alert email shows about the room that was actually found.
alter table public.findings add column if not exists image_url text;
alter table public.findings add column if not exists room_type text;

-- A province-wide search runs to several hundred properties, well past the old
-- ceiling of 5. The scraper stops as soon as an offset yields nothing new, so a
-- high ceiling costs nothing on a small search and simply permits a large one.
alter table public.searches drop constraint if exists searches_max_pages_check;
alter table public.searches
  add constraint searches_max_pages_check check (max_pages between 1 and 40);
