begin;
select no_plan();

-- WPS-023 — Authentication, Role-Based Onboarding & Worker Vetting.
--
-- The questions this suite exists to answer, because each one fails silently
-- and looks correct right up until somebody is harmed:
--   * can a signed-out caller reach an operational or staff function?
--   * can a client grant itself the worker role by asking for it?
--   * can an upload, an extraction or a confidence score approve anybody?
--   * can a worker act before every activation gate passes?
--   * can one worker read another worker's identity or certificate?
--   * can a reviewer decide the appeal against their own decision?
--   * does an offence detail, a National ID or a filename escape anywhere?

create function pg_temp.act_as(p_uid uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid::text, 'role', 'authenticated', 'aal', 'aal1',
    'session_id', p_uid::text,
    'amr', jsonb_build_array(jsonb_build_object(
      'method','password','timestamp', floor(extract(epoch from now()))::bigint))
  )::text, true);
end $fn$;

create function pg_temp.act_as_nobody()
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','',true);
end $fn$;

-- Comments are stripped before a body is searched, so a comment explaining why
-- something is absent can never satisfy the check for that absence.
create function pg_temp.code_of(p_schema text, p_name text)
returns text language sql stable as $fn$
  select coalesce(string_agg(
    regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'), E'\n'), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = p_schema and p.proname = p_name and p.prokind = 'f';
$fn$;

create function pg_temp.signup_manifest(p_role text, p_language text default 'en')
returns jsonb language sql stable as $fn$
  select jsonb_agg(jsonb_build_object(
    'documentKey', d.document_key,
    'version', v.version,
    'language', p_language,
    'renderedHash', case when p_language = 'ar'
      then v.content_hash_ar else v.content_hash_en end
  ) order by d.sort_order)
  from public.legal_documents d
  join lateral (select * from private.legal_current_version(d.document_key)) v on true
  where d.active and d.requires_acceptance
    and (d.audience = 'all' or d.audience = p_role)
$fn$;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select has_table('public','account_onboarding','role and onboarding state exists');
select has_table('public','worker_onboarding_events','the lifecycle history exists');
select has_table('public','worker_criminal_record_submissions','certificate metadata exists');
select has_table('private','worker_onboarding_evidence','staff evidence is private');
select has_table('private','worker_identity_extractions','extraction candidates are private');
select has_table('private','worker_criminal_record_review','certificate assessments are private');
select has_table('private','worker_vetting_policies','the versioned policy exists');
select has_table('private','worker_auth_identities','the trusted worker phone mapping exists');

select has_function('private','worker_activation_gates',array['uuid'],'the activation gates exist');
select has_function('private','worker_capability_active',array['uuid'],'the single worker permission answer exists');
select has_function('private','require_active_worker',array[]::text[],'the worker operation gate exists');
select has_function('private','worker_transition',
  array['uuid','text','uuid','text','text','text','text','text'],'the state machine writer exists');
select has_function('public','select_my_account_role',array['text'],'role selection exists');
select has_function('public','get_my_onboarding_state',array[]::text[],'the routing authority exists');
select has_function('public','confirm_my_service_address',
  array['uuid','double precision','double precision','text','text','text','text','text','text'],
  'address confirmation exists');
select has_function('public','staff_worker_vetting_decision',
  array['uuid','text','text','text','text'],'staff decisions exist');
select has_function('public','prepare_worker_auth_registration',array['text','uuid'],
  'the service-side worker registration preflight exists');
select has_function('public','resolve_worker_auth_identity',array['text'],
  'the service-side worker phone resolver exists');

select is(has_function_privilege('anon','public.prepare_worker_auth_registration(text,uuid)','EXECUTE'),
  false, 'ANON CANNOT PREFLIGHT WORKER REGISTRATION DIRECTLY');
select is(has_function_privilege('authenticated','public.prepare_worker_auth_registration(text,uuid)','EXECUTE'),
  false, 'AUTHENTICATED CLIENTS CANNOT PREFLIGHT WORKER REGISTRATION DIRECTLY');
select is(has_function_privilege('anon','public.resolve_worker_auth_identity(text)','EXECUTE'),
  false, 'ANON CANNOT RESOLVE A WORKER PHONE TO AN AUTH IDENTITY');
select is(has_function_privilege('authenticated','public.resolve_worker_auth_identity(text)','EXECUTE'),
  false, 'AUTHENTICATED CLIENTS CANNOT RESOLVE A WORKER PHONE TO AN AUTH IDENTITY');
select is(has_function_privilege('service_role','public.resolve_worker_auth_identity(text)','EXECUTE'),
  true, 'THE EDGE SERVICE ROLE CAN RESOLVE A WORKER PHONE');
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema='private' and table_name='worker_auth_identities'
     and grantee in ('PUBLIC','anon','authenticated','service_role')),
  0, 'NO API ROLE CAN READ THE WORKER AUTH MAPPING TABLE DIRECTLY');
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema='private' and table_name='worker_auth_registrations'
     and grantee in ('PUBLIC','anon','authenticated','service_role')),
  0, 'NO API ROLE CAN READ THE TRUSTED REGISTRATION RESERVATIONS');

-- Every WPS-023 function carries an empty search_path.
select is(
  (select count(*)::integer
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public','private')
     and p.prokind = 'f'
     and (p.proname like 'worker\_%' or p.proname like '%\_worker\_%'
          or p.proname like '%onboarding%' or p.proname like '%vetting%'
          or p.proname like '%identity\_%' or p.proname like '%criminal\_record%')
     and not coalesce(array_to_string(p.proconfig,',') like '%search_path=""%', false)),
  0, 'EVERY WPS-023 FUNCTION SETS AN EMPTY SEARCH PATH');

-- ---------------------------------------------------------------------------
-- Section 0 repair: signed-out reachability
-- ---------------------------------------------------------------------------
--
-- The audit found fifteen public functions executable by `anon` through a
-- residual PUBLIC grant, including six WPS-022 staff functions. WPS-022 tried
-- to close them with `revoke ... from anon`, which cannot remove a PUBLIC
-- grant, so every one of those revokes was a no-op. These assertions check the
-- PRIVILEGE rather than the runtime behaviour, which is precisely what the
-- earlier suite could not see.
select is(has_function_privilege('anon','public.staff_create_legal_hold(uuid,text,text,text,timestamptz)','EXECUTE'),
  false, 'ANON CANNOT REACH THE LEGAL HOLD FUNCTION');
select is(has_function_privilege('anon','public.staff_release_legal_hold(uuid,text)','EXECUTE'),
  false, 'anon cannot reach legal hold release');
select is(has_function_privilege('anon','public.staff_privacy_requests(integer)','EXECUTE'),
  false, 'anon cannot reach the staff privacy queue');
select is(has_function_privilege('anon','public.staff_data_inventory()','EXECUTE'),
  false, 'anon cannot reach the data inventory');
select is(has_function_privilege('anon','public.staff_retention_dry_run(text)','EXECUTE'),
  false, 'anon cannot reach retention previews');
select is(has_function_privilege('anon','public.staff_storage_orphan_preview(text)','EXECUTE'),
  false, 'anon cannot reach storage orphan previews');
select is(has_function_privilege('anon','public.request_account_deletion(text,text)','EXECUTE'),
  false, 'ANON CANNOT REACH ACCOUNT DELETION');
select is(has_function_privilege('anon','public.set_my_account_deactivated(boolean)','EXECUTE'),
  false, 'anon cannot reach deactivation');
select is(has_function_privilege('anon','public.record_my_consent(text,boolean,text)','EXECUTE'),
  false, 'anon cannot record a consent');
select is(has_function_privilege('anon','public.request_my_data_export(text)','EXECUTE'),
  false, 'anon cannot request an export');
select is(has_function_privilege('anon','public.clear_my_privacy_history(text)','EXECUTE'),
  false, 'anon cannot clear a history');

-- `authenticated` keeps every one of them: the repair removed a PUBLIC grant,
-- not a working one.
select is(has_function_privilege('authenticated','public.request_account_deletion(text,text)','EXECUTE'),
  true, 'the repair did not remove authenticated access');
select is(has_function_privilege('authenticated','public.staff_data_inventory()','EXECUTE'),
  true, 'staff functions remain reachable by signed-in callers');

-- The WPS-020 sanctioned anonymous read surface is preserved exactly.
select is(has_function_privilege('anon','public.search_providers(text,jsonb,text,integer,integer)','EXECUTE'),
  true, 'WPS-020 anonymous search is preserved');
select is(has_function_privilege('anon','public.get_discovery_home(text)','EXECUTE'),
  true, 'WPS-020 anonymous discovery home is preserved');
select is(has_function_privilege('anon','public.get_marketplace_catalog()','EXECUTE'),
  true, 'the anonymous catalog read is preserved');

-- And the whole surface is bounded: exactly the nine allowlisted reads, and
-- nothing else, whatever gets added later.
select is(
  (select count(*)::integer
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not in (
       'get_marketplace_catalog','get_marketplace_catalog_v2','get_discovery_home',
       'get_discovery_filters','get_search_suggestions','search_providers',
       'get_provider_rating_summary','get_provider_reputation_summary',
       'get_provider_trust_indicators')),
  0, 'NO FUNCTION OUTSIDE THE SANCTIONED READ SURFACE IS ANON EXECUTABLE');

-- No WPS-023 function is reachable signed out.
select is(has_function_privilege('anon','public.select_my_account_role(text)','EXECUTE'),
  false, 'a signed-out caller cannot select a role');
select is(has_function_privilege('anon','public.get_my_onboarding_state()','EXECUTE'),
  false, 'a signed-out caller cannot read an onboarding state');
select is(has_function_privilege('anon','public.submit_my_criminal_record(text,text,bigint,text,date,text,text)','EXECUTE'),
  false, 'a signed-out caller cannot submit a certificate');
select is(has_function_privilege('anon','public.staff_worker_vetting_decision(uuid,text,text,text,text)','EXECUTE'),
  false, 'A SIGNED-OUT CALLER CANNOT DECIDE A VETTING CASE');
select is(has_function_privilege('anon','public.staff_worker_document_reference(uuid,text)','EXECUTE'),
  false, 'a signed-out caller cannot reach a document reference');

-- Anonymous table reach.
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema in ('public','private')
     and table_name in ('account_onboarding','worker_onboarding_events',
                        'worker_criminal_record_submissions','worker_onboarding_evidence',
                        'worker_identity_extractions','worker_criminal_record_review',
                        'worker_vetting_policies')
     and grantee in ('anon','PUBLIC')),
  0, 'ANON HOLDS NO GRANT ON ANY WPS-023 TABLE');

-- Private tables are unreachable by any client at all.
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'private'
     and table_name in ('worker_onboarding_evidence','worker_identity_extractions',
                        'worker_criminal_record_review','worker_vetting_policies')
     and grantee in ('anon','authenticated','PUBLIC')),
  0, 'NO CLIENT ROLE HOLDS ANY GRANT ON PRIVATE VETTING DATA');

-- Public WPS-023 tables are select-only. Every write is a function.
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('account_onboarding','worker_onboarding_events',
                        'worker_criminal_record_submissions')
     and grantee = 'authenticated'
     and privilege_type <> 'SELECT'),
  0, 'CLIENTS HOLD NO DIRECT WRITE ON ANY WPS-023 TABLE');

-- ---------------------------------------------------------------------------
-- Policy and configuration posture
-- ---------------------------------------------------------------------------
select is((select legal_review_status from private.worker_vetting_policies where policy_version = 'wps023-v1'),
  'pending', 'THE VETTING POLICY IS NOT LEGALLY APPROVED');
select is((select count(*)::integer from private.worker_vetting_policies where legal_review_status = 'approved'),
  0, 'no vetting policy claims legal approval');
select is((select count(*)::integer from private.privacy_retention_rules
           where rule_key in ('worker_criminal_records','worker_identity_extractions')
             and (enabled or legal_review_status = 'approved')),
  0, 'NO WPS-023 RETENTION RULE IS ENABLED OR APPROVED');
select is((select count(*)::integer from private.staff_feature_flags
           where flag_key in ('authentication_gateway','worker_vetting','identity_extraction','location_provider')
             and enabled),
  0, 'EVERY WPS-023 SURFACE SHIPS DISABLED');

-- The rejected rule, asserted as absent rather than described as absent.
select is((select count(*)::integer from private.worker_vetting_policies
           where assessment_criteria::text like '%automatic%'
              or assessment_criteria::text like '%12 month%'
              or assessment_criteria::text like '%twelve month%'),
  0, 'NO AUTOMATIC TIME-WINDOW REJECTION RULE IS ENCODED');
select is((select count(*)::integer
           from jsonb_array_elements(
             (select assessment_criteria from private.worker_vetting_policies where policy_version='wps023-v1')) c
           where c ->> 'weighting' <> 'reviewer_judgement'),
  0, 'EVERY POLICY FACTOR IS REVIEWER JUDGEMENT, NOT A COMPUTED WEIGHT');

-- No code path anywhere reads the policy criteria to produce an outcome.
select is((select count(*)::integer from (
    select pg_temp.code_of('public','staff_record_certificate_outcome') c) s
  where s.c like '%assessment_criteria%'),
  0, 'NO OUTCOME FUNCTION READS THE POLICY CRITERIA');
select is((select count(*)::integer from (
    select pg_temp.code_of('public','staff_worker_vetting_decision') c) s
  where s.c like '%confidence%' or s.c like '%worker_identity_extractions%'),
  0, 'NO VETTING DECISION READS AN EXTRACTION OR A CONFIDENCE SCORE');
select is((select count(*)::integer from (
    select pg_temp.code_of('private','worker_activation_gates') c) s
  where s.c like '%confidence%' or s.c like '%worker_identity_extractions%'),
  0, 'NO ACTIVATION GATE READS AN EXTRACTION OR A CONFIDENCE SCORE');

-- Model A: nothing claims a government integration.
select is((select count(*)::integer from (
    select pg_temp.code_of('public','submit_my_criminal_record') c
    union all select pg_temp.code_of('public','staff_record_certificate_outcome')) s
  where s.c ~* 'ministry|government|interior|official_lookup|authenticity_confirmed'),
  0, 'NOTHING CLAIMS A MINISTRY OR GOVERNMENT LOOKUP');

-- ---------------------------------------------------------------------------
-- State machine
-- ---------------------------------------------------------------------------
select ok(private.worker_transition_allowed('identity_required','identity_submitted','worker'),
  'a worker may submit their identity');
select ok(not private.worker_transition_allowed('identity_required','approved','worker'),
  'A WORKER CANNOT APPROVE THEMSELVES');
select ok(not private.worker_transition_allowed('identity_required','active','worker'),
  'A WORKER CANNOT ACTIVATE THEMSELVES');
select ok(not private.worker_transition_allowed('criminal_record_submitted','active','worker'),
  'an upload does not activate anybody');
select ok(not private.worker_transition_allowed('criminal_record_submitted','approved','staff'),
  'a certificate must be reviewed before approval');
select ok(private.worker_transition_allowed('criminal_record_under_review','approved','staff'),
  'staff may approve after a certificate review');
select ok(private.worker_transition_allowed('approved','active','staff'),
  'staff may activate an approved worker');
select ok(not private.worker_transition_allowed('approved','active','system'),
  'THE SYSTEM CANNOT ACTIVATE A WORKER');
select ok(not private.worker_transition_allowed('rejected','approved','worker'),
  'a rejected worker cannot approve themselves');
select ok(private.worker_transition_allowed('rejected','appeal_pending','worker'),
  'a rejected worker may appeal');
select ok(not private.worker_transition_allowed('account_created','active','staff'),
  'no shortcut from account creation to active exists');
select ok(not private.worker_transition_allowed(null,'active','system'),
  'the system may only record account creation');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
set local role postgres;

insert into auth.users (id, instance_id, aud, role, email, phone, phone_confirmed_at,
                        encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('a2300000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'wps023.worker@example.com','+201230000001', now(), 'x', now(), now(), now(), '{}','{}'),
  ('a2300000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'wps023.other@example.com','+201230000002', now(), 'x', now(), now(), now(), '{}','{}'),
  ('a2300000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'wps023.customer@example.com','+201230000003', now(), 'x', now(), now(), now(), '{}','{}'),
  ('a2300000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'wps023.reviewer@example.com','+201230000004', now(), 'x', now(), now(), now(), '{}','{}'),
  ('a2300000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'wps023.reviewer2@example.com','+201230000005', now(), 'x', now(), now(), now(), '{}','{}')
on conflict (id) do nothing;

insert into public.profiles (id, display_name, preferred_language)
values
  ('a2300000-0000-4000-8000-000000000001','WPS023 Worker','en'),
  ('a2300000-0000-4000-8000-000000000002','WPS023 Other Worker','en'),
  ('a2300000-0000-4000-8000-000000000003','WPS023 Customer','en'),
  ('a2300000-0000-4000-8000-000000000004','WPS023 Reviewer','en'),
  ('a2300000-0000-4000-8000-000000000005','WPS023 Second Reviewer','en')
on conflict (id) do nothing;

insert into public.customer_profiles (id)
values ('a2300000-0000-4000-8000-000000000001'),
       ('a2300000-0000-4000-8000-000000000002'),
       ('a2300000-0000-4000-8000-000000000003')
on conflict (id) do nothing;

insert into public.provider_profiles (id, user_id, display_name, profession_key, onboarding_status,
                                      about, avatar_url, is_published, is_verified)
values
  ('b2300000-0000-4000-8000-000000000001','a2300000-0000-4000-8000-000000000001',
   'WPS023 Worker','plumber','draft',
   'A biography long enough to satisfy the WPS-010 discoverability bound.', null, false, false),
  ('b2300000-0000-4000-8000-000000000002','a2300000-0000-4000-8000-000000000002',
   'WPS023 Other','electrician','draft',
   'Another biography long enough to satisfy the WPS-010 discoverability bound.', null, false, false)
on conflict (id) do nothing;

-- Two reviewers, so appeal independence can actually be tested.
insert into public.staff_role_grants (user_id, role_key, granted_by, reason, idempotency_key)
values
  ('a2300000-0000-4000-8000-000000000004','super_administrator','a2300000-0000-4000-8000-000000000004',
   'WPS-023 fixture reviewer','wps023-fixture-reviewer-1'),
  ('a2300000-0000-4000-8000-000000000005','super_administrator','a2300000-0000-4000-8000-000000000005',
   'WPS-023 fixture second reviewer','wps023-fixture-reviewer-2')
on conflict do nothing;

reset role;

-- ---------------------------------------------------------------------------
-- Signed-out denial at runtime
-- ---------------------------------------------------------------------------
select pg_temp.act_as_nobody();
set local role authenticated;

select throws_ok($$select public.get_my_onboarding_state()$$, '42501', null,
  'A SIGNED-OUT CALLER HAS NO ONBOARDING STATE');
select throws_ok($$select public.select_my_account_role('worker')$$, '42501', null,
  'a signed-out caller cannot select a role');
select throws_ok($$select public.submit_my_identity_for_review()$$, '42501', null,
  'a signed-out caller cannot submit an identity');
select throws_ok($$select public.confirm_my_identity_fields('X','29001011234567','1990-01-01',null)$$,
  '42501', null, 'a signed-out caller cannot confirm identity fields');
select throws_ok($$select public.submit_my_vetting_appeal('A statement long enough to pass.')$$,
  '42501', null, 'a signed-out caller cannot appeal');

reset role;

-- ---------------------------------------------------------------------------
-- Role selection
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2300000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok($$select public.select_my_account_role('staff')$$, '22023', null,
  'AN INVALID ROLE IS REFUSED');
select throws_ok($$select public.select_my_account_role('admin')$$, '22023', null,
  'a client cannot invent a privileged role');

select is((select public.select_my_account_role('worker') ->> 'intendedRole'), 'worker',
  'a worker role selection is recorded');
select is((select public.get_my_onboarding_state() ->> 'workerState'), 'account_created',
  'worker onboarding starts at account creation');

-- The point of the whole model: asking for the worker role grants nothing.
select is((select public.get_my_onboarding_state() ->> 'workerCapabilityActive'), 'false',
  'SELECTING WORKER GRANTS NO WORKER CAPABILITY');
select throws_ok($$select private.require_active_worker()$$, '42501', null,
  'A PENDING WORKER IS REFUSED AT EVERY WORKER OPERATION');

-- Customer capability is never lost.
select is((select public.get_my_onboarding_state() ->> 'customerState'), 'address_required',
  'a worker still carries a customer onboarding state');

reset role;
-- Read as DBA: `worker_capability_active` is deliberately unreachable by any
-- client role, so asserting on it has to happen outside a signed-in session.
set local role postgres;
select ok(not private.worker_capability_active('a2300000-0000-4000-8000-000000000001'),
  'a freshly selected worker has no capability');
reset role;

-- ---------------------------------------------------------------------------
-- Direct writes are refused
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2300000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$update public.account_onboarding set worker_state='active'
    where user_id='a2300000-0000-4000-8000-000000000001'$$,
  '42501', null, 'A CLIENT CANNOT WRITE ITS OWN WORKER STATE');
select throws_ok(
  $$insert into public.worker_onboarding_events(user_id,to_state,actor_kind,reason_code,safe_reason)
    values('a2300000-0000-4000-8000-000000000001','active','staff','x','Forged')$$,
  '42501', null, 'a client cannot forge lifecycle history');
select throws_ok(
  $$select private.worker_transition('a2300000-0000-4000-8000-000000000001','active',null,'staff','x','y')$$,
  '42501', null, 'NO CLIENT MAY CALL THE STATE MACHINE DIRECTLY');
select throws_ok($$select private.worker_activation_gates('a2300000-0000-4000-8000-000000000001')$$,
  '42501', null, 'no client may read the gates directly');

reset role;

-- ---------------------------------------------------------------------------
-- Customer address and map pin
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2300000-0000-4000-8000-000000000003');
set local role authenticated;

select is((select public.select_my_account_role('customer') ->> 'intendedRole'), 'customer',
  'a customer role selection is recorded');
select is((select public.get_my_onboarding_state() ->> 'addressConfirmed'), 'false',
  'a new customer has no confirmed address');

insert into public.addresses (id, customer_id, label, address_line, governorate)
values ('c2300000-0000-4000-8000-000000000001','a2300000-0000-4000-8000-000000000003',
        'Home','12 Test Street','Cairo');

-- Coordinates alone are not a confirmation.
select is((select public.get_my_onboarding_state() ->> 'addressConfirmed'), 'false',
  'an address without a confirmed pin does not count');

select throws_ok(
  $$select public.confirm_my_service_address('c2300000-0000-4000-8000-000000000001',
      null, null, 'manual_pin')$$,
  '22023', null, 'A CONFIRMED MAP PIN IS MANDATORY');
select throws_ok(
  $$select public.confirm_my_service_address('c2300000-0000-4000-8000-000000000001',
      95.0, 31.2, 'manual_pin')$$,
  '22023', null, 'an out-of-range coordinate is refused');
select throws_ok(
  $$select public.confirm_my_service_address('c2300000-0000-4000-8000-000000000001',
      30.05, 31.23, 'satellite_guess')$$,
  '22023', null, 'an unknown pin source is refused');

-- The GPS-denied path works exactly as well as the granted one.
select is((select public.confirm_my_service_address('c2300000-0000-4000-8000-000000000001',
            30.05, 31.23, 'manual_pin', '5', '2', '11', 'Next to the pharmacy') ->> 'confirmed'),
  'true', 'A MANUALLY PLACED PIN IS A FIRST-CLASS CONFIRMATION');
select is((select public.get_my_onboarding_state() ->> 'addressConfirmed'), 'true',
  'the confirmed pin completes customer onboarding');
select is((select public.get_my_onboarding_state() ->> 'customerState'), 'complete',
  'customer onboarding reports complete');

-- Another account's address is not confirmable.
reset role;
select pg_temp.act_as('a2300000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok(
  $$select public.confirm_my_service_address('c2300000-0000-4000-8000-000000000001',
      30.05, 31.23, 'manual_pin')$$,
  '42501', null, 'ONE ACCOUNT CANNOT CONFIRM ANOTHER ACCOUNT ADDRESS');
reset role;

-- ---------------------------------------------------------------------------
-- Identity documents
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2300000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok($$select public.submit_my_identity_for_review()$$, '22023', null,
  'BOTH SIDES OF THE IDENTITY DOCUMENT ARE REQUIRED');

select throws_ok(
  $$select public.confirm_my_identity_fields('W','29001011234567','1990-01-01',null)$$,
  '22023', null, 'a one-character legal name is refused');
select throws_ok(
  $$select public.confirm_my_identity_fields('WPS023 Worker','12345','1990-01-01',null)$$,
  '22023', null, 'a malformed national identifier is refused');
select throws_ok(
  $$select public.confirm_my_identity_fields('WPS023 Worker','29001011234567','2099-01-01',null)$$,
  '22023', null, 'a future date of birth is refused');

select is((select public.confirm_my_identity_fields(
            'WPS023 Worker','290 010 112 345 67','1990-01-01','2030-01-01') ->> 'last4'),
  '4567', 'identity fields are confirmed and the last four are returned');

reset role;
set local role postgres;
-- Only the hash and the last four survive. The number itself is never stored.
select is((select national_id_last4 from private.provider_verification_identities
           where provider_id='b2300000-0000-4000-8000-000000000001'), '4567',
  'the last four digits are retained');
select ok((select national_id_hash ~ '^[0-9a-f]{64}$' from private.provider_verification_identities
           where provider_id='b2300000-0000-4000-8000-000000000001'),
  'the identifier is stored as a hash');
select is((select count(*)::integer from private.provider_verification_identities
           where provider_id='b2300000-0000-4000-8000-000000000001'
             and national_id_hash like '%29001011234567%'),
  0, 'THE FULL NATIONAL ID NUMBER IS NEVER STORED');

-- Both document sides, registered through the WPS-006 authority.
insert into public.provider_verification_documents
  (id, provider_id, document_type, storage_path, mime_type, file_size_bytes, page_side, capture_source)
values
  ('d2300000-0000-4000-8000-000000000001','b2300000-0000-4000-8000-000000000001',
   'national_id_front','a2300000-0000-4000-8000-000000000001/front.jpg','image/jpeg',100000,'front','camera'),
  ('d2300000-0000-4000-8000-000000000002','b2300000-0000-4000-8000-000000000001',
   'national_id_back','a2300000-0000-4000-8000-000000000001/back.jpg','image/jpeg',100000,'back','camera');

-- Extraction candidates exist but decide nothing.
insert into private.worker_identity_extractions
  (provider_id, document_id, provider_key, field_key, candidate_value, confidence, requires_manual_entry)
values
  ('b2300000-0000-4000-8000-000000000001','d2300000-0000-4000-8000-000000000001',
   'mock','national_id_number','29001011234567',0.42,true),
  ('b2300000-0000-4000-8000-000000000001','d2300000-0000-4000-8000-000000000001',
   'mock','date_of_birth','1990-01-01',0.97,false);
reset role;

select pg_temp.act_as('a2300000-0000-4000-8000-000000000001');
set local role authenticated;

select is((select count(*)::integer from jsonb_array_elements(public.get_my_identity_candidates())), 2,
  'the worker sees their own extraction candidates');
select is((select c ->> 'candidateValue' from jsonb_array_elements(public.get_my_identity_candidates()) c
           where c ->> 'fieldKey' = 'national_id_number'), '4567',
  'THE CANDIDATE NATIONAL ID IS MASKED TO ITS LAST FOUR DIGITS');
select is((select count(*)::integer from jsonb_array_elements(public.get_my_identity_candidates()) c
           where c ? 'confidence'),
  0, 'CONFIDENCE SCORES NEVER LEAVE THE SERVER');

-- With both sides present and fields confirmed, submission works — and still
-- grants nothing.
select is((select public.submit_my_identity_for_review() ->> 'workerState'), 'identity_submitted',
  'identity submission moves the lifecycle forward');
select is((select public.get_my_onboarding_state() ->> 'workerCapabilityActive'), 'false',
  'SUBMITTING DOCUMENTS DOES NOT ACTIVATE A WORKER');

reset role;

-- Another worker sees none of it.
select pg_temp.act_as('a2300000-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::integer from jsonb_array_elements(public.get_my_identity_candidates())), 0,
  'ONE WORKER SEES NO OTHER WORKER EXTRACTION CANDIDATES');
select is((select count(*)::integer from public.worker_onboarding_events
           where user_id = 'a2300000-0000-4000-8000-000000000001'),
  0, 'ONE WORKER CANNOT READ ANOTHER WORKER LIFECYCLE HISTORY');
select is((select count(*)::integer from public.account_onboarding
           where user_id = 'a2300000-0000-4000-8000-000000000001'),
  0, 'one worker cannot read another onboarding row');
reset role;

-- ---------------------------------------------------------------------------
-- Criminal-record certificate
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2300000-0000-4000-8000-000000000001');
set local role authenticated;

select throws_ok(
  $$select public.submit_my_criminal_record(
      'a2300000-0000-4000-8000-000000000002/cert.pdf','application/pdf',1000,null,
      current_date - 1,'REF','WPS023 Worker')$$,
  '42501', null, 'A PATH NAMING ANOTHER ACCOUNT IS REFUSED');
select throws_ok(
  $$select public.submit_my_criminal_record(
      'a2300000-0000-4000-8000-000000000001/cert.exe','application/x-msdownload',1000,null,
      current_date - 1,'REF','WPS023 Worker')$$,
  '22023', null, 'AN UNSUPPORTED MIME TYPE IS REFUSED');
select throws_ok(
  $$select public.submit_my_criminal_record(
      'a2300000-0000-4000-8000-000000000001/cert.pdf','application/pdf',99999999,null,
      current_date - 1,'REF','WPS023 Worker')$$,
  '22023', null, 'AN OVERSIZED DOCUMENT IS REFUSED');
select throws_ok(
  $$select public.submit_my_criminal_record(
      'a2300000-0000-4000-8000-000000000001/cert.pdf','application/pdf',1000,null,
      current_date + 30,'REF','WPS023 Worker')$$,
  '22023', null, 'a future issue date is refused');

-- The worker must reach the certificate step first: the state machine will not
-- accept a submission out of order.
reset role;
set local role postgres;
select private.worker_transition('a2300000-0000-4000-8000-000000000001','identity_under_review',
  'a2300000-0000-4000-8000-000000000004','staff','review_started','A reviewer opened your application.');
select private.worker_transition('a2300000-0000-4000-8000-000000000001','criminal_record_required',
  'a2300000-0000-4000-8000-000000000004','staff','identity_ok','Your identity check is complete.');
reset role;

select pg_temp.act_as('a2300000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select public.submit_my_criminal_record(
            'a2300000-0000-4000-8000-000000000001/cert.pdf','application/pdf',204800,null,
            current_date - 10,'REF-1','WPS023 Worker') ->> 'status'), 'submitted',
  'a valid certificate submission is accepted');
select is((select public.get_my_onboarding_state() ->> 'workerCapabilityActive'), 'false',
  'UPLOADING A CERTIFICATE DOES NOT ACTIVATE A WORKER');
reset role;

-- No other worker can see it.
select pg_temp.act_as('a2300000-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::integer from public.worker_criminal_record_submissions), 0,
  'ONE WORKER CANNOT READ ANOTHER WORKER CERTIFICATE');
reset role;

-- A customer certainly cannot.
select pg_temp.act_as('a2300000-0000-4000-8000-000000000003');
set local role authenticated;
select is((select count(*)::integer from public.worker_criminal_record_submissions), 0,
  'A CUSTOMER CANNOT READ ANY CERTIFICATE');
reset role;

-- ---------------------------------------------------------------------------
-- Staff review and capability isolation
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2300000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select public.staff_worker_vetting_queue(10)$$, '42501', null,
  'A NON-STAFF ACCOUNT CANNOT OPEN THE VETTING QUEUE');
select throws_ok(
  $$select public.staff_worker_vetting_decision('a2300000-0000-4000-8000-000000000001',
      'approve','x','A reason long enough.')$$,
  '42501', null, 'A NON-STAFF ACCOUNT CANNOT DECIDE A VETTING CASE');
select throws_ok(
  $$select public.staff_worker_document_reference('a2300000-0000-4000-8000-000000000001','criminal_record')$$,
  '42501', null, 'A NON-STAFF ACCOUNT CANNOT REACH A CERTIFICATE');
reset role;

select pg_temp.act_as('a2300000-0000-4000-8000-000000000004');
set local role authenticated;

select ok((public.staff_worker_vetting_queue(50) ->> 'count')::integer >= 1,
  'a reviewer sees the vetting queue');
-- The queue is a work list, not a directory of people.
select is((select count(*)::integer from jsonb_array_elements(
            public.staff_worker_vetting_queue(50) -> 'cases') c
          where c ?| array['userId','displayName','email','phone','nationalId','storagePath']),
  0, 'THE VETTING QUEUE EXPOSES NO IDENTITY OR CONTACT FIELD');

-- Adverse decisions demand evidence.
select throws_ok(
  $$select public.staff_worker_vetting_decision('a2300000-0000-4000-8000-000000000001',
      'reject','policy','A safe reason for the worker.', null)$$,
  '22023', null, 'A REJECTION WITHOUT RECORDED EVIDENCE IS REFUSED');
select throws_ok(
  $$select public.staff_record_certificate_outcome('a2300000-0000-4000-8000-000000000001',
      'rejected','A safe reason.','short')$$,
  '22023', null, 'A CERTIFICATE OUTCOME WITHOUT EVIDENCE IS REFUSED');
select throws_ok(
  $$select public.staff_worker_vetting_decision('a2300000-0000-4000-8000-000000000001',
      'teleport','x','A safe reason for the worker.')$$,
  '22023', null, 'an unknown decision is refused');

-- Every sensitive document access is logged with the capability that allowed it.
select is((select public.staff_worker_document_reference(
            'a2300000-0000-4000-8000-000000000001','criminal_record') ->> 'bucket'),
  'worker-criminal-records', 'a reviewer receives the certificate bucket reference');
select is((select (public.staff_worker_document_reference(
            'a2300000-0000-4000-8000-000000000001','criminal_record') ->> 'expiresInSeconds')::integer),
  300, 'the reference is explicitly short-lived');
reset role;
set local role postgres;
select ok((select count(*) >= 1 from private.staff_access_log
           where capability_key = 'review_criminal_records'
             and query_shape like 'worker_document:%'),
  'EVERY CERTIFICATE ACCESS IS LOGGED WITH ITS CAPABILITY');
reset role;

-- Certificate outcome: safe reason to the worker, assessment to private evidence.
select pg_temp.act_as('a2300000-0000-4000-8000-000000000004');
set local role authenticated;
select is((select public.staff_record_certificate_outcome(
            'a2300000-0000-4000-8000-000000000001','clear',
            'Your certificate was accepted.',
            'Reviewed against wps023-v1. Nothing relevant to entering customer homes.') ->> 'status'),
  'clear', 'a certificate outcome is recorded');
reset role;

select pg_temp.act_as('a2300000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select safe_outcome_reason from public.worker_criminal_record_submissions where is_current),
  'Your certificate was accepted.', 'the worker sees the safe reason');
-- The reviewer's actual assessment is not reachable by the person it is about.
select throws_ok(
  $$select count(*) from private.worker_criminal_record_review$$,
  '42501', null, 'THE WORKER CANNOT READ THE REVIEWER ASSESSMENT');
select throws_ok(
  $$select count(*) from private.worker_onboarding_evidence$$,
  '42501', null, 'the worker cannot read staff evidence');
reset role;

-- ---------------------------------------------------------------------------
-- Activation gating
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2300000-0000-4000-8000-000000000004');
set local role authenticated;

select lives_ok(
  $$select public.staff_worker_vetting_decision('a2300000-0000-4000-8000-000000000001',
      'start_certificate_review','review_started','A reviewer is checking your certificate.')$$,
  'a reviewer may open the certificate review');
select lives_ok(
  $$select public.staff_worker_vetting_decision('a2300000-0000-4000-8000-000000000001',
      'approve','certificate_clear','Your application was approved.')$$,
  'a reviewer may approve');

-- Approval is not activation. The gates still hold, and this worker has no
-- profile photo, no services, no service area and no approved documents.
select throws_ok(
  $$select public.staff_worker_vetting_decision('a2300000-0000-4000-8000-000000000001',
      'activate','gates','You are live on Warsha.')$$,
  '22023', null, 'ACTIVATION IS REFUSED WHILE ANY GATE IS UNSATISFIED');
reset role;

select pg_temp.act_as('a2300000-0000-4000-8000-000000000001');
set local role authenticated;
select ok((select jsonb_array_length(public.get_my_onboarding_state() -> 'outstandingGates')) > 0,
  'the worker is told which gates are outstanding');
select is((select public.get_my_onboarding_state() ->> 'workerCapabilityActive'), 'false',
  'AN APPROVED BUT UNACTIVATED WORKER STILL HAS NO CAPABILITY');
select throws_ok($$select private.require_active_worker()$$, '42501', null,
  'an approved but unactivated worker is refused at every worker operation');
reset role;

-- Discoverability follows activation, not approval.
set local role postgres;
select ok(not private.is_provider_publicly_discoverable('b2300000-0000-4000-8000-000000000001'),
  'AN UNACTIVATED WORKER IS NOT PUBLICLY DISCOVERABLE');
select is((select is_published from public.provider_profiles
           where id='b2300000-0000-4000-8000-000000000001'), false,
  'nothing published the worker along the way');
reset role;

-- ---------------------------------------------------------------------------
-- Rejection, appeal and reviewer independence
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2300000-0000-4000-8000-000000000004');
set local role authenticated;
select lives_ok(
  $$select public.staff_worker_vetting_decision('a2300000-0000-4000-8000-000000000001',
      'suspend','policy','Your account is on hold while we check something.',
      'Suspended pending a document authenticity question raised during review.')$$,
  'a reviewer may suspend with evidence');
select lives_ok(
  $$select public.staff_worker_vetting_decision('a2300000-0000-4000-8000-000000000001',
      'reject','policy','We could not approve your application.',
      'Rejected under wps023-v1 after the authenticity question was not resolved.')$$,
  'a reviewer may reject with evidence');
reset role;

select pg_temp.act_as('a2300000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select public.get_my_onboarding_state() ->> 'latestSafeReason'),
  'We could not approve your application.',
  'the worker sees a safe rejection reason');
select is((select count(*)::integer from public.worker_onboarding_events
           where user_id='a2300000-0000-4000-8000-000000000001'
             and safe_reason like '%authenticity%'),
  0, 'THE PRIVATE EVIDENCE NEVER APPEARS IN THE WORKER-VISIBLE HISTORY');
select is((select public.submit_my_vetting_appeal(
            'I believe the document is genuine and can provide the original.') ->> 'workerState'),
  'appeal_pending', 'a rejected worker may appeal');
reset role;

-- The reviewer who rejected cannot decide the appeal against their own decision.
select pg_temp.act_as('a2300000-0000-4000-8000-000000000004');
set local role authenticated;
select throws_ok(
  $$select public.staff_decide_vetting_appeal('a2300000-0000-4000-8000-000000000001',
      'upheld','We looked again and reached the same decision.',
      'Reviewed my own earlier rejection and confirmed it.')$$,
  '42501', null, 'AN APPEAL CANNOT BE DECIDED BY THE ORIGINAL REVIEWER');
reset role;

select pg_temp.act_as('a2300000-0000-4000-8000-000000000005');
set local role authenticated;
select lives_ok(
  $$select public.staff_decide_vetting_appeal('a2300000-0000-4000-8000-000000000001',
      'correction_required','Please send a clearer copy of the certificate.',
      'Independent review: the scan quality is the issue, not the document.')$$,
  'a different reviewer may decide the appeal');
reset role;

-- History is immutable, including for staff.
set local role postgres;
select throws_ok(
  $$update public.worker_onboarding_events set safe_reason='Rewritten'
    where user_id='a2300000-0000-4000-8000-000000000001'$$,
  '42501', null, 'LIFECYCLE HISTORY CANNOT BE REWRITTEN');
select throws_ok(
  $$delete from public.worker_onboarding_events
    where user_id='a2300000-0000-4000-8000-000000000001'$$,
  '42501', null, 'LIFECYCLE HISTORY CANNOT BE DELETED');
select ok((select count(*) >= 8 from public.worker_onboarding_events
           where user_id='a2300000-0000-4000-8000-000000000001'),
  'every transition left a history row');
select ok((select count(*) >= 1 from private.staff_audit_events
           where entity_id='a2300000-0000-4000-8000-000000000001'
             and action='worker_vetting_decision'),
  'every staff decision is audited');
reset role;

-- ---------------------------------------------------------------------------
-- Idempotency and concurrency
-- ---------------------------------------------------------------------------
set local role postgres;
select is(private.worker_transition('a2300000-0000-4000-8000-000000000001','correction_required',
    'a2300000-0000-4000-8000-000000000005','staff','repeat','Repeat of the state already held.'),
  null, 'RE-ISSUING THE CURRENT STATE IS A NO-OP, NOT A DUPLICATE');
select ok((select pg_temp.code_of('private','worker_transition') like '%for update%'),
  'the state machine takes a row lock');
reset role;

-- ---------------------------------------------------------------------------
-- Privacy integration and leakage
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from private.data_inventory
           where entry_key in ('worker_criminal_record_submissions','worker-criminal-records',
                               'worker_identity_extractions','worker_onboarding_events',
                               'worker_onboarding_evidence','worker_criminal_record_review',
                               'account_onboarding')),
  7, 'every WPS-023 store is registered in the WPS-022 data inventory');
select is((select count(*)::integer from private.data_inventory
           where entry_key in ('worker_criminal_record_submissions','worker-criminal-records',
                               'worker_criminal_record_review','worker_identity_extractions',
                               'worker_onboarding_evidence')
             and export_included),
  0, 'NO SENSITIVE VETTING RECORD IS INCLUDED IN A PRIVACY EXPORT');
select is((select visibility from private.storage_bucket_lifecycle
           where bucket_id='worker-criminal-records'), 'private_staff',
  'the certificate bucket is registered as staff-private');
select is((select public from storage.buckets where id='worker-criminal-records'), false,
  'THE CERTIFICATE BUCKET IS NOT PUBLIC');

-- Notification payloads carry a state, never a document or a detail.
select is((select count(*)::integer from private.notification_event_catalog
           where event_type in ('worker_approved','worker_rejected','criminal_record_required',
                                'criminal_record_correction_required','identity_correction_required',
                                'vetting_appeal_updated')
             and (generic_body ~* 'offence|conviction|national id|certificate number|\.pdf|\.jpg'
                  or generic_title ~* 'offence|conviction|national id')),
  0, 'NO NOTIFICATION MENTIONS AN OFFENCE, AN IDENTIFIER OR A FILENAME');
select is((select count(*)::integer from private.notification_event_catalog
           where event_type in (
             'account_created','phone_verification_required','customer_onboarding_incomplete',
             'worker_onboarding_incomplete','identity_upload_received','identity_correction_required',
             'identity_approved','criminal_record_required','criminal_record_received',
             'criminal_record_correction_required','worker_manual_review','worker_approved',
             'worker_rejected','vetting_appeal_submitted','vetting_appeal_updated')),
  15, 'all fifteen WPS-023 notification events are registered');

-- Nothing WPS-023 created is published to Realtime.
select is(
  (select count(*)::integer from pg_publication_tables
   where pubname = 'supabase_realtime'
     and tablename in ('account_onboarding','worker_onboarding_events',
                       'worker_criminal_record_submissions')),
  0, 'NO WPS-023 TABLE IS PUBLISHED TO REALTIME');

-- The certificate table cannot carry offence text, because no column exists
-- that could hold it.
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema='public' and table_name='worker_criminal_record_submissions'
     and column_name ~* 'offence|offense|conviction|charge|crime'),
  0, 'THE CERTIFICATE TABLE HAS NO OFFENCE COLUMN AT ALL');

-- ---------------------------------------------------------------------------
-- Grandfathering
-- ---------------------------------------------------------------------------
--
-- Existing providers were backfilled into `manual_review`, never `active`.
-- Silently marking them active would be exactly the automatic approval this
-- specification forbids.
set local role postgres;
select is((select count(*)::integer from public.account_onboarding
           where intended_role = 'worker' and worker_state = 'active'
             and user_id not in (select user_id from public.worker_onboarding_events
                                 where actor_kind = 'staff' and to_state = 'active')),
  0, 'NO ACCOUNT WAS SILENTLY ACTIVATED BY THE MIGRATION');
select ok((select count(*) >= 0 from public.account_onboarding where worker_state = 'manual_review'),
  'pre-existing workers were placed in manual review');

-- ---------------------------------------------------------------------------
-- WPS-024 CORRECTION: registration does not depend on Phone Auth
-- ---------------------------------------------------------------------------
--
-- The locked decision: a phone number is REQUIRED CONTACT INFORMATION, and
-- proving the handset is not required to register as a customer or as a worker.
-- Supabase Phone Auth stays disabled and no SMS provider is configured, so
-- every assertion below runs in exactly the state production launches in.

-- A fresh reset sees the corrected base migration and therefore already has
-- this default. Hosted applied the original base migration, where provider IDs
-- were also profile IDs, then the decoupling migration removed the foreign key
-- without supplying the new independent-ID default. Recreate that exact drift
-- before proving the forward repair and the complete auth trigger path.
create temporary table provider_profile_ids_before on commit drop as
select id from public.provider_profiles;

alter table public.provider_profiles alter column id drop default;
select is(
  (select column_default from information_schema.columns
   where table_schema='public' and table_name='provider_profiles' and column_name='id'),
  null,
  'THE HOSTED-EQUIVALENT PROVIDER ID COLUMN HAS NO DEFAULT');

insert into private.worker_auth_registrations(credential_id,phone,expires_at)
values ('c2400000-0000-4000-8000-000000000000','+201230000100',now()+interval '10 minutes');

select throws_ok(
  $q$insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                             email_confirmed_at, created_at, updated_at,
                             raw_app_meta_data, raw_user_meta_data)
     values ('a2400000-0000-4000-8000-000000000000',
             '00000000-0000-0000-0000-000000000000',
             'authenticated','authenticated',
             'worker.c2400000000040008000000000000000@auth.warsha.invalid','x',
             now(),now(),now(),
             jsonb_build_object('worker_synthetic_identity',true,
                                'worker_identity_id','c2400000-0000-4000-8000-000000000000'),
             jsonb_build_object('display_name','Missing Default Worker',
                                'account_role','provider',
                                'contact_phone','+201230000100',
                                'worker_identity_id','c2400000-0000-4000-8000-000000000000'))$q$,
  '23502', null,
  'HOSTED-STYLE WORKER SIGN-UP FAILS WHEN THE PROVIDER ID DEFAULT IS ABSENT');

delete from private.worker_auth_registrations
where credential_id='c2400000-0000-4000-8000-000000000000';

alter table public.provider_profiles
  alter column id set default pg_catalog.gen_random_uuid();
select ok(
  (select column_default ~ 'gen_random_uuid'
   from information_schema.columns
   where table_schema='public' and table_name='provider_profiles' and column_name='id'),
  'THE FORWARD REPAIR RESTORES GENERATED PROVIDER IDS');

-- A fresh schema also carries an older full unique constraint, but hosted has
-- only the intended partial index. Remove the redundant constraint inside this
-- test transaction so the worker insert exercises the hosted conflict arbiter.
alter table public.provider_profiles
  drop constraint if exists provider_profiles_user_id_key;

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'provider_profiles'
      and indexname = 'provider_profiles_user_id_unique'
      and indexdef ~* 'where.*user_id is not null'),
  'THE HOSTED PARTIAL PROVIDER USER-ID UNIQUE INDEX IS PRESENT');

select matches(
  pg_temp.code_of('private', 'handle_new_user'),
  'on conflict\s*\(user_id\)\s*where user_id is not null\s*do nothing',
  'WORKER SIGN-UP CONFLICT INFERENCE MATCHES THE PARTIAL USER-ID UNIQUE INDEX');

-- A broker-created worker identity and an unchanged customer registration,
-- both with contact numbers nobody has confirmed.
insert into private.worker_auth_registrations(credential_id,phone,expires_at)
values ('c2400000-0000-4000-8000-000000000001','+201230000101',now()+interval '10 minutes');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('a2400000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated',
   'worker.c2400000000040008000000000000001@auth.warsha.invalid','x', now(), now(), now(),
   jsonb_build_object('worker_synthetic_identity',true,
                      'worker_identity_id','c2400000-0000-4000-8000-000000000001'),
   jsonb_build_object('display_name','WPS024 Worker','account_role','provider',
                      'contact_phone','+201230000101',
                      'worker_identity_id','c2400000-0000-4000-8000-000000000001',
                      'legal_acceptances',pg_temp.signup_manifest('worker'))),
  ('a2400000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','wps024.customer@example.com','x', now(), now(), now(), '{}',
   jsonb_build_object('display_name','WPS024 Customer','account_role','customer',
                      'contact_phone','+201230000102',
                      'legal_acceptances',pg_temp.signup_manifest('customer')))
on conflict (id) do nothing;

select is((select phone from public.profiles where id='a2400000-0000-4000-8000-000000000001'),
  '+201230000101',
  'A WORKER REGISTERS WITH A CONTACT NUMBER WHILE PHONE AUTH IS DISABLED');
select is((select phone from public.profiles where id='a2400000-0000-4000-8000-000000000002'),
  '+201230000102',
  'A CUSTOMER REGISTERS WITH A CONTACT NUMBER WHILE PHONE AUTH IS DISABLED');

select is((select count(*)::integer from private.worker_auth_identities
           where user_id='a2400000-0000-4000-8000-000000000001'
             and phone='+201230000101'
             and credential_id='c2400000-0000-4000-8000-000000000001'),
  1, 'WORKER REGISTRATION CREATES EXACTLY ONE PHONE-TO-CREDENTIAL MAPPING');
select is((select count(*)::integer from private.worker_auth_identities
           where user_id='a2400000-0000-4000-8000-000000000002'),
  0, 'CUSTOMER REGISTRATION CREATES NO WORKER AUTH MAPPING');
select is(public.resolve_worker_auth_identity('+201230000101'),
  'worker.c2400000000040008000000000000001@auth.warsha.invalid',
  'THE TRUSTED RESOLVER MAPS WORKER PHONE TO THE OPAQUE PASSWORD IDENTITY');
select is(private.account_contact_email('a2400000-0000-4000-8000-000000000001'),
  null, 'THE SYNTHETIC WORKER EMAIL IS NEVER A CONTACT EMAIL');
select is(private.account_contact_email('a2400000-0000-4000-8000-000000000002'),
  'wps024.customer@example.com', 'CUSTOMER CONTACT EMAIL IS UNCHANGED');
select is((select email_enabled from public.notification_preferences
           where user_id='a2400000-0000-4000-8000-000000000001'),
  false, 'SYNTHETIC EMAIL DELIVERY IS DISABLED');
select is((select sms_enabled from public.notification_preferences
           where user_id='a2400000-0000-4000-8000-000000000001'),
  false, 'WORKER REGISTRATION ENABLES NO SMS DELIVERY');

-- The number is stored. It is not evidence, and nothing claims it is.
select is((select count(*)::integer from auth.users
           where id in ('a2400000-0000-4000-8000-000000000001',
                        'a2400000-0000-4000-8000-000000000002')
             and phone_confirmed_at is not null),
  0, 'NEITHER REGISTRATION IS TREATED AS A VERIFIED PHONE');
select is((select count(*)::integer from auth.users
           where id in ('a2400000-0000-4000-8000-000000000001',
                        'a2400000-0000-4000-8000-000000000002')
             and phone is not null),
  0, 'NO REGISTRATION WRITES AN AUTHENTICATION PHONE IDENTITY');

-- A worker profile exists, created by the registration itself.
select isnt((select id from public.provider_profiles
             where user_id='a2400000-0000-4000-8000-000000000001'), null,
  'WORKER REGISTRATION PRODUCES A WORKER PROFILE WITHOUT AN SMS CODE');
select is((select count(*)::integer from public.provider_profiles
           where user_id='a2400000-0000-4000-8000-000000000001'),
  1, 'WORKER REGISTRATION PRODUCES EXACTLY ONE WORKER PROFILE');
select is((select count(*)::integer from public.provider_profiles
           where user_id='a2400000-0000-4000-8000-000000000002'),
  0, 'CUSTOMER REGISTRATION DOES NOT PRODUCE A WORKER PROFILE');
select is((select count(*)::integer from provider_profile_ids_before old
           where not exists (select 1 from public.provider_profiles current
                             where current.id=old.id)),
  0, 'RESTORING THE DEFAULT DOES NOT CHANGE ANY EXISTING PROVIDER ID');

-- Role activation is reachable. It used to raise 'Verified phone required'.
select lives_ok(
  $q$select set_config('request.jwt.claim.sub','a2400000-0000-4000-8000-000000000002',true);
     select public.activate_provider_role('WPS024 Customer')$q$,
  'A CUSTOMER CAN BECOME A WORKER WITH NO VERIFIED PHONE');

-- The gate is renamed, and it means what it says.
select ok(private.worker_activation_gates('a2400000-0000-4000-8000-000000000001')
            ? 'phone_number_provided',
  'the activation gate asks whether a number was PROVIDED');
select ok(not (private.worker_activation_gates('a2400000-0000-4000-8000-000000000001')
            ? 'verified_phone'),
  'NO GATE CLAIMS A VERIFIED PHONE, BECAUSE NOTHING VERIFIES ONE');
select is((private.worker_activation_gates('a2400000-0000-4000-8000-000000000001')
            ->>'phone_number_provided')::boolean, true,
  'a registered worker satisfies the contact-number gate');

update public.provider_profiles
set profession_key='plumbing', about=''
where user_id='a2400000-0000-4000-8000-000000000001';
select is((private.worker_activation_gates('a2400000-0000-4000-8000-000000000001')
            ->>'professions_configured')::boolean, true,
  'A CANONICAL PROFESSION SATISFIES WORKER PROFILE COMPLETENESS WITH NO BIOGRAPHY');
select ok(not (private.worker_activation_gates('a2400000-0000-4000-8000-000000000001')
            ? 'biography'),
  'THE OPTIONAL BIOGRAPHY IS NOT AN ACTIVATION GATE');
select ok(pg_catalog.strpos(
  pg_temp.code_of('private','is_provider_publicly_discoverable'), 'btrim(p.about)') = 0,
  'AN EMPTY OPTIONAL BIOGRAPHY DOES NOT BLOCK PUBLIC DISCOVERABILITY');

-- Prove the activation rule excludes this address as contact rather than
-- accidentally passing because Auth marked the internal password provider
-- usable. This temporary update is rolled back with the suite.
update auth.users set email_confirmed_at=null
where id='a2400000-0000-4000-8000-000000000001';
select is((private.worker_activation_gates('a2400000-0000-4000-8000-000000000001')
            ->>'verified_email_if_present')::boolean, true,
  'WORKER ACTIVATION HAS NO SYNTHETIC EMAIL-CONFIRMATION DEPENDENCY');
select is((select phone_confirmed_at from auth.users
           where id='a2400000-0000-4000-8000-000000000001'),
  null, 'WORKER PHONE_CONFIRMED_AT STAYS NULL');

select throws_ok(
  $q$insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                             email_confirmed_at, created_at, updated_at,
                             raw_app_meta_data, raw_user_meta_data)
     values ('a2400000-0000-4000-8000-000000000004',
             '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
             'untrusted.worker@example.com','x',now(),now(),now(),'{}',
             jsonb_build_object('display_name','Untrusted Worker',
                                'account_role','provider',
                                'contact_phone','+201230000104'))$q$,
  '42501', null,
  'CLIENT-CONTROLLED METADATA CANNOT BYPASS THE TRUSTED WORKER AUTH BROKER');

-- Validation still applies. A number that is not an Egyptian mobile is refused
-- rather than stored, so a contact detail is always dialable or absent.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values ('a2400000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','wps024.badphone@example.com','x', now(), now(), now(), '{}',
   jsonb_build_object('display_name','Bad Phone','contact_phone','555-1234'))
on conflict (id) do nothing;
select is((select phone from public.profiles where id='a2400000-0000-4000-8000-000000000003'),
  null, 'A MALFORMED CONTACT NUMBER IS DROPPED, NEVER STORED');

-- An account with no number on file cannot become a worker. Required contact
-- information is still required.
select throws_ok(
  $q$select set_config('request.jwt.claim.sub','a2400000-0000-4000-8000-000000000003',true);
     select public.activate_provider_role('Bad Phone')$q$,
  '22023', null,
  'A WORKER WITHOUT A CONTACT NUMBER IS STILL REFUSED');

-- Uniqueness, preserved from what auth.users.phone used to guarantee.
select throws_ok(
  $q$update public.profiles set phone='+201230000101'
     where id='a2400000-0000-4000-8000-000000000002'$q$,
  '23505', null,
  'TWO ACCOUNTS CANNOT SHARE A CONTACT NUMBER');

-- The OTP infrastructure is kept and stays governed. Deleting the limit and
-- rediscovering the need for it after enabling an SMS provider is the failure
-- this assertion exists to prevent.
select is((select enabled from private.rate_limit_policies
           where policy_key='auth_otp_request'), true,
  'THE OTP RATE LIMIT SURVIVES THE CORRECTION, READY FOR AN EXPLICIT FLOW');

reset role;


-- ---------------------------------------------------------------------------
-- The criminal-record entry point, as the catalog sees it
-- ---------------------------------------------------------------------------
-- `scripts/criminal-record-contract.test.mts` compares the client's argument
-- keys against the migration text. This is the other end of the same contract,
-- read from the live catalog instead: what a client will actually resolve
-- against over PostgREST.
--
-- Both are needed. The migration is what the repository intends; `pg_proc` is
-- what the database ended up with, and the four-week outage lived exactly in
-- that gap — a second overload nobody meant to create, one word away from the
-- real one, silently winning every client call because PostgREST resolves an
-- overload by the keys in the request body.

select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_my_criminal_record'),
  1,
  'THE CRIMINAL-RECORD SUBMITTER HAS EXACTLY ONE OVERLOAD');

select is(
  (select pg_catalog.array_to_string(p.proargnames, ',')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_my_criminal_record'),
  'p_storage_path,p_mime_type,p_file_size_bytes,p_content_hash,p_issue_date,p_document_reference,p_declared_name',
  'AND ITS ARGUMENTS ARE EXACTLY WHAT THE CLIENT SENDS, IN ORDER');

-- `p_size_bytes` is the key that selected the dead overload. Nothing in the
-- database may answer to it again.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_my_criminal_record'
     and 'p_size_bytes' = any(p.proargnames)),
  0,
  'and no function still answers to p_size_bytes');


-- ---------------------------------------------------------------------------
-- The declared name is stored as typed, minus the typing accidents
-- ---------------------------------------------------------------------------
-- Found on hosted Development, not by reading: submitting
-- '  محمد   أحمد  ' stored 'محمد   أحمد'. `btrim` removed the outer spaces and
-- left the three in the middle, so the tidy value was a property of the client
-- rather than of the column. A reviewer compares this string against a printed
-- document, and two submissions differing only by invisible spacing read as two
-- different names.

select is(private.normalize_declared_name('  محمد   أحمد  '), 'محمد أحمد',
  'AN ARABIC NAME IS TRIMMED AND ITS INTERNAL RUNS COLLAPSED');
select is(private.normalize_declared_name('Chloé   Dupont'), 'Chloé Dupont',
  'and a French name keeps its diacritics while losing the double space');
select is(private.normalize_declared_name('ahmed hassan'), 'ahmed hassan',
  'nothing is capitalised — the document is the authority, not Warsha');
select is(private.normalize_declared_name(null), '',
  'a null name normalizes to empty rather than null, so the length check is total');

-- The length rule measures the normalized value, or a name of nothing but
-- spaces would satisfy a 2..120 test.
select is(pg_catalog.length(private.normalize_declared_name('a          b')), 3,
  'AND THE LENGTH CHECK SEES THE COLLAPSED VALUE, NOT THE PADDING');

select ok(not has_function_privilege('authenticated', 'private.normalize_declared_name(text)', 'execute'),
  'the normalizer is not reachable from a client');

select * from finish();
rollback;
