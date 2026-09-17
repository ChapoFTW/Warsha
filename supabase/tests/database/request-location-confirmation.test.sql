begin;
select no_plan();

-- A request goes where the Customer confirmed it goes (202609170007).
--
-- The owner's rule: a request requires authoritative confirmed coordinates. A
-- map that cannot draw does not block a place the geocoder resolved (its
-- coordinates are confirmed as `address_search`); a place nobody could resolve
-- has no coordinates, and nothing is invented for it. Everything goes through
-- the writer the apps call, `create_marketplace_request`.

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
end $fn$;

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','cd000000-0000-4000-8000-000000000001','authenticated','authenticated','pin-customer@test.local',null,'',now(),null,'{}','{"display_name":"Pin Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','cd000000-0000-4000-8000-000000000002','authenticated','authenticated',null,'+201000000d02','',null,now(),'{}','{"display_name":"Pin Professional"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count)
values('cd000000-0000-4000-8001-000000000002','cd000000-0000-4000-8000-000000000002','Pin Professional','plumbing','plumbing',array['plumbing'],'Complete marketplace profile for pin proof.','cd000000-0000-4000-8000-000000000002/avatar/profile.jpg',true,true,true,'approved',50,10,4.5,5);
insert into public.user_roles(user_id,role) values('cd000000-0000-4000-8000-000000000002','provider') on conflict do nothing;
insert into public.provider_verifications(provider_id,status,revision,reviewed_at) values('cd000000-0000-4000-8001-000000000002','approved',1,now());
insert into storage.objects(bucket_id,name) values('profile-images','cd000000-0000-4000-8000-000000000002/avatar/profile.jpg');
select set_config('warsha_test.service_id',(select id::text from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),true);
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,is_active)
values('cd000000-0000-4000-8001-000000000002',current_setting('warsha_test.service_id')::uuid,200,'quote',true);
insert into public.provider_service_areas(provider_id,governorate,district,radius_km)
values('cd000000-0000-4000-8001-000000000002','Cairo','Zamalek',50);
insert into private.marketplace_category_duration_defaults(category_id,estimated_duration_minutes,policy_version)
values('plumbing',90,1) on conflict(category_id) do update set estimated_duration_minutes=90,policy_version=1;

create function pg_temp.request(p_address uuid, p_key text)
returns uuid language plpgsql as $fn$
begin
  return public.create_marketplace_request(jsonb_build_object(
    'flowKind','get_quotes','categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),
    'addressId',p_address,'issueDescription','Water heater is not heating',
    'scheduleKind','asap','paymentCompatibility','either'), p_key);
end $fn$;
create function pg_temp.requests() returns integer language sql as $fn$
  select count(*)::integer from public.marketplace_requests where customer_id='cd000000-0000-4000-8000-000000000001'
$fn$;

-- ---------------------------------------------------------------------------
-- Coordinates written straight into the row are not a confirmed pin
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('cd000000-0000-4000-8000-000000000001');
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,latitude,longitude,pin_source,pin_confirmed_at,is_default)
values('cd000000-0000-4000-8002-000000000001','cd000000-0000-4000-8000-000000000001','Home','3 Pin Street','Pin Street','Cairo','Zamalek',30.0600,31.2200,'manual_pin',now(),true);
reset role;

select is(
  (select row(pin_confirmed_at is null, pin_source is null)::text from public.addresses where id='cd000000-0000-4000-8002-000000000001'),
  row(true,true)::text,
  'A CUSTOMER CANNOT DECLARE THEIR OWN PIN CONFIRMED BY WRITING THE ROW');

set local role authenticated;
select pg_temp.act_as('cd000000-0000-4000-8000-000000000001');
select throws_ok($$select pg_temp.request('cd000000-0000-4000-8002-000000000001','pin-request-unconfirmed-01')$$,
  '55000','Verified request location required',
  'A REQUEST FROM COORDINATES NOBODY CONFIRMED IS REFUSED');

update public.addresses set pin_confirmed_at = now(), pin_source = 'address_search'
where id='cd000000-0000-4000-8002-000000000001';
select throws_ok($$select pg_temp.request('cd000000-0000-4000-8002-000000000001','pin-request-unconfirmed-02')$$,
  '55000','Verified request location required',
  'and stamping the confirmation on afterwards does not change that');
reset role;
select is(pg_temp.requests(),0,'no request was created from an unconfirmed location');

-- ---------------------------------------------------------------------------
-- A place nobody could resolve has no coordinates, and cannot be sent
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('cd000000-0000-4000-8000-000000000001');
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values('cd000000-0000-4000-8002-000000000002','cd000000-0000-4000-8000-000000000001','Office','Unresolved lane','Unresolved lane','Cairo','Zamalek',false);
select throws_ok($$select pg_temp.request('cd000000-0000-4000-8002-000000000002','pin-request-unresolved-01')$$,
  '55000','Verified request location required',
  'an address the geocoder could not place is a recoverable refusal, not a request');
reset role;
select is((select row(latitude, longitude)::text from public.addresses where id='cd000000-0000-4000-8002-000000000002'),
  row(null::double precision, null::double precision)::text,
  'and no coordinates were invented for it');

-- ---------------------------------------------------------------------------
-- Confirmed through the product writer, the request goes
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('cd000000-0000-4000-8000-000000000001');
select lives_ok($$select public.confirm_my_service_address('cd000000-0000-4000-8002-000000000002',30.0610,31.2210,'address_search')$$,
  'a place resolved by address search is confirmed without a map');
select lives_ok($$select pg_temp.request('cd000000-0000-4000-8002-000000000002','pin-request-confirmed-001')$$,
  'A REQUEST FROM A CONFIRMED PIN IS ACCEPTED');
reset role;
select is(
  (select row(l.latitude, l.longitude, l.verification_state)::text
   from private.marketplace_request_locations l join public.marketplace_requests r on r.id=l.request_id
   where r.customer_id='cd000000-0000-4000-8000-000000000001'),
  row(30.0610::double precision, 31.2210::double precision, 'verified')::text,
  'the request carries exactly the confirmed coordinates');
select is(
  (select count(*)::integer from public.quote_invitations i join public.marketplace_requests r on r.id=i.request_id
   where r.customer_id='cd000000-0000-4000-8000-000000000001'),1,
  'and reaches the Professional who covers the area');

-- Editing the words of a confirmed address keeps the confirmation.
set local role authenticated;
select pg_temp.act_as('cd000000-0000-4000-8000-000000000001');
update public.addresses set label='Work', landmark='Next to the bakery' where id='cd000000-0000-4000-8002-000000000002';
reset role;
select isnt((select pin_confirmed_at from public.addresses where id='cd000000-0000-4000-8002-000000000002'),null,
  'renaming an address does not withdraw its confirmed pin');

-- Moving the coordinates without confirming withdraws it.
set local role authenticated;
select pg_temp.act_as('cd000000-0000-4000-8000-000000000001');
update public.addresses set latitude=30.1000, longitude=31.3000 where id='cd000000-0000-4000-8002-000000000002';
select throws_ok($$select pg_temp.request('cd000000-0000-4000-8002-000000000002','pin-request-moved-000001')$$,
  '55000','Verified request location required',
  'A PIN MOVED WITHOUT CONFIRMATION IS NO LONGER CONFIRMED');
reset role;
select is((select row(pin_confirmed_at is null, pin_source is null)::text from public.addresses where id='cd000000-0000-4000-8002-000000000002'),
  row(true,true)::text,'the moved address reads as unconfirmed');

-- ---------------------------------------------------------------------------
-- The same forgery cannot make a Professional's work location verified
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('cd000000-0000-4000-8000-000000000002');
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values('cd000000-0000-4000-8002-000000000003','cd000000-0000-4000-8000-000000000002','Workshop','Workshop lane','Workshop lane','Cairo','Zamalek',false);
select lives_ok($$select public.confirm_my_work_location('cd000000-0000-4000-8002-000000000003',30.0620,31.2220,'manual_pin')$$,
  'a Professional confirms a work location');
update public.addresses set latitude=29.9000, longitude=31.0000, pin_confirmed_at=now()
where id='cd000000-0000-4000-8002-000000000003';
reset role;
select is(
  (select row(latitude, longitude, verification_state)::text from private.worker_matching_locations
   where provider_id='cd000000-0000-4000-8001-000000000002'),
  row(30.0620::double precision, 31.2220::double precision, 'stale')::text,
  'A WORK LOCATION MOVED BY WRITING THE ROW IS STALE, NOT VERIFIED AT THE NEW SPOT');

select * from finish();
rollback;
