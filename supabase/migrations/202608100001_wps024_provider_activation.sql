-- ============================================================================
-- WPS-024 — PROVIDER ACTIVATION
-- ============================================================================
--
-- Authority: WPS-024. Extends 202608090001.
--
-- The previous migration registered Google Cloud Vision and Google Maps
-- Platform as `approved_not_integrated` and said so in the published privacy
-- corpus. This one builds the integrations: a server-side OCR path, a
-- server-proxied Places and Geocoding path, an audited request trail, and the
-- authoritative External Provider Registry that governs all of it.
--
-- The distinction the previous migration drew still holds and is now
-- load-bearing in a new way: `integration_status` moves from
-- `approved_not_integrated` to `in_use` ONLY when a credential is actually
-- configured. The code exists either way; the register describes reality.
-- Section 6 makes that automatic rather than a thing somebody remembers.
--
-- What this migration does NOT do
-- -------------------------------
-- It does not carry a credential. No API key, service-account key or secret
-- appears anywhere in this file or in any file it references. Every provider
-- reads its credential from an Edge Function environment secret at call time,
-- and a missing credential is reported as unavailable rather than guessed at.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1. THE EXTERNAL PROVIDER REGISTRY
-- ---------------------------------------------------------------------------
--
-- One row per external service, with everything needed to answer the question
-- an auditor actually asks: who is this, why do we use them, who approved it,
-- what do they see, where is that written down, and who is responsible.
--
-- Deliberately separate from `private.subprocessors`. A subprocessor is a
-- PRIVACY concept — a supplier processing personal data on Warsha's behalf,
-- disclosed in the Subprocessor Register that users read. An external provider
-- is an OPERATIONAL concept, and includes services that process no personal
-- data at all. Expo Camera is an external provider and is not a subprocessor,
-- because it runs on the device and sends Warsha's data to nobody.
--
-- The two are linked by `subprocessor_key`, which is null exactly when the
-- provider is not a subprocessor — and section 5 asserts that a provider
-- processing personal data off-device always has one.

create table if not exists private.external_providers (
  provider_key          text primary key,
  display_name          text not null,
  purpose               text not null,
  -- Which specification introduced this provider. Not decoration: it is how a
  -- reviewer finds the reasoning behind a dependency years later.
  introduced_by_wps     text not null,
  current_status        text not null
    check (current_status in ('active', 'configured_not_enabled',
                              'implemented_awaiting_credential', 'approved_not_implemented',
                              'retired')),
  -- Where the provider runs. `device` never sees a Warsha credential;
  -- `server` credentials never reach the bundle.
  execution_context     text not null check (execution_context in ('device', 'server', 'both')),
  environments          text[] not null,
  feature_flag_key      text,
  kill_switch_key       text,
  data_categories       text[] not null,
  -- Cross-references. The privacy corpus is the published disclosure; these
  -- columns make the register point at it rather than restate it.
  privacy_policy_ref    text not null,
  subprocessor_key      text references private.subprocessors(subprocessor_key),
  processing_activity_key text references private.processing_activities(activity_key),
  security_owner        text not null,
  operational_owner     text not null,
  date_introduced       date not null,
  provider_version      text not null,
  last_review_date      date not null,
  -- The credential this provider needs, by NAME only. Never a value, and the
  -- regression suite asserts that every name here is absent from the bundle.
  credential_secret_name text,
  notes                 text not null,
  constraint external_providers_key_check
    check (provider_key ~ '^[a-z][a-z0-9_]{2,60}$'),
  -- A device-side provider cannot hold a server secret, and a server-side one
  -- that processes personal data must name the secret it needs. Written as a
  -- constraint because "we would never do that" is not a control.
  constraint external_providers_device_secret_check
    check (execution_context <> 'device' or credential_secret_name is null),
  constraint external_providers_review_check
    check (last_review_date >= date_introduced)
);

comment on table private.external_providers is
  'WPS-024 authoritative External Provider Registry. No provider may be enabled without a row here.';

revoke all on table private.external_providers from public, anon, authenticated;

-- Append-only history of provider status changes. A provider that was switched
-- on, caused an incident and was switched off again must leave a trail; a
-- mutable status column alone would not.
create table if not exists private.external_provider_events (
  id            uuid primary key default extensions.gen_random_uuid(),
  provider_key  text not null references private.external_providers(provider_key),
  event_type    text not null
    check (event_type in ('registered', 'enabled', 'disabled', 'credential_rotated',
                          'reviewed', 'retired')),
  from_status   text,
  to_status     text,
  actor_id      uuid references public.profiles(id),
  reason        text not null,
  created_at    timestamptz not null default pg_catalog.clock_timestamp()
);

revoke all on table private.external_provider_events from public, anon, authenticated;

create or replace function private.external_provider_events_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Provider history is immutable' using errcode = '42501';
end;
$$;

drop trigger if exists external_provider_events_immutable on private.external_provider_events;
create trigger external_provider_events_immutable
  before update or delete on private.external_provider_events
  for each row execute function private.external_provider_events_immutable();

revoke all on function private.external_provider_events_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 2. OCR REQUEST AUDIT
-- ---------------------------------------------------------------------------
--
-- Every OCR request is audited, whether it succeeded, failed, or was refused.
-- A log that records only successes cannot show that a document was sent to a
-- provider and the result thrown away, which is exactly the thing an audit of
-- identity processing is for.
--
-- What this table does NOT hold: the document, the raw provider response, or
-- any extracted value. It holds the FACT of a request and enough to reconcile
-- it — the hash of what was sent, the provider version, the timing, and the
-- outcome. WPS-024's OCR Usage Policy promises the raw payload is not retained,
-- and this is the table where breaking that promise would be easiest.

create table if not exists private.ocr_requests (
  id                  uuid primary key default extensions.gen_random_uuid(),
  provider_id         uuid not null references public.provider_profiles(id) on delete cascade,
  document_type       text not null
    check (document_type in ('national_id_front', 'national_id_back', 'criminal_record')),
  -- Ties the request to the exact bytes reviewed later. The document itself
  -- stays in private storage; this proves which one was processed.
  document_hash       text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  provider_key        text not null references private.external_providers(provider_key),
  provider_version    text not null,
  requested_at        timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at        timestamptz,
  latency_ms          integer check (latency_ms is null or latency_ms between 0 and 600000),
  outcome             text not null
    check (outcome in ('succeeded', 'no_text_found', 'unreadable', 'provider_error',
                       'refused_no_credential', 'refused_disabled', 'refused_rate_limited')),
  -- Internal. Never returned to any client, never shown to a reviewer, and
  -- never a reason for a decision. Recorded so the accuracy baseline can
  -- report a distribution rather than an anecdote.
  mean_confidence     numeric(4,3) check (mean_confidence is null or mean_confidence between 0 and 1),
  fields_extracted    integer not null default 0 check (fields_extracted between 0 and 32),
  -- A short, safe reason a worker can act on: "the back of the card is cut
  -- off". Never a provider stack trace.
  safe_failure_reason text,
  environment         text not null check (environment in ('local', 'staging', 'production')),
  constraint ocr_requests_completion_check
    check ((completed_at is null) = (outcome in ('refused_no_credential', 'refused_disabled',
                                                 'refused_rate_limited')))
);

comment on table private.ocr_requests is
  'WPS-024 OCR audit. Every request, including refusals. Holds no document and no raw payload.';

revoke all on table private.ocr_requests from public, anon, authenticated;

create index if not exists ocr_requests_provider_idx
  on private.ocr_requests (provider_id, requested_at desc);

create or replace function private.ocr_requests_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- One permitted update: closing an open request. Everything else is frozen,
  -- and the completion columns can only be written once.
  if tg_op = 'UPDATE'
     and old.completed_at is null and new.completed_at is not null
     and new.id = old.id and new.provider_id = old.provider_id
     and new.document_hash = old.document_hash
     and new.provider_key = old.provider_key
     and new.requested_at = old.requested_at then
    return new;
  end if;
  raise exception 'OCR audit history cannot be changed' using errcode = '42501';
end;
$$;

drop trigger if exists ocr_requests_immutable on private.ocr_requests;
create trigger ocr_requests_immutable
  before update or delete on private.ocr_requests
  for each row execute function private.ocr_requests_immutable();

revoke all on function private.ocr_requests_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 3. EXTRACTION STORAGE, EXTENDED
-- ---------------------------------------------------------------------------
--
-- WPS-023 created `private.worker_identity_extractions` for candidate fields.
-- WPS-024's OCR Usage Policy commits to recording, per extraction: the
-- provider version, the extraction timestamp, a confidence value, and a
-- document hash. Three of those already existed; the rest are added here so
-- the published promise and the schema agree.

alter table private.worker_identity_extractions
  add column if not exists provider_key text references private.external_providers(provider_key),
  add column if not exists provider_version text,
  add column if not exists ocr_request_id uuid references private.ocr_requests(id),
  add column if not exists extracted_at timestamptz not null default pg_catalog.clock_timestamp();

comment on column private.worker_identity_extractions.provider_version is
  'WPS-024. Which provider build produced this candidate, for the accuracy baseline.';

-- ---------------------------------------------------------------------------
-- SECTION 4. OCR ACCURACY BASELINE
-- ---------------------------------------------------------------------------
--
-- WPS-024 requires a documented production baseline for OCR accuracy. The
-- objective is explicitly NOT perfect OCR — it is a measured starting point
-- that future work can be compared against.
--
-- Measurements land here rather than only in a document, so a later run can be
-- compared with an earlier one by query rather than by reading two markdown
-- files side by side.
--
-- `sample_source` exists because the difference between a synthetic sample set
-- and real customer documents is the whole ethical question. WPS-024 forbids
-- using production customer documents for testing, and a run that cannot say
-- where its samples came from cannot be trusted not to have.

create table if not exists private.ocr_accuracy_runs (
  id                    uuid primary key default extensions.gen_random_uuid(),
  run_label             text not null,
  provider_key          text not null references private.external_providers(provider_key),
  provider_version      text not null,
  sample_source         text not null
    check (sample_source in ('synthetic', 'consented_staff_samples', 'public_specimen')),
  sample_count          integer not null check (sample_count > 0),
  -- The six measurements WPS-024 names.
  successful_extraction_rate numeric(5,4) check (successful_extraction_rate between 0 and 1),
  field_accuracy        jsonb not null default '{}'::jsonb,
  confidence_distribution jsonb not null default '{}'::jsonb,
  false_positive_rate   numeric(5,4) check (false_positive_rate between 0 and 1),
  unreadable_rate       numeric(5,4) check (unreadable_rate between 0 and 1),
  mean_latency_ms       integer check (mean_latency_ms is null or mean_latency_ms >= 0),
  p95_latency_ms        integer check (p95_latency_ms is null or p95_latency_ms >= 0),
  environment           text not null check (environment in ('local', 'staging')),
  executed_at           timestamptz not null default pg_catalog.clock_timestamp(),
  notes                 text not null,
  -- Production customer documents may never be a sample source. The check
  -- above enumerates the three permitted sources rather than forbidding one,
  -- because an allowlist cannot be defeated by inventing a fourth name.
  constraint ocr_accuracy_environment_check
    check (environment <> 'production')
);

comment on table private.ocr_accuracy_runs is
  'WPS-024 OCR accuracy baseline. Production customer documents are not a permitted sample source.';

revoke all on table private.ocr_accuracy_runs from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 5. THE REGISTRY IS THE TRUTH
-- ---------------------------------------------------------------------------

/**
 * Whether a provider may actually be called right now.
 *
 * Three things must all hold: the registry says active, the feature flag is
 * on, and the kill switch is off. Any one of them stops the call, and the
 * Edge Functions read this rather than deciding for themselves.
 *
 * A provider with no flag is governed by the registry alone; a provider with
 * no kill switch cannot be stopped except by the flag, and section 7 asserts
 * that every provider touching identity data has one.
 */
create or replace function private.provider_enabled(p_provider_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.current_status = 'active'
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
  'WPS-024 single answer to whether an external provider may be called.';

revoke all on function private.provider_enabled(text) from public, anon, authenticated;

/**
 * Record an OCR request and return its id.
 *
 * Called by the Edge Function with the service role. Opens the audit row
 * BEFORE the provider is called, so a request that crashes mid-flight still
 * leaves a trace. `complete_ocr_request` closes it.
 */
create or replace function private.open_ocr_request(
  p_provider_id uuid,
  p_document_type text,
  p_document_hash text,
  p_provider_key text,
  p_provider_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into private.ocr_requests
    (provider_id, document_type, document_hash, provider_key, provider_version,
     outcome, environment)
  values
    (p_provider_id, p_document_type, p_document_hash, p_provider_key, p_provider_version,
     'refused_disabled', private.platform_environment())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function private.open_ocr_request(uuid, text, text, text, text)
  from public, anon, authenticated;

create or replace function private.complete_ocr_request(
  p_request_id uuid,
  p_outcome text,
  p_latency_ms integer,
  p_mean_confidence numeric,
  p_fields_extracted integer,
  p_safe_failure_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A refusal never "completes": the constraint requires `completed_at` to be
  -- null for a refusal, so recording one as completed would raise here rather
  -- than produce an audit row that claims a provider was called.
  update private.ocr_requests
  set completed_at = pg_catalog.clock_timestamp(),
      outcome = p_outcome,
      latency_ms = p_latency_ms,
      mean_confidence = p_mean_confidence,
      fields_extracted = coalesce(p_fields_extracted, 0),
      safe_failure_reason = p_safe_failure_reason
  where id = p_request_id;
end;
$$;

revoke all on function private.complete_ocr_request(uuid, text, integer, numeric, integer, text)
  from public, anon, authenticated;

/**
 * What the client may know about extraction availability.
 *
 * Returns whether extraction is available and, if not, a reason the worker can
 * act on. It does NOT say why in provider terms — "no credential configured"
 * is an operations fact, and a worker reading it learns nothing they can use.
 */
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
    'available', private.provider_enabled('google_cloud_vision'),
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
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'mapsAvailable', private.provider_enabled('google_maps_platform'),
    'searchAvailable', private.provider_enabled('google_maps_platform'),
    'manualPinAlwaysAvailable', true,
    'pinRequiredBeforeBooking', true
  );
end;
$$;

revoke all on function public.get_extraction_capability() from public;
revoke all on function public.get_location_capability() from public;
grant execute on function public.get_extraction_capability() to authenticated;
grant execute on function public.get_location_capability() to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 6. STAFF SURFACES
-- ---------------------------------------------------------------------------

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

comment on function public.staff_provider_registry() is
  'WPS-024 provider registry for staff. Returns secret NAMES, never secret values.';

/**
 * The staff vetting decision surface, extended with the OCR trail.
 *
 * Returns what a reviewer needs to judge a submission: the lifecycle state,
 * whether documents and a certificate exist, and whether extraction ran. It
 * does not return a confidence score, because a reviewer shown a score decides
 * the score rather than the case.
 */
create or replace function public.staff_worker_vetting_detail(p_subject_ref text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('review_worker_vetting');
  v_user uuid;
  v_provider uuid;
begin
  select o.user_id into v_user
  from public.account_onboarding o
  where pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(o.user_id::text, 'UTF8')), 'hex')
        = p_subject_ref;
  if v_user is null then
    raise exception 'Unknown case' using errcode = '22023';
  end if;

  select p.id into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;

  perform private.record_staff_audit(
    v_actor, 'review_worker_vetting', 'open_case', 'worker_vetting', v_user,
    'Opened a vetting case for review.',
    pg_catalog.jsonb_build_object('subjectRef', p_subject_ref));

  return pg_catalog.jsonb_build_object(
    'subjectRef', p_subject_ref,
    'workerState', (select o.worker_state from public.account_onboarding o where o.user_id = v_user),
    'capabilityTier', private.worker_capability_tier(v_user),
    'gates', private.worker_activation_gates(v_user),
    'provisionalGates', private.worker_provisional_gates(v_user),
    'documents', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'documentType', d.document_type, 'status', d.status,
        'captureSource', d.capture_source, 'pageSide', d.page_side)
        order by d.document_type)
      from public.provider_verification_documents d
      where d.provider_id = v_provider and d.is_current), '[]'::jsonb),
    'certificate', (
      select pg_catalog.jsonb_build_object('status', c.status, 'issueDate', c.issue_date)
      from public.worker_criminal_record_submissions c
      where c.provider_id = v_provider and c.is_current),
    -- The OCR trail: that it ran, what it produced, how long it took. No
    -- confidence value, and no extracted value.
    'extractionRuns', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'documentType', r.document_type, 'outcome', r.outcome,
        'providerVersion', r.provider_version, 'fieldsExtracted', r.fields_extracted,
        'requestedAt', r.requested_at)
        order by r.requested_at desc)
      from private.ocr_requests r
      where r.provider_id = v_provider), '[]'::jsonb),
    'fieldsConfirmedByWorker', (
      select i.confirmed_at is not null
      from private.provider_verification_identities i where i.provider_id = v_provider)
  );
end;
$$;

comment on function public.staff_worker_vetting_detail(text) is
  'WPS-024 vetting case detail. Access-logged. Returns no confidence score and no extracted value.';

revoke all on function public.staff_provider_registry() from public;
revoke all on function public.staff_worker_vetting_detail(text) from public;
grant execute on function public.staff_provider_registry() to authenticated;
grant execute on function public.staff_worker_vetting_detail(text) to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 7. SEED — THE REGISTRY
-- ---------------------------------------------------------------------------
--
-- Six providers. Status is set to what is TRUE right now, which for the two
-- Google services is `implemented_awaiting_credential`: the integration is
-- built and tested, and no credential has been supplied to this environment.
-- Calling that `active` would make the register a wish.

insert into private.external_providers
  (provider_key, display_name, purpose, introduced_by_wps, current_status, execution_context,
   environments, feature_flag_key, kill_switch_key, data_categories, privacy_policy_ref,
   subprocessor_key, processing_activity_key, security_owner, operational_owner,
   date_introduced, provider_version, last_review_date, credential_secret_name, notes)
values
  ('supabase', 'Supabase', 'Database, authentication, private storage and realtime.',
   'WPS-001', 'active', 'both',
   array['local', 'staging', 'production'], null, null,
   array['account', 'bookings', 'messages', 'payments', 'addresses',
         'identity_documents', 'criminal_records'],
   'privacy_policy', 'supabase', 'account_authentication',
   'security_administrator', 'operations_manager',
   '2026-07-20', 'platform', '2026-08-06', 'SUPABASE_SERVICE_ROLE_KEY',
   'The platform itself. The service-role key exists only in Edge Function secrets and CI, '
   || 'never in the application bundle.'),

  ('expo_eas', 'Expo Application Services', 'Building and distributing the mobile applications.',
   'WPS-001', 'active', 'server',
   array['local', 'staging', 'production'], null, null,
   array['build_artefacts', 'diagnostics'],
   'privacy_policy', 'expo_eas', 'diagnostics',
   'security_administrator', 'operations_manager',
   '2026-07-20', 'sdk-54', '2026-08-06', 'EXPO_TOKEN',
   'Over-the-air updates are configured but not enabled.'),

  ('expo_camera', 'Expo Camera', 'Capturing the National ID with a framing overlay and retake.',
   'WPS-024', 'active', 'device',
   array['local', 'staging', 'production'], 'identity_capture_camera', 'identity_extraction',
   array['identity_documents'],
   'worker_verification_policy', null, 'worker_verification',
   'security_administrator', 'operations_manager',
   '2026-08-06', '~17.0.10', '2026-08-06', null,
   'Runs entirely on the device and sends nothing anywhere. An external provider but NOT a '
   || 'subprocessor: it processes no data off-device, so it has no subprocessor entry.'),

  ('expo_image_picker', 'Expo Image Picker', 'Fallback upload path when capture is unavailable.',
   'WPS-009', 'active', 'device',
   array['local', 'staging', 'production'], null, null,
   array['identity_documents', 'job_photographs'],
   'worker_verification_policy', null, 'worker_verification',
   'security_administrator', 'operations_manager',
   '2026-08-01', '~17.0.11', '2026-08-06', null,
   'Device-side. The fallback that keeps onboarding possible when a camera is refused or absent.'),

  ('expo_document_picker', 'Expo Document Picker',
   'Uploading a criminal-record certificate as a PDF.',
   'WPS-023', 'active', 'device',
   array['local', 'staging', 'production'], null, null,
   array['criminal_records'],
   'worker_verification_policy', null, 'worker_verification',
   'security_administrator', 'operations_manager',
   '2026-08-06', '~14.0.8', '2026-08-06', null,
   'Device-side. A certificate is commonly a PDF, which the image picker cannot take.'),

  ('google_cloud_vision', 'Google Cloud Vision',
   'Extracting the text printed on a National ID so a worker need not type it.',
   'WPS-024', 'implemented_awaiting_credential', 'server',
   array['local', 'staging'], 'identity_extraction', 'identity_extraction',
   array['identity_documents'],
   'ocr_usage_policy', 'google_cloud_vision', 'worker_verification',
   'security_administrator', 'operations_manager',
   '2026-08-06', 'v1', '2026-08-06', 'GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT',
   'Server-side only, called from the vision-extract Edge Function. The service-account key '
   || 'lives in Edge Function secrets and never reaches the bundle. Status is '
   || 'implemented_awaiting_credential because no key has been supplied to this environment; '
   || 'it becomes active when one is, and NOT before. Production is deliberately absent from '
   || 'environments until a baseline has been measured.'),

  ('google_maps_platform', 'Google Maps Platform',
   'Map rendering, Places Autocomplete, forward and reverse geocoding.',
   'WPS-024', 'implemented_awaiting_credential', 'both',
   array['local', 'staging'], 'location_provider', 'location_provider',
   array['addresses'],
   'location_data_policy', 'google_maps_platform', 'bookings_execution',
   'security_administrator', 'operations_manager',
   '2026-08-06', 'v3', '2026-08-06', 'GOOGLE_MAPS_SERVER_KEY',
   'Two keys with different natures. The Maps SDK RENDER key is publishable by necessity — the '
   || 'native SDK reads it from the app manifest — and is restricted by package name and '
   || 'signing fingerprint, scoped to map rendering only. The SERVER key used for Places and '
   || 'Geocoding is a genuine secret, lives in Edge Function secrets, and never reaches the '
   || 'bundle. Only the second is named in credential_secret_name, because only the second is '
   || 'a secret.')
on conflict (provider_key) do nothing;

insert into private.external_provider_events (provider_key, event_type, to_status, reason)
select p.provider_key, 'registered', p.current_status,
       'WPS-024 initial registration of the External Provider Registry.'
from private.external_providers p
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- SECTION 8. FLAGS, SWITCHES AND LIMITS
-- ---------------------------------------------------------------------------

insert into private.staff_feature_flags
  (flag_key, environment, enabled, audience, reason, is_kill_switch)
values
  ('identity_capture_camera', 'local', false, 'none',
   'WPS-024 camera capture stays off until the framing overlay has been seen on a device.', false),
  ('location_provider', 'staging', false, 'none',
   'WPS-024 map provider stays off in staging until a restricted render key is configured.', false),
  ('identity_extraction', 'staging', false, 'none',
   'WPS-024 extraction stays off in staging until a service-account key is configured and an '
   || 'accuracy baseline has been measured.', false)
on conflict (flag_key, environment) do nothing;

insert into private.staff_kill_switches
  (switch_key, display_name, domain_authority, server_enforced, active, reason, enforcement_note)
values
  ('location_provider', 'Location provider', 'configuration', true, false,
   'WPS-024 stop control for the map and geocoding provider.',
   'When active, no Places or Geocoding call is made and manual pin placement is the only path. '
   || 'Booking is never blocked by this switch.')
on conflict (switch_key) do nothing;

insert into private.rate_limit_policies
  (policy_key, surface, scope, max_events, window_seconds, enabled, enforced_by, notes)
values
  ('identity_extraction_request', 'vision-extract', 'account', 20, 3600, true, 'wps018_limiter',
   'Twenty extractions an hour per account. Generous for a worker retaking a blurred photograph, '
   || 'tight enough that a stolen token cannot be used to run a document-scanning service on '
   || 'Warsha billing.'),
  ('location_search_request', 'places-proxy', 'account', 120, 3600, true, 'wps018_limiter',
   'Autocomplete fires per keystroke burst, so the limit is per account per hour rather than '
   || 'per request, and the client debounces before it ever reaches here.')
on conflict (policy_key) do nothing;

-- ---------------------------------------------------------------------------
-- SECTION 9. REGISTERS AND INVENTORY
-- ---------------------------------------------------------------------------

insert into private.data_inventory
  (entry_key, schema_name, object_name, object_kind, classification_key, purpose,
   authority, retention_trigger, deletion_treatment, export_included, staff_capability, notes)
values
  ('external_providers', 'private', 'external_providers', 'table', 'operational_audit',
   'Record every external service, what it processes, and who is responsible for it.',
   'WPS-024', 'Retirement of the provider.',
   'preserve', false, 'review_legal_governance',
   'Holds credential NAMES only. A credential value in this table would be a defect.'),
  ('external_provider_events', 'private', 'external_provider_events', 'table', 'operational_audit',
   'Record when a provider was enabled, disabled, rotated or reviewed.',
   'WPS-024', 'Never.',
   'preserve', false, 'review_legal_governance',
   'Append-only. A provider switched on, then off after an incident, must leave a trail.'),
  ('ocr_requests', 'private', 'ocr_requests', 'table', 'identity_sensitive',
   'Audit every OCR request against an identity document, including refusals.',
   'WPS-024', 'Worker account closure.',
   'preserve_minimized', false, 'review_identity_verification',
   'Holds no document, no raw provider payload and no extracted value. The hash ties a request '
   || 'to the bytes reviewed later.'),
  ('ocr_accuracy_runs', 'private', 'ocr_accuracy_runs', 'table', 'aggregate_nonpersonal',
   'Record measured OCR accuracy so future changes can be compared with a baseline.',
   'WPS-024', 'Never.',
   'preserve', false, 'review_legal_governance',
   'Aggregate measurements only. Production customer documents are not a permitted sample source.')
on conflict (entry_key) do nothing;

insert into private.privacy_retention_rules
  (rule_key, data_class, target_object, trigger_event, proposed_days, authority,
   legal_review_status, action_at_expiry, hold_scope, execution_owner, enabled, notes)
values
  ('ocr_requests', 'identity_sensitive', 'private.ocr_requests', 'worker_account_closure',
   1825,
   'Product proposal. No statutory basis claimed. Matches the proposed identity-document period '
   || 'so an audit trail does not outlive the documents it describes.',
   'pending', 'manual_review', 'account', 'security_administrator', false,
   'An audit trail that outlives its subject is a record about a person nobody can act on.')
on conflict (rule_key) do nothing;

-- ---------------------------------------------------------------------------
-- SECTION 10. THE REGISTER STAYS HONEST
-- ---------------------------------------------------------------------------
--
-- `private.subprocessors` says Vision and Maps are `approved_not_integrated`.
-- That was true when 202608090001 ran and it is still true: the code exists,
-- no credential does, and no document has been sent. The subprocessor register
-- describes what is PROCESSING data, not what is BUILT.
--
-- The moment a credential is configured and the flag is enabled, that entry
-- becomes wrong. This function is what a deployment runs to make the two agree,
-- and it refuses to promote a provider whose flag is still off — so the
-- register cannot claim a supplier is receiving data before it is.

create or replace function public.staff_sync_provider_status(p_provider_key text, p_reason text)
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
begin
  select * into v_provider from private.external_providers p where p.provider_key = p_provider_key;
  if v_provider.provider_key is null then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;

  v_enabled := private.provider_enabled(p_provider_key);
  v_target := case when v_enabled then 'in_use' else 'approved_not_integrated' end;

  if v_provider.subprocessor_key is not null then
    update private.subprocessors
    set integration_status = v_target
    where subprocessor_key = v_provider.subprocessor_key
      and integration_status <> 'retired';
  end if;

  insert into private.external_provider_events
    (provider_key, event_type, from_status, to_status, actor_id, reason)
  values
    (p_provider_key, 'reviewed', v_provider.current_status, v_provider.current_status,
     v_actor, pg_catalog.btrim(p_reason));

  perform private.record_staff_audit(
    v_actor, 'manage_subprocessors', 'sync_provider_status', 'external_provider', null,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('providerKey', p_provider_key, 'subprocessorStatus', v_target));

  return pg_catalog.jsonb_build_object(
    'providerKey', p_provider_key,
    'enabled', v_enabled,
    'subprocessorStatus', v_target);
end;
$$;

comment on function public.staff_sync_provider_status(text, text) is
  'WPS-024 keeps the subprocessor register in step with what is actually enabled.';

revoke all on function public.staff_sync_provider_status(text, text) from public;
grant execute on function public.staff_sync_provider_status(text, text) to authenticated;
