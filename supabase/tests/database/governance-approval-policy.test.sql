begin;
select no_plan();

-- The approval policy itself: one function decides how many distinct staff
-- identities a governed action needs, and production is not allowed to inherit
-- development's answer.
--
-- The development half of this is proved in
-- `development-provider-governance.test.sql`, which runs bound to development.
-- This file proves the other half, and it proves it the only way worth
-- proving: by putting the platform in a public environment and trying to get a
-- sensitive activation through it with one identity. Everything happens inside
-- one transaction that rolls back, and no external request is made.

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

-- ---------------------------------------------------------------------------
-- The policy, read directly
-- ---------------------------------------------------------------------------

select has_function('private', 'required_approval_count', array['text','text'],
  'the approval policy exists as one function');
select has_function('private', 'governance_mode', array['text','text'],
  'and the name of the policy is derived from it, not stored beside it');

select is(private.required_approval_count('local', null), 2,
  'A LOCAL RESET KEEPS DUAL CONTROL: IT REHEARSES THE STRICTER CONFIGURATION');
select is(private.required_approval_count('development', null), 1,
  'DEVELOPMENT NEEDS ONE AUTHORISED ADMINISTRATOR');
select is(private.required_approval_count('staging', null), 2,
  'staging still needs two distinct staff identities');
select is(private.required_approval_count('production', null), 2,
  'PRODUCTION STILL NEEDS TWO DISTINCT STAFF IDENTITIES');
select is(private.required_approval_count('anything_unrecognised', null), 2,
  'AND AN ENVIRONMENT NOBODY RECOGNISES FALLS TO THE STRICTER ANSWER');
select is(private.governance_mode('development', null), 'single_admin',
  'the mode is named rather than inferred by each caller');
select is(private.governance_mode('production', null), 'dual_control',
  'and production keeps its name too');

-- Naming an action never lowers the count. The parameter exists so a future
-- action can need more than its environment's default, never less.
select is((select bool_and(private.required_approval_count(env, act) >= 2)
           from unnest(array['local','staging','production']) env
           cross join unnest(array[
             'activate_external_provider','publish_legal_version',
             'sync_subprocessor_in_use','record_processing_basis_review',
             'record_subprocessor_agreement','process_financial_refund',
             'permanent_ban', null]) act),
  true, 'NO ACTION KEY LOWERS A PUBLIC ENVIRONMENT BELOW TWO IDENTITIES');

select is(has_function_privilege(
  'authenticated', 'private.required_approval_count(text,text)', 'EXECUTE'), false,
  'the policy is not callable by an ordinary authenticated account');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a2900000-0000-4000-8000-000000000001','authenticated','authenticated','policy-first@test.local','',now(),'{}','{"display_name":"First administrator"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2900000-0000-4000-8000-000000000002','authenticated','authenticated','policy-second@test.local','',now(),'{}','{"display_name":"Second administrator"}',now(),now());

select ok(private.bootstrap_staff_role(
  'a2900000-0000-4000-8000-000000000001','security_administrator',
  'Public-environment policy first administrator') is not null,
  'the first administrator is authorized');
select ok(private.bootstrap_staff_role(
  'a2900000-0000-4000-8000-000000000002','super_administrator',
  'Public-environment policy second administrator') is not null,
  'the second administrator is authorized');

-- Put the platform in a public environment for the rest of this transaction.
-- Written directly because `staff_bind_platform_environment` is deliberately a
-- one-way exit from local and is not a fixture tool; this is a test-owner write
-- inside a rollback, exactly like the expiry fixtures elsewhere in this suite.
update private.staff_platform_configuration
set environment = 'staging',
    expected_project_ref = 'policyfixtureprojectref'
where singleton;
select is(private.platform_environment(), 'staging',
  'the fixture puts the platform in a public environment');
select is(private.required_approval_count(private.platform_environment(), null), 2,
  'WHICH IS GOVERNED BY DUAL CONTROL');

-- ---------------------------------------------------------------------------
-- One identity cannot complete a sensitive activation in a public environment
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_cloud_vision','staging','Single identity must not activate here')$$,
  '42501', 'This action requires a second approver',
  'ONE IDENTITY CANNOT ACTIVATE A PROVIDER IN A PUBLIC ENVIRONMENT');

select ok(public.staff_request_dual_control(
  'manage_subprocessors','activate_external_provider',
  'google_cloud_vision:staging','Request activation for the dual-control proof') is not null,
  'the first administrator raises a request');
reset role;

select set_config('warsha.policy_request',
  (select id::text from private.staff_dual_control_requests
   where subject_ref = 'google_cloud_vision:staging'
     and requested_by = 'a2900000-0000-4000-8000-000000000001'), true);
select is((select governance_mode from private.staff_dual_control_requests
           where id = current_setting('warsha.policy_request')::uuid),
  'dual_control', 'and the record is stamped dual control, not single admin');
select is((select required_approvals from private.staff_dual_control_requests
           where id = current_setting('warsha.policy_request')::uuid), 2::smallint,
  'asking for two identities');

set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_cloud_vision','staging','A raised request is not an approval')$$,
  '42501', 'This action is waiting for a second approver',
  'AND A RAISED REQUEST IS STILL NOT AN APPROVAL');
select throws_ok(
  $$select public.staff_approve_dual_control(
    current_setting('warsha.policy_request')::uuid,'Approving my own request')$$,
  '42501', 'A staff member cannot approve their own request',
  'THE REQUESTER CANNOT BECOME THEIR OWN SECOND IDENTITY');
reset role;

-- The constraint, not only the function. Even a direct write cannot make the
-- two identities the same one.
select throws_ok(
  $$update private.staff_dual_control_requests
    set approved_by = requested_by, approved_at = now(), approval_note = 'forged'
    where id = current_setting('warsha.policy_request')::uuid$$,
  '23514', NULL,
  'AND THE TABLE ITSELF REFUSES A SELF-APPROVAL, NOT ONLY THE FUNCTION');

-- Nor can a public-environment record be relabelled into the shorter policy.
select throws_ok(
  $$update private.staff_dual_control_requests
    set governance_mode = 'single_admin', required_approvals = 1
    where id = current_setting('warsha.policy_request')::uuid$$,
  '55000', 'Dual control history is immutable',
  'A DEVELOPMENT POLICY CANNOT BE RETROFITTED ONTO A PUBLIC-ENVIRONMENT RECORD');

-- ---------------------------------------------------------------------------
-- Two distinct identities still complete it
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000002');
select is((public.staff_approve_dual_control(
  current_setting('warsha.policy_request')::uuid,
  'Prerequisites independently reviewed by a second administrator'))->>'approved',
  'true', 'a genuinely different administrator approves it');
reset role;

set local role authenticated;
select pg_temp.act_as('a2900000-0000-4000-8000-000000000001');
select is((public.staff_activate_external_provider(
  'google_cloud_vision','staging',
  'Activate the registry entry under preserved dual control'))->>'governanceMode',
  'dual_control', 'and only then does activation succeed, recorded as dual control');
reset role;

select is((select count(*)::integer from private.staff_audit_events
           where action = 'external_provider_activated'
             and safe_detail->>'providerKey' = 'google_cloud_vision'
             and safe_detail->>'governanceMode' = 'dual_control'
             and safe_detail->>'requiredApprovals' = '2'), 1,
  'the audit row names the policy that actually governed it');
select is((select count(*)::integer from private.staff_audit_events
           where action = 'single_admin_authorisation_consumed'), 0,
  'AND NO SINGLE-ADMIN AUTHORISATION WAS RECORDED IN A PUBLIC ENVIRONMENT');
select ok((select approved_by is not null and approved_by <> requested_by
           from private.staff_dual_control_requests
           where id = current_setting('warsha.policy_request')::uuid),
  'the record names two different people, because two different people acted');
select is((select enabled::integer from private.staff_feature_flags
           where flag_key = 'identity_extraction' and environment = 'staging'), 0,
  'activation leaves the feature flag disabled, as it always did');
select is((select active::integer from private.staff_kill_switches
           where switch_key = 'identity_extraction'), 0,
  'and does not touch the kill switch');

select * from finish();
rollback;
