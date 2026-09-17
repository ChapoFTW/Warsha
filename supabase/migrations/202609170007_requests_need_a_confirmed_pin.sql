-- A request goes where the Customer confirmed it goes.
--
-- `create_marketplace_request` accepted any address with a latitude and a
-- longitude, and recorded its location as `verified`. But a Customer can write
-- `latitude`, `longitude`, `pin_source` and `pin_confirmed_at` straight into
-- their own address row: RLS lets them update it, and nothing stopped those four
-- columns. So "verified" meant "somebody typed numbers", and the same forged
-- `pin_confirmed_at` also made a Professional's work location verified, because
-- `follow_matching_anchor_address` trusts it.
--
-- The owner's rule, 2026-09-17: a request requires authoritative confirmed
-- coordinates. A map that cannot draw is not a failure if the address was
-- resolved (the geocoder's coordinates, confirmed); a geocoder that cannot
-- resolve is a recoverable block — nothing is invented and nothing is sent.
--
-- 1. Only `confirm_my_service_address` confirms a pin. A guard on addresses
--    keeps an end user's direct write from setting `pin_confirmed_at` or
--    `pin_source`; a direct change of coordinates, or clearing the
--    confirmation, withdraws it. System and staff writes (no end user) are untouched.
-- 2. `create_marketplace_request` requires the confirmation, not just numbers.
--
-- Nothing is backfilled. An address whose coordinates were never confirmed
-- stays unconfirmed, and its owner is asked to confirm it; inventing a
-- confirmation for it would be exactly the defect this closes.

create or replace function private.guard_address_pin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or pg_catalog.current_setting('warsha.confirming_pin', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.pin_confirmed_at := null;
    new.pin_source := null;
  elsif (new.latitude, new.longitude) is distinct from (old.latitude, old.longitude)
     or new.pin_confirmed_at is null then
    -- The pin moved without being confirmed, or its owner withdrew the
    -- confirmation: either way it is no longer confirmed. Withdrawing can only
    -- lower trust, so it is allowed; granting it is not.
    new.pin_confirmed_at := null;
    new.pin_source := null;
  else
    new.pin_confirmed_at := old.pin_confirmed_at;
    new.pin_source := old.pin_source;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_address_pin() from public, anon, authenticated;

create trigger addresses_guard_pin
  before insert or update on public.addresses
  for each row execute function private.guard_address_pin();

CREATE OR REPLACE FUNCTION public.confirm_my_service_address(p_address_id uuid, p_latitude double precision, p_longitude double precision, p_pin_source text, p_building text DEFAULT NULL::text, p_floor text DEFAULT NULL::text, p_apartment text DEFAULT NULL::text, p_landmark text DEFAULT NULL::text, p_service_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_pin_source is null or p_pin_source not in ('device_location', 'address_search', 'manual_pin') then
    raise exception 'Invalid pin source' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'A confirmed map pin is required' using errcode = '22023';
  end if;

  -- The one place a pin becomes confirmed. The guard on addresses lets this
  -- write through and nothing else; the flag is transaction-local and cleared
  -- straight after.
  perform pg_catalog.set_config('warsha.confirming_pin', 'on', true);
  update public.addresses
  set latitude = p_latitude,
      longitude = p_longitude,
      pin_source = p_pin_source,
      pin_confirmed_at = pg_catalog.now(),
      building = coalesce(nullif(pg_catalog.btrim(p_building), ''), building),
      floor = coalesce(nullif(pg_catalog.btrim(p_floor), ''), floor),
      apartment = coalesce(nullif(pg_catalog.btrim(p_apartment), ''), apartment),
      landmark = coalesce(nullif(pg_catalog.btrim(p_landmark), ''), landmark),
      service_notes = coalesce(nullif(pg_catalog.btrim(p_service_notes), ''), service_notes),
      updated_at = pg_catalog.now()
  where id = p_address_id and customer_id = v_user and deleted_at is null
  returning id into v_id;
  perform pg_catalog.set_config('warsha.confirming_pin', 'off', true);

  if v_id is null then
    raise exception 'Address not found' using errcode = '42501';
  end if;

  update public.account_onboarding
  set customer_state = 'complete', updated_at = pg_catalog.now()
  where user_id = v_user;

  return pg_catalog.jsonb_build_object('addressId', v_id, 'confirmed', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_marketplace_request(p_request jsonb, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Coordinates are not enough: they must be ones the Customer confirmed
  -- through confirm_my_service_address. A coordinate a client wrote straight
  -- into the row, or one left over after the pin moved, is not a location
  -- anybody confirmed.
  if address_row.latitude is null or address_row.longitude is null or address_row.pin_confirmed_at is null
  then raise exception 'Verified request location required' using errcode='55000'; end if;
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
  when sqlstate '42501' or sqlstate '22023' or sqlstate '55000' or sqlstate 'P0001'
    or sqlstate 'WR001' or sqlstate 'WR002' then raise;
  when others then raise exception 'Unable to create marketplace request' using errcode='P0001';
end;
$function$;
