alter table public.messages add column if not exists booking_id uuid references public.bookings(id) on delete cascade;
alter table public.messages add column if not exists client_id uuid;
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;

create unique index if not exists conversations_booking_unique_idx on public.conversations(booking_id) where booking_id is not null;
create unique index if not exists messages_booking_client_unique_idx on public.messages(booking_id, client_id) where client_id is not null;
create index if not exists messages_booking_created_idx on public.messages(booking_id, created_at desc, id desc) where deleted_at is null;
create index if not exists message_attachments_message_idx on public.message_attachments(message_id);

create table if not exists public.conversation_typing (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (booking_id, user_id)
);
alter table public.conversation_typing enable row level security;
create index if not exists conversation_typing_expiry_idx on public.conversation_typing(expires_at);

create or replace function private.is_booking_chat_participant(p_booking_id uuid)
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
      and (b.customer_id = (select auth.uid()) or p.user_id = (select auth.uid()))
  )
$$;

create or replace function private.is_booking_chat_storage_path(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
$$;

create or replace function private.booking_chat_path_booking_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when private.is_booking_chat_storage_path(p_name) then (storage.foldername(p_name))[1]::uuid end
$$;

revoke all on function private.is_booking_chat_participant(uuid) from public, anon;
grant execute on function private.is_booking_chat_participant(uuid) to authenticated;
revoke all on function private.is_booking_chat_storage_path(text) from public, anon;
grant execute on function private.is_booking_chat_storage_path(text) to authenticated;
revoke all on function private.booking_chat_path_booking_id(text) from public, anon;
grant execute on function private.booking_chat_path_booking_id(text) to authenticated;

drop policy if exists conversations_member_read on public.conversations;
drop policy if exists conversation_members_member_read on public.conversation_members;
drop policy if exists messages_member_read on public.messages;
drop policy if exists messages_member_insert on public.messages;
drop policy if exists messages_booking_participant_read on public.messages;
drop policy if exists message_attachments_booking_participant_read on public.message_attachments;
drop policy if exists conversation_typing_booking_participant_read on public.conversation_typing;

create policy conversations_booking_participant_read on public.conversations
  for select to authenticated using (booking_id is not null and private.is_booking_chat_participant(booking_id));
create policy conversation_members_booking_participant_read on public.conversation_members
  for select to authenticated using (exists (select 1 from public.conversations c where c.id = conversation_id and c.booking_id is not null and private.is_booking_chat_participant(c.booking_id)));
create policy messages_booking_participant_read on public.messages
  for select to authenticated using (booking_id is not null and private.is_booking_chat_participant(booking_id));
create policy message_attachments_booking_participant_read on public.message_attachments
  for select to authenticated using (exists (select 1 from public.messages m where m.id = message_id and m.booking_id is not null and private.is_booking_chat_participant(m.booking_id)));
create policy conversation_typing_booking_participant_read on public.conversation_typing
  for select to authenticated using (private.is_booking_chat_participant(booking_id));

revoke all on public.conversations, public.conversation_members, public.messages, public.message_attachments, public.conversation_typing from public, anon;
revoke insert, update, delete on public.conversations, public.conversation_members, public.messages, public.message_attachments, public.conversation_typing from authenticated;
grant select on public.conversations, public.conversation_members, public.messages, public.message_attachments, public.conversation_typing to authenticated;

insert into storage.buckets(id, name, public) values ('chat-attachments', 'chat-attachments', false) on conflict (id) do nothing;
drop policy if exists chat_attachment_participant_read on storage.objects;
drop policy if exists chat_attachment_participant_upload on storage.objects;
drop policy if exists chat_attachment_sender_delete on storage.objects;
create policy chat_attachment_participant_read on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-attachments'
    and private.is_booking_chat_storage_path(name)
    and private.is_booking_chat_participant(private.booking_chat_path_booking_id(name))
  );
create policy chat_attachment_participant_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chat-attachments'
    and private.is_booking_chat_storage_path(name)
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.is_booking_chat_participant(private.booking_chat_path_booking_id(name))
  );
create policy chat_attachment_sender_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'chat-attachments'
    and private.is_booking_chat_storage_path(name)
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.is_booking_chat_participant(private.booking_chat_path_booking_id(name))
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
  select b.customer_id, p.user_id as provider_user_id into booking_row from public.bookings b join public.provider_profiles p on p.id = b.provider_id where b.id = p_booking_id;
  if booking_row.customer_id is null or booking_row.provider_user_id is null or (uid is distinct from booking_row.customer_id and uid is distinct from booking_row.provider_user_id) then
    raise exception 'Conversation is not available' using errcode = '42501';
  end if;
  if p_client_id is null then raise exception 'Invalid message request' using errcode = '22023'; end if;
  if p_message_type = 'text' then
    if pg_catalog.length(pg_catalog.btrim(coalesce(p_body, ''))) not between 1 and 2000 or p_attachment_path is not null then raise exception 'Invalid text message' using errcode = '22023'; end if;
  elsif p_message_type = 'image' then
    if p_attachment_path is null or p_attachment_mime_type is null or p_attachment_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif') then raise exception 'Invalid image message' using errcode = '22023'; end if;
    if p_attachment_path !~ ('^' || p_booking_id::text || '/' || uid::text || '/[^/]+$') then raise exception 'Invalid image path' using errcode = '42501'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'chat-attachments' and o.name = p_attachment_path and o.owner = uid and coalesce((o.metadata->>'size')::bigint, 0) between 1 and 8388608) then raise exception 'Uploaded image was not found' using errcode = '22023'; end if;
  else
    raise exception 'Invalid message type' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_booking_id::text || ':' || p_client_id::text, 0));
  select m.id into existing_id from public.messages m where m.booking_id = p_booking_id and m.client_id = p_client_id;
  if existing_id is not null then return existing_id; end if;
  insert into public.conversations(booking_id) values (p_booking_id)
  on conflict (booking_id) where booking_id is not null do update set updated_at = public.conversations.updated_at
  returning id into conversation_id;
  insert into public.conversation_members(conversation_id, user_id) values (conversation_id, booking_row.customer_id), (conversation_id, booking_row.provider_user_id) on conflict do nothing;
  insert into public.messages(conversation_id, booking_id, sender_id, message_type, body, client_id)
  values (conversation_id, p_booking_id, uid, p_message_type, case when p_message_type = 'text' then pg_catalog.btrim(p_body) else null end, p_client_id)
  returning id into message_id;
  if p_message_type = 'image' then insert into public.message_attachments(message_id, storage_path, mime_type) values (message_id, p_attachment_path, p_attachment_mime_type); end if;
  recipient := case when uid = booking_row.customer_id then booking_row.provider_user_id else booking_row.customer_id end;
  insert into public.notifications(user_id, type, title, body, data)
  values (recipient, 'booking_message', 'New message', 'You have a new message about your booking.', pg_catalog.jsonb_build_object('booking_id', p_booking_id, 'message_id', message_id));
  return message_id;
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
  if uid is null or not private.is_booking_chat_participant(p_booking_id) then raise exception 'Conversation is not available' using errcode = '42501'; end if;
  update public.messages set delivered_at = coalesce(delivered_at, pg_catalog.now()), read_at = coalesce(read_at, pg_catalog.now()) where booking_id = p_booking_id and sender_id is distinct from uid and deleted_at is null;
  update public.conversation_members cm set last_read_at = pg_catalog.now() from public.conversations c where cm.conversation_id = c.id and c.booking_id = p_booking_id and cm.user_id = uid;
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
    insert into public.conversation_typing(booking_id, user_id, expires_at, updated_at) values (p_booking_id, uid, pg_catalog.now() + interval '8 seconds', pg_catalog.now())
    on conflict (booking_id, user_id) do update set expires_at = excluded.expires_at, updated_at = excluded.updated_at;
  else delete from public.conversation_typing where booking_id = p_booking_id and user_id = uid;
  end if;
end;
$$;

revoke all on function public.send_booking_message(uuid, text, text, text, text, uuid) from public, anon;
revoke all on function public.mark_booking_messages_read(uuid) from public, anon;
revoke all on function public.set_booking_typing(uuid, boolean) from public, anon;
grant execute on function public.send_booking_message(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.mark_booking_messages_read(uuid) to authenticated;
grant execute on function public.set_booking_typing(uuid, boolean) to authenticated;

create or replace function private.record_booking_chat_system_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_id uuid;
  provider_user_id uuid;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then return new; end if;
  select p.user_id into provider_user_id from public.provider_profiles p where p.id = new.provider_id;
  if provider_user_id is null then return new; end if;
  insert into public.conversations(booking_id) values (new.id)
  on conflict (booking_id) where booking_id is not null do update set updated_at = public.conversations.updated_at
  returning id into conversation_id;
  insert into public.conversation_members(conversation_id, user_id) values (conversation_id, new.customer_id), (conversation_id, provider_user_id) on conflict do nothing;
  insert into public.messages(conversation_id, booking_id, sender_id, message_type, metadata)
  values (conversation_id, new.id, null, 'system', pg_catalog.jsonb_build_object('event', 'booking_' || new.status));
  return new;
end;
$$;
revoke all on function private.record_booking_chat_system_message() from public, anon, authenticated;
drop trigger if exists booking_chat_system_message on public.bookings;
create trigger booking_chat_system_message after insert or update of status on public.bookings for each row execute function private.record_booking_chat_system_message();

do $$
declare table_name text;
begin
  foreach table_name in array array['messages', 'message_attachments', 'conversation_typing'] loop
    if not exists (select 1 from pg_catalog.pg_publication_tables p where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = table_name) then
      execute pg_catalog.format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
