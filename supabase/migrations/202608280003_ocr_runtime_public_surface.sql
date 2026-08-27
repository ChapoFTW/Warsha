-- THE OCR RUNTIME HAS BEEN TALKING TO A SCHEMA POSTGREST DOES NOT SERVE
--
-- `vision-extract` reads the provider registry, the throttle history, the audit
-- ledger and the candidate table through `asService.schema('private')`. That
-- works in a Docker reset, where the API is configured from `config.toml` and
-- nobody notices, and it does not work on a hosted project: PostgREST exposes
-- `public` and `graphql_public`, and answers anything else with
-- "Invalid schema: private" before a grant is ever consulted.
--
-- The consequence was silent, which is what makes it serious. Every one of
-- those calls is either wrapped in `.catch(() => ({ data: null }))` or has its
-- result ignored, so the failures presented as ordinary product states:
--
--   * `provider_for_role` returned null, so the function reported
--     `refused_disabled` — indistinguishable from OCR being switched off. The
--     capability probe reported `providerKey: null`, `credentialConfigured:
--     false`, `enabled: false` with the registry ACTIVE and the flag ON.
--   * the throttle history came back empty, so every request looked like a
--     first request and the paid-call ceiling could not bind.
--   * `open_ocr_request` and `complete_ocr_request` wrote nothing, so a
--     document could have been sent to a provider with no audit row at all.
--   * the candidates were never stored, so the idempotency reuse path could
--     never find them and every retry would have been billed again.
--
-- Three of those four are worse than a broken feature: a paid call with no
-- ledger entry, a ceiling that does not hold, and a retry that pays twice.
--
-- The fix is the same shape as the automation surface: thin `public` wrappers
-- holding no logic and no authority, revoked from `anon` and `authenticated`,
-- granted to `service_role` alone. Being in `public` says which schema
-- PostgREST will route to. It says nothing about who may call, and nobody new
-- may.

-- --- Registry ---------------------------------------------------------------

create or replace function public.warsha_ocr_provider_for_role(p_role text)
returns text language sql stable security definer set search_path = '' as $$
  select private.provider_for_role(p_role)
$$;

create or replace function public.warsha_ocr_provider_enabled_for_role(p_role text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.provider_enabled_for_role(p_role)
$$;

-- --- Health -----------------------------------------------------------------

create or replace function public.warsha_ocr_record_provider_health(
  p_provider_key text, p_operation text, p_provider_version text, p_outcome text,
  p_latency_ms integer, p_attempts integer, p_timed_out boolean)
returns void language sql security definer set search_path = '' as $$
  select private.record_provider_health(
    p_provider_key, p_operation, p_provider_version, p_outcome,
    p_latency_ms, coalesce(p_attempts, 1)::smallint, coalesce(p_timed_out, false))
$$;

-- --- Throttle history -------------------------------------------------------
--
-- Returned as one jsonb array rather than as a table read, so the Edge Function
-- needs no schema access of any kind and the shape it consumes is fixed here.
-- The window and the row cap are the caller's, matching `ocr-throttle.ts`; the
-- cap is clamped so a caller cannot ask for the whole table.
create or replace function public.warsha_ocr_request_history(
  p_provider_id uuid, p_since timestamptz, p_limit integer default 200)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(row order by row->>'requestedAt' desc), '[]'::jsonb)
  from (
    select pg_catalog.jsonb_build_object(
      'documentType', r.document_type,
      'documentHash', r.document_hash,
      'outcome', r.outcome,
      'requestedAt', r.requested_at) as row
    from private.ocr_requests r
    where r.provider_id = p_provider_id
      and r.requested_at >= p_since
    order by r.requested_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ) recent
$$;

-- --- Candidates -------------------------------------------------------------

create or replace function public.warsha_ocr_stored_candidates(
  p_provider_id uuid, p_document_type text, p_document_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'fieldKey', e.field_key,
    'value', e.candidate_value,
    'confidence', e.confidence)), '[]'::jsonb)
  from private.worker_identity_extractions e
  where e.provider_id = p_provider_id
    and e.document_type = p_document_type
    and e.document_hash = p_document_hash
    and e.is_current
$$;

-- Supersede and insert in one statement pair, inside one function, so a crash
-- between them cannot leave a worker with two current sets of candidates for
-- the same document.
create or replace function public.warsha_ocr_store_candidates(
  p_provider_id uuid,
  p_document_type text,
  p_candidates jsonb,
  p_provider_key text,
  p_provider_version text,
  p_extracted_at timestamptz,
  p_document_hash text,
  p_request_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update private.worker_identity_extractions
  set is_current = false
  where provider_id = p_provider_id
    and document_type = p_document_type;

  insert into private.worker_identity_extractions(
    provider_id, document_type, field_key, candidate_value, confidence,
    provider_key, provider_version, extracted_at, document_hash,
    ocr_request_id, is_current)
  select
    p_provider_id,
    p_document_type,
    c->>'fieldKey',
    c->>'value',
    (c->>'confidence')::numeric,
    p_provider_key,
    p_provider_version,
    p_extracted_at,
    p_document_hash,
    p_request_id,
    true
  from pg_catalog.jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb)) c;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- --- Audit ledger -----------------------------------------------------------

create or replace function public.warsha_ocr_open_request(
  p_provider_id uuid, p_document_type text, p_document_hash text,
  p_provider_key text, p_provider_version text)
returns uuid language sql security definer set search_path = '' as $$
  select private.open_ocr_request(
    p_provider_id, p_document_type, p_document_hash, p_provider_key, p_provider_version)
$$;

create or replace function public.warsha_ocr_complete_request(
  p_request_id uuid, p_outcome text, p_latency_ms integer,
  p_mean_confidence numeric, p_fields_extracted integer,
  p_safe_failure_reason text default null)
returns void language sql security definer set search_path = '' as $$
  select private.complete_ocr_request(
    p_request_id, p_outcome, p_latency_ms, p_mean_confidence,
    p_fields_extracted, p_safe_failure_reason)
$$;

-- --- Grants -----------------------------------------------------------------

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.warsha_ocr_provider_for_role(text)',
    'public.warsha_ocr_provider_enabled_for_role(text)',
    'public.warsha_ocr_record_provider_health(text, text, text, text, integer, integer, boolean)',
    'public.warsha_ocr_request_history(uuid, timestamptz, integer)',
    'public.warsha_ocr_stored_candidates(uuid, text, text)',
    'public.warsha_ocr_store_candidates(uuid, text, jsonb, text, text, timestamptz, text, uuid)',
    'public.warsha_ocr_open_request(uuid, text, text, text, text)',
    'public.warsha_ocr_complete_request(uuid, text, integer, numeric, integer, text)'
  ]
  loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated', v_signature);
    execute pg_catalog.format(
      'grant execute on function %s to service_role', v_signature);
  end loop;
end $$;

comment on function public.warsha_ocr_stored_candidates(uuid, text, text) is
  'Reachable by service_role alone. A worker cannot call this: the candidates '
  'for their own document reach them through vision-extract, masked, and the '
  'confidence never crosses the wire.';

notify pgrst, 'reload schema';
