begin;
select no_plan();

-- A Professional that staff hide or remove is not found and not invited.
--
-- Enforcement goes through `public.staff_record_enforcement_action`, the RPC
-- the admin console calls, by a staff account holding a trust_safety_reviewer
-- grant. Visibility is then read through every path a Customer or the matcher
-- uses, because the defect was that none of them consulted trust state.

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claims', case when p_uid is null then '' else jsonb_build_object(
    'sub', p_uid::text, 'role', 'authenticated', 'aal', 'aal1', 'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object('method','password','timestamp', floor(extract(epoch from now()))::bigint))
  )::text end, true);
end $fn$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','ca000000-0000-4000-8000-000000000001','authenticated','authenticated','trust-customer@test.local',null,'',now(),null,'{}','{"display_name":"Trust Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','ca000000-0000-4000-8000-000000000002','authenticated','authenticated',null,'+201000000a02','',null,now(),'{}','{"display_name":"Hidden Professional"}',now(),now()),
('00000000-0000-0000-0000-000000000000','ca000000-0000-4000-8000-000000000003','authenticated','authenticated',null,'+201000000a03','',null,now(),'{}','{"display_name":"Visible Professional"}',now(),now()),
('00000000-0000-0000-0000-000000000000','ca000000-0000-4000-8000-000000000009','authenticated','authenticated','trust-staff@test.local',null,'',now(),null,'{}','{"display_name":"Trust Staff"}',now(),now());
insert into public.staff_role_grants(user_id, role_key, reason, idempotency_key) values
  ('ca000000-0000-4000-8000-000000000009','trust_safety_reviewer','Trust visibility fixture','fixture:trust-visibility:9');

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count)
values
('ca000000-0000-4000-8001-000000000002','ca000000-0000-4000-8000-000000000002','Hidden Professional','plumbing','plumbing',array['plumbing'],'Complete marketplace profile for trust proof.','ca000000-0000-4000-8000-000000000002/avatar/profile.jpg',true,true,true,'approved',50,10,4.5,5),
('ca000000-0000-4000-8001-000000000003','ca000000-0000-4000-8000-000000000003','Visible Professional','plumbing','plumbing',array['plumbing'],'Complete marketplace profile for trust proof.','ca000000-0000-4000-8000-000000000003/avatar/profile.jpg',true,true,true,'approved',50,10,4.5,5);
insert into public.user_roles(user_id,role)
select ('ca000000-0000-4000-8000-00000000000'||n)::uuid,'provider' from generate_series(2,3) n on conflict do nothing;
insert into public.provider_verifications(provider_id,status,revision,reviewed_at)
select ('ca000000-0000-4000-8001-00000000000'||n)::uuid,'approved',1,now() from generate_series(2,3) n;
insert into storage.objects(bucket_id,name)
select 'profile-images','ca000000-0000-4000-8000-00000000000'||n||'/avatar/profile.jpg' from generate_series(2,3) n;
select set_config('warsha_test.service_id',(select id::text from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),true);
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,is_active)
select ('ca000000-0000-4000-8001-00000000000'||n)::uuid,current_setting('warsha_test.service_id')::uuid,200,'quote',true from generate_series(2,3) n;
insert into public.provider_service_areas(provider_id,governorate,district,radius_km)
select ('ca000000-0000-4000-8001-00000000000'||n)::uuid,'Cairo','Zamalek',50 from generate_series(2,3) n;
insert into private.marketplace_category_duration_defaults(category_id,estimated_duration_minutes,policy_version)
values('plumbing',90,1) on conflict(category_id) do update set estimated_duration_minutes=90,policy_version=1;

create function pg_temp.found_in_search(p_provider uuid)
returns boolean language sql as $fn$
  select exists (select 1 from jsonb_array_elements(
    public.search_providers(null,'{}'::jsonb,'recommended',50,0)->'results') r where (r->>'id')::uuid = p_provider)
$fn$;
create function pg_temp.found_in_catalog(p_provider uuid)
returns boolean language sql as $fn$
  select exists (select 1 from jsonb_array_elements(public.get_marketplace_catalog_v2()->'providers') r
    where (r->>'id')::uuid = p_provider)
$fn$;

select is(private.is_provider_publicly_discoverable('ca000000-0000-4000-8001-000000000002'),true,
  'before any action, the Professional is discoverable');
select ok(pg_temp.found_in_search('ca000000-0000-4000-8001-000000000002'),'and is found by search');
select ok(pg_temp.found_in_catalog('ca000000-0000-4000-8001-000000000002'),'and is in the catalogue');

-- ---------------------------------------------------------------------------
-- Staff hide the profile
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('ca000000-0000-4000-8000-000000000009');
select lives_ok(
  $$select public.staff_record_enforcement_action('ca000000-0000-4000-8000-000000000002',
    'profile_hidden','repeated_violations','Profile under review','Repeated complaints reviewed by staff','trust-hide-key-0001')$$,
  'staff hide the Professional through the admin RPC');
reset role;
select pg_temp.act_as(null);

select is(private.is_provider_publicly_discoverable('ca000000-0000-4000-8001-000000000002'),false,
  'A HIDDEN PROFESSIONAL IS NOT DISCOVERABLE');
select ok(not pg_temp.found_in_search('ca000000-0000-4000-8001-000000000002'),'search no longer returns them');
select ok(not pg_temp.found_in_catalog('ca000000-0000-4000-8001-000000000002'),'the catalogue no longer lists them');
select is(private.is_provider_publicly_discoverable('ca000000-0000-4000-8001-000000000003'),true,
  'a Professional nobody acted on is untouched');
select is(
  (select discoverable from private.notification_discoverability_state where provider_id='ca000000-0000-4000-8001-000000000002'),
  false,'the discoverability state follows the enforcement action when it happens');
select is(
  (select count(*)::integer from public.notifications
   where user_id='ca000000-0000-4000-8000-000000000002' and type='worker_profile_unavailable'),
  1,'and the Professional is told their profile became unavailable');

-- ---------------------------------------------------------------------------
-- Nor are they invited
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('ca000000-0000-4000-8000-000000000001');
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values('ca000000-0000-4000-8002-000000000001','ca000000-0000-4000-8000-000000000001','Home','1 Trust Street','Trust Street','Cairo','Zamalek',true);
select public.confirm_my_service_address('ca000000-0000-4000-8002-000000000001',30.0600,31.2200,'manual_pin');
select lives_ok(
  $$select public.create_marketplace_request(jsonb_build_object('flowKind','get_quotes','categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),'addressId','ca000000-0000-4000-8002-000000000001','issueDescription','Water heater is not heating','scheduleKind','asap','paymentCompatibility','either'),'trust-hidden-request-0001')$$,
  'a Customer in the hidden Professional''s area posts a request');
reset role;
select pg_temp.act_as(null);
select is(
  (select array_agg(provider_id) from public.quote_invitations
   where request_id=(select id from public.marketplace_requests where idempotency_key='trust-hidden-request-0001')),
  array['ca000000-0000-4000-8001-000000000003'::uuid],
  'ONLY THE VISIBLE PROFESSIONAL IS INVITED');

-- ---------------------------------------------------------------------------
-- Removal and suspension are the same rule; restoration reverses it
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('ca000000-0000-4000-8000-000000000009');
select lives_ok(
  $$select public.staff_record_enforcement_action('ca000000-0000-4000-8000-000000000002',
    'restoration','investigation_closed','Profile restored','Review completed with no finding','trust-restore-key-001')$$,
  'staff restore the Professional');
reset role;
select pg_temp.act_as(null);
select is(private.is_provider_publicly_discoverable('ca000000-0000-4000-8001-000000000002'),true,
  'a restored Professional is discoverable again');

set local role authenticated;
select pg_temp.act_as('ca000000-0000-4000-8000-000000000009');
select lives_ok(
  $$select public.staff_record_enforcement_action('ca000000-0000-4000-8000-000000000003',
    'marketplace_removal','dangerous_behavior','Removed from marketplace','Safety concern reviewed by staff','trust-remove-key-0001')$$,
  'staff remove the other Professional from the marketplace');
reset role;
select pg_temp.act_as(null);
select is(private.is_provider_publicly_discoverable('ca000000-0000-4000-8001-000000000003'),false,
  'a Professional removed from the marketplace is not discoverable');

-- A restriction that has lapsed no longer hides anybody.
update public.trust_account_state set restriction_expires_at = now() - interval '1 second'
where user_id='ca000000-0000-4000-8000-000000000003';
select is(private.is_provider_publicly_discoverable('ca000000-0000-4000-8001-000000000003'),true,
  'once the restriction has expired, the Professional is discoverable again');

select * from finish();
rollback;
