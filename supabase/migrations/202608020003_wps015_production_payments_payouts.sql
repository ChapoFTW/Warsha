-- WPS-015 — Production Payments, Payouts & Reconciliation
--
-- This migration extends the WPS-007 financial system. It does NOT create a
-- second ledger, a second payment state machine, or a parallel money model.
-- Every authoritative posting continues to flow through
-- private.post_financial_transaction with the existing transaction types.
--
-- Everything added here is provider-neutral and fails closed. No provider is
-- selected, no credential is stored, no webhook is enabled, no scheduler is
-- activated, and no live or sandbox mode can be reached without explicit,
-- separately authorized configuration rows that this migration deliberately
-- does not create.

-- ---------------------------------------------------------------------------
-- 1. Configuration: environment modes, provider selection, maintenance
-- ---------------------------------------------------------------------------

alter table private.payment_configuration
  drop constraint if exists payment_configuration_gateway_mode_check;
alter table private.payment_configuration
  add constraint payment_configuration_gateway_mode_check
  check (gateway_mode in ('disabled','mock','sandbox','live'));

alter table private.payment_configuration
  drop constraint if exists payment_configuration_payout_mode_check;
alter table private.payment_configuration
  add constraint payment_configuration_payout_mode_check
  check (payout_mode in ('disabled','mock','sandbox','live'));

alter table private.payment_configuration
  add column if not exists active_payment_provider text,
  add column if not exists active_payout_provider text,
  add column if not exists webhook_replay_tolerance_seconds integer not null default 300,
  add column if not exists reconciliation_enabled boolean not null default false,
  add column if not exists chargeback_handling_enabled boolean not null default false,
  add column if not exists maintenance_mode boolean not null default false,
  add column if not exists maintenance_reason text;

alter table private.payment_configuration
  drop constraint if exists payment_configuration_replay_tolerance_check;
alter table private.payment_configuration
  add constraint payment_configuration_replay_tolerance_check
  check (webhook_replay_tolerance_seconds between 30 and 3600);

-- A live or sandbox surface may never be selected without naming its provider.
alter table private.payment_configuration
  drop constraint if exists payment_configuration_gateway_provider_required_check;
alter table private.payment_configuration
  add constraint payment_configuration_gateway_provider_required_check
  check (gateway_mode in ('disabled','mock') or active_payment_provider is not null);

alter table private.payment_configuration
  drop constraint if exists payment_configuration_payout_provider_required_check;
alter table private.payment_configuration
  add constraint payment_configuration_payout_provider_required_check
  check (payout_mode in ('disabled','mock') or active_payout_provider is not null);

alter table private.payment_configuration
  drop constraint if exists payment_configuration_maintenance_reason_check;
alter table private.payment_configuration
  add constraint payment_configuration_maintenance_reason_check
  check (not maintenance_mode or pg_catalog.length(pg_catalog.btrim(coalesce(maintenance_reason,''))) between 3 and 300);

-- ---------------------------------------------------------------------------
-- 2. Provider registry and merchant accounts (capabilities only, never secrets)
-- ---------------------------------------------------------------------------

create table if not exists private.payment_provider_registry (
  provider_key text primary key,
  display_name text not null,
  supports_cards boolean not null default false,
  supports_meeza boolean not null default false,
  supports_mobile_wallet boolean not null default false,
  supports_hosted_checkout boolean not null default false,
  supports_tokenization boolean not null default false,
  supports_partial_refund boolean not null default false,
  supports_webhook_signing boolean not null default false,
  supports_idempotency boolean not null default false,
  supports_reconciliation_export boolean not null default false,
  supports_payouts boolean not null default false,
  supports_bank_payout boolean not null default false,
  supports_wallet_payout boolean not null default false,
  selection_status text not null default 'candidate',
  evidence_uri text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint payment_provider_registry_key_check
    check (provider_key ~ '^[a-z0-9_]{2,40}$'),
  constraint payment_provider_registry_selection_check
    check (selection_status in ('candidate','approved','rejected','retired'))
);
revoke all on private.payment_provider_registry from public, anon, authenticated;

-- Merchant/account bindings. Booleans record whether a secret has been
-- registered out of band; the secret value itself is never stored here.
create table if not exists private.payment_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null references private.payment_provider_registry(provider_key) on delete restrict,
  environment text not null,
  account_label text not null,
  external_account_reference text,
  api_credentials_registered boolean not null default false,
  webhook_secret_registered boolean not null default false,
  payout_credentials_registered boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint payment_provider_accounts_environment_check
    check (environment in ('sandbox','live')),
  constraint payment_provider_accounts_label_check
    check (pg_catalog.length(pg_catalog.btrim(account_label)) between 2 and 80),
  unique (provider_key, environment)
);
revoke all on private.payment_provider_accounts from public, anon, authenticated;

-- Server-authoritative payment method availability. The client never decides
-- which methods exist; it only renders what this table permits.
create table if not exists private.payment_method_availability (
  id uuid primary key default gen_random_uuid(),
  method_key text not null,
  environment text not null,
  provider_key text references private.payment_provider_registry(provider_key) on delete restrict,
  enabled boolean not null default false,
  unavailable_reason_code text,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint payment_method_availability_method_check
    check (method_key in ('card','meeza_card','mobile_wallet','hosted_checkout','cash')),
  constraint payment_method_availability_environment_check
    check (environment in ('disabled','mock','sandbox','live')),
  constraint payment_method_availability_reason_check
    check (enabled or unavailable_reason_code is null
           or unavailable_reason_code in ('provider_not_selected','provider_unsupported',
                                          'commercially_unapproved','maintenance','cash_debt_restricted')),
  unique (method_key, environment)
);
revoke all on private.payment_method_availability from public, anon, authenticated;

-- Cash is the only method that is authoritative today. It is governed by
-- WPS-007 and remains available in every environment. Every online method
-- stays disabled until a provider is approved through the decision gate.
insert into private.payment_method_availability(method_key, environment, enabled, unavailable_reason_code)
values
  ('cash','disabled',true,null),
  ('cash','mock',true,null),
  ('cash','sandbox',true,null),
  ('cash','live',true,null),
  ('card','disabled',false,'provider_not_selected'),
  ('card','mock',false,'provider_not_selected'),
  ('card','sandbox',false,'provider_not_selected'),
  ('card','live',false,'provider_not_selected'),
  ('meeza_card','disabled',false,'provider_not_selected'),
  ('meeza_card','mock',false,'provider_not_selected'),
  ('meeza_card','sandbox',false,'provider_not_selected'),
  ('meeza_card','live',false,'provider_not_selected'),
  ('mobile_wallet','disabled',false,'provider_not_selected'),
  ('mobile_wallet','mock',false,'provider_not_selected'),
  ('mobile_wallet','sandbox',false,'provider_not_selected'),
  ('mobile_wallet','live',false,'provider_not_selected'),
  ('hosted_checkout','disabled',false,'provider_not_selected'),
  ('hosted_checkout','mock',false,'provider_not_selected'),
  ('hosted_checkout','sandbox',false,'provider_not_selected'),
  ('hosted_checkout','live',false,'provider_not_selected')
on conflict (method_key, environment) do nothing;

-- Secret metadata only. No secret value, ciphertext, or key material is ever
-- stored in the database.
create table if not exists private.payment_secret_metadata (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null references private.payment_provider_registry(provider_key) on delete restrict,
  environment text not null,
  secret_role text not null,
  registered boolean not null default false,
  last_rotated_at timestamptz,
  rotation_due_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint payment_secret_metadata_environment_check
    check (environment in ('sandbox','live')),
  constraint payment_secret_metadata_role_check
    check (secret_role in ('api_key','webhook_signing','payout_api_key')),
  unique (provider_key, environment, secret_role)
);
revoke all on private.payment_secret_metadata from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Payment attempt extension (provider reference, expiry, review state)
-- ---------------------------------------------------------------------------

alter table private.payment_attempts
  drop constraint if exists payment_attempts_provider_adapter_check;
alter table private.payment_attempts
  add constraint payment_attempts_provider_adapter_check
  check (provider_adapter ~ '^[a-z0-9_]{2,40}$');

alter table private.payment_attempts
  drop constraint if exists payment_attempts_status_check;
alter table private.payment_attempts
  add constraint payment_attempts_status_check
  check (status in ('created','pending','succeeded','failed','cancelled','expired','requires_review'));

alter table private.payment_attempts
  add column if not exists environment text not null default 'disabled',
  add column if not exists provider_reference text,
  add column if not exists checkout_expires_at timestamptz,
  add column if not exists return_route text,
  add column if not exists failure_code text,
  add column if not exists terminal_at timestamptz;

alter table private.payment_attempts
  drop constraint if exists payment_attempts_environment_check;
alter table private.payment_attempts
  add constraint payment_attempts_environment_check
  check (environment in ('disabled','mock','sandbox','live'));

-- A provider reference must be unique per provider+environment so that a
-- replayed or duplicated provider record can never create a second attempt.
create unique index if not exists payment_attempts_provider_reference_idx
  on private.payment_attempts(provider_adapter, environment, provider_reference)
  where provider_reference is not null;

-- ---------------------------------------------------------------------------
-- 4. Webhook boundary: verification metadata, quarantine, replay protection
-- ---------------------------------------------------------------------------

alter table private.payment_gateway_events
  drop constraint if exists payment_gateway_events_processing_status_check;
alter table private.payment_gateway_events
  add constraint payment_gateway_events_processing_status_check
  check (processing_status in ('received','processed','ignored','failed','duplicate','quarantined'));

alter table private.payment_gateway_events
  add column if not exists environment text not null default 'disabled',
  add column if not exists provider_account_id uuid references private.payment_provider_accounts(id) on delete set null,
  add column if not exists signature_algorithm text,
  add column if not exists provider_event_at timestamptz,
  add column if not exists replay_window_ok boolean,
  add column if not exists quarantine_reason text,
  add column if not exists processed_at timestamptz;

alter table private.payment_gateway_events
  drop constraint if exists payment_gateway_events_environment_check;
alter table private.payment_gateway_events
  add constraint payment_gateway_events_environment_check
  check (environment in ('disabled','mock','sandbox','live'));

-- One provider event is processed exactly once per provider+environment.
create unique index if not exists payment_gateway_events_provider_identity_idx
  on private.payment_gateway_events(gateway_name, environment, gateway_event_id);

create table if not exists private.payment_webhook_quarantine (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  environment text not null,
  raw_body_sha256 text not null,
  reason_code text not null,
  signature_verified boolean not null default false,
  received_at timestamptz not null default pg_catalog.now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  resolution text,
  constraint payment_webhook_quarantine_environment_check
    check (environment in ('disabled','mock','sandbox','live')),
  constraint payment_webhook_quarantine_reason_check
    check (reason_code in ('signature_invalid','replay_window_exceeded','unknown_event_type',
                           'schema_invalid','environment_mismatch','account_mismatch',
                           'amount_mismatch','currency_mismatch','unknown_attempt')),
  constraint payment_webhook_quarantine_hash_check
    check (raw_body_sha256 ~ '^[0-9a-f]{64}$'),
  constraint payment_webhook_quarantine_resolution_check
    check (resolution is null or resolution in ('discarded','replayed','manually_reconciled'))
);
revoke all on private.payment_webhook_quarantine from public, anon, authenticated;
create index if not exists payment_webhook_quarantine_open_idx
  on private.payment_webhook_quarantine(received_at desc) where reviewed_at is null;

-- ---------------------------------------------------------------------------
-- 5. Settlements and reconciliation
-- ---------------------------------------------------------------------------

create table if not exists private.payment_settlements (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  environment text not null,
  provider_settlement_reference text not null,
  settlement_date date not null,
  currency text not null default 'EGP',
  gross_minor bigint not null default 0,
  fee_minor bigint not null default 0,
  refund_minor bigint not null default 0,
  chargeback_minor bigint not null default 0,
  net_minor bigint not null default 0,
  imported_at timestamptz not null default pg_catalog.now(),
  constraint payment_settlements_currency_check check (currency = 'EGP'),
  constraint payment_settlements_environment_check check (environment in ('mock','sandbox','live')),
  constraint payment_settlements_amounts_check
    check (gross_minor >= 0 and fee_minor >= 0 and refund_minor >= 0
           and chargeback_minor >= 0 and net_minor >= -1000000000
           and gross_minor <= 1000000000),
  unique (provider_key, environment, provider_settlement_reference)
);
revoke all on private.payment_settlements from public, anon, authenticated;

create table if not exists private.payment_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references private.payment_settlements(id) on delete cascade,
  provider_transaction_reference text not null,
  line_type text not null,
  amount_minor bigint not null,
  fee_minor bigint not null default 0,
  currency text not null default 'EGP',
  payment_id uuid references public.financial_booking_payments(id) on delete set null,
  matched boolean not null default false,
  constraint payment_settlement_lines_currency_check check (currency = 'EGP'),
  constraint payment_settlement_lines_type_check
    check (line_type in ('payment','refund','chargeback','fee','payout','adjustment')),
  unique (settlement_id, provider_transaction_reference, line_type)
);
revoke all on private.payment_settlement_lines from public, anon, authenticated;

create table if not exists private.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  run_kind text not null,
  environment text not null,
  business_date date not null,
  status text not null default 'pending',
  started_at timestamptz not null default pg_catalog.now(),
  finished_at timestamptz,
  matched_count integer not null default 0,
  exception_count integer not null default 0,
  ledger_balanced boolean,
  idempotency_key text not null,
  constraint reconciliation_runs_kind_check
    check (run_kind in ('daily','manual','replay')),
  constraint reconciliation_runs_environment_check
    check (environment in ('mock','sandbox','live')),
  constraint reconciliation_runs_status_check
    check (status in ('pending','running','completed','failed','disabled')),
  unique (idempotency_key)
);
revoke all on private.reconciliation_runs from public, anon, authenticated;

create table if not exists private.reconciliation_exceptions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.reconciliation_runs(id) on delete cascade,
  exception_type text not null,
  severity text not null default 'warning',
  payment_id uuid references public.financial_booking_payments(id) on delete set null,
  provider_reference text,
  expected_minor bigint,
  observed_minor bigint,
  currency text,
  detail_code text,
  status text not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint reconciliation_exceptions_type_check
    check (exception_type in ('unmatched_provider_record','unmatched_warsha_record','amount_mismatch',
                              'currency_mismatch','duplicate_record','missing_webhook','late_webhook',
                              'orphan_provider_event','ledger_imbalance','payout_mismatch')),
  constraint reconciliation_exceptions_severity_check
    check (severity in ('info','warning','critical')),
  constraint reconciliation_exceptions_status_check
    check (status in ('open','investigating','resolved','accepted_difference')),
  constraint reconciliation_exceptions_note_check
    check (resolution_note is null or pg_catalog.length(pg_catalog.btrim(resolution_note)) between 3 and 500)
);
revoke all on private.reconciliation_exceptions from public, anon, authenticated;
create index if not exists reconciliation_exceptions_open_idx
  on private.reconciliation_exceptions(created_at desc) where status = 'open';

-- ---------------------------------------------------------------------------
-- 6. Chargebacks (payment-provider disputes; WPS-013 keeps service disputes)
-- ---------------------------------------------------------------------------

create table if not exists private.payment_chargebacks (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.financial_booking_payments(id) on delete restrict,
  provider_key text not null,
  environment text not null,
  provider_chargeback_reference text not null,
  amount_minor bigint not null,
  fee_minor bigint not null default 0,
  currency text not null default 'EGP',
  status text not null default 'opened',
  reason_code text,
  evidence_due_at timestamptz,
  financial_case_id uuid references public.provider_financial_cases(id) on delete set null,
  opened_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  constraint payment_chargebacks_currency_check check (currency = 'EGP'),
  constraint payment_chargebacks_environment_check check (environment in ('mock','sandbox','live')),
  constraint payment_chargebacks_amount_check
    check (amount_minor between 1 and 1000000000 and fee_minor between 0 and 1000000000),
  constraint payment_chargebacks_status_check
    check (status in ('opened','evidence_required','under_review','won','lost','reversed','cancelled')),
  unique (provider_key, environment, provider_chargeback_reference)
);
revoke all on private.payment_chargebacks from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Payout provider references (tokenized destinations, fail closed)
-- ---------------------------------------------------------------------------

create table if not exists private.payout_provider_references (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.provider_payout_destinations(id) on delete cascade,
  provider_key text not null,
  environment text not null,
  provider_token text,
  tokenization_status text not null default 'unavailable',
  verification_status text not null default 'unverified',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint payout_provider_references_environment_check
    check (environment in ('mock','sandbox','live')),
  constraint payout_provider_references_tokenization_check
    check (tokenization_status in ('unavailable','pending','tokenized','failed')),
  constraint payout_provider_references_verification_check
    check (verification_status in ('unverified','pending','verified','rejected')),
  -- Fail closed: a destination is only usable once the provider has tokenized
  -- it. Raw bank credentials and wallet PINs are never stored anywhere.
  constraint payout_provider_references_token_required_check
    check (tokenization_status <> 'tokenized' or provider_token is not null),
  unique (destination_id, provider_key, environment)
);
revoke all on private.payout_provider_references from public, anon, authenticated;

create table if not exists private.payout_provider_events (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid references public.provider_withdrawal_requests(id) on delete set null,
  provider_key text not null,
  environment text not null,
  provider_event_id text not null,
  event_type text not null,
  signature_verified boolean not null default false,
  raw_body_sha256 text not null,
  processing_status text not null default 'received',
  sanitized_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default pg_catalog.now(),
  processed_at timestamptz,
  constraint payout_provider_events_environment_check
    check (environment in ('mock','sandbox','live')),
  constraint payout_provider_events_status_check
    check (processing_status in ('received','processed','ignored','failed','duplicate','quarantined')),
  constraint payout_provider_events_type_check
    check (event_type in ('payout_processing','payout_succeeded','payout_failed','payout_cancelled','payout_returned')),
  constraint payout_provider_events_hash_check
    check (raw_body_sha256 ~ '^[0-9a-f]{64}$'),
  unique (provider_key, environment, provider_event_id)
);
revoke all on private.payout_provider_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Release scheduler runs (disabled by default)
-- ---------------------------------------------------------------------------

create table if not exists private.earning_release_scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  run_reason text not null default 'scheduled',
  status text not null,
  scanned_count integer not null default 0,
  released_count integer not null default 0,
  skipped_count integer not null default 0,
  idempotency_key text not null,
  started_at timestamptz not null default pg_catalog.now(),
  finished_at timestamptz,
  constraint earning_release_scheduler_runs_reason_check
    check (run_reason in ('scheduled','manual','replay','simulation')),
  constraint earning_release_scheduler_runs_status_check
    check (status in ('disabled','completed','failed','skipped')),
  unique (idempotency_key)
);
revoke all on private.earning_release_scheduler_runs from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Provider-neutral readiness helpers (fail closed)
-- ---------------------------------------------------------------------------

-- Returns the environment a surface may operate in. 'disabled' means the
-- surface is unavailable. A sandbox/live surface degrades to 'disabled'
-- whenever any required configuration row is missing.
create or replace function private.payment_surface_environment(p_surface text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_provider text;
  v_maintenance boolean;
  v_account private.payment_provider_accounts%rowtype;
  v_webhook_registered boolean;
begin
  if p_surface not in ('gateway','payout') then
    raise exception 'Unknown payment surface' using errcode = '22023';
  end if;
  select case when p_surface = 'gateway' then c.gateway_mode else c.payout_mode end,
         case when p_surface = 'gateway' then c.active_payment_provider else c.active_payout_provider end,
         c.maintenance_mode
    into v_mode, v_provider, v_maintenance
  from private.payment_configuration c
  where c.id;

  if v_mode is null or coalesce(v_maintenance, false) then
    return 'disabled';
  end if;
  if v_mode in ('disabled','mock') then
    return v_mode;
  end if;

  -- sandbox/live require a registered provider account for that exact
  -- environment. Sandbox and live credentials can never be mixed because the
  -- account row is unique per (provider_key, environment).
  if v_provider is null then
    return 'disabled';
  end if;
  select * into v_account
  from private.payment_provider_accounts a
  where a.provider_key = v_provider and a.environment = v_mode;
  if v_account.id is null or v_account.activated_at is null then
    return 'disabled';
  end if;

  if p_surface = 'gateway' then
    if not v_account.api_credentials_registered or not v_account.webhook_secret_registered then
      return 'disabled';
    end if;
    select s.registered into v_webhook_registered
    from private.payment_secret_metadata s
    where s.provider_key = v_provider and s.environment = v_mode and s.secret_role = 'webhook_signing';
    if not coalesce(v_webhook_registered, false) then
      return 'disabled';
    end if;
  else
    if not v_account.payout_credentials_registered then
      return 'disabled';
    end if;
  end if;

  return v_mode;
end;
$$;
revoke all on function private.payment_surface_environment(text) from public, anon, authenticated;

create or replace function private.payment_method_enabled(p_method_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.enabled
    from private.payment_method_availability a
    where a.method_key = p_method_key
      and a.environment = case when p_method_key = 'cash'
        then 'live'
        else private.payment_surface_environment('gateway') end
  ), false)
$$;
revoke all on function private.payment_method_enabled(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Client-facing capability and availability projections
-- ---------------------------------------------------------------------------

create or replace function public.get_production_payment_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gateway text := private.payment_surface_environment('gateway');
  v_payout text := private.payment_surface_environment('payout');
  v_config private.payment_configuration%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_config from private.payment_configuration c where c.id;
  return pg_catalog.jsonb_build_object(
    'currency', v_config.currency,
    'gatewayEnvironment', v_gateway,
    'payoutEnvironment', v_payout,
    'onlinePaymentsEnabled', v_gateway <> 'disabled',
    'onlinePaymentsDevelopmentOnly', v_gateway = 'mock',
    'payoutsEnabled', v_payout <> 'disabled',
    'payoutsDevelopmentOnly', v_payout = 'mock',
    'maintenanceMode', v_config.maintenance_mode,
    'reconciliationEnabled', v_config.reconciliation_enabled,
    'chargebackHandlingEnabled', v_config.chargeback_handling_enabled,
    'automaticReleaseSchedulerEnabled', v_config.automatic_release_scheduler_enabled,
    'minimumWithdrawalMinor', v_config.minimum_withdrawal_minor::text,
    'withdrawalFeeMinor', v_config.withdrawal_fee_minor::text,
    'releaseDelaySeconds', v_config.earnings_release_delay_seconds::text
  );
end;
$$;

-- Server-authoritative method list. The client renders only what this returns.
create or replace function public.get_payment_method_availability()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_env text := private.payment_surface_environment('gateway');
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'methodKey', a.method_key,
      'enabled', a.enabled,
      'unavailableReasonCode', a.unavailable_reason_code
    ) order by a.method_key
  ), '[]'::jsonb) into v_result
  from private.payment_method_availability a
  where a.environment = case when a.method_key = 'cash' then 'live' else v_env end;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Checkout return resolution — never trusts the client
-- ---------------------------------------------------------------------------

-- The client may report that it returned from a hosted checkout, but that
-- report can never mark a payment paid. This function only reveals the
-- authoritative server-side state and records that the customer came back.
create or replace function public.resolve_payment_checkout_return(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_attempt private.payment_attempts%rowtype;
  v_payment public.financial_booking_payments%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_attempt
  from private.payment_attempts a
  where a.id = p_attempt_id and a.customer_id = v_uid;
  if v_attempt.id is null then
    raise exception 'Payment attempt is not available' using errcode = '22023';
  end if;
  select * into v_payment
  from public.financial_booking_payments p
  where p.id = v_attempt.payment_id;

  -- Expire a stale checkout deterministically rather than leaving it pending.
  if v_attempt.status in ('created','pending')
     and v_attempt.checkout_expires_at is not null
     and v_attempt.checkout_expires_at < pg_catalog.now() then
    update private.payment_attempts
      set status = 'expired', terminal_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = v_attempt.id;
    v_attempt.status := 'expired';
  end if;

  return pg_catalog.jsonb_build_object(
    'attemptId', v_attempt.id,
    'attemptStatus', v_attempt.status,
    'paymentStatus', v_payment.status,
    'awaitingProviderConfirmation',
      v_attempt.status in ('created','pending') and v_payment.status <> 'paid',
    'canRetry', v_attempt.status in ('failed','cancelled','expired') and v_payment.status <> 'paid',
    'requiresReview', v_attempt.status = 'requires_review'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Verified webhook processing (disabled until a provider is approved)
-- ---------------------------------------------------------------------------

-- Trusted server boundary. The caller must already have verified the raw body
-- signature; this function re-checks every remaining invariant and refuses to
-- act when any of them fails. It never trusts a client redirect, query string,
-- client-supplied amount, or unsigned event.
create or replace function private.process_verified_payment_webhook(
  p_provider_key text,
  p_environment text,
  p_provider_event_id text,
  p_event_type text,
  p_signature_verified boolean,
  p_raw_body_sha256 text,
  p_provider_event_at timestamptz,
  p_provider_reference text,
  p_amount_minor bigint,
  p_currency text,
  p_sanitized_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_env text := private.payment_surface_environment('gateway');
  v_tolerance integer;
  v_attempt private.payment_attempts%rowtype;
  v_payment public.financial_booking_payments%rowtype;
  v_existing private.payment_gateway_events%rowtype;
  v_reason text;
begin
  select c.webhook_replay_tolerance_seconds into v_tolerance
  from private.payment_configuration c where c.id;

  -- Fail closed: no processing at all unless the gateway surface is live or
  -- sandbox with complete configuration.
  if v_env not in ('sandbox','live') then
    insert into private.payment_webhook_quarantine(provider_key, environment, raw_body_sha256, reason_code, signature_verified)
    values (p_provider_key, coalesce(p_environment,'disabled'), p_raw_body_sha256, 'environment_mismatch', coalesce(p_signature_verified,false));
    return pg_catalog.jsonb_build_object('status','quarantined','reason','gateway_disabled');
  end if;

  v_reason := case
    when not coalesce(p_signature_verified, false) then 'signature_invalid'
    when p_environment is distinct from v_env then 'environment_mismatch'
    when p_provider_event_at is null
      or pg_catalog.abs(pg_catalog.date_part('epoch', pg_catalog.now() - p_provider_event_at)) > v_tolerance
      then 'replay_window_exceeded'
    when p_event_type not in ('payment_succeeded','payment_failed','payment_cancelled','payment_expired',
                              'payment_pending','refund_succeeded','refund_failed','chargeback_opened',
                              'chargeback_won','chargeback_lost','chargeback_reversed')
      then 'unknown_event_type'
    when p_currency is distinct from 'EGP' then 'currency_mismatch'
    else null end;

  if v_reason is not null then
    insert into private.payment_webhook_quarantine(provider_key, environment, raw_body_sha256, reason_code, signature_verified)
    values (p_provider_key, coalesce(p_environment,'disabled'), p_raw_body_sha256, v_reason, coalesce(p_signature_verified,false));
    return pg_catalog.jsonb_build_object('status','quarantined','reason',v_reason);
  end if;

  -- Event idempotency: the same provider event never posts twice, and a
  -- retried delivery is reported as a duplicate rather than reprocessed.
  select * into v_existing
  from private.payment_gateway_events e
  where e.gateway_name = p_provider_key and e.environment = v_env and e.gateway_event_id = p_provider_event_id;
  if v_existing.id is not null then
    return pg_catalog.jsonb_build_object('status','duplicate','eventId',v_existing.id);
  end if;

  select * into v_attempt
  from private.payment_attempts a
  where a.provider_adapter = p_provider_key
    and a.environment = v_env
    and a.provider_reference = p_provider_reference;
  if v_attempt.id is null then
    insert into private.payment_webhook_quarantine(provider_key, environment, raw_body_sha256, reason_code, signature_verified)
    values (p_provider_key, v_env, p_raw_body_sha256, 'unknown_attempt', true);
    return pg_catalog.jsonb_build_object('status','quarantined','reason','unknown_attempt');
  end if;

  select * into v_payment
  from public.financial_booking_payments p where p.id = v_attempt.payment_id;

  -- The provider must agree with the immutable snapshot amount. A mismatch is
  -- surfaced as an exception, never silently accepted.
  if p_event_type = 'payment_succeeded' and p_amount_minor is distinct from v_payment.amount_minor then
    insert into private.payment_webhook_quarantine(provider_key, environment, raw_body_sha256, reason_code, signature_verified)
    values (p_provider_key, v_env, p_raw_body_sha256, 'amount_mismatch', true);
    update private.payment_attempts
      set status = 'requires_review', updated_at = pg_catalog.now() where id = v_attempt.id;
    return pg_catalog.jsonb_build_object('status','quarantined','reason','amount_mismatch');
  end if;

  insert into private.payment_gateway_events(
    gateway_name, gateway_event_id, attempt_id, event_type, signature_verified,
    raw_body_sha256, processing_status, sanitized_metadata, environment,
    signature_algorithm, provider_event_at, replay_window_ok, processed_at)
  values (p_provider_key, p_provider_event_id, v_attempt.id, p_event_type, true,
          p_raw_body_sha256, 'processed', coalesce(p_sanitized_metadata,'{}'::jsonb), v_env,
          'provider_hmac', p_provider_event_at, true, pg_catalog.now());

  -- Ordering tolerance: a terminal attempt is never moved backwards by a late
  -- or out-of-order event.
  if v_attempt.status in ('succeeded','failed','cancelled','expired') then
    return pg_catalog.jsonb_build_object('status','ignored_late_event','attemptStatus',v_attempt.status);
  end if;

  if p_event_type = 'payment_pending' then
    update private.payment_attempts set status = 'pending', updated_at = pg_catalog.now() where id = v_attempt.id;
  elsif p_event_type = 'payment_failed' then
    update private.payment_attempts
      set status = 'failed', failure_code = 'provider_declined',
          terminal_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = v_attempt.id;
  elsif p_event_type = 'payment_cancelled' then
    update private.payment_attempts
      set status = 'cancelled', terminal_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = v_attempt.id;
  elsif p_event_type = 'payment_expired' then
    update private.payment_attempts
      set status = 'expired', terminal_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = v_attempt.id;
  elsif p_event_type = 'payment_succeeded' then
    -- Authoritative success. Marking the attempt succeeded is the only thing
    -- done here; the money posting itself remains WPS-007's responsibility and
    -- is performed by the existing confirmation path so that exactly one
    -- balanced ledger transaction exists per authoritative provider event.
    update private.payment_attempts
      set status = 'succeeded', terminal_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = v_attempt.id;
  end if;

  return pg_catalog.jsonb_build_object('status','processed','attemptId',v_attempt.id,'eventType',p_event_type);
end;
$$;
revoke all on function private.process_verified_payment_webhook(text,text,text,text,boolean,text,timestamptz,text,bigint,text,jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 13. Reconciliation (detects differences, never conceals them)
-- ---------------------------------------------------------------------------

create or replace function private.run_payment_reconciliation(
  p_business_date date,
  p_run_kind text default 'daily',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_env text := private.payment_surface_environment('gateway');
  v_enabled boolean;
  v_run_id uuid;
  v_key text := coalesce(p_idempotency_key, 'reconciliation:'||p_run_kind||':'||p_business_date::text);
  v_exceptions integer := 0;
  v_matched integer := 0;
  v_balanced boolean;
begin
  select c.reconciliation_enabled into v_enabled from private.payment_configuration c where c.id;
  if not coalesce(v_enabled, false) or v_env = 'disabled' then
    return pg_catalog.jsonb_build_object('status','disabled','matched',0,'exceptions',0);
  end if;

  select r.id into v_run_id from private.reconciliation_runs r where r.idempotency_key = v_key;
  if v_run_id is not null then
    return pg_catalog.jsonb_build_object('status','duplicate','runId',v_run_id);
  end if;

  insert into private.reconciliation_runs(run_kind, environment, business_date, status, idempotency_key)
  values (p_run_kind, v_env, p_business_date, 'running', v_key)
  returning id into v_run_id;

  -- Provider settlement lines with no matching Warsha payment.
  insert into private.reconciliation_exceptions(run_id, exception_type, severity, provider_reference, observed_minor, currency)
  select v_run_id, 'unmatched_provider_record', 'critical', l.provider_transaction_reference, l.amount_minor, l.currency
  from private.payment_settlement_lines l
  join private.payment_settlements s on s.id = l.settlement_id
  where s.settlement_date = p_business_date and s.environment = v_env and not l.matched and l.payment_id is null;

  -- Amount disagreements between provider and the immutable Warsha snapshot.
  insert into private.reconciliation_exceptions(run_id, exception_type, severity, payment_id, provider_reference, expected_minor, observed_minor, currency)
  select v_run_id, 'amount_mismatch', 'critical', p.id, l.provider_transaction_reference, p.amount_minor, l.amount_minor, l.currency
  from private.payment_settlement_lines l
  join private.payment_settlements s on s.id = l.settlement_id
  join public.financial_booking_payments p on p.id = l.payment_id
  where s.settlement_date = p_business_date and s.environment = v_env
    and l.line_type = 'payment' and l.amount_minor is distinct from p.amount_minor;

  -- Succeeded attempts that never produced a paid payment: a missing webhook.
  insert into private.reconciliation_exceptions(run_id, exception_type, severity, payment_id, provider_reference)
  select v_run_id, 'missing_webhook', 'critical', p.id, a.provider_reference
  from private.payment_attempts a
  join public.financial_booking_payments p on p.id = a.payment_id
  where a.environment = v_env
    and a.status = 'succeeded'
    and p.status <> 'paid'
    and a.terminal_at::date = p_business_date;

  -- Provider events that never matched an attempt.
  insert into private.reconciliation_exceptions(run_id, exception_type, severity, detail_code)
  select v_run_id, 'orphan_provider_event', 'warning', q.reason_code
  from private.payment_webhook_quarantine q
  where q.environment = v_env and q.reviewed_at is null and q.received_at::date = p_business_date;

  select pg_catalog.count(*)::integer into v_exceptions
  from private.reconciliation_exceptions e where e.run_id = v_run_id;

  select pg_catalog.count(*)::integer into v_matched
  from private.payment_settlement_lines l
  join private.payment_settlements s on s.id = l.settlement_id
  where s.settlement_date = p_business_date and s.environment = v_env and l.matched;

  -- Explicit balancing check across the authoritative ledger.
  select coalesce(
      pg_catalog.sum(case when en.direction = 'debit' then en.amount_minor else 0 end)
      = pg_catalog.sum(case when en.direction = 'credit' then en.amount_minor else 0 end),
      true) into v_balanced
  from private.financial_ledger_entries en
  join private.financial_ledger_transactions t on t.id = en.transaction_id
  where t.created_at::date = p_business_date;

  if not coalesce(v_balanced, true) then
    insert into private.reconciliation_exceptions(run_id, exception_type, severity, detail_code)
    values (v_run_id, 'ledger_imbalance', 'critical', 'daily_debit_credit_mismatch');
    v_exceptions := v_exceptions + 1;
  end if;

  update private.reconciliation_runs
    set status = 'completed', finished_at = pg_catalog.now(),
        matched_count = v_matched, exception_count = v_exceptions, ledger_balanced = v_balanced
    where id = v_run_id;

  return pg_catalog.jsonb_build_object(
    'status','completed','runId',v_run_id,'matched',v_matched,
    'exceptions',v_exceptions,'ledgerBalanced',v_balanced);
end;
$$;
revoke all on function private.run_payment_reconciliation(date,text,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 14. Release scheduler batch (disabled by default, idempotent, replayable)
-- ---------------------------------------------------------------------------

create or replace function private.run_earning_release_batch(
  p_limit integer default 50,
  p_run_reason text default 'scheduled',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_key text := coalesce(p_idempotency_key, 'release-batch:'||p_run_reason||':'||pg_catalog.to_char(pg_catalog.now(),'YYYY-MM-DD"T"HH24'));
  v_run_id uuid;
  v_released integer := 0;
begin
  if p_limit not between 1 and 500 then
    raise exception 'Invalid release batch limit' using errcode = '22023';
  end if;
  select c.automatic_release_scheduler_enabled into v_enabled from private.payment_configuration c where c.id;

  if not coalesce(v_enabled, false) then
    insert into private.earning_release_scheduler_runs(run_reason, status, idempotency_key)
    values (p_run_reason, 'disabled', v_key)
    on conflict (idempotency_key) do nothing;
    return pg_catalog.jsonb_build_object('status','disabled','released',0);
  end if;

  select r.id into v_run_id from private.earning_release_scheduler_runs r where r.idempotency_key = v_key;
  if v_run_id is not null then
    return pg_catalog.jsonb_build_object('status','duplicate','released',0);
  end if;

  insert into private.earning_release_scheduler_runs(run_reason, status, idempotency_key)
  values (p_run_reason, 'completed', v_key)
  returning id into v_run_id;

  -- Delegates to the existing WPS-007 release authority, which already honours
  -- customer confirmation, disputes, holds, and cash-debt offsets.
  v_released := coalesce(private.release_eligible_provider_earnings(p_limit), 0);

  update private.earning_release_scheduler_runs
    set released_count = v_released, finished_at = pg_catalog.now()
    where id = v_run_id;

  return pg_catalog.jsonb_build_object('status','completed','released',v_released,'runId',v_run_id);
end;
$$;
revoke all on function private.run_earning_release_batch(integer,text,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 15. Payout event processing (fail closed; client can never mark success)
-- ---------------------------------------------------------------------------

create or replace function private.process_verified_payout_event(
  p_provider_key text,
  p_environment text,
  p_provider_event_id text,
  p_event_type text,
  p_signature_verified boolean,
  p_raw_body_sha256 text,
  p_withdrawal_id uuid,
  p_sanitized_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_env text := private.payment_surface_environment('payout');
  v_existing private.payout_provider_events%rowtype;
begin
  if v_env not in ('sandbox','live') or not coalesce(p_signature_verified,false) or p_environment is distinct from v_env then
    insert into private.payout_provider_events(
      withdrawal_id, provider_key, environment, provider_event_id, event_type,
      signature_verified, raw_body_sha256, processing_status)
    values (p_withdrawal_id, p_provider_key, coalesce(nullif(p_environment,''),'mock'), p_provider_event_id,
            p_event_type, coalesce(p_signature_verified,false), p_raw_body_sha256, 'quarantined')
    on conflict (provider_key, environment, provider_event_id) do nothing;
    return pg_catalog.jsonb_build_object('status','quarantined');
  end if;

  select * into v_existing
  from private.payout_provider_events e
  where e.provider_key = p_provider_key and e.environment = v_env and e.provider_event_id = p_provider_event_id;
  if v_existing.id is not null then
    return pg_catalog.jsonb_build_object('status','duplicate');
  end if;

  insert into private.payout_provider_events(
    withdrawal_id, provider_key, environment, provider_event_id, event_type,
    signature_verified, raw_body_sha256, processing_status, sanitized_metadata, processed_at)
  values (p_withdrawal_id, p_provider_key, v_env, p_provider_event_id, p_event_type,
          true, p_raw_body_sha256, 'processed', coalesce(p_sanitized_metadata,'{}'::jsonb), pg_catalog.now());

  -- Withdrawal state itself remains owned by the WPS-007 review RPC so that a
  -- reservation is released exactly once and a payout finalizes exactly once.
  return pg_catalog.jsonb_build_object('status','processed','eventType',p_event_type);
end;
$$;
revoke all on function private.process_verified_payout_event(text,text,text,text,boolean,text,uuid,jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 16. Chargeback intake (never auto-blames the worker)
-- ---------------------------------------------------------------------------

create or replace function private.record_payment_chargeback(
  p_provider_key text,
  p_environment text,
  p_provider_chargeback_reference text,
  p_payment_id uuid,
  p_amount_minor bigint,
  p_status text,
  p_reason_code text default null,
  p_evidence_due_at timestamptz default null,
  p_fee_minor bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_existing private.payment_chargebacks%rowtype;
  v_id uuid;
begin
  select c.chargeback_handling_enabled into v_enabled from private.payment_configuration c where c.id;
  if not coalesce(v_enabled, false) then
    return pg_catalog.jsonb_build_object('status','disabled');
  end if;

  select * into v_existing
  from private.payment_chargebacks cb
  where cb.provider_key = p_provider_key and cb.environment = p_environment
    and cb.provider_chargeback_reference = p_provider_chargeback_reference;

  if v_existing.id is not null then
    update private.payment_chargebacks
      set status = p_status,
          resolved_at = case when p_status in ('won','lost','reversed','cancelled') then pg_catalog.now() else resolved_at end
      where id = v_existing.id;
    return pg_catalog.jsonb_build_object('status','updated','chargebackId',v_existing.id);
  end if;

  insert into private.payment_chargebacks(
    payment_id, provider_key, environment, provider_chargeback_reference,
    amount_minor, fee_minor, status, reason_code, evidence_due_at)
  values (p_payment_id, p_provider_key, p_environment, p_provider_chargeback_reference,
          p_amount_minor, coalesce(p_fee_minor,0), p_status, p_reason_code, p_evidence_due_at)
  returning id into v_id;

  -- Worker responsibility is never presumed. Financial recovery only happens
  -- through the existing staff-reviewed WPS-007 post-release case RPC.
  return pg_catalog.jsonb_build_object('status','opened','chargebackId',v_id,'requiresStaffReview',true);
end;
$$;
revoke all on function private.record_payment_chargeback(text,text,text,uuid,bigint,text,text,timestamptz,bigint)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 17. Staff operations
-- ---------------------------------------------------------------------------

create or replace function public.review_reconciliation_exception(
  p_exception_id uuid,
  p_status text,
  p_resolution_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_exception private.reconciliation_exceptions%rowtype;
begin
  if v_uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_status not in ('investigating','resolved','accepted_difference') then
    raise exception 'Invalid reconciliation resolution' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_resolution_note,''))) not between 3 and 500 then
    raise exception 'Resolution note is required' using errcode = '22023';
  end if;
  select * into v_exception from private.reconciliation_exceptions e where e.id = p_exception_id for update;
  if v_exception.id is null then
    raise exception 'Reconciliation exception not found' using errcode = 'P0002';
  end if;

  -- Resolution is an audit record. It never rewrites ledger history and never
  -- performs an automatic destructive correction.
  update private.reconciliation_exceptions
    set status = p_status,
        resolution_note = p_resolution_note,
        resolved_at = case when p_status in ('resolved','accepted_difference') then pg_catalog.now() else null end,
        resolved_by = v_uid
    where id = p_exception_id;

  return pg_catalog.jsonb_build_object('id', p_exception_id, 'status', p_status);
end;
$$;

create or replace function public.get_staff_payment_operations_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  -- Counts and safe status only. No secret, no raw provider payload, no PAN.
  return pg_catalog.jsonb_build_object(
    'gatewayEnvironment', private.payment_surface_environment('gateway'),
    'payoutEnvironment', private.payment_surface_environment('payout'),
    'openReconciliationExceptions',
      (select pg_catalog.count(*)::integer from private.reconciliation_exceptions e where e.status = 'open'),
    'unreviewedQuarantine',
      (select pg_catalog.count(*)::integer from private.payment_webhook_quarantine q where q.reviewed_at is null),
    'attemptsRequiringReview',
      (select pg_catalog.count(*)::integer from private.payment_attempts a where a.status = 'requires_review'),
    'openChargebacks',
      (select pg_catalog.count(*)::integer from private.payment_chargebacks cb where cb.status in ('opened','evidence_required','under_review')),
    'withdrawalsUnderReview',
      (select pg_catalog.count(*)::integer from public.provider_withdrawal_requests w where w.status = 'under_review')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 18. Grants — authenticated clients get only the safe projections
-- ---------------------------------------------------------------------------

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.get_production_payment_capabilities()',
    'public.get_payment_method_availability()',
    'public.resolve_payment_checkout_return(uuid)',
    'public.review_reconciliation_exception(uuid,text,text)',
    'public.get_staff_payment_operations_summary()'
  ] loop
    execute 'revoke all on function '||v_signature||' from public, anon';
    execute 'grant execute on function '||v_signature||' to authenticated';
  end loop;
end;
$$;

-- Private reconciliation, settlement, chargeback, quarantine, scheduler, and
-- secret-metadata tables are never published to Realtime and are never
-- readable by any client role.
