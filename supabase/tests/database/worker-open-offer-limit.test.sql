-- The worker open-offer limit.
--
-- The rule: a worker may hold at most N quotes that a customer could still
-- choose. N is `app_settings.marketplace.worker_open_offer_limit`, initially 10.
--
-- What this file is actually protecting is not the number -- that is one row --
-- but the DEFINITION of "open". Every state transition in the marketplace either
-- frees a slot or does not, and getting one of them wrong is invisible until a
-- worker is either wrongly blocked or quietly unlimited. So each transition gets
-- its own assertion, by name, rather than a single "the count works" test.
--
-- The limit is temporarily lowered to 3 for most of this file. Setting up ten
-- live requests to prove a boundary that behaves identically at three is slower
-- to run and harder to read; the boundary is `>=`, and `>=` does not care what
-- it is comparing against. The configured value of 10 is asserted separately,
-- against `app_settings`, which is where it actually lives.

begin;
select plan(29);

-- ---------------------------------------------------------------------------
-- The policy is where it is supposed to be
-- ---------------------------------------------------------------------------

select has_function('public', 'get_worker_open_offer_capacity', array[]::text[],
  'a worker can ask for their own capacity');
select has_function('private', 'worker_open_offer_count', array['uuid'],
  'and the count has one definition');

select is(
  (select (value #>> '{}')::integer from public.app_settings
   where key = 'marketplace.worker_open_offer_limit'),
  10,
  'THE CONFIGURED LIMIT IS 10, AND IT LIVES IN app_settings RATHER THAN IN A CLIENT');

-- No client may reach the counter directly. A function that takes a provider id
-- is a function that can be asked about a competitor.
select is(has_function_privilege('authenticated', 'private.worker_open_offer_count(uuid)', 'execute'), false,
  'NO CLIENT CAN COUNT ANOTHER WORKER''S OPEN OFFERS');
select is(has_function_privilege('anon', 'public.get_worker_open_offer_capacity()', 'execute'), false,
  'and a signed-out caller cannot ask about capacity at all');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- One customer, two workers. The second exists solely to prove that one
-- worker's offers do not consume another's capacity, which is the failure mode
-- a naive global counter would produce.

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','96000000-0000-0000-0000-000000000001','authenticated','authenticated','offer-customer@test.local',null,'',now(),null,'{}','{"display_name":"Offer Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','96000000-0000-0000-0000-000000000002','authenticated','authenticated',null,'+201000000902','',null,now(),'{}','{"display_name":"Offer Worker"}',now(),now()),
('00000000-0000-0000-0000-000000000000','96000000-0000-0000-0000-000000000003','authenticated','authenticated',null,'+201000000903','',null,now(),'{}','{"display_name":"Other Worker"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count,emergency_available)
values
('96000000-0000-0000-0001-000000000002','96000000-0000-0000-0000-000000000002','Offer Worker','plumbing','plumbing',array['plumbing'],'Marketplace worker used for offer-capacity tests.','96000000-0000-0000-0000-000000000002/avatar/profile.jpg',true,true,true,'approved',50,10,4.7,8,false),
('96000000-0000-0000-0001-000000000003','96000000-0000-0000-0000-000000000003','Other Worker','plumbing','plumbing',array['plumbing'],'Second marketplace worker for isolation tests.','96000000-0000-0000-0000-000000000003/avatar/profile.jpg',true,true,true,'approved',50,10,4.7,8,false);

insert into public.user_roles(user_id,role) values
('96000000-0000-0000-0000-000000000002','provider'),
('96000000-0000-0000-0000-000000000003','provider') on conflict do nothing;
insert into public.provider_verifications(provider_id,status,revision,reviewed_at) values
('96000000-0000-0000-0001-000000000002','approved',1,now()),
('96000000-0000-0000-0001-000000000003','approved',1,now());
insert into storage.objects(bucket_id,name) values
('profile-images','96000000-0000-0000-0000-000000000002/avatar/profile.jpg'),
('profile-images','96000000-0000-0000-0000-000000000003/avatar/profile.jpg');

-- `private.is_provider_publicly_discoverable` is a precondition of submitting a
-- quote at all, and it requires at least one active listed service. Without it
-- every submission below fails on eligibility and the capacity assertions would
-- pass for entirely the wrong reason.
select set_config('warsha_test.service_id',
  (select id::text from public.services
   where category_id = 'plumbing' and is_active and deleted_at is null order by id limit 1), true);
insert into public.provider_services(provider_id, service_id, custom_price_egp, pricing_type,
  transportation_fee_egp, emergency_surcharge_egp, is_active)
values
('96000000-0000-0000-0001-000000000002', (current_setting('warsha_test.service_id'))::uuid, 200, 'quote', 25, 50, true),
('96000000-0000-0000-0001-000000000003', (current_setting('warsha_test.service_id'))::uuid, 220, 'quote', 25, 50, true);
insert into public.provider_service_areas(provider_id, governorate, district, radius_km) values
('96000000-0000-0000-0001-000000000002','Cairo','Zamalek',50),
('96000000-0000-0000-0001-000000000003','Cairo','Zamalek',50);

-- Twelve live requests, each with an invitation for the first worker. Built as
-- a loop rather than twelve inserts so the boundary can move without the
-- fixture having to be rewritten.
do $fixture$
declare i integer; request_id uuid; run_id uuid;
begin
  for i in 1..12 loop
    request_id := ('96000000-0000-0000-0002-0000000000' || lpad(i::text, 2, '0'))::uuid;
    -- `created_at` is set explicitly rather than defaulted. The table's own
    -- check requires `collection_not_before >= created_at`, and the collection
    -- window has to be in the past for these requests to be quotable, so a
    -- defaulted `now()` would fail the constraint rather than the test.
    insert into public.marketplace_requests(
      id, customer_id, flow_kind, status, category_id, issue_description, schedule_kind,
      payment_compatibility, approximate_governorate, coarse_area_id,
      created_at, edit_deadline_at, collection_not_before, expires_at, idempotency_key)
    values (
      request_id, '96000000-0000-0000-0000-000000000001', 'get_quotes', 'collecting_quotes',
      'plumbing', 'Offer capacity fixture request number ' || i, 'asap',
      'either', 'Cairo', 'cairo-zamalek',
      now() - interval '2 minutes', now() + interval '5 minutes',
      now() - interval '1 minute', now() + interval '30 minutes',
      'offer-capacity-request-' || i);

    -- A matching run is a required parent of an invitation. The columns are
    -- filled with the smallest values that satisfy the table's own checks; this
    -- fixture is not exercising matching, only the invitation it produces.
    insert into private.marketplace_matching_runs(
      request_id, request_revision, reason, policy_version, configuration_snapshot,
      wave_number, search_radius_km, status, idempotency_key)
    values (
      request_id, 1, 'initial', 1, '{}'::jsonb, 1, 50, 'completed',
      'offer-capacity-run-' || i)
    returning id into run_id;

    insert into public.quote_invitations(id, request_id, provider_id, matching_run_id,
      request_revision, wave_number, status, expires_at)
    values (
      ('96000000-0000-0000-0003-0000000000' || lpad(i::text, 2, '0'))::uuid,
      request_id, '96000000-0000-0000-0001-000000000002', run_id, 1, 1, 'invited',
      now() + interval '30 minutes');

    -- The second worker is invited to the first request only, so its quote can
    -- be shown not to consume the first worker's capacity.
    if i = 1 then
      insert into public.quote_invitations(id, request_id, provider_id, matching_run_id,
        request_revision, wave_number, status, expires_at)
      values (
        '96000000-0000-0000-0003-0000000000ff'::uuid,
        request_id, '96000000-0000-0000-0001-000000000003', run_id, 1, 1, 'invited',
        now() + interval '30 minutes');
    end if;
  end loop;
end
$fixture$;

-- A quote the RPC will accept. Payment compatibility is 'either', so both
-- methods are valid.
select set_config('warsha_test.quote',
  '{"priceMinor":25000,"estimatedDurationMinutes":60,"message":"","laborIncluded":true,"materialsInclusion":"excluded","materialsExplanation":"","supportedPaymentMethods":["cash","online"]}',
  true);

-- Three, for legibility. See the note at the top.
update public.app_settings set value = '3'::jsonb where key = 'marketplace.worker_open_offer_limit';
select is(private.worker_open_offer_limit(), 3, 'the limit follows the setting rather than a constant');

-- ---------------------------------------------------------------------------
-- The boundary
-- ---------------------------------------------------------------------------

select is(private.worker_open_offer_count('96000000-0000-0000-0001-000000000002'::uuid), 0,
  'a worker with no quotes has used none of their capacity');

set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000002',true);

select lives_ok(
  $$select public.submit_worker_quote('96000000-0000-0000-0003-000000000001'::uuid, current_setting('warsha_test.quote')::jsonb, 'offer-capacity-key-000001')$$,
  '0 of 3: the first offer is accepted');
select lives_ok(
  $$select public.submit_worker_quote('96000000-0000-0000-0003-000000000002'::uuid, current_setting('warsha_test.quote')::jsonb, 'offer-capacity-key-000002')$$,
  '1 of 3: accepted');
select lives_ok(
  $$select public.submit_worker_quote('96000000-0000-0000-0003-000000000003'::uuid, current_setting('warsha_test.quote')::jsonb, 'offer-capacity-key-000003')$$,
  '2 of 3 -- the last one that fits -- is accepted');

select is(
  (select (public.get_worker_open_offer_capacity() ->> 'remaining')::integer),
  0,
  'and the worker is told they have no room left');

select throws_ok(
  $$select public.submit_worker_quote('96000000-0000-0000-0003-000000000004'::uuid, current_setting('warsha_test.quote')::jsonb, 'offer-capacity-key-000004')$$,
  'WQ001',
  'worker_open_offer_limit_reached',
  'AT CAPACITY THE NEXT OFFER IS REFUSED, WITH A STABLE DOMAIN CODE');

-- The counter is a `private` helper and `authenticated` cannot execute it --
-- which is the point of it being private -- so every direct assertion on the
-- count drops back to the test's own role first.
reset role;
select set_config('request.jwt.claim.sub','',true);

-- The refusal must not leave a partial quote behind.
select is(private.worker_open_offer_count('96000000-0000-0000-0001-000000000002'::uuid), 3,
  'a refused submission writes nothing');

set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000002',true);

-- ---------------------------------------------------------------------------
-- Every way a slot is freed
-- ---------------------------------------------------------------------------

-- 1. The worker withdraws.
select lives_ok(
  $$select public.withdraw_worker_quote(
      (select id from public.worker_quotes where idempotency_key='offer-capacity-key-000001'),
      'changed_mind', 'offer-capacity-withdraw-0001')$$,
  'a worker may withdraw an open offer');
reset role;
select set_config('request.jwt.claim.sub','',true);
select is(private.worker_open_offer_count('96000000-0000-0000-0001-000000000002'::uuid), 2,
  'WITHDRAWING RELEASES THE SLOT');
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select public.submit_worker_quote('96000000-0000-0000-0003-000000000004'::uuid, current_setting('warsha_test.quote')::jsonb, 'offer-capacity-key-000005')$$,
  'and the worker can bid again immediately');

reset role;
select set_config('request.jwt.claim.sub','',true);

-- 2. The customer cancels the request. `cancel_marketplace_request` rewrites the
--    worker's quote to 'invalidated_by_request_change', which is what makes this
--    visible to the worker's own realtime channel as well as to the counter.
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select public.cancel_marketplace_request('96000000-0000-0000-0002-000000000002'::uuid, 'plans_changed', 'offer-capacity-cancel-0001')$$,
  'a customer may cancel a request that has an open quote on it');
reset role;
select set_config('request.jwt.claim.sub','',true);

select is(private.worker_open_offer_count('96000000-0000-0000-0001-000000000002'::uuid), 2,
  'A CANCELLED REQUEST STOPS CONSUMING THE WORKER''S CAPACITY');

-- 3. The quote is rejected outright.
update public.worker_quotes set status = 'rejected'
where idempotency_key = 'offer-capacity-key-000003';
select is(private.worker_open_offer_count('96000000-0000-0000-0001-000000000002'::uuid), 1,
  'a rejected quote releases its slot');

-- 4. The worker won. A selected quote is not an open offer -- see the migration
--    for why this is the one judgement call in the definition.
update public.worker_quotes set status = 'selected', selected_at = now()
where idempotency_key = 'offer-capacity-key-000005';
select is(private.worker_open_offer_count('96000000-0000-0000-0001-000000000002'::uuid), 0,
  'AND WINNING RELEASES IT TOO -- CAPACITY LIMITS BIDDING, NOT SUCCESS');

-- 5. Expiry, of the quote and of the request, are separate conditions and both
--    have to end the count.
update public.worker_quotes set status = 'submitted', expires_at = now() - interval '1 minute'
where idempotency_key = 'offer-capacity-key-000005';
select is(private.worker_open_offer_count('96000000-0000-0000-0001-000000000002'::uuid), 0,
  'an expired quote does not consume capacity even while its status says submitted');

update public.worker_quotes set expires_at = now() + interval '30 minutes'
where idempotency_key = 'offer-capacity-key-000005';
update public.marketplace_requests set expires_at = now() - interval '1 minute'
where id = (select request_id from public.worker_quotes where idempotency_key = 'offer-capacity-key-000005');
select is(private.worker_open_offer_count('96000000-0000-0000-0001-000000000002'::uuid), 0,
  'nor does a live quote on a request that has expired');

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000003',true);
select lives_ok(
  $$select public.submit_worker_quote('96000000-0000-0000-0003-0000000000ff'::uuid, current_setting('warsha_test.quote')::jsonb, 'offer-capacity-other-00001')$$,
  'a second worker may quote regardless of the first worker''s history');
reset role;
select set_config('request.jwt.claim.sub','',true);

select is(private.worker_open_offer_count('96000000-0000-0000-0001-000000000003'::uuid), 1,
  'the second worker has one open offer');
select is(private.worker_open_offer_count('96000000-0000-0000-0001-000000000002'::uuid), 0,
  'ONE WORKER''S OFFERS DO NOT CONSUME ANOTHER''S CAPACITY');

-- ---------------------------------------------------------------------------
-- Who may submit at all
-- ---------------------------------------------------------------------------
-- Capacity is not the authorization boundary and must never become one. A
-- customer has infinite unused capacity and still cannot quote.

set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.submit_worker_quote('96000000-0000-0000-0003-000000000006'::uuid, current_setting('warsha_test.quote')::jsonb, 'offer-capacity-customer-001')$$,
  'PT404',
  'Invitation not found',
  'A CUSTOMER CANNOT SUBMIT A WORKER QUOTE, HOWEVER MUCH CAPACITY THEY HAVE');
select is(
  (select public.get_worker_open_offer_capacity() ->> 'applies'),
  'false',
  'and capacity simply does not apply to an account with no provider profile');
reset role;
select set_config('request.jwt.claim.sub','',true);

-- A worker whose profile is not publicly discoverable is refused before the
-- limit is ever consulted: the order of the checks in `submit_worker_quote` is
-- itself a contract.
update public.provider_profiles set is_published = false
where id = '96000000-0000-0000-0001-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000002',true);
select throws_ok(
  $$select public.submit_worker_quote('96000000-0000-0000-0003-000000000006'::uuid, current_setting('warsha_test.quote')::jsonb, 'offer-capacity-unpub-00001')$$,
  '22023',
  'Invitation is no longer actionable',
  'AN UNPUBLISHED WORKER IS REFUSED ON ELIGIBILITY, NOT ON CAPACITY');
reset role;
select set_config('request.jwt.claim.sub','',true);

-- ---------------------------------------------------------------------------
-- Concurrency
-- ---------------------------------------------------------------------------
-- pgTAP runs one session, so the interleaving that would produce an eleventh
-- offer cannot be staged here. What CAN be asserted here is that the guard
-- exists and is transaction-scoped; the two-session race is exercised by
-- `scripts/worker-offer-limit-race.mjs`, which opens real connections and is
-- the only honest way to test it.

select ok(
  (select prosrc like '%pg_advisory_xact_lock%'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_worker_quote'),
  'THE COUNT AND THE INSERT ARE SERIALISED PER WORKER BY A TRANSACTION-SCOPED LOCK');

rollback;
