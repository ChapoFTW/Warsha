-- The invariants a client role must never violate, asserted over the whole
-- schema rather than table by table.
--
-- A list of tables is a test somebody has to remember to edit, and the one they
-- forget is the one that matters. These are PROPERTIES: a table added next
-- month is covered by a rule written today, and the failure message names the
-- object so the reader does not have to go looking.
--
-- Four properties:
--
--   1. Every ordinary table in an API-exposed schema has row security enabled.
--      Not "the ones we remembered" -- every one, count zero, no exceptions.
--   2. The signed-out role writes nothing, anywhere.
--   3. A normal customer and a normal worker cannot execute a staff operation.
--   4. A table whose writes are owned by an RPC holds no write grant at all,
--      so the RPC is the only door rather than the preferred one.

begin;
select plan(20);

-- ---------------------------------------------------------------------------
-- 1. Row security, everywhere, no exceptions
-- ---------------------------------------------------------------------------
-- `public` is reachable through PostgREST. A table there without RLS is
-- readable by anybody holding a grant on it, and Supabase's defaults have
-- handed out that grant before now.

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  '',
  'EVERY ORDINARY TABLE IN public HAS ROW SECURITY ENABLED');

-- Stated as a count too, because that is the number the release checklist
-- quotes and a reader should be able to find it here by searching for it.
select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'public_tables_without_rls = 0');

-- Partitioned tables are reachable through their parent and are just as
-- exposed, so they are covered by the same rule rather than by an exemption.
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'p' and not c.relrowsecurity),
  '',
  'and so does every partitioned table');

-- RLS enabled with no policy denies everything, which is safe but is usually a
-- mistake rather than a decision. A table a client holds a grant on and that
-- has no policy at all is a feature that silently returns nothing.
select is(
  (select coalesce(string_agg(t.relname, ', ' order by t.relname), '')
   from pg_class t
   join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relkind = 'r' and t.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = t.oid)
     and exists (select 1 from information_schema.role_table_grants g
                 where g.table_schema = 'public' and g.table_name = t.relname
                   and g.grantee in ('anon', 'authenticated'))),
  '',
  'NO TABLE IS GRANTED TO A CLIENT ROLE AND THEN LEFT WITH NO POLICY TO EVALUATE');

-- ---------------------------------------------------------------------------
-- 2. The signed-out role writes nothing
-- ---------------------------------------------------------------------------

select is(
  (select coalesce(string_agg(distinct table_name || '.' || privilege_type, ', '
                              order by table_name || '.' || privilege_type), '')
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  '',
  'ANONYMOUS WRITE ACCESS REMAINS ZERO TABLES');

select is(
  (select coalesce(string_agg(distinct table_name || '.' || privilege_type, ', '
                              order by table_name || '.' || privilege_type), '')
   from information_schema.role_column_grants
   where table_schema = 'public' and grantee = 'anon'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  '',
  'and none hidden at column level, which is where a grant goes to be forgotten');

select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'PUBLIC'),
  0,
  'the PUBLIC pseudo-role -- every role at once, including ones that do not exist yet -- holds nothing');

-- ---------------------------------------------------------------------------
-- 3. Writes owned by an RPC have no second door
-- ---------------------------------------------------------------------------
-- Every table this pass touched takes its writes through a SECURITY DEFINER
-- function that owns the authorization decision. A write grant alongside that
-- would be a second implementation of the rule, which would eventually disagree
-- with the first.

select is(
  (select coalesce(string_agg(distinct table_name || '.' || privilege_type, ', '
                              order by table_name || '.' || privilege_type), '')
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
     and table_name in ('conversations', 'messages', 'conversation_members',
                        'worker_quotes', 'marketplace_requests', 'quote_invitations',
                        'app_settings', 'bookings')),
  '',
  'NO CLIENT MAY WRITE A CONVERSATION, A QUOTE, A REQUEST OR A BOOKING DIRECTLY');

-- And the RPCs that own those writes are reachable by a signed-in caller and
-- nobody else.
select is(has_function_privilege('anon', 'public.send_request_message(uuid,uuid,text,uuid)', 'execute'), false,
  'the request-message RPC is closed to anonymous callers');
select is(has_function_privilege('anon', 'public.submit_worker_quote(uuid,jsonb,text)', 'execute'), false,
  'so is quote submission');
select is(has_function_privilege('anon', 'public.get_booking_counterparty_contact(uuid)', 'execute'), false,
  'and the contact RPC');

-- ---------------------------------------------------------------------------
-- 4. Staff operations are closed to ordinary accounts
-- ---------------------------------------------------------------------------
-- An honest statement of the architecture: staff sign in as ordinary Supabase
-- users and therefore hold the SAME `authenticated` role as every customer.
-- There is no custom access-token hook and no per-staff database role, so the
-- EXECUTE grant cannot distinguish them -- narrowing it below `authenticated`
-- would require a JWT role-claim architecture that does not exist here, and
-- inventing one would lock out every staff member the moment it was wrong.
--
-- The boundary is therefore inside each function, and that is what these
-- assertions check: not that a customer lacks EXECUTE, but that executing gets
-- them nowhere.

insert into auth.users(instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','99000000-0000-0000-0000-000000000001','authenticated','authenticated','boundary-customer@test.local',null,'',now(),null,'{}','{"display_name":"Boundary Customer"}',now(),now()),
('00000000-0000-0000-0000-000000000000','99000000-0000-0000-0000-000000000002','authenticated','authenticated',null,'+201000000901','',null,now(),'{}','{"display_name":"Boundary Worker"}',now(),now());

insert into public.provider_profiles(id,user_id,display_name,primary_category_id,profession_key,category_ids,about,avatar_url,is_verified,is_available,is_published,onboarding_status,service_radius_km,completed_jobs,rating_average,review_count,emergency_available)
values ('99000000-0000-0000-0001-000000000002','99000000-0000-0000-0000-000000000002','Boundary Worker','plumbing','plumbing',array['plumbing'],'An ordinary active worker.','99000000-0000-0000-0000-000000000002/avatar/profile.jpg',true,true,true,'approved',50,10,4.7,8,false);
insert into public.user_roles(user_id,role) values ('99000000-0000-0000-0000-000000000002','provider') on conflict do nothing;

-- A normal customer.
set local role authenticated;
select set_config('request.jwt.claim.sub','99000000-0000-0000-0000-000000000001',true);

select throws_ok(
  $$select public.staff_grant_role('99000000-0000-0000-0000-000000000001'::uuid,'support',null,'test','k-boundary-0000001')$$,
  null, null,
  'A NORMAL CUSTOMER CANNOT GRANT A STAFF ROLE');
select throws_ok(
  $$select public.staff_set_feature_flag('anything', true, 'test', 'k-boundary-0000002')$$,
  null, null,
  'nor change a feature flag');
select throws_ok(
  $$select public.staff_set_kill_switch('anything', true, 'test', 'k-boundary-0000003')$$,
  null, null,
  'nor a kill switch');
select throws_ok(
  $$select public.staff_worker_vetting_queue()$$,
  null, null,
  'nor inspect the worker vetting queue');
select throws_ok(
  $$select public.staff_audit_search(null, null, null, null, 20)$$,
  null, null,
  'AND CANNOT READ THE AUDIT TRAIL');

reset role;
select set_config('request.jwt.claim.sub','',true);

-- A normal, fully active worker. Being a verified professional is not a step
-- towards being staff, and this is the assertion that says so.
set local role authenticated;
select set_config('request.jwt.claim.sub','99000000-0000-0000-0000-000000000002',true);

select throws_ok(
  $$select public.staff_grant_role('99000000-0000-0000-0000-000000000002'::uuid,'support',null,'test','k-boundary-0000004')$$,
  null, null,
  'AN ACTIVE WORKER CANNOT GRANT A STAFF ROLE EITHER');
select throws_ok(
  $$select public.staff_worker_vetting_queue()$$,
  null, null,
  'nor approve the vetting of other workers');
select throws_ok(
  $$select public.staff_bind_platform_environment('production','test','k-boundary-0000005')$$,
  null, null,
  'NOR BIND THE PLATFORM ENVIRONMENT');

reset role;
select set_config('request.jwt.claim.sub','',true);

-- Every staff RPC is SECURITY DEFINER with a fixed, empty search_path. A
-- definer function with a mutable search_path is a privilege-escalation
-- primitive: the caller chooses which schema `some_table` resolves to.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'staff\_%'
     and (not p.prosecdef
          or p.proconfig is null
          or not ('search_path=' = any (select left(c, 12) from unnest(p.proconfig) c)))),
  '',
  'EVERY STAFF RPC IS SECURITY DEFINER WITH A PINNED search_path');

rollback;
