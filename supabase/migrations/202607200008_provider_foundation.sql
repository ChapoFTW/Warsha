alter table public.provider_profiles
  add column if not exists onboarding_status text not null default 'draft'
    check (onboarding_status in ('draft','submitted','pending_review','more_information_required','approved','rejected','suspended')),
  add column if not exists emergency_available boolean not null default false,
  add column if not exists temporary_unavailable_until timestamptz,
  add column if not exists provider_agreement_accepted_at timestamptz,
  add column if not exists category_ids text[] not null default '{}';

-- Existing published marketplace records were approved before this workflow existed.
-- Backfill them before the approval-protection trigger is installed.
update public.provider_profiles
set onboarding_status = 'approved'
where is_published and onboarding_status = 'draft';

alter table public.provider_services
  add column if not exists pricing_type text not null default 'starting'
    check (pricing_type in ('fixed','starting','hourly','inspection','quote')),
  add column if not exists transportation_fee_egp numeric(10,2) not null default 0 check (transportation_fee_egp between 0 and 5000),
  add column if not exists emergency_surcharge_egp numeric(10,2) not null default 0 check (emergency_surcharge_egp between 0 and 10000);
alter table public.provider_services drop constraint if exists provider_services_reasonable_price;
alter table public.provider_services add constraint provider_services_reasonable_price check (custom_price_egp is null or custom_price_egp between 0 and 100000) not valid;
alter table public.provider_services validate constraint provider_services_reasonable_price;
alter table public.provider_profiles drop constraint if exists provider_profiles_reasonable_radius;
alter table public.provider_profiles add constraint provider_profiles_reasonable_radius check (service_radius_km is null or service_radius_km between 1 and 250) not valid;
alter table public.provider_profiles validate constraint provider_profiles_reasonable_radius;
alter table public.provider_service_areas drop constraint if exists provider_areas_reasonable_radius;
alter table public.provider_service_areas add constraint provider_areas_reasonable_radius check (radius_km between 1 and 250) not valid;
alter table public.provider_service_areas validate constraint provider_areas_reasonable_radius;

alter table public.provider_availability
  add column if not exists break_start time,
  add column if not exists break_end time;
alter table public.provider_availability drop constraint if exists provider_availability_break_check;
alter table public.provider_availability add constraint provider_availability_break_check check (
  (break_start is null and break_end is null) or
  (break_start is not null and break_end is not null and break_start > start_time and break_end > break_start and break_end < end_time)
);

create or replace function private.prevent_provider_approval_changes()
returns trigger language plpgsql set search_path='' as $$
begin
  if not private.is_staff() and (
    (old.onboarding_status is distinct from new.onboarding_status and not (old.onboarding_status in ('draft','more_information_required','rejected') and new.onboarding_status='submitted')) or
    old.is_verified is distinct from new.is_verified or
    old.is_published is distinct from new.is_published or
    old.rating_average is distinct from new.rating_average or
    old.review_count is distinct from new.review_count or
    old.completed_jobs is distinct from new.completed_jobs
  ) then raise exception 'Protected provider fields cannot be changed' using errcode='42501'; end if;
  return new;
end;
$$;
drop trigger if exists protect_provider_approval_fields on public.provider_profiles;
create trigger protect_provider_approval_fields before update on public.provider_profiles for each row execute function private.prevent_provider_approval_changes();

create or replace function private.prevent_overlapping_provider_availability()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.provider_availability a where a.provider_id=new.provider_id and a.id<>new.id and a.weekday is not distinct from new.weekday and a.available_date is not distinct from new.available_date and new.start_time<a.end_time and new.end_time>a.start_time) then
    raise exception 'Availability periods cannot overlap' using errcode='23P01';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_provider_availability_overlap on public.provider_availability;
create trigger prevent_provider_availability_overlap before insert or update on public.provider_availability for each row execute function private.prevent_overlapping_provider_availability();

create or replace function public.activate_provider_role(p_display_name pg_catalog.text)
returns pg_catalog.uuid language plpgsql security definer set search_path='' as $$
declare uid pg_catalog.uuid:=(select auth.uid()); result_id pg_catalog.uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(pg_catalog.btrim(p_display_name)) not between 2 and 100 then raise exception 'Invalid provider information' using errcode='22023'; end if;
  perform public.ensure_customer_profile();
  insert into public.user_roles(user_id,role) values(uid,'provider') on conflict(user_id,role) do nothing;
  insert into public.provider_profiles(user_id,display_name,profession_key,onboarding_status,is_published,is_verified)
  values(uid,pg_catalog.btrim(p_display_name),'professional','draft',false,false)
  on conflict(user_id) where user_id is not null do update set user_id=excluded.user_id
  returning id into result_id;
  return result_id;
exception
  when sqlstate '42501' or sqlstate '22023' then raise;
  when others then raise exception 'Unable to activate provider role' using errcode='P0001';
end;
$$;
revoke execute on function public.activate_provider_role(text) from public;
revoke execute on function public.activate_provider_role(text) from anon;
grant execute on function public.activate_provider_role(text) to authenticated;

create or replace function public.save_provider_foundation(p_profile pg_catalog.jsonb,p_submit boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare uid pg_catalog.uuid:=(select auth.uid()); pid pg_catalog.uuid; item pg_catalog.jsonb; service_price pg_catalog.numeric; radius pg_catalog.numeric; area_radius pg_catalog.numeric; transportation_fee pg_catalog.numeric; emergency_fee pg_catalog.numeric; next_status pg_catalog.text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_profile is null or pg_catalog.jsonb_typeof(p_profile)<>'object' then raise exception 'Invalid provider information' using errcode='22023'; end if;
  select id into pid from public.provider_profiles where user_id=uid;
  if pid is null then raise exception 'Provider profile not found' using errcode='42501'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_profile->>'displayName',''))) not between 2 and 100 then raise exception 'Invalid provider information' using errcode='22023'; end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_profile->>'profession',''))) not between 2 and 100 then raise exception 'Invalid provider information' using errcode='22023'; end if;
  if coalesce((p_profile->>'experienceYears')::integer,-1) not between 0 and 80 then raise exception 'Invalid provider information' using errcode='22023'; end if;
  radius:=coalesce((p_profile->>'serviceRadiusKm')::pg_catalog.numeric,0); if radius not between 1 and 250 then raise exception 'Invalid provider information' using errcode='22023'; end if;
  if p_submit and coalesce((p_profile->>'agreementAccepted')::boolean,false)=false then raise exception 'Provider agreement is required' using errcode='22023'; end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'categoryIds','[]'::pg_catalog.jsonb)) c where not exists(select 1 from public.service_categories sc where sc.id=c.value and sc.is_active and sc.deleted_at is null)) then raise exception 'Invalid service category' using errcode='22023'; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::pg_catalog.jsonb)))<>(select pg_catalog.count(distinct value->>'serviceId') from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::pg_catalog.jsonb))) then raise exception 'Duplicate provider service' using errcode='22023'; end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(coalesce(p_profile->'areas','[]'::pg_catalog.jsonb)) a group by a.value->>'governorate',a.value->>'district' having pg_catalog.count(*)>1) then raise exception 'Duplicate service area' using errcode='22023'; end if;
  select onboarding_status into next_status from public.provider_profiles where id=pid;
  if p_submit and next_status in ('draft','more_information_required','rejected') then next_status:='submitted'; end if;
  update public.provider_profiles set display_name=pg_catalog.btrim(p_profile->>'displayName'),avatar_url=nullif(p_profile->>'avatarUrl',''),profession_key=pg_catalog.btrim(p_profile->>'profession'),about=pg_catalog.left(coalesce(p_profile->>'about',''),2000),experience_years=(p_profile->>'experienceYears')::integer,languages=coalesce(array(select pg_catalog.jsonb_array_elements_text(p_profile->'languages')),'{}'),skills=coalesce(array(select pg_catalog.jsonb_array_elements_text(p_profile->'skills')),'{}'),category_ids=coalesce(array(select pg_catalog.jsonb_array_elements_text(p_profile->'categoryIds')),'{}'),primary_category_id=nullif(p_profile->'categoryIds'->>0,''),service_radius_km=radius,is_available=coalesce((p_profile->>'isOnline')::boolean,false),emergency_available=coalesce((p_profile->>'emergencyAvailable')::boolean,false),temporary_unavailable_until=nullif(p_profile->>'temporaryUnavailableUntil','')::pg_catalog.timestamptz,provider_agreement_accepted_at=case when coalesce((p_profile->>'agreementAccepted')::boolean,false) then coalesce(provider_agreement_accepted_at,pg_catalog.now()) else provider_agreement_accepted_at end,onboarding_status=next_status where id=pid and user_id=uid;
  if not found then raise exception 'Provider profile not found' using errcode='42501'; end if;
  delete from public.provider_services where provider_id=pid;
  for item in select * from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::pg_catalog.jsonb)) loop
    service_price:=coalesce((item->>'price')::pg_catalog.numeric,-1); transportation_fee:=coalesce((item->>'transportationFee')::pg_catalog.numeric,-1); emergency_fee:=coalesce((item->>'emergencySurcharge')::pg_catalog.numeric,-1);
    if service_price not between 0 and 100000 or transportation_fee not between 0 and 5000 or emergency_fee not between 0 and 10000 or (item->>'pricingModel') not in ('fixed','starting','hourly','inspection','quote') then raise exception 'Invalid service pricing' using errcode='22023'; end if;
    insert into public.provider_services(provider_id,service_id,custom_price_egp,pricing_type,transportation_fee_egp,emergency_surcharge_egp,is_active) select pid,(item->>'serviceId')::pg_catalog.uuid,service_price,item->>'pricingModel',transportation_fee,emergency_fee,true from public.services s where s.id=(item->>'serviceId')::pg_catalog.uuid and s.is_active and s.deleted_at is null;
    if not found then raise exception 'Invalid service' using errcode='22023'; end if;
  end loop;
  delete from public.provider_service_areas where provider_id=pid;
  for item in select * from pg_catalog.jsonb_array_elements(coalesce(p_profile->'areas','[]'::pg_catalog.jsonb)) loop
    area_radius:=coalesce((item->>'radiusKm')::pg_catalog.numeric,0); if area_radius not between 1 and 250 or pg_catalog.length(pg_catalog.btrim(coalesce(item->>'governorate','')))=0 then raise exception 'Invalid service area' using errcode='22023'; end if;
    insert into public.provider_service_areas(provider_id,governorate,district,radius_km) values(pid,pg_catalog.left(pg_catalog.btrim(item->>'governorate'),100),pg_catalog.left(pg_catalog.btrim(coalesce(item->>'district','')),100),area_radius);
  end loop;
  delete from public.provider_availability where provider_id=pid and weekday is not null;
  for item in select * from pg_catalog.jsonb_array_elements(coalesce(p_profile->'availability','[]'::pg_catalog.jsonb)) where coalesce((value->>'enabled')::boolean,false) loop
    insert into public.provider_availability(provider_id,weekday,start_time,end_time,break_start,break_end) values(pid,(item->>'weekday')::pg_catalog.int2,(item->>'startTime')::pg_catalog.time,(item->>'endTime')::pg_catalog.time,nullif(item->>'breakStart','')::pg_catalog.time,nullif(item->>'breakEnd','')::pg_catalog.time);
  end loop;
exception
  when sqlstate '42501' or sqlstate '22023' then raise;
  when others then raise exception 'Unable to save provider profile' using errcode='P0001';
end;
$$;
revoke execute on function public.save_provider_foundation(jsonb,boolean) from public;
revoke execute on function public.save_provider_foundation(jsonb,boolean) from anon;
grant execute on function public.save_provider_foundation(jsonb,boolean) to authenticated;

drop policy if exists providers_owner_read on public.provider_profiles;
create policy providers_owner_read on public.provider_profiles for select to authenticated using(user_id=(select auth.uid()));

drop policy if exists providers_public_read on public.provider_profiles;
create policy providers_public_read on public.provider_profiles for select to anon,authenticated using(is_published and onboarding_status='approved' and deleted_at is null);
drop policy if exists provider_services_public_read on public.provider_services;
create policy provider_services_public_read on public.provider_services for select to anon,authenticated using(is_active and exists(select 1 from public.provider_profiles p where p.id=provider_id and p.is_published and p.onboarding_status='approved' and p.deleted_at is null));
drop policy if exists provider_availability_public_read on public.provider_availability;
create policy provider_availability_public_read on public.provider_availability for select to anon,authenticated using(exists(select 1 from public.provider_profiles p where p.id=provider_id and p.is_published and p.onboarding_status='approved' and p.deleted_at is null));
drop policy if exists provider_areas_public_read on public.provider_service_areas;
create policy provider_areas_public_read on public.provider_service_areas for select to anon,authenticated using(exists(select 1 from public.provider_profiles p where p.id=provider_id and p.is_published and p.onboarding_status='approved' and p.deleted_at is null));
drop policy if exists portfolio_public_read on public.provider_portfolio;
create policy portfolio_public_read on public.provider_portfolio for select to anon,authenticated using(exists(select 1 from public.provider_profiles p where p.id=provider_id and p.is_published and p.onboarding_status='approved' and p.deleted_at is null));
drop policy if exists certifications_public_read on public.provider_certifications;
create policy certifications_public_read on public.provider_certifications for select to anon,authenticated using(is_public and exists(select 1 from public.provider_profiles p where p.id=provider_id and p.is_published and p.onboarding_status='approved' and p.deleted_at is null));

drop policy if exists profile_images_owner_delete on storage.objects;
create policy profile_images_owner_delete on storage.objects for delete to authenticated using(bucket_id='profile-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
