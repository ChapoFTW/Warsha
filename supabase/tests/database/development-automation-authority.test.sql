begin;
select no_plan();

-- The automation principal: what it can do, and — the part that matters — what
-- it structurally cannot.
--
-- Everything here runs inside one transaction that rolls back. No external
-- request is made, no provider is called, and nothing is billed.

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
-- Structure: the boundary is the shape of the data, not a rule in a function
-- ---------------------------------------------------------------------------

select has_table('private', 'automation_principals',
  'the automation principal register exists');
select has_function('private', 'require_automation_capability', array['text','text'],
  'the automation capability gate exists');

select is((select environment from private.automation_principals
           where principal_key = 'development_engineering'), 'development',
  'the seeded principal is scoped to development');
select is((select active::integer from private.automation_principals
           where principal_key = 'development_engineering'), 1,
  'and is active');

-- The single most important assertion in this file. A production principal is
-- not merely absent, it is unstorable, so no future code path can find one.
select throws_ok(
  $$insert into private.automation_principals(
      principal_key, display_name, environment, capabilities,
      authorization_basis, authorization_policy_version, notes)
    values ('production_engineering','Production automation','production',
            array['manage_subprocessors'],'owner_approved_development_policy',
            '2026-08-27','Must be impossible')$$,
  '23514', NULL,
  'A PRODUCTION AUTOMATION PRINCIPAL CANNOT BE STORED AT ALL');
select throws_ok(
  $$insert into private.automation_principals(
      principal_key, display_name, environment, capabilities,
      authorization_basis, authorization_policy_version, notes)
    values ('staging_engineering','Staging automation','staging',
            array['manage_subprocessors'],'owner_approved_development_policy',
            '2026-08-27','Must be impossible')$$,
  '23514', NULL,
  'and neither can a staging one');

-- A principal cannot claim a capability that does not exist, which would read
-- as broader than it is.
select throws_ok(
  $$insert into private.automation_principals(
      principal_key, display_name, environment, capabilities,
      authorization_basis, authorization_policy_version, notes)
    values ('invented_capability','Invented','development',
            array['do_absolutely_anything'],'owner_approved_development_policy',
            '2026-08-27','Must be impossible')$$,
  '22023', NULL,
  'nor can it hold a capability Warsha does not define');

-- The principal holds no capability that decides anything about a person.
select is((select count(*)::integer from private.automation_principals p
           where p.principal_key = 'development_engineering'
             and (p.capabilities && array[
               'manage_staff_roles','initiate_refund','approve_permanent_ban',
               'publish_legal_version','export_operational_report'])), 0,
  'AUTOMATION HOLDS NO CAPABILITY THAT ADJUDICATES A PERSON OR MOVES MONEY');

-- ---------------------------------------------------------------------------
-- No browser reaches any of this
-- ---------------------------------------------------------------------------

select is(has_table_privilege('anon', 'private.automation_principals', 'SELECT'), false,
  'anon cannot read the principal register');
select is(has_table_privilege('authenticated', 'private.automation_principals', 'SELECT'), false,
  'nor can an authenticated account');

select is(has_function_privilege(
  'anon', 'private.automation_activate_external_provider(text,text,text,text)', 'EXECUTE'),
  false, 'ANON CANNOT INVOKE AUTOMATION ACTIVATION');
select is(has_function_privilege(
  'authenticated', 'private.automation_activate_external_provider(text,text,text,text)', 'EXECUTE'),
  false, 'AND NEITHER CAN AN ORDINARY SIGNED-IN ACCOUNT');
select is(has_function_privilege(
  'authenticated', 'private.automation_set_feature_flag(text,text,text,boolean,text,integer,text)', 'EXECUTE'),
  false, 'nor the feature flag path');
select is(has_function_privilege(
  'authenticated', 'private.automation_set_kill_switch(text,text,boolean,text)', 'EXECUTE'),
  false, 'nor the kill switch path');
select is(has_function_privilege(
  'authenticated', 'private.automation_record_subprocessor_agreement(text,text,text,text,text)', 'EXECUTE'),
  false, 'nor the supplier agreement path');
select is(has_function_privilege(
  'authenticated', 'private.require_automation_capability(text,text)', 'EXECUTE'),
  false, 'nor the gate itself');
select is(has_function_privilege(
  'service_role', 'private.automation_activate_external_provider(text,text,text,text)', 'EXECUTE'),
  true, 'the service role, held only by an Edge Function, can');

-- ---------------------------------------------------------------------------
-- The audit trail cannot be made to describe a person who did not act
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into private.staff_audit_events(
      actor_id, actor_type, automation_principal_key, capability_key, action,
      entity_type, reason, environment)
    values (null,'automation',null,'manage_subprocessors','forged',
            'external_provider','A forged automation row with no principal','development')$$,
  '23514', NULL,
  'an automation audit row must name its principal');

-- ---------------------------------------------------------------------------
-- Development: the principal can actually do the work
-- ---------------------------------------------------------------------------

update private.staff_platform_configuration
set environment = 'development', expected_project_ref = 'automationfixtureref'
where singleton;
select is(private.platform_environment(), 'development',
  'the fixture places the platform in development');

select is((private.automation_governance_state('development_engineering'))->>'environment',
  'development', 'the principal can read the state it is about to change');

select is((private.automation_record_processing_basis_review(
  'development_engineering','worker_verification','approved','',
  'Internal legal review complete under owner-approved development policy.'))->>'reviewStatus',
  'approved', 'it can record an internal review decision');
select is((select legal_review_status from private.processing_activities
           where activity_key = 'worker_verification'), 'approved',
  'and the register reflects it');
select ok((select legal_reviewed_by is null from private.processing_activities
           where activity_key = 'worker_verification'),
  'WITH NO HUMAN RECORDED AS THE REVIEWER, BECAUSE NO HUMAN REVIEWED IT');

select is((private.automation_record_subprocessor_agreement(
  'development_engineering','google_cloud_vision','incorporated',
  'Google Cloud Data Processing Addendum, incorporated by the Google Cloud Platform Terms of Service',
  'Recording the supplier terms already in force for this account.'))->>'agreementStatus',
  'incorporated', 'it can record a supplier agreement that is in force by incorporation');

-- But it cannot assert a signature. Nothing automation can observe establishes
-- that a person executed a document.
select throws_ok(
  $$select private.automation_record_subprocessor_agreement(
      'development_engineering','google_cloud_vision','signed',
      'A document nobody signed','Attempting to assert an executed signature')$$,
  '42501', 'Automation cannot record an executed signature',
  'AUTOMATION CANNOT CLAIM A DOCUMENT WAS SIGNED');
select throws_ok(
  $$select private.automation_record_subprocessor_agreement(
      'development_engineering','google_cloud_vision','incorporated','',
      'Attempting to record a contract with no evidence')$$,
  '22023', 'An agreement reference is required to record a contract in force',
  'and cannot record one in force without naming what puts it there');

select is((private.automation_activate_external_provider(
  'development_engineering','google_cloud_vision','development',
  'Activating the identity extraction provider for hosted development.'))->>'status',
  'active', 'IT CAN ACTIVATE A PROVIDER IN DEVELOPMENT');
select is((select current_status from private.external_providers
           where provider_key = 'google_cloud_vision'), 'active',
  'and the registry agrees');

-- The attribution, which is the whole reason this design exists.
select is((select actor_type from private.staff_audit_events
           where action = 'external_provider_activated'
             and safe_detail->>'providerKey' = 'google_cloud_vision'), 'automation',
  'the audit row says an automation actor did it');
select is((select automation_principal_key from private.staff_audit_events
           where action = 'external_provider_activated'
             and safe_detail->>'providerKey' = 'google_cloud_vision'),
  'development_engineering', 'and names which one');
select ok((select actor_id is null from private.staff_audit_events
           where action = 'external_provider_activated'
             and safe_detail->>'providerKey' = 'google_cloud_vision'),
  'AND NAMES NO HUMAN, BECAUSE NO HUMAN WAS INVOLVED');
select is((select governance_mode from private.staff_audit_events
           where action = 'external_provider_activated'
             and safe_detail->>'providerKey' = 'google_cloud_vision'),
  'development_automation', 'the governance mode is recorded truthfully');
select is((select authorization_basis from private.staff_audit_events
           where action = 'external_provider_activated'
             and safe_detail->>'providerKey' = 'google_cloud_vision'),
  'owner_approved_development_policy', 'and so is the basis it acted under');
select is((select break_glass::integer from private.staff_audit_events
           where action = 'external_provider_activated'
             and safe_detail->>'providerKey' = 'google_cloud_vision'), 0,
  'an automation action is not break-glass: its capabilities are exactly its own');
select is((select count(*)::integer from private.staff_dual_control_requests
           where subject_ref = 'google_cloud_vision:development'), 0,
  'AND NO DUAL-CONTROL RECORD IS INVENTED FOR A MACHINE WITH NOBODY TO SECOND IT');

-- Activation alone still switches nothing on. Every prerequisite the human path
-- enforces ran here, because both paths run the same core.
select is(private.provider_enabled('google_cloud_vision'), false,
  'activation alone does not enable the provider');
select is((select enabled::integer from private.staff_feature_flags
           where flag_key = 'identity_extraction' and environment = 'development'), 0,
  'the feature flag is untouched by activation');

select is((private.automation_set_feature_flag(
  'development_engineering','identity_extraction','development',true,'all',100,
  'Enabling identity extraction in development after activation.'))->>'enabled',
  'true', 'it can enable a development feature flag');
select is(private.provider_enabled('google_cloud_vision'), true,
  'and only now is the provider actually enabled');
select ok((select changed_by is null from private.staff_feature_flag_history
           where flag_key = 'identity_extraction' and environment = 'development'
           order by changed_at desc limit 1),
  'the flag history records no human changer for an automation change');

-- Rollback has to be at least as easy as rollout, or it does not get used.
select is((private.automation_set_kill_switch(
  'development_engineering','identity_extraction',true,
  'Engaging the extraction stop control for a rollback test.'))->>'active',
  'true', 'it can engage the kill switch');
select is(private.provider_enabled('google_cloud_vision'), false,
  'AND THE KILL SWITCH STILL STOPS THE PROVIDER DEAD');
select is((private.automation_set_kill_switch(
  'development_engineering','identity_extraction',false,
  'Clearing the extraction stop control after the rollback test.'))->>'active',
  'false', 'and can clear it again');
select is(private.provider_enabled('google_cloud_vision'), true,
  'restoring the provider');
select is((private.automation_deactivate_external_provider(
  'development_engineering','google_cloud_vision',
  'Deactivating after the rollback test.'))->>'status',
  'configured_not_enabled', 'and it can take the provider back out of service');
select is(private.provider_enabled('google_cloud_vision'), false,
  'which disables it');

-- The four switches that operate money and live work stay human-only.
select throws_ok(
  $$select private.automation_set_kill_switch(
      'development_engineering','payouts',true,'Automation must not stop payouts')$$,
  '42501', 'That kill switch operates domain configuration and is human-only',
  'AUTOMATION CANNOT STOP PAYOUTS');
select throws_ok(
  $$select private.automation_set_kill_switch(
      'development_engineering','new_marketplace_requests',true,
      'Automation must not close the marketplace')$$,
  '42501', 'That kill switch operates domain configuration and is human-only',
  'nor close the marketplace');

-- A capability it does not hold is refused even in development.
select throws_ok(
  $$select private.require_automation_capability(
      'development_engineering','publish_legal_version')$$,
  '42501', 'Automation capability required',
  'a capability the principal does not hold is refused');
select throws_ok(
  $$select private.require_automation_capability('no_such_principal','manage_subprocessors')$$,
  '42501', 'Unknown automation principal',
  'and an unknown principal is refused outright');

-- A revoked principal stops working immediately.
update private.automation_principals
set active = false, revoked_at = now() where principal_key = 'development_engineering';
select throws_ok(
  $$select private.require_automation_capability(
      'development_engineering','manage_subprocessors')$$,
  '42501', 'That automation principal is revoked',
  'REVOKING THE PRINCIPAL STOPS EVERY ACTION IT COULD TAKE');
update private.automation_principals
set active = true, revoked_at = null where principal_key = 'development_engineering';

-- ---------------------------------------------------------------------------
-- Production: the same principal, refused
-- ---------------------------------------------------------------------------
--
-- The regression the brief asks for, stated as directly as it can be: the
-- Development automation actor, unchanged and still active, against a
-- production platform.

-- The legacy staff bridge is refused in production by an existing constraint,
-- so the fixture has to close it as well as name the environment.
update private.staff_platform_configuration
set environment = 'production',
    expected_project_ref = 'productionfixtureref',
    legacy_staff_rpc_grace_enabled = false,
    legacy_staff_bridge_enabled = false,
    -- Production also refuses to exist without MFA, by a constraint that has
    -- been there since WPS-017. Satisfying it is part of describing production
    -- honestly rather than approximately.
    -- Production is structurally fail-closed in Warsha: it cannot be selected
    -- without mfa_required, and no MFA provider may be configured. Both halves
    -- of that are constraints from WPS-017, and the fixture honours them rather
    -- than describing a production that could not exist.
    mfa_required = true
where singleton;
select is(private.platform_environment(), 'production',
  'the fixture places the platform in production');

select throws_ok(
  $$select private.automation_activate_external_provider(
      'development_engineering','google_maps_platform','production',
      'A development automation principal must not activate in production')$$,
  '42501', 'Automation governance is available in development only',
  'DEVELOPMENT AUTOMATION ACTOR -> PRODUCTION PROVIDER ACTIVATION -> REJECTED');
select throws_ok(
  $$select private.automation_set_feature_flag(
      'development_engineering','location_provider','production',true,'all',100,
      'A development automation principal must not flag production')$$,
  '42501', 'Automation governance is available in development only',
  'AND CANNOT TOUCH A PRODUCTION FEATURE FLAG');
select throws_ok(
  $$select private.automation_set_kill_switch(
      'development_engineering','identity_extraction',true,
      'A development automation principal must not operate production controls')$$,
  '42501', 'Automation governance is available in development only',
  'nor a production kill switch');
select throws_ok(
  $$select private.automation_record_subprocessor_agreement(
      'development_engineering','google_cloud_vision','incorporated',
      'Any reference at all','A development principal must not write the production register')$$,
  '42501', 'Automation governance is available in development only',
  'nor the production subprocessor register');
select throws_ok(
  $$select private.automation_record_processing_basis_review(
      'development_engineering','worker_verification','approved','',
      'A development principal must not approve a production processing basis')$$,
  '42501', 'Automation governance is available in development only',
  'nor a production processing basis');
select throws_ok(
  $$select private.automation_deactivate_external_provider(
      'development_engineering','google_maps_platform',
      'A development principal must not deactivate in production')$$,
  '42501', 'Automation governance is available in development only',
  'and cannot even deactivate there, because the boundary is the environment');
select throws_ok(
  $$select private.automation_governance_state('development_engineering')$$,
  '42501', 'Automation governance is available in development only',
  'IT CANNOT SO MUCH AS READ PRODUCTION GOVERNANCE STATE');

-- And the human path in production is untouched by any of this.
select is(private.required_approval_count(private.platform_environment(), null), 2,
  'production still requires two distinct staff identities');
select is(private.governance_mode(private.platform_environment(), null), 'dual_control',
  'under the unchanged dual-control policy');

select * from finish();
rollback;
