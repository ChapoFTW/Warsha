-- WPS-024/WPS-025 governance correction.
--
-- `development` already exists in the platform environment model, but several
-- downstream ledgers and provider controls still accepted only local, staging
-- and production. That made the permanent hosted development project inherit
-- the local Docker state and made a truthful environment binding unusable.
--
-- This migration makes development a first-class operational environment,
-- adds an audited one-time project binding authority, and adds the missing
-- dual-controlled provider activation authority. It deliberately does NOT:
--   * bind any database automatically (a clean local reset must remain local);
--   * activate any provider;
--   * enable any feature flag or clear any kill switch;
--   * publish legal text or claim that privacy approval exists.

-- ---------------------------------------------------------------------------
-- 1. DEVELOPMENT IS A REAL OPERATIONAL ENVIRONMENT
-- ---------------------------------------------------------------------------

alter table private.staff_configuration_versions
  drop constraint if exists staff_configuration_versions_env_check;
alter table private.staff_configuration_versions
  add constraint staff_configuration_versions_env_check
  check (environment in ('local', 'development', 'staging', 'production'));

alter table private.staff_feature_flags
  drop constraint if exists staff_feature_flags_env_check;
alter table private.staff_feature_flags
  add constraint staff_feature_flags_env_check
  check (environment in ('local', 'development', 'staging', 'production'));

alter table public.privacy_consent_records
  drop constraint if exists privacy_consent_records_environment_check;
alter table public.privacy_consent_records
  add constraint privacy_consent_records_environment_check
  check (environment = any (array['local', 'development', 'staging', 'production']));

alter table public.legal_acceptances
  drop constraint if exists legal_acceptances_environment_check;
alter table public.legal_acceptances
  add constraint legal_acceptances_environment_check
  check (environment in ('local', 'development', 'staging', 'production'));

alter table private.ocr_requests
  drop constraint if exists ocr_requests_environment_check;
alter table private.ocr_requests
  add constraint ocr_requests_environment_check
  check (environment in ('local', 'development', 'staging', 'production'));

alter table private.ocr_accuracy_runs
  drop constraint if exists ocr_accuracy_runs_environment_check;
alter table private.ocr_accuracy_runs
  add constraint ocr_accuracy_runs_environment_check
  check (environment in ('local', 'development', 'staging'));

alter table private.provider_health_samples
  drop constraint if exists provider_health_samples_environment_check;
alter table private.provider_health_samples
  add constraint provider_health_samples_environment_check
  check (environment in ('local', 'development', 'staging', 'production'));

-- These two WPS-021 records derive their environment from
-- private.platform_environment(). Without development in their allowlists the
-- hosted development project would fail at insert time after being bound.
alter table public.referral_programs
  drop constraint if exists referral_programs_env_check;
alter table public.referral_programs
  add constraint referral_programs_env_check
  check (environment in ('local', 'development', 'staging', 'production'));

alter table public.growth_campaigns
  drop constraint if exists growth_campaigns_env_check;
alter table public.growth_campaigns
  add constraint growth_campaigns_env_check
  check (environment in ('local', 'development', 'staging', 'production'));

-- The development state exists but stays off. A migration prepares authority;
-- it never makes an external call possible.
insert into private.staff_feature_flags
  (flag_key, environment, enabled, rollout_percentage, audience, reason, is_kill_switch)
values
  ('location_provider', 'development', false, 0, 'none',
   'Google Maps remains disabled in hosted development until material privacy approval, '
   || 'dual-controlled provider activation and an observed health check are complete.', false)
on conflict (flag_key, environment) do nothing;

-- Google Maps is the provider being prepared for hosted development. Vision is
-- intentionally untouched: this task grants no OCR credential or activation.
update private.external_providers
set environments = pg_catalog.array_append(environments, 'development')
where provider_key = 'google_maps_platform'
  and not ('development' = any(environments));

-- ---------------------------------------------------------------------------
-- 2. AUDITED, ONE-TIME PLATFORM PROJECT BINDING
-- ---------------------------------------------------------------------------

-- Preserve the existing immutable environment event, but let the supported
-- staff authority supply the actual reviewed reason. Direct owner changes still
-- receive the conservative fallback reason.
create or replace function private.record_platform_environment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(
    pg_catalog.current_setting('warsha.environment_change_reason', true), '');
begin
  if new.environment is distinct from old.environment
     or new.launch_phase is distinct from old.launch_phase then
    insert into private.platform_environment_events(
      from_environment, to_environment, from_launch_phase, to_launch_phase,
      project_ref, reason, actor_id)
    values (
      old.environment, new.environment, old.launch_phase, new.launch_phase,
      new.expected_project_ref,
      coalesce(v_reason, 'Platform environment or launch phase changed'),
      (select auth.uid()));
  end if;
  return new;
end;
$$;

revoke all on function private.record_platform_environment_change()
  from public, anon, authenticated;

-- A hosted project is born with the local bootstrap row because migrations
-- must also replay in Docker. Binding is therefore an explicit, authenticated,
-- reauthenticated operation. It may bind only an unbound local bootstrap to a
-- non-production hosted environment; it cannot relabel an already-bound project
-- or create a shortcut into production.
create or replace function public.staff_bind_platform_environment(
  p_expected_current_environment text,
  p_target_environment text,
  p_expected_project_ref text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('manage_feature_flags');
  v_config private.staff_platform_configuration%rowtype;
begin
  if p_expected_current_environment not in ('local', 'development', 'staging', 'production') then
    raise exception 'Invalid expected environment' using errcode = '22023';
  end if;
  if p_target_environment not in ('development', 'staging') then
    raise exception 'Only a non-production hosted environment can be bound here'
      using errcode = '22023';
  end if;
  if coalesce(p_expected_project_ref, '') !~ '^[a-z]{20}$' then
    raise exception 'A valid Supabase project ref is required' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'A binding reason is required' using errcode = '22023';
  end if;

  select * into v_config
  from private.staff_platform_configuration c
  where c.singleton
  for update;

  if v_config.environment = p_target_environment
     and v_config.expected_project_ref = p_expected_project_ref then
    return pg_catalog.jsonb_build_object(
      'environment', v_config.environment,
      'expectedProjectRef', v_config.expected_project_ref,
      'duplicate', true);
  end if;

  if v_config.environment <> p_expected_current_environment then
    raise exception 'Platform environment changed before binding' using errcode = '40001';
  end if;
  if v_config.environment <> 'local' or v_config.expected_project_ref is not null then
    raise exception 'This platform project is already bound' using errcode = '42501';
  end if;

  perform pg_catalog.set_config(
    'warsha.environment_change_reason', pg_catalog.btrim(p_reason), true);

  update private.staff_platform_configuration
  set environment = p_target_environment,
      expected_project_ref = p_expected_project_ref,
      updated_at = pg_catalog.now(),
      updated_by = v_actor
  where singleton;

  perform private.record_staff_audit(
    v_actor, 'manage_feature_flags', 'platform_environment_bound',
    'staff_platform_configuration', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'fromEnvironment', v_config.environment,
      'toEnvironment', p_target_environment,
      'expectedProjectRef', p_expected_project_ref));

  return pg_catalog.jsonb_build_object(
    'environment', p_target_environment,
    'expectedProjectRef', p_expected_project_ref,
    'duplicate', false);
end;
$$;

comment on function public.staff_bind_platform_environment(text, text, text, text) is
  'Bind an unbound local bootstrap to its permanent hosted development or staging project. Never binds production.';

revoke all on function public.staff_bind_platform_environment(text, text, text, text)
  from public, anon;
grant execute on function public.staff_bind_platform_environment(text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. ENVIRONMENT-SCOPED CONFIGURATION AND FEATURE-FLAG AUTHORITIES
-- ---------------------------------------------------------------------------

create or replace function public.staff_create_configuration_draft(
  p_domain_key text, p_environment text, p_payload jsonb, p_change_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_domain private.staff_configuration_domains%rowtype;
  v_version integer;
  v_id uuid;
begin
  select * into v_domain
  from private.staff_configuration_domains d
  where d.domain_key = p_domain_key;
  if v_domain.domain_key is null then
    raise exception 'Unknown configuration domain' using errcode = '22023';
  end if;
  v_actor := private.require_staff_capability(v_domain.capability_key);
  if p_environment not in ('local', 'development', 'staging', 'production') then
    raise exception 'Invalid environment' using errcode = '22023';
  end if;
  if p_environment <> private.platform_environment() then
    raise exception 'Configuration must target the current platform environment'
      using errcode = '42501';
  end if;
  if not private.staff_configuration_payload_valid(p_domain_key, p_payload) then
    raise exception 'Configuration payload failed validation' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.max(v.version), 0) + 1 into v_version
  from private.staff_configuration_versions v
  where v.domain_key = p_domain_key and v.environment = p_environment;
  insert into private.staff_configuration_versions(
    domain_key, environment, version, payload, status, change_reason, created_by)
  values (
    p_domain_key, p_environment, v_version, p_payload, 'draft',
    pg_catalog.btrim(p_change_reason), v_actor)
  returning id into v_id;
  perform private.record_staff_audit(
    v_actor, v_domain.capability_key, 'configuration_draft_created',
    'staff_configuration_version', v_id, pg_catalog.btrim(p_change_reason),
    pg_catalog.jsonb_build_object(
      'domainKey', p_domain_key, 'environment', p_environment, 'version', v_version));
  return pg_catalog.jsonb_build_object('id', v_id, 'version', v_version, 'status', 'draft');
end;
$$;

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
declare
  v_actor uuid;
  v_previous jsonb;
  v_next jsonb;
begin
  v_actor := private.require_staff_capability('manage_feature_flags');
  if p_environment not in ('local', 'development', 'staging', 'production') then
    raise exception 'Invalid environment' using errcode = '22023';
  end if;
  if p_environment <> private.platform_environment() then
    raise exception 'Feature flags must target the current platform environment'
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
  perform private.record_staff_audit(
    v_actor, 'manage_feature_flags', 'feature_flag_changed',
    'staff_feature_flag', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'flagKey', p_flag_key,
      'environment', p_environment,
      'enabled', coalesce(p_enabled, false)));
  return pg_catalog.jsonb_build_object(
    'flagKey', p_flag_key,
    'environment', p_environment,
    'enabled', coalesce(p_enabled, false));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. PROVIDER ENVIRONMENT COMPATIBILITY
-- ---------------------------------------------------------------------------

create or replace function private.provider_enabled(p_provider_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.current_status = 'active'
      and private.platform_environment() = any(p.environments)
      and not exists (
        select 1 from private.staff_kill_switches k
        where k.switch_key = p.kill_switch_key and k.active)
      and (
        p.feature_flag_key is null
        or exists (
          select 1 from private.staff_feature_flags f
          where f.flag_key = p.feature_flag_key
            and f.environment = private.platform_environment()
            and f.enabled)
      )
    from private.external_providers p
    where p.provider_key = p_provider_key
  ), false)
$$;

comment on function private.provider_enabled(text) is
  'Single provider gate: registry status, environment compatibility, feature flag and kill switch must all agree.';

revoke all on function private.provider_enabled(text)
  from public, anon, authenticated;

create or replace function private.provider_for_role(p_role text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.provider_key
  from private.external_providers p
  where p.capability_role = p_role
    and p.current_status <> 'retired'
    and private.platform_environment() = any(p.environments)
  order by (p.current_status = 'active') desc, p.provider_key
  limit 1
$$;

comment on function private.provider_for_role(text) is
  'Provider filling a capability role in the current environment, live or disabled.';

revoke all on function private.provider_for_role(text)
  from public, anon, authenticated;

-- A dual-control approval belongs to the environment where it was requested.
-- This closes the cross-environment replay gap for the protected operations
-- below without changing the public request/approve signatures.
create or replace function private.consume_dual_control(
  p_capability text,
  p_action_key text,
  p_subject_ref text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_enabled boolean;
  v_row private.staff_dual_control_requests%rowtype;
begin
  select c.dual_control_enabled into v_enabled
  from private.staff_platform_configuration c
  where c.singleton;
  if not coalesce(v_enabled, false) then
    return false;
  end if;
  select * into v_row
  from private.staff_dual_control_requests r
  where r.capability_key = p_capability
    and r.action_key = p_action_key
    and r.subject_ref = p_subject_ref
    and r.requested_by = v_uid
    and r.environment = private.platform_environment()
  for update;
  if v_row.id is null then
    raise exception 'This action requires a second approver' using errcode = '42501';
  end if;
  if v_row.approved_by is null then
    raise exception 'This action is waiting for a second approver' using errcode = '42501';
  end if;
  if v_row.consumed_at is not null then
    raise exception 'That approval was already used' using errcode = '42501';
  end if;
  if v_row.expires_at <= pg_catalog.now() then
    raise exception 'That approval expired' using errcode = '42501';
  end if;
  update private.staff_dual_control_requests
  set consumed_at = pg_catalog.now()
  where id = v_row.id;
  return true;
end;
$$;

revoke all on function private.consume_dual_control(text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. DUAL-CONTROLLED PROVIDER ACTIVATION
-- ---------------------------------------------------------------------------

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
declare
  v_actor uuid := private.require_staff_capability('manage_subprocessors');
  v_config private.staff_platform_configuration%rowtype;
  v_provider private.external_providers%rowtype;
  v_from_status text;
  v_subject text;
  v_approval_id uuid;
  v_consumed boolean;
  v_flag_enabled boolean := false;
  v_kill_switch_active boolean := false;
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
  select r.id into v_approval_id
  from private.staff_dual_control_requests r
  where r.capability_key = 'manage_subprocessors'
    and r.action_key = 'activate_external_provider'
    and r.subject_ref = v_subject
    and r.requested_by = v_actor
    and r.environment = v_config.environment;

  v_consumed := private.consume_dual_control(
    'manage_subprocessors', 'activate_external_provider', v_subject);
  if not v_consumed then
    raise exception 'Provider activation always requires dual control'
      using errcode = '42501';
  end if;

  v_from_status := v_provider.current_status;
  update private.external_providers
  set current_status = 'active'
  where provider_key = v_provider.provider_key
    and current_status = v_from_status;

  insert into private.external_provider_events(
    provider_key, event_type, from_status, to_status, actor_id, reason)
  values (
    v_provider.provider_key, 'enabled', v_from_status, 'active', v_actor,
    pg_catalog.btrim(p_reason));

  perform private.record_staff_audit(
    v_actor, 'manage_subprocessors', 'external_provider_activated',
    'external_provider', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'providerKey', v_provider.provider_key,
      'environment', v_config.environment,
      'fromStatus', v_from_status,
      'toStatus', 'active',
      'dualControlRequestId', v_approval_id));

  return pg_catalog.jsonb_build_object(
    'providerKey', v_provider.provider_key,
    'environment', v_config.environment,
    'status', 'active',
    'featureFlagEnabled', v_flag_enabled,
    'killSwitchActive', v_kill_switch_active,
    'enabled', private.provider_enabled(v_provider.provider_key),
    'dualControlRequestId', v_approval_id);
end;
$$;

comment on function public.staff_activate_external_provider(text, text, text) is
  'Dual-controlled registry activation. Does not enable a feature flag, alter a kill switch, publish legal text or accept a credential value.';

revoke all on function public.staff_activate_external_provider(text, text, text)
  from public, anon;
grant execute on function public.staff_activate_external_provider(text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. MATERIAL LEGAL PUBLICATION CONSUMES ITS EXACT APPROVAL
-- ---------------------------------------------------------------------------

create or replace function public.staff_publish_legal_version(
  p_document_key text,
  p_version text,
  p_content_hash_en text,
  p_content_hash_ar text,
  p_change_class text,
  p_change_summary_en text,
  p_change_summary_ar text,
  p_effective_at date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('publish_legal_version');
  v_previous public.legal_document_versions;
  v_document public.legal_documents;
  v_subject text;
  v_approval_id uuid;
  v_consumed boolean;
begin
  select * into v_document
  from public.legal_documents d
  where d.document_key = p_document_key;
  if v_document.document_key is null then
    raise exception 'Unknown legal document' using errcode = '22023';
  end if;
  if p_version !~ '^[0-9]+\.[0-9]+$' then
    raise exception 'A version must be major.minor' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.legal_document_versions v
    where v.document_key = p_document_key and v.version = p_version) then
    raise exception 'That version already exists' using errcode = '22023';
  end if;
  if p_change_class not in ('editorial', 'non_material', 'material', 'urgent') then
    raise exception 'Unknown change class' using errcode = '22023';
  end if;
  if p_effective_at < current_date then
    raise exception 'A version cannot take effect in the past' using errcode = '22023';
  end if;
  if p_change_class in ('material', 'urgent')
     and pg_catalog.length(pg_catalog.btrim(coalesce(p_change_summary_en, ''))) < 20 then
    raise exception 'A material change requires a change summary' using errcode = '22023';
  end if;

  select * into v_previous from private.legal_current_version(p_document_key);
  if v_previous.document_key is null then
    raise exception 'No published version exists to supersede' using errcode = '22023';
  end if;

  if p_change_class in ('material', 'urgent') then
    v_subject := p_document_key || ':' || p_version || ':' || private.platform_environment();
    select r.id into v_approval_id
    from private.staff_dual_control_requests r
    where r.capability_key = 'publish_legal_version'
      and r.action_key = 'publish_legal_version'
      and r.subject_ref = v_subject
      and r.requested_by = v_actor
      and r.environment = private.platform_environment();

    v_consumed := private.consume_dual_control(
      'publish_legal_version', 'publish_legal_version', v_subject);
    if not v_consumed then
      raise exception 'Material or urgent legal publication requires dual control'
        using errcode = '42501';
    end if;
  end if;

  insert into public.legal_document_versions(
    document_key, version, content_hash_en, content_hash_ar, content_locator,
    published_at, effective_at, supersedes_version, change_class,
    change_summary_en, change_summary_ar, arabic_is_summary, status)
  values (
    p_document_key, p_version, p_content_hash_en, p_content_hash_ar,
    'src/legal/legal-corpus.ts', current_date, p_effective_at, v_previous.version,
    p_change_class, p_change_summary_en, p_change_summary_ar,
    v_previous.arabic_is_summary, 'draft');

  update public.legal_document_versions
  set status = 'superseded'
  where document_key = p_document_key and version = v_previous.version;

  update public.legal_document_versions
  set status = 'published'
  where document_key = p_document_key and version = p_version;

  insert into private.legal_version_events(
    document_key, version, event_type, actor_id, reason)
  values
    (p_document_key, v_previous.version, 'superseded', v_actor,
     'Superseded by ' || p_version),
    (p_document_key, p_version, 'published', v_actor, pg_catalog.btrim(p_reason));

  perform private.record_staff_audit(
    v_actor, 'publish_legal_version', 'publish', 'legal_document', null,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'documentKey', p_document_key,
      'version', p_version,
      'changeClass', p_change_class,
      'supersedes', v_previous.version,
      'dualControlRequestId', v_approval_id));

  return pg_catalog.jsonb_build_object(
    'documentKey', p_document_key,
    'version', p_version,
    'supersedes', v_previous.version,
    'changeClass', p_change_class,
    'effectiveAt', p_effective_at,
    'forcesReconsent', p_change_class in ('material', 'urgent'),
    'dualControlRequestId', v_approval_id);
end;
$$;

comment on function public.staff_publish_legal_version(text, text, text, text, text, text, text, date, text) is
  'Publish one immutable legal version after consuming approval bound to document, version and environment.';

revoke all on function public.staff_publish_legal_version(text, text, text, text, text, text, text, date, text)
  from public;
grant execute on function public.staff_publish_legal_version(text, text, text, text, text, text, text, date, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7. SUBPROCESSOR PROMOTION CONSUMES ITS OWN MATERIAL-CHANGE APPROVAL
-- ---------------------------------------------------------------------------

create or replace function public.staff_sync_provider_status(
  p_provider_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('manage_subprocessors');
  v_provider private.external_providers;
  v_enabled boolean;
  v_target text;
  v_current text;
  v_subject text;
  v_approval_id uuid;
  v_consumed boolean;
begin
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'A provider reconciliation reason is required' using errcode = '22023';
  end if;
  select * into v_provider
  from private.external_providers p
  where p.provider_key = p_provider_key;
  if v_provider.provider_key is null then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;

  v_enabled := private.provider_enabled(p_provider_key);
  v_target := case when v_enabled then 'in_use' else 'approved_not_integrated' end;

  if v_provider.subprocessor_key is not null then
    select s.integration_status into v_current
    from private.subprocessors s
    where s.subprocessor_key = v_provider.subprocessor_key
    for update;
    if v_current = 'retired' then
      raise exception 'A retired subprocessor cannot be reconciled' using errcode = '42501';
    end if;

    -- Promotion means personal data may now reach the supplier. Demotion is a
    -- restriction and must remain immediately available during an incident.
    if v_target = 'in_use' and v_current is distinct from 'in_use' then
      v_subject := p_provider_key || ':' || private.platform_environment() || ':in_use';
      select r.id into v_approval_id
      from private.staff_dual_control_requests r
      where r.capability_key = 'manage_subprocessors'
        and r.action_key = 'sync_subprocessor_in_use'
        and r.subject_ref = v_subject
        and r.requested_by = v_actor
        and r.environment = private.platform_environment();
      v_consumed := private.consume_dual_control(
        'manage_subprocessors', 'sync_subprocessor_in_use', v_subject);
      if not v_consumed then
        raise exception 'Subprocessor promotion always requires dual control'
          using errcode = '42501';
      end if;
    end if;

    update private.subprocessors
    set integration_status = v_target
    where subprocessor_key = v_provider.subprocessor_key
      and integration_status <> 'retired';
  end if;

  insert into private.external_provider_events(
    provider_key, event_type, from_status, to_status, actor_id, reason)
  values (
    p_provider_key, 'reviewed', v_provider.current_status, v_provider.current_status,
    v_actor, pg_catalog.btrim(p_reason));

  perform private.record_staff_audit(
    v_actor, 'manage_subprocessors', 'sync_provider_status',
    'external_provider', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'providerKey', p_provider_key,
      'environment', private.platform_environment(),
      'subprocessorStatus', v_target,
      'dualControlRequestId', v_approval_id));

  return pg_catalog.jsonb_build_object(
    'providerKey', p_provider_key,
    'enabled', v_enabled,
    'subprocessorStatus', v_target,
    'dualControlRequestId', v_approval_id);
end;
$$;

comment on function public.staff_sync_provider_status(text, text) is
  'Reconcile the subprocessor register; promotion to in_use consumes an exact dual-control approval.';

revoke all on function public.staff_sync_provider_status(text, text) from public;
grant execute on function public.staff_sync_provider_status(text, text) to authenticated;
