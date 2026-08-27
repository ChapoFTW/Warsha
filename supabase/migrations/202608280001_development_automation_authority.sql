-- A NON-HUMAN PRINCIPAL THAT CAN OPERATE DEVELOPMENT, AND ONLY DEVELOPMENT
--
-- Every governed action in Warsha starts at `private.require_staff_capability`,
-- which reads `auth.uid()`. That is correct and stays. Its consequence was that
-- engineering automation could build a Development change, migrate it, test it
-- and deploy it — and then stop, because the last step was a person clicking a
-- button. The work was finished and the rollout was not, which is the worst
-- place to leave a change: reviewed, shipped, and not switched on.
--
-- The fix is not to loosen the capability check. It is to admit that a machine
-- is a kind of actor, give it an identity of its own, and let the audit trail
-- say so. Warsha had one actor model — a human with a profile — so a machine
-- could only participate by pretending to be a person. This adds the second
-- model rather than corrupting the first.
--
--   actor_type          'human' | 'automation'
--   governance_mode     'dual_control' | 'single_admin' | 'development_automation'
--   authorization_basis 'owner_approved_development_policy' for automation
--
-- What makes this safe is not a policy note, it is the shape:
--
--   * `private.automation_principals.environment` carries a CHECK that pins it
--     to 'development'. A production principal cannot be stored, so there is no
--     row for a mistake to find.
--   * `private.require_automation_capability` refuses unless the PLATFORM is
--     also development. A Development principal presented against a production
--     platform is refused on the environment, before any capability is read.
--   * `actor_id` stays NULL for automation. It references `public.profiles`,
--     which is the table of people, and no row is invented there.
--   * A constraint refuses an audit row that claims to be automation while
--     naming a human, and the reverse.
--   * Every automation entry point lives in `private` and is granted only to
--     `service_role`. `anon` and `authenticated` cannot reach any of it, so no
--     browser, worker, customer or ordinary staff account can call it however
--     the request is shaped.
--
-- What this does NOT do: weaken any prerequisite. The activation rules,
-- registry checks, feature-flag ordering, kill-switch requirement and
-- subprocessor gate are moved into a shared core and are executed identically
-- whichever kind of actor arrives. The automation path is a second door into
-- the same room, not a hole in the wall.

-- ---------------------------------------------------------------------------
-- 1. THE PRINCIPAL
-- ---------------------------------------------------------------------------

create table if not exists private.automation_principals (
  principal_key text primary key
    constraint automation_principals_key_check
    check (principal_key ~ '^[a-z][a-z0-9_]{2,60}$'),
  display_name text not null,
  -- The structural guarantee. Not a filter somebody remembered to write in a
  -- query: a value the table will not hold. Widening this later has to be a
  -- migration somebody reviews, which is the point.
  environment text not null
    constraint automation_principals_environment_check
    check (environment = 'development'),
  capabilities text[] not null
    constraint automation_principals_capabilities_check
    check (pg_catalog.cardinality(capabilities) between 1 and 40),
  authorization_basis text not null
    constraint automation_principals_basis_check
    check (pg_catalog.length(pg_catalog.btrim(authorization_basis)) between 10 and 200),
  authorization_policy_version text not null,
  active boolean not null default true,
  notes text not null,
  created_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  constraint automation_principals_revoked_check
    check (revoked_at is null or not active)
);

comment on table private.automation_principals is
  'Non-human actors permitted to perform Development-only governance. The '
  'environment CHECK makes a production principal unstorable rather than merely '
  'unwritten.';

revoke all on table private.automation_principals from public, anon, authenticated;

-- Every capability named must be a real one. A principal holding a capability
-- that does not exist would read as broader than it is.
create or replace function private.automation_principal_capabilities_exist()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_missing text;
begin
  select c into v_missing
  from pg_catalog.unnest(new.capabilities) c
  where not exists (
    select 1 from public.staff_capabilities k where k.capability_key = c)
  limit 1;
  if v_missing is not null then
    raise exception 'Unknown staff capability: %', v_missing using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.automation_principal_capabilities_exist()
  from public, anon, authenticated;

drop trigger if exists automation_principals_capabilities on private.automation_principals;
create trigger automation_principals_capabilities
before insert or update on private.automation_principals
for each row execute function private.automation_principal_capabilities_exist();

-- The one principal this migration creates. Its capabilities are the routine
-- Development operations the owner authorised, and deliberately not the ones
-- that decide about a person: no `manage_staff_roles`, no vetting, no refunds,
-- no bans, no export, no legal publication. Automation operates the platform;
-- it does not adjudicate anybody.
insert into private.automation_principals(
  principal_key, display_name, environment, capabilities,
  authorization_basis, authorization_policy_version, notes)
values (
  'development_engineering',
  'Warsha Development engineering automation',
  'development',
  array[
    'manage_subprocessors',
    'manage_feature_flags',
    'manage_kill_switches',
    'review_legal_governance'
  ],
  'owner_approved_development_policy',
  '2026-08-27',
  'Engineering automation for the hosted development project. Authorised by the '
  || 'Warsha owner to perform routine development rollout: provider activation '
  || 'and deactivation, development feature flags, development kill switches, '
  || 'subprocessor reconciliation and internal review records. It holds no '
  || 'capability that decides anything about a person, and no capability over '
  || 'any environment but development.')
on conflict (principal_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. THE AUDIT TRAIL LEARNS THAT ACTORS ARE NOT ALL PEOPLE
-- ---------------------------------------------------------------------------

alter table private.staff_audit_events
  add column if not exists actor_type text not null default 'human';
alter table private.staff_audit_events
  add column if not exists automation_principal_key text;
alter table private.staff_audit_events
  add column if not exists governance_mode text;
alter table private.staff_audit_events
  add column if not exists authorization_basis text;

alter table private.staff_audit_events
  drop constraint if exists staff_audit_events_actor_type_check;
alter table private.staff_audit_events
  add constraint staff_audit_events_actor_type_check
  check (actor_type in ('human', 'automation'));

-- A row cannot be both, and cannot be neither. An automation row that named a
-- person would be the exact fabrication this whole design exists to avoid, and
-- a human row carrying a principal key would be just as misleading.
alter table private.staff_audit_events
  drop constraint if exists staff_audit_events_attribution_check;
alter table private.staff_audit_events
  add constraint staff_audit_events_attribution_check
  check (
    (actor_type = 'automation'
      and automation_principal_key is not null
      and actor_id is null)
    or (actor_type = 'human'
      and automation_principal_key is null));

create index if not exists staff_audit_events_automation_idx
  on private.staff_audit_events(automation_principal_key, created_at desc)
  where actor_type = 'automation';

-- One writer for both kinds of actor, so the two can never learn to describe
-- themselves differently. `record_staff_audit` keeps its exact signature and
-- meaning and delegates, so no existing caller changes.
create or replace function private.record_governed_audit(
  p_actor_id uuid,
  p_actor_type text,
  p_principal_key text,
  p_capability text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_reason text,
  p_safe_detail jsonb,
  p_governance_mode text,
  p_authorization_basis text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_env text;
begin
  select c.environment into v_env
  from private.staff_platform_configuration c where c.singleton;
  insert into private.staff_audit_events(
    actor_id, actor_type, automation_principal_key, capability_key, action,
    entity_type, entity_id, reason, break_glass, environment, safe_detail,
    governance_mode, authorization_basis)
  values (
    case when p_actor_type = 'automation' then null else p_actor_id end,
    p_actor_type,
    case when p_actor_type = 'automation' then p_principal_key else null end,
    p_capability, p_action, p_entity_type, p_entity_id,
    pg_catalog.btrim(p_reason),
    -- `staff_capability_is_break_glass` asks whether an actor is reaching
    -- outside their own roles, and with a NULL actor it answers yes. Automation
    -- is never break-glass: the capabilities it holds are exactly the ones it
    -- was created with, which is the opposite of the situation that flag marks.
    case
      when p_actor_type = 'automation' then false
      when p_capability is null then false
      else private.staff_capability_is_break_glass(p_actor_id, p_capability)
    end,
    coalesce(v_env, 'local'),
    coalesce(p_safe_detail, '{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        'actorType', p_actor_type,
        'governanceMode', p_governance_mode,
        'authorizationBasis', p_authorization_basis,
        'automationPrincipal', case
          when p_actor_type = 'automation' then p_principal_key else null end),
    p_governance_mode,
    p_authorization_basis)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function private.record_governed_audit(
  uuid, text, text, text, text, text, uuid, text, jsonb, text, text)
  from public, anon, authenticated;

-- Unchanged signature, unchanged meaning, unchanged output for every existing
-- caller. It now writes through the one writer above so a human row and an
-- automation row cannot learn to describe themselves differently.
create or replace function private.record_staff_audit(
  p_actor_id uuid, p_capability text, p_action text, p_entity_type text,
  p_entity_id uuid, p_reason text, p_safe_detail jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  return private.record_governed_audit(
    p_actor_id, 'human', null, p_capability, p_action, p_entity_type,
    p_entity_id, p_reason, p_safe_detail, 'staff_action', 'staff_authorisation');
end;
$$;
revoke all on function private.record_staff_audit(uuid,text,text,text,uuid,text,jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. THE AUTOMATION CAPABILITY GATE
-- ---------------------------------------------------------------------------
--
-- The counterpart to `require_staff_capability`, and deliberately stricter: it
-- checks the environment first, because the environment is the boundary that
-- must not be crossed even by an otherwise valid principal.

create or replace function private.require_automation_capability(
  p_principal_key text,
  p_capability text)
returns private.automation_principals
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_principal private.automation_principals%rowtype;
  v_environment text := private.platform_environment();
begin
  -- Environment before identity. A principal that is perfectly valid in
  -- development must still be refused the moment the platform is not
  -- development, and refused for that reason, so the log says what happened.
  if v_environment <> 'development' then
    raise exception 'Automation governance is available in development only'
      using errcode = '42501';
  end if;
  if not private.staff_platform_ready() then
    raise exception 'Admin platform is unavailable' using errcode = '42501';
  end if;

  select * into v_principal
  from private.automation_principals p
  where p.principal_key = p_principal_key;
  if v_principal.principal_key is null then
    raise exception 'Unknown automation principal' using errcode = '42501';
  end if;
  if not v_principal.active or v_principal.revoked_at is not null then
    raise exception 'That automation principal is revoked' using errcode = '42501';
  end if;
  if v_principal.environment <> v_environment then
    raise exception 'Automation principal is not authorised for this environment'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.staff_capabilities c where c.capability_key = p_capability) then
    raise exception 'Unknown staff capability' using errcode = '22023';
  end if;
  if not (p_capability = any(v_principal.capabilities)) then
    raise exception 'Automation capability required' using errcode = '42501';
  end if;
  return v_principal;
end;
$$;

comment on function private.require_automation_capability(text, text) is
  'The automation counterpart of require_staff_capability. Refuses on the '
  'environment before it reads the principal, so a development principal '
  'presented against any other platform is refused for the right reason.';

revoke all on function private.require_automation_capability(text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. ONE CORE PER ACTION, EXECUTED IDENTICALLY FOR EITHER KIND OF ACTOR
-- ---------------------------------------------------------------------------
--
-- The prerequisites below are the ones that were already there, moved rather
-- than rewritten. Keeping two copies — one for people, one for machines — is
-- how the machine copy quietly becomes the lenient one.

create or replace function private.activate_external_provider_core(
  p_actor_id uuid,
  p_actor_type text,
  p_principal_key text,
  p_provider_key text,
  p_expected_environment text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config private.staff_platform_configuration%rowtype;
  v_provider private.external_providers%rowtype;
  v_from_status text;
  v_subject text;
  v_approval_id uuid;
  v_consumed boolean;
  v_flag_enabled boolean := false;
  v_kill_switch_active boolean := false;
  v_required integer;
  v_mode text;
  v_basis text;
begin
  if p_expected_environment not in ('local', 'development', 'staging', 'production') then
    raise exception 'Invalid expected environment' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'An activation reason is required' using errcode = '22023';
  end if;

  select * into v_config
  from private.staff_platform_configuration c
  where c.singleton;
  if v_config.environment <> p_expected_environment then
    raise exception 'Provider activation environment mismatch' using errcode = '42501';
  end if;
  if v_config.environment <> 'local' and v_config.expected_project_ref is null then
    raise exception 'The hosted platform project is not bound' using errcode = '42501';
  end if;

  select * into v_provider
  from private.external_providers p
  where p.provider_key = p_provider_key
  for update;
  if v_provider.provider_key is null then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;
  if v_provider.current_status = 'active' then
    raise exception 'Provider is already active' using errcode = '22023';
  end if;
  if v_provider.current_status not in ('implemented_awaiting_credential', 'configured_not_enabled') then
    raise exception 'Provider is not ready for activation' using errcode = '22023';
  end if;
  if not (v_config.environment = any(v_provider.environments)) then
    raise exception 'Provider is not approved for this environment' using errcode = '42501';
  end if;
  if v_provider.execution_context in ('server', 'both')
     and v_provider.credential_secret_name is null then
    raise exception 'Provider has no declared server credential authority' using errcode = '42501';
  end if;
  if v_provider.feature_flag_key is null then
    raise exception 'Provider activation requires an independent feature flag'
      using errcode = '42501';
  end if;
  select f.enabled into v_flag_enabled
  from private.staff_feature_flags f
  where f.flag_key = v_provider.feature_flag_key
    and f.environment = v_config.environment;
  if not found then
    raise exception 'Provider feature flag is missing for this environment'
      using errcode = '42501';
  end if;
  if v_flag_enabled then
    raise exception 'Disable the provider feature flag before activation'
      using errcode = '42501';
  end if;
  if v_provider.kill_switch_key is null
     or not exists (
       select 1 from private.staff_kill_switches k
       where k.switch_key = v_provider.kill_switch_key) then
    raise exception 'Provider activation requires an independent kill switch'
      using errcode = '42501';
  end if;
  select k.active into v_kill_switch_active
  from private.staff_kill_switches k
  where k.switch_key = v_provider.kill_switch_key;
  if v_provider.subprocessor_key is not null
     and not exists (
       select 1 from private.subprocessors s
       where s.subprocessor_key = v_provider.subprocessor_key
         and s.integration_status = 'approved_not_integrated') then
    raise exception 'Subprocessor governance is not ready for provider activation'
      using errcode = '42501';
  end if;
  if v_provider.processing_activity_key is not null
     and not exists (
       select 1 from private.processing_activities a
       where a.activity_key = v_provider.processing_activity_key) then
    raise exception 'Provider processing activity is not registered'
      using errcode = '42501';
  end if;

  v_subject := v_provider.provider_key || ':' || v_config.environment;

  if p_actor_type = 'automation' then
    -- The authorisation is the standing policy the principal was created
    -- under, and the audit row below names it. No dual-control record is
    -- created, because that table is a record of people seconding people and a
    -- machine has nobody to second.
    if v_config.environment <> 'development' then
      raise exception 'Automation governance is available in development only'
        using errcode = '42501';
    end if;
    v_required := 1;
    v_mode := 'development_automation';
    v_basis := 'owner_approved_development_policy';
  else
    v_required := private.required_approval_count(
      v_config.environment, 'activate_external_provider');
    v_mode := private.governance_mode(
      v_config.environment, 'activate_external_provider');
    v_basis := 'staff_authorisation';
    v_consumed := private.consume_dual_control(
      'manage_subprocessors', 'activate_external_provider', v_subject,
      pg_catalog.btrim(p_reason));
    if not v_consumed then
      raise exception 'Provider activation always requires a governed authorisation'
        using errcode = '42501';
    end if;
    select r.id into v_approval_id
    from private.staff_dual_control_requests r
    where r.capability_key = 'manage_subprocessors'
      and r.action_key = 'activate_external_provider'
      and r.subject_ref = v_subject
      and r.requested_by = p_actor_id
      and r.environment = v_config.environment;
  end if;

  v_from_status := v_provider.current_status;
  update private.external_providers
  set current_status = 'active'
  where provider_key = v_provider.provider_key
    and current_status = v_from_status;

  insert into private.external_provider_events(
    provider_key, event_type, from_status, to_status, actor_id, reason)
  values (
    v_provider.provider_key, 'enabled', v_from_status, 'active',
    case when p_actor_type = 'automation' then null else p_actor_id end,
    pg_catalog.btrim(p_reason));

  perform private.record_governed_audit(
    p_actor_id, p_actor_type, p_principal_key,
    'manage_subprocessors', 'external_provider_activated',
    'external_provider', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'providerKey', v_provider.provider_key,
      'environment', v_config.environment,
      'fromStatus', v_from_status,
      'toStatus', 'active',
      'requiredApprovals', v_required,
      'dualControlRequestId', v_approval_id),
    v_mode, v_basis);

  return pg_catalog.jsonb_build_object(
    'providerKey', v_provider.provider_key,
    'environment', v_config.environment,
    'status', 'active',
    'featureFlagEnabled', v_flag_enabled,
    'killSwitchActive', v_kill_switch_active,
    'enabled', private.provider_enabled(v_provider.provider_key),
    'actorType', p_actor_type,
    'governanceMode', v_mode,
    'authorizationBasis', v_basis,
    'requiredApprovals', v_required,
    'dualControlRequestId', v_approval_id);
end;
$$;

revoke all on function private.activate_external_provider_core(
  uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.staff_activate_external_provider(
  p_provider_key text,
  p_expected_environment text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_staff_capability('manage_subprocessors');
begin
  return private.activate_external_provider_core(
    v_actor, 'human', null, p_provider_key, p_expected_environment, p_reason);
end;
$$;

comment on function public.staff_activate_external_provider(text, text, text) is
  'Governed registry activation by a staff member. The number of distinct staff '
  'identities it requires is private.required_approval_count for this '
  'environment. Does not enable a feature flag, alter a kill switch, publish '
  'legal text or accept a credential value.';

revoke all on function public.staff_activate_external_provider(text, text, text)
  from public, anon;
grant execute on function public.staff_activate_external_provider(text, text, text)
  to authenticated;

-- --- Feature flags ----------------------------------------------------------

create or replace function private.set_feature_flag_core(
  p_actor_id uuid,
  p_actor_type text,
  p_principal_key text,
  p_flag_key text,
  p_environment text,
  p_enabled boolean,
  p_audience text,
  p_rollout_percentage integer,
  p_reason text,
  p_review_by date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous jsonb;
  v_next jsonb;
  v_actor uuid := case when p_actor_type = 'automation' then null else p_actor_id end;
  v_mode text := case when p_actor_type = 'automation'
    then 'development_automation' else 'staff_action' end;
  v_basis text := case when p_actor_type = 'automation'
    then 'owner_approved_development_policy' else 'staff_authorisation' end;
begin
  if p_environment not in ('local', 'development', 'staging', 'production') then
    raise exception 'Invalid environment' using errcode = '22023';
  end if;
  if p_environment <> private.platform_environment() then
    raise exception 'Feature flags must target the current platform environment'
      using errcode = '42501';
  end if;
  if p_actor_type = 'automation' and p_environment <> 'development' then
    raise exception 'Automation governance is available in development only'
      using errcode = '42501';
  end if;
  if coalesce(p_audience, 'none') not in ('none', 'staff', 'customer', 'worker', 'all') then
    raise exception 'Invalid flag audience' using errcode = '22023';
  end if;
  if coalesce(p_rollout_percentage, 0) not between 0 and 100 then
    raise exception 'Invalid rollout percentage' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select pg_catalog.to_jsonb(f) into v_previous
  from private.staff_feature_flags f
  where f.flag_key = p_flag_key and f.environment = p_environment;
  if v_previous is null then
    raise exception 'Unknown feature flag' using errcode = '22023';
  end if;
  update private.staff_feature_flags
  set enabled = coalesce(p_enabled, false),
      audience = case when coalesce(p_enabled, false) then coalesce(p_audience, 'none') else 'none' end,
      rollout_percentage = case when coalesce(p_enabled, false) then coalesce(p_rollout_percentage, 0) else 0 end,
      reason = pg_catalog.btrim(p_reason),
      review_by = p_review_by,
      -- Left untouched by automation: an owner is a person who answers for a
      -- flag, and a machine is not that.
      owner_id = coalesce(owner_id, v_actor),
      updated_at = pg_catalog.now(),
      updated_by = v_actor
  where flag_key = p_flag_key and environment = p_environment;
  select pg_catalog.to_jsonb(f) into v_next
  from private.staff_feature_flags f
  where f.flag_key = p_flag_key and f.environment = p_environment;
  insert into private.staff_feature_flag_history(
    flag_key, environment, previous_state, next_state, reason, changed_by)
  values (
    p_flag_key, p_environment, v_previous, v_next,
    pg_catalog.btrim(p_reason), v_actor);
  perform private.record_governed_audit(
    p_actor_id, p_actor_type, p_principal_key,
    'manage_feature_flags', 'feature_flag_changed',
    'staff_feature_flag', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'flagKey', p_flag_key,
      'environment', p_environment,
      'enabled', coalesce(p_enabled, false)),
    v_mode, v_basis);
  return pg_catalog.jsonb_build_object(
    'flagKey', p_flag_key,
    'environment', p_environment,
    'enabled', coalesce(p_enabled, false),
    'actorType', p_actor_type,
    'governanceMode', v_mode);
end;
$$;

revoke all on function private.set_feature_flag_core(
  uuid, text, text, text, text, boolean, text, integer, text, date)
  from public, anon, authenticated;

create or replace function public.staff_set_feature_flag(
  p_flag_key text,
  p_environment text,
  p_enabled boolean,
  p_audience text,
  p_rollout_percentage integer,
  p_reason text,
  p_review_by date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_staff_capability('manage_feature_flags');
begin
  return private.set_feature_flag_core(
    v_actor, 'human', null, p_flag_key, p_environment, p_enabled,
    p_audience, p_rollout_percentage, p_reason, p_review_by);
end;
$$;

revoke all on function public.staff_set_feature_flag(
  text, text, boolean, text, integer, text, date) from public, anon;
grant execute on function public.staff_set_feature_flag(
  text, text, boolean, text, integer, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. THE AUTOMATION ENTRY POINTS
-- ---------------------------------------------------------------------------
--
-- All in `private`, all granted to `service_role` only. The only thing holding
-- a service role is an Edge Function, and the Edge Function in front of these
-- checks a bearer token that exists nowhere but that function's own secrets.
-- `anon` and `authenticated` cannot reach any of it, so no browser, worker,
-- customer or ordinary staff account can call it however the request is shaped.

create or replace function private.automation_activate_external_provider(
  p_principal_key text,
  p_provider_key text,
  p_expected_environment text,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_principal private.automation_principals%rowtype;
begin
  v_principal := private.require_automation_capability(
    p_principal_key, 'manage_subprocessors');
  return private.activate_external_provider_core(
    null, 'automation', v_principal.principal_key,
    p_provider_key, p_expected_environment, p_reason);
end;
$$;

create or replace function private.automation_set_feature_flag(
  p_principal_key text,
  p_flag_key text,
  p_environment text,
  p_enabled boolean,
  p_audience text,
  p_rollout_percentage integer,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_principal private.automation_principals%rowtype;
begin
  v_principal := private.require_automation_capability(
    p_principal_key, 'manage_feature_flags');
  return private.set_feature_flag_core(
    null, 'automation', v_principal.principal_key,
    p_flag_key, p_environment, p_enabled, p_audience, p_rollout_percentage,
    p_reason, null);
end;
$$;

-- The narrow kill-switch path.
--
-- `staff_set_kill_switch` also operates domain configuration for four switches:
-- it disables payment methods, puts payments into maintenance, stops payouts
-- and closes the marketplace, and restores the recorded prior state on the way
-- back. Those are decisions about money and about live work in progress, and
-- automation is not given them. The refusal is by name and explicit, so adding
-- a fifth domain switch later does not silently widen what automation may do.
create or replace function private.automation_set_kill_switch(
  p_principal_key text,
  p_switch_key text,
  p_active boolean,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_principal private.automation_principals%rowtype;
  v_switch private.staff_kill_switches%rowtype;
begin
  v_principal := private.require_automation_capability(
    p_principal_key, 'manage_kill_switches');
  if p_switch_key in (
    'online_payment_methods', 'payments_maintenance', 'payouts',
    'new_marketplace_requests') then
    raise exception 'That kill switch operates domain configuration and is human-only'
      using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select * into v_switch from private.staff_kill_switches s
  where s.switch_key = p_switch_key for update;
  if v_switch.switch_key is null then
    raise exception 'Unknown kill switch' using errcode = '22023';
  end if;
  if v_switch.active = coalesce(p_active, false) then
    return pg_catalog.jsonb_build_object(
      'switchKey', p_switch_key, 'active', v_switch.active, 'duplicate', true);
  end if;
  update private.staff_kill_switches
  set active = coalesce(p_active, false),
      reason = pg_catalog.btrim(p_reason),
      -- The `_by` columns reference people and stay NULL. The audit row is
      -- where this action is attributed, and it names the principal.
      activated_at = case when coalesce(p_active, false)
        then pg_catalog.now() else activated_at end,
      cleared_at = case when coalesce(p_active, false)
        then cleared_at else pg_catalog.now() end,
      updated_at = pg_catalog.now()
  where switch_key = p_switch_key;
  perform private.record_governed_audit(
    null, 'automation', v_principal.principal_key,
    'manage_kill_switches', 'kill_switch_changed',
    'staff_kill_switch', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'switchKey', p_switch_key,
      'active', coalesce(p_active, false),
      'environment', private.platform_environment()),
    'development_automation', 'owner_approved_development_policy');
  return pg_catalog.jsonb_build_object(
    'switchKey', p_switch_key,
    'active', coalesce(p_active, false),
    'duplicate', false,
    'actorType', 'automation');
end;
$$;

create or replace function private.automation_record_processing_basis_review(
  p_principal_key text,
  p_activity_key text,
  p_status text,
  p_basis text,
  p_note text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_principal private.automation_principals%rowtype;
  v_activity private.processing_activities%rowtype;
  v_basis text;
begin
  v_principal := private.require_automation_capability(
    p_principal_key, 'review_legal_governance');
  if p_status not in ('pending', 'in_review', 'approved', 'rejected') then
    raise exception 'Unknown legal review status' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_note, ''))) not between 10 and 2000 then
    raise exception 'A review note is required' using errcode = '22023';
  end if;
  select * into v_activity from private.processing_activities a
  where a.activity_key = p_activity_key for update;
  if v_activity.activity_key is null then
    raise exception 'Unknown processing activity' using errcode = '22023';
  end if;
  v_basis := pg_catalog.btrim(coalesce(p_basis, ''));
  if v_basis = '' then v_basis := v_activity.proposed_basis; end if;
  if pg_catalog.length(v_basis) not between 10 and 1000 then
    raise exception 'A lawful basis is required' using errcode = '22023';
  end if;

  update private.processing_activities
  set legal_review_status = p_status,
      proposed_basis = v_basis,
      legal_review_note = pg_catalog.btrim(p_note),
      legal_reviewed_at = pg_catalog.now(),
      -- Never a person. The reviewer column records who reviewed, and no human
      -- reviewed this; the audit row carries the truthful attribution instead.
      legal_reviewed_by = null
  where activity_key = p_activity_key;

  perform private.record_governed_audit(
    null, 'automation', v_principal.principal_key,
    'review_legal_governance', 'processing_basis_reviewed',
    'processing_activity', null, pg_catalog.btrim(p_note),
    pg_catalog.jsonb_build_object(
      'activityKey', p_activity_key,
      'environment', private.platform_environment(),
      'fromStatus', v_activity.legal_review_status,
      'toStatus', p_status),
    'development_automation', 'owner_approved_development_policy');

  return pg_catalog.jsonb_build_object(
    'activityKey', p_activity_key,
    'reviewStatus', p_status,
    'basis', v_basis,
    'actorType', 'automation',
    'governanceMode', 'development_automation');
end;
$$;

create or replace function private.automation_record_subprocessor_agreement(
  p_principal_key text,
  p_subprocessor_key text,
  p_status text,
  p_reference text,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_principal private.automation_principals%rowtype;
  v_row private.subprocessors%rowtype;
  v_reference text := pg_catalog.btrim(coalesce(p_reference, ''));
begin
  v_principal := private.require_automation_capability(
    p_principal_key, 'manage_subprocessors');
  -- Automation may record what is already true. It may not record a signature:
  -- `signed` asserts that somebody executed a document, and nothing automation
  -- can observe establishes that. A person records that one.
  if p_status = 'signed' then
    raise exception 'Automation cannot record an executed signature'
      using errcode = '42501';
  end if;
  if p_status not in ('incorporated', 'pending', 'not_required', 'not_started') then
    raise exception 'Unknown agreement status' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if p_status = 'incorporated'
     and pg_catalog.length(v_reference) not between 10 and 500 then
    raise exception 'An agreement reference is required to record a contract in force'
      using errcode = '22023';
  end if;
  select * into v_row from private.subprocessors s
  where s.subprocessor_key = p_subprocessor_key for update;
  if v_row.subprocessor_key is null then
    raise exception 'Unknown subprocessor' using errcode = '22023';
  end if;

  update private.subprocessors
  set agreement_status = p_status,
      agreement_reference = nullif(v_reference, ''),
      agreement_recorded_at = pg_catalog.now(),
      agreement_recorded_by = null
  where subprocessor_key = p_subprocessor_key;

  perform private.record_governed_audit(
    null, 'automation', v_principal.principal_key,
    'manage_subprocessors', 'subprocessor_agreement_recorded',
    'subprocessor', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'subprocessorKey', p_subprocessor_key,
      'environment', private.platform_environment(),
      'fromStatus', v_row.agreement_status,
      'toStatus', p_status),
    'development_automation', 'owner_approved_development_policy');

  return pg_catalog.jsonb_build_object(
    'subprocessorKey', p_subprocessor_key,
    'agreementStatus', p_status,
    'actorType', 'automation',
    'governanceMode', 'development_automation');
end;
$$;

-- Deactivation. The counterpart of activation, and deliberately simpler: taking
-- a provider out of service is a restriction, and a restriction must never be
-- harder to reach than the thing it restricts.
create or replace function private.automation_deactivate_external_provider(
  p_principal_key text,
  p_provider_key text,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_principal private.automation_principals%rowtype;
  v_provider private.external_providers%rowtype;
  v_from_status text;
begin
  v_principal := private.require_automation_capability(
    p_principal_key, 'manage_subprocessors');
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select * into v_provider from private.external_providers p
  where p.provider_key = p_provider_key for update;
  if v_provider.provider_key is null then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;
  if v_provider.current_status <> 'active' then
    return pg_catalog.jsonb_build_object(
      'providerKey', p_provider_key, 'status', v_provider.current_status,
      'duplicate', true);
  end if;
  v_from_status := v_provider.current_status;
  update private.external_providers
  set current_status = 'configured_not_enabled'
  where provider_key = p_provider_key;
  insert into private.external_provider_events(
    provider_key, event_type, from_status, to_status, actor_id, reason)
  values (
    p_provider_key, 'disabled', v_from_status, 'configured_not_enabled', null,
    pg_catalog.btrim(p_reason));
  perform private.record_governed_audit(
    null, 'automation', v_principal.principal_key,
    'manage_subprocessors', 'external_provider_deactivated',
    'external_provider', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'providerKey', p_provider_key,
      'environment', private.platform_environment(),
      'fromStatus', v_from_status,
      'toStatus', 'configured_not_enabled'),
    'development_automation', 'owner_approved_development_policy');
  return pg_catalog.jsonb_build_object(
    'providerKey', p_provider_key,
    'status', 'configured_not_enabled',
    'duplicate', false,
    'actorType', 'automation');
end;
$$;

-- Read-only state, so automation can verify what it did without reading tables
-- directly and without a second privileged path existing for the purpose.
create or replace function private.automation_governance_state(
  p_principal_key text
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_principal private.automation_principals%rowtype;
begin
  v_principal := private.require_automation_capability(
    p_principal_key, 'review_legal_governance');
  return pg_catalog.jsonb_build_object(
    'environment', private.platform_environment(),
    'principal', pg_catalog.jsonb_build_object(
      'key', v_principal.principal_key,
      'displayName', v_principal.display_name,
      'environment', v_principal.environment,
      'capabilities', pg_catalog.to_jsonb(v_principal.capabilities),
      'authorizationBasis', v_principal.authorization_basis,
      'policyVersion', v_principal.authorization_policy_version),
    'providers', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'providerKey', p.provider_key,
        'status', p.current_status,
        'environments', pg_catalog.to_jsonb(p.environments),
        'featureFlag', p.feature_flag_key,
        'killSwitch', p.kill_switch_key,
        'enabled', private.provider_enabled(p.provider_key)) order by p.provider_key), '[]'::jsonb)
      from private.external_providers p),
    'flags', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'flagKey', f.flag_key, 'enabled', f.enabled,
        'audience', f.audience) order by f.flag_key), '[]'::jsonb)
      from private.staff_feature_flags f
      where f.environment = private.platform_environment()),
    'killSwitches', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'switchKey', k.switch_key, 'active', k.active) order by k.switch_key), '[]'::jsonb)
      from private.staff_kill_switches k),
    'subprocessors', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', s.subprocessor_key, 'status', s.integration_status,
        'agreementStatus', s.agreement_status,
        'agreementReference', s.agreement_reference,
        'trainingProhibited', s.training_prohibited) order by s.subprocessor_key), '[]'::jsonb)
      from private.subprocessors s),
    'processingActivities', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', a.activity_key, 'reviewStatus', a.legal_review_status) order by a.activity_key), '[]'::jsonb)
      from private.processing_activities a),
    'generatedAt', pg_catalog.now());
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. GRANTS: SERVICE ROLE ONLY, AND NEVER A BROWSER
-- ---------------------------------------------------------------------------

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'private.automation_activate_external_provider(text, text, text, text)',
    'private.automation_deactivate_external_provider(text, text, text)',
    'private.automation_set_feature_flag(text, text, text, boolean, text, integer, text)',
    'private.automation_set_kill_switch(text, text, boolean, text)',
    'private.automation_record_processing_basis_review(text, text, text, text, text)',
    'private.automation_record_subprocessor_agreement(text, text, text, text, text)',
    'private.automation_governance_state(text)'
  ]
  loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated', v_signature);
    execute pg_catalog.format(
      'grant execute on function %s to service_role', v_signature);
  end loop;
end $$;

comment on function private.automation_activate_external_provider(text, text, text, text) is
  'Development-only provider activation by an automation principal. Runs the '
  'identical prerequisite core as the staff path and records actor_type '
  'automation with no human attribution.';

-- The Edge Function reads the environment before it dispatches, so the service
-- role needs this one existing helper explicitly rather than by inheritance.
grant execute on function private.platform_environment() to service_role;
