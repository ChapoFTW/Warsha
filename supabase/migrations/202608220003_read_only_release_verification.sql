-- READ-ONLY RELEASE VERIFICATION
--
-- `verify_platform_release()` is declared `stable`, and PostgREST executes a
-- non-volatile function inside a read-only transaction. The function also
-- called `private.staff_log_access`, which inserts. Through the Warsha Console
-- that raised `cannot execute INSERT in a read-only transaction` (25006), so
-- the verification could never run from the surface built to run it. pgTAP
-- never saw it because a test transaction is read-write.
--
-- The fix does not relax the read-only guarantee to let the write through. The
-- verification is an observation and stays one; the access record is separated
-- into its own volatile authority the caller invokes afterwards. Telemetry that
-- can fail must never be able to fail a structural check, and a check the
-- console calls read-only must not secretly write.

create or replace function public.verify_platform_release()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_actor uuid; v_checks jsonb; v_failures integer;

begin
  v_actor := private.require_staff_capability('view_audit_logs');

  -- Helper is inlined because a stable function cannot create one.
  with results as (
    select * from (values
      ('definer_search_path',
       (select pg_catalog.count(*)::integer from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where p.prosecdef and n.nspname in ('public','private')
          and not (coalesce(pg_catalog.array_to_string(p.proconfig,','),'') like '%search_path=%')),
       0, 'Every security-definer function pins a search_path'),
      ('anon_private_grants',
       (select pg_catalog.count(*)::integer from information_schema.role_table_grants
        where table_schema = 'private' and grantee in ('anon','authenticated','PUBLIC')),
       0, 'No private table is exposed to a client role'),
      ('realtime_private',
       (select pg_catalog.count(*)::integer from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'private'),
       0, 'No private table is broadcast over Realtime'),
      ('public_tables_without_rls',
       (select pg_catalog.count(*)::integer from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
       0, 'Every public table has row level security enabled'),
      ('enabled_feature_flags',
       (select pg_catalog.count(*)::integer from private.staff_feature_flags f
        where f.enabled and f.environment = private.platform_environment()),
       0, 'No feature flag is enabled in this environment'),
      ('active_kill_switches',
       (select pg_catalog.count(*)::integer from private.staff_kill_switches s where s.active),
       0, 'No kill switch is active'),
      ('push_delivery_enabled',
       (select pg_catalog.count(*)::integer from private.notification_configuration c
        where c.singleton and (c.push_delivery_enabled or c.token_registration_enabled or c.scheduler_enabled)),
       0, 'Push delivery, token registration, and the scheduler are all disabled'),
      ('live_payment_modes',
       (select pg_catalog.count(*)::integer from private.payment_configuration c
        where c.id and (c.gateway_mode in ('sandbox','live') or c.payout_mode in ('sandbox','live'))),
       0, 'No live or sandbox payment or payout mode is selected'),
      ('release_scheduler',
       (select pg_catalog.count(*)::integer from private.payment_configuration c
        where c.id and c.automatic_release_scheduler_enabled),
       0, 'The automatic earnings release scheduler is disabled'),
      ('production_legacy_grace',
       (select pg_catalog.count(*)::integer from private.staff_platform_configuration c
        where c.singleton and c.environment = 'production' and c.legacy_staff_rpc_grace_enabled),
       0, 'Production does not accept the pre-WPS-017 staff gate'),
      ('production_without_mfa',
       (select pg_catalog.count(*)::integer from private.staff_platform_configuration c
        where c.singleton and c.environment = 'production'
          and (not c.mfa_required or c.mfa_provider = 'none')),
       0, 'Production requires a configured second factor'),
      ('unowned_rate_limits',
       (select pg_catalog.count(*)::integer from private.rate_limit_policies p
        where p.enforced_by = 'client_only_gap'),
       0, 'Every audited surface has a server-side limit owner')
    ) as t(check_key, observed, expected, description)
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'check', r.check_key, 'observed', r.observed, 'expected', r.expected,
      'passed', r.observed = r.expected, 'description', r.description
    ) order by r.check_key), '[]'::jsonb),
    pg_catalog.count(*) filter (where r.observed <> r.expected)::integer
  into v_checks, v_failures
  from results r;

  -- No write. The capability is still required, so an unauthorised caller is
  -- still refused; what changed is that being observed no longer depends on
  -- being able to record the observation.
  return pg_catalog.jsonb_build_object(
    'environment', private.platform_environment(),
    'failures', v_failures,
    'passed', v_failures = 0,
    'checks', v_checks,
    'generatedAt', pg_catalog.now());
end;
$$;

comment on function public.verify_platform_release() is
  'WPS-018 structural release verification. Observational and side-effect free, '
  'so it runs inside the read-only transaction PostgREST opens for a stable '
  'function. Access is recorded separately by staff_record_release_verification.';

-- The separated telemetry. Volatile, so PostgREST runs it read-write, and the
-- caller invokes it after a verification it already has in hand.
create or replace function public.staff_record_release_verification(p_failures integer)
returns void
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_actor uuid;
begin
  v_actor := private.require_staff_capability('view_audit_logs');
  if p_failures is null or p_failures < 0 or p_failures > 1000 then
    raise exception 'Invalid verification failure count' using errcode = '22023';
  end if;
  perform private.staff_log_access(v_actor, 'audit_explorer', 'view_audit_logs',
    'verify_platform_release', p_failures);
end;
$$;

comment on function public.staff_record_release_verification(integer) is
  'Records that a staff member ran release verification. Separate from the '
  'verification itself so an audit write can never fail a structural check, and '
  'so the check can stay genuinely read-only.';

revoke all on function public.verify_platform_release() from public, anon;
revoke all on function public.staff_record_release_verification(integer) from public, anon;
grant execute on function public.verify_platform_release() to authenticated;
grant execute on function public.staff_record_release_verification(integer) to authenticated;
