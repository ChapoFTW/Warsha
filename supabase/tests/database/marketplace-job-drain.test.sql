begin;
select no_plan();

-- The marketplace's timers run through the drain, not by hand.
--
-- Until 202609170001 nothing called `run_marketplace_job`, so a request only
-- ever reached its first wave and never expired. This suite creates a real
-- request through the product writers and then lets ONLY
-- `private.drain_marketplace_jobs` — what pg_cron calls — move it on.
--
-- Time is moved by rewriting a job's `run_at` or a request's timestamps, never
-- by sleeping, so every assertion is deterministic.

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
end $fn$;

-- ---------------------------------------------------------------------------
-- Structure and schedule
-- ---------------------------------------------------------------------------
select has_function('private','drain_marketplace_jobs',array['integer'],'the drain exists');
select is(has_function_privilege('authenticated','private.drain_marketplace_jobs(integer)','EXECUTE'),false,
  'signed-in clients cannot run the drain');
select is(has_function_privilege('anon','private.drain_marketplace_jobs(integer)','EXECUTE'),false,
  'anonymous clients cannot run the drain');
select is(
  (select row(schedule, command, active)::text from cron.job where jobname='warsha-marketplace-jobs'),
  row('* * * * *','select private.drain_marketplace_jobs(50)',true)::text,
  'pg_cron runs the drain every minute');
select is((select count(*)::integer from cron.job where command ilike '%drain_marketplace_jobs%'),1,
  'exactly one schedule drains the queue');

-- ---------------------------------------------------------------------------
-- Fixture: one Customer, two Professionals covering Cairo / Zamalek
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','c8000000-0000-4000-8000-000000000001','authenticated','authenticated','drain-customer@test.local',null,'',now(),null,'{}','{"display_name":"Drain Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c8000000-0000-4000-8000-000000000002','authenticated','authenticated',null,'+201000000802','',null,now(),'{}','{"display_name":"First Professional"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c8000000-0000-4000-8000-000000000003','authenticated','authenticated',null,'+201000000803','',null,now(),'{}','{"display_name":"Second Professional"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count)
select ('c8000000-0000-4000-8001-00000000000'||n)::uuid, ('c8000000-0000-4000-8000-00000000000'||n)::uuid,
  'Drain Professional','plumbing','plumbing',array['plumbing'],'Complete marketplace profile for drain proof.',
  'c8000000-0000-4000-8000-00000000000'||n||'/avatar/profile.jpg',true,true,true,'approved',50,10,4.5,5
from generate_series(2,3) n;
insert into public.user_roles(user_id,role)
select ('c8000000-0000-4000-8000-00000000000'||n)::uuid,'provider' from generate_series(2,3) n on conflict do nothing;
insert into public.provider_verifications(provider_id,status,revision,reviewed_at)
select ('c8000000-0000-4000-8001-00000000000'||n)::uuid,'approved',1,now() from generate_series(2,3) n;
insert into storage.objects(bucket_id,name)
select 'profile-images','c8000000-0000-4000-8000-00000000000'||n||'/avatar/profile.jpg' from generate_series(2,3) n;
select set_config('warsha_test.service_id',(select id::text from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),true);
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,is_active)
select ('c8000000-0000-4000-8001-00000000000'||n)::uuid,current_setting('warsha_test.service_id')::uuid,200,'quote',true
from generate_series(2,3) n;
insert into public.provider_service_areas(provider_id,governorate,district,radius_km)
select ('c8000000-0000-4000-8001-00000000000'||n)::uuid,'Cairo','Zamalek',50 from generate_series(2,3) n;
insert into private.marketplace_category_duration_defaults(category_id,estimated_duration_minutes,policy_version)
values('plumbing',90,1) on conflict(category_id) do update set estimated_duration_minutes=90,policy_version=1;

-- One invitation per wave, so a second invitation can only come from a second
-- wave, and a second wave can only come from the drain.
update private.marketplace_configuration set first_wave_size=1 where singleton;

set local role authenticated;
select pg_temp.act_as('c8000000-0000-4000-8000-000000000001');
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values('c8000000-0000-4000-8002-000000000001','c8000000-0000-4000-8000-000000000001','Home','1 Drain Street','Drain Street','Cairo','Zamalek',true);
select public.confirm_my_service_address('c8000000-0000-4000-8002-000000000001',30.0600,31.2200,'manual_pin');
select lives_ok(
  $$select public.create_marketplace_request(jsonb_build_object('flowKind','get_quotes','categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),'addressId','c8000000-0000-4000-8002-000000000001','issueDescription','Kitchen sink drains very slowly','scheduleKind','asap','paymentCompatibility','either'),'drain-planned-request-01')$$,
  'a planned request is created');
select set_config('warsha_test.request',(select id::text from public.marketplace_requests where idempotency_key='drain-planned-request-01'),true);
reset role;
select pg_temp.act_as(null);

select is((select count(*)::integer from public.quote_invitations where request_id=current_setting('warsha_test.request')::uuid),1,
  'the first wave invites one Professional');
select is(
  (select array_agg(job_kind order by job_kind) from private.marketplace_jobs
   where request_id=current_setting('warsha_test.request')::uuid and state='pending'),
  array['additional_wave','expire_request'],
  'the request queued its second wave and its expiry');

-- ---------------------------------------------------------------------------
-- Nothing runs before it is due
-- ---------------------------------------------------------------------------
select is(private.drain_marketplace_jobs(50)->>'leased','0','the drain leaves jobs that are not yet due');

-- ---------------------------------------------------------------------------
-- The second wave
-- ---------------------------------------------------------------------------
update private.marketplace_jobs set run_at=now()-interval '1 second'
where request_id=current_setting('warsha_test.request')::uuid and job_kind='additional_wave';
select is(private.drain_marketplace_jobs(50),'{"leased":1,"succeeded":1,"terminalFailures":0}'::jsonb,'the drain runs the due wave');
select is((select count(*)::integer from public.quote_invitations where request_id=current_setting('warsha_test.request')::uuid),2,
  'the second wave reaches the second Professional');
select is((select state from private.marketplace_jobs
  where request_id=current_setting('warsha_test.request')::uuid and job_kind='additional_wave' and dedupe_key like '%:2'),
  'succeeded','the wave job is recorded as done');
select is(private.drain_marketplace_jobs(50)->>'leased','0','a finished job is never run twice');

-- ---------------------------------------------------------------------------
-- A job whose function refuses is retried, not lost
-- ---------------------------------------------------------------------------
-- The next wave is queued by the one that just ran. With the kill switch on,
-- `create_marketplace_wave` refuses; the drain must record that as a retry.
update private.marketplace_configuration set enabled=false where singleton;
update private.marketplace_jobs set run_at=now()-interval '1 second'
where request_id=current_setting('warsha_test.request')::uuid and job_kind='additional_wave' and state='pending';
select is(private.drain_marketplace_jobs(50),'{"leased":1,"succeeded":0,"terminalFailures":0}'::jsonb,
  'with the kill switch on, a due wave is attempted and refused');
select is(
  (select row(state, attempt_count, last_error_code is not null, run_at > now())::text from private.marketplace_jobs
   where request_id=current_setting('warsha_test.request')::uuid and job_kind='additional_wave' and dedupe_key like '%:3'),
  row('retryable_failed',1,true,true)::text,
  'the refusal is recorded with its error and a later retry');

-- The last permitted attempt is not retried again; it is reported.
update private.marketplace_jobs set run_at=now()-interval '1 second', attempt_count=maximum_attempts-1
where request_id=current_setting('warsha_test.request')::uuid and job_kind='additional_wave' and dedupe_key like '%:3';
select is(private.drain_marketplace_jobs(50)->>'terminalFailures','1','a job that exhausts its retries is counted as a terminal failure');
select is(
  (select row(category, severity, safe_detail->>'jobKind', safe_detail->>'errorCode', safe_detail->>'attempts', safe_detail ? 'redacted')::text
   from private.operational_log_events where event_key='marketplace.job_terminal_failure' order by occurred_at desc limit 1),
  row('marketplace','error','additional_wave','55000','5',false)::text,
  'and written to the operational log where operations already look');
select is(
  (select count(*)::integer from private.operational_log_events e
   where e.event_key='marketplace.job_terminal_failure'
     and e.safe_detail::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-'),
  0,'the log entry names the kind of job, never a request or a person');
select is(private.drain_marketplace_jobs(50)->>'terminalFailures','0','a terminal failure is reported once, not every minute');
update private.marketplace_jobs set state='retryable_failed', attempt_count=1, run_at=now()+interval '1 minute', completed_at=null
where request_id=current_setting('warsha_test.request')::uuid and job_kind='additional_wave' and dedupe_key like '%:3';
update private.marketplace_configuration set enabled=true where singleton;

-- ---------------------------------------------------------------------------
-- A lease whose runner vanished is taken over
-- ---------------------------------------------------------------------------
update private.marketplace_jobs
set state='leased', lease_owner='drain:lost', lease_expires_at=now()-interval '1 second', run_at=now()-interval '2 minutes'
where request_id=current_setting('warsha_test.request')::uuid and job_kind='additional_wave' and dedupe_key like '%:3';
select is(private.drain_marketplace_jobs(50)->>'leased','1','an expired lease is leased again');
select isnt(
  (select lease_owner from private.marketplace_jobs
   where request_id=current_setting('warsha_test.request')::uuid and job_kind='additional_wave' and dedupe_key like '%:3'),
  'drain:lost','and is no longer held by the runner that disappeared');

-- ---------------------------------------------------------------------------
-- Expiry
-- ---------------------------------------------------------------------------
-- A request cannot be both created and expired inside one transaction, so its
-- clock is moved back: created twenty minutes ago, expired one second ago.
update public.marketplace_requests
set created_at=now()-interval '20 minutes',
    collection_not_before=now()-interval '18 minutes',
    edit_deadline_at=now()-interval '15 minutes',
    expires_at=now()-interval '1 second'
where id=current_setting('warsha_test.request')::uuid;
update private.marketplace_jobs set run_at=now()-interval '1 second'
where request_id=current_setting('warsha_test.request')::uuid and job_kind='expire_request';
select is(private.drain_marketplace_jobs(50)->>'succeeded','1','the drain runs the due expiry');
select is((select status from public.marketplace_requests where id=current_setting('warsha_test.request')::uuid),'expired',
  'the request expires without anybody opening it');
select is(
  (select count(*)::integer from public.quote_invitations
   where request_id=current_setting('warsha_test.request')::uuid and status in ('invited','viewed','quoted')),
  0,'and its open invitations close with it');

select * from finish();
rollback;
