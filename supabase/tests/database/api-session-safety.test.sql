-- What the API session refuses, and pgTAP never noticed.
--
-- PostgREST connects as `authenticator`, whose `session_preload_libraries`
-- carries `safeupdate`. That library rejects an unqualified DELETE or UPDATE
-- with SQLSTATE 21000 — "DELETE requires a WHERE clause" — and it rejects it
-- inside a SECURITY DEFINER body too, because it is loaded for the SESSION
-- rather than for the role a statement runs as.
--
-- pgTAP connects as a superuser. That session never loads the library, so every
-- assertion about `public.search_providers` passed for as long as the function
-- existed while the function raised on every single call that arrived through
-- the API — anonymous and authenticated, local and hosted, native and web. The
-- primary discovery entry point on both clients returned an error instead of
-- results, and no test in this directory could see it.
--
-- So this file does not test behaviour through a session it cannot have. It
-- reads the catalogue and asserts the PROPERTY that made the failure possible:
-- a function a client can reach must not contain a statement the client's
-- session will refuse to run.

begin;

select plan(14);

-- ---------------------------------------------------------------------------
-- 1. No client-reachable function carries an unqualified DELETE
-- ---------------------------------------------------------------------------
-- Reachability is the whole point. A function only `postgres` can call runs in
-- a session that never loads `safeupdate`, so an unqualified DELETE there is a
-- trap rather than a fault. One that `anon` or `authenticated` may execute is
-- a fault, because the only session that can execute it is the one that
-- refuses the statement.

select is_empty(
  $$
  select n.nspname || '.' || p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'))
    and p.prosrc ~* 'delete[[:space:]]+from[[:space:]]+[a-zA-Z_][a-zA-Z0-9_."]*[[:space:]]*;'
  order by 1
  $$,
  'NO FUNCTION A CLIENT CAN REACH DELETES WITHOUT A WHERE CLAUSE'
);

-- ---------------------------------------------------------------------------
-- 2. Nor an unqualified UPDATE
-- ---------------------------------------------------------------------------
-- `safeupdate` refuses both. Nothing has tripped this one yet; it is here
-- because the DELETE rule was learned the expensive way and the UPDATE rule is
-- the same rule.

select is_empty(
  $$
  select n.nspname || '.' || p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'))
    and p.prosrc ~* 'update[[:space:]]+[a-zA-Z_][a-zA-Z0-9_."]*[[:space:]]+set[[:space:]][^;]*;'
    and p.prosrc !~* 'update[[:space:]]+[a-zA-Z_][a-zA-Z0-9_."]*[[:space:]]+set[[:space:]][^;]*where'
  order by 1
  $$,
  'nor updates every row of a table without saying so'
);

-- ---------------------------------------------------------------------------
-- 3. The function that taught us this is reachable and correct
-- ---------------------------------------------------------------------------
-- Asserting the general property without pinning the specific case would let
-- `search_providers` lose its execute grant and still pass rule 1 — by being
-- unreachable rather than by being right.

select ok(
  has_function_privilege('anon', 'public.search_providers(text,jsonb,text,integer,integer)', 'execute'),
  'marketplace search is still reachable by a signed-out visitor'
);

select ok(
  (select p.prosrc ~* 'delete[[:space:]]+from[[:space:]]+discovery_matches[[:space:]]+where'
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search_providers'),
  'AND IT EMPTIES ITS WORKING SET WITH A WHERE CLAUSE THE API SESSION ACCEPTS'
);

-- ---------------------------------------------------------------------------
-- Storage: no public bucket, and the retired one stays retired
-- ---------------------------------------------------------------------------
-- `avatars` was created public with a `public_media_read` policy that let anon
-- read every object in it. Hardening dropped the policies and flipped it
-- private, but left the bucket, so the inventory carries a bucket no client can
-- use and every audit has to re-investigate. `profile-images` is the live path.

select is_empty(
  $$ select id from storage.buckets where public order by 1 $$,
  'NO STORAGE BUCKET IS PUBLIC'
);

select is_empty(
  $$
  select policyname from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and (coalesce(qual,'') || coalesce(with_check,'')) like '%''avatars''%'
  order by 1
  $$,
  'the retired avatars bucket has no policies and gains none'
);

select isnt_empty(
  $$
  select policyname from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and (coalesce(qual,'') || coalesce(with_check,'')) like '%profile-images%'
  $$,
  'AND profile-images IS THE BUCKET THAT ACTUALLY CARRIES THE POLICIES'
);

-- The attachments table is scaffolding, and it must stay unreachable until it
-- is wired deliberately rather than drifting open.
select is_empty(
  $$
  select grantee from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'marketplace_request_attachments'
    and grantee in ('anon','authenticated')
  order by 1
  $$,
  'deferred attachment scaffolding is not reachable by a client role'
);

-- ---------------------------------------------------------------------------
-- A function that writes is not STABLE
-- ---------------------------------------------------------------------------
-- PostgREST honours the volatility declaration: it runs a STABLE or IMMUTABLE
-- function inside a READ ONLY transaction. A function that says STABLE and then
-- writes therefore raises SQLSTATE 25006 -- "cannot execute INSERT in a
-- read-only transaction" -- on every call that arrives through the API, and the
-- caller sees HTTP 405.
--
-- Six staff functions were in exactly that state, each one declared STABLE and
-- each one calling `private.staff_log_access` to record who had looked at what:
-- the analytics dashboard, the business report, a support case, a customer
-- overview, a worker overview, and the audit explorer. None of them could
-- return a single row to a staff member, and every pgTAP assertion about them
-- passed, because pgTAP runs in an ordinary read-write transaction and never
-- meets the constraint the API imposes. 202608310002 corrected the
-- declarations.
--
-- This is the second defect of this shape. The first was `search_providers`
-- raising on an unqualified DELETE. Both are the same lesson: the database can
-- run something the API will not.

select is_empty(
  $$
  with writers as (
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.provolatile = 'v'
      and n.nspname in ('public', 'private')
      and p.prosrc ~* 'insert[[:space:]]+into|update[[:space:]]+[a-z_.]+[[:space:]]+set|delete[[:space:]]+from'
  )
  select n.nspname || '.' || p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.provolatile in ('i', 's')
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'))
    and exists (select 1 from writers w where p.prosrc like '%' || w.proname || '%')
  order by 1
  $$,
  'NO CLIENT-REACHABLE FUNCTION CLAIMS TO BE READ-ONLY WHILE CALLING A WRITER'
);

-- ---------------------------------------------------------------------------
-- "Not found" is not a server error
-- ---------------------------------------------------------------------------
-- Fifty-seven client-reachable functions, and thirteen private helpers they
-- call, signalled a missing record with SQLSTATE P0002. PostgREST answered
-- HTTP 500 for every one -- "Support case not found", "Booking not found",
-- "Help article not found" -- so a client could not tell a gone record from a
-- broken server, and every ordinary miss appeared in monitoring as a 5xx.
--
-- They raise PT404 now, which PostgREST honours as the HTTP status.

select is_empty(
  $$
  with raisers as (
    select p.oid, n.nspname, p.proname, p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosrc like '%P0002%'
  ),
  reachable as (
    select p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))
  )
  select r.nspname || '.' || r.proname
  from raisers r
  where (r.nspname = 'public'
         and (has_function_privilege('anon', r.oid, 'execute')
           or has_function_privilege('authenticated', r.oid, 'execute')))
     or exists (select 1 from reachable c where c.prosrc like '%' || r.proname || '%')
  order by 1
  $$,
  'NO CLIENT-REACHABLE PATH REPORTS A MISSING RECORD AS A SERVER ERROR'
);

-- ---------------------------------------------------------------------------
-- A client can say that it broke, and cannot say anything else
-- ---------------------------------------------------------------------------
-- Warsha had no way to learn that a client had failed: no error boundary on
-- either surface, no unhandled-rejection handler, and no endpoint to report to.
-- An uncaught render error was a blank screen and the first report of it was a
-- customer describing it.
--
-- The receiving end takes an error class, a component and a surface, and
-- nothing else. Not the message, because `operational_payload_safe` refuses a
-- key called `message` outright -- an operations log is read by staff and a
-- client error message is unbounded text from somebody's device.

select has_function('public', 'report_client_error',
  array['text', 'text', 'text', 'boolean'],
  'a client can report that it failed');

-- Authenticated only. Granting it to `anon` was tried and rejected by
-- `client-role-authority`, which asserts exactly nine anon-executable functions
-- and names them -- all nine reads. A write does not belong on that surface,
-- and its rate-limit bucket would be shared across every anonymous caller.
select ok(
  not has_function_privilege('anon', 'public.report_client_error(text,text,text,boolean)', 'execute'),
  'AND THE ANONYMOUS SURFACE STAYS READ-ONLY: THIS WRITE IS NOT ON IT');

select throws_ok(
  $$select public.report_client_error('pirate', 'TypeError', 'X', false)$$,
  '22023',
  'Unknown surface',
  'an unrecognised surface is refused');

-- The function must not be able to become a channel for free text. It accepts
-- no message parameter at all, which is the only way to be sure.
select is_empty(
  $$
  select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'report_client_error'
    and pg_get_function_arguments(p.oid) ~* '(message|body|note|content|stack|detail)'
  $$,
  'AND IT TAKES NO MESSAGE, NO STACK AND NO FREE-FORM DETAIL');

select * from finish();
rollback;
