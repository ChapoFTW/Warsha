begin;
select no_plan();

-- WPS-024/WPS-025 development environment and provider-governance correction.
-- No external request is made: provider activation and temporary flag changes
-- occur only inside this transaction and roll back at the end.

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

create function pg_temp.act_as_nobody()
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $fn$;

create function pg_temp.constraint_def(p_schema text, p_table text, p_constraint text)
returns text language sql stable as $fn$
  select pg_get_constraintdef(c.oid)
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = p_schema
    and t.relname = p_table
    and c.conname = p_constraint
$fn$;

-- ---------------------------------------------------------------------------
-- Structure and deny-by-default state
-- ---------------------------------------------------------------------------

select has_function('public', 'staff_bind_platform_environment',
  array['text','text','text','text'], 'the hosted project binding RPC exists');
select has_function('public', 'staff_activate_external_provider',
  array['text','text','text'], 'the provider activation RPC exists');
select has_function('public', 'staff_set_feature_flag',
  array['text','text','boolean','text','integer','text','date'],
  'the existing feature flag signature is preserved');
select has_function('public', 'staff_publish_legal_version',
  array['text','text','text','text','text','text','text','date','text'],
  'the legal publication signature is preserved');
select has_function('public', 'staff_sync_provider_status',
  array['text','text'], 'the subprocessor sync signature is preserved');

select is(has_function_privilege(
  'anon', 'public.staff_activate_external_provider(text,text,text)', 'EXECUTE'), false,
  'anon cannot activate a provider');
select is(has_function_privilege(
  'authenticated', 'private.consume_dual_control(text,text,text,text)', 'EXECUTE'), false,
  'clients cannot consume approvals directly');
select is(has_table_privilege('authenticated', 'private.external_providers', 'UPDATE'), false,
  'authenticated cannot bypass the provider RPC with a table update');

select is((select environment from private.staff_platform_configuration), 'local',
  'a clean migration replay remains the local Docker environment');
select is((select expected_project_ref from private.staff_platform_configuration), null,
  'a clean local replay is not falsely bound to a hosted project');
select is((select count(*)::integer from private.staff_feature_flags
           where flag_key = 'location_provider' and environment = 'development'), 1,
  'development has one location provider feature state');
select is((select enabled::integer from private.staff_feature_flags
           where flag_key = 'location_provider' and environment = 'development'), 0,
  'the development location provider starts disabled');
select is((select audience from private.staff_feature_flags
           where flag_key = 'location_provider' and environment = 'development'), 'none',
  'the disabled development flag has no audience');
select ok((select 'development' = any(environments) from private.external_providers
           where provider_key = 'google_maps_platform'),
  'Google Maps is registered as development-compatible');
select ok((select not ('production' = any(environments)) from private.external_providers
           where provider_key = 'google_maps_platform'),
  'Google Maps does not become production-compatible');
select is((select current_status from private.external_providers
           where provider_key = 'google_maps_platform'),
  'implemented_awaiting_credential', 'the migration does not activate Google Maps');
select is((select active::integer from private.staff_kill_switches
           where switch_key = 'location_provider'), 0,
  'the migration does not alter the location kill switch');

do $$
declare
  v_item text[];
begin
  foreach v_item slice 1 in array array[
    array['private','staff_configuration_versions','staff_configuration_versions_env_check'],
    array['private','staff_feature_flags','staff_feature_flags_env_check'],
    array['public','privacy_consent_records','privacy_consent_records_environment_check'],
    array['public','legal_acceptances','legal_acceptances_environment_check'],
    array['private','ocr_requests','ocr_requests_environment_check'],
    array['private','ocr_accuracy_runs','ocr_accuracy_runs_environment_check'],
    array['private','provider_health_samples','provider_health_samples_environment_check'],
    array['public','referral_programs','referral_programs_env_check'],
    array['public','growth_campaigns','growth_campaigns_env_check']
  ] loop
    if position('development' in coalesce(
      pg_temp.constraint_def(v_item[1], v_item[2], v_item[3]), '')) = 0 then
      raise exception 'Constraint %.%.% does not support development',
        v_item[1], v_item[2], v_item[3];
    end if;
  end loop;
end $$;
select pass('every runtime ledger derived from platform_environment accepts development');

-- ---------------------------------------------------------------------------
-- Staff fixtures
-- ---------------------------------------------------------------------------

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a2800000-0000-4000-8000-000000000001','authenticated','authenticated','wps028-requester@test.local','',now(),'{}','{"display_name":"Requester"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2800000-0000-4000-8000-000000000002','authenticated','authenticated','wps028-approver@test.local','',now(),'{}','{"display_name":"Approver"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2800000-0000-4000-8000-000000000003','authenticated','authenticated','wps028-expired@test.local','',now(),'{}','{"display_name":"Expired requester"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2800000-0000-4000-8000-000000000004','authenticated','authenticated','wps028-wrong@test.local','',now(),'{}','{"display_name":"Wrong purpose requester"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2800000-0000-4000-8000-000000000005','authenticated','authenticated','wps028-customer@test.local','',now(),'{}','{"display_name":"Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2800000-0000-4000-8000-000000000006','authenticated','authenticated','wps028-retry@test.local','',now(),'{}','{"display_name":"Retry requester"}',now(),now());

insert into public.customer_profiles(id)
values ('a2800000-0000-4000-8000-000000000005')
on conflict do nothing;

select ok(private.bootstrap_staff_role(
  'a2800000-0000-4000-8000-000000000001','security_administrator',
  'Development governance requester') is not null, 'the requester is authorized');
select ok(private.bootstrap_staff_role(
  'a2800000-0000-4000-8000-000000000002','super_administrator',
  'Development governance second approver') is not null, 'the approver is authorized');
select ok(private.bootstrap_staff_role(
  'a2800000-0000-4000-8000-000000000003','security_administrator',
  'Expired approval requester') is not null, 'the expired-case requester is authorized');
select ok(private.bootstrap_staff_role(
  'a2800000-0000-4000-8000-000000000004','security_administrator',
  'Wrong purpose requester') is not null, 'the wrong-purpose requester is authorized');
select ok(private.bootstrap_staff_role(
  'a2800000-0000-4000-8000-000000000006','security_administrator',
  'Already active retry requester') is not null, 'the retry requester is authorized');

-- ---------------------------------------------------------------------------
-- Permanent development binding
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000005');
select throws_ok(
  $$select public.staff_bind_platform_environment(
    'local','development','lrhipbcapzfxuwixfoog','Unauthorized project binding')$$,
  '42501', 'Staff capability required',
  'an ordinary authenticated account cannot bind the platform environment');
reset role;

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select is((public.staff_bind_platform_environment(
  'local','development','lrhipbcapzfxuwixfoog',
  'Bind the permanent hosted Warsha development project'))->>'environment',
  'development', 'authorized staff binds the hosted project to development');
select is((public.staff_bind_platform_environment(
  'local','development','lrhipbcapzfxuwixfoog',
  'Idempotent hosted development project binding retry'))->>'duplicate',
  'true', 'an exact project binding retry is idempotent');
select throws_ok(
  $$select public.staff_bind_platform_environment(
    'development','production','lrhipbcapzfxuwixfoog','Do not permit production relabel')$$,
  '22023', 'Only a non-production hosted environment can be bound here',
  'the development binding authority cannot target production');
reset role;

select is((select environment from private.staff_platform_configuration), 'development',
  'the authoritative platform environment is development');
select is((select expected_project_ref from private.staff_platform_configuration),
  'lrhipbcapzfxuwixfoog', 'the platform is bound to the exact hosted project ref');
select is((select count(*)::integer from private.platform_environment_events
           where from_environment = 'local' and to_environment = 'development'
             and project_ref = 'lrhipbcapzfxuwixfoog'
             and reason = 'Bind the permanent hosted Warsha development project'), 1,
  'the environment transition has one immutable reasoned event');
select is((select count(*)::integer from private.staff_audit_events
           where action = 'platform_environment_bound'
             and environment = 'development'
             and safe_detail->>'expectedProjectRef' = 'lrhipbcapzfxuwixfoog'), 1,
  'the platform binding has one staff audit event');

-- ---------------------------------------------------------------------------
-- Development feature flags are governed and environment-local
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000005');
select throws_ok(
  $$select public.staff_set_feature_flag(
    'location_provider','development',true,'all',100,
    'Unauthorized location flag attempt')$$,
  '42501', 'Staff capability required',
  'an unauthorized account cannot set the development flag');
reset role;

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select is((public.staff_set_feature_flag(
  'location_provider','development',true,'all',100,
  'Exercise the audited development feature flag path'))->>'enabled',
  'true', 'authorized staff can target the development feature state');
select throws_ok(
  $$select public.staff_set_feature_flag(
    'location_provider','staging',true,'all',100,
    'Cross-environment mutation must fail')$$,
  '42501', 'Feature flags must target the current platform environment',
  'development staff cannot mutate staging state');
select throws_ok(
  $$select public.staff_set_feature_flag(
    'location_provider','qa',true,'all',100,
    'Unsupported environment must fail')$$,
  '22023', 'Invalid environment', 'an unsupported environment is refused');
select is((public.staff_set_feature_flag(
  'location_provider','development',false,'none',0,
  'Return the development provider flag to its safe disabled state'))->>'enabled',
  'false', 'the development flag returns to disabled before activation');
reset role;

select is((select count(*)::integer from private.staff_feature_flag_history
           where flag_key = 'location_provider' and environment = 'development'), 2,
  'each development flag mutation has immutable history');
select is((select count(*)::integer from private.staff_audit_events
           where action = 'feature_flag_changed'
             and safe_detail->>'flagKey' = 'location_provider'
             and safe_detail->>'environment' = 'development'), 2,
  'each development flag mutation has staff audit');
select is(private.provider_for_role('location'), 'google_maps_platform',
  'the development-compatible provider fills the location role');
select is(private.provider_enabled('google_maps_platform'), false,
  'registry and flag gates still deny Google Maps');

-- ---------------------------------------------------------------------------
-- Provider activation: negative cases
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000005');
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_maps_platform','development','Unauthorized provider activation')$$,
  '42501', 'Staff capability required',
  'an unauthorized account cannot activate a provider');
reset role;

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_maps_platform','production','Wrong environment activation')$$,
  '42501', 'Provider activation environment mismatch',
  'development cannot activate a provider as production');
select ok(public.staff_activate_external_provider(
  'google_maps_platform','development',
  'Activate only the provider registry; leave runtime delivery disabled') is not null,
  'ONE AUTHORISED ADMINISTRATOR ACTIVATES A PROVIDER IN DEVELOPMENT');
reset role;

select set_config('warsha.provider_approval',
  (select id::text from private.staff_dual_control_requests
   where requested_by = 'a2800000-0000-4000-8000-000000000001'
     and action_key = 'activate_external_provider'
     and subject_ref = 'google_maps_platform:development'), true);

-- The record is the point. It names one actor, it says which policy produced
-- it, and it carries no approver — there is no second person in this trail
-- because there was no second person.
select is((select governance_mode from private.staff_dual_control_requests
           where id = current_setting('warsha.provider_approval')::uuid),
  'single_admin', 'the authorisation records the policy that produced it');
select is((select required_approvals from private.staff_dual_control_requests
           where id = current_setting('warsha.provider_approval')::uuid), 1::smallint,
  'and how many identities that policy asked for');
select ok((select approved_by is null and approved_at is null
           from private.staff_dual_control_requests
           where id = current_setting('warsha.provider_approval')::uuid),
  'THE RECORD NAMES NO SECOND APPROVER, BECAUSE THERE WAS NONE');
select is((select requested_by::text from private.staff_dual_control_requests
           where id = current_setting('warsha.provider_approval')::uuid),
  'a2800000-0000-4000-8000-000000000001',
  'and names the administrator who actually acted');
select ok((select consumed_at is not null from private.staff_dual_control_requests
           where id = current_setting('warsha.provider_approval')::uuid),
  'the authorisation is spent in the same step it was created');
select is((select count(*)::integer from private.staff_audit_events
           where action = 'single_admin_authorisation_consumed'
             and safe_detail->>'governanceMode' = 'single_admin'
             and safe_detail->>'environment' = 'development'
             and actor_id = 'a2800000-0000-4000-8000-000000000001'), 1,
  'AND THE AUDIT TRAIL SAYS SINGLE-ADMIN IN AS MANY WORDS');
select is((select count(*)::integer from private.staff_audit_events
           where action = 'external_provider_activated'
             and safe_detail->>'providerKey' = 'google_maps_platform'
             and safe_detail->>'governanceMode' = 'single_admin'), 1,
  'the activation audit records the policy it was governed by');

-- Nobody may add a name afterwards. A record whose policy asked for one
-- identity must not later look like it waited for two.
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.staff_approve_dual_control(
    current_setting('warsha.provider_approval')::uuid,'A name nobody asked for')$$,
  '42501', 'This authorisation needs no second approver',
  'A SINGLE-ADMIN RECORD REFUSES A SECOND SIGNATURE RATHER THAN ABSORBING ONE');
reset role;

-- Authority is still authority. One person is not any person.
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000005');
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_maps_platform','development','Unauthorized single-admin attempt')$$,
  '42501', 'Staff capability required',
  'SINGLE-ADMIN GOVERNANCE STILL REFUSES AN ACCOUNT WITHOUT THE CAPABILITY');
reset role;
set local role authenticated;
select pg_temp.act_as_nobody();
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_maps_platform','development','Anonymous single-admin attempt')$$,
  '42501', NULL,
  'and refuses an unauthenticated caller outright');
reset role;

select is((select current_status from private.external_providers
           where provider_key = 'google_maps_platform'), 'active',
  'the provider registry status is active');
select is((select count(*)::integer from private.external_provider_events
           where provider_key = 'google_maps_platform' and event_type = 'enabled'), 1,
  'exactly one immutable enabled event is written');
select is((select count(*)::integer from private.staff_audit_events
           where action = 'external_provider_activated'
             and safe_detail->>'providerKey' = 'google_maps_platform'
             and safe_detail->>'dualControlRequestId' = current_setting('warsha.provider_approval')), 1,
  'provider activation audit identifies the consumed approval');
select ok((select consumed_at is not null from private.staff_dual_control_requests
           where id = current_setting('warsha.provider_approval')::uuid),
  'provider activation consumes its approval');
select is((select enabled::integer from private.staff_feature_flags
           where flag_key = 'location_provider' and environment = 'development'), 0,
  'provider activation leaves the feature flag disabled');
select is((select active::integer from private.staff_kill_switches
           where switch_key = 'location_provider'), 0,
  'provider activation does not alter the kill switch');
select is(private.provider_enabled('google_maps_platform'), false,
  'provider activation alone does not enable runtime calls');
select is((select count(*)::integer from private.external_provider_events
           where provider_key = 'google_maps_platform'
             and reason ~ 'AIza[0-9A-Za-z_-]+'), 0,
  'no provider event contains a Google API key-shaped value');
select is((select count(*)::integer from private.staff_audit_events
           where action = 'external_provider_activated'
             and safe_detail::text ~* '(secretValue|credentialValue|apiKey)'), 0,
  'provider audit contains no credential-value field');
select ok(
  position('credential' in pg_get_function_identity_arguments(
    'public.staff_activate_external_provider'::regproc
  )) = 0,
  'provider activation accepts no credential parameter');

-- A second attempt cannot create a second activation event, however authorised.
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000006');
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_maps_platform','development','Already active retry must be harmless')$$,
  '22023', 'Provider is already active', 'an active provider cannot activate twice');
reset role;
select is((select count(*)::integer from private.external_provider_events
           where provider_key = 'google_maps_platform' and event_type = 'enabled'), 1,
  'an already-active retry writes no duplicate event');

-- Replay of a spent authorisation is rejected even when an owner-only fixture
-- restores the precondition. This proves the authorisation, not only the
-- status, is single use — single-admin does not mean single-admin-repeatedly.
update private.external_providers
set current_status = 'implemented_awaiting_credential'
where provider_key = 'google_maps_platform';
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_maps_platform','development','Consumed authorisation replay must fail')$$,
  '42501', 'That authorisation was already used',
  'A SPENT SINGLE-ADMIN AUTHORISATION CANNOT BE REPLAYED');
reset role;
update private.external_providers
set current_status = 'active'
where provider_key = 'google_maps_platform';

-- ---------------------------------------------------------------------------
-- Material legal publication is authorised once, by the policy in force
-- ---------------------------------------------------------------------------
--
-- The authority is unchanged: material and urgent publication is governed and
-- editorial publication is not. Only the number of identities the governed path
-- asks for follows the environment, and here that number is one.

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select is((public.staff_publish_legal_version(
  'privacy_policy','9.9',repeat('a',64),repeat('b',64),'material',
  'Material test summary for provider governance only.',
  'ملخص اختبار مادي لمسار الحوكمة فقط.',current_date,
  'Publish the exact approved material test version'))->>'version',
  '9.9', 'ONE AUTHORISED PUBLISHER MAY PUBLISH A MATERIAL VERSION IN DEVELOPMENT');
select throws_ok(
  $$select public.staff_publish_legal_version(
    'privacy_policy','9.9',repeat('a',64),repeat('b',64),'material',
    'Material test summary for provider governance only.',
    'ملخص اختبار مادي لمسار الحوكمة فقط.',current_date,
    'Replay the already published exact version')$$,
  '22023', 'That version already exists',
  'the legal publication mutation cannot be replayed');
reset role;

select set_config('warsha.legal_approval',
  (select id::text from private.staff_dual_control_requests
   where requested_by = 'a2800000-0000-4000-8000-000000000001'
     and action_key = 'publish_legal_version'
     and subject_ref = 'privacy_policy:9.9:development'), true);
select is((select governance_mode from private.staff_dual_control_requests
           where id = current_setting('warsha.legal_approval')::uuid),
  'single_admin', 'and its authorisation records the single-admin policy');
select ok((select approved_by is null and consumed_at is not null
           from private.staff_dual_control_requests
           where id = current_setting('warsha.legal_approval')::uuid),
  'spent, with no second name attached to it');
select is((select count(*)::integer from private.staff_audit_events
           where action = 'publish'
             and safe_detail->>'documentKey' = 'privacy_policy'
             and safe_detail->>'version' = '9.9'
             and safe_detail->>'dualControlRequestId' = current_setting('warsha.legal_approval')), 1,
  'legal publication audit identifies the consumed authorisation');
select is((select count(*)::integer from private.legal_version_events
           where document_key = 'privacy_policy' and version = '9.9'
             and event_type = 'published'), 1,
  'the published version has one immutable publication event');

-- The subject binding is unchanged: an authorisation is for one document at one
-- version, and a second document needs its own.
select is((select count(*)::integer from private.staff_dual_control_requests
           where action_key = 'publish_legal_version'
             and subject_ref = 'location_data_policy:9.9:development'), 0,
  'AN AUTHORISATION FOR ONE DOCUMENT NEVER EXISTS FOR ANOTHER');

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000005');
select throws_ok(
  $$select public.staff_publish_legal_version(
    'location_data_policy','9.9',repeat('c',64),repeat('d',64),'material',
    'An account without the capability must not publish.',
    'حساب بدون صلاحية لا ينشر.',current_date,
    'Unauthorized material publication')$$,
  '42501', 'Staff capability required',
  'AND PUBLICATION STILL REQUIRES THE PUBLISHING CAPABILITY');
reset role;

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select ok((public.staff_publish_legal_version(
  'privacy_policy','9.10',repeat('e',64),repeat('f',64),'editorial',
  'Editorial test correction with no material effect.',
  'تصحيح تحريري اختباري دون تأثير جوهري.',current_date,
  'Prove non-material publication authority is unchanged'))->>'dualControlRequestId' is null,
  'editorial publication remains outside the material governance gate');
reset role;

-- ---------------------------------------------------------------------------
-- Subprocessor promotion is separately authorised; demotion remains immediate
-- ---------------------------------------------------------------------------
--
-- Promotion means personal data may now reach a supplier, so it is governed
-- separately from activation even for the same provider. Demotion is a
-- restriction and must stay immediately available during an incident — that
-- asymmetry is untouched by the approval count.

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select is((public.staff_set_feature_flag(
  'location_provider','development',true,'all',100,
  'Temporarily exercise subprocessor promotion inside rollback'))->>'enabled',
  'true', 'the test enables the provider only inside its rollback transaction');
select is((public.staff_sync_provider_status(
  'google_maps_platform','Promote the approved Maps subprocessor in development'))->>'subprocessorStatus',
  'in_use', 'one authorised administrator may promote the subprocessor here');
reset role;

select set_config('warsha.subprocessor_approval',
  (select id::text from private.staff_dual_control_requests
   where requested_by = 'a2800000-0000-4000-8000-000000000001'
     and action_key = 'sync_subprocessor_in_use'), true);
select is((select governance_mode from private.staff_dual_control_requests
           where id = current_setting('warsha.subprocessor_approval')::uuid),
  'single_admin', 'promotion is authorised under the same recorded policy');
select ok((select approved_by is null and consumed_at is not null
           from private.staff_dual_control_requests
           where id = current_setting('warsha.subprocessor_approval')::uuid),
  'and its authorisation is spent with no second name attached');

-- Promotion is still a separate authorisation from activation: the activation
-- record cannot pay for it.
select isnt(current_setting('warsha.subprocessor_approval'),
  current_setting('warsha.provider_approval'),
  'PROMOTION IS AUTHORISED SEPARATELY FROM ACTIVATION, NOT CARRIED BY IT');

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select is((public.staff_set_feature_flag(
  'location_provider','development',false,'none',0,
  'Return the test provider to its safe disabled state'))->>'enabled',
  'false', 'the test disables the provider again');
select is((public.staff_sync_provider_status(
  'google_maps_platform','Restrictive demotion after disabling the provider'))->>'subprocessorStatus',
  'approved_not_integrated', 'restrictive demotion does not wait for any authorisation');
reset role;

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000005');
select throws_ok(
  $$select public.staff_sync_provider_status(
    'google_maps_platform','Unauthorized reconciliation')$$,
  '42501', 'Staff capability required',
  'and reconciliation still requires the subprocessor capability');
reset role;

select is((select integration_status from private.subprocessors
           where subprocessor_key = 'google_maps_platform'),
  'approved_not_integrated', 'the rollback fixture leaves the subprocessor non-integrated');
select is((select enabled::integer from private.staff_feature_flags
           where flag_key = 'location_provider' and environment = 'development'), 0,
  'the test leaves the development feature flag disabled');

-- ---------------------------------------------------------------------------
-- The approval queue: the read surface dual control was missing
-- ---------------------------------------------------------------------------
--
-- Approving by id only meant the second person had to be handed a UUID out of
-- band. The queue must be readable in the read-only transaction PostgREST opens
-- for a stable function, and must never widen who can see what.
select has_function('public','staff_dual_control_queue','the approval queue exists');

set local transaction_read_only = on;
select lives_ok(
  $$ select public.staff_dual_control_queue() $$,
  'THE APPROVAL QUEUE RUNS IN A READ-ONLY TRANSACTION, AS THE CONSOLE CALLS IT');
select ok(
  (public.staff_dual_control_queue())->'requests' is not null,
  'and returns a requests collection');

select * from finish();
rollback;
