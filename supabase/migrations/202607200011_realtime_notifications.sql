create or replace function private.record_booking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  provider_uid uuid;
  recipient uuid;
  event_type text;
  history_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    select p.user_id into provider_uid from public.provider_profiles p where p.id = new.provider_id;
    if uid is distinct from new.customer_id and uid is distinct from provider_uid then
      raise exception 'Booking action is not available' using errcode = '42501';
    end if;
    insert into public.booking_status_history(booking_id,status,actor_id)
    values(new.id,new.status,uid)
    returning id into history_id;
    if tg_op = 'INSERT' then
      recipient := provider_uid;
      event_type := 'new_booking_request';
    elsif uid = new.customer_id then
      recipient := provider_uid;
      if old.status = 'rescheduling_requested' and new.status <> 'cancelled' then
        if new.scheduled_date is not distinct from old.proposed_scheduled_date
          and new.scheduled_time is not distinct from old.proposed_scheduled_time
        then event_type := 'booking_reschedule_accepted';
        else event_type := 'booking_reschedule_rejected';
        end if;
      else event_type := 'booking_' || new.status;
      end if;
    else
      recipient := new.customer_id;
      event_type := 'booking_' || new.status;
    end if;
    if recipient is not null and recipient is distinct from uid then
      insert into public.notifications(user_id,type,title,body,data)
      values(recipient,event_type,'Booking update','Your booking has a new update.',pg_catalog.jsonb_build_object('booking_id',new.id,'status',new.status,'history_id',history_id))
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.record_booking_status() from public, anon, authenticated;

alter table public.notifications add column if not exists dismissed_at timestamptz;
create index if not exists notifications_user_visible_created_idx
  on public.notifications(user_id, created_at desc)
  where dismissed_at is null;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.notifications
  set read_at = coalesce(read_at, pg_catalog.now())
  where id = p_notification_id and user_id = uid and dismissed_at is null;
  if not found then raise exception 'Notification is not available' using errcode = '22023'; end if;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.notifications set read_at = pg_catalog.now()
  where user_id = uid and read_at is null and dismissed_at is null;
end;
$$;

create or replace function public.dismiss_notification(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.notifications
  set dismissed_at = coalesce(dismissed_at, pg_catalog.now())
  where id = p_notification_id and user_id = uid and dismissed_at is null;
  if not found then raise exception 'Notification is not available' using errcode = '22023'; end if;
end;
$$;

revoke execute on function public.mark_notification_read(uuid) from public, anon;
revoke execute on function public.mark_all_notifications_read() from public, anon;
revoke execute on function public.dismiss_notification(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.dismiss_notification(uuid) to authenticated;

-- RLS remains authoritative for Realtime delivery. Clients retain SELECT-only
-- table access and perform mutations through the ownership-checked RPCs above.
do $$
declare table_name text;
begin
  foreach table_name in array array['notifications','bookings','booking_status_history','booking_attachments'] loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables p
      where p.pubname = 'supabase_realtime'
        and p.schemaname = 'public'
        and p.tablename = table_name
    ) then
      execute pg_catalog.format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
