-- Calling the other person, without publishing anyone's telephone number.
--
-- ## The problem
--
-- Warsha had no way for a customer and their worker to speak. Chat exists;
-- a phone call does not, and for a plumber standing outside a building looking
-- for the right entrance, chat is the wrong tool.
--
-- The naive fix is to put the phone number in the booking payload. That would
-- publish it: a booking payload is read by list screens, cached, logged, and
-- carried into every future feature that touches a booking. A telephone number
-- that reaches a client once has been given away permanently.
--
-- ## What exists already, and is preserved
--
-- `public.profiles.phone` is readable at the column level by `authenticated`,
-- and `profiles_own_select` restricts the rows to `id = auth.uid()`. So today
-- no account can read another account's number, and nothing here changes that.
-- The number is not being unlocked; a single narrow question is being answered.
--
-- ## The question this function answers
--
-- "I am a participant in this specific booking, which is currently live. What
-- is the one number I need to reach the other participant?"
--
-- Not "what is user X's phone number". There is no user parameter, so there is
-- no lookup to abuse: the caller names a booking they are part of, and the
-- function decides who the other party is. A caller who is not a participant
-- cannot ask about it at all.
--
-- ## Why it fails the way it does
--
-- A booking that does not exist and a booking the caller has nothing to do with
-- produce the SAME refusal, with the same code and the same message. Making
-- them distinguishable would turn this into an oracle for "does this booking id
-- exist", which is exactly the enumeration primitive an attacker wants.
--
-- A booking the caller IS part of, in a state where calling is not appropriate,
-- gets its own error -- there is nothing to protect from somebody who is
-- already a participant, and "not right now" is more useful than "no".
--
-- ## When calling is appropriate
--
-- While there is a live job between two people. From the moment the booking
-- exists until it ends, and no later:
--
--   pending_provider_approval, accepted, rescheduling_requested, confirmed,
--   provider_on_the_way, provider_arrived, job_started,
--   awaiting_quote_approval, work_in_progress, awaiting_customer_confirmation
--
-- Deliberately excluded, each for its own reason:
--
--   draft                 there is no relationship yet
--   rejected, cancelled   there is no longer one
--   completed, refunded   the work is over; a completed job is not a standing
--                         licence to telephone somebody, and support and
--                         reviews are the routes that remain
--   no_show               one party did not turn up, which is a case for
--                         support rather than a phone call
--   disputed              contact belongs in the dispute record where it can be
--                         seen, not in a private call
--
-- Before a booking exists there is nothing here at all. A worker who has quoted
-- on a request can chat; they cannot obtain a telephone number, because a quote
-- is not yet a relationship and forty workers quoting a request must not each
-- come away with the customer's number.

create or replace function public.get_booking_counterparty_contact(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  uid uuid := (select auth.uid());
  booking_row public.bookings;
  worker_uid uuid;
  caller_role text;
  counterparty_uid uuid;
  counterparty_name text;
  counterparty_phone text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;

  select * into booking_row from public.bookings b where b.id = p_booking_id;
  select p.user_id into worker_uid
  from public.provider_profiles p where p.id = booking_row.provider_id;

  -- One refusal for "no such booking" and for "not yours". Two different
  -- answers here would confirm the existence of any booking id somebody cared
  -- to try.
  if booking_row.id is null then
    raise exception 'Booking not found' using errcode='PT404';
  end if;
  if uid = booking_row.customer_id then caller_role := 'customer';
  elsif uid = worker_uid then caller_role := 'worker';
  else raise exception 'Booking not found' using errcode='PT404';
  end if;

  if booking_row.status not in (
    'pending_provider_approval', 'accepted', 'rescheduling_requested', 'confirmed',
    'provider_on_the_way', 'provider_arrived', 'job_started',
    'awaiting_quote_approval', 'work_in_progress', 'awaiting_customer_confirmation'
  ) then
    raise exception 'booking_contact_unavailable' using errcode='WC001',
      detail = pg_catalog.jsonb_build_object('status', booking_row.status)::text;
  end if;

  if caller_role = 'customer' then
    counterparty_uid := worker_uid;
    select p.display_name into counterparty_name
    from public.provider_profiles p where p.id = booking_row.provider_id;
  else
    counterparty_uid := booking_row.customer_id;
    select pr.display_name into counterparty_name
    from public.profiles pr where pr.id = booking_row.customer_id;
  end if;

  counterparty_phone := private.account_contact_phone(counterparty_uid);

  -- A missing number is a normal outcome, not a failure. A worker registers by
  -- phone and always has one; a customer registers by email and may not. The
  -- client renders a call action only when there is something to call.
  return pg_catalog.jsonb_build_object(
    'bookingId', booking_row.id,
    'callerRole', caller_role,
    'counterpartyRole', case when caller_role = 'customer' then 'worker' else 'customer' end,
    'displayName', coalesce(counterparty_name, ''),
    'phone', counterparty_phone,
    'callable', counterparty_phone is not null
  );
end;
$$;

-- The minimum that makes the call action correct without asking for the number.
--
-- A booking screen has to decide whether to draw a Call control before anybody
-- presses anything. Asking `get_booking_counterparty_contact` to find out would
-- mean fetching a telephone number on every render of every booking, which is
-- precisely the habit this design exists to avoid. This answers the question
-- the screen actually has -- "would a call be allowed here?" -- and returns no
-- contact data at all.
create or replace function public.booking_contact_is_available(p_booking_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); booking_row public.bookings; worker_uid uuid;
begin
  if uid is null then return false; end if;
  select * into booking_row from public.bookings b where b.id = p_booking_id;
  if booking_row.id is null then return false; end if;
  select p.user_id into worker_uid from public.provider_profiles p where p.id = booking_row.provider_id;
  if uid <> booking_row.customer_id and uid is distinct from worker_uid then return false; end if;
  return booking_row.status in (
    'pending_provider_approval', 'accepted', 'rescheduling_requested', 'confirmed',
    'provider_on_the_way', 'provider_arrived', 'job_started',
    'awaiting_quote_approval', 'work_in_progress', 'awaiting_customer_confirmation'
  );
end;
$$;

-- PostgreSQL grants EXECUTE on every new function to PUBLIC as a built-in and
-- merges that with default privileges rather than being overridden by them, so
-- these revokes are load-bearing: without them both functions are anon-callable
-- the moment they exist. `client-role-authority.test.sql` asserts the
-- anon-executable set by name and would fail on the commit that forgot.
revoke all on function public.get_booking_counterparty_contact(uuid) from public, anon;
grant execute on function public.get_booking_counterparty_contact(uuid) to authenticated;
revoke all on function public.booking_contact_is_available(uuid) from public, anon;
grant execute on function public.booking_contact_is_available(uuid) to authenticated;
