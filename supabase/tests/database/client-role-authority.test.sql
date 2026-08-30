-- The client-role authority inventory.
--
-- Every table Warsha creates in `public` arrives carrying Supabase's default
-- privileges: INSERT, SELECT, UPDATE and DELETE already held by `anon` and
-- `authenticated`, before a single `grant` is written. Granting narrowly
-- afterwards does not take them back, so for a year the surplus accumulated
-- quietly and the only reason nothing was reachable through it was that RLS
-- denies a command with no policy. `202608280005_client_role_privilege_baseline`
-- revoked the lot and granted back one explicit manifest.
--
-- This file is what stops it coming back. It does not check the manifest
-- table by table — that would need editing every time a legitimate grant is
-- added, and a test everybody edits is a test nobody reads. It asserts the
-- SHAPE the manifest has to keep, as properties over the whole schema, so a
-- table added next month is covered by a rule written today.
--
-- Every assertion reports the offending object BY NAME when it fails, because
-- "expected 0, got 3" sends the reader back to psql to find out which three.

begin;

select plan(19);

-- ---------------------------------------------------------------------------
-- 1. The signed-out role writes nothing, anywhere
-- ---------------------------------------------------------------------------
-- The load-bearing assertion in the file. Before the baseline migration `anon`
-- held INSERT, UPDATE and DELETE on thirty tables including `admin_roles`,
-- `admin_permissions`, `admin_role_assignments`, `user_roles`, `audit_logs`,
-- `payments`, `payment_transactions`, `refunds`, `provider_earnings` and
-- `provider_payouts`. RLS refused all of it. That is not a reason to hold it.

select is(
  (select coalesce(string_agg(distinct table_name || '.' || privilege_type, ', '
                              order by table_name || '.' || privilege_type), '')
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
  '',
  'NO ANONYMOUS WRITE PRIVILEGE EXISTS ON ANY PUBLIC TABLE');

select is(
  (select coalesce(string_agg(distinct table_name || '.' || privilege_type, ', '
                              order by table_name || '.' || privilege_type), '')
   from information_schema.role_column_grants
   where table_schema = 'public' and grantee = 'anon'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  '',
  'and none hidden at column level either');

-- ---------------------------------------------------------------------------
-- 2. What the signed-out role may read, exactly
-- ---------------------------------------------------------------------------
-- The public surface is a catalogue and the published face of a worker. It is
-- not a list, it is a claim: anything else added here is a new thing the
-- internet can read, and should be argued for in review rather than acquired.

select is(
  (select coalesce(string_agg(distinct table_name, ', ' order by table_name), '')
   from information_schema.role_column_grants
   where table_schema = 'public' and grantee = 'anon'),
  -- `profiles` left this list on 2026-08-31. It held a public-provider read
  -- policy and a column grant on every column, `phone` included, so any
  -- anonymous caller could read a published professional's telephone number.
  -- Provider cards render from `provider_profiles`; nothing needed this.
  'profession_service_categories, profession_services, professions, '
  || 'provider_portfolio, provider_services, review_responses, reviews, '
  || 'service_categories, services',
  'THE ANONYMOUS READ SURFACE IS EXACTLY THE PUBLIC CATALOGUE');

-- `provider_profiles` is deliberately NOT in that list. A `providers_public_read`
-- policy does admit anon, but no client reads the table directly — discovery is
-- `get_discovery_home`, `search_providers` and their siblings, all SECURITY
-- DEFINER — and `profile-self-access.test.sql` states the rule as "anonymous
-- browsing keeps using the guarded catalog RPC".
select is(has_table_privilege('anon', 'public.provider_profiles', 'select'), false,
  'anonymous browsing still goes through the guarded catalogue RPC');

-- ---------------------------------------------------------------------------
-- 3. The narrow column grants stay narrow
-- ---------------------------------------------------------------------------
-- These four are the only tables whose read is scoped to a column list rather
-- than the whole row, and the narrowing is the control: a reader may see THAT
-- a review was moderated and never who decided it or why; a dispute
-- participant sees their own case and not its internal handling. A
-- `revoke all` followed by a table-level `grant select` would widen all four
-- silently, which is exactly how this migration nearly broke them.

select is(
  (select count(*)::integer from information_schema.role_column_grants
   where table_schema = 'public' and table_name = 'reviews'
     and grantee = 'authenticated' and privilege_type = 'SELECT'),
  19, 'a signed-in reader sees 19 of the 23 review columns');
select is(
  (select count(*)::integer from information_schema.role_column_grants
   where table_schema = 'public' and table_name = 'reviews'
     and grantee = 'anon' and privilege_type = 'SELECT'),
  19, 'and a signed-out reader sees the same 19');
select is(
  (select coalesce(string_agg(distinct column_name, ', ' order by column_name), '')
   from information_schema.role_column_grants
   where table_schema = 'public' and table_name = 'reviews' and grantee = 'anon'
     and column_name in ('moderation_reason', 'moderated_by', 'moderated_at', 'moderation_note')),
  '', 'MODERATION REASON AND ACTOR ARE NEVER READABLE BY A CLIENT ROLE');
select is(
  (select count(*)::integer from information_schema.role_column_grants
   where table_schema = 'public' and table_name = 'disputes'
     and grantee = 'authenticated' and privilege_type = 'SELECT'),
  20, 'a dispute participant sees 20 of the 26 dispute columns');

-- `disputes` is load-bearing beyond its own table: `dispute_evidence_upload` on
-- `storage.objects` runs `exists (select 1 from public.disputes ...)` as the
-- CALLER, so losing this grant fails every authenticated upload to every
-- bucket with "permission denied for table disputes", before RLS is consulted.
select is(has_column_privilege('authenticated', 'public.disputes', 'booking_id', 'select'), true,
  'AND THE STORAGE UPLOAD POLICIES CAN STILL EVALUATE THEMSELVES');

-- ---------------------------------------------------------------------------
-- 4. A customer owns two columns of their own profile
-- ---------------------------------------------------------------------------
-- `phone` is the authoritative identity column, written by the verification
-- path. `202608010002_profile_self_access.sql` always intended this and was
-- overruled by the default privileges it never revoked.

select is(
  (select coalesce(string_agg(column_name, ', ' order by column_name), '')
   from information_schema.role_column_grants
   where table_schema = 'public' and table_name = 'profiles'
     and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  'display_name, preferred_language',
  'AN ACCOUNT MAY REWRITE ITS NAME AND LANGUAGE, AND NOTHING ELSE');

-- ---------------------------------------------------------------------------
-- 5. The anon-executable function surface
-- ---------------------------------------------------------------------------
-- Fourteen functions beyond the sanctioned nine were reachable signed out,
-- including `staff_publish_legal_version`, `staff_sync_provider_status` and
-- `submit_my_criminal_record`. Every one was SECURITY DEFINER behind its own
-- guard and every one refused an anonymous caller, which is why nothing
-- leaked; a privilege that is harmless only because a second control holds is
-- a control with no depth behind it.
--
-- `authentication-role-onboarding-vetting.test.sql` owns the allow-list and
-- asserts the count. This restates it as the names, so a failure here says
-- which function arrived rather than that one did.

select is(
  (select coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')),
  'get_discovery_filters, get_discovery_home, get_marketplace_catalog, '
  || 'get_marketplace_catalog_v2, get_provider_rating_summary, '
  || 'get_provider_reputation_summary, get_provider_trust_indicators, '
  || 'get_search_suggestions, search_providers',
  'EXACTLY THE NINE SANCTIONED READS ARE ANON EXECUTABLE, BY NAME');

-- ---------------------------------------------------------------------------
-- 6. The source of the drift is closed
-- ---------------------------------------------------------------------------
-- Without this, the next `create table` in `public` arrives holding `arwd` for
-- both client roles again and the whole exercise repeats. Asserted on
-- `pg_default_acl` rather than on the migration text, because what matters is
-- the state of the database a developer actually gets.

-- Asserted by CREATING a table rather than by reading `pg_default_acl`,
-- because what matters is the privilege a new table actually arrives with.
-- The probe is rolled back with the rest of the file.
--
-- Scoped to defaults owned by `postgres`, the role migrations run as. Supabase
-- keeps a second set owned by `supabase_admin` which still grants to the client
-- roles; `postgres` is not a member of `supabase_admin` and cannot alter them,
-- and they only apply to objects `supabase_admin` itself creates, which no
-- Warsha migration does.
create table public.authority_drift_probe (id integer);

select is(
  (select coalesce(string_agg(privilege_type, ', ' order by privilege_type), '')
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'authority_drift_probe'
     and grantee in ('anon', 'authenticated')),
  '',
  'A TABLE CREATED TODAY ARRIVES WITH NOTHING FOR EITHER CLIENT ROLE');

select is(
  (select coalesce(string_agg(pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text, ', '), '')
   from pg_default_acl d
   join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public'
     and pg_get_userbyid(d.defaclrole) = 'postgres'
     and d.defaclobjtype in ('r', 'S')
     and array_to_string(d.defaclacl, ' ') ~ '(anon|authenticated)='),
  '',
  'and no postgres-owned default privilege will hand it to one');

-- ---------------------------------------------------------------------------
-- 7. PUBLIC holds nothing, and `private` stays out of reach
-- ---------------------------------------------------------------------------
-- `PUBLIC` is every role at once, including roles that do not exist yet. It is
-- checked separately because a grant to PUBLIC does not appear in a search for
-- `anon`.

select is(
  (select coalesce(string_agg(distinct table_name || '.' || privilege_type, ', '
                              order by table_name || '.' || privilege_type), '')
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'PUBLIC'),
  '',
  'the PUBLIC pseudo-role holds nothing in the public schema');

select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where table_schema = 'private' and grantee in ('anon', 'authenticated', 'PUBLIC')),
  0,
  'AND NO CLIENT ROLE REACHES A TABLE IN THE PRIVATE SCHEMA');

-- ---------------------------------------------------------------------------
-- Staff is granted one way
-- ---------------------------------------------------------------------------
-- `private.is_staff` answers true for a legacy `user_roles` row with role
-- 'admin' or 'support' as well as for a governed grant, and thirty-six RLS
-- policies are gated on it. The staff console is not: it requires the governed
-- grant and refuses the legacy row outright.
--
-- So a legacy row is staff at the API and not staff in the console, with no
-- expiry, no granter, no reason and no revocation record. Nothing in the
-- product ever created one -- `handle_new_user` and `ensure_customer_profile`
-- write 'customer', `activate_provider_role` writes 'provider', and client
-- roles hold SELECT on that table and nothing else -- so one could only ever
-- arrive by hand, which is the path that leaves no trail.
--
-- 202608310006 does not remove the legacy branch, because an administrator this
-- repository cannot see may be standing on it. It removes the ability to make a
-- new one.

select has_function('private', 'refuse_new_legacy_staff_role',
  'the guard against ungoverned staff rows exists');

select throws_ok(
  $$insert into public.user_roles(user_id, role)
    values ('00000000-0000-4000-8000-0000000000ff', 'admin')$$,
  '42501',
  'Staff access is granted through public.staff_role_grants, not user_roles',
  'A NEW LEGACY ADMIN ROW IS REFUSED');

select throws_ok(
  $$insert into public.user_roles(user_id, role)
    values ('00000000-0000-4000-8000-0000000000fe', 'support')$$,
  '42501',
  'Staff access is granted through public.staff_role_grants, not user_roles',
  'and so is a new legacy support row');

-- An ordinary role is untouched. A guard that blocks signup is not a guard.
-- Against a real account, because `user_roles.user_id` references `profiles`
-- and a guard that let a fabricated id through would be testing the wrong
-- thing. If the environment has no profiles the insert touches nothing and
-- still lives, which is the property under test either way.
select lives_ok(
  $$insert into public.user_roles(user_id, role)
    select id, 'customer' from public.profiles limit 1
    on conflict do nothing$$,
  'while an ordinary customer role is still written normally');

select * from finish();

rollback;
