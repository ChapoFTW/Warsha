-- The withdrawal guard lived in the client.
--
-- `request_provider_withdrawal` validated the amount, the idempotency key, the
-- provider's eligibility, the destination and the available balance -- and
-- never once asked whether payouts were switched on. The only mechanism
-- stopping a request while `payout_mode` was `disabled` was a boolean the
-- client used to disable a button.
--
-- A control that only exists in the client is not a control. Posting directly
-- to PostgREST created a withdrawal request against a payout surface that
-- could not settle it, and the row went into the ledger regardless.
--
-- The guard uses `private.payment_surface_environment('payout')` rather than
-- reading `payout_mode` directly, because that function is the authority this
-- codebase already uses for the same question in
-- `get_production_payment_capabilities`, and it is fail-closed across every
-- reason a payout surface can be shut: mode, maintenance, missing provider,
-- unactivated account, unregistered payout credentials.
--
-- No payment or payout provider is activated by this migration.

CREATE OR REPLACE FUNCTION public.request_provider_withdrawal(p_amount_minor bigint, p_payout_destination_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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

  -- Withdrawals are refused unless the payout surface is actually open.
  --
  -- Until now the only thing standing between a provider and a withdrawal
  -- request while payouts were switched off was `withdrawalsEnabled` in
  -- `get_my_provider_earnings`, which `app/provider-earnings.tsx` uses to
  -- disable a button. A flag a client reads is not a control; anyone posting
  -- to PostgREST bypassed it entirely, and the request would be written into
  -- the ledger with no payout surface able to settle it.
  --
  -- `private.payment_surface_environment('payout')` is the authority that
  -- already answers this, and it is fail-closed: it returns 'disabled' when
  -- the mode is disabled, when maintenance mode is on, when no payout
  -- provider is active, when the provider account for that exact environment
  -- is missing or not activated, and when payout credentials are not
  -- registered. `mock` returns early, so development and the financial suites
  -- keep working without a provider account.
  --
  -- This is placed after the idempotency replay deliberately. Reading back a
  -- withdrawal that already exists is not making a new one, and switching
  -- payouts off must not make a provider's existing request unreadable.
  if private.payment_surface_environment('payout') = 'disabled' then
    raise exception 'Withdrawals are not available' using errcode = '55000';
  end if;
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
$function$;
