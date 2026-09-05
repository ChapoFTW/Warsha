-- Does the rate-limit inventory tell the truth?
--
-- ## Why this file exists
--
-- `private.rate_limit_policies` is a declaration: 44 rows, each naming a limit
-- and, in `enforced_by`, who applies it. Declarations rot. Nothing compared this
-- one to the code, and when it was finally compared, three policies claimed the
-- shared limiter and never called it, and one key was called that had never been
-- declared at all.
--
-- That last one was not a paperwork problem. `enforce_rate_limit` refuses an
-- unknown key rather than allowing the call — the right choice — so a missing
-- row took `public.submit_my_criminal_record` completely offline, and it had
-- been offline since 2026-08-09.
--
-- Warsha already had the same shape of bug in `private.storage_bucket_lifecycle`:
-- a table declaring a policy that nothing read. A declaration nobody checks is
-- decoration. So this file checks it, on every run, in both directions.
--
-- ## What "enforced_by" is allowed to mean
--
--   wps018_limiter      calls private.enforce_rate_limit. Verifiable here, and
--                       verified below.
--   marketplace_config  a cap in the surface, read from marketplace config
--   domain_rule         a rule in the surface itself, or in the Edge Function
--                       that owns it and is reached before the database
--   supabase_auth       the identity provider. Not reachable from SQL.
--   client_only_gap     a known, tracked absence. G29.
--
-- Only the first is mechanically checkable from inside the database, so only the
-- first is asserted as a call. The others are asserted to be a closed set, so a
-- new policy cannot quietly claim an unverifiable owner that does not exist.

begin;
select plan(20);

-- ---------------------------------------------------------------------------
-- 1. Every claim of the shared limiter is true
-- ---------------------------------------------------------------------------
-- The load-bearing assertion, and the one that would have caught the outage.

create or replace function pg_temp.limiter_callers() returns table(policy_key text)
language sql stable as $$
  select distinct m[1]
  from pg_catalog.pg_proc p,
       pg_catalog.regexp_matches(p.prosrc, 'enforce_rate_limit\(\s*''([a-z0-9_]+)''', 'g') m
  where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
$$;

select is(
  (select coalesce(string_agg(p.policy_key, ', ' order by p.policy_key), '')
   from private.rate_limit_policies p
   where p.enforced_by = 'wps018_limiter'
     and p.policy_key not in (select policy_key from pg_temp.limiter_callers())),
  '',
  'EVERY POLICY CLAIMING THE SHARED LIMITER IS ACTUALLY CALLED BY A FUNCTION');

-- ---------------------------------------------------------------------------
-- 2. Every enforced key is declared
-- ---------------------------------------------------------------------------
-- The other direction, and the one the outage came in through. A call naming a
-- key that does not exist does not degrade to "no limit" — it takes the whole
-- surface down, because the limiter refuses what it cannot find.

select is(
  (select coalesce(string_agg(c.policy_key, ', ' order by c.policy_key), '')
   from pg_temp.limiter_callers() c
   where c.policy_key not in (select policy_key from private.rate_limit_policies)),
  '',
  'AND EVERY KEY A FUNCTION ENFORCES IS DECLARED — AN UNDECLARED KEY IS AN OUTAGE, NOT A GAP');

-- A surface cannot claim an owner nobody defined.
select is(
  (select coalesce(string_agg(distinct enforced_by, ', ' order by enforced_by), '')
   from private.rate_limit_policies
   where enforced_by not in
     ('wps018_limiter','marketplace_config','domain_rule','supabase_auth','client_only_gap')),
  '',
  'and no policy claims an owner outside the known set');

-- A disabled policy returns without counting anything, which is indistinguishable
-- from having no limit at all. That may be a legitimate operational act, but it
-- must never be the resting state of the repository.
select is((select count(*)::integer from private.rate_limit_policies where not enabled), 0,
  'NO POLICY IS SHIPPED DISABLED');

-- ---------------------------------------------------------------------------
-- 3. The limiter fails closed
-- ---------------------------------------------------------------------------
-- Everything above assumes an unknown key is refused. If it were allowed
-- through, a typo would silently remove a limit instead of raising, and
-- assertion 2 would be checking something that did not matter.

select throws_ok(
  $$select private.enforce_rate_limit('a_policy_that_does_not_exist', 'subject')$$,
  '22023', null,
  'AN UNKNOWN POLICY KEY IS REFUSED, NOT WAVED THROUGH');

-- And the client cannot reach the limiter to spend, inspect or reset a budget.
select ok(not has_function_privilege('authenticated', 'private.enforce_rate_limit(text,text)', 'execute'),
  'authenticated cannot call the limiter directly');
select ok(not has_function_privilege('anon', 'private.enforce_rate_limit(text,text)', 'execute'),
  'and neither can a signed-out caller');
select ok(not has_table_privilege('authenticated', 'private.rate_limit_policies', 'select'),
  'nor read the policy table to learn the limits');
select ok(not has_table_privilege('authenticated', 'private.rate_limit_events', 'select'),
  'nor read the counters');

-- The counter table stores a hash, not the account it belongs to, so the limiter
-- does not become a record of who did what and when.
select isnt(
  private.rate_limit_subject_hash('review_submit', 'a1000000-0000-0000-0000-000000000001'),
  'a1000000-0000-0000-0000-000000000001',
  'a subject is stored hashed, not as the account id');
select is(
  private.rate_limit_subject_hash('review_submit', 'x'),
  private.rate_limit_subject_hash('review_submit', 'x'),
  'the hash is stable, so a subject keeps its bucket');
select isnt(
  private.rate_limit_subject_hash('review_submit', 'x'),
  private.rate_limit_subject_hash('review_report', 'x'),
  'AND IS PER POLICY, SO ONE SURFACE CANNOT SPEND ANOTHER SURFACE''S BUDGET');

-- ---------------------------------------------------------------------------
-- 4. A limit that is called actually stops the caller
-- ---------------------------------------------------------------------------
-- Asserted against the limiter directly, at the declared boundary, rather than
-- by driving a surface: this is the mechanism every `wps018_limiter` policy
-- depends on, so proving it once proves it for all of them.

select is((select max_events from private.rate_limit_policies where policy_key = 'privacy_export_request'), 3,
  'privacy_export_request allows three per day');

select lives_ok($$select private.enforce_rate_limit('privacy_export_request', 'rl-subject-1')$$,
  'the first call is allowed');
select lives_ok($$select private.enforce_rate_limit('privacy_export_request', 'rl-subject-1')$$,
  'the second is allowed');
select lives_ok($$select private.enforce_rate_limit('privacy_export_request', 'rl-subject-1')$$,
  'the third is allowed');
select throws_ok(
  $$select private.enforce_rate_limit('privacy_export_request', 'rl-subject-1')$$,
  '53400',
  'Too many attempts. Please wait and try again.',
  'AND THE FOURTH IS REFUSED WITH 53400 AND A MESSAGE SAFE TO SHOW A PERSON');

-- One subject reaching its limit does not affect another.
select lives_ok($$select private.enforce_rate_limit('privacy_export_request', 'rl-subject-2')$$,
  'A DIFFERENT SUBJECT IS UNAFFECTED — THE LIMIT IS PER ACCOUNT, NOT GLOBAL');

-- ---------------------------------------------------------------------------
-- 5. The surface that had two entry points now has one
-- ---------------------------------------------------------------------------
-- WPS-024 set out to add a rate limit to WPS-023's criminal-record submitter and
-- accidentally created a second overload with an older parameter list, five
-- arguments against seven, differing from the client payload by one letter
-- (`p_size_bytes` against `p_file_size_bytes`). PostgREST resolved the client to
-- the new one, which referenced a column that does not exist and omitted a NOT
-- NULL one, so it could never have succeeded. The tested function and the called
-- function were not the same function.

select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_my_criminal_record'),
  1,
  'THE CRIMINAL-RECORD SUBMITTER HAS EXACTLY ONE ENTRY POINT');

select is(
  (select count(*)::integer from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_my_criminal_record'
     and p.prosrc like '%enforce_rate_limit(''worker_criminal_record_submit'')%'),
  1,
  'and it is the one carrying the rate limit');

rollback;
