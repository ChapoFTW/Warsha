alter table public.bookings
  add column if not exists customer_name_snapshot text,
  add column if not exists rejection_reason text,
  add column if not exists proposed_scheduled_date date,
  add column if not exists proposed_scheduled_time time,
  add column if not exists provider_reschedule_note text,
  add column if not exists proposal_from_status text,
  add column if not exists completion_notes text;

update public.bookings b
set customer_name_snapshot = p.display_name
from public.profiles p
where p.id = b.customer_id and b.customer_name_snapshot is null;
alter table public.bookings alter column customer_name_snapshot set default 'Warsha customer';

alter table public.booking_attachments add column if not exists attachment_kind text not null default 'customer_issue';
alter table public.booking_attachments drop constraint if exists booking_attachments_kind_check;
alter table public.booking_attachments add constraint booking_attachments_kind_check check(attachment_kind in ('customer_issue','completion_evidence'));
create unique index if not exists booking_attachment_storage_path_unique on public.booking_attachments(storage_path);
create index if not exists bookings_provider_status_created_idx on public.bookings(provider_id,status,created_at desc) where deleted_at is null;

create or replace function private.snapshot_booking_customer()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.customer_name_snapshot is null then
    select p.display_name into new.customer_name_snapshot from public.profiles p where p.id = new.customer_id;
  end if;
  new.customer_name_snapshot := coalesce(nullif(pg_catalog.btrim(new.customer_name_snapshot),''),'Warsha customer');
  return new;
end;
$$;
drop trigger if exists snapshot_booking_customer on public.bookings;
create trigger snapshot_booking_customer before insert on public.bookings for each row execute function private.snapshot_booking_customer();

create or replace function private.enforce_booking_transition()
returns trigger language plpgsql set search_path = '' as $$
declare transition_is_valid boolean := false;
begin
  if old.status is not distinct from new.status then return new; end if;
  if old.status = 'pending_provider_approval' then transition_is_valid := new.status in ('accepted','rejected','rescheduling_requested','cancelled');
  elsif old.status = 'accepted' then transition_is_valid := new.status in ('confirmed','rescheduling_requested','cancelled');
  elsif old.status = 'rescheduling_requested' then transition_is_valid := new.status in ('pending_provider_approval','accepted','confirmed','cancelled');
  elsif old.status = 'confirmed' then transition_is_valid := new.status in ('provider_on_the_way','rescheduling_requested','cancelled');
  elsif old.status = 'provider_on_the_way' then transition_is_valid := new.status in ('provider_arrived','cancelled');
  elsif old.status = 'provider_arrived' then transition_is_valid := new.status in ('job_started','no_show','cancelled');
  elsif old.status = 'job_started' then transition_is_valid := new.status in ('work_in_progress','completed','disputed');
  elsif old.status = 'work_in_progress' then transition_is_valid := new.status in ('completed','disputed');
  elsif old.status = 'completed' then transition_is_valid := new.status = 'disputed';
  elsif old.status = 'disputed' then transition_is_valid := new.status = 'refunded';
  end if;
  if not transition_is_valid then raise exception 'Booking action is not available' using errcode='22023'; end if;
  return new;
end;
$$;

create or replace function private.record_booking_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; event_type text;
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.booking_status_history(booking_id,status,actor_id) values(new.id,new.status,(select auth.uid()));
    if tg_op = 'INSERT' then
      select p.user_id into recipient from public.provider_profiles p where p.id=new.provider_id;
      event_type := 'new_booking_request';
    else
      recipient := new.customer_id;
      event_type := 'booking_' || new.status;
    end if;
    if recipient is not null and not exists(select 1 from public.notifications n where n.user_id=recipient and n.type=event_type and n.data->>'booking_id'=new.id::text) then
      insert into public.notifications(user_id,type,title,body,data) values(recipient,event_type,'Booking update','Your booking has a new update.',pg_catalog.jsonb_build_object('booking_id',new.id,'status',new.status));
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.annotate_booking_history(p_booking_id uuid,p_status text,p_actor uuid,p_metadata jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.booking_status_history h set metadata=p_metadata
  where h.id=(select x.id from public.booking_status_history x where x.booking_id=p_booking_id and x.status=p_status and x.actor_id=p_actor order by x.created_at desc,x.id desc limit 1)
$$;
revoke all on function private.annotate_booking_history(uuid,text,uuid,jsonb) from public, anon, authenticated;

create or replace function public.accept_provider_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=(select auth.uid()); pid uuid; changed uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select p.id into pid from public.provider_profiles p where p.user_id=uid and p.onboarding_status='approved' and p.is_published and p.deleted_at is null;
  if pid is null then raise exception 'Provider account is not eligible' using errcode='42501'; end if;
  update public.bookings set status='accepted',updated_at=pg_catalog.now() where id=p_booking_id and provider_id=pid and status='pending_provider_approval' and deleted_at is null returning id into changed;
  if changed is null then raise exception 'Booking action is not available' using errcode='22023'; end if;
end;
$$;

create or replace function public.reject_provider_booking(p_booking_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=(select auth.uid()); pid uuid; changed uuid; reason text:=pg_catalog.btrim(coalesce(p_reason,''));
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(reason) not between 3 and 300 then raise exception 'A valid rejection reason is required' using errcode='22023'; end if;
  select p.id into pid from public.provider_profiles p where p.user_id=uid and p.onboarding_status='approved' and p.is_published and p.deleted_at is null;
  if pid is null then raise exception 'Provider account is not eligible' using errcode='42501'; end if;
  update public.bookings set status='rejected',rejection_reason=reason,updated_at=pg_catalog.now() where id=p_booking_id and provider_id=pid and status='pending_provider_approval' and deleted_at is null returning id into changed;
  if changed is null then raise exception 'Booking action is not available' using errcode='22023'; end if;
  perform private.annotate_booking_history(changed,'rejected',uid,pg_catalog.jsonb_build_object('note',reason));
end;
$$;

create or replace function public.propose_provider_reschedule(p_booking_id uuid,p_date date,p_time time,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=(select auth.uid()); pid uuid; previous_status text; note text:=pg_catalog.btrim(coalesce(p_note,''));
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_date < current_date or pg_catalog.length(note) not between 3 and 500 then raise exception 'A valid schedule and reason are required' using errcode='22023'; end if;
  select p.id into pid from public.provider_profiles p where p.user_id=uid and p.onboarding_status='approved' and p.is_published and p.deleted_at is null;
  if pid is null then raise exception 'Provider account is not eligible' using errcode='42501'; end if;
  select b.status into previous_status from public.bookings b where b.id=p_booking_id and b.provider_id=pid and b.status in ('pending_provider_approval','accepted','confirmed') and b.deleted_at is null for update;
  if previous_status is null then raise exception 'Booking action is not available' using errcode='22023'; end if;
  update public.bookings set status='rescheduling_requested',proposed_scheduled_date=p_date,proposed_scheduled_time=p_time,provider_reschedule_note=note,proposal_from_status=previous_status,updated_at=pg_catalog.now() where id=p_booking_id;
  perform private.annotate_booking_history(p_booking_id,'rescheduling_requested',uid,pg_catalog.jsonb_build_object('note',note,'proposed_date',p_date,'proposed_time',p_time,'original_date',(select scheduled_date from public.bookings where id=p_booking_id),'original_time',(select scheduled_time from public.bookings where id=p_booking_id)));
end;
$$;

create or replace function public.advance_provider_booking_status(p_booking_id uuid,p_status text,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=(select auth.uid()); pid uuid; current_status text; note text:=pg_catalog.left(pg_catalog.btrim(coalesce(p_note,'')),1000);
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_status not in ('confirmed','provider_on_the_way','provider_arrived','job_started','work_in_progress','completed','disputed') then raise exception 'Booking action is not available' using errcode='22023'; end if;
  if p_status='disputed' and pg_catalog.length(note)<3 then raise exception 'A problem description is required' using errcode='22023'; end if;
  select p.id into pid from public.provider_profiles p where p.user_id=uid and p.onboarding_status='approved' and p.is_published and p.deleted_at is null;
  if pid is null then raise exception 'Provider account is not eligible' using errcode='42501'; end if;
  select b.status into current_status from public.bookings b where b.id=p_booking_id and b.provider_id=pid and b.deleted_at is null for update;
  if current_status is null then raise exception 'Booking action is not available' using errcode='22023'; end if;
  if not ((current_status='accepted' and p_status='confirmed') or (current_status='confirmed' and p_status='provider_on_the_way') or (current_status='provider_on_the_way' and p_status='provider_arrived') or (current_status='provider_arrived' and p_status='job_started') or (current_status='job_started' and p_status in ('work_in_progress','completed','disputed')) or (current_status='work_in_progress' and p_status in ('completed','disputed'))) then raise exception 'Booking action is not available' using errcode='22023'; end if;
  update public.bookings set status=p_status,completion_notes=case when p_status='completed' then nullif(note,'') else completion_notes end,updated_at=pg_catalog.now() where id=p_booking_id and status=current_status;
  perform private.annotate_booking_history(p_booking_id,p_status,uid,case when note='' then '{}'::jsonb else pg_catalog.jsonb_build_object('note',note) end);
end;
$$;

create or replace function public.report_provider_no_show(p_booking_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=(select auth.uid()); pid uuid; changed uuid; reason text:=pg_catalog.btrim(coalesce(p_reason,''));
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if pg_catalog.length(reason) not between 3 and 500 then raise exception 'A valid reason is required' using errcode='22023'; end if;
  select p.id into pid from public.provider_profiles p where p.user_id=uid and p.onboarding_status='approved' and p.is_published and p.deleted_at is null;
  if pid is null then raise exception 'Provider account is not eligible' using errcode='42501'; end if;
  update public.bookings set status='no_show',updated_at=pg_catalog.now() where id=p_booking_id and provider_id=pid and status='provider_arrived' and deleted_at is null returning id into changed;
  if changed is null then raise exception 'Booking action is not available' using errcode='22023'; end if;
  perform private.annotate_booking_history(changed,'no_show',uid,pg_catalog.jsonb_build_object('note',reason));
end;
$$;

create or replace function public.accept_provider_reschedule(p_booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=(select auth.uid()); changed uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.bookings set status='confirmed',scheduled_date=proposed_scheduled_date,scheduled_time=proposed_scheduled_time,updated_at=pg_catalog.now() where id=p_booking_id and customer_id=uid and status='rescheduling_requested' and proposed_scheduled_date is not null and proposed_scheduled_time is not null returning id into changed;
  if changed is null then raise exception 'Reschedule response is not available' using errcode='22023'; end if;
  perform private.annotate_booking_history(changed,'confirmed',uid,pg_catalog.jsonb_build_object('note','reschedule_accepted'));
end;
$$;

create or replace function public.reject_provider_reschedule(p_booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=(select auth.uid()); return_status text; changed uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select proposal_from_status into return_status from public.bookings where id=p_booking_id and customer_id=uid and status='rescheduling_requested' for update;
  if return_status not in ('pending_provider_approval','accepted','confirmed') then raise exception 'Reschedule response is not available' using errcode='22023'; end if;
  update public.bookings set status=return_status,updated_at=pg_catalog.now() where id=p_booking_id and customer_id=uid and status='rescheduling_requested' returning id into changed;
  if changed is null then raise exception 'Reschedule response is not available' using errcode='22023'; end if;
  perform private.annotate_booking_history(changed,return_status,uid,pg_catalog.jsonb_build_object('note','reschedule_rejected'));
end;
$$;

create or replace function public.cancel_customer_booking(p_booking_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid:=(select auth.uid()); changed uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.bookings set status='cancelled',cancellation_reason=pg_catalog.left(coalesce(p_reason,'other'),120),cancelled_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_booking_id and customer_id=uid and status in ('pending_provider_approval','accepted','rescheduling_requested','confirmed','provider_on_the_way','provider_arrived') returning id into changed;
  if changed is null then raise exception 'Booking cannot be cancelled' using errcode='22023'; end if;
end;
$$;

revoke execute on function public.accept_provider_booking(uuid) from public, anon;
revoke execute on function public.reject_provider_booking(uuid,text) from public, anon;
revoke execute on function public.propose_provider_reschedule(uuid,date,time,text) from public, anon;
revoke execute on function public.advance_provider_booking_status(uuid,text,text) from public, anon;
revoke execute on function public.report_provider_no_show(uuid,text) from public, anon;
revoke execute on function public.accept_provider_reschedule(uuid) from public, anon;
revoke execute on function public.reject_provider_reschedule(uuid) from public, anon;
revoke execute on function public.cancel_customer_booking(uuid,text) from public, anon;
grant execute on function public.accept_provider_booking(uuid) to authenticated;
grant execute on function public.reject_provider_booking(uuid,text) to authenticated;
grant execute on function public.propose_provider_reschedule(uuid,date,time,text) to authenticated;
grant execute on function public.advance_provider_booking_status(uuid,text,text) to authenticated;
grant execute on function public.report_provider_no_show(uuid,text) to authenticated;
grant execute on function public.accept_provider_reschedule(uuid) to authenticated;
grant execute on function public.reject_provider_reschedule(uuid) to authenticated;
grant execute on function public.cancel_customer_booking(uuid,text) to authenticated;

drop policy if exists booking_attachments_insert_customer on public.booking_attachments;
create policy booking_attachments_insert_customer on public.booking_attachments for insert to authenticated with check(attachment_kind='customer_issue' and uploader_id=(select auth.uid()) and exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=(select auth.uid())));
create policy booking_attachments_insert_provider on public.booking_attachments for insert to authenticated with check(attachment_kind='completion_evidence' and uploader_id=(select auth.uid()) and exists(select 1 from public.bookings b join public.provider_profiles p on p.id=b.provider_id where b.id=booking_id and p.user_id=(select auth.uid()) and p.onboarding_status='approved' and p.is_published and b.status in ('job_started','work_in_progress')));
create policy booking_attachments_delete_provider_pending on public.booking_attachments for delete to authenticated using(attachment_kind='completion_evidence' and uploader_id=(select auth.uid()) and exists(select 1 from public.bookings b join public.provider_profiles p on p.id=b.provider_id where b.id=booking_id and p.user_id=(select auth.uid()) and p.onboarding_status='approved' and p.is_published and b.status in ('job_started','work_in_progress')));

drop policy if exists private_user_uploads on storage.objects;
create policy private_user_uploads on storage.objects for insert to authenticated with check(bucket_id in ('verification-documents','dispute-evidence') and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy booking_attachment_participant_upload on storage.objects for insert to authenticated with check(bucket_id='booking-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text and (storage.foldername(name))[2] is not null and exists(select 1 from public.bookings b left join public.provider_profiles p on p.id=b.provider_id where b.id::text=(storage.foldername(name))[2] and (b.customer_id=(select auth.uid()) or (p.user_id=(select auth.uid()) and p.onboarding_status='approved' and p.is_published))));
create policy booking_attachment_participant_object_read on storage.objects for select to authenticated using(bucket_id='booking-attachments' and exists(select 1 from public.booking_attachments a join public.bookings b on b.id=a.booking_id left join public.provider_profiles p on p.id=b.provider_id where a.storage_path=name and (b.customer_id=(select auth.uid()) or p.user_id=(select auth.uid()))));
create policy booking_attachment_owner_delete on storage.objects for delete to authenticated using(bucket_id='booking-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);
