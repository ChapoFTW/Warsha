-- ===========================================================================
-- WPS-024 — PROVIDER ABSTRACTION AND HEALTH
-- ===========================================================================
--
-- Two changes, and they are the same change seen from two ends.
--
-- ABSTRACTION. Before this migration `get_extraction_capability()` asked
-- `provider_enabled('google_cloud_vision')` and `get_location_capability()`
-- asked about `google_maps_platform`. Two vendor names hardcoded into business
-- logic. Building a provider interface in TypeScript while the database still
-- names the vendor would have moved the coupling rather than removed it: you
-- could write a second OCR implementation and still not switch to it without
-- editing a migration.
--
-- So the registry now records a CAPABILITY ROLE — what a provider is FOR —
-- and everything downstream asks for the role. `identity_ocr` is filled by
-- Google Cloud Vision today and by whatever fills it tomorrow, and the only
-- change required is the registry row.
--
-- HEALTH. A provider you cannot see is a provider you find out about from
-- users. Latency, timeouts, failures, retries, availability, last success and
-- version, per provider, staff-only.
--
-- What the health tables deliberately DO NOT hold: any account, any worker, any
-- document, any extracted value, any credential. Health answers "is the vendor
-- working", and every column that could answer "what did this person submit"
-- would turn an operations screen into a second route to identity data.
-- Section 3 asserts the absence as a property of the schema rather than as a
-- promise.

-- ---------------------------------------------------------------------------
-- SECTION 1. CAPABILITY ROLES
-- ---------------------------------------------------------------------------

alter table private.external_providers
  add column if not exists capability_role text,
  -- Which client-side renderer draws a map for this provider. Null for every
  -- provider that does not render one. The server-side `renderMap()` returns
  -- the same key in its descriptor, and the regression suite asserts the two
  -- agree — one duplicated string with a test across it, rather than a shared
  -- table that neither runtime could read.
  add column if not exists map_renderer_key text;

update private.external_providers set capability_role = case provider_key
  when 'google_cloud_vision'   then 'identity_ocr'
  when 'google_maps_platform'  then 'location'
  when 'expo_camera'           then 'document_capture'
  when 'expo_image_picker'     then 'document_capture'
  when 'expo_document_picker'  then 'document_capture'
  when 'supabase'              then 'platform'
  when 'expo_eas'              then 'build_delivery'
  else 'platform'
end
where capability_role is null;

update private.external_providers
set map_renderer_key = 'google_native_sdk'
where provider_key = 'google_maps_platform' and map_renderer_key is null;

alter table private.external_providers
  alter column capability_role set not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'external_providers_capability_role_check'
  ) then
    alter table private.external_providers
      add constraint external_providers_capability_role_check
      check (capability_role in ('identity_ocr', 'location', 'document_capture',
                                 'platform', 'build_delivery'));
  end if;

  -- A renderer key belongs to a provider that renders. Anything else is a
  -- registry row describing a capability it does not have.
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'external_providers_renderer_role_check'
  ) then
    alter table private.external_providers
      add constraint external_providers_renderer_role_check
      check (map_renderer_key is null or capability_role = 'location');
  end if;
end;
$$;

/**
 * At most ONE live provider per singular role.
 *
 * `identity_ocr` and `location` are singular: two active OCR providers would
 * make "which one read this document" unanswerable, and the audit trail would
 * be worthless. `document_capture` is plural on purpose — camera, image picker
 * and document picker all fill it, and a worker uses whichever their device
 * and their document allow.
 *
 * Enforced as an index rather than checked in a function, so the guarantee that
 * `provider_for_role()` is deterministic holds against any writer.
 */
create unique index if not exists external_providers_singular_role_idx
  on private.external_providers (capability_role)
  where capability_role in ('identity_ocr', 'location')
    and current_status <> 'retired';

/**
 * Which provider fills a role, live or not.
 *
 * Returns the key even when the provider is disabled, because the audit row is
 * opened BEFORE the enabled check — a refusal has to record which provider was
 * refused, or the trail says a document was processed by nobody.
 */
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
  order by (p.current_status = 'active') desc, p.provider_key
  limit 1
$$;

comment on function private.provider_for_role(text) is
  'WPS-024 which provider fills a capability role. No vendor name appears in business logic.';

revoke all on function private.provider_for_role(text) from public, anon, authenticated;

create or replace function private.provider_enabled_for_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.provider_enabled(private.provider_for_role(p_role)), false)
$$;

comment on function private.provider_enabled_for_role(text) is
  'WPS-024 may the provider filling this role be called? Registry, flag and kill switch.';

revoke all on function private.provider_enabled_for_role(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 2. CAPABILITY SURFACES, WITHOUT A VENDOR NAME
-- ---------------------------------------------------------------------------

create or replace function public.get_extraction_capability()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'available', private.provider_enabled_for_role('identity_ocr'),
    'manualEntryAlwaysAvailable', true,
    -- Stated as a fact the worker can rely on, in every state. Extraction
    -- being unavailable must never read as "you cannot continue".
    'confirmationRequired', true
  );
end;
$$;

create or replace function public.get_location_capability()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_provider text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  v_provider := private.provider_for_role('location');
  return pg_catalog.jsonb_build_object(
    'mapsAvailable', private.provider_enabled_for_role('location'),
    'searchAvailable', private.provider_enabled_for_role('location'),
    'manualPinAlwaysAvailable', true,
    'pinRequiredBeforeBooking', true,
    -- The client resolves this to a renderer. It is a KEY, never a vendor
    -- name the component branches on, so a second map provider is a new
    -- renderer registration and a registry update.
    'mapRendererKey', (
      select p.map_renderer_key from private.external_providers p
      where p.provider_key = v_provider
    )
  );
end;
$$;

revoke all on function public.get_extraction_capability() from public;
revoke all on function public.get_location_capability() from public;
grant execute on function public.get_extraction_capability() to authenticated;
grant execute on function public.get_location_capability() to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 3. THE EXTRACTION ROW THE WRITER ACTUALLY WRITES
-- ---------------------------------------------------------------------------
--
-- `private.worker_identity_extractions` was missing three columns the
-- extraction path writes: `document_type`, `document_hash` and `is_current`.
--
-- This is not a refinement. Without them every successful extraction would
-- have failed at the insert, so extraction would have appeared to work — a
-- provider call, an audit row, candidates on screen — and then persisted
-- nothing, and the worker's confirmation step would have had no row to
-- confirm. Structural tests could not catch it: they read source text, and no
-- environment has ever had a credential to run the insert against.
--
--   document_type — a National ID has two sides carrying different fields, and
--                   supersession has to be per side or retaking the back would
--                   discard the front.
--   document_hash — WPS-024 requires every result to record the hash of what
--                   was read. It is reachable through `ocr_request_id`, but a
--                   promise that needs a join to check is a promise that stops
--                   being checked.
--   is_current    — a retake REPLACES the previous attempt. Without it a worker
--                   could confirm a field extracted from a photograph they
--                   already discarded, which is the quiet version of confirming
--                   somebody else's details.

alter table private.worker_identity_extractions
  add column if not exists document_type text,
  add column if not exists document_hash text,
  add column if not exists is_current boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'worker_identity_extractions_document_type_check'
  ) then
    alter table private.worker_identity_extractions
      add constraint worker_identity_extractions_document_type_check
      -- Nullable: a row written before this column existed cannot be given a
      -- side after the fact, and inventing one would be worse than admitting
      -- it is unknown.
      check (document_type is null or document_type in
             ('national_id_front', 'national_id_back', 'criminal_record'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'worker_identity_extractions_document_hash_check'
  ) then
    alter table private.worker_identity_extractions
      add constraint worker_identity_extractions_document_hash_check
      check (document_hash is null or document_hash ~ '^[0-9a-f]{64}$');
  end if;
end;
$$;

-- One current candidate per field per side. The writer supersedes before it
-- inserts; this is what makes that ordering a guarantee rather than a habit.
create unique index if not exists worker_identity_extractions_current_idx
  on private.worker_identity_extractions (provider_id, document_type, field_key)
  where is_current;

comment on column private.worker_identity_extractions.is_current is
  'WPS-024. False once superseded by a retake. A discarded photograph''s fields are never confirmable.';

-- ---------------------------------------------------------------------------
-- SECTION 4. HEALTH
-- ---------------------------------------------------------------------------
--
-- One append-only sample per provider call, and a rollup that answers the
-- question a person on call actually asks: is it working now, when did it last
-- work, and how badly is it degrading.
--
-- No account column. No document column. No extracted value. An operations
-- screen that could answer "what did this worker submit" is a second route to
-- identity data with a different capability guarding it, and the first thing
-- anyone would do with it is look up a specific person.

create table if not exists private.provider_health_samples (
  id                uuid primary key default extensions.gen_random_uuid(),
  provider_key      text not null references private.external_providers(provider_key),
  -- The operation, not the subject. `extract_identity`, `autocomplete`.
  operation         text not null check (operation ~ '^[a-z][a-z0-9_]{2,40}$'),
  provider_version  text not null,
  outcome           text not null
    check (outcome in ('succeeded', 'no_results', 'no_text_found', 'unreadable',
                       'provider_error', 'timed_out', 'refused_no_credential',
                       'refused_disabled')),
  latency_ms        integer check (latency_ms is null or latency_ms between 0 and 600000),
  -- 1 means it worked first time. Anything higher is a retry, and a provider
  -- that succeeds only on the second attempt is degrading before it fails.
  attempts          smallint not null default 1 check (attempts between 0 and 8),
  timed_out         boolean not null default false,
  environment       text not null check (environment in ('local', 'staging', 'production')),
  observed_at       timestamptz not null default pg_catalog.clock_timestamp()
);

comment on table private.provider_health_samples is
  'WPS-024 provider health. Operational only: no account, no document, no extracted value.';

revoke all on table private.provider_health_samples from public, anon, authenticated;

create index if not exists provider_health_samples_provider_idx
  on private.provider_health_samples (provider_key, observed_at desc);

create or replace function private.provider_health_samples_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Provider health samples are immutable' using errcode = '42501';
end;
$$;

drop trigger if exists provider_health_samples_immutable on private.provider_health_samples;
create trigger provider_health_samples_immutable
  before update or delete on private.provider_health_samples
  for each row execute function private.provider_health_samples_immutable();

revoke all on function private.provider_health_samples_immutable()
  from public, anon, authenticated;

/**
 * The rollup.
 *
 * Derivable from the samples, kept anyway: "when did this last work" is the
 * first question on an incident call, and it should not require a scan of an
 * append-only table that grows with every keystroke somebody types into a
 * search box.
 */
create table if not exists private.provider_health (
  provider_key          text primary key references private.external_providers(provider_key),
  provider_version      text,
  last_outcome          text,
  last_observed_at      timestamptz,
  last_success_at       timestamptz,
  last_failure_at       timestamptz,
  -- Resets to zero on any success. This is the number that should page
  -- somebody, not the lifetime total.
  consecutive_failures  integer not null default 0 check (consecutive_failures >= 0),
  total_requests        bigint not null default 0 check (total_requests >= 0),
  total_failures        bigint not null default 0 check (total_failures >= 0),
  total_timeouts        bigint not null default 0 check (total_timeouts >= 0),
  total_retries         bigint not null default 0 check (total_retries >= 0),
  updated_at            timestamptz not null default pg_catalog.clock_timestamp()
);

comment on table private.provider_health is
  'WPS-024 per-provider health rollup. Operational only.';

revoke all on table private.provider_health from public, anon, authenticated;

/**
 * Record one provider call.
 *
 * Called by an Edge Function with the service role, after the call returns and
 * whatever the result. A health table that records only successes describes a
 * provider that has never failed.
 *
 * A refusal is recorded but is NOT a failure: `refused_disabled` means Warsha
 * chose not to call, and counting Warsha's own kill switch against a vendor's
 * availability would make the number meaningless during exactly the incident it
 * exists for.
 */
create or replace function private.record_provider_health(
  p_provider_key text,
  p_operation text,
  p_provider_version text,
  p_outcome text,
  p_latency_ms integer default null,
  p_attempts smallint default 1,
  p_timed_out boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failure boolean := p_outcome in ('provider_error', 'timed_out');
  v_success boolean := p_outcome in ('succeeded', 'no_results', 'no_text_found');
begin
  if not exists (
    select 1 from private.external_providers where provider_key = p_provider_key
  ) then
    -- An unregistered provider cannot be health-checked because it cannot be
    -- called. Silent rather than raising: health recording must never be the
    -- thing that fails a worker's request.
    return;
  end if;

  insert into private.provider_health_samples
    (provider_key, operation, provider_version, outcome, latency_ms, attempts,
     timed_out, environment)
  values
    (p_provider_key, p_operation, p_provider_version, p_outcome, p_latency_ms,
     coalesce(p_attempts, 1), coalesce(p_timed_out, false), private.platform_environment());

  insert into private.provider_health as h
    (provider_key, provider_version, last_outcome, last_observed_at,
     last_success_at, last_failure_at, consecutive_failures,
     total_requests, total_failures, total_timeouts, total_retries, updated_at)
  values
    (p_provider_key, p_provider_version, p_outcome, pg_catalog.clock_timestamp(),
     case when v_success then pg_catalog.clock_timestamp() end,
     case when v_failure then pg_catalog.clock_timestamp() end,
     case when v_failure then 1 else 0 end,
     1,
     case when v_failure then 1 else 0 end,
     case when coalesce(p_timed_out, false) then 1 else 0 end,
     greatest(coalesce(p_attempts, 1) - 1, 0),
     pg_catalog.clock_timestamp())
  on conflict (provider_key) do update set
    provider_version = excluded.provider_version,
    last_outcome = excluded.last_outcome,
    last_observed_at = excluded.last_observed_at,
    last_success_at = coalesce(excluded.last_success_at, h.last_success_at),
    last_failure_at = coalesce(excluded.last_failure_at, h.last_failure_at),
    consecutive_failures = case
      when v_success then 0
      when v_failure then h.consecutive_failures + 1
      else h.consecutive_failures
    end,
    total_requests = h.total_requests + 1,
    total_failures = h.total_failures + excluded.total_failures,
    total_timeouts = h.total_timeouts + excluded.total_timeouts,
    total_retries = h.total_retries + excluded.total_retries,
    updated_at = pg_catalog.clock_timestamp();
end;
$$;

comment on function private.record_provider_health(text, text, text, text, integer, smallint, boolean) is
  'WPS-024 record one external provider call. Never raises into a user request.';

revoke all on function private.record_provider_health(text, text, text, text, integer, smallint, boolean)
  from public, anon, authenticated;

/**
 * Availability over a window.
 *
 * Successes over attempts, excluding refusals. A window with no calls returns
 * null rather than 100%: nothing observed is not the same as nothing wrong,
 * and a dashboard that shows a green 100% for a provider nobody has called
 * since Tuesday is worse than one that shows a blank.
 */
create or replace function private.provider_availability(
  p_provider_key text,
  p_window interval
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when pg_catalog.count(*) = 0 then null
              else pg_catalog.round(
                pg_catalog.count(*) filter (
                  where s.outcome in ('succeeded', 'no_results', 'no_text_found')
                )::numeric / pg_catalog.count(*)::numeric, 4)
         end
  from private.provider_health_samples s
  where s.provider_key = p_provider_key
    and s.observed_at >= pg_catalog.clock_timestamp() - p_window
    and s.outcome not in ('refused_disabled', 'refused_no_credential')
$$;

revoke all on function private.provider_availability(text, interval)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 5. THE STAFF SURFACE
-- ---------------------------------------------------------------------------

/**
 * Health for staff, and only for staff.
 *
 * Returns nothing that identifies a person and nothing that names a secret's
 * value. Latency percentiles come from the samples; everything cumulative comes
 * from the rollup.
 */
create or replace function public.staff_provider_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_staff_capability('review_legal_governance');
begin
  return coalesce((
    select pg_catalog.jsonb_agg(entry order by entry ->> 'providerKey')
    from (
      select pg_catalog.jsonb_build_object(
        'providerKey', p.provider_key,
        'displayName', p.display_name,
        'capabilityRole', p.capability_role,
        'status', p.current_status,
        'enabled', private.provider_enabled(p.provider_key),
        'providerVersion', coalesce(h.provider_version, p.provider_version),
        'lastOutcome', h.last_outcome,
        'lastObservedAt', h.last_observed_at,
        'lastSuccessAt', h.last_success_at,
        'lastFailureAt', h.last_failure_at,
        'consecutiveFailures', coalesce(h.consecutive_failures, 0),
        'totalRequests', coalesce(h.total_requests, 0),
        'totalFailures', coalesce(h.total_failures, 0),
        'totalTimeouts', coalesce(h.total_timeouts, 0),
        'totalRetries', coalesce(h.total_retries, 0),
        'availability24h', private.provider_availability(p.provider_key, interval '24 hours'),
        'availability7d', private.provider_availability(p.provider_key, interval '7 days'),
        'latencyP50Ms', (
          select pg_catalog.round(pg_catalog.percentile_cont(0.5) within group (order by s.latency_ms))
          from private.provider_health_samples s
          where s.provider_key = p.provider_key and s.latency_ms is not null
            and s.observed_at >= pg_catalog.clock_timestamp() - interval '24 hours'),
        'latencyP95Ms', (
          select pg_catalog.round(pg_catalog.percentile_cont(0.95) within group (order by s.latency_ms))
          from private.provider_health_samples s
          where s.provider_key = p.provider_key and s.latency_ms is not null
            and s.observed_at >= pg_catalog.clock_timestamp() - interval '24 hours'),
        'samples24h', (
          select pg_catalog.count(*) from private.provider_health_samples s
          where s.provider_key = p.provider_key
            and s.observed_at >= pg_catalog.clock_timestamp() - interval '24 hours')
      ) as entry
      from private.external_providers p
      left join private.provider_health h on h.provider_key = p.provider_key
      where v_actor is not null
    ) entries
  ), '[]'::jsonb);
end;
$$;

comment on function public.staff_provider_health() is
  'WPS-024 provider health for staff. No subject identifier and no secret value.';

revoke all on function public.staff_provider_health() from public;
grant execute on function public.staff_provider_health() to authenticated;

-- The registry surface gains the role and the renderer, so a reviewer can see
-- what a provider is FOR rather than inferring it from the vendor's name.
create or replace function public.staff_provider_registry()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_staff_capability('review_legal_governance');
begin
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'providerKey', p.provider_key,
      'displayName', p.display_name,
      'purpose', p.purpose,
      'introducedByWps', p.introduced_by_wps,
      'capabilityRole', p.capability_role,
      'fillsRole', p.provider_key = private.provider_for_role(p.capability_role),
      'mapRendererKey', p.map_renderer_key,
      'status', p.current_status,
      'enabled', private.provider_enabled(p.provider_key),
      'executionContext', p.execution_context,
      'environments', p.environments,
      'featureFlag', p.feature_flag_key,
      'killSwitch', p.kill_switch_key,
      'dataCategories', p.data_categories,
      'privacyPolicyRef', p.privacy_policy_ref,
      'subprocessorKey', p.subprocessor_key,
      'processingActivityKey', p.processing_activity_key,
      'securityOwner', p.security_owner,
      'operationalOwner', p.operational_owner,
      'dateIntroduced', p.date_introduced,
      'providerVersion', p.provider_version,
      'lastReviewDate', p.last_review_date,
      -- The NAME of the secret, never a value. A reviewer needs to know which
      -- secret to rotate; nobody needs to read it from a screen.
      'credentialSecretName', p.credential_secret_name
    ) order by p.provider_key)
    from private.external_providers p
    where v_actor is not null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_provider_registry() from public;
grant execute on function public.staff_provider_registry() to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 6. THE BENCHMARK RECORDS PARSER FAILURES SEPARATELY
-- ---------------------------------------------------------------------------
--
-- A card the provider read perfectly, from which Warsha's own parser extracted
-- nothing, is not an OCR failure — and counting it as one would send the next
-- person to argue with a vendor about a regular expression.
--
-- The two are already distinguishable in the request outcome: `no_text_found`
-- means the provider saw nothing, `unreadable` means it saw text and the parser
-- found no fields in it. This column carries that split into the baseline.

alter table private.ocr_accuracy_runs
  add column if not exists parser_failure_rate numeric(5,4)
    check (parser_failure_rate is null or parser_failure_rate between 0 and 1),
  add column if not exists parser_version text;

comment on column private.ocr_accuracy_runs.parser_failure_rate is
  'WPS-024. Readable samples the provider read but the parser found no fields in.';

-- ---------------------------------------------------------------------------
-- SECTION 7. INVENTORY
-- ---------------------------------------------------------------------------

insert into private.data_inventory
  (entry_key, schema_name, object_name, object_kind, classification_key, purpose,
   authority, retention_trigger, deletion_treatment, export_included, staff_capability, notes)
values
  ('provider_health_samples', 'private', 'provider_health_samples', 'table',
   'operational_audit',
   'Record the outcome, latency and retry count of every external provider call.',
   'WPS-024', 'Retirement of the provider.',
   'preserve', false, 'review_legal_governance',
   'Operational only. No account, no document, no extracted value: a health screen that could '
   || 'answer "what did this worker submit" would be a second route to identity data.'),
  ('provider_health', 'private', 'provider_health', 'table', 'operational_audit',
   'Hold the current health rollup per external provider.',
   'WPS-024', 'Retirement of the provider.',
   'preserve', false, 'review_legal_governance',
   'Derived from provider_health_samples. Kept because "when did it last work" is the first '
   || 'question on an incident call.')
on conflict (entry_key) do nothing;
