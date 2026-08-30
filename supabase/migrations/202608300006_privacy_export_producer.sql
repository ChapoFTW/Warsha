-- The export the interface has been promising.
--
-- `request_my_data_export` built a manifest -- a table of contents naming ten
-- sections, their row counts, and what is deliberately excluded -- wrote a row
-- with status `manifest_ready`, and stopped. Nothing ever produced a file,
-- wrote `storage_path`, moved the status to `ready`, or emitted the
-- `privacy_export_ready` notification that has sat in the catalogue the whole
-- time. `download_count` and `last_downloaded_at` were columns nothing counted.
--
-- Meanwhile `src/privacy/privacy-copy.ts` told the person: "We prepare a file
-- with the information Warsha holds about your account… This takes a little
-- while. We will tell you when it is ready." They were never told, because
-- there was never a file.
--
-- This adds the producer. It does not redesign what was already decided: the
-- manifest's section list is the contract for what the export contains, and the
-- manifest's `excluded` list is the contract for what it must not.
--
-- Nothing here assembles data on the client. The payload is built by a
-- SECURITY DEFINER function that takes the subject's id, and the only callers
-- are `service_role` (the Edge Function that writes the file) and the subject
-- themselves for the download claim.

-- ---------------------------------------------------------------------------
-- 1. The payload
-- ---------------------------------------------------------------------------
-- One section per manifest entry, same keys, same order. Every query is scoped
-- to the subject, and the columns are named explicitly rather than selected
-- with `*` -- a column added to `bookings` next month must not silently join
-- somebody's export.
--
-- The exclusions the manifest promises are enforced here by omission:
--   * no counterparty contact details (no other person's phone, email, address)
--   * no staff notes or internal case history (`assigned_to`, `moderated_by`,
--     `moderation_reason`, `opened_by_staff`, `rejection_reason` are absent)
--   * no reporter identity, no trust-and-safety internals
--   * no payment provider secrets, no full instrument numbers

create or replace function private.privacy_build_export_payload(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provider_id uuid;
begin
  if p_user_id is null then
    raise exception 'A subject is required' using errcode = '22023';
  end if;

  select p.id into v_provider_id
  from public.provider_profiles p where p.user_id = p_user_id;

  return pg_catalog.jsonb_build_object(
    'profile', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'displayName', p.display_name, 'phone', p.phone,
        'preferredLanguage', p.preferred_language,
        'createdAt', p.created_at, 'updatedAt', p.updated_at,
        'termsAcceptedAt', p.terms_accepted_at,
        'privacyAcceptedAt', p.privacy_accepted_at,
        'deactivatedAt', p.deactivated_at))
      from public.profiles p where p.id = p_user_id), '[]'::jsonb),

    'addresses', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'label', a.label, 'addressLine', a.address_line,
        'governorate', a.governorate, 'district', a.district,
        'street', a.street, 'building', a.building, 'floor', a.floor,
        'apartment', a.apartment, 'landmark', a.landmark,
        'instructions', a.instructions,
        'latitude', a.latitude, 'longitude', a.longitude,
        'isDefault', a.is_default, 'createdAt', a.created_at)
        order by a.created_at)
      from public.addresses a
      where a.customer_id = p_user_id and a.deleted_at is null), '[]'::jsonb),

    -- A booking has two sides. The subject gets the facts of the job and the
    -- other side's PUBLIC display name, which is what they already saw in the
    -- app; they do not get the other side's contact details or account id.
    'bookings', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reference', b.id, 'status', b.status,
        'service', b.service_name_snapshot, 'pricingType', b.pricing_type,
        'estimatedPriceEgp', b.estimated_price_egp,
        'finalPriceEgp', b.final_price_egp,
        'issueDescription', b.issue_description,
        'scheduledDate', b.scheduled_date, 'scheduledTime', b.scheduled_time,
        'bookingType', b.booking_type,
        'role', case when b.customer_id = p_user_id then 'customer' else 'professional' end,
        'counterparty', case
          when b.customer_id = p_user_id
            then (select pp.display_name from public.provider_profiles pp where pp.id = b.provider_id)
          else b.customer_name_snapshot end,
        'createdAt', b.created_at, 'cancelledAt', b.cancelled_at)
        order by b.created_at)
      from public.bookings b
      where (b.customer_id = p_user_id
          or (v_provider_id is not null and b.provider_id = v_provider_id))
        and b.deleted_at is null), '[]'::jsonb),

    -- Reviews the subject wrote. Moderation reasons and the moderator are
    -- internal case history and are not included.
    'reviews_written', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'bookingReference', r.booking_id, 'rating', r.rating,
        'comment', r.comment, 'isAnonymous', r.is_anonymous,
        'professionalism', r.professionalism_rating, 'quality', r.quality_rating,
        'punctuality', r.punctuality_rating, 'communication', r.communication_rating,
        'value', r.value_rating,
        'publicationStatus', r.moderation_status,
        'createdAt', r.created_at, 'editedAt', r.edited_at)
        order by r.created_at)
      from public.reviews r
      where r.customer_id = p_user_id and r.deleted_at is null), '[]'::jsonb),

    -- The subject's own messages only. The other side of a conversation is
    -- their data, not the subject's.
    'messages', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'conversation', m.conversation_id, 'type', m.message_type,
        'body', m.body, 'sentAt', m.created_at, 'readAt', m.read_at)
        order by m.created_at)
      from public.messages m
      where m.sender_id = p_user_id and m.deleted_at is null), '[]'::jsonb),

    -- The case as the subject experienced it. `assigned_to`, `opened_by_staff`
    -- and the internal resolution reason are staff history and are excluded.
    'support_cases', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reference', t.id, 'subject', t.subject, 'category', t.category,
        'status', t.status, 'locale', t.locale, 'mode', t.requester_mode,
        'openedAt', t.created_at, 'closedAt', t.closed_at,
        'satisfactionScore', t.satisfaction_score,
        'satisfactionComment', t.satisfaction_comment)
        order by t.created_at)
      from public.support_tickets t
      where t.requester_id = p_user_id), '[]'::jsonb),

    -- Amounts and outcomes. No provider secrets, no instrument numbers; the
    -- gateway fee is Warsha's commercial detail rather than the subject's.
    'payments', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'bookingReference', fp.booking_id, 'method', fp.payment_method,
        'status', fp.status, 'amountMinor', fp.amount_minor::text,
        'refundedMinor', fp.refunded_minor::text, 'currency', fp.currency,
        'createdAt', fp.created_at, 'paidAt', fp.paid_at)
        order by fp.created_at)
      from public.financial_booking_payments fp
      where fp.customer_id = p_user_id), '[]'::jsonb),

    'consents', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'purpose', c.purpose_key, 'documentVersion', c.document_version,
        'granted', c.granted, 'decidedAt', c.decided_at,
        'withdrawnAt', c.withdrawn_at, 'surface', c.source_surface)
        order by c.decided_at)
      from public.privacy_consent_records c
      where c.user_id = p_user_id), '[]'::jsonb),

    'search_history', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'query', s.query, 'searchedAt', s.searched_at)
        order by s.searched_at)
      from public.user_recent_searches s
      where s.user_id = p_user_id), '[]'::jsonb),

    -- Who referred whom is shared between two people, so the subject learns
    -- the outcome and the dates, not the other person's account.
    'referrals', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'direction', case when a.referrer_user_id = p_user_id
                          then 'referred_someone' else 'was_referred' end,
        'role', a.referred_role, 'status', a.status,
        'attributedAt', a.attributed_at, 'qualifiedAt', a.qualified_at)
        order by a.attributed_at)
      from public.referral_attributions a
      where a.referrer_user_id = p_user_id
         or a.referred_user_id = p_user_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.privacy_build_export_payload(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. What the producer reads
-- ---------------------------------------------------------------------------
-- A `public.warsha_*` wrapper because an Edge Function cannot reach the
-- `private` schema through PostgREST -- `.schema('private')` fails silently on
-- hosted, which is a trap this codebase has already been caught by once.

create or replace function public.warsha_privacy_export_payload(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.privacy_export_requests;
begin
  select * into v_request
  from public.privacy_export_requests r where r.id = p_request_id;

  if v_request.id is null then
    raise exception 'Export request not found' using errcode = 'P0002';
  end if;
  if v_request.status <> 'manifest_ready' then
    raise exception 'Export request is not awaiting production' using errcode = '55000';
  end if;
  if v_request.expires_at <= pg_catalog.now() then
    raise exception 'Export request has expired' using errcode = '55000';
  end if;

  return pg_catalog.jsonb_build_object(
    'manifest', v_request.manifest,
    'subject', v_request.user_id,
    'data', private.privacy_build_export_payload(v_request.user_id)
  );
end;
$$;

revoke all on function public.warsha_privacy_export_payload(uuid) from public, anon, authenticated;
grant execute on function public.warsha_privacy_export_payload(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. What the producer writes
-- ---------------------------------------------------------------------------
-- Marking ready is the step that makes the promise true, so it is also the step
-- that emits the notification the catalogue has always carried.

create or replace function public.warsha_privacy_export_mark_ready(
  p_request_id uuid,
  p_storage_path text,
  p_byte_size bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.privacy_export_requests;
begin
  select * into v_request
  from public.privacy_export_requests r where r.id = p_request_id for update;

  if v_request.id is null then
    raise exception 'Export request not found' using errcode = 'P0002';
  end if;

  -- Producing twice is not an error. The file is written before this is called,
  -- so a retried producer that already uploaded must be able to finish.
  if v_request.status = 'ready' then
    return pg_catalog.jsonb_build_object('id', v_request.id, 'status', 'ready', 'changed', false);
  end if;
  if v_request.status <> 'manifest_ready' then
    raise exception 'Export request is not awaiting production' using errcode = '55000';
  end if;

  -- The path is the subject's own folder, which is what the storage policy
  -- checks. A producer that wrote elsewhere would create a file its owner
  -- could never read.
  if p_storage_path is null
     or pg_catalog.split_part(p_storage_path, '/', 1) <> v_request.user_id::text then
    raise exception 'Export path must live under the subject''s own folder'
      using errcode = '22023';
  end if;

  update public.privacy_export_requests
  set status = 'ready', storage_path = p_storage_path
  where id = p_request_id;

  perform private.record_operational_event('security', 'privacy_export_ready', 'info',
    pg_catalog.jsonb_build_object('bytes', p_byte_size), 'customer');

  -- Same shape `request_account_deletion` uses. The stored title and body are
  -- placeholders by design: clients never render them, they resolve the words
  -- from `event_key` through `notification-copy.ts`, which is why
  -- `privacy_export_ready` has had copy in three languages all along and
  -- nothing to attach it to.
  insert into public.notifications (user_id, type, title, body, data)
  values (v_request.user_id, 'privacy_export_ready',
          'Privacy update', 'Your privacy request has an update.', '{}'::jsonb);

  return pg_catalog.jsonb_build_object('id', v_request.id, 'status', 'ready', 'changed', true);
end;
$$;

revoke all on function public.warsha_privacy_export_mark_ready(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.warsha_privacy_export_mark_ready(uuid, text, bigint) to service_role;

create or replace function public.warsha_privacy_export_mark_failed(
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.privacy_export_requests
  set status = 'failed',
      failure_reason = pg_catalog.left(coalesce(p_reason, 'unknown'), 200)
  where id = p_request_id and status = 'manifest_ready';

  return pg_catalog.jsonb_build_object('id', p_request_id, 'status', 'failed');
end;
$$;

revoke all on function public.warsha_privacy_export_mark_failed(uuid, text)
  from public, anon, authenticated;
grant execute on function public.warsha_privacy_export_mark_failed(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The download
-- ---------------------------------------------------------------------------
-- The subject asks for the path of their own ready export. The storage policy
-- already restricts reads to `{auth.uid()}/...`, so this does not grant access
-- -- it tells the client where to look, refuses to do so once the export has
-- expired, and is the only place `download_count` is counted.

create or replace function public.claim_my_data_export(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_request public.privacy_export_requests;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.privacy_surface_enabled('export') then
    raise exception 'Export is not available' using errcode = '42501';
  end if;

  select * into v_request
  from public.privacy_export_requests r
  where r.id = p_request_id and r.user_id = v_user
  for update;

  -- A request belonging to somebody else is reported exactly as one that does
  -- not exist. Which of the two it was is not the caller's business.
  if v_request.id is null then
    raise exception 'Export request not found' using errcode = 'P0002';
  end if;
  if v_request.expires_at <= pg_catalog.now() then
    raise exception 'Export has expired' using errcode = '55000';
  end if;
  if v_request.status <> 'ready' or v_request.storage_path is null then
    raise exception 'Export is not ready' using errcode = '55000';
  end if;

  update public.privacy_export_requests
  set download_count = coalesce(download_count, 0) + 1,
      last_downloaded_at = pg_catalog.now()
  where id = p_request_id;

  perform private.record_operational_event('security', 'privacy_export_downloaded', 'info',
    '{}'::jsonb, 'customer');

  return pg_catalog.jsonb_build_object(
    'id', v_request.id,
    'bucket', 'privacy-exports',
    'path', v_request.storage_path,
    'expiresAt', v_request.expires_at,
    'downloadCount', coalesce(v_request.download_count, 0) + 1
  );
end;
$$;

revoke all on function public.claim_my_data_export(uuid) from public, anon;
grant execute on function public.claim_my_data_export(uuid) to authenticated;

comment on function public.claim_my_data_export(uuid) is
  'Returns the storage location of the caller''s own ready export. Access is '
  'enforced by the privacy-exports storage policy, not by this function; this '
  'refuses expired and unready requests and counts the download.';
