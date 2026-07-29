-- Correct participant policies that must resolve provider profile ownership
-- without granting authenticated clients direct access to provider_profiles.

create or replace function private.is_booking_participant(
  p_booking_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    left join public.provider_profiles p on p.id = b.provider_id
    where b.id = p_booking_id
      and (
        b.customer_id = (select auth.uid())
        or p.user_id = (select auth.uid())
      )
  );
$$;

revoke all on function private.is_booking_participant(uuid)
  from public, anon, authenticated;
grant execute on function private.is_booking_participant(uuid)
  to authenticated;

create or replace function private.can_manage_booking_completion(
  p_booking_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    join public.provider_profiles p on p.id = b.provider_id
    where b.id = p_booking_id
      and b.deleted_at is null
      and p.user_id = (select auth.uid())
      and p.onboarding_status = 'approved'
      and p.is_published
      and p.deleted_at is null
      and b.status in ('job_started', 'work_in_progress')
  );
$$;

revoke all on function private.can_manage_booking_completion(uuid)
  from public, anon, authenticated;
grant execute on function private.can_manage_booking_completion(uuid)
  to authenticated;

-- These client-facing read models are protected by the participant policies
-- below. RLS still applies after the minimum table-level SELECT grant.
revoke select on public.bookings,
  public.booking_status_history,
  public.booking_attachments
  from public, anon;
grant select on public.bookings,
  public.booking_status_history,
  public.booking_attachments
  to authenticated;
revoke insert, delete on public.booking_attachments
  from public, anon;
grant insert, delete on public.booking_attachments
  to authenticated;

drop policy if exists bookings_participant_read on public.bookings;
create policy bookings_participant_read
on public.bookings for select to authenticated
using (
  private.is_booking_participant(id)
  or private.is_staff()
);

drop policy if exists booking_history_participant_read
  on public.booking_status_history;
create policy booking_history_participant_read
on public.booking_status_history for select to authenticated
using (
  private.is_booking_participant(booking_id)
  or private.is_staff()
);

drop policy if exists booking_attachments_participant
  on public.booking_attachments;
create policy booking_attachments_participant
on public.booking_attachments for select to authenticated
using (
  private.is_booking_participant(booking_id)
  or private.is_staff()
);

drop policy if exists booking_attachments_insert_provider
  on public.booking_attachments;
create policy booking_attachments_insert_provider
on public.booking_attachments for insert to authenticated
with check (
  attachment_kind = 'completion_evidence'
  and uploader_id = (select auth.uid())
  and storage_path like
    (select auth.uid())::text
    || '/'
    || booking_id::text
    || '/completion/%'
  and mime_type in (
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  )
  and private.can_manage_booking_completion(booking_id)
);

drop policy if exists booking_attachments_delete_provider_pending
  on public.booking_attachments;
create policy booking_attachments_delete_provider_pending
on public.booking_attachments for delete to authenticated
using (
  attachment_kind = 'completion_evidence'
  and uploader_id = (select auth.uid())
  and private.can_manage_booking_completion(booking_id)
);

create or replace function public.reject_provider_reschedule(
  p_booking_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  return_status text;
  proposed_date date;
  proposed_time time;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select b.proposal_from_status,
         b.proposed_scheduled_date,
         b.proposed_scheduled_time
  into return_status,
       proposed_date,
       proposed_time
  from public.bookings b
  where b.id = p_booking_id
    and b.customer_id = uid
    and b.status = 'rescheduling_requested'
    and b.deleted_at is null
  for update;

  if return_status is null
     or return_status not in (
       'pending_provider_approval',
       'accepted',
       'confirmed'
     ) then
    raise exception 'Reschedule response is not available'
      using errcode = '22023';
  end if;

  update public.bookings
  set status = return_status,
      proposed_scheduled_date = null,
      proposed_scheduled_time = null,
      provider_reschedule_note = null,
      proposal_from_status = null,
      updated_at = pg_catalog.now()
  where id = p_booking_id;

  perform private.annotate_booking_history(
    p_booking_id,
    return_status,
    uid,
    pg_catalog.jsonb_build_object(
      'note',
      'reschedule_rejected',
      'rejected_date',
      proposed_date,
      'rejected_time',
      proposed_time
    )
  );
end;
$$;

revoke all on function public.reject_provider_reschedule(uuid)
  from public, anon, authenticated;
grant execute on function public.reject_provider_reschedule(uuid)
  to authenticated;
