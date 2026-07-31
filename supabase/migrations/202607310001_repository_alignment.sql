-- WPS-008 repository alignment. Forward-only; preserves WPS-007 objects.

-- The launch taxonomy is locked to these ten active categories.
insert into public.service_categories(id, translation_key, description_key, icon_name, sort_order, is_active, deleted_at)
values
  ('plumbing', 'plumbing', 'plumbingDescription', 'plumbing', 10, true, null),
  ('electrical', 'electrical', 'electricalDescription', 'electrical-services', 20, true, null),
  ('carpentry', 'carpentry', 'carpentryDescription', 'handyman', 30, true, null),
  ('ac', 'acRepair', 'acDescription', 'ac-unit', 40, true, null),
  ('cleaning', 'cleaning', 'cleaningDescription', 'cleaning-services', 50, true, null),
  ('painting', 'painting', 'paintingDescription', 'format-paint', 60, true, null),
  ('appliance-repair', 'applianceRepair', 'applianceRepairDescription', 'kitchen', 70, true, null),
  ('satellite-tv-installation', 'satelliteTv', 'satelliteTvDescription', 'satellite-alt', 80, true, null),
  ('moving-help', 'movingHelp', 'movingHelpDescription', 'local-shipping', 90, true, null),
  ('general-maintenance', 'generalMaintenance', 'generalMaintenanceDescription', 'home-repair-service', 100, true, null)
on conflict (id) do update
set translation_key = excluded.translation_key,
    description_key = excluded.description_key,
    icon_name = excluded.icon_name,
    sort_order = excluded.sort_order,
    is_active = true,
    deleted_at = null;

update public.service_categories
set is_active = false,
    updated_at = pg_catalog.now()
where id not in (
  'plumbing', 'electrical', 'carpentry', 'ac', 'cleaning', 'painting',
  'appliance-repair', 'satellite-tv-installation', 'moving-help',
  'general-maintenance'
) and is_active;

-- Existing providers are grandfathered. A newly activated worker role requires
-- a phone number verified by Supabase Auth; email is not required.
create or replace function public.activate_provider_role(p_display_name text)
returns pg_catalog.uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid pg_catalog.uuid := (select auth.uid());
  result_id pg_catalog.uuid;
  phone_verified boolean;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_display_name)) not between 2 and 100 then
    raise exception 'Invalid provider information' using errcode = '22023';
  end if;

  select p.id into result_id
  from public.provider_profiles p
  where p.user_id = uid;
  if result_id is not null then
    return result_id;
  end if;

  select u.phone is not null and u.phone_confirmed_at is not null
  into phone_verified
  from auth.users u
  where u.id = uid;
  if not coalesce(phone_verified, false) then
    raise exception 'Verified phone required' using errcode = '42501';
  end if;

  perform public.ensure_customer_profile();
  insert into public.user_roles(user_id, role)
  values(uid, 'provider')
  on conflict(user_id, role) do nothing;

  insert into public.provider_profiles(
    user_id, display_name, profession_key, onboarding_status,
    is_published, is_verified
  ) values (
    uid, pg_catalog.btrim(p_display_name), 'professional', 'draft', false, false
  )
  returning id into result_id;
  return result_id;
exception
  when unique_violation then
    select p.id into result_id from public.provider_profiles p where p.user_id = uid;
    if result_id is not null then return result_id; end if;
    raise;
  when sqlstate '42501' or sqlstate '22023' then raise;
  when others then
    raise exception 'Unable to activate provider role' using errcode = 'P0001';
end;
$$;
revoke all on function public.activate_provider_role(text) from public, anon;
grant execute on function public.activate_provider_role(text) to authenticated;

create or replace function public.mark_worker_available(p_available boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_available is null then
    raise exception 'Invalid availability' using errcode = '22023';
  end if;
  update public.provider_profiles
  set is_available = p_available,
      temporary_unavailable_until = null,
      updated_at = pg_catalog.now()
  where user_id = uid and deleted_at is null;
  if not found then
    raise exception 'Provider profile not found' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.mark_worker_available(boolean) from public, anon;
grant execute on function public.mark_worker_available(boolean) to authenticated;

-- Only approved identity-verified workers are publicly discoverable.
create or replace function private.is_provider_identity_approved(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_profiles p
    join public.provider_verifications v on v.provider_id = p.id
    where p.id = p_provider_id
      and p.is_verified
      and v.status = 'approved'
  )
$$;

create or replace function private.is_provider_publicly_discoverable(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_profiles p
    join public.provider_verifications v on v.provider_id = p.id
    where p.id = p_provider_id
      and p.is_verified
      and v.status = 'approved'
      and p.is_published
      and p.onboarding_status = 'approved'
      and p.deleted_at is null
  )
$$;

revoke all on function private.is_provider_identity_approved(uuid) from public, anon, authenticated;
revoke all on function private.is_provider_publicly_discoverable(uuid) from public;
grant execute on function private.is_provider_publicly_discoverable(uuid) to anon, authenticated;

drop policy if exists profiles_public_provider_select on public.profiles;
create policy profiles_public_provider_select on public.profiles
for select to anon, authenticated
using (
  exists (
    select 1 from public.provider_profiles p
    where p.user_id = profiles.id
      and private.is_provider_publicly_discoverable(p.id)
  )
);

drop policy if exists providers_public_read on public.provider_profiles;
create policy providers_public_read on public.provider_profiles
for select to anon, authenticated
using (private.is_provider_publicly_discoverable(id));

drop policy if exists provider_services_public_read on public.provider_services;
create policy provider_services_public_read on public.provider_services
for select to anon, authenticated
using (is_active and private.is_provider_publicly_discoverable(provider_id));

drop policy if exists provider_availability_public_read on public.provider_availability;
-- Legacy rows remain owner-visible through the owner policy but are no longer public.

drop policy if exists provider_areas_public_read on public.provider_service_areas;
create policy provider_areas_public_read on public.provider_service_areas
for select to anon, authenticated
using (private.is_provider_publicly_discoverable(provider_id));

drop policy if exists portfolio_public_read on public.provider_portfolio;
create policy portfolio_public_read on public.provider_portfolio
for select to anon, authenticated
using (private.is_provider_publicly_discoverable(provider_id));

drop policy if exists certifications_public_read on public.provider_certifications;
create policy certifications_public_read on public.provider_certifications
for select to anon, authenticated
using (is_public and private.is_provider_publicly_discoverable(provider_id));

create index if not exists providers_discoverable_category_idx
on public.provider_profiles(primary_category_id, rating_average desc, id)
where is_published and is_verified and onboarding_status = 'approved' and deleted_at is null;

-- Data-driven capacity policy. Values must be configured before Marketplace
-- Intelligence activation; clients never control these settings.
create table if not exists private.marketplace_capacity_configuration (
  singleton boolean primary key default true check (singleton),
  routing_provider text,
  road_factor numeric(6,3) check (road_factor between 1 and 5),
  average_urban_speed_kmh numeric(6,2) check (average_urban_speed_kmh between 1 and 150),
  fixed_buffer_minutes integer not null default 30 check (fixed_buffer_minutes = 30),
  policy_version integer not null default 1 check (policy_version > 0),
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references public.profiles(id),
  check ((road_factor is null) = (average_urban_speed_kmh is null))
);

insert into private.marketplace_capacity_configuration(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists private.marketplace_category_duration_defaults (
  category_id text primary key references public.service_categories(id),
  estimated_duration_minutes integer not null check (estimated_duration_minutes between 15 and 1440),
  policy_version integer not null check (policy_version > 0),
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references public.profiles(id)
);

revoke all on table private.marketplace_capacity_configuration from public, anon, authenticated;
revoke all on table private.marketplace_category_duration_defaults from public, anon, authenticated;

alter table public.bookings
  add column if not exists estimated_duration_minutes integer,
  add column if not exists estimated_travel_before_minutes integer,
  add column if not exists estimated_travel_after_minutes integer,
  add column if not exists capacity_buffer_minutes integer not null default 30;

alter table public.bookings drop constraint if exists bookings_estimated_duration_minutes_check;
alter table public.bookings add constraint bookings_estimated_duration_minutes_check
  check (estimated_duration_minutes is null or estimated_duration_minutes between 1 and 1440);
alter table public.bookings drop constraint if exists bookings_estimated_travel_before_minutes_check;
alter table public.bookings add constraint bookings_estimated_travel_before_minutes_check
  check (estimated_travel_before_minutes is null or estimated_travel_before_minutes between 0 and 1440);
alter table public.bookings drop constraint if exists bookings_estimated_travel_after_minutes_check;
alter table public.bookings add constraint bookings_estimated_travel_after_minutes_check
  check (estimated_travel_after_minutes is null or estimated_travel_after_minutes between 0 and 1440);
alter table public.bookings drop constraint if exists bookings_capacity_buffer_minutes_check;
alter table public.bookings add constraint bookings_capacity_buffer_minutes_check
  check (capacity_buffer_minutes = 30);

create or replace function private.deterministic_travel_minutes(
  p_from_latitude double precision,
  p_from_longitude double precision,
  p_to_latitude double precision,
  p_to_longitude double precision,
  p_road_factor numeric,
  p_average_speed_kmh numeric
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  distance_km double precision;
begin
  if p_from_latitude is null
    or p_from_longitude is null
    or p_to_latitude is null
    or p_to_longitude is null
    or p_road_factor is null
    or p_average_speed_kmh is null
    or p_from_latitude not between -90 and 90
    or p_to_latitude not between -90 and 90
    or p_from_longitude not between -180 and 180
    or p_to_longitude not between -180 and 180
    or p_road_factor not between 1 and 5
    or p_average_speed_kmh not between 1 and 150
  then
    return null;
  end if;
  distance_km := 6371 * 2 * pg_catalog.asin(pg_catalog.sqrt(
    least(1::double precision, greatest(0::double precision,
      pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p_to_latitude - p_from_latitude) / 2), 2)
      + pg_catalog.cos(pg_catalog.radians(p_from_latitude))
        * pg_catalog.cos(pg_catalog.radians(p_to_latitude))
        * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p_to_longitude - p_from_longitude) / 2), 2)
    ))
  ));
  return pg_catalog.ceil((distance_km * p_road_factor / p_average_speed_kmh) * 60)::integer;
end;
$$;
revoke all on function private.deterministic_travel_minutes(double precision,double precision,double precision,double precision,numeric,numeric) from public, anon, authenticated;

create or replace function private.resolve_booking_duration_minutes(p_booking_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(b.estimated_duration_minutes, d.estimated_duration_minutes)
  from public.bookings b
  join public.services s on s.id = b.service_id
  left join private.marketplace_category_duration_defaults d on d.category_id = s.category_id
  where b.id = p_booking_id
$$;
revoke all on function private.resolve_booking_duration_minutes(uuid) from public, anon, authenticated;

create or replace function private.worker_capacity_conflicts(
  p_provider_id uuid,
  p_proposed_start_at timestamptz,
  p_proposed_duration_minutes integer,
  p_proposed_latitude double precision,
  p_proposed_longitude double precision,
  p_exclude_booking_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  capacity_config private.marketplace_capacity_configuration;
  commitment record;
  travel_minutes integer;
  proposed_end_at timestamptz;
begin
  if p_provider_id is null or p_proposed_start_at is null
    or p_proposed_duration_minutes is null
    or p_proposed_duration_minutes not between 1 and 1440
  then
    return true;
  end if;

  select * into capacity_config
  from private.marketplace_capacity_configuration
  where singleton;
  if capacity_config.fixed_buffer_minutes is distinct from 30
    or capacity_config.road_factor is null
    or capacity_config.average_urban_speed_kmh is null
  then
    return true;
  end if;

  proposed_end_at := p_proposed_start_at
    + pg_catalog.make_interval(mins => p_proposed_duration_minutes);

  for commitment in
    select
      b.id,
      ((b.scheduled_date + b.scheduled_time) at time zone 'Africa/Cairo') as starts_at,
      private.resolve_booking_duration_minutes(b.id) as duration_minutes,
      a.latitude,
      a.longitude
    from public.bookings b
    left join public.addresses a on a.id = b.address_id and a.deleted_at is null
    where b.provider_id = p_provider_id
      and b.id is distinct from p_exclude_booking_id
      and b.deleted_at is null
      and b.status in (
        'accepted', 'confirmed', 'provider_on_the_way', 'provider_arrived',
        'job_started', 'work_in_progress'
      )
    order by b.scheduled_date, b.scheduled_time, b.id
  loop
    if commitment.duration_minutes is null then return true; end if;
    if p_proposed_latitude is null or p_proposed_longitude is null
      or commitment.latitude is null or commitment.longitude is null
    then
      return true;
    end if;
    travel_minutes := private.deterministic_travel_minutes(
      commitment.latitude,
      commitment.longitude,
      p_proposed_latitude,
      p_proposed_longitude,
      capacity_config.road_factor,
      capacity_config.average_urban_speed_kmh
    );
    if travel_minutes is null then return true; end if;

    if commitment.starts_at <= p_proposed_start_at then
      if commitment.starts_at
          + pg_catalog.make_interval(mins => commitment.duration_minutes + 30 + travel_minutes)
          > p_proposed_start_at
      then return true; end if;
    elsif proposed_end_at
        + pg_catalog.make_interval(mins => 30 + travel_minutes)
        > commitment.starts_at
    then
      return true;
    end if;
  end loop;
  return false;
end;
$$;
revoke all on function private.worker_capacity_conflicts(uuid,timestamptz,integer,double precision,double precision,uuid) from public, anon, authenticated;

-- Provider profile saving no longer consumes or rewrites weekly schedules.
create or replace function public.save_provider_foundation(
  p_profile pg_catalog.jsonb,
  p_submit boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid pg_catalog.uuid := (select auth.uid());
  pid pg_catalog.uuid;
  item pg_catalog.jsonb;
  service_price pg_catalog.numeric;
  radius pg_catalog.numeric;
  area_radius pg_catalog.numeric;
  transportation_fee pg_catalog.numeric;
  emergency_fee pg_catalog.numeric;
  next_status pg_catalog.text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_profile is null or pg_catalog.jsonb_typeof(p_profile) <> 'object' then raise exception 'Invalid provider information' using errcode='22023'; end if;
  select id into pid from public.provider_profiles where user_id = uid;
  if pid is null then raise exception 'Provider profile not found' using errcode='42501'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_profile->>'displayName',''))) not between 2 and 100 then raise exception 'Invalid provider information' using errcode='22023'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_profile->>'profession',''))) not between 2 and 100 then raise exception 'Invalid provider information' using errcode='22023'; end if;
  if coalesce((p_profile->>'experienceYears')::integer,-1) not between 0 and 80 then raise exception 'Invalid provider information' using errcode='22023'; end if;
  radius := coalesce((p_profile->>'serviceRadiusKm')::pg_catalog.numeric,0);
  if radius not between 1 and 250 then raise exception 'Invalid provider information' using errcode='22023'; end if;
  if p_submit and coalesce((p_profile->>'agreementAccepted')::boolean,false) = false then raise exception 'Provider agreement is required' using errcode='22023'; end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'categoryIds','[]'::pg_catalog.jsonb)) c
    where not exists (
      select 1 from public.service_categories sc
      where sc.id = c.value and sc.is_active and sc.deleted_at is null
    )
  ) then raise exception 'Invalid service category' using errcode='22023'; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::pg_catalog.jsonb)))
    <> (select pg_catalog.count(distinct value->>'serviceId') from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::pg_catalog.jsonb)))
  then raise exception 'Duplicate provider service' using errcode='22023'; end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(coalesce(p_profile->'areas','[]'::pg_catalog.jsonb)) a
    group by a.value->>'governorate', a.value->>'district'
    having pg_catalog.count(*) > 1
  ) then raise exception 'Duplicate service area' using errcode='22023'; end if;

  select onboarding_status into next_status from public.provider_profiles where id = pid;
  if p_submit and next_status in ('draft','more_information_required','rejected') then next_status := 'submitted'; end if;
  update public.provider_profiles
  set display_name = pg_catalog.btrim(p_profile->>'displayName'),
      avatar_url = nullif(p_profile->>'avatarUrl',''),
      profession_key = pg_catalog.btrim(p_profile->>'profession'),
      about = pg_catalog.left(coalesce(p_profile->>'about',''),2000),
      experience_years = (p_profile->>'experienceYears')::integer,
      languages = coalesce(array(select pg_catalog.jsonb_array_elements_text(p_profile->'languages')),'{}'),
      skills = coalesce(array(select pg_catalog.jsonb_array_elements_text(p_profile->'skills')),'{}'),
      category_ids = coalesce(array(select pg_catalog.jsonb_array_elements_text(p_profile->'categoryIds')),'{}'),
      primary_category_id = nullif(p_profile->'categoryIds'->>0,''),
      service_radius_km = radius,
      is_available = coalesce(
        (p_profile->>'isAvailable')::boolean,
        (p_profile->>'isOnline')::boolean,
        false
      ),
      emergency_available = coalesce((p_profile->>'emergencyAvailable')::boolean,false),
      temporary_unavailable_until = nullif(p_profile->>'temporaryUnavailableUntil','')::pg_catalog.timestamptz,
      provider_agreement_accepted_at = case
        when coalesce((p_profile->>'agreementAccepted')::boolean,false)
          then coalesce(provider_agreement_accepted_at,pg_catalog.now())
        else provider_agreement_accepted_at
      end,
      onboarding_status = next_status
  where id = pid and user_id = uid;
  if not found then raise exception 'Provider profile not found' using errcode='42501'; end if;

  delete from public.provider_services where provider_id = pid;
  for item in select * from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::pg_catalog.jsonb)) loop
    service_price := coalesce((item->>'price')::pg_catalog.numeric,-1);
    transportation_fee := coalesce((item->>'transportationFee')::pg_catalog.numeric,-1);
    emergency_fee := coalesce((item->>'emergencySurcharge')::pg_catalog.numeric,-1);
    if service_price not between 0 and 100000
      or transportation_fee not between 0 and 5000
      or emergency_fee not between 0 and 10000
      or (item->>'pricingModel') not in ('fixed','starting','hourly','inspection','quote')
    then raise exception 'Invalid service pricing' using errcode='22023'; end if;
    insert into public.provider_services(
      provider_id, service_id, custom_price_egp, pricing_type,
      transportation_fee_egp, emergency_surcharge_egp, is_active
    )
    select pid, (item->>'serviceId')::pg_catalog.uuid, service_price,
      item->>'pricingModel', transportation_fee, emergency_fee, true
    from public.services s
    where s.id = (item->>'serviceId')::pg_catalog.uuid
      and s.is_active and s.deleted_at is null;
    if not found then raise exception 'Invalid service' using errcode='22023'; end if;
  end loop;

  delete from public.provider_service_areas where provider_id = pid;
  for item in select * from pg_catalog.jsonb_array_elements(coalesce(p_profile->'areas','[]'::pg_catalog.jsonb)) loop
    area_radius := coalesce((item->>'radiusKm')::pg_catalog.numeric,0);
    if area_radius not between 1 and 250
      or pg_catalog.length(pg_catalog.btrim(coalesce(item->>'governorate',''))) = 0
    then raise exception 'Invalid service area' using errcode='22023'; end if;
    insert into public.provider_service_areas(provider_id, governorate, district, radius_km)
    values (
      pid,
      pg_catalog.left(pg_catalog.btrim(item->>'governorate'),100),
      pg_catalog.left(pg_catalog.btrim(coalesce(item->>'district','')),100),
      area_radius
    );
  end loop;
exception
  when sqlstate '42501' or sqlstate '22023' then raise;
  when others then raise exception 'Unable to save provider profile' using errcode='P0001';
end;
$$;
revoke all on function public.save_provider_foundation(jsonb,boolean) from public, anon;
grant execute on function public.save_provider_foundation(jsonb,boolean) to authenticated;

create or replace function public.get_provider_trust_indicators(p_provider_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select pg_catalog.jsonb_build_object(
        'identityVerified', true,
        'skillCertificateVerified', p.skill_certificate_verified
      )
      from public.provider_profiles p
      where p.id = p_provider_id
        and private.is_provider_publicly_discoverable(p.id)
    ),
    '{}'::jsonb
  )
$$;

create or replace function public.get_marketplace_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'categories',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', c.id,
            'translation_key', c.translation_key,
            'icon_name', c.icon_name,
            'description_key', c.description_key
          ) order by c.sort_order, c.id
        )
        from public.service_categories c
        where c.is_active and c.deleted_at is null
          and c.id in (
            'plumbing', 'electrical', 'carpentry', 'ac', 'cleaning', 'painting',
            'appliance-repair', 'satellite-tv-installation', 'moving-help',
            'general-maintenance'
          )
      ),
      '[]'::jsonb
    ),
    'services',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', s.id,
            'category_id', s.category_id,
            'name', s.name,
            'price_egp', s.price_egp,
            'pricing_type', s.pricing_type,
            'duration_label', s.duration_label
          ) order by s.name, s.id
        )
        from public.services s
        join public.service_categories c on c.id = s.category_id
        where s.is_active and s.deleted_at is null
          and c.is_active and c.deleted_at is null
      ),
      '[]'::jsonb
    ),
    'providers',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', p.id,
            'display_name', p.display_name,
            'profession_key', p.profession_key,
            'primary_category_id', p.primary_category_id,
            'rating_average', p.rating_average,
            'review_count', p.review_count,
            'starting_price_egp', p.starting_price_egp,
            'avatar_url', p.avatar_url,
            'cover_image_url', p.cover_image_url,
            'is_verified', true,
            'skill_certificate_verified', p.skill_certificate_verified,
            'is_available', p.is_available,
            'bookable', p.user_id is not null,
            'emergency_available', p.emergency_available,
            'completed_jobs', p.completed_jobs,
            'experience_years', p.experience_years,
            'response_time_label', p.response_time_label,
            'location_label', p.location_label,
            'service_radius_km', p.service_radius_km,
            'languages', p.languages,
            'about', p.about,
            'skills', p.skills,
            'cancellation_policy', p.cancellation_policy,
            'guarantee_text', p.guarantee_text,
            'provider_services',
            coalesce(
              (
                select pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'service_id', ps.service_id,
                    'custom_price_egp', ps.custom_price_egp,
                    'pricing_type', ps.pricing_type,
                    'transportation_fee_egp', ps.transportation_fee_egp,
                    'emergency_surcharge_egp', ps.emergency_surcharge_egp,
                    'is_active', ps.is_active,
                    'service', pg_catalog.jsonb_build_object(
                      'id', s.id,
                      'name', s.name,
                      'price_egp', s.price_egp,
                      'pricing_type', s.pricing_type,
                      'duration_label', s.duration_label
                    )
                  ) order by s.name, s.id
                )
                from public.provider_services ps
                join public.services s on s.id = ps.service_id
                join public.service_categories c on c.id = s.category_id
                where ps.provider_id = p.id
                  and ps.is_active
                  and s.is_active and s.deleted_at is null
                  and c.is_active and c.deleted_at is null
              ),
              '[]'::jsonb
            )
          ) order by p.rating_average desc, p.display_name, p.id
        )
        from public.provider_profiles p
        where private.is_provider_publicly_discoverable(p.id)
      ),
      '[]'::jsonb
    )
  )
$$;

revoke all on function public.get_provider_trust_indicators(uuid) from public;
revoke all on function public.get_marketplace_catalog() from public;
grant execute on function public.get_provider_trust_indicators(uuid) to anon, authenticated;
grant execute on function public.get_marketplace_catalog() to anon, authenticated;

-- Legacy direct booking remains available, but weekly schedules are no longer
-- consulted. Binary availability and approved identity are hard gates.
create or replace function public.create_customer_booking(
  p_provider_id uuid,
  p_service_id uuid,
  p_issue_description text,
  p_notes text,
  p_address_id uuid,
  p_scheduled_date date,
  p_scheduled_time time,
  p_booking_type text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  service_row record;
  address_row record;
  booking_id uuid;
  existing_id uuid;
  service_price numeric;
  transport numeric;
  emergency numeric;
  estimated_total numeric;
  booking_date date;
  booking_time time;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_idempotency_key is null or pg_catalog.length(p_idempotency_key) not between 16 and 200 then raise exception 'Invalid booking request' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text || ':' || p_idempotency_key, 0));
  select b.id into existing_id from public.bookings b where b.idempotency_key = p_idempotency_key and b.customer_id = uid;
  if existing_id is not null then return existing_id; end if;

  perform public.ensure_customer_profile();
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_issue_description, ''))) not between 8 and 2000
    or pg_catalog.length(coalesce(p_notes, '')) > 2000
  then raise exception 'Invalid booking information' using errcode = '22023'; end if;
  if p_booking_type is null or p_booking_type not in ('scheduled', 'emergency') then raise exception 'Invalid booking type' using errcode = '22023'; end if;

  if p_booking_type = 'emergency' then
    booking_date := pg_catalog.timezone('Africa/Cairo', pg_catalog.now())::date;
    booking_time := '00:00'::time;
  else
    booking_date := p_scheduled_date;
    booking_time := p_scheduled_time;
  end if;

  select
    s.id,
    s.name,
    coalesce(ps.custom_price_egp, s.price_egp) as price,
    ps.pricing_type,
    ps.transportation_fee_egp,
    ps.emergency_surcharge_egp,
    p.user_id as provider_user_id,
    p.emergency_available,
    p.is_available
  into service_row
  from public.provider_services ps
  join public.services s on s.id = ps.service_id
  join public.service_categories c on c.id = s.category_id
  join public.provider_profiles p on p.id = ps.provider_id
  where ps.provider_id = p_provider_id
    and ps.service_id = p_service_id
    and ps.is_active
    and s.is_active and s.deleted_at is null
    and c.is_active and c.deleted_at is null
    and p.is_available
    and (p.temporary_unavailable_until is null or p.temporary_unavailable_until <= pg_catalog.now())
    and private.is_provider_publicly_discoverable(p.id);

  if service_row.id is null
    or service_row.provider_user_id is null
    or service_row.provider_user_id is not distinct from uid
  then raise exception 'Service unavailable' using errcode = '22023'; end if;
  if p_booking_type = 'emergency' and not service_row.emergency_available then raise exception 'Emergency service unavailable' using errcode = '22023'; end if;
  if p_booking_type = 'scheduled' and (
    booking_date is null or booking_time is null
    or booking_date + booking_time <= pg_catalog.timezone('Africa/Cairo', pg_catalog.now())
  ) then raise exception 'Choose a future booking time' using errcode = '22023'; end if;

  if p_booking_type = 'scheduled' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_provider_id::text || ':' || booking_date::text || ':' || booking_time::text, 0));
    if exists (
      select 1 from public.bookings b
      where b.provider_id = p_provider_id
        and b.scheduled_date = booking_date
        and b.scheduled_time = booking_time
        and b.deleted_at is null
        and b.status not in ('rejected', 'cancelled', 'refunded', 'no_show')
    ) then raise exception 'Booking time unavailable' using errcode = '22023'; end if;
  end if;

  select * into address_row
  from public.addresses a
  where a.id = p_address_id and a.customer_id = uid and a.deleted_at is null;
  if address_row.id is null then raise exception 'Address not found' using errcode = '42501'; end if;

  service_price := service_row.price;
  transport := service_row.transportation_fee_egp;
  emergency := case when p_booking_type = 'emergency' then service_row.emergency_surcharge_egp else 0 end;
  estimated_total := service_price + transport + emergency;

  insert into public.bookings(
    customer_id, provider_id, service_id, status, service_name_snapshot,
    pricing_type, estimated_price_egp, issue_description, notes,
    scheduled_date, scheduled_time, address_id, address_snapshot,
    booking_type, price_breakdown, idempotency_key, capacity_buffer_minutes
  ) values (
    uid, p_provider_id, p_service_id, 'pending_provider_approval', service_row.name,
    service_row.pricing_type, estimated_total, pg_catalog.btrim(p_issue_description), coalesce(p_notes, ''),
    booking_date, booking_time, p_address_id,
    pg_catalog.concat_ws(', ', address_row.building, coalesce(nullif(address_row.street, ''), nullif(address_row.address_line, '')), address_row.district, address_row.governorate),
    p_booking_type,
    pg_catalog.jsonb_build_object(
      'servicePrice', case when service_row.pricing_type = 'inspection' then 0 else service_price end,
      'inspectionFee', case when service_row.pricing_type = 'inspection' then service_price else 0 end,
      'transportationFee', transport,
      'emergencySurcharge', emergency,
      'discount', 0,
      'estimatedTotal', estimated_total,
      'pricingType', service_row.pricing_type
    ),
    p_idempotency_key,
    30
  )
  on conflict(idempotency_key) do nothing
  returning id into booking_id;

  if booking_id is null then
    select b.id into booking_id from public.bookings b where b.idempotency_key = p_idempotency_key and b.customer_id = uid;
  end if;
  if booking_id is null then raise exception 'Booking request already used' using errcode = '23505'; end if;
  return booking_id;
end;
$$;

create or replace function public.reschedule_customer_booking(
  p_booking_id uuid,
  p_scheduled_date date,
  p_scheduled_time time
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  current_status text;
  target_provider uuid;
  provider_uid uuid;
  history_id uuid;
  previous_date date;
  previous_time time;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_scheduled_date is null or p_scheduled_time is null
    or p_scheduled_date + p_scheduled_time <= pg_catalog.timezone('Africa/Cairo', pg_catalog.now())
  then raise exception 'Choose a future booking time' using errcode = '22023'; end if;

  select b.status, b.provider_id, p.user_id, b.scheduled_date, b.scheduled_time
  into current_status, target_provider, provider_uid, previous_date, previous_time
  from public.bookings b
  join public.provider_profiles p on p.id = b.provider_id
  where b.id = p_booking_id and b.customer_id = uid and b.deleted_at is null
  for update of b;
  if current_status not in ('pending_provider_approval', 'accepted', 'confirmed') then raise exception 'Booking cannot be rescheduled' using errcode = '22023'; end if;
  if previous_date = p_scheduled_date and previous_time = p_scheduled_time then raise exception 'Choose a different booking time' using errcode = '22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_provider::text || ':' || p_scheduled_date::text || ':' || p_scheduled_time::text, 0));
  if exists (
    select 1 from public.bookings b
    where b.id <> p_booking_id
      and b.provider_id = target_provider
      and b.scheduled_date = p_scheduled_date
      and b.scheduled_time = p_scheduled_time
      and b.deleted_at is null
      and b.status not in ('rejected', 'cancelled', 'refunded', 'no_show')
  ) then raise exception 'Booking time unavailable' using errcode = '22023'; end if;

  update public.bookings
  set scheduled_date = p_scheduled_date,
      scheduled_time = p_scheduled_time,
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  insert into public.booking_status_history(booking_id, status, actor_id, metadata)
  values (
    p_booking_id, current_status, uid,
    pg_catalog.jsonb_build_object('note', 'rescheduled', 'scheduled_date', p_scheduled_date, 'scheduled_time', p_scheduled_time)
  ) returning id into history_id;

  if provider_uid is not null and provider_uid is distinct from uid then
    insert into public.notifications(user_id, type, title, body, data)
    values (
      provider_uid, 'booking_rescheduled', 'Booking update',
      'Your booking has a new update.',
      pg_catalog.jsonb_build_object('booking_id', p_booking_id, 'status', current_status, 'history_id', history_id)
    ) on conflict do nothing;
  end if;
end;
$$;

create or replace function public.accept_provider_reschedule(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target_provider uuid;
  proposed_date date;
  proposed_time time;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select b.provider_id, b.proposed_scheduled_date, b.proposed_scheduled_time
  into target_provider, proposed_date, proposed_time
  from public.bookings b
  where b.id = p_booking_id
    and b.customer_id = uid
    and b.status = 'rescheduling_requested'
    and b.deleted_at is null
  for update;
  if proposed_date is null or proposed_time is null
    or proposed_date + proposed_time <= pg_catalog.timezone('Africa/Cairo', pg_catalog.now())
  then raise exception 'Reschedule response is not available' using errcode = '22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_provider::text || ':' || proposed_date::text || ':' || proposed_time::text, 0));
  if exists (
    select 1 from public.bookings b
    where b.id <> p_booking_id
      and b.provider_id = target_provider
      and b.scheduled_date = proposed_date
      and b.scheduled_time = proposed_time
      and b.deleted_at is null
      and b.status not in ('rejected', 'cancelled', 'refunded', 'no_show')
  ) then raise exception 'Booking time unavailable' using errcode = '22023'; end if;

  update public.bookings
  set status = 'confirmed',
      scheduled_date = proposed_date,
      scheduled_time = proposed_time,
      proposed_scheduled_date = null,
      proposed_scheduled_time = null,
      provider_reschedule_note = null,
      proposal_from_status = null,
      updated_at = pg_catalog.now()
  where id = p_booking_id;
  perform private.annotate_booking_history(
    p_booking_id, 'confirmed', uid,
    pg_catalog.jsonb_build_object('note', 'reschedule_accepted', 'scheduled_date', proposed_date, 'scheduled_time', proposed_time)
  );
end;
$$;

revoke all on function public.create_customer_booking(uuid,uuid,text,text,uuid,date,time,text,text) from public, anon;
revoke all on function public.reschedule_customer_booking(uuid,date,time) from public, anon;
revoke all on function public.accept_provider_reschedule(uuid) from public, anon;
grant execute on function public.create_customer_booking(uuid,uuid,text,text,uuid,date,time,text,text) to authenticated;
grant execute on function public.reschedule_customer_booking(uuid,date,time) to authenticated;
grant execute on function public.accept_provider_reschedule(uuid) to authenticated;

-- Booking chat is always readable by participants. Writes stop immediately on
-- cancellation and exactly 48 hours after the recorded completed transition.
create or replace function private.is_booking_chat_writable(
  p_booking_id uuid,
  p_at timestamptz default pg_catalog.now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when b.status = 'cancelled' then false
        when completion.completed_at is not null
          then p_at < completion.completed_at + interval '48 hours'
        when b.status in ('completed', 'disputed', 'refunded') then false
        else true
      end
      from public.bookings b
      left join lateral (
        select min(h.created_at) as completed_at
        from public.booking_status_history h
        where h.booking_id = b.id and h.status = 'completed'
      ) completion on true
      where b.id = p_booking_id
        and b.deleted_at is null
        and private.is_booking_chat_participant(b.id)
    ),
    false
  )
$$;
revoke all on function private.is_booking_chat_writable(uuid,timestamptz) from public, anon;
grant execute on function private.is_booking_chat_writable(uuid,timestamptz) to authenticated;

drop policy if exists chat_attachment_participant_upload on storage.objects;
create policy chat_attachment_participant_upload on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and private.is_booking_chat_storage_path(name)
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.is_booking_chat_participant(private.booking_chat_path_booking_id(name))
  and private.is_booking_chat_writable(private.booking_chat_path_booking_id(name), pg_catalog.now())
);

create or replace function public.send_booking_message(
  p_booking_id uuid,
  p_message_type text,
  p_body text,
  p_attachment_path text,
  p_attachment_mime_type text,
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  conversation_id uuid;
  message_id uuid;
  existing_id uuid;
  booking_row record;
  recipient uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select b.customer_id, p.user_id as provider_user_id
  into booking_row
  from public.bookings b
  join public.provider_profiles p on p.id = b.provider_id
  where b.id = p_booking_id;
  if booking_row.customer_id is null or booking_row.provider_user_id is null
    or (uid is distinct from booking_row.customer_id and uid is distinct from booking_row.provider_user_id)
  then raise exception 'Conversation is not available' using errcode = '42501'; end if;
  if p_client_id is null then raise exception 'Invalid message request' using errcode = '22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_booking_id::text || ':' || p_client_id::text, 0));
  select m.id into existing_id
  from public.messages m
  where m.booking_id = p_booking_id and m.client_id = p_client_id;
  if existing_id is not null then return existing_id; end if;

  if not private.is_booking_chat_writable(p_booking_id, pg_catalog.now()) then
    raise exception 'Booking chat is read-only' using errcode = '22023';
  end if;
  if p_message_type = 'text' then
    if pg_catalog.length(pg_catalog.btrim(coalesce(p_body, ''))) not between 1 and 2000
      or p_attachment_path is not null
    then raise exception 'Invalid text message' using errcode = '22023'; end if;
  elsif p_message_type = 'image' then
    if p_attachment_path is null or p_attachment_mime_type is null
      or p_attachment_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
    then raise exception 'Invalid image message' using errcode = '22023'; end if;
    if p_attachment_path !~ ('^' || p_booking_id::text || '/' || uid::text || '/[^/]+$') then raise exception 'Invalid image path' using errcode = '42501'; end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'chat-attachments'
        and o.name = p_attachment_path
        and o.owner = uid
        and coalesce((o.metadata->>'size')::bigint, 0) between 1 and 8388608
    ) then raise exception 'Uploaded image was not found' using errcode = '22023'; end if;
  else
    raise exception 'Invalid message type' using errcode = '22023';
  end if;

  insert into public.conversations(booking_id)
  values (p_booking_id)
  on conflict (booking_id) where booking_id is not null
  do update set updated_at = public.conversations.updated_at
  returning id into conversation_id;
  insert into public.conversation_members(conversation_id, user_id)
  values (conversation_id, booking_row.customer_id), (conversation_id, booking_row.provider_user_id)
  on conflict do nothing;
  insert into public.messages(conversation_id, booking_id, sender_id, message_type, body, client_id)
  values (
    conversation_id, p_booking_id, uid, p_message_type,
    case when p_message_type = 'text' then pg_catalog.btrim(p_body) else null end,
    p_client_id
  ) returning id into message_id;
  if p_message_type = 'image' then
    insert into public.message_attachments(message_id, storage_path, mime_type)
    values (message_id, p_attachment_path, p_attachment_mime_type);
  end if;
  recipient := case when uid = booking_row.customer_id then booking_row.provider_user_id else booking_row.customer_id end;
  insert into public.notifications(user_id, type, title, body, data)
  values (
    recipient, 'booking_message', 'New message',
    'You have a new message about your booking.',
    pg_catalog.jsonb_build_object('booking_id', p_booking_id, 'message_id', message_id)
  );
  return message_id;
end;
$$;

create or replace function public.set_booking_typing(p_booking_id uuid, p_typing boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or not private.is_booking_chat_participant(p_booking_id) then raise exception 'Conversation is not available' using errcode = '42501'; end if;
  if p_typing then
    if not private.is_booking_chat_writable(p_booking_id, pg_catalog.now()) then raise exception 'Booking chat is read-only' using errcode = '22023'; end if;
    insert into public.conversation_typing(booking_id, user_id, expires_at, updated_at)
    values (p_booking_id, uid, pg_catalog.now() + interval '8 seconds', pg_catalog.now())
    on conflict (booking_id, user_id)
    do update set expires_at = excluded.expires_at, updated_at = excluded.updated_at;
  else
    delete from public.conversation_typing where booking_id = p_booking_id and user_id = uid;
  end if;
end;
$$;

create or replace function private.clear_locked_booking_typing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' then
    delete from public.conversation_typing where booking_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.clear_locked_booking_typing() from public, anon, authenticated;
drop trigger if exists clear_locked_booking_typing on public.bookings;
create trigger clear_locked_booking_typing
after update of status on public.bookings
for each row
when (old.status is distinct from new.status)
execute function private.clear_locked_booking_typing();

revoke all on function public.send_booking_message(uuid,text,text,text,text,uuid) from public, anon;
revoke all on function public.set_booking_typing(uuid,boolean) from public, anon;
grant execute on function public.send_booking_message(uuid,text,text,text,text,uuid) to authenticated;
grant execute on function public.set_booking_typing(uuid,boolean) to authenticated;
