-- Harden the generic updated_at trigger without changing its behavior.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- Public object URLs do not require storage.objects SELECT access. The provider
-- image replacement flow does list its own folder, so retain owner-only metadata reads.
drop policy if exists profile_images_public_read on storage.objects;
drop policy if exists profile_images_owner_read on storage.objects;
create policy profile_images_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.ensure_customer_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  auth_user auth.users%rowtype;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into auth_user from auth.users where id = uid;
  if auth_user.id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  insert into public.profiles(id,display_name,phone,preferred_language)
  values(uid,pg_catalog.coalesce(pg_catalog.nullif(pg_catalog.btrim(auth_user.raw_user_meta_data->>'display_name'),''),pg_catalog.split_part(pg_catalog.coalesce(auth_user.email,auth_user.phone,'Warsha user'),'@',1)),auth_user.phone,case when auth_user.raw_user_meta_data->>'preferred_language'='ar' then 'ar' else 'en' end)
  on conflict(id) do nothing;
  insert into public.customer_profiles(id) values(uid) on conflict(id) do nothing;
  insert into public.user_roles(user_id,role) values(uid,'customer') on conflict(user_id,role) do nothing;
  insert into public.notification_preferences(user_id) values(uid) on conflict(user_id) do nothing;
end;
$$;

create or replace function public.set_default_address(address_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.addresses where id=address_id and customer_id=uid and deleted_at is null) then raise exception 'Address not found' using errcode='42501'; end if;
  update public.addresses set is_default=false where customer_id=uid and deleted_at is null and is_default;
  update public.addresses set is_default=true where id=address_id and customer_id=uid and deleted_at is null;
end;
$$;

create or replace function public.create_customer_booking(p_provider_id uuid,p_service_id uuid,p_issue_description text,p_notes text,p_address_id uuid,p_scheduled_date date,p_scheduled_time time,p_booking_type text,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid:=(select auth.uid()); service_row record; address_row record; booking_id uuid; service_price numeric; transport numeric:=75; emergency numeric:=case when p_booking_type='emergency' then 250 else 0 end;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.ensure_customer_profile();
  if pg_catalog.length(pg_catalog.btrim(p_issue_description))<8 then raise exception 'Invalid issue description' using errcode='22023'; end if;
  if p_booking_type not in ('scheduled','emergency') then raise exception 'Invalid booking type' using errcode='22023'; end if;
  select s.*,pg_catalog.coalesce(ps.custom_price_egp,s.price_egp) price into service_row from public.provider_services ps join public.services s on s.id=ps.service_id where ps.provider_id=p_provider_id and ps.service_id=p_service_id and ps.is_active and s.is_active and s.deleted_at is null and exists(select 1 from public.provider_profiles p where p.id=p_provider_id and p.is_published and p.deleted_at is null);
  if service_row.id is null then raise exception 'Service unavailable' using errcode='22023'; end if;
  select * into address_row from public.addresses where id=p_address_id and customer_id=uid and deleted_at is null;
  if address_row.id is null then raise exception 'Address not found' using errcode='42501'; end if;
  service_price:=service_row.price;
  insert into public.bookings(customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,notes,scheduled_date,scheduled_time,address_id,address_snapshot,booking_type,price_breakdown,idempotency_key)
  values(uid,p_provider_id,p_service_id,'pending_provider_approval',service_row.name,service_row.pricing_type,service_price+transport+emergency,p_issue_description,pg_catalog.coalesce(p_notes,''),p_scheduled_date,p_scheduled_time,p_address_id,pg_catalog.concat_ws(', ',address_row.building,address_row.street,address_row.district,address_row.governorate),p_booking_type,pg_catalog.jsonb_build_object('servicePrice',service_price,'inspectionFee',case when service_row.pricing_type='inspection' then service_price else 0 end,'transportationFee',transport,'emergencySurcharge',emergency,'discount',0,'estimatedTotal',service_price+transport+emergency,'pricingType',service_row.pricing_type),p_idempotency_key)
  on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key where public.bookings.customer_id=uid returning id into booking_id;
  return booking_id;
end;
$$;

create or replace function public.cancel_customer_booking(p_booking_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.bookings set status='cancelled',cancellation_reason=pg_catalog.left(pg_catalog.coalesce(p_reason,'other'),120),cancelled_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_booking_id and customer_id=uid and status in ('pending_provider_approval','accepted','confirmed','provider_on_the_way','provider_arrived');
  if not found then raise exception 'Booking cannot be cancelled' using errcode='22023'; end if;
end;
$$;

create or replace function public.cancel_own_booking(booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.bookings set status='cancelled',cancellation_reason='other',cancelled_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=booking_id and customer_id=uid and status in ('pending_provider_approval','accepted','confirmed');
  if not found then raise exception 'Booking cannot be cancelled' using errcode='22023'; end if;
end;
$$;

create or replace function public.reschedule_customer_booking(p_booking_id uuid,p_scheduled_date date,p_scheduled_time time)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); current_status text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.bookings set scheduled_date=p_scheduled_date,scheduled_time=p_scheduled_time,updated_at=pg_catalog.now() where id=p_booking_id and customer_id=uid and status in ('pending_provider_approval','accepted','confirmed') and p_scheduled_date>=current_date returning status into current_status;
  if current_status is null then raise exception 'Booking cannot be rescheduled' using errcode='22023'; end if;
  insert into public.booking_status_history(booking_id,status,actor_id,metadata) values(p_booking_id,current_status,uid,pg_catalog.jsonb_build_object('note','rescheduled','scheduled_date',p_scheduled_date,'scheduled_time',p_scheduled_time));
end;
$$;

-- PostgreSQL grants function EXECUTE to PUBLIC by default. Remove inherited and
-- explicit anonymous execution, then restore only the signed-in app contract.
revoke execute on function public.ensure_customer_profile() from public, anon;
revoke execute on function public.set_default_address(uuid) from public, anon;
revoke execute on function public.create_customer_booking(uuid,uuid,text,text,uuid,date,time,text,text) from public, anon;
revoke execute on function public.cancel_customer_booking(uuid,text) from public, anon;
revoke execute on function public.cancel_own_booking(uuid) from public, anon;
revoke execute on function public.reschedule_customer_booking(uuid,date,time) from public, anon;

grant execute on function public.ensure_customer_profile() to authenticated;
grant execute on function public.set_default_address(uuid) to authenticated;
grant execute on function public.create_customer_booking(uuid,uuid,text,text,uuid,date,time,text,text) to authenticated;
grant execute on function public.cancel_customer_booking(uuid,text) to authenticated;
grant execute on function public.cancel_own_booking(uuid) to authenticated;
grant execute on function public.reschedule_customer_booking(uuid,date,time) to authenticated;
