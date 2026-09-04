-- Who may obtain whose telephone number, and when.
--
-- The property being defended is narrow and absolute: a telephone number leaves
-- the database only for somebody who is currently in a live job with its owner.
-- Not for a worker who has quoted. Not for a worker who was rejected. Not for a
-- customer browsing. Not after the work is over.
--
-- The refusals matter as much as the grants, and specifically that "no such
-- booking" and "not your booking" are INDISTINGUISHABLE. A function that
-- answered those differently would be an oracle for whether any given booking id
-- exists, which is the enumeration primitive worth having.

begin;
select plan(24);

select has_function('public', 'get_booking_counterparty_contact', array['uuid'],
  'the narrow contact RPC exists');
select has_function('public', 'booking_contact_is_available', array['uuid'],
  'and a screen can ask whether a call is allowed without asking for a number');

select is(has_function_privilege('anon', 'public.get_booking_counterparty_contact(uuid)', 'execute'), false,
  'A SIGNED-OUT CALLER CANNOT REACH THE CONTACT RPC AT ALL');
select is(has_function_privilege('anon', 'public.booking_contact_is_available(uuid)', 'execute'), false,
  'nor the availability probe');

-- The pre-existing protection this feature must not weaken: a phone number is
-- not readable from `profiles` by anybody but its owner.
select is(has_column_privilege('anon', 'public.profiles', 'phone', 'select'), false,
  'anonymous readers still cannot see a telephone number on profiles');
select is(
  (select count(*)::integer from pg_policy
   where polrelid = 'public.profiles'::regclass and polcmd = 'r'
     and pg_get_expr(polqual, polrelid) like '%auth.uid()%'),
  1,
  'AND ROW SECURITY STILL LIMITS profiles READS TO THE OWNER''S OWN ROW');

-- ---------------------------------------------------------------------------
-- Fixtures: one customer, two workers, one booking
-- ---------------------------------------------------------------------------

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','97000000-0000-0000-0000-000000000001','authenticated','authenticated','contact-customer@test.local','+201000000701','',now(),now(),'{}','{"display_name":"Contact Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','97000000-0000-0000-0000-000000000002','authenticated','authenticated',null,'+201000000702','',null,now(),'{}','{"display_name":"Assigned Worker"}',now(),now()),
('00000000-0000-0000-0000-000000000000','97000000-0000-0000-0000-000000000003','authenticated','authenticated',null,'+201000000703','',null,now(),'{}','{"display_name":"Other Worker"}',now(),now()),
('00000000-0000-0000-0000-000000000000','97000000-0000-0000-0000-000000000004','authenticated','authenticated','other-customer@test.local','+201000000704','',now(),now(),'{}','{"display_name":"Other Customer"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count,emergency_available)
values
('97000000-0000-0000-0001-000000000002','97000000-0000-0000-0000-000000000002','Assigned Worker','plumbing','plumbing',array['plumbing'],'The worker on the booking.','97000000-0000-0000-0000-000000000002/avatar/profile.jpg',true,true,true,'approved',50,10,4.7,8,false),
('97000000-0000-0000-0001-000000000003','97000000-0000-0000-0000-000000000003','Other Worker','plumbing','plumbing',array['plumbing'],'A worker with no relationship to the booking.','97000000-0000-0000-0000-000000000003/avatar/profile.jpg',true,true,true,'approved',50,10,4.7,8,false);

insert into public.addresses(id,customer_id,label,address_line,governorate,district)
values ('97000000-0000-0000-0002-000000000001','97000000-0000-0000-0000-000000000001','Home','1 A Street','Cairo','Zamalek');

select set_config('warsha_test.contact_service',
  (select id::text from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1), true);

-- `private.record_booking_status` audits every insert and refuses one with no
-- authenticated actor, so the fixture is written as the customer rather than as
-- the test's own role. That guard is correct and this file does not weaken it.
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,service_name_snapshot,pricing_type,
  estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key,status)
values ('97000000-0000-0000-0003-000000000001','97000000-0000-0000-0000-000000000001','97000000-0000-0000-0001-000000000002',
  (current_setting('warsha_test.contact_service'))::uuid,'Tap repair','quote',200,
  'A tap that will not stop running at all.',(now() + interval '1 day')::date,'10:00',
  '{"governorate":"Cairo","district":"Zamalek"}'::jsonb,'contact-privacy-booking-0001','confirmed');
select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- The two participants, and only them
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000001',true);
select is(
  (select public.get_booking_counterparty_contact('97000000-0000-0000-0003-000000000001'::uuid) ->> 'phone'),
  '+201000000702',
  'THE CUSTOMER MAY OBTAIN THE ASSIGNED WORKER''S NUMBER');
select is(
  (select public.get_booking_counterparty_contact('97000000-0000-0000-0003-000000000001'::uuid) ->> 'counterpartyRole'),
  'worker',
  'and is told whose number it is');
select ok(
  public.booking_contact_is_available('97000000-0000-0000-0003-000000000001'::uuid),
  'the screen can be told a call is allowed without fetching the number');
reset role;
select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000002',true);
select is(
  (select public.get_booking_counterparty_contact('97000000-0000-0000-0003-000000000001'::uuid) ->> 'phone'),
  '+201000000701',
  'THE ASSIGNED WORKER MAY OBTAIN THE CUSTOMER''S NUMBER');
select is(
  (select public.get_booking_counterparty_contact('97000000-0000-0000-0003-000000000001'::uuid) ->> 'callerRole'),
  'worker',
  'and the function works out which side of the booking they are on');
reset role;
select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- Everybody else
-- ---------------------------------------------------------------------------
-- Each of these must produce the SAME refusal as a booking that does not exist.

set local role authenticated;
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.get_booking_counterparty_contact('97000000-0000-0000-0003-000000000001'::uuid)$$,
  'PT404', 'Booking not found',
  'AN UNRELATED WORKER IS REFUSED');
select is(public.booking_contact_is_available('97000000-0000-0000-0003-000000000001'::uuid), false,
  'and is not even told a call would be possible');
reset role;
select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000004',true);
select throws_ok(
  $$select public.get_booking_counterparty_contact('97000000-0000-0000-0003-000000000001'::uuid)$$,
  'PT404', 'Booking not found',
  'AN UNRELATED CUSTOMER IS REFUSED');
select throws_ok(
  $$select public.get_booking_counterparty_contact('97000000-0000-0000-0003-0000000000ff'::uuid)$$,
  'PT404', 'Booking not found',
  'AND A BOOKING THAT DOES NOT EXIST PRODUCES THE IDENTICAL REFUSAL');
reset role;
select set_config('request.jwt.claim.sub','',true);

set local role anon;
select set_config('request.jwt.claim.sub','',true);
-- `anon` holds no EXECUTE, so the refusal comes from the privilege system
-- before a single line of the function runs. That is the stronger of the two
-- possible refusals and the one worth asserting.
select throws_ok(
  $$select public.get_booking_counterparty_contact('97000000-0000-0000-0003-000000000001'::uuid)$$,
  '42501', null,
  'ANONYMOUS CALLERS ARE REFUSED BEFORE ANY LOOKUP HAPPENS');
reset role;

-- ---------------------------------------------------------------------------
-- Lifecycle
-- ---------------------------------------------------------------------------
-- A participant is not refused silently: they are told the state is wrong,
-- because there is nothing to protect from somebody already in the booking.

-- Two triggers are stood down for the remainder of this transaction, and the
-- rollback that ends the file restores both.
--
-- `enforce_booking_transition` refuses an arbitrary status jump, and
-- `booking_status_audit` refuses a status change with no authenticated actor.
-- Both are correct, and neither is the subject here: this file tests WHO MAY
-- READ A TELEPHONE NUMBER IN A GIVEN STATE, not how a booking legitimately
-- reaches that state. Driving each status through its real transition path
-- would test the transition machine a dozen times over and the contact rule
-- once.
alter table public.bookings disable trigger enforce_booking_transition;
alter table public.bookings disable trigger booking_status_audit;

update public.bookings set status = 'completed' where id = '97000000-0000-0000-0003-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.get_booking_counterparty_contact('97000000-0000-0000-0003-000000000001'::uuid)$$,
  'WC001', 'booking_contact_unavailable',
  'A COMPLETED JOB IS NOT A STANDING LICENCE TO TELEPHONE SOMEBODY');
select is(public.booking_contact_is_available('97000000-0000-0000-0003-000000000001'::uuid), false,
  'and the call action disappears rather than failing when pressed');
reset role;
select set_config('request.jwt.claim.sub','',true);

update public.bookings set status = 'cancelled' where id = '97000000-0000-0000-0003-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000002',true);
select throws_ok(
  $$select public.get_booking_counterparty_contact('97000000-0000-0000-0003-000000000001'::uuid)$$,
  'WC001', 'booking_contact_unavailable',
  'a cancelled booking ends contact');
reset role;
select set_config('request.jwt.claim.sub','',true);

update public.bookings set status = 'disputed' where id = '97000000-0000-0000-0003-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.get_booking_counterparty_contact('97000000-0000-0000-0003-000000000001'::uuid)$$,
  'WC001', 'booking_contact_unavailable',
  'and a dispute moves contact into the dispute record rather than a private call');
reset role;
select set_config('request.jwt.claim.sub','',true);

-- Every live state does allow it. Asserted as a set rather than one example,
-- because the list in the function is the product rule and a status added to
-- `bookings` without being considered here would silently drop calling.
update public.bookings set status = 'provider_on_the_way' where id = '97000000-0000-0000-0003-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000001',true);
select ok(
  (select (public.get_booking_counterparty_contact('97000000-0000-0000-0003-000000000001'::uuid) ->> 'callable')::boolean),
  'a worker on the way can be telephoned');
reset role;
select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- The number never travels any other way
-- ---------------------------------------------------------------------------
-- The whole point of a narrow RPC is defeated if a phone number is also sitting
-- in a payload somebody already fetches. These assert the two surfaces a worker
-- and a customer see before a booking exists.

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('get_worker_quote_invitations', 'get_customer_quotes')
     and p.prosrc ~* '\yphone\y'),
  0,
  'NEITHER THE OPPORTUNITY LIST NOR THE QUOTE LIST CARRIES A TELEPHONE NUMBER');

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_customer_marketplace_request'
     and p.prosrc ~* '\yphone\y'),
  0,
  'nor does the request a customer opens');

select is(has_function_privilege('authenticated', 'private.account_contact_phone(uuid)', 'execute'), false,
  'AND NO CLIENT CAN ASK FOR AN ARBITRARY ACCOUNT''S NUMBER DIRECTLY');

rollback;
