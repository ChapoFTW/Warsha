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
  'authenticated', 'private.consume_dual_control(text,text,text)', 'EXECUTE'), false,
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
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_maps_platform','development','Missing dual control activation')$$,
  '42501', 'This action requires a second approver',
  'provider activation without dual control is refused');
reset role;

-- An approved request with the wrong action key cannot unlock activation.
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000004');
select ok(public.staff_request_dual_control(
  'manage_subprocessors','wrong_external_provider_action',
  'google_maps_platform:development','Wrong purpose provider approval fixture') is not null,
  'a wrong-purpose request is created for the binding test');
reset role;
select set_config('warsha.wrong_provider_approval',
  (select id::text from private.staff_dual_control_requests
   where requested_by = 'a2800000-0000-4000-8000-000000000004'
     and action_key = 'wrong_external_provider_action'), true);
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000002');
select ok(public.staff_approve_dual_control(
  current_setting('warsha.wrong_provider_approval')::uuid,
  'Approved only to prove purpose binding') is not null,
  'a second person approves the wrong-purpose fixture');
reset role;
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000004');
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_maps_platform','development','Wrong purpose cannot activate')$$,
  '42501', 'This action requires a second approver',
  'wrong-purpose approval cannot activate the provider');
reset role;

-- An exact approval that expires is still rejected by the mutation.
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000003');
select ok(public.staff_request_dual_control(
  'manage_subprocessors','activate_external_provider',
  'google_maps_platform:development','Expired provider approval fixture') is not null,
  'an exact provider approval request can be opened');
reset role;
update private.staff_dual_control_requests
set expires_at = now() - interval '1 minute'
where requested_by = 'a2800000-0000-4000-8000-000000000003'
  and action_key = 'activate_external_provider';
select set_config('warsha.expired_provider_approval',
  (select id::text from private.staff_dual_control_requests
   where requested_by = 'a2800000-0000-4000-8000-000000000003'
     and action_key = 'activate_external_provider'), true);
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000002');
select ok(public.staff_approve_dual_control(
  current_setting('warsha.expired_provider_approval')::uuid,
  'Approval arrives after expiry for the negative test') is not null,
  'the fixture records a second-person approval');
reset role;
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000003');
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_maps_platform','development','Expired approval cannot activate')$$,
  '42501', 'That approval expired', 'an expired approval cannot activate a provider');
reset role;

-- ---------------------------------------------------------------------------
-- Provider activation: exact second-person approval, once
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select ok(public.staff_request_dual_control(
  'manage_subprocessors','activate_external_provider',
  'google_maps_platform:development','Activate Maps registry after reviewed prerequisites') is not null,
  'the intended activator requests exact provider dual control');
reset role;
select set_config('warsha.provider_approval',
  (select id::text from private.staff_dual_control_requests
   where requested_by = 'a2800000-0000-4000-8000-000000000001'
     and action_key = 'activate_external_provider'), true);
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_approve_dual_control(
    current_setting('warsha.provider_approval')::uuid,'Self approval is forbidden')$$,
  '42501', 'A staff member cannot approve their own request',
  'the provider requester cannot self-approve');
reset role;

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000002');
select is((public.staff_approve_dual_control(
  current_setting('warsha.provider_approval')::uuid,
  'Credential name, environment, disabled flag and kill switch checked'))->>'approved',
  'true', 'a different authorized staff member approves provider activation');
reset role;

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select is((public.staff_activate_external_provider(
  'google_maps_platform','development',
  'Activate only the provider registry; leave runtime delivery disabled'))->>'status',
  'active', 'a valid exact approval activates the registry once');
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

-- A separately approved retry cannot create a second activation event.
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000006');
select ok(public.staff_request_dual_control(
  'manage_subprocessors','activate_external_provider',
  'google_maps_platform:development','Already active retry fixture request') is not null,
  'a retry requester can open a separate exact request');
reset role;
select set_config('warsha.retry_provider_approval',
  (select id::text from private.staff_dual_control_requests
   where requested_by = 'a2800000-0000-4000-8000-000000000006'
     and action_key = 'activate_external_provider'), true);
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000002');
select ok(public.staff_approve_dual_control(
  current_setting('warsha.retry_provider_approval')::uuid,
  'Approve retry only to exercise already-active refusal') is not null,
  'the retry fixture receives second-person approval');
reset role;
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

-- Replay of a consumed approval is rejected even if an owner-only test fixture
-- restores the precondition. This proves the approval, not only the status, is
-- single use.
update private.external_providers
set current_status = 'implemented_awaiting_credential'
where provider_key = 'google_maps_platform';
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_activate_external_provider(
    'google_maps_platform','development','Consumed approval replay must fail')$$,
  '42501', 'That approval was already used',
  'a consumed provider approval cannot be replayed');
reset role;
update private.external_providers
set current_status = 'active'
where provider_key = 'google_maps_platform';

-- ---------------------------------------------------------------------------
-- Legal publication approval is exact and single use
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_publish_legal_version(
    'privacy_policy','9.9',repeat('a',64),repeat('b',64),'material',
    'Material test summary for provider governance only.',
    'ملخص اختبار مادي لمسار الحوكمة فقط.',current_date,
    'Material publication without dual control')$$,
  '42501', 'This action requires a second approver',
  'material legal publication without dual control is refused');
select ok(public.staff_request_dual_control(
  'publish_legal_version','publish_legal_version',
  'privacy_policy:9.9:development','Publish exact material privacy test version') is not null,
  'the legal publisher requests an exact version approval');
reset role;
select set_config('warsha.legal_approval',
  (select id::text from private.staff_dual_control_requests
   where requested_by = 'a2800000-0000-4000-8000-000000000001'
     and action_key = 'publish_legal_version'
     and subject_ref = 'privacy_policy:9.9:development'), true);
set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_approve_dual_control(
    current_setting('warsha.legal_approval')::uuid,'Legal self approval')$$,
  '42501', 'A staff member cannot approve their own request',
  'a legal publisher cannot approve their own publication');
reset role;

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000002');
select is((public.staff_approve_dual_control(
  current_setting('warsha.legal_approval')::uuid,
  'Exact hashes, version, summaries and environment reviewed'))->>'approved',
  'true', 'a second legal publisher approves the exact version');
reset role;

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_publish_legal_version(
    'location_data_policy','9.9',repeat('c',64),repeat('d',64),'material',
    'Different document must not use the privacy approval.',
    'مستند مختلف لا يستخدم موافقة الخصوصية.',current_date,
    'Wrong document publication')$$,
  '42501', 'This action requires a second approver',
  'approval for one document cannot publish another');
select is((public.staff_publish_legal_version(
  'privacy_policy','9.9',repeat('a',64),repeat('b',64),'material',
  'Material test summary for provider governance only.',
  'ملخص اختبار مادي لمسار الحوكمة فقط.',current_date,
  'Publish the exact approved material test version'))->>'version',
  '9.9', 'the exact approved material version publishes');
select throws_ok(
  $$select public.staff_publish_legal_version(
    'privacy_policy','9.9',repeat('a',64),repeat('b',64),'material',
    'Material test summary for provider governance only.',
    'ملخص اختبار مادي لمسار الحوكمة فقط.',current_date,
    'Replay the already published exact version')$$,
  '22023', 'That version already exists',
  'the legal publication mutation cannot be replayed');
reset role;

select ok((select consumed_at is not null from private.staff_dual_control_requests
           where id = current_setting('warsha.legal_approval')::uuid),
  'legal publication consumes the exact approval');
select is((select count(*)::integer from private.staff_audit_events
           where action = 'publish'
             and safe_detail->>'documentKey' = 'privacy_policy'
             and safe_detail->>'version' = '9.9'
             and safe_detail->>'dualControlRequestId' = current_setting('warsha.legal_approval')), 1,
  'legal publication audit identifies the consumed approval');
select is((select count(*)::integer from private.legal_version_events
           where document_key = 'privacy_policy' and version = '9.9'
             and event_type = 'published'), 1,
  'the approved legal version has one immutable publication event');

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select ok((public.staff_publish_legal_version(
  'privacy_policy','9.10',repeat('e',64),repeat('f',64),'editorial',
  'Editorial test correction with no material effect.',
  'تصحيح تحريري اختباري دون تأثير جوهري.',current_date,
  'Prove non-material publication authority is unchanged'))->>'dualControlRequestId' is null,
  'editorial publication remains outside the material dual-control gate');
reset role;

-- ---------------------------------------------------------------------------
-- Subprocessor promotion is separately approved; demotion remains immediate
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select is((public.staff_set_feature_flag(
  'location_provider','development',true,'all',100,
  'Temporarily exercise subprocessor promotion inside rollback'))->>'enabled',
  'true', 'the test enables the provider only inside its rollback transaction');
select throws_ok(
  $$select public.staff_sync_provider_status(
    'google_maps_platform','Promotion without its own approval')$$,
  '42501', 'This action requires a second approver',
  'subprocessor promotion without dual control is refused');
select ok(public.staff_request_dual_control(
  'manage_subprocessors','sync_subprocessor_in_use',
  'google_maps_platform:development:in_use',
  'Promote Maps subprocessor after material approval') is not null,
  'the intended promoter requests exact subprocessor dual control');
reset role;
select set_config('warsha.subprocessor_approval',
  (select id::text from private.staff_dual_control_requests
   where requested_by = 'a2800000-0000-4000-8000-000000000001'
     and action_key = 'sync_subprocessor_in_use'), true);

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000002');
select is((public.staff_approve_dual_control(
  current_setting('warsha.subprocessor_approval')::uuid,
  'Material disclosure and enabled provider state independently checked'))->>'approved',
  'true', 'a second person approves subprocessor promotion');
reset role;

set local role authenticated;
select pg_temp.act_as('a2800000-0000-4000-8000-000000000001');
select is((public.staff_sync_provider_status(
  'google_maps_platform','Promote the approved Maps subprocessor in development'))->>'subprocessorStatus',
  'in_use', 'an exact approval promotes the subprocessor');
select is((public.staff_set_feature_flag(
  'location_provider','development',false,'none',0,
  'Return the test provider to its safe disabled state'))->>'enabled',
  'false', 'the test disables the provider again');
select is((public.staff_sync_provider_status(
  'google_maps_platform','Restrictive demotion after disabling the provider'))->>'subprocessorStatus',
  'approved_not_integrated', 'restrictive demotion does not wait for dual control');
reset role;

select ok((select consumed_at is not null from private.staff_dual_control_requests
           where id = current_setting('warsha.subprocessor_approval')::uuid),
  'subprocessor promotion consumes its own approval');
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
