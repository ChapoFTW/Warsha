-- WPS-010: private worker profiles, portfolio, and professional certificates.

-- Profile fields stay short and practical. Existing longer biography text is
-- safely truncated before the forward constraint is validated.
update public.provider_profiles set about = pg_catalog.left(about, 500)
where pg_catalog.length(about) > 500;
alter table public.provider_profiles
  add column if not exists experience_summary text not null default '',
  add column if not exists specialties text[] not null default '{}';
alter table public.provider_profiles drop constraint if exists provider_profiles_about_length;
alter table public.provider_profiles add constraint provider_profiles_about_length
  check (pg_catalog.length(about) <= 500) not valid;
alter table public.provider_profiles validate constraint provider_profiles_about_length;
alter table public.provider_profiles drop constraint if exists provider_profiles_experience_summary_length;
alter table public.provider_profiles add constraint provider_profiles_experience_summary_length
  check (pg_catalog.length(experience_summary) <= 500) not valid;
alter table public.provider_profiles validate constraint provider_profiles_experience_summary_length;
alter table public.provider_profiles drop constraint if exists provider_profiles_specialties_count;
alter table public.provider_profiles add constraint provider_profiles_specialties_count
  check (pg_catalog.cardinality(specialties) <= 10) not valid;
alter table public.provider_profiles validate constraint provider_profiles_specialties_count;

-- Reuse provider_portfolio as the item record. A normalized child is required
-- because one item can now contain multiple ordered images.
alter table public.provider_portfolio alter column image_path drop not null;
alter table public.provider_portfolio
  add column if not exists title text,
  add column if not exists description text not null default '',
  add column if not exists category_id text references public.service_categories(id),
  add column if not exists service_id uuid references public.services(id),
  add column if not exists completed_period text,
  add column if not exists status text not null default 'draft',
  add column if not exists updated_at timestamptz not null default pg_catalog.now(),
  add column if not exists deleted_at timestamptz;
update public.provider_portfolio
set title = pg_catalog.left(coalesce(nullif(pg_catalog.btrim(caption), ''), 'Work example'), 80),
    description = pg_catalog.left(coalesce(caption, ''), 500),
    status = 'published'
where title is null;
alter table public.provider_portfolio alter column title set not null;
alter table public.provider_portfolio drop constraint if exists provider_portfolio_title_length;
alter table public.provider_portfolio add constraint provider_portfolio_title_length
  check (pg_catalog.length(pg_catalog.btrim(title)) between 2 and 80);
alter table public.provider_portfolio drop constraint if exists provider_portfolio_description_length;
alter table public.provider_portfolio add constraint provider_portfolio_description_length
  check (pg_catalog.length(description) <= 500);
alter table public.provider_portfolio drop constraint if exists provider_portfolio_period_length;
alter table public.provider_portfolio add constraint provider_portfolio_period_length
  check (completed_period is null or pg_catalog.length(completed_period) between 1 and 40);
alter table public.provider_portfolio drop constraint if exists provider_portfolio_status_check;
alter table public.provider_portfolio add constraint provider_portfolio_status_check
  check (status in ('draft', 'published'));
drop trigger if exists provider_portfolio_updated_at on public.provider_portfolio;
create trigger provider_portfolio_updated_at before update on public.provider_portfolio
for each row execute function private.set_updated_at();

create table public.provider_portfolio_images (
  id uuid primary key default gen_random_uuid(),
  portfolio_item_id uuid not null references public.provider_portfolio(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  file_size_bytes bigint,
  content_hash text,
  sort_order integer not null default 0 check (sort_order between 0 and 4),
  created_at timestamptz not null default pg_catalog.now(),
  unique(storage_path),
  unique(provider_id, content_hash)
);
insert into public.provider_portfolio_images(
  portfolio_item_id, provider_id, storage_path, mime_type, file_size_bytes,
  content_hash, sort_order, created_at
)
select id, provider_id, image_path, null, null,
  pg_catalog.md5(provider_id::text || ':' || image_path), 0, created_at
from public.provider_portfolio
where image_path is not null
on conflict do nothing;
create index provider_portfolio_owner_order_idx
  on public.provider_portfolio(provider_id, sort_order, id) where deleted_at is null;
create index provider_portfolio_images_item_order_idx
  on public.provider_portfolio_images(portfolio_item_id, sort_order, id);
alter table public.provider_portfolio_images enable row level security;

-- Other professional certificates reuse the existing table. Skill Certificate
-- remains in the WPS-006 verification flow.
alter table public.provider_certifications
  add column if not exists certificate_type text not null default 'professional',
  add column if not exists status text not null default 'draft',
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists rejection_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists expires_at date,
  add column if not exists updated_at timestamptz not null default pg_catalog.now(),
  add column if not exists deleted_at timestamptz;
update public.provider_certifications set status = case when is_public then 'approved' else 'draft' end;
update public.provider_certifications set is_public = false;
alter table public.provider_certifications drop constraint if exists provider_certifications_type_check;
alter table public.provider_certifications add constraint provider_certifications_type_check
  check (certificate_type in ('professional', 'trade_license', 'qualification', 'other'));
alter table public.provider_certifications drop constraint if exists provider_certifications_status_check;
alter table public.provider_certifications add constraint provider_certifications_status_check
  check (status in ('draft', 'submitted', 'approved', 'rejected', 'expired'));
alter table public.provider_certifications drop constraint if exists provider_certifications_title_length;
alter table public.provider_certifications add constraint provider_certifications_title_length
  check (pg_catalog.length(pg_catalog.btrim(title)) between 2 and 100);
alter table public.provider_certifications drop constraint if exists provider_certifications_issuer_length;
alter table public.provider_certifications add constraint provider_certifications_issuer_length
  check (issuer is null or pg_catalog.length(issuer) between 1 and 100);
alter table public.provider_certifications drop constraint if exists provider_certifications_reason_length;
alter table public.provider_certifications add constraint provider_certifications_reason_length
  check (rejection_reason is null or pg_catalog.length(rejection_reason) between 3 and 1000);
drop trigger if exists provider_certifications_updated_at on public.provider_certifications;
create trigger provider_certifications_updated_at before update on public.provider_certifications
for each row execute function private.set_updated_at();
create index provider_certifications_owner_status_idx
  on public.provider_certifications(provider_id, status, created_at desc)
  where deleted_at is null;

-- Private media buckets with server-side MIME and size boundaries.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-images', 'profile-images', false, 5242880,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]),
  ('provider-portfolios', 'provider-portfolios', false, 8388608,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]),
  ('provider-certificates', 'provider-certificates', false, 8388608,
    array['application/pdf','image/jpeg','image/png']::text[])
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.is_public_profile_image(p_storage_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.provider_profiles p
    where p.avatar_url = p_storage_path and private.is_provider_publicly_discoverable(p.id)
  )
$$;
create or replace function private.is_public_portfolio_image(p_storage_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.provider_portfolio_images i
    join public.provider_portfolio item on item.id = i.portfolio_item_id
    where i.storage_path = p_storage_path and item.status = 'published' and item.deleted_at is null
      and private.is_provider_publicly_discoverable(item.provider_id)
  )
$$;
revoke all on function private.is_public_profile_image(text) from public, anon, authenticated;
revoke all on function private.is_public_portfolio_image(text) from public, anon, authenticated;
grant execute on function private.is_public_profile_image(text) to anon, authenticated;
grant execute on function private.is_public_portfolio_image(text) to anon, authenticated;

drop policy if exists profile_images_public_read on storage.objects;
drop policy if exists public_media_read on storage.objects;
drop policy if exists provider_portfolio_write on storage.objects;

drop policy if exists wps010_profile_images_read on storage.objects;
create policy wps010_profile_images_read on storage.objects for select to anon, authenticated
using (
  bucket_id = 'profile-images' and (
    (select auth.uid()) is not null and (storage.foldername(name))[1] = (select auth.uid())::text
    or private.is_public_profile_image(name)
  )
);
drop policy if exists profile_images_owner_insert on storage.objects;
create policy profile_images_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.lower(storage.extension(name)) in ('jpg','jpeg','png','webp','heic','heif')
);
drop policy if exists profile_images_owner_update on storage.objects;
create policy profile_images_owner_update on storage.objects for update to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.lower(storage.extension(name)) in ('jpg','jpeg','png','webp','heic','heif')
);
drop policy if exists profile_images_owner_delete on storage.objects;
create policy profile_images_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists wps010_portfolio_media_read on storage.objects;
create policy wps010_portfolio_media_read on storage.objects for select to anon, authenticated
using (
  bucket_id = 'provider-portfolios' and (
    (select auth.uid()) is not null and (storage.foldername(name))[1] = (select auth.uid())::text
    or private.is_public_portfolio_image(name)
  )
);
drop policy if exists wps010_portfolio_media_insert on storage.objects;
create policy wps010_portfolio_media_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'provider-portfolios'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.lower(storage.extension(name)) in ('jpg','jpeg','png','webp','heic','heif')
);
drop policy if exists wps010_portfolio_media_delete on storage.objects;
create policy wps010_portfolio_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'provider-portfolios' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists wps010_certificate_media_read on storage.objects;
create policy wps010_certificate_media_read on storage.objects for select to authenticated
using (
  bucket_id = 'provider-certificates' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or private.is_staff()
  )
);
drop policy if exists wps010_certificate_media_insert on storage.objects;
create policy wps010_certificate_media_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'provider-certificates'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.lower(storage.extension(name)) in ('pdf','jpg','jpeg','png')
);
drop policy if exists wps010_certificate_media_delete on storage.objects;
create policy wps010_certificate_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'provider-certificates' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Full WPS-010 public-discovery gate.
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
    join auth.users u on u.id = p.user_id
    join public.provider_verifications v on v.provider_id = p.id
    where p.id = p_provider_id
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= pg_catalog.now())
      and u.phone is not null and u.phone_confirmed_at is not null
      and p.is_verified and p.is_published
      and p.onboarding_status = 'approved' and p.deleted_at is null
      and v.status = 'approved'
      and (v.expires_at is null or v.expires_at > pg_catalog.now())
      and pg_catalog.length(pg_catalog.btrim(p.display_name)) between 2 and 100
      and pg_catalog.length(pg_catalog.btrim(p.about)) between 20 and 500
      and p.avatar_url is not null
      and exists (
        select 1 from storage.objects o
        where o.bucket_id = 'profile-images' and o.name = p.avatar_url
      )
      and exists (
        select 1
        from public.provider_services ps
        join public.services s on s.id = ps.service_id
        join public.service_categories c on c.id = s.category_id
        where ps.provider_id = p.id and ps.is_active
          and s.is_active and s.deleted_at is null
          and c.is_active and c.deleted_at is null
      )
      and exists (
        select 1 from public.provider_service_areas a
        where a.provider_id = p.id and a.radius_km between 1 and 250
          and pg_catalog.length(pg_catalog.btrim(a.governorate)) > 0
      )
  )
$$;
revoke all on function private.is_provider_publicly_discoverable(uuid) from public, anon, authenticated;
grant execute on function private.is_provider_publicly_discoverable(uuid) to anon, authenticated;

-- Proven owner-read defects: draft services, areas, portfolio, certifications.
drop policy if exists provider_services_public_read on public.provider_services;
drop policy if exists provider_services_owner_read on public.provider_services;
create policy provider_services_owner_read on public.provider_services for select to authenticated
using (exists (
  select 1 from public.provider_profiles p
  where p.id = provider_id and p.user_id = (select auth.uid())
));
create policy provider_services_public_read on public.provider_services for select to anon, authenticated
using (is_active and private.is_provider_publicly_discoverable(provider_id));

drop policy if exists provider_areas_public_read on public.provider_service_areas;
drop policy if exists provider_areas_owner_read on public.provider_service_areas;
create policy provider_areas_owner_read on public.provider_service_areas for select to authenticated
using (exists (
  select 1 from public.provider_profiles p
  where p.id = provider_id and p.user_id = (select auth.uid())
));
-- Customers use the sanitized catalog location label; direct area rows can
-- contain private geometry and therefore remain owner-only.
revoke select on public.provider_service_areas from anon;
grant select on public.provider_service_areas to authenticated;

drop policy if exists portfolio_public_read on public.provider_portfolio;
drop policy if exists portfolio_own_write on public.provider_portfolio;
create policy portfolio_owner_manage on public.provider_portfolio for all to authenticated
using (exists (
  select 1 from public.provider_profiles p
  where p.id = provider_id and p.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.provider_profiles p
  where p.id = provider_id and p.user_id = (select auth.uid())
));
create policy portfolio_public_read on public.provider_portfolio for select to anon, authenticated
using (status = 'published' and deleted_at is null and private.is_provider_publicly_discoverable(provider_id));

create policy portfolio_images_owner_manage on public.provider_portfolio_images for all to authenticated
using (exists (
  select 1 from public.provider_profiles p
  where p.id = provider_id and p.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.provider_profiles p
  where p.id = provider_id and p.user_id = (select auth.uid())
));
drop policy if exists certifications_public_read on public.provider_certifications;
drop policy if exists certifications_own_read on public.provider_certifications;
create policy certifications_owner_read on public.provider_certifications for select to authenticated
using (private.is_staff() or exists (
  select 1 from public.provider_profiles p
  where p.id = provider_id and p.user_id = (select auth.uid())
));

revoke all on table public.provider_portfolio, public.provider_portfolio_images,
  public.provider_certifications from public, anon, authenticated;
grant select on table public.provider_portfolio to anon, authenticated;
grant select, insert, update, delete on table public.provider_portfolio_images to authenticated;
grant insert, update, delete on table public.provider_portfolio to authenticated;
grant select on table public.provider_certifications to authenticated;

-- Owner profile projection. Private object paths are returned only to the owner.
create or replace function public.get_my_worker_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pg_catalog.jsonb_build_object(
      'id', p.id,
      'status', p.onboarding_status,
      'displayName', p.display_name,
      'avatarPath', p.avatar_url,
      'profession', p.profession_key,
      'about', p.about,
      'experienceYears', p.experience_years,
      'experienceSummary', p.experience_summary,
      'specialties', p.specialties,
      'ratingAverage', p.rating_average,
      'languages', p.languages,
      'categoryIds', p.category_ids,
      'serviceRadiusKm', p.service_radius_km,
      'isAvailable', p.is_available,
      'emergencyAvailable', p.emergency_available,
      'temporaryUnavailableUntil', p.temporary_unavailable_until,
      'agreementAccepted', p.provider_agreement_accepted_at is not null,
      'services', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'serviceId', ps.service_id, 'name', s.name
        ) order by s.name, s.id)
        from public.provider_services ps join public.services s on s.id = ps.service_id
        where ps.provider_id = p.id
      ), '[]'::jsonb),
      'areas', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'governorate', a.governorate, 'district', coalesce(a.district, ''),
          'radiusKm', a.radius_km
        ) order by a.governorate, a.district, a.id)
        from public.provider_service_areas a where a.provider_id = p.id
      ), '[]'::jsonb)
    )
    from public.provider_profiles p
    where p.user_id = (select auth.uid()) and p.deleted_at is null
  ), '{}'::jsonb)
$$;
revoke all on function public.get_my_worker_profile() from public, anon;
grant execute on function public.get_my_worker_profile() to authenticated;

-- WPS-010 profile save keeps catalog pricing defaults and no longer requires a
-- worker-maintained price configuration.
create or replace function public.save_provider_foundation(
  p_profile jsonb,
  p_submit boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pid uuid;
  item jsonb;
  radius numeric;
  area_radius numeric;
  next_status text;
  bio text;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_profile is null or pg_catalog.jsonb_typeof(p_profile) <> 'object'
    then raise exception 'Invalid provider information' using errcode = '22023'; end if;
  select id, onboarding_status into pid, next_status
  from public.provider_profiles where user_id = uid and deleted_at is null for update;
  if pid is null then raise exception 'Provider profile not found' using errcode = '42501'; end if;
  bio := pg_catalog.btrim(coalesce(p_profile->>'about', ''));
  radius := coalesce((p_profile->>'serviceRadiusKm')::numeric, 0);
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_profile->>'displayName', ''))) not between 2 and 100
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_profile->>'profession', ''))) not between 2 and 100
    or pg_catalog.length(bio) > 500
    or pg_catalog.length(coalesce(p_profile->>'experienceSummary', '')) > 500
    or coalesce((p_profile->>'experienceYears')::integer, -1) not between 0 and 80
    or radius not between 1 and 250
  then raise exception 'Invalid provider information' using errcode = '22023'; end if;
  if pg_catalog.jsonb_array_length(coalesce(p_profile->'specialties', '[]'::jsonb)) > 10
    or exists (
      select 1 from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'specialties', '[]'::jsonb)) s
      where pg_catalog.length(pg_catalog.btrim(s.value)) not between 1 and 50
    )
  then raise exception 'Invalid specialties' using errcode = '22023'; end if;
  if p_submit and (
    not coalesce((p_profile->>'agreementAccepted')::boolean, false)
    or pg_catalog.length(bio) < 20
    or not exists (select 1 from storage.objects o where o.bucket_id = 'profile-images' and o.name = (
      select avatar_url from public.provider_profiles where id = pid
    ))
  ) then raise exception 'Complete the required profile details' using errcode = '22023'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'categoryIds', '[]'::jsonb)) c
    where not exists (
      select 1 from public.service_categories sc
      where sc.id = c.value and sc.id in (
        'plumbing','electrical','carpentry','ac','cleaning','painting',
        'appliance-repair','satellite-tv-installation','moving-help','general-maintenance'
      ) and sc.is_active and sc.deleted_at is null
    )
  ) then raise exception 'Invalid service category' using errcode = '22023'; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::jsonb)))
    <> (select pg_catalog.count(distinct value->>'serviceId') from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::jsonb)))
  then raise exception 'Duplicate provider service' using errcode = '22023'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(p_profile->'areas','[]'::jsonb)) a
    group by a.value->>'governorate', a.value->>'district' having pg_catalog.count(*) > 1
  ) then raise exception 'Duplicate service area' using errcode = '22023'; end if;
  if p_submit and next_status in ('draft','more_information_required','rejected') then next_status := 'submitted'; end if;

  update public.provider_profiles set
    display_name = pg_catalog.btrim(p_profile->>'displayName'),
    profession_key = pg_catalog.btrim(p_profile->>'profession'),
    about = bio,
    experience_years = (p_profile->>'experienceYears')::integer,
    experience_summary = pg_catalog.btrim(coalesce(p_profile->>'experienceSummary', '')),
    specialties = coalesce(array(
      select pg_catalog.btrim(value) from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'specialties','[]'::jsonb))
    ), '{}'),
    languages = coalesce(array(
      select pg_catalog.left(pg_catalog.btrim(value), 50) from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'languages','[]'::jsonb))
      where pg_catalog.length(pg_catalog.btrim(value)) > 0 limit 10
    ), '{}'),
    skills = coalesce(array(
      select pg_catalog.btrim(value) from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'specialties','[]'::jsonb))
    ), '{}'),
    category_ids = coalesce(array(
      select value from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'categoryIds','[]'::jsonb)) limit 10
    ), '{}'),
    primary_category_id = nullif(p_profile->'categoryIds'->>0, ''),
    service_radius_km = radius,
    is_available = coalesce((p_profile->>'isAvailable')::boolean, false),
    emergency_available = coalesce((p_profile->>'emergencyAvailable')::boolean, false),
    temporary_unavailable_until = nullif(p_profile->>'temporaryUnavailableUntil', '')::timestamptz,
    provider_agreement_accepted_at = case
      when coalesce((p_profile->>'agreementAccepted')::boolean, false)
        then coalesce(provider_agreement_accepted_at, pg_catalog.now())
      else provider_agreement_accepted_at end,
    onboarding_status = next_status
  where id = pid and user_id = uid;

  delete from public.provider_services where provider_id = pid;
  for item in select * from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::jsonb)) loop
    insert into public.provider_services(
      provider_id, service_id, custom_price_egp, pricing_type,
      transportation_fee_egp, emergency_surcharge_egp, is_active
    )
    select pid, s.id, null, s.pricing_type, 0, 0, true
    from public.services s join public.service_categories c on c.id = s.category_id
    where s.id = (item->>'serviceId')::uuid and s.is_active and s.deleted_at is null
      and c.is_active and c.deleted_at is null
      and c.id in (
        'plumbing','electrical','carpentry','ac','cleaning','painting',
        'appliance-repair','satellite-tv-installation','moving-help','general-maintenance'
      );
    if not found then raise exception 'Invalid service' using errcode = '22023'; end if;
  end loop;

  delete from public.provider_service_areas where provider_id = pid;
  for item in select * from pg_catalog.jsonb_array_elements(coalesce(p_profile->'areas','[]'::jsonb)) loop
    area_radius := coalesce((item->>'radiusKm')::numeric, radius);
    if area_radius not between 1 and 250
      or pg_catalog.length(pg_catalog.btrim(coalesce(item->>'governorate',''))) not between 1 and 100
      or pg_catalog.length(pg_catalog.btrim(coalesce(item->>'district',''))) > 100
    then raise exception 'Invalid service area' using errcode = '22023'; end if;
    insert into public.provider_service_areas(provider_id, governorate, district, latitude, longitude, radius_km)
    values (
      pid, pg_catalog.btrim(item->>'governorate'),
      nullif(pg_catalog.btrim(coalesce(item->>'district','')), ''), null, null, area_radius
    );
  end loop;
  if p_submit and (
    not exists (select 1 from public.provider_services where provider_id = pid and is_active)
    or not exists (select 1 from public.provider_service_areas where provider_id = pid)
  ) then raise exception 'Add a service and work area' using errcode = '22023'; end if;
exception
  when sqlstate '42501' or sqlstate '22023' then raise;
  when others then raise exception 'Unable to save provider profile' using errcode = 'P0001';
end;
$$;
revoke all on function public.save_provider_foundation(jsonb, boolean) from public, anon;
grant execute on function public.save_provider_foundation(jsonb, boolean) to authenticated;

create or replace function public.set_my_provider_profile_photo(
  p_storage_path text,
  p_expected_current text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); old_path text;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select avatar_url into old_path from public.provider_profiles
  where user_id = uid and deleted_at is null for update;
  if not found then raise exception 'Provider profile not found' using errcode = '42501'; end if;
  if old_path is distinct from p_expected_current
    then raise exception 'Profile photo changed' using errcode = '40001'; end if;
  if p_storage_path is not null and (
    p_storage_path not like uid::text || '/avatar/%'
    or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'profile-images' and o.name = p_storage_path
        and coalesce(o.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp','image/heic','image/heif')
        and coalesce((o.metadata->>'size')::bigint, 0) between 1 and 5242880
    )
  ) then raise exception 'Invalid profile image' using errcode = '22023'; end if;
  update public.provider_profiles set avatar_url = p_storage_path where user_id = uid;
  return old_path;
end;
$$;
revoke all on function public.set_my_provider_profile_photo(text, text) from public, anon;
grant execute on function public.set_my_provider_profile_photo(text, text) to authenticated;

create or replace function public.get_my_provider_portfolio()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', item.id, 'title', item.title, 'description', item.description,
    'categoryId', item.category_id, 'serviceId', item.service_id,
    'completedPeriod', item.completed_period, 'status', item.status,
    'sortOrder', item.sort_order, 'createdAt', item.created_at,
    'images', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', i.id, 'storagePath', i.storage_path, 'mimeType', i.mime_type,
      'fileSizeBytes', i.file_size_bytes, 'contentHash', i.content_hash,
      'sortOrder', i.sort_order
    ) order by i.sort_order, i.id) from public.provider_portfolio_images i
      where i.portfolio_item_id = item.id), '[]'::jsonb)
  ) order by item.sort_order, item.id), '[]'::jsonb)
  from public.provider_portfolio item
  join public.provider_profiles p on p.id = item.provider_id
  where p.user_id = (select auth.uid()) and item.deleted_at is null
$$;
revoke all on function public.get_my_provider_portfolio() from public, anon;
grant execute on function public.get_my_provider_portfolio() to authenticated;

create or replace function public.save_my_provider_portfolio_item(p_item jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); pid uuid; item_id uuid; next_status text;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select id into pid from public.provider_profiles where user_id = uid and deleted_at is null;
  if pid is null then raise exception 'Provider profile not found' using errcode = '42501'; end if;
  item_id := nullif(p_item->>'id','')::uuid;
  next_status := coalesce(p_item->>'status','draft');
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_item->>'title',''))) not between 2 and 80
    or pg_catalog.length(coalesce(p_item->>'description','')) > 500
    or pg_catalog.length(coalesce(p_item->>'completedPeriod','')) > 40
    or next_status not in ('draft','published')
  then raise exception 'Invalid portfolio item' using errcode = '22023'; end if;
  if nullif(p_item->>'categoryId','') is not null and not exists (
    select 1 from public.service_categories c where c.id = p_item->>'categoryId' and c.is_active and c.deleted_at is null
  ) then raise exception 'Invalid portfolio category' using errcode = '22023'; end if;
  if nullif(p_item->>'serviceId','') is not null and not exists (
    select 1 from public.provider_services ps where ps.provider_id = pid
      and ps.service_id = (p_item->>'serviceId')::uuid and ps.is_active
  ) then raise exception 'Invalid portfolio service' using errcode = '22023'; end if;
  if item_id is null then
    if (select pg_catalog.count(*) from public.provider_portfolio where provider_id = pid and deleted_at is null) >= 12
      then raise exception 'Portfolio item limit reached' using errcode = '22023'; end if;
    insert into public.provider_portfolio(
      provider_id, title, description, category_id, service_id, completed_period, status, sort_order
    ) values (
      pid, pg_catalog.btrim(p_item->>'title'), pg_catalog.btrim(coalesce(p_item->>'description','')),
      nullif(p_item->>'categoryId',''), nullif(p_item->>'serviceId','')::uuid,
      nullif(pg_catalog.btrim(coalesce(p_item->>'completedPeriod','')), ''), 'draft',
      coalesce((select pg_catalog.max(sort_order) + 1 from public.provider_portfolio where provider_id = pid and deleted_at is null), 0)
    ) returning id into item_id;
  else
    update public.provider_portfolio set
      title = pg_catalog.btrim(p_item->>'title'),
      description = pg_catalog.btrim(coalesce(p_item->>'description','')),
      category_id = nullif(p_item->>'categoryId',''),
      service_id = nullif(p_item->>'serviceId','')::uuid,
      completed_period = nullif(pg_catalog.btrim(coalesce(p_item->>'completedPeriod','')), ''),
      status = next_status
    where id = item_id and provider_id = pid and deleted_at is null;
    if not found then raise exception 'Portfolio item not found' using errcode = '42501'; end if;
  end if;
  if next_status = 'published' then
    if not exists (select 1 from public.provider_portfolio_images where portfolio_item_id = item_id)
      then raise exception 'Add a portfolio image first' using errcode = '22023'; end if;
    update public.provider_portfolio set status = 'published' where id = item_id;
  end if;
  return item_id;
end;
$$;

create or replace function public.register_my_provider_portfolio_image(
  p_item_id uuid, p_storage_path text, p_mime_type text,
  p_file_size_bytes bigint, p_content_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); pid uuid; result_id uuid;
begin
  select p.id into pid from public.provider_profiles p
  join public.provider_portfolio item on item.provider_id = p.id
  where p.user_id = uid and item.id = p_item_id and item.deleted_at is null for update of item;
  if pid is null then raise exception 'Portfolio item not found' using errcode = '42501'; end if;
  if p_storage_path not like uid::text || '/' || pid::text || '/' || p_item_id::text || '/%'
    or p_mime_type not in ('image/jpeg','image/png','image/webp','image/heic','image/heif')
    or p_file_size_bytes not between 1 and 8388608
    or p_content_hash !~ '^[0-9a-f]{32}$'
    or not exists (
      select 1 from storage.objects o where o.bucket_id = 'provider-portfolios'
        and o.name = p_storage_path and coalesce(o.metadata->>'mimetype','') = p_mime_type
        and coalesce((o.metadata->>'size')::bigint, 0) = p_file_size_bytes
    )
  then raise exception 'Invalid portfolio image' using errcode = '22023'; end if;
  if (select pg_catalog.count(*) from public.provider_portfolio_images where portfolio_item_id = p_item_id) >= 5
    or coalesce((select pg_catalog.sum(file_size_bytes) from public.provider_portfolio_images where portfolio_item_id = p_item_id),0) + p_file_size_bytes > 41943040
  then raise exception 'Portfolio image limit reached' using errcode = '22023'; end if;
  if exists (select 1 from public.provider_portfolio_images where provider_id = pid and content_hash = p_content_hash)
    then raise exception 'Duplicate portfolio image' using errcode = '23505'; end if;
  insert into public.provider_portfolio_images(
    portfolio_item_id, provider_id, storage_path, mime_type, file_size_bytes, content_hash, sort_order
  ) values (
    p_item_id, pid, p_storage_path, p_mime_type, p_file_size_bytes, p_content_hash,
    coalesce((select pg_catalog.max(sort_order) + 1 from public.provider_portfolio_images where portfolio_item_id = p_item_id),0)
  ) returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.reorder_my_provider_portfolio(p_item_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); pid uuid; expected integer; supplied integer;
begin
  select id into pid from public.provider_profiles where user_id = uid and deleted_at is null;
  select pg_catalog.count(*) into expected from public.provider_portfolio where provider_id = pid and deleted_at is null;
  select pg_catalog.count(distinct value) into supplied from pg_catalog.unnest(coalesce(p_item_ids,'{}')) value;
  if pid is null or expected <> supplied or exists (
    select 1 from pg_catalog.unnest(coalesce(p_item_ids,'{}')) value
    where not exists (select 1 from public.provider_portfolio item where item.id = value and item.provider_id = pid and item.deleted_at is null)
  ) then raise exception 'Invalid portfolio order' using errcode = '22023'; end if;
  update public.provider_portfolio item set sort_order = ordering.position - 1
  from pg_catalog.unnest(p_item_ids) with ordinality ordering(id, position)
  where item.id = ordering.id and item.provider_id = pid;
end;
$$;

create or replace function public.reorder_my_provider_portfolio_images(p_item_id uuid, p_image_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); pid uuid; expected integer; supplied integer;
begin
  select p.id into pid from public.provider_profiles p join public.provider_portfolio item on item.provider_id = p.id
  where p.user_id = uid and item.id = p_item_id and item.deleted_at is null;
  select pg_catalog.count(*) into expected from public.provider_portfolio_images where portfolio_item_id = p_item_id;
  select pg_catalog.count(distinct value) into supplied from pg_catalog.unnest(coalesce(p_image_ids,'{}')) value;
  if pid is null or expected <> supplied or exists (
    select 1 from pg_catalog.unnest(coalesce(p_image_ids,'{}')) value
    where not exists (select 1 from public.provider_portfolio_images i where i.id = value and i.portfolio_item_id = p_item_id and i.provider_id = pid)
  ) then raise exception 'Invalid portfolio image order' using errcode = '22023'; end if;
  update public.provider_portfolio_images image set sort_order = ordering.position - 1
  from pg_catalog.unnest(p_image_ids) with ordinality ordering(id, position)
  where image.id = ordering.id and image.portfolio_item_id = p_item_id;
end;
$$;

create or replace function public.remove_my_provider_portfolio_image(p_image_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); path text;
begin
  delete from public.provider_portfolio_images i using public.provider_profiles p
  where i.id = p_image_id and p.id = i.provider_id and p.user_id = uid
  returning i.storage_path into path;
  if path is null then raise exception 'Portfolio image not found' using errcode = '42501'; end if;
  return path;
end;
$$;

create or replace function public.remove_my_provider_portfolio_item(p_item_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); pid uuid; paths text[];
begin
  select p.id into pid from public.provider_profiles p join public.provider_portfolio item on item.provider_id = p.id
  where p.user_id = uid and item.id = p_item_id and item.deleted_at is null for update of item;
  if pid is null then raise exception 'Portfolio item not found' using errcode = '42501'; end if;
  select coalesce(pg_catalog.array_agg(storage_path), '{}') into paths
  from public.provider_portfolio_images where portfolio_item_id = p_item_id;
  update public.provider_portfolio set deleted_at = pg_catalog.now(), status = 'draft' where id = p_item_id;
  delete from public.provider_portfolio_images where portfolio_item_id = p_item_id;
  return paths;
end;
$$;

-- Certificate owner/staff RPCs. Public clients receive aggregate booleans only.
create or replace function public.get_my_provider_certificates()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', c.id, 'type', c.certificate_type, 'title', c.title, 'issuer', c.issuer,
    'status', c.status, 'storagePath', c.document_path, 'mimeType', c.mime_type,
    'fileSizeBytes', c.file_size_bytes, 'rejectionReason', c.rejection_reason,
    'submittedAt', c.submitted_at, 'reviewedAt', c.reviewed_at,
    'expiresAt', c.expires_at, 'createdAt', c.created_at
  ) order by c.created_at desc, c.id), '[]'::jsonb)
  from public.provider_certifications c join public.provider_profiles p on p.id = c.provider_id
  where p.user_id = (select auth.uid()) and c.deleted_at is null
$$;

create or replace function public.save_my_provider_certificate(p_certificate jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); pid uuid; cid uuid;
begin
  select id into pid from public.provider_profiles where user_id = uid and deleted_at is null;
  if pid is null then raise exception 'Provider profile not found' using errcode = '42501'; end if;
  cid := nullif(p_certificate->>'id','')::uuid;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_certificate->>'title',''))) not between 2 and 100
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_certificate->>'issuer',''))) > 100
    or coalesce(p_certificate->>'type','professional') not in ('professional','trade_license','qualification','other')
  then raise exception 'Invalid certificate' using errcode = '22023'; end if;
  if cid is null then
    insert into public.provider_certifications(provider_id, certificate_type, title, issuer, status, is_public)
    values (pid, coalesce(p_certificate->>'type','professional'), pg_catalog.btrim(p_certificate->>'title'),
      nullif(pg_catalog.btrim(coalesce(p_certificate->>'issuer','')), ''), 'draft', false)
    returning id into cid;
  else
    update public.provider_certifications set certificate_type = coalesce(p_certificate->>'type','professional'),
      title = pg_catalog.btrim(p_certificate->>'title'), issuer = nullif(pg_catalog.btrim(coalesce(p_certificate->>'issuer','')), ''),
      status = 'draft', rejection_reason = null, reviewed_by = null, reviewed_at = null
    where id = cid and provider_id = pid and deleted_at is null and status in ('draft','rejected','expired');
    if not found then raise exception 'Certificate is locked' using errcode = '42501'; end if;
  end if;
  return cid;
end;
$$;

create or replace function public.register_my_provider_certificate_document(
  p_certificate_id uuid, p_storage_path text, p_mime_type text,
  p_file_size_bytes bigint, p_expected_current text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); pid uuid; old_path text;
begin
  select p.id, c.document_path into pid, old_path
  from public.provider_profiles p join public.provider_certifications c on c.provider_id = p.id
  where p.user_id = uid and c.id = p_certificate_id and c.deleted_at is null
    and c.status in ('draft','rejected','expired') for update of c;
  if pid is null then raise exception 'Certificate is locked' using errcode = '42501'; end if;
  if old_path is distinct from p_expected_current then raise exception 'Certificate changed' using errcode = '40001'; end if;
  if p_storage_path is not null and (
    p_storage_path not like uid::text || '/' || pid::text || '/' || p_certificate_id::text || '/%'
    or p_mime_type not in ('application/pdf','image/jpeg','image/png')
    or p_file_size_bytes not between 1 and 8388608
    or not exists (
      select 1 from storage.objects o where o.bucket_id = 'provider-certificates'
        and o.name = p_storage_path and coalesce(o.metadata->>'mimetype','') = p_mime_type
        and coalesce((o.metadata->>'size')::bigint, 0) = p_file_size_bytes
    )
  ) then raise exception 'Invalid certificate document' using errcode = '22023'; end if;
  update public.provider_certifications set document_path = p_storage_path,
    mime_type = case when p_storage_path is null then null else p_mime_type end,
    file_size_bytes = case when p_storage_path is null then null else p_file_size_bytes end,
    status = 'draft', rejection_reason = null
  where id = p_certificate_id;
  return old_path;
end;
$$;

create or replace function public.submit_my_provider_certificate(p_certificate_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  update public.provider_certifications c set status = 'submitted', submitted_at = pg_catalog.now(),
    rejection_reason = null, reviewed_by = null, reviewed_at = null
  from public.provider_profiles p
  where c.id = p_certificate_id and p.id = c.provider_id and p.user_id = uid
    and c.deleted_at is null and c.status in ('draft','rejected','expired')
    and c.document_path is not null and exists (
      select 1 from storage.objects o where o.bucket_id = 'provider-certificates' and o.name = c.document_path
    );
  if not found then raise exception 'Certificate document is required' using errcode = '22023'; end if;
end;
$$;

create or replace function public.remove_my_provider_certificate(p_certificate_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); path text;
begin
  select c.document_path into path
  from public.provider_certifications c join public.provider_profiles p on p.id = c.provider_id
  where c.id = p_certificate_id and p.user_id = uid and c.deleted_at is null
    and c.status in ('draft','rejected','expired') for update of c;
  if not found then raise exception 'Certificate cannot be removed' using errcode = '42501'; end if;
  update public.provider_certifications set deleted_at = pg_catalog.now(), document_path = null,
    mime_type = null, file_size_bytes = null, is_public = false
  where id = p_certificate_id;
  return path;
end;
$$;

create or replace function public.review_provider_certificate(
  p_certificate_id uuid, p_status text, p_reason text default null, p_expires_at date default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or not private.is_staff() then raise exception 'Staff access required' using errcode = '42501'; end if;
  if p_status not in ('approved','rejected','expired')
    or p_status = 'rejected' and pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) not between 3 and 1000
    or p_status = 'approved' and p_expires_at is not null and p_expires_at <= current_date
  then raise exception 'Invalid certificate review' using errcode = '22023'; end if;
  update public.provider_certifications set status = p_status,
    rejection_reason = case when p_status = 'rejected' then pg_catalog.btrim(p_reason) else null end,
    reviewed_by = uid, reviewed_at = pg_catalog.now(),
    expires_at = case when p_status = 'approved' then p_expires_at when p_status = 'expired' then coalesce(expires_at, current_date) else null end,
    is_public = false
  where id = p_certificate_id and deleted_at is null and status in ('submitted','approved');
  if not found then raise exception 'Certificate not ready for review' using errcode = '22023'; end if;
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'save_my_provider_portfolio_item(jsonb)',
    'register_my_provider_portfolio_image(uuid,text,text,bigint,text)',
    'reorder_my_provider_portfolio(uuid[])',
    'reorder_my_provider_portfolio_images(uuid,uuid[])',
    'remove_my_provider_portfolio_image(uuid)',
    'remove_my_provider_portfolio_item(uuid)',
    'get_my_provider_certificates()',
    'save_my_provider_certificate(jsonb)',
    'register_my_provider_certificate_document(uuid,text,text,bigint,text)',
    'submit_my_provider_certificate(uuid)',
    'remove_my_provider_certificate(uuid)'
  ] loop
    execute pg_catalog.format('revoke all on function public.%s from public, anon', signature);
    execute pg_catalog.format('grant execute on function public.%s to authenticated', signature);
  end loop;
end $$;
revoke all on function public.review_provider_certificate(uuid,text,text,date) from public, anon;
grant execute on function public.review_provider_certificate(uuid,text,text,date) to authenticated;

-- Sanitized trust and catalog projections. Private certificate fields never
-- enter these objects. Storage references are adapter-only hydration inputs.
create or replace function public.get_provider_trust_indicators(p_provider_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select pg_catalog.jsonb_build_object(
    'identityVerified', true,
    'skillCertificateVerified', p.skill_certificate_verified
  ) || case when exists (
    select 1 from public.provider_certifications c where c.provider_id = p.id
      and c.status = 'approved' and c.deleted_at is null
      and (c.expires_at is null or c.expires_at >= current_date)
  ) then pg_catalog.jsonb_build_object('professionalCertificateVerified', true)
    else '{}'::jsonb end
  from public.provider_profiles p where p.id = p_provider_id
    and private.is_provider_publicly_discoverable(p.id)), '{}'::jsonb)
$$;

create or replace function public.get_marketplace_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'categories', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', c.id, 'translation_key', c.translation_key, 'icon_name', c.icon_name,
      'description_key', c.description_key
    ) order by c.sort_order, c.id) from public.service_categories c
      where c.is_active and c.deleted_at is null and c.id in (
        'plumbing','electrical','carpentry','ac','cleaning','painting',
        'appliance-repair','satellite-tv-installation','moving-help','general-maintenance'
      )), '[]'::jsonb),
    'services', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', s.id, 'category_id', s.category_id, 'name', s.name,
      'price_egp', s.price_egp, 'pricing_type', s.pricing_type, 'duration_label', s.duration_label
    ) order by s.name, s.id) from public.services s join public.service_categories c on c.id = s.category_id
      where s.is_active and s.deleted_at is null and c.is_active and c.deleted_at is null), '[]'::jsonb),
    'providers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'profession_key', p.profession_key,
      'primary_category_id', p.primary_category_id, 'category_ids', p.category_ids,
      'rating_average', p.rating_average, 'review_count', p.review_count,
      'starting_price_egp', p.starting_price_egp, 'avatar_ref', p.avatar_url,
      'is_verified', true, 'skill_certificate_verified', p.skill_certificate_verified,
      'professional_certificate_verified', exists (
        select 1 from public.provider_certifications cert where cert.provider_id = p.id
          and cert.status = 'approved' and cert.deleted_at is null
          and (cert.expires_at is null or cert.expires_at >= current_date)
      ),
      'professional_certificate_count', (select pg_catalog.count(*) from public.provider_certifications cert
        where cert.provider_id = p.id and cert.status = 'approved' and cert.deleted_at is null
          and (cert.expires_at is null or cert.expires_at >= current_date)),
      'is_available', p.is_available, 'bookable', true,
      'emergency_available', p.emergency_available, 'completed_jobs', p.completed_jobs,
      'experience_years', p.experience_years, 'experience_summary', p.experience_summary,
      'response_time_label', p.response_time_label,
      'location_label', coalesce((select pg_catalog.concat_ws(', ', a.district, a.governorate)
        from public.provider_service_areas a where a.provider_id = p.id order by a.id limit 1), p.location_label),
      'service_radius_km', pg_catalog.round(p.service_radius_km),
      'languages', p.languages, 'about', p.about, 'specialties', p.specialties,
      'guarantee_text', p.guarantee_text, 'supported_payment_methods', '[]'::jsonb,
      'provider_services', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'service_id', ps.service_id, 'custom_price_egp', ps.custom_price_egp,
        'pricing_type', ps.pricing_type, 'is_active', ps.is_active,
        'service', pg_catalog.jsonb_build_object('id', s.id, 'name', s.name,
          'price_egp', s.price_egp, 'pricing_type', s.pricing_type, 'duration_label', s.duration_label)
      ) order by s.name, s.id) from public.provider_services ps join public.services s on s.id = ps.service_id
        where ps.provider_id = p.id and ps.is_active and s.is_active and s.deleted_at is null), '[]'::jsonb),
      'portfolio', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', item.id, 'title', item.title, 'description', item.description,
        'category_id', item.category_id, 'service_id', item.service_id,
        'completed_period', item.completed_period,
        'image_refs', coalesce((select pg_catalog.jsonb_agg(i.storage_path order by i.sort_order, i.id)
          from public.provider_portfolio_images i where i.portfolio_item_id = item.id), '[]'::jsonb)
      ) order by item.sort_order, item.id) from public.provider_portfolio item
        where item.provider_id = p.id and item.status = 'published' and item.deleted_at is null), '[]'::jsonb)
    ) order by p.rating_average desc, p.display_name, p.id)
    from public.provider_profiles p where private.is_provider_publicly_discoverable(p.id)), '[]'::jsonb)
  )
$$;
revoke all on function public.get_provider_trust_indicators(uuid) from public;
revoke all on function public.get_marketplace_catalog() from public;
grant execute on function public.get_provider_trust_indicators(uuid) to anon, authenticated;
grant execute on function public.get_marketplace_catalog() to anon, authenticated;
