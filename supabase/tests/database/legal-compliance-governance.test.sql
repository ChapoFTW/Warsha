begin;
select no_plan();

-- WPS-024 — Legal, Privacy, Compliance & Governance.
--
-- The questions this suite exists to answer. Each one fails silently and looks
-- correct until somebody has to prove what a person actually agreed to:
--   * can an acceptance be recorded for text the client never displayed?
--   * can a published version be edited after somebody accepted it?
--   * can a decline be stored, read back, or decay into an acceptance?
--   * can a client write the acceptance ledger directly?
--   * can one account read another's acceptances?
--   * can a reviewer learn WHO declined, rather than how many?
--   * can a material change be published with no summary of what changed?
--   * can a subprocessor process identity data without the training prohibition?
--   * can a declared AI use cover identity data and be permitted for training?
--   * can the system reach a DECISION state now that it can grant a capability?
--   * does WPS-023's signed-out surface stay exactly nine functions?

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

-- Comments stripped before a body is searched, so a comment explaining why
-- something is absent can never satisfy the check for that absence.
create function pg_temp.code_of(p_schema text, p_name text)
returns text language sql stable as $fn$
  select coalesce(string_agg(
    regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'), E'\n'), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = p_schema and p.proname = p_name and p.prokind = 'f';
$fn$;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select has_table('public','legal_documents','the document register exists');
select has_table('public','legal_document_versions','the version register exists');
select has_table('public','legal_acceptances','the acceptance ledger exists');
select has_table('private','legal_version_events','publication history is private');
select has_table('private','subprocessors','the subprocessor register exists');
select has_table('private','processing_activities','the processing register exists');
select has_table('private','ai_use_declarations','the AI register exists');
select has_table('private','legal_configuration','legal configuration exists');

select has_function('private','legal_current_version',array['text'],'current version resolution exists');
select has_function('private','legal_obligations',array['uuid'],'obligation evaluation exists');
select has_function('private','legal_gate_satisfied',array['uuid'],'the legal gate exists');
select has_function('private','worker_provisional_gates',array['uuid'],'provisional gates exist');
select has_function('private','worker_capability_tier',array['uuid'],'the capability tier exists');
select has_function('public','accept_legal_document',
  array['text','text','text','text','text'],'acceptance rpc exists');
select has_function('public','decline_legal_document',
  array['text','text','text','text'],'decline rpc exists');

-- ---------------------------------------------------------------------------
-- The corpus is registered, complete, and internally consistent
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from public.legal_documents), 26,
  'every document in the corpus is registered');
select is((select count(*)::integer from public.legal_document_versions where status='published'), 26,
  'every document has exactly one published version');
select is((select count(*)::integer from public.legal_documents where requires_acceptance), 4,
  'exactly four documents are accepted explicitly; the rest are incorporated by reference');

-- One published version per document, enforced rather than assumed.
select is((select count(*)::integer from (
    select document_key from public.legal_document_versions
    where status='published' group by document_key having count(*) > 1) s),
  0, 'NO DOCUMENT HAS TWO PUBLISHED VERSIONS AT ONCE');

-- Every hash is a real sha256 and no two documents share one, which would mean
-- the corpus registered the same text twice under different names.
select is((select count(*)::integer from public.legal_document_versions
           where content_hash_en !~ '^[0-9a-f]{64}$' or content_hash_ar !~ '^[0-9a-f]{64}$'),
  0, 'every registered hash is a well-formed sha256');
select is((select count(distinct content_hash_en)::integer from public.legal_document_versions), 26,
  'no two documents share an English hash');
select is((select count(distinct content_hash_ar)::integer from public.legal_document_versions), 26,
  'no two documents share an Arabic hash');
select is((select count(*)::integer from public.legal_document_versions
           where content_hash_en = content_hash_ar),
  0, 'no document has identical English and Arabic text');

-- The three implementations of sha256 have to agree or the whole binding is
-- decorative. This pins Postgres to the known digest of "abc"; the client suite
-- pins the TypeScript implementation to the same value.
select is(encode(sha256(convert_to('abc','UTF8')),'hex'),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'THE SERVER SHA-256 MATCHES THE CLIENT IMPLEMENTATION');

select is((select count(*)::integer from public.legal_document_versions
           where change_class <> 'initial'), 0,
  'version 1.0 of everything is an initial version');
select is((select count(*)::integer from public.legal_document_versions
           where supersedes_version is not null), 0,
  'an initial version supersedes nothing');
select is((select count(*)::integer from public.legal_document_versions
           where effective_at < published_at), 0,
  'no version takes effect before it was published');
select is((select count(*)::integer from public.legal_document_versions
           where btrim(change_summary_en) = '' or btrim(change_summary_ar) = ''),
  0, 'every version says what changed, in both languages');

-- ---------------------------------------------------------------------------
-- The register makes no claim Warsha has not earned
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from private.processing_activities
           where legal_review_status = 'approved'),
  0, 'NO PROCESSING ACTIVITY IS RECORDED AS LEGALLY APPROVED');
select is((select count(*)::integer from private.privacy_retention_rules
           where rule_key = 'legal_acceptances' and (enabled or legal_review_status = 'approved')),
  0, 'the acceptance retention rule is neither enabled nor approved');
select is((select count(*)::integer from private.staff_feature_flags
           where flag_key in ('legal_centre','legal_reconsent','provisional_worker_activation')
             and enabled),
  0, 'EVERY WPS-024 SURFACE SHIPS DISABLED');
select is((select reconsent_enforced::integer from private.legal_configuration where singleton), 0,
  'RE-CONSENT ENFORCEMENT IS OFF, SO THIS MIGRATION LOCKS NOBODY OUT');

-- Model A survives: nothing in the corpus register or the subprocessor register
-- claims a government integration.
select is((select count(*)::integer from private.subprocessors
           where display_name ~* 'ministry|interior|government'),
  0, 'NO SUBPROCESSOR CLAIMS A MINISTRY OR GOVERNMENT INTEGRATION');

-- ---------------------------------------------------------------------------
-- Subprocessors and AI
-- ---------------------------------------------------------------------------
select is((select integration_status from private.subprocessors
           where subprocessor_key = 'google_cloud_vision'),
  'approved_not_integrated', 'the OCR provider is registered as not yet in use');
select is((select integration_status from private.subprocessors
           where subprocessor_key = 'google_maps_platform'),
  'approved_not_integrated', 'the map provider is registered as not yet in use');
select is((select count(*)::integer from private.subprocessors
           where integration_status = 'in_use'
             and 'identity_documents' = any(data_categories)
             and not training_prohibited),
  0, 'NO IN-USE SUBPROCESSOR HANDLES IDENTITY DATA WITHOUT A TRAINING PROHIBITION');

select is((select count(*)::integer from private.ai_use_declarations
           where permitted_for_training),
  0, 'NO DECLARED AI USE IS PERMITTED FOR TRAINING');
select is((select count(*)::integer from private.ai_use_declarations
           where not human_confirmation_required),
  0, 'EVERY DECLARED AI USE REQUIRES HUMAN CONFIRMATION');

-- The prohibition is a CHECK, not a policy note. Asserted by trying to break it.
select throws_ok(
  $$update private.ai_use_declarations set permitted_for_training = true
    where use_key = 'identity_text_extraction'$$,
  '23514', null,
  'TRAINING ON IDENTITY DATA IS REFUSED BY THE DATABASE, NOT BY A POLICY NOTE');

select throws_ok(
  $$update private.ai_use_declarations set human_confirmation_required = false
    where use_key = 'identity_text_extraction'$$,
  '23514', null,
  'human confirmation cannot be switched off');

select ok(
  (select 'criminal_eligibility' = any(prohibited_decisions)
   from private.ai_use_declarations where use_key = 'identity_text_extraction'),
  'the declared extraction use is prohibited from deciding criminal eligibility');
select ok(
  (select 'document_authenticity' = any(prohibited_decisions)
   from private.ai_use_declarations where use_key = 'identity_text_extraction'),
  'the declared extraction use is prohibited from deciding authenticity');

-- ---------------------------------------------------------------------------
-- The signed-out surface did not widen
-- ---------------------------------------------------------------------------
-- WPS-023 section 0 narrowed anon-executable functions to nine sanctioned
-- reads. WPS-024 adds no tenth: the signed-out legal reader renders the
-- bundled corpus and makes no call at all. Asserted as a property over the
-- whole schema, so a future addition fails here rather than being noticed.
select is((select count(*)::integer
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and has_function_privilege('anon', p.oid, 'execute')
             and p.proname like '%legal%'),
  0, 'NO LEGAL FUNCTION IS ANON EXECUTABLE');
select is(has_function_privilege('anon','public.get_legal_document_register()','EXECUTE'),
  false, 'the register requires an account');
select is(has_function_privilege('anon','public.accept_legal_document(text,text,text,text,text)','EXECUTE'),
  false, 'ACCEPTANCE REQUIRES AN ACCOUNT');
select is(has_function_privilege('anon','public.staff_legal_governance_overview()','EXECUTE'),
  false, 'the governance overview is not reachable signed out');

-- Client roles hold SELECT and nothing else on the ledger.
select is((select count(*)::integer from information_schema.role_table_grants
           where table_schema='public' and table_name='legal_acceptances'
             and grantee in ('anon','authenticated')
             and privilege_type <> 'SELECT'),
  0, 'NO CLIENT ROLE CAN WRITE THE ACCEPTANCE LEDGER DIRECTLY');
select is((select count(*)::integer from information_schema.role_table_grants
           where table_schema='public'
             and table_name in ('legal_documents','legal_document_versions')
             and grantee in ('anon','authenticated')
             and privilege_type <> 'SELECT'),
  0, 'no client role can write the register');
select is((select count(*)::integer from information_schema.role_table_grants
           where table_schema='public' and table_name='legal_acceptances' and grantee='anon'),
  0, 'anon cannot read the acceptance ledger at all');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
set local role postgres;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, phone, phone_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data)
values
  ('a2400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','wps024.customer@example.com','x',
   now(), '+201000024001', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('a2400000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','wps024.worker@example.com','x',
   now(), '+201000024002', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('a2400000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','wps024.other@example.com','x',
   now(), '+201000024003', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, display_name, preferred_language)
values
  ('a2400000-0000-4000-8000-000000000001','WPS024 Customer','en'),
  ('a2400000-0000-4000-8000-000000000002','WPS024 Worker','en'),
  ('a2400000-0000-4000-8000-000000000003','WPS024 Other','en')
on conflict (id) do nothing;

insert into public.account_onboarding (user_id, intended_role, customer_state)
values ('a2400000-0000-4000-8000-000000000001','customer','address_required'),
       ('a2400000-0000-4000-8000-000000000003','customer','address_required')
on conflict (user_id) do nothing;

insert into public.account_onboarding (user_id, intended_role, worker_state, worker_state_changed_at)
values ('a2400000-0000-4000-8000-000000000002','worker','account_created', now())
on conflict (user_id) do nothing;

reset role;

-- Everything from here to the immutability block runs as `authenticated`.
-- Without it the suite runs as a superuser, RLS is bypassed, and the isolation
-- assertions pass by not being tested -- which is the worst way for a security
-- test to succeed.
set local role authenticated;

-- -----------------------------------------------------------------------
-- Obligations follow the audience, and the two agreements stay independent
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2400000-0000-4000-8000-000000000001');

select is((select count(*)::integer
           from jsonb_array_elements(get_my_legal_obligations() -> 'obligations')),
  2, 'a customer owes the customer terms and the privacy policy, and nothing else');
select is((select count(*)::integer
           from jsonb_array_elements(get_my_legal_obligations() -> 'obligations') o
           where o ->> 'documentKey' like 'worker%'),
  0, 'A CUSTOMER IS NEVER ASKED TO ACCEPT A WORKER AGREEMENT');

select pg_temp.act_as('a2400000-0000-4000-8000-000000000002');
select is((select count(*)::integer
           from jsonb_array_elements(get_my_legal_obligations() -> 'obligations')),
  3, 'a worker owes the worker terms, the privacy policy and the verification policy');
select is((select count(*)::integer
           from jsonb_array_elements(get_my_legal_obligations() -> 'obligations') o
           where o ->> 'documentKey' = 'customer_terms'),
  0, 'a worker is not asked to accept the customer terms');

-- Everything starts outstanding, because nobody has accepted a version that did
-- not exist until this migration ran.
select is((select count(*)::integer
           from jsonb_array_elements(get_my_legal_obligations() -> 'obligations') o
           where (o ->> 'outstanding')::boolean),
  3, 'every initial obligation starts outstanding');

-- ---------------------------------------------------------------------------
-- Acceptance binds to exact words
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.accept_legal_document('worker_terms','1.0','en',
      '0000000000000000000000000000000000000000000000000000000000000000','onboarding')$$,
  '22023', null,
  'AN ACCEPTANCE OF TEXT THE CLIENT DID NOT DISPLAY IS REFUSED');

select throws_ok(
  $$select public.accept_legal_document('worker_terms','9.9','en',
      '58eba2506edf2ed2e47a02e996f281b64be318f417cfdcf2cb0da64df17a7687','onboarding')$$,
  '22023', null,
  'an acceptance of a version that does not exist is refused');

-- The English hash accepted against the Arabic reading is refused: the language
-- and the words have to agree or the record cannot say which text was read.
select throws_ok(
  $$select public.accept_legal_document('worker_terms','1.0','ar',
      '58eba2506edf2ed2e47a02e996f281b64be318f417cfdcf2cb0da64df17a7687','onboarding')$$,
  '22023', null,
  'THE ENGLISH HASH IS REFUSED FOR AN ARABIC ACCEPTANCE');

select lives_ok(
  $$select public.accept_legal_document('worker_terms','1.0','en',
      '58eba2506edf2ed2e47a02e996f281b64be318f417cfdcf2cb0da64df17a7687','worker_onboarding')$$,
  'the correct hash is accepted');

select is((select count(*)::integer from public.legal_acceptances
           where user_id='a2400000-0000-4000-8000-000000000002'
             and document_key='worker_terms' and decision='accepted'),
  1, 'the acceptance was recorded');
select is((select accepted_language from public.legal_acceptances
           where user_id='a2400000-0000-4000-8000-000000000002'
             and document_key='worker_terms'),
  'en', 'the language read is recorded');
select is((select account_role from public.legal_acceptances
           where user_id='a2400000-0000-4000-8000-000000000002'
             and document_key='worker_terms'),
  'worker', 'the role at acceptance is recorded');
select ok((select acceptance_hash ~ '^[0-9a-f]{64}$' from public.legal_acceptances
           where user_id='a2400000-0000-4000-8000-000000000002'
             and document_key='worker_terms'),
  'the acceptance hash binds the person to the words');

select is((select count(*)::integer
           from jsonb_array_elements(get_my_legal_obligations() -> 'obligations') o
           where o ->> 'documentKey' = 'worker_terms'
             and (o ->> 'outstanding')::boolean),
  0, 'an accepted document is no longer outstanding');

-- ---------------------------------------------------------------------------
-- A decline is a decline
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.decline_legal_document('worker_verification_policy','1.0','en','Not yet')$$,
  'a decline is accepted as a decline');

select is((select decision from public.legal_acceptances
           where user_id='a2400000-0000-4000-8000-000000000002'
             and document_key='worker_verification_policy'),
  'declined', 'A DECLINE IS NEVER RECORDED AS CONSENT');

select is((select count(*)::integer
           from jsonb_array_elements(get_my_legal_obligations() -> 'obligations') o
           where o ->> 'documentKey' = 'worker_verification_policy'
             and (o ->> 'outstanding')::boolean),
  1, 'a decline leaves the obligation outstanding rather than resolving it');

-- The restriction list comes from the class. An initial version may restrict.
select ok(
  (select jsonb_array_length(
     public.decline_legal_document('privacy_policy','1.0','en',null) -> 'alwaysAvailable') = 5),
  'the decline response always lists what keeps working');

-- ---------------------------------------------------------------------------
-- Ledger immutability and isolation
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.legal_acceptances set decision='accepted'
    where user_id='a2400000-0000-4000-8000-000000000002'
      and document_key='worker_verification_policy'$$,
  '42501', null,
  'A DECLINE CANNOT BE REWRITTEN INTO AN ACCEPTANCE');

select throws_ok(
  $$delete from public.legal_acceptances
    where user_id='a2400000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'an acceptance cannot be deleted');

select throws_ok(
  $$insert into public.legal_acceptances
      (user_id, document_key, version, decision, accepted_language, acceptance_hash,
       rendered_hash, source_surface, environment)
    values ('a2400000-0000-4000-8000-000000000002','privacy_policy','1.0','accepted','en',
      repeat('a',64), repeat('a',64), 'legal_centre', 'local')$$,
  '42501', null,
  'A CLIENT CANNOT INSERT ITS OWN ACCEPTANCE');

select pg_temp.act_as('a2400000-0000-4000-8000-000000000003');
select is((select count(*)::integer from public.legal_acceptances
           where user_id='a2400000-0000-4000-8000-000000000002'),
  0, 'ONE ACCOUNT CANNOT READ ANOTHER ACCOUNT ACCEPTANCES');
select is((select count(*)::integer from public.legal_acceptances), 0,
  'a third account sees no acceptance but its own');

select pg_temp.act_as_nobody();
select throws_ok($$select public.get_my_legal_obligations()$$, '42501', null,
  'obligations require an account');
select throws_ok($$select public.accept_legal_document('customer_terms','1.0','en','x','sign_up')$$,
  '42501', null, 'acceptance requires an account');
select throws_ok($$select public.staff_legal_governance_overview()$$, '42501', null,
  'the governance overview requires staff');

-- ---------------------------------------------------------------------------
-- Published versions are immutable
-- -----------------------------------------------------------------------
reset role;
set local role postgres;

select throws_ok(
  $$update public.legal_document_versions set content_hash_en = repeat('b',64)
    where document_key='customer_terms'$$,
  '42501', null,
  'THE WORDS OF A PUBLISHED VERSION CANNOT BE CHANGED');
select throws_ok(
  $$update public.legal_document_versions set change_class='editorial'
    where document_key='customer_terms'$$,
  '42501', null,
  'the materiality of a published version cannot be changed');
select throws_ok(
  $$update public.legal_document_versions set effective_at = current_date + 30
    where document_key='customer_terms'$$,
  '42501', null,
  'the effective date of a published version cannot be changed');
select throws_ok(
  $$delete from public.legal_document_versions where document_key='customer_terms'$$,
  '42501', null,
  'A VERSION SOMEBODY ACCEPTED CANNOT BE DELETED');
select lives_ok(
  $$update public.legal_document_versions set status='superseded'
    where document_key='legal_contact'$$,
  'status may move forward, which records what happened without altering what it said');
select throws_ok(
  $$update public.legal_document_versions set status='published'
    where document_key='legal_contact'$$,
  '42501', null,
  'a superseded version cannot be republished');

-- A material change with no summary is refused by the table itself.
select throws_ok(
  $$insert into public.legal_document_versions
      (document_key, version, content_hash_en, content_hash_ar, content_locator,
       published_at, effective_at, supersedes_version, change_class,
       change_summary_en, change_summary_ar, status)
    values ('customer_terms','2.0',repeat('c',64),repeat('d',64),'x',
      current_date, current_date, '1.0', 'material', '', '', 'draft')$$,
  '23514', null,
  'A MATERIAL CHANGE WITH NO SUMMARY IS REFUSED');

select throws_ok(
  $$insert into public.legal_document_versions
      (document_key, version, content_hash_en, content_hash_ar, content_locator,
       published_at, effective_at, supersedes_version, change_class,
       change_summary_en, change_summary_ar, status)
    values ('customer_terms','2.1',repeat('c',64),repeat('d',64),'x',
      current_date, current_date, null, 'material',
      'A long enough summary of what changed here.', 'ملخص كافي.', 'draft')$$,
  '23514', null,
  'a non-initial version must say what it supersedes');

select throws_ok(
  $$insert into public.legal_document_versions
      (document_key, version, content_hash_en, content_hash_ar, content_locator,
       published_at, effective_at, supersedes_version, change_class,
       change_summary_en, change_summary_ar, status)
    values ('customer_terms','2.2',repeat('c',64),repeat('d',64),'x',
      current_date, current_date - 1, '1.0', 'editorial', 'x', 'x', 'draft')$$,
  '23514', null,
  'a version cannot take effect before it was published');

reset role;

-- ---------------------------------------------------------------------------
-- Provisional worker activation
-- ---------------------------------------------------------------------------
-- The property WPS-023 was protecting: the system may grant a capability and
-- may make no decision. Both halves asserted.
select ok(private.worker_transition_allowed('criminal_record_submitted','provisionally_active','system'),
  'the system may grant a provisional capability on submission');
select ok(not private.worker_transition_allowed('criminal_record_submitted','active','system'),
  'THE SYSTEM STILL CANNOT FULLY ACTIVATE A WORKER');
select ok(not private.worker_transition_allowed('provisionally_active','approved','system'),
  'THE SYSTEM STILL CANNOT APPROVE ANYBODY');
select ok(not private.worker_transition_allowed('provisionally_active','rejected','system'),
  'THE SYSTEM STILL CANNOT REJECT ANYBODY');
select ok(not private.worker_transition_allowed('provisionally_active','suspended','system'),
  'THE SYSTEM STILL CANNOT SUSPEND ANYBODY');
select ok(not private.worker_transition_allowed('account_created','provisionally_active','system'),
  'an account that submitted nothing activates nothing');
select ok(not private.worker_transition_allowed('identity_required','provisionally_active','worker'),
  'A WORKER CANNOT PROVISIONALLY ACTIVATE THEMSELVES');
select ok(not private.worker_transition_allowed('rejected','provisionally_active','system'),
  'a rejected worker is not re-activated by the system');
select ok(not private.worker_transition_allowed('suspended','provisionally_active','system'),
  'a suspended worker is not re-activated by the system');

-- Post-activation review, which is the point of the change.
select ok(private.worker_transition_allowed('provisionally_active','suspended','staff'),
  'staff may suspend a worker who is already taking jobs');
select ok(private.worker_transition_allowed('provisionally_active','correction_required','staff'),
  'staff may ask a working worker to correct something');
select ok(private.worker_transition_allowed('provisionally_active','rejected','staff'),
  'staff may reject after provisional activation');
select ok(private.worker_transition_allowed('identity_submitted','criminal_record_submitted','worker'),
  'a worker reaches the certificate step without waiting for staff');

-- WPS-023's guarantees, restated here so a future edit to either suite cannot
-- quietly drop them.
select ok(not private.worker_transition_allowed('approved','active','system'),
  'THE SYSTEM CANNOT ACTIVATE AN APPROVED WORKER');
select ok(not private.worker_transition_allowed(null,'active','system'),
  'the system cannot create an account straight into active');
select ok(private.worker_transition_allowed('approved','active','staff'),
  'full activation is still a staff decision');

-- The provisional gate set is the full set minus staff decisions, computed by
-- subtraction so a gate added to WPS-023 protects both tiers.
select is((select count(*)::integer
           from jsonb_object_keys(private.worker_provisional_gates(
             'a2400000-0000-4000-8000-000000000002')) k
           where k in ('national_id_approved','criminal_record_approved',
                       'identity_verification_approved')),
  0, 'no provisional gate requires a staff decision');
select ok(
  (select private.worker_provisional_gates('a2400000-0000-4000-8000-000000000002')
          ? 'legal_agreements_accepted'),
  'the legal gate is a provisional activation gate');

select is(private.worker_capability_tier('a2400000-0000-4000-8000-000000000002'), 'none',
  'a worker who has submitted nothing holds no capability');
select ok(not private.worker_capability_active('a2400000-0000-4000-8000-000000000002'),
  'AN INCOMPLETE WORKER IS NOT ACTIVE');
select is(private.worker_capability_tier('a2400000-0000-4000-8000-000000000001'), 'none',
  'a customer holds no worker capability');

-- Provisional activation is refused while a gate is unmet, even though the
-- state machine would permit the transition.
select ok(not private.worker_try_provisional_activation('a2400000-0000-4000-8000-000000000002'),
  'PROVISIONAL ACTIVATION IS REFUSED WHILE ANY GATE IS UNMET');
select is((select worker_state from public.account_onboarding
           where user_id='a2400000-0000-4000-8000-000000000002'),
  'account_created', 'the refused activation changed nothing');

-- ---------------------------------------------------------------------------
-- The governance overview leaks no identity
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from (
    select pg_temp.code_of('public','staff_legal_governance_overview') c) s
  where s.c ~* 'user_id|full_name|email|phone'),
  0, 'THE GOVERNANCE OVERVIEW CANNOT RETURN WHO ACCEPTED OR DECLINED');

select is((select count(*)::integer from (
    select pg_temp.code_of('public','get_legal_document_register') c) s
  where s.c like '%legal_acceptances%'),
  0, 'the public register reads no acceptance');

-- Notification payloads carry a state and nothing more.
select is((select count(*)::integer from private.notification_event_catalog
           where event_type in ('legal_update_available','legal_acceptance_required',
                                'legal_acceptance_recorded','worker_provisionally_active')
             and (generic_body ~* 'version [0-9]|hash|document_key|national|offence')),
  0, 'NO WPS-024 NOTIFICATION CARRIES A DOCUMENT IDENTIFIER OR A HASH');
select is((select count(*)::integer from private.notification_event_catalog
           where event_type in ('legal_update_available','legal_acceptance_required',
                                'legal_acceptance_recorded','worker_provisionally_active')),
  4, 'the four WPS-024 notification events are registered');

-- ---------------------------------------------------------------------------
-- Realtime and export boundaries
-- ---------------------------------------------------------------------------
select is((select count(*)::integer
           from pg_publication_tables
           where pubname='supabase_realtime' and schemaname='public'
             and tablename in ('legal_documents','legal_document_versions','legal_acceptances')),
  0, 'NO WPS-024 TABLE IS PUBLISHED TO REALTIME');

select is((select count(*)::integer from private.data_inventory
           where entry_key in ('legal_documents','legal_document_versions','legal_acceptances',
                               'legal_version_events','subprocessors','processing_activities',
                               'ai_use_declarations')),
  7, 'every WPS-024 object is registered in the data inventory');

-- ---------------------------------------------------------------------------
-- Capabilities follow the weight of the decision
-- ---------------------------------------------------------------------------
select is((select dual_control::integer from public.staff_capabilities
           where capability_key='publish_legal_version'),
  1, 'PUBLISHING A LEGAL VERSION REQUIRES A SECOND PERSON');
select is((select dual_control::integer from public.staff_capabilities
           where capability_key='manage_subprocessors'),
  1, 'ADDING A SUBPROCESSOR REQUIRES A SECOND PERSON');
select is((select high_risk::integer from public.staff_capabilities
           where capability_key='review_legal_governance'),
  0, 'reading the register carries no risk flag, because it returns no personal data');


-- ---------------------------------------------------------------------------
-- Provider activation (WPS-024 provider registry)
-- ---------------------------------------------------------------------------
select has_table('private','external_providers','the external provider registry exists');
select has_table('private','external_provider_events','provider history exists');
select has_table('private','ocr_requests','the OCR audit exists');
select has_table('private','ocr_accuracy_runs','the accuracy baseline store exists');
select has_function('private','provider_enabled',array['text'],'the provider gate exists');
select has_function('private','open_ocr_request',
  array['uuid','text','text','text','text'],'the OCR audit opener exists');

select is((select count(*)::integer from private.external_providers), 7,
  'seven external providers are registered');
select is((select count(*)::integer from private.external_providers
           where provider_key in ('supabase','google_maps_platform','google_cloud_vision',
                                  'expo_camera','expo_image_picker','expo_document_picker')),
  6, 'every provider WPS-024 names is in the registry');

-- Every field the specification requires is present and non-empty.
select is((select count(*)::integer from private.external_providers
           where btrim(display_name)='' or btrim(purpose)='' or btrim(introduced_by_wps)=''
              or btrim(privacy_policy_ref)='' or btrim(security_owner)=''
              or btrim(operational_owner)='' or btrim(provider_version)=''
              or array_length(data_categories,1) is null),
  0, 'EVERY REGISTRY FIELD IS POPULATED FOR EVERY PROVIDER');

-- The register describes reality, not intent.
select is((select current_status from private.external_providers
           where provider_key='google_cloud_vision'),
  'implemented_awaiting_credential',
  'THE OCR PROVIDER IS REGISTERED AS AWAITING A CREDENTIAL, NOT AS ACTIVE');
select is((select current_status from private.external_providers
           where provider_key='google_maps_platform'),
  'implemented_awaiting_credential',
  'THE MAP PROVIDER IS REGISTERED AS AWAITING A CREDENTIAL, NOT AS ACTIVE');
select ok(not private.provider_enabled('google_cloud_vision'),
  'NO OCR CALL CAN BE MADE WITHOUT A CREDENTIAL AND A FLAG');
select ok(not private.provider_enabled('google_maps_platform'),
  'NO MAPS CALL CAN BE MADE WITHOUT A CREDENTIAL AND A FLAG');
select ok(private.provider_enabled('supabase'), 'the platform itself is enabled');

-- A device-side provider can never hold a server secret.
select is((select count(*)::integer from private.external_providers
           where execution_context='device' and credential_secret_name is not null),
  0, 'NO DEVICE-SIDE PROVIDER HOLDS A CREDENTIAL');
select throws_ok(
  $q$insert into private.external_providers
      (provider_key, display_name, purpose, introduced_by_wps, current_status,
       execution_context, environments, data_categories, privacy_policy_ref,
       security_owner, operational_owner, date_introduced, provider_version,
       last_review_date, capability_role, credential_secret_name, notes)
    values ('bad_device','X','X','WPS-024','active','device',array['local'],array['x'],
      'privacy_policy','x','x',current_date,'1',current_date,'document_capture',
      'SOME_SECRET','x')$q$,
  '23514', null,
  'A DEVICE PROVIDER WITH A SERVER SECRET IS REFUSED BY THE DATABASE');

-- The registry holds secret NAMES and no values.
select is((select count(*)::integer from private.external_providers
           where credential_secret_name is not null
             and credential_secret_name !~ '^[A-Z][A-Z0-9_]+$'),
  0, 'every credential reference is a SCREAMING_SNAKE name, never a value');

-- Provider history is append-only.
select throws_ok(
  $q$update private.external_provider_events set reason='rewritten'$q$,
  '42501', null, 'provider history cannot be rewritten');

-- OCR audit shape.
select is((select count(*)::integer from information_schema.columns
           where table_schema='private' and table_name='ocr_requests'
             and column_name in ('provider_version','document_hash','latency_ms','mean_confidence')),
  4, 'the OCR audit records provider version, document hash, latency and confidence');
select is((select count(*)::integer from information_schema.columns
           where table_schema='private' and table_name='ocr_requests'
             and column_name in ('raw_response','provider_payload','response_body','image')),
  0, 'THE OCR AUDIT HAS NO COLUMN FOR A RAW PROVIDER PAYLOAD OR AN IMAGE');
select is((select count(*)::integer from (
    select pg_temp.code_of('private','open_ocr_request') c) s
  where s.c ~* 'raw_response|payload|image_bytes'),
  0, 'nothing in the OCR audit path stores a payload');

-- The accuracy baseline cannot be run against production customer documents.
select throws_ok(
  $q$insert into private.ocr_accuracy_runs
      (run_label, provider_key, provider_version, sample_source, sample_count,
       environment, notes)
    values ('x','google_cloud_vision','v1','production_customer_documents',1,'local','x')$q$,
  '23514', null,
  'PRODUCTION CUSTOMER DOCUMENTS ARE NOT A PERMITTED SAMPLE SOURCE');
select throws_ok(
  $q$insert into private.ocr_accuracy_runs
      (run_label, provider_key, provider_version, sample_source, sample_count,
       environment, notes)
    values ('x','google_cloud_vision','v1','synthetic',1,'production','x')$q$,
  '23514', null,
  'THE ACCURACY BASELINE CANNOT BE RUN AGAINST PRODUCTION');
select is((select count(*)::integer from private.ocr_accuracy_runs), 0,
  'NO ACCURACY BASELINE IS RECORDED, BECAUSE NONE HAS BEEN MEASURED');

-- Client roles reach none of it.
select is((select count(*)::integer from information_schema.role_table_grants
           where table_schema='private'
             and table_name in ('external_providers','ocr_requests','ocr_accuracy_runs')
             and grantee in ('anon','authenticated')),
  0, 'NO CLIENT ROLE REACHES THE PROVIDER REGISTRY OR THE OCR AUDIT');
select is(has_function_privilege('anon','public.get_extraction_capability()','EXECUTE'),
  false, 'extraction capability requires an account');
select is(has_function_privilege('anon','public.staff_provider_registry()','EXECUTE'),
  false, 'the provider registry is not reachable signed out');

-- The staff registry returns names, never values.
select is((select count(*)::integer from (
    select pg_temp.code_of('public','staff_provider_registry') c) s
  where s.c ~* 'service_account|private_key|secret_value'),
  0, 'THE STAFF REGISTRY SURFACE CANNOT RETURN A CREDENTIAL VALUE');

-- The vetting detail surface shows no confidence and no extracted value.
select is((select count(*)::integer from (
    select pg_temp.code_of('public','staff_worker_vetting_detail') c) s
  where s.c like '%confidence%' or s.c like '%candidate_value%'),
  0, 'THE VETTING DETAIL RETURNS NO CONFIDENCE SCORE AND NO EXTRACTED VALUE');


-- ---------------------------------------------------------------------------
-- Provider abstraction: capability roles, not vendor names
-- ---------------------------------------------------------------------------
select has_column('private','external_providers','capability_role',
  'the registry records what a provider is FOR');
select has_function('private','provider_for_role',array['text'],
  'a role resolves to a provider');
select has_function('private','provider_enabled_for_role',array['text'],
  'a role resolves to a gate');

select is((select count(*)::integer from private.external_providers
           where capability_role is null), 0,
  'every registered provider fills a declared role');
select is(private.provider_for_role('identity_ocr'), 'google_cloud_vision',
  'the OCR role resolves to the one implementation that exists');
select is(private.provider_for_role('location'), 'google_maps_platform',
  'the location role resolves to the one implementation that exists');
select is(private.provider_for_role('no_such_role'), null,
  'an unknown role resolves to nothing rather than to something arbitrary');
select ok(not private.provider_enabled_for_role('identity_ocr'),
  'the OCR role is not enabled, because no credential exists');
select ok(not private.provider_enabled_for_role('location'),
  'the location role is not enabled, because no credential exists');

-- Two live providers for one singular role would make "which one read this
-- document" unanswerable, and the audit trail worthless.
select throws_ok(
  $q$insert into private.external_providers
      (provider_key, display_name, purpose, introduced_by_wps, current_status,
       execution_context, environments, data_categories, privacy_policy_ref,
       security_owner, operational_owner, date_introduced, provider_version,
       last_review_date, capability_role, notes)
    values ('second_ocr','X','X','WPS-024','active','server',array['local'],array['x'],
      'privacy_policy','x','x',current_date,'1',current_date,'identity_ocr','x')$q$,
  '23505', null,
  'A SECOND LIVE PROVIDER FOR A SINGULAR ROLE IS REFUSED BY THE DATABASE');

-- A renderer key belongs to something that renders.
select throws_ok(
  $q$update private.external_providers set map_renderer_key='x'
     where provider_key='google_cloud_vision'$q$,
  '23514', null,
  'a provider that draws no map cannot claim a renderer');
select is((select map_renderer_key from private.external_providers
           where provider_key='google_maps_platform'), 'google_native_sdk',
  'the registry names the renderer both runtimes agree on');

-- The load-bearing assertion: no capability surface names a vendor.
-- Word boundaries, not substrings. `where` contains `here`, and a check that
-- fires on every SQL clause is a check nobody keeps.
select is((select count(*)::integer from (
    select pg_temp.code_of('public','get_extraction_capability') c) s
  where s.c ~* '\ygoogle\y|\yvision\y|\yazure\y|\ytextract\y'),
  0, 'THE EXTRACTION CAPABILITY SURFACE NAMES NO VENDOR');
select is((select count(*)::integer from (
    select pg_temp.code_of('public','get_location_capability') c) s
  where s.c ~* '\ygoogle\y|\ymapbox\y|\yopenstreetmap\y'),
  0, 'THE LOCATION CAPABILITY SURFACE NAMES NO VENDOR');

-- ---------------------------------------------------------------------------
-- Provider health
-- ---------------------------------------------------------------------------
select has_table('private','provider_health_samples','health samples exist');
select has_table('private','provider_health','the health rollup exists');
select has_function('private','record_provider_health',
  array['text','text','text','text','integer','smallint','boolean'],
  'health is recorded through one function');
select has_function('private','provider_availability',array['text','interval'],
  'availability is computed over a window');

-- Health must not become a second route to identity data. Asserted as a
-- property of the schema rather than promised in a comment.
select is((select count(*)::integer from information_schema.columns
           where table_schema='private' and table_name in ('provider_health_samples','provider_health')
             and column_name in ('user_id','account_id','provider_id','subject_ref',
                                 'document_hash','candidate_value','storage_path')),
  0, 'NO HEALTH TABLE HOLDS AN ACCOUNT, A DOCUMENT OR AN EXTRACTED VALUE');
select is((select count(*)::integer from information_schema.columns
           where table_schema='private' and table_name in ('provider_health_samples','provider_health')
             and (column_name ~* 'secret|credential|private_key|token')),
  0, 'NO HEALTH TABLE HOLDS A CREDENTIAL');

select is((select count(*)::integer from information_schema.role_table_grants
           where table_schema='private'
             and table_name in ('provider_health_samples','provider_health')
             and grantee in ('anon','authenticated')),
  0, 'NO CLIENT ROLE REACHES PROVIDER HEALTH');
select is(has_function_privilege('anon','public.staff_provider_health()','EXECUTE'),
  false, 'THE HEALTH SURFACE IS NOT REACHABLE SIGNED OUT');

-- Nothing has been observed, because no provider has been called.
select is((select count(*)::integer from private.provider_health_samples), 0,
  'no provider call has been recorded, because none has been made');
select is(private.provider_availability('google_cloud_vision', interval '24 hours'), null,
  'AN UNOBSERVED PROVIDER REPORTS NULL AVAILABILITY, NEVER A GREEN 100%');

-- Recording behaviour, exercised rather than described.
select lives_ok(
  $q$select private.record_provider_health('google_cloud_vision','extract_identity',
      'images:annotate/v1','succeeded',120,1::smallint,false)$q$,
  'a successful call is recorded');
select lives_ok(
  $q$select private.record_provider_health('google_cloud_vision','extract_identity',
      'images:annotate/v1','provider_error',900,2::smallint,false)$q$,
  'a failed call is recorded');
select lives_ok(
  $q$select private.record_provider_health('google_cloud_vision','extract_identity',
      'images:annotate/v1','timed_out',20000,2::smallint,true)$q$,
  'a timeout is recorded');

select is((select total_requests::integer from private.provider_health
           where provider_key='google_cloud_vision'), 3, 'every call is counted');
select is((select total_failures::integer from private.provider_health
           where provider_key='google_cloud_vision'), 2, 'failures are counted');
select is((select total_timeouts::integer from private.provider_health
           where provider_key='google_cloud_vision'), 1, 'timeouts are counted');
select is((select total_retries::integer from private.provider_health
           where provider_key='google_cloud_vision'), 2,
  'a second attempt is counted as a retry, so degradation shows before failure');
select is((select consecutive_failures::integer from private.provider_health
           where provider_key='google_cloud_vision'), 2,
  'consecutive failures accumulate — this is the number that should page somebody');
select ok((select last_success_at is not null from private.provider_health
           where provider_key='google_cloud_vision'),
  'the last success is remembered through subsequent failures');

select lives_ok(
  $q$select private.record_provider_health('google_cloud_vision','extract_identity',
      'images:annotate/v1','succeeded',110,1::smallint,false)$q$,
  'a later success is recorded');
select is((select consecutive_failures::integer from private.provider_health
           where provider_key='google_cloud_vision'), 0,
  'a success resets the consecutive failure count');

-- Warsha's own refusal is not a supplier outage.
select is(private.provider_availability('google_cloud_vision', interval '24 hours'), 0.5000,
  'availability counts successes against calls actually made');
select lives_ok(
  $q$select private.record_provider_health('google_cloud_vision','extract_identity',
      'images:annotate/v1','refused_disabled',null,0::smallint,false)$q$,
  'a refusal is recorded');
select is(private.provider_availability('google_cloud_vision', interval '24 hours'), 0.5000,
  'AVAILABILITY EXCLUDES WARSHA''S OWN KILL SWITCH, WHICH IS NOT A SUPPLIER FAILURE');

-- Health recording must never be the thing that fails a worker's request.
select lives_ok(
  $q$select private.record_provider_health('not_a_registered_provider','x','1','succeeded')$q$,
  'RECORDING HEALTH FOR AN UNREGISTERED PROVIDER IS SILENT, NOT AN EXCEPTION');
select is((select count(*)::integer from private.provider_health_samples
           where provider_key='not_a_registered_provider'), 0,
  'and it records nothing');

select throws_ok(
  $q$update private.provider_health_samples set outcome='succeeded'$q$,
  '42501', null, 'health samples cannot be rewritten');
select throws_ok(
  $q$delete from private.provider_health_samples$q$,
  '42501', null, 'health samples cannot be deleted');

-- ---------------------------------------------------------------------------
-- The extraction row the writer actually writes
-- ---------------------------------------------------------------------------
-- Without these three columns every successful extraction would have failed at
-- the insert: a provider call, an audit row, candidates on screen, and nothing
-- persisted for the worker to confirm.
select has_column('private','worker_identity_extractions','document_type',
  'an extraction records which side of the card it came from');
select has_column('private','worker_identity_extractions','document_hash',
  'an extraction records the hash of what was read');
select has_column('private','worker_identity_extractions','is_current',
  'an extraction can be superseded by a retake');
select has_column('private','worker_identity_extractions','extracted_at',
  'an extraction records when it happened');
select has_column('private','worker_identity_extractions','provider_version',
  'an extraction records which provider build produced it');

select has_index('private','worker_identity_extractions',
  'worker_identity_extractions_current_idx',
  'ONE CURRENT CANDIDATE PER FIELD PER SIDE, SO A DISCARDED PHOTOGRAPH IS NEVER CONFIRMABLE');

-- The benchmark separates a parser defect from a vendor defect.
select has_column('private','ocr_accuracy_runs','parser_failure_rate',
  'the baseline records parser failures separately from OCR failures');
select has_column('private','ocr_accuracy_runs','parser_version',
  'the baseline records which parser produced it');

select finish();
rollback;
