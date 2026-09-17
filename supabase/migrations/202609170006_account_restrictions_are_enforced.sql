-- An account restriction restricts the account.
--
-- WPS-016 records what staff decided in `public.trust_account_state` and built
-- `private.trust_state_allows` to turn it into a yes or no. Until 202609170003
-- nothing called it; that migration made hidden, removed, suspended and banned
-- Professionals undiscoverable. Everything else a restriction is meant to stop
-- was still possible: a suspended Professional could quote, a banned Customer
-- could book and message, a review-restricted account could review.
--
-- The owner's canonical behaviour, 2026-09-17:
--
--   HIDDEN      not found, not invited, no new direct work. Existing jobs, their
--               conversation, the account itself, support and privacy continue.
--   SUSPENDED   no new marketplace participation, quotes, bookings or new
--               conversations. Existing active jobs may still be resolved and
--               talked about; nothing a Customer depends on is stranded.
--   REMOVED /   no discovery, no new marketplace action, no user-to-user
--   BANNED      contact, no reviews. Only status, support and appeal, privacy,
--               export and deletion, legal documents and history remain.
--               Leaving a job — cancelling, declining or disputing it, or a
--               Customer confirming it is done — stays possible, so nobody on
--               the other side is stranded.
--
-- ## How
--
-- `private.account_restriction(user)` reads the actual trust state and auth ban
-- and names which of those applies, most severe first. `private.account_may(user,
-- capability)` answers the questions the product asks. Enforcement sits on the
-- tables that record new activity — requests, quotes, bookings, conversations,
-- messages, reviews, review replies, helpfulness votes — as row triggers that
-- act only when an end user is the actor (`auth.uid()` present). Every current
-- writer is covered without restating dozens of RPC bodies, and so is any future
-- one. System work — the job drain, rescue copies, staff tools — is not an end
-- user acting and is unaffected.
--
-- `communication_restricted` stops new contact and pre-booking chat but not the
-- conversation of an active job; `review_restricted` stops reviewing. Neither is
-- a vague "restricted" switch: each maps to the capability its name describes.
--
-- ## Payments
--
-- Warsha is cash-only. `payment_hold` and `withdrawal_hold` describe holding
-- money Warsha does not process. New holds are refused, and the account status
-- no longer reports them to the person, rather than implying a payout exists.
-- Nothing historical is erased.

-- ---------------------------------------------------------------------------
-- 1. What applies to this account
-- ---------------------------------------------------------------------------
create or replace function private.account_restriction(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when u.banned_until is not null and u.banned_until > pg_catalog.now() then 'removed'
      when s.user_id is null then 'none'
      when s.trust_level = 'banned' then 'removed'
      -- An expired restriction is lifted, as trust_state_allows defines it.
      when s.restriction_expires_at is not null and s.restriction_expires_at <= pg_catalog.now() then 'none'
      when s.marketplace_removed then 'removed'
      when s.trust_level = 'suspended' then 'suspended'
      when s.profile_hidden then 'hidden'
      else 'none'
    end
    from auth.users u
    left join public.trust_account_state s on s.user_id = u.id
    where u.id = p_user_id), 'none')
$$;

create or replace function private.account_may(p_user_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_restriction text := private.account_restriction(p_user_id);
  v_state public.trust_account_state;
  v_active boolean;
begin
  select * into v_state from public.trust_account_state s where s.user_id = p_user_id;
  v_active := v_state.user_id is not null
    and (v_state.restriction_expires_at is null or v_state.restriction_expires_at > pg_catalog.now());

  return case p_capability
    -- Appearing to Customers and to the matcher.
    when 'be_found' then v_restriction = 'none'
    -- Starting marketplace activity as a Customer: requests, bookings, choosing
    -- a quote. Hidden is about a Professional's profile, not this.
    when 'new_marketplace' then v_restriction in ('none', 'hidden')
    -- Taking on new work as a Professional: quotes, emergencies, direct jobs.
    when 'new_professional_work' then v_restriction = 'none'
    -- Contact that does not belong to an active job.
    when 'new_contact' then v_restriction in ('none', 'hidden')
      and not (v_active and coalesce(v_state.communication_restricted, false))
    -- Talking about a job already under way. The caller checks the job is live.
    when 'job_contact' then v_restriction in ('none', 'hidden', 'suspended')
    -- Writing, editing or replying to reviews, and voting on them.
    when 'review' then v_restriction in ('none', 'hidden')
      and not (v_active and coalesce(v_state.review_restricted, false))
    -- Moving an existing job forward, rather than leaving it.
    when 'job_progress' then v_restriction in ('none', 'hidden', 'suspended')
    else null
  end;
end;
$$;

revoke all on function private.account_restriction(uuid) from public, anon, authenticated;
revoke all on function private.account_may(uuid, text) from public, anon, authenticated;

-- A booking whose job is still under way: what an active conversation is about.
create or replace function private.booking_is_live(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('pending_provider_approval', 'accepted', 'rescheduling_requested', 'confirmed',
    'provider_on_the_way', 'provider_arrived', 'job_started', 'awaiting_quote_approval',
    'work_in_progress', 'awaiting_customer_confirmation', 'disputed')
$$;

create or replace function private.provider_user(p_provider_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id from public.provider_profiles p where p.id = p_provider_id
$$;
revoke all on function private.provider_user(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Enforcement where new activity is recorded
-- ---------------------------------------------------------------------------
-- Two refusals, deliberately different, each a stable token with its own
-- SQLSTATE so a client can tell them from any other permission failure (the
-- convention of WQ001, WM001 and WC001):
--
--   WR001 account_restricted       the person acting may not do this. Their
--                                  own status says why and how to appeal.
--   WR002 counterparty_unavailable the other person cannot take part — a
--                                  Professional who cannot take the work, a
--                                  Customer who can no longer book. Nobody
--                                  learns why.

create or replace function private.enforce_request_restrictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_provider_user uuid;
begin
  if v_actor is null then return new; end if;

  if tg_op = 'INSERT' then
    if not private.account_may(new.customer_id, 'new_marketplace') then
      raise exception 'account_restricted' using errcode = 'WR001';
    end if;
    if new.targeted_provider_id is not null
       and not private.account_may(private.provider_user(new.targeted_provider_id), 'be_found') then
      raise exception 'counterparty_unavailable' using errcode = 'WR002';
    end if;
  elsif new.selected_quote_id is not null
        and new.selected_quote_id is distinct from old.selected_quote_id
        and v_actor = new.customer_id then
    if not private.account_may(new.customer_id, 'new_marketplace') then
      raise exception 'account_restricted' using errcode = 'WR001';
    end if;
    select private.provider_user(q.provider_id) into v_provider_user
    from public.worker_quotes q where q.id = new.selected_quote_id;
    if not private.account_may(v_provider_user, 'new_professional_work') then
      raise exception 'counterparty_unavailable' using errcode = 'WR002';
    end if;
  end if;
  return new;
end;
$$;

create trigger marketplace_requests_enforce_restrictions
  before insert or update of selected_quote_id on public.marketplace_requests
  for each row execute function private.enforce_request_restrictions();

create or replace function private.enforce_quote_restrictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_provider_user uuid;
begin
  if v_actor is null then return new; end if;
  if tg_table_name = 'worker_quotes' then
    v_provider_user := private.provider_user(new.provider_id);
  else
    select private.provider_user(q.provider_id) into v_provider_user
    from public.worker_quotes q where q.id = (pg_catalog.to_jsonb(new) ->> 'quote_id')::uuid;
  end if;
  -- Only the Professional acting on their own quote. A rescue copying quotes
  -- runs as someone else and is the matcher's concern, not this one.
  if v_actor = v_provider_user and not private.account_may(v_actor, 'new_professional_work') then
    raise exception 'account_restricted' using errcode = 'WR001';
  end if;
  return new;
end;
$$;

create trigger worker_quotes_enforce_restrictions
  before insert on public.worker_quotes
  for each row execute function private.enforce_quote_restrictions();
create trigger worker_quote_revisions_enforce_restrictions
  before insert on public.worker_quote_revisions
  for each row execute function private.enforce_quote_restrictions();

create or replace function private.enforce_booking_restrictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_provider_user uuid := private.provider_user(new.provider_id);
begin
  if v_actor is null then return new; end if;

  if tg_op = 'INSERT' then
    if v_actor = new.customer_id then
      if not private.account_may(new.customer_id, 'new_marketplace') then
        raise exception 'account_restricted' using errcode = 'WR001';
      end if;
      if not private.account_may(v_provider_user, 'new_professional_work') then
        raise exception 'counterparty_unavailable' using errcode = 'WR002';
      end if;
    elsif v_actor = v_provider_user then
      if not private.account_may(v_provider_user, 'new_professional_work') then
        raise exception 'account_restricted' using errcode = 'WR001';
      end if;
      if not private.account_may(new.customer_id, 'new_marketplace') then
        raise exception 'counterparty_unavailable' using errcode = 'WR002';
      end if;
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then return new; end if;
  if v_actor <> new.customer_id and v_actor is distinct from v_provider_user then return new; end if;

  -- Leaving a job is always possible, whatever the restriction: cancelling it,
  -- declining it, disputing it. So is a Customer confirming the work is done,
  -- which closes the job rather than starting anything. Refusing any of these
  -- would strand the other person, not restrict this one.
  if new.status in ('cancelled', 'rejected', 'disputed') then return new; end if;
  if new.status = 'completed' and v_actor = new.customer_id then return new; end if;

  -- A Professional accepting a job they were offered is new work.
  if v_actor = v_provider_user and old.status = 'pending_provider_approval' then
    if not private.account_may(v_actor, 'new_professional_work') then
      raise exception 'account_restricted' using errcode = 'WR001';
    end if;
    return new;
  end if;

  if not private.account_may(v_actor, 'job_progress') then
    raise exception 'account_restricted' using errcode = 'WR001';
  end if;
  return new;
end;
$$;

create trigger bookings_enforce_restrictions
  before insert or update of status on public.bookings
  for each row execute function private.enforce_booking_restrictions();

create or replace function private.enforce_conversation_restrictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- A booking's conversation belongs to the booking: it is written when the
  -- booking changes, including when a restricted person cancels, to carry the
  -- system note. Nothing is said by creating it, and every message in it is
  -- checked below, so only a new pre-booking thread is contact in itself.
  if v_actor is null or new.booking_id is not null then return new; end if;
  if not private.account_may(v_actor, 'new_contact') then
    raise exception 'account_restricted' using errcode = 'WR001';
  end if;
  return new;
end;
$$;

create trigger conversations_enforce_restrictions
  before insert on public.conversations
  for each row execute function private.enforce_conversation_restrictions();

create or replace function private.enforce_message_restrictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_booking uuid;
  v_booking_status text;
begin
  if v_actor is null or new.sender_id is distinct from v_actor then return new; end if;
  select c.booking_id into v_booking from public.conversations c where c.id = new.conversation_id;
  v_booking := coalesce(new.booking_id, v_booking);
  if v_booking is null then
    -- Pre-booking conversation about a request: new contact.
    if not private.account_may(v_actor, 'new_contact') then
      raise exception 'account_restricted' using errcode = 'WR001';
    end if;
  else
    select b.status into v_booking_status from public.bookings b where b.id = v_booking;
    if not private.account_may(v_actor, 'job_contact') then
      raise exception 'account_restricted' using errcode = 'WR001';
    end if;
    if private.account_restriction(v_actor) = 'suspended' and not private.booking_is_live(v_booking_status) then
      raise exception 'account_restricted' using errcode = 'WR001';
    end if;
  end if;
  return new;
end;
$$;

create trigger messages_enforce_restrictions
  before insert on public.messages
  for each row execute function private.enforce_message_restrictions();

create or replace function private.enforce_review_restrictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_author uuid;
begin
  if v_actor is null then return new; end if;
  -- One branch per table: a record field is resolved when its statement runs,
  -- and each table has only its own author column.
  if tg_table_name = 'reviews' then
    v_author := new.customer_id;
  elsif tg_table_name = 'review_responses' then
    v_author := private.provider_user(new.provider_id);
  else
    v_author := new.voter_id;
  end if;
  -- Only the author writing. Staff moderation of a review is a separate action
  -- from restricting an account, and is not stopped here.
  if v_actor is distinct from v_author then return new; end if;
  if tg_table_name = 'reviews' and tg_op = 'UPDATE' then
    -- Only the author changing what the review says counts as reviewing.
    if (new.rating, new.comment, new.is_anonymous, new.revision)
         is not distinct from (old.rating, old.comment, old.is_anonymous, old.revision) then
      return new;
    end if;
  end if;
  if not private.account_may(v_actor, 'review') then
    raise exception 'account_restricted' using errcode = 'WR001';
  end if;
  return new;
end;
$$;

create trigger reviews_enforce_restrictions
  before insert or update on public.reviews
  for each row execute function private.enforce_review_restrictions();
create trigger review_responses_enforce_restrictions
  before insert on public.review_responses
  for each row execute function private.enforce_review_restrictions();
create trigger review_helpfulness_votes_enforce_restrictions
  before insert or update on public.review_helpfulness_votes
  for each row execute function private.enforce_review_restrictions();

revoke all on function private.enforce_request_restrictions() from public, anon, authenticated;
revoke all on function private.enforce_quote_restrictions() from public, anon, authenticated;
revoke all on function private.enforce_booking_restrictions() from public, anon, authenticated;
revoke all on function private.enforce_conversation_restrictions() from public, anon, authenticated;
revoke all on function private.enforce_message_restrictions() from public, anon, authenticated;
revoke all on function private.enforce_review_restrictions() from public, anon, authenticated;

-- The request writer turns every failure it does not recognise into "Unable to
-- create marketplace request". A restriction is a failure the person needs to
-- recognise, so it passes through unchanged. Only the list changes.
CREATE OR REPLACE FUNCTION public.create_marketplace_request(p_request jsonb, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare
  uid uuid := (select auth.uid());
  request_id uuid;
  existing_id uuid;
  flow_kind text := coalesce(p_request->>'flowKind','get_quotes');
  category_id text := p_request->>'categoryId';
  service_id uuid := nullif(p_request->>'serviceId','')::uuid;
  target_provider uuid := nullif(p_request->>'targetedProviderId','')::uuid;
  address_id uuid := nullif(p_request->>'addressId','')::uuid;
  schedule_kind text := coalesce(p_request->>'scheduleKind','asap');
  start_at timestamptz := nullif(p_request->>'requestedStartAt','')::timestamptz;
  end_at timestamptz := nullif(p_request->>'requestedEndAt','')::timestamptz;
  address_row record;
  config private.marketplace_configuration;
  approval private.emergency_price_approvals;
  approval_token text := p_request->>'emergencyApprovalToken';
  duration_minutes integer;
  coarse_id text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request is null or pg_catalog.jsonb_typeof(p_request)<>'object'
    or p_idempotency_key is null or pg_catalog.length(p_idempotency_key) not between 16 and 200
  then raise exception 'Invalid marketplace request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text||':'||p_idempotency_key,0));
  select id into existing_id from public.marketplace_requests where customer_id=uid and idempotency_key=p_idempotency_key;
  if existing_id is not null then return existing_id; end if;
  if flow_kind not in ('browse_worker','get_quotes','emergency')
    or (flow_kind='browse_worker' and target_provider is null)
    or (flow_kind<>'browse_worker' and target_provider is not null and flow_kind<>'emergency')
    or schedule_kind not in ('asap','today','scheduled','flexible')
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_request->>'issueDescription',''))) not between 8 and 2000
    or pg_catalog.length(coalesce(p_request->>'notes','')) > 2000
  then raise exception 'Invalid marketplace request' using errcode='22023'; end if;
  config := private.assert_marketplace_ready(category_id);
  if (select pg_catalog.count(*) from public.marketplace_requests r where r.customer_id=uid and r.created_at>pg_catalog.now()-interval '1 hour')
      >= coalesce((config.rate_limits->>'customerCreatesPerHour')::integer,10)
  then raise exception 'Too many marketplace requests' using errcode='P0001'; end if;
  perform public.ensure_customer_profile();
  if not exists(select 1 from public.service_categories c where c.id=category_id and c.is_active and c.deleted_at is null)
    or (service_id is not null and not exists(select 1 from public.services s where s.id=service_id and s.category_id=category_id and s.is_active and s.deleted_at is null))
  then raise exception 'Service unavailable' using errcode='22023'; end if;
  if schedule_kind in ('scheduled','flexible') and (start_at is null or start_at<=pg_catalog.now()) then raise exception 'Choose a future time' using errcode='22023'; end if;
  if schedule_kind='flexible' and (end_at is null or end_at<=start_at) then raise exception 'Choose a valid flexible window' using errcode='22023'; end if;
  if schedule_kind not in ('scheduled','flexible') then end_at:=null; end if;
  select a.*,pg_catalog.concat_ws(', ',a.building,coalesce(nullif(a.street,''),nullif(a.address_line,'')),a.district,a.governorate) as snapshot
  into address_row from public.addresses a where a.id=address_id and a.customer_id=uid and a.deleted_at is null;
  if address_row.id is null then raise exception 'Address not found' using errcode='42501'; end if;
  if address_row.latitude is null or address_row.longitude is null then raise exception 'Verified request location required' using errcode='55000'; end if;
  select d.estimated_duration_minutes into duration_minutes
  from private.marketplace_category_duration_defaults d where d.category_id=category_id;
  coarse_id := pg_catalog.lower(pg_catalog.regexp_replace(address_row.governorate||':'||coalesce(address_row.district,''),'[^a-zA-Z0-9:]+','-','g'));

  if flow_kind='emergency' then
    select * into approval from private.emergency_price_approvals a
    where a.customer_id=uid and a.token=approval_token for update;
    if approval.id is null or approval.consumed_at is not null or approval.expires_at<=pg_catalog.now()
      or approval.category_id<>category_id or approval.service_id is distinct from service_id
      or approval.provider_id is distinct from target_provider or approval.pricing_version<>config.policy_version
    then raise exception 'Emergency surcharge approval required' using errcode='22023'; end if;
  end if;

  insert into public.marketplace_requests(
    customer_id,flow_kind,status,category_id,service_id,targeted_provider_id,
    issue_description,notes,complexity,schedule_kind,requested_start_at,requested_end_at,
    estimated_duration_minutes,payment_compatibility,approximate_governorate,approximate_district,
    coarse_area_id,edit_deadline_at,collection_not_before,expires_at,
    approved_emergency_surcharge_minor,emergency_approval_version,idempotency_key
  ) values (
    uid,flow_kind,'matching',category_id,service_id,target_provider,
    pg_catalog.btrim(p_request->>'issueDescription'),coalesce(p_request->>'notes',''),nullif(p_request->>'complexity',''),
    schedule_kind,start_at,end_at,duration_minutes,coalesce(p_request->>'paymentCompatibility','either'),
    address_row.governorate,coalesce(address_row.district,''),coarse_id,
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.edit_window_seconds),
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.initial_collection_seconds),
    pg_catalog.now()+pg_catalog.make_interval(secs=>config.request_lifetime_seconds),
    case when flow_kind='emergency' then approval.surcharge_minor end,
    case when flow_kind='emergency' then approval.pricing_version end,
    p_idempotency_key
  ) returning id into request_id;
  insert into private.marketplace_request_locations(request_id,address_id,exact_address_snapshot,latitude,longitude,source,verification_state)
  values(request_id,address_id,address_row.snapshot,address_row.latitude,address_row.longitude,'customer_address','verified');
  insert into public.marketplace_request_revisions(request_id,revision,classification,change_set,created_by,idempotency_key)
  values(request_id,1,'initial',p_request,uid,p_idempotency_key||':revision');
  if flow_kind='emergency' then update private.emergency_price_approvals set consumed_at=pg_catalog.now() where id=approval.id; end if;
  insert into private.marketplace_jobs(job_kind,request_id,run_at,dedupe_key)
  values('expire_request',request_id,(select expires_at from public.marketplace_requests where id=request_id),'expire:'||request_id::text);
  perform private.marketplace_record_event('customer',uid,'request',request_id,'request_created',
    pg_catalog.jsonb_build_object('flowKind',flow_kind,'scheduleKind',schedule_kind),p_idempotency_key||':created');
  perform private.start_marketplace_matching(request_id,'initial');
  return request_id;
exception
  when sqlstate '42501' or sqlstate '22023' or sqlstate '55000' or sqlstate 'P0001'
    or sqlstate 'WR001' or sqlstate 'WR002' then raise;
  when others then raise exception 'Unable to create marketplace request' using errcode='P0001';
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Reads that would offer what cannot be done
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_customer_quotes(p_request_id uuid, p_sort text DEFAULT 'best_value'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(pg_catalog.jsonb_agg(item order by
    case when p_sort='lowest_price' then price_minor end asc,
    case when p_sort='highest_rated' then rating end desc,
    case when p_sort='fastest_arrival' then eta_minutes end asc,
    case when p_sort='most_experienced' then completed_jobs end desc,
    case when p_sort='best_value' then best_value end desc,
    submitted_at,id
  ),'[]'::jsonb)
  from (
    select
      pg_catalog.jsonb_build_object(
        'id',q.id,'status',q.status,'revision',q.current_revision,'providerId',q.provider_id,
        'workerName',p.display_name,'workerRating',p.rating_average,'workerReviewCount',p.review_count,
        'completedJobs',p.completed_jobs,'priceMinor',q.price_minor,'currency',q.currency,
        'proposedStartAt',q.proposed_start_at,'etaMinutes',q.eta_minutes,'estimatedDurationMinutes',q.estimated_duration_minutes,
        'message',q.message,'laborIncluded',q.labor_included,'materialsInclusion',q.materials_inclusion,
        'materialsExplanation',q.materials_explanation,'warrantyDays',q.warranty_days,
        'supportedPaymentMethods',q.supported_payment_methods,'submittedAt',q.submitted_at
      ) as item,
      q.id,q.price_minor,q.eta_minutes,q.submitted_at,p.rating_average as rating,p.completed_jobs,
      (p.rating_average/5*0.55 + least(1::numeric,p.completed_jobs::numeric/100)*0.15
        + greatest(0::numeric,1-q.price_minor::numeric/nullif(max(q.price_minor) over(),0))*0.20
        + greatest(0::numeric,1-coalesce(q.eta_minutes,1440)::numeric/1440)*0.10) as best_value
    from public.worker_quotes q
    join public.provider_profiles p on p.id=q.provider_id
    join public.marketplace_requests r on r.id=q.request_id and r.customer_id=(select auth.uid())
    where q.request_id=p_request_id and q.status in ('submitted','revised','selected')
      -- A quote from a Professional who can no longer take new work cannot be
      -- chosen, so it is not offered. A selected one stays visible.
      and (q.status = 'selected' or private.account_may(p.user_id, 'new_professional_work'))
  ) visible
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_counterparty_contact(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Removed or banned: no user-to-user contact, even about a job.
  if not private.account_may(uid, 'job_contact') then
    raise exception 'booking_contact_unavailable' using errcode='WC001',
      detail = pg_catalog.jsonb_build_object('status', booking_row.status)::text;
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
$function$;

CREATE OR REPLACE FUNCTION public.booking_contact_is_available(p_booking_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); booking_row public.bookings; worker_uid uuid;
begin
  if uid is null then return false; end if;
  select * into booking_row from public.bookings b where b.id = p_booking_id;
  if booking_row.id is null then return false; end if;
  select p.user_id into worker_uid from public.provider_profiles p where p.id = booking_row.provider_id;
  if uid <> booking_row.customer_id and uid is distinct from worker_uid then return false; end if;
  if not private.account_may(uid, 'job_contact') then return false; end if;
  return booking_row.status in (
    'pending_provider_approval', 'accepted', 'rescheduling_requested', 'confirmed',
    'provider_on_the_way', 'provider_arrived', 'job_started',
    'awaiting_quote_approval', 'work_in_progress', 'awaiting_customer_confirmation'
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. No holds on money Warsha does not handle
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.staff_record_enforcement_action_impl(p_subject_user_id uuid, p_action_type text, p_reason_code text, p_public_reason text, p_evidence_summary text, p_idempotency_key text, p_report_id uuid DEFAULT NULL::uuid, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_existing public.trust_enforcement_actions%rowtype;
  v_report public.trust_reports%rowtype;
  v_id uuid;
  v_level text;
begin
  if v_uid is null or not private.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_evidence_summary,''))) < 3 then
    raise exception 'Evidence is required for every enforcement action' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_public_reason,''))) < 3 then
    raise exception 'A public reason is required' using errcode = '22023';
  end if;

  -- Warsha is cash-only and holds nobody's money. A hold would describe an
  -- action with nothing behind it.
  if p_action_type in ('payment_hold', 'withdrawal_hold') then
    raise exception 'Warsha does not process payments, so there is nothing to hold' using errcode = '55000';
  end if;

  -- A permanent ban is never automatic and never issued without an
  -- investigated report backing it.
  if p_action_type = 'permanent_ban' then
    if p_report_id is null then
      raise exception 'A permanent ban requires an investigated report' using errcode = '22023';
    end if;
    select * into v_report from public.trust_reports r where r.id = p_report_id;
    if v_report.id is null or v_report.status not in ('investigating','actioned') then
      raise exception 'A permanent ban requires a report that was investigated' using errcode = '22023';
    end if;
  end if;

  select * into v_existing
  from public.trust_enforcement_actions a where a.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'duplicate', true);
  end if;

  insert into public.trust_enforcement_actions(
    subject_user_id, action_type, reason_code, public_reason, evidence_summary,
    report_id, actor_id, actor_kind, expires_at, idempotency_key)
  values (p_subject_user_id, p_action_type, p_reason_code, pg_catalog.btrim(p_public_reason),
          pg_catalog.btrim(p_evidence_summary), p_report_id, v_uid, 'staff', p_expires_at, p_idempotency_key)
  returning id into v_id;

  v_level := case p_action_type
    when 'warning' then 'warned'
    when 'temporary_restriction' then 'restricted'
    when 'investigation' then 'under_investigation'
    when 'suspension' then 'suspended'
    when 'permanent_ban' then 'banned'
    when 'restoration' then 'good_standing'
    else null end;

  insert into public.trust_account_state as s (
    user_id, trust_level, marketplace_removed, profile_hidden, payment_hold,
    withdrawal_hold, communication_restricted, review_restricted,
    restriction_expires_at, public_reason, updated_at, updated_by)
  values (
    p_subject_user_id,
    coalesce(v_level,'restricted'),
    p_action_type = 'marketplace_removal',
    p_action_type = 'profile_hidden',
    p_action_type = 'payment_hold',
    p_action_type = 'withdrawal_hold',
    p_action_type = 'communication_restriction',
    p_action_type = 'review_restriction',
    case when p_action_type = 'permanent_ban' then null else p_expires_at end,
    pg_catalog.btrim(p_public_reason), pg_catalog.now(), v_uid)
  on conflict (user_id) do update set
    trust_level = case
      when p_action_type = 'restoration' then 'good_standing'
      when v_level is not null then v_level
      else s.trust_level end,
    marketplace_removed = case when p_action_type = 'restoration' then false
      else s.marketplace_removed or p_action_type = 'marketplace_removal' end,
    profile_hidden = case when p_action_type = 'restoration' then false
      else s.profile_hidden or p_action_type = 'profile_hidden' end,
    payment_hold = case when p_action_type = 'restoration' then false
      else s.payment_hold or p_action_type = 'payment_hold' end,
    withdrawal_hold = case when p_action_type = 'restoration' then false
      else s.withdrawal_hold or p_action_type = 'withdrawal_hold' end,
    communication_restricted = case when p_action_type = 'restoration' then false
      else s.communication_restricted or p_action_type = 'communication_restriction' end,
    review_restricted = case when p_action_type = 'restoration' then false
      else s.review_restricted or p_action_type = 'review_restriction' end,
    restriction_expires_at = case
      when p_action_type = 'restoration' then null
      when p_action_type = 'permanent_ban' then null
      else coalesce(p_expires_at, s.restriction_expires_at) end,
    public_reason = pg_catalog.btrim(p_public_reason),
    updated_at = pg_catalog.now(),
    updated_by = v_uid;

  perform private.record_trust_audit(v_uid, 'trust_enforcement_'||p_action_type,
    'trust_enforcement_action', v_id, pg_catalog.btrim(p_evidence_summary), p_report_id::text);

  return pg_catalog.jsonb_build_object('id', v_id, 'actionType', p_action_type, 'duplicate', false);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. What the person is told
-- ---------------------------------------------------------------------------
-- A restricted person keeps their status, the reason and a way to appeal. The
-- appeal RPC has existed since WPS-016 and needs the action's id, which no read
-- returned, so nobody could appeal. The status now names the restriction as the
-- product enforces it, the most recent action that can be appealed, and the
-- appeal already made against it, if any.
CREATE OR REPLACE FUNCTION public.get_my_trust_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_state public.trust_account_state%rowtype;
  v_action public.trust_enforcement_actions%rowtype;
  v_appeal public.trust_appeals%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_state from public.trust_account_state s where s.user_id = v_uid;
  if v_state.user_id is null then
    return pg_catalog.jsonb_build_object(
      'trustLevel','good_standing','restriction','none','restrictions','{}'::jsonb,
      'canAppeal', false, 'publicReason', null, 'restrictionExpiresAt', null,
      'appealableAction', null, 'appeal', null);
  end if;

  -- Holds are not actions a person can be affected by (section 4), and
  -- restorations and investigations cannot be appealed.
  select * into v_action
  from public.trust_enforcement_actions a
  where a.subject_user_id = v_uid
    and a.action_type not in ('restoration', 'investigation', 'payment_hold', 'withdrawal_hold')
    and not exists (
      select 1 from public.trust_enforcement_actions r
      where r.subject_user_id = v_uid and r.action_type = 'restoration' and r.created_at > a.created_at)
  order by a.created_at desc, a.id desc
  limit 1;
  if v_action.id is not null then
    select * into v_appeal from public.trust_appeals ap
    where ap.enforcement_action_id = v_action.id and ap.appellant_id = v_uid;
  end if;

  return pg_catalog.jsonb_build_object(
    'trustLevel', v_state.trust_level,
    'restriction', private.account_restriction(v_uid),
    'restrictions', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'marketplaceRemoved', nullif(v_state.marketplace_removed,false),
      'profileHidden', nullif(v_state.profile_hidden,false),
      'communicationRestricted', nullif(v_state.communication_restricted,false),
      'reviewRestricted', nullif(v_state.review_restricted,false))),
    'publicReason', v_state.public_reason,
    'restrictionExpiresAt', v_state.restriction_expires_at,
    'appealableAction', case when v_action.id is null then null else pg_catalog.jsonb_build_object(
      'id', v_action.id, 'actionType', v_action.action_type, 'publicReason', v_action.public_reason,
      'createdAt', v_action.created_at, 'expiresAt', v_action.expires_at) end,
    'appeal', case when v_appeal.id is null then null else pg_catalog.jsonb_build_object(
      'id', v_appeal.id, 'status', v_appeal.status, 'decisionNote', v_appeal.decision_note,
      'createdAt', v_appeal.created_at, 'decidedAt', v_appeal.decided_at) end,
    'canAppeal', v_action.id is not null and v_appeal.id is null
      and v_state.trust_level in ('warned','restricted','suspended','banned'));
end;
$function$;

-- The staff account overview stops reporting a payment hold for the same
-- reason: it would tell staff money is held when none is. Rows that recorded
-- one keep it, in the enforcement history.
CREATE OR REPLACE FUNCTION public.get_staff_customer_overview(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid; v_caps text[]; v_profile public.profiles%rowtype; v_contact jsonb := '{}'::jsonb;
begin
  v_actor := private.require_staff_capability('view_safe_customer_profile');
  v_caps := private.staff_capability_keys(v_actor);
  select * into v_profile from public.profiles p where p.id = p_user_id;
  if v_profile.id is null then raise exception 'Account not found' using errcode = 'PT404'; end if;
  if 'view_contact_details' = any(v_caps) then
    v_contact := pg_catalog.jsonb_build_object(
      'phone', v_profile.phone,
      'email', private.account_contact_email(p_user_id));
  end if;
  perform private.staff_log_access(v_actor, 'customer_overview', 'view_safe_customer_profile',
    'account:'||p_user_id::text, 1);
  return pg_catalog.jsonb_build_object(
    'userId', v_profile.id,
    'displayName', v_profile.display_name,
    'preferredLanguage', v_profile.preferred_language,
    'accountStatus', case when v_profile.deleted_at is not null then 'deleted' else 'active' end,
    'createdAt', v_profile.created_at,
    'trustLevel', coalesce((select s.trust_level from public.trust_account_state s where s.user_id = p_user_id),'good_standing'),
    'restrictions', coalesce((select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'marketplaceRemoved', nullif(s.marketplace_removed,false),
        'communicationRestricted', nullif(s.communication_restricted,false),
        'reviewRestricted', nullif(s.review_restricted,false)))
      from public.trust_account_state s where s.user_id = p_user_id), '{}'::jsonb),
    'bookings', pg_catalog.jsonb_build_object(
      'total', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id),
      'completed', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id and b.status = 'completed'),
      'cancelled', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id and b.status = 'cancelled'),
      'active', (select pg_catalog.count(*)::integer from public.bookings b where b.customer_id = p_user_id
                 and b.status not in ('completed','cancelled','rejected','refunded'))),
    'disputesOpened', (select pg_catalog.count(*)::integer from public.disputes d where d.opened_by = p_user_id),
    'reportsFiled', (select pg_catalog.count(*)::integer from public.trust_reports r where r.reporter_id = p_user_id),
    'reportsAgainst', (select pg_catalog.count(*)::integer from public.trust_reports r where r.subject_user_id = p_user_id),
    'supportCases', (select pg_catalog.count(*)::integer from public.support_tickets t where t.requester_id = p_user_id),
    'contact', v_contact,
    'contactVisible', 'view_contact_details' = any(v_caps));
end;
$function$;
