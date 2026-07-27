-- Focused production-audit hardening. Migrations 001-010 are already applied,
-- so their confirmed gaps are corrected here rather than rewriting history.

-- Booking creation is RPC-only. The legacy policy allowed customers to forge
-- status, price, snapshots, and completed bookings with a direct INSERT.
drop policy if exists bookings_customer_insert on public.bookings;
revoke insert on public.bookings from public, anon, authenticated;

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
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or pg_catalog.length(p_idempotency_key) not between 16 and 200 then
    raise exception 'Invalid booking request' using errcode = '22023';
  end if;

  -- Serialize retries for the same customer request before checking for an
  -- existing row. This makes concurrent duplicate submissions idempotent.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    uid::text || ':' || p_idempotency_key,
    0
  ));

  select b.id into existing_id
  from public.bookings b
  where b.idempotency_key = p_idempotency_key and b.customer_id = uid;
  if existing_id is not null then
    return existing_id;
  end if;

  perform public.ensure_customer_profile();
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_issue_description, ''))) not between 8 and 2000
    or pg_catalog.length(coalesce(p_notes, '')) > 2000
  then
    raise exception 'Invalid booking information' using errcode = '22023';
  end if;
  if p_booking_type is null or p_booking_type not in ('scheduled', 'emergency') then
    raise exception 'Invalid booking type' using errcode = '22023';
  end if;

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
  join public.provider_profiles p on p.id = ps.provider_id
  where ps.provider_id = p_provider_id
    and ps.service_id = p_service_id
    and ps.is_active
    and s.is_active
    and s.deleted_at is null
    and p.onboarding_status = 'approved'
    and p.is_published
    and p.deleted_at is null;

  if service_row.id is null
    or service_row.provider_user_id is null
    or service_row.provider_user_id is not distinct from uid
  then
    raise exception 'Service unavailable' using errcode = '22023';
  end if;
  if p_booking_type = 'emergency' and not (service_row.emergency_available and service_row.is_available) then
    raise exception 'Emergency service unavailable' using errcode = '22023';
  end if;
  if p_booking_type = 'scheduled' and (
    booking_date is null
    or booking_time is null
    or booking_date + booking_time <= pg_catalog.timezone('Africa/Cairo', pg_catalog.now())
  ) then
    raise exception 'Choose a future booking time' using errcode = '22023';
  end if;

  if p_booking_type = 'scheduled' and not exists (
    select 1
    from public.provider_availability a
    where a.provider_id = p_provider_id
      and (a.available_date = booking_date or (
        a.available_date is null
        and a.weekday = extract(dow from booking_date)::smallint
      ))
      and booking_time >= a.start_time
      and booking_time < a.end_time
      and not (
        a.break_start is not null and a.break_end is not null
        and booking_time >= a.break_start and booking_time < a.break_end
      )
  ) then
    raise exception 'Booking time unavailable' using errcode = '22023';
  end if;

  if p_booking_type = 'scheduled' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      p_provider_id::text || ':' || booking_date::text || ':' || booking_time::text,
      0
    ));
    if exists (
      select 1 from public.bookings b
      where b.provider_id = p_provider_id
        and b.scheduled_date = booking_date
        and b.scheduled_time = booking_time
        and b.deleted_at is null
        and b.status not in ('rejected', 'cancelled', 'refunded', 'no_show')
    ) then
      raise exception 'Booking time unavailable' using errcode = '22023';
    end if;
  end if;

  select * into address_row
  from public.addresses a
  where a.id = p_address_id and a.customer_id = uid and a.deleted_at is null;
  if address_row.id is null then
    raise exception 'Address not found' using errcode = '42501';
  end if;

  service_price := service_row.price;
  transport := service_row.transportation_fee_egp;
  emergency := case when p_booking_type = 'emergency' then service_row.emergency_surcharge_egp else 0 end;
  estimated_total := service_price + transport + emergency;

  insert into public.bookings(
    customer_id, provider_id, service_id, status, service_name_snapshot,
    pricing_type, estimated_price_egp, issue_description, notes,
    scheduled_date, scheduled_time, address_id, address_snapshot,
    booking_type, price_breakdown, idempotency_key
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
    p_idempotency_key
  )
  on conflict(idempotency_key) do nothing
  returning id into booking_id;

  if booking_id is null then
    select b.id into booking_id
    from public.bookings b
    where b.idempotency_key = p_idempotency_key and b.customer_id = uid;
  end if;
  if booking_id is null then
    raise exception 'Booking request already used' using errcode = '23505';
  end if;
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
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_scheduled_date is null or p_scheduled_time is null
    or p_scheduled_date + p_scheduled_time <= pg_catalog.timezone('Africa/Cairo', pg_catalog.now())
  then
    raise exception 'Choose a future booking time' using errcode = '22023';
  end if;

  select b.status, b.provider_id, p.user_id, b.scheduled_date, b.scheduled_time
  into current_status, target_provider, provider_uid, previous_date, previous_time
  from public.bookings b
  join public.provider_profiles p on p.id = b.provider_id
  where b.id = p_booking_id and b.customer_id = uid and b.deleted_at is null
  for update of b;
  if current_status not in ('pending_provider_approval', 'accepted', 'confirmed') then
    raise exception 'Booking cannot be rescheduled' using errcode = '22023';
  end if;
  if previous_date = p_scheduled_date and previous_time = p_scheduled_time then
    raise exception 'Choose a different booking time' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_provider::text || ':' || p_scheduled_date::text || ':' || p_scheduled_time::text,
    0
  ));
  if not exists (
    select 1 from public.provider_availability a
    where a.provider_id = target_provider
      and (a.available_date = p_scheduled_date or (
        a.available_date is null
        and a.weekday = extract(dow from p_scheduled_date)::smallint
      ))
      and p_scheduled_time >= a.start_time and p_scheduled_time < a.end_time
      and not (a.break_start is not null and a.break_end is not null
        and p_scheduled_time >= a.break_start and p_scheduled_time < a.break_end)
  ) or exists (
    select 1 from public.bookings b
    where b.id <> p_booking_id
      and b.provider_id = target_provider
      and b.scheduled_date = p_scheduled_date
      and b.scheduled_time = p_scheduled_time
      and b.deleted_at is null
      and b.status not in ('rejected', 'cancelled', 'refunded', 'no_show')
  ) then
    raise exception 'Booking time unavailable' using errcode = '22023';
  end if;

  update public.bookings
  set scheduled_date = p_scheduled_date,
      scheduled_time = p_scheduled_time,
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  insert into public.booking_status_history(booking_id, status, actor_id, metadata)
  values (
    p_booking_id,
    current_status,
    uid,
    pg_catalog.jsonb_build_object(
      'note', 'rescheduled',
      'scheduled_date', p_scheduled_date,
      'scheduled_time', p_scheduled_time
    )
  ) returning id into history_id;

  if provider_uid is not null and provider_uid is distinct from uid then
    insert into public.notifications(user_id, type, title, body, data)
    values (
      provider_uid,
      'booking_rescheduled',
      'Booking update',
      'Your booking has a new update.',
      pg_catalog.jsonb_build_object(
        'booking_id', p_booking_id,
        'status', current_status,
        'history_id', history_id
      )
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
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
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
  then
    raise exception 'Reschedule response is not available' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_provider::text || ':' || proposed_date::text || ':' || proposed_time::text,
    0
  ));
  if not exists (
    select 1 from public.provider_availability a
    where a.provider_id = target_provider
      and (a.available_date = proposed_date or (
        a.available_date is null
        and a.weekday = extract(dow from proposed_date)::smallint
      ))
      and proposed_time >= a.start_time and proposed_time < a.end_time
      and not (a.break_start is not null and a.break_end is not null
        and proposed_time >= a.break_start and proposed_time < a.break_end)
  ) or exists (
    select 1 from public.bookings b
    where b.id <> p_booking_id
      and b.provider_id = target_provider
      and b.scheduled_date = proposed_date
      and b.scheduled_time = proposed_time
      and b.deleted_at is null
      and b.status not in ('rejected', 'cancelled', 'refunded', 'no_show')
  ) then
    raise exception 'Booking time unavailable' using errcode = '22023';
  end if;

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
    p_booking_id,
    'confirmed',
    uid,
    pg_catalog.jsonb_build_object(
      'note', 'reschedule_accepted',
      'scheduled_date', proposed_date,
      'scheduled_time', proposed_time
    )
  );
end;
$$;

revoke execute on function public.create_customer_booking(uuid,uuid,text,text,uuid,date,time,text,text) from public, anon;
revoke execute on function public.reschedule_customer_booking(uuid,date,time) from public, anon;
revoke execute on function public.accept_provider_reschedule(uuid) from public, anon;
grant execute on function public.create_customer_booking(uuid,uuid,text,text,uuid,date,time,text,text) to authenticated;
grant execute on function public.reschedule_customer_booking(uuid,date,time) to authenticated;
grant execute on function public.accept_provider_reschedule(uuid) to authenticated;

-- The old duplicate cancellation RPC is no longer called by the app.
revoke execute on function public.cancel_own_booking(uuid) from public, anon, authenticated;

-- End users may submit onboarding, but only staff or trusted service-side SQL
-- may change approval/publication/verification/statistics.
create or replace function private.prevent_provider_approval_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
    and not private.is_staff()
    and (
      (old.onboarding_status is distinct from new.onboarding_status
        and not (old.onboarding_status in ('draft', 'more_information_required', 'rejected') and new.onboarding_status = 'submitted'))
      or old.is_verified is distinct from new.is_verified
      or old.is_published is distinct from new.is_published
      or old.rating_average is distinct from new.rating_average
      or old.review_count is distinct from new.review_count
      or old.completed_jobs is distinct from new.completed_jobs
    )
  then
    raise exception 'Protected provider fields cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_provider_approval_changes() from public, anon, authenticated;

-- Provider foundation writes are aggregate-RPC only; this removes concurrent
-- child-table bypasses of validation and overlap checks.
drop policy if exists providers_own_update on public.provider_profiles;
drop policy if exists provider_services_own_write on public.provider_services;
drop policy if exists provider_availability_own_write on public.provider_availability;
drop policy if exists provider_areas_own_write on public.provider_service_areas;

-- Correct policies that predated provider-id/auth-user-id decoupling.
drop policy if exists portfolio_own_write on public.provider_portfolio;
create policy portfolio_own_write
on public.provider_portfolio for all to authenticated
using (exists (
  select 1 from public.provider_profiles p
  where p.id = provider_id and p.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.provider_profiles p
  where p.id = provider_id and p.user_id = (select auth.uid())
));

drop policy if exists certifications_own_read on public.provider_certifications;
create policy certifications_own_read
on public.provider_certifications for select to authenticated
using (exists (
  select 1 from public.provider_profiles p
  where p.id = provider_id and p.user_id = (select auth.uid())
));

drop policy if exists verification_owner_read on public.provider_verification_documents;
create policy verification_owner_read
on public.provider_verification_documents for select to authenticated
using (private.is_staff() or exists (
  select 1 from public.provider_profiles p
  where p.id = provider_id and p.user_id = (select auth.uid())
));

drop policy if exists verification_owner_insert on public.provider_verification_documents;
create policy verification_owner_insert
on public.provider_verification_documents for insert to authenticated
with check (
  status = 'pending' and reviewed_by is null and reviewed_at is null
  and exists (
    select 1 from public.provider_profiles p
    where p.id = provider_id and p.user_id = (select auth.uid())
  )
);

-- The dispute feature is not live; prevent arbitrary booking-linked inserts
-- until its participant-checked RPC is implemented.
drop policy if exists disputes_owner_insert on public.disputes;

-- Public URLs do not need broad storage.objects metadata listing.
drop policy if exists public_media_read on storage.objects;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
where id = 'profile-images';

drop policy if exists profile_images_owner_insert on storage.objects;
create policy profile_images_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.lower(storage.extension(name)) in ('jpg','jpeg','png','webp','heic','heif')
);

drop policy if exists profile_images_owner_update on storage.objects;
create policy profile_images_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.lower(storage.extension(name)) in ('jpg','jpeg','png','webp','heic','heif')
);

-- Rollback is allowed only while the corresponding participant can still
-- amend pending evidence. Terminal evidence cannot be removed from storage.
drop policy if exists booking_attachments_insert_customer on public.booking_attachments;
create policy booking_attachments_insert_customer
on public.booking_attachments for insert to authenticated
with check (
  attachment_kind = 'customer_issue'
  and uploader_id = (select auth.uid())
  and storage_path like (select auth.uid())::text || '/' || booking_id::text || '/%'
  and storage_path not like (select auth.uid())::text || '/' || booking_id::text || '/completion/%'
  and mime_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')
  and exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and b.customer_id = (select auth.uid())
      and b.status = 'pending_provider_approval'
      and b.deleted_at is null
  )
);

drop policy if exists booking_attachment_participant_upload on storage.objects;
create policy booking_attachment_participant_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'booking-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] is not null
  and pg_catalog.lower(storage.extension(name)) in ('jpg','jpeg','png','webp','heic','heif')
  and exists (
    select 1
    from public.bookings b
    left join public.provider_profiles p on p.id = b.provider_id
    where b.id::text = (storage.foldername(name))[2]
      and b.deleted_at is null
      and (
        (b.customer_id = (select auth.uid())
          and b.status = 'pending_provider_approval'
          and (storage.foldername(name))[3] is distinct from 'completion')
        or
        (p.user_id = (select auth.uid())
          and p.onboarding_status = 'approved'
          and p.is_published
          and p.deleted_at is null
          and b.status in ('job_started', 'work_in_progress')
          and (storage.foldername(name))[3] = 'completion')
      )
  )
);

drop policy if exists booking_attachments_delete_customer_pending on public.booking_attachments;
create policy booking_attachments_delete_customer_pending
on public.booking_attachments for delete to authenticated
using (
  attachment_kind = 'customer_issue'
  and uploader_id = (select auth.uid())
  and exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and b.customer_id = (select auth.uid())
      and b.status = 'pending_provider_approval'
      and b.deleted_at is null
  )
);

drop policy if exists booking_attachment_owner_delete on storage.objects;
create policy booking_attachment_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'booking-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.bookings b
    left join public.provider_profiles p on p.id = b.provider_id
    where b.id::text = (storage.foldername(name))[2]
      and b.deleted_at is null
      and (
        (b.customer_id = (select auth.uid())
          and b.status = 'pending_provider_approval'
          and (storage.foldername(name))[3] is distinct from 'completion')
        or
        (p.user_id = (select auth.uid())
          and p.onboarding_status = 'approved'
          and p.is_published
          and p.deleted_at is null
          and b.status in ('job_started', 'work_in_progress')
          and (storage.foldername(name))[3] = 'completion')
      )
  )
);

create index if not exists booking_attachments_booking_idx
  on public.booking_attachments(booking_id, created_at);
