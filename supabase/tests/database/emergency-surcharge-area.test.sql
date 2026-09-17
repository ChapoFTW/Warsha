begin;
select no_plan();

-- The urgent-service surcharge is the price where the Customer is
-- (202609170008).
--
-- A Customer approves a ceiling: `accept_emergency_request` lets a
-- Professional take the job only if their own surcharge is within it. The
-- preview used to approve the highest surcharge in the country. It now
-- approves the highest among the Professionals this request could actually be
-- sent to, from the Customer's confirmed address, and refuses when there are
-- none. Every figure below comes through `preview_emergency_request` and
-- `create_marketplace_request`, the calls the app makes.

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
end $fn$;

-- Customers 01 Zamalek, 02 Maadi, 03 Dokki (nobody urgent covers it).
-- Professionals, urgent plumbing:
--   11 Zamalek, works nearby, 100 EGP
--   12 Zamalek, works nearby, 150 EGP
--   13 Maadi, works nearby, 400 EGP
--   14 covers Zamalek on paper, works in Alexandria, 300 EGP (beyond any radius)
insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', ('ce000000-0000-4000-8000-0000000000'||lpad(n::text,2,'0'))::uuid,
  'authenticated','authenticated','urgent-customer-'||n||'@test.local',null,'',now(),null,'{}',
  jsonb_build_object('display_name','Urgent Customer '||n),now(),now()
from generate_series(1,3) n;
insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', ('ce000000-0000-4000-8000-0000000000'||n)::uuid,
  'authenticated','authenticated',null,'+2010000ce0'||n,'',null,now(),'{}',
  jsonb_build_object('display_name','Urgent Professional '||n),now(),now()
from generate_series(11,14) n;

create function pg_temp.person(n integer) returns uuid language sql as $fn$
  select ('ce000000-0000-4000-8000-0000000000'||lpad(n::text,2,'0'))::uuid $fn$;
create function pg_temp.pro(n integer) returns uuid language sql as $fn$
  select ('ce000000-0000-4000-8001-0000000000'||n)::uuid $fn$;
create function pg_temp.address(n integer) returns uuid language sql as $fn$
  select ('ce000000-0000-4000-8002-0000000000'||lpad(n::text,2,'0'))::uuid $fn$;

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count,emergency_available)
select pg_temp.pro(n), pg_temp.person(n),'Urgent Professional '||n,'plumbing','plumbing',array['plumbing'],
  'Complete marketplace profile for urgent pricing proof.','ce000000-0000-4000-8000-0000000000'||n||'/avatar/profile.jpg',
  true,true,true,'approved',30,10,4.5,5,true
from generate_series(11,14) n;
insert into public.user_roles(user_id,role) select pg_temp.person(n),'provider' from generate_series(11,14) n on conflict do nothing;
insert into public.provider_verifications(provider_id,status,revision,reviewed_at) select pg_temp.pro(n),'approved',1,now() from generate_series(11,14) n;
insert into storage.objects(bucket_id,name) select 'profile-images','ce000000-0000-4000-8000-0000000000'||n||'/avatar/profile.jpg' from generate_series(11,14) n;
select set_config('warsha_test.service_id',(select id::text from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),true);
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,emergency_surcharge_egp,is_active)
select pg_temp.pro(n),current_setting('warsha_test.service_id')::uuid,200,'quote',
  case n when 11 then 100 when 12 then 150 when 13 then 400 else 300 end,true
from generate_series(11,14) n;
insert into public.provider_emergency_categories(provider_id,category_id,enabled) select pg_temp.pro(n),'plumbing',true from generate_series(11,14) n;
insert into public.provider_service_areas(provider_id,governorate,district,radius_km)
select pg_temp.pro(n),'Cairo',case n when 13 then 'Maadi' else 'Zamalek' end,30 from generate_series(11,14) n;
insert into private.marketplace_category_duration_defaults(category_id,estimated_duration_minutes,policy_version)
values('plumbing',90,1) on conflict(category_id) do update set estimated_duration_minutes=90,policy_version=1;
update private.marketplace_capacity_configuration set road_factor=1.3,average_urban_speed_kmh=30 where singleton;

-- Work locations, confirmed the way the app confirms them.
create function pg_temp.work_location(n integer, p_latitude double precision, p_longitude double precision)
returns void language plpgsql as $fn$
begin
  perform pg_temp.act_as(pg_temp.person(n));
  insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
  values(pg_temp.address(n),pg_temp.person(n),'Work','Workshop','Workshop','Cairo','Zamalek',false);
  perform public.confirm_my_work_location(pg_temp.address(n),p_latitude,p_longitude,'manual_pin');
end $fn$;
set local role authenticated;
select pg_temp.work_location(11,30.0610,31.2210);
select pg_temp.work_location(12,30.0630,31.2240);
select pg_temp.work_location(13,29.9610,31.2510);
select pg_temp.work_location(14,31.2000,29.9200);
reset role;
select pg_temp.act_as(null);

-- Customer homes.
create function pg_temp.home(n integer, p_district text, p_latitude double precision, p_longitude double precision, p_confirm boolean)
returns void language plpgsql as $fn$
begin
  perform pg_temp.act_as(pg_temp.person(n));
  insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
  values(pg_temp.address(n),pg_temp.person(n),'Home',n||' Urgent Street','Urgent Street','Cairo',p_district,true);
  if p_confirm then perform public.confirm_my_service_address(pg_temp.address(n),p_latitude,p_longitude,'manual_pin'); end if;
end $fn$;
set local role authenticated;
select pg_temp.home(1,'Zamalek',30.0600,31.2200,true);
select pg_temp.home(2,'Maadi',29.9600,31.2500,true);
select pg_temp.home(3,'Dokki',30.0380,31.2100,true);
select pg_temp.act_as(pg_temp.person(1));
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values(pg_temp.address(4),pg_temp.person(1),'Unpinned','Somewhere','Somewhere','Cairo','Zamalek',false);
reset role;
select pg_temp.act_as(null);

create function pg_temp.preview(p_customer integer, p_address uuid)
returns jsonb language plpgsql as $fn$
begin
  perform pg_temp.act_as(pg_temp.person(p_customer));
  return public.preview_emergency_request(jsonb_build_object('categoryId','plumbing',
    'serviceId',current_setting('warsha_test.service_id'),'addressId',p_address,'paymentCompatibility','either'));
end $fn$;

-- ---------------------------------------------------------------------------
-- The price depends on where the Customer is
-- ---------------------------------------------------------------------------
set local role authenticated;
select is((pg_temp.preview(1,pg_temp.address(1))->>'surchargeMinor')::bigint,15000::bigint,
  'A ZAMALEK CUSTOMER IS QUOTED THE HIGHEST SURCHARGE AMONG PROFESSIONALS WHO COULD BE SENT TO ZAMALEK');
select is((pg_temp.preview(2,pg_temp.address(2))->>'surchargeMinor')::bigint,40000::bigint,
  'A MAADI CUSTOMER IS QUOTED MAADI''S PRICE');
select throws_ok($$select pg_temp.preview(3,pg_temp.address(3))$$,'22023','Emergency service unavailable',
  'WHERE NOBODY COULD BE SENT, THERE IS NO PRICE, AND THE CUSTOMER IS TOLD SO');
select throws_ok($$select pg_temp.preview(1,pg_temp.address(4))$$,'55000','Verified request location required',
  'no price is quoted for a location nobody confirmed');
select throws_ok($$select pg_temp.preview(1,null)$$,'42501','Address not found',
  'and none without an address at all');
reset role;
select pg_temp.act_as(null);

select is(
  (select array_agg(c.provider_id order by c.provider_id) from private.emergency_provider_surcharges(
     'plumbing', current_setting('warsha_test.service_id')::uuid, null, 'Cairo', 'Zamalek', 30.0600, 31.2200, 'either') c),
  array[pg_temp.pro(11), pg_temp.pro(12)],
  'a Professional who covers the area on paper but works beyond their radius does not set the price');

-- Who can be sent changes the price.
update public.provider_profiles set is_available=false where id=pg_temp.pro(12);
set local role authenticated;
select is((pg_temp.preview(1,pg_temp.address(1))->>'surchargeMinor')::bigint,10000::bigint,
  'when the dearer Professional stops taking work, the quoted surcharge falls with them');
reset role;
select pg_temp.act_as(null);
update public.provider_profiles set is_available=true where id=pg_temp.pro(12);

-- ---------------------------------------------------------------------------
-- An approval is for one place
-- ---------------------------------------------------------------------------
create function pg_temp.urgent_request(p_customer integer, p_address uuid, p_token text, p_key text)
returns uuid language plpgsql as $fn$
begin
  perform pg_temp.act_as(pg_temp.person(p_customer));
  return public.create_marketplace_request(jsonb_build_object('flowKind','emergency','categoryId','plumbing',
    'serviceId',current_setting('warsha_test.service_id'),'addressId',p_address,
    'issueDescription','Pipe burst under the kitchen sink','scheduleKind','asap','paymentCompatibility','either',
    'emergencyApprovalToken',p_token), p_key);
end $fn$;

set local role authenticated;
select pg_temp.act_as(pg_temp.person(1));
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values(pg_temp.address(5),pg_temp.person(1),'Parents','5 Maadi Road','Maadi Road','Cairo','Maadi',false);
select public.confirm_my_service_address(pg_temp.address(5),29.9620,31.2520,'manual_pin');
select set_config('warsha_test.token', pg_temp.preview(1,pg_temp.address(1))->>'approvalToken', true);
select throws_ok($$select pg_temp.urgent_request(1,pg_temp.address(5),current_setting('warsha_test.token'),'urgent-other-address-001')$$,
  '22023','Emergency surcharge approval required',
  'A SURCHARGE APPROVED FOR ZAMALEK CANNOT BE USED FOR A JOB IN MAADI');
select lives_ok($$select pg_temp.urgent_request(1,pg_temp.address(1),current_setting('warsha_test.token'),'urgent-same-address-0001')$$,
  'the approval is used for the address it was made for');
reset role;
select pg_temp.act_as(null);

select set_config('warsha_test.request',(select id::text from public.marketplace_requests where idempotency_key='urgent-same-address-0001'),true);
select is((select approved_emergency_surcharge_minor from public.marketplace_requests where id=current_setting('warsha_test.request')::uuid),
  15000::bigint,'the request records the area price the Customer approved');
select ok(
  (select count(*) > 0 and bool_and(provider_id in (pg_temp.pro(11), pg_temp.pro(12)))
   from public.quote_invitations where request_id=current_setting('warsha_test.request')::uuid),
  'THE PROFESSIONALS THE REQUEST REACHES ARE THE ONES WHOSE SURCHARGES SET THE PRICE');

-- The dearest Professional in the area can still take the job at that price.
set local role authenticated;
select pg_temp.act_as(pg_temp.person(12));
select lives_ok(
  $$select public.accept_emergency_request((select id from public.quote_invitations
      where request_id=current_setting('warsha_test.request')::uuid and provider_id=pg_temp.pro(12)),'urgent-accept-12-00001')$$,
  'a Professional whose surcharge is within the approved price accepts');
reset role;

select * from finish();
rollback;
