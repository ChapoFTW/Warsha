-- WPS-009 Communication & Collaboration
-- Forward-only extension of the existing booking-scoped chat. Live push,
-- telephony, schedulers, and retention deletion remain disabled.

alter table public.message_attachments
  add column if not exists file_name text,
  add column if not exists byte_size bigint;

alter table public.message_attachments
  drop constraint if exists message_attachments_byte_size_check;
alter table public.message_attachments
  add constraint message_attachments_byte_size_check
  check (byte_size is null or byte_size between 1 and 8388608);

alter table public.message_attachments
  drop constraint if exists message_attachments_file_name_check;
alter table public.message_attachments
  add constraint message_attachments_file_name_check
  check (
    file_name is null or (
      pg_catalog.length(pg_catalog.btrim(file_name)) between 1 and 120
      and pg_catalog.strpos(file_name, '/') = 0
      and pg_catalog.strpos(file_name, pg_catalog.chr(92)) = 0
      and file_name !~ '[[:cntrl:]]'
    )
  );

create table public.booking_abuse_reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  reporter_id uuid not null references public.profiles(id),
  accused_id uuid not null references public.profiles(id),
  message_id uuid references public.messages(id),
  category text not null check (category in (
    'harassment','threats','hate','sexual_content','spam_scam',
    'off_platform_pressure','privacy','unsafe_behavior','other'
  )),
  details text,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (reporter_id, idempotency_key),
  check (reporter_id <> accused_id),
  check (details is null or pg_catalog.length(details) between 1 and 1000)
);

alter table public.booking_abuse_reports enable row level security;
create index booking_abuse_reports_booking_created_idx
  on public.booking_abuse_reports(booking_id, created_at desc);
create policy booking_abuse_reports_staff_read on public.booking_abuse_reports
  for select to authenticated using (private.is_staff());

revoke all on public.booking_abuse_reports from public, anon;
revoke insert, update, delete on public.booking_abuse_reports from authenticated;
grant select on public.booking_abuse_reports to authenticated;

create or replace function private.prevent_booking_abuse_report_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Communication safety reports are immutable' using errcode = '55000';
end;
$$;
revoke all on function private.prevent_booking_abuse_report_mutation() from public, anon, authenticated;

create trigger booking_abuse_reports_immutable
before update or delete on public.booking_abuse_reports
for each row execute function private.prevent_booking_abuse_report_mutation();

create table private.communication_configuration (
  singleton boolean primary key default true check (singleton),
  policy_version integer not null default 1 check (policy_version > 0),
  call_relay_mode text not null default 'disabled' check (call_relay_mode in ('disabled','mock','provider')),
  call_relay_provider text,
  message_retention_days integer,
  safety_report_retention_days integer,
  retention_policy_status text not null default 'policy_pending' check (retention_policy_status in ('policy_pending','approved')),
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references public.profiles(id),
  check (call_relay_mode = 'disabled' or call_relay_provider is not null),
  check (message_retention_days is null or message_retention_days > 0),
  check (safety_report_retention_days is null or safety_report_retention_days > 0)
);
insert into private.communication_configuration(singleton) values (true)
on conflict (singleton) do nothing;
revoke all on private.communication_configuration from public, anon, authenticated;

create or replace function private.booking_chat_is_activated(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      b.status in (
        'confirmed','provider_on_the_way','provider_arrived','job_started',
        'work_in_progress','completed','disputed','refunded','no_show'
      )
      or exists (
        select 1 from public.booking_status_history h
        where h.booking_id = b.id
          and h.status in (
            'confirmed','provider_on_the_way','provider_arrived','job_started',
            'work_in_progress','completed','disputed','refunded','no_show'
          )
      )
    from public.bookings b
    where b.id = p_booking_id and b.deleted_at is null
  ), false)
$$;
revoke all on function private.booking_chat_is_activated(uuid) from public, anon;
grant execute on function private.booking_chat_is_activated(uuid) to authenticated;

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
  select coalesce((
    select case
      when not private.booking_chat_is_activated(b.id) then false
      when b.status = 'cancelled' then false
      when completion.completed_at is not null
        then p_at < completion.completed_at + interval '48 hours'
      when b.status in ('completed','disputed','refunded') then false
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
  ), false)
$$;
revoke all on function private.is_booking_chat_writable(uuid,timestamptz) from public, anon;
grant execute on function private.is_booking_chat_writable(uuid,timestamptz) to authenticated;

create or replace function private.is_safe_chat_file_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name is not null
    and pg_catalog.length(pg_catalog.btrim(p_name)) between 1 and 120
    and pg_catalog.strpos(p_name, '/') = 0
    and pg_catalog.strpos(p_name, pg_catalog.chr(92)) = 0
    and p_name !~ '[[:cntrl:]]'
$$;
revoke all on function private.is_safe_chat_file_name(text) from public, anon, authenticated;

create or replace function private.chat_has_off_platform_pattern(p_body text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.lower(p_body), '') ~
    '(\+?20[[:space:]-]*1[0125]|01[0125])([[:space:]-]*[0-9]){8}|whats[[:space:]-]*app|واتساب|واتس[[:space:]]*اب'
$$;
revoke all on function private.chat_has_off_platform_pattern(text) from public, anon, authenticated;

update storage.buckets
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg','image/png','image/heic','application/pdf']::text[]
where id = 'chat-attachments';

drop policy if exists chat_attachment_participant_upload on storage.objects;
create policy chat_attachment_participant_upload on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and private.is_booking_chat_storage_path(name)
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.is_booking_chat_participant(private.booking_chat_path_booking_id(name))
  and private.is_booking_chat_writable(private.booking_chat_path_booking_id(name), pg_catalog.now())
  and coalesce((metadata->>'size')::bigint, 0) between 1 and 8388608
  and metadata->>'mimetype' in ('image/jpeg','image/png','image/heic','application/pdf')
);

drop policy if exists chat_attachment_sender_delete on storage.objects;
create policy chat_attachment_sender_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'chat-attachments'
  and private.is_booking_chat_storage_path(name)
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.is_booking_chat_participant(private.booking_chat_path_booking_id(name))
  and created_at > pg_catalog.now() - interval '1 hour'
  and not exists (
    select 1 from public.message_attachments a where a.storage_path = name
  )
);

create or replace function public.send_booking_message_v2(
  p_booking_id uuid,
  p_message_type text,
  p_body text,
  p_attachment_path text,
  p_attachment_mime_type text,
  p_attachment_file_name text,
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
  existing_row record;
  booking_row record;
  recipient uuid;
  attachment_size bigint;
  quick_reply_key text;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select b.customer_id, p.user_id as provider_user_id
  into booking_row
  from public.bookings b
  join public.provider_profiles p on p.id = b.provider_id
  where b.id = p_booking_id and b.deleted_at is null;
  if booking_row.customer_id is null or booking_row.provider_user_id is null
    or (uid is distinct from booking_row.customer_id and uid is distinct from booking_row.provider_user_id)
  then raise exception 'Conversation is not available' using errcode = '42501'; end if;
  if p_client_id is null then raise exception 'Invalid message request' using errcode = '22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_booking_id::text || ':' || p_client_id::text, 0));
  select m.id, m.sender_id into existing_row
  from public.messages m
  where m.booking_id = p_booking_id and m.client_id = p_client_id;
  if existing_row.id is not null then
    if existing_row.sender_id = uid then return existing_row.id; end if;
    raise exception 'Invalid message request' using errcode = '22023';
  end if;

  if not private.is_booking_chat_writable(p_booking_id, pg_catalog.now()) then
    raise exception 'Booking chat is read-only' using errcode = '22023';
  end if;

  if p_message_type = 'text' then
    if pg_catalog.length(pg_catalog.btrim(coalesce(p_body, ''))) not between 1 and 2000
      or p_attachment_path is not null or p_attachment_mime_type is not null or p_attachment_file_name is not null
    then raise exception 'Invalid text message' using errcode = '22023'; end if;
  elsif p_message_type = 'quick_reply' then
    quick_reply_key := pg_catalog.btrim(coalesce(p_body, ''));
    if quick_reply_key not in (
      'on_my_way','arrived','need_access','confirm_address','running_10_late','thank_you'
    ) or p_attachment_path is not null or p_attachment_mime_type is not null or p_attachment_file_name is not null
    then raise exception 'Invalid quick reply' using errcode = '22023'; end if;
  elsif p_message_type in ('image','file') then
    if p_attachment_path is null or p_attachment_mime_type is null
      or p_attachment_mime_type not in ('image/jpeg','image/png','image/heic','application/pdf')
      or (p_message_type = 'file' and p_attachment_mime_type <> 'application/pdf')
      or (p_message_type = 'image' and p_attachment_mime_type = 'application/pdf')
      or (p_message_type = 'file' and p_attachment_file_name is null)
      or (p_attachment_file_name is not null and not private.is_safe_chat_file_name(p_attachment_file_name))
      or p_body is not null
    then raise exception 'Invalid attachment message' using errcode = '22023'; end if;
    if p_attachment_path !~ ('^' || p_booking_id::text || '/' || uid::text || '/[A-Za-z0-9._-]+$')
    then raise exception 'Invalid attachment path' using errcode = '42501'; end if;
    select coalesce((o.metadata->>'size')::bigint, 0)
    into attachment_size
    from storage.objects o
    where o.bucket_id = 'chat-attachments'
      and o.name = p_attachment_path
      and o.owner = uid
      and o.metadata->>'mimetype' = p_attachment_mime_type;
    if attachment_size is null or attachment_size not between 1 and 8388608
    then raise exception 'Uploaded attachment was not found' using errcode = '22023'; end if;
  else
    raise exception 'Invalid message type' using errcode = '22023';
  end if;

  insert into public.conversations(booking_id)
  values (p_booking_id)
  on conflict (booking_id) where booking_id is not null
  do update set updated_at = pg_catalog.now()
  returning id into conversation_id;
  insert into public.conversation_members(conversation_id, user_id)
  values (conversation_id, booking_row.customer_id), (conversation_id, booking_row.provider_user_id)
  on conflict do nothing;
  insert into public.messages(conversation_id, booking_id, sender_id, message_type, body, metadata, client_id)
  values (
    conversation_id, p_booking_id, uid, p_message_type,
    case when p_message_type = 'text' then pg_catalog.btrim(p_body) else null end,
    case when p_message_type = 'quick_reply'
      then pg_catalog.jsonb_build_object('quick_reply_key', quick_reply_key)
      else '{}'::jsonb end,
    p_client_id
  ) returning id into message_id;
  if p_message_type in ('image','file') then
    insert into public.message_attachments(message_id, storage_path, mime_type, file_name, byte_size)
    values (
      message_id, p_attachment_path, p_attachment_mime_type,
      case when p_attachment_file_name is null then null else pg_catalog.btrim(p_attachment_file_name) end,
      attachment_size
    );
  end if;

  if p_message_type = 'text' and private.chat_has_off_platform_pattern(p_body) then
    insert into public.messages(conversation_id, booking_id, sender_id, message_type, metadata)
    values (
      conversation_id, p_booking_id, null, 'system',
      pg_catalog.jsonb_build_object('event','off_platform_reminder','source_message_id',message_id)
    );
  end if;

  recipient := case when uid = booking_row.customer_id then booking_row.provider_user_id else booking_row.customer_id end;
  insert into public.notifications(user_id, type, title, body, data, dedupe_key)
  values (
    recipient, 'booking_message', 'New message',
    'You have a new message about your booking.',
    pg_catalog.jsonb_build_object('booking_id', p_booking_id),
    'booking-message:' || message_id::text
  ) on conflict(user_id,type,dedupe_key) where dedupe_key is not null do nothing;
  return message_id;
end;
$$;

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
begin
  return public.send_booking_message_v2(
    p_booking_id, p_message_type, p_body, p_attachment_path,
    p_attachment_mime_type, null, p_client_id
  );
end;
$$;

create or replace function public.mark_booking_messages_read(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or not private.is_booking_chat_participant(p_booking_id)
  then raise exception 'Conversation is not available' using errcode = '42501'; end if;
  update public.conversation_members cm
  set last_read_at = pg_catalog.now()
  from public.conversations c
  where cm.conversation_id = c.id
    and c.booking_id = p_booking_id
    and cm.user_id = uid;
end;
$$;

create or replace function public.get_my_booking_conversations()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'bookingId', b.id,
    'serviceName', b.service_name_snapshot,
    'status', b.status,
    'counterpartName', case when b.customer_id = (select auth.uid())
      then provider_profile.display_name else customer_profile.display_name end,
    'lastMessageAt', last_message.created_at,
    'lastMessageKind', last_message.message_type,
    'unreadCount', coalesce(unread.unread_count, 0),
    'writable', private.is_booking_chat_writable(b.id, pg_catalog.now()),
    'writableUntil', completion.completed_at + interval '48 hours'
  )
  from public.bookings b
  join public.provider_profiles provider_profile on provider_profile.id = b.provider_id
  left join public.profiles customer_profile on customer_profile.id = b.customer_id
  left join public.conversations c on c.booking_id = b.id
  left join public.conversation_members cm
    on cm.conversation_id = c.id and cm.user_id = (select auth.uid())
  left join lateral (
    select m.created_at, m.message_type
    from public.messages m
    where m.booking_id = b.id and m.deleted_at is null
    order by m.created_at desc, m.id desc limit 1
  ) last_message on true
  left join lateral (
    select pg_catalog.count(*)::integer as unread_count
    from public.messages m
    where m.booking_id = b.id
      and m.deleted_at is null
      and m.sender_id is distinct from (select auth.uid())
      and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
  ) unread on true
  left join lateral (
    select min(h.created_at) as completed_at
    from public.booking_status_history h
    where h.booking_id = b.id and h.status = 'completed'
  ) completion on true
  where (b.customer_id = (select auth.uid()) or provider_profile.user_id = (select auth.uid()))
    and b.deleted_at is null
    and private.booking_chat_is_activated(b.id)
  order by coalesce(last_message.created_at, b.updated_at, b.created_at) desc
  limit 100
$$;

create or replace function public.get_booking_communication_capabilities(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); activated boolean; writable boolean; completed_at timestamptz;
begin
  if uid is null or not private.is_booking_chat_participant(p_booking_id)
  then raise exception 'Conversation is not available' using errcode = '42501'; end if;
  activated := private.booking_chat_is_activated(p_booking_id);
  writable := private.is_booking_chat_writable(p_booking_id, pg_catalog.now());
  select min(h.created_at) into completed_at
  from public.booking_status_history h where h.booking_id = p_booking_id and h.status = 'completed';
  return pg_catalog.jsonb_build_object(
    'chatActivated', activated,
    'chatWritable', writable,
    'chatWritableUntil', case when completed_at is null then null else completed_at + interval '48 hours' end,
    'callRelayAvailable', false,
    'callRelayReason', 'not_configured',
    'safetyReportAvailable', activated
  );
end;
$$;

create or replace function public.request_booking_call_relay(p_booking_id uuid, p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); config private.communication_configuration;
begin
  if uid is null or p_client_id is null or not private.is_booking_chat_participant(p_booking_id)
  then raise exception 'Conversation is not available' using errcode = '42501'; end if;
  select * into config from private.communication_configuration where singleton;
  if config.call_relay_mode = 'disabled' or config.call_relay_provider is null then
    raise exception 'Call relay is not configured' using errcode = '55000';
  end if;
  raise exception 'Call relay provider adapter is not deployed' using errcode = '55000';
end;
$$;

create or replace function public.report_booking_communication_abuse(
  p_booking_id uuid,
  p_category text,
  p_details text,
  p_message_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); booking_row record; accused uuid; report_id uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select b.customer_id, p.user_id as provider_user_id into booking_row
  from public.bookings b join public.provider_profiles p on p.id = b.provider_id
  where b.id = p_booking_id and b.deleted_at is null;
  if booking_row.customer_id is null or booking_row.provider_user_id is null
    or (uid is distinct from booking_row.customer_id and uid is distinct from booking_row.provider_user_id)
  then raise exception 'Conversation is not available' using errcode = '42501'; end if;
  if not private.booking_chat_is_activated(p_booking_id)
    or p_category not in (
      'harassment','threats','hate','sexual_content','spam_scam',
      'off_platform_pressure','privacy','unsafe_behavior','other'
    )
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_idempotency_key, ''))) not between 8 and 120
    or (p_details is not null and pg_catalog.length(pg_catalog.btrim(p_details)) not between 1 and 1000)
    or (p_message_id is not null and not exists (
      select 1 from public.messages m where m.id = p_message_id and m.booking_id = p_booking_id
    ))
  then raise exception 'Invalid communication safety report' using errcode = '22023'; end if;
  accused := case when uid = booking_row.customer_id then booking_row.provider_user_id else booking_row.customer_id end;
  select r.id into report_id from public.booking_abuse_reports r
  where r.reporter_id = uid and r.idempotency_key = p_idempotency_key;
  if report_id is not null then return report_id; end if;
  insert into public.booking_abuse_reports(
    booking_id, reporter_id, accused_id, message_id, category, details, idempotency_key
  ) values (
    p_booking_id, uid, accused, p_message_id, p_category,
    nullif(pg_catalog.btrim(p_details), ''), p_idempotency_key
  ) returning id into report_id;
  return report_id;
end;
$$;

create or replace function private.record_booking_chat_system_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare conversation_id uuid; provider_user_id uuid;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  if not private.booking_chat_is_activated(new.id) then return new; end if;
  select p.user_id into provider_user_id from public.provider_profiles p where p.id = new.provider_id;
  if provider_user_id is null then return new; end if;
  insert into public.conversations(booking_id) values (new.id)
  on conflict (booking_id) where booking_id is not null do update set updated_at = pg_catalog.now()
  returning id into conversation_id;
  insert into public.conversation_members(conversation_id, user_id)
  values (conversation_id, new.customer_id), (conversation_id, provider_user_id) on conflict do nothing;
  insert into public.messages(conversation_id, booking_id, sender_id, message_type, metadata)
  values (conversation_id, new.id, null, 'status', pg_catalog.jsonb_build_object('event', 'booking_' || new.status));
  return new;
end;
$$;
revoke all on function private.record_booking_chat_system_message() from public, anon, authenticated;

create or replace function private.record_running_late_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare conversation_id uuid; booking_row record;
begin
  select b.customer_id, p.user_id as provider_user_id into booking_row
  from public.bookings b join public.provider_profiles p on p.id = b.provider_id
  where b.id = new.booking_id;
  if booking_row.customer_id is null or booking_row.provider_user_id is null
    or not private.booking_chat_is_activated(new.booking_id) then return new; end if;
  insert into public.conversations(booking_id) values (new.booking_id)
  on conflict (booking_id) where booking_id is not null do update set updated_at = pg_catalog.now()
  returning id into conversation_id;
  insert into public.conversation_members(conversation_id, user_id)
  values (conversation_id, booking_row.customer_id), (conversation_id, booking_row.provider_user_id)
  on conflict do nothing;
  insert into public.messages(conversation_id, booking_id, sender_id, message_type, metadata)
  values (
    conversation_id, new.booking_id, null, 'running_late',
    pg_catalog.jsonb_build_object(
      'event','worker_running_late','delay_minutes',new.delay_minutes,
      'reason_code',new.reason_code,'note',new.note,'source_event_id',new.id
    )
  );
  return new;
end;
$$;
revoke all on function private.record_running_late_chat_message() from public, anon, authenticated;
drop trigger if exists marketplace_running_late_chat_message on public.marketplace_running_late_events;
create trigger marketplace_running_late_chat_message
after insert on public.marketplace_running_late_events
for each row execute function private.record_running_late_chat_message();

revoke all on function public.send_booking_message_v2(uuid,text,text,text,text,text,uuid) from public, anon;
revoke all on function public.send_booking_message(uuid,text,text,text,text,uuid) from public, anon;
revoke all on function public.mark_booking_messages_read(uuid) from public, anon;
revoke all on function public.get_my_booking_conversations() from public, anon;
revoke all on function public.get_booking_communication_capabilities(uuid) from public, anon;
revoke all on function public.request_booking_call_relay(uuid,uuid) from public, anon;
revoke all on function public.report_booking_communication_abuse(uuid,text,text,uuid,text) from public, anon;
grant execute on function public.send_booking_message_v2(uuid,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.send_booking_message(uuid,text,text,text,text,uuid) to authenticated;
grant execute on function public.mark_booking_messages_read(uuid) to authenticated;
grant execute on function public.get_my_booking_conversations() to authenticated;
grant execute on function public.get_booking_communication_capabilities(uuid) to authenticated;
grant execute on function public.request_booking_call_relay(uuid,uuid) to authenticated;
grant execute on function public.report_booking_communication_abuse(uuid,text,text,uuid,text) to authenticated;

-- Only participant-visible, non-sensitive invalidation tables are published.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end;
$$;
