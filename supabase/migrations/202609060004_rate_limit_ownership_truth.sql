-- The rate-limit inventory, checked against what the code actually does.
--
-- ## How this was found
--
-- `private.rate_limit_policies` declares 43 policies and an `enforced_by` column
-- naming who enforces each. Nothing ever compared that claim to the code.
-- Cross referencing the declarations against every `enforce_rate_limit('...')`
-- call in the database found three policies claiming the shared limiter that
-- never called it, and one policy key that was CALLED and never DECLARED.
--
-- Pulling on that last thread found something bigger than a rate limit.
--
-- ## Two entry points, and the client used the broken one
--
-- WPS-023 created `public.submit_my_criminal_record(text, text, bigint, text,
-- date, text, text)`: seven arguments, matching
-- `public.worker_criminal_record_submissions`, validating the declared name and
-- the document reference, and explicitly revoked from `public` and `anon`.
--
-- The next day WPS-024 needed a rate limit on it. Its comment reads:
--
--   "The body is WPS-023's, unchanged, with one call added at the end. Restated
--    in full rather than patched because Postgres has no way to append to a
--    function body, and a second wrapper function would leave two entry points
--    where WPS-023's tests exercise one."
--
-- The intent was right and the result was its opposite. The restatement used an
-- older parameter list from the certificate submitter it had been copied from --
-- five arguments, `p_size_bytes` instead of `p_file_size_bytes` -- so it did not
-- replace WPS-023's function. It created the second entry point the comment set
-- out to avoid, and left the two exactly one letter apart in the client payload.
--
-- The five-argument version could never have worked. It inserts a `size_bytes`
-- column that does not exist on that table, and omits `declared_name`, which is
-- NOT NULL. It also skips the validation WPS-023 added.
--
-- `src/onboarding/onboarding-repository.ts` sends `p_size_bytes`, so PostgREST
-- resolves to that one. Criminal-record submission has therefore been broken for
-- every worker since 2026-08-09, and the error the client got was
-- `Unknown rate limit policy` -- because the key WPS-024 introduced,
-- `worker_certificate_upload`, was never declared either. The limiter refuses an
-- unknown key rather than allowing the call, which is the correct fail-closed
-- choice and is why the outage was total instead of silent.
--
-- Neither overload is reachable by `anon`: 202608280005 revoked both. So this is
-- a broken surface and a duplicated SECURITY DEFINER entry point with weaker
-- validation, not an exposure.
--
-- The stale overload is dropped, and the rate limit moves to the function that
-- actually works -- where WPS-024 meant to put it.
--
-- The client still calls the signature being dropped, so it must be rewired to
-- the seven-argument form. That needs a declared-name input the worker fills in,
-- which is a product change in three languages and is NOT made here.
--
-- ## The unprotected surface
--
-- `support_case_reply` claimed the shared limiter and never called it, so
-- `public.reply_support_case` had no limit of any kind -- no domain rule, no
-- configuration cap, nothing. It writes a message row per call. The declared
-- 60 per hour is now actually applied.
--
-- ## The two that were misfiled
--
-- `identity_extraction_request` and `location_search_request` also claimed the
-- shared limiter without calling it, but they are genuinely enforced -- in the
-- Edge Functions that own those surfaces, before the database is reached. They
-- are refiled as `domain_rule` with the mechanism named, which is what the
-- column is for. Their limits are unchanged; only the claim is now true.
--
-- Nothing here loosens a limit.

-- ---------------------------------------------------------------------------
-- 1. Declare the policy that was called and never existed
-- ---------------------------------------------------------------------------
-- Named for the record it limits rather than the certificate function it was
-- copied from. Five per hour: a criminal record is submitted once and
-- occasionally resubmitted after a rejection, and every call is preceded by an
-- upload into the most sensitive bucket Warsha has.

insert into private.rate_limit_policies
  (policy_key, surface, scope, max_events, window_seconds, enabled, enforced_by, notes)
values
  ('worker_criminal_record_submit', 'worker_vetting', 'account', 5, 3600, true, 'wps018_limiter',
   'Criminal-record submission. Replaces the undeclared worker_certificate_upload key, whose absence made the surface raise Unknown rate limit policy on every call.')
on conflict (policy_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Remove the entry point that could not work
-- ---------------------------------------------------------------------------
-- Dropping rather than repairing: it duplicates a function that already exists
-- and is correct, and repairing it would mean maintaining two SECURITY DEFINER
-- paths into the same table with different validation. Nothing that works
-- regresses, because nothing about it worked.

drop function if exists public.submit_my_criminal_record(text, text, bigint, date, text);

-- ---------------------------------------------------------------------------
-- 3. Put the rate limit where WPS-024 intended it
-- ---------------------------------------------------------------------------
-- Restated from the LIVE definition rather than from the migration that created
-- it, so every correction applied since is carried forward rather than reverted.
-- The only difference is the added call, placed after the authentication check
-- so an unauthenticated caller still gets 'Authentication required' rather than
-- being counted against a limit it could never reach.

CREATE OR REPLACE FUNCTION public.submit_my_criminal_record(p_storage_path text, p_mime_type text, p_file_size_bytes bigint, p_content_hash text, p_issue_date date, p_document_reference text, p_declared_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_provider uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform private.enforce_rate_limit('worker_criminal_record_submit');

  select p.id into v_provider from public.provider_profiles p
   where p.user_id = v_user and p.deleted_at is null;
  if v_provider is null then
    raise exception 'Worker profile not found' using errcode = '42501';
  end if;

  -- The path must sit under the caller's own folder. A path naming another
  -- account is refused here as well as by the storage policy, because two
  -- independent checks is the point.
  if p_storage_path is null
     or pg_catalog.split_part(p_storage_path, '/', 1) <> v_user::text then
    raise exception 'Invalid document path' using errcode = '42501';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/heic', 'application/pdf') then
    raise exception 'Unsupported document format' using errcode = '22023';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes not between 1 and 8388608 then
    raise exception 'Document is too large' using errcode = '22023';
  end if;
  if p_issue_date is null or p_issue_date > current_date then
    raise exception 'Invalid issue date' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_declared_name, ''))) not between 2 and 120 then
    raise exception 'Invalid declared name' using errcode = '22023';
  end if;

  -- Superseding, not deleting. A prior submission is evidence a reviewer may
  -- need, and WPS-022 retention decides when it goes.
  update public.worker_criminal_record_submissions
  set is_current = false, updated_at = pg_catalog.now()
  where provider_id = v_provider and is_current;

  insert into public.worker_criminal_record_submissions (
    provider_id, storage_path, mime_type, file_size_bytes, content_hash,
    issue_date, document_reference, declared_name, policy_version
  ) values (
    v_provider, p_storage_path, p_mime_type, p_file_size_bytes, p_content_hash,
    p_issue_date, nullif(pg_catalog.btrim(coalesce(p_document_reference, '')), ''),
    pg_catalog.btrim(p_declared_name), 'wps023-v1'
  )
  returning id into v_id;

  perform private.worker_transition(
    v_user, 'criminal_record_submitted', v_user, 'worker',
    'certificate_submitted', 'Your certificate was received and is waiting for review.');

  return pg_catalog.jsonb_build_object('submissionId', v_id, 'status', 'submitted');
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. The surface with no limit at all
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reply_support_case(p_case_id uuid, p_body text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_ticket public.support_tickets%rowtype; v_is_staff boolean; v_existing uuid;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform private.enforce_rate_limit('support_case_reply');
  select * into v_ticket from public.support_tickets t where t.id = p_case_id for update;
  if v_ticket.id is null then raise exception 'Support case not found' using errcode = 'PT404'; end if;
  v_is_staff := private.staff_has_capability('manage_support_cases');
  if v_ticket.requester_id <> v_uid and not v_is_staff then
    raise exception 'Support case not found' using errcode = '42501';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'This support case is closed' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_body,''))) not between 1 and 4000
     or pg_catalog.length(coalesce(p_idempotency_key,'')) not between 8 and 200 then
    raise exception 'Invalid reply' using errcode = '22023';
  end if;
  select m.id into v_existing from public.support_messages m
  where m.ticket_id = p_case_id and m.idempotency_key = p_idempotency_key and m.sender_id = v_uid;
  if v_existing is not null then
    return pg_catalog.jsonb_build_object('messageId', v_existing, 'duplicate', true);
  end if;
  insert into public.support_messages(ticket_id, sender_id, body, visibility, idempotency_key)
  values (p_case_id, v_uid, pg_catalog.btrim(p_body), 'participants', p_idempotency_key);
  insert into public.support_ticket_events(ticket_id, from_status, to_status, action, actor_id, actor_role, idempotency_key)
  values (p_case_id, v_ticket.status, v_ticket.status, 'replied', v_uid,
          case when v_is_staff and v_ticket.requester_id <> v_uid then 'staff' else 'participant' end,
          'reply:'||p_idempotency_key)
  on conflict do nothing;
  update public.support_tickets set last_reply_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = p_case_id;
  return pg_catalog.jsonb_build_object('duplicate', false);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Two claims corrected to match reality
-- ---------------------------------------------------------------------------
-- These surfaces are limited before the database sees them. Recording that
-- honestly is the difference between an inventory and a wish list.

update private.rate_limit_policies
set enforced_by = 'domain_rule',
    notes = 'Enforced in the vision-extract Edge Function by supabase/functions/_shared/ocr-throttle.ts, before any paid provider call. Not reachable from the database.'
where policy_key = 'identity_extraction_request';

update private.rate_limit_policies
set enforced_by = 'domain_rule',
    notes = 'Enforced in the location-proxy Edge Function, which owns the provider quota. Not reachable from the database.'
where policy_key = 'location_search_request';
