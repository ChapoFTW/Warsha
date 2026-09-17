begin;
select no_plan();

-- An account restriction restricts the account (202609170006).
--
-- The owner's canonical behaviour, 2026-09-17:
--   HIDDEN     not found, not invited, no new work. Existing jobs, their
--              conversations, the account, support and privacy continue.
--   SUSPENDED  no new marketplace participation, quotes, bookings or new
--              conversations. An active job can still be resolved and talked
--              about.
--   REMOVED /  no discovery, no new marketplace action, no user-to-user
--   BANNED     contact, no reviews. Leaving a job stays possible.
--
-- Staff act through `staff_record_enforcement_action`, the admin console's
-- RPC. Every consequence is then exercised through the RPC the app calls, not
-- by reading the helper, because the defect was that the helper existed and
-- nothing called it.

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
--   Customers  01 ordinary, 02 suspended, 03 removed, 04 communication
--              restricted, 05 review restricted, 06 banned at sign-in
--   Pros       10 ordinary, 11 hidden, 12 suspended, 13 removed
--   Staff      99 trust_safety_reviewer
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', ('cc000000-0000-4000-8000-0000000000'||lpad(n::text,2,'0'))::uuid,
  'authenticated','authenticated', 'restriction-'||n||'@test.local', null, '', now(), null, '{}',
  jsonb_build_object('display_name','Restriction Customer '||n), now(), now()
from unnest(array[1,2,3,4,5,6,99]) n;
insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', ('cc000000-0000-4000-8000-0000000000'||n)::uuid,
  'authenticated','authenticated', null, '+2010000cc0'||n, '', null, now(), '{}',
  jsonb_build_object('display_name','Restriction Professional '||n), now(), now()
from generate_series(10,13) n;
insert into public.staff_role_grants(user_id, role_key, reason, idempotency_key) values
  ('cc000000-0000-4000-8000-000000000099','trust_safety_reviewer','Account restriction fixture','fixture:account-restrictions:99');

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count)
select ('cc000000-0000-4000-8001-0000000000'||n)::uuid, ('cc000000-0000-4000-8000-0000000000'||n)::uuid,
  'Restriction Professional '||n,'plumbing','plumbing',array['plumbing'],'Complete marketplace profile for restriction proof.',
  'cc000000-0000-4000-8000-0000000000'||n||'/avatar/profile.jpg',true,true,true,'approved',50,10,4.5,5
from generate_series(10,13) n;
insert into public.user_roles(user_id,role)
select ('cc000000-0000-4000-8000-0000000000'||n)::uuid,'provider' from generate_series(10,13) n on conflict do nothing;
insert into public.provider_verifications(provider_id,status,revision,reviewed_at)
select ('cc000000-0000-4000-8001-0000000000'||n)::uuid,'approved',1,now() from generate_series(10,13) n;
insert into storage.objects(bucket_id,name)
select 'profile-images','cc000000-0000-4000-8000-0000000000'||n||'/avatar/profile.jpg' from generate_series(10,13) n;
select set_config('warsha_test.service_id',(select id::text from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),true);
insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,transportation_fee_egp,emergency_surcharge_egp,is_active)
select ('cc000000-0000-4000-8001-0000000000'||n)::uuid,current_setting('warsha_test.service_id')::uuid,200,'quote',0,0,true
from generate_series(10,13) n;
insert into public.provider_service_areas(provider_id,governorate,district,radius_km)
select ('cc000000-0000-4000-8001-0000000000'||n)::uuid,'Cairo','Zamalek',50 from generate_series(10,13) n;
insert into private.marketplace_category_duration_defaults(category_id,estimated_duration_minutes,policy_version)
values('plumbing',90,1) on conflict(category_id) do update set estimated_duration_minutes=90,policy_version=1;
-- Four Professionals answer one request here; the first wave is three by
-- default. Widening it changes who is asked, not what a restriction allows.
update private.marketplace_configuration set first_wave_size = 5 where singleton;

create function pg_temp.pro(n integer) returns uuid language sql as $fn$
  select ('cc000000-0000-4000-8001-0000000000'||n)::uuid $fn$;
create function pg_temp.person(n integer) returns uuid language sql as $fn$
  select ('cc000000-0000-4000-8000-0000000000'||lpad(n::text,2,'0'))::uuid $fn$;
create function pg_temp.booking(n integer) returns uuid language sql as $fn$
  select ('cc000000-0000-4000-8003-0000000000'||lpad(n::text,2,'0'))::uuid $fn$;

-- Addresses the Customers confirmed while unrestricted.
create function pg_temp.address(n integer) returns uuid language sql as $fn$
  select ('cc000000-0000-4000-8002-0000000000'||lpad(n::text,2,'0'))::uuid $fn$;
create function pg_temp.seed_address(n integer) returns void language plpgsql as $fn$
begin
  perform pg_temp.act_as(pg_temp.person(n));
  insert into public.addresses(id,customer_id,label,address_line,street,governorate,district,is_default)
  values(pg_temp.address(n),pg_temp.person(n),'Home',n||' Restriction Street','Restriction Street','Cairo','Zamalek',true);
  perform public.confirm_my_service_address(pg_temp.address(n),30.0600,31.2200,'manual_pin');
end $fn$;
set local role authenticated;
select pg_temp.seed_address(n) from generate_series(1,6) n;
reset role;
select pg_temp.act_as(null);

-- Bookings that exist before anybody is restricted.
--   Professional p (10..13) with Customer 01: booking p pending, p+10
--   confirmed, p+20 completed
--   Customer c (2..5) with Professional 10: booking 50+c confirmed, 60+c
--   completed
create function pg_temp.seed_booking(p_id uuid, p_customer uuid, p_provider uuid, p_status text, p_key text)
returns void language plpgsql as $fn$
begin
  perform pg_temp.act_as(p_customer);
  -- At the Customer's confirmed address and weeks away, so a job already
  -- booked is not what keeps a Professional from being invited today.
  insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_id,address_snapshot,idempotency_key)
  values (p_id,p_customer,p_provider,current_setting('warsha_test.service_id')::uuid,p_status,'Restriction service','fixed',200,
    'Restriction fixture job',current_date+20,'12:00',
    (select a.id from public.addresses a where a.customer_id=p_customer),'Private address',p_key);
  perform pg_temp.act_as(null);
end $fn$;

select pg_temp.seed_booking(pg_temp.booking(p), pg_temp.person(1), pg_temp.pro(p), 'pending_provider_approval', 'restriction-pending-'||p)
from generate_series(10,13) p;
select pg_temp.seed_booking(pg_temp.booking(p+10), pg_temp.person(1), pg_temp.pro(p), 'confirmed', 'restriction-confirmed-'||p)
from generate_series(10,13) p;
select pg_temp.seed_booking(pg_temp.booking(p+20), pg_temp.person(1), pg_temp.pro(p), 'completed', 'restriction-completed-'||p)
from generate_series(10,13) p;
select pg_temp.seed_booking(pg_temp.booking(50+c), pg_temp.person(c), pg_temp.pro(10), 'confirmed', 'restriction-customer-confirmed-'||c)
from generate_series(2,5) c;
select pg_temp.seed_booking(pg_temp.booking(60+c), pg_temp.person(c), pg_temp.pro(10), 'completed', 'restriction-customer-completed-'||c)
from generate_series(2,5) c;

select is((select count(*)::integer from public.bookings where id::text like 'cc000000-0000-4000-8003-%'),20,
  'twenty bookings exist before any restriction');

create function pg_temp.request(p_customer integer, p_key text)
returns uuid language plpgsql as $fn$
begin
  perform pg_temp.act_as(pg_temp.person(p_customer));
  return public.create_marketplace_request(jsonb_build_object(
    'flowKind','get_quotes','categoryId','plumbing','serviceId',current_setting('warsha_test.service_id'),
    'addressId',pg_temp.address(p_customer),'issueDescription','Kitchen sink drains slowly',
    'scheduleKind','asap','paymentCompatibility','either'), p_key);
end $fn$;
create function pg_temp.invitation(p_request uuid, p_pro integer)
returns uuid language sql as $fn$
  select id from public.quote_invitations where request_id=p_request and provider_id=pg_temp.pro(p_pro)
$fn$;
create function pg_temp.quote_terms()
returns jsonb language sql as $fn$
  select '{"priceMinor":30000,"etaMinutes":40,"estimatedDurationMinutes":90,"message":"I can come today","laborIncluded":true,"materialsInclusion":"excluded","materialsExplanation":"Parts agreed separately","supportedPaymentMethods":["cash"]}'::jsonb
$fn$;
create function pg_temp.quote_of(p_request uuid, p_pro integer)
returns uuid language sql as $fn$
  select id from public.worker_quotes where request_id=p_request and provider_id=pg_temp.pro(p_pro)
$fn$;

create function pg_temp.quote_as(p_pro integer, p_request uuid, p_key text)
returns uuid language plpgsql as $fn$
begin
  perform pg_temp.act_as(pg_temp.person(p_pro));
  return public.submit_worker_quote(pg_temp.invitation(p_request,p_pro), pg_temp.quote_terms(), p_key);
end $fn$;

-- Request "answered": everyone quotes before any restriction.
set local role authenticated;
select set_config('warsha_test.answered', pg_temp.request(1,'restriction-answered-request')::text, true);
select pg_temp.quote_as(p, current_setting('warsha_test.answered')::uuid, 'restriction-answered-quote-'||p)
from generate_series(10,13) p;
-- Request "open": invited, nobody has answered yet.
select set_config('warsha_test.open', pg_temp.request(1,'restriction-open-request-001')::text, true);
reset role;
select pg_temp.act_as(null);

select is((select count(*)::integer from public.worker_quotes where request_id=current_setting('warsha_test.answered')::uuid),4,
  'all four Professionals quoted before any restriction');
select is((select count(*)::integer from public.quote_invitations where request_id=current_setting('warsha_test.open')::uuid),4,
  'all four Professionals are invited to the open request');

-- Reviews that exist before any restriction: Customer 01 on the ordinary and
-- the hidden Professional's completed jobs.
set local role authenticated;
select pg_temp.act_as(pg_temp.person(1));
select public.submit_booking_review_v2(pg_temp.booking(30),5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,5::smallint,'Tidy and quick work.',false,'{}'::text[]);
select public.submit_booking_review_v2(pg_temp.booking(31),4::smallint,4::smallint,4::smallint,4::smallint,4::smallint,4::smallint,'Good repair overall.',false,'{}'::text[]);
reset role;
select pg_temp.act_as(null);
select set_config('warsha_test.review_ordinary',(select id::text from public.reviews where booking_id=pg_temp.booking(30)),true);
select set_config('warsha_test.review_hidden',(select id::text from public.reviews where booking_id=pg_temp.booking(31)),true);

-- A conversation about the answered request, opened by the Customer.
set local role authenticated;
select pg_temp.act_as(pg_temp.person(1));
select public.send_request_message(current_setting('warsha_test.answered')::uuid, pg_temp.pro(p), 'Can you bring a new trap?', gen_random_uuid())
from generate_series(10,13) p;
reset role;
select pg_temp.act_as(null);

-- ---------------------------------------------------------------------------
-- Staff restrict
-- ---------------------------------------------------------------------------
create function pg_temp.enforce(p_subject uuid, p_action text, p_key text)
returns jsonb language plpgsql as $fn$
begin
  perform pg_temp.act_as('cc000000-0000-4000-8000-000000000099');
  return public.staff_record_enforcement_action(p_subject, p_action, 'repeated_violations',
    'Account under review', 'Repeated complaints reviewed by staff', p_key);
end $fn$;

set local role authenticated;
select lives_ok($$select pg_temp.enforce(pg_temp.person(11),'profile_hidden','restriction-hide-11-0001')$$,'staff hide Professional 11');
select lives_ok($$select pg_temp.enforce(pg_temp.person(12),'suspension','restriction-suspend-12-001')$$,'staff suspend Professional 12');
select lives_ok($$select pg_temp.enforce(pg_temp.person(13),'marketplace_removal','restriction-remove-13-0001')$$,'staff remove Professional 13');
select lives_ok($$select pg_temp.enforce(pg_temp.person(2),'suspension','restriction-suspend-02-001')$$,'staff suspend Customer 02');
select lives_ok($$select pg_temp.enforce(pg_temp.person(3),'marketplace_removal','restriction-remove-03-0001')$$,'staff remove Customer 03');
select lives_ok($$select pg_temp.enforce(pg_temp.person(4),'communication_restriction','restriction-comms-04-00001')$$,'staff restrict Customer 04 from new contact');
select lives_ok($$select pg_temp.enforce(pg_temp.person(5),'review_restriction','restriction-review-05-0001')$$,'staff restrict Customer 05 from reviewing');

-- Warsha is cash-only: there is no money to hold.
select throws_ok($$select pg_temp.enforce(pg_temp.person(12),'payment_hold','restriction-payhold-12-01')$$,
  '55000','Warsha does not process payments, so there is nothing to hold','A PAYMENT HOLD IS REFUSED: WARSHA HOLDS NO MONEY');
select throws_ok($$select pg_temp.enforce(pg_temp.person(12),'withdrawal_hold','restriction-wdhold-12-001')$$,
  '55000','Warsha does not process payments, so there is nothing to hold','A WITHDRAWAL HOLD IS REFUSED: THERE ARE NO PAYOUTS');
select ok(pg_get_functiondef('public.get_staff_customer_overview(uuid)'::regprocedure) !~ 'payment_hold',
  'the staff account overview does not report a payment hold either');
reset role;
select pg_temp.act_as(null);

-- Sign-in ban, set by the auth provider rather than by trust staff.
update auth.users set banned_until = now() + interval '30 days' where id = pg_temp.person(6);

select is(
  (select array_agg(private.account_restriction(u) order by ord) from unnest(array[
    pg_temp.person(1),pg_temp.person(2),pg_temp.person(3),pg_temp.person(4),pg_temp.person(5),pg_temp.person(6),
    pg_temp.person(10),pg_temp.person(11),pg_temp.person(12),pg_temp.person(13)]) with ordinality t(u,ord)),
  array['none','suspended','removed','none','none','removed','none','hidden','suspended','removed'],
  'each account reads as the restriction staff or the auth provider applied');

-- ---------------------------------------------------------------------------
-- Status is visible to the person; holds are not reported
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.person(12));
select is(public.get_my_trust_status()->>'trustLevel','suspended','a suspended Professional can read their own status');
select is((public.get_my_trust_status()->'restrictions') ?| array['paymentHold','withdrawalHold'],false,
  'the status reports no payment or withdrawal hold');
select is(public.get_my_trust_status()->>'restriction','suspended','and the restriction as the product applies it');
select is(public.get_my_trust_status()->'appealableAction'->>'actionType','suspension',
  'the status names the action that can be appealed');
select is((public.get_my_trust_status()->>'canAppeal')::boolean,true,'and says an appeal is open to them');
select pg_temp.act_as(pg_temp.person(13));
select is((public.get_my_trust_status()->'restrictions'->>'marketplaceRemoved')::boolean,true,
  'a removed Professional can read that they were removed');
select lives_ok($$select public.submit_trust_appeal((public.get_my_trust_status()->'appealableAction'->>'id')::uuid,
    'I was not given a chance to explain the complaints.', 'restriction-appeal-13-00001')$$,
  'A REMOVED PROFESSIONAL CAN APPEAL, USING ONLY WHAT THEIR STATUS TELLS THEM');
select is(public.get_my_trust_status()->'appeal'->>'status','submitted','the status then shows the appeal');
select is((public.get_my_trust_status()->>'canAppeal')::boolean,false,'and no second appeal is offered');
select pg_temp.act_as(pg_temp.person(1));
select is(public.get_my_trust_status()->>'restriction','none','an unrestricted account reads as unrestricted');
reset role;
select pg_temp.act_as(null);

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.person(11));
select throws_ok($$select public.submit_worker_quote(pg_temp.invitation(current_setting('warsha_test.open')::uuid,11), pg_temp.quote_terms(), 'restriction-open-quote-11')$$,
  '22023','Invitation is no longer actionable','a hidden Professional cannot quote');
select pg_temp.act_as(pg_temp.person(12));
select throws_ok($$select public.submit_worker_quote(pg_temp.invitation(current_setting('warsha_test.open')::uuid,12), pg_temp.quote_terms(), 'restriction-open-quote-12')$$,
  '22023','Invitation is no longer actionable','a suspended Professional cannot quote');
select throws_ok($$select public.revise_worker_quote(pg_temp.quote_of(current_setting('warsha_test.answered')::uuid,12), pg_temp.quote_terms() || '{"priceMinor":25000}', 'restriction-revise-12-0001')$$,
  'WR001','account_restricted','A SUSPENDED PROFESSIONAL CANNOT REVISE A QUOTE');
select pg_temp.act_as(pg_temp.person(13));
select throws_ok($$select public.submit_worker_quote(pg_temp.invitation(current_setting('warsha_test.open')::uuid,13), pg_temp.quote_terms(), 'restriction-open-quote-13')$$,
  '22023','Invitation is no longer actionable','a removed Professional cannot quote');
select throws_ok($$select public.revise_worker_quote(pg_temp.quote_of(current_setting('warsha_test.answered')::uuid,13), pg_temp.quote_terms() || '{"priceMinor":25000}', 'restriction-revise-13-0001')$$,
  'WR001','account_restricted','A REMOVED PROFESSIONAL CANNOT REVISE A QUOTE');
select pg_temp.act_as(pg_temp.person(11));
select throws_ok($$select public.revise_worker_quote(pg_temp.quote_of(current_setting('warsha_test.answered')::uuid,11), pg_temp.quote_terms() || '{"priceMinor":25000}', 'restriction-revise-11-0001')$$,
  'WR001','account_restricted','A HIDDEN PROFESSIONAL CANNOT REVISE A QUOTE INTO NEW WORK');
select pg_temp.act_as(pg_temp.person(10));
select lives_ok($$select public.submit_worker_quote(pg_temp.invitation(current_setting('warsha_test.open')::uuid,10), pg_temp.quote_terms(), 'restriction-open-quote-10')$$,
  'an ordinary Professional still quotes');
select lives_ok($$select public.revise_worker_quote(pg_temp.quote_of(current_setting('warsha_test.answered')::uuid,10), pg_temp.quote_terms() || '{"priceMinor":28000}', 'restriction-revise-10-0001')$$,
  'and still revises');

-- The Customer is offered only quotes that can become a job.
select pg_temp.act_as(pg_temp.person(1));
select is(
  (select array_agg((q->>'providerId')::uuid order by q->>'providerId') from jsonb_array_elements(public.get_customer_quotes(current_setting('warsha_test.answered')::uuid)) q),
  array[pg_temp.pro(10)],
  'THE CUSTOMER SEES ONLY THE QUOTE OF A PROFESSIONAL WHO CAN TAKE THE JOB');
select throws_ok($$select public.select_worker_quote(current_setting('warsha_test.answered')::uuid, pg_temp.quote_of(current_setting('warsha_test.answered')::uuid,12), 0, 'restriction-select-12-0001')$$,
  '22023','Quote is no longer available','a suspended Professional''s quote cannot be chosen');
reset role;
select pg_temp.act_as(null);

-- ---------------------------------------------------------------------------
-- Request conversations are new contact; hidden keeps them
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.person(11));
select lives_ok($$select public.send_request_message(current_setting('warsha_test.answered')::uuid, pg_temp.pro(11), 'Yes, I have one.', gen_random_uuid())$$,
  'a hidden Professional keeps talking about a request they already quoted');
select pg_temp.act_as(pg_temp.person(12));
select throws_ok($$select public.send_request_message(current_setting('warsha_test.answered')::uuid, pg_temp.pro(12), 'Yes, I have one.', gen_random_uuid())$$,
  'WR001','account_restricted','A SUSPENDED PROFESSIONAL STARTS NO PRE-BOOKING CONVERSATION');
select pg_temp.act_as(pg_temp.person(13));
select throws_ok($$select public.send_request_message(current_setting('warsha_test.answered')::uuid, pg_temp.pro(13), 'Yes, I have one.', gen_random_uuid())$$,
  'WR001','account_restricted','A REMOVED PROFESSIONAL CONTACTS NOBODY ABOUT A REQUEST');
select pg_temp.act_as(pg_temp.person(10));
select lives_ok($$select public.send_request_message(current_setting('warsha_test.answered')::uuid, pg_temp.pro(10), 'Yes, I have one.', gen_random_uuid())$$,
  'an ordinary Professional replies');

-- Now the Customer chooses the ordinary Professional's quote.
select pg_temp.act_as(pg_temp.person(1));
select lives_ok($$select public.select_worker_quote(current_setting('warsha_test.answered')::uuid, pg_temp.quote_of(current_setting('warsha_test.answered')::uuid,10), (select selection_version from public.marketplace_requests where id=current_setting('warsha_test.answered')::uuid), 'restriction-select-10-0001')$$,
  'the Customer chooses the ordinary Professional');
reset role;
select pg_temp.act_as(null);

-- ---------------------------------------------------------------------------
-- New requests
-- ---------------------------------------------------------------------------
set local role authenticated;
select throws_ok($$select pg_temp.request(2,'restriction-suspended-request')$$,
  'WR001','account_restricted','A SUSPENDED CUSTOMER CANNOT POST A REQUEST');
select throws_ok($$select pg_temp.request(3,'restriction-removed-request-01')$$,
  'WR001','account_restricted','A REMOVED CUSTOMER CANNOT POST A REQUEST');
select throws_ok($$select pg_temp.request(6,'restriction-banned-request-001')$$,
  'WR001','account_restricted','A CUSTOMER BANNED AT SIGN-IN CANNOT POST A REQUEST');
select lives_ok($$select pg_temp.request(4,'restriction-comms-request-0001')$$,
  'a communication restriction does not stop a Customer asking for quotes');
select set_config('warsha_test.after', pg_temp.request(1,'restriction-after-request-001')::text, true);
reset role;
select pg_temp.act_as(null);
select is(
  (select array_agg(provider_id) from public.quote_invitations where request_id=current_setting('warsha_test.after')::uuid),
  array[pg_temp.pro(10)],
  'a request made after the restrictions invites only the ordinary Professional');

-- ---------------------------------------------------------------------------
-- Direct bookings
-- ---------------------------------------------------------------------------
create function pg_temp.book(p_customer integer, p_pro integer, p_key text)
returns uuid language plpgsql as $fn$
begin
  perform pg_temp.act_as(pg_temp.person(p_customer));
  return public.create_customer_booking(pg_temp.pro(p_pro), current_setting('warsha_test.service_id')::uuid,
    'Leaking pipe under the sink', '', pg_temp.address(p_customer), current_date + 5,
    ('09:00'::time + make_interval(mins => p_customer * 7 + p_pro)), 'scheduled', p_key);
end $fn$;

set local role authenticated;
select throws_ok($$select pg_temp.book(2,10,'restriction-book-suspended-02')$$,
  'WR001','account_restricted','A SUSPENDED CUSTOMER CANNOT BOOK');
select throws_ok($$select pg_temp.book(3,10,'restriction-book-removed-0003')$$,
  'WR001','account_restricted','A REMOVED CUSTOMER CANNOT BOOK');
select throws_ok($$select pg_temp.book(6,10,'restriction-book-banned-00006')$$,
  'WR001','account_restricted','A CUSTOMER BANNED AT SIGN-IN CANNOT BOOK');
select throws_ok($$select pg_temp.book(1,11,'restriction-book-hidden-00011')$$,
  '22023','Service unavailable','a hidden Professional cannot be booked directly');
select throws_ok($$select pg_temp.book(1,12,'restriction-book-suspended-12')$$,
  '22023','Service unavailable','a suspended Professional cannot be booked directly');
select lives_ok($$select pg_temp.book(1,10,'restriction-book-ordinary-0010')$$,
  'an ordinary Customer books an ordinary Professional');
reset role;
select pg_temp.act_as(null);

-- ---------------------------------------------------------------------------
-- Accepting offered work is new work; moving a job forward is not
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.person(11));
select throws_ok($$select public.accept_provider_booking(pg_temp.booking(11))$$,
  'WR001','account_restricted','A HIDDEN PROFESSIONAL ACCEPTS NO NEW BOOKING');
select lives_ok($$select public.advance_provider_booking_status(pg_temp.booking(21), 'provider_on_the_way', null)$$,
  'a hidden Professional still travels to a job already confirmed');
select pg_temp.act_as(pg_temp.person(12));
select throws_ok($$select public.accept_provider_booking(pg_temp.booking(12))$$,
  'WR001','account_restricted','A SUSPENDED PROFESSIONAL ACCEPTS NO NEW BOOKING');
select lives_ok($$select public.advance_provider_booking_status(pg_temp.booking(22), 'provider_on_the_way', null)$$,
  'A SUSPENDED PROFESSIONAL CAN STILL RESOLVE A JOB ALREADY UNDER WAY');
select pg_temp.act_as(pg_temp.person(13));
select throws_ok($$select public.accept_provider_booking(pg_temp.booking(13))$$,
  'WR001','account_restricted','A REMOVED PROFESSIONAL ACCEPTS NO NEW BOOKING');
select throws_ok($$select public.advance_provider_booking_status(pg_temp.booking(23), 'provider_on_the_way', null)$$,
  'WR001','account_restricted','A REMOVED PROFESSIONAL DOES NOT CARRY ON WITH A JOB');
select lives_ok($$select public.reject_provider_booking(pg_temp.booking(13), 'Not available')$$,
  'A REMOVED PROFESSIONAL CAN STILL DECLINE WORK, SO THE CUSTOMER IS NOT LEFT WAITING');
select pg_temp.act_as(pg_temp.person(10));
select lives_ok($$select public.accept_provider_booking(pg_temp.booking(10))$$,
  'an ordinary Professional accepts a booking');
reset role;
select pg_temp.act_as(null);

-- ---------------------------------------------------------------------------
-- Booking conversations and contact
-- ---------------------------------------------------------------------------
create function pg_temp.say(p_person integer, p_booking uuid)
returns uuid language plpgsql as $fn$
begin
  perform pg_temp.act_as(pg_temp.person(p_person));
  return public.send_booking_message_v2(p_booking,'text','See you at noon',null,null,null,gen_random_uuid());
end $fn$;

set local role authenticated;
select lives_ok($$select pg_temp.say(11, pg_temp.booking(21))$$,'a hidden Professional talks about a live job');
select lives_ok($$select pg_temp.say(12, pg_temp.booking(22))$$,'A SUSPENDED PROFESSIONAL TALKS ABOUT A LIVE JOB');
select throws_ok($$select pg_temp.say(12, pg_temp.booking(32))$$,
  'WR001','account_restricted','A SUSPENDED PROFESSIONAL STARTS NO CONVERSATION ABOUT A FINISHED JOB');
select throws_ok($$select pg_temp.say(13, pg_temp.booking(23))$$,
  'WR001','account_restricted','A REMOVED PROFESSIONAL SENDS NO MESSAGE, EVEN ABOUT A JOB');
select lives_ok($$select pg_temp.say(10, pg_temp.booking(30))$$,'an ordinary Professional follows up on a finished job');
select lives_ok($$select pg_temp.say(2, pg_temp.booking(52))$$,'a suspended Customer talks about a live job');
select throws_ok($$select pg_temp.say(2, pg_temp.booking(62))$$,
  'WR001','account_restricted','a suspended Customer starts no conversation about a finished job');
select throws_ok($$select pg_temp.say(3, pg_temp.booking(53))$$,
  'WR001','account_restricted','A REMOVED CUSTOMER SENDS NO MESSAGE');
select lives_ok($$select pg_temp.say(4, pg_temp.booking(54))$$,
  'a communication restriction leaves the conversation of a live job open');

select pg_temp.act_as(pg_temp.person(12));
select lives_ok($$select public.get_booking_counterparty_contact(pg_temp.booking(22))$$,
  'a suspended Professional can still reach the Customer of a live job');
select pg_temp.act_as(pg_temp.person(13));
select throws_ok($$select public.get_booking_counterparty_contact(pg_temp.booking(23))$$,
  'WC001','booking_contact_unavailable','A REMOVED PROFESSIONAL GETS NO CONTACT DETAILS');
select is(public.booking_contact_is_available(pg_temp.booking(23)),false,'and is told contact is unavailable');

-- Leaving stays possible.
select pg_temp.act_as(pg_temp.person(3));
select lives_ok($$select public.cancel_customer_booking(pg_temp.booking(53), 'other')$$,
  'A REMOVED CUSTOMER CAN STILL CANCEL, SO THE PROFESSIONAL IS NOT LEFT WAITING');
reset role;
select pg_temp.act_as(null);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create function pg_temp.review(p_person integer, p_booking uuid)
returns jsonb language plpgsql as $fn$
begin
  perform pg_temp.act_as(pg_temp.person(p_person));
  return public.submit_booking_review_v2(p_booking,4::smallint,4::smallint,4::smallint,4::smallint,4::smallint,4::smallint,'Solid repair, on time.',false,'{}'::text[]);
end $fn$;

set local role authenticated;
select throws_ok($$select pg_temp.review(2, pg_temp.booking(62))$$,'WR001','account_restricted','A SUSPENDED CUSTOMER WRITES NO REVIEW');
select throws_ok($$select pg_temp.review(3, pg_temp.booking(63))$$,'WR001','account_restricted','A REMOVED CUSTOMER WRITES NO REVIEW');
select throws_ok($$select pg_temp.review(5, pg_temp.booking(65))$$,'WR001','account_restricted','A REVIEW-RESTRICTED CUSTOMER WRITES NO REVIEW');
select lives_ok($$select pg_temp.review(4, pg_temp.booking(64))$$,'a communication restriction does not stop a review');
select lives_ok($$select pg_temp.review(1, pg_temp.booking(33))$$,
  'a Customer can still review the job a removed Professional did for them');

select pg_temp.act_as(pg_temp.person(11));
select lives_ok($$select public.reply_to_booking_review(current_setting('warsha_test.review_hidden')::uuid,'Thank you.')$$,
  'a hidden Professional replies to a review of their work');
select lives_ok($$select public.vote_review_helpfulness(current_setting('warsha_test.review_ordinary')::uuid,'helpful')$$,
  'and can mark another review helpful');
select pg_temp.act_as(pg_temp.person(13));
select throws_ok($$select public.reply_to_booking_review((select id from public.reviews where booking_id=pg_temp.booking(33)),'Thank you.')$$,
  'WR001','account_restricted','A REMOVED PROFESSIONAL POSTS NO REVIEW REPLY');
select throws_ok($$select public.vote_review_helpfulness(current_setting('warsha_test.review_ordinary')::uuid,'helpful')$$,
  'WR001','account_restricted','A REMOVED PROFESSIONAL CASTS NO REVIEW VOTE');
select pg_temp.act_as(pg_temp.person(12));
select throws_ok($$select public.vote_review_helpfulness(current_setting('warsha_test.review_ordinary')::uuid,'helpful')$$,
  'WR001','account_restricted','a suspended Professional casts no review vote');
reset role;
select pg_temp.act_as(null);

-- History is kept.
select is((select count(*)::integer from public.bookings where provider_id=pg_temp.pro(13)),3,
  'a removed Professional''s jobs are all still recorded');
select is((select count(*)::integer from public.reviews where provider_id=pg_temp.pro(13) and deleted_at is null),1,
  'and the review of their work stands');
select is((select count(*)::integer from public.worker_quotes where provider_id in (pg_temp.pro(11),pg_temp.pro(12),pg_temp.pro(13))),3,
  'quotes made before a restriction are not erased');

-- ---------------------------------------------------------------------------
-- A restriction that ends stops restricting
-- ---------------------------------------------------------------------------
-- The clock passing the expiry, not a staff action.
update public.trust_account_state set restriction_expires_at = now() - interval '1 minute'
where user_id = pg_temp.person(12);
set local role authenticated;
select pg_temp.act_as(pg_temp.person(12));
select lives_ok($$select public.accept_provider_booking(pg_temp.booking(12))$$,
  'once a suspension has expired, the Professional accepts work again');
select lives_ok($$select pg_temp.enforce(pg_temp.person(11),'restoration','restriction-restore-11-001')$$,
  'staff restore the hidden Professional');
reset role;
select pg_temp.act_as(null);
select is(private.account_restriction(pg_temp.person(11)),'none','a restored Professional is unrestricted');
select is(private.is_provider_publicly_discoverable(pg_temp.pro(11)),true,'and discoverable again');

select * from finish();
rollback;
