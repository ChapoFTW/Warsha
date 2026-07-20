alter table public.addresses add column if not exists street text;
alter table public.addresses add column if not exists building text;
alter table public.addresses add column if not exists floor text;
alter table public.addresses add column if not exists apartment text;
alter table public.addresses add column if not exists landmark text;
alter table public.addresses add column if not exists instructions text;
create unique index if not exists one_default_address_per_customer on public.addresses(customer_id) where is_default and deleted_at is null;

alter table public.bookings add column if not exists notes text not null default '';
alter table public.bookings add column if not exists booking_type text not null default 'scheduled' check(booking_type in ('scheduled','emergency'));
alter table public.bookings add column if not exists price_breakdown jsonb not null default '{}'::jsonb;
alter table public.bookings add column if not exists cancellation_reason text;

create or replace function public.ensure_customer_profile() returns void language plpgsql security definer set search_path='' as $$
declare u auth.users%rowtype;
begin
  select * into u from auth.users where id=(select auth.uid());
  if u.id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into public.profiles(id,display_name,phone,preferred_language)
  values(u.id,coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),split_part(coalesce(u.email,u.phone,'Warsha user'),'@',1)),u.phone,case when u.raw_user_meta_data->>'preferred_language'='ar' then 'ar' else 'en' end) on conflict(id) do nothing;
  insert into public.customer_profiles(id) values(u.id) on conflict do nothing;
  insert into public.user_roles(user_id,role) values(u.id,'customer') on conflict do nothing;
  insert into public.notification_preferences(user_id) values(u.id) on conflict do nothing;
end $$;
revoke all on function public.ensure_customer_profile() from public;
grant execute on function public.ensure_customer_profile() to authenticated;

create or replace function public.set_default_address(address_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.addresses where id=address_id and customer_id=(select auth.uid()) and deleted_at is null) then raise exception 'Address not found' using errcode='42501'; end if;
  update public.addresses set is_default=false where customer_id=(select auth.uid()) and deleted_at is null and is_default;
  update public.addresses set is_default=true where id=address_id;
end $$;
revoke all on function public.set_default_address(uuid) from public;
grant execute on function public.set_default_address(uuid) to authenticated;

create or replace function private.enforce_booking_transition() returns trigger language plpgsql set search_path='' as $$
begin
  if old.status is distinct from new.status and not case old.status
    when 'pending_provider_approval' then new.status in ('accepted','rejected','cancelled')
    when 'accepted' then new.status in ('confirmed','cancelled')
    when 'confirmed' then new.status in ('provider_on_the_way','cancelled')
    when 'provider_on_the_way' then new.status in ('provider_arrived','cancelled')
    when 'provider_arrived' then new.status in ('job_started','cancelled')
    when 'job_started' then new.status in ('work_in_progress','completed','disputed')
    when 'work_in_progress' then new.status in ('completed','disputed')
    when 'completed' then new.status='disputed'
    when 'disputed' then new.status='refunded'
    else false end then raise exception 'Invalid booking transition' using errcode='22023'; end if;
  return new;
end $$;
drop trigger if exists enforce_booking_transition on public.bookings;
create trigger enforce_booking_transition before update of status on public.bookings for each row execute function private.enforce_booking_transition();

create or replace function public.create_customer_booking(p_provider_id uuid,p_service_id uuid,p_issue_description text,p_notes text,p_address_id uuid,p_scheduled_date date,p_scheduled_time time,p_booking_type text,p_idempotency_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); service_row record; address_row record; booking_id uuid; service_price numeric; transport numeric:=75; emergency numeric:=case when p_booking_type='emergency' then 250 else 0 end;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.ensure_customer_profile();
  if length(trim(p_issue_description))<8 then raise exception 'Invalid issue description' using errcode='22023'; end if;
  if p_booking_type not in ('scheduled','emergency') then raise exception 'Invalid booking type' using errcode='22023'; end if;
  select s.*,coalesce(ps.custom_price_egp,s.price_egp) price into service_row from public.provider_services ps join public.services s on s.id=ps.service_id where ps.provider_id=p_provider_id and ps.service_id=p_service_id and ps.is_active and s.is_active and s.deleted_at is null and exists(select 1 from public.provider_profiles p where p.id=p_provider_id and p.is_published and p.deleted_at is null);
  if service_row.id is null then raise exception 'Service unavailable' using errcode='22023'; end if;
  select * into address_row from public.addresses where id=p_address_id and customer_id=uid and deleted_at is null;
  if address_row.id is null then raise exception 'Address not found' using errcode='42501'; end if;
  service_price:=service_row.price;
  insert into public.bookings(customer_id,provider_id,service_id,status,service_name_snapshot,pricing_type,estimated_price_egp,issue_description,notes,scheduled_date,scheduled_time,address_id,address_snapshot,booking_type,price_breakdown,idempotency_key)
  values(uid,p_provider_id,p_service_id,'pending_provider_approval',service_row.name,service_row.pricing_type,service_price+transport+emergency,p_issue_description,coalesce(p_notes,''),p_scheduled_date,p_scheduled_time,p_address_id,concat_ws(', ',address_row.building,address_row.street,address_row.district,address_row.governorate),p_booking_type,jsonb_build_object('servicePrice',service_price,'inspectionFee',case when service_row.pricing_type='inspection' then service_price else 0 end,'transportationFee',transport,'emergencySurcharge',emergency,'discount',0,'estimatedTotal',service_price+transport+emergency,'pricingType',service_row.pricing_type),p_idempotency_key)
  on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key where public.bookings.customer_id=uid returning id into booking_id;
  return booking_id;
end $$;
revoke all on function public.create_customer_booking(uuid,uuid,text,text,uuid,date,time,text,text) from public;
grant execute on function public.create_customer_booking(uuid,uuid,text,text,uuid,date,time,text,text) to authenticated;

create or replace function public.cancel_customer_booking(p_booking_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
  update public.bookings set status='cancelled',cancellation_reason=left(coalesce(p_reason,'other'),120),cancelled_at=now(),updated_at=now() where id=p_booking_id and customer_id=(select auth.uid()) and status in ('pending_provider_approval','accepted','confirmed','provider_on_the_way','provider_arrived');
  if not found then raise exception 'Booking cannot be cancelled' using errcode='22023'; end if;
end $$;
revoke all on function public.cancel_customer_booking(uuid,text) from public; grant execute on function public.cancel_customer_booking(uuid,text) to authenticated;

create or replace function public.reschedule_customer_booking(p_booking_id uuid,p_scheduled_date date,p_scheduled_time time) returns void language plpgsql security definer set search_path='' as $$
declare current_status text;
begin
  update public.bookings set scheduled_date=p_scheduled_date,scheduled_time=p_scheduled_time,updated_at=now() where id=p_booking_id and customer_id=(select auth.uid()) and status in ('pending_provider_approval','accepted','confirmed') and p_scheduled_date>=current_date returning status into current_status;
  if current_status is null then raise exception 'Booking cannot be rescheduled' using errcode='22023'; end if;
  insert into public.booking_status_history(booking_id,status,actor_id,metadata) values(p_booking_id,current_status,(select auth.uid()),jsonb_build_object('note','rescheduled','scheduled_date',p_scheduled_date,'scheduled_time',p_scheduled_time));
end $$;
revoke all on function public.reschedule_customer_booking(uuid,date,time) from public; grant execute on function public.reschedule_customer_booking(uuid,date,time) to authenticated;

drop policy if exists booking_attachments_insert_participant on public.booking_attachments;
create policy booking_attachments_insert_customer on public.booking_attachments for insert to authenticated with check(uploader_id=(select auth.uid()) and exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=(select auth.uid())));
