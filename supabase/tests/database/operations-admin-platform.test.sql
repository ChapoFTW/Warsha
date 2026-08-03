begin;
select no_plan();

-- WPS-018: staff sessions are verified from the signed token, so the fixture
-- must present the same claims PostgREST would set from a real access token:
-- the subject, the assurance level, and the signed `amr` authentication record.
create function pg_temp.act_as(p_uid uuid, p_aal text default 'aal1', p_age_seconds integer default 0)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid::text,
    'aal', p_aal,
    'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password',
      'timestamp', floor(extract(epoch from now()))::bigint - p_age_seconds))
  )::text, true);
end $fn$;


-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select has_table('public','staff_roles','staff roles exist');
select has_table('public','staff_capabilities','staff capabilities exist');
select has_table('public','staff_role_capabilities','role/capability mapping exists');
select has_table('public','staff_role_grants','staff role grants exist');
select has_table('public','staff_queues','the queue catalog exists');
select has_table('public','operational_assignments','the generic assignment layer exists');
select has_table('public','operational_assignment_events','assignment history exists');
select has_table('public','operational_incidents','incidents exist');
select has_table('public','operational_incident_events','incident timeline exists');
select has_table('public','support_ticket_events','support case history exists');
select has_table('private','staff_platform_configuration','admin platform configuration is private');
select has_table('private','staff_audit_events','the staff audit is private');
select has_table('private','staff_access_log','the access log is private');
select has_table('private','staff_session_attestations','session attestations are private');
select has_table('private','operational_case_notes','staff-private notes are private');
select has_table('private','staff_configuration_domains','configuration domains are private');
select has_table('private','staff_configuration_versions','configuration versions are private');
select has_table('private','staff_feature_flags','feature flags are private');
select has_table('private','staff_feature_flag_history','flag history is private');
select has_table('private','staff_kill_switches','kill switches are private');
select has_table('private','staff_export_catalog','the export catalog is private');
select has_table('private','staff_export_requests','export requests are private');

-- WPS-017 extends and replaces nothing.
select has_table('public','disputes','WPS-013 disputes are preserved');
select has_table('public','trust_reports','WPS-016 reports are preserved');
select has_table('public','review_reports','WPS-011 review reports are preserved');
select has_table('public','provider_verifications','WPS-006 verification is preserved');
select has_table('public','financial_refunds','WPS-007 refunds are preserved');
select has_table('private','reconciliation_exceptions','WPS-015 reconciliation is preserved');
select has_function('public','resolve_booking_dispute','the dispute authority is preserved');
select has_function('public','staff_record_enforcement_action','the trust authority is preserved');
select has_function('public','review_provider_verification','the verification authority is preserved');
select has_function('public','process_financial_refund','the refund authority is preserved');
select has_function('public','moderate_review','the review moderation authority is preserved');
select has_function('public','review_reconciliation_exception','the reconciliation authority is preserved');

select is((select count(*)::integer from public.staff_roles), 9, 'nine staff roles are defined');
select is((select count(*)::integer from public.staff_queues), 18, 'eighteen work queues are defined');
select ok((select count(*) from public.staff_capabilities) >= 30, 'the capability catalog is populated');
select ok((select count(*) from private.staff_configuration_domains) >= 15,
  'every approved configuration domain is registered');
select is((select count(*)::integer from private.staff_feature_flags where enabled), 0,
  'every feature flag ships disabled');
select is((select count(*)::integer from private.staff_kill_switches where active), 0,
  'no kill switch ships active');

-- Deny by default: only break-glass holds everything.
select is(
  (select count(*)::integer from public.staff_capabilities c
   where not exists (select 1 from public.staff_role_capabilities rc
                     where rc.capability_key = c.capability_key and rc.role_key = 'super_administrator')),
  0, 'the break-glass role can reach every capability');
select ok(
  (select count(*) from public.staff_role_capabilities where role_key = 'support_agent')
  < (select count(*) from public.staff_capabilities),
  'a support agent holds strictly fewer capabilities than exist');
select is(
  (select count(*)::integer from public.staff_role_capabilities
   where role_key = 'support_agent' and capability_key in
     ('approve_permanent_ban','initiate_refund','manage_staff_roles','view_audit_logs',
      'manage_kill_switches','legacy_domain_staff_actions')),
  0, 'a support agent holds no high-risk capability');
select is(
  (select count(*)::integer from public.staff_role_capabilities
   where role_key = 'verification_reviewer' and capability_key in ('review_disputes','initiate_refund')),
  0, 'a verification reviewer cannot reach dispute or refund capabilities');

-- Production is structurally fail closed.
select is((select environment from private.staff_platform_configuration), 'local',
  'the platform ships configured for local');
select throws_ok(
  $$update private.staff_platform_configuration set environment='production', mfa_required=false$$,
  '23514', null, 'production cannot be selected without the MFA requirement');
select is((select mfa_provider from private.staff_platform_configuration), 'none',
  'no MFA provider is configured');
select is((select legacy_staff_bridge_enabled from private.staff_platform_configuration), false,
  'the legacy staff bridge is disabled by default');

-- Privacy-safe aggregation helper.
select is(private.staff_suppress(3::bigint, 5), 'null'::jsonb, 'a cohort cell below the minimum is suppressed');
select is(private.staff_suppress(9::bigint, 5), pg_catalog.to_jsonb(9::bigint), 'a large enough cell is published');
select is(private.staff_suppress(0::bigint, 5), pg_catalog.to_jsonb(0::bigint), 'an empty cell reports zero');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a1700000-0000-4000-8000-000000000001','authenticated','authenticated','wps017-secadmin@test.local','',now(),'{}','{"display_name":"Security Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1700000-0000-4000-8000-000000000002','authenticated','authenticated','wps017-support@test.local','',now(),'{}','{"display_name":"Support Agent"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1700000-0000-4000-8000-000000000003','authenticated','authenticated','wps017-dispute@test.local','',now(),'{}','{"display_name":"Dispute Reviewer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1700000-0000-4000-8000-000000000004','authenticated','authenticated','wps017-finance@test.local','',now(),'{}','{"display_name":"Financial Operations"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1700000-0000-4000-8000-000000000005','authenticated','authenticated','wps017-manager@test.local','',now(),'{}','{"display_name":"Operations Manager"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1700000-0000-4000-8000-000000000006','authenticated','authenticated','wps017-customer@test.local','',now(),'{}','{"display_name":"Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1700000-0000-4000-8000-000000000007','authenticated','authenticated','wps017-worker@test.local','',now(),'{}','{"display_name":"Worker"}',now(),now());

insert into public.customer_profiles(id) values ('a1700000-0000-4000-8000-000000000006') on conflict do nothing;
insert into public.provider_profiles(id,user_id,display_name,profession_key,onboarding_status,is_published,is_verified)
values ('b1700000-0000-4000-8000-000000000001','a1700000-0000-4000-8000-000000000007','WPS017 Worker','plumber','approved',true,true);

-- The very first administrator is bootstrapped by a DBA, never by a client.
select is(has_function_privilege('authenticated','private.bootstrap_staff_role(uuid,text,text)','EXECUTE'),
  false, 'no client role can bootstrap a staff role');
select ok(private.bootstrap_staff_role('a1700000-0000-4000-8000-000000000001','security_administrator',
  'Initial administrator bootstrap') is not null, 'a DBA can bootstrap the first administrator');

-- ---------------------------------------------------------------------------
-- Customer and worker denial
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000006');
select is((public.get_staff_session())->>'isStaff','false','a customer is not staff');
select throws_ok($$select public.get_staff_home()$$,'42501','Staff capability required',
  'a customer cannot open the operational home');
select throws_ok($$select public.staff_safe_search('a1700000-0000-4000-8000-000000000007')$$,
  '42501','Staff capability required','a customer cannot run the operational search');
select throws_ok($$select public.get_staff_analytics('executive')$$,'42501','Staff capability required',
  'a customer cannot read analytics');
select throws_ok($$select public.staff_audit_search('audit_logs',null,null)$$,'42501','Staff capability required',
  'a customer cannot open the audit explorer');
select throws_ok($$select public.get_staff_role_directory()$$,'42501','Staff capability required',
  'a customer cannot read the role directory');
select is((select count(*)::integer from public.staff_role_grants),0,'a customer sees no staff grants');
select is((select count(*)::integer from public.operational_assignments),0,'a customer sees no operational cases');
select is((select count(*)::integer from public.operational_incidents),0,'a customer sees no incidents');
reset role;

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000007');
select is((public.get_staff_session())->>'isStaff','false','a worker is not staff');
select throws_ok($$select public.get_staff_queue('open_disputes')$$,'42501','Staff capability required',
  'a worker cannot open a queue');
reset role;

-- ---------------------------------------------------------------------------
-- Role administration: dual control, re-authentication, audit
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000001');
select is((public.get_staff_session())->>'isStaff','true','the bootstrapped administrator is staff');

-- A high-risk capability needs a recent, server-verified authentication.
-- WPS-018 replaced the client-attested check: freshness now comes from the
-- signed `amr` claim, so a stale session is refused however the client asks.
select pg_temp.act_as('a1700000-0000-4000-8000-000000000001', 'aal1', 4000);
select throws_ok(
  $$select public.staff_grant_role('a1700000-0000-4000-8000-000000000002','support_agent','Onboarding','grant-key-0001')$$,
  '42501','Re-authentication required','a stale session cannot administer roles');
select is((public.get_staff_session())->>'reauthValid','false','a stale session reports itself stale');
select throws_ok(
  $$select public.staff_reauthenticate()$$,
  '42501','Re-authentication required',
  'a stale session cannot confirm itself; the account must authenticate again');
select pg_temp.act_as('a1700000-0000-4000-8000-000000000001');
select is((public.staff_reauthenticate())->>'reauthValid','true','a freshly authenticated session verifies');
select is((public.get_staff_session())->>'reauthValid','true','the session reports verified freshness');

-- Dual control: a staff member can never grant a role to their own account.
select throws_ok(
  $$select public.staff_grant_role('a1700000-0000-4000-8000-000000000001','super_administrator','Self','grant-key-self1')$$,
  '42501','A staff member cannot grant a role to their own account',
  'self-granting a role is refused');

select ok((public.staff_grant_role('a1700000-0000-4000-8000-000000000002','support_agent',
  'Support onboarding','grant-key-0002'))->>'id' is not null,'a support agent can be granted');
select is((public.staff_grant_role('a1700000-0000-4000-8000-000000000002','support_agent',
  'Support onboarding','grant-key-0002'))->>'duplicate','true','role grants are idempotent');
select ok((public.staff_grant_role('a1700000-0000-4000-8000-000000000003','dispute_reviewer',
  'Dispute onboarding','grant-key-0003'))->>'id' is not null,'a dispute reviewer can be granted');
select ok((public.staff_grant_role('a1700000-0000-4000-8000-000000000004','financial_operations',
  'Finance onboarding','grant-key-0004'))->>'id' is not null,'a financial operator can be granted');
select ok((public.staff_grant_role('a1700000-0000-4000-8000-000000000005','operations_manager',
  'Manager onboarding','grant-key-0005'))->>'id' is not null,'an operations manager can be granted');
select ok((public.staff_grant_role('a1700000-0000-4000-8000-000000000003','operations_manager',
  'Approver separation of duties','grant-key-0010'))->>'id' is not null,'a second approver is granted');
select ok((public.staff_grant_role('a1700000-0000-4000-8000-000000000005','marketplace_operations',
  'Marketplace configuration authoring','grant-key-0011'))->>'id' is not null,
  'a marketplace operator is granted');
select throws_ok(
  $$select public.staff_grant_role('a1700000-0000-4000-8000-000000000002','support_agent','Again','grant-key-0006')$$,
  '22023','That role is already active for this account','a duplicate active role is refused');
select throws_ok(
  $$select public.staff_grant_role('a1700000-0000-4000-8000-000000000002','not_a_role','Bad','grant-key-0007')$$,
  '22023','Unknown staff role','an unknown role is refused');
select throws_ok(
  $$select public.staff_grant_role('a1700000-0000-4000-8000-000000000002','support_agent','','grant-key-0008')$$,
  '22023','A reason is required','a role grant requires a reason');
select ok(pg_catalog.jsonb_array_length((public.get_staff_role_directory())->'roles') = 9,
  'the role directory lists every role');
reset role;

-- Every role change is audited with an actor.
select ok((select count(*) from private.staff_audit_events where action = 'staff_role_granted') >= 5,
  'role grants are audited');
select is((select count(*)::integer from private.staff_audit_events
  where action = 'staff_role_granted' and actor_id is null), 0, 'every role-grant audit names an actor');
select is((select count(*)::integer from private.staff_audit_events
  where pg_catalog.length(pg_catalog.btrim(reason)) < 3), 0, 'every staff audit row records a reason');

-- Role history is immutable.
select throws_ok($$delete from public.staff_role_grants$$,'55000','Staff role history is immutable',
  'a role grant cannot be deleted');
select throws_ok($$update public.staff_role_grants set role_key='super_administrator'$$,
  '55000','Staff role history is immutable','a role grant cannot be rewritten');

-- ---------------------------------------------------------------------------
-- Capability enforcement and cross-role denial
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000002');
select is((public.get_staff_session())->>'isStaff','true','a support agent is staff');
select ok((public.get_staff_home())->'queues' is not null,'a support agent can open the operational home');
select throws_ok($$select public.get_staff_queue('open_disputes')$$,'42501','Staff capability required',
  'a support agent cannot open the dispute queue');
select throws_ok($$select public.get_staff_queue('reconciliation_exceptions')$$,'42501',
  'Staff capability required','a support agent cannot open the reconciliation queue');
select throws_ok($$select public.staff_audit_search('staff_audit',null,null)$$,'42501',
  'Staff capability required','a support agent cannot open the audit explorer');
select throws_ok(
  $$select public.staff_grant_role('a1700000-0000-4000-8000-000000000006','super_administrator','Escalate','esc-key-0001')$$,
  '42501','Staff capability required','a support agent cannot escalate their own privileges');
select throws_ok($$select public.staff_set_kill_switch('payouts',true,'Testing escalation','ks-key-0001')$$,
  '42501','Staff capability required','a support agent cannot operate a kill switch');
select throws_ok($$select public.get_staff_analytics('executive')$$,'42501','Staff capability required',
  'a support agent cannot read analytics');
-- A support agent may see safe worker context but never financial or contact detail.
select is((public.get_staff_worker_overview('b1700000-0000-4000-8000-000000000001'))->>'financialVisible',
  'false','a support agent never sees worker earnings');
select is((public.get_staff_worker_overview('b1700000-0000-4000-8000-000000000001'))->>'contactVisible',
  'false','a support agent never sees contact details');
select is((public.get_staff_worker_overview('b1700000-0000-4000-8000-000000000001'))->>'financial',
  '{}','the financial projection is empty without the capability');
-- The legacy domain bridge is withheld from narrow roles.
select is(private.is_staff(), false, 'a support agent cannot reach the legacy domain staff RPCs');
reset role;

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000003');
select is(private.is_staff(), true, 'a dispute reviewer can reach the legacy domain staff RPCs');
select throws_ok($$select public.get_staff_queue('reconciliation_exceptions')$$,'42501',
  'Staff capability required','a dispute reviewer cannot open a financial queue');
reset role;

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000004');
select is((public.get_staff_worker_overview('b1700000-0000-4000-8000-000000000001'))->>'financialVisible',
  'true','a financial operator sees the earnings summary');
select throws_ok($$select public.get_staff_queue('abuse_reports')$$,'42501','Staff capability required',
  'a financial operator cannot open the trust queue');
reset role;

-- A legacy user_roles staff row keeps working exactly as before.
insert into public.user_roles(user_id, role) values ('a1700000-0000-4000-8000-000000000006','support')
on conflict do nothing;
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000006');
select is(private.is_staff(), true, 'a legacy support role still satisfies the legacy gate unchanged');
select is((public.get_staff_session())->>'isStaff','false',
  'a legacy support role alone grants no WPS-017 capability');
reset role;
delete from public.user_roles where user_id='a1700000-0000-4000-8000-000000000006';

-- ---------------------------------------------------------------------------
-- Queue isolation, assignment races, workload, private notes
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000003');
select ok((public.get_staff_queue('open_disputes'))->'items' is not null,'the dispute queue renders');
select throws_ok($$select public.get_staff_queue('not_a_queue')$$,'22023','Unknown queue',
  'an unknown queue is refused');
select throws_ok($$select public.get_staff_queue('open_disputes','not_a_status')$$,'22023',
  'Invalid queue filter','an invalid queue filter is refused');

select ok((public.staff_open_case('open_disputes','c1700000-0000-4000-8000-000000000001',
  null,'work_incomplete','case-key-000001'))->>'assignmentId' is not null,'a case can be opened');
select is((public.staff_open_case('open_disputes','c1700000-0000-4000-8000-000000000001',
  null,'work_incomplete','case-key-000002'))->>'duplicate','true',
  'opening the same subject twice reuses the existing case');
select is((select count(*)::integer from public.operational_assignments),1,
  'a domain subject never gets a duplicate operational case');

-- Optimistic locking prevents a silent assignment overwrite.
select throws_ok(
  $$select public.staff_assign_case((select id from public.operational_assignments limit 1),
    'a1700000-0000-4000-8000-000000000003', 99, null, 'assign-key-0001')$$,
  '40001','This case changed since you opened it','a stale version cannot overwrite an assignment');

select is((public.staff_assign_case((select id from public.operational_assignments limit 1),
  'a1700000-0000-4000-8000-000000000003',
  (select lock_version from public.operational_assignments limit 1), 'Claiming', 'assign-key-0002'))->>'status',
  'assigned','a reviewer can claim a case in their own queue');
select is((public.staff_assign_case((select id from public.operational_assignments limit 1),
  'a1700000-0000-4000-8000-000000000003',
  (select lock_version from public.operational_assignments limit 1), 'Claiming', 'assign-key-0002'))->>'duplicate',
  'true','assignment is idempotent');
select is((select lock_version from public.operational_assignments limit 1),2,
  'a successful assignment advances the version');

select is((public.staff_transition_case((select id from public.operational_assignments limit 1),
  'in_progress',(select lock_version from public.operational_assignments limit 1),
  'Reviewing evidence','trans-key-0001'))->>'status','in_progress','a case can move to in progress');
select throws_ok(
  $$select public.staff_transition_case((select id from public.operational_assignments limit 1),
    'not_a_status',(select lock_version from public.operational_assignments limit 1),null,'trans-key-0009')$$,
  '22023','Invalid case status','an invalid case status is refused');
select is((public.staff_transition_case((select id from public.operational_assignments limit 1),
  'escalated',(select lock_version from public.operational_assignments limit 1),
  'Needs a manager','trans-key-0002'))->>'status','escalated','a case can be escalated');

-- Staff-private notes never leave the private schema.
select ok((public.staff_add_case_note((select id from public.operational_assignments limit 1),
  'Internal only: contacted the customer.','note-key-0001'))->>'noteId' is not null,'a private note can be added');
select is((public.staff_add_case_note((select id from public.operational_assignments limit 1),
  'Internal only: contacted the customer.','note-key-0001'))->>'duplicate','true','private notes are idempotent');
select is(pg_catalog.jsonb_array_length((public.get_staff_case(
  (select id from public.operational_assignments limit 1)))->'privateNotes'),1,
  'a reviewer sees the private note on their own case');
reset role;

select set_config('wps017.assignment', (select id::text from public.operational_assignments limit 1), false);
select set_config('wps017.assignment_version',
  (select lock_version::text from public.operational_assignments limit 1), false);

-- Assigning someone else needs the assignment capability AND the queue capability.
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000005');
select throws_ok(
  $$select public.staff_assign_case(current_setting('wps017.assignment')::uuid,
    'a1700000-0000-4000-8000-000000000002',
    current_setting('wps017.assignment_version')::integer, null, 'assign-key-0004')$$,
  '42501','Staff capability required',
  'a manager without the queue capability cannot assign inside that queue');
reset role;

-- A staff member who cannot work the queue can never be assigned to it.
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000003');
select throws_ok(
  $$select public.staff_assign_case(current_setting('wps017.assignment')::uuid,
    'a1700000-0000-4000-8000-000000000002',
    current_setting('wps017.assignment_version')::integer, null, 'assign-key-0005')$$,
  '22023','That staff member cannot work this queue',
  'a case cannot be assigned to someone who cannot work the queue');
reset role;

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000002');
select throws_ok($$select public.get_staff_case(current_setting('wps017.assignment')::uuid)$$,
  '42501','Staff capability required','a support agent cannot read a dispute case or its private notes');
select is((select count(*)::integer from public.operational_assignments),0,
  'queue isolation hides other queues at the row level');
select is((select count(*)::integer from public.operational_assignment_events),0,
  'assignment history follows the same queue isolation');
reset role;

-- Assignment history and private notes are immutable.
select throws_ok($$update public.operational_assignment_events set note='changed'$$,
  '55000','Operational assignment history is immutable','assignment history cannot be rewritten');
select throws_ok($$delete from public.operational_assignment_events$$,
  '55000','Operational assignment history is immutable','assignment history cannot be deleted');
select throws_ok($$update private.operational_case_notes set note='changed'$$,
  '55000','Operational assignment history is immutable','private notes cannot be rewritten');

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000005');
select ok(pg_catalog.jsonb_array_length(public.get_staff_workload()) >= 1,'workload is visible to a manager');
reset role;
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000004');
select throws_ok($$select public.get_staff_workload()$$,'42501','Staff capability required',
  'workload needs the assignment capability');
reset role;

-- ---------------------------------------------------------------------------
-- Global safe search restrictions
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000002');
select throws_ok($$select public.staff_safe_search('ab')$$,'22023','Search term is too short',
  'a short search term is refused');
select throws_ok($$select public.staff_safe_search('abcdef%')$$,'22023','Wildcard search is not permitted',
  'wildcard enumeration is refused');
select throws_ok($$select public.staff_safe_search('Mohamed Ali')$$,'22023','Search an exact identifier',
  'name search is refused without the contact capability');
select throws_ok($$select public.staff_safe_search('abcdef','national_id')$$,'22023','Invalid search kind',
  'there is no national-ID search kind');
select is((public.staff_safe_search('b1700000-0000-4000-8000-000000000001'))->>'count','1',
  'an exact worker identifier resolves');
select is((public.staff_safe_search('b1700000-0000-4000-8000-000000000001','dispute'))->>'count','0',
  'search results are filtered by kind');
reset role;

-- Every search is recorded, and the raw term is never stored.
select ok((select count(*) from private.staff_access_log where surface='safe_search') >= 2,
  'searches are audited');
select is((select count(*)::integer from private.staff_access_log
  where surface='safe_search' and query_shape like '%b1700000%'),0,
  'the raw search term is never stored in the access log');

-- Search is rate limited before anything is read.
update private.staff_platform_configuration set search_rate_limit_per_minute = 1;
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000002');
select throws_ok($$select public.staff_safe_search('b1700000-0000-4000-8000-000000000001')$$,
  '53400','Search rate limit reached','the operational search is rate limited');
reset role;
update private.staff_platform_configuration set search_rate_limit_per_minute = 30;

-- ---------------------------------------------------------------------------
-- Safe account views
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000002');
select is((public.get_staff_customer_overview('a1700000-0000-4000-8000-000000000006'))->>'displayName',
  'Customer','safe customer context is available');
select is((public.get_staff_customer_overview('a1700000-0000-4000-8000-000000000006'))->>'contact','{}',
  'contact details are withheld without the capability');
select is((public.get_staff_customer_overview('a1700000-0000-4000-8000-000000000006'))->>'contactVisible',
  'false','the projection states that contact details are hidden');
select throws_ok($$select public.get_staff_customer_overview('a1700000-0000-4000-8000-00000000ffff')$$,
  'P0002','Account not found','an unknown account is not found');
reset role;
select ok((select count(*) from private.staff_access_log where surface='customer_overview') >= 1,
  'safe profile access is logged');

-- ---------------------------------------------------------------------------
-- Configuration versioning, validation, dual control, rollback
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000005');
select is((public.staff_create_configuration_draft('marketplace_waves','local',
  '{"firstWaveSize":4}'::jsonb,'Widen the first wave for coverage'))->>'version','1',
  'a configuration draft is versioned');
select throws_ok(
  $$select public.staff_create_configuration_draft('marketplace_waves','local','{"unknownKey":1}'::jsonb,'Bad key here')$$,
  '22023','Configuration payload failed validation','an unknown configuration key is rejected');
select throws_ok(
  $$select public.staff_create_configuration_draft('marketplace_waves','local','{"apiKey":"x"}'::jsonb,'Secret value')$$,
  '22023','Configuration payload failed validation','a secret-looking key is rejected');
select throws_ok(
  $$select public.staff_create_configuration_draft('marketplace_waves','local','{"firstWaveSize":{"a":1}}'::jsonb,'Nested object')$$,
  '22023','Configuration payload failed validation','nested configuration objects are rejected');
select throws_ok(
  $$select public.staff_create_configuration_draft('not_a_domain','local','{}'::jsonb,'Unknown domain')$$,
  '22023','Unknown configuration domain','an unknown configuration domain is rejected');
reset role;

select set_config('wps017.config_version', (select id::text from private.staff_configuration_versions
  where domain_key='marketplace_waves' and version=1), false);

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000005');
select is((public.staff_submit_configuration(current_setting('wps017.config_version')::uuid))->>'status',
  'pending_approval','a draft can be submitted for approval');
-- Dual control: the author cannot approve their own version.
select is((public.staff_reauthenticate())->>'reauthValid','true','approval requires re-authentication');
select throws_ok(
  $$select public.staff_activate_configuration(current_setting('wps017.config_version')::uuid,'Self approval')$$,
  '42501','A configuration version cannot be approved by its author',
  'the author cannot approve their own configuration version');
reset role;

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_activate_configuration(current_setting('wps017.config_version')::uuid,'Reviewed')$$,
  '42501','Staff capability required','approval needs the approval capability, not role administration');
reset role;

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000003');
select is((public.staff_reauthenticate())->>'reauthValid','true','the second approver re-authenticates');
select is((public.staff_activate_configuration(current_setting('wps017.config_version')::uuid,
  'Reviewed against the coverage evidence'))->>'status','active','a second person can activate the version');
select is((public.staff_activate_configuration(current_setting('wps017.config_version')::uuid,
  'Reviewed again'))->>'status', null, 'an already active version cannot be activated twice')
  from (values (1)) v where false;
select throws_ok(
  $$select public.staff_activate_configuration(current_setting('wps017.config_version')::uuid,'Reviewed again')$$,
  '22023','Only a submitted version can be activated','an already active version cannot be activated twice');
select throws_ok(
  $$select public.staff_rollback_configuration('marketplace_waves','local',1,'Reverting the wave size')$$,
  '42501','Staff capability required','rollback needs the owning domain capability');
reset role;

-- Rollback creates a new corrective version instead of editing history.
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000005');
select is((public.staff_rollback_configuration('marketplace_waves','local',1,
  'Reverting to the previous wave size'))->>'version','2','a rollback creates a new version');
select throws_ok(
  $$select public.staff_rollback_configuration('marketplace_waves','local',99,'Reverting to a missing version')$$,
  'P0002','Target version not found','a rollback to a missing version is refused');
reset role;

select is((select applied_by from private.staff_configuration_domains where domain_key='marketplace_waves'),
  'domain_runbook','WPS-008 remains the authority that applies marketplace configuration');
select is((select count(*)::integer from private.staff_configuration_versions
  where domain_key='marketplace_waves' and environment='local'),2,'both versions are retained');
select throws_ok($$delete from private.staff_configuration_versions$$,'55000',
  'Configuration history is immutable','a configuration version cannot be deleted');
select throws_ok(
  $$update private.staff_configuration_versions set payload='{"firstWaveSize":9}'::jsonb where status='active'$$,
  '55000','Configuration history is immutable','an activated payload cannot be rewritten');
select is((select count(*)::integer from private.staff_configuration_versions
  where status='active' and approved_by is null),0,'an active version always names its approver');
select is((select count(*)::integer from private.staff_configuration_versions
  where status='active' and created_by = approved_by),0,'no active version was self-approved');

-- ---------------------------------------------------------------------------
-- Feature flags
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000005');
select throws_ok($$select public.get_staff_feature_flags()$$,'42501','Staff capability required',
  'a manager cannot manage feature flags');
reset role;

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000001');
select is((public.staff_reauthenticate())->>'reauthValid','true','flag management requires re-authentication');
select ok(pg_catalog.jsonb_array_length(public.get_staff_feature_flags()) >= 10,'the flag catalog is visible');
select throws_ok(
  $$select public.staff_set_feature_flag('not_a_flag','local',true,'all',100,'Testing an unknown flag')$$,
  '22023','Unknown feature flag','an unknown flag cannot be created through the API');
select throws_ok(
  $$select public.staff_set_feature_flag('online_payments','local',true,'all',100,'no')$$,
  '22023','A reason is required','a flag change requires a reason');
select throws_ok(
  $$select public.staff_set_feature_flag('online_payments','local',true,'nobody',100,'Testing a bad audience')$$,
  '22023','Invalid flag audience','an unknown flag audience is refused');
select is((public.staff_set_feature_flag('new_review_ui','local',true,'customer',100,
  'Releasing the new review UI to customers'))->>'enabled','true','a flag can be enabled');
reset role;

select is((select count(*)::integer from private.staff_feature_flag_history where flag_key='new_review_ui'),1,
  'every flag change is recorded in history');
select throws_ok($$update private.staff_feature_flag_history set reason='changed'$$,'55000',
  'Staff audit is immutable','flag history cannot be rewritten');
-- A security control can never be expressed as a feature flag.
select throws_ok(
  $$insert into private.staff_feature_flags(flag_key,environment,reason) values('rls_bypass','local','A bad flag')$$,
  '23514',null,'a security-shaped flag key is refused');
-- A flag that is on must name an audience.
select throws_ok(
  $$insert into private.staff_feature_flags(flag_key,environment,enabled,audience,reason)
    values('some_flag','local',true,'none','A flag with no audience')$$,
  '23514',null,'an enabled flag must name an audience');

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000006');
select is((public.get_my_feature_flags('customer'))->>'new_review_ui','true','a customer resolves an enabled flag');
select is((public.get_my_feature_flags('customer'))->>'online_payments','false','a disabled flag fails closed');
select is((public.get_my_feature_flags('worker'))->>'new_review_ui','false',
  'a customer-audience flag does not leak into worker mode');
select is((public.get_my_feature_flags('customer'))->>'not_a_flag',null,'an unknown flag resolves to nothing');
select throws_ok($$select public.get_my_feature_flags('admin')$$,'22023','Invalid mode','an unknown mode is refused');
reset role;

-- ---------------------------------------------------------------------------
-- Kill switches operate the domain authority and only ever restrict
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000001');
select is((public.staff_reauthenticate())->>'reauthValid','true','kill switches require re-authentication');
select throws_ok($$select public.staff_set_kill_switch('not_a_switch',true,'Testing an unknown switch','ks-key-0002')$$,
  '22023','Unknown kill switch','an unknown kill switch is refused');
select throws_ok($$select public.staff_set_kill_switch('payments_maintenance',true,'no','ks-key-0003')$$,
  '22023','A reason is required','a kill switch requires a reason');
select is((public.staff_set_kill_switch('payments_maintenance',true,
  'Provider incident under investigation','ks-key-0004'))->>'active','true','a kill switch can be activated');
reset role;
select is((select maintenance_mode from private.payment_configuration where id),true,
  'the switch operates the WPS-015 maintenance control rather than shadowing it');

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000001');
select is((public.staff_set_kill_switch('payments_maintenance',true,
  'Provider incident under investigation','ks-key-0005'))->>'duplicate','true','kill switches are idempotent');
select is((public.staff_set_kill_switch('payments_maintenance',false,
  'Provider recovered and verified','ks-key-0006'))->>'active','false','a kill switch can be cleared');
reset role;
select is((select maintenance_mode from private.payment_configuration where id),false,
  'clearing restores the domain control');
select ok((select count(*) from private.staff_kill_switch_events) >= 2,'kill switch changes are audited');

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000006');
select ok((public.get_platform_operational_status())->'activeSwitches' is not null,
  'a client can read the restrictive platform status');
select is((public.get_platform_operational_status())->>'readOnlyMaintenance','false',
  'read-only maintenance is off by default');
select throws_ok($$select public.get_staff_kill_switches()$$,'42501','Staff capability required',
  'a customer cannot read the kill switch detail');
reset role;

-- ---------------------------------------------------------------------------
-- Support cases
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000006');
select ok((public.open_support_case('payment_question','Payment did not go through',
  'I tried to pay and nothing happened.','support-key-0001'))->>'caseId' is not null,
  'a customer can open a support case');
select is((public.open_support_case('payment_question','Payment did not go through',
  'I tried to pay and nothing happened.','support-key-0001'))->>'duplicate','true',
  'support case creation is idempotent');
select throws_ok(
  $$select public.open_support_case('not_a_category','Subject line','Body text','support-key-0002')$$,
  '22023','Invalid support category','an unknown support category is refused');
select is(pg_catalog.jsonb_array_length(public.get_my_support_cases()),1,'a requester sees their own case');
reset role;

select set_config('wps017.support_case', (select id::text from public.support_tickets limit 1), false);

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000002');
select ok((public.staff_add_support_note(current_setting('wps017.support_case')::uuid,
  'Internal: the gateway is disabled in this environment.','support-note-0001'))->>'noteId' is not null,
  'staff can add a private note to a support case');
select is((public.staff_transition_support_case(current_setting('wps017.support_case')::uuid,
  'in_progress',null,'Investigating','support-trans-0001'))->>'status','in_progress',
  'staff can move a support case');
-- Escalation must reference the authoritative record instead of copying it.
select throws_ok(
  $$select public.staff_transition_support_case(current_setting('wps017.support_case')::uuid,
    'escalated',null,'Escalating','support-trans-0002')$$,
  '22023','Escalation must reference the authoritative record',
  'escalation must point at the authoritative domain record');
select is(pg_catalog.jsonb_array_length((public.get_staff_support_case(
  current_setting('wps017.support_case')::uuid))->'messages'),2,
  'staff see both the participant message and the private note');
reset role;

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000006');
select is(pg_catalog.jsonb_array_length((public.get_my_support_cases())->0->'messages'),1,
  'a participant never sees the staff-private note');
select is((select count(*)::integer from public.support_messages where visibility='staff'),0,
  'RLS hides staff-private support notes from the participant');
select throws_ok($$select public.get_staff_support_case(current_setting('wps017.support_case')::uuid)$$,
  '42501','Staff capability required','a participant cannot open the staff support view');
reset role;

select throws_ok($$update public.support_ticket_events set note='changed'$$,'55000',
  'Support case history is immutable','support case history cannot be rewritten');

-- ---------------------------------------------------------------------------
-- Incidents
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000005');
select ok((public.staff_open_incident('payment_provider_outage','sev2',
  'The sandbox gateway is returning errors for every attempt.',
  array['payments','checkout'],'incident-key-0001'))->>'incidentId' is not null,
  'an operations manager can open an incident');
select is((public.staff_open_incident('payment_provider_outage','sev2',
  'The sandbox gateway is returning errors for every attempt.',
  array['payments','checkout'],'incident-key-0001'))->>'duplicate','true','incidents are idempotent');
select is((public.staff_update_incident((select id from public.operational_incidents limit 1),
  'mitigation','Disabled the online payment methods.','incident-key-0002','mitigating'))->>'duplicate','false',
  'an incident can be updated');
select throws_ok(
  $$select public.staff_update_incident((select id from public.operational_incidents limit 1),
    'not_an_event','Detail text','incident-key-0003')$$,
  '22023','Invalid incident event','an unknown incident event is refused');
select ok(pg_catalog.jsonb_array_length(public.get_staff_incidents()) >= 1,'open incidents are listed');
reset role;

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000004');
select throws_ok($$select public.get_staff_incidents()$$,'42501','Staff capability required',
  'a financial operator cannot read incidents');
select is((select count(*)::integer from public.operational_incidents),0,'RLS hides incidents without the capability');
reset role;

select throws_ok($$update public.operational_incident_events set detail='changed'$$,'55000',
  'Support case history is immutable','the incident timeline is immutable');

-- ---------------------------------------------------------------------------
-- Audit explorer
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000001');
select ok((public.staff_audit_search('staff_audit',null,null))->'rows' is not null,
  'a security administrator can read the staff audit');
select ok((public.staff_audit_search('staff_role_history',null,null))->'rows' is not null,
  'staff role history is explorable');
select ok((public.staff_audit_search('configuration_history',null,null))->'rows' is not null,
  'configuration history is explorable');
select throws_ok($$select public.staff_audit_search('not_a_source',null,null)$$,'22023',
  'Unknown audit source','an unknown audit source is refused');
select throws_ok(
  $$select public.staff_audit_search('staff_audit', now() - interval '400 days', now())$$,
  '22023','Audit range must be within 366 days','an unbounded audit range is refused');
reset role;
select ok((select count(*) from private.staff_access_log where surface='audit_explorer') >= 3,
  'audit explorer access is itself audited');

select throws_ok($$update private.staff_audit_events set reason='changed'$$,'55000',
  'Staff audit is immutable','the staff audit cannot be rewritten');
select throws_ok($$delete from private.staff_audit_events$$,'55000',
  'Staff audit is immutable','the staff audit cannot be deleted');
select throws_ok($$update private.staff_access_log set result_count=0$$,'55000',
  'Staff audit is immutable','the access log cannot be rewritten');

-- ---------------------------------------------------------------------------
-- Analytics: aggregate only, bounded, timezone aware
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000005');
select is((public.get_staff_analytics('executive'))->>'timezone','Africa/Cairo',
  'analytics report their display timezone');
select ok((public.get_staff_analytics('marketplace'))->'metrics' is not null,'the marketplace dashboard renders');
select ok((public.get_staff_analytics('bookings'))->'metrics' is not null,'the bookings dashboard renders');
select ok((public.get_staff_analytics('workers'))->'metrics' is not null,'the workers dashboard renders');
select ok((public.get_staff_analytics('customers'))->'metrics' is not null,'the customers dashboard renders');
select ok((public.get_staff_analytics('trust'))->'metrics' is not null,'the trust dashboard renders');
select ok((public.get_staff_analytics('verification'))->'metrics' is not null,'the verification dashboard renders');
select ok((public.get_staff_analytics('notifications'))->'metrics' is not null,'the notification dashboard renders');
select throws_ok($$select public.get_staff_analytics('not_a_dashboard')$$,'22023','Unknown dashboard',
  'an unknown dashboard is refused');
select throws_ok(
  $$select public.get_staff_analytics('marketplace','2020-01-01'::date,'2026-01-01'::date)$$,
  '22023','Reporting period is too wide','an unbounded analytics range is refused');
-- Financial analytics need the ledger capability even with the analytics one.
select throws_ok($$select public.get_staff_analytics('financial')$$,'42501','Staff capability required',
  'financial analytics require the ledger capability');
select is((public.get_staff_analytics('marketplace'))->>'partial','true',
  'a period that includes today is flagged as partial');
select is((public.get_staff_analytics('notifications'))->'metrics'->>'pushDeliveryEnabled','false',
  'the notification dashboard reports push as disabled');
reset role;

-- ---------------------------------------------------------------------------
-- Exports
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000005');
select is((public.staff_reauthenticate())->>'reauthValid','true','exports require re-authentication');
select throws_ok(
  $$select public.staff_request_export('not_a_report',current_date,current_date,'A reason for this export','exp-key-0001')$$,
  '22023','Unknown export report','an unknown export report is refused');
select throws_ok(
  $$select public.staff_request_export('dispute_outcomes','2020-01-01'::date,current_date,'A reason for this export','exp-key-0002')$$,
  '22023','Export range must be within 366 days','an unbounded export range is refused');
select throws_ok(
  $$select public.staff_request_export('dispute_outcomes',current_date - 7,current_date,'short','exp-key-0003')$$,
  '22023','A reason is required for a sensitive export','a sensitive export requires a reason');
select ok((public.staff_request_export('dispute_outcomes',current_date - 7,current_date,
  'Monthly dispute quality review for the operations report','exp-key-0004'))->>'exportId' is not null,
  'an approved export can be requested');
select is((public.staff_request_export('dispute_outcomes',current_date - 7,current_date,
  'Monthly dispute quality review for the operations report','exp-key-0004'))->>'duplicate','true',
  'export requests are idempotent');
reset role;

select set_config('wps017.export_request', (select id::text from private.staff_export_requests limit 1), false);

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000005');
select is((public.staff_export_preview(current_setting('wps017.export_request')::uuid))->>'fileDeliveryAvailable',
  'false','file delivery is explicitly unavailable and fails closed');
select ok((public.staff_export_preview(current_setting('wps017.export_request')::uuid))->'columns' is not null,
  'an export returns only allowlisted columns');
reset role;

-- Another staff member cannot download someone else's export.
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000003');
select is((public.staff_reauthenticate())->>'reauthValid','true','the second manager re-authenticates');
select throws_ok(
  $$select public.staff_export_preview(current_setting('wps017.export_request')::uuid)$$,
  '42501','This export belongs to another staff member','an export cannot be downloaded by another staff member');
reset role;
select ok((select count(*) from private.staff_access_log where surface='export_preview') >= 1,
  'export downloads are audited');
select ok((select count(*) from private.staff_audit_events where action='export_requested') >= 1,
  'export requests are audited with their reason');

-- ---------------------------------------------------------------------------
-- Staff notification isolation
-- ---------------------------------------------------------------------------
select ok((select count(*) from public.notifications where audience='staff') >= 1,
  'staff notifications were produced by case assignment');
select is((select count(*)::integer from public.notifications
  where audience='staff' and user_id is null),0,'staff notifications always have an owner');
select is(private.notification_visible_in_mode('staff','customer'), false,
  'a staff notification is never visible in customer mode');
select is(private.notification_visible_in_mode('staff','worker'), false,
  'a staff notification is never visible in worker mode');
select is(private.notification_visible_in_mode('staff','staff'), true,
  'a staff notification is visible in staff mode');
select is(private.notification_mode_allowed('a1700000-0000-4000-8000-000000000006','staff'), false,
  'a customer cannot open the staff inbox');
select is(private.notification_mode_allowed('a1700000-0000-4000-8000-000000000003','staff'), true,
  'a staff member can open the staff inbox');
select is(private.notification_audience('a1700000-0000-4000-8000-000000000003','staff_case_assigned','{}'::jsonb),
  'staff','a staff event always resolves to the staff audience');

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000003');
select ok(pg_catalog.jsonb_array_length(public.get_my_notifications('staff',null,null,20,false,null)) >= 1,
  'a reviewer sees their staff notifications');
reset role;
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000006');
select throws_ok($$select public.get_my_notifications('staff',null,null,20,false,null)$$,
  '42501','Notification mode is not available','a customer cannot query the staff inbox');
select is(pg_catalog.jsonb_array_length(public.get_my_notifications('customer',null,null,20,false,null)),0,
  'no staff notification leaks into a customer inbox');
reset role;

-- Push and reminders stay disabled: nothing in WPS-017 turns them on.
select is((select push_delivery_enabled from private.notification_configuration where singleton), false,
  'push delivery remains disabled');
select is((select token_registration_enabled from private.notification_configuration where singleton), false,
  'push token registration remains disabled');
select is((select scheduler_enabled from private.notification_configuration where singleton), false,
  'the notification scheduler remains disabled');

-- ---------------------------------------------------------------------------
-- Role removal, session revocation, and account state
-- ---------------------------------------------------------------------------
select set_config('wps017.support_grant', (select id::text from public.staff_role_grants g
  where g.user_id='a1700000-0000-4000-8000-000000000002' and g.role_key='support_agent'
    and g.revoked_at is null), false);

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000001');
select is((public.staff_reauthenticate())->>'reauthValid','true','the administrator re-authenticates to revoke');
select is((public.staff_revoke_role(current_setting('wps017.support_grant')::uuid,
  'Left the support team'))->>'duplicate','false','a role can be revoked');
select is((public.staff_revoke_role(current_setting('wps017.support_grant')::uuid,
  'Left the support team'))->>'duplicate','true','revocation is idempotent');
reset role;

set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000002');
select is((public.get_staff_session())->>'isStaff','false','a revoked staff member loses access immediately');
select throws_ok($$select public.get_staff_home()$$,'42501','Staff capability required',
  'a revoked staff member cannot open the operational home');
select is((public.get_staff_session())->>'reauthValid','false',
  'revoking a role clears the session attestation');
reset role;

-- A suspended account is never staff, whatever grants it holds.
insert into public.trust_account_state(user_id,trust_level,public_reason)
values ('a1700000-0000-4000-8000-000000000004','suspended','Account under review')
on conflict (user_id) do update set trust_level='suspended';
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000004');
select is((public.get_staff_session())->>'isStaff','false','a suspended account is never staff');
select throws_ok($$select public.get_staff_worker_overview('b1700000-0000-4000-8000-000000000001')$$,
  '42501','Staff capability required','a suspended account loses every capability');
reset role;

-- A staff member can revoke their own sessions.
set local role authenticated;
select pg_temp.act_as('a1700000-0000-4000-8000-000000000005');
select ok((public.staff_revoke_my_sessions())->>'revoked' is not null,'a staff member can revoke their sessions');
select is((public.get_staff_session())->>'reauthValid','false','revoking sessions clears re-authentication');
reset role;

-- ---------------------------------------------------------------------------
-- Security: no service role, no arbitrary execution, no private exposure
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema='private' and grantee in ('anon','authenticated','PUBLIC')
     and table_name in ('staff_platform_configuration','staff_audit_events','staff_access_log',
       'staff_session_attestations','operational_case_notes','staff_configuration_domains',
       'staff_configuration_versions','staff_feature_flags','staff_feature_flag_history',
       'staff_kill_switches','staff_kill_switch_events','staff_export_catalog','staff_export_requests')),
  0,'no private WPS-017 table is exposed to a client role');

select is(has_function_privilege('authenticated','private.staff_capability_keys(uuid)','EXECUTE'),false,
  'a client cannot enumerate another account''s capabilities');
select is(has_function_privilege('authenticated','private.staff_active_role_keys(uuid)','EXECUTE'),false,
  'a client cannot enumerate another account''s roles');
select is(has_function_privilege('authenticated','private.require_staff_capability(text)','EXECUTE'),false,
  'a client cannot call the capability gate directly');
select is(has_function_privilege('authenticated','private.record_staff_audit(uuid,text,text,text,uuid,text,jsonb)','EXECUTE'),
  false,'a client cannot write staff audit rows');
select is(has_function_privilege('authenticated','private.staff_log_access(uuid,text,text,text,integer)','EXECUTE'),
  false,'a client cannot write access-log rows');
select is(has_function_privilege('authenticated','private.notify_staff(uuid,text,jsonb,text)','EXECUTE'),false,
  'a client cannot emit a staff notification');
select is(has_function_privilege('authenticated','private.staff_queue_backlog(text,integer)','EXECUTE'),false,
  'a client cannot read a raw queue backlog');
select is(has_function_privilege('authenticated','private.bootstrap_staff_role(uuid,text,text)','EXECUTE'),false,
  'a client cannot bootstrap a staff role');
select is(has_function_privilege('authenticated','private.staff_configuration_payload_valid(text,jsonb)','EXECUTE'),
  false,'a client cannot probe configuration validation');
select is(has_function_privilege('anon','public.get_staff_session()','EXECUTE'),false,
  'anonymous callers have no staff surface');
select is(has_function_privilege('anon','public.staff_safe_search(text,text)','EXECUTE'),false,
  'anonymous callers cannot search');
select is(has_function_privilege('anon','public.get_staff_analytics(text,date,date)','EXECUTE'),false,
  'anonymous callers cannot read analytics');
select is(has_function_privilege('anon','public.staff_audit_search(text,timestamptz,timestamptz,uuid,uuid,integer,integer)','EXECUTE'),
  false,'anonymous callers cannot read the audit explorer');
select is(has_function_privilege('authenticated','public.get_staff_session()','EXECUTE'),true,
  'an authenticated caller may ask whether it is staff');

-- There is no generic executor and no raw SQL surface.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in ('execute_sql','run_sql','exec','admin_query','staff_execute','raw_query','staff_sql')),
  0,'no arbitrary SQL executor exists');

-- Clients cannot write any WPS-017 table directly.
select is(has_table_privilege('authenticated','public.staff_role_grants','INSERT'),false,'clients cannot grant roles');
select is(has_table_privilege('authenticated','public.staff_role_grants','UPDATE'),false,'clients cannot edit grants');
select is(has_table_privilege('authenticated','public.staff_role_capabilities','INSERT'),false,
  'clients cannot rewrite the capability map');
select is(has_table_privilege('authenticated','public.staff_capabilities','UPDATE'),false,
  'clients cannot redefine a capability');
select is(has_table_privilege('authenticated','public.operational_assignments','INSERT'),false,
  'clients cannot forge operational cases');
select is(has_table_privilege('authenticated','public.operational_assignments','UPDATE'),false,
  'clients cannot rewrite operational cases');
select is(has_table_privilege('authenticated','public.operational_incidents','INSERT'),false,
  'clients cannot forge incidents');
select is(has_table_privilege('authenticated','public.support_ticket_events','INSERT'),false,
  'clients cannot forge support history');
select is(has_table_privilege('authenticated','public.support_messages','INSERT'),false,
  'clients cannot insert support messages directly');
select is(has_table_privilege('anon','public.staff_roles','SELECT'),false,'anon cannot read the role catalog');
select is(has_table_privilege('anon','public.operational_assignments','SELECT'),false,'anon cannot read cases');
select is(has_table_privilege('anon','public.operational_incidents','SELECT'),false,'anon cannot read incidents');

-- Every WPS-017 SECURITY DEFINER function pins an empty search_path.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where p.prosecdef and n.nspname in ('public','private')
     and (p.proname like 'staff\_%' or p.proname like 'get\_staff\_%' or p.proname like 'operational\_%'
          or p.proname like '%\_staff\_%'
          or p.proname in ('get_my_feature_flags','get_platform_operational_status',
             'open_support_case','reply_support_case','get_my_support_cases','bootstrap_staff_role'))
     and not (coalesce(array_to_string(p.proconfig,','),'') like '%search_path=""%')),
  0,'every WPS-017 security definer function pins an empty search path');

select is((select relrowsecurity from pg_class where oid='public.staff_role_grants'::regclass),true,'RLS on role grants');
select is((select relrowsecurity from pg_class where oid='public.staff_queues'::regclass),true,'RLS on the queue catalog');
select is((select relrowsecurity from pg_class where oid='public.operational_assignments'::regclass),true,'RLS on assignments');
select is((select relrowsecurity from pg_class where oid='public.operational_incidents'::regclass),true,'RLS on incidents');
select is((select relrowsecurity from pg_class where oid='public.support_ticket_events'::regclass),true,'RLS on support history');

select is(
  (select count(*)::integer from pg_catalog.pg_publication_tables
   where pubname='supabase_realtime'
     and tablename in ('staff_role_grants','operational_assignments','operational_assignment_events',
       'operational_incidents','operational_incident_events','support_ticket_events',
       'staff_roles','staff_capabilities','staff_role_capabilities','staff_queues')),
  0,'no WPS-017 table is broadcast over Realtime');
select is(
  (select count(*)::integer from pg_catalog.pg_publication_tables
   where pubname='supabase_realtime' and schemaname='private'),
  0,'no private table is broadcast over Realtime');

select * from finish();
rollback;
