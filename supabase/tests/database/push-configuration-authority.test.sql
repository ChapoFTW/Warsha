-- Turning push on: who may, when, and in which direction.
--
-- ## Why this file exists
--
-- `202609010001` made enabling push representable — it dropped WPS-014's
-- `check (not push_delivery_enabled)` prohibitions and said so in its own
-- comment: "Nothing here turns push on; it makes turning it on possible."
--
-- Nothing then made it possible in practice. No migration, no admin screen and
-- no automation action contained a single `update private.notification_
-- configuration`, so the three switches held the values WPS-014 seeded and
-- `get_my_push_state` answered `provider: disabled` to every caller, forever.
-- That was recorded for a while as a blocked credential — a missing Production
-- staff session. It was not a credential problem. There was no statement in the
-- database capable of changing those values, so no credential could have helped.
--
-- The tests below are therefore written in both directions. A file that only
-- proved refusals would have passed happily against the broken state, because
-- a switch nobody can reach refuses everybody beautifully.
--
-- ## The asymmetry, stated once
--
-- Enabling requires recent re-authentication. Disabling does not. That is
-- deliberate and is asserted twice below, because the obvious "make it
-- symmetric" tidy-up would mean that whoever is trying to stop notifications
-- going out during an incident meets an authentication prompt first.
--
-- Everything here runs inside a transaction that is rolled back, so no
-- environment's configuration is changed by running it.

begin;
select no_plan();

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid::text,
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password',
      'timestamp', floor(extract(epoch from now()))::bigint))
  )::text, true);
end $fn$;

-- The same operator, with an older authentication. WPS-018 moved freshness onto
-- the token itself: `staff_recent_reauth` reads the `amr` timestamp the server
-- can verify, not a row this test could age by hand. So a stale operator is one
-- whose token was minted before the re-authentication window, which is exactly
-- what the console would present after the operator had been idle.
create function pg_temp.act_as_stale(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid::text,
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password',
      'timestamp', floor(extract(epoch from now()))::bigint - 7200))
  )::text, true);
end $fn$;

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','c9000000-0000-4000-8000-000000000001','authenticated','authenticated','push-config-staff@test.local','',now(),'{}','{"display_name":"Configuring operator"}',now(),now()),
('00000000-0000-0000-0000-000000000000','c9000000-0000-4000-8000-000000000002','authenticated','authenticated','push-config-ordinary@test.local','',now(),'{}','{"display_name":"Ordinary customer"}',now(),now());

-- ---------------------------------------------------------------------------
-- 1. The shape of the authority
-- ---------------------------------------------------------------------------

select has_function('public','staff_set_push_configuration',
  array['text','text','boolean','boolean','text'],
  'THE SWITCH EXISTS AT ALL — this is the assertion whose absence was the bug');
select has_function('private','set_push_configuration_core',
  array['uuid','text','text','text','text','boolean','boolean','text'],
  'and the rules live in one core, as they do for feature flags');

select is(has_function_privilege('anon',
  'public.staff_set_push_configuration(text,text,boolean,boolean,text)','EXECUTE'),
  false,'anonymous cannot reach the switch');
select is(has_function_privilege('authenticated',
  'private.set_push_configuration_core(uuid,text,text,text,text,boolean,boolean,text)','EXECUTE'),
  false,'AND NO CLIENT CAN REACH THE CORE, WHICH TAKES THE ACTOR AS AN ARGUMENT');

-- The starting state, so the changes below are changes rather than coincidences.
select is((select push_provider from private.notification_configuration where singleton),
  'disabled','push starts disabled');
select is((select token_registration_enabled from private.notification_configuration where singleton),
  false,'registration starts off');
select is((select push_delivery_enabled from private.notification_configuration where singleton),
  false,'and delivery starts off');

-- ---------------------------------------------------------------------------
-- 2. A signed-in person who is not staff
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000002');

select throws_ok(
  $$select public.staff_set_push_configuration(
      'local','expo',true,false,'An ordinary account must not configure push')$$,
  '42501', NULL,
  'A SIGNED-IN NON-STAFF ACCOUNT CANNOT CONFIGURE PUSH');

reset role;
select is((select push_provider from private.notification_configuration where singleton),
  'disabled','and the refusal left the configuration untouched');

-- ---------------------------------------------------------------------------
-- 3. Staff, but without fresh authentication
-- ---------------------------------------------------------------------------
-- `manage_notification_configuration` is declared `requires_reauth = false`,
-- because it was written for the three policy settings that share it. So
-- `require_staff_capability` lets this operator through, and the refusal below
-- comes from the push authority itself. That is the whole point of putting the
-- requirement on the act rather than on the shared capability row.

select ok(private.bootstrap_staff_role(
  'c9000000-0000-4000-8000-000000000001','super_administrator',
  'First staff identity, because no administrator exists to grant it') is not null,
  'a staff identity exists to do the configuring');

set local role authenticated;
select pg_temp.act_as_stale('c9000000-0000-4000-8000-000000000001');

select throws_ok(
  $$select public.staff_set_push_configuration(
      'local','expo',true,false,'Enabling on a stale authentication')$$,
  '42501', NULL,
  'ENABLING REQUIRES RECENT RE-AUTHENTICATION, EVEN FOR CAPABLE STAFF');

reset role;
select is((select push_provider from private.notification_configuration where singleton),
  'disabled','and that refusal changed nothing either');

-- ---------------------------------------------------------------------------
-- 4. Staff, with a verified session: the safe Phase A shape
-- ---------------------------------------------------------------------------
-- Registration on, delivery off. This is the state that lets a device register
-- and an account-to-device association be proven without one notification
-- reaching one real person.

set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000001');
-- Registers the session so it can be revoked later. Freshness itself comes from
-- the token, so this is the realistic console sequence rather than the thing
-- that makes the next call succeed.
select ok(public.staff_reauthenticate() is not null, 'the operator verifies their session');

select is(
  public.staff_set_push_configuration(
    'local','expo',true,false,'Enable registration for the push proof')->>'tokenRegistrationEnabled',
  'true','REGISTRATION CAN BE ENABLED');
select is(
  (public.staff_set_push_configuration(
    'local','expo',true,false,'Re-assert the proof configuration'))->>'pushDeliveryEnabled',
  'false','AND DELIVERY STAYS OFF WHILE IT IS');

reset role;
select is((select push_provider from private.notification_configuration where singleton),
  'expo','the provider is recorded');
select is((select token_registration_enabled from private.notification_configuration where singleton),
  true,'registration is genuinely on in the table');
select is((select push_delivery_enabled from private.notification_configuration where singleton),
  false,'and delivery is genuinely still off');

-- The registration RPC agrees, which is the point of the exercise.
set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000002');
select is(public.get_my_push_state()->>'provider','expo',
  'A CLIENT NOW SEES A PROVIDER WHERE IT PREVIOUSLY SAW disabled');
select is(public.get_my_push_state()->>'registrationAvailable','true',
  'and registration is available to it');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Environment binding
-- ---------------------------------------------------------------------------
-- The caller states which platform it believes it is configuring. A script
-- pointed at the wrong project fails here instead of succeeding somewhere it
-- was never meant to reach.

set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000001');

select throws_ok(
  $$select public.staff_set_push_configuration(
      'production','expo',true,true,'Configuring a platform this is not')$$,
  '42501', NULL,
  'A CALL AIMED AT ANOTHER ENVIRONMENT IS REFUSED');

select throws_ok(
  $$select public.staff_set_push_configuration(
      'nowhere','expo',true,false,'An environment that does not exist')$$,
  '22023', NULL,
  'and an unknown environment name is refused');

-- ---------------------------------------------------------------------------
-- 6. The states that must stay unreachable
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.staff_set_push_configuration(
      'local','expo',false,true,'Delivery with nothing registered')$$,
  '22023', NULL,
  'DELIVERY WITHOUT REGISTRATION IS REFUSED — it would send to nothing');

select throws_ok(
  $$select public.staff_set_push_configuration(
      'local','disabled',true,false,'Registration with no provider')$$,
  '22023', NULL,
  'and registration without a provider is refused');

select throws_ok(
  $$select public.staff_set_push_configuration(
      'local','carrier-pigeon',true,false,'A provider that does not exist')$$,
  '22023', NULL,
  'an unknown provider is refused');

select throws_ok(
  $$select public.staff_set_push_configuration('local','expo',true,false,'x')$$,
  '22023', NULL,
  'and a change with no real reason is refused');

reset role;
select is((select push_provider from private.notification_configuration where singleton),
  'expo','none of those refusals moved the configuration');
select is((select push_delivery_enabled from private.notification_configuration where singleton),
  false,'and delivery is still off after all of them');

-- ---------------------------------------------------------------------------
-- 7. The scheduler is named, not silently switched off
-- ---------------------------------------------------------------------------

update private.notification_configuration set scheduler_enabled = true where singleton;

set local role authenticated;
select pg_temp.act_as('c9000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_set_push_configuration(
      'local','disabled',false,false,'Remove the provider with the scheduler running')$$,
  '22023', NULL,
  'REMOVING THE PROVIDER SAYS WHICH SWITCH IS IN THE WAY');
reset role;

select is((select scheduler_enabled from private.notification_configuration where singleton),
  true,'and the scheduler was not turned off as a side effect of asking');

update private.notification_configuration set scheduler_enabled = false where singleton;

-- ---------------------------------------------------------------------------
-- 8. Stopping is never harder than starting
-- ---------------------------------------------------------------------------
-- The same operator, two hours past the 900-second re-authentication window.
-- Enabling is refused; disabling must not be. Whoever is stopping notifications
-- at 2am does not get held at an authentication prompt.

set local role authenticated;
select pg_temp.act_as_stale('c9000000-0000-4000-8000-000000000001');

select throws_ok(
  $$select public.staff_set_push_configuration(
      'local','expo',true,true,'Enable delivery on a stale session')$$,
  '42501', NULL,
  'a stale session cannot enable delivery');

select is(
  public.staff_set_push_configuration(
    'local','disabled',false,false,'Stand push down after the proof')->>'provider',
  'disabled','DISABLING IS NOT BLOCKED BY A STALE SESSION');

reset role;
select is((select push_provider from private.notification_configuration where singleton),
  'disabled','push is off again');
select is((select token_registration_enabled from private.notification_configuration where singleton),
  false,'and registration went off with it');

-- ---------------------------------------------------------------------------
-- 9. Every change is on the record
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from private.staff_audit_events
   where action = 'push_configuration_changed'),
  3,'EVERY SUCCESSFUL CHANGE WROTE AN AUDIT ROW, AND EVERY REFUSAL WROTE NONE');

select is(
  (select capability_key from private.staff_audit_events
   where action = 'push_configuration_changed' order by created_at limit 1),
  'manage_notification_configuration','attributed to the capability that allowed it');

select ok(
  (select safe_detail->'from'->>'provider' = 'disabled'
      and safe_detail->'to'->>'provider' = 'expo'
      and (safe_detail->>'enabling')::boolean
   from private.staff_audit_events
   where action = 'push_configuration_changed' order by created_at limit 1),
  'the first row records the before, the after, and that it was an enabling change');

select ok(
  (select not (safe_detail::text ilike '%ExponentPushToken%')
   from private.staff_audit_events
   where action = 'push_configuration_changed' order by created_at desc limit 1),
  'and no audit row carries a device token');

select * from finish();
rollback;
