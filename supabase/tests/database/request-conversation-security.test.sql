-- Who may talk to whom, before there is a job.
--
-- A request is broadcast to many workers. The rule that matters is that
-- broadcasting a request must not hand every recipient a channel to the person
-- who posted it: submitting an offer creates a relationship, and looking at an
-- invitation does not.
--
-- The matrix, all of it asserted below:
--
--   request owner + worker who quoted        may read and may write
--   request owner + worker who only looked   no conversation exists to reach
--   worker A                                 cannot read worker B's thread
--   an unrelated customer                    cannot read either
--   anonymous                                cannot reach any of it
--   after withdrawal or rejection            history readable, writing stops
--   after selection                          the SAME thread becomes the
--                                            booking's thread, with its history

begin;
select plan(30);

select has_function('public', 'open_request_conversation', array['uuid', 'uuid'],
  'a request-scoped conversation can be opened');
select has_function('public', 'send_request_message', array['uuid', 'uuid', 'text', 'uuid'],
  'and written to');
select has_function('public', 'get_request_conversation', array['uuid', 'uuid', 'integer'],
  'and read');

select is(has_function_privilege('anon', 'public.send_request_message(uuid,uuid,text,uuid)', 'execute'), false,
  'ANONYMOUS CALLERS CANNOT SEND A MESSAGE');
select is(has_function_privilege('anon', 'public.get_request_conversation(uuid,uuid,integer)', 'execute'), false,
  'nor read one');
-- The writability predicate is only ever called from inside definer functions.
select is(has_function_privilege('authenticated', 'private.request_chat_accepts_messages(uuid,uuid)', 'execute'), false,
  'and no client can ask the writability predicate directly');

-- ---------------------------------------------------------------------------
-- Fixtures: one customer, two workers, one request, one quote
-- ---------------------------------------------------------------------------

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','98000000-0000-0000-0000-000000000001','authenticated','authenticated','chat-customer@test.local',null,'',now(),null,'{}','{"display_name":"Chat Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','98000000-0000-0000-0000-000000000002','authenticated','authenticated',null,'+201000000801','',null,now(),'{}','{"display_name":"Worker A"}',now(),now()),
('00000000-0000-0000-0000-000000000000','98000000-0000-0000-0000-000000000003','authenticated','authenticated',null,'+201000000802','',null,now(),'{}','{"display_name":"Worker B"}',now(),now()),
('00000000-0000-0000-0000-000000000000','98000000-0000-0000-0000-000000000004','authenticated','authenticated','other-chat-customer@test.local',null,'',now(),null,'{}','{"display_name":"Other Customer"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count,emergency_available)
values
('98000000-0000-0000-0001-000000000002','98000000-0000-0000-0000-000000000002','Worker A','plumbing','plumbing',array['plumbing'],'The worker who submits a quote.','98000000-0000-0000-0000-000000000002/avatar/profile.jpg',true,true,true,'approved',50,10,4.7,8,false),
('98000000-0000-0000-0001-000000000003','98000000-0000-0000-0000-000000000003','Worker B','plumbing','plumbing',array['plumbing'],'The worker who only looks at the invitation.','98000000-0000-0000-0000-000000000003/avatar/profile.jpg',true,true,true,'approved',50,10,4.7,8,false);

insert into public.marketplace_requests(id,customer_id,flow_kind,status,category_id,issue_description,schedule_kind,
  payment_compatibility,approximate_governorate,coarse_area_id,created_at,edit_deadline_at,collection_not_before,expires_at,idempotency_key)
values ('98000000-0000-0000-0002-000000000001','98000000-0000-0000-0000-000000000001','get_quotes','collecting_quotes',
  'plumbing','A tap that will not stop running at all.','asap','either','Cairo','cairo-zamalek',
  now() - interval '2 minutes', now() + interval '1 hour', now() - interval '1 minute', now() + interval '2 days',
  'request-chat-fixture-000001');

insert into private.marketplace_matching_runs(id,request_id,request_revision,reason,policy_version,
  configuration_snapshot,wave_number,search_radius_km,status,idempotency_key)
values ('98000000-0000-0000-0004-000000000001','98000000-0000-0000-0002-000000000001',1,'initial',1,'{}'::jsonb,1,50,'completed','request-chat-run-000001');

insert into public.quote_invitations(id,request_id,provider_id,matching_run_id,request_revision,wave_number,status,expires_at)
values
('98000000-0000-0000-0003-000000000002','98000000-0000-0000-0002-000000000001','98000000-0000-0000-0001-000000000002','98000000-0000-0000-0004-000000000001',1,1,'quoted',now() + interval '2 days'),
-- Worker B is invited and never quotes. This is the row that proves an
-- invitation is not a relationship.
('98000000-0000-0000-0003-000000000003','98000000-0000-0000-0002-000000000001','98000000-0000-0000-0001-000000000003','98000000-0000-0000-0004-000000000001',1,1,'viewed',now() + interval '2 days');

insert into public.worker_quotes(id,request_id,invitation_id,provider_id,status,price_minor,
  estimated_duration_minutes,labor_included,materials_inclusion,supported_payment_methods,expires_at,idempotency_key)
values ('98000000-0000-0000-0005-000000000001','98000000-0000-0000-0002-000000000001','98000000-0000-0000-0003-000000000002',
  '98000000-0000-0000-0001-000000000002','submitted',25000,60,true,'excluded',array['cash','online'],
  now() + interval '2 days','request-chat-quote-000001');

-- ---------------------------------------------------------------------------
-- The worker who quoted, and the customer
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select public.send_request_message('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000002'::uuid,'Which floor is the flat on?','98000000-0000-0000-0006-000000000001'::uuid)$$,
  'A WORKER WHO HAS QUOTED MAY MESSAGE THE CUSTOMER');
-- Idempotency: the same client id is the same message, however many times a
-- flaky connection replays it.
select lives_ok(
  $$select public.send_request_message('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000002'::uuid,'Which floor is the flat on?','98000000-0000-0000-0006-000000000001'::uuid)$$,
  'and sending it again with the same client id is accepted');
reset role;
select set_config('request.jwt.claim.sub','',true);

select is((select count(*)::integer from public.messages where request_id='98000000-0000-0000-0002-000000000001'), 1,
  'A RETRY WRITES ONE MESSAGE, NOT TWO');
select is((select count(*)::integer from public.conversations where request_id='98000000-0000-0000-0002-000000000001'), 1,
  'and one conversation, not two');

set local role authenticated;
select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000001',true);
select is(
  (select pg_catalog.jsonb_array_length(public.get_request_conversation('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000002'::uuid) -> 'messages')),
  1,
  'THE CUSTOMER READS THE MESSAGE THE WORKER SENT');
select ok(
  (select (public.get_request_conversation('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000002'::uuid) ->> 'canSend')::boolean),
  'and may reply while the offer is live');
select lives_ok(
  $$select public.send_request_message('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000002'::uuid,'Third floor, no lift.','98000000-0000-0000-0006-000000000002'::uuid)$$,
  'the customer may reply');
-- Row security, not just the RPC: reading the table directly must be limited too.
select is((select count(*)::integer from public.messages), 2,
  'AND SEES BOTH MESSAGES THROUGH ROW SECURITY, NOT ONLY THROUGH THE RPC');
reset role;
select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- Everybody else
-- ---------------------------------------------------------------------------

-- Worker B was invited to the same request and never quoted.
set local role authenticated;
select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.send_request_message('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000003'::uuid,'Hello','98000000-0000-0000-0006-000000000003'::uuid)$$,
  'PT404','Conversation not found',
  'A WORKER WHO ONLY VIEWED THE REQUEST CANNOT CONTACT THE CUSTOMER');
select throws_ok(
  $$select public.open_request_conversation('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000003'::uuid)$$,
  'PT404','Conversation not found',
  'and cannot open one either');
-- Pointing at worker A's provider id is the obvious attack.
select throws_ok(
  $$select public.get_request_conversation('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000002'::uuid)$$,
  'PT404','Conversation not found',
  'WORKER B CANNOT READ WORKER A''S CONVERSATION');
select is((select count(*)::integer from public.messages), 0,
  'and row security shows them nothing at all');
reset role;
select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000004',true);
select throws_ok(
  $$select public.get_request_conversation('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000002'::uuid)$$,
  'PT404','Conversation not found',
  'AN UNRELATED CUSTOMER CANNOT READ IT');
select is((select count(*)::integer from public.messages), 0,
  'and sees no rows');
reset role;
select set_config('request.jwt.claim.sub','',true);

set local role anon;
select throws_ok(
  $$select public.get_request_conversation('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000002'::uuid)$$,
  '42501', null,
  'ANONYMOUS CALLERS ARE REFUSED BY THE PRIVILEGE SYSTEM BEFORE THE FUNCTION RUNS');
-- Not "reads zero rows" -- `anon` holds no SELECT grant on `messages` at all,
-- so the refusal comes from the privilege system before row security is
-- consulted. That is the stronger of the two statements and the one worth
-- pinning.
select is(has_table_privilege('anon', 'public.messages', 'select'), false,
  'AND HOLD NO READ PRIVILEGE ON THE MESSAGE TABLE IN THE FIRST PLACE');
reset role;

-- ---------------------------------------------------------------------------
-- Withdrawal: history survives, writing stops
-- ---------------------------------------------------------------------------

update public.worker_quotes set status = 'withdrawn', withdrawn_at = now()
where id = '98000000-0000-0000-0005-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000001',true);
select is(
  (select pg_catalog.jsonb_array_length(public.get_request_conversation('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000002'::uuid) -> 'messages')),
  2,
  'AFTER A WITHDRAWAL THE HISTORY IS STILL READABLE TO BOTH PARTIES');
select is(
  (select (public.get_request_conversation('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000002'::uuid) ->> 'canSend')::boolean),
  false,
  'and the client is told the thread is closed rather than discovering it on send');
select throws_ok(
  $$select public.send_request_message('98000000-0000-0000-0002-000000000001'::uuid,'98000000-0000-0000-0001-000000000002'::uuid,'Are you still there?','98000000-0000-0000-0006-000000000004'::uuid)$$,
  'WM001','request_conversation_closed',
  'NEW MESSAGES STOP WHEN THERE IS NO LONGER AN ACTIONABLE RELATIONSHIP');
reset role;
select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- Selection: one thread, carried into the booking
-- ---------------------------------------------------------------------------

update public.worker_quotes set status = 'selected', selected_at = now()
where id = '98000000-0000-0000-0005-000000000001';

insert into public.addresses(id,customer_id,label,address_line,governorate,district)
values ('98000000-0000-0000-0007-000000000001','98000000-0000-0000-0000-000000000001','Home','1 A Street','Cairo','Zamalek');

select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000001',true);
insert into public.bookings(id,customer_id,provider_id,service_id,service_name_snapshot,pricing_type,
  estimated_price_egp,issue_description,scheduled_date,scheduled_time,address_snapshot,idempotency_key,status)
values ('98000000-0000-0000-0008-000000000001','98000000-0000-0000-0000-000000000001','98000000-0000-0000-0001-000000000002',
  (select id from public.services where category_id='plumbing' and is_active and deleted_at is null order by id limit 1),
  'Tap repair','quote',200,'A tap that will not stop running at all.',(now() + interval '1 day')::date,'10:00',
  '{"governorate":"Cairo","district":"Zamalek"}'::jsonb,'request-chat-booking-0001','pending_provider_approval');
select set_config('request.jwt.claim.sub','',true);

-- The promotion trigger fires on this update, not on the booking insert, so it
-- covers every path that converts a request rather than only the one that
-- exists today.
update public.marketplace_requests
set selected_quote_id = '98000000-0000-0000-0005-000000000001',
    converted_booking_id = '98000000-0000-0000-0008-000000000001',
    status = 'converted_to_booking'
where id = '98000000-0000-0000-0002-000000000001';

select is(
  (select booking_id from public.conversations where request_id = '98000000-0000-0000-0002-000000000001'),
  '98000000-0000-0000-0008-000000000001'::uuid,
  'THE SAME CONVERSATION BECOMES THE BOOKING''S CONVERSATION');
select is(
  (select count(*)::integer from public.conversations
   where booking_id = '98000000-0000-0000-0008-000000000001'),
  1,
  'and there is exactly one thread, not a second one alongside it');
select is(
  (select count(*)::integer from public.messages
   where booking_id = '98000000-0000-0000-0008-000000000001'),
  2,
  'WITH THE MESSAGES THEY EXCHANGED BEFORE THE BOOKING EXISTED');

-- And the existing booking-chat authority, untouched by this migration, now
-- recognises the promoted thread.
set local role authenticated;
select set_config('request.jwt.claim.sub','98000000-0000-0000-0000-000000000002',true);
select ok(
  private.is_booking_chat_participant('98000000-0000-0000-0008-000000000001'::uuid),
  'the booking-chat participant check accepts the worker on the promoted thread');
select is((select count(*)::integer from public.messages
           where booking_id = '98000000-0000-0000-0008-000000000001'), 2,
  'AND THE BOOKING-SCOPED ROW SECURITY READS THE EARLIER HISTORY');
reset role;
select set_config('request.jwt.claim.sub','',true);

rollback;
