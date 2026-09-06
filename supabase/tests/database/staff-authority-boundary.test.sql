-- Who may become staff, and what the cheapest useful staff role can reach.
--
-- ## Why this file exists
--
-- Two doors were wider than the job needed, and 202609060009 narrowed both.
--
--   Seconding a subprocessor decision required manage_subprocessors, and the
--   only roles carrying it were security_administrator and
--   super_administrator. So a second pair of eyes on a Maps activation also
--   bought access to workers' criminal records. The new
--   `subprocessor_approver` role carries the approval capability and nothing
--   that touches a person.
--
--   `private.bootstrap_staff_role` had no guard at all. It existed to break a
--   real circularity — the first administrators cannot be granted by an
--   administrator — but it stayed open forever, which made it a permanent way
--   to add staff outside governed administration. It now closes once the
--   quorum it exists to create is in place.
--
-- The assertions below are written as capability PAIRS wherever a refusal is
-- claimed: the narrow role is asked for the thing it should have and the thing
-- it should not, so a role that accidentally holds everything fails here rather
-- than passing by silence.
--
-- ## What this file cannot prove
--
-- pgTAP sets `request.jwt.claims` itself, so it simulates a token rather than
-- verifying one. Nothing here proves GoTrue signs `aal`. What it proves is that
-- the SERVER decides from the claim, and that every function involved is
-- SECURITY DEFINER with EXECUTE revoked from client roles.
--
-- The break-glass boundary is deliberately NOT asserted as impossible: a
-- database owner can still insert a grant directly, 202609060009 says so, and a
-- test pretending otherwise would be describing a platform Warsha does not
-- have.

begin;
select no_plan();

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

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','a3000000-0000-4000-8000-000000000001','authenticated','authenticated','boundary-owner@test.local','',now(),'{}','{"display_name":"Owner"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a3000000-0000-4000-8000-000000000002','authenticated','authenticated','boundary-second@test.local','',now(),'{}','{"display_name":"Second approver"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a3000000-0000-4000-8000-000000000003','authenticated','authenticated','boundary-third@test.local','',now(),'{}','{"display_name":"Third staff"}',now(),now()),
('00000000-0000-0000-0000-000000000000','a3000000-0000-4000-8000-000000000004','authenticated','authenticated','boundary-worker@test.local','',now(),'{}','{"display_name":"Vetted worker"}',now(),now());

-- ---------------------------------------------------------------------------
-- 1. The narrow role is exactly three capabilities
-- ---------------------------------------------------------------------------

select ok(exists(select 1 from public.staff_roles where role_key = 'subprocessor_approver'),
  'the narrow role exists in the canonical catalogue');

select is(
  (select array_agg(capability_key order by capability_key)
   from public.staff_role_capabilities where role_key = 'subprocessor_approver'),
  array['manage_subprocessors','review_legal_governance','view_operations_home'],
  'AND CARRIES EXACTLY THE THREE CAPABILITIES THE JOB NEEDS, IN FULL');

select is(
  (select count(*)::integer from public.staff_role_capabilities
   where role_key = 'subprocessor_approver'),
  3, 'and nothing has been added to it since');

-- ---------------------------------------------------------------------------
-- 2. Bootstrap establishes the quorum, then closes
-- ---------------------------------------------------------------------------

select is((select count(distinct user_id)::integer from public.staff_role_grants
           where revoked_at is null), 0,
  'the fixture starts with no staff identities at all');

select ok(private.bootstrap_staff_role(
  'a3000000-0000-4000-8000-000000000001','security_administrator',
  'First staff identity, because no administrator exists to grant it') is not null,
  'STAFF #1 CAN BE BOOTSTRAPPED — there is no administrator to grant them');

select is((select count(distinct user_id)::integer from public.staff_role_grants
           where revoked_at is null), 1,
  'and that is one identity');

-- 202609060009 opened this door twice, because a governed grant consumed dual
-- control and dual control needed two people. 202609060010 removed that: one
-- authorised operator can grant everybody else through the governed path, so
-- the circularity is one identity deep and the door closes after one.
select throws_ok(
  $$select private.bootstrap_staff_role(
      'a3000000-0000-4000-8000-000000000002','subprocessor_approver',
      'A second identity that must not come through this door')$$,
  '42501', NULL,
  'STAFF #2 CANNOT BE BOOTSTRAPPED — one operator can grant them properly');

select throws_ok(
  $$select private.bootstrap_staff_role(
      'a3000000-0000-4000-8000-000000000003','security_administrator',
      'A third identity that must not come through this door')$$,
  '42501', NULL,
  'AND NEITHER CAN STAFF #3 — the door closed behind the first identity');

select is((select count(distinct user_id)::integer from public.staff_role_grants
           where revoked_at is null), 1,
  'and the refusals left no grant behind');

-- The successor path, used immediately: the narrow role this file goes on to
-- test arrives the way every staff identity now arrives.
set local role authenticated;
select pg_temp.act_as('a3000000-0000-4000-8000-000000000001');
select is((public.staff_grant_role(
  'a3000000-0000-4000-8000-000000000002','subprocessor_approver',
  'Second staff identity, granted by one authorised operator','boundary-grant-2'))->>'duplicate',
  'false',
  'AND ONE OPERATOR GRANTS STAFF #2 THROUGH THE GOVERNED PATH, WITH NO SECOND PERSON');
reset role;

select is((select count(distinct user_id)::integer from public.staff_role_grants
           where revoked_at is null), 2,
  'so there are two identities, and the second one has a named granter');

-- A refusal that also broke retries would be a worse bug than the one it fixes.
select is(
  private.bootstrap_staff_role(
    'a3000000-0000-4000-8000-000000000001','security_administrator',
    'Repeating an existing grant creates no new authority'),
  (select id from public.staff_role_grants
   where user_id = 'a3000000-0000-4000-8000-000000000001' and revoked_at is null),
  'repeating an EXISTING grant is still idempotent after closure');

select is(has_function_privilege(
  'authenticated','private.bootstrap_staff_role(uuid,text,text)','EXECUTE'), false,
  'and bootstrap was never reachable by a client role in the first place');

-- ---------------------------------------------------------------------------
-- 3. What the narrow role holds, and what it does not
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('a3000000-0000-4000-8000-000000000002');

select ok(private.staff_has_capability('manage_subprocessors'),
  'THE NARROW ROLE HOLDS manage_subprocessors — the capability the approval gate checks');
select ok(private.staff_has_capability('review_legal_governance'),
  'and the governance register, so its approval is informed rather than blind');
select ok(private.staff_has_capability('view_operations_home'),
  'and can reach the operational surface at all');

select ok(not private.staff_has_capability('review_criminal_records'),
  'IT CANNOT READ CRIMINAL RECORDS');
select ok(not private.staff_has_capability('manage_staff_roles'),
  'IT CANNOT MANAGE STAFF ROLES');
select ok(not private.staff_has_capability('manage_kill_switches'),
  'IT CANNOT MANAGE KILL SWITCHES');
select ok(not private.staff_has_capability('manage_feature_flags'),
  'IT CANNOT MANAGE FEATURE FLAGS');
select ok(not private.staff_has_capability('publish_legal_version'),
  'IT CANNOT PUBLISH LEGAL VERSIONS');
select ok(not private.staff_has_capability('manage_legal_holds'),
  'and it cannot place a legal hold either');

reset role;

-- ---------------------------------------------------------------------------
-- 4. The same refusals at the RPC gate, not only the capability table
-- ---------------------------------------------------------------------------
-- A capability the role does not hold is only half the story. These are the
-- doors somebody would actually push on.

set local role authenticated;
select pg_temp.act_as('a3000000-0000-4000-8000-000000000002');

select throws_ok(
  $$select public.staff_record_certificate_outcome(
      'a3000000-0000-4000-8000-000000000004','approved','Safe reason','Assessment')$$,
  '42501', NULL,
  'THE CRIMINAL-RECORD OUTCOME RPC REFUSES THE NARROW ROLE');

select throws_ok(
  $$select public.staff_grant_role(
      'a3000000-0000-4000-8000-000000000003','security_administrator',
      'The narrow role must not be able to promote anybody','boundary-grant-1')$$,
  '42501', NULL,
  'THE GOVERNED GRANT RPC REFUSES THE NARROW ROLE');

select throws_ok(
  $$select public.staff_set_kill_switch('uploads', true, 'Narrow role must not', 'boundary-ks-1')$$,
  '42501', NULL,
  'THE KILL-SWITCH RPC REFUSES THE NARROW ROLE');

select throws_ok(
  $$select public.staff_set_feature_flag(
      'identity_extraction','local',true,'all',100,'Narrow role must not')$$,
  '42501', NULL,
  'THE FEATURE-FLAG RPC REFUSES THE NARROW ROLE');

select throws_ok(
  $$select public.staff_publish_legal_version(
      'terms_of_service','99.0','a'||repeat('0',63),'b'||repeat('0',63),
      'material','Narrow role must not publish','لا يجوز',
      current_date + 30,'Narrow role must not publish legal text')$$,
  '42501', NULL,
  'THE LEGAL PUBLICATION RPC REFUSES THE NARROW ROLE');

select throws_ok(
  $$select public.staff_revoke_role(
      (select id from public.staff_role_grants
       where user_id = 'a3000000-0000-4000-8000-000000000001' limit 1),
      'Narrow role must not be able to unseat the administrator')$$,
  '42501', NULL,
  'AND IT CANNOT REVOKE THE ADMINISTRATOR WHO SECONDS IT');

reset role;

-- ---------------------------------------------------------------------------
-- 5. Criminal records are unreadable in storage, not just in the RPC
-- ---------------------------------------------------------------------------
-- The RLS policy on the bucket admits `review_criminal_records`. Storage will
-- sign a URL for any row whose SELECT policy passes, so the policy is the real
-- boundary and is asserted directly.

insert into storage.objects(bucket_id, name, owner_id) values
('worker-criminal-records',
 'a3000000-0000-4000-8000-000000000004/record.pdf',
 'a3000000-0000-4000-8000-000000000004');

set local role authenticated;
select pg_temp.act_as('a3000000-0000-4000-8000-000000000002');
select is((select count(*)::integer from storage.objects
           where bucket_id = 'worker-criminal-records'), 0,
  'THE NARROW ROLE SEES NO CRIMINAL RECORD OBJECT AT ALL');
reset role;

-- The control: the same read succeeds for the role that is supposed to have it,
-- so the zero above is a refusal and not an empty bucket.
set local role authenticated;
select pg_temp.act_as('a3000000-0000-4000-8000-000000000001');
select is((select count(*)::integer from storage.objects
           where bucket_id = 'worker-criminal-records'), 1,
  'while the security administrator, who is meant to review them, sees it');
reset role;

-- ---------------------------------------------------------------------------
-- 6. The narrow role really can complete a dual-control activation
-- ---------------------------------------------------------------------------
-- Least privilege is only correct if it still does the job. This is the job.

-- Pinned rather than assumed. This section is about WHO may approve, so the
-- provider's prerequisites are set explicitly; a seed change elsewhere should
-- not quietly turn this into a test of something else.
update private.external_providers set current_status = 'configured_not_enabled'
where provider_key = 'google_cloud_vision';
update private.subprocessors set integration_status = 'approved_not_integrated'
where subprocessor_key = 'google_cloud_vision';
update private.staff_feature_flags set enabled = false
where flag_key = 'identity_extraction' and environment = 'local';
update private.staff_kill_switches set active = false
where switch_key = 'identity_extraction';

select is(private.approval_policy_for('manage_subprocessors'), 'single_operator',
  'subprocessor governance needs one authorised operator');

-- The narrow role holds `manage_subprocessors`, and under single-operator
-- policy holding it IS the authority. So the test of "is this role sufficient
-- for the job" is no longer "can it second somebody else" — it is "can it do
-- the job", which is a stronger question and the one that matters.
set local role authenticated;
select pg_temp.act_as('a3000000-0000-4000-8000-000000000002');
select is((public.staff_activate_external_provider(
  'google_cloud_vision','local',
  'Activated by the subprocessor approver under single-operator governance'))->>'governanceMode',
  'single_operator',
  'THE NARROW ROLE ACTIVATES A PROVIDER ON ITS OWN — it is sufficient for the job');
reset role;

select is((select current_status from private.external_providers
           where provider_key = 'google_cloud_vision'), 'active',
  'and the provider really is active');

select is(
  (select count(*)::integer from private.staff_audit_events
   where action = 'single_operator_authorisation_consumed'
     and actor_id = 'a3000000-0000-4000-8000-000000000002'
     and safe_detail->>'secondApprover' is null),
  1,
  'recorded as one operator authorising it, naming no second approver');

-- ---------------------------------------------------------------------------
-- 7. Staff #3 arrives through the governed path, not through bootstrap
-- ---------------------------------------------------------------------------
-- This is the half of the bootstrap change that matters: closing a door is only
-- correct if the other one opens. `public.staff_grant_role` has existed since
-- WPS-017 and is what the refusal now names.

set local role authenticated;
select pg_temp.act_as('a3000000-0000-4000-8000-000000000001');

select is((public.staff_grant_role(
  'a3000000-0000-4000-8000-000000000003','marketplace_operations',
  'A third staff identity, granted through the governed path','boundary-grant-3'))->>'duplicate',
  'false',
  'STAFF #3 ARRIVES THROUGH THE GOVERNED PATH after bootstrap refused them');

select throws_ok(
  $$select public.staff_grant_role(
      'a3000000-0000-4000-8000-000000000001','super_administrator',
      'Promoting myself','boundary-grant-self')$$,
  '42501', 'A staff member cannot grant a role to their own account',
  'and the governed path still refuses a self-grant');
reset role;

select is(
  (select granted_by from public.staff_role_grants
   where user_id = 'a3000000-0000-4000-8000-000000000003' and revoked_at is null),
  'a3000000-0000-4000-8000-000000000001'::uuid,
  'the governed grant NAMES the administrator who made it — a bootstrap grant cannot');

select is(
  (select granted_by from public.staff_role_grants
   where user_id = 'a3000000-0000-4000-8000-000000000001' and revoked_at is null),
  NULL,
  'while the bootstrap grant has no granter, which is how break-glass reads');

select ok(exists(
  select 1 from private.staff_audit_events
  where action = 'staff_role_granted'
    and actor_id = 'a3000000-0000-4000-8000-000000000001'),
  'and the governed grant is in the audit trail');

select is(has_function_privilege(
  'anon','public.staff_grant_role(uuid,text,text,text,timestamptz)','EXECUTE'), false,
  'the governed path is not reachable anonymously');

-- One name, one function. An overload resolved by argument shape is how
-- `submit_my_criminal_record` went wrong for four weeks.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'staff_grant_role'),
  1,
  'AND THERE IS EXACTLY ONE staff_grant_role — 202609060009 added no overload');

-- ---------------------------------------------------------------------------
-- 8. The metadata and the runtime now agree
-- ---------------------------------------------------------------------------
-- 202609060009 recorded an open gap here: `manage_staff_roles` was declared
-- dual_control in the catalogue while `staff_grant_role` consumed no second
-- identity, with the no-self-grant rule standing in for one. The catalogue said
-- one thing and the code did another.
--
-- 202609060010 closed it by changing the declaration rather than the code: role
-- administration is single-operator, which is what it always was in practice
-- and what Warsha's policy now says it should be. Self-escalation stays blocked
-- separately, by the no-self-grant rule, which is a different control and is
-- asserted above.

select is(
  (select approval_policy from public.staff_capabilities
   where capability_key = 'manage_staff_roles'),
  'single_operator',
  'ROLE ADMINISTRATION IS DECLARED SINGLE-OPERATOR');

select is(
  (select dual_control from public.staff_capabilities
   where capability_key = 'manage_staff_roles'),
  false,
  'and the derived boolean agrees, because it is derived');

select is(
  (select count(*)::integer from private.staff_dual_control_requests
   where action_key = 'grant_staff_role'),
  0,
  'AND NO SECOND IDENTITY WAS SPENT ON THE GRANTS ABOVE — as the catalogue now says');

-- ---------------------------------------------------------------------------
-- 9. One staff member cannot obtain another's authenticator secret
-- ---------------------------------------------------------------------------
-- The console gained a first-party TOTP enrolment flow, so it is now worth
-- asserting the other half of that promise from the database side: the seed
-- lives in GoTrue's own tables, and nothing a staff member can call reaches it.
--
-- The client-side half — that the enrolling browser never sends the secret
-- anywhere, and that `mfa.enroll` takes no account parameter so it cannot be
-- aimed at somebody else — is proved in `scripts/staff-mfa-enrolment.test.mts`.
-- This half proves that even a staff member with every capability Warsha
-- defines has no route to another person's factor.

select has_table('auth', 'mfa_factors', 'GoTrue owns the factor table');

select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'auth'
     and table_name in ('mfa_factors', 'mfa_challenges')
     and grantee in ('anon', 'authenticated', 'public')),
  0,
  'NO CLIENT ROLE HOLDS ANY PRIVILEGE ON THE FACTOR OR CHALLENGE TABLES');

select is(has_table_privilege('authenticated', 'auth.mfa_factors', 'SELECT'), false,
  'AN AUTHENTICATED STAFF SESSION CANNOT READ auth.mfa_factors AT ALL');
select is(has_table_privilege('anon', 'auth.mfa_factors', 'SELECT'), false,
  'and neither can an anonymous one');

-- A SECURITY DEFINER function is the way a table nobody can read becomes a
-- table everybody can read. None of Warsha's touch it.
-- `prosrc` rather than `pg_get_functiondef`, which raises on an aggregate and
-- would abort this file rather than assert anything.
select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prosrc like '%mfa_factors%'),
  0,
  'NO WARSHA FUNCTION READS THE FACTOR TABLE — there is no definer route to a seed');

select is(
  (select count(*)::integer from pg_catalog.pg_views
   where schemaname = 'public' and definition like '%mfa_factors%'),
  0,
  'and no public view republishes it');

select * from finish();
rollback;
