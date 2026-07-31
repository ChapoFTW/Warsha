-- WPS-008 Marketplace Intelligence durable model.
-- Forward-only and fail-closed: production activation requires explicit
-- configuration plus an enabled authoritative scheduler.

create table private.marketplace_configuration (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  scheduler_enabled boolean not null default false,
  policy_version integer not null default 1 check (policy_version > 0),
  maximum_radius_km numeric(6,2) not null default 50 check (maximum_radius_km between 1 and 250),
  wave_radii_km numeric(6,2)[] not null default array[5,15,30,50]::numeric[],
  first_wave_size integer not null default 3 check (first_wave_size between 1 and 20),
  maximum_invitations integer not null default 20 check (maximum_invitations between 1 and 100),
  useful_quote_target integer not null default 5 check (useful_quote_target between 1 and 20),
  wave_cadence_seconds integer not null default 60 check (wave_cadence_seconds between 15 and 600),
  request_lifetime_seconds integer not null default 600 check (request_lifetime_seconds between 60 and 3600),
  initial_collection_seconds integer not null default 120 check (initial_collection_seconds between 0 and 600),
  confirmation_timeout_seconds integer not null default 120 check (confirmation_timeout_seconds between 30 and 900),
  edit_window_seconds integer not null default 300 check (edit_window_seconds between 30 and 900),
  worker_no_show_seconds integer not null default 900 check (worker_no_show_seconds between 300 and 3600),
  fixed_buffer_minutes integer not null default 30 check (fixed_buffer_minutes = 30),
  ranking_policy jsonb not null default '{"version":"best-value-v1","qualityFloor":0.35,"fairnessBound":0.08,"newWorkerBound":0.04}'::jsonb,
  rate_limits jsonb not null default '{"customerCreatesPerHour":10,"workerResponsesPerMinute":20}'::jsonb,
  routing_policy jsonb not null default '{"provider":null,"roadFactor":null,"averageUrbanSpeedKmh":null}'::jsonb,
  evidence_retention_days integer,
  analytics_retention_days integer,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references public.profiles(id),
  check (pg_catalog.cardinality(wave_radii_km) between 1 and 8),
  check (maximum_invitations >= first_wave_size),
  check (maximum_invitations >= useful_quote_target),
  check (evidence_retention_days is null or evidence_retention_days between 1 and 3650),
  check (analytics_retention_days is null or analytics_retention_days between 1 and 3650)
);

insert into private.marketplace_configuration(singleton) values (true);

create table private.marketplace_configuration_history (
  id bigint generated always as identity primary key,
  policy_version integer not null,
  configuration jsonb not null,
  changed_at timestamptz not null default pg_catalog.now(),
  changed_by uuid references public.profiles(id)
);

create table private.marketplace_category_warranty_configuration (
  category_id text primary key references public.service_categories(id),
  enabled boolean not null default false,
  duration_days integer check (duration_days between 1 and 365),
  policy_version integer not null default 1 check (policy_version > 0),
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references public.profiles(id),
  check ((enabled and duration_days is not null) or (not enabled and duration_days is null))
);

insert into private.marketplace_category_warranty_configuration(category_id)
select id from public.service_categories where is_active and deleted_at is null
on conflict (category_id) do nothing;

create table private.worker_matching_locations (
  provider_id uuid primary key references public.provider_profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  source text not null check (source in ('verified_profile','verified_service_area','operations')),
  verification_state text not null check (verification_state in ('verified','stale','rejected')),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.provider_emergency_categories (
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  category_id text not null references public.service_categories(id),
  enabled boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key(provider_id, category_id)
);

create table public.marketplace_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id),
  flow_kind text not null check (flow_kind in ('browse_worker','get_quotes','emergency','rescue','comeback')),
  status text not null default 'draft' check (status in ('draft','matching','collecting_quotes','customer_reviewing','selection_pending_confirmation','worker_confirmed','converted_to_booking','rescue_matching','cancelled','expired','closed')),
  category_id text not null references public.service_categories(id),
  service_id uuid references public.services(id),
  targeted_provider_id uuid references public.provider_profiles(id),
  excluded_provider_id uuid references public.provider_profiles(id),
  replacement_for_request_id uuid references public.marketplace_requests(id),
  retry_for_request_id uuid references public.marketplace_requests(id),
  rescue_for_booking_id uuid references public.bookings(id),
  comeback_for_booking_id uuid references public.bookings(id),
  current_revision integer not null default 1 check (current_revision > 0),
  issue_description text not null check (pg_catalog.length(issue_description) between 8 and 2000),
  notes text not null default '' check (pg_catalog.length(notes) <= 2000),
  complexity text check (complexity in ('simple','standard','complex','unknown')),
  schedule_kind text not null check (schedule_kind in ('asap','today','scheduled','flexible')),
  requested_start_at timestamptz,
  requested_end_at timestamptz,
  timezone text not null default 'Africa/Cairo' check (timezone = 'Africa/Cairo'),
  estimated_duration_minutes integer check (estimated_duration_minutes between 15 and 1440),
  payment_compatibility text not null default 'either' check (payment_compatibility in ('cash','online','either')),
  approximate_governorate text not null check (pg_catalog.length(approximate_governorate) between 1 and 100),
  approximate_district text not null default '' check (pg_catalog.length(approximate_district) <= 100),
  coarse_area_id text not null check (pg_catalog.length(coarse_area_id) between 1 and 120),
  edit_deadline_at timestamptz not null,
  collection_not_before timestamptz not null,
  expires_at timestamptz not null,
  selected_quote_id uuid,
  selection_version integer not null default 0 check (selection_version >= 0),
  selected_at timestamptz,
  confirmation_deadline_at timestamptz,
  confirmed_at timestamptz,
  converted_booking_id uuid,
  approved_emergency_surcharge_minor bigint check (approved_emergency_surcharge_minor >= 0),
  emergency_approval_version integer,
  idempotency_key text not null check (pg_catalog.length(idempotency_key) between 16 and 200),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  cancelled_at timestamptz,
  closed_at timestamptz,
  unique(customer_id, idempotency_key),
  check (flow_kind <> 'browse_worker' or targeted_provider_id is not null),
  check ((flow_kind = 'rescue') = (rescue_for_booking_id is not null)),
  check ((flow_kind = 'comeback') = (comeback_for_booking_id is not null)),
  check (service_id is null or category_id is not null),
  check (requested_end_at is null or (requested_start_at is not null and requested_end_at > requested_start_at)),
  check (schedule_kind <> 'flexible' or (requested_start_at is not null and requested_end_at is not null)),
  check (expires_at > created_at and edit_deadline_at > created_at and collection_not_before >= created_at),
  check (replacement_for_request_id is null or replacement_for_request_id <> id),
  check (retry_for_request_id is null or retry_for_request_id <> id),
  check (flow_kind <> 'emergency' or selected_quote_id is null),
  check (
    status not in ('selection_pending_confirmation','worker_confirmed','converted_to_booking','closed')
    or selected_quote_id is not null
    or (flow_kind = 'emergency' and status in ('worker_confirmed','converted_to_booking','closed'))
  ),
  check ((converted_booking_id is not null) = (status in ('converted_to_booking','closed')))
);

create table private.marketplace_request_locations (
  request_id uuid primary key references public.marketplace_requests(id) on delete cascade,
  address_id uuid not null references public.addresses(id),
  exact_address_snapshot text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  source text not null check (source in ('customer_address','verified_address','operations')),
  verification_state text not null check (verification_state in ('unverified','verified','stale')),
  created_at timestamptz not null default pg_catalog.now()
);

create table public.marketplace_request_revisions (
  request_id uuid not null references public.marketplace_requests(id) on delete cascade,
  revision integer not null check (revision > 0),
  classification text not null check (classification in ('initial','minor','major')),
  change_set jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default pg_catalog.now(),
  idempotency_key text not null,
  replacement_request_id uuid references public.marketplace_requests(id),
  primary key(request_id, revision),
  unique(created_by, idempotency_key)
);

create table public.marketplace_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketplace_requests(id) on delete cascade,
  revision integer not null,
  uploader_id uuid not null references public.profiles(id),
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  attachment_kind text not null check (attachment_kind in ('issue','clarification')),
  created_at timestamptz not null default pg_catalog.now(),
  invalidated_at timestamptz,
  foreign key(request_id, revision) references public.marketplace_request_revisions(request_id, revision)
);

create table private.marketplace_matching_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketplace_requests(id) on delete cascade,
  request_revision integer not null,
  reason text not null check (reason in ('initial','additional_wave','retry','rescue','emergency_expansion')),
  policy_version integer not null,
  configuration_snapshot jsonb not null,
  wave_number integer not null check (wave_number > 0),
  search_radius_km numeric(6,2) not null check (search_radius_km > 0),
  status text not null check (status in ('running','completed','failed')),
  candidate_count integer not null default 0,
  eligible_count integer not null default 0,
  invited_count integer not null default 0,
  response_count integer not null default 0,
  quote_count integer not null default 0,
  idempotency_key text not null,
  started_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  failure_code text,
  unique(request_id, idempotency_key)
);

create table private.marketplace_candidate_scores (
  matching_run_id uuid not null references private.marketplace_matching_runs(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  eligible boolean not null,
  exclusion_codes text[] not null default '{}',
  distance_km numeric(8,3),
  eta_minutes integer,
  components jsonb not null default '{}'::jsonb,
  fairness_adjustment numeric(8,6) not null default 0,
  new_worker_adjustment numeric(8,6) not null default 0,
  final_score numeric(12,6),
  rank integer,
  policy_version integer not null,
  calculated_at timestamptz not null default pg_catalog.now(),
  primary key(matching_run_id, provider_id)
);

create table public.quote_invitations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketplace_requests(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  matching_run_id uuid not null references private.marketplace_matching_runs(id),
  request_revision integer not null,
  wave_number integer not null check (wave_number > 0),
  status text not null default 'invited' check (status in ('invited','viewed','quoted','declined','withdrawn','expired','request_closed','worker_ineligible','accepted')),
  invited_at timestamptz not null default pg_catalog.now(),
  viewed_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz not null,
  closed_at timestamptz,
  outcome_reason text,
  unique(request_id, provider_id)
);

create table public.worker_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketplace_requests(id) on delete cascade,
  invitation_id uuid not null unique references public.quote_invitations(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted','revised','selected','rejected','withdrawn','expired','invalidated_by_request_change')),
  current_revision integer not null default 1 check (current_revision > 0),
  price_minor bigint not null check (price_minor between 1 and 1000000000),
  currency char(3) not null default 'EGP' check (currency = 'EGP'),
  proposed_start_at timestamptz,
  eta_minutes integer check (eta_minutes between 0 and 1440),
  estimated_duration_minutes integer not null check (estimated_duration_minutes between 15 and 1440),
  message text not null default '' check (pg_catalog.length(message) <= 1000),
  labor_included boolean not null,
  materials_inclusion text not null check (materials_inclusion in ('included','excluded','partial','unknown')),
  materials_explanation text not null default '' check (pg_catalog.length(materials_explanation) <= 500),
  warranty_days integer check (warranty_days between 1 and 365),
  supported_payment_methods text[] not null,
  submitted_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  withdrawn_at timestamptz,
  selected_at timestamptz,
  rejected_at timestamptz,
  idempotency_key text not null,
  unique(request_id, provider_id),
  unique(provider_id, idempotency_key),
  check (pg_catalog.cardinality(supported_payment_methods) between 1 and 2),
  check (supported_payment_methods <@ array['cash','online']::text[])
);

create table public.worker_quote_revisions (
  quote_id uuid not null references public.worker_quotes(id) on delete cascade,
  revision integer not null check (revision > 0),
  terms jsonb not null,
  revision_reason text not null default '',
  created_at timestamptz not null default pg_catalog.now(),
  actor_id uuid not null references public.profiles(id),
  idempotency_key text not null,
  primary key(quote_id, revision),
  unique(actor_id, idempotency_key)
);

alter table public.marketplace_requests
  add constraint marketplace_requests_selected_quote_fk
  foreign key(selected_quote_id) references public.worker_quotes(id);

create table private.worker_marketplace_metrics (
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  window_days integer not null,
  metrics jsonb not null,
  sample_size integer not null default 0,
  as_of timestamptz not null,
  policy_version integer not null,
  primary key(provider_id, window_days, policy_version)
);

create table private.worker_pricing_profiles (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  category_id text not null references public.service_categories(id),
  service_id uuid references public.services(id),
  coarse_area_id text,
  sample_size integer not null check (sample_size >= 0),
  median_minor bigint,
  p25_minor bigint,
  p75_minor bigint,
  original_quote_median_minor bigint,
  quote_to_final_variance numeric,
  revision_frequency numeric,
  dimensions jsonb not null default '{}'::jsonb,
  last_completion_at timestamptz,
  as_of timestamptz not null,
  confidence_state text not null check (confidence_state in ('neutral','low','sufficient')),
  policy_version integer not null
);

create table private.marketplace_pricing_benchmarks (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('service_area','category_area','service','category')),
  category_id text not null references public.service_categories(id),
  service_id uuid references public.services(id),
  coarse_area_id text,
  sample_size integer not null check (sample_size >= 0),
  median_minor bigint,
  p25_minor bigint,
  p75_minor bigint,
  as_of timestamptz not null,
  policy_version integer not null
);

create table private.worker_opportunity_state (
  provider_id uuid primary key references public.provider_profiles(id) on delete cascade,
  recent_invitations integer not null default 0,
  recent_wins integer not null default 0,
  last_opportunity_at timestamptz,
  calculated_adjustment numeric(8,6) not null default 0,
  as_of timestamptz not null,
  policy_version integer not null
);

create table private.worker_capacity_projections (
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  bucket_start timestamptz not null,
  committed_workload_minutes integer not null default 0,
  travel_minutes integer not null default 0,
  buffer_minutes integer not null default 30 check (buffer_minutes = 30),
  has_conflict boolean not null default false,
  source_booking_version text not null,
  as_of timestamptz not null,
  expires_at timestamptz not null,
  primary key(provider_id, bucket_start)
);

create table public.marketplace_cancellation_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.marketplace_requests(id),
  booking_id uuid references public.bookings(id),
  actor_id uuid not null references public.profiles(id),
  actor_class text not null check (actor_class in ('customer','worker','system','staff')),
  phase text not null,
  reason_code text not null,
  reason_text text not null default '' check (pg_catalog.length(reason_text) <= 500),
  was_en_route boolean not null default false,
  had_arrived boolean not null default false,
  replacement_outcome text,
  occurred_at timestamptz not null default pg_catalog.now(),
  idempotency_key text not null,
  unique(actor_id, idempotency_key),
  check (request_id is not null or booking_id is not null)
);

create table public.marketplace_no_show_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.marketplace_requests(id),
  booking_id uuid not null references public.bookings(id),
  reporter_id uuid not null references public.profiles(id),
  reported_party_id uuid not null references public.profiles(id),
  reported_party_class text not null check (reported_party_class in ('customer','worker')),
  eligible_at timestamptz not null,
  reported_at timestamptz not null default pg_catalog.now(),
  milestone_snapshot jsonb not null,
  approximate_evidence jsonb not null default '{}'::jsonb,
  review_state text not null default 'recorded' check (review_state in ('recorded','under_review','confirmed','dismissed')),
  idempotency_key text not null,
  unique(reporter_id, idempotency_key),
  unique(booking_id, reported_party_class)
);

create table public.marketplace_running_late_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  reporting_provider_id uuid not null references public.provider_profiles(id),
  delay_minutes integer not null check (delay_minutes between 1 and 240),
  reason_code text not null check (reason_code in ('traffic','previous_job','transport','emergency','other')),
  note text not null default '' check (pg_catalog.length(note) <= 300),
  previous_eta_at timestamptz not null,
  latest_eta_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  superseded_at timestamptz,
  idempotency_key text not null,
  unique(reporting_provider_id, idempotency_key)
);

create table public.marketplace_comeback_requests (
  id uuid primary key default gen_random_uuid(),
  marketplace_request_id uuid not null unique references public.marketplace_requests(id),
  original_booking_id uuid not null references public.bookings(id),
  original_provider_id uuid not null references public.provider_profiles(id),
  customer_id uuid not null references public.customer_profiles(id),
  issue_details text not null,
  warranty_policy_version integer not null,
  warranty_expires_at timestamptz not null,
  status text not null default 'offered_to_original_worker' check (status in ('offered_to_original_worker','accepted','declined','expired','closed')),
  created_at timestamptz not null default pg_catalog.now()
);

create table private.emergency_price_approvals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id),
  provider_id uuid references public.provider_profiles(id),
  category_id text not null references public.service_categories(id),
  service_id uuid references public.services(id),
  surcharge_minor bigint not null check (surcharge_minor >= 0),
  pricing_version integer not null,
  token text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

create table private.emergency_dispatch_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketplace_requests(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id),
  invitation_id uuid not null unique references public.quote_invitations(id),
  wave_number integer not null,
  eta_minutes integer,
  state text not null check (state in ('invited','viewed','accepted','declined','expired','closed','ineligible')),
  attempted_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique(request_id, provider_id)
);

create unique index emergency_dispatch_one_winner_idx
on private.emergency_dispatch_attempts(request_id) where state = 'accepted';

create table private.marketplace_rescue_attempts (
  id uuid primary key default gen_random_uuid(),
  source_request_id uuid not null references public.marketplace_requests(id),
  source_booking_id uuid not null references public.bookings(id),
  rescue_request_id uuid references public.marketplace_requests(id),
  cancelled_provider_id uuid not null references public.provider_profiles(id),
  state text not null check (state in ('created','matching','customer_reviewing','converted','expired','failed')),
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz
);

create unique index marketplace_rescue_active_booking_idx
on private.marketplace_rescue_attempts(source_booking_id)
where state in ('created','matching','customer_reviewing','converted');

create table private.marketplace_events (
  id bigint generated always as identity primary key,
  actor_class text not null check (actor_class in ('customer','worker','system','staff')),
  actor_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  policy_version integer not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default pg_catalog.now(),
  dedupe_key text not null unique
);

create table private.marketplace_jobs (
  id uuid primary key default gen_random_uuid(),
  job_kind text not null check (job_kind in ('additional_wave','expire_request','expire_invitation','expire_quote','expire_confirmation','rescue','refresh_metrics','refresh_pricing','refresh_capacity')),
  request_id uuid references public.marketplace_requests(id) on delete cascade,
  provider_id uuid references public.provider_profiles(id) on delete cascade,
  run_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending','leased','succeeded','retryable_failed','terminal_failed','cancelled')),
  attempt_count integer not null default 0,
  maximum_attempts integer not null default 5 check (maximum_attempts between 1 and 20),
  lease_owner text,
  lease_expires_at timestamptz,
  dedupe_key text not null,
  last_error_code text,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz
);

create unique index marketplace_jobs_active_dedupe_idx
on private.marketplace_jobs(job_kind, dedupe_key)
where state in ('pending','leased','retryable_failed');

alter table public.bookings
  add column if not exists marketplace_request_id uuid references public.marketplace_requests(id),
  add column if not exists selected_worker_quote_id uuid references public.worker_quotes(id),
  add column if not exists rescue_attempt_id uuid references private.marketplace_rescue_attempts(id);

create unique index if not exists bookings_marketplace_request_unique_idx
on public.bookings(marketplace_request_id) where marketplace_request_id is not null;
create unique index if not exists bookings_selected_worker_quote_unique_idx
on public.bookings(selected_worker_quote_id) where selected_worker_quote_id is not null;

alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_user_dedupe_unique_idx
on public.notifications(user_id, type, dedupe_key) where dedupe_key is not null;

create index marketplace_requests_customer_updated_idx on public.marketplace_requests(customer_id, updated_at desc);
create index marketplace_requests_lifecycle_idx on public.marketplace_requests(status, expires_at);
create index quote_invitations_provider_actionable_idx on public.quote_invitations(provider_id, status, invited_at desc);
create index quote_invitations_request_status_idx on public.quote_invitations(request_id, status);
create index worker_quotes_request_active_idx on public.worker_quotes(request_id, status, submitted_at);
create index marketplace_jobs_due_idx on private.marketplace_jobs(state, run_at) where state in ('pending','retryable_failed');
create index marketplace_jobs_lease_idx on private.marketplace_jobs(lease_expires_at) where state = 'leased';
create index marketplace_cancellations_booking_idx on public.marketplace_cancellation_events(booking_id, occurred_at desc);
create index marketplace_no_shows_booking_idx on public.marketplace_no_show_events(booking_id, reported_at desc);
create index marketplace_running_late_booking_idx on public.marketplace_running_late_events(booking_id, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'provider_emergency_categories','marketplace_requests','marketplace_request_revisions',
    'marketplace_request_attachments','quote_invitations','worker_quotes','worker_quote_revisions',
    'marketplace_cancellation_events','marketplace_no_show_events','marketplace_running_late_events',
    'marketplace_comeback_requests'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security', table_name);
    execute pg_catalog.format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end $$;

revoke all on table
  private.marketplace_configuration,
  private.marketplace_configuration_history,
  private.marketplace_category_warranty_configuration,
  private.worker_matching_locations,
  private.marketplace_request_locations,
  private.marketplace_matching_runs,
  private.marketplace_candidate_scores,
  private.worker_marketplace_metrics,
  private.worker_pricing_profiles,
  private.marketplace_pricing_benchmarks,
  private.worker_opportunity_state,
  private.worker_capacity_projections,
  private.emergency_price_approvals,
  private.emergency_dispatch_attempts,
  private.marketplace_rescue_attempts,
  private.marketplace_events,
  private.marketplace_jobs
from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-request-attachments','marketplace-request-attachments',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false, file_size_limit=10485760, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists marketplace_request_attachments_customer_insert on storage.objects;
create policy marketplace_request_attachments_customer_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'marketplace-request-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists marketplace_request_attachments_customer_read on storage.objects;
create policy marketplace_request_attachments_customer_read on storage.objects
for select to authenticated using (
  bucket_id = 'marketplace-request-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists marketplace_request_attachments_customer_delete on storage.objects;
create policy marketplace_request_attachments_customer_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'marketplace-request-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create trigger marketplace_requests_updated_at
before update on public.marketplace_requests
for each row execute function private.set_updated_at();

create trigger worker_quotes_updated_at
before update on public.worker_quotes
for each row execute function private.set_updated_at();

alter publication supabase_realtime add table public.marketplace_requests;
alter publication supabase_realtime add table public.quote_invitations;
alter publication supabase_realtime add table public.worker_quotes;
