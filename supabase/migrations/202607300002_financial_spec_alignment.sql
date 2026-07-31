-- Warsha Financial Specification alignment.
--
-- This migration is additive to the v0.8 foundation. It locks the commercial
-- defaults that are independent of a licensed provider while leaving all live
-- gateway, payout, scheduler, and external-money execution fail-closed.

alter table private.payment_configuration
  add column cash_debt_restriction_threshold_minor bigint not null default 50000
    check (cash_debt_restriction_threshold_minor between 0 and 1000000000),
  add column withdrawal_fee_minor bigint not null default 0
    check (withdrawal_fee_minor = 0),
  add column rolling_reserve_bps integer not null default 0
    check (rolling_reserve_bps = 0),
  add column payout_mode text not null default 'disabled'
    check (payout_mode in ('disabled', 'mock')),
  add column automatic_release_scheduler_enabled boolean not null default false,
  add column gateway_fee_paid_by text not null default 'warsha'
    check (gateway_fee_paid_by = 'warsha');

create table private.payment_configuration_history (
  id bigint generated always as identity primary key,
  policy_version text not null,
  configuration jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id) on delete set null
);

create or replace function private.audit_payment_configuration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.payment_configuration_history(
    policy_version,
    configuration,
    changed_by
  )
  values (
    new.policy_version,
    to_jsonb(new) - 'updated_by',
    (select auth.uid())
  );
  return new;
end;
$$;

create trigger audit_payment_configuration
  after update on private.payment_configuration
  for each row execute function private.audit_payment_configuration();

update private.payment_configuration
set policy_version = 'wps-007-v1',
    commission_bps = 1000,
    fixed_commission_minor = 0,
    minimum_commission_minor = null,
    maximum_commission_minor = null,
    minimum_withdrawal_minor = 20000,
    earnings_release_delay_seconds = 21600,
    refund_reversal_policy = 'proportional_provider_and_commission_reversal',
    cash_settlement_policy = 'provider_commission_debt_with_online_offset',
    cash_debt_restriction_threshold_minor = 50000,
    withdrawal_fee_minor = 0,
    rolling_reserve_bps = 0,
    gateway_mode = 'disabled',
    payout_mode = 'disabled',
    automatic_release_scheduler_enabled = false,
    gateway_fee_paid_by = 'warsha',
    updated_at = now(),
    updated_by = null
where id;

alter table private.payment_configuration
  alter column commission_bps set not null,
  alter column fixed_commission_minor set not null,
  alter column minimum_withdrawal_minor set not null,
  alter column earnings_release_delay_seconds set not null,
  alter column refund_reversal_policy set not null,
  alter column cash_settlement_policy set not null;

alter table public.booking_price_snapshots
  add column promotion_minor bigint not null default 0
    check (promotion_minor between 0 and 1000000000);

alter table public.financial_booking_payments
  add column gateway_fee_minor bigint not null default 0
    check (gateway_fee_minor between 0 and 1000000000);

alter table public.provider_earnings_ledger
  add column provider_completed_at timestamptz,
  add column release_eligible_at timestamptz,
  add column customer_confirmed_at timestamptz,
  add column debt_offset_minor bigint not null default 0
    check (debt_offset_minor between 0 and 1000000000),
  add constraint provider_earnings_debt_offset_within_net
    check (debt_offset_minor <= net_minor);

alter table public.financial_refunds
  add column provider_reversal_minor bigint not null default 0
    check (provider_reversal_minor between 0 and 1000000000),
  add column commission_reversal_minor bigint not null default 0
    check (commission_reversal_minor between 0 and 1000000000),
  add column promotion_reversal_minor bigint not null default 0
    check (promotion_reversal_minor between 0 and 1000000000),
  add column tax_reversal_minor bigint not null default 0
    check (tax_reversal_minor between 0 and 1000000000);

create table public.provider_cash_commission_records (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id),
  booking_id uuid not null references public.bookings(id),
  payment_id uuid not null unique references public.financial_booking_payments(id),
  gross_minor bigint not null check (gross_minor between 1 and 1000000000),
  commission_minor bigint not null check (commission_minor between 0 and 1000000000),
  outstanding_minor bigint not null check (outstanding_minor between 0 and 1000000000),
  currency text not null check (currency = 'EGP'),
  status text not null default 'outstanding'
    check (status in ('outstanding', 'partially_offset', 'settled', 'under_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (outstanding_minor <= commission_minor)
);

create table public.provider_financial_cases (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id),
  booking_id uuid not null references public.bookings(id),
  payment_id uuid not null references public.financial_booking_payments(id),
  case_type text not null check (case_type in ('post_release_refund', 'chargeback')),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000),
  currency text not null check (currency = 'EGP'),
  status text not null default 'under_review'
    check (status in ('under_review', 'provider_not_responsible', 'recovery_approved', 'closed')),
  provider_responsibility_minor bigint not null default 0
    check (provider_responsibility_minor between 0 and 1000000000),
  recovered_available_minor bigint not null default 0
    check (recovered_available_minor between 0 and 1000000000),
  provider_debt_minor bigint not null default 0
    check (provider_debt_minor between 0 and 1000000000),
  warsha_absorbed_minor bigint not null default 0
    check (warsha_absorbed_minor between 0 and 1000000000),
  public_reason text not null check (length(btrim(public_reason)) between 3 and 500),
  idempotency_key text not null check (length(idempotency_key) between 8 and 300),
  decision_idempotency_key text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  unique (payment_id, case_type, idempotency_key),
  check (
    provider_responsibility_minor + warsha_absorbed_minor <= amount_minor
    and recovered_available_minor + provider_debt_minor <= provider_responsibility_minor
  )
);

-- Replace only the two cross-column price equations. The column bounds remain.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.booking_price_snapshots'::regclass
      and c.contype = 'c'
      and (
        pg_get_constraintdef(c.oid) like '%provider_gross_minor =%'
        or pg_get_constraintdef(c.oid) like '%customer_total_minor = provider_gross_minor%'
      )
  loop
    execute format(
      'alter table public.booking_price_snapshots drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

alter table public.booking_price_snapshots
  drop constraint if exists booking_price_snapshots_check2;

alter table public.booking_price_snapshots
  add constraint booking_price_snapshot_provider_components
    check (
      provider_gross_minor =
        service_subtotal_minor + callout_fee_minor + emergency_fee_minor
    ),
  add constraint booking_price_snapshot_customer_components
    check (
      customer_total_minor =
        provider_gross_minor - promotion_minor + tax_minor
    ),
  add constraint booking_price_snapshot_legacy_discount_alias
    check (discount_minor = promotion_minor),
  add constraint booking_price_snapshot_provider_net
    check (provider_gross_minor = provider_net_minor + commission_minor);

-- Extend the private chart of accounts and transaction vocabulary without
-- changing any client grants.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'private.financial_ledger_accounts'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%account_type%'
  loop
    execute format(
      'alter table private.financial_ledger_accounts drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

alter table private.financial_ledger_accounts
  add constraint financial_ledger_accounts_type_check
    check (account_type in (
      'customer_payment_clearing',
      'provider_pending',
      'provider_available',
      'provider_cash_commission_debt',
      'provider_recovery_debt',
      'warsha_commission',
      'warsha_promotion_expense',
      'gateway_fee_expense',
      'gateway_fee_payable',
      'warsha_financial_loss',
      'financial_case_clearing',
      'tax_payable',
      'refunds_payable',
      'payout_clearing',
      'external_payout'
    )),
  add constraint financial_ledger_accounts_provider_scope_check
    check (
      (
        account_type in (
          'provider_pending',
          'provider_available',
          'provider_cash_commission_debt',
          'provider_recovery_debt'
        )
        and provider_id is not null
      )
      or
      (
        account_type not in (
          'provider_pending',
          'provider_available',
          'provider_cash_commission_debt',
          'provider_recovery_debt'
        )
        and provider_id is null
      )
    );

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'private.financial_ledger_transactions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%transaction_type%'
  loop
    execute format(
      'alter table private.financial_ledger_transactions drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

alter table private.financial_ledger_transactions
  add constraint financial_ledger_transactions_type_check
    check (transaction_type in (
      'online_payment_confirmed',
      'earning_released',
      'provider_debt_offset',
      'cash_commission_accrued',
      'withdrawal_reserved',
      'withdrawal_released',
      'withdrawal_paid',
      'refund_succeeded',
      'post_release_recovery',
      'gateway_fee_recorded',
      'earning_held',
      'earning_hold_released'
    ));

create or replace function private.financial_debt_balance(
  p_provider_id uuid,
  p_account_type text
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case e.direction when 'debit' then e.amount_minor else -e.amount_minor end
  ), 0)::bigint
  from private.financial_ledger_accounts a
  join private.financial_ledger_entries e on e.account_id = a.id
  where a.provider_id = p_provider_id
    and a.account_type = p_account_type
    and a.currency = 'EGP';
$$;

create or replace function private.available_earnings_balance(p_provider_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case e.direction when 'credit' then e.amount_minor else -e.amount_minor end
  ), 0)::bigint
  from private.financial_ledger_accounts a
  join private.financial_ledger_entries e on e.account_id = a.id
  where a.provider_id = p_provider_id
    and a.account_type = 'provider_available'
    and a.currency = 'EGP';
$$;

create or replace function private.provider_cash_restricted(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.financial_debt_balance(
    p_provider_id,
    'provider_cash_commission_debt'
  ) > c.cash_debt_restriction_threshold_minor
  from private.payment_configuration c
  where c.id;
$$;

create or replace function private.enforce_cash_payment_restriction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     and new.payment_method = 'cash'
     and private.provider_cash_restricted(new.provider_id)
  then
    raise exception 'Cash payment is temporarily unavailable for this provider'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger enforce_cash_payment_restriction
  before insert on public.financial_booking_payments
  for each row execute function private.enforce_cash_payment_restriction();

create or replace function private.calculate_commission(
  p_gross_minor bigint,
  p_currency text
)
returns table (
  commission_minor bigint,
  provider_net_minor bigint,
  policy_version text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config private.payment_configuration%rowtype;
begin
  if p_gross_minor < 0 or p_gross_minor > 1000000000 then
    raise exception 'Invalid payment amount' using errcode = '22023';
  end if;
  select * into config from private.payment_configuration where id;
  if config.currency <> p_currency then
    raise exception 'Unsupported currency' using errcode = '22023';
  end if;

  -- Locked policy: floor at the piastre boundary. No intermediate rounding,
  -- fixed charge, minimum, or maximum is applied.
  commission_minor := floor(
    (p_gross_minor::numeric * config.commission_bps::numeric) / 10000
  )::bigint;
  provider_net_minor := p_gross_minor - commission_minor;
  policy_version := config.policy_version;
  return next;
end;
$$;

create or replace function private.create_booking_price_snapshot(
  p_booking_id uuid,
  p_override_total_minor bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row record;
  current_id uuid;
  next_version integer;
  service_minor bigint;
  callout_minor bigint;
  emergency_minor bigint;
  promotion_minor bigint;
  tax_minor bigint := 0;
  customer_total_minor bigint;
  provider_gross_minor bigint;
  commission_row record;
begin
  select s.id into current_id
  from public.booking_price_snapshots s
  where s.booking_id = p_booking_id and s.is_current
  for update;
  if current_id is not null and p_override_total_minor is null then
    return current_id;
  end if;

  select
    b.id,
    b.price_breakdown,
    b.estimated_price_egp,
    b.final_price_egp
  into booking_row
  from public.bookings b
  where b.id = p_booking_id and b.deleted_at is null
  for update;
  if booking_row.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  callout_minor := coalesce(
    round((booking_row.price_breakdown->>'transportationFee')::numeric * 100),
    0
  )::bigint;
  emergency_minor := coalesce(
    round((booking_row.price_breakdown->>'emergencySurcharge')::numeric * 100),
    0
  )::bigint;
  promotion_minor := coalesce(
    round((booking_row.price_breakdown->>'discount')::numeric * 100),
    0
  )::bigint;

  if p_override_total_minor is null then
    customer_total_minor := round(
      coalesce(booking_row.final_price_egp, booking_row.estimated_price_egp) * 100
    )::bigint;
    provider_gross_minor := customer_total_minor + promotion_minor - tax_minor;
  else
    -- A provider quote is the approved gross job price. Any already-approved
    -- Warsha promotion continues to reduce only the customer amount.
    provider_gross_minor := p_override_total_minor;
    customer_total_minor := provider_gross_minor - promotion_minor + tax_minor;
  end if;

  if customer_total_minor < 1
     or provider_gross_minor < 1
     or customer_total_minor > 1000000000
     or provider_gross_minor > 1000000000
  then
    raise exception 'Invalid payment amount' using errcode = '22023';
  end if;
  if callout_minor < 0 or emergency_minor < 0 or promotion_minor < 0 then
    raise exception 'Invalid price breakdown' using errcode = '22023';
  end if;

  service_minor := provider_gross_minor - callout_minor - emergency_minor;
  if service_minor < 0 then
    raise exception 'Invalid price breakdown' using errcode = '22023';
  end if;
  select * into commission_row
  from private.calculate_commission(provider_gross_minor, 'EGP');

  update public.booking_price_snapshots
  set is_current = false
  where booking_id = p_booking_id and is_current;

  select coalesce(max(s.version), 0) + 1 into next_version
  from public.booking_price_snapshots s
  where s.booking_id = p_booking_id;

  insert into public.booking_price_snapshots(
    booking_id,
    version,
    service_subtotal_minor,
    callout_fee_minor,
    emergency_fee_minor,
    discount_minor,
    promotion_minor,
    tax_minor,
    customer_total_minor,
    provider_gross_minor,
    commission_minor,
    provider_net_minor,
    currency,
    pricing_version,
    commission_policy_version,
    created_by
  )
  values (
    p_booking_id,
    next_version,
    service_minor,
    callout_minor,
    emergency_minor,
    promotion_minor,
    promotion_minor,
    tax_minor,
    customer_total_minor,
    provider_gross_minor,
    commission_row.commission_minor,
    commission_row.provider_net_minor,
    'EGP',
    'warsha-funded-promotion-v1',
    commission_row.policy_version,
    (select auth.uid())
  )
  returning id into current_id;

  return current_id;
end;
$$;

create or replace function private.release_provider_earning(
  p_earning_id uuid,
  p_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  earning_row public.provider_earnings_ledger%rowtype;
  booking_status text;
  cash_debt bigint;
  recovery_debt bigint;
  cash_offset bigint;
  recovery_offset bigint;
  remaining_minor bigint;
  pending_account uuid;
  available_account uuid;
  cash_debt_account uuid;
  recovery_debt_account uuid;
begin
  select * into earning_row
  from public.provider_earnings_ledger
  where id = p_earning_id
  for update;
  if earning_row.id is null then
    raise exception 'Earning not found' using errcode = 'P0002';
  end if;
  if earning_row.status = 'available' then
    return false;
  end if;
  if earning_row.status not in (
    'pending_job_completion',
    'pending_release',
    'held_for_dispute'
  ) then
    raise exception 'Earning cannot be released' using errcode = '22023';
  end if;

  select b.status into booking_status
  from public.bookings b
  where b.id = earning_row.booking_id;
  if booking_status <> 'completed' then
    update public.provider_earnings_ledger
    set status = case
          when booking_status = 'disputed' then 'held_for_dispute'
          else 'pending_job_completion'
        end,
        updated_at = now()
    where id = p_earning_id;
    return false;
  end if;
  if exists (
    select 1
    from public.disputes d
    where d.booking_id = earning_row.booking_id
      and lower(d.status) not in ('resolved', 'closed', 'rejected', 'cancelled')
  ) then
    update public.provider_earnings_ledger
    set status = 'held_for_dispute', updated_at = now()
    where id = p_earning_id;
    return false;
  end if;
  if earning_row.customer_confirmed_at is null
     and (
       earning_row.release_eligible_at is null
       or earning_row.release_eligible_at > now()
     )
  then
    update public.provider_earnings_ledger
    set status = 'pending_release', updated_at = now()
    where id = p_earning_id;
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('provider-release:' || earning_row.provider_id::text, 0)
  );
  cash_debt := greatest(
    private.financial_debt_balance(
      earning_row.provider_id,
      'provider_cash_commission_debt'
    ),
    0
  );
  recovery_debt := greatest(
    private.financial_debt_balance(
      earning_row.provider_id,
      'provider_recovery_debt'
    ),
    0
  );
  cash_offset := least(earning_row.net_minor, cash_debt);
  recovery_offset := least(
    earning_row.net_minor - cash_offset,
    recovery_debt
  );
  remaining_minor := earning_row.net_minor - cash_offset - recovery_offset;

  pending_account := private.financial_account(
    'provider_pending',
    earning_row.provider_id,
    earning_row.currency
  );
  available_account := private.financial_account(
    'provider_available',
    earning_row.provider_id,
    earning_row.currency
  );
  cash_debt_account := private.financial_account(
    'provider_cash_commission_debt',
    earning_row.provider_id,
    earning_row.currency
  );
  recovery_debt_account := private.financial_account(
    'provider_recovery_debt',
    earning_row.provider_id,
    earning_row.currency
  );

  perform private.post_financial_transaction(
    'earning_released',
    earning_row.booking_id,
    earning_row.payment_id,
    earning_row.currency,
    'system',
    p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', pending_account,
        'direction', 'debit',
        'amount_minor', earning_row.net_minor
      ),
      jsonb_build_object(
        'account_id', cash_debt_account,
        'direction', 'credit',
        'amount_minor', cash_offset
      ),
      jsonb_build_object(
        'account_id', recovery_debt_account,
        'direction', 'credit',
        'amount_minor', recovery_offset
      ),
      jsonb_build_object(
        'account_id', available_account,
        'direction', 'credit',
        'amount_minor', remaining_minor
      )
    ),
    jsonb_build_object(
      'cash_debt_offset_minor', cash_offset,
      'recovery_debt_offset_minor', recovery_offset
    )
  );

  if cash_offset > 0 then
    with allocation as (
      select
        r.id,
        least(
          r.outstanding_minor,
          greatest(
            cash_offset - coalesce(sum(r.outstanding_minor) over (
              order by r.created_at, r.id
              rows between unbounded preceding and 1 preceding
            ), 0),
            0
          )
        ) as applied
      from public.provider_cash_commission_records r
      where r.provider_id = earning_row.provider_id
        and r.outstanding_minor > 0
      order by r.created_at, r.id
    )
    update public.provider_cash_commission_records r
    set outstanding_minor = r.outstanding_minor - allocation.applied,
        status = case
          when r.outstanding_minor - allocation.applied = 0 then 'settled'
          else 'partially_offset'
        end,
        updated_at = now()
    from allocation
    where r.id = allocation.id and allocation.applied > 0;
  end if;

  update public.provider_earnings_ledger
  set status = 'available',
      debt_offset_minor = cash_offset + recovery_offset,
      available_at = now(),
      updated_at = now()
  where id = p_earning_id;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  select p.user_id,
         'earnings_available',
         'Earnings available',
         case
           when cash_offset + recovery_offset > 0
             then 'Earnings were released after applying an authorized financial adjustment.'
           else 'Earnings from a completed job are available to withdraw.'
         end,
         jsonb_build_object(
           'booking_id', earning_row.booking_id,
           'provider_id', earning_row.provider_id
         ),
         'earning-available:' || earning_row.id::text
  from public.provider_profiles p
  where p.id = earning_row.provider_id and p.user_id is not null
  on conflict do nothing;
  return true;
end;
$$;

create or replace function private.process_mock_payment_event(
  p_gateway_event_id text,
  p_attempt_id uuid,
  p_event_type text,
  p_signature_valid boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row private.payment_gateway_events%rowtype;
  attempt_row private.payment_attempts%rowtype;
  payment_row public.financial_booking_payments%rowtype;
  snapshot_row public.booking_price_snapshots%rowtype;
  earning_id uuid;
  completed_at timestamptz;
  customer_account uuid;
  promotion_account uuid;
  pending_account uuid;
  commission_account uuid;
  tax_account uuid;
  config private.payment_configuration%rowtype;
begin
  if not p_signature_valid then
    raise exception 'Invalid gateway signature' using errcode = '42501';
  end if;
  if p_event_type not in ('payment.pending', 'payment.succeeded', 'payment.failed') then
    raise exception 'Unsupported gateway event' using errcode = '22023';
  end if;

  insert into private.payment_gateway_events(
    gateway_name,
    gateway_event_id,
    attempt_id,
    event_type,
    signature_verified,
    raw_body_sha256,
    processing_status
  )
  values (
    'mock',
    p_gateway_event_id,
    p_attempt_id,
    p_event_type,
    true,
    pg_catalog.encode(
      extensions.digest(p_gateway_event_id || ':' || p_event_type, 'sha256'),
      'hex'
    ),
    'received'
  )
  on conflict (gateway_name, gateway_event_id) do nothing
  returning * into event_row;

  if event_row.id is null then
    select * into event_row
    from private.payment_gateway_events
    where gateway_name = 'mock' and gateway_event_id = p_gateway_event_id;
    return jsonb_build_object(
      'duplicate', true,
      'status', event_row.processing_status
    );
  end if;

  select * into attempt_row
  from private.payment_attempts
  where id = p_attempt_id
  for update;
  if attempt_row.id is null or attempt_row.provider_adapter <> 'mock' then
    update private.payment_gateway_events
    set processing_status = 'failed',
        failure_code = 'attempt_not_found',
        processed_at = now()
    where id = event_row.id;
    raise exception 'Payment attempt not found' using errcode = 'P0002';
  end if;

  select * into payment_row
  from public.financial_booking_payments
  where id = attempt_row.payment_id
  for update;
  select * into snapshot_row
  from public.booking_price_snapshots
  where id = payment_row.price_snapshot_id;
  if payment_row.payment_method <> 'online' then
    raise exception 'Cash payment cannot receive an online gateway event'
      using errcode = '22023';
  end if;

  if p_event_type = 'payment.failed' then
    if payment_row.status in ('paid', 'partially_refunded', 'refunded') then
      update private.payment_gateway_events
      set processing_status = 'ignored', processed_at = now()
      where id = event_row.id;
      return jsonb_build_object('duplicate', false, 'status', payment_row.status);
    end if;
    update private.payment_attempts
    set status = 'failed', updated_at = now()
    where id = attempt_row.id;
    update public.financial_booking_payments
    set status = 'failed', updated_at = now()
    where id = payment_row.id;
    insert into public.notifications(user_id, type, title, body, data, dedupe_key)
    values (
      payment_row.customer_id,
      'payment_failed',
      'Payment failed',
      'Your payment was not completed. You can try again.',
      jsonb_build_object(
        'booking_id', payment_row.booking_id,
        'payment_id', payment_row.id
      ),
      'payment-failed:' || event_row.id::text
    ) on conflict do nothing;
  elsif p_event_type = 'payment.pending' then
    if payment_row.status not in ('payment_initiated', 'pending') then
      raise exception 'Invalid payment status transition' using errcode = '22023';
    end if;
    update private.payment_attempts
    set status = 'pending', updated_at = now()
    where id = attempt_row.id;
    update public.financial_booking_payments
    set status = 'pending', updated_at = now()
    where id = payment_row.id;
  else
    if payment_row.status in (
      'partially_refunded',
      'refunded',
      'disputed',
      'chargeback',
      'cancelled'
    ) then
      raise exception 'Invalid payment status transition' using errcode = '22023';
    end if;
    if payment_row.status = 'paid' then
      update private.payment_gateway_events
      set processing_status = 'ignored', processed_at = now()
      where id = event_row.id;
      return jsonb_build_object('duplicate', false, 'status', 'paid');
    end if;
    if payment_row.amount_minor <> snapshot_row.customer_total_minor
       or payment_row.currency <> snapshot_row.currency
    then
      raise exception 'Payment does not match its price snapshot'
        using errcode = '23514';
    end if;

    customer_account := private.financial_account(
      'customer_payment_clearing',
      null,
      payment_row.currency
    );
    promotion_account := private.financial_account(
      'warsha_promotion_expense',
      null,
      payment_row.currency
    );
    pending_account := private.financial_account(
      'provider_pending',
      payment_row.provider_id,
      payment_row.currency
    );
    commission_account := private.financial_account(
      'warsha_commission',
      null,
      payment_row.currency
    );
    tax_account := private.financial_account(
      'tax_payable',
      null,
      payment_row.currency
    );
    perform private.post_financial_transaction(
      'online_payment_confirmed',
      payment_row.booking_id,
      payment_row.id,
      payment_row.currency,
      'gateway',
      'gateway:' || p_gateway_event_id,
      jsonb_build_array(
        jsonb_build_object(
          'account_id', customer_account,
          'direction', 'debit',
          'amount_minor', payment_row.amount_minor
        ),
        jsonb_build_object(
          'account_id', promotion_account,
          'direction', 'debit',
          'amount_minor', snapshot_row.promotion_minor
        ),
        jsonb_build_object(
          'account_id', pending_account,
          'direction', 'credit',
          'amount_minor', snapshot_row.provider_net_minor
        ),
        jsonb_build_object(
          'account_id', commission_account,
          'direction', 'credit',
          'amount_minor', snapshot_row.commission_minor
        ),
        jsonb_build_object(
          'account_id', tax_account,
          'direction', 'credit',
          'amount_minor', snapshot_row.tax_minor
        )
      ),
      jsonb_build_object(
        'promotion_minor', snapshot_row.promotion_minor,
        'gateway_fee_minor', 0
      )
    );

    update private.payment_attempts
    set status = 'succeeded', updated_at = now()
    where id = attempt_row.id;
    update public.financial_booking_payments
    set status = 'paid', paid_at = now(), updated_at = now()
    where id = payment_row.id;

    select h.created_at into completed_at
    from public.booking_status_history h
    where h.booking_id = payment_row.booking_id and h.status = 'completed'
    order by h.created_at desc, h.id desc
    limit 1;
    select * into config from private.payment_configuration where id;

    insert into public.provider_earnings_ledger(
      provider_id,
      booking_id,
      payment_id,
      price_snapshot_id,
      gross_minor,
      commission_minor,
      net_minor,
      currency,
      status,
      provider_completed_at,
      release_eligible_at
    )
    values (
      payment_row.provider_id,
      payment_row.booking_id,
      payment_row.id,
      snapshot_row.id,
      snapshot_row.provider_gross_minor,
      snapshot_row.commission_minor,
      snapshot_row.provider_net_minor,
      snapshot_row.currency,
      case
        when completed_at is not null then 'pending_release'
        else 'pending_job_completion'
      end,
      completed_at,
      case
        when completed_at is not null
          then completed_at + make_interval(
            secs => config.earnings_release_delay_seconds::double precision
          )
        else null
      end
    )
    on conflict (payment_id) do update
      set updated_at = public.provider_earnings_ledger.updated_at
    returning id into earning_id;

    insert into public.notifications(user_id, type, title, body, data, dedupe_key)
    values (
      payment_row.customer_id,
      'payment_confirmed',
      'Payment confirmed',
      'Your payment has been confirmed.',
      jsonb_build_object(
        'booking_id', payment_row.booking_id,
        'payment_id', payment_row.id
      ),
      'payment-confirmed:' || payment_row.id::text
    ) on conflict do nothing;
    insert into public.notifications(user_id, type, title, body, data, dedupe_key)
    select p.user_id,
           'earnings_pending',
           'Earnings pending',
           'Earnings were recorded and will be released after completion confirmation or the configured delay.',
           jsonb_build_object(
             'booking_id', payment_row.booking_id,
             'provider_id', payment_row.provider_id
           ),
           'earning-pending:' || earning_id::text
    from public.provider_profiles p
    where p.id = payment_row.provider_id and p.user_id is not null
    on conflict do nothing;

    if config.earnings_release_delay_seconds = 0 then
      perform private.release_provider_earning(
        earning_id,
        'payment-release:' || payment_row.id::text
      );
    end if;
  end if;

  update private.payment_gateway_events
  set processing_status = 'processed', processed_at = now()
  where id = event_row.id;
  return jsonb_build_object('duplicate', false, 'status', p_event_type);
end;
$$;

create or replace function private.record_gateway_fee(
  p_payment_id uuid,
  p_amount_minor bigint,
  p_gateway_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.financial_booking_payments%rowtype;
  expense_account uuid;
  payable_account uuid;
  already_recorded boolean;
begin
  if p_amount_minor is null
     or p_amount_minor < 0
     or p_amount_minor > 1000000000
     or length(coalesce(p_gateway_event_id, '')) < 8
  then
    raise exception 'Invalid gateway fee event' using errcode = '22023';
  end if;
  if p_amount_minor = 0 then
    return false;
  end if;
  select * into payment_row
  from public.financial_booking_payments
  where id = p_payment_id
  for update;
  if payment_row.id is null or payment_row.payment_method <> 'online' then
    raise exception 'Online payment not found' using errcode = 'P0002';
  end if;
  select exists (
    select 1
    from private.financial_ledger_transactions t
    where t.transaction_type = 'gateway_fee_recorded'
      and t.idempotency_key = 'gateway-fee:' || p_gateway_event_id
      and t.currency = payment_row.currency
  ) into already_recorded;
  if already_recorded then
    return false;
  end if;

  expense_account := private.financial_account(
    'gateway_fee_expense',
    null,
    payment_row.currency
  );
  payable_account := private.financial_account(
    'gateway_fee_payable',
    null,
    payment_row.currency
  );
  perform private.post_financial_transaction(
    'gateway_fee_recorded',
    payment_row.booking_id,
    payment_row.id,
    payment_row.currency,
    'gateway',
    'gateway-fee:' || p_gateway_event_id,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', expense_account,
        'direction', 'debit',
        'amount_minor', p_amount_minor
      ),
      jsonb_build_object(
        'account_id', payable_account,
        'direction', 'credit',
        'amount_minor', p_amount_minor
      )
    )
  );
  update public.financial_booking_payments
  set gateway_fee_minor = gateway_fee_minor + p_amount_minor,
      updated_at = now()
  where id = payment_row.id
  ;
  return true;
end;
$$;

create or replace function private.release_completed_booking_earning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delay_seconds bigint;
  earning_row record;
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    select c.earnings_release_delay_seconds into delay_seconds
    from private.payment_configuration c
    where c.id;

    update public.provider_earnings_ledger
    set status = 'pending_release',
        provider_completed_at = now(),
        release_eligible_at = now() + make_interval(
          secs => delay_seconds::double precision
        ),
        updated_at = now()
    where booking_id = new.id
      and status in ('pending_job_completion', 'pending_release');

    if delay_seconds = 0 then
      for earning_row in
        select e.id, e.payment_id
        from public.provider_earnings_ledger e
        where e.booking_id = new.id
          and e.status = 'pending_release'
      loop
        perform private.release_provider_earning(
          earning_row.id,
          'booking-release:' || earning_row.payment_id::text
        );
      end loop;
    end if;
  elsif new.status = 'disputed' and old.status is distinct from new.status then
    update public.provider_earnings_ledger
    set status = 'held_for_dispute', updated_at = now()
    where booking_id = new.id
      and status in (
        'pending_job_completion',
        'pending_release',
        'held_for_dispute'
      );
  end if;
  return new;
end;
$$;

create or replace function public.confirm_booking_completion_for_payment(
  p_booking_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  earning_row public.provider_earnings_ledger%rowtype;
  audit_exists boolean;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  select e.* into earning_row
  from public.provider_earnings_ledger e
  join public.bookings b on b.id = e.booking_id
  where e.booking_id = p_booking_id
    and b.customer_id = uid
    and b.status = 'completed'
    and b.deleted_at is null
  for update of e;
  if earning_row.id is null then
    raise exception 'Completed paid booking not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.disputes d
    where d.booking_id = p_booking_id
      and lower(d.status) not in ('resolved', 'closed', 'rejected', 'cancelled')
  ) then
    raise exception 'Earnings are held while the dispute is reviewed'
      using errcode = '55000';
  end if;

  select exists (
    select 1
    from private.payment_audit_events a
    where a.event_type = 'customer_completion_confirmed'
      and a.actor_id = uid
      and a.idempotency_key = p_idempotency_key
  ) into audit_exists;
  if not audit_exists then
    insert into private.payment_audit_events(
      event_type,
      actor_id,
      actor_kind,
      booking_id,
      payment_id,
      idempotency_key,
      sanitized_metadata
    )
    values (
      'customer_completion_confirmed',
      uid,
      'customer',
      p_booking_id,
      earning_row.payment_id,
      p_idempotency_key,
      '{}'::jsonb
    );
  end if;

  update public.provider_earnings_ledger
  set customer_confirmed_at = coalesce(customer_confirmed_at, now()),
      status = case
        when status = 'held_for_dispute' then status
        else 'pending_release'
      end,
      updated_at = now()
  where id = earning_row.id
  returning * into earning_row;

  perform private.release_provider_earning(
    earning_row.id,
    'customer-release:' || earning_row.payment_id::text
  );
  return jsonb_build_object(
    'bookingId', p_booking_id,
    'status', (
      select e.status
      from public.provider_earnings_ledger e
      where e.id = earning_row.id
    ),
    'customerConfirmedAt', (
      select e.customer_confirmed_at
      from public.provider_earnings_ledger e
      where e.id = earning_row.id
    )
  );
end;
$$;

create or replace function private.release_eligible_provider_earnings(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  earning_row record;
  released_count integer := 0;
begin
  if p_limit not between 1 and 1000 then
    raise exception 'Invalid scheduler batch size' using errcode = '22023';
  end if;
  for earning_row in
    select e.id, e.payment_id
    from public.provider_earnings_ledger e
    join public.bookings b on b.id = e.booking_id
    where e.status = 'pending_release'
      and b.status = 'completed'
      and (
        e.customer_confirmed_at is not null
        or e.release_eligible_at <= now()
      )
      and not exists (
        select 1 from public.disputes d
        where d.booking_id = e.booking_id
          and lower(d.status) not in (
            'resolved',
            'closed',
            'rejected',
            'cancelled'
          )
      )
    order by e.release_eligible_at nulls first, e.id
    for update of e skip locked
    limit p_limit
  loop
    if private.release_provider_earning(
      earning_row.id,
      'scheduled-release:' || earning_row.payment_id::text
    ) then
      released_count := released_count + 1;
    end if;
  end loop;
  return released_count;
end;
$$;

create or replace function public.get_my_booking_payment_options(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  provider_uuid uuid;
  config private.payment_configuration%rowtype;
  cash_restricted boolean;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select b.provider_id into provider_uuid
  from public.bookings b
  where b.id = p_booking_id
    and b.customer_id = uid
    and b.deleted_at is null;
  if provider_uuid is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  select * into config from private.payment_configuration where id;
  cash_restricted := private.provider_cash_restricted(provider_uuid);
  return jsonb_build_object(
    'currency', 'EGP',
    'cashEnabled', not cash_restricted,
    'onlineEnabled', config.gateway_mode = 'mock',
    'onlineDevelopmentOnly', config.gateway_mode = 'mock',
    'cashRestrictionReason', case
      when cash_restricted
        then 'Cash payment is temporarily unavailable for this provider.'
      else null
    end
  );
end;
$$;

create or replace function public.get_financial_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'currency', c.currency,
    'onlinePaymentsEnabled', c.gateway_mode = 'mock',
    'onlinePaymentsDevelopmentOnly', c.gateway_mode = 'mock',
    'cashPaymentsEnabled', true,
    'withdrawalsEnabled', c.payout_mode = 'mock',
    'withdrawalsDevelopmentOnly', c.payout_mode = 'mock',
    'minimumWithdrawalMinor', c.minimum_withdrawal_minor::text,
    'releaseDelaySeconds', c.earnings_release_delay_seconds::text,
    'automaticReleaseSchedulerEnabled', c.automatic_release_scheduler_enabled
  )
  from private.payment_configuration c
  where c.id;
$$;

create or replace function private.accrue_confirmed_cash_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_row public.booking_price_snapshots%rowtype;
  debt_account uuid;
  commission_account uuid;
begin
  if new.payment_method <> 'cash'
     or new.status <> 'paid'
     or old.status = 'paid'
  then
    return new;
  end if;

  select * into snapshot_row
  from public.booking_price_snapshots
  where id = new.price_snapshot_id;
  if snapshot_row.id is null then
    raise exception 'Cash price snapshot not found' using errcode = 'P0002';
  end if;

  debt_account := private.financial_account(
    'provider_cash_commission_debt',
    new.provider_id,
    new.currency
  );
  commission_account := private.financial_account(
    'warsha_commission',
    null,
    new.currency
  );
  perform private.post_financial_transaction(
    'cash_commission_accrued',
    new.booking_id,
    new.id,
    new.currency,
    'system',
    'cash-commission:' || new.id::text,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', debt_account,
        'direction', 'debit',
        'amount_minor', snapshot_row.commission_minor
      ),
      jsonb_build_object(
        'account_id', commission_account,
        'direction', 'credit',
        'amount_minor', snapshot_row.commission_minor
      )
    ),
    jsonb_build_object('cash_payment', true)
  );

  insert into public.provider_cash_commission_records(
    provider_id,
    booking_id,
    payment_id,
    gross_minor,
    commission_minor,
    outstanding_minor,
    currency
  )
  values (
    new.provider_id,
    new.booking_id,
    new.id,
    snapshot_row.provider_gross_minor,
    snapshot_row.commission_minor,
    snapshot_row.commission_minor,
    new.currency
  )
  on conflict (payment_id) do nothing;
  return new;
end;
$$;

create trigger accrue_confirmed_cash_commission
  after update of status on public.financial_booking_payments
  for each row execute function private.accrue_confirmed_cash_commission();

create or replace function private.enforce_payout_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mode text;
begin
  select c.payout_mode into mode
  from private.payment_configuration c
  where c.id;
  if tg_table_name = 'provider_withdrawal_requests'
     and (
       tg_op = 'INSERT'
       or (
         tg_op = 'UPDATE'
         and new.status = 'paid'
         and old.status is distinct from new.status
       )
     )
     and mode <> 'mock'
  then
    raise exception 'Live payout provider is not configured'
      using errcode = '55000';
  end if;
  if tg_table_name = 'provider_payout_destinations' and tg_op = 'INSERT' then
    if new.destination_type not in ('mobile_wallet', 'bank_account') then
      raise exception 'Unsupported payout destination' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_withdrawal_payout_mode
  before insert or update of status on public.provider_withdrawal_requests
  for each row execute function private.enforce_payout_mode();
create trigger enforce_launch_payout_destinations
  before insert on public.provider_payout_destinations
  for each row execute function private.enforce_payout_mode();

create or replace function public.get_my_provider_earnings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  provider_uuid uuid;
  available_amount bigint;
  cash_debt bigint;
  recovery_debt bigint;
  config private.payment_configuration%rowtype;
  result jsonb;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select p.id into provider_uuid
  from public.provider_profiles p
  where p.user_id = uid and p.deleted_at is null;
  if provider_uuid is null then
    raise exception 'Provider profile not found' using errcode = '42501';
  end if;

  available_amount := greatest(
    private.available_earnings_balance(provider_uuid),
    0
  );
  cash_debt := greatest(
    private.financial_debt_balance(
      provider_uuid,
      'provider_cash_commission_debt'
    ),
    0
  );
  recovery_debt := greatest(
    private.financial_debt_balance(
      provider_uuid,
      'provider_recovery_debt'
    ),
    0
  );
  select * into config from private.payment_configuration where id;

  select jsonb_build_object(
    'providerId', provider_uuid,
    'currency', 'EGP',
    'availableMinor', available_amount::text,
    'pendingMinor', coalesce(sum(
      greatest(e.net_minor - e.debt_offset_minor, 0)
    ) filter (
      where e.status in (
        'pending_job_completion',
        'pending_release',
        'held_for_dispute'
      )
    ), 0)::text,
    'paidOutMinor', coalesce((
      select sum(w.amount_minor)
      from public.provider_withdrawal_requests w
      where w.provider_id = provider_uuid and w.status = 'paid'
    ), 0)::text,
    'heldMinor', coalesce(sum(e.held_minor), 0)::text,
    'cashCommissionDueMinor', cash_debt::text,
    'recoverableAdjustmentMinor', recovery_debt::text,
    'cashDebtRestrictionThresholdMinor',
      config.cash_debt_restriction_threshold_minor::text,
    'cashPaymentsRestricted',
      cash_debt > config.cash_debt_restriction_threshold_minor,
    'minimumWithdrawalMinor', config.minimum_withdrawal_minor::text,
    'withdrawalFeeMinor', config.withdrawal_fee_minor::text,
    'withdrawalsEnabled', config.payout_mode = 'mock',
    'releaseDelaySeconds', config.earnings_release_delay_seconds::text,
    'automaticReleaseSchedulerEnabled',
      config.automatic_release_scheduler_enabled,
    'transactions', coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'bookingId', e.booking_id,
      'service', b.service_name_snapshot,
      'date', e.created_at,
      'grossMinor', e.gross_minor::text,
      'commissionMinor', e.commission_minor::text,
      'netMinor', e.net_minor::text,
      'debtOffsetMinor', e.debt_offset_minor::text,
      'heldMinor', e.held_minor::text,
      'currency', e.currency,
      'status', e.status,
      'releaseEligibleAt', e.release_eligible_at,
      'customerConfirmedAt', e.customer_confirmed_at
    ) order by e.created_at desc) filter (where e.id is not null), '[]'::jsonb)
  ) into result
  from public.provider_earnings_ledger e
  join public.bookings b on b.id = e.booking_id
  where e.provider_id = provider_uuid;
  return result;
end;
$$;

create or replace function public.get_my_booking_payment(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  result jsonb;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'paymentId', p.id,
    'bookingId', p.booking_id,
    'status', p.status,
    'paymentMethod', p.payment_method,
    'amountMinor', p.amount_minor::text,
    'refundedMinor', p.refunded_minor::text,
    'currency', p.currency,
    'reference', p.customer_reference,
    'paidAt', p.paid_at,
    'createdAt', p.created_at,
    'snapshot', jsonb_build_object(
      'serviceSubtotalMinor', s.service_subtotal_minor::text,
      'calloutFeeMinor', s.callout_fee_minor::text,
      'emergencyFeeMinor', s.emergency_fee_minor::text,
      'discountMinor', s.promotion_minor::text,
      'promotionMinor', s.promotion_minor::text,
      'taxMinor', s.tax_minor::text,
      'approvedJobPriceMinor', s.provider_gross_minor::text,
      'customerTotalMinor', s.customer_total_minor::text,
      'currency', s.currency,
      'version', s.version
    ),
    'refundStatus', (
      select r.status
      from public.financial_refunds r
      where r.payment_id = p.id
      order by r.created_at desc
      limit 1
    )
  ) into result
  from public.financial_booking_payments p
  join public.booking_price_snapshots s on s.id = p.price_snapshot_id
  where p.booking_id = p_booking_id and p.customer_id = uid;
  if result is null and not private.customer_owns_financial_booking(p_booking_id) then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create or replace function public.get_my_booking_receipt(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  result jsonb;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'transactionReference', p.customer_reference,
    'bookingReference', b.id,
    'service', b.service_name_snapshot,
    'providerName', provider.display_name,
    'timestamp', p.paid_at,
    'approvedJobPriceMinor', s.provider_gross_minor::text,
    'promotionMinor', s.promotion_minor::text,
    'amountMinor', p.amount_minor::text,
    'currency', p.currency,
    'paymentMethod', p.payment_method,
    'paymentStatus', p.status,
    'refundedMinor', p.refunded_minor::text
  ) into result
  from public.financial_booking_payments p
  join public.booking_price_snapshots s on s.id = p.price_snapshot_id
  join public.bookings b on b.id = p.booking_id
  join public.provider_profiles provider on provider.id = p.provider_id
  where p.booking_id = p_booking_id
    and p.customer_id = uid
    and p.status in ('paid', 'partially_refunded', 'refunded');
  return result;
end;
$$;

create or replace function public.process_financial_refund(
  p_payment_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  payment_row public.financial_booking_payments%rowtype;
  snapshot_row public.booking_price_snapshots%rowtype;
  earning_row public.provider_earnings_ledger%rowtype;
  refund_row public.financial_refunds%rowtype;
  cumulative_refund bigint;
  prior_provider_reversal bigint;
  prior_commission_reversal bigint;
  prior_promotion_reversal bigint;
  prior_tax_reversal bigint;
  target_commission_reversal bigint;
  target_promotion_reversal bigint;
  target_tax_reversal bigint;
  provider_reversal bigint;
  commission_reversal bigint;
  promotion_reversal bigint;
  tax_reversal bigint;
  provider_account uuid;
  commission_account uuid;
  promotion_account uuid;
  tax_account uuid;
  customer_account uuid;
begin
  if uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_amount_minor is null
     or p_amount_minor < 1
     or p_amount_minor > 1000000000
     or length(btrim(coalesce(p_reason, ''))) not between 3 and 500
     or length(coalesce(p_idempotency_key, '')) not between 8 and 300
  then
    raise exception 'Invalid refund request' using errcode = '22023';
  end if;

  select * into payment_row
  from public.financial_booking_payments
  where id = p_payment_id
  for update;
  if payment_row.id is null then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  select * into refund_row
  from public.financial_refunds
  where payment_id = p_payment_id and idempotency_key = p_idempotency_key;
  if refund_row.id is not null then
    return jsonb_build_object('id', refund_row.id, 'status', refund_row.status);
  end if;
  if payment_row.status not in ('paid', 'partially_refunded')
     or p_amount_minor > payment_row.amount_minor - payment_row.refunded_minor
  then
    raise exception 'Refund amount is not available' using errcode = '22023';
  end if;

  select * into snapshot_row
  from public.booking_price_snapshots
  where id = payment_row.price_snapshot_id;
  select * into earning_row
  from public.provider_earnings_ledger
  where payment_id = payment_row.id
  for update;
  if earning_row.status not in (
    'pending_job_completion',
    'pending_release',
    'held_for_dispute'
  ) then
    raise exception 'Released earnings require a reviewed financial case'
      using errcode = '55000';
  end if;

  select
    coalesce(sum(r.provider_reversal_minor), 0),
    coalesce(sum(r.commission_reversal_minor), 0),
    coalesce(sum(r.promotion_reversal_minor), 0),
    coalesce(sum(r.tax_reversal_minor), 0)
  into
    prior_provider_reversal,
    prior_commission_reversal,
    prior_promotion_reversal,
    prior_tax_reversal
  from public.financial_refunds r
  where r.payment_id = payment_row.id and r.status = 'succeeded';

  cumulative_refund := payment_row.refunded_minor + p_amount_minor;
  if cumulative_refund = payment_row.amount_minor then
    target_commission_reversal := snapshot_row.commission_minor;
    target_promotion_reversal := snapshot_row.promotion_minor;
    target_tax_reversal := snapshot_row.tax_minor;
  else
    -- Cumulative floor allocation avoids repeated-partial-refund drift. The
    -- final refund always consumes the exact component remainder.
    target_commission_reversal := floor(
      snapshot_row.commission_minor::numeric
        * cumulative_refund::numeric
        / payment_row.amount_minor::numeric
    )::bigint;
    target_promotion_reversal := floor(
      snapshot_row.promotion_minor::numeric
        * cumulative_refund::numeric
        / payment_row.amount_minor::numeric
    )::bigint;
    target_tax_reversal := floor(
      snapshot_row.tax_minor::numeric
        * cumulative_refund::numeric
        / payment_row.amount_minor::numeric
    )::bigint;
  end if;

  commission_reversal :=
    target_commission_reversal - prior_commission_reversal;
  promotion_reversal :=
    target_promotion_reversal - prior_promotion_reversal;
  tax_reversal := target_tax_reversal - prior_tax_reversal;
  provider_reversal :=
    p_amount_minor + promotion_reversal
      - commission_reversal - tax_reversal;
  if provider_reversal < 0
     or provider_reversal > earning_row.net_minor
     or commission_reversal > earning_row.commission_minor
  then
    raise exception 'Refund component allocation is invalid'
      using errcode = '23514';
  end if;

  provider_account := private.financial_account(
    'provider_pending',
    payment_row.provider_id,
    payment_row.currency
  );
  commission_account := private.financial_account(
    'warsha_commission',
    null,
    payment_row.currency
  );
  promotion_account := private.financial_account(
    'warsha_promotion_expense',
    null,
    payment_row.currency
  );
  tax_account := private.financial_account(
    'tax_payable',
    null,
    payment_row.currency
  );
  customer_account := private.financial_account(
    'customer_payment_clearing',
    null,
    payment_row.currency
  );
  perform private.post_financial_transaction(
    'refund_succeeded',
    payment_row.booking_id,
    payment_row.id,
    payment_row.currency,
    'staff',
    'refund:' || p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', provider_account,
        'direction', 'debit',
        'amount_minor', provider_reversal
      ),
      jsonb_build_object(
        'account_id', commission_account,
        'direction', 'debit',
        'amount_minor', commission_reversal
      ),
      jsonb_build_object(
        'account_id', tax_account,
        'direction', 'debit',
        'amount_minor', tax_reversal
      ),
      jsonb_build_object(
        'account_id', customer_account,
        'direction', 'credit',
        'amount_minor', p_amount_minor
      ),
      jsonb_build_object(
        'account_id', promotion_account,
        'direction', 'credit',
        'amount_minor', promotion_reversal
      )
    ),
    jsonb_build_object(
      'rounding_policy', 'cumulative_floor_with_final_remainder'
    )
  );

  insert into public.financial_refunds(
    payment_id,
    customer_id,
    amount_minor,
    currency,
    status,
    reason,
    customer_reference,
    idempotency_key,
    provider_reversal_minor,
    commission_reversal_minor,
    promotion_reversal_minor,
    tax_reversal_minor
  )
  values (
    payment_row.id,
    payment_row.customer_id,
    p_amount_minor,
    payment_row.currency,
    'succeeded',
    btrim(p_reason),
    'WSR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    p_idempotency_key,
    provider_reversal,
    commission_reversal,
    promotion_reversal,
    tax_reversal
  )
  returning * into refund_row;

  update public.financial_booking_payments
  set refunded_minor = refunded_minor + p_amount_minor,
      status = case
        when refunded_minor + p_amount_minor = amount_minor then 'refunded'
        else 'partially_refunded'
      end,
      updated_at = now()
  where id = payment_row.id;
  update public.provider_earnings_ledger
  set gross_minor = gross_minor - provider_reversal - commission_reversal,
      commission_minor = commission_minor - commission_reversal,
      net_minor = net_minor - provider_reversal,
      status = case
        when net_minor - provider_reversal = 0 then 'reversed'
        else status
      end,
      updated_at = now()
  where id = earning_row.id;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    payment_row.customer_id,
    'refund_completed',
    'Refund completed',
    'Your refund has been recorded.',
    jsonb_build_object(
      'booking_id', payment_row.booking_id,
      'payment_id', payment_row.id,
      'refund_id', refund_row.id
    ),
    'refund-completed:' || refund_row.id::text
  ) on conflict do nothing;
  return jsonb_build_object(
    'id', refund_row.id,
    'status', refund_row.status,
    'amountMinor', refund_row.amount_minor::text,
    'currency', refund_row.currency
  );
end;
$$;

create or replace function public.create_post_release_financial_case(
  p_payment_id uuid,
  p_case_type text,
  p_amount_minor bigint,
  p_public_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  payment_row public.financial_booking_payments%rowtype;
  earning_status text;
  case_row public.provider_financial_cases%rowtype;
begin
  if uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_case_type not in ('post_release_refund', 'chargeback')
     or p_amount_minor is null
     or p_amount_minor < 1
     or length(btrim(coalesce(p_public_reason, ''))) not between 3 and 500
     or length(coalesce(p_idempotency_key, '')) not between 8 and 300
  then
    raise exception 'Invalid financial case' using errcode = '22023';
  end if;

  select p.* into payment_row
  from public.financial_booking_payments p
  where p.id = p_payment_id
  for update;
  select e.status into earning_status
  from public.provider_earnings_ledger e
  where e.payment_id = p_payment_id;
  if payment_row.id is null
     or earning_status not in ('available', 'withdrawal_requested', 'paid_out')
  then
    raise exception 'Released payment not found' using errcode = 'P0002';
  end if;
  if p_amount_minor > payment_row.amount_minor - payment_row.refunded_minor then
    raise exception 'Financial case amount exceeds the payment'
      using errcode = '22023';
  end if;

  insert into public.provider_financial_cases(
    provider_id,
    booking_id,
    payment_id,
    case_type,
    amount_minor,
    currency,
    public_reason,
    idempotency_key
  )
  values (
    payment_row.provider_id,
    payment_row.booking_id,
    payment_row.id,
    p_case_type,
    p_amount_minor,
    payment_row.currency,
    btrim(p_public_reason),
    p_idempotency_key
  )
  on conflict (payment_id, case_type, idempotency_key) do update
    set created_at = public.provider_financial_cases.created_at
  returning * into case_row;

  insert into private.payment_audit_events(
    event_type,
    actor_id,
    actor_kind,
    booking_id,
    payment_id,
    idempotency_key,
    sanitized_metadata
  )
  values (
    'post_release_case_created',
    uid,
    'staff',
    payment_row.booking_id,
    payment_row.id,
    p_idempotency_key,
    jsonb_build_object(
      'case_id', case_row.id,
      'case_type', p_case_type,
      'amount_minor', p_amount_minor
    )
  )
  on conflict (event_type, actor_id, idempotency_key) do nothing;
  return jsonb_build_object(
    'id', case_row.id,
    'status', case_row.status,
    'caseType', case_row.case_type,
    'amountMinor', case_row.amount_minor::text
  );
end;
$$;

create or replace function public.decide_post_release_financial_case(
  p_case_id uuid,
  p_provider_responsibility_minor bigint,
  p_public_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  case_row public.provider_financial_cases%rowtype;
  available_minor bigint;
  recovered_minor bigint;
  debt_minor bigint;
  absorbed_minor bigint;
  available_account uuid;
  debt_account uuid;
  loss_account uuid;
  clearing_account uuid;
begin
  if uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_provider_responsibility_minor is null
     or p_provider_responsibility_minor < 0
     or length(btrim(coalesce(p_public_reason, ''))) not between 3 and 500
     or length(coalesce(p_idempotency_key, '')) not between 8 and 300
  then
    raise exception 'Invalid financial case decision' using errcode = '22023';
  end if;

  select * into case_row
  from public.provider_financial_cases
  where id = p_case_id
  for update;
  if case_row.id is null then
    raise exception 'Financial case not found' using errcode = 'P0002';
  end if;
  if case_row.decision_idempotency_key = p_idempotency_key then
    return jsonb_build_object(
      'id', case_row.id,
      'status', case_row.status,
      'providerDebtMinor', case_row.provider_debt_minor::text
    );
  end if;
  if case_row.status <> 'under_review'
     or p_provider_responsibility_minor > case_row.amount_minor
  then
    raise exception 'Financial case cannot be decided' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('provider-recovery:' || case_row.provider_id::text, 0)
  );
  available_minor := greatest(
    private.available_earnings_balance(case_row.provider_id),
    0
  );
  recovered_minor := least(
    available_minor,
    p_provider_responsibility_minor
  );
  debt_minor := p_provider_responsibility_minor - recovered_minor;
  absorbed_minor := case_row.amount_minor - p_provider_responsibility_minor;

  available_account := private.financial_account(
    'provider_available',
    case_row.provider_id,
    case_row.currency
  );
  debt_account := private.financial_account(
    'provider_recovery_debt',
    case_row.provider_id,
    case_row.currency
  );
  loss_account := private.financial_account(
    'warsha_financial_loss',
    null,
    case_row.currency
  );
  clearing_account := private.financial_account(
    'financial_case_clearing',
    null,
    case_row.currency
  );
  perform private.post_financial_transaction(
    'post_release_recovery',
    case_row.booking_id,
    case_row.payment_id,
    case_row.currency,
    'staff',
    'financial-case:' || p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object(
        'account_id', available_account,
        'direction', 'debit',
        'amount_minor', recovered_minor
      ),
      jsonb_build_object(
        'account_id', debt_account,
        'direction', 'debit',
        'amount_minor', debt_minor
      ),
      jsonb_build_object(
        'account_id', loss_account,
        'direction', 'debit',
        'amount_minor', absorbed_minor
      ),
      jsonb_build_object(
        'account_id', clearing_account,
        'direction', 'credit',
        'amount_minor', case_row.amount_minor
      )
    ),
    jsonb_build_object(
      'case_id', case_row.id,
      'external_provider_debit', false
    )
  );

  update public.provider_financial_cases
  set status = case
        when p_provider_responsibility_minor = 0
          then 'provider_not_responsible'
        else 'recovery_approved'
      end,
      provider_responsibility_minor = p_provider_responsibility_minor,
      recovered_available_minor = recovered_minor,
      provider_debt_minor = debt_minor,
      warsha_absorbed_minor = absorbed_minor,
      public_reason = btrim(p_public_reason),
      decision_idempotency_key = p_idempotency_key,
      decided_at = now(),
      decided_by = uid
  where id = case_row.id
  returning * into case_row;

  return jsonb_build_object(
    'id', case_row.id,
    'status', case_row.status,
    'providerResponsibilityMinor',
      case_row.provider_responsibility_minor::text,
    'recoveredAvailableMinor',
      case_row.recovered_available_minor::text,
    'providerDebtMinor', case_row.provider_debt_minor::text,
    'warshaAbsorbedMinor', case_row.warsha_absorbed_minor::text,
    'externalProviderDebit', false
  );
end;
$$;

alter table public.provider_cash_commission_records enable row level security;
alter table public.provider_financial_cases enable row level security;

create policy provider_cash_commission_owner_read
on public.provider_cash_commission_records
for select to authenticated
using (private.owns_financial_provider(provider_id));

create policy provider_financial_cases_owner_read
on public.provider_financial_cases
for select to authenticated
using (private.owns_financial_provider(provider_id));

create trigger provider_cash_commission_no_delete
  before delete on public.provider_cash_commission_records
  for each row execute function private.prevent_financial_mutation();
create trigger provider_financial_cases_no_delete
  before delete on public.provider_financial_cases
  for each row execute function private.prevent_financial_mutation();

revoke all on table private.payment_configuration_history
  from public, anon, authenticated;
revoke all on table public.provider_cash_commission_records,
  public.provider_financial_cases
  from public, anon, authenticated;
grant select on table public.provider_cash_commission_records,
  public.provider_financial_cases
  to authenticated;

revoke all on function private.audit_payment_configuration()
  from public, anon, authenticated;
revoke all on function private.financial_debt_balance(uuid,text)
  from public, anon, authenticated;
revoke all on function private.available_earnings_balance(uuid)
  from public, anon, authenticated;
revoke all on function private.provider_cash_restricted(uuid)
  from public, anon, authenticated;
revoke all on function private.enforce_cash_payment_restriction()
  from public, anon, authenticated;
revoke all on function private.record_gateway_fee(uuid,bigint,text)
  from public, anon, authenticated;
revoke all on function private.release_eligible_provider_earnings(integer)
  from public, anon, authenticated;
revoke all on function private.accrue_confirmed_cash_commission()
  from public, anon, authenticated;
revoke all on function private.enforce_payout_mode()
  from public, anon, authenticated;

revoke all on function public.confirm_booking_completion_for_payment(uuid,text)
  from public, anon, authenticated;
revoke all on function public.get_my_booking_payment_options(uuid)
  from public, anon, authenticated;
revoke all on function public.get_financial_capabilities()
  from public, anon, authenticated;
revoke all on function public.create_post_release_financial_case(uuid,text,bigint,text,text)
  from public, anon, authenticated;
revoke all on function public.decide_post_release_financial_case(uuid,bigint,text,text)
  from public, anon, authenticated;

grant execute on function public.confirm_booking_completion_for_payment(uuid,text)
  to authenticated;
grant execute on function public.get_my_booking_payment_options(uuid)
  to authenticated;
grant execute on function public.get_financial_capabilities()
  to authenticated;
grant execute on function public.create_post_release_financial_case(uuid,text,bigint,text,text)
  to authenticated;
grant execute on function public.decide_post_release_financial_case(uuid,bigint,text,text)
  to authenticated;

-- Reassert the trusted boundaries of replaced functions.
-- The balance constraint is deferred, so it can fire after a guarded staff RPC
-- has returned to the authenticated role. It must retain private-ledger read
-- authority without granting that role direct table access.
alter function private.assert_balanced_financial_transaction()
  security definer;
alter function private.assert_balanced_financial_transaction()
  set search_path = '';
revoke all on function private.assert_balanced_financial_transaction()
  from public, anon, authenticated;

revoke all on function private.calculate_commission(bigint,text)
  from public, anon, authenticated;
revoke all on function private.create_booking_price_snapshot(uuid,bigint)
  from public, anon, authenticated;
revoke all on function private.release_provider_earning(uuid,text)
  from public, anon, authenticated;
revoke all on function private.process_mock_payment_event(text,uuid,text,boolean)
  from public, anon, authenticated;
revoke all on function private.release_completed_booking_earning()
  from public, anon, authenticated;
revoke all on function public.get_my_provider_earnings()
  from public, anon, authenticated;
revoke all on function public.get_my_booking_payment(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_booking_receipt(uuid)
  from public, anon, authenticated;
revoke all on function public.process_financial_refund(uuid,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.get_my_provider_earnings()
  to authenticated;
grant execute on function public.get_my_booking_payment(uuid)
  to authenticated;
grant execute on function public.get_my_booking_receipt(uuid)
  to authenticated;
grant execute on function public.process_financial_refund(uuid,bigint,text,text)
  to authenticated;

comment on function private.calculate_commission(bigint,text) is
  'WPS-007: 10% basis points, floor at the piastre boundary, no fixed/min/max fee.';
comment on function private.release_eligible_provider_earnings(integer) is
  'Scheduler contract only. Run from a trusted database scheduler; no client execution grant.';
comment on function private.record_gateway_fee(uuid,bigint,text) is
  'Trusted gateway boundary. Gateway fees are Warsha expense and never change customer or provider amounts.';
comment on table public.provider_payout_destinations is
  'Masked provider-neutral payout metadata only. Saving a row does not make live payouts operational.';

create or replace function public.get_my_provider_booking_payment(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  result jsonb;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'paymentId', payment.id,
    'bookingId', payment.booking_id,
    'status', payment.status,
    'paymentMethod', payment.payment_method,
    'amountMinor', payment.amount_minor::text,
    'approvedJobPriceMinor', snapshot.provider_gross_minor::text,
    'commissionMinor', snapshot.commission_minor::text,
    'currency', payment.currency,
    'reference', payment.customer_reference,
    'createdAt', payment.created_at
  ) into result
  from public.financial_booking_payments payment
  join public.booking_price_snapshots snapshot
    on snapshot.id = payment.price_snapshot_id
  join public.provider_profiles provider on provider.id = payment.provider_id
  where payment.booking_id = p_booking_id
    and provider.user_id = uid
    and provider.deleted_at is null;
  if result is null then
    raise exception 'Provider payment not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.get_my_provider_booking_payment(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_provider_booking_payment(uuid)
  to authenticated;
