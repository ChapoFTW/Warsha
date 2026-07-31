-- WPS-008 guarded APIs, matching, lifecycle timers, and recovery paths.

insert into private.worker_matching_locations(provider_id, latitude, longitude, source, verification_state)
select distinct on (a.provider_id)
  a.provider_id, a.latitude, a.longitude, 'verified_service_area', 'verified'
from public.provider_service_areas a
where a.latitude between -90 and 90 and a.longitude between -180 and 180
order by a.provider_id, a.created_at desc
on conflict(provider_id) do update
set latitude=excluded.latitude, longitude=excluded.longitude,
    source=excluded.source, verification_state=excluded.verification_state,
    updated_at=pg_catalog.now();

create or replace function private.marketplace_distance_km(
  p_from_latitude double precision,
  p_from_longitude double precision,
  p_to_latitude double precision,
  p_to_longitude double precision
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from_latitude is null or p_from_longitude is null
      or p_to_latitude is null or p_to_longitude is null
      or p_from_latitude not between -90 and 90 or p_to_latitude not between -90 and 90
      or p_from_longitude not between -180 and 180 or p_to_longitude not between -180 and 180
    then null
    else pg_catalog.round((6371 * 2 * pg_catalog.asin(pg_catalog.sqrt(
      least(1::double precision, greatest(0::double precision,
        pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p_to_latitude-p_from_latitude)/2),2)
        + pg_catalog.cos(pg_catalog.radians(p_from_latitude))
          * pg_catalog.cos(pg_catalog.radians(p_to_latitude))
          * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p_to_longitude-p_from_longitude)/2),2)
      ))
    )))::numeric, 3)
  end
$$;

-- Declared before lifecycle functions so PostgreSQL can validate static calls.
create or replace function private.marketplace_record_event(
  p_actor_class text,p_actor_id uuid,p_entity_type text,p_entity_id uuid,
  p_event_type text,p_metadata jsonb,p_dedupe_key text
)
returns void language plpgsql security definer set search_path=''
as $$
declare version integer;
begin
  select policy_version into version from private.marketplace_configuration where singleton;
  insert into private.marketplace_events(actor_class,actor_id,entity_type,entity_id,event_type,policy_version,metadata,dedupe_key)
  values(p_actor_class,p_actor_id,p_entity_type,p_entity_id,p_event_type,version,coalesce(p_metadata,'{}'::jsonb),p_dedupe_key)
  on conflict(dedupe_key) do nothing;
end;
$$;

create or replace function private.marketplace_notify(
  p_user_id uuid,p_type text,p_title text,p_body text,p_data jsonb,p_dedupe_key text
)
returns void language sql security definer set search_path=''
as $$
  insert into public.notifications(user_id,type,title,body,data,dedupe_key)
  values(p_user_id,p_type,p_title,p_body,coalesce(p_data,'{}'::jsonb),p_dedupe_key)
  on conflict(user_id,type,dedupe_key) where dedupe_key is not null do nothing
$$;

create or replace function private.marketplace_request_start(p_request public.marketplace_requests)
returns timestamptz language sql stable set search_path=''
as $$
  select case when p_request.schedule_kind='asap' then pg_catalog.now()
    when p_request.schedule_kind='today' then coalesce(p_request.requested_start_at,pg_catalog.now()+interval '1 hour')
    else p_request.requested_start_at end
$$;

create or replace function private.convert_marketplace_request(
  p_request_id uuid,
  p_provider_id uuid,
  p_quote_id uuid default null,
  p_rescue_attempt_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare request_row public.marketplace_requests; quote_row public.worker_quotes; service_row record;
  location_row private.marketplace_request_locations; booking_id uuid; start_at timestamptz;
  total_minor bigint; service_minor bigint; transport_minor bigint := 0; emergency_minor bigint := 0;
begin
  select * into request_row from public.marketplace_requests where id=p_request_id for update;
  if request_row.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
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
$$;

create or replace function public.select_worker_quote(
  p_request_id uuid,
  p_quote_id uuid,
  p_expected_selection_version integer,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); request_row public.marketplace_requests; quote_row public.worker_quotes; worker_uid uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into request_row from public.marketplace_requests where id=p_request_id and customer_id=uid for update;
  if request_row.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
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
$$;

create or replace function public.confirm_selected_quote(
  p_request_id uuid,
  p_quote_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; request_row public.marketplace_requests; quote_row public.worker_quotes; booking_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select * into request_row from public.marketplace_requests where id=p_request_id for update;
  if request_row.converted_booking_id is not null then return request_row.converted_booking_id; end if;
  if request_row.status<>'selection_pending_confirmation' or request_row.selected_quote_id<>p_quote_id
    or request_row.confirmation_deadline_at<=pg_catalog.now()
  then raise exception 'Confirmation is no longer available' using errcode='22023'; end if;
  select * into quote_row from public.worker_quotes q where q.id=p_quote_id and q.provider_id=provider_id and q.request_id=p_request_id and q.status='selected';
  if quote_row.id is null then raise exception 'Selected quote unavailable' using errcode='42501'; end if;
  if private.worker_capacity_conflicts(
    provider_id,private.marketplace_request_start(request_row),quote_row.estimated_duration_minutes,
    (select latitude from private.marketplace_request_locations where request_id=p_request_id),
    (select longitude from private.marketplace_request_locations where request_id=p_request_id),null
  ) then raise exception 'Worker is no longer available' using errcode='22023'; end if;
  update public.marketplace_requests set status='worker_confirmed',confirmed_at=pg_catalog.now() where id=p_request_id;
  booking_id := private.convert_marketplace_request(p_request_id,provider_id,p_quote_id,null);
  perform private.marketplace_record_event('worker',uid,'request',p_request_id,'selected_quote_confirmed',
    pg_catalog.jsonb_build_object('quoteId',p_quote_id,'bookingId',booking_id),p_idempotency_key||':confirmed');
  return booking_id;
end;
$$;

create or replace function public.accept_emergency_request(p_invitation_id uuid, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; invitation public.quote_invitations;
  request_row public.marketplace_requests; provider_surcharge bigint; booking_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select * into invitation from public.quote_invitations i where i.id=p_invitation_id and i.provider_id=provider_id for update;
  if invitation.id is null then raise exception 'Invitation not found' using errcode='P0002'; end if;
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
$$;

create or replace function public.get_customer_marketplace_request(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id',r.id,'flowKind',r.flow_kind,'status',r.status,'categoryId',r.category_id,'serviceId',r.service_id,
    'targetedProviderId',r.targeted_provider_id,'issueDescription',r.issue_description,'notes',r.notes,
    'scheduleKind',r.schedule_kind,'requestedStartAt',r.requested_start_at,'requestedEndAt',r.requested_end_at,
    'paymentCompatibility',r.payment_compatibility,'area',pg_catalog.jsonb_build_object('governorate',r.approximate_governorate,'district',r.approximate_district),
    'revision',r.current_revision,'selectionVersion',r.selection_version,'selectedQuoteId',r.selected_quote_id,
    'editDeadlineAt',r.edit_deadline_at,'collectionNotBefore',r.collection_not_before,'expiresAt',r.expires_at,
    'confirmationDeadlineAt',r.confirmation_deadline_at,'convertedBookingId',r.converted_booking_id,
    'quoteCount',(select pg_catalog.count(*) from public.worker_quotes q where q.request_id=r.id and q.status in ('submitted','revised','selected')),
    'recoveryActions',case when r.status='expired' then pg_catalog.jsonb_build_array('retry','expand','schedule','browse_workers') else '[]'::jsonb end,
    'createdAt',r.created_at,'updatedAt',r.updated_at
  )
  from public.marketplace_requests r where r.id=p_request_id and r.customer_id=(select auth.uid())
$$;

create or replace function public.get_customer_quotes(p_request_id uuid, p_sort text default 'best_value')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(item order by
    case when p_sort='lowest_price' then price_minor end asc,
    case when p_sort='highest_rated' then rating end desc,
    case when p_sort='closest' then distance_km end asc,
    case when p_sort='fastest_arrival' then eta_minutes end asc,
    case when p_sort='most_experienced' then completed_jobs end desc,
    case when p_sort='best_value' then best_value end desc,
    submitted_at,id
  ),'[]'::jsonb)
  from (
    select
      pg_catalog.jsonb_build_object(
        'id',q.id,'status',q.status,'revision',q.current_revision,'providerId',q.provider_id,
        'workerName',p.display_name,'workerRating',p.rating_average,'workerReviewCount',p.review_count,
        'completedJobs',p.completed_jobs,'priceMinor',q.price_minor,'currency',q.currency,
        'proposedStartAt',q.proposed_start_at,'etaMinutes',q.eta_minutes,'estimatedDurationMinutes',q.estimated_duration_minutes,
        'message',q.message,'laborIncluded',q.labor_included,'materialsInclusion',q.materials_inclusion,
        'materialsExplanation',q.materials_explanation,'warrantyDays',q.warranty_days,
        'supportedPaymentMethods',q.supported_payment_methods,'submittedAt',q.submitted_at
      ) as item,
      q.id,q.price_minor,q.eta_minutes,q.submitted_at,p.rating_average as rating,p.completed_jobs,
      coalesce((select min(s.distance_km) from private.marketplace_candidate_scores s
        join private.marketplace_matching_runs mr on mr.id=s.matching_run_id
        where mr.request_id=q.request_id and s.provider_id=q.provider_id),999999) as distance_km,
      (p.rating_average/5*0.55 + least(1::numeric,p.completed_jobs::numeric/100)*0.15
        + greatest(0::numeric,1-q.price_minor::numeric/nullif(max(q.price_minor) over(),0))*0.20
        + greatest(0::numeric,1-coalesce(q.eta_minutes,1440)::numeric/1440)*0.10) as best_value
    from public.worker_quotes q
    join public.provider_profiles p on p.id=q.provider_id
    join public.marketplace_requests r on r.id=q.request_id and r.customer_id=(select auth.uid())
    where q.request_id=p_request_id and q.status in ('submitted','revised','selected')
  ) visible
$$;

create or replace function public.get_worker_quote_invitations(p_cursor timestamptz default null, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; result jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select coalesce(jsonb_agg(item order by invited_at desc),'[]'::jsonb) into result from (
    select i.invited_at,pg_catalog.jsonb_build_object(
      'id',i.id,'requestId',i.request_id,'status',i.status,'flowKind',r.flow_kind,
      'categoryId',r.category_id,'serviceId',r.service_id,'issueDescription',r.issue_description,
      'scheduleKind',r.schedule_kind,'requestedStartAt',r.requested_start_at,'requestedEndAt',r.requested_end_at,
      'area',pg_catalog.jsonb_build_object('governorate',r.approximate_governorate,'district',r.approximate_district),
      'paymentCompatibility',r.payment_compatibility,'expiresAt',i.expires_at,'invitedAt',i.invited_at,
      'quoteId',q.id
    ) item
    from public.quote_invitations i join public.marketplace_requests r on r.id=i.request_id
    left join public.worker_quotes q on q.invitation_id=i.id
    where i.provider_id=provider_id and (p_cursor is null or i.invited_at<p_cursor)
    order by i.invited_at desc limit greatest(1,least(coalesce(p_limit,20),50))
  ) rows;
  return result;
end;
$$;

create or replace function public.get_worker_quote(p_quote_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; result jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select pg_catalog.jsonb_build_object(
    'id',q.id,'requestId',q.request_id,'status',q.status,'currentRevision',q.current_revision,
    'priceMinor',q.price_minor,'currency',q.currency,'proposedStartAt',q.proposed_start_at,'etaMinutes',q.eta_minutes,
    'estimatedDurationMinutes',q.estimated_duration_minutes,'message',q.message,'laborIncluded',q.labor_included,
    'materialsInclusion',q.materials_inclusion,'materialsExplanation',q.materials_explanation,
    'warrantyDays',q.warranty_days,'supportedPaymentMethods',q.supported_payment_methods,
    'revisions',(select coalesce(jsonb_agg(pg_catalog.jsonb_build_object('revision',qr.revision,'terms',qr.terms,'reason',qr.revision_reason,'createdAt',qr.created_at) order by qr.revision),'[]'::jsonb) from public.worker_quote_revisions qr where qr.quote_id=q.id)
  ) into result from public.worker_quotes q where q.id=p_quote_id and q.provider_id=provider_id;
  return result;
end;
$$;

create or replace function public.get_marketplace_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'enabled',c.enabled and c.scheduler_enabled,
    'flows',case when c.enabled and c.scheduler_enabled then pg_catalog.jsonb_build_array('browse_worker','get_quotes','emergency') else '[]'::jsonb end,
    'quoteRevisionsEnabled',c.enabled and c.scheduler_enabled,
    'requestLifetimeSeconds',c.request_lifetime_seconds,
    'initialCollectionSeconds',c.initial_collection_seconds,
    'editWindowSeconds',c.edit_window_seconds,
    'workerNoShowSeconds',c.worker_no_show_seconds,
    'usefulQuoteTarget',c.useful_quote_target,
    'currency','EGP',
    'warrantyCategories',(select coalesce(jsonb_agg(w.category_id order by w.category_id),'[]'::jsonb) from private.marketplace_category_warranty_configuration w where w.enabled)
  ) from private.marketplace_configuration c where c.singleton
$$;


create or replace function private.assert_marketplace_ready(p_category_id text)
returns private.marketplace_configuration
language plpgsql
security definer
set search_path = ''
as $$
declare config private.marketplace_configuration;
begin
  select * into config from private.marketplace_configuration where singleton;
  if config.singleton is null or not config.enabled or not config.scheduler_enabled then
    raise exception 'Marketplace is temporarily unavailable' using errcode='55000';
  end if;
  if config.request_lifetime_seconds <> 600
    or config.initial_collection_seconds <> 120
    or config.edit_window_seconds <> 300
    or config.worker_no_show_seconds <> 900
    or config.useful_quote_target <> 5
    or config.fixed_buffer_minutes <> 30
  then
    raise exception 'Marketplace configuration is incomplete' using errcode='55000';
  end if;
  if not exists (
    select 1 from private.marketplace_capacity_configuration c
    where c.singleton and c.fixed_buffer_minutes=30
      and c.road_factor is not null and c.average_urban_speed_kmh is not null
  ) or not exists (
    select 1 from private.marketplace_category_duration_defaults d
    where d.category_id=p_category_id
  ) then
    raise exception 'Marketplace configuration is incomplete' using errcode='55000';
  end if;
  return config;
end;
$$;

create or replace function public.set_worker_emergency_category(p_category_id text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); owned_provider_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into owned_provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  if owned_provider_id is null then raise exception 'Worker profile not found' using errcode='42501'; end if;
  if p_enabled is null or not exists(
    select 1 from public.provider_services ps join public.services s on s.id=ps.service_id
    where ps.provider_id=owned_provider_id and ps.is_active and s.category_id=p_category_id and s.is_active and s.deleted_at is null
  ) then raise exception 'Emergency category unavailable' using errcode='22023'; end if;
  insert into public.provider_emergency_categories(provider_id,category_id,enabled)
  values(owned_provider_id,p_category_id,p_enabled)
  on conflict(provider_id,category_id) do update set enabled=excluded.enabled,updated_at=pg_catalog.now();
end;
$$;

create or replace function public.view_quote_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; invitation public.quote_invitations;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select * into invitation from public.quote_invitations i where i.id=p_invitation_id and i.provider_id=provider_id for update;
  if invitation.id is null then raise exception 'Invitation not found' using errcode='P0002'; end if;
  if invitation.status='invited' then
    update public.quote_invitations set status='viewed',viewed_at=pg_catalog.now() where id=p_invitation_id;
    update private.emergency_dispatch_attempts set state='viewed' where invitation_id=p_invitation_id and state='invited';
    perform private.marketplace_record_event('worker',uid,'invitation',p_invitation_id,'invitation_viewed','{}','invitation-viewed:'||p_invitation_id::text);
  end if;
  return pg_catalog.jsonb_build_object('id',invitation.id,'status',case when invitation.status='invited' then 'viewed' else invitation.status end);
end;
$$;

create or replace function private.validate_worker_quote(
  p_provider_id uuid,
  p_request_id uuid,
  p_quote jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare request_row public.marketplace_requests; warranty_config private.marketplace_category_warranty_configuration;
  price_minor bigint; duration_minutes integer; eta_minutes integer; warranty_days integer; methods text[];
begin
  select * into request_row from public.marketplace_requests where id=p_request_id;
  price_minor := nullif(p_quote->>'priceMinor','')::bigint;
  duration_minutes := nullif(p_quote->>'estimatedDurationMinutes','')::integer;
  eta_minutes := nullif(p_quote->>'etaMinutes','')::integer;
  warranty_days := nullif(p_quote->>'warrantyDays','')::integer;
  select coalesce(array_agg(value),array[]::text[]) into methods from pg_catalog.jsonb_array_elements_text(coalesce(p_quote->'supportedPaymentMethods','[]'::jsonb));
  if price_minor not between 1 and 1000000000 or duration_minutes not between 15 and 1440
    or (eta_minutes is not null and eta_minutes not between 0 and 1440)
    or pg_catalog.length(coalesce(p_quote->>'message',''))>1000
    or pg_catalog.length(coalesce(p_quote->>'materialsExplanation',''))>500
    or coalesce(p_quote->>'materialsInclusion','') not in ('included','excluded','partial','unknown')
    or pg_catalog.cardinality(methods) not between 1 and 2
    or not (methods <@ array['cash','online']::text[])
    or (request_row.payment_compatibility='cash' and not ('cash'=any(methods)))
    or (request_row.payment_compatibility='online' and not ('online'=any(methods)))
    or (request_row.payment_compatibility='cash' and private.provider_cash_restricted(p_provider_id))
  then raise exception 'Invalid quote terms' using errcode='22023'; end if;
  select * into warranty_config from private.marketplace_category_warranty_configuration where category_id=request_row.category_id;
  if warranty_days is not null and (
    warranty_config.category_id is null or not warranty_config.enabled
    or warranty_config.duration_days is null or warranty_days>warranty_config.duration_days
  ) then raise exception 'Warranty is unavailable for this category' using errcode='22023'; end if;
  return pg_catalog.jsonb_build_object(
    'priceMinor',price_minor,'currency','EGP',
    'proposedStartAt',nullif(p_quote->>'proposedStartAt',''),
    'etaMinutes',eta_minutes,'estimatedDurationMinutes',duration_minutes,
    'message',coalesce(p_quote->>'message',''),'laborIncluded',coalesce((p_quote->>'laborIncluded')::boolean,false),
    'materialsInclusion',p_quote->>'materialsInclusion','materialsExplanation',coalesce(p_quote->>'materialsExplanation',''),
    'warrantyDays',warranty_days,'supportedPaymentMethods',to_jsonb(methods)
  );
end;
$$;

create or replace function public.submit_worker_quote(p_invitation_id uuid, p_quote jsonb, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  if invitation.id is null then raise exception 'Invitation not found' using errcode='P0002'; end if;
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
$$;

create or replace function public.revise_worker_quote(p_quote_id uuid, p_quote jsonb, p_idempotency_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
  if quote_row.id is null then raise exception 'Quote not found' using errcode='P0002'; end if;
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
$$;

create or replace function public.decline_quote_invitation(p_invitation_id uuid, p_reason text, p_idempotency_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; invitation public.quote_invitations;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select * into invitation from public.quote_invitations i where i.id=p_invitation_id and i.provider_id=provider_id for update;
  if invitation.id is null then raise exception 'Invitation not found' using errcode='P0002'; end if;
  if invitation.status='declined' then return; end if;
  if invitation.status not in ('invited','viewed') then raise exception 'Invitation is no longer actionable' using errcode='22023'; end if;
  update public.quote_invitations set status='declined',responded_at=pg_catalog.now(),outcome_reason=pg_catalog.left(coalesce(p_reason,'other'),120) where id=p_invitation_id;
  update private.emergency_dispatch_attempts set state='declined',attempted_at=pg_catalog.now() where invitation_id=p_invitation_id and state in ('invited','viewed');
  perform private.marketplace_record_event('worker',uid,'invitation',p_invitation_id,'invitation_declined',
    pg_catalog.jsonb_build_object('reason',pg_catalog.left(coalesce(p_reason,'other'),120)),p_idempotency_key||':declined');
end;
$$;

create or replace function public.withdraw_worker_quote(p_quote_id uuid, p_reason text, p_idempotency_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; quote_row public.worker_quotes;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select * into quote_row from public.worker_quotes q where q.id=p_quote_id and q.provider_id=provider_id for update;
  if quote_row.id is null then raise exception 'Quote not found' using errcode='P0002'; end if;
  if quote_row.status='withdrawn' then return; end if;
  if quote_row.status not in ('submitted','revised') then raise exception 'Quote can no longer be withdrawn' using errcode='22023'; end if;
  update public.worker_quotes set status='withdrawn',withdrawn_at=pg_catalog.now() where id=p_quote_id;
  update public.quote_invitations set status='withdrawn',responded_at=pg_catalog.now(),outcome_reason=pg_catalog.left(coalesce(p_reason,'other'),120) where id=quote_row.invitation_id;
  perform private.marketplace_record_event('worker',uid,'quote',p_quote_id,'quote_withdrawn',
    pg_catalog.jsonb_build_object('reason',pg_catalog.left(coalesce(p_reason,'other'),120)),p_idempotency_key||':withdrawn');
end;
$$;


create or replace function private.marketplace_record_event(
  p_actor_class text,
  p_actor_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_event_type text,
  p_metadata jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare version integer;
begin
  select policy_version into version from private.marketplace_configuration where singleton;
  insert into private.marketplace_events(actor_class,actor_id,entity_type,entity_id,event_type,policy_version,metadata,dedupe_key)
  values(p_actor_class,p_actor_id,p_entity_type,p_entity_id,p_event_type,version,coalesce(p_metadata,'{}'::jsonb),p_dedupe_key)
  on conflict(dedupe_key) do nothing;
end;
$$;

create or replace function private.marketplace_notify(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb,
  p_dedupe_key text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications(user_id,type,title,body,data,dedupe_key)
  values(p_user_id,p_type,p_title,p_body,coalesce(p_data,'{}'::jsonb),p_dedupe_key)
  on conflict(user_id,type,dedupe_key) where dedupe_key is not null do nothing
$$;

create or replace function private.marketplace_request_start(p_request public.marketplace_requests)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_request.schedule_kind='asap' then pg_catalog.now()
    when p_request.schedule_kind='today' then coalesce(p_request.requested_start_at,pg_catalog.now()+interval '1 hour')
    else p_request.requested_start_at
  end
$$;

create or replace function private.create_marketplace_wave(
  p_request_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  request_row public.marketplace_requests;
  location_row private.marketplace_request_locations;
  config private.marketplace_configuration;
  run_id uuid;
  wave_number integer;
  radius numeric;
  invitation_limit integer;
  quote_count integer;
  current_invitation_count integer;
  inserted_count integer := 0;
  candidate_count integer := 0;
  eligible_count integer := 0;
  candidate record;
begin
  select * into request_row from public.marketplace_requests where id=p_request_id for update;
  if request_row.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
  if request_row.status not in ('matching','collecting_quotes','customer_reviewing','rescue_matching')
    or request_row.expires_at <= pg_catalog.now()
  then return 0; end if;

  config := private.assert_marketplace_ready(request_row.category_id);
  select * into location_row from private.marketplace_request_locations where request_id=p_request_id;
  if location_row.request_id is null then raise exception 'Request location unavailable' using errcode='55000'; end if;

  select pg_catalog.count(*)::integer into quote_count
  from public.worker_quotes q where q.request_id=p_request_id and q.status in ('submitted','revised');
  if request_row.flow_kind <> 'emergency' and quote_count >= config.useful_quote_target then return 0; end if;

  select coalesce(max(r.wave_number),0)+1 into wave_number
  from private.marketplace_matching_runs r where r.request_id=p_request_id;
  if wave_number > pg_catalog.cardinality(config.wave_radii_km) then return 0; end if;
  radius := least(config.maximum_radius_km,config.wave_radii_km[wave_number]);
  select pg_catalog.count(*)::integer into current_invitation_count from public.quote_invitations where request_id=p_request_id;
  if current_invitation_count >= config.maximum_invitations then return 0; end if;
  invitation_limit := least(
    case when wave_number=1 then config.first_wave_size else config.maximum_invitations end,
    config.maximum_invitations-current_invitation_count
  );

  insert into private.marketplace_matching_runs(
    request_id,request_revision,reason,policy_version,configuration_snapshot,wave_number,
    search_radius_km,status,idempotency_key
  ) values (
    p_request_id,request_row.current_revision,p_reason,config.policy_version,
    pg_catalog.jsonb_build_object('policyVersion',config.policy_version,'radiusKm',radius,'quoteTarget',config.useful_quote_target),
    wave_number,radius,'running',p_idempotency_key
  ) on conflict(request_id,idempotency_key) do update set id=private.marketplace_matching_runs.id
  returning id into run_id;

  for candidate in
    with pool as (
      select
        p.id as provider_id,
        p.user_id,
        p.rating_average,
        p.review_count,
        p.completed_jobs,
        l.latitude,
        l.longitude,
        private.marketplace_distance_km(location_row.latitude,location_row.longitude,l.latitude,l.longitude) as distance_km,
        least(coalesce(p.service_radius_km,config.maximum_radius_km),config.maximum_radius_km,radius) as allowed_radius,
        coalesce(o.calculated_adjustment,0) as fairness_adjustment
      from public.provider_profiles p
      join private.worker_matching_locations l on l.provider_id=p.id and l.verification_state='verified'
      left join private.worker_opportunity_state o on o.provider_id=p.id
      where p.id is distinct from request_row.excluded_provider_id
        and (request_row.targeted_provider_id is null or p.id=request_row.targeted_provider_id)
        and p.user_id is not null
        and p.is_available
        and (p.temporary_unavailable_until is null or p.temporary_unavailable_until <= pg_catalog.now())
        and private.is_provider_publicly_discoverable(p.id)
        and exists (
          select 1 from public.provider_services ps
          join public.services s on s.id=ps.service_id
          where ps.provider_id=p.id and ps.is_active and s.is_active and s.deleted_at is null
            and s.category_id=request_row.category_id
            and (request_row.service_id is null or s.id=request_row.service_id)
        )
        and (request_row.payment_compatibility <> 'cash' or not private.provider_cash_restricted(p.id))
        and (
          request_row.flow_kind <> 'emergency'
          or (
            p.emergency_available
            and exists(select 1 from public.provider_emergency_categories e where e.provider_id=p.id and e.category_id=request_row.category_id and e.enabled)
          )
        )
        and not exists(select 1 from public.quote_invitations i where i.request_id=p_request_id and i.provider_id=p.id)
    ), eligible as (
      select *,
        pg_catalog.ceil(distance_km/30*60)::integer as eta_minutes,
        pg_catalog.round((
          least(1::numeric,rating_average/5)*0.45
          + least(1::numeric,pg_catalog.ln(completed_jobs+1)/pg_catalog.ln(101))*0.20
          + greatest(0::numeric,1-distance_km/nullif(allowed_radius,0))*0.27
          + greatest(-0.08::numeric,least(0.08::numeric,fairness_adjustment))
          + case when completed_jobs=0 then 0.04 else 0 end
        )::numeric,6) as final_score
      from pool
      where distance_km is not null and distance_km <= allowed_radius
        and not private.worker_capacity_conflicts(
          provider_id,private.marketplace_request_start(request_row),request_row.estimated_duration_minutes,
          location_row.latitude,location_row.longitude,null
        )
    )
    select *, row_number() over(
      order by
        case when request_row.flow_kind='emergency' then eta_minutes end asc nulls last,
        final_score desc, distance_km asc, provider_id
    )::integer as candidate_rank
    from eligible
    order by candidate_rank
  loop
    candidate_count := candidate_count + 1;
    eligible_count := eligible_count + 1;
    insert into private.marketplace_candidate_scores(
      matching_run_id,provider_id,eligible,distance_km,eta_minutes,components,
      fairness_adjustment,new_worker_adjustment,final_score,rank,policy_version
    ) values (
      run_id,candidate.provider_id,true,candidate.distance_km,candidate.eta_minutes,
      pg_catalog.jsonb_build_object('quality','eligible','distanceBand',case when candidate.distance_km<=5 then 'near' when candidate.distance_km<=15 then 'medium' else 'wide' end),
      candidate.fairness_adjustment,case when candidate.completed_jobs=0 then 0.04 else 0 end,
      candidate.final_score,candidate.candidate_rank,config.policy_version
    ) on conflict do nothing;

    if inserted_count < invitation_limit then
      insert into public.quote_invitations(
        request_id,provider_id,matching_run_id,request_revision,wave_number,status,expires_at
      ) values (
        p_request_id,candidate.provider_id,run_id,request_row.current_revision,wave_number,'invited',request_row.expires_at
      ) on conflict(request_id,provider_id) do nothing;
      if found then
        inserted_count := inserted_count+1;
        perform private.marketplace_notify(
          candidate.user_id,
          case when request_row.flow_kind='emergency' then 'emergency_request' else 'quote_invitation' end,
          case when request_row.flow_kind='emergency' then 'Emergency request' else 'New quote request' end,
          'Open Warsha to review this work request.',
          pg_catalog.jsonb_build_object('requestId',p_request_id,'kind',request_row.flow_kind),
          'marketplace-invitation:'||p_request_id::text||':'||candidate.provider_id::text
        );
      end if;
    end if;
  end loop;

  if request_row.flow_kind='emergency' then
    insert into private.emergency_dispatch_attempts(request_id,provider_id,invitation_id,wave_number,eta_minutes,state)
    select i.request_id,i.provider_id,i.id,i.wave_number,s.eta_minutes,'invited'
    from public.quote_invitations i
    join private.marketplace_candidate_scores s on s.matching_run_id=i.matching_run_id and s.provider_id=i.provider_id
    where i.matching_run_id=run_id
    on conflict(request_id,provider_id) do nothing;
  end if;

  update private.marketplace_matching_runs
  set status='completed',candidate_count=candidate_count,eligible_count=eligible_count,
      invited_count=inserted_count,completed_at=pg_catalog.now()
  where id=run_id;

  update public.marketplace_requests
  set status=case when flow_kind='emergency' then 'matching' else 'collecting_quotes' end
  where id=p_request_id and status in ('matching','rescue_matching');

  if wave_number < pg_catalog.cardinality(config.wave_radii_km)
    and current_invitation_count+inserted_count < config.maximum_invitations
  then
    insert into private.marketplace_jobs(job_kind,request_id,run_at,dedupe_key)
    values('additional_wave',p_request_id,pg_catalog.now()+pg_catalog.make_interval(secs=>config.wave_cadence_seconds),'wave:'||p_request_id::text||':'||(wave_number+1)::text)
    on conflict(job_kind,dedupe_key) where state in ('pending','leased','retryable_failed') do nothing;
  end if;

  perform private.marketplace_record_event('system',null,'request',p_request_id,'wave_completed',
    pg_catalog.jsonb_build_object('wave',wave_number,'invited',inserted_count),
    'wave-completed:'||p_request_id::text||':'||wave_number::text);
  return inserted_count;
end;
$$;

create or replace function private.start_marketplace_matching(p_request_id uuid, p_reason text default 'initial')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.create_marketplace_wave(p_request_id,p_reason,'wave:'||p_request_id::text||':1');
end;
$$;

create or replace function public.preview_emergency_request(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  uid uuid := (select auth.uid());
  category_id text := p_request->>'categoryId';
  service_id uuid := nullif(p_request->>'serviceId','')::uuid;
  provider_id uuid := nullif(p_request->>'targetedProviderId','')::uuid;
  config private.marketplace_configuration;
  surcharge bigint;
  approval_token text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  config := private.assert_marketplace_ready(category_id);
  perform public.ensure_customer_profile();
  select max(pg_catalog.round(ps.emergency_surcharge_egp*100))::bigint into surcharge
  from public.provider_services ps
  join public.services s on s.id=ps.service_id
  join public.provider_profiles p on p.id=ps.provider_id
  join public.provider_emergency_categories e on e.provider_id=p.id and e.category_id=s.category_id and e.enabled
  where s.category_id=category_id and (service_id is null or s.id=service_id)
    and (provider_id is null or p.id=provider_id)
    and ps.is_active and s.is_active and s.deleted_at is null
    and p.emergency_available and p.is_available
    and private.is_provider_publicly_discoverable(p.id);
  if surcharge is null then raise exception 'Emergency service unavailable' using errcode='22023'; end if;
  approval_token := pg_catalog.encode(extensions.gen_random_bytes(24),'hex');
  insert into private.emergency_price_approvals(customer_id,provider_id,category_id,service_id,surcharge_minor,pricing_version,token,expires_at)
  values(uid,provider_id,category_id,service_id,surcharge,config.policy_version,approval_token,pg_catalog.now()+interval '5 minutes');
  return pg_catalog.jsonb_build_object(
    'approvalToken',approval_token,'approvalVersion',config.policy_version,
    'surchargeMinor',surcharge,'currency','EGP','expiresAt',pg_catalog.now()+interval '5 minutes'
  );
end;
$$;

create or replace function public.create_marketplace_request(p_request jsonb, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  uid uuid := (select auth.uid());
  request_id uuid;
  existing_id uuid;
  flow_kind text := coalesce(p_request->>'flowKind','get_quotes');
  category_id text := p_request->>'categoryId';
  service_id uuid := nullif(p_request->>'serviceId','')::uuid;
  target_provider uuid := nullif(p_request->>'targetedProviderId','')::uuid;
  address_id uuid := nullif(p_request->>'addressId','')::uuid;
  schedule_kind text := coalesce(p_request->>'scheduleKind','asap');
  start_at timestamptz := nullif(p_request->>'requestedStartAt','')::timestamptz;
  end_at timestamptz := nullif(p_request->>'requestedEndAt','')::timestamptz;
  address_row record;
  config private.marketplace_configuration;
  approval private.emergency_price_approvals;
  approval_token text := p_request->>'emergencyApprovalToken';
  duration_minutes integer;
  coarse_id text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request is null or pg_catalog.jsonb_typeof(p_request)<>'object'
    or p_idempotency_key is null or pg_catalog.length(p_idempotency_key) not between 16 and 200
  then raise exception 'Invalid marketplace request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text||':'||p_idempotency_key,0));
  select id into existing_id from public.marketplace_requests where customer_id=uid and idempotency_key=p_idempotency_key;
  if existing_id is not null then return existing_id; end if;
  if flow_kind not in ('browse_worker','get_quotes','emergency')
    or (flow_kind='browse_worker' and target_provider is null)
    or (flow_kind<>'browse_worker' and target_provider is not null and flow_kind<>'emergency')
    or schedule_kind not in ('asap','today','scheduled','flexible')
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_request->>'issueDescription',''))) not between 8 and 2000
    or pg_catalog.length(coalesce(p_request->>'notes','')) > 2000
  then raise exception 'Invalid marketplace request' using errcode='22023'; end if;
  config := private.assert_marketplace_ready(category_id);
  if (select pg_catalog.count(*) from public.marketplace_requests r where r.customer_id=uid and r.created_at>pg_catalog.now()-interval '1 hour')
      >= coalesce((config.rate_limits->>'customerCreatesPerHour')::integer,10)
  then raise exception 'Too many marketplace requests' using errcode='P0001'; end if;
  perform public.ensure_customer_profile();
  if not exists(select 1 from public.service_categories c where c.id=category_id and c.is_active and c.deleted_at is null)
    or (service_id is not null and not exists(select 1 from public.services s where s.id=service_id and s.category_id=category_id and s.is_active and s.deleted_at is null))
  then raise exception 'Service unavailable' using errcode='22023'; end if;
  if schedule_kind in ('scheduled','flexible') and (start_at is null or start_at<=pg_catalog.now()) then raise exception 'Choose a future time' using errcode='22023'; end if;
  if schedule_kind='flexible' and (end_at is null or end_at<=start_at) then raise exception 'Choose a valid flexible window' using errcode='22023'; end if;
  if schedule_kind not in ('scheduled','flexible') then end_at:=null; end if;
  select a.*,pg_catalog.concat_ws(', ',a.building,coalesce(nullif(a.street,''),nullif(a.address_line,'')),a.district,a.governorate) as snapshot
  into address_row from public.addresses a where a.id=address_id and a.customer_id=uid and a.deleted_at is null;
  if address_row.id is null then raise exception 'Address not found' using errcode='42501'; end if;
  if address_row.latitude is null or address_row.longitude is null then raise exception 'Verified request location required' using errcode='55000'; end if;
  select d.estimated_duration_minutes into duration_minutes
  from private.marketplace_category_duration_defaults d where d.category_id=category_id;
  coarse_id := pg_catalog.lower(pg_catalog.regexp_replace(address_row.governorate||':'||coalesce(address_row.district,''),'[^a-zA-Z0-9:]+','-','g'));

  if flow_kind='emergency' then
    select * into approval from private.emergency_price_approvals a
    where a.customer_id=uid and a.token=approval_token for update;
    if approval.id is null or approval.consumed_at is not null or approval.expires_at<=pg_catalog.now()
      or approval.category_id<>category_id or approval.service_id is distinct from service_id
      or approval.provider_id is distinct from target_provider or approval.pricing_version<>config.policy_version
    then raise exception 'Emergency surcharge approval required' using errcode='22023'; end if;
  end if;

  insert into public.marketplace_requests(
    customer_id,flow_kind,status,category_id,service_id,targeted_provider_id,
    issue_description,notes,complexity,schedule_kind,requested_start_at,requested_end_at,
    estimated_duration_minutes,payment_compatibility,approximate_governorate,approximate_district,
    coarse_area_id,edit_deadline_at,collection_not_before,expires_at,
    approved_emergency_surcharge_minor,emergency_approval_version,idempotency_key
  ) values (
    uid,flow_kind,'matching',category_id,service_id,target_provider,
    pg_catalog.btrim(p_request->>'issueDescription'),coalesce(p_request->>'notes',''),nullif(p_request->>'complexity',''),
    schedule_kind,start_at,end_at,duration_minutes,coalesce(p_request->>'paymentCompatibility','either'),
    address_row.governorate,coalesce(address_row.district,''),coarse_id,
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.edit_window_seconds),
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.initial_collection_seconds),
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.request_lifetime_seconds),
    case when flow_kind='emergency' then approval.surcharge_minor end,
    case when flow_kind='emergency' then approval.pricing_version end,
    p_idempotency_key
  ) returning id into request_id;
  insert into private.marketplace_request_locations(request_id,address_id,exact_address_snapshot,latitude,longitude,source,verification_state)
  values(request_id,address_id,address_row.snapshot,address_row.latitude,address_row.longitude,'customer_address','verified');
  insert into public.marketplace_request_revisions(request_id,revision,classification,change_set,created_by,idempotency_key)
  values(request_id,1,'initial',p_request,uid,p_idempotency_key||':revision');
  if flow_kind='emergency' then update private.emergency_price_approvals set consumed_at=pg_catalog.now() where id=approval.id; end if;
  insert into private.marketplace_jobs(job_kind,request_id,run_at,dedupe_key)
  values('expire_request',request_id,(select expires_at from public.marketplace_requests where id=request_id),'expire:'||request_id::text);
  perform private.marketplace_record_event('customer',uid,'request',request_id,'request_created',
    pg_catalog.jsonb_build_object('flowKind',flow_kind,'scheduleKind',schedule_kind),p_idempotency_key||':created');
  perform private.start_marketplace_matching(request_id,'initial');
  return request_id;
exception
  when sqlstate '42501' or sqlstate '22023' or sqlstate '55000' or sqlstate 'P0001' then raise;
  when others then raise exception 'Unable to create marketplace request' using errcode='P0001';
end;
$$;

create or replace function public.edit_marketplace_request(
  p_request_id uuid,p_expected_revision integer,p_patch jsonb,p_idempotency_key text
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare uid uuid := (select auth.uid()); request_row public.marketplace_requests; location_row private.marketplace_request_locations;
  classification text; next_revision integer; replacement_id uuid; replacement_payload jsonb; key_name text;
  minor_keys text[] := array['descriptionClarification','notes','requestedStartAt','requestedEndAt','addressClarification','attachmentIds'];
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb
    or p_idempotency_key is null or pg_catalog.length(p_idempotency_key) not between 16 and 200
  then raise exception 'Invalid request edit' using errcode='22023'; end if;
  select * into request_row from public.marketplace_requests where id=p_request_id and customer_id=uid for update;
  if request_row.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
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
$$;

create or replace function public.cancel_marketplace_request(p_request_id uuid,p_reason text,p_idempotency_key text)
returns void
language plpgsql security definer set search_path=''
as $$
declare uid uuid := (select auth.uid()); request_row public.marketplace_requests; phase_name text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'Cancellation reason required' using errcode='22023'; end if;
  select * into request_row from public.marketplace_requests where id=p_request_id and customer_id=uid for update;
  if request_row.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
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
$$;

create or replace function public.retry_marketplace_request(p_request_id uuid,p_strategy text,p_idempotency_key text)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare uid uuid := (select auth.uid()); request_row public.marketplace_requests; location_row private.marketplace_request_locations;
  payload jsonb; retry_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into request_row from public.marketplace_requests where id=p_request_id and customer_id=uid for update;
  if request_row.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
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
$$;

create or replace function private.expire_marketplace_request(p_request_id uuid)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare request_row public.marketplace_requests;
begin
  select * into request_row from public.marketplace_requests where id=p_request_id for update;
  if request_row.id is null or request_row.status in ('cancelled','expired','converted_to_booking','closed') then return false; end if;
  if request_row.expires_at>pg_catalog.now() then return false; end if;
  update public.marketplace_requests set status='expired',closed_at=pg_catalog.now() where id=p_request_id;
  update public.quote_invitations set status='expired',closed_at=pg_catalog.now() where request_id=p_request_id and status in ('invited','viewed','quoted');
  update public.worker_quotes set status='expired' where request_id=p_request_id and status in ('submitted','revised','selected');
  update private.marketplace_jobs set state='cancelled',completed_at=pg_catalog.now() where request_id=p_request_id and state in ('pending','retryable_failed') and job_kind<>'expire_request';
  perform private.marketplace_notify(request_row.customer_id,'marketplace_request_expired','Request expired','No worker was confirmed. Retry or adjust your request.',
    pg_catalog.jsonb_build_object('requestId',p_request_id),'request-expired:'||p_request_id::text);
  perform private.marketplace_record_event('system',null,'request',p_request_id,'request_expired','{}','request-expired:'||p_request_id::text);
  return true;
end;
$$;

create or replace function private.expire_quote_invitation(p_invitation_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
  update public.quote_invitations set status='expired',closed_at=pg_catalog.now()
  where id=p_invitation_id and status in ('invited','viewed') and expires_at<=pg_catalog.now();
  return found;
end;
$$;

create or replace function private.expire_worker_quote(p_quote_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
  update public.worker_quotes set status='expired' where id=p_quote_id and status in ('submitted','revised') and expires_at<=pg_catalog.now();
  return found;
end;
$$;

create or replace function private.expire_selected_confirmation(p_request_id uuid)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare request_row public.marketplace_requests; remaining integer;
begin
  select * into request_row from public.marketplace_requests where id=p_request_id for update;
  if request_row.id is null or request_row.status<>'selection_pending_confirmation' or request_row.confirmation_deadline_at>pg_catalog.now() then return false; end if;
  update public.worker_quotes set status='rejected',rejected_at=pg_catalog.now() where id=request_row.selected_quote_id and status='selected';
  select pg_catalog.count(*)::integer into remaining from public.worker_quotes
  where request_id=p_request_id and status in ('submitted','revised') and expires_at>pg_catalog.now();
  update public.marketplace_requests set status=case when remaining>0 then 'customer_reviewing' else 'matching' end,
    selected_quote_id=null,selected_at=null,confirmation_deadline_at=null,selection_version=selection_version+1
  where id=p_request_id;
  perform private.marketplace_notify(request_row.customer_id,'quote_confirmation_expired','Worker did not confirm',
    'Choose another quote or continue searching.',pg_catalog.jsonb_build_object('requestId',p_request_id),'confirmation-expired:'||p_request_id::text||':'||request_row.selection_version::text);
  perform private.marketplace_record_event('system',null,'request',p_request_id,'confirmation_expired','{}',
    'confirmation-expired:'||p_request_id::text||':'||request_row.selection_version::text);
  return true;
end;
$$;

create or replace function public.report_worker_running_late(
  p_booking_id uuid,p_delay_minutes integer,p_reason_code text,p_note text,p_idempotency_key text
)
returns timestamptz
language plpgsql security definer set search_path=''
as $$
declare uid uuid := (select auth.uid()); booking_row record; previous_eta timestamptz; latest_eta timestamptz; event_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_delay_minutes not between 1 and 240 or p_reason_code not in ('traffic','previous_job','transport','emergency','other')
    or pg_catalog.length(coalesce(p_note,''))>300
  then raise exception 'Invalid delay update' using errcode='22023'; end if;
  select b.*,p.id as provider_profile_id into booking_row
  from public.bookings b join public.provider_profiles p on p.id=b.provider_id
  where b.id=p_booking_id and p.user_id=uid and b.deleted_at is null for update of b;
  if booking_row.id is null then raise exception 'Booking not found' using errcode='P0002'; end if;
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
$$;

-- Forward declaration; replaced by the full Rescue implementation below.
create or replace function private.trigger_rescue_matching(p_booking_id uuid)
returns uuid language sql security definer set search_path=''
as $$ select null::uuid $$;

create or replace function public.report_worker_no_show(p_booking_id uuid,p_evidence jsonb,p_idempotency_key text)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare uid uuid := (select auth.uid()); booking_row record; latest_eta timestamptz; eligible_at timestamptz; event_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(coalesce(p_evidence,'{}'::jsonb)::text)>4000 then raise exception 'Evidence is too large' using errcode='22023'; end if;
  select b.*,p.user_id as provider_uid into booking_row from public.bookings b
  join public.provider_profiles p on p.id=b.provider_id
  where b.id=p_booking_id and b.customer_id=uid and b.deleted_at is null for update of b;
  if booking_row.id is null then raise exception 'Booking not found' using errcode='P0002'; end if;
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
$$;

create or replace function public.report_customer_no_show(p_booking_id uuid,p_evidence jsonb,p_idempotency_key text)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare uid uuid := (select auth.uid()); booking_row record; arrived_at timestamptz; eligible_at timestamptz; event_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(coalesce(p_evidence,'{}'::jsonb)::text)>4000 then raise exception 'Evidence is too large' using errcode='22023'; end if;
  select b.*,p.id as provider_profile_id into booking_row from public.bookings b
  join public.provider_profiles p on p.id=b.provider_id
  where b.id=p_booking_id and p.user_id=uid and b.deleted_at is null for update of b;
  if booking_row.id is null then raise exception 'Booking not found' using errcode='P0002'; end if;
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
$$;

create or replace function public.create_comeback_request(p_booking_id uuid,p_details jsonb,p_idempotency_key text)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare uid uuid := (select auth.uid()); booking_row record; source_request public.marketplace_requests;
  warranty private.marketplace_category_warranty_configuration;
  completed_at timestamptz; expires_at timestamptz; config private.marketplace_configuration; new_request_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select b.*,s.category_id into booking_row from public.bookings b join public.services s on s.id=b.service_id
  where b.id=p_booking_id and b.customer_id=uid and b.status='completed' and b.deleted_at is null for update of b;
  if booking_row.id is null or booking_row.marketplace_request_id is null then raise exception 'Comeback is unavailable' using errcode='22023'; end if;
  select * into warranty from private.marketplace_category_warranty_configuration where category_id=booking_row.category_id;
  if warranty.category_id is null or not warranty.enabled or warranty.duration_days is null then
    raise exception 'Warranty is unavailable for this category' using errcode='55000';
  end if;
  select max(created_at) into completed_at from public.booking_status_history where booking_id=p_booking_id and status='completed';
  expires_at:=completed_at+pg_catalog.make_interval(days=>warranty.duration_days);
  if completed_at is null or expires_at<=pg_catalog.now() then raise exception 'Warranty period has ended' using errcode='22023'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_details->>'issueDescription',''))) not between 8 and 2000
  then raise exception 'Comeback details are required' using errcode='22023'; end if;
  config:=private.assert_marketplace_ready(booking_row.category_id);
  select * into source_request from public.marketplace_requests where id=booking_row.marketplace_request_id;
  insert into public.marketplace_requests(
    customer_id,flow_kind,status,category_id,service_id,targeted_provider_id,comeback_for_booking_id,
    issue_description,notes,schedule_kind,estimated_duration_minutes,payment_compatibility,
    approximate_governorate,approximate_district,coarse_area_id,edit_deadline_at,collection_not_before,expires_at,idempotency_key
  ) values (
    uid,'comeback','matching',booking_row.category_id,booking_row.service_id,booking_row.provider_id,p_booking_id,
    pg_catalog.btrim(p_details->>'issueDescription'),coalesce(p_details->>'notes',''),'asap',booking_row.estimated_duration_minutes,'either',
    source_request.approximate_governorate,source_request.approximate_district,source_request.coarse_area_id,
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.edit_window_seconds),
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.initial_collection_seconds),
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.request_lifetime_seconds),p_idempotency_key
  ) returning id into new_request_id;
  insert into private.marketplace_request_locations(request_id,address_id,exact_address_snapshot,latitude,longitude,source,verification_state,created_at)
  select new_request_id,l.address_id,l.exact_address_snapshot,l.latitude,l.longitude,l.source,l.verification_state,pg_catalog.now()
  from private.marketplace_request_locations l where l.request_id=source_request.id;
  insert into public.marketplace_request_revisions(request_id,revision,classification,change_set,created_by,idempotency_key)
  values(new_request_id,1,'initial',p_details,uid,p_idempotency_key||':revision');
  insert into public.marketplace_comeback_requests(marketplace_request_id,original_booking_id,original_provider_id,customer_id,issue_details,warranty_policy_version,warranty_expires_at)
  values(new_request_id,p_booking_id,booking_row.provider_id,uid,pg_catalog.btrim(p_details->>'issueDescription'),warranty.policy_version,expires_at);
  insert into private.marketplace_jobs(job_kind,request_id,run_at,dedupe_key)
  values('expire_request',new_request_id,(select r.expires_at from public.marketplace_requests r where r.id=new_request_id),'expire:'||new_request_id::text);
  perform private.start_marketplace_matching(new_request_id,'initial');
  return new_request_id;
end;
$$;

create or replace function private.trigger_rescue_matching(p_booking_id uuid)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare booking_row public.bookings; source_request public.marketplace_requests; source_location private.marketplace_request_locations;
  config private.marketplace_configuration; new_rescue_request_id uuid; attempt_id uuid; copied record; new_quote_id uuid;
begin
  select * into booking_row from public.bookings where id=p_booking_id for update;
  if booking_row.id is null or booking_row.marketplace_request_id is null then return null; end if;
  select a.rescue_request_id into new_rescue_request_id from private.marketplace_rescue_attempts a
  where a.source_booking_id=p_booking_id and a.state in ('created','matching','customer_reviewing','converted') limit 1;
  if new_rescue_request_id is not null then return new_rescue_request_id; end if;
  select * into source_request from public.marketplace_requests where id=booking_row.marketplace_request_id;
  select * into config from private.marketplace_configuration where singleton;
  if not config.enabled or not config.scheduler_enabled then return null; end if;
  perform private.assert_marketplace_ready(source_request.category_id);
  select * into source_location from private.marketplace_request_locations where request_id=source_request.id;
  insert into private.marketplace_rescue_attempts(source_request_id,source_booking_id,cancelled_provider_id,state)
  values(source_request.id,p_booking_id,booking_row.provider_id,'created') returning id into attempt_id;
  insert into public.marketplace_requests(
    customer_id,flow_kind,status,category_id,service_id,excluded_provider_id,rescue_for_booking_id,
    issue_description,notes,complexity,schedule_kind,requested_start_at,requested_end_at,estimated_duration_minutes,
    payment_compatibility,approximate_governorate,approximate_district,coarse_area_id,
    edit_deadline_at,collection_not_before,expires_at,idempotency_key
  ) values (
    source_request.customer_id,'rescue','rescue_matching',source_request.category_id,source_request.service_id,booking_row.provider_id,p_booking_id,
    source_request.issue_description,source_request.notes,source_request.complexity,source_request.schedule_kind,
    case when source_request.schedule_kind in ('scheduled','flexible') and source_request.requested_start_at>pg_catalog.now() then source_request.requested_start_at else null end,
    case when source_request.schedule_kind='flexible' and source_request.requested_end_at>pg_catalog.now() then source_request.requested_end_at else null end,
    source_request.estimated_duration_minutes,source_request.payment_compatibility,
    source_request.approximate_governorate,source_request.approximate_district,source_request.coarse_area_id,
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.edit_window_seconds),
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.initial_collection_seconds),
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.request_lifetime_seconds),
    'rescue:'||p_booking_id::text
  ) returning id into new_rescue_request_id;
  update private.marketplace_rescue_attempts set rescue_request_id=new_rescue_request_id,state='matching' where id=attempt_id;
  insert into private.marketplace_request_locations values(
    new_rescue_request_id,source_location.address_id,source_location.exact_address_snapshot,source_location.latitude,source_location.longitude,
    source_location.source,source_location.verification_state,pg_catalog.now()
  );
  insert into public.marketplace_request_revisions(request_id,revision,classification,change_set,created_by,idempotency_key)
  values(new_rescue_request_id,1,'initial',pg_catalog.jsonb_build_object('rescueForBookingId',p_booking_id),source_request.customer_id,'rescue-revision:'||p_booking_id::text);
  insert into public.marketplace_request_attachments(request_id,revision,uploader_id,storage_path,mime_type,byte_size,attachment_kind,created_at)
  select new_rescue_request_id,1,a.uploader_id,a.storage_path,a.mime_type,a.byte_size,a.attachment_kind,a.created_at
  from public.marketplace_request_attachments a where a.request_id=source_request.id and a.invalidated_at is null;
  insert into private.marketplace_jobs(job_kind,request_id,run_at,dedupe_key)
  values('expire_request',new_rescue_request_id,(select r.expires_at from public.marketplace_requests r where r.id=new_rescue_request_id),'expire:'||new_rescue_request_id::text);
  perform private.start_marketplace_matching(new_rescue_request_id,'rescue');
  for copied in
    select q.*,i.id as new_invitation
    from public.worker_quotes q join public.quote_invitations i on i.request_id=new_rescue_request_id and i.provider_id=q.provider_id
    where q.request_id=source_request.id and q.provider_id<>booking_row.provider_id
      and q.status in ('submitted','revised') and q.expires_at>pg_catalog.now()
  loop
    insert into public.worker_quotes(
      request_id,invitation_id,provider_id,status,current_revision,price_minor,currency,proposed_start_at,eta_minutes,
      estimated_duration_minutes,message,labor_included,materials_inclusion,materials_explanation,warranty_days,
      supported_payment_methods,expires_at,idempotency_key
    ) values (
      new_rescue_request_id,copied.new_invitation,copied.provider_id,'submitted',1,copied.price_minor,copied.currency,copied.proposed_start_at,copied.eta_minutes,
      copied.estimated_duration_minutes,copied.message,copied.labor_included,copied.materials_inclusion,copied.materials_explanation,copied.warranty_days,
      copied.supported_payment_methods,(select r.expires_at from public.marketplace_requests r where r.id=new_rescue_request_id),'rescue-copy:'||copied.id::text
    ) on conflict(request_id,provider_id) do nothing returning id into new_quote_id;
    if new_quote_id is not null then
      insert into public.worker_quote_revisions(quote_id,revision,terms,revision_reason,actor_id,idempotency_key)
      select new_quote_id,1,terms,'Reused after Rescue',actor_id,'rescue-copy-revision:'||copied.id::text
      from public.worker_quote_revisions where quote_id=copied.id and revision=copied.current_revision;
      update public.quote_invitations set status='quoted',responded_at=pg_catalog.now() where id=copied.new_invitation;
    end if;
  end loop;
  update private.marketplace_rescue_attempts set state=case when exists(select 1 from public.worker_quotes q where q.request_id=new_rescue_request_id and q.status='submitted') then 'customer_reviewing' else 'matching' end where id=attempt_id;
  perform private.marketplace_notify(source_request.customer_id,'rescue_started','Finding a replacement',
    'Warsha is looking for another eligible worker with the same request details.',pg_catalog.jsonb_build_object('requestId',new_rescue_request_id,'bookingId',p_booking_id),'rescue-started:'||p_booking_id::text);
  perform private.marketplace_record_event('system',null,'request',new_rescue_request_id,'rescue_started',
    pg_catalog.jsonb_build_object('sourceRequestId',source_request.id,'excludedProviderId',booking_row.provider_id),'rescue-started:'||p_booking_id::text);
  return new_rescue_request_id;
exception when others then
  if attempt_id is not null then update private.marketplace_rescue_attempts set state='failed',completed_at=pg_catalog.now() where id=attempt_id; end if;
  return null;
end;
$$;

create or replace function private.on_marketplace_booking_cancelled()
returns trigger language plpgsql security definer set search_path=''
as $$
declare uid uuid := (select auth.uid()); provider_uid uuid; actor_class text;
begin
  if old.status is distinct from 'cancelled' and new.status='cancelled' and new.marketplace_request_id is not null and uid is not null then
    select user_id into provider_uid from public.provider_profiles where id=new.provider_id;
    actor_class:=case when uid=new.customer_id then 'customer' when uid=provider_uid then 'worker' else 'system' end;
    insert into public.marketplace_cancellation_events(request_id,booking_id,actor_id,actor_class,phase,reason_code,reason_text,was_en_route,had_arrived,idempotency_key)
    values(new.marketplace_request_id,new.id,uid,actor_class,'booking',coalesce(new.cancellation_reason,'cancelled'),coalesce(new.cancellation_reason,''),
      old.status in ('provider_on_the_way','provider_arrived'),old.status='provider_arrived','booking-cancel:'||new.id::text||':'||uid::text)
    on conflict(actor_id,idempotency_key) do nothing;
    if uid=provider_uid then perform private.trigger_rescue_matching(new.id); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_booking_cancellation_rescue on public.bookings;
create trigger marketplace_booking_cancellation_rescue after update of status on public.bookings
for each row execute function private.on_marketplace_booking_cancelled();

create or replace function private.refresh_worker_marketplace_metrics(p_provider_id uuid default null)
returns integer
language plpgsql security definer set search_path=''
as $$
declare affected integer;
begin
  insert into private.worker_marketplace_metrics(provider_id,window_days,metrics,sample_size,as_of,policy_version)
  select p.id,90,
    pg_catalog.jsonb_build_object(
      'invitations',count(distinct i.id),
      'views',count(distinct i.id) filter(where i.viewed_at is not null),
      'quotes',count(distinct q.id),
      'wins',count(distinct q.id) filter(where q.status='selected'),
      'workerCancellations',(select count(*) from public.marketplace_cancellation_events c where c.actor_class='worker' and c.occurred_at>=pg_catalog.now()-interval '90 days' and c.booking_id in(select b.id from public.bookings b where b.provider_id=p.id)),
      'workerNoShows',(select count(*) from public.marketplace_no_show_events n where n.reported_party_class='worker' and n.reported_at>=pg_catalog.now()-interval '90 days' and n.reported_party_id=p.user_id)
    ),count(distinct i.id)::integer,pg_catalog.now(),(select policy_version from private.marketplace_configuration where singleton)
  from public.provider_profiles p
  left join public.quote_invitations i on i.provider_id=p.id and i.invited_at>=pg_catalog.now()-interval '90 days'
  left join public.worker_quotes q on q.invitation_id=i.id
  where p_provider_id is null or p.id=p_provider_id
  group by p.id,p.user_id
  on conflict(provider_id,window_days,policy_version) do update set metrics=excluded.metrics,sample_size=excluded.sample_size,as_of=excluded.as_of;
  get diagnostics affected=row_count;
  insert into private.worker_opportunity_state(provider_id,recent_invitations,recent_wins,last_opportunity_at,calculated_adjustment,as_of,policy_version)
  select m.provider_id,(m.metrics->>'invitations')::integer,(m.metrics->>'wins')::integer,
    (select max(i.invited_at) from public.quote_invitations i where i.provider_id=m.provider_id),
    greatest(-0.08::numeric,least(0.08::numeric,
      case when (m.metrics->>'invitations')::integer=0 then 0.04
      else 0.04-(m.metrics->>'wins')::numeric/nullif((m.metrics->>'invitations')::numeric,0)*0.08 end
    )),pg_catalog.now(),m.policy_version
  from private.worker_marketplace_metrics m where m.window_days=90 and (p_provider_id is null or m.provider_id=p_provider_id)
  on conflict(provider_id) do update set recent_invitations=excluded.recent_invitations,recent_wins=excluded.recent_wins,
    last_opportunity_at=excluded.last_opportunity_at,calculated_adjustment=excluded.calculated_adjustment,as_of=excluded.as_of,policy_version=excluded.policy_version;
  return affected;
end;
$$;

create or replace function private.refresh_worker_pricing_profiles(p_provider_id uuid default null)
returns integer
language plpgsql security definer set search_path=''
as $$
declare affected integer;
begin
  delete from private.worker_pricing_profiles where p_provider_id is null or provider_id=p_provider_id;
  insert into private.worker_pricing_profiles(
    provider_id,category_id,service_id,coarse_area_id,sample_size,median_minor,p25_minor,p75_minor,
    original_quote_median_minor,quote_to_final_variance,revision_frequency,last_completion_at,as_of,confidence_state,policy_version
  )
  select b.provider_id,s.category_id,b.service_id,r.coarse_area_id,count(*)::integer,
    percentile_cont(.5) within group(order by ps.provider_gross_minor)::bigint,
    percentile_cont(.25) within group(order by ps.provider_gross_minor)::bigint,
    percentile_cont(.75) within group(order by ps.provider_gross_minor)::bigint,
    percentile_cont(.5) within group(order by q.price_minor)::bigint,
    avg(abs(ps.provider_gross_minor-coalesce(q.price_minor,ps.provider_gross_minor))::numeric/nullif(coalesce(q.price_minor,ps.provider_gross_minor),0)),
    avg(case when q.current_revision>1 then 1 else 0 end),max(h.created_at),pg_catalog.now(),
    case when count(*)>=10 then 'sufficient' when count(*)>=3 then 'low' else 'neutral' end,
    (select policy_version from private.marketplace_configuration where singleton)
  from public.bookings b join public.services s on s.id=b.service_id
  join public.marketplace_requests r on r.id=b.marketplace_request_id
  join public.booking_price_snapshots ps on ps.booking_id=b.id and ps.is_current
  left join public.worker_quotes q on q.id=b.selected_worker_quote_id
  join lateral(select max(created_at) created_at from public.booking_status_history where booking_id=b.id and status='completed') h on true
  where b.status='completed' and h.created_at is not null and (p_provider_id is null or b.provider_id=p_provider_id)
  group by b.provider_id,s.category_id,b.service_id,r.coarse_area_id;
  get diagnostics affected=row_count;
  delete from private.marketplace_pricing_benchmarks;
  insert into private.marketplace_pricing_benchmarks(level,category_id,service_id,coarse_area_id,sample_size,median_minor,p25_minor,p75_minor,as_of,policy_version)
  select 'category_area',category_id,null,coarse_area_id,sum(sample_size)::integer,
    percentile_cont(.5) within group(order by median_minor)::bigint,
    percentile_cont(.25) within group(order by median_minor)::bigint,
    percentile_cont(.75) within group(order by median_minor)::bigint,pg_catalog.now(),max(policy_version)
  from private.worker_pricing_profiles group by category_id,coarse_area_id;
  return affected;
end;
$$;

create or replace function private.refresh_worker_capacity(p_provider_id uuid default null)
returns integer
language plpgsql security definer set search_path=''
as $$
declare affected integer;
begin
  delete from private.worker_capacity_projections where p_provider_id is null or provider_id=p_provider_id;
  insert into private.worker_capacity_projections(
    provider_id,bucket_start,committed_workload_minutes,travel_minutes,buffer_minutes,has_conflict,source_booking_version,as_of,expires_at
  )
  select b.provider_id,date_trunc('hour',(b.scheduled_date+b.scheduled_time) at time zone 'Africa/Cairo'),
    sum(coalesce(b.estimated_duration_minutes,d.estimated_duration_minutes))::integer,
    sum(coalesce(b.estimated_travel_before_minutes,0)+coalesce(b.estimated_travel_after_minutes,0))::integer,
    30,count(*)>1,md5(string_agg(b.id::text||':'||b.updated_at::text,',' order by b.id)),pg_catalog.now(),pg_catalog.now()+interval '15 minutes'
  from public.bookings b join public.services s on s.id=b.service_id
  left join private.marketplace_category_duration_defaults d on d.category_id=s.category_id
  where b.status in ('accepted','confirmed','provider_on_the_way','provider_arrived','job_started','work_in_progress')
    and b.deleted_at is null and (p_provider_id is null or b.provider_id=p_provider_id)
  group by b.provider_id,date_trunc('hour',(b.scheduled_date+b.scheduled_time) at time zone 'Africa/Cairo');
  get diagnostics affected=row_count;
  return affected;
end;
$$;

create or replace function private.lease_marketplace_jobs(p_lease_owner text,p_limit integer default 20)
returns setof private.marketplace_jobs
language sql security definer set search_path=''
as $$
  with due as (
    select id from private.marketplace_jobs
    where (state in ('pending','retryable_failed') and run_at<=pg_catalog.now())
      or (state='leased' and lease_expires_at<=pg_catalog.now())
    order by run_at,id for update skip locked limit greatest(1,least(coalesce(p_limit,20),100))
  )
  update private.marketplace_jobs j set state='leased',lease_owner=p_lease_owner,
    lease_expires_at=pg_catalog.now()+interval '60 seconds',attempt_count=attempt_count+1
  from due where j.id=due.id returning j.*
$$;

create or replace function private.complete_marketplace_job(p_job_id uuid,p_success boolean,p_error_code text default null)
returns void
language plpgsql security definer set search_path=''
as $$
declare job private.marketplace_jobs;
begin
  select * into job from private.marketplace_jobs where id=p_job_id for update;
  if job.id is null or job.state<>'leased' then raise exception 'Job lease unavailable' using errcode='40001'; end if;
  update private.marketplace_jobs set
    state=case when p_success then 'succeeded' when attempt_count>=maximum_attempts then 'terminal_failed' else 'retryable_failed' end,
    last_error_code=case when p_success then null else pg_catalog.left(coalesce(p_error_code,'unknown'),120) end,
    run_at=case when p_success then run_at else pg_catalog.now()+pg_catalog.make_interval(secs=>least(300,15*attempt_count)) end,
    lease_owner=null,lease_expires_at=null,completed_at=case when p_success or attempt_count>=maximum_attempts then pg_catalog.now() end
  where id=p_job_id;
end;
$$;

create or replace function private.run_marketplace_job(p_job_id uuid)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare job private.marketplace_jobs; succeeded boolean := true;
begin
  select * into job from private.marketplace_jobs where id=p_job_id and state='leased' for update;
  if job.id is null then raise exception 'Job lease unavailable' using errcode='40001'; end if;
  begin
    if job.job_kind='additional_wave' then perform private.create_marketplace_wave(job.request_id,'additional_wave',job.dedupe_key);
    elsif job.job_kind='expire_request' then perform private.expire_marketplace_request(job.request_id);
    elsif job.job_kind='expire_confirmation' then perform private.expire_selected_confirmation(job.request_id);
    elsif job.job_kind='rescue' then perform private.trigger_rescue_matching((select rescue_for_booking_id from public.marketplace_requests where id=job.request_id));
    elsif job.job_kind='refresh_metrics' then perform private.refresh_worker_marketplace_metrics(job.provider_id);
    elsif job.job_kind='refresh_pricing' then perform private.refresh_worker_pricing_profiles(job.provider_id);
    elsif job.job_kind='refresh_capacity' then perform private.refresh_worker_capacity(job.provider_id);
    else succeeded:=false;
    end if;
    perform private.complete_marketplace_job(p_job_id,succeeded,case when succeeded then null else 'unsupported_job_kind' end);
  exception when others then
    perform private.complete_marketplace_job(p_job_id,false,sqlstate);
    return false;
  end;
  return succeeded;
end;
$$;

create or replace function private.is_owned_marketplace_provider(p_provider_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.provider_profiles p where p.id=p_provider_id and p.user_id=(select auth.uid()) and p.deleted_at is null)
$$;
revoke all on function private.is_owned_marketplace_provider(uuid) from public,anon;
grant execute on function private.is_owned_marketplace_provider(uuid) to authenticated;

drop policy if exists marketplace_requests_customer_realtime_read on public.marketplace_requests;
create policy marketplace_requests_customer_realtime_read on public.marketplace_requests
for select to authenticated using(customer_id=(select auth.uid()));
drop policy if exists quote_invitations_worker_realtime_read on public.quote_invitations;
create policy quote_invitations_worker_realtime_read on public.quote_invitations
for select to authenticated using(private.is_owned_marketplace_provider(provider_id));
drop policy if exists worker_quotes_participant_realtime_read on public.worker_quotes;
create policy worker_quotes_participant_realtime_read on public.worker_quotes
for select to authenticated using(
  private.is_owned_marketplace_provider(provider_id)
  or exists(select 1 from public.marketplace_requests r where r.id=request_id and r.customer_id=(select auth.uid()))
);
drop policy if exists provider_emergency_categories_owner_read on public.provider_emergency_categories;
create policy provider_emergency_categories_owner_read on public.provider_emergency_categories
for select to authenticated using(private.is_owned_marketplace_provider(provider_id));

grant select on public.marketplace_requests,public.quote_invitations,public.worker_quotes,public.provider_emergency_categories to authenticated;

revoke all on function private.marketplace_distance_km(double precision,double precision,double precision,double precision) from public,anon,authenticated;
revoke all on function private.assert_marketplace_ready(text) from public,anon,authenticated;
revoke all on function private.marketplace_record_event(text,uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function private.marketplace_notify(uuid,text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function private.marketplace_request_start(public.marketplace_requests) from public,anon,authenticated;
revoke all on function private.create_marketplace_wave(uuid,text,text) from public,anon,authenticated;
revoke all on function private.start_marketplace_matching(uuid,text) from public,anon,authenticated;
revoke all on function private.validate_worker_quote(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.convert_marketplace_request(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function private.expire_marketplace_request(uuid) from public,anon,authenticated;
revoke all on function private.expire_quote_invitation(uuid) from public,anon,authenticated;
revoke all on function private.expire_worker_quote(uuid) from public,anon,authenticated;
revoke all on function private.expire_selected_confirmation(uuid) from public,anon,authenticated;
revoke all on function private.trigger_rescue_matching(uuid) from public,anon,authenticated;
revoke all on function private.on_marketplace_booking_cancelled() from public,anon,authenticated;
revoke all on function private.refresh_worker_marketplace_metrics(uuid) from public,anon,authenticated;
revoke all on function private.refresh_worker_pricing_profiles(uuid) from public,anon,authenticated;
revoke all on function private.refresh_worker_capacity(uuid) from public,anon,authenticated;
revoke all on function private.lease_marketplace_jobs(text,integer) from public,anon,authenticated;
revoke all on function private.complete_marketplace_job(uuid,boolean,text) from public,anon,authenticated;
revoke all on function private.run_marketplace_job(uuid) from public,anon,authenticated;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.preview_emergency_request(jsonb)',
    'public.create_marketplace_request(jsonb,text)',
    'public.edit_marketplace_request(uuid,integer,jsonb,text)',
    'public.cancel_marketplace_request(uuid,text,text)',
    'public.select_worker_quote(uuid,uuid,integer,text)',
    'public.retry_marketplace_request(uuid,text,text)',
    'public.report_worker_no_show(uuid,jsonb,text)',
    'public.create_comeback_request(uuid,jsonb,text)',
    'public.set_worker_emergency_category(text,boolean)',
    'public.view_quote_invitation(uuid)',
    'public.submit_worker_quote(uuid,jsonb,text)',
    'public.revise_worker_quote(uuid,jsonb,text)',
    'public.decline_quote_invitation(uuid,text,text)',
    'public.withdraw_worker_quote(uuid,text,text)',
    'public.confirm_selected_quote(uuid,uuid,text)',
    'public.accept_emergency_request(uuid,text)',
    'public.report_worker_running_late(uuid,integer,text,text,text)',
    'public.report_customer_no_show(uuid,jsonb,text)',
    'public.get_customer_marketplace_request(uuid)',
    'public.get_customer_quotes(uuid,text)',
    'public.get_worker_quote_invitations(timestamptz,integer)',
    'public.get_worker_quote(uuid)',
    'public.get_marketplace_capabilities()'
  ] loop
    execute 'revoke all on function '||signature||' from public,anon';
    execute 'grant execute on function '||signature||' to authenticated';
  end loop;
end $$;
