begin;
select no_plan();

-- The two-minute collection window, and its early close.
--
-- WPS-008: the Customer cannot select during the initial window; the window
-- "may close early when every currently invited worker has quoted, declined,
-- withdrawn, expired, or become ineligible". Everything here goes through the
-- product writers, and nothing waits on the clock: a window that closes early
-- closes inside the same transaction as the answer that closed it.

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
end $fn$;

select is((select initial_collection_seconds from private.marketplace_configuration where singleton),120,
  'the collection window is two minutes');
select has_trigger('public','quote_invitations','quote_invitations_close_window_when_answered',
  'answering an invitation can close the window');

-- ---------------------------------------------------------------------------
-- Fixture: one Customer, two Professionals covering Cairo / Zamalek
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','c9000000-0000-4000-8000-000000000001','authenticated','authenticated','window-customer@test.local',null,'',now(),null,'{}','{"display_name":"Window Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c9000000-0000-4000-8000-000000000002','authenticated','authenticated',null,'+201000000902','',null,now(),'{}','{"display_name":"Quoting Professional"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c9000000-0000-4000-8000-000000000003','authenticated','authenticated',null,'+201000000903','',null,now(),'{}','{"display_name":"Declining Professional"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count)
select ('c9000000-0000-4000-8001-00000000000'||n)::uuid, ('c9000000-0000-4000-8000-00000000000'||n)::uuid,
  'Window Professional','plumbing','plumbing',array['plumbing'],'Complete marketplace profile for window proof.',
  'c9000000-0000-4000-8000-00000000000'||n||'/avatar/profile.jpg',true,true,true,'approved',50,10,4.5,5
from generate_series(2,3) n;
insert into public.user_roles(user_id,role)
select ('c9000000-0000-4000-8000-00000000000'||n)::uuid,'provider' from generate_series(2,3) n on conflict do nothing;
insert into public.provider_verifications(provider_id,status,revision,reviewed_at)
select ('c9000000-0000-4000-8001-00000000000'||n)::uuid,'approved',1,now() from generate_series(2,3) n;
insert into storage.objects(bucket_id,name)
select 'profile-images','c9000000-0000-4000-8000-00000000000'||n||'/avatar/profile.jpg' from generate_series(2,3) n;
select set_config('warsha_test.service_id',(select id::text from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),true);
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,is_active)
select ('c9000000-0000-4000-8001-00000000000'||n)::uuid,current_setting('warsha_test.service_id')::uuid,200,'quote',true
from generate_series(2,3) n;
insert into public.provider_service_areas(provider_id,governorate,district,radius_km)
select ('c9000000-0000-4000-8001-00000000000'||n)::uuid,'Cairo','Zamalek',50 from generate_series(2,3) n;
insert into private.marketplace_category_duration_defaults(category_id,estimated_duration_minutes,policy_version)
values('plumbing',90,1) on conflict(category_id) do update set estimated_duration_minutes=90,policy_version=1;

set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000001');
insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
values('c9000000-0000-4000-8002-000000000001','c9000000-0000-4000-8000-000000000001','Home','1 Window Street','Window Street','Cairo','Zamalek',true);
select public.confirm_my_service_address('c9000000-0000-4000-8002-000000000001',30.0600,31.2200,'manual_pin');

create function pg_temp.request(p_key text)
returns uuid language plpgsql as $fn$
declare v uuid;
begin
  v := public.create_marketplace_request(jsonb_build_object(
    'flowKind','get_quotes','categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),
    'addressId','c9000000-0000-4000-8002-000000000001','issueDescription','Bathroom tap keeps dripping',
    'scheduleKind','asap','paymentCompatibility','either'), p_key);
  return v;
end $fn$;

select set_config('warsha_test.answered', pg_temp.request('window-answered-request-01')::text, true);
select set_config('warsha_test.partial', pg_temp.request('window-partial-request-001')::text, true);
reset role;
select pg_temp.act_as(null);

select is((select count(*)::integer from public.quote_invitations where request_id=current_setting('warsha_test.answered')::uuid),2,
  'both Professionals are invited to the first request');
select is(
  (select collection_not_before - created_at from public.marketplace_requests where id=current_setting('warsha_test.answered')::uuid),
  interval '2 minutes','the window starts at two minutes');

create function pg_temp.invitation(p_request text, p_provider uuid)
returns uuid language sql as $fn$
  select id from public.quote_invitations where request_id=current_setting(p_request)::uuid and provider_id=p_provider
$fn$;

create function pg_temp.quote_terms()
returns jsonb language sql as $fn$
  select '{"priceMinor":22500,"etaMinutes":25,"estimatedDurationMinutes":90,"message":"I can come this afternoon","laborIncluded":true,"materialsInclusion":"excluded","materialsExplanation":"Parts agreed separately","supportedPaymentMethods":["cash"]}'::jsonb
$fn$;

-- ---------------------------------------------------------------------------
-- One answer out of two: the window stays shut
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000002');
select lives_ok(
  $$select public.submit_worker_quote(pg_temp.invitation('warsha_test.answered','c9000000-0000-4000-8001-000000000002'), pg_temp.quote_terms(), 'window-answered-quote-0001')$$,
  'the first Professional quotes');
reset role;
select pg_temp.act_as(null);

select is(
  (select collection_not_before - created_at from public.marketplace_requests where id=current_setting('warsha_test.answered')::uuid),
  interval '2 minutes','with one invitation still open, the window does not move');
select set_config('warsha_test.quote',
  (select id::text from public.worker_quotes where request_id=current_setting('warsha_test.answered')::uuid),true);

set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.select_worker_quote(current_setting('warsha_test.answered')::uuid,current_setting('warsha_test.quote')::uuid,0,'window-select-too-early-01')$$,
  '40001','Quote cannot be selected','and the Customer still cannot select');
reset role;
select pg_temp.act_as(null);

-- ---------------------------------------------------------------------------
-- The last answer closes it
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000003');
select lives_ok(
  $$select public.decline_quote_invitation(pg_temp.invitation('warsha_test.answered','c9000000-0000-4000-8001-000000000003'),'too_far','window-answered-decline-01')$$,
  'the second Professional declines');
reset role;
select pg_temp.act_as(null);

select is(
  (select row(collection_not_before = now(), status)::text from public.marketplace_requests where id=current_setting('warsha_test.answered')::uuid),
  row(true,'customer_reviewing')::text,
  'once everybody invited has answered, the window closes now and the Customer is reviewing');

set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.select_worker_quote(current_setting('warsha_test.answered')::uuid,current_setting('warsha_test.quote')::uuid,0,'window-select-early-00001')$$,
  'the Customer selects without waiting out the two minutes');
reset role;
select pg_temp.act_as(null);

-- ---------------------------------------------------------------------------
-- Viewing is not answering
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000002');
select lives_ok(
  $$select public.decline_quote_invitation(pg_temp.invitation('warsha_test.partial','c9000000-0000-4000-8001-000000000002'),'busy','window-partial-decline-001')$$,
  'on the second request, one Professional declines');
reset role;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000003');
set local role authenticated;
select lives_ok(
  $$select public.view_quote_invitation(pg_temp.invitation('warsha_test.partial','c9000000-0000-4000-8001-000000000003'))$$,
  'and the other only opens the invitation');
reset role;
select pg_temp.act_as(null);

select is(
  (select row(collection_not_before - created_at, status)::text from public.marketplace_requests where id=current_setting('warsha_test.partial')::uuid),
  row(interval '2 minutes','collecting_quotes')::text,
  'an invitation that was only viewed keeps the window shut');

-- ---------------------------------------------------------------------------
-- Leaving collection is not answering either
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.cancel_marketplace_request(current_setting('warsha_test.partial')::uuid,'changed_mind','window-partial-cancel-0001')$$,
  'the Customer cancels the second request');
reset role;
select pg_temp.act_as(null);
select is(
  (select row(collection_not_before - created_at, status)::text from public.marketplace_requests where id=current_setting('warsha_test.partial')::uuid),
  row(interval '2 minutes','cancelled')::text,
  'closing its invitations on cancellation does not rewrite a request that has left collection');

select * from finish();
rollback;
