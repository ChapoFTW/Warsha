begin;
select no_plan();

-- A comeback goes to the same Professional only where they still work.
--
-- The owner's rule, 2026-09-17: no hidden bypass of service areas, and no
-- out-of-area mechanism for now. A comeback is a new request aimed at the
-- Professional who did the original job; if they no longer cover that area,
-- the request must not reach them because it is a comeback.

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
end $fn$;

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000001','authenticated','authenticated','comeback-customer@test.local',null,'',now(),null,'{}','{"display_name":"Comeback Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000002','authenticated','authenticated',null,'+201000000d02','',null,now(),'{}','{"display_name":"Original Professional"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count)
values('d0000000-0000-4000-8001-000000000002','d0000000-0000-4000-8000-000000000002','Original Professional','plumbing','plumbing',array['plumbing'],'Complete marketplace profile for comeback proof.','d0000000-0000-4000-8000-000000000002/avatar/profile.jpg',true,true,true,'approved',50,10,4.5,5);
insert into public.user_roles(user_id,role) values('d0000000-0000-4000-8000-000000000002','provider') on conflict do nothing;
insert into public.provider_verifications(provider_id,status,revision,reviewed_at) values('d0000000-0000-4000-8001-000000000002','approved',1,now());
insert into storage.objects(bucket_id,name) values('profile-images','d0000000-0000-4000-8000-000000000002/avatar/profile.jpg');
select set_config('warsha_test.service_id',(select id::text from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),true);
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,is_active)
values('d0000000-0000-4000-8001-000000000002',current_setting('warsha_test.service_id')::uuid,200,'quote',true);
insert into public.provider_service_areas(provider_id,governorate,district,radius_km)
values('d0000000-0000-4000-8001-000000000002','Cairo','Zamalek',50);
insert into private.marketplace_category_duration_defaults(category_id,estimated_duration_minutes,policy_version)
values('plumbing',90,1) on conflict(category_id) do update set estimated_duration_minutes=90,policy_version=1;
insert into private.marketplace_category_warranty_configuration(category_id,enabled,duration_days,policy_version)
values('plumbing',true,30,1)
on conflict(category_id) do update set enabled=true, duration_days=30, policy_version=1;
update private.marketplace_capacity_configuration set road_factor=1.3, average_urban_speed_kmh=30 where singleton;

-- The original job: a request from a confirmed address in Zamalek, converted
-- to a completed booking.
set local role authenticated;
select pg_temp.act_as('d0000000-0000-4000-8000-000000000001');
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values('d0000000-0000-4000-8002-000000000001','d0000000-0000-4000-8000-000000000001','Home','2 Comeback Street','Comeback Street','Cairo','Zamalek',true);
select public.confirm_my_service_address('d0000000-0000-4000-8002-000000000001',30.0600,31.2200,'manual_pin');
select set_config('warsha_test.request', public.create_marketplace_request(jsonb_build_object(
  'flowKind','get_quotes','categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),
  'addressId','d0000000-0000-4000-8002-000000000001','issueDescription','Bathroom tap keeps dripping',
  'scheduleKind','asap','paymentCompatibility','either'),'comeback-original-request-1')::text, true);
reset role;
select pg_temp.act_as(null);

select is((select count(*)::integer from public.quote_invitations where request_id=current_setting('warsha_test.request')::uuid),1,
  'the Professional who covers Zamalek is invited to the original request');

select pg_temp.act_as('d0000000-0000-4000-8000-000000000001');
-- The duration a converted booking carries (`convert_marketplace_request`
-- takes it from the quote or the request). The comeback copies it, and a
-- comeback without one matches nobody, because the capacity check refuses a
-- job of unknown length.
insert into public.bookings(id,customer_id,provider_id,service_id,marketplace_request_id,status,service_name_snapshot,pricing_type,estimated_price_egp,estimated_duration_minutes,issue_description,scheduled_date,scheduled_time,address_id,address_snapshot,idempotency_key)
values('d0000000-0000-4000-8003-000000000001','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8001-000000000002',
  current_setting('warsha_test.service_id')::uuid, current_setting('warsha_test.request')::uuid,'completed','Comeback service','fixed',200,90,
  'Bathroom tap keeps dripping',current_date-2,'12:00','d0000000-0000-4000-8002-000000000001','2 Comeback Street, Zamalek, Cairo','comeback-booking-1');
select pg_temp.act_as(null);
update public.booking_status_history set created_at = now() - interval '2 days'
where booking_id='d0000000-0000-4000-8003-000000000001' and status='completed';

-- ---------------------------------------------------------------------------
-- The Professional stops covering the area
-- ---------------------------------------------------------------------------
update public.provider_service_areas set district='Maadi' where provider_id='d0000000-0000-4000-8001-000000000002';

set local role authenticated;
select pg_temp.act_as('d0000000-0000-4000-8000-000000000001');
select set_config('warsha_test.comeback', public.create_comeback_request('d0000000-0000-4000-8003-000000000001',
  '{"issueDescription":"The same leak came back after the repair"}'::jsonb,'comeback-out-of-area-0001')::text, true);
reset role;
select pg_temp.act_as(null);

select is((select flow_kind from public.marketplace_requests where id=current_setting('warsha_test.comeback')::uuid),'comeback',
  'the comeback request is created for the Customer who asked');
select is((select targeted_provider_id from public.marketplace_requests where id=current_setting('warsha_test.comeback')::uuid),
  'd0000000-0000-4000-8001-000000000002'::uuid,'and is aimed at the Professional who did the job');
select is((select count(*)::integer from public.quote_invitations where request_id=current_setting('warsha_test.comeback')::uuid),0,
  'A COMEBACK DOES NOT REACH A PROFESSIONAL WHO NO LONGER COVERS THE AREA');
select is((select count(*)::integer from private.marketplace_matching_runs r
  where r.request_id=current_setting('warsha_test.comeback')::uuid and r.eligible_count = 0),1,
  'the matching run says plainly that nobody was eligible');
select is((select estimated_duration_minutes from public.marketplace_requests where id=current_setting('warsha_test.comeback')::uuid),90,
  'and the comeback carries the original job''s duration, so nothing else is what excluded them');

-- ---------------------------------------------------------------------------
-- Cover the area again, and the same comeback reaches them
-- ---------------------------------------------------------------------------
update public.provider_service_areas set district='Zamalek' where provider_id='d0000000-0000-4000-8001-000000000002';
select ok(private.create_marketplace_wave(current_setting('warsha_test.comeback')::uuid,'retry','comeback-retry-wave-0001') >= 1,
  'a later wave invites them once they cover it again');
select is((select provider_id from public.quote_invitations where request_id=current_setting('warsha_test.comeback')::uuid),
  'd0000000-0000-4000-8001-000000000002'::uuid,'and only them, because the comeback is targeted');

-- ---------------------------------------------------------------------------
-- No exemption anywhere in the matcher
-- ---------------------------------------------------------------------------
-- The area test is one `exists` over provider_service_areas, applied to every
-- flow. This reads the shipped function rather than trusting the two cases
-- above: an exemption written for 'comeback' would pass them both if it were
-- added after a Professional came back into the area.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'create_marketplace_wave'
     and p.prosrc ~ 'flow_kind\s*(<>|=)\s*''comeback'''),
  0,
  'THE MATCHER HAS NO COMEBACK EXEMPTION AT ALL');
select ok(
  (select p.prosrc like '%provider_service_areas%'
   from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'create_marketplace_wave'),
  'and every wave, whatever the flow, is bounded by the declared areas');

select * from finish();
rollback;
