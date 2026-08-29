-- The switches the clients read said "enabled" only while payments were fake.
--
-- WPS-015 widened `payment_configuration.gateway_mode` and `payout_mode` from
-- (disabled, mock) to (disabled, mock, sandbox, live), and defined what the two
-- states mean in `public.get_production_payment_capabilities`:
--
--     'onlinePaymentsEnabled',          v_gateway <> 'disabled'
--     'onlinePaymentsDevelopmentOnly',  v_gateway =  'mock'
--     'payoutsEnabled',                 v_payout  <> 'disabled'
--     'payoutsDevelopmentOnly',         v_payout  =  'mock'
--
-- "Is this switched on" and "is this only a simulation" are deliberately two
-- different questions. The two functions the clients actually read never moved
-- to that answer. `get_financial_capabilities` computed BOTH halves of each
-- pair as `= 'mock'`, which is how the mistake is visible without knowing the
-- history: a pair whose members are always equal is not a pair.
--
-- The consequence was reserved entirely for go-live. While every mode is
-- `disabled` both spellings return false and nothing looks wrong. The moment
-- payouts move to `sandbox` or `live`, `withdrawalsEnabled` would turn FALSE
-- and `app/provider-earnings.tsx` would stop offering withdrawal to every
-- worker on the platform -- at exactly the moment it started being real.
-- `onlinePaymentsEnabled` would do the same to card payment.
--
-- This changes nothing today. Both modes are `disabled`, so both spellings
-- still return false; the fix is only observable in the environment that has
-- not happened yet, which is why it could sit here unnoticed.
--
-- The `DevelopmentOnly` halves keep `= 'mock'`, which is what they are for.

CREATE OR REPLACE FUNCTION public.get_financial_capabilities()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
  select jsonb_build_object(
    'currency', c.currency,
    'onlinePaymentsEnabled', c.gateway_mode <> 'disabled',
    'onlinePaymentsDevelopmentOnly', c.gateway_mode = 'mock',
    'cashPaymentsEnabled', true,
    'withdrawalsEnabled', c.payout_mode <> 'disabled',
    'withdrawalsDevelopmentOnly', c.payout_mode = 'mock',
    'minimumWithdrawalMinor', c.minimum_withdrawal_minor::text,
    'releaseDelaySeconds', c.earnings_release_delay_seconds::text,
    'automaticReleaseSchedulerEnabled', c.automatic_release_scheduler_enabled
  )
  from private.payment_configuration c
  where c.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_provider_earnings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    'withdrawalsEnabled', config.payout_mode <> 'disabled',
    'releaseDelaySeconds', config.earnings_release_delay_seconds::text,
    'automaticReleaseSchedulerEnabled',
      config.automatic_release_scheduler_enabled,
    'transactions', coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'bookingId', e.booking_id,
      'serviceId', b.service_id,
      'serviceTranslationKey', service.translation_key,
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
  left join public.services service on service.id = b.service_id
  where e.provider_id = provider_uuid;
  return result;
end;
$function$;
