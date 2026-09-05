-- A revoked session, and a second factor that was never presented.
--
-- ## What this file is for
--
-- Warsha has two staff gates, and until migration 202609060003 they did not
-- enforce the same contract.
--
--   private.require_staff_capability   every staff RPC
--   private.staff_has_capability       every staff RLS POLICY
--   private.is_staff                   the broad staff RLS predicate
--
-- The RPC gate refused a revoked session and refused a caller who held only
-- `aal1` where the platform requires `aal2`. The policy gates did neither, so
-- the same staff member was locked out of the audited RPC and admitted by a
-- direct select — and PostgREST will happily issue that select, and Storage will
-- sign a URL for any row whose SELECT policy passes.
--
-- So the assertions below are written in pairs. Each one asks the RPC gate and
-- the policy gate the same question and requires the same answer, because a
-- boundary that only holds on one of two doors is not a boundary.
--
-- ## What this file cannot prove
--
-- pgTAP sets `request.jwt.claims` itself. It is therefore simulating a token,
-- not verifying one — nothing here proves GoTrue signs the `aal` claim or that
-- PostgREST rejects a forged one. What it does prove is that the SERVER decides
-- from that claim and offers the client no other way to influence the outcome:
-- the assurance level is read from the token, the requirement is read from
-- server-side configuration, and every function involved is SECURITY DEFINER
-- with EXECUTE revoked from the client roles. Those assertions are at the end.

begin;
select plan(25);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','b2000000-0000-0000-0000-000000000001','authenticated','authenticated','aal-staff@test.local','',now(),'{}','{"display_name":"Assurance Staff"}',now(),now());

insert into auth.users(instance_id,id,aud,role,phone,encrypted_password,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','b2000000-0000-0000-0000-000000000002','authenticated','authenticated','+201000000961','',now(),'{}','{"display_name":"Assurance Worker"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count,emergency_available)
values ('b2000000-0000-0000-0001-000000000002','b2000000-0000-0000-0000-000000000002','Assurance Worker','plumbing','plumbing',array['plumbing'],'Assurance worker profile.',true,true,true,'approved',50,5,4.5,4,false);

insert into public.staff_role_grants(user_id, role_key, reason, idempotency_key)
values ('b2000000-0000-0000-0000-000000000001','verification_reviewer','assurance test','aal-grant-000000000001');

-- The path is `<user_id>/<provider_id>/<file>`: the policy resolves the provider
-- from the SECOND segment.
insert into storage.objects(bucket_id, name, owner_id) values
('verification-documents','b2000000-0000-0000-0000-000000000002/b2000000-0000-0000-0001-000000000002/national_id_front.jpg','b2000000-0000-0000-0000-000000000002');

-- Two sessions for the same staff member: one live, one already revoked.
insert into private.staff_session_attestations(user_id, session_ref, attested_at, revoked_at)
values
('b2000000-0000-0000-0000-000000000001','session-live', now(), null),
('b2000000-0000-0000-0000-000000000001','session-revoked', now(), now());

-- A token, as the server sees it. `amr` carries the sign-in timestamp that
-- `staff_auth_freshness_seconds` reads, so re-authentication counts as fresh.
create or replace function pg_temp.staff_token(p_aal text, p_session text)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub', 'b2000000-0000-0000-0000-000000000001',
    'role', 'authenticated',
    'aal', p_aal,
    'session_id', p_session,
    'amr', json_build_array(json_build_object(
      'method', 'password', 'timestamp', floor(extract(epoch from now()))))
  )::text, true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 1. No second factor required — the platform's current configuration
-- ---------------------------------------------------------------------------
-- `mfa_required` is false here, so `aal1` is a complete session and both gates
-- must admit it. This is the control: it shows the assertions below fail for the
-- reason claimed, and not because the fixture never worked at all.

select ok(not (select mfa_required from private.staff_platform_configuration where singleton),
  'the platform does not currently require a second factor');

select pg_temp.staff_token('aal1', 'session-live');

select ok(private.staff_has_capability('review_identity_verification'),
  'a live aal1 staff session holds its capability while MFA is not required');
select ok(private.is_staff(), 'and reads as staff');
select lives_ok(
  $$select private.require_staff_capability('review_identity_verification')$$,
  'and the RPC gate admits it too');

set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='verification-documents'), 1,
  'and can read the identity document it is entitled to review');
reset role;

-- ---------------------------------------------------------------------------
-- 2. The same session, revoked
-- ---------------------------------------------------------------------------
-- Revoking a staff session is meant to take effect now, not at token expiry.
-- It always did for RPCs. For direct reads it did not, and the window was as
-- long as the access token had left to live.

select pg_temp.staff_token('aal1', 'session-revoked');

select ok(not private.staff_has_capability('review_identity_verification'),
  'A REVOKED SESSION HOLDS NO CAPABILITY');
select ok(not private.is_staff(),
  'AND DOES NOT READ AS STAFF AT ALL');
select throws_ok(
  $$select private.require_staff_capability('review_identity_verification')$$,
  '42501', null,
  'the RPC gate refuses it, as it always has');

set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='verification-documents'), 0,
  'AND THE DOCUMENT IS NO LONGER READABLE — REVOCATION REACHES ROW SECURITY NOW');
reset role;

-- ---------------------------------------------------------------------------
-- 3. A second factor is required and was not presented
-- ---------------------------------------------------------------------------
-- The configuration Production is intended to run in. `aal1` means the identity
-- provider granted a password session and nothing more.

update private.staff_platform_configuration
set mfa_required = true, mfa_provider = 'supabase_totp' where singleton;

select pg_temp.staff_token('aal1', 'session-live');

select is(private.staff_assurance_level(), 'aal1',
  'the assurance level is read from the token, not asserted by the client');
select ok(not private.staff_mfa_satisfied(),
  'a required second factor is not satisfied by a password session');
select ok(not private.staff_has_capability('review_identity_verification'),
  'AAL1 HOLDS NO CAPABILITY WHEN THE PLATFORM REQUIRES A SECOND FACTOR');
select ok(not private.is_staff(),
  'and does not read as staff');
select throws_ok(
  $$select private.require_staff_capability('review_identity_verification')$$,
  '42501', null,
  'and the RPC gate refuses it');

set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='verification-documents'), 0,
  'AND THE IDENTITY DOCUMENT IS UNREADABLE — BOTH DOORS AGREE');
reset role;

-- ---------------------------------------------------------------------------
-- 4. The second factor was presented
-- ---------------------------------------------------------------------------
-- The other half of the proof: the gate is closed by a missing factor, not by
-- the configuration merely being switched on.

select pg_temp.staff_token('aal2', 'session-live');

select ok(private.staff_mfa_satisfied(), 'aal2 satisfies the requirement');
select ok(private.staff_has_capability('review_identity_verification'),
  'and the capability is held again');
select lives_ok(
  $$select private.require_staff_capability('review_identity_verification')$$,
  'and the RPC gate admits it');

set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='verification-documents'), 1,
  'and the reviewer can read the document they are there to review');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Required, but no provider configured: fail closed
-- ---------------------------------------------------------------------------
-- A platform that demands a second factor and offers no way to present one must
-- deny, not wave callers through. This is the state a half-finished MFA rollout
-- would leave behind.

update private.staff_platform_configuration
set mfa_required = true, mfa_provider = 'none' where singleton;

select pg_temp.staff_token('aal2', 'session-live');

select ok(not private.staff_platform_ready(),
  'a required second factor with no provider leaves the admin platform unavailable');
select ok(not private.staff_has_capability('review_identity_verification'),
  'AND EVEN AN AAL2 SESSION HOLDS NOTHING — THE FAILURE IS CLOSED, NOT OPEN');

-- ---------------------------------------------------------------------------
-- 6. The client cannot reach the machinery
-- ---------------------------------------------------------------------------
-- Everything above rests on the server deciding. These functions are
-- SECURITY DEFINER, so an EXECUTE grant to a client role would let a caller ask
-- them things directly; the assurance and session functions are revoked
-- outright.

select ok(not has_function_privilege('authenticated', 'private.staff_assurance_level()', 'execute'),
  'authenticated CANNOT execute staff_assurance_level');
select ok(not has_function_privilege('authenticated', 'private.staff_mfa_satisfied()', 'execute'),
  'nor staff_mfa_satisfied');
select ok(not has_function_privilege('authenticated', 'private.staff_session_revoked()', 'execute'),
  'nor staff_session_revoked');
select ok(not has_function_privilege('anon', 'private.staff_has_capability(text)', 'execute'),
  'and a signed-out caller cannot ask whether it holds a staff capability');

rollback;
