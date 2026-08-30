-- The same correction, for the helpers the wrappers call.
--
-- 202608310007 converted the fifty-seven client-reachable functions that
-- signalled a missing record with P0002. It missed these: they live in
-- `private` and are not callable by a client directly, but a client-reachable
-- wrapper calls them and the exception travels all the way out. A worker
-- moderating a review that no longer exists still received HTTP 500.
--
-- Found by the test suite rather than by the scan, which is the right order.


CREATE OR REPLACE FUNCTION private.convert_marketplace_request(p_request_id uuid, p_provider_id uuid, p_quote_id uuid DEFAULT NULL::uuid, p_rescue_attempt_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare request_row public.marketplace_requests; quote_row public.worker_quotes; service_row record;
  location_row private.marketplace_request_locations; booking_id uuid; start_at timestamptz;
  total_minor bigint; service_minor bigint; transport_minor bigint := 0; emergency_minor bigint := 0;
begin
  select * into request_row from public.marketplace_requests where id=p_request_id for update;
  if request_row.id is null then raise exception 'Request not found' using errcode='PT404'; end if;
  if request_row.converted_booking_id is not null then return request_row.converted_booking_id; end if;
  if request_row.status not in ('worker_confirmed','selection_pending_confirmation') then raise exception 'Request cannot be converted' using errcode='22023'; end if;
  select s.id,s.name,coalesce(ps.custom_price_egp,s.price_egp) as base_price,ps.pricing_type,
    ps.transportation_fee_egp,ps.emergency_surcharge_egp
  into service_row
  from public.provider_services ps join public.services s on s.id=ps.service_id
  where ps.provider_id=p_provider_id and ps.is_active and s.is_active and s.deleted_at is null
    and s.category_id=request_row.category_id and (request_row.service_id is null or s.id=request_row.service_id)
  order by (s.id=request_row.service_id) desc,s.id limit 1;
  if service_row.id is null then raise exception 'Worker is no longer eligible' using errcode='22023'; end if;
  select * into location_row from private.marketplace_request_locations where request_id=p_request_id;
  if location_row.request_id is null then raise exception 'Request location unavailable' using errcode='55000'; end if;
  if request_row.flow_kind='emergency' then
    emergency_minor := pg_catalog.round(service_row.emergency_surcharge_egp*100)::bigint;
    if request_row.approved_emergency_surcharge_minor is null
      or emergency_minor>request_row.approved_emergency_surcharge_minor
    then raise exception 'Emergency surcharge approval changed' using errcode='22023'; end if;
    service_minor := pg_catalog.round(service_row.base_price*100)::bigint;
    transport_minor := pg_catalog.round(service_row.transportation_fee_egp*100)::bigint;
    total_minor := service_minor+transport_minor+emergency_minor;
  else
    select * into quote_row from public.worker_quotes
    where id=p_quote_id and request_id=p_request_id and provider_id=p_provider_id and status='selected' for update;
    if quote_row.id is null then raise exception 'Selected quote unavailable' using errcode='22023'; end if;
    total_minor := quote_row.price_minor;
    service_minor := total_minor;
  end if;
  start_at := private.marketplace_request_start(request_row);
  if start_at is null then raise exception 'Request schedule unavailable' using errcode='55000'; end if;
  insert into public.bookings(
    customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,
    estimated_price_egp,issue_description,notes,scheduled_date,scheduled_time,address_id,address_snapshot,
    booking_type,price_breakdown,idempotency_key,customer_name_snapshot,estimated_duration_minutes,
    capacity_buffer_minutes,marketplace_request_id,selected_worker_quote_id,rescue_attempt_id
  ) values (
    request_row.customer_id,p_provider_id,service_row.id,'confirmed',service_row.name,
    case when p_quote_id is null then service_row.pricing_type else 'quote' end,
    total_minor::numeric/100,request_row.issue_description,request_row.notes,
    pg_catalog.timezone('Africa/Cairo',start_at)::date,pg_catalog.timezone('Africa/Cairo',start_at)::time,
    location_row.address_id,location_row.exact_address_snapshot,
    case when request_row.flow_kind='emergency' then 'emergency' else 'scheduled' end,
    pg_catalog.jsonb_build_object(
      'servicePrice',service_minor::numeric/100,'inspectionFee',0,
      'transportationFee',transport_minor::numeric/100,'emergencySurcharge',emergency_minor::numeric/100,
      'discount',0,'estimatedTotal',total_minor::numeric/100,
      'pricingType',case when p_quote_id is null then service_row.pricing_type else 'quote' end
    ),
    'marketplace:'||p_request_id::text,
    (select display_name from public.profiles where id=request_row.customer_id),
    coalesce(quote_row.estimated_duration_minutes,request_row.estimated_duration_minutes),30,
    p_request_id,p_quote_id,p_rescue_attempt_id
  ) returning id into booking_id;
  perform private.create_booking_price_snapshot(booking_id,total_minor);
  update public.marketplace_requests set status='converted_to_booking',converted_booking_id=booking_id,
    confirmed_at=coalesce(confirmed_at,pg_catalog.now()),closed_at=pg_catalog.now()
  where id=p_request_id;
  update public.quote_invitations set status='request_closed',closed_at=pg_catalog.now()
  where request_id=p_request_id and status in ('invited','viewed');
  update private.marketplace_jobs set state='cancelled',completed_at=pg_catalog.now()
  where request_id=p_request_id and state in ('pending','retryable_failed','leased');
  perform private.marketplace_notify(request_row.customer_id,'marketplace_booking_confirmed','Worker confirmed','Your request is now a booking.',
    pg_catalog.jsonb_build_object('requestId',p_request_id,'bookingId',booking_id),'marketplace-converted:'||p_request_id::text||':customer');
  perform private.marketplace_record_event('system',null,'request',p_request_id,'converted_to_booking',
    pg_catalog.jsonb_build_object('bookingId',booking_id),'marketplace-converted:'||p_request_id::text);
  return booking_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.create_booking_price_snapshot(p_booking_id uuid, p_override_total_minor bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Booking not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION private.create_post_release_financial_case_impl(p_payment_id uuid, p_case_type text, p_amount_minor bigint, p_public_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Released payment not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION private.decide_post_release_financial_case_impl(p_case_id uuid, p_provider_responsibility_minor bigint, p_public_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Financial case not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION private.moderate_review_impl(p_review_id uuid, p_action text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare uid uuid:=(select auth.uid()); old_status text; hold_id uuid; reason text:=pg_catalog.btrim(coalesce(p_reason,'')); next_status text;
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_action not in ('hide','restore') or pg_catalog.length(reason) not between 1 and 1000 then raise exception 'Invalid moderation action' using errcode='22023'; end if;
  select moderation_status,dispute_publication_hold_id into old_status,hold_id from public.reviews where id=p_review_id and deleted_at is null for update;
  if not found then raise exception 'Review not found' using errcode='PT404'; end if;
  next_status:=case when p_action='hide' then 'hidden' when hold_id is not null then 'flagged' else 'visible' end;
  update public.reviews set moderation_status=next_status,moderation_reason=reason,moderated_by=uid,moderated_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_review_id;
  insert into public.review_moderation_events(review_id,actor_id,action,reason,previous_status) values(p_review_id,uid,p_action,reason,old_status);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
    values(uid,'review_'||p_action,'review',p_review_id,pg_catalog.jsonb_build_object('moderation_status',old_status),pg_catalog.jsonb_build_object('moderation_status',next_status,'dispute_hold',hold_id is not null));
  return pg_catalog.jsonb_build_object('id',p_review_id,'moderation_status',next_status);
end $function$;

CREATE OR REPLACE FUNCTION private.process_financial_refund_impl(p_payment_id uuid, p_amount_minor bigint, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Payment not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION private.release_provider_earning(p_earning_id uuid, p_idempotency_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Earning not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION private.review_provider_withdrawal_impl(p_withdrawal_id uuid, p_status text, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Withdrawal not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION private.review_reconciliation_exception_impl(p_exception_id uuid, p_status text, p_resolution_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Reconciliation exception not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION private.review_report_transition_impl(p_report_id uuid, p_status text, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare uid uuid:=(select auth.uid()); old_row public.review_reports%rowtype; next_note text:=pg_catalog.btrim(coalesce(p_note,''));
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_status not in ('in_review','resolved','dismissed') or pg_catalog.length(next_note)>1000 then raise exception 'Invalid report transition' using errcode='22023'; end if;
  select * into old_row from public.review_reports where id=p_report_id for update;
  if not found then raise exception 'Report not found' using errcode='PT404'; end if;
  update public.review_reports set status=p_status,assigned_to=uid,resolution_note=nullif(next_note,''),updated_at=pg_catalog.now(),
    resolved_at=case when p_status in ('resolved','dismissed') then pg_catalog.now() else null end where id=p_report_id;
  insert into public.review_report_events(report_id,actor_id,from_status,to_status,note) values(p_report_id,uid,old_row.status,p_status,next_note);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,old_data,new_data)
    values(uid,'review_report_transition','review_report',p_report_id,pg_catalog.jsonb_build_object('status',old_row.status),pg_catalog.jsonb_build_object('status',p_status));
  return pg_catalog.jsonb_build_object('id',p_report_id,'status',p_status);
end $function$;

CREATE OR REPLACE FUNCTION private.set_provider_earning_hold_impl(p_earning_id uuid, p_action text, p_amount_minor bigint, p_public_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Earning not found' using errcode = 'PT404';
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
      raise exception 'Active hold not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION private.staff_decide_trust_appeal_impl(p_appeal_id uuid, p_status text, p_decision_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_appeal public.trust_appeals%rowtype;
begin
  if v_uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_status not in ('under_review','upheld','overturned','partially_overturned') then
    raise exception 'Invalid appeal decision' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_decision_note,''))) < 3 then
    raise exception 'A decision note is required' using errcode = '22023';
  end if;
  select * into v_appeal from public.trust_appeals ap where ap.id = p_appeal_id for update;
  if v_appeal.id is null then
    raise exception 'Appeal not found' using errcode = 'PT404';
  end if;

  update public.trust_appeals
    set status = p_status,
        decision_note = pg_catalog.btrim(p_decision_note),
        decided_by = case when p_status = 'under_review' then null else v_uid end,
        decided_at = case when p_status = 'under_review' then null else pg_catalog.now() end
    where id = p_appeal_id;

  perform private.record_trust_audit(v_uid, 'trust_appeal_'||p_status, 'trust_appeal', p_appeal_id,
    pg_catalog.btrim(p_decision_note), null);

  -- Restoration after a successful appeal is a separate, explicit, audited
  -- enforcement action so that the history always shows who restored access.
  return pg_catalog.jsonb_build_object('id', p_appeal_id, 'status', p_status,
    'restorationRequired', p_status in ('overturned','partially_overturned'));
end;
$function$;

CREATE OR REPLACE FUNCTION private.staff_transition_trust_report_impl(p_report_id uuid, p_status text, p_public_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_report public.trust_reports%rowtype;
begin
  if v_uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if p_status not in ('triage','investigating','actioned','dismissed','duplicate') then
    raise exception 'Invalid report status' using errcode = '22023';
  end if;
  select * into v_report from public.trust_reports r where r.id = p_report_id for update;
  if v_report.id is null then
    raise exception 'Report not found' using errcode = 'PT404';
  end if;

  update public.trust_reports set status = p_status where id = p_report_id;
  insert into public.trust_report_events(report_id, from_status, to_status, actor_id, public_reason)
  values (p_report_id, v_report.status, p_status, v_uid, p_public_reason);

  perform private.record_trust_audit(v_uid, 'trust_report_'||p_status, 'trust_report', p_report_id,
    coalesce(p_public_reason,'Report status transition'), null);

  return pg_catalog.jsonb_build_object('id', p_report_id, 'status', p_status);
end;
$function$;
