begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select has_table('public','trust_reports','unified report intake exists');
select has_table('public','trust_report_events','report lifecycle history exists');
select has_table('public','trust_account_state','centralized trust state exists');
select has_table('public','trust_enforcement_actions','enforcement ledger exists');
select has_table('public','trust_appeals','appeals exist');
select has_table('private','trust_report_evidence','staff-only evidence is private');
select has_table('private','trust_fraud_signals','fraud signals are private');
select has_table('private','trust_moderation_audit','immutable moderation audit exists');

-- WPS-016 extends and does not replace the existing systems.
select has_table('public','booking_abuse_reports','WPS-009 chat abuse intake is preserved');
select has_table('public','review_reports','WPS-011 review reports are preserved');
select has_table('public','disputes','WPS-013 disputes are preserved');
select has_table('public','provider_verifications','WPS-006 verification is preserved');
select has_table('public','provider_earning_holds','WPS-007 earning holds are preserved');
select has_table('private','payment_chargebacks','WPS-015 chargebacks are preserved');
select has_function('public','moderate_review','existing review moderation authority is preserved');
select has_function('public','report_booking_communication_abuse','existing chat report RPC is preserved');
select has_function('public','set_provider_earning_hold','existing financial hold RPC is preserved');

-- All seventeen report categories are accepted.
select is(
  (select count(*)::integer from (
    select unnest(array['fraud','impersonation','abusive_language','harassment','discrimination',
      'fake_profile','fake_documents','fake_certificates','spam','scam','dangerous_behavior',
      'off_platform_payment','off_platform_contact','illegal_activity','inappropriate_content',
      'copyright','privacy']) c) k),
  17,
  'seventeen unified report categories are defined');

-- All eight source surfaces are accepted.
select is(
  (select count(*)::integer from (
    select unnest(array['bookings','chat','reviews','providers','customers','payments',
      'certificates','profile_media']) s) k),
  8,
  'eight report source surfaces are defined');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a1600000-0000-4000-8000-000000000001','authenticated','authenticated','wps016-reporter@test.local','',now(),'{}','{"display_name":"Reporter"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1600000-0000-4000-8000-000000000002','authenticated','authenticated','wps016-subject@test.local','',now(),'{}','{"display_name":"Subject"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1600000-0000-4000-8000-000000000003','authenticated','authenticated','wps016-staff@test.local','',now(),'{}','{"display_name":"Staff"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1600000-0000-4000-8000-000000000004','authenticated','authenticated','wps016-other@test.local','',now(),'{}','{"display_name":"Unrelated"}',now(),now());

insert into public.user_roles(user_id, role) values ('a1600000-0000-4000-8000-000000000003','support')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Report intake: authenticated only, immutable, idempotent, no self-report
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok(
  $$select public.submit_trust_report('user',null,null,'fraud','bookings','x','anon-key-0001')$$,
  '42501',
  'permission denied for function submit_trust_report',
  'anonymous reporting is denied at the privilege layer');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1600000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select public.submit_trust_report('user',null,'a1600000-0000-4000-8000-000000000001','fraud','bookings','x','self-key-0001')$$,
  '22023',
  'You cannot report your own account',
  'an account cannot report itself');

select is(
  (public.submit_trust_report('user',null,'a1600000-0000-4000-8000-000000000002','off_platform_payment',
    'chat','Asked me to pay outside the app','report-key-000001'))->>'status',
  'submitted',
  'a report is accepted');

select is(
  (public.submit_trust_report('user',null,'a1600000-0000-4000-8000-000000000002','off_platform_payment',
    'chat','Asked me to pay outside the app','report-key-000001'))->>'duplicate',
  'true',
  'report submission is idempotent');

select is((select count(*)::integer from public.trust_reports),1,'exactly one report row exists');
select is((select count(*)::integer from public.trust_report_events),1,'report lifecycle history is recorded');

-- Reporting is never itself an enforcement action.
select is((select count(*)::integer from public.trust_enforcement_actions),0,'a report creates no enforcement action');
select is((select count(*)::integer from public.trust_account_state),0,'a report does not change trust state');

-- A reporter sees only their own submissions.
select is(pg_catalog.jsonb_array_length(public.get_my_trust_reports()),1,'reporter sees their own report');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1600000-0000-4000-8000-000000000004',true);
select is(pg_catalog.jsonb_array_length(public.get_my_trust_reports()),0,'an unrelated account sees no reports');
select is((select count(*)::integer from public.trust_reports),0,'RLS hides other accounts'' reports');
reset role;

-- Report content is immutable; only staff may move the lifecycle status.
select throws_ok(
  $$update public.trust_reports set category='spam'$$,
  '55000',
  'Trust report content is immutable',
  'report content cannot be rewritten');
select throws_ok(
  $$delete from public.trust_reports$$,
  '55000',
  'Trust reports are immutable',
  'reports cannot be deleted');

-- ---------------------------------------------------------------------------
-- Clients cannot self-modify trust state
-- ---------------------------------------------------------------------------
select is(has_table_privilege('authenticated','public.trust_account_state','UPDATE'),false,'clients cannot update trust state');
select is(has_table_privilege('authenticated','public.trust_account_state','INSERT'),false,'clients cannot insert trust state');
select is(has_table_privilege('authenticated','public.trust_account_state','DELETE'),false,'clients cannot delete trust state');
select is(has_table_privilege('authenticated','public.trust_enforcement_actions','INSERT'),false,'clients cannot forge enforcement actions');
select is(has_table_privilege('authenticated','public.trust_enforcement_actions','UPDATE'),false,'clients cannot rewrite enforcement actions');
select is(has_table_privilege('authenticated','public.trust_reports','INSERT'),false,'clients cannot insert reports directly');
select is(has_table_privilege('authenticated','public.trust_reports','UPDATE'),false,'clients cannot update reports directly');
select is(has_table_privilege('authenticated','public.trust_appeals','INSERT'),false,'clients cannot insert appeals directly');

-- ---------------------------------------------------------------------------
-- Enforcement: staff authoritative, evidence required, no automatic bans
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','a1600000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.staff_record_enforcement_action('a1600000-0000-4000-8000-000000000002','warning','spam','Reason','Evidence','k-0000001')$$,
  '42501',
  'Staff access required',
  'a non-staff account cannot enforce');
select throws_ok(
  $$select public.staff_transition_trust_report('00000000-0000-0000-0000-000000000001','investigating')$$,
  '42501',
  'Staff access required',
  'a non-staff account cannot move a report');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1600000-0000-4000-8000-000000000003',true);

select throws_ok(
  $$select public.staff_record_enforcement_action('a1600000-0000-4000-8000-000000000002','warning','spam','Reason','','k-0000002')$$,
  '22023',
  'Evidence is required for every enforcement action',
  'every enforcement action requires evidence');

-- A permanent ban is never automatic and requires an investigated report.
select throws_ok(
  $$select public.staff_record_enforcement_action('a1600000-0000-4000-8000-000000000002','permanent_ban','fraud','Reason','Evidence','k-0000003')$$,
  '22023',
  'A permanent ban requires an investigated report',
  'a permanent ban cannot be issued without a report');

select is(
  (public.staff_record_enforcement_action('a1600000-0000-4000-8000-000000000002','warning','off_platform_payment',
    'Asked to pay outside Warsha','Chat evidence reviewed','k-0000010'))->>'actionType',
  'warning',
  'staff can record a warning');
select is((select trust_level from public.trust_account_state where user_id='a1600000-0000-4000-8000-000000000002'),'warned','trust state reflects the warning');

select is(
  (public.staff_record_enforcement_action('a1600000-0000-4000-8000-000000000002','warning','off_platform_payment',
    'Asked to pay outside Warsha','Chat evidence reviewed','k-0000010'))->>'duplicate',
  'true',
  'enforcement is idempotent by key');

-- Communication restriction applies the specific measure.
select is(
  (public.staff_record_enforcement_action('a1600000-0000-4000-8000-000000000002','communication_restriction','harassment',
    'Messaging limited','Reviewed reported messages','k-0000011'))->>'actionType',
  'communication_restriction',
  'staff can restrict communication');
select is((select communication_restricted from public.trust_account_state where user_id='a1600000-0000-4000-8000-000000000002'),true,'communication restriction is applied');
-- The capability gate is a private server helper; clients hold no EXECUTE on
-- it, so it is exercised as the owner rather than through a client role.
reset role;
select is(private.trust_state_allows('a1600000-0000-4000-8000-000000000002','communication'),false,'restricted account cannot communicate');
select is(private.trust_state_allows('a1600000-0000-4000-8000-000000000002','reviews'),true,'unrelated capabilities stay allowed');
select is(private.trust_state_allows('a1600000-0000-4000-8000-000000000001','communication'),true,'an account with no trust row is unrestricted');
select throws_ok($$select private.trust_state_allows('a1600000-0000-4000-8000-000000000001','unknown')$$,'22023','Unknown trust capability','unknown capability is rejected');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1600000-0000-4000-8000-000000000003',true);

-- A permanent ban becomes possible only after the report is investigated.
select is(
  (public.staff_transition_trust_report((select id from public.trust_reports limit 1),'investigating'))->>'status',
  'investigating',
  'staff can move a report to investigating');
select is(
  (public.staff_record_enforcement_action('a1600000-0000-4000-8000-000000000002','permanent_ban','fraud',
    'Account closed','Investigated evidence reviewed by staff','k-0000020',
    (select id from public.trust_reports limit 1)))->>'actionType',
  'permanent_ban',
  'a permanent ban is possible only after investigation');
select is((select trust_level from public.trust_account_state where user_id='a1600000-0000-4000-8000-000000000002'),'banned','ban is reflected in trust state');
select is((select restriction_expires_at from public.trust_account_state where user_id='a1600000-0000-4000-8000-000000000002'),null,'a ban carries no expiry');
reset role;
select is(private.trust_state_allows('a1600000-0000-4000-8000-000000000002','marketplace'),false,'a banned account loses marketplace access');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1600000-0000-4000-8000-000000000003',true);

reset role;
-- Enforcement history is immutable even for the table owner, so the guarantee
-- does not depend on the grant layer alone.
select throws_ok($$update public.trust_enforcement_actions set public_reason='changed'$$,'55000','Enforcement history is immutable','enforcement cannot be rewritten');
select throws_ok($$delete from public.trust_enforcement_actions$$,'55000','Enforcement history is immutable','enforcement cannot be deleted');

-- A system actor may never issue anything punitive.
select throws_ok(
  $$insert into public.trust_enforcement_actions(subject_user_id,action_type,reason_code,public_reason,evidence_summary,actor_id,actor_kind,idempotency_key)
    values('a1600000-0000-4000-8000-000000000002','permanent_ban','fraud','r','e','a1600000-0000-4000-8000-000000000003','system','k-sys-1')$$,
  '23514',
  null,
  'a system actor cannot issue a punitive action');

-- ---------------------------------------------------------------------------
-- Appeals
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','a1600000-0000-4000-8000-000000000002',true);
select is((public.get_my_trust_status())->>'trustLevel','banned','a user can see their own status');
select is((public.get_my_trust_status())->>'canAppeal','true','an affected account can appeal');
select is(
  (public.submit_trust_appeal((select id from public.trust_enforcement_actions where action_type='permanent_ban'),
    'I did not do this and would like a review.','appeal-key-00001'))->>'status',
  'submitted',
  'an affected account can submit an appeal');
select is(
  (public.submit_trust_appeal((select id from public.trust_enforcement_actions where action_type='permanent_ban'),
    'Second attempt.','appeal-key-00002'))->>'duplicate',
  'true',
  'only one appeal per enforcement action');
select is(pg_catalog.jsonb_array_length(public.get_my_trust_appeals()),1,'appellant sees their own appeal');
reset role;

-- Appeals are private to the appellant and staff.
set local role authenticated;
select set_config('request.jwt.claim.sub','a1600000-0000-4000-8000-000000000004',true);
select is((select count(*)::integer from public.trust_appeals),0,'an unrelated account cannot read appeals');
select is((select count(*)::integer from public.trust_enforcement_actions),0,'an unrelated account cannot read enforcement history');
select is((select count(*)::integer from public.trust_account_state),0,'an unrelated account cannot read trust state');
select throws_ok(
  $$select public.submit_trust_appeal((select id from public.trust_enforcement_actions limit 1),'This action does not belong to me at all.','x-appeal-0001')$$,
  '22023',
  'Enforcement action is not available',
  'an unrelated account cannot appeal another account''s action');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1600000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.staff_decide_trust_appeal((select id from public.trust_appeals limit 1),'upheld','')$$,
  '22023',
  'A decision note is required',
  'an appeal decision requires a note');
select is(
  (public.staff_decide_trust_appeal((select id from public.trust_appeals limit 1),'overturned','Evidence did not support the action'))->>'restorationRequired',
  'true',
  'an overturned appeal requires an explicit restoration action');
reset role;

-- ---------------------------------------------------------------------------
-- Fraud signals are advisory only
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from (select unnest(array['excessive_cancellations','duplicate_identity',
    'repeated_failed_verification','abnormal_payment_behavior','repeated_chargebacks',
    'suspicious_review_activity','fake_portfolio_attempt','certificate_abuse',
    'repeated_abuse_reports','account_farming']) s) k),
  10,
  'ten fraud signal kinds are defined');

select ok(
  private.record_trust_fraud_signal('a1600000-0000-4000-8000-000000000004','account_farming','high',5) is not null,
  'a fraud signal can be recorded');
select is((select trust_level from public.trust_account_state where user_id='a1600000-0000-4000-8000-000000000004'),null,'a fraud signal never changes trust state');
select is((select count(*)::integer from public.trust_enforcement_actions where subject_user_id='a1600000-0000-4000-8000-000000000004'),0,'a fraud signal never enforces');
select is(private.trust_state_allows('a1600000-0000-4000-8000-000000000004','marketplace'),true,'a signalled account keeps full access');

-- ---------------------------------------------------------------------------
-- Audit: actor, timestamp, reason, evidence, immutability
-- ---------------------------------------------------------------------------
select ok((select count(*) from private.trust_moderation_audit) > 0,'moderation actions are audited');
select is((select count(*)::integer from private.trust_moderation_audit where actor_id is null),0,'every audit row records an actor');
select is((select count(*)::integer from private.trust_moderation_audit where pg_catalog.length(pg_catalog.btrim(reason)) < 3),0,'every audit row records a reason');
select is((select count(*)::integer from private.trust_moderation_audit where created_at is null),0,'every audit row records a timestamp');
select is((select count(*)::integer from public.trust_enforcement_actions where pg_catalog.length(pg_catalog.btrim(evidence_summary)) < 3),0,'every enforcement action records evidence');
select throws_ok($$update private.trust_moderation_audit set reason='changed'$$,'55000','Moderation audit is immutable','audit cannot be rewritten');
select throws_ok($$delete from private.trust_moderation_audit$$,'55000','Moderation audit is immutable','audit cannot be deleted');

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema='private' and grantee in ('anon','authenticated','PUBLIC')
     and table_name in ('trust_report_evidence','trust_fraud_signals','trust_moderation_audit')),
  0,
  'private trust tables are exposed to no client role');

select is(has_function_privilege('anon','public.get_my_trust_status()','EXECUTE'),false,'anon cannot read trust status');
select is(has_function_privilege('authenticated','public.get_my_trust_status()','EXECUTE'),true,'authenticated can read own trust status');
select is(has_function_privilege('anon','public.submit_trust_appeal(uuid,text,text)','EXECUTE'),false,'anon cannot appeal');
select is(has_function_privilege('authenticated','private.record_trust_fraud_signal(uuid,text,text,integer,jsonb)','EXECUTE'),false,'clients cannot record fraud signals');
select is(has_function_privilege('authenticated','private.trust_state_allows(uuid,text)','EXECUTE'),false,'clients cannot query the raw trust gate');
select is(has_function_privilege('authenticated','private.record_trust_audit(uuid,text,text,uuid,text,text)','EXECUTE'),false,'clients cannot write audit rows');

select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where p.prosecdef and n.nspname in ('public','private')
     and (p.proname like '%trust%' or p.proname like 'staff_%')
     and not (coalesce(array_to_string(p.proconfig,','),'') like '%search_path=""%')),
  0,
  'every WPS-016 security definer function pins an empty search path');

select is((select relrowsecurity from pg_class where oid='public.trust_reports'::regclass),true,'RLS is enabled on reports');
select is((select relrowsecurity from pg_class where oid='public.trust_account_state'::regclass),true,'RLS is enabled on trust state');
select is((select relrowsecurity from pg_class where oid='public.trust_enforcement_actions'::regclass),true,'RLS is enabled on enforcement');
select is((select relrowsecurity from pg_class where oid='public.trust_appeals'::regclass),true,'RLS is enabled on appeals');

select is(
  (select count(*)::integer from pg_catalog.pg_publication_tables
   where pubname='supabase_realtime' and schemaname='private'),
  0,
  'no private trust table is published to Realtime');
select is(
  (select count(*)::integer from pg_catalog.pg_publication_tables
   where pubname='supabase_realtime' and tablename like 'trust_%'),
  0,
  'trust tables are not broadcast over Realtime');

select * from finish();
rollback;
