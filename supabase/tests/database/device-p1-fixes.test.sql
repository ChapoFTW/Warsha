begin;

select plan(22);

select has_function(
  'public',
  'import_local_customer_data',
  array['uuid', 'jsonb', 'uuid[]'],
  'transactional local customer import RPC exists'
);
select is(
  has_function_privilege('anon', 'public.import_local_customer_data(uuid,jsonb,uuid[])', 'EXECUTE'),
  false,
  'anonymous users cannot import local data'
);
select is(
  has_function_privilege('authenticated', 'public.import_local_customer_data(uuid,jsonb,uuid[])', 'EXECUTE'),
  true,
  'authenticated users can invoke the guarded import'
);
select is(
  (
    select pg_catalog.pg_get_expr(indexprs, indrelid) is null
       and pg_catalog.pg_get_expr(indpred, indrelid) is null
    from pg_catalog.pg_index
    where indexrelid = 'public.addresses_customer_local_source_unique'::regclass
  ),
  true,
  'address local-source uniqueness is inferable by PostgREST ON CONFLICT'
);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'device-import-1@test.local', '', now(), '{}', '{"display_name":"Import One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'device-import-2@test.local', '', now(), '{}', '{"display_name":"Import Two"}', now(), now());

insert into public.provider_profiles(
  id, user_id, display_name, profession_key, primary_category_id, category_ids,
  about, avatar_url, service_radius_km, onboarding_status,
  is_published, is_verified, is_available
) values (
  'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
  'Importable Provider', 'plumbing', 'plumbing', array['plumbing'],
  'A complete importable plumbing provider profile.',
  'a1000000-0000-4000-8000-000000000002/avatar/import.jpg', 15,
  'approved', true, true, true
);
update auth.users set phone = '+201000000302', phone_confirmed_at = now()
where id = 'a1000000-0000-4000-8000-000000000002';
insert into public.provider_verifications(provider_id, status, revision, reviewed_at)
values ('a2000000-0000-4000-8000-000000000001', 'approved', 1, now());
insert into public.provider_services(provider_id, service_id, is_active)
select 'a2000000-0000-4000-8000-000000000001', id, true
from public.services where category_id = 'plumbing' order by id limit 1;
insert into public.provider_service_areas(provider_id, governorate, district, radius_km)
values ('a2000000-0000-4000-8000-000000000001', 'Cairo', 'Maadi', 15);
insert into storage.objects(bucket_id, name)
values ('profile-images', 'a1000000-0000-4000-8000-000000000002/avatar/import.jpg');

select throws_ok(
  $$select public.import_local_customer_data('a1000000-0000-4000-8000-000000000001', '[]'::jsonb, '{}'::uuid[])$$,
  '42501',
  'Authentication required',
  'import requires an authenticated user'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.import_local_customer_data('a1000000-0000-4000-8000-000000000002', '[]'::jsonb, '{}'::uuid[])$$,
  '42501',
  'Migration account changed',
  'import rejects an account switch'
);
select throws_ok(
  $$select public.import_local_customer_data(
    'a1000000-0000-4000-8000-000000000001',
    '[{"local_source_id":"bad","label":"Missing fields"}]'::jsonb,
    '{}'::uuid[]
  )$$,
  '22023',
  'Invalid migration payload',
  'malformed import fails before writes'
);
reset role;
select is(
  (select count(*)::integer from public.addresses where customer_id = 'a1000000-0000-4000-8000-000000000001'),
  0,
  'malformed payload leaves no partial address'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.import_local_customer_data(
    'a1000000-0000-4000-8000-000000000001',
    '[{"local_source_id":"home-1","label":"Home","address_line":"21 Tahrir Street","governorate":"Cairo","district":"Dokki","is_default":true}]'::jsonb,
    array['a2000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'first supported-data import succeeds'
);
reset role;
select is(
  (select count(*)::integer from public.addresses where customer_id = 'a1000000-0000-4000-8000-000000000001'),
  1,
  'first import creates one address'
);
select is(
  (select count(*)::integer from public.favourites where customer_id = 'a1000000-0000-4000-8000-000000000001'),
  1,
  'first import creates one discoverable favourite'
);
select is(
  (select label from public.addresses where customer_id = 'a1000000-0000-4000-8000-000000000001' and local_source_id = 'home-1'),
  'Home',
  'address data is preserved'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.import_local_customer_data(
    'a1000000-0000-4000-8000-000000000001',
    '[{"local_source_id":"home-1","label":"Home","address_line":"21 Tahrir Street","governorate":"Cairo","district":"Dokki","is_default":true}]'::jsonb,
    array['a2000000-0000-4000-8000-000000000001'::uuid, 'a2000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'retry and duplicate favourites succeed'
);
reset role;
select is(
  (select count(*)::integer from public.addresses where customer_id = 'a1000000-0000-4000-8000-000000000001'),
  1,
  'retry does not duplicate the address'
);
select is(
  (select count(*)::integer from public.favourites where customer_id = 'a1000000-0000-4000-8000-000000000001'),
  1,
  'retry does not duplicate the favourite'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.import_local_customer_data(
    'a1000000-0000-4000-8000-000000000001',
    '[{"local_source_id":"home-1","label":"Updated Home","address_line":"21 Tahrir Street","governorate":"Cairo","district":"Dokki","is_default":true}]'::jsonb,
    '{}'::uuid[]
  )$$,
  'same local identity can be safely refreshed'
);
reset role;
select is(
  (select label from public.addresses where customer_id = 'a1000000-0000-4000-8000-000000000001' and local_source_id = 'home-1'),
  'Updated Home',
  'retry updates rather than duplicates the address'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.import_local_customer_data(
    'a1000000-0000-4000-8000-000000000002',
    '[{"local_source_id":"home-1","label":"Other Home","address_line":"1 Nile Street","governorate":"Giza","district":null,"is_default":false}]'::jsonb,
    array['a2000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'same local source id is isolated per account'
);
reset role;
select is(
  (select count(*)::integer from public.addresses where customer_id = 'a1000000-0000-4000-8000-000000000002'),
  1,
  'second account receives only its address'
);
select is(
  (select count(*)::integer from public.addresses where customer_id = 'a1000000-0000-4000-8000-000000000001'),
  1,
  'second account import does not alter first account'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.import_local_customer_data(
    'a1000000-0000-4000-8000-000000000002',
    '[{"local_source_id":"valid-first","label":"Valid","address_line":"Street","governorate":"Giza","district":null,"is_default":false},{"local_source_id":"invalid-second"}]'::jsonb,
    '{}'::uuid[]
  )$$,
  '22023',
  'Invalid migration payload',
  'mixed malformed payload is rejected atomically'
);
reset role;
select is(
  (select count(*)::integer from public.addresses where customer_id = 'a1000000-0000-4000-8000-000000000002'),
  1,
  'atomic rejection leaves the prior account state intact'
);

select set_config('request.jwt.claim.sub', '', true);

select * from finish();
rollback;
