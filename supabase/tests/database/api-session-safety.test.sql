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

select plan(4);

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

select * from finish();
rollback;
