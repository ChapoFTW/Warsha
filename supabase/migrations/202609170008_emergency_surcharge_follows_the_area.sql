-- The urgent-service surcharge a Customer approves is the price where they are.
--
-- `preview_emergency_request` quoted the highest `emergency_surcharge_egp` of any
-- urgent-service Professional in the country offering the service. A Customer
-- in Zamalek could be asked to approve a surcharge set by somebody in
-- Alexandria who would never be sent to them. The amount approved is a ceiling
-- (`accept_emergency_request` lets a Professional take the job only if their
-- own surcharge is within it), so an inflated ceiling is an inflated price.
--
-- The owner's rule, 2026-09-17: derive it from the Customer's area and the same
-- rules the request uses; no client pricing authority; if there is no price
-- for that area, say so truthfully.
--
-- 1. `private.emergency_provider_surcharges` names the Professionals an urgent
--    request from this confirmed location could be sent to -- the tests
--    `create_marketplace_wave` applies to an urgent request: available,
--    discoverable, urgent service on for the category, offering the service,
--    covering the area, compatible with the payment choice, and a verified
--    work location within their radius at the widest wave -- and each one's
--    surcharge, chosen exactly as `accept_emergency_request` chooses it.
-- 2. The preview needs the address, requires its pin to be confirmed, approves
--    the highest of those surcharges, and refuses (`Emergency service
--    unavailable`) when nobody could be sent. The approval records the address.
-- 3. `create_marketplace_request` refuses an approval made for another address.

alter table private.emergency_price_approvals
  add column if not exists address_id uuid references public.addresses(id) on delete cascade;

create or replace function private.emergency_provider_surcharges(
  p_category_id text,
  p_service_id uuid,
  p_provider_id uuid,
  p_governorate text,
  p_district text,
  p_latitude double precision,
  p_longitude double precision,
  p_payment_compatibility text
)
returns table(provider_id uuid, surcharge_minor bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
    (select pg_catalog.round(ps.emergency_surcharge_egp*100)::bigint
     from public.provider_services ps join public.services s on s.id=ps.service_id
     where ps.provider_id=p.id and ps.is_active and s.is_active and s.deleted_at is null
       and s.category_id=p_category_id and (p_service_id is null or s.id=p_service_id)
     order by (s.id=p_service_id) desc, s.id limit 1)
  from private.marketplace_configuration config
  join public.provider_profiles p on true
  join private.worker_matching_locations l on l.provider_id=p.id and l.verification_state='verified'
  where config.singleton
    and (p_provider_id is null or p.id=p_provider_id)
    and p.user_id is not null
    and p.is_available
    and (p.temporary_unavailable_until is null or p.temporary_unavailable_until <= pg_catalog.now())
    and private.is_provider_publicly_discoverable(p.id)
    and p.emergency_available
    and exists (select 1 from public.provider_emergency_categories e
      where e.provider_id=p.id and e.category_id=p_category_id and e.enabled)
    and exists (select 1 from public.provider_service_areas a
      where a.provider_id=p.id
        and pg_catalog.lower(pg_catalog.btrim(a.governorate)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_governorate,'')))
        and (a.district is null
          or pg_catalog.lower(pg_catalog.btrim(a.district)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_district,'')))))
    and exists (select 1 from public.provider_services ps join public.services s on s.id=ps.service_id
      where ps.provider_id=p.id and ps.is_active and s.is_active and s.deleted_at is null
        and s.category_id=p_category_id and (p_service_id is null or s.id=p_service_id))
    and (p_payment_compatibility <> 'cash' or not private.provider_cash_restricted(p.id))
    -- The widest an urgent request is ever sent: the last wave's radius,
    -- narrowed by the Professional's own.
    and private.marketplace_distance_km(p_latitude,p_longitude,l.latitude,l.longitude)
      <= least(coalesce(p.service_radius_km,config.maximum_radius_km), config.maximum_radius_km,
               (select max(r) from pg_catalog.unnest(config.wave_radii_km) r))
$$;
revoke all on function private.emergency_provider_surcharges(text,uuid,uuid,text,text,double precision,double precision,text)
  from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.preview_emergency_request(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare
  uid uuid := (select auth.uid());
  category_id text := p_request->>'categoryId';
  service_id uuid := nullif(p_request->>'serviceId','')::uuid;
  provider_id uuid := nullif(p_request->>'targetedProviderId','')::uuid;
  address_id uuid := nullif(p_request->>'addressId','')::uuid;
  payment text := coalesce(p_request->>'paymentCompatibility','either');
  config private.marketplace_configuration;
  address_row public.addresses;
  surcharge bigint;
  approval_token text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if payment not in ('cash','online','either') then raise exception 'Invalid marketplace request' using errcode='22023'; end if;
  config := private.assert_marketplace_ready(category_id);
  perform public.ensure_customer_profile();

  -- The price depends on where the job is, so there is no price without a
  -- place the Customer confirmed.
  select * into address_row from public.addresses a
  where a.id=address_id and a.customer_id=uid and a.deleted_at is null;
  if address_row.id is null then raise exception 'Address not found' using errcode='42501'; end if;
  if address_row.latitude is null or address_row.longitude is null or address_row.pin_confirmed_at is null
  then raise exception 'Verified request location required' using errcode='55000'; end if;

  select max(c.surcharge_minor) into surcharge
  from private.emergency_provider_surcharges(category_id, service_id, provider_id,
    address_row.governorate, address_row.district, address_row.latitude, address_row.longitude, payment) c
  where c.surcharge_minor is not null;
  if surcharge is null then raise exception 'Emergency service unavailable' using errcode='22023'; end if;

  approval_token := pg_catalog.encode(extensions.gen_random_bytes(24),'hex');
  insert into private.emergency_price_approvals(customer_id,provider_id,category_id,service_id,address_id,surcharge_minor,pricing_version,token,expires_at)
  values(uid,provider_id,category_id,service_id,address_id,surcharge,config.policy_version,approval_token,pg_catalog.now()+interval '5 minutes');
  return pg_catalog.jsonb_build_object(
    'approvalToken',approval_token,'approvalVersion',config.policy_version,
    'surchargeMinor',surcharge,'currency','EGP','expiresAt',pg_catalog.now()+interval '5 minutes'
  );
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
      -- The amount was worked out for one place. Another address is another price.
      or approval.address_id is distinct from address_id
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
