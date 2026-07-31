begin;

select plan(99);
select set_config('storage.allow_delete_query', 'true', true);

-- Schema, permissions, and private Storage shape.
select has_table('public', 'provider_verifications', 'verification profile exists'); -- 1
select has_table('private', 'provider_verification_identities', 'sensitive identity table is private'); -- 2
select has_column('public', 'provider_profiles', 'skill_certificate_verified', 'public skill trust flag exists'); -- 3
select has_column('public', 'provider_verification_documents', 'mime_type', 'document MIME metadata exists'); -- 4
select has_column('public', 'provider_verification_documents', 'is_current', 'document replacement marker exists'); -- 5
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.provider_verifications'::regclass), true, 'verification profile RLS is enabled'); -- 6
select is((select relrowsecurity from pg_catalog.pg_class where oid = 'public.provider_verification_documents'::regclass), true, 'verification document RLS remains enabled'); -- 7
select has_function('public', 'get_my_provider_verification', array[]::text[], 'owner read RPC exists'); -- 8
select has_function('public', 'register_provider_verification_document', array['text', 'text', 'text', 'bigint'], 'document registration RPC exists'); -- 9
select has_function('public', 'remove_provider_verification_document', array['uuid'], 'document removal RPC exists'); -- 10
select has_function('public', 'submit_provider_verification', array['text', 'boolean'], 'submission RPC exists'); -- 11
select has_function('public', 'review_provider_verification', array['uuid', 'text', 'text', 'timestamp with time zone', 'boolean'], 'staff review RPC exists'); -- 12
select is(has_function_privilege('anon', 'public.get_my_provider_verification()', 'EXECUTE'), false, 'anonymous users cannot read verification'); -- 13
select is(has_function_privilege('authenticated', 'public.get_my_provider_verification()', 'EXECUTE'), true, 'authenticated providers can invoke owner read'); -- 14
select is(has_function_privilege('anon', 'public.register_provider_verification_document(text,text,text,bigint)', 'EXECUTE'), false, 'anonymous users cannot register documents'); -- 15
select is(has_function_privilege('authenticated', 'public.register_provider_verification_document(text,text,text,bigint)', 'EXECUTE'), true, 'authenticated providers can invoke document registration'); -- 16
select is(has_function_privilege('anon', 'public.submit_provider_verification(text,boolean)', 'EXECUTE'), false, 'anonymous users cannot submit verification'); -- 17
select is(has_function_privilege('authenticated', 'public.submit_provider_verification(text,boolean)', 'EXECUTE'), true, 'authenticated providers can invoke submission'); -- 18
select is(has_function_privilege('anon', 'public.review_provider_verification(uuid,text,text,timestamp with time zone,boolean)', 'EXECUTE'), false, 'anonymous users cannot review verification'); -- 19
select is(has_function_privilege('authenticated', 'public.review_provider_verification(uuid,text,text,timestamp with time zone,boolean)', 'EXECUTE'), true, 'authenticated staff can invoke guarded review'); -- 20
select is(
  (
    select coalesce(pg_catalog.bool_or(a.grantee = 0 and a.privilege_type = 'EXECUTE'), false)
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    where p.oid = 'public.submit_provider_verification(text,boolean)'::regprocedure
  ),
  false,
  'PUBLIC has no verification submission execution grant'
); -- 21
select is(has_table_privilege('authenticated', 'public.provider_verifications', 'INSERT'), false, 'clients cannot directly insert verification profiles'); -- 22
select is(has_table_privilege('authenticated', 'public.provider_verifications', 'UPDATE'), false, 'clients cannot directly approve verification profiles'); -- 23
select is(has_table_privilege('authenticated', 'public.provider_verification_documents', 'INSERT'), false, 'clients cannot bypass document registration'); -- 24
select is(has_table_privilege('authenticated', 'private.provider_verification_identities', 'SELECT'), false, 'clients cannot read National ID material'); -- 25
select is((select public from storage.buckets where id = 'verification-documents'), false, 'verification bucket is private'); -- 26
select is((select file_size_limit from storage.buckets where id = 'verification-documents'), 8388608::bigint, 'verification bucket limit is 8 MB'); -- 27
select is(
  (select allowed_mime_types from storage.buckets where id = 'verification-documents'),
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[],
  'verification bucket accepts only supported images'
); -- 28
select is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'verification_document_insert',
        'verification_document_select',
        'verification_document_delete'
      )
  ),
  3,
  'three narrowly scoped verification Storage policies exist'
); -- 29
select is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'UPDATE'
      and policyname like 'verification_document%'
  ),
  0,
  'verification objects cannot be overwritten'
); -- 30
select is(private.verification_provider_id('../unsafe.jpg'), null, 'unsafe Storage paths do not resolve'); -- 31
select is(
  private.verification_provider_id(
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/selfie/file-0001.jpg'
  ),
  '82000000-0000-0000-0000-000000000001'::uuid,
  'provider-scoped Storage paths resolve safely'
); -- 32
select is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'provider_verifications'
  ),
  1,
  'verification status is published for RLS-filtered realtime'
); -- 33
select is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'provider_profiles'
  ),
  1,
  'public trust badge changes are published for realtime'
); -- 34

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'verify-provider-1@test.local', '', pg_catalog.now(), '{}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'verify-provider-2@test.local', '', pg_catalog.now(), '{}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'verify-customer@test.local', '', pg_catalog.now(), '{}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'verify-staff@test.local', '', pg_catalog.now(), '{}', '{}', pg_catalog.now(), pg_catalog.now());

insert into public.provider_profiles (
  id,
  user_id,
  display_name,
  profession_key,
  onboarding_status,
  is_published
)
values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Verification provider one', 'professional', 'approved', true),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', 'Verification provider two', 'professional', 'approved', true);

insert into public.user_roles(user_id, role)
values ('81000000-0000-0000-0000-000000000004', 'admin')
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select is(
  public.get_my_provider_verification()->>'status',
  'not_started',
  'provider starts with a simple not-started state'
); -- 35

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.get_my_provider_verification()$$,
  '42501',
  'Provider profile not found',
  'customer cannot use the provider verification read RPC'
); -- 36

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'verification-documents',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/national_id_front/front-0001.jpg'
  )$$,
  'provider can stage an owned front image'
); -- 37

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'verification-documents',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/national_id_back/wrong-owner.jpg'
  )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'another provider cannot upload into the owner path'
); -- 38
select throws_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'verification-documents',
    '81000000-0000-0000-0000-000000000002/82000000-0000-0000-0000-000000000001/national_id_back/wrong-provider.jpg'
  )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'provider cannot upload into a profile they do not own'
); -- 39

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'verification-documents',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/passport/bad-type-0001.jpg'
  )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'unsupported document type cannot be uploaded'
); -- 40
select lives_ok(
  $$select public.register_provider_verification_document(
    'national_id_front',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/national_id_front/front-0001.jpg',
    'image/jpeg',
    1024
  )$$,
  'provider can register the owned front image'
); -- 41
select lives_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'verification-documents',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/national_id_back/back-0001.jpg'
  );
  select public.register_provider_verification_document(
    'national_id_back',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/national_id_back/back-0001.jpg',
    'image/jpeg',
    1024
  )$$,
  'provider can add the back image'
); -- 42
select lives_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'verification-documents',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/selfie/selfie-0001.jpg'
  );
  select public.register_provider_verification_document(
    'selfie',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/selfie/selfie-0001.jpg',
    'image/jpeg',
    1024
  )$$,
  'provider can add the selfie'
); -- 43
select lives_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'verification-documents',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/national_id_front/front-0002.jpg'
  )$$,
  'replacement uses a fresh object path'
); -- 44
select lives_ok(
  $$select public.register_provider_verification_document(
    'national_id_front',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/national_id_front/front-0002.jpg',
    'image/jpeg',
    2048
  )$$,
  'replacement metadata is registered by RPC'
); -- 45
select is(
  (
    select pg_catalog.count(*)::integer
    from public.provider_verification_documents
    where provider_id = '82000000-0000-0000-0000-000000000001'
      and document_type = 'national_id_front'
      and is_current
  ),
  1,
  'one current document exists per type'
); -- 46
select is(
  (
    select is_current
    from public.provider_verification_documents
    where storage_path like '%/front-0001.jpg'
  ),
  false,
  'replaced document metadata is retained as non-current'
); -- 47
select lives_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'verification-documents',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/skill_certificate/skill-0001.jpg'
  );
  select public.register_provider_verification_document(
    'skill_certificate',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/skill_certificate/skill-0001.jpg',
    'image/jpeg',
    1024
  )$$,
  'optional Skill Certificate can be uploaded'
); -- 48
select lives_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'verification-documents',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/other/draft-delete-0001.jpg'
  )$$,
  'provider can stage an optional draft object'
); -- 49
select lives_ok(
  $$delete from storage.objects
    where bucket_id = 'verification-documents'
      and name like '%/other/draft-delete-0001.jpg'$$,
  'provider can delete an owned draft object'
); -- 50
select is(
  (
    select pg_catalog.count(*)::integer
    from storage.objects
    where bucket_id = 'verification-documents'
      and name like '%/other/draft-delete-0001.jpg'
  ),
  0,
  'draft object deletion succeeds'
); -- 51
select throws_ok(
  $$select public.submit_provider_verification('123', false)$$,
  '22023',
  'National ID must contain 14 digits',
  'National ID requires 14 digits'
); -- 52

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.submit_provider_verification('29801011234567', false)$$,
  '22023',
  'Required identity photos are missing',
  'submission without required identity photos is denied'
); -- 53

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.submit_provider_verification('٢٩٨٠١٠١١٢٣٤٥٦٧', false)$$,
  'Arabic digits are normalized and valid evidence can be submitted'
); -- 54
select is(
  (
    select status
    from public.provider_verifications
    where provider_id = '82000000-0000-0000-0000-000000000001'
  ),
  'submitted',
  'submission enters the server-authoritative submitted state'
); -- 55
select is(
  (
    select skill_certificate_answer
    from public.provider_verifications
    where provider_id = '82000000-0000-0000-0000-000000000001'
  ),
  'no',
  'Skill Certificate remains optional'
); -- 56
reset role;
select is(
  (
    select national_id_last4
    from private.provider_verification_identities
    where provider_id = '82000000-0000-0000-0000-000000000001'
  ),
  '4567',
  'only masked National ID support data is retained alongside the hash'
); -- 57
select ok(
  (
    select public.get_my_provider_verification()::text not like '%29801011234567%'
  ),
  'owner response never contains the National ID'
); -- 58
select is(
  (
    select pg_catalog.count(*)::integer
    from public.notifications
    where user_id = '81000000-0000-0000-0000-000000000001'
      and type = 'verification_submitted'
  ),
  1,
  'submission creates one deduplicated notification'
); -- 59
select ok(
  (
    select data::text not like '%29801011234567%'
    from public.notifications
    where user_id = '81000000-0000-0000-0000-000000000001'
      and type = 'verification_submitted'
  ),
  'notifications never contain the National ID'
); -- 60

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.submit_provider_verification('29801011234567', false)$$,
  '23505',
  'Verification is already submitted',
  'duplicate submission is denied'
); -- 61
delete from storage.objects
where bucket_id = 'verification-documents'
  and name like '%/skill_certificate/skill-0001.jpg';
reset role;
select is(
  (
    select pg_catalog.count(*)::integer
    from storage.objects
    where bucket_id = 'verification-documents'
      and name like '%/skill_certificate/skill-0001.jpg'
  ),
  1,
  'submitted verification locks document deletion'
); -- 62

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.review_provider_verification(
    '82000000-0000-0000-0000-000000000001',
    'approved',
    null,
    null,
    false
  )$$,
  '42501',
  'Staff access required',
  'provider cannot approve themselves'
); -- 63
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.provider_verifications
    where provider_id = '82000000-0000-0000-0000-000000000001'
  ),
  0,
  'customer cannot read the verification profile'
); -- 64
select is(
  (
    select pg_catalog.count(*)::integer
    from public.provider_verification_documents
    where provider_id = '82000000-0000-0000-0000-000000000001'
  ),
  0,
  'customer cannot read verification documents'
); -- 65

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.review_provider_verification(
    '82000000-0000-0000-0000-000000000001',
    'under_review',
    null,
    null,
    false
  )$$,
  'staff can move a submitted verification under review'
); -- 66
select is(
  (
    select status
    from public.provider_verifications
    where provider_id = '82000000-0000-0000-0000-000000000001'
  ),
  'under_review',
  'under-review transition is stored'
); -- 67
select lives_ok(
  $$select public.review_provider_verification(
    '82000000-0000-0000-0000-000000000001',
    'approved',
    null,
    pg_catalog.now() + interval '1 year',
    false
  )$$,
  'staff can approve complete identity evidence'
); -- 68
reset role;
select is(
  (select is_verified from public.provider_profiles where id = '82000000-0000-0000-0000-000000000001'),
  true,
  'identity approval controls the public verified flag'
); -- 69
select is(
  (select skill_certificate_verified from public.provider_profiles where id = '82000000-0000-0000-0000-000000000001'),
  false,
  'uploaded Skill Certificate is not trusted until separately approved'
); -- 70
select is(
  (
    select pg_catalog.count(*)::integer
    from public.notifications
    where user_id = '81000000-0000-0000-0000-000000000001'
      and type = 'verification_approved'
  ),
  1,
  'approval notification is deduplicated'
); -- 71

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.review_provider_verification(
    '82000000-0000-0000-0000-000000000001',
    'expired',
    null,
    null,
    false
  )$$,
  'staff can expire an approved verification'
); -- 72
reset role;
select is(
  (select is_verified from public.provider_profiles where id = '82000000-0000-0000-0000-000000000001'),
  false,
  'expiry removes the public identity flag'
); -- 73
select is(
  (
    select pg_catalog.count(*)::integer
    from public.notifications
    where user_id = '81000000-0000-0000-0000-000000000001'
      and type = 'verification_expired'
  ),
  1,
  'expiry creates one notification'
); -- 74

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.submit_provider_verification('29801011234567', true)$$,
  'expired provider can resubmit and choose the optional certificate'
); -- 75
select is(
  (
    select skill_certificate_answer
    from public.provider_verifications
    where provider_id = '82000000-0000-0000-0000-000000000001'
  ),
  'yes',
  'optional Skill Certificate choice is stored'
); -- 76
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.review_provider_verification(
    '82000000-0000-0000-0000-000000000001',
    'approved',
    null,
    null,
    true
  )$$,
  'staff can independently approve the Skill Certificate'
); -- 77
reset role;
select is(
  (select skill_certificate_verified from public.provider_profiles where id = '82000000-0000-0000-0000-000000000001'),
  true,
  'Skill Certificate approval controls its own public trust flag'
); -- 78

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select is(
  public.get_provider_trust_indicators(
    '82000000-0000-0000-0000-000000000001'
  ),
  '{"identityVerified": true, "skillCertificateVerified": true}'::jsonb,
  'customer can see only the two positive trust indicators'
); -- 79
select is(
  (
    select pg_catalog.count(*)::integer
    from public.provider_verifications
    where provider_id = '82000000-0000-0000-0000-000000000001'
  ),
  0,
  'customer still cannot see workflow details after approval'
); -- 80
reset role;
select is(
  (
    select pg_catalog.count(*)::integer
    from public.notifications
    where user_id = '81000000-0000-0000-0000-000000000001'
      and type = 'verification_approved'
  ),
  2,
  'a later revision can create one new approval notification'
); -- 81

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.review_provider_verification(
    '82000000-0000-0000-0000-000000000001',
    'expired',
    null,
    null,
    false
  )$$,
  'second approved revision can expire'
); -- 82
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.submit_provider_verification('29801011234567', false)$$,
  'provider can submit a new revision after expiry'
); -- 83
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.review_provider_verification(
    '82000000-0000-0000-0000-000000000001',
    'rejected',
    'Please retake the front image in better light.',
    null,
    false
  )$$,
  'staff can reject a submitted revision with a reason'
); -- 84
select is(
  (
    select status
    from public.provider_verifications
    where provider_id = '82000000-0000-0000-0000-000000000001'
  ),
  'rejected',
  'rejected state is stored'
); -- 85
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select is(
  public.get_my_provider_verification()->>'rejectionReason',
  'Please retake the front image in better light.',
  'provider owner can see the rejection reason'
); -- 86
select lives_ok(
  $$insert into storage.objects(bucket_id, name) values(
    'verification-documents',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/national_id_front/front-0003.jpg'
  );
  select public.register_provider_verification_document(
    'national_id_front',
    '81000000-0000-0000-0000-000000000001/82000000-0000-0000-0000-000000000001/national_id_front/front-0003.jpg',
    'image/jpeg',
    2048
  )$$,
  'rejected provider can replace the requested photo'
); -- 87
select is(
  (
    select status
    from public.provider_verifications
    where provider_id = '82000000-0000-0000-0000-000000000001'
  ),
  'draft',
  'editing after rejection returns the workflow to draft'
); -- 88
select lives_ok(
  $$select public.submit_provider_verification('29801011234567', false)$$,
  'corrected draft can be resubmitted'
); -- 89
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.review_provider_verification(
    '82000000-0000-0000-0000-000000000001',
    'requires_resubmission',
    'Please add one clearer selfie.',
    null,
    false
  )$$,
  'staff can request another resubmission'
); -- 90
select is(
  (
    select status
    from public.provider_verifications
    where provider_id = '82000000-0000-0000-0000-000000000001'
  ),
  'requires_resubmission',
  'resubmission-requested state is stored'
); -- 91
reset role;
select is(
  (
    select pg_catalog.count(*)::integer
    from public.notifications
    where user_id = '81000000-0000-0000-0000-000000000001'
      and type = 'verification_resubmission_requested'
  ),
  1,
  'resubmission request creates one notification'
); -- 92
select is(
  (
    select pg_catalog.count(*)::integer
    from public.audit_logs
    where entity_type = 'provider_verification'
      and action = 'provider_verification_reviewed'
  ),
  7,
  'every staff review transition is audit logged'
); -- 93
select is(
  has_function_privilege(
    'anon',
    'public.get_provider_trust_indicators(uuid)',
    'EXECUTE'
  ),
  true,
  'anonymous marketplace users can read sanitized trust indicators'
); -- 94
select is(
  has_function_privilege(
    'authenticated',
    'public.get_provider_trust_indicators(uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated marketplace users can read sanitized trust indicators'
); -- 95
select has_function(
  'public',
  'get_marketplace_catalog',
  array[]::text[],
  'sanitized marketplace catalog RPC exists'
); -- 96
select is(
  has_function_privilege(
    'anon',
    'public.get_marketplace_catalog()',
    'EXECUTE'
  ),
  true,
  'anonymous marketplace users can invoke the sanitized catalog'
); -- 97
select is(
  has_function_privilege(
    'authenticated',
    'public.get_marketplace_catalog()',
    'EXECUTE'
  ),
  true,
  'authenticated marketplace users can invoke the sanitized catalog'
); -- 98
set local role anon;
select is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.jsonb_array_elements(
      public.get_marketplace_catalog()->'providers'
    ) provider
    where provider->>'id' = '82000000-0000-0000-0000-000000000001'
  ),
  0,
  'catalog hides a worker whose identity verification requires resubmission'
); -- 99

reset role;
select set_config('request.jwt.claim.sub', '', true);
select * from finish();
rollback;
