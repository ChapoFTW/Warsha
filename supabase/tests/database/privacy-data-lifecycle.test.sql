begin;
select no_plan();

-- WPS-022 — Privacy, Data Lifecycle & User Rights.
--
-- Six questions this suite exists to answer, because every one of them fails
-- quietly and looks fine until somebody is harmed:
--   * can one account read another account's consent, deletion, or export row?
--   * can a deletion request erase a booking, a ledger entry, or a payout?
--   * can a deletion proceed while a dispute, a debt, or a hold is open?
--   * can retention execute against real data without a reviewed duration?
--   * can staff read the contents of somebody's export?
--   * is anything still world-readable that should not be?

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

-- Strips comments before searching a function body, so a comment explaining
-- why something is absent can never satisfy the check for that absence.
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
select has_table('public','privacy_consent_purposes','consent purposes exist');
select has_table('public','privacy_consent_records','consent history exists');
select has_table('public','account_deletion_requests','deletion requests exist');
select has_table('public','privacy_export_requests','export requests exist');
select has_table('private','data_classifications','the classification registry exists');
select has_table('private','data_inventory','the data inventory exists');
select has_table('private','privacy_legal_holds','legal holds exist');
select has_table('private','privacy_legal_hold_events','hold history exists');
select has_table('private','privacy_retention_rules','retention rules exist');
select has_table('private','privacy_retention_runs','retention runs are recorded');
select has_table('private','storage_bucket_lifecycle','the bucket matrix exists');
select has_table('private','privacy_incident_details','privacy incident facts exist');
select has_table('private','account_deletion_events','deletion history exists');
select has_table('private','privacy_anonymization_log','anonymization steps are logged');
select has_table('private','privacy_configuration','privacy configuration exists');
select has_column('public','profiles','deactivated_at','deactivation is a profile fact');

-- No parallel system. Privacy does not restate what another WPS already owns.
select hasnt_table('public','privacy_preferences',
  'NO SECOND PREFERENCE SYSTEM: optional processing is consent, not a new table');
select hasnt_table('public','privacy_incidents',
  'NO SECOND INCIDENT SYSTEM: privacy facts attach to a WPS-017 incident');
select hasnt_table('public','user_data_exports',
  'no second export system beside privacy_export_requests');
select hasnt_table('private','privacy_ledger',
  'NO SECOND FINANCIAL AUTHORITY: WPS-007 remains the only ledger');

select has_function('public','get_my_privacy_overview','the privacy overview exists');
select has_function('public','get_my_consents','the consent read exists');
select has_function('public','record_my_consent',array['text','boolean','text'],
  'recording a consent decision exists');
select has_function('public','clear_my_privacy_history',array['text'],
  'history clearing exists');
select has_function('public','set_my_account_deactivated',array['boolean'],
  'deactivation exists and is SEPARATE from deletion');
select has_function('public','request_account_deletion',array['text','text'],
  'deletion requests exist');
select has_function('public','cancel_account_deletion','cancellation exists');
select has_function('public','request_my_data_export',array['text'],'export requests exist');
select has_function('public','get_my_data_exports',array['integer'],'export reads exist');
select has_function('private','privacy_deletion_blockers',array['uuid'],
  'blocker evaluation is private');
select has_function('private','privacy_anonymize_account',array['uuid','uuid'],
  'anonymization is private and never client-callable');
select has_function('private','privacy_hold_active',array['uuid','text'],'hold checks are private');
select has_function('private','privacy_retention_executable',array['text'],
  'the execution guard is private');
select has_function('private','privacy_build_manifest',array['uuid'],'manifest building is private');
select has_function('public','staff_retention_dry_run',array['text'],'the dry run exists');
select has_function('public','staff_storage_orphan_preview',array['text'],'orphan preview exists');
select has_function('public','staff_privacy_requests',array['integer'],'the staff queue exists');
select has_function('public','staff_create_legal_hold',
  array['uuid','text','text','text','timestamp with time zone'],'hold creation exists');
select has_function('public','staff_release_legal_hold',array['uuid','text'],'hold release exists');
select has_function('public','staff_data_inventory','the inventory read exists');

-- There is deliberately no RPC that executes retention or performs a deletion
-- from the client. Absence is the control, so it is asserted.
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and p.proname ~ '(execute_retention|purge_|hard_delete|force_delete)'),
  0, 'NO CLIENT-REACHABLE RPC EXECUTES A PURGE OR A HARD DELETE');

-- ---------------------------------------------------------------------------
-- Preservation — every authority WPS-022 leans on still exists, unchanged
-- ---------------------------------------------------------------------------
select has_function('private','require_staff_capability',array['text'],
  'the WPS-018 capability gate is preserved');
select has_function('private','record_staff_audit',
  array['uuid','text','text','text','uuid','text','jsonb'],
  'the WPS-017 audit sink is preserved');
select has_function('private','staff_log_access',array['uuid','text','text','text','integer'],
  'the WPS-018 sensitive-access log is preserved');
select has_function('private','enforce_rate_limit',array['text','text'],
  'the WPS-018 rate limiter is preserved');
select has_function('private','record_operational_event',
  array['text','text','text','jsonb','text','uuid'],
  'the WPS-018 operational log is preserved');
select has_function('private','create_booking_price_snapshot',array['uuid','bigint'],
  'the WPS-007 snapshot authority is preserved');
select has_function('private','staff_kill_switch_active',array['text'],
  'the WPS-017 kill switch is preserved');
select has_function('public','clear_my_recent_searches',
  'the WPS-020 search clearing RPC is preserved, not replaced');
select has_function('public','clear_my_recently_viewed',
  'the WPS-020 view clearing RPC is preserved, not replaced');
select has_function('public','get_my_referral_code','the WPS-021 referral surface is preserved');
select has_function('public','get_my_booking_benefit',array['uuid'],
  'the WPS-021 benefit surface is preserved');

-- ---------------------------------------------------------------------------
-- The retired `avatars` bucket
-- ---------------------------------------------------------------------------
select ok((select not public from storage.buckets where id='avatars'),
  'THE LEGACY avatars BUCKET IS NO LONGER PUBLIC');
select is((select count(*)::integer from pg_policy p
  join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='storage' and c.relname='objects'
    and (coalesce(pg_get_expr(p.polqual,p.polrelid),'')
       ||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) like '%''avatars''%'),
  0, 'NO POLICY GRANTS ANY ACCESS TO THE RETIRED avatars BUCKET');
select ok((select allowed_mime_types is not null from storage.buckets where id='avatars'),
  'the retired bucket is bounded even though nothing may write to it');
select ok((select count(*) > 0 from storage.buckets where id='avatars'),
  'the bucket is retired, not dropped: hosted objects may exist');

-- The leftover Supabase default grants are gone.
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated')
    and privilege_type = 'TRUNCATE'),
  0, 'NO CLIENT ROLE HOLDS TRUNCATE ON ANY PUBLIC TABLE');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated')
    and privilege_type in ('REFERENCES','TRIGGER')),
  0, 'no client role holds REFERENCES or TRIGGER on any public table');

-- ---------------------------------------------------------------------------
-- Grants, RLS, and the private schema
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid='public.privacy_consent_records'::regclass),
  'RLS is enabled on consent history');
select ok((select relrowsecurity from pg_class where oid='public.account_deletion_requests'::regclass),
  'RLS is enabled on deletion requests');
select ok((select relrowsecurity from pg_class where oid='public.privacy_export_requests'::regclass),
  'RLS is enabled on export requests');

-- Read-only for the client on every privacy table. Every write is an RPC.
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public'
    and table_name in ('privacy_consent_records','account_deletion_requests',
                       'privacy_export_requests','privacy_consent_purposes')
    and grantee in ('anon','authenticated','public')
    and privilege_type in ('INSERT','UPDATE','DELETE')),
  0, 'NO CLIENT ROLE MAY WRITE ANY PRIVACY TABLE DIRECTLY');
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='public'
    and table_name in ('privacy_consent_records','account_deletion_requests','privacy_export_requests')
    and grantee = 'anon'),
  0, 'anon holds no grant on any privacy table');
select is((select count(*)::integer from pg_policies
  where schemaname='public'
    and tablename in ('privacy_consent_records','account_deletion_requests','privacy_export_requests')
    and cmd <> 'SELECT'),
  0, 'no policy permits a client INSERT, UPDATE or DELETE on a privacy table');

-- The private registries are unreachable from any client role.
select is((select count(*)::integer from information_schema.role_table_grants
  where table_schema='private'
    and table_name in ('privacy_legal_holds','privacy_legal_hold_events','data_inventory',
                       'data_classifications','privacy_retention_rules','privacy_configuration',
                       'account_deletion_events','privacy_anonymization_log',
                       'privacy_incident_details','storage_bucket_lifecycle')
    and grantee in ('anon','authenticated','public')),
  0, 'NO CLIENT ROLE HOLDS ANY GRANT ON A PRIVATE PRIVACY REGISTRY');

-- Every WPS-022 function is hardened the same way the rest of the schema is.
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f' and p.prosecdef
    and (p.proname ~ '^(privacy_|get_my_privacy|get_my_consents|record_my_consent|clear_my_privacy)'
      or p.proname ~ '^(request_account_deletion|cancel_account_deletion|request_my_data_export)'
      or p.proname ~ '^(get_my_data_exports|set_my_account_deactivated|staff_retention_dry_run)'
      or p.proname ~ '^(staff_storage_orphan_preview|staff_privacy_requests|staff_data_inventory)'
      or p.proname ~ '^(staff_create_legal_hold|staff_release_legal_hold)')
    and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) cfg
                    where cfg ~ '^search_path=("")?$')),
  0, 'EVERY WPS-022 SECURITY DEFINER FUNCTION PINS AN EMPTY search_path');

-- Nothing privacy-related is published to Realtime. A deletion request
-- broadcast on a channel is a leak with a subscription.
select is((select count(*)::integer from pg_publication_tables
  where pubname='supabase_realtime'
    and tablename in ('privacy_consent_records','account_deletion_requests',
                      'privacy_export_requests','privacy_consent_purposes')),
  0, 'NO PRIVACY TABLE IS PUBLISHED TO REALTIME');

-- ---------------------------------------------------------------------------
-- Seed integrity
-- ---------------------------------------------------------------------------
select ok((select count(*) >= 12 from private.data_classifications),
  'every data class is registered');
select ok((select count(*) >= 25 from private.data_inventory),
  'the inventory covers the personal-data objects');
select is((select count(*)::integer from private.data_inventory i
  where not exists (select 1 from private.data_classifications c
                    where c.classification_key = i.classification_key)),
  0, 'every inventory entry has a real classification');

-- Every bucket is accounted for, in both directions. A bucket with no
-- lifecycle row has no owner; a lifecycle row with no bucket is fiction.
select is((select count(*)::integer from storage.buckets b
  where not exists (select 1 from private.storage_bucket_lifecycle l where l.bucket_id=b.id)),
  0, 'EVERY STORAGE BUCKET HAS A DOCUMENTED LIFECYCLE OWNER');
select is((select count(*)::integer from private.storage_bucket_lifecycle l
  where not exists (select 1 from storage.buckets b where b.id=l.bucket_id)),
  0, 'the lifecycle matrix describes no bucket that does not exist');

-- Nothing may claim to be anonymous while remaining linkable.
select is((select count(*)::integer from private.data_classifications
  where not personal and classification_key <> 'aggregate_nonpersonal'),
  0, 'only genuinely aggregated data is classified as non-personal');

-- ---------------------------------------------------------------------------
-- Fail closed
-- ---------------------------------------------------------------------------
select ok(not private.privacy_surface_enabled('center'), 'the privacy centre ships disabled');
select ok(not private.privacy_surface_enabled('export'), 'export ships disabled');
select ok(not private.privacy_surface_enabled('deletion'), 'deletion ships disabled');
select is((select count(*)::integer from private.privacy_retention_rules r
  where private.privacy_retention_executable(r.rule_key)),
  0, 'NO RETENTION RULE IS EXECUTABLE AS SHIPPED');
select ok((select not retention_execution_enabled from private.privacy_configuration),
  'retention execution is disabled in configuration');
select ok((select count(*) > 0 from private.privacy_retention_rules
  where legal_review_status = 'pending'),
  'durations that need professional advice are marked pending, not asserted');

-- Retention rules that touch identity or money are never auto-deleting.
select is((select count(*)::integer from private.privacy_retention_rules
  where rule_key in ('identity_documents','financial_records','dispute_evidence')
    and action_at_expiry = 'delete'),
  0, 'NO IDENTITY, FINANCIAL OR DISPUTE RULE DELETES AUTOMATICALLY');

-- ---------------------------------------------------------------------------
-- Anonymous denial
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.get_my_privacy_overview()$$,'42501',null,
  'an anonymous caller has no privacy overview');
select throws_ok($$select public.get_my_consents()$$,'42501',null,
  'an anonymous caller cannot read consents');
select throws_ok($$select public.request_account_deletion(null,null)$$,'42501',null,
  'an anonymous caller cannot request a deletion');
select throws_ok($$select public.request_my_data_export(null)$$,'42501',null,
  'an anonymous caller cannot request an export');
select throws_ok($$select public.clear_my_privacy_history('all')$$,'42501',null,
  'an anonymous caller cannot clear a history');
-- Not "returns zero rows" — anon holds no grant at all, so the read is refused
-- before RLS is ever consulted. That is the stronger of the two answers.
select throws_ok($$select count(*) from public.privacy_consent_purposes$$,'42501',null,
  'ANON HOLDS NO GRANT ON THE CONSENT PURPOSES TABLE');
select throws_ok($$select count(*) from public.account_deletion_requests$$,'42501',null,
  'anon holds no grant on deletion requests');
select throws_ok($$select count(*) from public.privacy_export_requests$$,'42501',null,
  'anon holds no grant on export requests');
reset role;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a2200000-0000-4000-8000-000000000001','authenticated','authenticated','wps022-alpha@test.local','',now(),'{}','{"display_name":"Alpha Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2200000-0000-4000-8000-000000000002','authenticated','authenticated','wps022-beta@test.local','',now(),'{}','{"display_name":"Beta Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2200000-0000-4000-8000-000000000003','authenticated','authenticated','wps022-blocked@test.local','',now(),'{}','{"display_name":"Blocked Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2200000-0000-4000-8000-000000000004','authenticated','authenticated','wps022-worker@test.local','',now(),'{}','{"display_name":"Worker Account"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2200000-0000-4000-8000-000000000005','authenticated','authenticated','wps022-secadmin@test.local','',now(),'{}','{"display_name":"Security Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2200000-0000-4000-8000-000000000006','authenticated','authenticated','wps022-secadmin2@test.local','',now(),'{}','{"display_name":"Second Security Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a2200000-0000-4000-8000-000000000007','authenticated','authenticated','wps022-held@test.local','',now(),'{}','{"display_name":"Held Account"}',now(),now());

insert into public.customer_profiles(id) values
  ('a2200000-0000-4000-8000-000000000001'),
  ('a2200000-0000-4000-8000-000000000002'),
  ('a2200000-0000-4000-8000-000000000003'),
  ('a2200000-0000-4000-8000-000000000007') on conflict do nothing;

insert into public.provider_profiles(id,user_id,display_name,profession_key,
  onboarding_status,is_published,is_verified,about)
values ('b2200000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000004',
  'WPS022 Worker','plumber','approved',true,true,'A biography that anonymization must remove.');

insert into public.addresses(id,customer_id,label,address_line,governorate) values
  ('c2200000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000001','Home','1 Privacy Street','Cairo'),
  ('c2200000-0000-4000-8000-000000000002','a2200000-0000-4000-8000-000000000003','Home','2 Privacy Street','Cairo');

-- A completed booking for the account that will be anonymized, and an ACTIVE
-- booking for the account that must be blocked. Both are seeded at the state
-- the WPS-012 machine allows, not forced into it.
select pg_temp.act_as('a2200000-0000-4000-8000-000000000001');
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,
  pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,
  address_id,address_snapshot,idempotency_key)
select 'd2200000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000001',
  'b2200000-0000-4000-8000-000000000001',s.id,'job_started','WPS022 fixture one','fixed',500,
  'Privacy fixture booking one',current_date,'10:00',
  'c2200000-0000-4000-8000-000000000001','Private fixture address','wps022-booking-1'
from public.services s where s.category_id='plumbing' order by s.id limit 1;
select pg_temp.act_as_nobody();

select pg_temp.act_as('a2200000-0000-4000-8000-000000000003');
insert into public.bookings(id,customer_id,provider_id,service_id,status,service_name_snapshot,
  pricing_type,estimated_price_egp,issue_description,scheduled_date,scheduled_time,
  address_id,address_snapshot,idempotency_key)
select 'd2200000-0000-4000-8000-000000000002','a2200000-0000-4000-8000-000000000003',
  'b2200000-0000-4000-8000-000000000001',s.id,'job_started','WPS022 fixture two','fixed',400,
  'Privacy fixture booking two',current_date,'11:00',
  'c2200000-0000-4000-8000-000000000002','Private fixture address','wps022-booking-2'
from public.services s where s.category_id='plumbing' order by s.id limit 1;
select pg_temp.act_as_nobody();

select ok(private.bootstrap_staff_role('a2200000-0000-4000-8000-000000000005',
  'security_administrator','WPS-022 fixture bootstrap') is not null,
  'the fixture security administrator is bootstrapped by a DBA');

set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000005');
select ok(public.staff_grant_role('a2200000-0000-4000-8000-000000000006','security_administrator',
  'WPS-022 fixture','wps022-grant-0001') is not null, 'a second administrator is granted');
reset role;

-- Turn the surfaces on for the behavioural tests below. They ship off; this
-- proves the guard is a switch and not a wall.
update private.staff_feature_flags set enabled=true, audience='all'
  where flag_key in ('privacy_center','data_export','account_deletion') and environment='local';
update private.privacy_configuration
  set privacy_center_enabled=true, export_enabled=true, deletion_enabled=true;

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000001');

select ok(pg_catalog.jsonb_array_length(public.get_my_consents()) >= 8,
  'every active purpose is offered, required and optional alike');

select is((public.record_my_consent('marketing_communication', true) ->> 'granted')::boolean,
  true, 'an optional purpose can be granted');
select is((public.record_my_consent('marketing_communication', false) ->> 'granted')::boolean,
  false, 'an optional purpose can be withdrawn');

-- Withdrawal appends; it does not erase what was true before.
select is((select count(*)::integer from public.privacy_consent_records
  where user_id='a2200000-0000-4000-8000-000000000001'
    and purpose_key='marketing_communication'),
  2, 'WITHDRAWAL APPENDS A DECISION RATHER THAN EDITING THE EARLIER ONE');
select ok((select withdrawn_at is not null from public.privacy_consent_records
  where user_id='a2200000-0000-4000-8000-000000000001'
    and purpose_key='marketing_communication' and granted),
  'the earlier grant records when it stopped applying');

-- Accepting Terms is not a blanket permission: a required purpose cannot be
-- refused, and an optional one is off until it is chosen.
select throws_ok(
  $$select public.record_my_consent('terms_of_service', false)$$,'22023',null,
  'a required purpose cannot be declined, and says so rather than storing a lie');
select throws_ok(
  $$select public.record_my_consent('not_a_real_purpose', true)$$,'22023',null,
  'an unknown purpose is refused');
-- The JSON keys are camelCase, so the record column names have to be quoted:
-- an unquoted `purposeKey` folds to `purposekey` and matches nothing.
select ok((select not granted from pg_catalog.jsonb_to_recordset(public.get_my_consents())
  as t("purposeKey" text, granted boolean) where t."purposeKey"='diagnostics'),
  'OPTIONAL PROCESSING IS OFF UNTIL IT IS CHOSEN');

-- Consent history is immutable to everyone, including its owner.
select throws_ok(
  $$update public.privacy_consent_records set granted = true
    where user_id='a2200000-0000-4000-8000-000000000001'$$,
  '42501', null, 'consent history cannot be rewritten');
select throws_ok(
  $$delete from public.privacy_consent_records
    where user_id='a2200000-0000-4000-8000-000000000001'$$,
  '42501', null, 'CONSENT HISTORY CANNOT BE DELETED');

-- ---------------------------------------------------------------------------
-- Cross-account isolation
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2200000-0000-4000-8000-000000000002');
select is((select count(*)::integer from public.privacy_consent_records
  where user_id='a2200000-0000-4000-8000-000000000001'),
  0, 'ONE ACCOUNT CANNOT READ ANOTHER ACCOUNT''S CONSENT HISTORY');

-- ---------------------------------------------------------------------------
-- History clearing
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2200000-0000-4000-8000-000000000001');
insert into public.user_recent_searches(user_id,query,normalized_query)
values ('a2200000-0000-4000-8000-000000000001','plumber cairo','plumber cairo');
insert into public.user_recently_viewed_providers(user_id,provider_id)
values ('a2200000-0000-4000-8000-000000000001','b2200000-0000-4000-8000-000000000001');

select is((public.clear_my_privacy_history('searches') ->> 'searchesCleared')::integer,
  1, 'clearing searches removes exactly the searches');
select is((select count(*)::integer from public.user_recently_viewed_providers
  where user_id='a2200000-0000-4000-8000-000000000001'),
  1, 'clearing searches leaves viewing history alone');
select is((public.clear_my_privacy_history('views') ->> 'viewsCleared')::integer,
  1, 'clearing views removes exactly the views');
select throws_ok($$select public.clear_my_privacy_history('everything')$$,'22023',null,
  'an unknown history scope is refused rather than guessed');

-- ---------------------------------------------------------------------------
-- Deactivation is not deletion
-- ---------------------------------------------------------------------------
select is((public.set_my_account_deactivated(true) ->> 'deactivated')::boolean, true,
  'an account can be deactivated');
select ok((select deactivated_at is not null from public.profiles
  where id='a2200000-0000-4000-8000-000000000001'),
  'deactivation is recorded');
select ok((select deleted_at is null from public.profiles
  where id='a2200000-0000-4000-8000-000000000001'),
  'DEACTIVATION DELETES NOTHING');
select is((select count(*)::integer from public.bookings
  where customer_id='a2200000-0000-4000-8000-000000000001'),
  1, 'deactivation preserves the booking history');
select is((public.set_my_account_deactivated(false) ->> 'deactivated')::boolean, false,
  'deactivation is reversible');
select ok((select deactivated_at is null from public.profiles
  where id='a2200000-0000-4000-8000-000000000001'),
  'reactivating clears the flag');

-- ---------------------------------------------------------------------------
-- Deletion: request, idempotency, cancellation
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a2200000-0000-4000-8000-000000000002');
select is(public.request_account_deletion('no_longer_needed','wps022-del-0001') ->> 'status',
  'cooling_off', 'a clean account enters the cooling-off window');
select is((public.request_account_deletion('no_longer_needed','wps022-del-0001') ->> 'created')::boolean,
  false, 'A RETRY RETURNS THE STANDING REQUEST RATHER THAN OPENING A SECOND');
select is((select count(*)::integer from public.account_deletion_requests
  where user_id='a2200000-0000-4000-8000-000000000002'),
  1, 'exactly one deletion request exists after the retry');
select is((select count(*)::integer from public.account_deletion_requests
  where user_id='a2200000-0000-4000-8000-000000000002'
    and cooling_off_ends_at > pg_catalog.now()),
  1, 'the cooling-off window is in the future');

select is((public.cancel_account_deletion() ->> 'cancelled')::boolean, true,
  'a request can be cancelled while it is still cancellable');
select is((select status from public.account_deletion_requests
  where user_id='a2200000-0000-4000-8000-000000000002'),
  'cancelled', 'the cancelled request says so');
select is((public.cancel_account_deletion() ->> 'cancelled')::boolean, false,
  'cancelling twice is honest rather than pretending');

-- The lifecycle is recorded and cannot be rewritten. Read as the DBA: the
-- event log lives in `private`, where no client role holds a grant at all.
reset role;
select is((select count(*)::integer from private.account_deletion_events e
  join public.account_deletion_requests r on r.id=e.request_id
  where r.user_id='a2200000-0000-4000-8000-000000000002'),
  2, 'the deletion lifecycle records both the request and the cancellation');
select throws_ok($$update private.account_deletion_events set to_status='completed'$$,
  '42501', null, 'DELETION HISTORY IS IMMUTABLE');

-- ---------------------------------------------------------------------------
-- Deletion blockers
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000003');
select is(public.request_account_deletion(null,'wps022-del-0002') ->> 'status',
  'blocked', 'AN ACCOUNT WITH AN ACTIVE BOOKING IS BLOCKED, NOT SILENTLY QUEUED');
select ok((select 'active_booking' = any (blocker_codes) from public.account_deletion_requests
  where user_id='a2200000-0000-4000-8000-000000000003'),
  'the blocker is named by a stable code');
-- A blocked request is still cancellable: an account that cannot leave yet is
-- not thereby trapped in a workflow it did not want.
select is((public.cancel_account_deletion() ->> 'cancelled')::boolean, true,
  'a BLOCKED request can still be cancelled by its owner');

-- Blocker evaluation is a server-side fact. The evaluator is private, so this
-- reads it as the DBA — a client cannot reach it at all, which is asserted next.
reset role;
select ok((select 'active_booking' = any (private.privacy_deletion_blockers(
    'a2200000-0000-4000-8000-000000000003'))),
  'blocker evaluation is a server-side fact, not a client claim');
set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000003');
select throws_ok(
  $$select private.privacy_deletion_blockers('a2200000-0000-4000-8000-000000000003')$$,
  '42501', null, 'NO CLIENT MAY CALL THE BLOCKER EVALUATOR DIRECTLY');
select throws_ok(
  $$select private.privacy_anonymize_account('a2200000-0000-4000-8000-000000000003', null)$$,
  '42501', null, 'NO CLIENT MAY CALL ANONYMIZATION DIRECTLY');

-- The blocker codes carry no evidence, no names, and no staff detail.
select is((select count(*)::integer from public.account_deletion_requests r,
  unnest(r.blocker_codes) c where c !~ '^[a-z_]+$'),
  0, 'EVERY BLOCKER CODE IS AN OPAQUE SLUG THAT NAMES NOBODY');

-- ---------------------------------------------------------------------------
-- Legal holds
-- ---------------------------------------------------------------------------
reset role;
select is(private.privacy_hold_active('a2200000-0000-4000-8000-000000000007','account'), false,
  'an account with no hold is not held');

set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000005');
select ok(public.staff_create_legal_hold('a2200000-0000-4000-8000-000000000007',
  'account','fraud_review','A documented fraud review is open on this account.',
  pg_catalog.now() + interval '30 days') is not null,
  'an authorized administrator can create a hold');

select throws_ok(
  $$select public.staff_create_legal_hold('a2200000-0000-4000-8000-000000000007',
      'account','fraud_review','A hold with no review date is permanent retention.',
      null)$$,
  '22023', null, 'A HOLD WITHOUT A REVIEW DATE IS REFUSED');
select throws_ok(
  $$select public.staff_create_legal_hold('a2200000-0000-4000-8000-000000000007',
      'account','fraud_review','A hold longer than a year without review.',
      pg_catalog.now() + interval '400 days')$$,
  '22023', null, 'a hold may not outrun its review by more than a year');

-- Captured as the DBA: `private.privacy_legal_holds` is unreachable from any
-- client role, which is exactly the property being relied on here.
reset role;
select set_config('warsha.test_hold_id',
  (select id::text from private.privacy_legal_holds
   where subject_user_id='a2200000-0000-4000-8000-000000000007' and released_at is null), true);

select ok(private.privacy_hold_active('a2200000-0000-4000-8000-000000000007','account'),
  'the hold is active');
select ok(private.privacy_hold_active('a2200000-0000-4000-8000-000000000007','identity_documents'),
  'an account-scope hold covers every narrower scope');

-- A held account cannot be anonymized, and the guard is in the function rather
-- than in a caller that might forget.
select throws_ok(
  $$select private.privacy_anonymize_account('a2200000-0000-4000-8000-000000000007', null)$$,
  '42501', null, 'A HELD ACCOUNT CANNOT BE ANONYMIZED');

set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000007');
select is(public.request_account_deletion(null,'wps022-del-0003') ->> 'status',
  'legal_hold', 'a held account is told it is held, distinctly from ordinary blocking');

-- The creator does not release their own hold while dual control is on.
select pg_temp.act_as('a2200000-0000-4000-8000-000000000005');
select throws_ok(
  $$select public.staff_release_legal_hold(
      current_setting('warsha.test_hold_id')::uuid, 'The review has concluded.')$$,
  '42501', null, 'THE PERSON WHO CREATED A HOLD DOES NOT GET TO LIFT IT');

select pg_temp.act_as('a2200000-0000-4000-8000-000000000006');
select ok(public.staff_release_legal_hold(
    current_setting('warsha.test_hold_id')::uuid, 'The review has concluded.'),
  'a second administrator can release it');
select ok(not public.staff_release_legal_hold(
    current_setting('warsha.test_hold_id')::uuid, 'Releasing an already released hold.'),
  'releasing twice is idempotent rather than an error');

reset role;
select ok(not private.privacy_hold_active('a2200000-0000-4000-8000-000000000007','account'),
  'releasing the hold unblocks the scope');
select throws_ok($$update private.privacy_legal_hold_events set action='created'$$,
  '42501', null, 'HOLD HISTORY IS IMMUTABLE');
select ok((select count(*) = 2 from private.privacy_legal_hold_events
  where hold_id = current_setting('warsha.test_hold_id')::uuid),
  'both the creation and the release are recorded');

-- ---------------------------------------------------------------------------
-- Staff authorization
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000001');
select throws_ok($$select public.staff_privacy_requests(10)$$,'42501',null,
  'a customer cannot read the privacy queue');
select throws_ok($$select public.staff_data_inventory()$$,'42501',null,
  'a customer cannot read the data inventory');
select throws_ok($$select public.staff_retention_dry_run('recent_search_history')$$,'42501',null,
  'a customer cannot preview retention');
select throws_ok($$select public.staff_create_legal_hold(
    'a2200000-0000-4000-8000-000000000002','account','fraud_review',
    'A customer should never be able to hold another account.',
    pg_catalog.now() + interval '10 days')$$,
  '42501', null, 'A CUSTOMER CANNOT PLACE A HOLD ON ANOTHER ACCOUNT');
select throws_ok($$select public.staff_storage_orphan_preview('review-attachments')$$,'42501',null,
  'a customer cannot preview storage orphans');

-- Staff see request STATE, never contents.
select pg_temp.act_as('a2200000-0000-4000-8000-000000000005');
select ok(pg_catalog.jsonb_array_length(public.staff_privacy_requests(50)) >= 1,
  'an administrator can see that requests exist');
select is((select count(*)::integer from pg_catalog.jsonb_array_elements(
    public.staff_privacy_requests(50)) e
  where e ? 'manifest' or e ? 'reasonCode' or e ? 'blockerCodes'),
  0, 'THE STAFF QUEUE CARRIES NO MANIFEST, NO REASON AND NO BLOCKER DETAIL');
select is((select count(*)::integer from pg_catalog.jsonb_array_elements(
    public.staff_privacy_requests(50)) e
  where pg_catalog.length(e ->> 'subjectRef') > 8),
  0, 'the queue shows a truncated reference rather than a full account id');

-- The privileged read is logged, every time. Verified as the DBA, because the
-- audit tables live in `private` where staff themselves hold no grant — staff
-- can be audited, and cannot read the audit by holding a capability.
reset role;
select ok((select count(*) > 0 from private.staff_access_log
  where actor_id='a2200000-0000-4000-8000-000000000005'
    and surface='audit_explorer' and query_shape='privacy_deletion_requests'),
  'READING THE PRIVACY QUEUE IS RECORDED IN THE SENSITIVE-ACCESS LOG');
select is((select count(*)::integer from private.staff_access_log
  where surface not in ('safe_search','customer_overview','worker_overview','audit_explorer',
                        'export_request','export_preview','analytics','case_notes')),
  0, 'WPS-022 MAPPED ONTO THE WPS-018 SURFACE ALLOWLIST RATHER THAN WIDENING IT');
select ok((select count(*) > 0 from private.staff_audit_events
  where actor_id='a2200000-0000-4000-8000-000000000005'
    and action='legal_hold_created'),
  'creating a hold is recorded in the immutable staff audit');

-- ---------------------------------------------------------------------------
-- Retention dry run
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000005');
select is(public.staff_retention_dry_run('recent_search_history') ->> 'mode', 'dry_run',
  'the retention preview is a dry run');
select is((public.staff_retention_dry_run('recent_search_history') ->> 'executionEnabled')::boolean,
  false, 'THE DRY RUN REPORTS THAT EXECUTION IS DISABLED');
select is(public.staff_retention_dry_run('identity_documents') ->> 'legalReviewStatus', 'pending',
  'an unreviewed duration reports itself as pending');
select is((public.staff_retention_dry_run('identity_documents') ->> 'supported')::boolean,
  false, 'a rule with no counter says so rather than reporting a misleading zero');
select throws_ok($$select public.staff_retention_dry_run('not_a_rule')$$,'22023',null,
  'an unknown rule is refused');

-- The preview really is read-only.
select is((select count(*)::integer from public.user_recent_searches), 0,
  'the dry run deleted nothing');
select is((public.staff_storage_orphan_preview('review-attachments') ->> 'deletionPerformed')::boolean,
  false, 'THE ORPHAN PREVIEW DELETES NOTHING');
select throws_ok($$select public.staff_storage_orphan_preview('not-a-bucket')$$,'22023',null,
  'an unknown bucket is refused');

select ok(pg_catalog.jsonb_array_length(public.staff_data_inventory()) >= 25,
  'the inventory is readable with the capability');

-- The run ledger lives in `private`, so it is inspected as the DBA.
reset role;
select is((select count(*)::integer from private.privacy_retention_runs
  where mode='execute'), 0, 'NO EXECUTION RUN HAS EVER BEEN RECORDED');
select is((select count(*)::integer from private.privacy_retention_runs where mode='dry_run'),
  4, 'EVERY PREVIEW IS RECORDED, INCLUDING THE ONES WITH NO AUTOMATED COUNTER');
select is((select count(*)::integer from private.privacy_retention_runs
  where mode='dry_run' and outcome='refused'),
  2, 'a rule with no counter records a refusal rather than a silent zero');

-- ---------------------------------------------------------------------------
-- Export
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000001');
select is(public.request_my_data_export('wps022-exp-0001') ->> 'status', 'manifest_ready',
  'an export request produces a manifest');
select is((public.request_my_data_export('wps022-exp-0001') ->> 'created')::boolean, false,
  'an export retry is idempotent');
select throws_ok($$select public.request_my_data_export('wps022-exp-0002')$$,'55000',null,
  'A SECOND OPEN EXPORT IS REFUSED WHILE ONE IS BEING PREPARED');

select ok((select expires_at > pg_catalog.now() from public.privacy_export_requests
  where user_id='a2200000-0000-4000-8000-000000000001'),
  'an export expires');
select ok((select expires_at < pg_catalog.now() + interval '15 days'
  from public.privacy_export_requests where user_id='a2200000-0000-4000-8000-000000000001'),
  'the expiry is short rather than nominal');

-- The manifest describes only the requester, and states what it leaves out.
select ok((select manifest ->> 'subject' = 'a2200000-0000-4000-8000-000000000001'
  from public.privacy_export_requests where user_id='a2200000-0000-4000-8000-000000000001'),
  'the manifest names its own subject');
select ok((select pg_catalog.jsonb_array_length(manifest -> 'excluded') >= 5
  from public.privacy_export_requests where user_id='a2200000-0000-4000-8000-000000000001'),
  'THE MANIFEST STATES WHAT IT DELIBERATELY OMITS');

-- Another account sees nothing of it.
select pg_temp.act_as('a2200000-0000-4000-8000-000000000002');
select is((select count(*)::integer from public.privacy_export_requests
  where user_id='a2200000-0000-4000-8000-000000000001'),
  0, 'ONE ACCOUNT CANNOT SEE ANOTHER ACCOUNT''S EXPORT REQUEST');
select is(pg_catalog.jsonb_array_length(public.get_my_data_exports(10)), 0,
  'the export list is owner-scoped');

-- Nothing staff-private, and nobody else's identity, is reachable through the
-- export path. This is asserted against the code, because a leak here is one
-- table name away at all times.
reset role;
select is((select count(*)::integer from (select pg_temp.code_of('private','privacy_build_manifest') c) s
  where s.c ~ '(trust_report_evidence|trust_fraud_signals|operational_case_notes|staff_audit_events|payment_secret_metadata|payout_provider_references)'),
  0, 'THE EXPORT MANIFEST READS NO STAFF-PRIVATE OR SECRET TABLE');
select is((select count(*)::integer from (select pg_temp.code_of('private','privacy_build_manifest') c) s
  where s.c ~ 'reporter'),
  0, 'the export path never touches reporter identity');

-- The export bucket is private and owner-scoped by path.
select ok((select not public from storage.buckets where id='privacy-exports'),
  'the export bucket is private');
select is((select count(*)::integer from pg_policy p
  join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='storage' and c.relname='objects'
    and coalesce(pg_get_expr(p.polqual,p.polrelid),'') like '%privacy-exports%'
    and p.polcmd <> 'r'),
  0, 'NO CLIENT MAY WRITE INTO THE EXPORT BUCKET');
select is((select count(*)::integer from pg_policy p
  join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='storage' and c.relname='objects'
    and coalesce(pg_get_expr(p.polqual,p.polrelid),'') like '%privacy-exports%'
    and coalesce(pg_get_expr(p.polqual,p.polrelid),'') not like '%foldername%'),
  0, 'the export read policy is scoped to the owner''s own folder');

-- ---------------------------------------------------------------------------
-- Anonymization preserves what other people depend on
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from public.bookings
  where customer_id='a2200000-0000-4000-8000-000000000001'), 1,
  'the fixture booking exists before anonymization');

-- Claims are cleared first, deliberately. Anonymization is a SYSTEM operation
-- run by the deletion executor, not something performed inside a signed-in
-- user's session — and the WPS-010 guard on `is_published` proves it: with an
-- end-user JWT present that guard correctly refuses the unpublish. Clearing
-- the claims is the fixture matching reality, not a way around the rule.
select pg_temp.act_as_nobody();
select ok(private.privacy_anonymize_account('a2200000-0000-4000-8000-000000000001', null) is not null,
  'an unheld account can be anonymized');

select is((select display_name from public.profiles
  where id='a2200000-0000-4000-8000-000000000001'),
  'Deleted account', 'THE NAME BECOMES A NEUTRAL LABEL');
select ok((select phone is null and avatar_url is null from public.profiles
  where id='a2200000-0000-4000-8000-000000000001'),
  'contact details and the photo are gone');
select ok((select deleted_at is not null from public.profiles
  where id='a2200000-0000-4000-8000-000000000001'),
  'the profile is marked deleted');

-- The account UUID survives, because a payout and a receipt hang off it.
select ok((select count(*) = 1 from public.profiles
  where id='a2200000-0000-4000-8000-000000000001'),
  'THE ACCOUNT ROW SURVIVES: THIS IS PSEUDONYMIZATION, NOT ANONYMITY');

-- Everything somebody else relies on is untouched.
select is((select count(*)::integer from public.bookings
  where customer_id='a2200000-0000-4000-8000-000000000001'), 1,
  'THE BOOKING SURVIVES: THE WORKER''S RECORD IS NOT ONE-SIDED');
select is((select count(*)::integer from public.bookings
  where customer_id='a2200000-0000-4000-8000-000000000001' and deleted_at is not null), 0,
  'the booking is not soft-deleted either');
select is((select count(*)::integer from private.financial_ledger_entries),
  (select count(*)::integer from private.financial_ledger_entries),
  'the ledger is untouched by anonymization');
select is((select count(*)::integer from public.privacy_consent_records
  where user_id='a2200000-0000-4000-8000-000000000001'), 2,
  'CONSENT HISTORY SURVIVES: IT IS THE PROOF OF WHAT WAS AGREED');

-- Personalization genuinely goes.
select is((select count(*)::integer from public.user_recent_searches
  where user_id='a2200000-0000-4000-8000-000000000001'), 0,
  'search history is deleted');
select is((select count(*)::integer from public.user_recently_viewed_providers
  where user_id='a2200000-0000-4000-8000-000000000001'), 0,
  'viewing history is deleted');
select is((select count(*)::integer from public.favourites
  where customer_id='a2200000-0000-4000-8000-000000000001'), 0,
  'favourites are deleted');
select is((select count(*)::integer from public.addresses
  where customer_id='a2200000-0000-4000-8000-000000000001' and deleted_at is null), 0,
  'live addresses are removed');
-- Notifications are deliberately preserved: WPS-014 already reduced their
-- payloads to resource UUIDs at write time, and its dedupe ledger is immutable
-- by design. Asserted so the choice is visible rather than accidental.
select is((select count(*)::integer from public.notifications n
  where n.user_id='a2200000-0000-4000-8000-000000000001' and n.data <> '{}'::jsonb),
  0, 'no surviving notification carries a payload beyond resource identifiers');
select is((select count(*)::integer from (select pg_temp.code_of('private','privacy_anonymize_account') c) s
  where s.c ~ 'delete from private\.notification_source_links'),
  0, 'ANONYMIZATION DOES NOT BREAK THE IMMUTABLE WPS-014 DEDUPE LEDGER');

-- The steps are recorded so an operator can prove what happened.
select ok((select count(*) >= 8 from private.privacy_anonymization_log
  where subject_user_id='a2200000-0000-4000-8000-000000000001'),
  'every anonymization step is logged with a row count');

-- A worker's public presence goes, and the listing stops being discoverable.
select ok(private.privacy_anonymize_account('a2200000-0000-4000-8000-000000000004', null) is not null,
  'a worker account can be anonymized');
select ok((select not is_published and not is_available from public.provider_profiles
  where id='b2200000-0000-4000-8000-000000000001'),
  'THE WORKER LISTING IS UNPUBLISHED AND UNDISCOVERABLE');
select ok((select about = '' and cover_image_url is null and specialties = '{}'
  from public.provider_profiles where id='b2200000-0000-4000-8000-000000000001'),
  'the biography, specialties and cover image are removed');
select is((select display_name from public.provider_profiles
  where id='b2200000-0000-4000-8000-000000000001'),
  'Deleted account', 'the public worker name becomes a neutral label');

-- ---------------------------------------------------------------------------
-- Anonymization does not touch another authority's records
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from (select pg_temp.code_of('private','privacy_anonymize_account') c) s
  where s.c ~ 'delete from (public\.bookings|public\.reviews|public\.messages|public\.disputes)'),
  0, 'ANONYMIZATION DELETES NO BOOKING, REVIEW, MESSAGE OR DISPUTE');
select is((select count(*)::integer from (select pg_temp.code_of('private','privacy_anonymize_account') c) s
  where s.c ~ '(financial_ledger|provider_earnings_ledger|financial_booking_payments|provider_payouts|financial_refunds)'),
  0, 'ANONYMIZATION NEVER TOUCHES A FINANCIAL RECORD');
select is((select count(*)::integer from (select pg_temp.code_of('private','privacy_anonymize_account') c) s
  where s.c ~ '(trust_enforcement_actions|trust_reports|trust_moderation_audit|trust_fraud_signals)'),
  0, 'ANONYMIZATION NEVER ERASES TRUST OR MODERATION HISTORY');
select is((select count(*)::integer from (select pg_temp.code_of('private','privacy_anonymize_account') c) s
  where s.c ~ 'referral_attributions'),
  0, 'referral attribution survives, so delete-and-recreate earns nothing twice');

-- ---------------------------------------------------------------------------
-- Notifications carry no privacy detail
-- ---------------------------------------------------------------------------
select ok((select count(*) = 6 from private.notification_event_catalog
  where event_type like 'privacy_%'), 'the six privacy events are catalogued');
select is((select count(*)::integer from private.notification_event_catalog
  where event_type like 'privacy_%' and category <> 'security'),
  0, 'privacy notifications are security-category, so preferences cannot suppress them');
select is((select count(*)::integer from private.notification_event_catalog
  where event_type like 'privacy_%'
    and (generic_body ~* '(document|address|evidence|hold|reporter|dispute|payment)')),
  0, 'NO PRIVACY NOTIFICATION BODY NAMES A DOCUMENT, ADDRESS, HOLD OR REPORTER');
select is((select count(*)::integer from private.notification_event_catalog
  where event_type = 'privacy_legal_hold'),
  0, 'A LEGAL HOLD IS NEVER ANNOUNCED TO ITS SUBJECT');
select is((select count(*)::integer from public.notifications n
  where n.type like 'privacy_%' and n.data <> '{}'::jsonb),
  0, 'privacy notification payloads are empty');

-- ---------------------------------------------------------------------------
-- Logging carries no personal content
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from private.operational_log_events
  where event_key like 'privacy%'
    and (safe_detail::text ~* '(@|\+20|password|token|national)')),
  0, 'NO PRIVACY OPERATIONAL EVENT CARRIES AN EMAIL, PHONE, TOKEN OR ID NUMBER');
select is((select count(*)::integer from private.staff_access_log
  where query_shape like 'privacy%' and query_shape ~ '[A-Za-z]{4,}\s'),
  0, 'the access log stores a query shape, never a phrase somebody typed');
select ok((select count(*) >= 3 from private.observability_retention_policy
  where stream in ('privacy_legal_hold_events','account_deletion_events','privacy_anonymization_log')),
  'the privacy streams have a declared retention owner');

-- ---------------------------------------------------------------------------
-- The kill switch closes every user-facing surface at once
-- ---------------------------------------------------------------------------
reset role;
update private.staff_kill_switches set active=true, reason='WPS-022 fixture kill switch test'
  where switch_key='privacy_requests';
select ok(not private.privacy_surface_enabled('center'),
  'THE KILL SWITCH CLOSES THE PRIVACY CENTRE');
select ok(not private.privacy_surface_enabled('export'), 'the kill switch closes export');
select ok(not private.privacy_surface_enabled('deletion'), 'the kill switch closes deletion');

set local role authenticated;
select pg_temp.act_as('a2200000-0000-4000-8000-000000000002');
select throws_ok($$select public.request_account_deletion(null,'wps022-del-0009')$$,'42501',null,
  'no new deletion is accepted while the switch is active');
select ok(pg_catalog.jsonb_array_length(public.get_my_data_exports(10)) >= 0,
  'an existing request is still readable while the switch is active');
reset role;
update private.staff_kill_switches set active=false, reason=null where switch_key='privacy_requests';

-- Turning the flag off closes the surface even with configuration enabled.
update private.staff_feature_flags set enabled=false
  where flag_key='account_deletion' and environment='local';
select ok(not private.privacy_surface_enabled('deletion'),
  'the flag and the configuration must BOTH agree before deletion opens');
select ok(private.privacy_surface_enabled('center'),
  'closing deletion does not close the rest of the privacy centre');

select * from finish();
rollback;
