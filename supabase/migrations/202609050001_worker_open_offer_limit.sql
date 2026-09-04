-- How many requests a worker may be waiting on at once.
--
-- ## The rule
--
-- A worker may hold at most N OPEN OFFERS. The initial value is 10. It is not
-- written in ten places; it is written in `app_settings` under
-- `marketplace.worker_open_offer_limit`, read through one function, and every
-- surface that needs the number asks for it. Changing the policy is a settings
-- update, not a release.
--
-- ## What "open" means, exactly
--
-- An offer consumes capacity while it could still become a job, and stops the
-- moment it could not. Concretely, a quote counts when ALL of these hold:
--
--   * its status is 'submitted' or 'revised' -- the two states in which the
--     customer could still choose it;
--   * the quote itself has not expired;
--   * the request is still one somebody is deciding about -- 'matching',
--     'collecting_quotes', 'customer_reviewing' or 'rescue_matching';
--   * the request has not expired.
--
-- Everything else is already decided and therefore free:
--
--   'withdrawn'                      the worker took it back
--   'rejected'                       the customer said no
--   'expired'                        nobody decided in time
--   'invalidated_by_request_change'  the request was cancelled or rewritten
--   'selected'                       THE WORKER WON.
--
-- That last one deserves its own sentence, because it is the only judgement
-- call in the list. A selected quote is not an open offer: the offer has been
-- accepted and what remains is a job. Counting it would mean a worker who won
-- ten jobs could never bid again, which inverts the purpose of the limit --
-- this exists to stop a worker carpet-bidding forty requests they cannot
-- service, not to cap their success. Active-job capacity is a different problem
-- with a different answer, and `private.worker_capacity_conflicts` already owns
-- it. This migration does not touch it.
--
-- ## Concurrency
--
-- Counting rows and then inserting one is a phantom-read waiting to happen: two
-- concurrent submissions by a worker at 9/10 both count 9, both pass, and the
-- worker ends at 11. Row locks do not help, because the rows that would break
-- the rule are the ones that do not exist yet.
--
-- So the check takes a transaction-scoped advisory lock keyed on the provider,
-- which is the repository's established pattern for exactly this shape --
-- `202607300001_payments_earnings_ledger.sql` locks on `'withdrawal:'||provider`
-- for the same reason, and `202607310001_repository_alignment.sql` locks on a
-- provider/date/time tuple to stop double-booking. Two submissions by the same
-- worker serialise; two submissions by different workers do not contend at all,
-- because the key includes the provider id.
--
-- ## The error
--
-- `WQ001` in the `WQ` class, raised with a stable message. The client maps the
-- code, never the message, and never shows either verbatim.

-- ---------------------------------------------------------------------------
-- 1. The policy, and one place to read it
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value, description)
values (
  'marketplace.worker_open_offer_limit',
  '10'::jsonb,
  'Maximum concurrent open marketplace offers (submitted or revised quotes on live requests) a single worker may hold.'
)
on conflict (key) do nothing;

-- SECURITY DEFINER because `app_settings` is readable only by staff and the
-- callers are ordinary workers. It returns one integer from one known key and
-- cannot be asked for anything else, so it leaks no part of that table.
create or replace function private.marketplace_policy_integer(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(s.value #>> '{}', '')::integer
     from public.app_settings s
     where s.key = p_key
       and pg_catalog.jsonb_typeof(s.value) = 'number'),
    p_default)
$$;

create or replace function private.worker_open_offer_limit()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- The default is the policy, not a fallback nobody meant: a database whose
  -- settings row was never inserted still enforces 10 rather than enforcing
  -- nothing, which is the safe direction for a limit to fail in.
  select greatest(1, private.marketplace_policy_integer('marketplace.worker_open_offer_limit', 10))
$$;

-- ---------------------------------------------------------------------------
-- 2. The count
-- ---------------------------------------------------------------------------
-- One definition of "open", used by the enforcement inside `submit_worker_quote`
-- and by the capacity the worker's screen displays. If those two ever disagreed,
-- a worker would be told 7 of 10 and refused at 8, and would be right to think
-- the product was broken.

create or replace function private.worker_open_offer_count(p_provider_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::integer
  from public.worker_quotes q
  join public.marketplace_requests r on r.id = q.request_id
  where q.provider_id = p_provider_id
    and q.status in ('submitted', 'revised')
    and q.expires_at > pg_catalog.now()
    and r.status in ('matching', 'collecting_quotes', 'customer_reviewing', 'rescue_matching')
    and r.expires_at > pg_catalog.now()
$$;

-- The join above is `provider_id` + `status` on one side and a primary key on
-- the other. `worker_quotes` has no index that serves it, so at ten thousand
-- quotes this became a sequential scan inside the submission path.
create index if not exists worker_quotes_provider_open_idx
  on public.worker_quotes (provider_id, request_id)
  where status in ('submitted', 'revised');

-- ---------------------------------------------------------------------------
-- 3. What the worker's screen asks
-- ---------------------------------------------------------------------------
-- Returns the caller's own capacity and nobody else's. There is no provider
-- parameter on purpose: a function that takes an id is a function that can be
-- asked about a competitor, and "how many jobs is that worker bidding on" is
-- not a question Warsha answers.
--
-- A signed-in account with no provider profile gets a null `limit`, which the
-- clients read as "capacity does not apply to me". It is not an error: a
-- customer opening a worker screen by accident should see nothing, not a
-- failure.

create or replace function public.get_worker_open_offer_capacity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid()); provider uuid; used integer; cap integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select id into provider from public.provider_profiles where user_id = uid and deleted_at is null;
  if provider is null then
    return pg_catalog.jsonb_build_object(
      'applies', false, 'providerId', null, 'used', 0, 'limit', null, 'remaining', null);
  end if;
  cap := private.worker_open_offer_limit();
  used := private.worker_open_offer_count(provider);
  return pg_catalog.jsonb_build_object(
    'applies', true,
    -- The caller's OWN provider id, which they can already derive from their own
    -- quotes. It is here so a client can filter its realtime channel to itself
    -- rather than binding an unfiltered table and sorting events out afterwards.
    -- No parameter accepts an id, so this can never be somebody else's.
    'providerId', provider,
    'used', used,
    'limit', cap,
    -- Never negative. A worker whose limit was lowered below their current
    -- count is at capacity, not at "-3 remaining".
    'remaining', greatest(0, cap - used));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Enforcement
-- ---------------------------------------------------------------------------
-- `submit_worker_quote`, reproduced with two additions and no other change: the
-- advisory lock, and the capacity check. Everything else -- the idempotency
-- short-circuit, the invitation and request locks, the actionability
-- conditions, the notification and the event -- is byte-identical to the
-- version this replaces.
--
-- THE BASE IS `202608310007_not_found_is_not_a_server_error.sql`, NOT THE
-- ORIGINAL IN `202607310003`. That distinction cost a test failure before it
-- was noticed: the original raises `P0002` for a missing invitation, which
-- PostgREST answers as HTTP 500, and 202608310007 exists precisely to have
-- changed all fifty-seven of those to `PT404`. Re-creating a function from the
-- migration that first wrote it silently reverts every fix applied since.
-- `api-session-safety.test.sql` caught it, which is the entire reason that
-- assertion is written as a property over the whole schema rather than as a
-- list of known functions.
--
-- The order matters. Idempotency is resolved FIRST, before the lock and before
-- the count: a retry of a submission that already succeeded must return the
-- same quote id, and must not be refused for capacity that the retry's own
-- original submission is occupying.

create or replace function public.submit_worker_quote(p_invitation_id uuid, p_quote jsonb, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare uid uuid := (select auth.uid()); provider_id uuid; invitation public.quote_invitations;
  request_row public.marketplace_requests; terms jsonb; quote_id uuid; existing_id uuid;
  open_offers integer; offer_limit integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_idempotency_key is null or pg_catalog.length(p_idempotency_key) not between 16 and 200 then raise exception 'Invalid quote request' using errcode='22023'; end if;
  select id into provider_id from public.provider_profiles where user_id=uid and deleted_at is null;
  select q.id into existing_id from public.worker_quotes q where q.provider_id=provider_id and q.idempotency_key=p_idempotency_key;
  if existing_id is not null then return existing_id; end if;

  -- Serialise this worker's concurrent submissions against each other. Held
  -- until the transaction ends, so the count below cannot be invalidated by a
  -- sibling transaction between the count and the insert. Keyed on the
  -- provider, so two different workers never wait on one another.
  if provider_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('worker_open_offers:' || provider_id::text, 0));
  end if;

  select * into invitation from public.quote_invitations i where i.id=p_invitation_id and i.provider_id=provider_id for update;
  if invitation.id is null then raise exception 'Invitation not found' using errcode='PT404'; end if;
  select * into request_row from public.marketplace_requests where id=invitation.request_id for update;
  if request_row.flow_kind='emergency' or invitation.status not in ('invited','viewed')
    or request_row.status not in ('matching','collecting_quotes','customer_reviewing','rescue_matching')
    or request_row.expires_at<=pg_catalog.now() or invitation.expires_at<=pg_catalog.now()
    or not private.is_provider_publicly_discoverable(provider_id)
  then raise exception 'Invitation is no longer actionable' using errcode='22023'; end if;

  -- Capacity. Checked after actionability, so a worker at the limit who tries
  -- to quote a dead request is told the request is dead -- which is the more
  -- useful of the two facts, and the one they can act on.
  offer_limit := private.worker_open_offer_limit();
  open_offers := private.worker_open_offer_count(provider_id);
  if open_offers >= offer_limit then
    raise exception 'worker_open_offer_limit_reached' using errcode='WQ001',
      detail=pg_catalog.jsonb_build_object('used', open_offers, 'limit', offer_limit)::text;
  end if;

  terms := private.validate_worker_quote(provider_id,request_row.id,p_quote);
  insert into public.worker_quotes(
    request_id,invitation_id,provider_id,status,current_revision,price_minor,proposed_start_at,eta_minutes,
    estimated_duration_minutes,message,labor_included,materials_inclusion,materials_explanation,warranty_days,
    supported_payment_methods,expires_at,idempotency_key
  ) values (
    request_row.id,p_invitation_id,provider_id,'submitted',1,(terms->>'priceMinor')::bigint,
    nullif(terms->>'proposedStartAt','')::timestamptz,nullif(terms->>'etaMinutes','')::integer,
    (terms->>'estimatedDurationMinutes')::integer,terms->>'message',(terms->>'laborIncluded')::boolean,
    terms->>'materialsInclusion',terms->>'materialsExplanation',nullif(terms->>'warrantyDays','')::integer,
    array(select jsonb_array_elements_text(terms->'supportedPaymentMethods')),request_row.expires_at,p_idempotency_key
  ) returning id into quote_id;
  insert into public.worker_quote_revisions(quote_id,revision,terms,actor_id,idempotency_key)
  values(quote_id,1,terms,uid,p_idempotency_key||':revision');
  update public.quote_invitations set status='quoted',responded_at=pg_catalog.now() where id=p_invitation_id;
  update public.marketplace_requests set status=case when pg_catalog.now()>=collection_not_before then 'customer_reviewing' else status end where id=request_row.id;
  perform private.marketplace_notify(request_row.customer_id,'quote_received','New quote','A worker sent a quote.',
    pg_catalog.jsonb_build_object('requestId',request_row.id,'quoteId',quote_id),'quote-received:'||quote_id::text);
  perform private.marketplace_record_event('worker',uid,'quote',quote_id,'quote_submitted','{}',p_idempotency_key||':submitted');
  return quote_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges
-- ---------------------------------------------------------------------------
-- The `private` helpers are reachable by nobody: they run inside SECURITY
-- DEFINER functions that already own the authorization decision, and a client
-- that could call `worker_open_offer_count` directly could ask it about any
-- provider id it liked.
--
-- PostgreSQL grants EXECUTE on every new function to PUBLIC as a built-in and
-- merges that with default privileges rather than being overridden by them, so
-- the revoke below is not decoration -- without it `get_worker_open_offer_capacity`
-- is anon-callable the moment it exists. `client-role-authority.test.sql`
-- asserts the anon-executable set by name and would fail on the commit that
-- forgot this.

revoke all on function private.marketplace_policy_integer(text, integer) from public, anon, authenticated;
revoke all on function private.worker_open_offer_limit() from public, anon, authenticated;
revoke all on function private.worker_open_offer_count(uuid) from public, anon, authenticated;

revoke all on function public.get_worker_open_offer_capacity() from public, anon;
grant execute on function public.get_worker_open_offer_capacity() to authenticated;

revoke all on function public.submit_worker_quote(uuid, jsonb, text) from public, anon;
grant execute on function public.submit_worker_quote(uuid, jsonb, text) to authenticated;
