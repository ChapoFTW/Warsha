-- Can one customer reach another customer's life?
--
-- ## Why this file exists
--
-- `rls.test.sql` has 71 assertions and every one of them is structural: this
-- table has row security enabled, this function exists, `anon` holds no EXECUTE.
-- All true, all worth keeping, and none of them asks the only question that
-- matters — whether the policies CONTAIN anybody.
--
-- A policy can be enabled, granted correctly, and still return somebody else's
-- bookings. `relrowsecurity = true` says a filter runs; it says nothing about
-- what the filter permits. So this file puts two unrelated customers and two
-- unrelated workers in the same database, gives one of each some data, and asks
-- the other to fetch it.
--
-- The identities are deliberately symmetrical. Customer B is a real, complete,
-- signed-in customer — not a stranger and not a half-built fixture — because the
-- interesting failure is not "an outsider got in", it is "a legitimate user of
-- the same product saw the wrong row".
--
-- ## Reading a failure here
--
-- Every assertion below is a count. A count of 0 is containment. A count of 1 is
-- one real person reading another real person's booking, conversation, support
-- ticket or vetting file — so a failure here is never cosmetic and never a
-- fixture problem to be worked around.

begin;
select plan(36);

-- ---------------------------------------------------------------------------
-- Two of everything
-- ---------------------------------------------------------------------------

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','e5000000-0000-0000-0000-000000000001','authenticated','authenticated','tenant-cust-a@test.local','',now(),'{}','{"display_name":"Customer A"}',now(),now()),
('00000000-0000-0000-0000-000000000000','e5000000-0000-0000-0000-000000000002','authenticated','authenticated','tenant-cust-b@test.local','',now(),'{}','{"display_name":"Customer B"}',now(),now());

insert into auth.users(instance_id,id,aud,role,phone,encrypted_password,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','e5000000-0000-0000-0000-000000000003','authenticated','authenticated','+201000000981','',now(),'{}','{"display_name":"Worker A"}',now(),now()),
('00000000-0000-0000-0000-000000000000','e5000000-0000-0000-0000-000000000004','authenticated','authenticated','+201000000982','',now(),'{}','{"display_name":"Worker B"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count,emergency_available)
values
('e5000000-0000-0000-0001-000000000003','e5000000-0000-0000-0000-000000000003','Worker A','plumbing','plumbing',array['plumbing'],'Worker A profile.',true,true,true,'approved',50,5,4.5,4,false),
('e5000000-0000-0000-0001-000000000004','e5000000-0000-0000-0000-000000000004','Worker B','plumbing','plumbing',array['plumbing'],'Worker B profile.',true,true,true,'approved',50,5,4.5,4,false);

insert into public.addresses(id,customer_id,label,address_line,governorate,district)
values ('e5000000-0000-0000-0002-000000000001','e5000000-0000-0000-0000-000000000001','Home','1 A Street','Cairo','Zamalek');

-- Customer A hires Worker A. Everything below hangs off this one relationship.
select set_config('request.jwt.claim.sub','e5000000-0000-0000-0000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,service_name_snapshot,pricing_type,
  estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key,status)
values ('e5000000-0000-0000-0003-000000000001','e5000000-0000-0000-0000-000000000001','e5000000-0000-0000-0001-000000000003',
  (select id from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),
  'Tap repair','quote',200,'A tap that will not stop running at all.',(now() + interval '1 day')::date,'10:00',
  '{"governorate":"Cairo"}'::jsonb,'tenant-booking-1','confirmed');
select set_config('request.jwt.claim.sub','',true);

-- A booking creates its own conversation by trigger, so this reads the one that
-- already exists rather than inserting a second and colliding with the unique
-- index on booking_id.
insert into public.messages(id, conversation_id, sender_id, booking_id, body)
values ('e5000000-0000-0000-0005-000000000001',
        (select id from public.conversations where booking_id = 'e5000000-0000-0000-0003-000000000001'),
        'e5000000-0000-0000-0000-000000000001','e5000000-0000-0000-0003-000000000001',
        'The kitchen tap is the one leaking.');

insert into public.notifications(id, user_id, type, title, body, event_key, category, priority, audience, source_key, last_event_at)
values ('e5000000-0000-0000-0006-000000000001','e5000000-0000-0000-0000-000000000001','booking_confirmed',
        'Booking confirmed','Worker A accepted your booking.','booking_confirmed','bookings','normal','customer',
        'tenant-notification-1', now());

insert into public.support_tickets(id, requester_id, subject)
values ('e5000000-0000-0000-0007-000000000001','e5000000-0000-0000-0000-000000000001','My tap is still leaking');

insert into public.worker_criminal_record_submissions
  (provider_id, storage_path, mime_type, file_size_bytes, issue_date, declared_name, worker_acknowledged_at, status, is_current)
values ('e5000000-0000-0000-0001-000000000003','e5000000-0000-0000-0000-000000000003/criminal/record.pdf',
        'application/pdf', 2048, current_date - 30, 'Worker A', now(), 'submitted', true);

-- ---------------------------------------------------------------------------
-- 1. The control: A can see A's own life
-- ---------------------------------------------------------------------------
-- Asserted first and deliberately. Without it, every zero below could mean the
-- fixture never inserted anything, and the file would pass while proving nothing.

set local role authenticated;
select set_config('request.jwt.claim.sub','e5000000-0000-0000-0000-000000000001',true);
-- Counted by identity rather than by table, because creating a booking also
-- inserts a `status` message into the conversation and a `new_booking_request`
-- notification for the worker. A bare count(*) here would be asserting the
-- trigger's behaviour instead of the policy's.
select is((select count(*)::integer from public.bookings), 1, 'Customer A sees their own booking');
select is((select count(*)::integer from public.messages
           where body = 'The kitchen tap is the one leaking.'), 1, 'and their own message');
select is((select count(*)::integer from public.notifications
           where id = 'e5000000-0000-0000-0006-000000000001'), 1, 'and their own notification');
select is((select count(*)::integer from public.support_tickets), 1, 'and their own support ticket');
reset role; select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- 2. A second, equally legitimate customer
-- ---------------------------------------------------------------------------
-- Customer B is signed in, confirmed, and entitled to everything Warsha offers a
-- customer. None of it is Customer A's.

set local role authenticated;
select set_config('request.jwt.claim.sub','e5000000-0000-0000-0000-000000000002',true);

select is((select count(*)::integer from public.bookings), 0,
  'CUSTOMER B CANNOT SEE CUSTOMER A''S BOOKING');
select is((select count(*)::integer from public.messages), 0,
  'NOR READ THEIR CONVERSATION');
select is((select count(*)::integer from public.conversations), 0,
  'nor even see that the conversation exists');
select is((select count(*)::integer from public.notifications), 0,
  'NOR THEIR NOTIFICATIONS');
select is((select count(*)::integer from public.support_tickets), 0,
  'NOR THEIR SUPPORT TICKET');
select is((select count(*)::integer from public.addresses), 0,
  'nor their home address');
select is((select count(*)::integer from public.worker_criminal_record_submissions), 0,
  'and no customer sees any worker''s vetting file');

-- Writing, not only reading. A row that cannot be read but can be changed is
-- still reachable — except here the containment is not a policy at all.
-- `authenticated` holds only SELECT on these tables; every write goes through a
-- SECURITY DEFINER RPC that checks ownership itself. So the update is refused
-- before row security is consulted, which is a stronger boundary than a policy
-- that filters to zero rows, and worth asserting as the specific thing it is.
select throws_ok(
  $$update public.bookings set issue_description = 'edited by a stranger'$$,
  '42501', null,
  'CUSTOMER B HOLDS NO WRITE PRIVILEGE ON BOOKINGS AT ALL — WRITES ARE RPC-ONLY');
select throws_ok(
  $$update public.messages set body = 'edited by a stranger'$$,
  '42501', null,
  'nor on messages');
reset role; select set_config('request.jwt.claim.sub','',true);

select is((select count(*)::integer from public.bookings
           where issue_description = 'A tap that will not stop running at all.'), 1,
  'AND CUSTOMER A''S BOOKING IS UNCHANGED');
select is((select count(*)::integer from public.messages
           where body = 'The kitchen tap is the one leaking.'), 1,
  'AND SO IS THEIR MESSAGE');

-- ---------------------------------------------------------------------------
-- 3. The worker who was not hired
-- ---------------------------------------------------------------------------
-- Worker B is a verified, published, available worker in the same category and
-- the same city. That is the whole point: they are a peer, not an intruder, and
-- the marketplace is the only thing they are entitled to see.

set local role authenticated;
select set_config('request.jwt.claim.sub','e5000000-0000-0000-0000-000000000004',true);

select is((select count(*)::integer from public.bookings), 0,
  'WORKER B CANNOT SEE A JOB THEY WERE NOT HIRED FOR');
select is((select count(*)::integer from public.messages), 0,
  'NOR THE CONVERSATION ABOUT IT');
select is((select count(*)::integer from public.notifications), 0,
  'nor the customer''s notifications');
select is((select count(*)::integer from public.support_tickets), 0,
  'nor the customer''s support ticket');
select is((select count(*)::integer from public.addresses), 0,
  'NOR THE ADDRESS THE JOB IS AT');
select is((select count(*)::integer from public.worker_criminal_record_submissions), 0,
  'AND NO WORKER SEES ANOTHER WORKER''S CRIMINAL RECORD');
reset role; select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- 4. The worker who was hired
-- ---------------------------------------------------------------------------
-- The other half of the proof. If Worker A saw nothing either, the zeros above
-- would only show that the policies deny everyone, which is not isolation — it
-- is a broken product that happens to be safe.

set local role authenticated;
select set_config('request.jwt.claim.sub','e5000000-0000-0000-0000-000000000003',true);
select is((select count(*)::integer from public.bookings), 1,
  'Worker A sees the job they were hired for');
select is((select count(*)::integer from public.messages
           where body = 'The kitchen tap is the one leaking.'), 1,
  'and can read the conversation about it');
select is((select count(*)::integer from public.worker_criminal_record_submissions), 1,
  'and their own vetting file');
-- The worker has notifications of their own about this booking, so the question
-- is not whether they see any, but whether they see the CUSTOMER's.
select ok((select count(*)::integer from public.notifications) >= 1,
  'and their own notification about the new booking');
select is((select count(*)::integer from public.notifications
           where id = 'e5000000-0000-0000-0006-000000000001'), 0,
  'BUT NOT THE CUSTOMER''S — BEING HIRED IS NOT BEING TRUSTED WITH EVERYTHING');
select is((select count(*)::integer from public.support_tickets), 0,
  'nor what the customer told support');
reset role; select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- 5. Signed out
-- ---------------------------------------------------------------------------
-- Written as privileges rather than as row counts, because that is what is
-- actually true here and it is the stronger statement. Unlike `storage.objects`
-- — where `anon` holds a platform SELECT grant that Warsha cannot revoke, so
-- only row security contains it — `anon` holds NO select on any of Warsha's own
-- tables. A signed-out caller does not read zero rows; the read is refused
-- before row security is reached.

select ok(not has_table_privilege('anon', 'public.bookings', 'select'),
  'A SIGNED-OUT CALLER CANNOT READ THE BOOKINGS TABLE AT ALL');
select ok(not has_table_privilege('anon', 'public.messages', 'select'), 'nor messages');
select ok(not has_table_privilege('anon', 'public.notifications', 'select'), 'nor notifications');
select ok(not has_table_privilege('anon', 'public.support_tickets', 'select'), 'nor support tickets');
select ok(not has_table_privilege('anon', 'public.addresses', 'select'), 'nor addresses');
select ok(not has_table_privilege('anon', 'public.worker_criminal_record_submissions', 'select'),
  'and certainly not a worker''s vetting file');

-- ---------------------------------------------------------------------------
-- 6. The public half of the marketplace is still reachable
-- ---------------------------------------------------------------------------
-- Isolation that broke discovery would not be a success, so the boundary is
-- asserted from both sides. A signed-out visitor cannot read `provider_profiles`
-- directly either — discovery goes through SECURITY DEFINER functions that
-- decide what a stranger may see, rather than through a policy on the table.

select ok(not has_table_privilege('anon', 'public.provider_profiles', 'select'),
  'a signed-out visitor cannot read the worker table directly');
select ok(has_function_privilege('anon', 'public.search_providers(text,jsonb,text,integer,integer)', 'execute'),
  'BUT CAN SEARCH, THROUGH A FUNCTION THAT CHOOSES WHAT A STRANGER SEES');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'search_providers'),
  'and that function is SECURITY DEFINER, so the choice is the server''s');

rollback;
