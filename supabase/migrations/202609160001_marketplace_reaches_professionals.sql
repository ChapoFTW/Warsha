-- A request for quotes reaches the Professionals who cover it.
--
-- `202608250004_marketplace_request_readiness` turned the marketplace on. Every
-- request it accepts is matched by `private.create_marketplace_wave`, and that
-- function built its candidate pool with
--
--   join private.worker_matching_locations l on l.provider_id=p.id ...
--   where distance_km is not null and distance_km <= allowed_radius
--
-- `worker_matching_locations` is WES-008's canonical matching anchor. It has
-- exactly one writer in this repository — the WES-008 backfill, which copied
-- service-area coordinates — and no product path has ever written a service-area
-- coordinate: `save_provider_foundation` inserts them as NULL. So the join was
-- empty everywhere the product is used, every pool was empty, and every request
-- expired having invited nobody. The table was right; nothing filled it.
--
-- The rule this migration implements was decided by the owner, not inferred:
--
--   NORMAL / SCHEDULED   service area = eligibility; no radius cap; distance is
--                        private ranking only.
--   EMERGENCY            service area = eligibility; the emergency radius is an
--                        ADDITIONAL constraint; distance ranks within the
--                        eligible set.
--   ALWAYS               proximity never expands eligibility beyond the declared
--                        service area, and no distance — exact, rounded or
--                        bucketed — leaves the database.
--
-- Urgency is `flow_kind = 'emergency'`. Every other flow is planned work:
-- `get_quotes` whatever its `schedule_kind`, `browse_worker` (targeted),
-- `rescue` (it copies `schedule_kind`, never `flow_kind`) and `comeback`.
--
-- What changes, in order:
--
--   1. The anchor records which confirmed address it came from, and whether a
--      Professional confirmed it as their work location or migration inferred it.
--   2. The anchor follows its address: re-pinned, it follows; unpinned, it goes
--      stale; removed, it goes. A default-address change touches nothing.
--   3. `confirm_my_work_location` is the writer the "Your work location" step
--      was always missing. The step no longer makes that address the default,
--      which failed outright for a Customer who already had one.
--   4. Existing Professionals are backfilled from the addresses they confirmed,
--      recorded as inferred — never as confirmed work locations.
--   5. Matching: eligibility by declared area, radius only for emergency.
--   6. Discovery answers no distance question.
--   7. The worker's address step means the work location.
--   8. Anonymization, export and the data inventory know the anchor exists.
--   9. Service-area coordinates are retired as an authority.
--
-- See docs/decisions/provider-distance-is-never-known.md.

-- ---------------------------------------------------------------------------
-- 1. The anchor says where it came from
-- ---------------------------------------------------------------------------

-- Rows derived from service-area coordinates are copies of a column no product
-- path ever wrote. They are not somebody's confirmed location, they cannot be
-- given an address to point at, and section 9 retires the column they came
-- from. Removed so the rebuilt authority starts from confirmed pins only.
do $$
declare v_count integer;
begin
  delete from private.worker_matching_locations where source = 'verified_service_area';
  get diagnostics v_count = row_count;
  raise notice 'worker_matching_locations: removed % row(s) derived from service-area coordinates', v_count;
end;
$$;

alter table private.worker_matching_locations
  add column address_id uuid references public.addresses(id) on delete cascade;

alter table private.worker_matching_locations
  drop constraint worker_matching_locations_source_check;

-- verified_profile            the Professional confirmed this pin as where they
--                             work, through the work-location step.
-- inferred_confirmed_address  migration chose one of their confirmed addresses
--                             because they had no anchor. True as far as it
--                             goes, and says no more than that.
-- operations                  reserved for a staff correction. Nothing writes it
--                             yet.
alter table private.worker_matching_locations
  add constraint worker_matching_locations_source_check
  check (source in ('verified_profile', 'inferred_confirmed_address', 'operations'));

alter table private.worker_matching_locations
  add constraint worker_matching_locations_address_provenance
  check (source = 'operations' or address_id is not null);

create index worker_matching_locations_address_idx
  on private.worker_matching_locations (address_id)
  where address_id is not null;

comment on table private.worker_matching_locations is
  'WES-008 matching anchor: where a Professional is based for work. Private. '
  'Orders matching candidates and bounds emergency travel; never decides planned '
  'eligibility and never leaves the database as a coordinate or a distance.';
comment on column private.worker_matching_locations.address_id is
  'The confirmed address this anchor mirrors. The anchor follows it and is '
  'removed with it.';

-- ---------------------------------------------------------------------------
-- 2. The anchor follows its address, and nothing else
-- ---------------------------------------------------------------------------
--
-- An anchor is a copy, and a copy that outlives the truth it copied is worse
-- than none: matching would rank somebody by a place they told Warsha they
-- left. So the one address it mirrors drives it, and only through the columns
-- that mean location. `is_default` is deliberately not among them — which
-- address somebody books to by default says nothing about where they work.
--
--   soft-deleted            the anchor is deleted.
--   pin present, confirmed  the anchor takes the pin and is verified.
--   pin cleared/unconfirmed the anchor goes stale: kept, so the step still
--                           reads as done, but matching stops using it.
--
-- A `rejected` anchor is never revived by an address edit.

create or replace function private.follow_matching_anchor_address()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    delete from private.worker_matching_locations where address_id = new.id;
    return null;
  end if;

  if new.pin_confirmed_at is not null and new.latitude is not null and new.longitude is not null then
    update private.worker_matching_locations
    set latitude = new.latitude,
        longitude = new.longitude,
        verification_state = 'verified',
        updated_at = pg_catalog.now()
    where address_id = new.id
      and verification_state <> 'rejected'
      and (latitude, longitude, verification_state)
        is distinct from (new.latitude, new.longitude, 'verified');
  else
    update private.worker_matching_locations
    set verification_state = 'stale', updated_at = pg_catalog.now()
    where address_id = new.id and verification_state = 'verified';
  end if;
  return null;
end;
$$;

revoke all on function private.follow_matching_anchor_address() from public, anon, authenticated;

create trigger addresses_follow_matching_anchor
  after update of latitude, longitude, pin_confirmed_at, deleted_at on public.addresses
  for each row
  when (old.latitude is distinct from new.latitude
     or old.longitude is distinct from new.longitude
     or old.pin_confirmed_at is distinct from new.pin_confirmed_at
     or (old.deleted_at is null and new.deleted_at is not null))
  execute function private.follow_matching_anchor_address();

-- ---------------------------------------------------------------------------
-- 3. The writer the work-location step was missing
-- ---------------------------------------------------------------------------
--
-- Confirms the pin exactly as `confirm_my_service_address` always has — the
-- same validation, the same onboarding effect — and then records that address
-- as this Professional's anchor. One transaction: an anchor never points at a
-- pin that failed to confirm, and a confirmed work location never lacks one.
--
-- The address book keeps calling `confirm_my_service_address`, which does NOT
-- move the anchor. Adding "Mum's flat" is not moving where you work.
--
-- Returns no coordinate. The caller supplied the pin; nothing about the anchor
-- needs to travel back.

create or replace function public.confirm_my_work_location(
  p_address_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_pin_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_provider uuid;
  v_address public.addresses;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select p.id into v_provider
  from public.provider_profiles p
  where p.user_id = v_user and p.deleted_at is null;
  if v_provider is null then
    raise exception 'A professional profile is required' using errcode = '42501';
  end if;

  perform public.confirm_my_service_address(p_address_id, p_latitude, p_longitude, p_pin_source);

  select * into v_address from public.addresses a
  where a.id = p_address_id and a.customer_id = v_user and a.deleted_at is null;

  insert into private.worker_matching_locations
    (provider_id, latitude, longitude, source, verification_state, address_id, updated_at)
  values
    (v_provider, v_address.latitude, v_address.longitude, 'verified_profile', 'verified',
     v_address.id, pg_catalog.now())
  on conflict (provider_id) do update
  set latitude = excluded.latitude,
      longitude = excluded.longitude,
      source = excluded.source,
      verification_state = excluded.verification_state,
      address_id = excluded.address_id,
      updated_at = excluded.updated_at;

  return pg_catalog.jsonb_build_object('addressId', v_address.id, 'confirmed', true);
end;
$$;

revoke all on function public.confirm_my_work_location(uuid, double precision, double precision, text)
  from public, anon;
grant execute on function public.confirm_my_work_location(uuid, double precision, double precision, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Existing Professionals: inferred, and recorded as inferred
-- ---------------------------------------------------------------------------
--
-- Every Professional who has confirmed an address but has no anchor gets one,
-- from the address most likely to be where they work:
--
--   1. an address labelled 'Work location' — the label only the work-location
--      step writes, though a person could type it too, which is why even this
--      is recorded as inferred rather than confirmed;
--   2. otherwise their default address;
--   3. otherwise the address they confirmed most recently.
--
-- The population is exactly the one the old address gate passed: a Professional
-- with any confirmed address. Section 7 makes that gate read the anchor, so this
-- is also what keeps every Professional who had passed it passing it.
--
-- Soft-deleted Professional profiles are skipped: nothing will match them, and
-- a location nobody needs is a location nobody should hold.
--
-- A function rather than an anonymous block, so the rule is tested rather than
-- trusted, and so a later operator can re-run it and read the counts. It never
-- replaces an anchor that exists, so re-running it is safe.

create or replace function private.infer_missing_matching_anchors()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  with chosen as (
    select distinct on (p.id)
      p.id as provider_id, a.id as address_id, a.latitude, a.longitude,
      case
        when a.label = 'Work location' then 'workLocationLabel'
        when a.is_default then 'defaultAddress'
        else 'mostRecentConfirmed'
      end as rule
    from public.provider_profiles p
    join public.addresses a
      on a.customer_id = p.user_id
     and a.deleted_at is null
     and a.pin_confirmed_at is not null
     and a.latitude is not null and a.longitude is not null
    where p.deleted_at is null
      and not exists (select 1 from private.worker_matching_locations l where l.provider_id = p.id)
    order by p.id, (a.label = 'Work location') desc, a.is_default desc,
      a.pin_confirmed_at desc, a.created_at desc, a.id
  ), inserted as (
    insert into private.worker_matching_locations
      (provider_id, latitude, longitude, source, verification_state, address_id)
    select provider_id, latitude, longitude, 'inferred_confirmed_address', 'verified', address_id
    from chosen
    on conflict (provider_id) do nothing
    returning provider_id
  )
  select pg_catalog.jsonb_build_object(
    'workLocationLabel', pg_catalog.count(*) filter (where c.rule = 'workLocationLabel'),
    'defaultAddress', pg_catalog.count(*) filter (where c.rule = 'defaultAddress'),
    'mostRecentConfirmed', pg_catalog.count(*) filter (where c.rule = 'mostRecentConfirmed'))
  into v_result
  from chosen c join inserted i on i.provider_id = c.provider_id;
  return v_result;
end;
$$;

revoke all on function private.infer_missing_matching_anchors() from public, anon, authenticated;

do $$
begin
  raise notice 'worker_matching_locations inferred: %', private.infer_missing_matching_anchors();
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Eligibility is the declared service area; proximity only ranks
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.create_marketplace_wave(p_request_id uuid, p_reason text, p_idempotency_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      -- LEFT, not inner. The anchor orders candidates and bounds emergency
      -- travel; it is not what makes a Professional eligible for planned work.
      -- As an inner join over a table no product path ever wrote, it made every
      -- pool empty and every request expire with nobody invited.
      left join private.worker_matching_locations l on l.provider_id=p.id and l.verification_state='verified'
      left join private.worker_opportunity_state o on o.provider_id=p.id
      where p.id is distinct from request_row.excluded_provider_id
        and (request_row.targeted_provider_id is null or p.id=request_row.targeted_provider_id)
        and p.user_id is not null
        and p.is_available
        and (p.temporary_unavailable_until is null or p.temporary_unavailable_until <= pg_catalog.now())
        and private.is_provider_publicly_discoverable(p.id)
        -- Eligibility is the area the Professional declared, for every kind of
        -- request: "the governorate you take jobs in" and "the district you
        -- cover inside it". An area with no district covers the whole
        -- governorate. Proximity never widens this.
        and exists (
          select 1 from public.provider_service_areas a
          where a.provider_id=p.id
            and pg_catalog.lower(pg_catalog.btrim(a.governorate))
              = pg_catalog.lower(pg_catalog.btrim(coalesce(request_row.approximate_governorate,'')))
            and (a.district is null
              or pg_catalog.lower(pg_catalog.btrim(a.district))
                = pg_catalog.lower(pg_catalog.btrim(coalesce(request_row.approximate_district,''))))
        )
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
          -- Unknown proximity scores the midpoint, not zero and not full. Zero
          -- would rank a Professional with no anchor below everyone nearby for
          -- the accident of a NULL; full would rank them above. Half is the
          -- honest prior for a distance nobody knows. Written as a CASE because
          -- GREATEST ignores NULL: coalesce(greatest(0, NULL), 0.5) is 0.
          + case when distance_km is null then 0.5::numeric
              else greatest(0::numeric,1-distance_km/nullif(allowed_radius,0)) end*0.27
          + greatest(-0.08::numeric,least(0.08::numeric,fairness_adjustment))
          + case when completed_jobs=0 then 0.04 else 0 end
        )::numeric,6) as final_score
      from pool
      -- Planned work: the declared area is sufficient, and a Professional who
      -- is farther away but covers the area stays eligible. Emergency: urgency
      -- adds an operational travel radius on top, so it needs a known anchor
      -- inside it. The radius only ever narrows eligibility.
      where (request_row.flow_kind <> 'emergency'
          or (distance_km is not null and distance_km <= allowed_radius))
        and not private.worker_capacity_conflicts(
          provider_id,private.marketplace_request_start(request_row),request_row.estimated_duration_minutes,
          location_row.latitude,location_row.longitude,null
        )
    )
    select *, row_number() over(
      order by
        case when request_row.flow_kind='emergency' then eta_minutes end asc nulls last,
        final_score desc, provider_id
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
      pg_catalog.jsonb_build_object('quality','eligible','distanceBand',case when candidate.distance_km is null then 'unknown' when candidate.distance_km<=5 then 'near' when candidate.distance_km<=15 then 'medium' else 'wide' end),
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
$function$;

-- ---------------------------------------------------------------------------
-- 6. Discovery answers no distance question
-- ---------------------------------------------------------------------------
--
-- Discovery computed distance from service-area coordinates, which nothing
-- writes, so it only ever returned null in the product. It is not re-pointed at
-- the anchor, because a caller of `search_providers` chooses where to stand:
-- the rounded kilometre it returned, the maximum-distance filter and the
-- distance sort are each a probe that, repeated from new points, recovers the
-- anchor — which for most Professionals is where they live. The card loses its
-- `distanceKm` key, the parameter that fed it goes, and the sort and filter are
-- refused by name rather than silently ignored.

drop function private.discovery_provider_card(public.provider_profiles, numeric);

CREATE FUNCTION private.discovery_provider_card(p_provider public.provider_profiles)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'id', p_provider.id,
    'displayName', p_provider.display_name,
    'professionKey', p_provider.profession_key,
    'primaryCategoryId', p_provider.primary_category_id,
    'ratingAverage', p_provider.rating_average,
    'reviewCount', p_provider.review_count,
    'completedJobs', p_provider.completed_jobs,
    'experienceYears', p_provider.experience_years,
    'startingPriceEgp', p_provider.starting_price_egp,
    'avatarRef', p_provider.avatar_url,
    'identityVerified', true,
    'skillCertificateVerified', p_provider.skill_certificate_verified,
    'professionalCertificateVerified', exists (
      select 1 from public.provider_certifications cert
      where cert.provider_id = p_provider.id and cert.status = 'approved'
        and cert.deleted_at is null
        and (cert.expires_at is null or cert.expires_at >= current_date)),
    'isAvailable', p_provider.is_available,
    'emergencyAvailable', p_provider.emergency_available,
    'responseTimeLabel', p_provider.response_time_label,
    -- Area LABEL only. The service area's latitude and longitude never leave
    -- the database in any WPS-020 path.
    'areaLabel', coalesce((
      select pg_catalog.concat_ws(', ', a.district, a.governorate)
      from public.provider_service_areas a
      where a.provider_id = p_provider.id order by a.id limit 1), p_provider.location_label),
    'languages', pg_catalog.to_jsonb(p_provider.languages),
    'specialties', pg_catalog.to_jsonb(p_provider.specialties)
    -- No distance, rounded or otherwise. The comment that stood here said a
    -- rounded scalar cannot be trilaterated; it can, when the caller chooses
    -- where to stand. See docs/decisions/provider-distance-is-never-known.md.
  )
$function$;

-- The replaced card was never callable by a client role; nor is this one.
revoke all on function private.discovery_provider_card(public.provider_profiles)
  from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_discovery_home(p_governorate text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_area text := nullif(pg_catalog.btrim(coalesce(p_governorate,'')), '');
begin
  return pg_catalog.jsonb_build_object(
    'personalized', v_uid is not null,
    -- "Who is available near you?"
    'availableNearby', coalesce((
      select pg_catalog.jsonb_agg(private.discovery_provider_card(p)
        order by p.rating_average desc, p.id)
      from public.provider_profiles p
      where private.is_provider_publicly_discoverable(p.id)
        and p.is_available
        and (p.temporary_unavailable_until is null or p.temporary_unavailable_until <= pg_catalog.now())
        and (v_area is null or exists (
          select 1 from public.provider_service_areas a
          where a.provider_id = p.id and a.governorate = v_area))
      limit 8
    ), '[]'::jsonb),
    -- "Who has a proven record?" — declared, verifiable facts only.
    'trustedWorkers', coalesce((
      select pg_catalog.jsonb_agg(private.discovery_provider_card(p)
        order by p.completed_jobs desc, p.rating_average desc, p.id)
      from public.provider_profiles p
      where private.is_provider_publicly_discoverable(p.id)
        and p.skill_certificate_verified and p.completed_jobs > 0
      limit 8
    ), '[]'::jsonb),
    -- "Workers you saved." Reuses public.favourites; no second store.
    'favourites', case when v_uid is null then '[]'::jsonb else coalesce((
      select pg_catalog.jsonb_agg(private.discovery_provider_card(p) order by f.created_at desc)
      from public.favourites f
      join public.provider_profiles p on p.id = f.provider_id
      where f.customer_id = v_uid and private.is_provider_publicly_discoverable(p.id)
    ), '[]'::jsonb) end,
    -- "Continue where you left off."
    'recentlyViewed', case when v_uid is null then '[]'::jsonb else coalesce((
      select pg_catalog.jsonb_agg(private.discovery_provider_card(p) order by v.viewed_at desc)
      from public.user_recently_viewed_providers v
      join public.provider_profiles p on p.id = v.provider_id
      where v.user_id = v_uid and private.is_provider_publicly_discoverable(p.id)
      limit 8
    ), '[]'::jsonb) end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_recently_viewed()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return coalesce((
    select pg_catalog.jsonb_agg(private.discovery_provider_card(p) order by v.viewed_at desc)
    from public.user_recently_viewed_providers v
    join public.provider_profiles p on p.id = v.provider_id
    where v.user_id = v_uid
      -- Re-checked at read time. A worker who has since been hidden disappears
      -- from history rather than lingering as a stale card.
      and private.is_provider_publicly_discoverable(p.id)
  ), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_providers(p_query text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb, p_sort text DEFAULT 'recommended'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 500);
  v_sort text := coalesce(p_sort, 'recommended');
  v_tsquery tsquery;
  v_prefix_tsquery tsquery;
  v_prefix_text text;
  v_mode text := 'browse';
  v_total integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_approximate boolean := false;
  v_config private.marketplace_configuration;
  v_fairness_bound numeric := 0.08;
  v_new_worker_bound numeric := 0.04;
  v_category text := nullif(p_filters->>'categoryId','');
  v_service uuid := nullif(p_filters->>'serviceId','')::uuid;
  v_governorate text := nullif(p_filters->>'governorate','');
  v_min_rating numeric := coalesce(nullif(p_filters->>'minimumRating','')::numeric, 0);
  v_min_jobs integer := coalesce(nullif(p_filters->>'minimumCompletedJobs','')::integer, 0);
  v_max_distance numeric := nullif(p_filters->>'maximumDistanceKm','')::numeric;
  v_available boolean := coalesce(nullif(p_filters->>'availableNow','')::boolean, false);
  v_skill boolean := coalesce(nullif(p_filters->>'skillCertificateVerified','')::boolean, false);
  v_certificate boolean := coalesce(nullif(p_filters->>'professionalCertificateVerified','')::boolean, false);
  v_emergency boolean := coalesce(nullif(p_filters->>'emergencyAvailable','')::boolean, false);
  v_pricing text := nullif(p_filters->>'pricingType','');
  v_language text := nullif(p_filters->>'language','');
begin
  if (select auth.uid()) is not null then
    perform private.enforce_rate_limit('discovery_search');
  end if;

  if v_sort not in ('recommended','distance','rating','most_reviewed','availability') then
    raise exception 'Unsupported sort' using errcode='22023';
  end if;
  -- Discovery answers no distance question, from any point.
  --
  -- Proximity comes from a Professional's private matching anchor, which is
  -- where they are based for work. A caller here chooses the query point
  -- freely, so any distance-shaped answer is a probe: a rounded distance flips
  -- at a known radius, a maximum-distance filter is a yes/no for a circle, and
  -- a distance sort reveals which of two anchors is closer. Each of those can
  -- be repeated from new points until the anchor is recovered. Ranking by
  -- proximity happens in matching, from a request's server-held location, and
  -- nothing about it leaves the database.
  if v_sort = 'distance' then
    raise exception 'Distance sorting is not available' using errcode='22023';
  end if;
  if v_max_distance is not null then
    raise exception 'Distance filtering is not available' using errcode='22023';
  end if;

  select * into v_config from private.marketplace_configuration limit 1;
  if v_config.ranking_policy is not null then
    v_fairness_bound := coalesce((v_config.ranking_policy->>'fairnessBound')::numeric, 0.08);
    v_new_worker_bound := coalesce((v_config.ranking_policy->>'newWorkerBound')::numeric, 0.04);
  end if;

  if pg_catalog.length(v_query) > 0 then
    v_query := pg_catalog.left(v_query, 100);
    v_tsquery := pg_catalog.websearch_to_tsquery('simple'::pg_catalog.regconfig, v_query);

    -- `websearch_to_tsquery` produces whole lexemes, so "electrical" matched
    -- and "electric" found nothing -- which is most of what a person types
    -- while they are still typing. This builds the same query again as a
    -- prefix match.
    --
    -- The input is stripped of every character `tsquery` treats as an operator
    -- before it is parsed, so a query cannot smuggle syntax in. Terms shorter
    -- than two characters are dropped: "a:*" matches a large fraction of the
    -- catalogue and means nothing. Nothing is whitelisted by alphabet, because
    -- a whitelist that has to name every script is a whitelist that will
    -- forget Arabic.
    v_prefix_text := pg_catalog.array_to_string(
      array(
        select term || ':*'
        from pg_catalog.unnest(
          pg_catalog.regexp_split_to_array(
            pg_catalog.btrim(pg_catalog.regexp_replace(
              v_query, '[&|!():*<>\\\\'']', ' ', 'g')),
            '\\s+')) as term
        where pg_catalog.length(term) >= 2
      ), ' & ');

    if pg_catalog.length(coalesce(v_prefix_text, '')) > 0 then
      begin
        v_prefix_tsquery := pg_catalog.to_tsquery(
          'simple'::pg_catalog.regconfig, v_prefix_text);
      exception when others then
        -- A query that will not parse is not an error the caller should see;
        -- the exact match still stands on its own.
        v_prefix_tsquery := null;
      end;
    end if;

    v_mode := 'exact';
  end if;

  -- A per-transaction working set. `on commit drop` removes it at the end of
  -- the statement's transaction; the guard keeps a long-lived transaction (a
  -- test run, a batched call) from raising a notice on every subsequent search.
  if pg_catalog.to_regclass('pg_temp.discovery_matches') is null then
    create temporary table discovery_matches (
      provider_id uuid primary key, score numeric
    ) on commit drop;
  end if;
  -- `where true` is not decoration. The API connects as `authenticator`, whose
  -- `session_preload_libraries` includes `safeupdate`, and that library rejects
  -- an unqualified DELETE with SQLSTATE 21000, "DELETE requires a WHERE
  -- clause". It rejects it inside a SECURITY DEFINER body too, because the
  -- library is loaded for the session rather than for the role the statement
  -- runs as. So this statement raised on every single call through PostgREST
  -- while passing every pgTAP run, which connects as a superuser that never
  -- loads the library. Emptying the whole working set is the intent; saying so
  -- explicitly is what keeps the intent reachable.
  delete from discovery_matches where true;

  insert into discovery_matches(provider_id, score)
  select p.id,
    0
  from public.provider_profiles p
  where private.is_provider_publicly_discoverable(p.id)
    and (v_category is null or p.primary_category_id = v_category or exists (
      select 1 from public.provider_services ps
      join public.services s on s.id = ps.service_id
      where ps.provider_id = p.id and ps.is_active and s.is_active and s.deleted_at is null
        and s.category_id = v_category))
    and (v_service is null or exists (
      select 1 from public.provider_services ps
      where ps.provider_id = p.id and ps.service_id = v_service and ps.is_active))
    and (v_governorate is null or exists (
      select 1 from public.provider_service_areas a
      where a.provider_id = p.id and a.governorate = v_governorate))
    and p.rating_average >= v_min_rating
    and p.completed_jobs >= v_min_jobs
    and (not v_available or (p.is_available
      and (p.temporary_unavailable_until is null or p.temporary_unavailable_until <= pg_catalog.now())))
    and (not v_skill or p.skill_certificate_verified)
    and (not v_emergency or p.emergency_available)
    and (not v_certificate or exists (
      select 1 from public.provider_certifications cert
      where cert.provider_id = p.id and cert.status = 'approved' and cert.deleted_at is null
        and (cert.expires_at is null or cert.expires_at >= current_date)))
    and (v_pricing is null or exists (
      select 1 from public.provider_services ps
      join public.services s on s.id = ps.service_id
      where ps.provider_id = p.id and ps.is_active and s.is_active and s.deleted_at is null
        and coalesce(ps.pricing_type, s.pricing_type) = v_pricing))
    and (v_language is null or v_language = any(p.languages))
    and (v_tsquery is null
      or p.search_document @@ v_tsquery
      or (v_prefix_tsquery is not null and p.search_document @@ v_prefix_tsquery)
      or exists (
        select 1 from pg_catalog.unnest(p.skills || p.specialties) tag
        where pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, tag) @@ v_tsquery
           or (v_prefix_tsquery is not null
               and pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, tag)
                   @@ v_prefix_tsquery))
      or exists (
        select 1 from public.provider_services ps
        join public.services s on s.id = ps.service_id
        join public.service_categories c on c.id = s.category_id
        where ps.provider_id = p.id and ps.is_active
          and s.is_active and s.deleted_at is null and c.is_active and c.deleted_at is null
          and (pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, s.name) @@ v_tsquery
            or pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, c.id) @@ v_tsquery
            or (v_prefix_tsquery is not null and (
                 pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, s.name)
                   @@ v_prefix_tsquery
              or pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, c.id)
                   @@ v_prefix_tsquery
              or pg_catalog.to_tsvector('simple'::pg_catalog.regconfig,
                   coalesce(s.name_ar, '')) @@ v_prefix_tsquery
              or pg_catalog.to_tsvector('simple'::pg_catalog.regconfig,
                   coalesce(s.name_fr, '')) @@ v_prefix_tsquery
              or pg_catalog.to_tsvector('simple'::pg_catalog.regconfig,
                   coalesce(c.name_ar, '')) @@ v_prefix_tsquery
              or pg_catalog.to_tsvector('simple'::pg_catalog.regconfig,
                   coalesce(c.name_fr, '')) @@ v_prefix_tsquery))
            -- The same words the clients already render, now where the query
            -- runs. Without these an Arabic customer searching for a service
            -- matched nothing at all: every other column in this predicate is
            -- Latin text.
            or pg_catalog.to_tsvector('simple'::pg_catalog.regconfig,
                 coalesce(s.name_ar, '')) @@ v_tsquery
            or pg_catalog.to_tsvector('simple'::pg_catalog.regconfig,
                 coalesce(s.name_fr, '')) @@ v_tsquery
            or pg_catalog.to_tsvector('simple'::pg_catalog.regconfig,
                 coalesce(c.name_ar, '')) @@ v_tsquery
            or pg_catalog.to_tsvector('simple'::pg_catalog.regconfig,
                 coalesce(c.name_fr, '')) @@ v_tsquery)));

  -- Spelling tolerance runs ONLY when the exact search found nothing, so a
  -- correctly spelled query never has its results diluted by near-misses.
  if v_mode = 'exact' and not exists (select 1 from discovery_matches) then
    insert into discovery_matches(provider_id, score)
    select p.id,
      0
    from public.provider_profiles p
    where private.is_provider_publicly_discoverable(p.id)
      and (v_governorate is null or exists (
        select 1 from public.provider_service_areas a
        where a.provider_id = p.id and a.governorate = v_governorate))
      and greatest(
        extensions.word_similarity(pg_catalog.lower(v_query), pg_catalog.lower(p.display_name)),
        extensions.word_similarity(pg_catalog.lower(v_query),
          pg_catalog.lower(coalesce(pg_catalog.array_to_string(p.skills,' '),''))),
        extensions.word_similarity(pg_catalog.lower(v_query),
          pg_catalog.lower(coalesce(pg_catalog.array_to_string(p.specialties,' '),'')))
      ) > 0.5;
    v_approximate := exists (select 1 from discovery_matches);
    if v_approximate then v_mode := 'approximate'; end if;
  end if;

  update discovery_matches m
  set score = private.discovery_recommended_score(
        p.rating_average, p.completed_jobs, null::numeric,
        coalesce(p.service_radius_km, 50), coalesce(o.calculated_adjustment, 0),
        v_fairness_bound, v_new_worker_bound)
  from public.provider_profiles p
  left join private.worker_opportunity_state o on o.provider_id = p.id
  where p.id = m.provider_id;

  select pg_catalog.count(*)::integer into v_total from discovery_matches;

  if v_mode = 'exact' and v_total = 0 then v_mode := 'empty'; end if;

  select coalesce(pg_catalog.jsonb_agg(card order by ordinal), '[]'::jsonb) into v_results
  from (
    select private.discovery_provider_card(p) as card,
      row_number() over (order by
        case when v_sort = 'rating' then p.rating_average end desc nulls last,
        case when v_sort = 'most_reviewed' then p.review_count end desc nulls last,
        case when v_sort = 'availability' then (case when p.is_available then 0 else 1 end) end asc nulls last,
        case when v_sort = 'recommended' then m.score end desc nulls last,
        m.score desc, p.rating_average desc, p.id
      ) as ordinal
    from discovery_matches m
    join public.provider_profiles p on p.id = m.provider_id
    order by ordinal
    limit v_limit offset v_offset
  ) page;

  return pg_catalog.jsonb_build_object(
    'mode', v_mode,
    'sort', v_sort,
    'totalCount', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'hasMore', v_offset + v_limit < v_total,
    'rankingPolicyVersion', v_config.ranking_policy->>'version',
    'results', v_results);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_discovery_filters()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'categories', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id, 'translationKey', c.translation_key, 'iconName', c.icon_name
      ) order by c.demand_rank nulls last, c.sort_order, c.id)
      from public.service_categories c
      where c.is_active and c.deleted_at is null
        and exists (
          select 1 from public.provider_profiles p
          where p.primary_category_id = c.id and private.is_provider_publicly_discoverable(p.id))
    ), '[]'::jsonb),
    'governorates', coalesce((
      select pg_catalog.jsonb_agg(distinct a.governorate order by a.governorate)
      from public.provider_service_areas a
      join public.provider_profiles p on p.id = a.provider_id
      where private.is_provider_publicly_discoverable(p.id)
        and pg_catalog.length(pg_catalog.btrim(a.governorate)) > 0
    ), '[]'::jsonb),
    'languages', coalesce((
      select pg_catalog.jsonb_agg(distinct language order by language)
      from public.provider_profiles p, pg_catalog.unnest(p.languages) language
      where private.is_provider_publicly_discoverable(p.id)
    ), '[]'::jsonb),
    'pricingTypes', coalesce((
      select pg_catalog.jsonb_agg(distinct coalesce(ps.pricing_type, s.pricing_type)
        order by coalesce(ps.pricing_type, s.pricing_type))
      from public.provider_services ps
      join public.services s on s.id = ps.service_id
      join public.provider_profiles p on p.id = ps.provider_id
      where ps.is_active and s.is_active and s.deleted_at is null
        and private.is_provider_publicly_discoverable(p.id)
    ), '[]'::jsonb),
    -- Distance is not offered: discovery answers no distance question, from
    -- any point, so no client is offered a sort the server refuses.
    'sorts', pg_catalog.jsonb_build_array(
      'recommended','rating','most_reviewed','availability'),
    'emergencyAvailable', exists (
      select 1 from public.provider_profiles p
      where p.emergency_available and private.is_provider_publicly_discoverable(p.id))
  )
$function$;

-- The same holds for a Customer's quotes. "Closest" ordered them by each
-- Professional's anchor distance from the request, and the Customer chooses
-- where the request is. Two quotes in that order say which of two Professionals
-- is nearer a point of the Customer's choosing; enough requests from enough
-- points say where each of them is. The sort is removed. "Fastest arrival"
-- stays: it orders by the arrival time each Professional declared in their own
-- quote, which is theirs to tell.

CREATE OR REPLACE FUNCTION public.get_customer_quotes(p_request_id uuid, p_sort text DEFAULT 'best_value'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(pg_catalog.jsonb_agg(item order by
    case when p_sort='lowest_price' then price_minor end asc,
    case when p_sort='highest_rated' then rating end desc,
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
      (p.rating_average/5*0.55 + least(1::numeric,p.completed_jobs::numeric/100)*0.15
        + greatest(0::numeric,1-q.price_minor::numeric/nullif(max(q.price_minor) over(),0))*0.20
        + greatest(0::numeric,1-coalesce(q.eta_minutes,1440)::numeric/1440)*0.10) as best_value
    from public.worker_quotes q
    join public.provider_profiles p on p.id=q.provider_id
    join public.marketplace_requests r on r.id=q.request_id and r.customer_id=(select auth.uid())
    where q.request_id=p_request_id and q.status in ('submitted','revised','selected')
  ) visible
$function$;

-- ---------------------------------------------------------------------------
-- 7. The worker's address step means the work location
-- ---------------------------------------------------------------------------
--
-- Both clients route a Professional to "Your work location" only while
-- `current_address_provided` is false, and it was true for anyone with any
-- confirmed address. A Customer who became a Professional was never shown the
-- step. The key keeps its name, because both clients and the staff vetting view
-- read it; what it measures is corrected.

CREATE OR REPLACE FUNCTION private.worker_activation_gates(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_provider public.provider_profiles;
  v_onboarding public.account_onboarding;
  v_auth record;
  v_identity private.provider_verification_identities;
  v_verification public.provider_verifications;
  v_record public.worker_criminal_record_submissions;
  v_trust text;
begin
  if p_user_id is null then return '{}'::jsonb; end if;

  select * into v_onboarding from public.account_onboarding o where o.user_id = p_user_id;
  select * into v_provider from public.provider_profiles p
   where p.user_id = p_user_id and p.deleted_at is null;
  select u.email, u.email_confirmed_at, u.phone, u.phone_confirmed_at,
         u.banned_until, u.deleted_at,
         exists (select 1 from private.worker_auth_identities i where i.user_id = u.id)
           as synthetic_identity
    into v_auth from auth.users u where u.id = p_user_id;
  select * into v_identity from private.provider_verification_identities i
   where i.provider_id = v_provider.id;
  select * into v_verification from public.provider_verifications v
   where v.provider_id = v_provider.id;
  select * into v_record from public.worker_criminal_record_submissions c
   where c.provider_id = v_provider.id and c.is_current;
  select t.trust_level into v_trust
  from public.trust_account_state t where t.user_id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'authenticated_account', v_auth.deleted_at is null,
    'phone_number_provided', private.account_contact_phone(p_user_id) is not null,
    -- A synthetic address is confirmed internally only so the password
    -- provider can issue a session. It is excluded from the contact-email gate
    -- rather than being represented as a verified communication method.
    'verified_email_if_present',
      coalesce(v_auth.synthetic_identity, false)
      or v_auth.email is null or v_auth.email_confirmed_at is not null,
    'worker_role_selected', coalesce(v_onboarding.intended_role = 'worker', false),
    'legal_name_complete',
      pg_catalog.length(pg_catalog.btrim(coalesce(v_identity.legal_name, ''))) between 2 and 120,
    'profile_photo', v_provider.avatar_url is not null,
    'professions_configured',
      pg_catalog.length(pg_catalog.btrim(coalesce(v_provider.profession_key, ''))) between 2 and 100,
    'services_configured', exists (
      select 1 from public.provider_services ps
      where ps.provider_id = v_provider.id and ps.is_active),
    'service_area_configured', exists (
      select 1 from public.provider_service_areas a
      where a.provider_id = v_provider.id
        and a.radius_km between 1 and 250
        and pg_catalog.length(pg_catalog.btrim(a.governorate)) > 0),
    -- The Professional's work location, not any address they happen to have.
    -- "Any confirmed address" let a Customer who became a Professional pass
    -- this step on the strength of their home pin, so they were never asked
    -- where they work and matching never learned it. A stale anchor still
    -- counts as provided: it was given, and staleness is matching's concern.
    'current_address_provided', exists (
      select 1 from private.worker_matching_locations l
      where l.provider_id = v_provider.id
        and l.verification_state <> 'rejected'),
    'national_id_front_uploaded', exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_front'),
    'national_id_back_uploaded', exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_back'),
    'national_id_approved', exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_front' and d.status = 'approved')
      and exists (
      select 1 from public.provider_verification_documents d
      where d.provider_id = v_provider.id and d.is_current
        and d.document_type = 'national_id_back' and d.status = 'approved'),
    'identity_fields_confirmed', v_identity.confirmed_at is not null,
    'criminal_record_uploaded', v_record.id is not null,
    'criminal_record_approved', coalesce(v_record.status in ('clear', 'approved'), false),
    'worker_agreement_accepted', v_onboarding.worker_agreement_accepted_at is not null,
    'document_processing_accepted', v_onboarding.document_processing_accepted_at is not null,
    'identity_verification_approved', coalesce(v_verification.status = 'approved', false),
    'not_banned', v_auth.banned_until is null or v_auth.banned_until <= pg_catalog.now(),
    'no_blocking_trust_action',
      coalesce(v_trust, 'good_standing') not in ('suspended', 'banned', 'under_investigation')
      and not exists (
        select 1 from public.trust_account_state t
        where t.user_id = p_user_id and (t.marketplace_removed or t.profile_hidden)),
    'provider_status_allowed', coalesce(v_provider.onboarding_status = 'approved', false),
    'not_deactivated', exists (
      select 1 from public.profiles pr
      where pr.id = p_user_id and pr.deactivated_at is null and pr.deleted_at is null),
    'no_deletion_pending', not exists (
      select 1 from public.account_deletion_requests r
      where r.user_id = p_user_id
        and r.status in ('cooling_off', 'blocked', 'legal_hold', 'approved', 'processing'))
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Privacy: the anchor is deleted, exported and inventoried
-- ---------------------------------------------------------------------------
--
-- Account deletion already removes it: `provider_profiles` and `addresses`
-- both cascade. Anonymization soft-deletes, so it deletes the anchor itself.
-- Deactivation keeps it, because deactivation is reversible and nothing
-- matches a deactivated account.

CREATE OR REPLACE FUNCTION private.privacy_anonymize_account(p_user_id uuid, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_config private.privacy_configuration;
  v_provider_id uuid;
  v_steps jsonb := '{}'::jsonb;
  v_count integer;
begin
  if private.privacy_hold_active(p_user_id, 'account') then
    raise exception 'Account is under a hold' using errcode = '42501';
  end if;

  select * into v_config from private.privacy_configuration where singleton;
  select p.id into v_provider_id from public.provider_profiles p where p.user_id = p_user_id;

  -- Profile: the name becomes a label, the face goes, the phone goes.
  update public.profiles
  set display_name = v_config.deleted_account_label_en,
      avatar_url = null,
      phone = null,
      deleted_at = coalesce(deleted_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('profile', v_count);

  -- Worker public presence: unpublished and stripped. The `deleted_at` here is
  -- WPS-010's own soft delete; this sets it rather than inventing a second one.
  if v_provider_id is not null then
    update public.provider_profiles
    set display_name = v_config.deleted_account_label_en,
        avatar_url = null,
        cover_image_url = null,
        -- Emptied rather than nulled: WPS-010 declares these NOT NULL with an
        -- empty default, and honouring that is the difference between removing
        -- somebody's biography and breaking the table it lived in.
        about = '',
        experience_summary = '',
        specialties = '{}',
        skills = '{}',
        location_label = null,
        is_published = false,
        is_available = false,
        deleted_at = coalesce(deleted_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = v_provider_id;
    get diagnostics v_count = row_count;
    v_steps := v_steps || pg_catalog.jsonb_build_object('provider_profile', v_count);

    update public.provider_portfolio
    set deleted_at = coalesce(deleted_at, pg_catalog.now()), updated_at = pg_catalog.now()
    where provider_id = v_provider_id and deleted_at is null;
    get diagnostics v_count = row_count;
    v_steps := v_steps || pg_catalog.jsonb_build_object('portfolio', v_count);
  end if;

  -- Matching anchor: genuinely deleted. It is a copy of where a Professional
  -- is based, it exists only to order and bound matching, and nothing has to
  -- keep it. Removed BEFORE the addresses below, because soft-deleting its
  -- address would remove it through the trigger and this step would then log
  -- zero for a row it did in fact take away.
  if v_provider_id is not null then
    delete from private.worker_matching_locations where provider_id = v_provider_id;
    get diagnostics v_count = row_count;
    v_steps := v_steps || pg_catalog.jsonb_build_object('matching_location', v_count);
  end if;

  -- Addresses: soft-deleted, not removed. A booking snapshot already froze the
  -- address it was served at, so the live row has no further purpose — but
  -- WPS-001 references it and a hard delete would break those references.
  update public.addresses
  set deleted_at = coalesce(deleted_at, pg_catalog.now())
  where customer_id = p_user_id and deleted_at is null;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('addresses', v_count);

  -- Personalization: genuinely deleted. It exists only to serve this account,
  -- so when the account goes there is nothing left for it to do.
  delete from public.user_recent_searches where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('recent_searches', v_count);

  delete from public.user_recently_viewed_providers where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('recently_viewed', v_count);

  delete from public.favourites where customer_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('favourites', v_count);

  delete from public.user_display_preferences where user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('display_preferences', v_count);

  -- Devices: revoked, not deleted. The hash is how WPS-014 proves it stopped
  -- sending to a device; deleting the row would erase that proof.
  update private.notification_device_tokens
  set revoked_at = coalesce(revoked_at, pg_catalog.now()),
      encrypted_token = null,
      device_label = null,
      updated_at = pg_catalog.now()
  where user_id = p_user_id and revoked_at is null;
  get diagnostics v_count = row_count;
  v_steps := v_steps || pg_catalog.jsonb_build_object('device_tokens', v_count);

  -- Notifications are deliberately NOT deleted, and the reason is worth
  -- stating because deleting them looks like the privacy-respecting choice.
  --
  -- WPS-014 declares `notification_source_links` immutable so a re-emitted
  -- event can never produce a duplicate years later, and that ledger holds a
  -- foreign key onto these rows. More importantly there is nothing personal
  -- left to remove: titles and bodies come from the generic event catalog, and
  -- `notification_safe_payload` already reduced `data` to resource UUIDs at
  -- write time. Deleting them would break an existing guarantee to remove
  -- nothing that identifies anybody.
  select pg_catalog.count(*) into v_count from public.notifications n where n.user_id = p_user_id;
  v_steps := v_steps || pg_catalog.jsonb_build_object('notifications_preserved', v_count);

  -- Identity documents: rows minimized, files handled by the storage runbook.
  -- The verification DECISION survives — it is why a badge was shown to
  -- customers who booked on the strength of it.
  if v_provider_id is not null then
    update public.provider_verification_documents
    set document_type = document_type
    where provider_id = v_provider_id;
  end if;

  -- Sign-in is disabled at the auth layer, which this migration does not own.
  -- Recorded as a step so the runbook and the log agree on what remains.
  v_steps := v_steps || pg_catalog.jsonb_build_object('auth_disabled', 0);

  insert into private.privacy_anonymization_log (request_id, subject_user_id, step_key, rows_affected)
  select p_request_id, p_user_id, k, (v_steps ->> k)::integer
  from pg_catalog.jsonb_object_keys(v_steps) k;

  return v_steps;
end;
$function$;

CREATE OR REPLACE FUNCTION private.privacy_build_export_payload(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_provider_id uuid;
begin
  if p_user_id is null then
    raise exception 'A subject is required' using errcode = '22023';
  end if;

  select p.id into v_provider_id
  from public.provider_profiles p where p.user_id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'profile', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'displayName', p.display_name, 'phone', p.phone,
        'preferredLanguage', p.preferred_language,
        'createdAt', p.created_at, 'updatedAt', p.updated_at,
        'termsAcceptedAt', p.terms_accepted_at,
        'privacyAcceptedAt', p.privacy_accepted_at,
        'deactivatedAt', p.deactivated_at))
      from public.profiles p where p.id = p_user_id), '[]'::jsonb),

    'addresses', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'label', a.label, 'addressLine', a.address_line,
        'governorate', a.governorate, 'district', a.district,
        'street', a.street, 'building', a.building, 'floor', a.floor,
        'apartment', a.apartment, 'landmark', a.landmark,
        'instructions', a.instructions,
        'latitude', a.latitude, 'longitude', a.longitude,
        'isDefault', a.is_default, 'createdAt', a.created_at)
        order by a.created_at)
      from public.addresses a
      where a.customer_id = p_user_id and a.deleted_at is null), '[]'::jsonb),

    -- Where Warsha treats a Professional as based for matching, and why it
    -- believes that. Never shown to anyone else; exported because it is
    -- theirs.
    'matching_location', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'addressLabel', a.label,
        'latitude', l.latitude, 'longitude', l.longitude,
        'source', l.source, 'verificationState', l.verification_state,
        'updatedAt', l.updated_at))
      from private.worker_matching_locations l
      left join public.addresses a on a.id = l.address_id
      where l.provider_id = v_provider_id), '[]'::jsonb),

    -- A booking has two sides. The subject gets the facts of the job and the
    -- other side's PUBLIC display name, which is what they already saw in the
    -- app; they do not get the other side's contact details or account id.
    'bookings', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reference', b.id, 'status', b.status,
        'service', b.service_name_snapshot, 'pricingType', b.pricing_type,
        'estimatedPriceEgp', b.estimated_price_egp,
        'finalPriceEgp', b.final_price_egp,
        'issueDescription', b.issue_description,
        'scheduledDate', b.scheduled_date, 'scheduledTime', b.scheduled_time,
        'bookingType', b.booking_type,
        'role', case when b.customer_id = p_user_id then 'customer' else 'professional' end,
        'counterparty', case
          when b.customer_id = p_user_id
            then (select pp.display_name from public.provider_profiles pp where pp.id = b.provider_id)
          else b.customer_name_snapshot end,
        'createdAt', b.created_at, 'cancelledAt', b.cancelled_at)
        order by b.created_at)
      from public.bookings b
      where (b.customer_id = p_user_id
          or (v_provider_id is not null and b.provider_id = v_provider_id))
        and b.deleted_at is null), '[]'::jsonb),

    -- Reviews the subject wrote. Moderation reasons and the moderator are
    -- internal case history and are not included.
    'reviews_written', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'bookingReference', r.booking_id, 'rating', r.rating,
        'comment', r.comment, 'isAnonymous', r.is_anonymous,
        'professionalism', r.professionalism_rating, 'quality', r.quality_rating,
        'punctuality', r.punctuality_rating, 'communication', r.communication_rating,
        'value', r.value_rating,
        'publicationStatus', r.moderation_status,
        'createdAt', r.created_at, 'editedAt', r.edited_at)
        order by r.created_at)
      from public.reviews r
      where r.customer_id = p_user_id and r.deleted_at is null), '[]'::jsonb),

    -- The subject's own messages only. The other side of a conversation is
    -- their data, not the subject's.
    'messages', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'conversation', m.conversation_id, 'type', m.message_type,
        'body', m.body, 'sentAt', m.created_at, 'readAt', m.read_at)
        order by m.created_at)
      from public.messages m
      where m.sender_id = p_user_id and m.deleted_at is null), '[]'::jsonb),

    -- The case as the subject experienced it. `assigned_to`, `opened_by_staff`
    -- and the internal resolution reason are staff history and are excluded.
    'support_cases', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reference', t.id, 'subject', t.subject, 'category', t.category,
        'status', t.status, 'locale', t.locale, 'mode', t.requester_mode,
        'openedAt', t.created_at, 'closedAt', t.closed_at,
        'satisfactionScore', t.satisfaction_score,
        'satisfactionComment', t.satisfaction_comment)
        order by t.created_at)
      from public.support_tickets t
      where t.requester_id = p_user_id), '[]'::jsonb),

    -- Amounts and outcomes. No provider secrets, no instrument numbers; the
    -- gateway fee is Warsha's commercial detail rather than the subject's.
    'payments', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'bookingReference', fp.booking_id, 'method', fp.payment_method,
        'status', fp.status, 'amountMinor', fp.amount_minor::text,
        'refundedMinor', fp.refunded_minor::text, 'currency', fp.currency,
        'createdAt', fp.created_at, 'paidAt', fp.paid_at)
        order by fp.created_at)
      from public.financial_booking_payments fp
      where fp.customer_id = p_user_id), '[]'::jsonb),

    'consents', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'purpose', c.purpose_key, 'documentVersion', c.document_version,
        'granted', c.granted, 'decidedAt', c.decided_at,
        'withdrawnAt', c.withdrawn_at, 'surface', c.source_surface)
        order by c.decided_at)
      from public.privacy_consent_records c
      where c.user_id = p_user_id), '[]'::jsonb),

    'search_history', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'query', s.query, 'searchedAt', s.searched_at)
        order by s.searched_at)
      from public.user_recent_searches s
      where s.user_id = p_user_id), '[]'::jsonb),

    -- Who referred whom is shared between two people, so the subject learns
    -- the outcome and the dates, not the other person's account.
    'referrals', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'direction', case when a.referrer_user_id = p_user_id
                          then 'referred_someone' else 'was_referred' end,
        'role', a.referred_role, 'status', a.status,
        'attributedAt', a.attributed_at, 'qualifiedAt', a.qualified_at)
        order by a.attributed_at)
      from public.referral_attributions a
      where a.referrer_user_id = p_user_id
         or a.referred_user_id = p_user_id), '[]'::jsonb)
  );
end;
$function$;

insert into private.data_inventory
  (entry_key, schema_name, object_name, object_kind, classification_key, purpose,
   authority, retention_trigger, deletion_treatment, export_included, staff_capability, notes)
values
  ('worker_matching_locations', 'private', 'worker_matching_locations', 'table', 'account_private',
   'Hold where a Professional is based for work, copied from one confirmed address, so matching can rank eligible candidates and bound emergency travel.',
   'WES-008 section 5.2; 202609160001_marketplace_reaches_professionals', 'Account deletion or anonymization; deleting the source address.',
   'delete', true, null,
   'Never returned to any client as a coordinate, a distance or a distance band. Mirrors its source address through a trigger. Soft-deleted Professional profiles are not backfilled.')
on conflict (entry_key) do update set
  purpose = excluded.purpose,
  authority = excluded.authority,
  retention_trigger = excluded.retention_trigger,
  deletion_treatment = excluded.deletion_treatment,
  export_included = excluded.export_included,
  staff_capability = excluded.staff_capability,
  notes = excluded.notes;

-- ---------------------------------------------------------------------------
-- 9. Service-area coordinates are not an authority
-- ---------------------------------------------------------------------------
--
-- A service area is a governorate and a district. Its latitude and longitude
-- were written only by a seed fixture, read only by the discovery distance this
-- migration removed, and copied once into anchors section 1 deleted.
--
-- Deprecated rather than dropped. Dropping is irreversible, and there is no
-- restore point to undo it with; the constraint does the work that matters,
-- which is that nothing can put a coordinate here again. NOT VALID leaves any
-- existing value in place for a later migration to remove deliberately.

alter table public.provider_service_areas
  add constraint provider_service_areas_no_coordinates
  check (latitude is null and longitude is null) not valid;

comment on column public.provider_service_areas.latitude is
  'Deprecated by 202609160001. Never an authority; nothing reads it and nothing may write it.';
comment on column public.provider_service_areas.longitude is
  'Deprecated by 202609160001. Never an authority; nothing reads it and nothing may write it.';
