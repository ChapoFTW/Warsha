-- "Not found" is not a server error.
--
-- Fifty-seven client-reachable functions signalled a missing record with
-- SQLSTATE P0002, and PostgREST answered HTTP 500. Every one of them means the
-- same ordinary thing -- "Support case not found", "Booking not found",
-- "Payout destination not found", "Help article not found" -- and every one of
-- them reached the client as an internal server error.
--
-- Two consequences, both real. A client cannot tell "the thing you asked for is
-- gone" from "the server is broken", so it cannot choose between showing an
-- empty state and offering a retry. And every ordinary missing record shows up
-- in monitoring as a 5xx, which is how a real outage gets lost in noise.
--
-- PostgREST honours a `PTxxx` errcode as the HTTP status, so these now raise
-- PT404. Verified before writing this: a probe raising PT404 answers 404, and
-- so does one raising P0002 in isolation -- yet the deployed functions
-- answered 500, consistently and reproducibly. PT404 is deterministic in every
-- case tested, which is why it is what these use.
--
-- Only the errcode changes. Every message, every check, every body is the one
-- that was deployed. 404 is also the right answer for a record that exists but
-- belongs to somebody else: these functions already scope by owner, and
-- "not found" is what a stranger should be told either way.


CREATE OR REPLACE FUNCTION public.accept_emergency_request(p_invitation_id uuid, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; invitation public.quote_invitations;
  request_row public.marketplace_requests; provider_surcharge bigint; booking_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select * into invitation from public.quote_invitations i where i.id=p_invitation_id and i.provider_id=provider_id for update;
  if invitation.id is null then raise exception 'Invitation not found' using errcode='PT404'; end if;
  select * into request_row from public.marketplace_requests where id=invitation.request_id for update;
  if request_row.converted_booking_id is not null then return request_row.converted_booking_id; end if;
  if request_row.flow_kind<>'emergency' or request_row.status not in ('matching','rescue_matching')
    or request_row.expires_at<=pg_catalog.now() or invitation.status not in ('invited','viewed')
    or not private.is_provider_publicly_discoverable(provider_id)
    or not exists(select 1 from public.provider_emergency_categories e where e.provider_id=provider_id and e.category_id=request_row.category_id and e.enabled)
  then raise exception 'Emergency request is no longer available' using errcode='22023'; end if;
  select pg_catalog.round(ps.emergency_surcharge_egp*100)::bigint into provider_surcharge
  from public.provider_services ps join public.services s on s.id=ps.service_id
  where ps.provider_id=provider_id and ps.is_active and s.is_active and s.deleted_at is null
    and s.category_id=request_row.category_id and (request_row.service_id is null or s.id=request_row.service_id)
  order by (s.id=request_row.service_id) desc,s.id limit 1;
  if provider_surcharge is null or provider_surcharge>request_row.approved_emergency_surcharge_minor then
    raise exception 'Emergency surcharge approval changed' using errcode='22023'; end if;
  update private.emergency_dispatch_attempts set state='accepted',attempted_at=pg_catalog.now() where invitation_id=p_invitation_id;
  update public.quote_invitations set status='accepted',responded_at=pg_catalog.now() where id=p_invitation_id;
  update public.quote_invitations set status='request_closed',closed_at=pg_catalog.now()
  where request_id=request_row.id and id<>p_invitation_id and status in ('invited','viewed');
  update private.emergency_dispatch_attempts set state='closed'
  where request_id=request_row.id and invitation_id<>p_invitation_id and state in ('invited','viewed');
  update public.marketplace_requests set status='worker_confirmed',confirmed_at=pg_catalog.now() where id=request_row.id;
  booking_id := private.convert_marketplace_request(request_row.id,provider_id,null,null);
  perform private.marketplace_record_event('worker',uid,'request',request_row.id,'emergency_accepted',
    pg_catalog.jsonb_build_object('bookingId',booking_id),p_idempotency_key||':emergency-accepted');
  return booking_id;
exception when unique_violation then
  select converted_booking_id into booking_id from public.marketplace_requests where id=invitation.request_id;
  if booking_id is not null then return booking_id; end if;
  raise exception 'Emergency request was already accepted' using errcode='40001';
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_marketplace_request(p_request_id uuid, p_reason text, p_idempotency_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare uid uuid := (select auth.uid()); request_row public.marketplace_requests; phase_name text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'Cancellation reason required' using errcode='22023'; end if;
  select * into request_row from public.marketplace_requests where id=p_request_id and customer_id=uid for update;
  if request_row.id is null then raise exception 'Request not found' using errcode='PT404'; end if;
  if request_row.status='cancelled' then return; end if;
  if request_row.status in ('converted_to_booking','closed','expired') then raise exception 'Request cannot be cancelled here' using errcode='22023'; end if;
  phase_name:=case when request_row.selected_quote_id is null then 'preselection' else 'post_selection_pre_confirmation' end;
  update public.marketplace_requests set status='cancelled',cancelled_at=pg_catalog.now(),closed_at=pg_catalog.now() where id=p_request_id;
  update public.quote_invitations set status='request_closed',closed_at=pg_catalog.now() where request_id=p_request_id and status in ('invited','viewed','quoted');
  update public.worker_quotes set status=case when status='selected' then 'rejected' else 'invalidated_by_request_change' end,
    rejected_at=case when status='selected' then pg_catalog.now() else rejected_at end
  where request_id=p_request_id and status in ('submitted','revised','selected');
  update private.marketplace_jobs set state='cancelled',completed_at=pg_catalog.now() where request_id=p_request_id and state in ('pending','leased','retryable_failed');
  insert into public.marketplace_cancellation_events(request_id,actor_id,actor_class,phase,reason_code,reason_text,idempotency_key)
  values(p_request_id,uid,'customer',phase_name,'customer_cancelled',pg_catalog.left(pg_catalog.btrim(p_reason),500),p_idempotency_key)
  on conflict(actor_id,idempotency_key) do nothing;
  perform private.marketplace_record_event('customer',uid,'request',p_request_id,'request_cancelled',
    pg_catalog.jsonb_build_object('phase',phase_name,'automaticFee',false),p_idempotency_key||':cancelled');
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_my_data_export(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_request public.privacy_export_requests;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.privacy_surface_enabled('export') then
    raise exception 'Export is not available' using errcode = '42501';
  end if;

  select * into v_request
  from public.privacy_export_requests r
  where r.id = p_request_id and r.user_id = v_user
  for update;

  -- A request belonging to somebody else is reported exactly as one that does
  -- not exist. Which of the two it was is not the caller's business.
  if v_request.id is null then
    raise exception 'Export request not found' using errcode = 'PT404';
  end if;
  if v_request.expires_at <= pg_catalog.now() then
    raise exception 'Export has expired' using errcode = '55000';
  end if;
  if v_request.status <> 'ready' or v_request.storage_path is null then
    raise exception 'Export is not ready' using errcode = '55000';
  end if;

  update public.privacy_export_requests
  set download_count = coalesce(download_count, 0) + 1,
      last_downloaded_at = pg_catalog.now()
  where id = p_request_id;

  perform private.record_operational_event('security', 'privacy_export_downloaded', 'info',
    '{}'::jsonb, 'customer');

  return pg_catalog.jsonb_build_object(
    'id', v_request.id,
    'bucket', 'privacy-exports',
    'path', v_request.storage_path,
    'expiresAt', v_request.expires_at,
    'downloadCount', coalesce(v_request.download_count, 0) + 1
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_booking_completion_for_payment(p_booking_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Completed paid booking not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION public.create_booking_payment_intent(p_booking_id uuid, p_idempotency_key text, p_payment_method text DEFAULT 'online'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Booking not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION public.decline_quote_invitation(p_invitation_id uuid, p_reason text, p_idempotency_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; invitation public.quote_invitations;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select * into invitation from public.quote_invitations i where i.id=p_invitation_id and i.provider_id=provider_id for update;
  if invitation.id is null then raise exception 'Invitation not found' using errcode='PT404'; end if;
  if invitation.status='declined' then return; end if;
  if invitation.status not in ('invited','viewed') then raise exception 'Invitation is no longer actionable' using errcode='22023'; end if;
  update public.quote_invitations set status='declined',responded_at=pg_catalog.now(),outcome_reason=pg_catalog.left(coalesce(p_reason,'other'),120) where id=p_invitation_id;
  update private.emergency_dispatch_attempts set state='declined',attempted_at=pg_catalog.now() where invitation_id=p_invitation_id and state in ('invited','viewed');
  perform private.marketplace_record_event('worker',uid,'invitation',p_invitation_id,'invitation_declined',
    pg_catalog.jsonb_build_object('reason',pg_catalog.left(coalesce(p_reason,'other'),120)),p_idempotency_key||':declined');
end;
$function$;

CREATE OR REPLACE FUNCTION public.edit_marketplace_request(p_request_id uuid, p_expected_revision integer, p_patch jsonb, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare uid uuid := (select auth.uid()); request_row public.marketplace_requests; location_row private.marketplace_request_locations;
  classification text; next_revision integer; replacement_id uuid; replacement_payload jsonb; key_name text;
  minor_keys text[] := array['descriptionClarification','notes','requestedStartAt','requestedEndAt','addressClarification','attachmentIds'];
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb
    or p_idempotency_key is null or pg_catalog.length(p_idempotency_key) not between 16 and 200
  then raise exception 'Invalid request edit' using errcode='22023'; end if;
  select * into request_row from public.marketplace_requests where id=p_request_id and customer_id=uid for update;
  if request_row.id is null then raise exception 'Request not found' using errcode='PT404'; end if;
  select replacement_request_id into replacement_id from public.marketplace_request_revisions
  where created_by=uid and idempotency_key=p_idempotency_key;
  if found then return coalesce(replacement_id,p_request_id); end if;
  if request_row.current_revision<>p_expected_revision or request_row.selected_quote_id is not null
    or request_row.edit_deadline_at<=pg_catalog.now()
    or request_row.status not in ('matching','collecting_quotes','customer_reviewing','rescue_matching')
  then raise exception 'Request can no longer be edited' using errcode='40001'; end if;
  classification := 'minor';
  for key_name in select jsonb_object_keys(p_patch) loop
    if not (key_name=any(minor_keys)) then classification:='major'; exit; end if;
  end loop;
  if p_patch ? 'requestedStartAt' and nullif(p_patch->>'requestedStartAt','')::timestamptz<=pg_catalog.now() then
    classification:='major';
  end if;
  if classification='minor' then
    if p_patch ? 'descriptionClarification' and pg_catalog.length(pg_catalog.btrim(p_patch->>'descriptionClarification')) not between 8 and 2000
      or p_patch ? 'notes' and pg_catalog.length(p_patch->>'notes')>2000
    then raise exception 'Invalid request edit' using errcode='22023'; end if;
    next_revision:=request_row.current_revision+1;
    update public.marketplace_requests set current_revision=next_revision,
      issue_description=case when p_patch ? 'descriptionClarification' then pg_catalog.btrim(p_patch->>'descriptionClarification') else issue_description end,
      notes=case when p_patch ? 'notes' then p_patch->>'notes' else notes end,
      requested_start_at=case when p_patch ? 'requestedStartAt' then nullif(p_patch->>'requestedStartAt','')::timestamptz else requested_start_at end,
      requested_end_at=case when p_patch ? 'requestedEndAt' then nullif(p_patch->>'requestedEndAt','')::timestamptz else requested_end_at end
    where id=p_request_id;
    insert into public.marketplace_request_revisions(request_id,revision,classification,change_set,created_by,idempotency_key)
    values(p_request_id,next_revision,'minor',p_patch,uid,p_idempotency_key);
    perform private.marketplace_notify(p.user_id,'request_edited','Request updated','The customer clarified a request. You can keep, revise, or withdraw your quote.',
      pg_catalog.jsonb_build_object('requestId',p_request_id,'revision',next_revision),'request-edit:'||p_request_id::text||':'||next_revision::text||':'||p.id::text)
    from public.quote_invitations i join public.provider_profiles p on p.id=i.provider_id
    where i.request_id=p_request_id and i.status in ('invited','viewed','quoted');
    perform private.marketplace_record_event('customer',uid,'request',p_request_id,'request_minor_edit',p_patch,p_idempotency_key||':minor');
    return p_request_id;
  end if;

  select * into location_row from private.marketplace_request_locations where request_id=p_request_id;
  replacement_payload := pg_catalog.jsonb_build_object(
    'flowKind',request_row.flow_kind,'categoryId',request_row.category_id,'serviceId',request_row.service_id,
    'targetedProviderId',request_row.targeted_provider_id,'addressId',location_row.address_id,
    'issueDescription',request_row.issue_description,'notes',request_row.notes,'complexity',request_row.complexity,
    'scheduleKind',request_row.schedule_kind,'requestedStartAt',request_row.requested_start_at,
    'requestedEndAt',request_row.requested_end_at,'paymentCompatibility',request_row.payment_compatibility
  ) || p_patch;
  update public.marketplace_requests set status='cancelled',cancelled_at=pg_catalog.now(),closed_at=pg_catalog.now() where id=p_request_id;
  update public.quote_invitations set status='request_closed',closed_at=pg_catalog.now() where request_id=p_request_id and status in ('invited','viewed','quoted');
  update public.worker_quotes set status='invalidated_by_request_change' where request_id=p_request_id and status in ('submitted','revised');
  update private.marketplace_jobs set state='cancelled',completed_at=pg_catalog.now() where request_id=p_request_id and state in ('pending','leased','retryable_failed');
  replacement_id := public.create_marketplace_request(replacement_payload,p_idempotency_key||':replacement');
  update public.marketplace_requests set replacement_for_request_id=p_request_id where id=replacement_id;
  next_revision:=request_row.current_revision+1;
  insert into public.marketplace_request_revisions(request_id,revision,classification,change_set,created_by,idempotency_key,replacement_request_id)
  values(p_request_id,next_revision,'major',p_patch,uid,p_idempotency_key,replacement_id);
  perform private.marketplace_record_event('customer',uid,'request',p_request_id,'request_major_edit',
    pg_catalog.jsonb_build_object('replacementRequestId',replacement_id),p_idempotency_key||':major');
  return replacement_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_help_article(p_slug text, p_locale text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_locale text := private.help_locale(p_locale);
  v_article public.help_articles%rowtype; v_translation public.help_article_translations%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_article from public.help_articles a where a.slug = p_slug;
  if v_article.id is null or (v_article.status <> 'published' and not private.help_can_author()) then
    raise exception 'Help article not found' using errcode = 'PT404';
  end if;
  select * into v_translation from public.help_article_translations tr
  where tr.article_id = v_article.id and tr.locale = v_locale;
  -- A missing translation falls back to English rather than showing nothing.
  if v_translation.article_id is null then
    select * into v_translation from public.help_article_translations tr
    where tr.article_id = v_article.id and tr.locale = 'en';
    v_locale := 'en';
  end if;
  if v_translation.article_id is null then
    raise exception 'Help article not found' using errcode = 'PT404';
  end if;

  update public.help_articles set view_count = view_count + 1 where id = v_article.id;

  return pg_catalog.jsonb_build_object(
    'slug', v_article.slug, 'categoryKey', v_article.category_key,
    'status', v_article.status, 'locale', v_locale, 'version', v_article.version,
    'title', v_translation.title, 'summary', v_translation.summary, 'body', v_translation.body,
    'tags', pg_catalog.to_jsonb(v_article.tags), 'audience', v_article.audience,
    'updatedAt', v_translation.updated_at,
    'helpfulCount', v_article.helpful_count, 'notHelpfulCount', v_article.not_helpful_count,
    'myFeedback', (select f.helpful from public.help_article_feedback f
                   where f.article_id = v_article.id and f.user_id = v_uid),
    'related', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'slug', r.slug, 'title', rt.title, 'summary', rt.summary) order by r.sort_order, r.slug)
      from public.help_articles r
      join public.help_article_translations rt on rt.article_id = r.id and rt.locale = v_locale
      where r.status = 'published'
        and (r.slug = any(v_article.related_slugs)
             or (pg_catalog.array_length(v_article.related_slugs,1) is null
                 and r.category_key = v_article.category_key and r.id <> v_article.id))
      limit 4), '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_help_category(p_category_key text, p_locale text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_locale text := private.help_locale(p_locale);
  v_category public.help_categories%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_category from public.help_categories c
  where c.category_key = p_category_key and c.published;
  if v_category.category_key is null then
    raise exception 'Help category not found' using errcode = 'PT404';
  end if;
  return pg_catalog.jsonb_build_object(
    'categoryKey', v_category.category_key,
    'title', case when v_locale = 'ar' then v_category.title_ar else v_category.title_en end,
    'summary', case when v_locale = 'ar' then v_category.summary_ar else v_category.summary_en end,
    'icon', v_category.icon, 'audience', v_category.audience,
    'articles', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'slug', a.slug, 'title', tr.title, 'summary', tr.summary,
        'tags', pg_catalog.to_jsonb(a.tags), 'audience', a.audience)
        order by a.sort_order, a.slug)
      from public.help_articles a
      join public.help_article_translations tr on tr.article_id = a.id and tr.locale = v_locale
      where a.category_key = v_category.category_key and a.status = 'published'), '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_booking_payment(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Booking not found' using errcode = 'PT404';
  end if;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_booking_payment_options(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Booking not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION public.get_my_provider_booking_payment(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Provider payment not found' using errcode = 'PT404';
  end if;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_support_case(p_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_ticket public.support_tickets%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_ticket from public.support_tickets t where t.id = p_case_id and t.requester_id = v_uid;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'PT404'; end if;
  return pg_catalog.jsonb_build_object(
    'caseId', v_ticket.id, 'subject', v_ticket.subject, 'category', v_ticket.category,
    'status', v_ticket.status, 'priority', v_ticket.priority, 'locale', v_ticket.locale,
    'originSurface', v_ticket.origin_surface, 'linkedType', v_ticket.linked_type,
    'linkedId', v_ticket.linked_id, 'requesterMode', v_ticket.requester_mode,
    'createdAt', v_ticket.created_at, 'lastReplyAt', v_ticket.last_reply_at,
    'resolvedAt', v_ticket.resolved_at, 'closedAt', v_ticket.closed_at,
    'reopenedCount', v_ticket.reopened_count,
    -- Reopen rules are stated by the server so the client never invents them.
    'canReply', v_ticket.status <> 'closed',
    'canReopen', v_ticket.status = 'resolved' and v_ticket.reopened_count < 3
      and v_ticket.resolved_at is not null
      and v_ticket.resolved_at > pg_catalog.now() - pg_catalog.make_interval(days => 14),
    'canAttach', v_ticket.status <> 'closed' and v_ticket.attachment_count < 10,
    'surveyAvailable', v_ticket.status in ('resolved','closed') and v_ticket.satisfaction_submitted_at is null,
    'satisfactionScore', v_ticket.satisfaction_score,
    'messages', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', m.id, 'body', m.body, 'fromMe', m.sender_id = v_uid,
        'attachmentId', m.attachment_id, 'createdAt', m.created_at) order by m.created_at), '[]'::jsonb)
      from public.support_messages m
      where m.ticket_id = p_case_id and m.visibility = 'participants'),
    'attachments', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', a.id, 'storagePath', a.storage_path, 'fileName', a.file_name,
        'mimeType', a.mime_type, 'byteSize', a.byte_size, 'createdAt', a.created_at)
        order by a.created_at), '[]'::jsonb)
      from public.support_ticket_attachments a where a.ticket_id = p_case_id),
    'events', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id, 'action', e.action, 'toStatus', e.to_status,
        'actorRole', e.actor_role, 'createdAt', e.created_at) order by e.created_at), '[]'::jsonb)
      from public.support_ticket_events e where e.ticket_id = p_case_id));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_case(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_row public.operational_assignments%rowtype; v_queue public.staff_queues%rowtype;
begin
  select * into v_row from public.operational_assignments a where a.id = p_assignment_id;
  if v_row.id is null then raise exception 'Case not found' using errcode = 'PT404'; end if;
  select * into v_queue from public.staff_queues q where q.queue_key = v_row.queue_key;
  v_actor := private.require_staff_capability(v_queue.capability_key);
  perform private.staff_log_access(v_actor, 'case_notes', v_queue.capability_key,
    'assignment:'||p_assignment_id::text, 1);
  return pg_catalog.jsonb_build_object(
    'assignmentId', v_row.id, 'queueKey', v_row.queue_key, 'subjectType', v_row.subject_type,
    'subjectId', v_row.subject_id, 'status', v_row.status, 'priority', v_row.priority,
    'reasonCode', v_row.reason_code, 'assignedTo', v_row.assigned_to, 'assignedAt', v_row.assigned_at,
    'dueAt', v_row.due_at, 'escalatedAt', v_row.escalated_at, 'resolvedAt', v_row.resolved_at,
    'closedAt', v_row.closed_at, 'lockVersion', v_row.lock_version, 'createdAt', v_row.created_at,
    'events', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id, 'action', e.action, 'fromStatus', e.from_status, 'toStatus', e.to_status,
        'actorId', e.actor_id, 'assigneeId', e.assignee_id, 'note', e.note, 'createdAt', e.created_at
      ) order by e.created_at), '[]'::jsonb)
      from public.operational_assignment_events e where e.assignment_id = p_assignment_id),
    'privateNotes', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', n.id, 'authorId', n.author_id, 'note', n.note, 'createdAt', n.created_at
      ) order by n.created_at), '[]'::jsonb)
      from private.operational_case_notes n where n.assignment_id = p_assignment_id));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_customer_overview(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_caps text[]; v_profile public.profiles%rowtype; v_contact jsonb := '{}'::jsonb;
begin
  v_actor := private.require_staff_capability('view_safe_customer_profile');
  v_caps := private.staff_capability_keys(v_actor);
  select * into v_profile from public.profiles p where p.id = p_user_id;
  if v_profile.id is null then raise exception 'Account not found' using errcode = 'PT404'; end if;
  if 'view_contact_details' = any(v_caps) then
    v_contact := pg_catalog.jsonb_build_object(
      'phone', v_profile.phone,
      'email', private.account_contact_email(p_user_id));
  end if;
  perform private.staff_log_access(v_actor, 'customer_overview', 'view_safe_customer_profile',
    'account:'||p_user_id::text, 1);
  return pg_catalog.jsonb_build_object(
    'userId', v_profile.id,
    'displayName', v_profile.display_name,
    'preferredLanguage', v_profile.preferred_language,
    'accountStatus', case when v_profile.deleted_at is not null then 'deleted' else 'active' end,
    'createdAt', v_profile.created_at,
    'trustLevel', coalesce((select s.trust_level from public.trust_account_state s where s.user_id = p_user_id),'good_standing'),
    'restrictions', coalesce((select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'marketplaceRemoved', nullif(s.marketplace_removed,false),
        'communicationRestricted', nullif(s.communication_restricted,false),
        'reviewRestricted', nullif(s.review_restricted,false),
        'paymentHold', nullif(s.payment_hold,false)))
      from public.trust_account_state s where s.user_id = p_user_id), '{}'::jsonb),
    'bookings', pg_catalog.jsonb_build_object(
      'total', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id),
      'completed', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id and b.status = 'completed'),
      'cancelled', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id and b.status = 'cancelled'),
      'active', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id
                 and b.status not in ('completed','cancelled','rejected','refunded'))),
    'disputesOpened', (select pg_catalog.count(*)::integer from public.disputes d where d.opened_by = p_user_id),
    'reportsFiled', (select pg_catalog.count(*)::integer from public.trust_reports r where r.reporter_id = p_user_id),
    'reportsAgainst', (select pg_catalog.count(*)::integer from public.trust_reports r where r.subject_user_id = p_user_id),
    'supportCases', (select pg_catalog.count(*)::integer from public.support_tickets t where t.requester_id = p_user_id),
    'contact', v_contact,
    'contactVisible', 'view_contact_details' = any(v_caps));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_support_case(p_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_ticket public.support_tickets%rowtype;
begin
  v_actor := private.require_staff_capability('manage_support_cases');
  select * into v_ticket from public.support_tickets t where t.id = p_case_id;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'PT404'; end if;
  return pg_catalog.jsonb_build_object(
    'caseId', v_ticket.id, 'requesterId', v_ticket.requester_id, 'subject', v_ticket.subject,
    'category', v_ticket.category, 'status', v_ticket.status, 'priority', v_ticket.priority,
    'assignedTo', v_ticket.assigned_to, 'escalatedToType', v_ticket.escalated_to_type,
    'escalatedToId', v_ticket.escalated_to_id, 'createdAt', v_ticket.created_at,
    'messages', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', m.id, 'senderId', m.sender_id, 'body', m.body, 'visibility', m.visibility,
        'createdAt', m.created_at) order by m.created_at), '[]'::jsonb)
      from public.support_messages m where m.ticket_id = p_case_id),
    'events', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id, 'action', e.action, 'fromStatus', e.from_status, 'toStatus', e.to_status,
        'actorRole', e.actor_role, 'note', e.note, 'createdAt', e.created_at) order by e.created_at), '[]'::jsonb)
      from public.support_ticket_events e where e.ticket_id = p_case_id));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_worker_overview(p_provider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_actor uuid; v_caps text[]; v_provider public.provider_profiles%rowtype;
  v_financial jsonb := '{}'::jsonb; v_contact jsonb := '{}'::jsonb;
begin
  v_actor := private.require_staff_capability('view_safe_worker_profile');
  v_caps := private.staff_capability_keys(v_actor);
  select * into v_provider from public.provider_profiles p where p.id = p_provider_id;
  if v_provider.id is null then raise exception 'Worker not found' using errcode = 'PT404'; end if;
  if 'view_financial_ledger' = any(v_caps) then
    select pg_catalog.jsonb_build_object(
      'currency','EGP',
      'pendingMinor', coalesce(pg_catalog.sum(e.net_minor) filter (where e.status in ('pending_job_completion','pending_release')),0)::text,
      'availableMinor', coalesce(pg_catalog.sum(e.net_minor) filter (where e.status = 'available'),0)::text,
      'paidOutMinor', coalesce(pg_catalog.sum(e.net_minor) filter (where e.status = 'paid_out'),0)::text,
      'heldMinor', coalesce(pg_catalog.sum(e.held_minor),0)::text)
      into v_financial
    from public.provider_earnings_ledger e where e.provider_id = p_provider_id;
    v_financial := v_financial || pg_catalog.jsonb_build_object(
      'openWithdrawals', (select pg_catalog.count(*)::integer from public.provider_withdrawal_requests w
                          where w.provider_id = p_provider_id and w.status in ('requested','under_review','processing')),
      'activeHolds', (select pg_catalog.count(*)::integer from public.provider_earning_holds h
                      where h.provider_id = p_provider_id and h.status = 'active'));
  end if;
  if 'view_contact_details' = any(v_caps) and v_provider.user_id is not null then
    select pg_catalog.jsonb_build_object('phone', pr.phone) into v_contact
    from public.profiles pr where pr.id = v_provider.user_id;
  end if;
  perform private.staff_log_access(v_actor, 'worker_overview', 'view_safe_worker_profile',
    'worker:'||p_provider_id::text, 1);
  return pg_catalog.jsonb_build_object(
    'providerId', v_provider.id,
    'userId', v_provider.user_id,
    'displayName', v_provider.display_name,
    'professionKey', v_provider.profession_key,
    'primaryCategoryId', v_provider.primary_category_id,
    'onboardingStatus', v_provider.onboarding_status,
    'isPublished', v_provider.is_published,
    'isVerified', v_provider.is_verified,
    'isAvailable', v_provider.is_available,
    'accountStatus', case when v_provider.deleted_at is not null then 'deleted' else 'active' end,
    'ratingAverage', v_provider.rating_average,
    'reviewCount', v_provider.review_count,
    'completedJobs', v_provider.completed_jobs,
    'verification', (select pg_catalog.jsonb_build_object('status', v.status, 'submittedAt', v.submitted_at,
        'reviewedAt', v.reviewed_at, 'expiresAt', v.expires_at)
      from public.provider_verifications v where v.provider_id = p_provider_id),
    'certificates', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id, 'type', c.certificate_type, 'status', c.status, 'expiresAt', c.expires_at)
        order by c.created_at desc), '[]'::jsonb)
      from public.provider_certifications c where c.provider_id = p_provider_id and c.deleted_at is null),
    'bookings', pg_catalog.jsonb_build_object(
      'total', (select pg_catalog.count(*)::integer from public.bookings b where b.provider_id = p_provider_id),
      'completed', (select pg_catalog.count(*)::integer from public.bookings b where b.provider_id = p_provider_id and b.status = 'completed'),
      'cancelled', (select pg_catalog.count(*)::integer from public.bookings b where b.provider_id = p_provider_id and b.status = 'cancelled')),
    'trustLevel', coalesce((select s.trust_level from public.trust_account_state s where s.user_id = v_provider.user_id),'good_standing'),
    'reportsAgainst', (select pg_catalog.count(*)::integer from public.trust_reports r where r.subject_user_id = v_provider.user_id),
    'financial', v_financial,
    'financialVisible', 'view_financial_ledger' = any(v_caps),
    'contact', v_contact,
    'contactVisible', 'view_contact_details' = any(v_caps));
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_support_attachment(p_case_id uuid, p_storage_path text, p_file_name text, p_content_hash text, p_client_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_ticket public.support_tickets%rowtype;
  v_object record; v_id uuid; v_name text := pg_catalog.btrim(coalesce(p_file_name,''));
  v_hash text := pg_catalog.lower(coalesce(p_content_hash,''));
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if pg_catalog.length(v_name) not between 1 and 120
     or pg_catalog.strpos(v_name,'/') > 0 or pg_catalog.strpos(v_name, pg_catalog.chr(92)) > 0
     or v_name ~ '[[:cntrl:]]'
     or v_hash !~ '^[a-f0-9]{32,64}$'
     or pg_catalog.length(coalesce(p_client_id,'')) not between 8 and 200 then
    raise exception 'Invalid support attachment' using errcode = '22023';
  end if;
  perform private.enforce_rate_limit('support_attachment_register');

  select * into v_ticket from public.support_tickets t
  where t.id = p_case_id and t.requester_id = v_uid for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'PT404'; end if;
  if v_ticket.status = 'closed' then
    raise exception 'This support case is closed' using errcode = '22023';
  end if;
  if v_ticket.attachment_count >= 10 then
    raise exception 'Support attachment limit reached' using errcode = '22023';
  end if;

  -- Idempotent retry: the same client id returns the same row rather than
  -- creating a second attachment after a dropped connection.
  select a.id into v_id from public.support_ticket_attachments a
  where a.ticket_id = p_case_id and a.uploader_id = v_uid and a.client_id = p_client_id;
  if v_id is not null then return v_id; end if;

  select o.metadata->>'mimetype' mime_type,
         nullif(o.metadata->>'size','')::bigint byte_size,
         o.owner_id
  into v_object
  from storage.objects o
  where o.bucket_id = 'support-attachments' and o.name = p_storage_path;

  if not found or v_object.owner_id <> v_uid::text
     or v_object.mime_type not in ('image/jpeg','image/png','image/heic','application/pdf')
     or v_object.byte_size is null or v_object.byte_size not between 1 and 8388608
     or p_storage_path !~ ('^' || v_uid::text || '/' || p_case_id::text || '/[A-Za-z0-9-]{12,100}\.(jpg|jpeg|png|heic|pdf)$')
     or p_storage_path ~ '(\.\.|//|\\)' then
    raise exception 'Invalid support attachment' using errcode = '22023';
  end if;

  if exists(select 1 from public.support_ticket_attachments a
            where a.ticket_id = p_case_id and a.content_hash = v_hash) then
    raise exception 'This file is already attached to the case' using errcode = '23505';
  end if;

  insert into public.support_ticket_attachments(
    ticket_id, uploader_id, storage_path, file_name, mime_type, byte_size, content_hash, client_id)
  values (p_case_id, v_uid, p_storage_path, v_name, v_object.mime_type, v_object.byte_size, v_hash, p_client_id)
  returning id into v_id;

  update public.support_tickets set
    attachment_count = attachment_count + 1, updated_at = pg_catalog.now()
  where id = p_case_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_support_case(p_case_id uuid, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_ticket public.support_tickets%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) not between 3 and 2000
     or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid reopen request' using errcode = '22023';
  end if;
  perform private.enforce_rate_limit('support_case_reopen');

  select * into v_ticket from public.support_tickets t
  where t.id = p_case_id and t.requester_id = v_uid for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'PT404'; end if;

  if exists(select 1 from public.support_ticket_events e
            where e.ticket_id = p_case_id and e.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', v_ticket.status, 'duplicate', true);
  end if;

  -- A closed case is final. A resolved case reopens for fourteen days, at most
  -- three times; after that the requester opens a new case that carries a
  -- pointer to this one.
  if v_ticket.status <> 'resolved' then
    raise exception 'Only a resolved support case can be reopened' using errcode = '22023';
  end if;
  if v_ticket.reopened_count >= 3 then
    raise exception 'This support case cannot be reopened again' using errcode = '22023';
  end if;
  if v_ticket.resolved_at is null
     or v_ticket.resolved_at <= pg_catalog.now() - pg_catalog.make_interval(days => 14) then
    raise exception 'The reopen window for this support case has passed' using errcode = '22023';
  end if;

  update public.support_tickets set
    status = 'open', reopened_count = reopened_count + 1, resolved_at = null,
    resolution_reason = null, last_reply_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = p_case_id;

  insert into public.support_messages(ticket_id, sender_id, body, visibility, idempotency_key)
  values (p_case_id, v_uid, pg_catalog.btrim(p_reason), 'participants', p_idempotency_key);

  insert into public.support_ticket_events(
    ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_case_id, v_ticket.status, 'open', 'status_changed', v_uid, 'participant',
          'Reopened by the requester', p_idempotency_key);

  return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', 'open', 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.reply_support_case(p_case_id uuid, p_body text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_ticket public.support_tickets%rowtype; v_is_staff boolean; v_existing uuid;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_ticket from public.support_tickets t where t.id = p_case_id for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'PT404'; end if;
  v_is_staff := private.staff_has_capability('manage_support_cases');
  if v_ticket.requester_id <> v_uid and not v_is_staff then
    raise exception 'Support case not found' using errcode = '42501';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'This support case is closed' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_body,''))) not between 1 and 4000
     or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid reply' using errcode = '22023';
  end if;
  select m.id into v_existing from public.support_messages m
  where m.ticket_id = p_case_id and m.idempotency_key = p_idempotency_key and m.sender_id = v_uid;
  if v_existing is not null then
    return pg_catalog.jsonb_build_object('messageId', v_existing, 'duplicate', true);
  end if;
  insert into public.support_messages(ticket_id, sender_id, body, visibility, idempotency_key)
  values (p_case_id, v_uid, pg_catalog.btrim(p_body), 'participants', p_idempotency_key);
  insert into public.support_ticket_events(ticket_id, from_status, to_status, action, actor_id, actor_role, idempotency_key)
  values (p_case_id, v_ticket.status, v_ticket.status, 'replied', v_uid,
          case when v_is_staff and v_ticket.requester_id <> v_uid then 'staff' else 'participant' end,
          'reply:'||p_idempotency_key)
  on conflict do nothing;
  update public.support_tickets set last_reply_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = p_case_id;
  return pg_catalog.jsonb_build_object('duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.report_customer_no_show(p_booking_id uuid, p_evidence jsonb, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare uid uuid := (select auth.uid()); booking_row record; arrived_at timestamptz; eligible_at timestamptz; event_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(coalesce(p_evidence,'{}'::jsonb)::text)>4000 then raise exception 'Evidence is too large' using errcode='22023'; end if;
  select b.*,p.id as provider_profile_id into booking_row from public.bookings b
  join public.provider_profiles p on p.id=b.provider_id
  where b.id=p_booking_id and p.user_id=uid and b.deleted_at is null for update of b;
  if booking_row.id is null then raise exception 'Booking not found' using errcode='PT404'; end if;
  select max(h.created_at) into arrived_at from public.booking_status_history h where h.booking_id=p_booking_id and h.status='provider_arrived';
  eligible_at:=arrived_at+interval '15 minutes';
  if booking_row.status<>'provider_arrived' or arrived_at is null or pg_catalog.now()<eligible_at
  then raise exception 'Customer no-show wait period is still active' using errcode='22023'; end if;
  insert into public.marketplace_no_show_events(
    request_id,booking_id,reporter_id,reported_party_id,reported_party_class,eligible_at,milestone_snapshot,approximate_evidence,idempotency_key
  ) values (
    booking_row.marketplace_request_id,p_booking_id,uid,booking_row.customer_id,'customer',eligible_at,
    pg_catalog.jsonb_build_object('arrivedAt',arrived_at,'bookingStatus',booking_row.status),coalesce(p_evidence,'{}'::jsonb),p_idempotency_key
  ) on conflict(reporter_id,idempotency_key) do update set id=public.marketplace_no_show_events.id returning id into event_id;
  update public.bookings set status='no_show' where id=p_booking_id;
  perform private.marketplace_notify(booking_row.customer_id,'customer_no_show_reported','No-show reported',
    'The worker reported a no-show. No automatic financial penalty was applied.',pg_catalog.jsonb_build_object('bookingId',p_booking_id),'customer-no-show:'||event_id::text);
  perform private.marketplace_record_event('worker',uid,'booking',p_booking_id,'customer_no_show_reported',
    pg_catalog.jsonb_build_object('automaticPenalty',false,'eligibleAt',eligible_at),p_idempotency_key||':customer-no-show');
  return event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.report_worker_no_show(p_booking_id uuid, p_evidence jsonb, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare uid uuid := (select auth.uid()); booking_row record; latest_eta timestamptz; eligible_at timestamptz; event_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(coalesce(p_evidence,'{}'::jsonb)::text)>4000 then raise exception 'Evidence is too large' using errcode='22023'; end if;
  select b.*,p.user_id as provider_uid into booking_row from public.bookings b
  join public.provider_profiles p on p.id=b.provider_id
  where b.id=p_booking_id and b.customer_id=uid and b.deleted_at is null for update of b;
  if booking_row.id is null then raise exception 'Booking not found' using errcode='PT404'; end if;
  if booking_row.status not in ('confirmed','provider_on_the_way')
    or exists(select 1 from public.booking_status_history h where h.booking_id=p_booking_id and h.status='provider_arrived')
  then raise exception 'Worker no-show cannot be reported' using errcode='22023'; end if;
  select latest_eta_at into latest_eta from public.marketplace_running_late_events
  where booking_id=p_booking_id and superseded_at is null order by created_at desc limit 1;
  latest_eta:=coalesce(latest_eta,(booking_row.scheduled_date+booking_row.scheduled_time) at time zone 'Africa/Cairo');
  eligible_at:=latest_eta+pg_catalog.make_interval(secs=>(select worker_no_show_seconds from private.marketplace_configuration where singleton));
  if pg_catalog.now()<eligible_at then raise exception 'Worker no-show wait period is still active' using errcode='22023'; end if;
  insert into public.marketplace_no_show_events(
    request_id,booking_id,reporter_id,reported_party_id,reported_party_class,eligible_at,milestone_snapshot,approximate_evidence,idempotency_key
  ) values (
    booking_row.marketplace_request_id,p_booking_id,uid,booking_row.provider_uid,'worker',eligible_at,
    pg_catalog.jsonb_build_object('latestEtaAt',latest_eta,'bookingStatus',booking_row.status),coalesce(p_evidence,'{}'::jsonb),p_idempotency_key
  ) on conflict(reporter_id,idempotency_key) do update set id=public.marketplace_no_show_events.id returning id into event_id;
  update public.bookings set status='cancelled',cancellation_reason='worker_no_show',cancelled_at=pg_catalog.now() where id=p_booking_id;
  perform private.marketplace_notify(booking_row.provider_uid,'worker_no_show_reported','No-show reported',
    'A customer reported a no-show. No automatic financial penalty was applied.',pg_catalog.jsonb_build_object('bookingId',p_booking_id),'worker-no-show:'||event_id::text);
  perform private.marketplace_record_event('customer',uid,'booking',p_booking_id,'worker_no_show_reported',
    pg_catalog.jsonb_build_object('automaticPenalty',false,'eligibleAt',eligible_at),p_idempotency_key||':worker-no-show');
  perform private.trigger_rescue_matching(p_booking_id);
  return event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.report_worker_running_late(p_booking_id uuid, p_delay_minutes integer, p_reason_code text, p_note text, p_idempotency_key text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare uid uuid := (select auth.uid()); booking_row record; previous_eta timestamptz; latest_eta timestamptz; event_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_delay_minutes not between 1 and 240 or p_reason_code not in ('traffic','previous_job','transport','emergency','other')
    or pg_catalog.length(coalesce(p_note,''))>300
  then raise exception 'Invalid delay update' using errcode='22023'; end if;
  select b.*,p.id as provider_profile_id into booking_row
  from public.bookings b join public.provider_profiles p on p.id=b.provider_id
  where b.id=p_booking_id and p.user_id=uid and b.deleted_at is null for update of b;
  if booking_row.id is null then raise exception 'Booking not found' using errcode='PT404'; end if;
  if booking_row.status not in ('confirmed','provider_on_the_way') then raise exception 'Running Late is unavailable' using errcode='22023'; end if;
  select latest_eta_at into previous_eta from public.marketplace_running_late_events
  where booking_id=p_booking_id and superseded_at is null order by created_at desc limit 1 for update;
  previous_eta:=coalesce(previous_eta,(booking_row.scheduled_date+booking_row.scheduled_time) at time zone 'Africa/Cairo');
  latest_eta:=pg_catalog.now()+pg_catalog.make_interval(mins=>p_delay_minutes);
  update public.marketplace_running_late_events set superseded_at=pg_catalog.now()
  where booking_id=p_booking_id and superseded_at is null;
  insert into public.marketplace_running_late_events(
    booking_id,reporting_provider_id,delay_minutes,reason_code,note,previous_eta_at,latest_eta_at,idempotency_key
  ) values (
    p_booking_id,booking_row.provider_profile_id,p_delay_minutes,p_reason_code,coalesce(p_note,''),previous_eta,latest_eta,p_idempotency_key
  ) on conflict(reporting_provider_id,idempotency_key) do update set id=public.marketplace_running_late_events.id
  returning id into event_id;
  perform private.marketplace_notify(booking_row.customer_id,'worker_running_late','Worker is running late',
    'Your worker shared a new arrival estimate.',pg_catalog.jsonb_build_object('bookingId',p_booking_id,'latestEtaAt',latest_eta,'delayMinutes',p_delay_minutes),
    'running-late:'||event_id::text);
  perform private.marketplace_record_event('worker',uid,'booking',p_booking_id,'worker_running_late',
    pg_catalog.jsonb_build_object('delayMinutes',p_delay_minutes,'reasonCode',p_reason_code),p_idempotency_key||':running-late');
  return latest_eta;
end;
$function$;

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
    raise exception 'Payout destination not found' using errcode = 'PT404';
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

CREATE OR REPLACE FUNCTION public.respond_booking_price_adjustment(p_adjustment_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Price adjustment not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION public.respond_cash_collection(p_booking_id uuid, p_confirmed boolean, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    raise exception 'Cash payment not found' using errcode = 'PT404';
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
$function$;

CREATE OR REPLACE FUNCTION public.retry_marketplace_request(p_request_id uuid, p_strategy text, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare uid uuid := (select auth.uid()); request_row public.marketplace_requests; location_row private.marketplace_request_locations;
  payload jsonb; retry_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into request_row from public.marketplace_requests where id=p_request_id and customer_id=uid for update;
  if request_row.id is null then raise exception 'Request not found' using errcode='PT404'; end if;
  if request_row.status<>'expired' or p_strategy not in ('retry','expand','schedule') or request_row.flow_kind='emergency'
  then raise exception 'Retry is unavailable' using errcode='22023'; end if;
  select * into location_row from private.marketplace_request_locations where request_id=p_request_id;
  payload:=pg_catalog.jsonb_build_object(
    'flowKind',case when request_row.flow_kind='browse_worker' then 'browse_worker' else 'get_quotes' end,
    'categoryId',request_row.category_id,'serviceId',request_row.service_id,'targetedProviderId',request_row.targeted_provider_id,
    'addressId',location_row.address_id,'issueDescription',request_row.issue_description,'notes',request_row.notes,
    'complexity',request_row.complexity,'scheduleKind',request_row.schedule_kind,
    'requestedStartAt',request_row.requested_start_at,'requestedEndAt',request_row.requested_end_at,
    'paymentCompatibility',request_row.payment_compatibility
  );
  retry_id:=public.create_marketplace_request(payload,p_idempotency_key||':retry');
  update public.marketplace_requests set retry_for_request_id=p_request_id where id=retry_id;
  perform private.marketplace_record_event('customer',uid,'request',retry_id,'request_retried',
    pg_catalog.jsonb_build_object('sourceRequestId',p_request_id,'strategy',p_strategy),p_idempotency_key||':retried');
  return retry_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revise_worker_quote(p_quote_id uuid, p_quote jsonb, p_idempotency_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; quote_row public.worker_quotes;
  request_row public.marketplace_requests; terms jsonb; next_revision integer; existing_revision integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_idempotency_key is null or pg_catalog.length(p_idempotency_key) not between 16 and 200 then raise exception 'Invalid quote request' using errcode='22023'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select revision into existing_revision from public.worker_quote_revisions where actor_id=uid and idempotency_key=p_idempotency_key||':revision';
  if existing_revision is not null then return existing_revision; end if;
  select * into quote_row from public.worker_quotes q where q.id=p_quote_id and q.provider_id=provider_id for update;
  if quote_row.id is null then raise exception 'Quote not found' using errcode='PT404'; end if;
  select * into request_row from public.marketplace_requests where id=quote_row.request_id for update;
  if quote_row.status not in ('submitted','revised') or request_row.selected_quote_id is not null
    or request_row.status not in ('collecting_quotes','customer_reviewing','matching','rescue_matching')
    or request_row.expires_at<=pg_catalog.now()
  then raise exception 'Quote can no longer be revised' using errcode='22023'; end if;
  terms := private.validate_worker_quote(provider_id,request_row.id,p_quote);
  next_revision := quote_row.current_revision+1;
  insert into public.worker_quote_revisions(quote_id,revision,terms,revision_reason,actor_id,idempotency_key)
  values(p_quote_id,next_revision,terms,pg_catalog.left(coalesce(p_quote->>'revisionReason',''),200),uid,p_idempotency_key||':revision');
  update public.worker_quotes set status='revised',current_revision=next_revision,
    price_minor=(terms->>'priceMinor')::bigint,proposed_start_at=nullif(terms->>'proposedStartAt','')::timestamptz,
    eta_minutes=nullif(terms->>'etaMinutes','')::integer,estimated_duration_minutes=(terms->>'estimatedDurationMinutes')::integer,
    message=terms->>'message',labor_included=(terms->>'laborIncluded')::boolean,
    materials_inclusion=terms->>'materialsInclusion',materials_explanation=terms->>'materialsExplanation',
    warranty_days=nullif(terms->>'warrantyDays','')::integer,
    supported_payment_methods=array(select jsonb_array_elements_text(terms->'supportedPaymentMethods'))
  where id=p_quote_id;
  perform private.marketplace_notify(request_row.customer_id,'quote_revised','Quote updated','A worker updated a quote.',
    pg_catalog.jsonb_build_object('requestId',request_row.id,'quoteId',p_quote_id),'quote-revised:'||p_quote_id::text||':'||next_revision::text);
  perform private.marketplace_record_event('worker',uid,'quote',p_quote_id,'quote_revised',
    pg_catalog.jsonb_build_object('revision',next_revision),p_idempotency_key||':revised');
  return next_revision;
end;
$function$;

CREATE OR REPLACE FUNCTION public.select_worker_quote(p_request_id uuid, p_quote_id uuid, p_expected_selection_version integer, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare uid uuid := (select auth.uid()); request_row public.marketplace_requests; quote_row public.worker_quotes; worker_uid uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into request_row from public.marketplace_requests where id=p_request_id and customer_id=uid for update;
  if request_row.id is null then raise exception 'Request not found' using errcode='PT404'; end if;
  if request_row.selected_quote_id=p_quote_id then return p_quote_id; end if;
  if request_row.flow_kind='emergency' or request_row.status not in ('collecting_quotes','customer_reviewing')
    or request_row.expires_at<=pg_catalog.now() or request_row.collection_not_before>pg_catalog.now()
    or request_row.selection_version<>p_expected_selection_version
  then raise exception 'Quote cannot be selected' using errcode='40001'; end if;
  select * into quote_row from public.worker_quotes where id=p_quote_id and request_id=p_request_id for update;
  if quote_row.id is null or quote_row.status not in ('submitted','revised') or quote_row.expires_at<=pg_catalog.now()
    or not private.is_provider_publicly_discoverable(quote_row.provider_id)
  then raise exception 'Quote is no longer available' using errcode='22023'; end if;
  update public.worker_quotes set status='selected',selected_at=pg_catalog.now() where id=p_quote_id;
  update public.marketplace_requests set status='selection_pending_confirmation',selected_quote_id=p_quote_id,
    selected_at=pg_catalog.now(),selection_version=selection_version+1,
    confirmation_deadline_at=pg_catalog.now()+pg_catalog.make_interval(secs=>(select confirmation_timeout_seconds from private.marketplace_configuration where singleton))
  where id=p_request_id;
  select user_id into worker_uid from public.provider_profiles where id=quote_row.provider_id;
  insert into private.marketplace_jobs(job_kind,request_id,run_at,dedupe_key)
  select 'expire_confirmation',p_request_id,confirmation_deadline_at,'confirmation:'||p_request_id::text
  from public.marketplace_requests where id=p_request_id;
  perform private.marketplace_notify(worker_uid,'quote_selected','Quote selected','The customer selected your quote. Confirm it now.',
    pg_catalog.jsonb_build_object('requestId',p_request_id,'quoteId',p_quote_id),'quote-selected:'||p_quote_id::text);
  perform private.marketplace_record_event('customer',uid,'request',p_request_id,'quote_selected',
    pg_catalog.jsonb_build_object('quoteId',p_quote_id),p_idempotency_key||':selected');
  return p_quote_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_activate_campaign(p_campaign_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid; v_row public.growth_campaigns%rowtype;
begin
  v_uid := private.require_staff_capability('approve_growth_campaign');
  select * into v_row from public.growth_campaigns c where c.id = p_campaign_id for update;
  if v_row.id is null then
    raise exception 'Campaign not found' using errcode = 'PT404';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'Only a draft campaign can be activated' using errcode = '22023';
  end if;
  -- Independent of dual control, and deliberately so: where dual control is off
  -- for the environment, this is the check that still prevents one person from
  -- authoring and activating their own spending.
  if v_row.created_by is not null and v_row.created_by = v_uid then
    raise exception 'A campaign cannot be activated by its creator' using errcode = '42501';
  end if;
  perform private.consume_dual_control(
    'approve_growth_campaign', 'activate_campaign', p_campaign_id::text);

  update public.growth_campaigns
    set status = case when starts_at > pg_catalog.now() then 'scheduled' else 'active' end,
        approved_by = v_uid, approved_at = pg_catalog.now(),
        activated_at = pg_catalog.now()
    where id = p_campaign_id;

  perform private.record_staff_audit(v_uid, 'approve_growth_campaign', 'campaign_activated',
    'growth_campaign', p_campaign_id, coalesce(nullif(pg_catalog.btrim(p_note),''), 'Campaign activated'),
    pg_catalog.jsonb_build_object('campaignKey', v_row.campaign_key));
  return pg_catalog.jsonb_build_object('id', p_campaign_id, 'activated', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_activate_configuration(p_version_id uuid, p_approval_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_row private.staff_configuration_versions%rowtype; v_domain private.staff_configuration_domains%rowtype;
begin
  v_actor := private.require_staff_capability('approve_configuration');
  select * into v_row from private.staff_configuration_versions v where v.id = p_version_id for update;
  if v_row.id is null then raise exception 'Configuration version not found' using errcode = 'PT404'; end if;
  select * into v_domain from private.staff_configuration_domains d where d.domain_key = v_row.domain_key;
  if v_row.status <> 'pending_approval' then
    raise exception 'Only a submitted version can be activated' using errcode = '22023';
  end if;
  if v_row.created_by = v_actor then
    raise exception 'A configuration version cannot be approved by its author' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_approval_note,''))) < 3 then
    raise exception 'An approval note is required' using errcode = '22023';
  end if;
  update private.staff_configuration_versions
    set status = 'superseded', superseded_at = pg_catalog.now()
    where domain_key = v_row.domain_key and environment = v_row.environment and status = 'active';
  update private.staff_configuration_versions
    set status = 'active', approved_by = v_actor, approved_at = pg_catalog.now(),
        activated_at = pg_catalog.now()
    where id = p_version_id;
  perform private.record_staff_audit(v_actor, 'approve_configuration', 'configuration_activated',
    'staff_configuration_version', p_version_id, pg_catalog.btrim(p_approval_note),
    pg_catalog.jsonb_build_object('domainKey', v_row.domain_key, 'environment', v_row.environment,
      'version', v_row.version, 'appliedBy', v_domain.applied_by));
  return pg_catalog.jsonb_build_object('id', p_version_id, 'status', 'active',
    'appliedBy', v_domain.applied_by, 'authoritativeOwner', v_domain.authoritative_owner);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_activate_referral_program(p_program_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid; v_row public.referral_programs%rowtype;
begin
  v_uid := private.require_staff_capability('approve_referral_program');
  select * into v_row from public.referral_programs p where p.id = p_program_id for update;
  if v_row.id is null then
    raise exception 'Referral program not found' using errcode = 'PT404';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'Only a draft program can be activated' using errcode = '22023';
  end if;
  if v_row.created_by is not null and v_row.created_by = v_uid then
    raise exception 'A referral program cannot be activated by its creator' using errcode = '42501';
  end if;
  perform private.consume_dual_control(
    'approve_referral_program', 'activate_referral_program', p_program_id::text);

  update public.referral_programs
    set status = case when starts_at > pg_catalog.now() then 'scheduled' else 'active' end,
        approved_by = v_uid, approved_at = pg_catalog.now(),
        activated_at = pg_catalog.now()
    where id = p_program_id;

  perform private.record_staff_audit(v_uid, 'approve_referral_program', 'referral_program_activated',
    'referral_program', p_program_id,
    coalesce(nullif(pg_catalog.btrim(p_note),''), 'Referral program activated'),
    pg_catalog.jsonb_build_object('programKey', v_row.program_key));
  return pg_catalog.jsonb_build_object('id', p_program_id, 'activated', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_add_case_note(p_assignment_id uuid, p_note text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_row public.operational_assignments%rowtype; v_queue public.staff_queues%rowtype; v_id uuid;
begin
  select * into v_row from public.operational_assignments a where a.id = p_assignment_id;
  if v_row.id is null then raise exception 'Case not found' using errcode = 'PT404'; end if;
  select * into v_queue from public.staff_queues q where q.queue_key = v_row.queue_key;
  v_actor := private.require_staff_capability(v_queue.capability_key);
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_note,''))) not between 3 and 4000 then
    raise exception 'A note is required' using errcode = '22023';
  end if;
  select n.id into v_id from private.operational_case_notes n
  where n.assignment_id = p_assignment_id and n.idempotency_key = p_idempotency_key;
  if v_id is not null then
    return pg_catalog.jsonb_build_object('noteId', v_id, 'duplicate', true);
  end if;
  insert into private.operational_case_notes(assignment_id, author_id, note, idempotency_key)
  values (p_assignment_id, v_actor, pg_catalog.btrim(p_note), p_idempotency_key)
  returning id into v_id;
  insert into public.operational_assignment_events(
    assignment_id, from_status, to_status, action, actor_id, idempotency_key)
  values (p_assignment_id, v_row.status, v_row.status, 'note_added', v_actor, 'note:'||p_idempotency_key)
  on conflict do nothing;
  return pg_catalog.jsonb_build_object('noteId', v_id, 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_add_support_note(p_case_id uuid, p_note text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_ticket public.support_tickets%rowtype; v_id uuid;
begin
  v_actor := private.require_staff_capability('manage_support_cases');
  select * into v_ticket from public.support_tickets t where t.id = p_case_id;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'PT404'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_note,''))) not between 1 and 4000 then
    raise exception 'A note is required' using errcode = '22023';
  end if;
  select m.id into v_id from public.support_messages m
  where m.ticket_id = p_case_id and m.idempotency_key = p_idempotency_key and m.sender_id = v_actor;
  if v_id is not null then return pg_catalog.jsonb_build_object('noteId', v_id, 'duplicate', true); end if;
  insert into public.support_messages(ticket_id, sender_id, body, visibility, idempotency_key)
  values (p_case_id, v_actor, pg_catalog.btrim(p_note), 'staff', p_idempotency_key)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('noteId', v_id, 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_approve_dual_control(p_request_id uuid, p_approval_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid; v_row private.staff_dual_control_requests%rowtype;
begin
  select * into v_row from private.staff_dual_control_requests r
  where r.id = p_request_id for update;
  if v_row.id is null then
    raise exception 'Approval request not found' using errcode = 'PT404';
  end if;
  v_uid := private.require_staff_capability(v_row.capability_key);
  -- A record whose policy asked for one identity cannot acquire a second one
  -- afterwards. Allowing it would put a name in the trail that the control did
  -- not require and did not wait for.
  if v_row.required_approvals <= 1 then
    raise exception 'This authorisation needs no second approver'
      using errcode = '42501';
  end if;
  if v_uid = v_row.requested_by then
    raise exception 'A staff member cannot approve their own request' using errcode = '42501';
  end if;
  if v_row.consumed_at is not null then
    raise exception 'That approval was already used' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_approval_note,''))) < 3 then
    raise exception 'An approval note is required' using errcode = '22023';
  end if;
  update private.staff_dual_control_requests
    set approved_by = v_uid, approved_at = pg_catalog.now(),
        approval_note = pg_catalog.btrim(p_approval_note)
    where id = p_request_id;
  perform private.record_staff_audit(v_uid, v_row.capability_key, 'dual_control_approved',
    'staff_dual_control_request', p_request_id, pg_catalog.btrim(p_approval_note),
    pg_catalog.jsonb_build_object('actionKey', v_row.action_key,
      'requestedBy', v_row.requested_by,
      'governanceMode', v_row.governance_mode,
      'requiredApprovals', v_row.required_approvals));
  return pg_catalog.jsonb_build_object('id', p_request_id, 'approved', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_assign_case(p_assignment_id uuid, p_assignee_id uuid, p_expected_version integer, p_note text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_actor uuid; v_row public.operational_assignments%rowtype; v_queue public.staff_queues%rowtype;
  v_event uuid; v_action text; v_status text;
begin
  select * into v_row from public.operational_assignments a where a.id = p_assignment_id for update;
  if v_row.id is null then raise exception 'Case not found' using errcode = 'PT404'; end if;
  select * into v_queue from public.staff_queues q where q.queue_key = v_row.queue_key;
  -- Claiming your own case needs only the queue capability; assigning someone
  -- else additionally needs the assignment capability.
  if p_assignee_id is distinct from (select auth.uid()) then
    v_actor := private.require_staff_capability('assign_cases');
    perform private.require_staff_capability(v_queue.capability_key);
  else
    v_actor := private.require_staff_capability(v_queue.capability_key);
  end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid assignment' using errcode = '22023';
  end if;
  select e.id into v_event from public.operational_assignment_events e
  where e.assignment_id = p_assignment_id and e.idempotency_key = p_idempotency_key;
  if v_event is not null then
    return pg_catalog.jsonb_build_object('assignmentId', p_assignment_id, 'duplicate', true,
      'status', v_row.status, 'lockVersion', v_row.lock_version);
  end if;
  -- No silent overwrite: the caller must have seen the current version.
  if p_expected_version is null or p_expected_version <> v_row.lock_version then
    raise exception 'This case changed since you opened it' using errcode = '40001';
  end if;
  if v_row.status in ('resolved','closed') then
    raise exception 'A closed case cannot be assigned' using errcode = '22023';
  end if;
  if p_assignee_id is null then raise exception 'An assignee is required' using errcode = '22023'; end if;
  if pg_catalog.cardinality(private.staff_capability_keys(p_assignee_id)) = 0
     or not (v_queue.capability_key = any(private.staff_capability_keys(p_assignee_id))) then
    raise exception 'That staff member cannot work this queue' using errcode = '22023';
  end if;
  v_action := case when v_row.assigned_to is null then
      (case when p_assignee_id = v_actor then 'claimed' else 'assigned' end)
    else 'reassigned' end;
  v_status := case when v_row.status = 'unassigned' then 'assigned' else v_row.status end;
  update public.operational_assignments
    set assigned_to = p_assignee_id,
        assigned_at = pg_catalog.now(),
        status = v_status,
        lock_version = lock_version + 1,
        updated_at = pg_catalog.now()
    where id = p_assignment_id;
  insert into public.operational_assignment_events(
    assignment_id, from_status, to_status, action, actor_id, assignee_id, note, idempotency_key)
  values (p_assignment_id, v_row.status, v_status, v_action, v_actor, p_assignee_id,
          nullif(pg_catalog.btrim(coalesce(p_note,'')),''), p_idempotency_key);
  perform private.notify_staff(p_assignee_id, 'staff_case_assigned',
    pg_catalog.jsonb_build_object('assignment_id', p_assignment_id),
    'assignment:'||p_assignment_id::text||':'||p_idempotency_key);
  perform private.record_staff_audit(v_actor, v_queue.capability_key, 'operational_case_'||v_action,
    'operational_assignment', p_assignment_id, 'Case ownership changed',
    pg_catalog.jsonb_build_object('assigneeId', p_assignee_id));
  return pg_catalog.jsonb_build_object('assignmentId', p_assignment_id, 'duplicate', false,
    'status', v_status, 'lockVersion', v_row.lock_version + 1);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_assign_support_case(p_case_id uuid, p_assignee uuid, p_note text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_ticket public.support_tickets%rowtype; v_target uuid;
begin
  v_actor := private.require_support_staff_write('manage_support_cases');
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid assignment' using errcode = '22023';
  end if;
  select * into v_ticket from public.support_tickets t where t.id = p_case_id for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'PT404'; end if;
  v_target := coalesce(p_assignee, v_actor);

  -- An assignee must actually be able to work the case; assignment can never
  -- grant access it does not already have.
  if not exists(select 1 from public.staff_role_grants g
                where g.user_id = v_target and g.revoked_at is null)
     or not ('manage_support_cases' = any(private.staff_capability_keys(v_target))) then
    raise exception 'The assignee cannot work support cases' using errcode = '42501';
  end if;

  if exists(select 1 from public.support_ticket_events e
            where e.ticket_id = p_case_id and e.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('caseId', p_case_id, 'assignedTo', v_ticket.assigned_to, 'duplicate', true);
  end if;

  update public.support_tickets set
    assigned_to = v_target,
    status = case when status = 'open' then 'in_progress' else status end,
    updated_at = pg_catalog.now()
  where id = p_case_id;

  insert into public.support_ticket_events(
    ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_case_id, v_ticket.status,
          case when v_ticket.status = 'open' then 'in_progress' else v_ticket.status end,
          'assigned', v_actor, 'staff',
          nullif(pg_catalog.btrim(coalesce(p_note,'')),''), p_idempotency_key);

  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'support_case_assigned',
    'support_case', p_case_id, 'Support case assigned');

  return pg_catalog.jsonb_build_object('caseId', p_case_id, 'assignedTo', v_target, 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_business_export_preview(p_export_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_actor uuid;
  v_request private.staff_export_requests%rowtype;
  v_rows jsonb;
  v_timezone text;
begin
  select * into v_request from private.staff_export_requests e where e.id=p_export_id for update;
  if v_request.id is null or v_request.report_key <> 'business_daily' then raise exception 'Export not found' using errcode='PT404'; end if;
  v_actor := private.require_staff_capability('export_operational_report');
  if v_request.requested_by <> v_actor then raise exception 'This export belongs to another staff member' using errcode='42501'; end if;
  if v_request.status <> 'approved' or v_request.expires_at <= pg_catalog.now() then
    update private.staff_export_requests set status='expired' where id=p_export_id and status='approved';
    raise exception 'This export is no longer available' using errcode='42501';
  end if;
  select c.display_timezone into v_timezone from private.staff_platform_configuration c where c.singleton;
  select coalesce(pg_catalog.jsonb_agg(row order by "date"), '[]'::jsonb) into v_rows from (
    select d.report_date as "date",
      (select pg_catalog.count(*) from public.profiles p where p.created_at >= d.start_at and p.created_at < d.end_at) accounts_created,
      (select pg_catalog.count(*) from public.customer_profiles c where c.created_at >= d.start_at and c.created_at < d.end_at) customers_registered,
      (select pg_catalog.count(*) from public.provider_profiles w where w.created_at >= d.start_at and w.created_at < d.end_at) workers_registered,
      (select pg_catalog.count(*) from public.marketplace_requests r where r.created_at >= d.start_at and r.created_at < d.end_at
        and (not (v_request.filters ? 'category') or r.category_id=v_request.filters->>'category')
        and (not (v_request.filters ? 'governorate') or r.approximate_governorate=v_request.filters->>'governorate')) requests_created,
      (select pg_catalog.count(*) from public.worker_quotes q join public.marketplace_requests r on r.id=q.request_id
        where q.submitted_at >= d.start_at and q.submitted_at < d.end_at
        and (not (v_request.filters ? 'category') or r.category_id=v_request.filters->>'category')
        and (not (v_request.filters ? 'governorate') or r.approximate_governorate=v_request.filters->>'governorate')) quotes_submitted,
      (select pg_catalog.count(*) from public.bookings b where b.created_at >= d.start_at and b.created_at < d.end_at) jobs_created,
      (select pg_catalog.count(distinct h.booking_id) from public.booking_status_history h where h.created_at >= d.start_at and h.created_at < d.end_at and h.status='completed') jobs_completed,
      (select pg_catalog.count(*) from public.support_tickets t where t.created_at >= d.start_at and t.created_at < d.end_at) support_cases_opened
    from (
      select g.value::date as report_date, g.value::timestamp at time zone v_timezone start_at,
        (g.value::date + 1)::timestamp at time zone v_timezone end_at
      from pg_catalog.generate_series(v_request.range_start,v_request.range_end,interval '1 day') as g(value)
      limit v_request.row_limit
    ) d
  ) row;
  update private.staff_export_requests set download_count=download_count+1,last_downloaded_at=pg_catalog.now() where id=p_export_id;
  perform private.staff_log_access(v_actor,'export_preview','export_operational_report','business_daily',pg_catalog.jsonb_array_length(v_rows));
  perform private.record_staff_audit(v_actor,'export_operational_report','export_downloaded','staff_export_request',p_export_id,v_request.reason,
    pg_catalog.jsonb_build_object('reportKey','business_daily','filters',v_request.filters));
  return pg_catalog.jsonb_build_object('exportId',p_export_id,'reportKey','business_daily',
    'columns',(select pg_catalog.to_jsonb(c.column_allowlist) from private.staff_export_catalog c where c.report_key='business_daily'),
    'rows',v_rows,'rowLimit',v_request.row_limit,'fileDeliveryAvailable',false,'filters',v_request.filters);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_export_preview(p_export_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_actor uuid; v_request private.staff_export_requests%rowtype;
  v_catalog private.staff_export_catalog%rowtype; v_rows jsonb; v_start timestamptz; v_end timestamptz;
begin
  select * into v_request from private.staff_export_requests e where e.id = p_export_id for update;
  if v_request.id is null then raise exception 'Export not found' using errcode = 'PT404'; end if;
  select * into v_catalog from private.staff_export_catalog c where c.report_key = v_request.report_key;
  -- Authorization is revalidated on every download, never trusted from the
  -- original request.
  v_actor := private.require_staff_capability(v_catalog.capability_key);
  if v_request.requested_by <> v_actor then
    raise exception 'This export belongs to another staff member' using errcode = '42501';
  end if;
  if v_request.status <> 'approved' or v_request.expires_at <= pg_catalog.now() then
    update private.staff_export_requests set status = 'expired' where id = p_export_id and status = 'approved';
    raise exception 'This export is no longer available' using errcode = '42501';
  end if;
  v_start := v_request.range_start::timestamptz;
  v_end := (v_request.range_end + 1)::timestamptz;

  if v_request.report_key = 'queue_throughput' then
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_rows from (
      select pg_catalog.jsonb_build_object('queueKey', a.queue_key,
        'opened', pg_catalog.count(*),
        'resolved', pg_catalog.count(*) filter (where a.resolved_at is not null),
        'closed', pg_catalog.count(*) filter (where a.closed_at is not null),
        'medianHours', pg_catalog.round(pg_catalog.percentile_cont(0.5) within group (
          order by pg_catalog.date_part('epoch', coalesce(a.resolved_at, pg_catalog.now()) - a.created_at))::numeric / 3600, 2)) item
      from public.operational_assignments a
      where a.created_at >= v_start and a.created_at < v_end
      group by a.queue_key limit v_request.row_limit) rows;
  elsif v_request.report_key = 'dispute_outcomes' then
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_rows from (
      select pg_catalog.jsonb_build_object('disputeId', d.id, 'reason', d.reason,
        'resolutionType', d.resolution_type, 'openedAt', d.created_at, 'resolvedAt', d.resolved_at) item
      from public.disputes d where d.created_at >= v_start and d.created_at < v_end
      order by d.created_at limit v_request.row_limit) rows;
  elsif v_request.report_key = 'verification_decisions' then
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_rows from (
      select pg_catalog.jsonb_build_object('verificationId', v.id, 'status', v.status,
        'submittedAt', v.submitted_at, 'reviewedAt', v.reviewed_at) item
      from public.provider_verifications v
      where v.submitted_at >= v_start and v.submitted_at < v_end
      order by v.submitted_at limit v_request.row_limit) rows;
  elsif v_request.report_key = 'reconciliation_exceptions' then
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_rows from (
      select pg_catalog.jsonb_build_object('exceptionId', e.id, 'exceptionType', e.exception_type,
        'severity', e.severity, 'status', e.status, 'createdAt', e.created_at) item
      from private.reconciliation_exceptions e
      where e.created_at >= v_start and e.created_at < v_end
      order by e.created_at limit v_request.row_limit) rows;
  else
    select coalesce(pg_catalog.jsonb_agg(item), '[]'::jsonb) into v_rows from (
      select pg_catalog.jsonb_build_object('day', d.day,
        'requestsCreated', pg_catalog.count(r.id),
        'requestsWithQuotes', pg_catalog.count(r.id) filter (
          where exists (select 1 from public.worker_quotes wq where wq.request_id = r.id)),
        'requestsExpired', pg_catalog.count(r.id) filter (where r.status = 'expired'),
        'noProviderOutcomes', pg_catalog.count(r.id) filter (
          where not exists (select 1 from public.quote_invitations i where i.request_id = r.id))) item
      from pg_catalog.generate_series(v_request.range_start, v_request.range_end, '1 day'::interval) d(day)
      left join public.marketplace_requests r
        on r.created_at >= d.day::timestamptz and r.created_at < (d.day + interval '1 day')
      group by d.day order by d.day limit v_request.row_limit) rows;
  end if;

  update private.staff_export_requests
    set download_count = download_count + 1, last_downloaded_at = pg_catalog.now()
    where id = p_export_id;
  perform private.staff_log_access(v_actor, 'export_preview', v_catalog.capability_key,
    v_request.report_key, pg_catalog.jsonb_array_length(coalesce(v_rows,'[]'::jsonb)));
  perform private.record_staff_audit(v_actor, v_catalog.capability_key, 'export_downloaded',
    'staff_export_request', p_export_id, v_request.reason,
    pg_catalog.jsonb_build_object('reportKey', v_request.report_key));
  return pg_catalog.jsonb_build_object(
    'exportId', p_export_id, 'reportKey', v_request.report_key,
    'columns', pg_catalog.to_jsonb(v_catalog.column_allowlist),
    'rows', coalesce(v_rows,'[]'::jsonb),
    'rowLimit', v_request.row_limit,
    'fileDeliveryAvailable', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_merge_support_cases(p_source_case_id uuid, p_target_case_id uuid, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_source public.support_tickets%rowtype; v_target public.support_tickets%rowtype;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
begin
  v_actor := private.require_support_staff_write('manage_support_cases');
  if p_source_case_id = p_target_case_id then
    raise exception 'A support case cannot be merged into itself' using errcode = '22023';
  end if;
  if v_reason is null or pg_catalog.length(v_reason) > 1000
     or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'A merge reason is required' using errcode = '22023';
  end if;

  select * into v_source from public.support_tickets t where t.id = p_source_case_id for update;
  select * into v_target from public.support_tickets t where t.id = p_target_case_id for update;
  if v_source.id is null or v_target.id is null then
    raise exception 'Support case not found' using errcode = 'PT404';
  end if;
  if v_source.requester_id <> v_target.requester_id then
    raise exception 'Only cases from the same requester can be merged' using errcode = '22023';
  end if;
  if v_source.merged_into_id is not null then
    return pg_catalog.jsonb_build_object('sourceCaseId', p_source_case_id,
      'targetCaseId', v_source.merged_into_id, 'duplicate', true);
  end if;
  if v_target.merged_into_id is not null then
    raise exception 'The target case is itself merged' using errcode = '22023';
  end if;

  update public.support_tickets set
    merged_into_id = p_target_case_id, status = 'closed', closed_at = pg_catalog.now(),
    resolution_reason = 'duplicate', updated_at = pg_catalog.now()
  where id = p_source_case_id;

  insert into public.support_ticket_events(
    ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_source_case_id, v_source.status, 'closed', 'closed', v_actor, 'staff',
          'Merged: ' || v_reason, p_idempotency_key);
  insert into public.support_ticket_events(
    ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_target_case_id, v_target.status, v_target.status, 'note_added', v_actor, 'staff',
          'Merged in case ' || p_source_case_id::text, p_idempotency_key || ':target');

  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'support_case_merged',
    'support_case', p_source_case_id, 'Merged into ' || p_target_case_id::text);

  return pg_catalog.jsonb_build_object('sourceCaseId', p_source_case_id,
    'targetCaseId', p_target_case_id, 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_record_access_review(p_grant_id uuid, p_decision text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_grant public.staff_role_grants%rowtype; v_id uuid;
begin
  v_actor := private.require_staff_capability('manage_staff_roles');
  select * into v_grant from public.staff_role_grants g where g.id = p_grant_id;
  if v_grant.id is null then raise exception 'Role grant not found' using errcode = 'PT404'; end if;
  if p_decision not in ('retained','revoked','reduced') then
    raise exception 'Invalid review decision' using errcode = '22023';
  end if;
  if v_grant.user_id = v_actor then
    raise exception 'A staff member cannot review their own access' using errcode = '42501';
  end if;
  insert into private.staff_access_reviews(grant_id, reviewed_by, decision, note)
  values (p_grant_id, v_actor, p_decision, pg_catalog.btrim(p_note))
  returning id into v_id;
  perform private.record_staff_audit(v_actor, 'manage_staff_roles', 'staff_access_reviewed',
    'staff_role_grant', p_grant_id, pg_catalog.btrim(p_note),
    pg_catalog.jsonb_build_object('decision', p_decision));
  return pg_catalog.jsonb_build_object('id', v_id, 'decision', p_decision);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_resolve_support_case(p_case_id uuid, p_resolution_reason text, p_note text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_ticket public.support_tickets%rowtype;
  v_reason private.support_resolution_reasons%rowtype;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note,'')),'');
begin
  v_actor := private.require_support_staff_write('manage_support_cases');
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid resolution' using errcode = '22023';
  end if;
  select * into v_reason from private.support_resolution_reasons r
  where r.reason_key = p_resolution_reason and r.active;
  if v_reason.reason_key is null then
    raise exception 'Invalid resolution reason' using errcode = '22023';
  end if;
  if v_reason.requires_note and v_note is null then
    raise exception 'This resolution reason requires a note' using errcode = '22023';
  end if;

  select * into v_ticket from public.support_tickets t where t.id = p_case_id for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'PT404'; end if;
  if exists(select 1 from public.support_ticket_events e
            where e.ticket_id = p_case_id and e.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', v_ticket.status, 'duplicate', true);
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'This support case is closed' using errcode = '22023';
  end if;

  update public.support_tickets set
    status = 'resolved', resolution_reason = p_resolution_reason,
    resolved_at = pg_catalog.now(), assigned_to = coalesce(assigned_to, v_actor),
    updated_at = pg_catalog.now()
  where id = p_case_id;

  insert into public.support_ticket_events(
    ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_case_id, v_ticket.status, 'resolved', 'resolved', v_actor, 'staff',
          coalesce(v_note, v_reason.label_en), p_idempotency_key);

  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'support_case_resolved',
    'support_case', p_case_id, 'Resolved: ' || p_resolution_reason);

  return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', 'resolved', 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_revoke_role(p_grant_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_grant public.staff_role_grants%rowtype;
begin
  v_actor := private.require_staff_capability('manage_staff_roles');
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select * into v_grant from public.staff_role_grants g where g.id = p_grant_id for update;
  if v_grant.id is null then raise exception 'Role grant not found' using errcode = 'PT404'; end if;
  if v_grant.revoked_at is not null then
    return pg_catalog.jsonb_build_object('id', p_grant_id, 'duplicate', true);
  end if;
  update public.staff_role_grants
    set revoked_at = pg_catalog.now(), revoked_by = v_actor
    where id = p_grant_id;
  -- Revoking a role also clears the account's session attestations so an
  -- in-flight session cannot keep using a re-authentication it no longer earns.
  update private.staff_session_attestations
    set revoked_at = pg_catalog.now()
    where user_id = v_grant.user_id and revoked_at is null;
  perform private.record_staff_audit(v_actor, 'manage_staff_roles', 'staff_role_revoked',
    'staff_role_grant', p_grant_id, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('roleKey', v_grant.role_key, 'subjectId', v_grant.user_id));
  return pg_catalog.jsonb_build_object('id', p_grant_id, 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_rollback_configuration(p_domain_key text, p_environment text, p_target_version integer, p_change_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_domain private.staff_configuration_domains%rowtype;
  v_target private.staff_configuration_versions%rowtype; v_version integer; v_id uuid;
begin
  select * into v_domain from private.staff_configuration_domains d where d.domain_key = p_domain_key;
  if v_domain.domain_key is null then raise exception 'Unknown configuration domain' using errcode = '22023'; end if;
  v_actor := private.require_staff_capability(v_domain.capability_key);
  select * into v_target from private.staff_configuration_versions v
  where v.domain_key = p_domain_key and v.environment = p_environment and v.version = p_target_version;
  if v_target.id is null then raise exception 'Target version not found' using errcode = 'PT404'; end if;
  select coalesce(pg_catalog.max(v.version),0) + 1 into v_version
  from private.staff_configuration_versions v
  where v.domain_key = p_domain_key and v.environment = p_environment;
  insert into private.staff_configuration_versions(
    domain_key, environment, version, payload, status, change_reason, created_by, rolled_back_from)
  values (p_domain_key, p_environment, v_version, v_target.payload, 'pending_approval',
          pg_catalog.btrim(p_change_reason), v_actor, p_target_version)
  returning id into v_id;
  perform private.record_staff_audit(v_actor, v_domain.capability_key, 'configuration_rollback_prepared',
    'staff_configuration_version', v_id, pg_catalog.btrim(p_change_reason),
    pg_catalog.jsonb_build_object('domainKey', p_domain_key, 'rolledBackFrom', p_target_version));
  return pg_catalog.jsonb_build_object('id', v_id, 'version', v_version, 'status', 'pending_approval');
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_set_campaign_state(p_campaign_id uuid, p_state text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid; v_row public.growth_campaigns%rowtype;
begin
  v_uid := private.require_staff_capability('manage_growth_campaigns');
  if p_state not in ('paused','active','cancelled','expired') then
    raise exception 'Unsupported campaign state' using errcode = '22023';
  end if;
  select * into v_row from public.growth_campaigns c where c.id = p_campaign_id for update;
  if v_row.id is null then
    raise exception 'Campaign not found' using errcode = 'PT404';
  end if;
  if v_row.status = 'draft' then
    raise exception 'A draft campaign must be activated first' using errcode = '22023';
  end if;
  if v_row.status in ('cancelled','expired') then
    raise exception 'This campaign is already final' using errcode = '22023';
  end if;
  -- Resuming is only ever a return to the approved window, never an extension.
  if p_state = 'active' and v_row.status <> 'paused' then
    raise exception 'Only a paused campaign can resume' using errcode = '22023';
  end if;

  update public.growth_campaigns
    set status = p_state,
        paused_at = case when p_state = 'paused' then pg_catalog.now() else paused_at end,
        cancelled_at = case when p_state = 'cancelled' then pg_catalog.now() else cancelled_at end
    where id = p_campaign_id;

  perform private.record_staff_audit(v_uid, 'manage_growth_campaigns', 'campaign_' || p_state,
    'growth_campaign', p_campaign_id, coalesce(nullif(pg_catalog.btrim(p_reason),''), 'State change'),
    pg_catalog.jsonb_build_object('campaignKey', v_row.campaign_key, 'state', p_state));
  return pg_catalog.jsonb_build_object('id', p_campaign_id, 'status', p_state);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_set_help_article_status(p_slug text, p_status text, p_change_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_article public.help_articles%rowtype;
begin
  v_actor := private.require_support_staff_write('manage_support_cases');
  if p_status not in ('draft','published','archived') then
    raise exception 'Invalid article status' using errcode = '22023';
  end if;
  select * into v_article from public.help_articles a where a.slug = p_slug for update;
  if v_article.id is null then raise exception 'Help article not found' using errcode = 'PT404'; end if;
  -- An article cannot be published in a language nobody wrote.
  if p_status = 'published' and not exists(
    select 1 from public.help_article_translations tr where tr.article_id = v_article.id and tr.locale = 'en') then
    raise exception 'An English translation is required before publishing' using errcode = '22023';
  end if;

  update public.help_articles set
    status = p_status,
    published_at = case when p_status = 'published' then coalesce(published_at, pg_catalog.now()) else published_at end,
    archived_at = case when p_status = 'archived' then pg_catalog.now() else archived_at end,
    updated_by = v_actor, updated_at = pg_catalog.now()
  where id = v_article.id;

  insert into public.help_article_versions(
    article_id, version, locale, status, title, summary, body, changed_by, change_note)
  select v_article.id, v_article.version, tr.locale, p_status, tr.title, tr.summary, tr.body,
         v_actor, nullif(pg_catalog.btrim(coalesce(p_change_note,'')),'')
  from public.help_article_translations tr where tr.article_id = v_article.id
  on conflict (article_id, version, locale) do nothing;

  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'help_article_' || p_status,
    'support_case', v_article.id, 'Help article ' || p_slug || ' set to ' || p_status);

  return pg_catalog.jsonb_build_object('slug', p_slug, 'status', p_status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_set_referral_program_state(p_program_id uuid, p_state text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid; v_row public.referral_programs%rowtype;
begin
  v_uid := private.require_staff_capability('manage_referral_programs');
  if p_state not in ('paused','active','cancelled','expired') then
    raise exception 'Unsupported program state' using errcode = '22023';
  end if;
  select * into v_row from public.referral_programs p where p.id = p_program_id for update;
  if v_row.id is null then
    raise exception 'Referral program not found' using errcode = 'PT404';
  end if;
  if v_row.status = 'draft' then
    raise exception 'A draft program must be activated first' using errcode = '22023';
  end if;
  if v_row.status in ('cancelled','expired') then
    raise exception 'This program is already final' using errcode = '22023';
  end if;
  if p_state = 'active' and v_row.status <> 'paused' then
    raise exception 'Only a paused program can resume' using errcode = '22023';
  end if;

  update public.referral_programs
    set status = p_state,
        paused_at = case when p_state = 'paused' then pg_catalog.now() else paused_at end,
        cancelled_at = case when p_state = 'cancelled' then pg_catalog.now() else cancelled_at end
    where id = p_program_id;

  perform private.record_staff_audit(v_uid, 'manage_referral_programs',
    'referral_program_' || p_state, 'referral_program', p_program_id,
    coalesce(nullif(pg_catalog.btrim(p_reason),''), 'State change'),
    pg_catalog.jsonb_build_object('programKey', v_row.program_key, 'state', p_state));
  return pg_catalog.jsonb_build_object('id', p_program_id, 'status', p_state);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_submit_configuration(p_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_row private.staff_configuration_versions%rowtype; v_domain private.staff_configuration_domains%rowtype;
begin
  select * into v_row from private.staff_configuration_versions v where v.id = p_version_id for update;
  if v_row.id is null then raise exception 'Configuration version not found' using errcode = 'PT404'; end if;
  select * into v_domain from private.staff_configuration_domains d where d.domain_key = v_row.domain_key;
  v_actor := private.require_staff_capability(v_domain.capability_key);
  if v_row.status <> 'draft' then
    raise exception 'Only a draft can be submitted' using errcode = '22023';
  end if;
  update private.staff_configuration_versions set status = 'pending_approval' where id = p_version_id;
  -- Everyone who can approve is told there is something waiting.
  perform private.notify_staff(g.user_id, 'staff_configuration_awaiting_approval',
    pg_catalog.jsonb_build_object('case_id', p_version_id),
    'configuration:'||p_version_id::text)
  from (select distinct rc_g.user_id from public.staff_role_grants rc_g
        join public.staff_role_capabilities rc on rc.role_key = rc_g.role_key
        where rc.capability_key = 'approve_configuration' and rc_g.revoked_at is null) g;
  perform private.record_staff_audit(v_actor, v_domain.capability_key, 'configuration_submitted',
    'staff_configuration_version', p_version_id, v_row.change_reason,
    pg_catalog.jsonb_build_object('domainKey', v_row.domain_key));
  return pg_catalog.jsonb_build_object('id', p_version_id, 'status', 'pending_approval');
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_transition_case(p_assignment_id uuid, p_status text, p_expected_version integer, p_note text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_actor uuid; v_row public.operational_assignments%rowtype; v_queue public.staff_queues%rowtype;
  v_event uuid; v_action text;
begin
  select * into v_row from public.operational_assignments a where a.id = p_assignment_id for update;
  if v_row.id is null then raise exception 'Case not found' using errcode = 'PT404'; end if;
  select * into v_queue from public.staff_queues q where q.queue_key = v_row.queue_key;
  v_actor := private.require_staff_capability(v_queue.capability_key);
  if p_status not in ('assigned','in_progress','waiting_participant','waiting_provider',
                      'escalated','resolved','closed') then
    raise exception 'Invalid case status' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid transition' using errcode = '22023';
  end if;
  select e.id into v_event from public.operational_assignment_events e
  where e.assignment_id = p_assignment_id and e.idempotency_key = p_idempotency_key;
  if v_event is not null then
    return pg_catalog.jsonb_build_object('assignmentId', p_assignment_id, 'duplicate', true,
      'status', v_row.status, 'lockVersion', v_row.lock_version);
  end if;
  if p_expected_version is null or p_expected_version <> v_row.lock_version then
    raise exception 'This case changed since you opened it' using errcode = '40001';
  end if;
  if v_row.status = 'closed' then
    raise exception 'A closed case cannot change' using errcode = '22023';
  end if;
  if p_status <> 'closed' and v_row.assigned_to is null then
    raise exception 'Assign the case before moving it' using errcode = '22023';
  end if;
  v_action := case p_status when 'escalated' then 'escalated' when 'resolved' then 'resolved'
    when 'closed' then 'closed' else 'status_changed' end;
  update public.operational_assignments
    set status = p_status,
        escalated_at = case when p_status = 'escalated' then pg_catalog.now() else escalated_at end,
        resolved_at = case when p_status = 'resolved' then pg_catalog.now() else resolved_at end,
        closed_at = case when p_status = 'closed' then pg_catalog.now() else closed_at end,
        lock_version = lock_version + 1,
        updated_at = pg_catalog.now()
    where id = p_assignment_id;
  insert into public.operational_assignment_events(
    assignment_id, from_status, to_status, action, actor_id, assignee_id, note, idempotency_key)
  values (p_assignment_id, v_row.status, p_status, v_action, v_actor, v_row.assigned_to,
          nullif(pg_catalog.btrim(coalesce(p_note,'')),''), p_idempotency_key);
  if p_status = 'escalated' then
    perform private.notify_staff(v_row.assigned_to, 'staff_case_escalated',
      pg_catalog.jsonb_build_object('assignment_id', p_assignment_id),
      'escalation:'||p_assignment_id::text||':'||p_idempotency_key);
  end if;
  perform private.record_staff_audit(v_actor, v_queue.capability_key, 'operational_case_'||v_action,
    'operational_assignment', p_assignment_id,
    coalesce(nullif(pg_catalog.btrim(coalesce(p_note,'')),''),'Case status changed'),
    pg_catalog.jsonb_build_object('toStatus', p_status));
  return pg_catalog.jsonb_build_object('assignmentId', p_assignment_id, 'duplicate', false,
    'status', p_status, 'lockVersion', v_row.lock_version + 1);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_transition_support_case(p_case_id uuid, p_status text, p_priority text, p_note text, p_idempotency_key text, p_escalated_to_type text DEFAULT NULL::text, p_escalated_to_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_ticket public.support_tickets%rowtype;
begin
  v_actor := private.require_staff_capability('manage_support_cases');
  select * into v_ticket from public.support_tickets t where t.id = p_case_id for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'PT404'; end if;
  if p_status not in ('open','in_progress','waiting_participant','escalated','resolved','closed') then
    raise exception 'Invalid support status' using errcode = '22023';
  end if;
  if coalesce(p_priority, v_ticket.priority) not in ('urgent','high','normal','low') then
    raise exception 'Invalid priority' using errcode = '22023';
  end if;
  if pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid transition' using errcode = '22023';
  end if;
  -- Escalation points at the authoritative domain record; WPS-017 never opens
  -- a dispute or an abuse report on the participant's behalf.
  if p_status = 'escalated' and (p_escalated_to_type is null or p_escalated_to_id is null) then
    raise exception 'Escalation must reference the authoritative record' using errcode = '22023';
  end if;
  if exists (select 1 from public.support_ticket_events e
             where e.ticket_id = p_case_id and e.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', v_ticket.status, 'duplicate', true);
  end if;
  update public.support_tickets
    set status = p_status,
        priority = coalesce(p_priority, priority),
        assigned_to = coalesce(assigned_to, v_actor),
        escalated_to_type = coalesce(p_escalated_to_type, escalated_to_type),
        escalated_to_id = coalesce(p_escalated_to_id, escalated_to_id),
        closed_at = case when p_status = 'closed' then pg_catalog.now() else closed_at end,
        updated_at = pg_catalog.now()
    where id = p_case_id;
  insert into public.support_ticket_events(ticket_id, from_status, to_status, action, actor_id, actor_role, note, idempotency_key)
  values (p_case_id, v_ticket.status, p_status,
          case p_status when 'escalated' then 'escalated' when 'resolved' then 'resolved'
            when 'closed' then 'closed' else 'status_changed' end,
          v_actor, 'staff', nullif(pg_catalog.btrim(coalesce(p_note,'')),''), p_idempotency_key);
  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'support_case_'||p_status,
    'support_case', p_case_id, coalesce(nullif(pg_catalog.btrim(coalesce(p_note,'')),''),'Support case updated'));
  return pg_catalog.jsonb_build_object('caseId', p_case_id, 'status', p_status, 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_update_incident(p_incident_id uuid, p_event_type text, p_detail text, p_idempotency_key text, p_status text DEFAULT NULL::text, p_severity text DEFAULT NULL::text, p_public_summary text DEFAULT NULL::text, p_postmortem_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_row public.operational_incidents%rowtype;
begin
  v_actor := private.require_staff_capability('manage_incidents');
  select * into v_row from public.operational_incidents i where i.id = p_incident_id for update;
  if v_row.id is null then raise exception 'Incident not found' using errcode = 'PT404'; end if;
  if p_event_type not in ('update','mitigation','severity_changed','commander_changed',
                          'status_changed','resolved','closed','postmortem') then
    raise exception 'Invalid incident event' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('open','mitigating','monitoring','resolved','closed') then
    raise exception 'Invalid incident status' using errcode = '22023';
  end if;
  if exists (select 1 from public.operational_incident_events e
             where e.incident_id = p_incident_id and e.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('incidentId', p_incident_id, 'duplicate', true);
  end if;
  update public.operational_incidents
    set status = coalesce(p_status, status),
        severity = coalesce(p_severity, severity),
        public_summary = coalesce(nullif(pg_catalog.btrim(coalesce(p_public_summary,'')),''), public_summary),
        postmortem_reference = coalesce(p_postmortem_reference, postmortem_reference),
        resolved_at = case when coalesce(p_status, status) in ('resolved','closed')
                           then coalesce(resolved_at, pg_catalog.now()) else resolved_at end,
        updated_at = pg_catalog.now()
    where id = p_incident_id;
  insert into public.operational_incident_events(incident_id, event_type, actor_id, detail, idempotency_key)
  values (p_incident_id, p_event_type, v_actor, pg_catalog.btrim(p_detail), p_idempotency_key);
  perform private.record_staff_audit(v_actor, 'manage_incidents', 'incident_'||p_event_type,
    'operational_incident', p_incident_id, pg_catalog.btrim(p_detail));
  return pg_catalog.jsonb_build_object('incidentId', p_incident_id, 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.staff_upsert_help_article(p_slug text, p_category_key text, p_locale text, p_title text, p_summary text, p_body text, p_tags text[], p_surfaces text[], p_related_slugs text[], p_audience text, p_change_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_actor uuid; v_article public.help_articles%rowtype; v_locale text := private.help_locale(p_locale);
  v_new_version integer;
begin
  v_actor := private.require_support_staff_write('manage_support_cases');
  if p_slug !~ '^[a-z][a-z0-9-]{2,80}$' then
    raise exception 'Invalid article slug' using errcode = '22023';
  end if;
  if not exists(select 1 from public.help_categories c where c.category_key = p_category_key) then
    raise exception 'Help category not found' using errcode = 'PT404';
  end if;
  if coalesce(p_audience,'all') not in ('customer','worker','all') then
    raise exception 'Invalid audience' using errcode = '22023';
  end if;

  select * into v_article from public.help_articles a where a.slug = p_slug for update;
  if v_article.id is null then
    insert into public.help_articles(
      slug, category_key, status, audience, surfaces, tags, related_slugs, created_by, updated_by)
    values (p_slug, p_category_key, 'draft', coalesce(p_audience,'all'),
            coalesce(p_surfaces,'{}'), coalesce(p_tags,'{}'), coalesce(p_related_slugs,'{}'),
            v_actor, v_actor)
    returning * into v_article;
    v_new_version := v_article.version;
  else
    v_new_version := v_article.version + 1;
    update public.help_articles set
      category_key = p_category_key, audience = coalesce(p_audience, audience),
      surfaces = coalesce(p_surfaces, surfaces), tags = coalesce(p_tags, tags),
      related_slugs = coalesce(p_related_slugs, related_slugs),
      version = v_new_version, updated_by = v_actor, updated_at = pg_catalog.now()
    where id = v_article.id
    returning * into v_article;
  end if;

  insert into public.help_article_translations(article_id, locale, title, summary, body, updated_at)
  values (v_article.id, v_locale, pg_catalog.btrim(p_title), pg_catalog.btrim(p_summary),
          pg_catalog.btrim(p_body), pg_catalog.now())
  on conflict (article_id, locale) do update set
    title = excluded.title, summary = excluded.summary, body = excluded.body,
    updated_at = pg_catalog.now();

  insert into public.help_article_versions(
    article_id, version, locale, status, title, summary, body, changed_by, change_note)
  values (v_article.id, v_new_version, v_locale, v_article.status,
          pg_catalog.btrim(p_title), pg_catalog.btrim(p_summary), pg_catalog.btrim(p_body),
          v_actor, nullif(pg_catalog.btrim(coalesce(p_change_note,'')),''))
  on conflict (article_id, version, locale) do nothing;

  perform private.record_staff_audit(v_actor, 'manage_support_cases', 'help_article_saved',
    'support_case', v_article.id, 'Saved help article ' || p_slug);

  return pg_catalog.jsonb_build_object('slug', p_slug, 'version', v_new_version,
    'status', v_article.status, 'locale', v_locale);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_help_article_feedback(p_slug text, p_helpful boolean, p_locale text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_article public.help_articles%rowtype;
  v_existing boolean; v_locale text := private.help_locale(p_locale);
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_helpful is null then raise exception 'Feedback is required' using errcode = '22023'; end if;
  perform private.enforce_rate_limit('support_article_feedback');
  select * into v_article from public.help_articles a where a.slug = p_slug and a.status = 'published';
  if v_article.id is null then raise exception 'Help article not found' using errcode = 'PT404'; end if;

  select f.helpful into v_existing from public.help_article_feedback f
  where f.article_id = v_article.id and f.user_id = v_uid;
  if v_existing is not null and v_existing = p_helpful then
    return pg_catalog.jsonb_build_object('slug', p_slug, 'helpful', p_helpful, 'duplicate', true);
  end if;

  insert into public.help_article_feedback(article_id, user_id, locale, helpful)
  values (v_article.id, v_uid, v_locale, p_helpful)
  on conflict (article_id, user_id) do update set helpful = excluded.helpful, created_at = pg_catalog.now();

  update public.help_articles set
    helpful_count = (select pg_catalog.count(*)::integer from public.help_article_feedback f
                     where f.article_id = v_article.id and f.helpful),
    not_helpful_count = (select pg_catalog.count(*)::integer from public.help_article_feedback f
                         where f.article_id = v_article.id and not f.helpful),
    updated_at = pg_catalog.now()
  where id = v_article.id;

  return pg_catalog.jsonb_build_object('slug', p_slug, 'helpful', p_helpful, 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_support_satisfaction(p_case_id uuid, p_score smallint, p_comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_ticket public.support_tickets%rowtype;
  v_comment text := nullif(pg_catalog.btrim(coalesce(p_comment,'')),'');
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_score is null or p_score not between 1 and 5 then
    raise exception 'A satisfaction score between 1 and 5 is required' using errcode = '22023';
  end if;
  if v_comment is not null and pg_catalog.length(v_comment) > 1000 then
    raise exception 'Comment is too long' using errcode = '22023';
  end if;
  select * into v_ticket from public.support_tickets t
  where t.id = p_case_id and t.requester_id = v_uid for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'PT404'; end if;
  if v_ticket.status not in ('resolved','closed') then
    raise exception 'The survey opens when the case is resolved' using errcode = '22023';
  end if;
  if v_ticket.satisfaction_submitted_at is not null then
    return pg_catalog.jsonb_build_object('caseId', p_case_id,
      'score', v_ticket.satisfaction_score, 'duplicate', true);
  end if;
  update public.support_tickets set
    satisfaction_score = p_score, satisfaction_comment = v_comment,
    satisfaction_submitted_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = p_case_id;
  return pg_catalog.jsonb_build_object('caseId', p_case_id, 'score', p_score, 'duplicate', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_worker_quote(p_invitation_id uuid, p_quote jsonb, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; invitation public.quote_invitations;
  request_row public.marketplace_requests; terms jsonb; quote_id uuid; existing_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_idempotency_key is null or pg_catalog.length(p_idempotency_key) not between 16 and 200 then raise exception 'Invalid quote request' using errcode='22023'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select q.id into existing_id from public.worker_quotes q where q.provider_id=provider_id and q.idempotency_key=p_idempotency_key;
  if existing_id is not null then return existing_id; end if;
  select * into invitation from public.quote_invitations i where i.id=p_invitation_id and i.provider_id=provider_id for update;
  if invitation.id is null then raise exception 'Invitation not found' using errcode='PT404'; end if;
  select * into request_row from public.marketplace_requests where id=invitation.request_id for update;
  if request_row.flow_kind='emergency' or invitation.status not in ('invited','viewed')
    or request_row.status not in ('matching','collecting_quotes','customer_reviewing','rescue_matching')
    or request_row.expires_at<=pg_catalog.now() or invitation.expires_at<=pg_catalog.now()
    or not private.is_provider_publicly_discoverable(provider_id)
  then raise exception 'Invitation is no longer actionable' using errcode='22023'; end if;
  terms := private.validate_worker_quote(provider_id,request_row.id,p_quote);
  insert into public.worker_quotes(
    request_id,invitation_id,provider_id,status,current_revision,price_minor,proposed_start_at,eta_minutes,
    estimated_duration_minutes,message,labor_included,materials_inclusion,materials_explanation,warranty_days,
    supported_payment_methods,expires_at,idempotency_key
  ) values (
    request_row.id,p_invitation_id,provider_id,'submitted',1,(terms->>'priceMinor')::bigint,
    nullif(terms->>'proposedStartAt','')::timestamptz,nullif(terms->>'etaMinutes','')::integer,
    (terms->>'estimatedDurationMinutes')::integer,terms->>'message',(terms->>'laborIncluded')::boolean,
    terms->>'materialsInclusion',terms->>'materialsExplanation',nullif(terms->>'warrantyDays','')::integer,
    array(select jsonb_array_elements_text(terms->'supportedPaymentMethods')),request_row.expires_at,p_idempotency_key
  ) returning id into quote_id;
  insert into public.worker_quote_revisions(quote_id,revision,terms,actor_id,idempotency_key)
  values(quote_id,1,terms,uid,p_idempotency_key||':revision');
  update public.quote_invitations set status='quoted',responded_at=pg_catalog.now() where id=p_invitation_id;
  update public.marketplace_requests set status=case when pg_catalog.now()>=collection_not_before then 'customer_reviewing' else status end where id=request_row.id;
  perform private.marketplace_notify(request_row.customer_id,'quote_received','New quote','A worker sent a quote.',
    pg_catalog.jsonb_build_object('requestId',request_row.id,'quoteId',quote_id),'quote-received:'||quote_id::text);
  perform private.marketplace_record_event('worker',uid,'quote',quote_id,'quote_submitted','{}',p_idempotency_key||':submitted');
  return quote_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.view_quote_invitation(p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; invitation public.quote_invitations;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select * into invitation from public.quote_invitations i where i.id=p_invitation_id and i.provider_id=provider_id for update;
  if invitation.id is null then raise exception 'Invitation not found' using errcode='PT404'; end if;
  if invitation.status='invited' then
    update public.quote_invitations set status='viewed',viewed_at=pg_catalog.now() where id=p_invitation_id;
    update private.emergency_dispatch_attempts set state='viewed' where invitation_id=p_invitation_id and state='invited';
    perform private.marketplace_record_event('worker',uid,'invitation',p_invitation_id,'invitation_viewed','{}','invitation-viewed:'||p_invitation_id::text);
  end if;
  return pg_catalog.jsonb_build_object('id',invitation.id,'status',case when invitation.status='invited' then 'viewed' else invitation.status end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_worker_quote(p_quote_id uuid, p_reason text, p_idempotency_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; quote_row public.worker_quotes;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select * into quote_row from public.worker_quotes q where q.id=p_quote_id and q.provider_id=provider_id for update;
  if quote_row.id is null then raise exception 'Quote not found' using errcode='PT404'; end if;
  if quote_row.status='withdrawn' then return; end if;
  if quote_row.status not in ('submitted','revised') then raise exception 'Quote can no longer be withdrawn' using errcode='22023'; end if;
  update public.worker_quotes set status='withdrawn',withdrawn_at=pg_catalog.now() where id=p_quote_id;
  update public.quote_invitations set status='withdrawn',responded_at=pg_catalog.now(),outcome_reason=pg_catalog.left(coalesce(p_reason,'other'),120) where id=quote_row.invitation_id;
  perform private.marketplace_record_event('worker',uid,'quote',p_quote_id,'quote_withdrawn',
    pg_catalog.jsonb_build_object('reason',pg_catalog.left(coalesce(p_reason,'other'),120)),p_idempotency_key||':withdrawn');
end;
$function$;
