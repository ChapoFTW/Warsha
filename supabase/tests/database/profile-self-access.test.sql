begin;

select plan(32);

-- Table privileges stay minimal and column-scoped.
select is(has_table_privilege('authenticated', 'public.profiles', 'select'), true, 'authenticated can read profiles rows RLS allows');
select is(has_column_privilege('authenticated', 'public.profiles', 'display_name', 'update'), true, 'authenticated may update display_name');
select is(has_column_privilege('authenticated', 'public.profiles', 'preferred_language', 'update'), true, 'authenticated may update preferred_language');
select is(has_column_privilege('authenticated', 'public.profiles', 'phone', 'update'), false, 'profile phone column stays server-managed');
select is(has_table_privilege('authenticated', 'public.profiles', 'delete'), false, 'authenticated cannot delete profiles');
select is(has_table_privilege('authenticated', 'public.profiles', 'insert'), false, 'authenticated cannot insert profiles directly');
select is(has_table_privilege('anon', 'public.profiles', 'update'), false, 'anonymous users cannot update profiles');
select is(has_table_privilege('authenticated', 'public.provider_profiles', 'select'), true, 'workers can read the provider rows RLS allows');
select is(has_table_privilege('authenticated', 'public.provider_profiles', 'update'), false, 'provider profile writes stay RPC-only');
select is(has_table_privilege('authenticated', 'public.provider_profiles', 'insert'), false, 'provider profile creation stays RPC-only');
select is(has_table_privilege('anon', 'public.provider_profiles', 'select'), false, 'anonymous browsing keeps using the guarded catalog RPC');
select is(has_table_privilege('authenticated', 'public.addresses', 'select'), true, 'customers can read the address rows RLS allows');
select is(has_table_privilege('anon', 'public.addresses', 'select'), false, 'addresses stay closed to anonymous users');
select is(has_table_privilege('authenticated', 'public.favourites', 'select'), true, 'customers can read the favourite rows RLS allows');
select is(has_table_privilege('anon', 'public.favourites', 'select'), false, 'favourites stay closed to anonymous users');
select is(has_table_privilege('authenticated', 'public.provider_services', 'select'), true, 'service links readable under their public-discovery policy');
select is(has_table_privilege('authenticated', 'public.notifications', 'select'), true, 'customers can read their own notifications');
select is(has_table_privilege('authenticated', 'public.notifications', 'update'), false, 'notification writes stay RPC-only');
select is(has_table_privilege('anon', 'public.notifications', 'select'), false, 'notifications stay closed to anonymous users');

-- The public-provider read policy resolves through a definer helper.
select has_function('private', 'is_public_provider_user', array['uuid'], 'public-provider profile helper exists');
select is(has_function_privilege('anon', 'private.is_public_provider_user(uuid)', 'EXECUTE'), true, 'anonymous read policy can evaluate the helper');
select is(has_function_privilege('authenticated', 'private.is_public_provider_user(uuid)', 'EXECUTE'), true, 'authenticated read policy can evaluate the helper');

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'b3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'profile-access-1@test.local', '', now(), '{}', '{"display_name":"Profile One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'profile-access-2@test.local', '', now(), '{}', '{"display_name":"Profile Two"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b3000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select display_name from public.profiles where id = 'b3000000-0000-4000-8000-000000000001'$$,
  array['Profile One'],
  'a customer reads their own profile'
);
select is(
  (select count(*)::integer from public.profiles where id = 'b3000000-0000-4000-8000-000000000002'),
  0,
  'another private customer profile stays invisible'
);
select lives_ok(
  $$update public.profiles set display_name = 'Profile One Renamed' where id = 'b3000000-0000-4000-8000-000000000001'$$,
  'a customer saves their own name'
);
select throws_ok(
  $$update public.profiles set phone = '+201000000009' where id = 'b3000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'a customer cannot rewrite the authoritative phone column'
);
select set_config('request.jwt.claim.sub', 'b3000000-0000-4000-8000-000000000002', true);
update public.profiles set display_name = 'Hijacked' where id = 'b3000000-0000-4000-8000-000000000001';
reset role;

select is(
  (select display_name from public.profiles where id = 'b3000000-0000-4000-8000-000000000001'),
  'Profile One Renamed',
  'the saved name persisted and a cross-account update changed nothing'
);
select is(
  (select display_name from public.profiles where id = 'b3000000-0000-4000-8000-000000000002'),
  'Profile Two',
  'the other account is untouched'
);

-- Public discoverable-provider read is preserved with identical semantics.
insert into public.provider_profiles(
  id, user_id, display_name, profession_key, primary_category_id, onboarding_status,
  category_ids, about, avatar_url, service_radius_km, is_published, is_verified, is_available
) values (
  'b4000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000002',
  'Discoverable Worker', 'plumbing', 'plumbing', 'approved', array['plumbing'],
  'A complete discoverable worker profile for access testing.',
  'b3000000-0000-4000-8000-000000000002/avatar/profile.jpg', 15, true, true, true
);
update auth.users set phone = '+201000000402', phone_confirmed_at = now()
where id = 'b3000000-0000-4000-8000-000000000002';
insert into public.provider_verifications(provider_id, status, revision, reviewed_at)
values ('b4000000-0000-4000-8000-000000000001', 'approved', 1, now());
insert into public.provider_services(provider_id, service_id, is_active)
select 'b4000000-0000-4000-8000-000000000001', id, true from public.services order by id limit 1;
insert into public.provider_service_areas(provider_id, governorate, district, radius_km)
values ('b4000000-0000-4000-8000-000000000001', 'Cairo', 'Maadi', 15);
insert into storage.objects(bucket_id, name)
values ('profile-images', 'b3000000-0000-4000-8000-000000000002/avatar/profile.jpg');

-- Anonymous visitors read nothing here at all.
--
-- This assertion has now been wrong twice, in opposite directions, and both
-- times the test was describing the implementation rather than the rule.
--
-- It first asserted a literal 1, which was only true while the seed produced no
-- discoverable providers -- the same emptiness that let `search_providers` raise
-- on every call unnoticed. It was then corrected to "anon sees exactly the
-- discoverable provider profiles", which faithfully described
-- `profiles_public_provider_select` -- a policy that handed `anon` every column
-- of this table, `phone` included, for every published professional.
--
-- The rule was never "which profiles may a stranger read". It is that
-- `public.profiles` holds account data, including a phone number, and a
-- stranger reads none of it. Public provider cards are served from
-- `provider_profiles`, which carries its own `display_name` and `avatar_url`.
-- 202608310001 dropped the policy and took back the grant.

set local role anon;
select throws_ok(
  'select count(*) from public.profiles',
  '42501',
  null,
  'AN ANONYMOUS VISITOR CANNOT READ public.profiles AT ALL'
);
reset role;

-- And the grant is gone, so a policy added later cannot quietly reopen it.
select is_empty(
  $$
  select privilege_type from information_schema.table_privileges
  where table_schema = 'public' and table_name = 'profiles' and grantee = 'anon'
  order by 1
  $$,
  'anon holds no privilege on the account table'
);

select is_empty(
  $$
  select policyname from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
    and 'anon' = any (roles)
  order by 1
  $$,
  'AND NO POLICY ON profiles NAMES anon'
);

-- The provider's public identity still has somewhere to come from, or the fix
-- would have taken the marketplace down with the leak.
select isnt_empty(
  $$
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'provider_profiles'
    and column_name in ('display_name', 'avatar_url')
  $$,
  'provider_profiles still carries the public display data'
);

select * from finish();

rollback;
