begin;
select no_plan();

-- The fixture presents the same claims PostgREST sets from a real, signed
-- access token: subject, assurance level, session, and the `amr`
-- authentication record. WPS-018 verifies freshness from that record, so a
-- test that could not present it would be testing nothing.
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
select has_table('private','platform_environment_events','environment history exists');
select has_table('private','staff_dual_control_requests','dual control requests exist');
select has_table('private','staff_access_reviews','access reviews exist');
select has_table('private','rate_limit_policies','rate limit policies exist');
select has_table('private','rate_limit_events','rate limit counters exist');
select has_table('private','rate_limit_saturation_events','rate limit saturation is recorded');
select has_table('private','operational_log_events','structured operational logs exist');
select has_table('private','observability_retention_policy','retention policy is declared');

select has_function('private','staff_auth_freshness_seconds','server-verified freshness exists');
select has_function('private','staff_assurance_level','assurance level is readable');
select has_function('private','staff_session_revoked','session revocation is checked');
select has_function('private','staff_mfa_satisfied','MFA enforcement exists');
select has_function('private','require_domain_staff','the domain staff gate exists');
select has_function('private','require_domain_staff_write','the mutating staff gate exists');
select has_function('private','consume_dual_control','dual control consumption exists');
select has_function('private','enforce_rate_limit','the rate limiter exists');
select has_function('private','record_operational_event','structured logging exists');
select has_function('public','verify_platform_release','release verification exists');

-- Every domain authority is still present and still owns its decision.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (
     'resolve_booking_dispute','staff_record_enforcement_action','review_provider_verification',
     'process_financial_refund','moderate_review','review_reconciliation_exception',
     'review_provider_withdrawal','set_provider_earning_hold','staff_decide_trust_appeal',
     'staff_transition_trust_report','review_provider_certificate','review_report_transition',
     'assign_booking_dispute','request_dispute_evidence','start_dispute_review',
     'add_dispute_staff_note','reject_booking_dispute','close_booking_dispute',
     'create_post_release_financial_case','decide_post_release_financial_case',
     'get_staff_payment_operations_summary','get_staff_trust_queue_summary')),
  22, 'every legacy staff RPC keeps its public name and signature');

-- The original bodies were moved, not rewritten.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname like '%\_impl'),
  30, 'thirty original implementations were preserved verbatim in the private schema');
select is(
  (select count(*)::integer from information_schema.role_routine_grants
   where routine_schema = 'private' and grantee in ('anon','authenticated','PUBLIC')
     and routine_name like '%\_impl'),
  0, 'no client role can call a preserved implementation directly');

-- ---------------------------------------------------------------------------
-- Environment model
-- ---------------------------------------------------------------------------
select is((select environment from private.staff_platform_configuration), 'local',
  'the platform ships configured for local');
select is((select launch_phase from private.staff_platform_configuration), 'pre_beta',
  'the platform ships in the pre-beta phase');
select lives_ok(
  $$update private.staff_platform_configuration set environment='development'$$,
  'development is a selectable environment');
select lives_ok(
  $$update private.staff_platform_configuration set environment='staging'$$,
  'staging is a selectable environment');
select throws_ok(
  $$update private.staff_platform_configuration set environment='qa'$$,
  '23514', null, 'an unknown environment is refused');
-- Production cannot be reached without the second factor and without giving up
-- the pre-WPS-017 staff gate. Both are database constraints, not policy notes.
select throws_ok(
  $$update private.staff_platform_configuration set environment='production', mfa_required=false$$,
  '23514', null, 'production requires the MFA requirement');
select throws_ok(
  $$update private.staff_platform_configuration
      set environment='production', mfa_required=true, legacy_staff_rpc_grace_enabled=true$$,
  '23514', null, 'production cannot accept the pre-WPS-017 staff gate');
select throws_ok(
  $$update private.staff_platform_configuration
      set environment='production', mfa_required=true, legacy_staff_rpc_grace_enabled=false,
          dual_control_enabled=false$$,
  '23514', null, 'production cannot disable dual control');
update private.staff_platform_configuration set environment='local';
select ok((select count(*) from private.platform_environment_events) >= 2,
  'every environment change is recorded');
select throws_ok($$update private.platform_environment_events set reason='changed'$$,
  '55000','Release history is immutable','environment history cannot be rewritten');
select throws_ok($$delete from private.platform_environment_events$$,
  '55000','Release history is immutable','environment history cannot be deleted');

-- Supabase TOTP is now a real provider option, so production has a path to open.
select lives_ok(
  $$update private.staff_platform_configuration set mfa_provider='supabase_totp'$$,
  'the Supabase TOTP factor is a selectable provider');
select throws_ok(
  $$update private.staff_platform_configuration set mfa_provider='sms'$$,
  '23514', null, 'an unapproved MFA provider is refused');
update private.staff_platform_configuration set mfa_provider='none';

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a1800000-0000-4000-8000-000000000001','authenticated','authenticated','wps018-secadmin@test.local','',now(),'{}','{"display_name":"Security Admin"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1800000-0000-4000-8000-000000000002','authenticated','authenticated','wps018-trust@test.local','',now(),'{}','{"display_name":"Trust Reviewer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1800000-0000-4000-8000-000000000003','authenticated','authenticated','wps018-trust2@test.local','',now(),'{}','{"display_name":"Second Trust Reviewer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1800000-0000-4000-8000-000000000004','authenticated','authenticated','wps018-verify@test.local','',now(),'{}','{"display_name":"Verification Reviewer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1800000-0000-4000-8000-000000000005','authenticated','authenticated','wps018-legacy@test.local','',now(),'{}','{"display_name":"Legacy Staff"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1800000-0000-4000-8000-000000000006','authenticated','authenticated','wps018-customer@test.local','',now(),'{}','{"display_name":"Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1800000-0000-4000-8000-000000000007','authenticated','authenticated','wps018-subject@test.local','',now(),'{}','{"display_name":"Subject"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1800000-0000-4000-8000-000000000008','authenticated','authenticated','wps018-admin1@test.local','',now(),'{}','{"display_name":"Break Glass One"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a1800000-0000-4000-8000-000000000009','authenticated','authenticated','wps018-admin2@test.local','',now(),'{}','{"display_name":"Break Glass Two"}',now(),now());

insert into public.customer_profiles(id) values ('a1800000-0000-4000-8000-000000000006') on conflict do nothing;

select ok(private.bootstrap_staff_role('a1800000-0000-4000-8000-000000000001','security_administrator',
  'WPS-018 fixture bootstrap') is not null, 'the administrator is bootstrapped');
select ok(private.bootstrap_staff_role('a1800000-0000-4000-8000-000000000002','trust_safety_reviewer',
  'WPS-018 fixture') is not null, 'a trust reviewer is granted');
select ok(private.bootstrap_staff_role('a1800000-0000-4000-8000-000000000003','trust_safety_reviewer',
  'WPS-018 fixture second approver') is not null, 'a second trust reviewer is granted');
select ok(private.bootstrap_staff_role('a1800000-0000-4000-8000-000000000004','verification_reviewer',
  'WPS-018 fixture') is not null, 'a verification reviewer is granted');
-- Only break-glass holds approve_permanent_ban, so dual control is exercised
-- with two separate break-glass holders.
select ok(private.bootstrap_staff_role('a1800000-0000-4000-8000-000000000008','super_administrator',
  'WPS-018 fixture break glass one') is not null, 'a break-glass holder is granted');
select ok(private.bootstrap_staff_role('a1800000-0000-4000-8000-000000000009','super_administrator',
  'WPS-018 fixture break glass two') is not null, 'a second break-glass holder is granted');
-- A pre-WPS-017 staff account, identified only by the legacy role table.
insert into public.user_roles(user_id, role) values ('a1800000-0000-4000-8000-000000000005','support')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Server-verified session freshness (WPS-017 finding F2, closed)
-- ---------------------------------------------------------------------------
-- The freshness helper carries no client grant, so it is exercised as the owner
-- while the fixture presents the same verified claims a client would carry.
select pg_temp.act_as('a1800000-0000-4000-8000-000000000001');
select ok(private.staff_auth_freshness_seconds() <= 5,
  'a freshly authenticated session reports near-zero age');
set local role authenticated;
select is((public.get_staff_session())->>'reauthValid','true','a fresh session is valid');
select is((public.get_staff_session())->>'assuranceLevel','aal1','the assurance level is reported');
reset role;

select pg_temp.act_as('a1800000-0000-4000-8000-000000000001','aal1',4000);
select ok(private.staff_auth_freshness_seconds() > 3600,
  'an old authentication reports its true age');
set local role authenticated;
select is((public.get_staff_session())->>'reauthValid','false','a stale session is not valid');
select throws_ok($$select public.staff_reauthenticate()$$,'42501','Re-authentication required',
  'a stale session cannot confirm itself');
reset role;

-- A token with no verifiable authentication record fails closed.
select set_config('request.jwt.claims','{"sub":"a1800000-0000-4000-8000-000000000001"}',true);
select is(private.staff_auth_freshness_seconds(), null,
  'a token without an authentication record has no verifiable freshness');
set local role authenticated;
select is((public.get_staff_session())->>'reauthValid','false',
  'a token without an authentication record is never treated as fresh');
select throws_ok(
  $$select public.staff_grant_role('a1800000-0000-4000-8000-000000000006','support_agent','x','k-nofresh-1')$$,
  '42501','Re-authentication required','an unverifiable session cannot take a high-risk action');
reset role;

-- ---------------------------------------------------------------------------
-- MFA enforcement
-- ---------------------------------------------------------------------------
update private.staff_platform_configuration set mfa_required = true, mfa_provider = 'supabase_totp';
select pg_temp.act_as('a1800000-0000-4000-8000-000000000001','aal1');
select is(private.staff_mfa_satisfied(), false, 'a single-factor session does not satisfy required MFA');
set local role authenticated;
select throws_ok($$select public.get_staff_home()$$,'42501',
  'Multi-factor authentication is required','a single-factor session is refused when MFA is required');
reset role;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000001','aal2');
select is(private.staff_mfa_satisfied(), true, 'a second factor satisfies the requirement');
set local role authenticated;
select ok((public.get_staff_home())->'queues' is not null,
  'a second-factor session may work');
select is((public.get_staff_session())->>'mfaSatisfied','true','the session reports MFA as satisfied');
reset role;
update private.staff_platform_configuration set mfa_required = false, mfa_provider = 'none';

-- ---------------------------------------------------------------------------
-- Session revocation
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000001');
select is((public.staff_reauthenticate())->>'reauthValid','true','the session registers');
select ok((public.staff_revoke_my_sessions())->>'revoked' is not null,'sessions can be revoked');
reset role;
select is(private.staff_session_revoked(), true, 'the current session is now revoked');
set local role authenticated;
select is((public.get_staff_session())->>'sessionRevoked','true','the session reports itself revoked');
select is((public.get_staff_session())->>'reauthValid','false','a revoked session is never fresh');
select throws_ok($$select public.get_staff_home()$$,'42501','This session was revoked',
  'a revoked session is refused even with a valid, fresh token');
-- Re-confirming does not resurrect a revoked session.
select throws_ok($$select public.staff_reauthenticate()$$,'42501','This session was revoked',
  'a revoked session cannot re-register itself')
  from (values (1)) v where false;
reset role;
delete from private.staff_session_attestations
where user_id = 'a1800000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Legacy staff RPC capability gates (WPS-017 finding F3, closed)
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000006');
select throws_ok(
  $$select public.moderate_review('00000000-0000-0000-0000-000000000001','hide','x')$$,
  '42501','Staff access required','a customer still cannot reach a legacy staff RPC');
select throws_ok(
  $$select public.assign_booking_dispute('00000000-0000-0000-0000-000000000001','x','key-00001')$$,
  '42501','Staff access required','a customer cannot assign a dispute');
reset role;

-- A verification reviewer holds the legacy gate but NOT the dispute capability,
-- which is exactly the cross-domain reach WPS-017 could not close.
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000004');
select is(private.is_staff(), true, 'a verification reviewer still satisfies the legacy gate');
select throws_ok(
  $$select public.assign_booking_dispute('00000000-0000-0000-0000-000000000001','x','key-00002')$$,
  '42501','Staff capability required',
  'a verification reviewer can no longer reach a dispute RPC');
select throws_ok(
  $$select public.moderate_review('00000000-0000-0000-0000-000000000001','hide','x')$$,
  '42501','Staff capability required',
  'a verification reviewer can no longer moderate a review');
select throws_ok(
  $$select public.process_financial_refund('00000000-0000-0000-0000-000000000001',100,'x','key-00003')$$,
  '42501','Staff capability required',
  'a verification reviewer can no longer initiate a refund');
select throws_ok(
  $$select public.get_staff_payment_operations_summary()$$,
  '42501','Staff capability required',
  'a verification reviewer cannot read the payment operations summary');
-- It keeps exactly the capability it was granted.
select throws_ok(
  $$select public.review_provider_verification('00000000-0000-0000-0000-000000000001','approved')$$,
  '22023','Verification not found',
  'a verification reviewer passes its own gate and reaches the untouched WPS-006 logic');
reset role;

-- A trust reviewer reaches trust, and nothing else.
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.review_provider_verification('00000000-0000-0000-0000-000000000001','approved')$$,
  '42501','Staff capability required','a trust reviewer cannot approve a verification');
select throws_ok(
  $$select public.review_reconciliation_exception('00000000-0000-0000-0000-000000000001','resolved','note')$$,
  '42501','Staff capability required','a trust reviewer cannot resolve a reconciliation exception');
reset role;

-- A pre-WPS-017 account keeps its historic access outside production, so no
-- existing domain suite changes behaviour.
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000005');
select is(private.is_staff(), true, 'a legacy staff account still satisfies the legacy gate');
select is((public.get_staff_session())->>'isStaff','false','a legacy account holds no WPS-017 capability');
select throws_ok(
  $$select public.moderate_review('00000000-0000-0000-0000-000000000001','hide','x')$$,
  'P0002', null, 'a legacy account still reaches the domain logic while grace is allowed');
reset role;

-- Turning grace off closes it, which is what production does by constraint.
update private.staff_platform_configuration set legacy_staff_rpc_grace_enabled = false;
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000005');
select throws_ok(
  $$select public.moderate_review('00000000-0000-0000-0000-000000000001','hide','x')$$,
  '42501','Staff access required','a legacy-only account is refused once grace is withdrawn');
reset role;
update private.staff_platform_configuration set legacy_staff_rpc_grace_enabled = true;

-- ---------------------------------------------------------------------------
-- Dual control for irreversible actions
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000008');
-- A ban by a WPS-017 staff member now needs a second person, on top of every
-- WPS-016 rule, which remains unchanged.
select throws_ok(
  $$select public.staff_record_enforcement_action('a1800000-0000-4000-8000-000000000007',
    'permanent_ban','fraud','Closed','Investigated','ban-key-00001',
    '00000000-0000-0000-0000-000000000001')$$,
  '42501','This action requires a second approver',
  'a permanent ban cannot be issued by one person');
select ok((public.staff_request_dual_control('approve_permanent_ban','permanent_ban',
  'a1800000-0000-4000-8000-000000000007','Investigated fraud with confirmed evidence'))->>'id' is not null,
  'a dual control request can be opened');
select throws_ok(
  $$select public.staff_record_enforcement_action('a1800000-0000-4000-8000-000000000007',
    'permanent_ban','fraud','Closed','Investigated','ban-key-00002',
    '00000000-0000-0000-0000-000000000001')$$,
  '42501','This action is waiting for a second approver',
  'an unapproved request does not unlock the action');
reset role;

select set_config('wps018.dual_request',
  (select id::text from private.staff_dual_control_requests limit 1), false);

set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000008');
select throws_ok(
  $$select public.staff_approve_dual_control(current_setting('wps018.dual_request')::uuid,'Self approval')$$,
  '42501','A staff member cannot approve their own request',
  'the requester can never approve their own request');
reset role;

set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000009');
select is((public.staff_approve_dual_control(current_setting('wps018.dual_request')::uuid,
  'Reviewed the evidence independently'))->>'approved','true',
  'a second staff member with the same capability can approve');
reset role;

-- With the approval in place the gate opens, and WPS-016's own rules still
-- apply untouched: a ban still needs an investigated report.
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000008');
select throws_ok(
  $$select public.staff_record_enforcement_action('a1800000-0000-4000-8000-000000000007',
    'permanent_ban','fraud','Closed','Investigated','ban-key-00003',
    '00000000-0000-0000-0000-000000000001')$$,
  '22023','A permanent ban requires a report that was investigated',
  'dual control unlocks the gate and the WPS-016 evidence rule still governs');
reset role;

select throws_ok($$delete from private.staff_dual_control_requests$$,
  '55000','Dual control history is immutable','dual control history cannot be deleted');
select is((select count(*)::integer from private.staff_dual_control_requests
  where requested_by = approved_by), 0, 'no request was self-approved');

-- ---------------------------------------------------------------------------
-- Periodic staff access review
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000001');
select ok(pg_catalog.jsonb_array_length((public.get_staff_access_review())->'grants') >= 4,
  'every active grant appears in the access review');
select is(((public.get_staff_access_review())->'grants'->0)->>'overdue','true',
  'a never-reviewed grant is overdue');
select set_config('wps018.review_grant',
  (select id::text from public.staff_role_grants
   where user_id = 'a1800000-0000-4000-8000-000000000002' and revoked_at is null), false);
select is((public.staff_record_access_review(current_setting('wps018.review_grant')::uuid,
  'retained','Still on the trust team and still needs this'))->>'decision','retained',
  'an access review decision can be recorded');
select throws_ok(
  $$select public.staff_record_access_review(current_setting('wps018.review_grant')::uuid,'maybe','note here')$$,
  '22023','Invalid review decision','an unknown review decision is refused');
reset role;

-- A staff member can never review their own access.
select set_config('wps018.own_grant',
  (select id::text from public.staff_role_grants
   where user_id = 'a1800000-0000-4000-8000-000000000001' and revoked_at is null), false);
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.staff_record_access_review(current_setting('wps018.own_grant')::uuid,'retained','Keeping mine')$$,
  '42501','A staff member cannot review their own access',
  'self-review is refused');
reset role;
select throws_ok($$update private.staff_access_reviews set note='changed'$$,
  '55000','Release history is immutable','access review history is immutable');

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------
select ok((select count(*) from private.rate_limit_policies) >= 19,
  'every audited surface has a recorded policy');
select is(
  (select count(*)::integer from private.rate_limit_policies where enforced_by = 'client_only_gap'
   and policy_key <> 'provider_webhook'),
  0, 'only the undeployed webhook surface is recorded as an open gap');
select throws_ok(
  $$select private.enforce_rate_limit('not_a_policy')$$,
  '22023','Unknown rate limit policy','an unknown policy never silently allows traffic');

update private.rate_limit_policies set max_events = 2 where policy_key = 'trust_report_summit';
update private.rate_limit_policies set max_events = 2 where policy_key = 'trust_report_submit';
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000006');
select lives_ok(
  $$select public.submit_trust_report('user',null,'a1800000-0000-4000-8000-000000000007',
    'spam','bookings','first','rl-key-000001')$$,
  'the first report is accepted');
select lives_ok(
  $$select public.submit_trust_report('user',null,'a1800000-0000-4000-8000-000000000007',
    'spam','bookings','second','rl-key-000002')$$,
  'the second report is accepted');
select throws_ok(
  $$select public.submit_trust_report('user',null,'a1800000-0000-4000-8000-000000000007',
    'spam','bookings','third','rl-key-000003')$$,
  '53400','Too many attempts. Please wait and try again.',
  'the third report is refused by the server, not the client');
reset role;
select ok((select count(*) from private.rate_limit_saturation_events) >= 1,
  'reaching the limit is durably recorded as an early-warning signal');
-- The limiter is a counter, never a second copy of the identifiers it protects.
select is(
  (select count(*)::integer from private.rate_limit_events
   where subject_hash !~ '^[0-9a-f]{64}$'),
  0, 'every limiter subject is stored only as a hash');
select is(
  (select count(*)::integer from private.rate_limit_events
   where subject_hash like '%a1800000%'),
  0, 'no raw account identifier reaches the limiter');
update private.rate_limit_policies set max_events = 20 where policy_key = 'trust_report_submit';

-- ---------------------------------------------------------------------------
-- Observability redaction
-- ---------------------------------------------------------------------------
select is(private.operational_payload_safe('{"count":3,"queue":"open_disputes"}'::jsonb), true,
  'a safe operational payload is accepted');
select is(private.operational_payload_safe('{"access_token":"abc"}'::jsonb), false,
  'a token key is refused');
select is(private.operational_payload_safe('{"otp":"123456"}'::jsonb), false,
  'an OTP key is refused');
select is(private.operational_payload_safe('{"message":"hello"}'::jsonb), false,
  'a private message key is refused');
select is(private.operational_payload_safe('{"national_id":"x"}'::jsonb), false,
  'a national identifier key is refused');
select is(private.operational_payload_safe('{"note":"internal"}'::jsonb), false,
  'a staff note key is refused');
select is(private.operational_payload_safe('{"value":"a@b.com"}'::jsonb), false,
  'an email address value is refused');
select is(private.operational_payload_safe('{"value":"+201001234567"}'::jsonb), false,
  'an Egyptian phone number value is refused');
select is(private.operational_payload_safe(
  ('{"value":"' || repeat('a',201) || '"}')::jsonb), false, 'an over-long value is refused');
select is(private.operational_payload_safe('{"nested":{"a":1}}'::jsonb), false,
  'a nested object is refused');
-- A rejected payload drops the detail and keeps the event.
select ok(private.record_operational_event('staff','staff.test_event','info',
  '{"access_token":"leak"}'::jsonb) is not null, 'an unsafe payload still records the event');
select is(
  (select e.safe_detail from private.operational_log_events e
   where e.event_key = 'staff.test_event' order by e.id desc limit 1),
  '{"redacted": true}'::jsonb, 'the unsafe detail is replaced, never stored');
select is(
  (select count(*)::integer from private.operational_log_events
   where safe_detail::text like '%leak%'),
  0, 'the secret never reaches the log table');
select ok((select count(*) from private.observability_retention_policy) >= 7,
  'every log stream declares a retention policy and an owner');
select is(
  (select count(*)::integer from private.observability_retention_policy where contains_personal_data),
  0, 'no declared log stream contains personal data');

-- ---------------------------------------------------------------------------
-- Release verification
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000001');
select ok((public.verify_platform_release())->'checks' is not null,
  'release verification runs');
select ok(pg_catalog.jsonb_array_length((public.verify_platform_release())->'checks') >= 12,
  'release verification covers every structural guarantee');
-- The undeployed webhook surface is an honest, visible failure.
select is((public.verify_platform_release())->>'passed','false',
  'release verification fails while a launch gate is genuinely open');
select is(
  (select count(*)::integer from pg_catalog.jsonb_array_elements((public.verify_platform_release())->'checks') c
   where (c->>'check') = 'unowned_rate_limits' and (c->>'passed')::boolean),
  0, 'the undeployed webhook surface is reported as an open gap');
select is(
  (select count(*)::integer from pg_catalog.jsonb_array_elements((public.verify_platform_release())->'checks') c
   where (c->>'check') in ('anon_private_grants','realtime_private','push_delivery_enabled',
     'live_payment_modes','release_scheduler','enabled_feature_flags','active_kill_switches')
     and not (c->>'passed')::boolean),
  0, 'every disabled-provider and privacy guarantee currently holds');
reset role;

set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000002');
select throws_ok($$select public.verify_platform_release()$$,'42501','Staff capability required',
  'release verification needs the audit capability');
reset role;

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------
select is(has_function_privilege('authenticated','private.enforce_rate_limit(text,text)','EXECUTE'),false,
  'a client cannot drive the rate limiter directly');
select is(has_function_privilege('authenticated','private.require_domain_staff(text)','EXECUTE'),false,
  'a client cannot call the domain staff gate directly');
select is(has_function_privilege('authenticated','private.consume_dual_control(text,text,text,text)','EXECUTE'),false,
  'a client cannot consume a dual control approval directly');
select is(has_function_privilege('authenticated','private.record_operational_event(text,text,text,jsonb,text,uuid)','EXECUTE'),
  false,'a client cannot write operational logs');
select is(has_function_privilege('authenticated','private.staff_auth_freshness_seconds()','EXECUTE'),false,
  'a client cannot probe the freshness helper directly');
select is(has_function_privilege('anon','public.verify_platform_release()','EXECUTE'),false,
  'anonymous callers cannot verify the release');
select is(has_function_privilege('anon','public.staff_request_dual_control(text,text,text,text)','EXECUTE'),false,
  'anonymous callers cannot request dual control');
select is(has_function_privilege('authenticated','public.submit_trust_report(text,uuid,uuid,text,text,text,text,uuid)','EXECUTE'),
  true,'the rate-limited client RPC keeps its original grant');

select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'private' and grantee in ('anon','authenticated','PUBLIC')
     and table_name in ('rate_limit_policies','rate_limit_events','rate_limit_saturation_events',
       'operational_log_events','observability_retention_policy','staff_dual_control_requests',
       'staff_access_reviews','platform_environment_events')),
  0, 'no private WPS-018 table is exposed to a client role');

select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef and n.nspname in ('public','private')
     and not (coalesce(array_to_string(p.proconfig,','),'') like '%search_path=%')),
  0, 'every security definer function in the database pins a search path');

select is(
  (select count(*)::integer from pg_catalog.pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'private'),
  0, 'no private table is broadcast over Realtime');

-- Nothing was enabled.
select is((select push_delivery_enabled from private.notification_configuration where singleton), false,
  'push delivery remains disabled');
select is((select token_registration_enabled from private.notification_configuration where singleton), false,
  'push token registration remains disabled');
select is((select scheduler_enabled from private.notification_configuration where singleton), false,
  'the notification scheduler remains disabled');
select is((select gateway_mode from private.payment_configuration where id), 'disabled',
  'the payment gateway remains disabled');
select is((select payout_mode from private.payment_configuration where id), 'disabled',
  'payouts remain disabled');
select is((select automatic_release_scheduler_enabled from private.payment_configuration where id), false,
  'the earnings release scheduler remains disabled');
select is((select enabled from private.marketplace_configuration where singleton), true,
  'the marketplace request path is enabled by its readiness migration');

-- ---------------------------------------------------------------------------
-- Release verification must survive the transaction the Console actually uses
-- ---------------------------------------------------------------------------
--
-- PostgREST executes a `stable` function inside a read-only transaction. The
-- verification used to write an access-log row from inside itself, so through
-- the Console it raised `cannot execute INSERT in a read-only transaction`
-- while every read-write pgTAP run passed. This asserts the real path.
set local role authenticated;
select pg_temp.act_as('a1800000-0000-4000-8000-000000000001');
set local transaction_read_only = on;
select lives_ok(
  $$ select public.verify_platform_release() $$,
  'RELEASE VERIFICATION RUNS IN A READ-ONLY TRANSACTION, AS THE CONSOLE CALLS IT');
select ok((public.verify_platform_release())->'checks' is not null,
  'and still returns its checks with no write of its own');
select throws_ok(
  $$ select public.staff_record_release_verification(0) $$,
  '25006',
  null,
  'while the separated telemetry is honestly a write and says so');
-- Left read-only deliberately: Postgres refuses to return to read-write inside
-- a read-only transaction, and nothing after this point writes.

select * from finish();
rollback;
