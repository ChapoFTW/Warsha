-- Talking before there is a job, without letting everybody talk.
--
-- ## What was missing
--
-- Warsha's chat is booking-scoped: `messages.booking_id`,
-- `private.is_booking_chat_participant(booking_id)`, storage paths keyed on a
-- booking. That is correct and stays exactly as it is.
--
-- But a worker deciding whether to quote often needs to ask something first --
-- which floor, is the water off, is there parking -- and until now there was
-- nowhere to ask it. The work of quoting happened blind.
--
-- ## The rule
--
--   REQUEST POSTED                 nobody may contact the customer. A request
--                                  is broadcast to many workers and a customer
--                                  who posts one must not acquire forty
--                                  conversations.
--
--   WORKER SUBMITS A QUOTE         that worker and that customer may talk.
--                                  Submitting an offer is the act that creates
--                                  a relationship; viewing an invitation is not.
--
--   OFFER WITHDRAWN OR REJECTED    the history stays readable to both. New
--                                  messages stop. Deleting the record of a
--                                  conversation somebody had is worse than
--                                  ending it.
--
--   WORKER SELECTED                the SAME thread becomes the booking's
--                                  thread. See the promotion below.
--
-- ## One thread, not two
--
-- The obvious implementation gives a request conversation and a booking
-- conversation, and the customer who asked "which floor?" before hiring cannot
-- find the answer afterwards. `conversations.booking_id` was already nullable,
-- so the row simply gains a `booking_id` when the booking is created and every
-- existing booking-scoped path -- RLS, `send_booking_message`,
-- `get_my_booking_conversations`, the native route, the realtime channel --
-- starts working on it with no changes at all.
--
-- The promotion is a trigger on `marketplace_requests.converted_booking_id`
-- rather than an edit to `private.convert_marketplace_request`. Two reasons:
-- recreating that function would carry the risk of reverting fixes applied to
-- it since it was written (this migration set has already been caught doing
-- exactly that once), and a trigger covers every path that converts a request,
-- including any added later.
--
-- ## Writes do not go through RLS
--
-- Following the booking chat exactly: the tables carry READ policies only, and
-- every write goes through a SECURITY DEFINER function that owns the
-- authorization decision. An INSERT policy on `messages` would mean the rule
-- lived in two places and had to agree with itself.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column if not exists request_id uuid references public.marketplace_requests(id) on delete cascade,
  add column if not exists provider_id uuid references public.provider_profiles(id) on delete cascade;

-- A conversation is between ONE customer and ONE worker about ONE request.
create unique index if not exists conversations_request_provider_unique_idx
  on public.conversations(request_id, provider_id)
  where request_id is not null;

-- Denormalised onto the message for the same two reasons `booking_id` is:
-- row-level security can filter on it without a join, and a realtime
-- subscription can be narrowed to one conversation with a column filter.
alter table public.messages
  add column if not exists request_id uuid references public.marketplace_requests(id) on delete cascade;

create index if not exists messages_request_created_idx
  on public.messages(request_id, created_at desc, id desc)
  where deleted_at is null;

-- The same client-id idempotency the booking chat uses: a message sent twice
-- because a phone retried is one message.
create unique index if not exists messages_request_client_unique_idx
  on public.messages(request_id, client_id)
  where request_id is not null and client_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Who may read, and who may write
-- ---------------------------------------------------------------------------
-- Two predicates, deliberately different. Reading is about whether a
-- relationship ever existed; writing is about whether it is still live.

create or replace function private.is_request_chat_participant(p_request_id uuid, p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.marketplace_requests r
    join public.provider_profiles p on p.id = p_provider_id
    -- The quote is what creates the relationship. Any status: a withdrawn or
    -- rejected offer still means these two people spoke, and the record of it
    -- belongs to both of them.
    join public.worker_quotes q on q.request_id = r.id and q.provider_id = p_provider_id
    where r.id = p_request_id
      and (r.customer_id = (select auth.uid()) or p.user_id = (select auth.uid()))
  )
$$;

create or replace function private.request_chat_accepts_messages(p_request_id uuid, p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.marketplace_requests r
    join public.worker_quotes q on q.request_id = r.id and q.provider_id = p_provider_id
    where r.id = p_request_id
      -- A live offer, or one the customer has chosen and is waiting on. Once a
      -- quote is withdrawn, rejected, expired or invalidated there is nothing
      -- to arrange and the thread becomes read-only.
      and q.status in ('submitted', 'revised', 'selected')
      and r.status in ('matching', 'collecting_quotes', 'customer_reviewing',
                       'rescue_matching', 'selection_pending_confirmation', 'worker_confirmed')
      and r.expires_at > pg_catalog.now()
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Row security
-- ---------------------------------------------------------------------------
-- Read only, as with the booking chat. Note these are ADDITIONAL policies:
-- PostgreSQL ORs permissive policies together, so a conversation that has been
-- promoted to a booking is readable through either.

drop policy if exists conversations_request_participant_read on public.conversations;
create policy conversations_request_participant_read on public.conversations
  for select to authenticated
  using (request_id is not null and provider_id is not null
         and private.is_request_chat_participant(request_id, provider_id));

drop policy if exists messages_request_participant_read on public.messages;
create policy messages_request_participant_read on public.messages
  for select to authenticated
  using (request_id is not null
         and exists (select 1 from public.conversations c
                     where c.id = messages.conversation_id
                       and c.request_id = messages.request_id
                       and c.provider_id is not null
                       and private.is_request_chat_participant(c.request_id, c.provider_id)));

drop policy if exists conversation_members_request_participant_read on public.conversation_members;
create policy conversation_members_request_participant_read on public.conversation_members
  for select to authenticated
  using (exists (select 1 from public.conversations c
                 where c.id = conversation_members.conversation_id
                   and c.request_id is not null and c.provider_id is not null
                   and private.is_request_chat_participant(c.request_id, c.provider_id)));

-- ---------------------------------------------------------------------------
-- 4. Opening the conversation
-- ---------------------------------------------------------------------------
-- Idempotent, and callable by either party. A worker who has quoted may start
-- the conversation; so may the customer who received the quote.

create or replace function public.open_request_conversation(p_request_id uuid, p_provider_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  uid uuid := (select auth.uid());
  conversation_id uuid;
  customer uuid;
  worker uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.is_request_chat_participant(p_request_id, p_provider_id) then
    -- The same refusal a non-existent request would produce. A worker who has
    -- not quoted must not be able to learn that a request exists by asking to
    -- talk about it.
    raise exception 'Conversation not found' using errcode='PT404';
  end if;

  select id into conversation_id from public.conversations
  where request_id = p_request_id and provider_id = p_provider_id;
  if conversation_id is not null then return conversation_id; end if;

  -- Serialised per (request, provider) so two clients opening the thread at the
  -- same moment cannot create two rows and lose half the messages to whichever
  -- one they each happened to get.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('request_conversation:' || p_request_id::text || ':' || p_provider_id::text, 0));
  select id into conversation_id from public.conversations
  where request_id = p_request_id and provider_id = p_provider_id;
  if conversation_id is not null then return conversation_id; end if;

  select r.customer_id into customer from public.marketplace_requests r where r.id = p_request_id;
  select p.user_id into worker from public.provider_profiles p where p.id = p_provider_id;

  insert into public.conversations(request_id, provider_id)
  values (p_request_id, p_provider_id)
  returning id into conversation_id;

  insert into public.conversation_members(conversation_id, user_id)
  values (conversation_id, customer), (conversation_id, worker)
  on conflict do nothing;

  return conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Sending
-- ---------------------------------------------------------------------------

create or replace function public.send_request_message(
  p_request_id uuid,
  p_provider_id uuid,
  p_body text,
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  uid uuid := (select auth.uid());
  conversation_id uuid;
  message_id uuid;
  trimmed text := pg_catalog.btrim(coalesce(p_body, ''));
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.is_request_chat_participant(p_request_id, p_provider_id) then
    raise exception 'Conversation not found' using errcode='PT404';
  end if;
  if not private.request_chat_accepts_messages(p_request_id, p_provider_id) then
    raise exception 'request_conversation_closed' using errcode='WM001';
  end if;
  if pg_catalog.length(trimmed) = 0 or pg_catalog.length(trimmed) > 2000 then
    raise exception 'Invalid message' using errcode='22023';
  end if;

  conversation_id := public.open_request_conversation(p_request_id, p_provider_id);

  -- The same idempotency the booking chat uses. A retry after a timeout must
  -- not post the message twice, and the client cannot know whether the first
  -- attempt landed.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text || ':' || coalesce(p_client_id::text, ''), 0));
  if p_client_id is not null then
    select id into message_id from public.messages
    where request_id = p_request_id and client_id = p_client_id;
    if message_id is not null then return message_id; end if;
  end if;

  insert into public.messages(conversation_id, request_id, sender_id, message_type, body, client_id)
  values (conversation_id, p_request_id, uid, 'text', trimmed, p_client_id)
  returning id into message_id;

  update public.conversations set updated_at = pg_catalog.now() where id = conversation_id;
  return message_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Reading
-- ---------------------------------------------------------------------------
-- Returns the thread and whether it still accepts messages, so a client draws a
-- read-only conversation rather than an input box that fails when used.

create or replace function public.get_request_conversation(
  p_request_id uuid,
  p_provider_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); rows jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.is_request_chat_participant(p_request_id, p_provider_id) then
    raise exception 'Conversation not found' using errcode='PT404';
  end if;

  select coalesce(pg_catalog.jsonb_agg(entry order by entry->>'createdAt'), '[]'::jsonb)
  into rows
  from (
    select pg_catalog.jsonb_build_object(
      'id', m.id,
      'body', m.body,
      'createdAt', m.created_at,
      'mine', m.sender_id = uid
    ) as entry
    from public.messages m
    where m.request_id = p_request_id and m.deleted_at is null
    order by m.created_at desc, m.id desc
    limit least(coalesce(p_limit, 50), 200)
  ) recent;

  return pg_catalog.jsonb_build_object(
    'requestId', p_request_id,
    'providerId', p_provider_id,
    'canSend', private.request_chat_accepts_messages(p_request_id, p_provider_id),
    'messages', rows);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Promotion: one thread follows the relationship into the booking
-- ---------------------------------------------------------------------------

create or replace function private.promote_request_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare winning_provider uuid;
begin
  if new.converted_booking_id is null
     or old.converted_booking_id is not distinct from new.converted_booking_id then
    return new;
  end if;

  select q.provider_id into winning_provider
  from public.worker_quotes q where q.id = new.selected_quote_id;
  if winning_provider is null then return new; end if;

  -- The conversation gains the booking. Every booking-scoped path -- row
  -- security, `send_booking_message`, `get_my_booking_conversations`, the
  -- native route, the realtime channel -- begins working on this exact row,
  -- with its history, and no second thread is created.
  update public.conversations
  set booking_id = new.converted_booking_id, updated_at = pg_catalog.now()
  where request_id = new.id and provider_id = winning_provider and booking_id is null;

  -- The denormalised column follows, so the booking chat's own reads and its
  -- realtime filter see the earlier messages too.
  update public.messages
  set booking_id = new.converted_booking_id
  where request_id = new.id and booking_id is null
    and conversation_id in (select id from public.conversations
                            where request_id = new.id and provider_id = winning_provider);
  return new;
end;
$$;

drop trigger if exists promote_request_conversation on public.marketplace_requests;
create trigger promote_request_conversation
after update of converted_booking_id on public.marketplace_requests
for each row execute function private.promote_request_conversation();

-- ---------------------------------------------------------------------------
-- 8. Privileges
-- ---------------------------------------------------------------------------
-- The predicates are unreachable by clients: they take a provider id, and a
-- client that could call them directly could ask about any pair it liked.
-- PostgreSQL grants EXECUTE on every new function to PUBLIC as a built-in, so
-- these revokes are load-bearing rather than decorative.

-- `is_request_chat_participant` IS granted to `authenticated`, and must be.
--
-- It appears in the row-security policies above, and a policy expression is
-- evaluated as the CALLER, not as the policy's author. Revoking it produced
-- "permission denied for function is_request_chat_participant" on operations
-- that had nothing to do with chat -- deleting a dispute-evidence object, for
-- instance, because that storage policy transitively touches these tables.
-- `202607200013_booking_chat.sql` grants `is_booking_chat_participant` for
-- exactly the same reason.
--
-- Granting it leaks nothing. It answers only about the CALLER's own
-- relationships: a customer learns whether a worker has quoted on their own
-- request, which their quote list already tells them, and a worker learns
-- whether they themselves have quoted. Every other pair returns false.
grant execute on function private.is_request_chat_participant(uuid, uuid) to authenticated;
revoke all on function private.is_request_chat_participant(uuid, uuid) from public, anon;

-- These two are only ever called from inside SECURITY DEFINER functions, which
-- run as the owner, so no client needs to reach them.
revoke all on function private.request_chat_accepts_messages(uuid, uuid) from public, anon, authenticated;
revoke all on function private.promote_request_conversation() from public, anon, authenticated;

revoke all on function public.open_request_conversation(uuid, uuid) from public, anon;
grant execute on function public.open_request_conversation(uuid, uuid) to authenticated;
revoke all on function public.send_request_message(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.send_request_message(uuid, uuid, text, uuid) to authenticated;
revoke all on function public.get_request_conversation(uuid, uuid, integer) from public, anon;
grant execute on function public.get_request_conversation(uuid, uuid, integer) to authenticated;
