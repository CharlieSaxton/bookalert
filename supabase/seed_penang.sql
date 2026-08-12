-- bookalert · first search: Penang beachfront resorts
--
-- Run supabase/schema.sql first, and make sure the account below has signed up
-- (Supabase Auth must already hold a row for it in auth.users).
--
-- Stay dates are baked in: 2027-01-29 to 2027-02-01 (3 nights, 2 adults, 1 room).
-- Verified live on Booking.com: 6 resorts match these filters for those nights.
--
-- What the nflt= filter codes mean (nflt is Booking's filter bundle, ';'-joined
-- and URL-encoded, so ';' appears as %3B and '=' as %3A):
--   ht_id=206           Property type: Resorts
--   hotelfacility=433   Swimming pool
--   hotelfacility=146   Beachfront
--   hotelfacility=3     Restaurant
--   review_score=80     Booking's "Very good: 8+" band
--
-- Booking has no 8.5 filter -- 80 is the tightest band it offers -- so the URL
-- gets us to 8+ and min_rating = 8.5 below is enforced by the worker, which
-- drops anything rated under 8.5 before it alerts.
--
-- user_id is resolved from the email. If the account has not signed up yet the
-- subquery returns null and the insert fails on searches.user_id's not-null
-- constraint, which is the loud failure you want -- sign up, then re-run.
--
-- Note there is no unique constraint on searches, so running this twice creates
-- two identical searches (and therefore two alert emails). Check first with the
-- verification query at the bottom.

insert into public.searches (
  user_id,
  label,
  search_url,
  alert_email,
  min_rating,
  max_pages,
  active
)
values (
  (select id from auth.users where email = 'charlesdsaxton@gmail.com'),
  'Penang resorts · beachfront · 8.5+',
  'https://www.booking.com/searchresults.en-gb.html?ss=Penang%2C+Malaysia&checkin=2027-01-29&checkout=2027-02-01&group_adults=2&no_rooms=1&group_children=0&nflt=ht_id%3D206%3Bhotelfacility%3D433%3Bhotelfacility%3D146%3Bhotelfacility%3D3%3Breview_score%3D80',
  'charlesdsaxton@gmail.com',
  8.5,
  2,
  true
);

-- Verification -- confirms the row landed:
-- select id, label, min_rating, max_pages, active, created_at
-- from public.searches where alert_email = 'charlesdsaxton@gmail.com';
