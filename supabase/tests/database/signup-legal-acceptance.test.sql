begin;
select no_plan();

create function pg_temp.signup_manifest(p_role text, p_language text default 'en')
returns jsonb
language sql
stable
as $fn$
  select jsonb_agg(jsonb_build_object(
    'documentKey', d.document_key,
    'version', v.version,
    'language', p_language,
    'renderedHash', case when p_language = 'ar' then v.content_hash_ar else v.content_hash_en end
  ) order by d.sort_order)
  from public.legal_documents d
  join lateral (select * from private.legal_current_version(d.document_key)) v on true
  where d.active and d.requires_acceptance
    and (d.audience = 'all' or d.audience = p_role)
$fn$;

select has_function(
  'private', 'record_signup_legal_acceptances', array['uuid','text','jsonb'],
  'signup acceptance uses a dedicated version-bound ledger writer');
select has_function(
  'private', 'handle_signup_legal_acceptance', array[]::text[],
  'Auth signup has a legal acceptance trigger function');
select has_trigger(
  'auth', 'users', 'on_auth_user_signup_legal_acceptance',
  'every product Auth insert invokes signup legal acceptance');
select is(
  has_function_privilege('authenticated',
    'private.record_signup_legal_acceptances(uuid,text,jsonb)', 'EXECUTE'),
  false, 'clients cannot invoke the signup ledger writer');
select is(
  has_function_privilege('service_role',
    'private.record_signup_legal_acceptances(uuid,text,jsonb)', 'EXECUTE'),
  false, 'service role cannot use the private writer as an application workaround');

-- A privileged fixture insert with no product-signup marker establishes rows
-- on which the private writer can be tested directly.
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('00000000-0000-0000-0000-000000000000','fa200001-0000-4000-8000-000000000001',
 'authenticated','authenticated','signup-legal-customer@test.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','fa200001-0000-4000-8000-000000000002',
 'authenticated','authenticated','signup-legal-worker@test.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','fa200001-0000-4000-8000-000000000003',
 'authenticated','authenticated','signup-legal-invalid@test.local','',now(),'{}','{}',now(),now());

select lives_ok(
  $$select private.record_signup_legal_acceptances(
    'fa200001-0000-4000-8000-000000000001','customer',pg_temp.signup_manifest('customer','en'))$$,
  'customer signup records the current mandatory corpus');
select is(
  (select count(*)::integer from public.legal_acceptances
   where user_id='fa200001-0000-4000-8000-000000000001'),
  2, 'customer signup records exactly Customer Terms and Privacy Policy');
select set_eq(
  $$select document_key from public.legal_acceptances
    where user_id='fa200001-0000-4000-8000-000000000001'$$,
  $$values ('customer_terms'::text),('privacy_policy'::text)$$,
  'customer acceptance contains no worker-specific or optional document');

select lives_ok(
  $$select private.record_signup_legal_acceptances(
    'fa200001-0000-4000-8000-000000000002','worker',pg_temp.signup_manifest('worker','ar'))$$,
  'worker signup records its role-scoped mandatory corpus');
select set_eq(
  $$select document_key from public.legal_acceptances
    where user_id='fa200001-0000-4000-8000-000000000002'$$,
  $$values ('worker_terms'::text),('privacy_policy'::text),('worker_verification_policy'::text)$$,
  'worker acceptance includes verification policy and excludes customer terms');
select is(
  (select count(*)::integer from public.legal_acceptances
   where user_id='fa200001-0000-4000-8000-000000000002'
     and accepted_language='ar' and source_surface='sign_up'
     and account_role='worker'),
  3, 'each worker record preserves language, source and role');
select is(
  (select count(*)::integer from public.legal_acceptances a
   join public.legal_document_versions v
     on v.document_key=a.document_key and v.version=a.version
   where a.user_id in ('fa200001-0000-4000-8000-000000000001',
                       'fa200001-0000-4000-8000-000000000002')
     and a.rendered_hash = case when a.accepted_language='ar'
       then v.content_hash_ar else v.content_hash_en end),
  5, 'every acceptance names the exact current document version and rendered hash');
select is(
  (select count(*)::integer from public.legal_acceptances
   where user_id in ('fa200001-0000-4000-8000-000000000001',
                     'fa200001-0000-4000-8000-000000000002')
     and document_key='location_data_policy'),
  0, 'optional OS location permission is not bundled into signup acceptance');

select throws_ok(
  $$select private.record_signup_legal_acceptances(
    'fa200001-0000-4000-8000-000000000003','customer',
    (select jsonb_agg(item) from jsonb_array_elements(pg_temp.signup_manifest('customer')) item
     where item->>'documentKey' <> 'privacy_policy'))$$,
  '22023', null, 'omitting one mandatory document is refused');
select is(
  (select count(*)::integer from public.legal_acceptances
   where user_id='fa200001-0000-4000-8000-000000000003'),
  0, 'a refused set leaves no partial acceptance evidence');
select throws_ok(
  $$select private.record_signup_legal_acceptances(
    'fa200001-0000-4000-8000-000000000003','customer',
    jsonb_set(pg_temp.signup_manifest('customer'),'{0,renderedHash}',to_jsonb(repeat('0',64))))$$,
  '22023', null, 'a stale or invented rendered hash is refused');

-- Exercise the actual Auth trigger. The manifest is transient metadata and is
-- removed after the append-only records are committed.
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  '00000000-0000-0000-0000-000000000000','fa200001-0000-4000-8000-000000000004',
  'authenticated','authenticated','signup-legal-trigger@test.local','',now(),'{}',
  jsonb_build_object(
    'display_name','Signup Legal Trigger',
    'account_role','customer',
    'legal_acceptances',pg_temp.signup_manifest('customer','en')),
  now(),now());
select is(
  (select count(*)::integer from public.legal_acceptances
   where user_id='fa200001-0000-4000-8000-000000000004'),
  2, 'the Auth trigger records every customer signup acceptance');
select ok(
  (select not (raw_user_meta_data ? 'legal_acceptances') from auth.users
   where id='fa200001-0000-4000-8000-000000000004'),
  'the transient hash manifest is removed before it can inflate persisted sessions');
select ok(
  (select terms_accepted_at is not null and privacy_accepted_at is not null
   from public.profiles where id='fa200001-0000-4000-8000-000000000004'),
  'legacy profile timestamps are derived from the validated server acceptance instant');

-- Hosted Auth updates the row it has just created from its own in-memory copy
-- of the metadata. Removing the manifest only after the insert is therefore
-- undone by the very next write, which is what this asserts cannot happen.
update auth.users
set raw_user_meta_data = raw_user_meta_data
  || jsonb_build_object(
       'legal_acceptances', pg_temp.signup_manifest('customer','en'),
       'terms_accepted_at', now()::text),
    email_confirmed_at = now()
where id='fa200001-0000-4000-8000-000000000004';
select ok(
  (select not (raw_user_meta_data ? 'legal_acceptances')
     and not (raw_user_meta_data ? 'terms_accepted_at')
   from auth.users where id='fa200001-0000-4000-8000-000000000004'),
  'an Auth write-back cannot reinstate the transient manifest into JWT claims');
select is(
  (select count(*)::integer from public.legal_acceptances
   where user_id='fa200001-0000-4000-8000-000000000004'),
  2, 'a metadata write-back records no additional acceptance');

-- Two accounts created by one statement must not share evidence: AFTER ROW
-- triggers run once the whole statement has completed, so a single carried
-- manifest would record the last row's decision against the first. The two
-- rows differ by displayed language, which changes every rendered hash.
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('00000000-0000-0000-0000-000000000000','fa200001-0000-4000-8000-000000000006',
 'authenticated','authenticated','signup-legal-batch-en@test.local','',now(),'{}',
 jsonb_build_object('display_name','Batch English','account_role','customer',
                    'legal_acceptances',pg_temp.signup_manifest('customer','en')),
 now(),now()),
('00000000-0000-0000-0000-000000000000','fa200001-0000-4000-8000-000000000007',
 'authenticated','authenticated','signup-legal-batch-ar@test.local','',now(),'{}',
 jsonb_build_object('display_name','Batch Arabic','account_role','customer',
                    'legal_acceptances',pg_temp.signup_manifest('customer','ar')),
 now(),now());
select is(
  (select count(*)::integer from public.legal_acceptances
   where user_id='fa200001-0000-4000-8000-000000000006' and accepted_language='en'),
  2, 'the first batched account keeps the evidence it was created with');
select is(
  (select count(*)::integer from public.legal_acceptances
   where user_id='fa200001-0000-4000-8000-000000000007' and accepted_language='ar'),
  2, 'the second batched account is not recorded against the first manifest');
select is(
  (select count(*)::integer from public.legal_acceptances a
   join public.legal_document_versions v
     on v.document_key=a.document_key and v.version=a.version
   where a.user_id in ('fa200001-0000-4000-8000-000000000006',
                       'fa200001-0000-4000-8000-000000000007')
     and a.rendered_hash = case when a.accepted_language='ar'
       then v.content_hash_ar else v.content_hash_en end),
  4, 'each batched account binds the hashes of the language it was shown');
select ok(
  (select bool_and(not (raw_user_meta_data ? 'legal_acceptances')) from auth.users
   where id in ('fa200001-0000-4000-8000-000000000006',
                'fa200001-0000-4000-8000-000000000007')),
  'no batched account stores the transient manifest');

select throws_ok(
  $$insert into auth.users(
      instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values (
      '00000000-0000-0000-0000-000000000000','fa200001-0000-4000-8000-000000000005',
      'authenticated','authenticated','signup-legal-unchecked@test.local','',now(),'{}',
      jsonb_build_object('display_name','Unchecked','account_role','customer'),now(),now())$$,
  '22023', null, 'a product signup without legal acceptance is refused');

-- The broker preflight exists only to choose a message. If it ever disagreed
-- with the writer it would either promise an account the ledger refuses, or
-- refuse one the ledger would have accepted.
select is(
  has_function_privilege('authenticated',
    'public.signup_legal_manifest_current(text,jsonb)', 'EXECUTE'),
  false, 'clients cannot use the preflight as a legal-corpus oracle');
select is(
  has_function_privilege('anon',
    'public.signup_legal_manifest_current(text,jsonb)', 'EXECUTE'),
  false, 'anonymous callers cannot probe the preflight');
select is(
  has_function_privilege('service_role',
    'public.signup_legal_manifest_current(text,jsonb)', 'EXECUTE'),
  true, 'the trusted broker may ask before creating an account');

select ok(public.signup_legal_manifest_current('worker', pg_temp.signup_manifest('worker')),
  'the current worker manifest passes preflight');
select ok(public.signup_legal_manifest_current('customer', pg_temp.signup_manifest('customer','ar')),
  'the current Arabic customer manifest passes preflight');
select ok(not public.signup_legal_manifest_current('worker', pg_temp.signup_manifest('customer')),
  'a customer manifest is not sufficient for a worker account');
select ok(not public.signup_legal_manifest_current('customer',
    jsonb_set(pg_temp.signup_manifest('customer'),'{0,version}',to_jsonb('9.9'::text))),
  'a stale version fails preflight exactly as the writer refuses it');
select ok(not public.signup_legal_manifest_current('customer',
    jsonb_set(pg_temp.signup_manifest('customer'),'{0,renderedHash}',to_jsonb(repeat('0',64)))),
  'an invented hash fails preflight exactly as the writer refuses it');
select ok(not public.signup_legal_manifest_current('customer',
    (select jsonb_agg(item) from jsonb_array_elements(pg_temp.signup_manifest('customer')) item
     where item->>'documentKey' <> 'privacy_policy')),
  'an omitted mandatory document fails preflight');
select ok(not public.signup_legal_manifest_current('customer',
    pg_temp.signup_manifest('customer') || pg_temp.signup_manifest('customer')),
  'a duplicated document fails preflight');
select ok(not public.signup_legal_manifest_current('customer', null),
  'a missing manifest fails preflight');
select ok(not public.signup_legal_manifest_current('staff', pg_temp.signup_manifest('customer')),
  'an unsupported audience fails preflight');

select * from finish();
rollback;
