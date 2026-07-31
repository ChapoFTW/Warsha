-- Warsha v0.8: payment, earnings, and append-only transaction ledger.
--
-- The legacy v0.1 operations tables store decimal EGP values. They remain for
-- migration compatibility but are not authoritative for this domain.
-- Production payment processing is intentionally disabled until the product
-- owner supplies commercial settings and a licensed gateway integration.

create table private.payment_configuration (
  id boolean primary key default true check (id),
  policy_version text not null,
  currency text not null check (currency = 'EGP'),
  commission_bps integer check (commission_bps between 0 and 10000),
  fixed_commission_minor bigint check (fixed_commission_minor between 0 and 1000000000),
  minimum_commission_minor bigint check (minimum_commission_minor between 0 and 1000000000),
  maximum_commission_minor bigint check (
    maximum_commission_minor between 0 and 1000000000
    and (
      minimum_commission_minor is null
      or maximum_commission_minor >= minimum_commission_minor
    )
  ),
  minimum_withdrawal_minor bigint check (minimum_withdrawal_minor between 1 and 1000000000),
  earnings_release_delay_seconds bigint check (earnings_release_delay_seconds between 0 and 31536000),
  refund_reversal_policy text check (
    refund_reversal_policy in ('proportional_provider_and_commission_reversal')
  ),
  gateway_mode text not null default 'disabled'
    check (gateway_mode in ('disabled', 'mock')),
  live_gateway_name text,
  cash_settlement_policy text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  check (gateway_mode <> 'disabled' or live_gateway_name is null)
);

insert into private.payment_configuration (
  policy_version,
  currency,
  commission_bps,
  fixed_commission_minor,
  minimum_commission_minor,
  maximum_commission_minor,
  minimum_withdrawal_minor,
  earnings_release_delay_seconds,
  refund_reversal_policy,
  gateway_mode,
  cash_settlement_policy
)
values (
  'v0.8-unconfirmed',
  'EGP',
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  'disabled',
  null
);

create table public.booking_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  version integer not null check (version > 0),
  service_subtotal_minor bigint not null check (service_subtotal_minor between 0 and 1000000000),
  callout_fee_minor bigint not null default 0 check (callout_fee_minor between 0 and 1000000000),
  emergency_fee_minor bigint not null default 0 check (emergency_fee_minor between 0 and 1000000000),
  discount_minor bigint not null default 0 check (discount_minor between 0 and 1000000000),
  tax_minor bigint not null default 0 check (tax_minor between 0 and 1000000000),
  customer_total_minor bigint not null check (customer_total_minor between 0 and 1000000000),
  provider_gross_minor bigint not null check (provider_gross_minor between 0 and 1000000000),
  commission_minor bigint not null check (commission_minor between 0 and 1000000000),
  provider_net_minor bigint not null check (provider_net_minor between 0 and 1000000000),
  currency text not null check (currency = 'EGP'),
  pricing_version text not null,
  commission_policy_version text not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (booking_id, version),
  check (
    provider_gross_minor =
      service_subtotal_minor + callout_fee_minor + emergency_fee_minor - discount_minor
  ),
  check (provider_gross_minor = provider_net_minor + commission_minor),
  check (customer_total_minor = provider_gross_minor + tax_minor)
);

create unique index booking_price_snapshots_current_unique
  on public.booking_price_snapshots(booking_id)
  where is_current;

create table public.booking_price_adjustments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  provider_id uuid not null references public.provider_profiles(id),
  previous_snapshot_id uuid not null references public.booking_price_snapshots(id),
  proposed_total_minor bigint not null check (proposed_total_minor between 1 and 1000000000),
  currency text not null check (currency = 'EGP'),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired')),
  proposed_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  resulting_snapshot_id uuid references public.booking_price_snapshots(id),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  unique (provider_id, idempotency_key),
  check (
    (status = 'pending' and decided_at is null and decided_by is null and resulting_snapshot_id is null)
    or
    (status = 'accepted' and decided_at is not null and decided_by is not null and resulting_snapshot_id is not null)
    or
    (status in ('rejected', 'expired') and decided_at is not null and resulting_snapshot_id is null)
  )
);

create unique index booking_price_adjustments_pending_unique
  on public.booking_price_adjustments(booking_id)
  where status = 'pending';

create table public.financial_booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  customer_id uuid not null references public.customer_profiles(id),
  provider_id uuid not null references public.provider_profiles(id),
  price_snapshot_id uuid not null references public.booking_price_snapshots(id),
  payment_method text not null check (payment_method in ('online', 'cash')),
  status text not null
    check (status in (
      'not_required',
      'awaiting_payment',
      'payment_initiated',
      'pending',
      'authorized',
      'paid',
      'failed',
      'cancelled',
      'partially_refunded',
      'refunded',
      'disputed',
      'chargeback',
      'expired'
    )),
  amount_minor bigint not null check (amount_minor between 0 and 1000000000),
  refunded_minor bigint not null default 0 check (refunded_minor between 0 and 1000000000),
  currency text not null check (currency = 'EGP'),
  customer_reference text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (booking_id),
  check (refunded_minor <= amount_minor),
  check (
    (status = 'paid' and paid_at is not null)
    or status <> 'paid'
  )
);

create table private.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.financial_booking_payments(id),
  customer_id uuid not null references public.customer_profiles(id),
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired')),
  provider_adapter text not null check (provider_adapter in ('mock', 'disabled_live')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  sanitized_checkout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, idempotency_key),
  unique (payment_id, attempt_number)
);

create table private.financial_ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  account_type text not null check (account_type in (
    'customer_payment_clearing',
    'provider_pending',
    'provider_available',
    'warsha_commission',
    'tax_payable',
    'refunds_payable',
    'payout_clearing',
    'external_payout'
  )),
  provider_id uuid references public.provider_profiles(id),
  currency text not null check (currency = 'EGP'),
  created_at timestamptz not null default now(),
  check (
    (account_type in ('provider_pending', 'provider_available') and provider_id is not null)
    or
    (account_type not in ('provider_pending', 'provider_available') and provider_id is null)
  )
);

create unique index financial_ledger_system_account_unique
  on private.financial_ledger_accounts(account_type, currency)
  where provider_id is null;
create unique index financial_ledger_provider_account_unique
  on private.financial_ledger_accounts(account_type, provider_id, currency)
  where provider_id is not null;

create table private.financial_ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (transaction_type in (
    'online_payment_confirmed',
    'earning_released',
    'withdrawal_reserved',
    'withdrawal_released',
    'withdrawal_paid',
    'refund_succeeded',
    'earning_held',
    'earning_hold_released'
  )),
  booking_id uuid references public.bookings(id),
  payment_id uuid references public.financial_booking_payments(id),
  currency text not null check (currency = 'EGP'),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_kind text not null check (actor_kind in ('gateway', 'system', 'staff', 'provider')),
  idempotency_key text not null check (length(idempotency_key) between 3 and 300),
  audit_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (transaction_type, idempotency_key, currency)
);

create table private.financial_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references private.financial_ledger_transactions(id),
  account_id uuid not null references private.financial_ledger_accounts(id),
  direction text not null check (direction in ('debit', 'credit')),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000),
  currency text not null check (currency = 'EGP'),
  created_at timestamptz not null default now(),
  unique (transaction_id, account_id, direction)
);

create table public.provider_earnings_ledger (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id),
  booking_id uuid not null references public.bookings(id),
  payment_id uuid not null unique references public.financial_booking_payments(id),
  price_snapshot_id uuid not null references public.booking_price_snapshots(id),
  gross_minor bigint not null check (gross_minor between 0 and 1000000000),
  commission_minor bigint not null check (commission_minor between 0 and 1000000000),
  net_minor bigint not null check (net_minor between 0 and 1000000000),
  held_minor bigint not null default 0 check (held_minor between 0 and 1000000000),
  currency text not null check (currency = 'EGP'),
  status text not null check (status in (
    'pending_job_completion',
    'pending_release',
    'available',
    'withdrawal_requested',
    'paid_out',
    'reversed',
    'held_for_dispute'
  )),
  available_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (gross_minor = commission_minor + net_minor),
  check (held_minor <= net_minor)
);

create table public.provider_payout_destinations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id),
  destination_type text not null check (destination_type in ('mobile_wallet', 'bank_account', 'instapay_preparation', 'manual')),
  display_label text not null check (length(btrim(display_label)) between 2 and 80),
  masked_value text not null check (length(masked_value) between 4 and 24),
  is_preferred boolean not null default false,
  ownership_confirmed_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index provider_payout_destination_preferred_unique
  on public.provider_payout_destinations(provider_id)
  where is_preferred and status = 'active';

create table private.payout_destination_fingerprints (
  destination_id uuid primary key references public.provider_payout_destinations(id),
  value_sha256 text not null check (length(value_sha256) = 64),
  future_provider_token text,
  created_at timestamptz not null default now()
);

create table public.provider_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id),
  payout_destination_id uuid not null references public.provider_payout_destinations(id),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000),
  currency text not null check (currency = 'EGP'),
  status text not null default 'requested' check (status in (
    'requested',
    'under_review',
    'processing',
    'paid',
    'failed',
    'cancelled',
    'reversed'
  )),
  destination_type_snapshot text not null,
  destination_masked_snapshot text not null,
  provider_reference text not null unique,
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_reason text,
  unique (provider_id, idempotency_key)
);

create table public.financial_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.financial_booking_payments(id),
  customer_id uuid not null references public.customer_profiles(id),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000),
  currency text not null check (currency = 'EGP'),
  status text not null check (status in ('requested', 'pending', 'succeeded', 'failed', 'rejected', 'cancelled')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  customer_reference text not null unique,
  idempotency_key text not null check (length(idempotency_key) between 8 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, idempotency_key)
);

create table public.provider_earning_holds (
  id uuid primary key default gen_random_uuid(),
  earning_id uuid not null references public.provider_earnings_ledger(id),
  provider_id uuid not null references public.provider_profiles(id),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000),
  currency text not null check (currency = 'EGP'),
  status text not null check (status in ('active', 'released', 'reversed')),
  public_reason text not null check (length(btrim(public_reason)) between 3 and 200),
  idempotency_key text not null check (length(idempotency_key) between 8 and 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (earning_id, idempotency_key)
);

create table private.payment_gateway_events (
  id uuid primary key default gen_random_uuid(),
  gateway_name text not null,
  gateway_event_id text not null,
  attempt_id uuid references private.payment_attempts(id),
  event_type text not null,
  signature_verified boolean not null,
  raw_body_sha256 text not null check (length(raw_body_sha256) = 64),
  processing_status text not null check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  failure_code text,
  sanitized_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (gateway_name, gateway_event_id)
);

create table private.payment_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_kind text not null,
  booking_id uuid references public.bookings(id),
  payment_id uuid references public.financial_booking_payments(id),
  withdrawal_id uuid references public.provider_withdrawal_requests(id),
  refund_id uuid references public.financial_refunds(id),
  idempotency_key text,
  sanitized_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_type, actor_id, idempotency_key)
);

create or replace function private.localize_financial_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  language_code text;
begin
  if new.type not in (
    'payment_confirmed',
    'payment_failed',
    'refund_initiated',
    'refund_completed',
    'refund_failed',
    'earnings_pending',
    'earnings_available',
    'withdrawal_requested',
    'withdrawal_paid',
    'withdrawal_failed',
    'earnings_held',
    'earnings_released',
    'cash_collection_reported',
    'cash_collection_confirmed',
    'cash_collection_disputed'
  ) then
    return new;
  end if;
  select p.preferred_language into language_code
  from public.profiles p
  where p.id = new.user_id;
  if language_code <> 'ar' then
    return new;
  end if;

  new.title := case new.type
    when 'payment_confirmed' then 'تم تأكيد الدفع'
    when 'payment_failed' then 'الدفع ما تمّش'
    when 'refund_initiated' then 'بدأ استرداد المبلغ'
    when 'refund_completed' then 'تم استرداد المبلغ'
    when 'refund_failed' then 'استرداد المبلغ ما تمّش'
    when 'earnings_pending' then 'أرباح معلّقة'
    when 'earnings_available' then 'أرباحك متاحة'
    when 'withdrawal_requested' then 'تم طلب السحب'
    when 'withdrawal_paid' then 'تم صرف الأرباح'
    when 'withdrawal_failed' then 'تعذّر صرف الأرباح'
    when 'earnings_held' then 'مبلغ متوقف للمراجعة'
    when 'cash_collection_reported' then 'أكد الدفع الكاش'
    when 'cash_collection_confirmed' then 'تم تأكيد الدفع الكاش'
    when 'cash_collection_disputed' then 'الدفع الكاش محتاج مراجعة'
    else 'المبلغ متاح تاني'
  end;
  new.body := case new.type
    when 'payment_confirmed' then 'تم تأكيد دفع الحجز.'
    when 'payment_failed' then 'الدفع ما تمّش. تقدر تحاول تاني.'
    when 'refund_initiated' then 'طلب استرداد المبلغ قيد التنفيذ.'
    when 'refund_completed' then 'تم تسجيل استرداد المبلغ.'
    when 'refund_failed' then 'تعذّر استرداد المبلغ. كلم الدعم للمساعدة.'
    when 'earnings_pending' then 'اتسجلت أرباح الشغل وهتبقى متاحة بعد اكتماله.'
    when 'earnings_available' then 'أرباح شغل مكتمل بقت متاحة للسحب.'
    when 'withdrawal_requested' then 'طلب السحب بيتراجع دلوقتي.'
    when 'withdrawal_paid' then 'تم إكمال طلب السحب.'
    when 'withdrawal_failed' then 'تعذّر إكمال السحب والمبلغ بقى متاح تاني.'
    when 'earnings_held' then 'المبلغ متوقف مؤقتًا لمراجعة مشكلة.'
    when 'cash_collection_reported' then 'الفني سجّل إنه استلم الدفع كاش. أكد لنا اللي حصل.'
    when 'cash_collection_confirmed' then 'العميل أكد الدفع الكاش.'
    when 'cash_collection_disputed' then 'العميل ما أكدش الدفع الكاش المسجّل.'
    else 'تم إنهاء المراجعة والمبلغ متاح تاني.'
  end;
  return new;
end;
$$;

create trigger localize_financial_notifications
  before insert on public.notifications
  for each row execute function private.localize_financial_notification();

create index financial_booking_payments_customer_idx
  on public.financial_booking_payments(customer_id, created_at desc);
create index provider_earnings_provider_idx
  on public.provider_earnings_ledger(provider_id, created_at desc);
create index provider_withdrawals_provider_idx
  on public.provider_withdrawal_requests(provider_id, requested_at desc);
create index financial_refunds_customer_idx
  on public.financial_refunds(customer_id, created_at desc);
create index ledger_entries_account_idx
  on private.financial_ledger_entries(account_id, created_at);

create or replace function private.prevent_financial_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Financial records are append-only' using errcode = '42501';
end;
$$;

create or replace function private.prevent_price_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Price snapshots are immutable' using errcode = '42501';
  end if;
  if old.is_current
     and not new.is_current
     and (to_jsonb(old) - 'is_current') = (to_jsonb(new) - 'is_current') then
    return new;
  end if;
  raise exception 'Price snapshots are immutable' using errcode = '42501';
end;
$$;

create trigger booking_price_snapshots_immutable
  before update or delete on public.booking_price_snapshots
  for each row execute function private.prevent_price_snapshot_mutation();
create trigger financial_ledger_transactions_immutable
  before update or delete on private.financial_ledger_transactions
  for each row execute function private.prevent_financial_mutation();
create trigger financial_ledger_entries_immutable
  before update or delete on private.financial_ledger_entries
  for each row execute function private.prevent_financial_mutation();
create trigger financial_refunds_no_delete
  before delete on public.financial_refunds
  for each row execute function private.prevent_financial_mutation();
create trigger provider_withdrawals_no_delete
  before delete on public.provider_withdrawal_requests
  for each row execute function private.prevent_financial_mutation();

create or replace function private.assert_balanced_financial_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  debit_total bigint;
  credit_total bigint;
  currency_count integer;
begin
  select
    coalesce(sum(e.amount_minor) filter (where e.direction = 'debit'), 0),
    coalesce(sum(e.amount_minor) filter (where e.direction = 'credit'), 0),
    count(distinct e.currency)
  into debit_total, credit_total, currency_count
  from private.financial_ledger_entries e
  where e.transaction_id = new.transaction_id;

  if debit_total = 0 or debit_total <> credit_total or currency_count <> 1 then
    raise exception 'Financial transaction must balance in one currency'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from private.financial_ledger_entries e
    join private.financial_ledger_accounts a on a.id = e.account_id
    join private.financial_ledger_transactions t on t.id = e.transaction_id
    where e.transaction_id = new.transaction_id
      and (e.currency <> a.currency or e.currency <> t.currency)
  ) then
    raise exception 'Financial transaction currency mismatch'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger financial_ledger_balanced
  after insert on private.financial_ledger_entries
  deferrable initially deferred
  for each row execute function private.assert_balanced_financial_transaction();

create or replace function private.owns_financial_provider(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_profiles p
    where p.id = p_provider_id
      and p.user_id = (select auth.uid())
      and p.deleted_at is null
  );
$$;

create or replace function private.customer_owns_financial_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and b.customer_id = (select auth.uid())
      and b.deleted_at is null
  );
$$;

create or replace function private.financial_account(
  p_type text,
  p_provider_id uuid,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid;
begin
  insert into private.financial_ledger_accounts(account_type, provider_id, currency)
  values (p_type, p_provider_id, p_currency)
  on conflict do nothing;

  select a.id into account_id
  from private.financial_ledger_accounts a
  where a.account_type = p_type
    and a.provider_id is not distinct from p_provider_id
    and a.currency = p_currency;
  if account_id is null then
    raise exception 'Financial account unavailable';
  end if;
  return account_id;
end;
$$;

create or replace function private.post_financial_transaction(
  p_transaction_type text,
  p_booking_id uuid,
  p_payment_id uuid,
  p_currency text,
  p_actor_kind text,
  p_idempotency_key text,
  p_entries jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  posted_transaction_id uuid;
  item jsonb;
  entry_count integer := 0;
begin
  select t.id into posted_transaction_id
  from private.financial_ledger_transactions t
  where t.transaction_type = p_transaction_type
    and t.idempotency_key = p_idempotency_key
    and t.currency = p_currency;
  if posted_transaction_id is not null then
    return posted_transaction_id;
  end if;

  insert into private.financial_ledger_transactions(
    transaction_type,
    booking_id,
    payment_id,
    currency,
    actor_id,
    actor_kind,
    idempotency_key,
    audit_metadata
  )
  values (
    p_transaction_type,
    p_booking_id,
    p_payment_id,
    p_currency,
    (select auth.uid()),
    p_actor_kind,
    p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into posted_transaction_id;

  for item in select value from jsonb_array_elements(p_entries)
  loop
    if coalesce((item->>'amount_minor')::bigint, 0) = 0 then
      continue;
    end if;
    insert into private.financial_ledger_entries(
      transaction_id,
      account_id,
      direction,
      amount_minor,
      currency
    )
    values (
      posted_transaction_id,
      (item->>'account_id')::uuid,
      item->>'direction',
      (item->>'amount_minor')::bigint,
      p_currency
    );
    entry_count := entry_count + 1;
  end loop;

  if entry_count < 2 or (
    select coalesce(sum(e.amount_minor) filter (where e.direction = 'debit'), 0)
      <> coalesce(sum(e.amount_minor) filter (where e.direction = 'credit'), 0)
    from private.financial_ledger_entries e
    where e.transaction_id = posted_transaction_id
  ) then
    raise exception 'Financial transaction must balance'
      using errcode = '23514';
  end if;
  return posted_transaction_id;
end;
$$;

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
  calculated numeric;
begin
  if p_gross_minor < 0 or p_gross_minor > 1000000000 then
    raise exception 'Invalid payment amount' using errcode = '22023';
  end if;
  select * into config from private.payment_configuration where id;
  if config.currency <> p_currency then
    raise exception 'Unsupported currency' using errcode = '22023';
  end if;
  if config.commission_bps is null then
    raise exception 'Commission policy is not configured'
      using errcode = '55000';
  end if;

  calculated :=
    floor((p_gross_minor::numeric * config.commission_bps::numeric) / 10000)
    + coalesce(config.fixed_commission_minor, 0);
  if config.minimum_commission_minor is not null then
    calculated := greatest(calculated, config.minimum_commission_minor);
  end if;
  if config.maximum_commission_minor is not null then
    calculated := least(calculated, config.maximum_commission_minor);
  end if;
  calculated := least(calculated, p_gross_minor);

  commission_minor := calculated::bigint;
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
  discount_minor bigint;
  tax_minor bigint := 0;
  total_minor bigint;
  gross_minor bigint;
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

  callout_minor := coalesce(round((booking_row.price_breakdown->>'transportationFee')::numeric * 100), 0)::bigint;
  emergency_minor := coalesce(round((booking_row.price_breakdown->>'emergencySurcharge')::numeric * 100), 0)::bigint;
  discount_minor := coalesce(round((booking_row.price_breakdown->>'discount')::numeric * 100), 0)::bigint;
  total_minor := coalesce(
    p_override_total_minor,
    round(coalesce(booking_row.final_price_egp, booking_row.estimated_price_egp) * 100)::bigint
  );
  if total_minor < 1 or total_minor > 1000000000 then
    raise exception 'Invalid payment amount' using errcode = '22023';
  end if;
  if callout_minor < 0 or emergency_minor < 0 or discount_minor < 0 then
    raise exception 'Invalid price breakdown' using errcode = '22023';
  end if;

  gross_minor := total_minor - tax_minor;
  service_minor := gross_minor - callout_minor - emergency_minor + discount_minor;
  if service_minor < 0 then
    raise exception 'Invalid price breakdown' using errcode = '22023';
  end if;
  select * into commission_row
  from private.calculate_commission(gross_minor, 'EGP');

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
    discount_minor,
    tax_minor,
    total_minor,
    gross_minor,
    commission_row.commission_minor,
    commission_row.provider_net_minor,
    'EGP',
    'booking-price-v1',
    commission_row.policy_version,
    (select auth.uid())
  )
  returning id into current_id;

  return current_id;
end;
$$;

create or replace function private.mask_payout_value(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text := regexp_replace(coalesce(p_value, ''), '[^0-9A-Za-z]', '', 'g');
begin
  if length(normalized) < 6 or length(normalized) > 34 then
    raise exception 'Invalid payout destination' using errcode = '22023';
  end if;
  return '•••• ' || right(normalized, 4);
end;
$$;

create or replace function public.create_booking_payment_intent(
  p_booking_id uuid,
  p_idempotency_key text,
  p_payment_method text default 'online'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  booking_row record;
  config private.payment_configuration%rowtype;
  snapshot_row public.booking_price_snapshots%rowtype;
  payment_row public.financial_booking_payments%rowtype;
  attempt_row private.payment_attempts%rowtype;
  snapshot_id uuid;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  if p_payment_method not in ('online', 'cash') then
    raise exception 'Unsupported payment method' using errcode = '22023';
  end if;

  select b.* into booking_row
  from public.bookings b
  where b.id = p_booking_id
    and b.customer_id = uid
    and b.deleted_at is null
  for update;
  if booking_row.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if booking_row.status not in (
    'accepted',
    'confirmed',
    'provider_on_the_way',
    'provider_arrived',
    'job_started',
    'awaiting_quote_approval',
    'work_in_progress',
    'awaiting_customer_confirmation',
    'completed'
  ) then
    raise exception 'Booking is not eligible for payment' using errcode = '22023';
  end if;

  select * into config from private.payment_configuration where id;
  if config.commission_bps is null then
    raise exception 'Commission policy is not configured' using errcode = '55000';
  end if;
  if p_payment_method = 'online' and config.gateway_mode = 'disabled' then
    raise exception 'Live payment provider is not configured' using errcode = '55000';
  end if;

  select a.* into attempt_row
  from private.payment_attempts a
  where a.customer_id = uid and a.idempotency_key = p_idempotency_key;
  if attempt_row.id is not null then
    select * into payment_row
    from public.financial_booking_payments
    where id = attempt_row.payment_id;
    if payment_row.booking_id <> p_booking_id then
      raise exception 'Idempotency key already used' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'paymentId', payment_row.id,
      'attemptId', attempt_row.id,
      'bookingId', payment_row.booking_id,
      'status', payment_row.status,
      'paymentMethod', payment_row.payment_method,
      'amountMinor', payment_row.amount_minor::text,
      'currency', payment_row.currency,
      'reference', payment_row.customer_reference,
      'checkout', attempt_row.sanitized_checkout
    );
  end if;

  select * into payment_row
  from public.financial_booking_payments p
  where p.booking_id = p_booking_id;
  if payment_row.id is not null and payment_row.status in (
    'paid', 'partially_refunded', 'refunded', 'disputed', 'chargeback'
  ) then
    raise exception 'Booking already has a completed payment' using errcode = '22023';
  end if;

  snapshot_id := private.create_booking_price_snapshot(p_booking_id);
  select * into snapshot_row
  from public.booking_price_snapshots
  where id = snapshot_id;

  if payment_row.id is null then
    insert into public.financial_booking_payments(
      booking_id,
      customer_id,
      provider_id,
      price_snapshot_id,
      payment_method,
      status,
      amount_minor,
      currency,
      customer_reference
    )
    values (
      p_booking_id,
      uid,
      booking_row.provider_id,
      snapshot_id,
      p_payment_method,
      case when p_payment_method = 'cash' then 'awaiting_payment' else 'payment_initiated' end,
      snapshot_row.customer_total_minor,
      snapshot_row.currency,
      'WSP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
    )
    returning * into payment_row;
  else
    if payment_row.payment_method <> p_payment_method then
      raise exception 'Payment method cannot be changed after checkout starts'
        using errcode = '22023';
    end if;
    update public.financial_booking_payments
    set status = case
          when p_payment_method = 'cash' then 'awaiting_payment'
          else 'payment_initiated'
        end,
        updated_at = now()
    where id = payment_row.id
    returning * into payment_row;
  end if;

  if p_payment_method = 'cash' then
    insert into private.payment_audit_events(
      event_type, actor_id, actor_kind, booking_id, payment_id, sanitized_metadata
    )
    values (
      'cash_selected', uid, 'customer', p_booking_id, payment_row.id,
      jsonb_build_object('method', 'cash')
    );
    return jsonb_build_object(
      'paymentId', payment_row.id,
      'bookingId', payment_row.booking_id,
      'status', payment_row.status,
      'paymentMethod', payment_row.payment_method,
      'amountMinor', payment_row.amount_minor::text,
      'currency', payment_row.currency,
      'reference', payment_row.customer_reference,
      'checkout', '{}'::jsonb
    );
  end if;

  insert into private.payment_attempts(
    payment_id,
    customer_id,
    attempt_number,
    status,
    provider_adapter,
    idempotency_key,
    sanitized_checkout
  )
  values (
    payment_row.id,
    uid,
    coalesce((
      select max(a.attempt_number) + 1
      from private.payment_attempts a
      where a.payment_id = payment_row.id
    ), 1),
    'created',
    'mock',
    p_idempotency_key,
    jsonb_build_object(
      'adapter', 'mock',
      'flow', 'server_verified_callback',
      'clientSecret', null
    )
  )
  returning * into attempt_row;

  insert into private.payment_audit_events(
    event_type, actor_id, actor_kind, booking_id, payment_id, sanitized_metadata
  )
  values (
    'payment_intent_created',
    uid,
    'customer',
    p_booking_id,
    payment_row.id,
    jsonb_build_object('attempt_id', attempt_row.id, 'adapter', 'mock')
  );

  return jsonb_build_object(
    'paymentId', payment_row.id,
    'attemptId', attempt_row.id,
    'bookingId', payment_row.booking_id,
    'status', payment_row.status,
    'paymentMethod', payment_row.payment_method,
    'amountMinor', payment_row.amount_minor::text,
    'currency', payment_row.currency,
    'reference', payment_row.customer_reference,
    'checkout', attempt_row.sanitized_checkout
  );
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
  pending_account uuid;
  available_account uuid;
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
  if earning_row.status not in ('pending_job_completion', 'pending_release') then
    raise exception 'Earning cannot be released' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.bookings b
    where b.id = earning_row.booking_id and b.status = 'completed'
  ) then
    update public.provider_earnings_ledger
    set status = 'pending_job_completion', updated_at = now()
    where id = p_earning_id;
    return false;
  end if;

  pending_account := private.financial_account('provider_pending', earning_row.provider_id, earning_row.currency);
  available_account := private.financial_account('provider_available', earning_row.provider_id, earning_row.currency);
  perform private.post_financial_transaction(
    'earning_released',
    earning_row.booking_id,
    earning_row.payment_id,
    earning_row.currency,
    'system',
    p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object('account_id', pending_account, 'direction', 'debit', 'amount_minor', earning_row.net_minor),
      jsonb_build_object('account_id', available_account, 'direction', 'credit', 'amount_minor', earning_row.net_minor)
    )
  );

  update public.provider_earnings_ledger
  set status = 'available', available_at = now(), updated_at = now()
  where id = p_earning_id;

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  select p.user_id,
         'earnings_available',
         'Earnings available',
         'Earnings from a completed job are available to withdraw.',
         jsonb_build_object('booking_id', earning_row.booking_id, 'provider_id', earning_row.provider_id),
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
  customer_account uuid;
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
    set processing_status = 'failed', failure_code = 'attempt_not_found', processed_at = now()
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
    update private.payment_attempts set status = 'failed', updated_at = now() where id = attempt_row.id;
    update public.financial_booking_payments set status = 'failed', updated_at = now() where id = payment_row.id;
    insert into public.notifications(user_id, type, title, body, data, dedupe_key)
    values (
      payment_row.customer_id,
      'payment_failed',
      'Payment failed',
      'Your payment was not completed. You can try again.',
      jsonb_build_object('booking_id', payment_row.booking_id, 'payment_id', payment_row.id),
      'payment-failed:' || event_row.id::text
    ) on conflict do nothing;
  elsif p_event_type = 'payment.pending' then
    if payment_row.status not in ('payment_initiated', 'pending') then
      raise exception 'Invalid payment status transition' using errcode = '22023';
    end if;
    update private.payment_attempts set status = 'pending', updated_at = now() where id = attempt_row.id;
    update public.financial_booking_payments set status = 'pending', updated_at = now() where id = payment_row.id;
  else
    if payment_row.status in ('partially_refunded', 'refunded', 'disputed', 'chargeback', 'cancelled') then
      raise exception 'Invalid payment status transition' using errcode = '22023';
    end if;
    if payment_row.status = 'paid' then
      update private.payment_gateway_events
      set processing_status = 'ignored', processed_at = now()
      where id = event_row.id;
      return jsonb_build_object('duplicate', false, 'status', 'paid');
    end if;
    if payment_row.amount_minor <> snapshot_row.customer_total_minor
       or payment_row.currency <> snapshot_row.currency then
      raise exception 'Payment does not match its price snapshot'
        using errcode = '23514';
    end if;

    customer_account := private.financial_account('customer_payment_clearing', null, payment_row.currency);
    pending_account := private.financial_account('provider_pending', payment_row.provider_id, payment_row.currency);
    commission_account := private.financial_account('warsha_commission', null, payment_row.currency);
    tax_account := private.financial_account('tax_payable', null, payment_row.currency);
    perform private.post_financial_transaction(
      'online_payment_confirmed',
      payment_row.booking_id,
      payment_row.id,
      payment_row.currency,
      'gateway',
      'gateway:' || p_gateway_event_id,
      jsonb_build_array(
        jsonb_build_object('account_id', customer_account, 'direction', 'debit', 'amount_minor', payment_row.amount_minor),
        jsonb_build_object('account_id', pending_account, 'direction', 'credit', 'amount_minor', snapshot_row.provider_net_minor),
        jsonb_build_object('account_id', commission_account, 'direction', 'credit', 'amount_minor', snapshot_row.commission_minor),
        jsonb_build_object('account_id', tax_account, 'direction', 'credit', 'amount_minor', snapshot_row.tax_minor)
      )
    );
    update private.payment_attempts set status = 'succeeded', updated_at = now() where id = attempt_row.id;
    update public.financial_booking_payments
    set status = 'paid', paid_at = now(), updated_at = now()
    where id = payment_row.id;
    insert into public.provider_earnings_ledger(
      provider_id,
      booking_id,
      payment_id,
      price_snapshot_id,
      gross_minor,
      commission_minor,
      net_minor,
      currency,
      status
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
        when exists (
          select 1 from public.bookings b
          where b.id = payment_row.booking_id and b.status = 'completed'
        ) then 'pending_release'
        else 'pending_job_completion'
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
      jsonb_build_object('booking_id', payment_row.booking_id, 'payment_id', payment_row.id),
      'payment-confirmed:' || payment_row.id::text
    ) on conflict do nothing;
    insert into public.notifications(user_id, type, title, body, data, dedupe_key)
    select p.user_id,
           'earnings_pending',
           'Earnings pending',
           'Earnings were recorded and will become available after the job is completed.',
           jsonb_build_object('booking_id', payment_row.booking_id, 'provider_id', payment_row.provider_id),
           'earning-pending:' || earning_id::text
    from public.provider_profiles p
    where p.id = payment_row.provider_id and p.user_id is not null
    on conflict do nothing;

    select * into config from private.payment_configuration where id;
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

create or replace function private.release_completed_booking_earning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  earning_row record;
  delay_seconds bigint;
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    select c.earnings_release_delay_seconds into delay_seconds
    from private.payment_configuration c
    where c.id;
    if delay_seconds = 0 then
      for earning_row in
        select e.id, e.payment_id
        from public.provider_earnings_ledger e
        where e.booking_id = new.id
          and e.status in ('pending_job_completion', 'pending_release')
      loop
        perform private.release_provider_earning(
          earning_row.id,
          'booking-release:' || earning_row.payment_id::text
        );
      end loop;
    end if;
  end if;
  return new;
end;
$$;

create trigger release_completed_booking_earning
  after update of status on public.bookings
  for each row execute function private.release_completed_booking_earning();

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
      'discountMinor', s.discount_minor::text,
      'taxMinor', s.tax_minor::text,
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
    'amountMinor', p.amount_minor::text,
    'currency', p.currency,
    'paymentMethod', p.payment_method,
    'paymentStatus', p.status,
    'refundedMinor', p.refunded_minor::text
  ) into result
  from public.financial_booking_payments p
  join public.bookings b on b.id = p.booking_id
  join public.provider_profiles provider on provider.id = p.provider_id
  where p.booking_id = p_booking_id
    and p.customer_id = uid
    and p.status in ('paid', 'partially_refunded', 'refunded');
  return result;
end;
$$;

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
    'currency', payment.currency,
    'reference', payment.customer_reference,
    'createdAt', payment.created_at
  ) into result
  from public.financial_booking_payments payment
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

create or replace function public.confirm_cash_collected(
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
  payment_row public.financial_booking_payments%rowtype;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  select payment.* into payment_row
  from public.financial_booking_payments payment
  join public.bookings booking on booking.id = payment.booking_id
  join public.provider_profiles provider on provider.id = payment.provider_id
  where payment.booking_id = p_booking_id
    and payment.payment_method = 'cash'
    and provider.user_id = uid
    and provider.onboarding_status = 'approved'
    and provider.is_published
    and provider.deleted_at is null
    and booking.status = 'completed'
  for update of payment;
  if payment_row.id is null then
    raise exception 'Eligible cash payment not found' using errcode = '42501';
  end if;
  if payment_row.status = 'paid' then
    return jsonb_build_object('paymentId', payment_row.id, 'status', payment_row.status);
  end if;
  if payment_row.status not in ('awaiting_payment', 'pending') then
    raise exception 'Cash payment cannot be confirmed' using errcode = '22023';
  end if;
  if payment_row.status = 'pending' then
    return jsonb_build_object('paymentId', payment_row.id, 'status', payment_row.status);
  end if;
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
    'cash_collection_reported',
    uid,
    'provider',
    p_booking_id,
    payment_row.id,
    p_idempotency_key,
    jsonb_build_object('method', 'cash')
  )
  on conflict (event_type, actor_id, idempotency_key) do nothing;
  update public.financial_booking_payments
  set status = 'pending', updated_at = now()
  where id = payment_row.id
  returning * into payment_row;
  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    payment_row.customer_id,
    'cash_collection_reported',
    'Confirm cash payment',
    'The provider reported collecting cash. Please confirm what happened.',
    jsonb_build_object('booking_id', p_booking_id, 'payment_id', payment_row.id),
    'cash-reported:' || payment_row.id::text
  )
  on conflict do nothing;
  return jsonb_build_object('paymentId', payment_row.id, 'status', payment_row.status);
end;
$$;

create or replace function public.respond_cash_collection(
  p_booking_id uuid,
  p_confirmed boolean,
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
  provider_uid uuid;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  select payment.* into payment_row
  from public.financial_booking_payments payment
  where payment.booking_id = p_booking_id
    and payment.customer_id = uid
    and payment.payment_method = 'cash'
  for update of payment;
  if payment_row.id is null then
    raise exception 'Cash payment not found' using errcode = 'P0002';
  end if;
  if payment_row.status = 'paid' and p_confirmed then
    return jsonb_build_object('paymentId', payment_row.id, 'status', payment_row.status);
  end if;
  if payment_row.status <> 'pending' then
    raise exception 'Cash collection is not awaiting confirmation' using errcode = '22023';
  end if;
  select provider.user_id into provider_uid
  from public.provider_profiles provider
  where provider.id = payment_row.provider_id;
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
    'cash_collection_customer_response',
    uid,
    'customer',
    p_booking_id,
    payment_row.id,
    p_idempotency_key,
    jsonb_build_object('confirmed', p_confirmed)
  )
  on conflict (event_type, actor_id, idempotency_key) do nothing;
  update public.financial_booking_payments
  set status = case when p_confirmed then 'paid' else 'failed' end,
      paid_at = case when p_confirmed then now() else null end,
      updated_at = now()
  where id = payment_row.id
  returning * into payment_row;
  if provider_uid is not null then
    insert into public.notifications(user_id, type, title, body, data, dedupe_key)
    values (
      provider_uid,
      case when p_confirmed then 'cash_collection_confirmed' else 'cash_collection_disputed' end,
      case when p_confirmed then 'Cash payment confirmed' else 'Cash payment needs review' end,
      case when p_confirmed
        then 'The customer confirmed the cash payment.'
        else 'The customer did not confirm the reported cash payment.'
      end,
      jsonb_build_object('booking_id', p_booking_id, 'provider_id', payment_row.provider_id),
      'cash-response:' || payment_row.id::text
    )
    on conflict do nothing;
  end if;
  return jsonb_build_object('paymentId', payment_row.id, 'status', payment_row.status);
end;
$$;

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
  available_account uuid;
  available_amount bigint;
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

  select a.id into available_account
  from private.financial_ledger_accounts a
  where a.account_type = 'provider_available'
    and a.provider_id = provider_uuid
    and a.currency = 'EGP';
  select coalesce(
    sum(case e.direction when 'credit' then e.amount_minor else -e.amount_minor end),
    0
  ) into available_amount
  from private.financial_ledger_entries e
  where e.account_id = available_account;

  select jsonb_build_object(
    'providerId', provider_uuid,
    'currency', 'EGP',
    'availableMinor', available_amount::text,
    'pendingMinor', coalesce(sum(e.net_minor) filter (
      where e.status in ('pending_job_completion', 'pending_release')
    ), 0)::text,
    'paidOutMinor', coalesce((
      select sum(w.amount_minor)
      from public.provider_withdrawal_requests w
      where w.provider_id = provider_uuid and w.status = 'paid'
    ), 0)::text,
    'heldMinor', coalesce(sum(e.held_minor), 0)::text,
    'transactions', coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'bookingId', e.booking_id,
      'service', b.service_name_snapshot,
      'date', e.created_at,
      'grossMinor', e.gross_minor::text,
      'commissionMinor', e.commission_minor::text,
      'netMinor', e.net_minor::text,
      'heldMinor', e.held_minor::text,
      'currency', e.currency,
      'status', e.status
    ) order by e.created_at desc) filter (where e.id is not null), '[]'::jsonb)
  ) into result
  from public.provider_earnings_ledger e
  join public.bookings b on b.id = e.booking_id
  where e.provider_id = provider_uuid;
  return result;
end;
$$;

create or replace function public.save_my_payout_destination(
  p_destination_type text,
  p_display_label text,
  p_destination_value text,
  p_ownership_confirmed boolean,
  p_make_preferred boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  provider_uuid uuid;
  destination_id uuid;
  masked text;
  fingerprint text;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_destination_type not in ('mobile_wallet', 'bank_account', 'instapay_preparation', 'manual') then
    raise exception 'Unsupported payout destination' using errcode = '22023';
  end if;
  if not p_ownership_confirmed then
    raise exception 'Ownership confirmation required' using errcode = '22023';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  select p.id into provider_uuid
  from public.provider_profiles p
  where p.user_id = uid
    and p.onboarding_status = 'approved'
    and p.is_published
    and p.deleted_at is null;
  if provider_uuid is null then
    raise exception 'Eligible provider profile not found' using errcode = '42501';
  end if;

  masked := private.mask_payout_value(p_destination_value);
  fingerprint := pg_catalog.encode(
    extensions.digest(p_destination_value, 'sha256'),
    'hex'
  );
  select f.destination_id into destination_id
  from private.payout_destination_fingerprints f
  join public.provider_payout_destinations d on d.id = f.destination_id
  where d.provider_id = provider_uuid and f.value_sha256 = fingerprint;
  if destination_id is not null then
    return (
      select jsonb_build_object(
        'id', d.id,
        'type', d.destination_type,
        'label', d.display_label,
        'maskedValue', d.masked_value,
        'isPreferred', d.is_preferred,
        'status', d.status
      )
      from public.provider_payout_destinations d
      where d.id = destination_id
    );
  end if;

  if p_make_preferred then
    update public.provider_payout_destinations
    set is_preferred = false, updated_at = now()
    where provider_id = provider_uuid and is_preferred;
  end if;
  insert into public.provider_payout_destinations(
    provider_id,
    destination_type,
    display_label,
    masked_value,
    is_preferred,
    ownership_confirmed_at
  )
  values (
    provider_uuid,
    p_destination_type,
    btrim(p_display_label),
    masked,
    p_make_preferred,
    now()
  )
  returning id into destination_id;
  insert into private.payout_destination_fingerprints(destination_id, value_sha256)
  values (destination_id, fingerprint);
  insert into private.payment_audit_events(
    event_type, actor_id, actor_kind, sanitized_metadata
  )
  values (
    'payout_destination_created',
    uid,
    'provider',
    jsonb_build_object(
      'destination_id', destination_id,
      'type', p_destination_type,
      'idempotency_key_hash',
      pg_catalog.encode(extensions.digest(p_idempotency_key, 'sha256'), 'hex')
    )
  );
  return (
    select jsonb_build_object(
      'id', d.id,
      'type', d.destination_type,
      'label', d.display_label,
      'maskedValue', d.masked_value,
      'isPreferred', d.is_preferred,
      'status', d.status
    )
    from public.provider_payout_destinations d
    where d.id = destination_id
  );
end;
$$;

create or replace function public.get_my_payout_destinations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  provider_uuid uuid;
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
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id,
      'type', d.destination_type,
      'label', d.display_label,
      'maskedValue', d.masked_value,
      'isPreferred', d.is_preferred,
      'status', d.status
    ) order by d.is_preferred desc, d.created_at desc)
    from public.provider_payout_destinations d
    where d.provider_id = provider_uuid and d.status = 'active'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.request_provider_withdrawal(
  p_amount_minor bigint,
  p_payout_destination_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  provider_uuid uuid;
  config private.payment_configuration%rowtype;
  destination_row public.provider_payout_destinations%rowtype;
  withdrawal_row public.provider_withdrawal_requests%rowtype;
  available_account uuid;
  payout_account uuid;
  available_amount bigint;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 1000000000 then
    raise exception 'Invalid withdrawal amount' using errcode = '22023';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  select p.id into provider_uuid
  from public.provider_profiles p
  where p.user_id = uid
    and p.onboarding_status = 'approved'
    and p.is_published
    and p.deleted_at is null;
  if provider_uuid is null then
    raise exception 'Eligible provider profile not found' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('withdrawal:' || provider_uuid::text, 0));

  select * into withdrawal_row
  from public.provider_withdrawal_requests w
  where w.provider_id = provider_uuid and w.idempotency_key = p_idempotency_key;
  if withdrawal_row.id is not null then
    return jsonb_build_object(
      'id', withdrawal_row.id,
      'amountMinor', withdrawal_row.amount_minor::text,
      'currency', withdrawal_row.currency,
      'status', withdrawal_row.status,
      'reference', withdrawal_row.provider_reference,
      'destinationMasked', withdrawal_row.destination_masked_snapshot
    );
  end if;

  select * into config from private.payment_configuration where id;
  if config.minimum_withdrawal_minor is null then
    raise exception 'Minimum withdrawal is not configured' using errcode = '55000';
  end if;
  if p_amount_minor < config.minimum_withdrawal_minor then
    raise exception 'Withdrawal amount is below the configured minimum'
      using errcode = '22023';
  end if;
  select * into destination_row
  from public.provider_payout_destinations d
  where d.id = p_payout_destination_id
    and d.provider_id = provider_uuid
    and d.status = 'active';
  if destination_row.id is null then
    raise exception 'Payout destination not found' using errcode = 'P0002';
  end if;

  available_account := private.financial_account('provider_available', provider_uuid, 'EGP');
  payout_account := private.financial_account('payout_clearing', null, 'EGP');
  select coalesce(sum(
    case e.direction when 'credit' then e.amount_minor else -e.amount_minor end
  ), 0) into available_amount
  from private.financial_ledger_entries e
  where e.account_id = available_account;
  if p_amount_minor > available_amount then
    raise exception 'Withdrawal exceeds available earnings' using errcode = '22023';
  end if;

  insert into public.provider_withdrawal_requests(
    provider_id,
    payout_destination_id,
    amount_minor,
    currency,
    destination_type_snapshot,
    destination_masked_snapshot,
    provider_reference,
    idempotency_key
  )
  values (
    provider_uuid,
    destination_row.id,
    p_amount_minor,
    'EGP',
    destination_row.destination_type,
    destination_row.masked_value,
    'WSW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    p_idempotency_key
  )
  returning * into withdrawal_row;

  perform private.post_financial_transaction(
    'withdrawal_reserved',
    null,
    null,
    'EGP',
    'provider',
    'withdrawal:' || withdrawal_row.id::text,
    jsonb_build_array(
      jsonb_build_object('account_id', available_account, 'direction', 'debit', 'amount_minor', p_amount_minor),
      jsonb_build_object('account_id', payout_account, 'direction', 'credit', 'amount_minor', p_amount_minor)
    ),
    jsonb_build_object('withdrawal_id', withdrawal_row.id)
  );

  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    uid,
    'withdrawal_requested',
    'Withdrawal requested',
    'Your withdrawal request is being reviewed.',
    jsonb_build_object('provider_id', provider_uuid, 'withdrawal_id', withdrawal_row.id),
    'withdrawal-requested:' || withdrawal_row.id::text
  ) on conflict do nothing;
  return jsonb_build_object(
    'id', withdrawal_row.id,
    'amountMinor', withdrawal_row.amount_minor::text,
    'currency', withdrawal_row.currency,
    'status', withdrawal_row.status,
    'reference', withdrawal_row.provider_reference,
    'destinationMasked', withdrawal_row.destination_masked_snapshot
  );
end;
$$;

create or replace function public.review_provider_withdrawal(
  p_withdrawal_id uuid,
  p_status text,
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
  withdrawal_row public.provider_withdrawal_requests%rowtype;
  available_account uuid;
  payout_account uuid;
  external_account uuid;
  notification_type text;
begin
  if uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_status not in ('under_review', 'processing', 'paid', 'failed', 'cancelled') then
    raise exception 'Invalid withdrawal status' using errcode = '22023';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  select * into withdrawal_row
  from public.provider_withdrawal_requests
  where id = p_withdrawal_id
  for update;
  if withdrawal_row.id is null then
    raise exception 'Withdrawal not found' using errcode = 'P0002';
  end if;
  if withdrawal_row.status in ('paid', 'failed', 'cancelled', 'reversed') then
    if withdrawal_row.status = p_status then
      return jsonb_build_object('id', withdrawal_row.id, 'status', withdrawal_row.status);
    end if;
    raise exception 'Withdrawal is already final' using errcode = '22023';
  end if;

  if p_status in ('failed', 'cancelled') then
    available_account := private.financial_account('provider_available', withdrawal_row.provider_id, withdrawal_row.currency);
    payout_account := private.financial_account('payout_clearing', null, withdrawal_row.currency);
    perform private.post_financial_transaction(
      'withdrawal_released',
      null,
      null,
      withdrawal_row.currency,
      'staff',
      'withdrawal-release:' || p_idempotency_key,
      jsonb_build_array(
        jsonb_build_object('account_id', payout_account, 'direction', 'debit', 'amount_minor', withdrawal_row.amount_minor),
        jsonb_build_object('account_id', available_account, 'direction', 'credit', 'amount_minor', withdrawal_row.amount_minor)
      ),
      jsonb_build_object('withdrawal_id', withdrawal_row.id)
    );
    notification_type := 'withdrawal_failed';
  elsif p_status = 'paid' then
    payout_account := private.financial_account('payout_clearing', null, withdrawal_row.currency);
    external_account := private.financial_account('external_payout', null, withdrawal_row.currency);
    perform private.post_financial_transaction(
      'withdrawal_paid',
      null,
      null,
      withdrawal_row.currency,
      'staff',
      'withdrawal-paid:' || p_idempotency_key,
      jsonb_build_array(
        jsonb_build_object('account_id', payout_account, 'direction', 'debit', 'amount_minor', withdrawal_row.amount_minor),
        jsonb_build_object('account_id', external_account, 'direction', 'credit', 'amount_minor', withdrawal_row.amount_minor)
      ),
      jsonb_build_object('withdrawal_id', withdrawal_row.id)
    );
    notification_type := 'withdrawal_paid';
  end if;

  update public.provider_withdrawal_requests
  set status = p_status,
      completed_at = case when p_status in ('paid', 'failed', 'cancelled') then now() else null end,
      failure_reason = case when p_status in ('failed', 'cancelled') then nullif(btrim(p_reason), '') else null end
  where id = withdrawal_row.id
  returning * into withdrawal_row;

  if notification_type is not null then
    insert into public.notifications(user_id, type, title, body, data, dedupe_key)
    select p.user_id,
           notification_type,
           case when p_status = 'paid' then 'Withdrawal completed' else 'Withdrawal update' end,
           case when p_status = 'paid'
             then 'Your withdrawal has been completed.'
             else 'Your withdrawal could not be completed. The amount is available again.'
           end,
           jsonb_build_object('provider_id', withdrawal_row.provider_id, 'withdrawal_id', withdrawal_row.id),
           notification_type || ':' || withdrawal_row.id::text
    from public.provider_profiles p
    where p.id = withdrawal_row.provider_id and p.user_id is not null
    on conflict do nothing;
  end if;
  return jsonb_build_object(
    'id', withdrawal_row.id,
    'status', withdrawal_row.status,
    'amountMinor', withdrawal_row.amount_minor::text,
    'currency', withdrawal_row.currency
  );
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
  config private.payment_configuration%rowtype;
  refund_row public.financial_refunds%rowtype;
  provider_account uuid;
  commission_account uuid;
  tax_account uuid;
  customer_account uuid;
  provider_reversal bigint;
  commission_reversal bigint;
  tax_reversal bigint;
begin
  if uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 1000000000 then
    raise exception 'Invalid refund amount' using errcode = '22023';
  end if;
  select * into config from private.payment_configuration where id;
  if config.refund_reversal_policy is distinct from
     'proportional_provider_and_commission_reversal' then
    raise exception 'Refund reversal policy is not configured'
      using errcode = '55000';
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
     or p_amount_minor > payment_row.amount_minor - payment_row.refunded_minor then
    raise exception 'Refund amount is not available' using errcode = '22023';
  end if;
  select * into snapshot_row from public.booking_price_snapshots where id = payment_row.price_snapshot_id;
  select * into earning_row from public.provider_earnings_ledger where payment_id = payment_row.id for update;
  if earning_row.status not in ('pending_job_completion', 'pending_release') then
    raise exception 'Released earnings require dispute operations before refund'
      using errcode = '22023';
  end if;

  tax_reversal := floor(p_amount_minor::numeric * snapshot_row.tax_minor / payment_row.amount_minor)::bigint;
  commission_reversal := floor(
    (p_amount_minor - tax_reversal)::numeric * snapshot_row.commission_minor
      / snapshot_row.provider_gross_minor
  )::bigint;
  provider_reversal := p_amount_minor - tax_reversal - commission_reversal;
  provider_account := private.financial_account('provider_pending', payment_row.provider_id, payment_row.currency);
  commission_account := private.financial_account('warsha_commission', null, payment_row.currency);
  tax_account := private.financial_account('tax_payable', null, payment_row.currency);
  customer_account := private.financial_account('customer_payment_clearing', null, payment_row.currency);
  perform private.post_financial_transaction(
    'refund_succeeded',
    payment_row.booking_id,
    payment_row.id,
    payment_row.currency,
    'staff',
    'refund:' || p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object('account_id', provider_account, 'direction', 'debit', 'amount_minor', provider_reversal),
      jsonb_build_object('account_id', commission_account, 'direction', 'debit', 'amount_minor', commission_reversal),
      jsonb_build_object('account_id', tax_account, 'direction', 'debit', 'amount_minor', tax_reversal),
      jsonb_build_object('account_id', customer_account, 'direction', 'credit', 'amount_minor', p_amount_minor)
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
    idempotency_key
  )
  values (
    payment_row.id,
    payment_row.customer_id,
    p_amount_minor,
    payment_row.currency,
    'succeeded',
    btrim(p_reason),
    'WSR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    p_idempotency_key
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
  set gross_minor = gross_minor - (p_amount_minor - tax_reversal),
      commission_minor = commission_minor - commission_reversal,
      net_minor = net_minor - provider_reversal,
      status = case when net_minor - provider_reversal = 0 then 'reversed' else status end,
      updated_at = now()
  where id = earning_row.id;
  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    payment_row.customer_id,
    'refund_completed',
    'Refund completed',
    'Your refund has been recorded.',
    jsonb_build_object('booking_id', payment_row.booking_id, 'payment_id', payment_row.id, 'refund_id', refund_row.id),
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

create or replace function public.set_provider_earning_hold(
  p_earning_id uuid,
  p_action text,
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
  earning_row public.provider_earnings_ledger%rowtype;
  hold_row public.provider_earning_holds%rowtype;
  available_account uuid;
  pending_account uuid;
begin
  if uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_action not in ('hold', 'release') or p_amount_minor < 1 then
    raise exception 'Invalid hold operation' using errcode = '22023';
  end if;
  select * into earning_row
  from public.provider_earnings_ledger
  where id = p_earning_id
  for update;
  if earning_row.id is null then
    raise exception 'Earning not found' using errcode = 'P0002';
  end if;
  select * into hold_row
  from public.provider_earning_holds
  where earning_id = p_earning_id and idempotency_key = p_idempotency_key;
  if hold_row.id is not null then
    return jsonb_build_object('id', hold_row.id, 'status', hold_row.status);
  end if;
  available_account := private.financial_account('provider_available', earning_row.provider_id, earning_row.currency);
  pending_account := private.financial_account('provider_pending', earning_row.provider_id, earning_row.currency);

  if p_action = 'hold' then
    if earning_row.status <> 'available'
       or p_amount_minor > earning_row.net_minor - earning_row.held_minor then
      raise exception 'Earning amount is not available to hold' using errcode = '22023';
    end if;
    perform private.post_financial_transaction(
      'earning_held',
      earning_row.booking_id,
      earning_row.payment_id,
      earning_row.currency,
      'staff',
      'hold:' || p_idempotency_key,
      jsonb_build_array(
        jsonb_build_object('account_id', available_account, 'direction', 'debit', 'amount_minor', p_amount_minor),
        jsonb_build_object('account_id', pending_account, 'direction', 'credit', 'amount_minor', p_amount_minor)
      )
    );
    insert into public.provider_earning_holds(
      earning_id, provider_id, amount_minor, currency, status, public_reason, idempotency_key
    )
    values (
      earning_row.id, earning_row.provider_id, p_amount_minor, earning_row.currency,
      'active', btrim(p_public_reason), p_idempotency_key
    )
    returning * into hold_row;
    update public.provider_earnings_ledger
    set held_minor = held_minor + p_amount_minor,
        status = 'held_for_dispute',
        updated_at = now()
    where id = earning_row.id;
  else
    select * into hold_row
    from public.provider_earning_holds h
    where h.earning_id = earning_row.id
      and h.status = 'active'
      and h.amount_minor = p_amount_minor
    order by h.created_at
    limit 1
    for update;
    if hold_row.id is null then
      raise exception 'Active hold not found' using errcode = 'P0002';
    end if;
    perform private.post_financial_transaction(
      'earning_hold_released',
      earning_row.booking_id,
      earning_row.payment_id,
      earning_row.currency,
      'staff',
      'hold-release:' || p_idempotency_key,
      jsonb_build_array(
        jsonb_build_object('account_id', pending_account, 'direction', 'debit', 'amount_minor', p_amount_minor),
        jsonb_build_object('account_id', available_account, 'direction', 'credit', 'amount_minor', p_amount_minor)
      )
    );
    update public.provider_earning_holds
    set status = 'released', resolved_at = now()
    where id = hold_row.id;
    update public.provider_earnings_ledger
    set held_minor = held_minor - p_amount_minor,
        status = case when held_minor - p_amount_minor = 0 then 'available' else status end,
        updated_at = now()
    where id = earning_row.id;
  end if;
  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  select p.user_id,
         case when p_action = 'hold' then 'earnings_held' else 'earnings_released' end,
         case when p_action = 'hold' then 'Earnings temporarily held' else 'Earnings available again' end,
         case when p_action = 'hold'
           then 'An amount is temporarily held while an issue is reviewed.'
           else 'The review is complete and the amount is available again.'
         end,
         jsonb_build_object('booking_id', earning_row.booking_id, 'provider_id', earning_row.provider_id),
         case when p_action = 'hold' then 'earning-held:' else 'earning-released:' end
           || p_idempotency_key
  from public.provider_profiles p
  where p.id = earning_row.provider_id and p.user_id is not null
  on conflict do nothing;
  return jsonb_build_object('id', hold_row.id, 'status', p_action);
end;
$$;

create or replace function public.propose_booking_price_adjustment(
  p_booking_id uuid,
  p_new_total_minor bigint,
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
  booking_row record;
  snapshot_id uuid;
  adjustment_row public.booking_price_adjustments%rowtype;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_new_total_minor < 1 or p_new_total_minor > 1000000000 then
    raise exception 'Invalid proposed amount' using errcode = '22023';
  end if;
  select b.id, b.provider_id into booking_row
  from public.bookings b
  join public.provider_profiles p on p.id = b.provider_id
  where b.id = p_booking_id
    and p.user_id = uid
    and p.onboarding_status = 'approved'
    and p.is_published
    and p.deleted_at is null
    and b.status in ('job_started', 'awaiting_quote_approval', 'work_in_progress');
  if booking_row.id is null then
    raise exception 'Provider booking not found' using errcode = '42501';
  end if;
  snapshot_id := private.create_booking_price_snapshot(p_booking_id);
  insert into public.booking_price_adjustments(
    booking_id,
    provider_id,
    previous_snapshot_id,
    proposed_total_minor,
    currency,
    reason,
    idempotency_key
  )
  values (
    p_booking_id,
    booking_row.provider_id,
    snapshot_id,
    p_new_total_minor,
    'EGP',
    btrim(p_reason),
    p_idempotency_key
  )
  on conflict (provider_id, idempotency_key) do update
    set proposed_at = public.booking_price_adjustments.proposed_at
  returning * into adjustment_row;
  return jsonb_build_object(
    'id', adjustment_row.id,
    'bookingId', adjustment_row.booking_id,
    'oldSnapshotId', adjustment_row.previous_snapshot_id,
    'newTotalMinor', adjustment_row.proposed_total_minor::text,
    'currency', adjustment_row.currency,
    'status', adjustment_row.status
  );
end;
$$;

create or replace function public.respond_booking_price_adjustment(
  p_adjustment_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  adjustment_row public.booking_price_adjustments%rowtype;
  snapshot_id uuid;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select a.* into adjustment_row
  from public.booking_price_adjustments a
  join public.bookings b on b.id = a.booking_id
  where a.id = p_adjustment_id
    and a.status = 'pending'
    and b.customer_id = uid
  for update of a;
  if adjustment_row.id is null then
    raise exception 'Price adjustment not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.financial_booking_payments p
    where p.booking_id = adjustment_row.booking_id
      and p.status in ('payment_initiated', 'pending', 'authorized', 'paid', 'partially_refunded', 'refunded')
  ) then
    raise exception 'Price cannot change after payment starts' using errcode = '22023';
  end if;
  if p_accept then
    snapshot_id := private.create_booking_price_snapshot(
      adjustment_row.booking_id,
      adjustment_row.proposed_total_minor
    );
    update public.bookings
    set final_price_egp = adjustment_row.proposed_total_minor::numeric / 100,
        price_breakdown = price_breakdown || (
          select jsonb_build_object(
            'servicePrice', snapshot.service_subtotal_minor::numeric / 100,
            'transportationFee', snapshot.callout_fee_minor::numeric / 100,
            'emergencySurcharge', snapshot.emergency_fee_minor::numeric / 100,
            'discount', snapshot.discount_minor::numeric / 100,
            'estimatedTotal', snapshot.customer_total_minor::numeric / 100
          )
          from public.booking_price_snapshots snapshot
          where snapshot.id = snapshot_id
        ),
        updated_at = now()
    where id = adjustment_row.booking_id;
  end if;
  update public.booking_price_adjustments
  set status = case when p_accept then 'accepted' else 'rejected' end,
      decided_at = now(),
      decided_by = uid,
      resulting_snapshot_id = snapshot_id
  where id = adjustment_row.id;
  return jsonb_build_object(
    'id', adjustment_row.id,
    'status', case when p_accept then 'accepted' else 'rejected' end,
    'snapshotId', snapshot_id
  );
end;
$$;

alter table public.booking_price_snapshots enable row level security;
alter table public.booking_price_adjustments enable row level security;
alter table public.financial_booking_payments enable row level security;
alter table public.provider_earnings_ledger enable row level security;
alter table public.provider_payout_destinations enable row level security;
alter table public.provider_withdrawal_requests enable row level security;
alter table public.financial_refunds enable row level security;
alter table public.provider_earning_holds enable row level security;

create policy booking_price_snapshots_customer_read
on public.booking_price_snapshots for select to authenticated
using (private.customer_owns_financial_booking(booking_id));

create policy booking_price_adjustments_participant_read
on public.booking_price_adjustments for select to authenticated
using (
  private.customer_owns_financial_booking(booking_id)
  or private.owns_financial_provider(provider_id)
  or private.is_staff()
);

create policy financial_booking_payments_customer_read
on public.financial_booking_payments for select to authenticated
using (customer_id = (select auth.uid()) or private.is_staff());

create policy provider_earnings_owner_read
on public.provider_earnings_ledger for select to authenticated
using (private.owns_financial_provider(provider_id) or private.is_staff());

create policy provider_payout_destinations_owner_read
on public.provider_payout_destinations for select to authenticated
using (private.owns_financial_provider(provider_id) or private.is_staff());

create policy provider_withdrawals_owner_read
on public.provider_withdrawal_requests for select to authenticated
using (private.owns_financial_provider(provider_id) or private.is_staff());

create policy financial_refunds_customer_read
on public.financial_refunds for select to authenticated
using (customer_id = (select auth.uid()) or private.is_staff());

create policy provider_earning_holds_owner_read
on public.provider_earning_holds for select to authenticated
using (private.owns_financial_provider(provider_id) or private.is_staff());

revoke all on table private.payment_configuration from public, anon, authenticated;
revoke all on table private.payment_attempts from public, anon, authenticated;
revoke all on table private.financial_ledger_accounts from public, anon, authenticated;
revoke all on table private.financial_ledger_transactions from public, anon, authenticated;
revoke all on table private.financial_ledger_entries from public, anon, authenticated;
revoke all on table private.payout_destination_fingerprints from public, anon, authenticated;
revoke all on table private.payment_gateway_events from public, anon, authenticated;
revoke all on table private.payment_audit_events from public, anon, authenticated;

revoke all on public.booking_price_snapshots,
  public.booking_price_adjustments,
  public.financial_booking_payments,
  public.provider_earnings_ledger,
  public.provider_payout_destinations,
  public.provider_withdrawal_requests,
  public.financial_refunds,
  public.provider_earning_holds
from public, anon, authenticated;

grant select on public.booking_price_snapshots,
  public.booking_price_adjustments,
  public.financial_booking_payments,
  public.provider_earnings_ledger,
  public.provider_payout_destinations,
  public.provider_withdrawal_requests,
  public.financial_refunds,
  public.provider_earning_holds
to authenticated;

revoke all on function private.prevent_financial_mutation() from public, anon, authenticated;
revoke all on function private.localize_financial_notification() from public, anon, authenticated;
revoke all on function private.prevent_price_snapshot_mutation() from public, anon, authenticated;
revoke all on function private.assert_balanced_financial_transaction() from public, anon, authenticated;
revoke all on function private.owns_financial_provider(uuid) from public, anon, authenticated;
revoke all on function private.customer_owns_financial_booking(uuid) from public, anon, authenticated;
revoke all on function private.financial_account(text,uuid,text) from public, anon, authenticated;
revoke all on function private.post_financial_transaction(text,uuid,uuid,text,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function private.calculate_commission(bigint,text) from public, anon, authenticated;
revoke all on function private.create_booking_price_snapshot(uuid,bigint) from public, anon, authenticated;
revoke all on function private.mask_payout_value(text) from public, anon, authenticated;
revoke all on function private.release_provider_earning(uuid,text) from public, anon, authenticated;
revoke all on function private.process_mock_payment_event(text,uuid,text,boolean) from public, anon, authenticated;
revoke all on function private.release_completed_booking_earning() from public, anon, authenticated;

grant execute on function private.owns_financial_provider(uuid) to authenticated;
grant execute on function private.customer_owns_financial_booking(uuid) to authenticated;

revoke all on function public.create_booking_payment_intent(uuid,text,text) from public, anon, authenticated;
revoke all on function public.get_my_booking_payment(uuid) from public, anon, authenticated;
revoke all on function public.get_my_booking_receipt(uuid) from public, anon, authenticated;
revoke all on function public.get_my_provider_booking_payment(uuid) from public, anon, authenticated;
revoke all on function public.confirm_cash_collected(uuid,text) from public, anon, authenticated;
revoke all on function public.respond_cash_collection(uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.get_my_provider_earnings() from public, anon, authenticated;
revoke all on function public.save_my_payout_destination(text,text,text,boolean,boolean,text) from public, anon, authenticated;
revoke all on function public.get_my_payout_destinations() from public, anon, authenticated;
revoke all on function public.request_provider_withdrawal(bigint,uuid,text) from public, anon, authenticated;
revoke all on function public.review_provider_withdrawal(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.process_financial_refund(uuid,bigint,text,text) from public, anon, authenticated;
revoke all on function public.set_provider_earning_hold(uuid,text,bigint,text,text) from public, anon, authenticated;
revoke all on function public.propose_booking_price_adjustment(uuid,bigint,text,text) from public, anon, authenticated;
revoke all on function public.respond_booking_price_adjustment(uuid,boolean) from public, anon, authenticated;

grant execute on function public.create_booking_payment_intent(uuid,text,text) to authenticated;
grant execute on function public.get_my_booking_payment(uuid) to authenticated;
grant execute on function public.get_my_booking_receipt(uuid) to authenticated;
grant execute on function public.get_my_provider_booking_payment(uuid) to authenticated;
grant execute on function public.confirm_cash_collected(uuid,text) to authenticated;
grant execute on function public.respond_cash_collection(uuid,boolean,text) to authenticated;
grant execute on function public.get_my_provider_earnings() to authenticated;
grant execute on function public.save_my_payout_destination(text,text,text,boolean,boolean,text) to authenticated;
grant execute on function public.get_my_payout_destinations() to authenticated;
grant execute on function public.request_provider_withdrawal(bigint,uuid,text) to authenticated;
grant execute on function public.review_provider_withdrawal(uuid,text,text,text) to authenticated;
grant execute on function public.process_financial_refund(uuid,bigint,text,text) to authenticated;
grant execute on function public.set_provider_earning_hold(uuid,text,bigint,text,text) to authenticated;
grant execute on function public.propose_booking_price_adjustment(uuid,bigint,text,text) to authenticated;
grant execute on function public.respond_booking_price_adjustment(uuid,boolean) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'financial_booking_payments',
    'provider_earnings_ledger',
    'provider_withdrawal_requests',
    'financial_refunds'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables p
      where p.pubname = 'supabase_realtime'
        and p.schemaname = 'public'
        and p.tablename = table_name
    ) then
      execute pg_catalog.format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;
