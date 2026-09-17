begin;
select no_plan();

-- Warsha does not collect criminal records (202609170004).
--
-- Owner decision: do not require a criminal-record certificate until legal
-- consultation has actually happened. This suite proves the consequences a
-- Professional and a reviewer actually meet: nothing asks for a certificate,
-- nothing accepts one, nothing waits for one, and the dormant capability is
-- intact for a future decision.
--
-- Role, agreements, work location and identity confirmation go through the
-- product RPCs. The provider profile, its services and area, and the two
-- identity document rows are fixtures: they are captured through storage and
-- camera flows this suite is not about.

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claims', case when p_uid is null then '' else jsonb_build_object(
    'sub', p_uid::text, 'role', 'authenticated', 'aal', 'aal1', 'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object('method','password','timestamp', floor(extract(epoch from now()))::bigint))
  )::text end, true);
end $fn$;

select has_table('private','worker_vetting_policy','the vetting policy exists');
select is(private.criminal_record_required(), false, 'CRIMINAL RECORDS ARE NOT COLLECTED');
select is(has_table_privilege('authenticated','private.worker_vetting_policy','UPDATE'), false,
  'no client can change the policy');

-- ---------------------------------------------------------------------------
-- A Professional who does everything else
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','cb000000-0000-4000-8000-000000000001','authenticated','authenticated',null,'+201000000b01','',null,now(),'{}','{"display_name":"Record Free Professional"}',now(),now()),
('00000000-0000-0000-0000-000000000000','cb000000-0000-4000-8000-000000000009','authenticated','authenticated','record-reviewer@test.local',null,'',now(),null,'{}','{"display_name":"Vetting Reviewer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','cb000000-0000-4000-8000-000000000008','authenticated','authenticated','record-operations@test.local',null,'',now(),null,'{}','{"display_name":"Operations Manager"}',now(),now());
-- The operations manager holds review_worker_vetting and NOT
-- review_criminal_records, which is what makes the approval below meaningful.
insert into public.staff_role_grants(user_id, role_key, reason, idempotency_key) values
  ('cb000000-0000-4000-8000-000000000009','verification_reviewer','Criminal record policy fixture','fixture:criminal-record-policy:9'),
  ('cb000000-0000-4000-8000-000000000008','operations_manager','Criminal record policy fixture','fixture:criminal-record-policy:8');

set local role authenticated;
select pg_temp.act_as('cb000000-0000-4000-8000-000000000001');
select lives_ok($$select public.select_my_account_role('worker')$$, 'the Professional chooses the Professional role');
select lives_ok($$select public.accept_my_worker_agreements(true, true)$$, 'and accepts the Professional agreements');
reset role;
select pg_temp.act_as(null);

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count)
values('cb000000-0000-4000-8001-000000000001','cb000000-0000-4000-8000-000000000001','Record Free Professional','plumbing','plumbing',array['plumbing'],'Complete profile for the criminal record policy proof.','cb000000-0000-4000-8000-000000000001/avatar/profile.jpg',false,true,false,'draft',50,0,0,0);
insert into storage.objects(bucket_id,name) values ('profile-images','cb000000-0000-4000-8000-000000000001/avatar/profile.jpg');
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,is_active)
select 'cb000000-0000-4000-8001-000000000001', id, 200, 'quote', true
from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1;
insert into public.provider_service_areas(provider_id,governorate,district,radius_km)
values ('cb000000-0000-4000-8001-000000000001','Cairo','Zamalek',50);
insert into public.provider_verification_documents(provider_id,document_type,storage_path,mime_type,file_size_bytes,is_current)
values
('cb000000-0000-4000-8001-000000000001','national_id_front','cb000000-0000-4000-8000-000000000001/id/front.jpg','image/jpeg',1024,true),
('cb000000-0000-4000-8001-000000000001','national_id_back','cb000000-0000-4000-8000-000000000001/id/back.jpg','image/jpeg',1024,true);
insert into private.provider_verification_identities(provider_id,national_id_hash,national_id_last4,legal_name,date_of_birth,confirmed_at,confirmed_by)
values ('cb000000-0000-4000-8001-000000000001', encode(extensions.digest('29001010101010','sha256'),'hex'), '1010',
        'Record Free Professional', '1990-01-01', now(), 'cb000000-0000-4000-8000-000000000001');

set local role authenticated;
select pg_temp.act_as('cb000000-0000-4000-8000-000000000001');
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values('cb000000-0000-4000-8002-000000000001','cb000000-0000-4000-8000-000000000001','Work location','Pinned work location','Pinned work location','Cairo','Zamalek',false);
select lives_ok($$select public.confirm_my_work_location('cb000000-0000-4000-8002-000000000001',30.06,31.22,'device_location')$$,
  'and confirms a work location');

select is((public.get_my_onboarding_state() ->> 'criminalRecordRequired'), 'false',
  'the onboarding state tells the clients there is no criminal-record step');
select is(
  (select count(*)::integer from jsonb_object_keys(public.get_my_onboarding_state() -> 'gates') k
   where k like 'criminal_record%'),
  0, 'NO ACTIVATION GATE ASKS FOR A CRIMINAL RECORD');
reset role;
select pg_temp.act_as(null);
select is(
  (select count(*)::integer from jsonb_object_keys(private.worker_provisional_gates('cb000000-0000-4000-8000-000000000001')) k
   where k like 'criminal_record%'),
  0, 'NO PROVISIONAL GATE ASKS FOR ONE EITHER');
select is(
  (select array_agg(g.key order by g.key) from jsonb_each(private.worker_provisional_gates('cb000000-0000-4000-8000-000000000001')) g
   where g.value = 'false'::jsonb),
  null::text[],
  'with identity confirmed and everything else done, no provisional gate is outstanding');

-- ---------------------------------------------------------------------------
-- Identity is the last step, and it activates
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('cb000000-0000-4000-8000-000000000001');
select is((public.submit_my_identity_for_review() ->> 'workerState'), 'provisionally_active',
  'SUBMITTING IDENTITY ACTIVATES THE PROFESSIONAL PROVISIONALLY, WITH NO CERTIFICATE');
select is((public.get_my_onboarding_state() ->> 'workerCapabilityActive'), 'true',
  'and the Professional can start taking work');

-- ---------------------------------------------------------------------------
-- Nothing accepts a certificate
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.submit_my_criminal_record(
      'cb000000-0000-4000-8000-000000000001/cert.pdf','application/pdf',2048,null,
      current_date - 3,'REF','Record Free Professional')$$,
  '55000', 'Criminal records are not currently collected',
  'the submission RPC refuses a valid certificate');
select throws_ok(
  $$insert into storage.objects(bucket_id,name,owner_id)
    values ('worker-criminal-records','cb000000-0000-4000-8000-000000000001/cert.pdf','cb000000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'THE BUCKET REFUSES A NEW CRIMINAL RECORD');
reset role;
select pg_temp.act_as(null);
select is((select count(*)::integer from public.worker_criminal_record_submissions
           where provider_id='cb000000-0000-4000-8001-000000000001'), 0,
  'and nothing was recorded');

-- ---------------------------------------------------------------------------
-- Staff: no certificate review, approval from identity review
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('cb000000-0000-4000-8000-000000000009');
select throws_ok(
  $$select public.staff_worker_vetting_decision('cb000000-0000-4000-8000-000000000001',
      'start_certificate_review','review_started','A reviewer is checking your certificate.')$$,
  '55000', 'Criminal records are not currently collected',
  'a reviewer cannot open a certificate review');
select lives_ok(
  $$select public.staff_worker_vetting_decision('cb000000-0000-4000-8000-000000000001',
      'start_identity_review','review_started','A reviewer is checking your identity.')$$,
  'a reviewer opens the identity review');
reset role;
select pg_temp.act_as(null);
select is('review_criminal_records' = any(private.staff_capability_keys('cb000000-0000-4000-8000-000000000008')), false,
  'the operations manager holds no criminal-record capability');
set local role authenticated;
select pg_temp.act_as('cb000000-0000-4000-8000-000000000008');
select lives_ok(
  $$select public.staff_worker_vetting_decision('cb000000-0000-4000-8000-000000000001',
      'approve','identity_ok','Your application was approved.')$$,
  'APPROVAL FROM IDENTITY REVIEW NEEDS ONLY THE VETTING CAPABILITY');
reset role;
select pg_temp.act_as(null);
select is((select worker_state from public.account_onboarding where user_id='cb000000-0000-4000-8000-000000000001'),
  'approved', 'the application is approved');
reset role;
select pg_temp.act_as(null);

-- ---------------------------------------------------------------------------
-- The capability is dormant, not gone
-- ---------------------------------------------------------------------------
update private.worker_vetting_policy set criminal_record_required = true where singleton;
select ok(private.worker_activation_gates('cb000000-0000-4000-8000-000000000001') ? 'criminal_record_uploaded',
  'switching the policy on restores the activation gates');
select ok(private.worker_provisional_gates('cb000000-0000-4000-8000-000000000001') ? 'criminal_record_uploaded',
  'and the provisional gate');
update public.account_onboarding set worker_state='identity_under_review' where user_id='cb000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.act_as('cb000000-0000-4000-8000-000000000009');
select throws_ok(
  $$select public.staff_worker_vetting_decision('cb000000-0000-4000-8000-000000000001',
      'approve','identity_ok','Your application was approved.')$$,
  '22023', 'A criminal record must be reviewed before approval',
  'and approval from identity review requires a certificate review again');
reset role;
select pg_temp.act_as(null);

select * from finish();
rollback;
