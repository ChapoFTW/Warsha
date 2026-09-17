begin;
select no_plan();

-- A request reaches the Professionals who cover it — proved through the
-- writers the product actually calls.
--
-- The suite this replaces as the authority for matching inserted
-- `private.worker_matching_locations` rows by hand, and so it passed for months
-- while no product path could produce the row it inserted. Nothing here writes
-- an anchor directly. Every anchor comes from the work-location step
-- (`addresses` insert under RLS, then `confirm_my_work_location`), every
-- request location from the address book (`addresses` insert, then
-- `confirm_my_service_address`), and every request from
-- `create_marketplace_request`, which matches synchronously.
--
-- Provider approval, services and service areas are inserted as fixtures:
-- they are staff and profile state this suite is not about.
--
-- The owner's rule under test:
--   planned   service area = eligibility; no radius; distance ranks privately.
--   emergency service area = eligibility; radius is an ADDITIONAL constraint.
--   always    proximity never widens eligibility; no distance leaves the DB.
--
-- Geometry. The Customer is at 30.0600, 31.2200 in Cairo / Zamalek. First-wave
-- radius is 5 km.
--
--   PA  Cairo / Zamalek   anchor ~0.7 km    in area, near
--   PB  Cairo / Zamalek   anchor ~37.8 km   in area, far
--   PC  Giza / Dokki      anchor ~0.3 km    outside area, near
--   PD  Cairo / Zamalek   no anchor         in area, proximity unknown
--   PE  Cairo (whole)     anchor ~1.5 km    governorate-wide; was a Customer
--
-- Every Professional has the same rating, jobs and fairness, so proximity is
-- the only thing that separates their scores.

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end $fn$;

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','c7000000-0000-4000-8000-000000000001','authenticated','authenticated','anchor-customer@test.local',null,'',now(),null,'{}','{"display_name":"Anchor Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c7000000-0000-4000-8000-000000000002','authenticated','authenticated',null,'+201000000702','',null,now(),'{}','{"display_name":"Near Professional"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c7000000-0000-4000-8000-000000000003','authenticated','authenticated',null,'+201000000703','',null,now(),'{}','{"display_name":"Far Professional"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c7000000-0000-4000-8000-000000000004','authenticated','authenticated',null,'+201000000704','',null,now(),'{}','{"display_name":"Outside Professional"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c7000000-0000-4000-8000-000000000005','authenticated','authenticated',null,'+201000000705','',null,now(),'{}','{"display_name":"Unanchored Professional"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c7000000-0000-4000-8000-000000000006','authenticated','authenticated',null,'+201000000706','',null,now(),'{}','{"display_name":"Converted Professional"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count,emergency_available)
select ('c7000000-0000-4000-8001-00000000000'||n)::uuid, ('c7000000-0000-4000-8000-00000000000'||n)::uuid,
  name,'plumbing','plumbing',array['plumbing'],'Complete marketplace profile for anchor proof.',
  'c7000000-0000-4000-8000-00000000000'||n||'/avatar/profile.jpg',true,true,true,'approved',50,10,4.5,5,true
from (values (2,'Near Professional'),(3,'Far Professional'),(4,'Outside Professional'),
             (5,'Unanchored Professional'),(6,'Converted Professional')) v(n,name);
insert into public.user_roles(user_id,role)
select ('c7000000-0000-4000-8000-00000000000'||n)::uuid,'provider' from generate_series(2,6) n
on conflict do nothing;
insert into public.provider_verifications(provider_id,status,revision,reviewed_at)
select ('c7000000-0000-4000-8001-00000000000'||n)::uuid,'approved',1,now() from generate_series(2,6) n;
insert into storage.objects(bucket_id,name)
select 'profile-images','c7000000-0000-4000-8000-00000000000'||n||'/avatar/profile.jpg' from generate_series(2,6) n;

select set_config('warsha_test.service_id',(select id::text from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),true);
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,transportation_fee_egp,emergency_surcharge_egp,is_active)
select ('c7000000-0000-4000-8001-00000000000'||n)::uuid,current_setting('warsha_test.service_id')::uuid,200,'quote',25,50,true
from generate_series(2,6) n;
insert into public.provider_emergency_categories(provider_id,category_id,enabled)
select ('c7000000-0000-4000-8001-00000000000'||n)::uuid,'plumbing',true from generate_series(2,6) n;
insert into public.provider_service_areas(provider_id,governorate,district,radius_km) values
('c7000000-0000-4000-8001-000000000002','Cairo','Zamalek',50),
('c7000000-0000-4000-8001-000000000003','Cairo','Zamalek',50),
('c7000000-0000-4000-8001-000000000004','Giza','Dokki',50),
('c7000000-0000-4000-8001-000000000005','Cairo','Zamalek',50),
('c7000000-0000-4000-8001-000000000006','Cairo',null,50);

insert into private.marketplace_category_duration_defaults(category_id,estimated_duration_minutes,policy_version)
values('plumbing',90,1) on conflict(category_id) do update set estimated_duration_minutes=90,policy_version=1;

-- ===========================================================================
-- The Customer's request location, through the address book
-- ===========================================================================
set local role authenticated;
select pg_temp.act_as('c7000000-0000-4000-8000-000000000001');
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values('c7000000-0000-4000-8002-000000000001','c7000000-0000-4000-8000-000000000001','Home','10 Anchor Street','Anchor Street','Cairo','Zamalek',true);
select lives_ok(
  $$select public.confirm_my_service_address('c7000000-0000-4000-8002-000000000001',30.0600,31.2200,'manual_pin')$$,
  'the Customer confirms the pin their requests will be matched from');
reset role;

-- ===========================================================================
-- J. The work-location step creates the anchor
-- ===========================================================================
-- Each Professional runs the step exactly as both clients now do: a non-default
-- address, then confirm_my_work_location.
create function pg_temp.work_location_step(p_user uuid, p_address uuid, p_governorate text, p_district text,
  p_latitude double precision, p_longitude double precision)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
  values(p_address,p_user,'Work location','Pinned work location','Pinned work location',p_governorate,p_district,false);
  perform public.confirm_my_work_location(p_address,p_latitude,p_longitude,'device_location');
end $fn$;

set local role authenticated;
select lives_ok(
  $$select pg_temp.work_location_step('c7000000-0000-4000-8000-000000000002','c7000000-0000-4000-8002-000000000002','Cairo','Zamalek',30.0650,31.2250)$$,
  'J: the near Professional completes the work-location step');
select lives_ok(
  $$select pg_temp.work_location_step('c7000000-0000-4000-8000-000000000003','c7000000-0000-4000-8002-000000000003','Cairo','Zamalek',30.4000,31.2200)$$,
  'J: the far Professional completes the work-location step');
select lives_ok(
  $$select pg_temp.work_location_step('c7000000-0000-4000-8000-000000000004','c7000000-0000-4000-8002-000000000004','Giza','Dokki',30.0620,31.2180)$$,
  'J: the outside Professional completes the work-location step');
reset role;

select is(
  (select row(source, verification_state, address_id, latitude, longitude)::text
   from private.worker_matching_locations where provider_id='c7000000-0000-4000-8001-000000000002'),
  row('verified_profile','verified','c7000000-0000-4000-8002-000000000002'::uuid,30.0650::double precision,31.2250::double precision)::text,
  'J: the anchor is the confirmed pin, recorded as the Professional''s own confirmation of their work location');
select is(
  (select is_default from public.addresses where id='c7000000-0000-4000-8002-000000000002'),
  false,
  'J: the work location is not made the default address');
select is(
  (select count(*)::integer from private.worker_matching_locations where provider_id='c7000000-0000-4000-8001-000000000005'),
  0,
  'D: a Professional who never ran the step has no anchor, and nothing invents one');

-- ===========================================================================
-- L. An existing Customer becomes a Professional
-- ===========================================================================
set local role authenticated;
select pg_temp.act_as('c7000000-0000-4000-8000-000000000006');
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values('c7000000-0000-4000-8002-000000000060','c7000000-0000-4000-8000-000000000006','Home','5 Home Street','Home Street','Cairo','Zamalek',true);
select public.confirm_my_service_address('c7000000-0000-4000-8002-000000000060',30.0900,31.2600,'manual_pin');
reset role;

select is(
  private.worker_activation_gates('c7000000-0000-4000-8000-000000000006')->>'current_address_provided',
  'false',
  'L: a confirmed HOME address no longer passes the work-location step, so the step is shown');

set local role authenticated;
select pg_temp.act_as('c7000000-0000-4000-8000-000000000006');
select throws_ok(
  $$insert into public.addresses(customer_id,label,address_line,street,governorate,district,is_default)
    values('c7000000-0000-4000-8000-000000000006','Work location','Pinned work location','Pinned work location','Cairo',null,true)$$,
  '23505', null,
  'L: the step as it was written — work location as a second default — fails for anyone who already has one');
select lives_ok(
  $$select pg_temp.work_location_step('c7000000-0000-4000-8000-000000000006','c7000000-0000-4000-8002-000000000006','Cairo',null,30.0700,31.2300)$$,
  'L: the step as it is now completes for an existing Customer');
reset role;

select is(
  private.worker_activation_gates('c7000000-0000-4000-8000-000000000006')->>'current_address_provided',
  'true',
  'L: and completing it passes the step');
select is(
  (select array_agg(label order by label) from public.addresses
   where customer_id='c7000000-0000-4000-8000-000000000006' and is_default and deleted_at is null),
  array['Home'],
  'L: their Home stays their one default address');
select is(
  (select address_id from private.worker_matching_locations where provider_id='c7000000-0000-4000-8001-000000000006'),
  'c7000000-0000-4000-8002-000000000006'::uuid,
  'L: the anchor is the work location, not the default Home');

-- ===========================================================================
-- A, B, C, D, P. A planned request
-- ===========================================================================
set local role authenticated;
select pg_temp.act_as('c7000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.create_marketplace_request(jsonb_build_object('flowKind','get_quotes','categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),'addressId','c7000000-0000-4000-8002-000000000001','issueDescription','Bathroom pipe is dripping steadily','scheduleKind','asap','paymentCompatibility','either'),'anchor-planned-request-01')$$,
  'a planned request is created and matched');
select set_config('warsha_test.planned',(select id::text from public.marketplace_requests where idempotency_key='anchor-planned-request-01'),true);
reset role;

create function pg_temp.scored(p_request uuid)
returns table(provider_id uuid, distance_km numeric, band text, final_score numeric, rank integer)
language sql as $fn$
  select s.provider_id, s.distance_km, s.components->>'distanceBand', s.final_score, s.rank
  from private.marketplace_candidate_scores s
  join private.marketplace_matching_runs r on r.id = s.matching_run_id
  where r.request_id = p_request and s.eligible
$fn$;

select ok(
  exists(select 1 from pg_temp.scored(current_setting('warsha_test.planned')::uuid) where provider_id='c7000000-0000-4000-8001-000000000002'),
  'A: inside the area and near is eligible');
select ok(
  exists(select 1 from pg_temp.scored(current_setting('warsha_test.planned')::uuid) where provider_id='c7000000-0000-4000-8001-000000000003'),
  'B: inside the area and 38 km away is eligible for planned work — there is no radius cap');
select ok(
  not exists(select 1 from pg_temp.scored(current_setting('warsha_test.planned')::uuid) where provider_id='c7000000-0000-4000-8001-000000000004'),
  'C: outside the area is excluded however near the anchor is');
select ok(
  exists(select 1 from pg_temp.scored(current_setting('warsha_test.planned')::uuid) where provider_id='c7000000-0000-4000-8001-000000000006'),
  'an area with no district covers its whole governorate');
select is(
  (select row(distance_km, band)::text from pg_temp.scored(current_setting('warsha_test.planned')::uuid)
   where provider_id='c7000000-0000-4000-8001-000000000005'),
  row(null::numeric,'unknown')::text,
  'D: a missing anchor is eligible for planned work and recorded as unknown, not as zero or as near');
-- Identical quality, so proximity alone orders them: near, governorate-wide at
-- 1.5 km, unknown at the neutral midpoint, far at zero.
select is(
  (select array_agg(provider_id order by rank) from pg_temp.scored(current_setting('warsha_test.planned')::uuid)),
  array['c7000000-0000-4000-8001-000000000002','c7000000-0000-4000-8001-000000000006',
        'c7000000-0000-4000-8001-000000000005','c7000000-0000-4000-8001-000000000003']::uuid[],
  'D: unknown proximity ranks between known-near and known-far, deterministically');
select cmp_ok(
  (select count(*)::integer from public.quote_invitations where request_id=current_setting('warsha_test.planned')::uuid),
  '>=', 1,
  'P: the request invites at least one eligible Professional');
select is(
  (select count(*)::integer from public.quote_invitations where request_id=current_setting('warsha_test.planned')::uuid
     and provider_id='c7000000-0000-4000-8001-000000000004'),
  0,
  'P: and never the one outside the area');

-- ===========================================================================
-- E, F, G. An emergency request
-- ===========================================================================
set local role authenticated;
select pg_temp.act_as('c7000000-0000-4000-8000-000000000001');
select set_config('warsha_test.emergency_token',(public.preview_emergency_request(jsonb_build_object('categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),'addressId','c7000000-0000-4000-8002-000000000001'))->>'approvalToken'),true);
select lives_ok(
  $$select public.create_marketplace_request(jsonb_build_object('flowKind','emergency','categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),'addressId','c7000000-0000-4000-8002-000000000001','issueDescription','Burst pipe flooding the kitchen','scheduleKind','asap','paymentCompatibility','either','emergencyApprovalToken',current_setting('warsha_test.emergency_token')),'anchor-emergency-request-01')$$,
  'an emergency request is created and matched');
select set_config('warsha_test.emergency',(select id::text from public.marketplace_requests where idempotency_key='anchor-emergency-request-01'),true);
reset role;

select is(
  (select array_agg(provider_id order by provider_id) from pg_temp.scored(current_setting('warsha_test.emergency')::uuid)),
  array['c7000000-0000-4000-8001-000000000002','c7000000-0000-4000-8001-000000000006']::uuid[],
  'E: emergency eligibility is inside the area AND inside the radius');
select ok(
  not exists(select 1 from pg_temp.scored(current_setting('warsha_test.emergency')::uuid) where provider_id='c7000000-0000-4000-8001-000000000003'),
  'F: inside the area but outside the radius is excluded from emergency');
select ok(
  not exists(select 1 from pg_temp.scored(current_setting('warsha_test.emergency')::uuid) where provider_id='c7000000-0000-4000-8001-000000000004'),
  'G: inside the radius but outside the area is excluded from emergency — proximity never widens eligibility');
select ok(
  not exists(select 1 from pg_temp.scored(current_setting('warsha_test.emergency')::uuid) where provider_id='c7000000-0000-4000-8001-000000000005'),
  'D: with no anchor, emergency travel cannot be bounded, so it is not offered');
select is(
  (select count(*)::integer from private.emergency_dispatch_attempts where request_id=current_setting('warsha_test.emergency')::uuid),
  2,
  'E: dispatch reaches exactly the two eligible Professionals');

-- ===========================================================================
-- H, I. Nothing about the anchor or the distance leaves the database
-- ===========================================================================
select is(has_table_privilege('authenticated','private.worker_matching_locations','SELECT'),false,
  'H: signed-in clients cannot read anchors');
select is(has_table_privilege('anon','private.worker_matching_locations','SELECT'),false,
  'H: anonymous clients cannot read anchors');
select is(has_function_privilege('anon','public.confirm_my_work_location(uuid,double precision,double precision,text)','EXECUTE'),false,
  'H: anonymous clients cannot set a work location');
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     and (p.prosrc ilike '%worker_matching_locations%' or p.prosrc ilike '%distance_km%'
       or p.prosrc ilike '%marketplace_candidate_scores%')),
  array['confirm_my_work_location'],
  'H/I: the only client-callable function that touches anchors, distances or scores is the writer');

set local role authenticated;
select pg_temp.act_as('c7000000-0000-4000-8000-000000000002');
select ok(
  not (public.confirm_my_work_location('c7000000-0000-4000-8002-000000000002',30.0650,31.2250,'device_location')
       ?| array['latitude','longitude','distanceKm','source','verificationState']),
  'H: the writer returns no coordinate and no anchor state');
select is(position('30.065' in public.get_my_worker_profile()::text), 0,
  'H: the Professional''s own profile read carries no anchor coordinate');
reset role;
set local role anon;
select pg_temp.act_as('00000000-0000-0000-0000-000000000000');
select is(
  (select count(*)::integer from jsonb_array_elements(
     public.search_providers(null,'{"latitude":30.0600,"longitude":31.2200}'::jsonb,'recommended',50,0)->'results') r,
   jsonb_object_keys(r) k
   where k in ('distanceKm','distance','distanceBand','etaMinutes','latitude','longitude')),
  0,
  'I: discovery results carry no distance and no coordinate');
select is(position('30.065' in public.get_discovery_home(null)::text), 0,
  'I: the discovery home carries no anchor coordinate');
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000000000');
select set_config('request.jwt.claim.sub','',true);

-- ===========================================================================
-- K, N. Address-book changes that are not the work location change nothing
-- ===========================================================================
select set_config('warsha_test.pe_anchor',
  (select row(address_id, latitude, longitude, verification_state, updated_at)::text
   from private.worker_matching_locations where provider_id='c7000000-0000-4000-8001-000000000006'),true);

set local role authenticated;
select pg_temp.act_as('c7000000-0000-4000-8000-000000000006');
select lives_ok(
  $$select public.confirm_my_service_address('c7000000-0000-4000-8002-000000000060',30.1000,31.2700,'manual_pin')$$,
  'K: the converted Professional re-pins their Home');
select lives_ok(
  $$select public.set_default_address('c7000000-0000-4000-8002-000000000006')$$,
  'N: makes the work location their default');
select lives_ok(
  $$select public.set_default_address('c7000000-0000-4000-8002-000000000060')$$,
  'N: and makes Home the default again');
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values('c7000000-0000-4000-8002-000000000061','c7000000-0000-4000-8000-000000000006','Family','9 Family Street','Family Street','Giza','Dokki',false);
select lives_ok(
  $$select public.confirm_my_service_address('c7000000-0000-4000-8002-000000000061',30.0380,31.2100,'address_search')$$,
  'K: and adds another confirmed address');
reset role;

select is(
  (select row(address_id, latitude, longitude, verification_state, updated_at)::text
   from private.worker_matching_locations where provider_id='c7000000-0000-4000-8001-000000000006'),
  current_setting('warsha_test.pe_anchor'),
  'K/N: none of it touched the anchor — not a re-pinned Home, not a default change, not a new address');

-- ===========================================================================
-- M. Changing the work location moves the anchor, and only that does
-- ===========================================================================
set local role authenticated;
select lives_ok(
  $$select pg_temp.work_location_step('c7000000-0000-4000-8000-000000000002','c7000000-0000-4000-8002-000000000022','Cairo','Zamalek',30.0550,31.2150)$$,
  'M: the near Professional runs the step again with a new pin');
reset role;
select is(
  (select row(address_id, latitude, longitude, source)::text
   from private.worker_matching_locations where provider_id='c7000000-0000-4000-8001-000000000002'),
  row('c7000000-0000-4000-8002-000000000022'::uuid, 30.0550::double precision, 31.2150::double precision, 'verified_profile')::text,
  'M: the anchor moves to the new work location');

set local role authenticated;
select pg_temp.act_as('c7000000-0000-4000-8000-000000000002');
select lives_ok(
  $$select public.confirm_my_service_address('c7000000-0000-4000-8002-000000000022',30.0560,31.2160,'manual_pin')$$,
  'M: re-pinning the work location itself');
reset role;
select is(
  (select row(latitude, longitude, verification_state)::text
   from private.worker_matching_locations where provider_id='c7000000-0000-4000-8001-000000000002'),
  row(30.0560::double precision, 31.2160::double precision, 'verified')::text,
  'M: the anchor follows its own address when that address is re-pinned');

set local role authenticated;
select pg_temp.act_as('c7000000-0000-4000-8000-000000000002');
update public.addresses set pin_confirmed_at = null where id='c7000000-0000-4000-8002-000000000022';
reset role;
select is(
  (select verification_state from private.worker_matching_locations where provider_id='c7000000-0000-4000-8001-000000000002'),
  'stale',
  'M: an unconfirmed work-location pin makes the anchor stale rather than silently trusted');
select is(
  private.worker_activation_gates('c7000000-0000-4000-8000-000000000002')->>'current_address_provided',
  'true',
  'M: a stale anchor is still a work location the Professional provided');

set local role authenticated;
select pg_temp.act_as('c7000000-0000-4000-8000-000000000002');
select public.confirm_my_service_address('c7000000-0000-4000-8002-000000000022',30.0560,31.2160,'manual_pin');
reset role;
select is(
  (select verification_state from private.worker_matching_locations where provider_id='c7000000-0000-4000-8001-000000000002'),
  'verified',
  'M: confirming the pin again restores it');

-- ===========================================================================
-- O. Removal, anonymization and export
-- ===========================================================================
select is(
  (select jsonb_array_length(private.privacy_build_export_payload('c7000000-0000-4000-8000-000000000002')->'matching_location')),
  1,
  'O: the Professional''s export includes their matching location');
select is(
  (private.privacy_build_export_payload('c7000000-0000-4000-8000-000000000002')->'matching_location'->0->>'source'),
  'verified_profile',
  'O: and says how Warsha came to believe it');
select is(
  (select jsonb_array_length(private.privacy_build_export_payload('c7000000-0000-4000-8000-000000000001')->'matching_location')),
  0,
  'O: a Customer''s export has an empty matching location, not someone else''s');
select is(
  (select export_included from private.data_inventory where entry_key='worker_matching_locations'),
  true,
  'O: the data inventory declares the anchor and that it is exported');

-- Removing the work location from the address book, as both clients do it.
set local role authenticated;
select pg_temp.act_as('c7000000-0000-4000-8000-000000000004');
update public.addresses set deleted_at = now(), is_default = false where id='c7000000-0000-4000-8002-000000000004';
reset role;
select is(
  (select count(*)::integer from private.worker_matching_locations where provider_id='c7000000-0000-4000-8001-000000000004'),
  0,
  'O: removing the work-location address removes the anchor — no stale copy of a place they deleted');
select is(
  private.worker_activation_gates('c7000000-0000-4000-8000-000000000004')->>'current_address_provided',
  'false',
  'O: and the work-location step reads as not done, so they are asked again');

-- Anonymization runs from the privacy worker, with no end-user session.
select set_config('request.jwt.claim.sub','',true);
select lives_ok(
  $$select private.privacy_anonymize_account('c7000000-0000-4000-8000-000000000003')$$,
  'O: the far Professional is anonymized');
select is(
  (select count(*)::integer from private.worker_matching_locations where provider_id='c7000000-0000-4000-8001-000000000003'),
  0,
  'O: anonymization deletes the anchor');
select is(
  (select rows_affected from private.privacy_anonymization_log
   where subject_user_id='c7000000-0000-4000-8000-000000000003' and step_key='matching_location'),
  1,
  'O: and the log records that it removed one, rather than zero through a side effect');

-- ===========================================================================
-- Backfill: inferred, and never mistaken for a confirmation
-- ===========================================================================
-- Three legacy Professionals with confirmed addresses and no anchor, each
-- exercising one rule, plus one soft-deleted profile that must be skipped.
insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',('c7000000-0000-4000-8000-00000000001'||n)::uuid,'authenticated','authenticated',null,'+20100000071'||n,'',null,now(),'{}','{"display_name":"Legacy Professional"}',now(),now()
from generate_series(1,4) n;
insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,is_available,is_published,onboarding_status,deleted_at)
select ('c7000000-0000-4000-8001-00000000001'||n)::uuid,('c7000000-0000-4000-8000-00000000001'||n)::uuid,'Legacy Professional','plumbing','plumbing',array['plumbing'],'Legacy profile without an anchor.',true,false,'draft',
  case when n = 4 then now() end
from generate_series(1,4) n;
insert into public.addresses(id,customer_id,label,address_line,governorate,district,latitude,longitude,is_default,pin_source,pin_confirmed_at,created_at) values
-- 1: a Work location label beats a newer default
('c7000000-0000-4000-8002-000000000111','c7000000-0000-4000-8000-000000000011','Work location','W','Cairo','Zamalek',30.01,31.01,false,'manual_pin',now()-interval '3 days',now()-interval '3 days'),
('c7000000-0000-4000-8002-000000000112','c7000000-0000-4000-8000-000000000011','Home','H','Cairo','Zamalek',30.02,31.02,true,'manual_pin',now()-interval '1 day',now()-interval '1 day'),
-- 2: a default beats a more recent confirmation
('c7000000-0000-4000-8002-000000000121','c7000000-0000-4000-8000-000000000012','Home','H','Cairo','Zamalek',30.03,31.03,true,'manual_pin',now()-interval '3 days',now()-interval '3 days'),
('c7000000-0000-4000-8002-000000000122','c7000000-0000-4000-8000-000000000012','Office','O','Cairo','Zamalek',30.04,31.04,false,'manual_pin',now()-interval '1 day',now()-interval '1 day'),
-- 3: otherwise the most recent confirmation; an unconfirmed pin never counts
('c7000000-0000-4000-8002-000000000131','c7000000-0000-4000-8000-000000000013','Old','A','Cairo','Zamalek',30.05,31.05,false,'manual_pin',now()-interval '3 days',now()-interval '3 days'),
('c7000000-0000-4000-8002-000000000132','c7000000-0000-4000-8000-000000000013','New','B','Cairo','Zamalek',30.06,31.06,false,'manual_pin',now()-interval '1 day',now()-interval '1 day'),
('c7000000-0000-4000-8002-000000000133','c7000000-0000-4000-8000-000000000013','Unpinned','C','Cairo','Zamalek',30.07,31.07,false,null,null,now()),
-- 4: soft-deleted profile
('c7000000-0000-4000-8002-000000000141','c7000000-0000-4000-8000-000000000014','Home','H','Cairo','Zamalek',30.08,31.08,true,'manual_pin',now(),now());

select is(
  private.infer_missing_matching_anchors(),
  '{"workLocationLabel":1,"defaultAddress":1,"mostRecentConfirmed":1}'::jsonb,
  'backfill infers one anchor per rule and reports each');
select is(
  (select array_agg(row(provider_id, address_id, source)::text order by provider_id)
   from private.worker_matching_locations where provider_id::text like 'c7000000-0000-4000-8001-00000000001%'),
  array[
    row('c7000000-0000-4000-8001-000000000011'::uuid,'c7000000-0000-4000-8002-000000000111'::uuid,'inferred_confirmed_address')::text,
    row('c7000000-0000-4000-8001-000000000012'::uuid,'c7000000-0000-4000-8002-000000000121'::uuid,'inferred_confirmed_address')::text,
    row('c7000000-0000-4000-8001-000000000013'::uuid,'c7000000-0000-4000-8002-000000000132'::uuid,'inferred_confirmed_address')::text],
  'backfill picks Work location, then default, then most recent, records each as inferred, and skips a deleted profile');
select is(
  private.infer_missing_matching_anchors(),
  '{"workLocationLabel":0,"defaultAddress":0,"mostRecentConfirmed":0}'::jsonb,
  'backfill never replaces an anchor, so running it again changes nothing');
select is(
  (select count(*)::integer from private.worker_matching_locations
   where provider_id in ('c7000000-0000-4000-8001-000000000002','c7000000-0000-4000-8001-000000000006')
     and source <> 'verified_profile'),
  0,
  'backfill left confirmed work locations exactly as the Professionals confirmed them');
select throws_ok(
  $$insert into private.worker_matching_locations(provider_id,latitude,longitude,source,verification_state)
    values('c7000000-0000-4000-8001-000000000005',30,31,'verified_profile','verified')$$,
  '23514', null,
  'an anchor claiming a Professional confirmed it must name the address they confirmed');
select throws_ok(
  $$insert into private.worker_matching_locations(provider_id,latitude,longitude,source,verification_state)
    values('c7000000-0000-4000-8001-000000000005',30,31,'verified_service_area','verified')$$,
  '23514', null,
  'service-area coordinates are no longer a source an anchor can claim');
select is(has_function_privilege('authenticated','private.infer_missing_matching_anchors()','EXECUTE'),false,
  'clients cannot run the backfill');

select * from finish();
rollback;
