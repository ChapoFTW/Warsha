-- How many authorised humans a governed action needs, and who decides.
--
-- ## The policy this file now describes
--
-- ONE AUTHORISED OPERATOR MAY OPERATE WARSHA. A second staff identity is not a
-- Warsha requirement. That is the owner's decision, made deliberately in
-- 202609060010, and it removes a HUMAN-COUNT dependency and nothing else.
--
-- So the assertions come in two halves, and both halves matter:
--
--   ONE OPERATOR IS ENOUGH. A single authenticated, capable, recently
--   re-authenticated staff identity completes an action that used to demand a
--   second person, in a public environment, and the audit row says so honestly
--   — one approver, no second name, mode `single_operator`.
--
--   EVERYTHING ELSE STILL REFUSES. Capability, `aal2`, recent authentication,
--   revocation, environment and a reason are untouched. Removing the count did
--   not remove the controls that were doing the work.
--
-- ## Dual control is not deleted
--
-- The last section flips one capability back to `dual_control` inside the
-- transaction and proves the two-identity path still works exactly as it did.
-- That is the difference between "Warsha no longer requires two people" and
-- "Warsha can no longer count to two", and only the first is intended.
--
-- ## Why environment no longer appears in the policy
--
-- It used to answer "two unless you are development", which is the wrong axis:
-- how many people an action needs is a property of the ACTION, not of which
-- project it happens to run against. The capability catalogue is the authority
-- now, and this file proves the environment-keyed helpers derive from it rather
-- than disagreeing with it.

begin;
select no_plan();

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid::text,
    'role', 'authenticated',
    'aal', 'aal1',
    'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password',
      'timestamp', floor(extract(epoch from now()))::bigint))
  )::text, true);
end $fn$;

-- The same operator, described to the server differently: a chosen assurance
-- level and a chosen age. Used by the refusal sections.
create function pg_temp.act_as_with(p_uid uuid, p_aal text, p_age_seconds integer)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid::text,
    'role', 'authenticated',
    'aal', p_aal,
    'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password',
      'timestamp', floor(extract(epoch from now()))::bigint - p_age_seconds))
  )::text, true);
end $fn$;

-- ---------------------------------------------------------------------------
-- 1. ONE AUTHORITY, AND IT IS THE CAPABILITY
-- ---------------------------------------------------------------------------

select has_function('private', 'approval_policy_for', array['text'],
  'the approval policy is one function');
select has_column('public', 'staff_capabilities', 'approval_policy',
  'and it reads a column on the capability itself');

select is(private.approval_policy_for('manage_subprocessors'), 'single_operator',
  'ACTIVATING A SUBPROCESSOR NEEDS ONE AUTHORISED OPERATOR');
select is(private.approval_policy_for('publish_legal_version'), 'single_operator',
  'so does publishing a legal version');
select is(private.approval_policy_for('manage_staff_roles'), 'single_operator',
  'so does staff role administration');
select is(private.approval_policy_for('initiate_refund'), 'single_operator',
  'and so does a refund — Warsha adds no second-human requirement of its own');

select is(
  (select count(*)::integer from public.staff_capabilities
   where approval_policy = 'dual_control'),
  0,
  'NO CAPABILITY REQUIRES A SECOND HUMAN TODAY');

select is(
  (select count(*)::integer from public.staff_capabilities
   where approval_policy not in ('single_operator', 'dual_control')),
  0,
  'and the column admits no third answer');

-- ---------------------------------------------------------------------------
-- 2. THE OLD BOOLEAN CANNOT CONTRADICT THE NEW AUTHORITY
-- ---------------------------------------------------------------------------
-- Twenty-one functions still read `dual_control` by name. It survives as a
-- GENERATED column so that reading it and reading the policy can never give
-- different answers, which is exactly the contradiction 202609060010 removed.

select has_trigger('public', 'staff_capabilities', 'staff_capabilities_derive_approval',
  'a trigger derives dual_control from approval_policy');

-- Writing the old boolean does not raise; it is simply overwritten with the
-- derived value. Asserting the OUTCOME rather than an error is the honest test:
-- what matters is that the write cannot take effect, not how it fails.
update public.staff_capabilities set dual_control = true
where capability_key = 'manage_subprocessors';
select is(
  (select dual_control from public.staff_capabilities
   where capability_key = 'manage_subprocessors'),
  false,
  'WRITING dual_control DIRECTLY HAS NO EFFECT — approval_policy is the authority');

select is(
  (select count(*)::integer from public.staff_capabilities
   where dual_control <> (approval_policy = 'dual_control')),
  0,
  'so no row can disagree with itself');

select is(
  (select count(*)::integer from public.staff_capabilities
   where dual_control <> (approval_policy = 'dual_control')),
  0,
  'so every row agrees with itself, by construction');

-- The environment-keyed helpers are kept for audit labelling. They summarise
-- the catalogue, and they are exact while the catalogue is uniform — which the
-- assertion above establishes. If a future capability opts into dual control
-- while others do not, THIS assertion fails, and a failing test is the correct
-- outcome: it means a label could otherwise mis-describe an authorisation.
select is(private.required_approval_count('production', null), 1,
  'the summary helper reports one approver, matching every capability');
select is(private.required_approval_count('development', null), 1,
  'and gives the same answer in development — environment no longer decides');
select is(private.governance_mode('production', null), 'single_operator',
  'and names the policy the same way everywhere');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a2900000-0000-4000-8000-000000000001','authenticated','authenticated','policy-first@test.local','',now(),'{}','{"display_name":"The operator"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2900000-0000-4000-8000-000000000002','authenticated','authenticated','policy-second@test.local','',now(),'{}','{"display_name":"Second administrator"}',now(),now());

select ok(private.bootstrap_staff_role(
  'a2900000-0000-4000-8000-000000000001','security_administrator',
  'The first and only staff identity') is not null,
  'the operator is authorized');

-- The second identity is a FIXTURE for the dual-control section at the end.
-- Bootstrap closes after the first identity now, so it is written directly
-- rather than pretending to be a bootstrap.
insert into public.staff_role_grants(user_id, role_key, reason, idempotency_key)
values ('a2900000-0000-4000-8000-000000000002','super_administrator',
        'Fixture: a second identity for the dual-control section',
        'fixture:governance-policy:second');

-- A public environment for the whole file, because the point is that a public
-- environment no longer implies a second person. Written directly:
-- `staff_bind_platform_environment` is a one-way exit from local, not a fixture
-- tool, and this is a test-owner write inside a rollback.
update private.staff_platform_configuration
set environment = 'staging',
    expected_project_ref = 'policyfixtureprojectref'
where singleton;
select is(private.platform_environment(), 'staging',
  'the fixture runs in a public environment');

-- Provider prerequisites, pinned rather than assumed.
update private.external_providers set current_status = 'configured_not_enabled'
where provider_key in ('google_cloud_vision', 'google_maps_platform');
update private.subprocessors set integration_status = 'approved_not_integrated'
where subprocessor_key in ('google_cloud_vision', 'google_maps_platform');
update private.staff_feature_flags set enabled = false
where flag_key in ('identity_extraction', 'location_provider') and environment = 'staging';
update private.staff_kill_switches set active = false
where switch_key in ('identity_extraction', 'location_provider');

-- ---------------------------------------------------------------------------
-- 3. ONE OPERATOR COMPLETES A FORMERLY DUAL-CONTROLLED ACTION
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000001');

select is((public.staff_activate_external_provider(
  'google_cloud_vision','staging',
  'Activate the registry entry under single-operator governance'))->>'governanceMode',
  'single_operator',
  'A SINGLE OPERATOR ACTIVATES A PROVIDER IN A PUBLIC ENVIRONMENT');
reset role;

select is((select current_status from private.external_providers
           where provider_key = 'google_cloud_vision'), 'active',
  'and the provider really is active');

-- ---------------------------------------------------------------------------
-- 4. THE RECORD DOES NOT PRETEND A SECOND PERSON EXISTED
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from private.staff_audit_events
   where action = 'single_operator_authorisation_consumed'
     and safe_detail->>'governanceMode' = 'single_operator'
     and safe_detail->>'requiredApprovals' = '1'
     and safe_detail->>'approverCount' = '1'
     and safe_detail->>'secondApprover' is null),
  1,
  'THE AUDIT ROW SAYS ONE OPERATOR AUTHORISED IT, AND NAMES NO SECOND APPROVER');

select is(
  (select count(*)::integer from private.staff_dual_control_requests
   where subject_ref = 'google_cloud_vision:staging'
     and governance_mode = 'single_operator'
     and required_approvals = 1
     and approved_by is null
     and consumed_at is not null),
  1,
  'and the authorisation record carries no approver, because nobody seconded it');

select is(
  (select count(*)::integer from private.staff_dual_control_requests
   where governance_mode = 'single_operator' and approved_by is not null),
  0,
  'A SINGLE-OPERATOR RECORD CAN NEVER CARRY A SECOND NAME');

-- Two independent guards stop a second name being added afterwards, and the
-- immutability trigger gets there first because the row is already consumed.
-- Asserting the code it actually raises rather than the one I expected: a test
-- that names the wrong guard passes for the wrong reason the day the other one
-- is removed.
select throws_ok(
  $$update private.staff_dual_control_requests
    set approved_by = 'a2900000-0000-4000-8000-000000000002', approved_at = now()
    where subject_ref = 'google_cloud_vision:staging'$$,
  '55000', 'Dual control history is immutable',
  'and a consumed authorisation refuses to have one added afterwards');

-- The second guard, asserted on its own so it is not hidden behind the first:
-- even an UNCONSUMED single-operator row cannot carry an approver.
select throws_ok(
  $$insert into private.staff_dual_control_requests(
      capability_key, action_key, subject_ref, requested_by, requested_reason,
      expires_at, environment, governance_mode, required_approvals,
      approved_by, approved_at)
    values ('manage_subprocessors','forged','forged:staging',
      'a2900000-0000-4000-8000-000000000001','A forged single-operator approval',
      now() + interval '1 hour', 'staging', 'single_operator', 1,
      'a2900000-0000-4000-8000-000000000002', now())$$,
  '23514', NULL,
  'AND A SINGLE-OPERATOR ROW CANNOT BE CREATED WITH AN APPROVER AT ALL');

-- Deleting the record is refused whatever policy produced it. Asserted here
-- rather than where a refusal might have left the table empty: a DELETE that
-- matches no rows fires no trigger and proves nothing.
select throws_ok(
  $$delete from private.staff_dual_control_requests$$,
  '55000', 'Dual control history is immutable',
  'AND THE AUTHORISATION RECORD CANNOT BE DELETED');

select is(
  (select count(*)::integer from private.staff_audit_events
   where action = 'external_provider_activated'
     and safe_detail->>'providerKey' = 'google_cloud_vision'
     and safe_detail->>'governanceMode' = 'single_operator'
     and safe_detail->>'requiredApprovals' = '1'), 1,
  'the action audit row names the same policy — label and authorisation agree');

select is((select enabled::integer from private.staff_feature_flags
           where flag_key = 'identity_extraction' and environment = 'staging'), 0,
  'activation leaves the feature flag disabled, as it always did');
select is((select active::integer from private.staff_kill_switches
           where switch_key = 'identity_extraction'), 0,
  'and does not touch the kill switch');

-- ---------------------------------------------------------------------------
-- 5. EVERY OTHER CONTROL STILL REFUSES
-- ---------------------------------------------------------------------------
-- The human count is gone. Nothing else is.

-- A reason is still mandatory.
set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_activate_external_provider('google_maps_platform','staging','short')$$,
  '22023', 'An activation reason is required',
  'A REASON IS STILL REQUIRED');

-- The environment is still checked.
select throws_ok(
  $$select public.staff_activate_external_provider(
      'google_maps_platform','production','Wrong environment on purpose, stated at length')$$,
  '42501', 'Provider activation environment mismatch',
  'THE ENVIRONMENT IS STILL CHECKED');
reset role;

-- A capability the operator does not hold is still refused.
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a2900000-0000-4000-8000-000000000003','authenticated','authenticated','policy-support@test.local','',now(),'{}','{"display_name":"Support only"}',now(),now());
insert into public.staff_role_grants(user_id, role_key, reason, idempotency_key)
values ('a2900000-0000-4000-8000-000000000003','support_agent',
        'Fixture: holds no governance capability','fixture:governance-policy:support');

set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000003');
select throws_ok(
  $$select public.staff_activate_external_provider(
      'google_maps_platform','staging','A support agent must not activate a provider')$$,
  '42501', NULL,
  'A MISSING CAPABILITY IS STILL REFUSED');
reset role;

-- A revoked staff identity is still refused.
update public.staff_role_grants set revoked_at = now()
where user_id = 'a2900000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000003');
select throws_ok(
  $$select public.staff_activate_external_provider(
      'google_maps_platform','staging','A revoked identity must not activate a provider')$$,
  '42501', NULL,
  'A REVOKED STAFF IDENTITY IS STILL REFUSED');
reset role;

-- Stale authentication is still refused. `manage_subprocessors` requires
-- re-authentication, and the window is read from platform configuration.
set local role authenticated;
select pg_temp.act_as_with('a2900000-0000-4000-8000-000000000001', 'aal1', 100000);
select throws_ok(
  $$select public.staff_activate_external_provider(
      'google_maps_platform','staging','A stale session must not activate a provider')$$,
  '42501', NULL,
  'STALE AUTHENTICATION IS STILL REFUSED');
reset role;

-- And aal1 is refused the moment the platform requires a second factor.
update private.staff_platform_configuration set mfa_required = true where singleton;
set local role authenticated;
select pg_temp.act_as_with('a2900000-0000-4000-8000-000000000001', 'aal1', 0);
select throws_ok(
  $$select public.staff_activate_external_provider(
      'google_maps_platform','staging','An aal1 session must not activate a provider')$$,
  '42501', NULL,
  'AAL1 IS STILL REFUSED WHEN THE PLATFORM REQUIRES A SECOND FACTOR');
reset role;

-- A refused action fabricates nothing.
select is(
  (select count(*)::integer from private.staff_dual_control_requests
   where subject_ref = 'google_maps_platform:staging' and consumed_at is not null),
  0,
  'AND NONE OF THOSE REFUSALS LEFT A CONSUMED AUTHORISATION BEHIND');
select is((select current_status from private.external_providers
           where provider_key = 'google_maps_platform'), 'configured_not_enabled',
  'nor activated the provider they were refused for');

update private.staff_platform_configuration set mfa_required = false where singleton;

-- ---------------------------------------------------------------------------
-- 6. DUAL CONTROL IS STILL AVAILABLE TO ANY CAPABILITY THAT ASKS FOR IT
-- ---------------------------------------------------------------------------
-- Warsha no longer REQUIRES two people. It has not lost the ability to require
-- them. A future capability — or a provider contract that imposes one — can opt
-- back in with one UPDATE and no migration.

update public.staff_capabilities set approval_policy = 'dual_control'
where capability_key = 'manage_subprocessors';

select is(private.approval_policy_for('manage_subprocessors'), 'dual_control',
  'a capability can opt back into two-person control');
select is((select dual_control from public.staff_capabilities
           where capability_key = 'manage_subprocessors'), true,
  'and the derived column follows it immediately');

set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_activate_external_provider(
      'google_maps_platform','staging','One identity under restored dual control')$$,
  '42501', 'This action requires a second approver',
  'AND ONE IDENTITY IS REFUSED AGAIN, EXACTLY AS BEFORE');

select ok(public.staff_request_dual_control(
  'manage_subprocessors','activate_external_provider',
  'google_maps_platform:staging','Raise the activation for a second identity') is not null,
  'the operator raises a request');
reset role;

select set_config('warsha.policy_request',
  (select id::text from private.staff_dual_control_requests
   where subject_ref = 'google_maps_platform:staging'
     and requested_by = 'a2900000-0000-4000-8000-000000000001'), true);

set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_approve_dual_control(
      current_setting('warsha.policy_request')::uuid,'Approving my own request')$$,
  '42501', 'A staff member cannot approve their own request',
  'the requester still cannot second themselves under dual control');
reset role;

set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000002');
select is((public.staff_approve_dual_control(
  current_setting('warsha.policy_request')::uuid,
  'Seconded by a genuinely different administrator'))->>'approved',
  'true', 'a different administrator approves it');
reset role;

set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000001');
select is((public.staff_activate_external_provider(
  'google_maps_platform','staging','Activate under restored dual control'))->>'governanceMode',
  'dual_control', 'and only then does activation succeed, recorded as dual control');
reset role;

select ok((select approved_by is not null and approved_by <> requested_by
           from private.staff_dual_control_requests
           where id = current_setting('warsha.policy_request')::uuid),
  'THE TWO-IDENTITY RECORD NAMES TWO DIFFERENT PEOPLE, BECAUSE TWO PEOPLE ACTED');

select * from finish();
rollback;
