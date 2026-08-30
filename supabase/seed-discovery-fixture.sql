-- Discovery fixture: providers that are actually discoverable, and providers
-- that are deliberately not.
--
-- Every one of the twenty seeded providers failed
-- `private.is_provider_publicly_discoverable`, and failed it at the first join:
-- `user_id` was null, so `join auth.users` matched nothing. They also had no
-- contact phone, no `avatar_url`, no approved `provider_verifications` row, and
-- no coordinates on their service areas.
--
-- The result was that local discovery returned an empty list no matter what was
-- asked of it, and an empty list is indistinguishable from a broken one. That
-- is how `search_providers` raised `DELETE requires a WHERE clause` on every
-- call for as long as it did: nobody had ever seen it return a provider, so
-- nobody noticed when it stopped being able to.
--
-- This fixture exists so that a zero-result discovery response is a signal
-- again. It does NOT relax the eligibility rules -- those are production
-- behaviour and `is_provider_publicly_discoverable` is untouched. It builds
-- providers that genuinely satisfy them, alongside providers that genuinely do
-- not, so exclusion is proved rather than assumed.
--
-- Deterministic identifiers, fictional people, no real contact details.

-- --------------------------------------------------------------------------
-- Accounts. The auth triggers build the profile rows.
-- --------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id, 'authenticated', 'authenticated', u.email,
  crypt('Fixture!Passw0rd1', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', u.display_name, 'preferred_language', 'en')
from (values
  ('d1000000-0000-4000-8000-000000000001'::uuid, 'fixture.discoverable@warsha.test', 'Nour El-Sayed'),
  ('d1000000-0000-4000-8000-000000000002'::uuid, 'fixture.unverified@warsha.test',   'Hala Mansour'),
  ('d1000000-0000-4000-8000-000000000003'::uuid, 'fixture.unpublished@warsha.test',  'Rami Fouad'),
  ('d1000000-0000-4000-8000-000000000004'::uuid, 'fixture.discoverable2@warsha.test','Dalia Aziz')
) as u(id, email, display_name)
on conflict (id) do nothing;

-- A contact phone is one of the eligibility conditions, and it is read from
-- `public.profiles` first. Fictional numbers in Egypt's mobile range.
update public.profiles p
set phone = v.phone, display_name = v.display_name, avatar_url = v.avatar_url
from (values
  ('d1000000-0000-4000-8000-000000000001'::uuid, '+201099900101', 'Nour El-Sayed', 'd1000000-0000-4000-8000-000000000001/avatar.jpg'),
  ('d1000000-0000-4000-8000-000000000002'::uuid, '+201099900102', 'Hala Mansour',  'd1000000-0000-4000-8000-000000000002/avatar.jpg'),
  ('d1000000-0000-4000-8000-000000000003'::uuid, '+201099900103', 'Rami Fouad',    'd1000000-0000-4000-8000-000000000003/avatar.jpg'),
  ('d1000000-0000-4000-8000-000000000004'::uuid, '+201099900104', 'Dalia Aziz',    'd1000000-0000-4000-8000-000000000004/avatar.jpg')
) as v(id, phone, display_name, avatar_url)
where p.id = v.id;

-- --------------------------------------------------------------------------
-- Provider profiles. Two eligible, two excluded for one reason each.
-- --------------------------------------------------------------------------
insert into public.provider_profiles (
  id, user_id, display_name, primary_category_id, profession_key, about,
  experience_years, rating_average, review_count, completed_jobs,
  starting_price_egp, response_time_label, location_label, service_radius_km,
  languages, skills, avatar_url, is_verified, is_available, is_published,
  onboarding_status, cancellation_policy, guarantee_text
)
values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
   'Nour El-Sayed', 'plumbing', 'plumbing',
   'Fictional Warsha professional used by the discovery fixture.',
   9, 4.8, 126, 240, 220, 'Usually replies in 10 minutes', 'Cairo', 15,
   array['Arabic','English'], array['Home service','Maintenance'],
   'd1000000-0000-4000-8000-000000000001/avatar.jpg',
   true, true, true, 'approved',
   'Free cancellation before provider acceptance.', 'Warsha service support terms apply.'),

  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000004',
   'Dalia Aziz', 'electrical', 'electrical',
   'Fictional Warsha professional used by the discovery fixture.',
   6, 4.5, 64, 118, 260, 'Usually replies in 25 minutes', 'Giza', 12,
   array['Arabic','English','French'], array['Home service'],
   'd1000000-0000-4000-8000-000000000004/avatar.jpg',
   true, true, true, 'approved',
   'Free cancellation before provider acceptance.', 'Warsha service support terms apply.'),

  -- Excluded: no approved verification row (added below only for the eligible two).
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002',
   'Hala Mansour', 'ac', 'acRepair',
   'Fictional Warsha professional who must NOT appear in discovery.',
   4, 4.2, 20, 30, 200, 'Usually replies in 25 minutes', 'Cairo', 10,
   array['Arabic'], array['Home service'],
   'd1000000-0000-4000-8000-000000000002/avatar.jpg',
   false, true, true, 'approved',
   'Free cancellation before provider acceptance.', 'Warsha service support terms apply.'),

  -- Excluded: unpublished.
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003',
   'Rami Fouad', 'carpentry', 'carpentry',
   'Fictional Warsha professional who must NOT appear in discovery.',
   7, 4.6, 41, 77, 240, 'Usually replies in 10 minutes', 'Alexandria', 20,
   array['Arabic'], array['Home service'],
   'd1000000-0000-4000-8000-000000000003/avatar.jpg',
   true, true, false, 'approved',
   'Free cancellation before provider acceptance.', 'Warsha service support terms apply.')
on conflict (id) do update set
  is_verified = excluded.is_verified,
  is_published = excluded.is_published,
  avatar_url = excluded.avatar_url,
  onboarding_status = excluded.onboarding_status;

-- Approved identity verification, for the eligible two only.
insert into public.provider_verifications (id, provider_id, status, submitted_at, reviewed_at, expires_at)
values
  ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
   'approved', now() - interval '30 days', now() - interval '29 days', now() + interval '300 days'),
  ('d3000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000004',
   'approved', now() - interval '20 days', now() - interval '19 days', now() + interval '300 days')
on conflict (id) do update set status = excluded.status, expires_at = excluded.expires_at;

-- At least one active service each, across different categories.
insert into public.provider_services (
  provider_id, service_id, custom_price_egp, pricing_type,
  transportation_fee_egp, emergency_surcharge_egp, is_active
)
select p.provider_id, s.id, s.price_egp, s.pricing_type, 30, 50, p.is_active
from (values
  ('d2000000-0000-4000-8000-000000000001'::uuid, 'plumbing',   true),
  ('d2000000-0000-4000-8000-000000000004'::uuid, 'electrical', true),
  ('d2000000-0000-4000-8000-000000000002'::uuid, 'ac',         true),
  ('d2000000-0000-4000-8000-000000000003'::uuid, 'carpentry',  true)
) as p(provider_id, category_id, is_active)
join lateral (
  select id, price_egp, pricing_type from public.services
  where category_id = p.category_id and is_active order by id limit 3
) s on true
on conflict do nothing;

-- Service areas WITH coordinates, so distance filtering and "nearest" sorting
-- have something to compute. Central Cairo is roughly 30.0444, 31.2357.
insert into public.provider_service_areas (provider_id, governorate, district, latitude, longitude, radius_km)
values
  ('d2000000-0000-4000-8000-000000000001', 'Cairo',      'Nasr City',    30.0566, 31.3300, 15),
  ('d2000000-0000-4000-8000-000000000004', 'Giza',       'Dokki',        30.0380, 31.2120, 12),
  ('d2000000-0000-4000-8000-000000000002', 'Cairo',      'Maadi',        29.9600, 31.2570, 10),
  ('d2000000-0000-4000-8000-000000000003', 'Alexandria', 'Smouha',       31.2156, 29.9553, 20)
on conflict do nothing;
