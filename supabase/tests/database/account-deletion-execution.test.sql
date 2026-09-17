begin;
select no_plan();

-- A deletion request is carried out (202609170009).
--
-- WPS-022 built the request, the waiting period, the blockers and the
-- anonymization, and nothing ever ran them: a person could ask to be deleted,
-- be told it would happen after the waiting period, and wait forever. This
-- exercises the whole path through the product's own writers — the request RPC
-- the app calls, and the processor cron runs — and then reads what is left.

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
end $fn$;

-- The privacy centre and deletion, on, as Production has them.
update private.privacy_configuration set privacy_center_enabled = true, deletion_enabled = true where singleton;
insert into private.staff_feature_flags(flag_key, environment, enabled, audience, reason)
values('privacy_center', private.platform_environment(), true, 'all', 'Deletion execution proof'),
      ('account_deletion', private.platform_environment(), true, 'all', 'Deletion execution proof')
on conflict (flag_key, environment) do update set enabled = true, audience = 'all', expires_at = null;

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','cf000000-0000-4000-8000-000000000001','authenticated','authenticated','leaving@test.local',null,'hashed',now(),null,'{}','{"display_name":"Leaving Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','cf000000-0000-4000-8000-000000000002','authenticated','authenticated','staying@test.local',null,'hashed',now(),null,'{}','{"display_name":"Busy Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','cf000000-0000-4000-8000-000000000003','authenticated','authenticated',null,'+201000000f03','hashed',null,now(),'{}','{"display_name":"Serving Professional"}',now(),now());

-- What a signed-in account carries: an identity, a session, a refresh token.
insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
values('leaving@test.local','cf000000-0000-4000-8000-000000000001','{"sub":"cf000000-0000-4000-8000-000000000001","email":"leaving@test.local"}','email',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
values('cf000000-0000-4000-8004-000000000001','cf000000-0000-4000-8000-000000000001',now(),now());
insert into auth.refresh_tokens(instance_id,token,user_id,session_id,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','leaving-token','cf000000-0000-4000-8000-000000000001','cf000000-0000-4000-8004-000000000001',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km)
values('cf000000-0000-4000-8001-000000000003','cf000000-0000-4000-8000-000000000003','Serving Professional','plumbing','plumbing',array['plumbing'],'Complete profile for deletion proof.','cf000000-0000-4000-8000-000000000003/avatar/profile.jpg',true,true,true,'approved',50);
insert into public.user_roles(user_id,role) values('cf000000-0000-4000-8000-000000000003','provider') on conflict do nothing;
insert into public.provider_verifications(provider_id,status,revision,reviewed_at) values('cf000000-0000-4000-8001-000000000003','approved',1,now());
insert into storage.objects(bucket_id,name) values('profile-images','cf000000-0000-4000-8000-000000000003/avatar/profile.jpg');
select set_config('warsha_test.service_id',(select id::text from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),true);
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,is_active)
values('cf000000-0000-4000-8001-000000000003',current_setting('warsha_test.service_id')::uuid,200,'quote',true);
insert into public.provider_service_areas(provider_id,governorate,district,radius_km)
values('cf000000-0000-4000-8001-000000000003','Cairo','Zamalek',50);
insert into private.marketplace_category_duration_defaults(category_id,estimated_duration_minutes,policy_version)
values('plumbing',90,1) on conflict(category_id) do update set estimated_duration_minutes=90,policy_version=1;

-- The address, pinned the way the app pins it, and a request made from it.
set local role authenticated;
select pg_temp.act_as('cf000000-0000-4000-8000-000000000001');
insert into public.addresses(id,customer_id,label,address_line,street,building,floor,apartment,landmark,instructions,governorate,district,is_default)
values('cf000000-0000-4000-8002-000000000001','cf000000-0000-4000-8000-000000000001','Home','7 Quiet Street','Quiet Street','7','3','12','Next to the pharmacy','Ring twice','Cairo','Zamalek',true);
select public.confirm_my_service_address('cf000000-0000-4000-8002-000000000001',30.0600,31.2200,'manual_pin');
select public.create_marketplace_request(jsonb_build_object(
  'flowKind','get_quotes','categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),
  'addressId','cf000000-0000-4000-8002-000000000001','issueDescription','Kitchen tap drips all night',
  'scheduleKind','asap','paymentCompatibility','either'),'deletion-request-fixture-01');
insert into public.favourites(customer_id,provider_id) values('cf000000-0000-4000-8000-000000000001','cf000000-0000-4000-8001-000000000003');
reset role;
select pg_temp.act_as(null);

-- History that must survive: a finished job, and the legal acceptance evidence.
select pg_temp.act_as('cf000000-0000-4000-8000-000000000001');
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_id,address_snapshot,idempotency_key)
values('cf000000-0000-4000-8003-000000000001','cf000000-0000-4000-8000-000000000001','cf000000-0000-4000-8001-000000000003',
  current_setting('warsha_test.service_id')::uuid,'completed','Deletion service','fixed',200,'Finished job before deletion',
  current_date-3,'12:00','cf000000-0000-4000-8002-000000000001','7 Quiet Street, Zamalek, Cairo','deletion-booking-fixture-1');
select pg_temp.act_as(null);
insert into public.legal_acceptances(user_id,document_key,version,decision,accepted_language,acceptance_hash,rendered_hash,source_surface,environment,accepted_at)
select 'cf000000-0000-4000-8000-000000000001','customer_terms',v.version,'accepted','en',
  pg_catalog.encode(pg_catalog.sha256('acceptance'::bytea),'hex'), v.content_hash_en,'sign_up',
  private.platform_environment(), now()
from public.legal_document_versions v where v.document_key='customer_terms' and v.status='published';
insert into private.notification_device_tokens(user_id,platform,app_version,token_hash,encrypted_token,device_label)
values('cf000000-0000-4000-8000-000000000001','android','1.0.0',pg_catalog.encode(pg_catalog.sha256('device'::bytea),'hex'),'encrypted','Pixel 7');

select is((select count(*)::integer from private.marketplace_request_locations l
  join public.marketplace_requests r on r.id=l.request_id where r.customer_id='cf000000-0000-4000-8000-000000000001'),1,
  'the request keeps its exact location while the account exists');

-- ---------------------------------------------------------------------------
-- The request, through the RPC the app calls
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('cf000000-0000-4000-8000-000000000001');
select lives_ok($$select public.request_account_deletion('no_longer_needed','deletion-request-key-000001')$$,
  'the Customer asks for deletion');
reset role;
select pg_temp.act_as(null);
select is((select status from public.account_deletion_requests where user_id='cf000000-0000-4000-8000-000000000001'),
  'cooling_off','and waits');

select is((private.process_account_deletions(10) ->> 'executed')::integer, 0,
  'nothing is carried out while the waiting period is running');

-- The clock passes. Nothing else changes.
update public.account_deletion_requests set cooling_off_ends_at = now() - interval '1 minute'
where user_id='cf000000-0000-4000-8000-000000000001';

select is(private.process_account_deletions(10),
  pg_catalog.jsonb_build_object('enabled',true,'reviewed',1,'executed',1,'failed',0),
  'ONCE THE WAITING PERIOD HAS ELAPSED, THE REQUEST IS CARRIED OUT');
select is((select status from public.account_deletion_requests where user_id='cf000000-0000-4000-8000-000000000001'),
  'completed','the request is completed');
select isnt((select anonymized_at from public.account_deletion_requests where user_id='cf000000-0000-4000-8000-000000000001'),
  null,'and says when the personal data went');

-- ---------------------------------------------------------------------------
-- What went
-- ---------------------------------------------------------------------------
select is((select row(display_name, phone, avatar_url)::text from public.profiles where id='cf000000-0000-4000-8000-000000000001'),
  row((select deleted_account_label_en from private.privacy_configuration where singleton), null::text, null::text)::text,
  'the name becomes a label and the contact details go');
select is(
  (select row(street, building, floor, apartment, landmark, instructions, latitude, longitude, pin_confirmed_at)::text
   from public.addresses where id='cf000000-0000-4000-8002-000000000001'),
  row(null::text,null::text,null::text,null::text,null::text,null::text,null::double precision,null::double precision,null::timestamptz)::text,
  'AN ADDRESS KEEPS NO STREET, NO BUILDING, NO ACCESS NOTES AND NO COORDINATES');
select is((select governorate from public.addresses where id='cf000000-0000-4000-8002-000000000001'),'Cairo',
  'only the coarse area the marketplace already showed remains');
select is((select count(*)::integer from private.marketplace_request_locations l
  join public.marketplace_requests r on r.id=l.request_id where r.customer_id='cf000000-0000-4000-8000-000000000001'),0,
  'THE EXACT LOCATION OF PAST REQUESTS IS DELETED');
select is((select count(*)::integer from public.favourites where customer_id='cf000000-0000-4000-8000-000000000001'),0,
  'saved professionals are deleted');
select is((select count(*)::integer from private.notification_device_tokens
  where user_id='cf000000-0000-4000-8000-000000000001' and revoked_at is null),0,'devices are revoked');

-- Sign-in: the gap WPS-022 recorded as outstanding.
select is((select count(*)::integer from auth.sessions where user_id='cf000000-0000-4000-8000-000000000001'),0,
  'SESSIONS ARE GONE');
select is((select count(*)::integer from auth.refresh_tokens where user_id='cf000000-0000-4000-8000-000000000001'),0,
  'so are the refresh tokens');
select is((select count(*)::integer from auth.identities where user_id='cf000000-0000-4000-8000-000000000001'),0,
  'and the sign-in identity');
-- Second factors are left alone on purpose: staff-authority-boundary forbids any
-- Warsha function from naming that table, and the account is banned with no
-- credential, so the row cannot be used to sign in.
select is((select row(email, phone, encrypted_password, banned_until > now() + interval '100 years')::text
  from auth.users where id='cf000000-0000-4000-8000-000000000001'),
  row(null::text,null::text,null::text,true)::text,
  'THE ACCOUNT CANNOT SIGN IN AND CARRIES NO EMAIL, PHONE OR PASSWORD');

-- ---------------------------------------------------------------------------
-- What stays
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from public.legal_acceptances where user_id='cf000000-0000-4000-8000-000000000001'),1,
  'THE IMMUTABLE LEGAL ACCEPTANCE STAYS, KEYED ON THE ACCOUNT');
select is((select row(status, address_snapshot)::text from public.bookings where id='cf000000-0000-4000-8003-000000000001'),
  row('completed','7 Quiet Street, Zamalek, Cairo')::text,
  'the other party keeps their record of the job, snapshot and all');
select ok((select count(*) > 0 from private.privacy_anonymization_log where subject_user_id='cf000000-0000-4000-8000-000000000001'
  and step_key = 'auth_sign_in_disabled'), 'every step is logged, including the one that used to read zero');

-- ---------------------------------------------------------------------------
-- A live commitment blocks it, and says which
-- ---------------------------------------------------------------------------
select pg_temp.act_as('cf000000-0000-4000-8000-000000000002');
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key)
values('cf000000-0000-4000-8003-000000000002','cf000000-0000-4000-8000-000000000002','cf000000-0000-4000-8001-000000000003',
  current_setting('warsha_test.service_id')::uuid,'confirmed','Deletion service','fixed',200,'Job still under way',
  current_date+2,'12:00','Private address','deletion-booking-fixture-2');
select pg_temp.act_as(null);
set local role authenticated;
select pg_temp.act_as('cf000000-0000-4000-8000-000000000002');
select lives_ok($$select public.request_account_deletion('no_longer_needed','deletion-request-key-000002')$$,
  'a Customer with a live job asks for deletion');
reset role;
select pg_temp.act_as(null);
update public.account_deletion_requests set cooling_off_ends_at = now() - interval '1 minute'
where user_id='cf000000-0000-4000-8000-000000000002';
select is((private.process_account_deletions(10) ->> 'executed')::integer, 0,
  'A LIVE JOB IS NOT DELETED AROUND: NOTHING IS CARRIED OUT');
select is((select row(status, blocker_codes)::text from public.account_deletion_requests where user_id='cf000000-0000-4000-8000-000000000002'),
  row('blocked', array['active_booking'])::text, 'and the account is told which commitment stands in the way');
select is((select display_name from public.profiles where id='cf000000-0000-4000-8000-000000000002'),'Busy Customer',
  'their account is untouched');

-- The job ends the way jobs end, through the Customer's own cancellation.
set local role authenticated;
select pg_temp.act_as('cf000000-0000-4000-8000-000000000002');
select lives_ok($$select public.cancel_customer_booking('cf000000-0000-4000-8003-000000000002','other')$$,
  'the Customer ends the job themselves');
reset role;
select pg_temp.act_as(null);
select is((private.process_account_deletions(10) ->> 'executed')::integer, 1,
  'once the job is over, the request they made is carried out');

-- ---------------------------------------------------------------------------
-- A Warsha that does not offer deletion does not perform it
-- ---------------------------------------------------------------------------
insert into public.account_deletion_requests(user_id,status,cooling_off_ends_at,idempotency_key)
values('cf000000-0000-4000-8000-000000000003','approved',now()-interval '1 hour','deletion-request-key-000003');
update private.privacy_configuration set deletion_enabled = false where singleton;
select is(private.process_account_deletions(10),
  pg_catalog.jsonb_build_object('enabled',false,'reviewed',0,'executed',0,'failed',0),
  'with deletion switched off, the processor does nothing at all');
select is((select status from public.account_deletion_requests where user_id='cf000000-0000-4000-8000-000000000003'),
  'approved','and the request is left exactly as it was');

select * from finish();
rollback;
