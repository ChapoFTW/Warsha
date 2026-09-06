-- Warsha stopped calling a criminal record a certificate.
--
-- After submitting the most sensitive document Warsha holds, a worker was told
-- "Your certificate was received". Warsha also collects genuine skill
-- certificates, in a different bucket, under a different document type, with a
-- different review path — so the word was not merely imprecise, it named the
-- wrong document.
--
-- The vocabulary was already right in two of the three languages: the
-- notification copy said "استلمنا الصحيفة" and "Extrait reçu". Only English
-- called it a certificate, and it did so in every layer at once: the client copy
-- tables, the mock, the sentence this function hands to `worker_transition`, and
-- the seeded catalog defaults below.
--
-- The client-side tables are corrected in the same commit. This migration
-- corrects the two the database owns.
--
-- The function is restated from its LIVE definition so the rate limit, the
-- declared-name normalization and every earlier correction are carried forward
-- rather than reverted; the only difference is the sentence.
--
-- Deliberately NOT changed: the `certificate_submitted` reason code. It is a
-- machine key that lifecycle rows already carry, and renaming it would rewrite
-- history to fix a word nobody reads.

update private.notification_event_catalog
set generic_title = 'Criminal record required',
    generic_body = 'Your application needs an official criminal record.'
where event_type = 'criminal_record_required';

update private.notification_event_catalog
set generic_title = 'Criminal record received',
    generic_body = 'Your criminal record is waiting for review.'
where event_type = 'criminal_record_received';

update private.notification_event_catalog
set generic_title = 'Criminal record needs attention'
where event_type = 'criminal_record_correction_required';

CREATE OR REPLACE FUNCTION public.submit_my_criminal_record(p_storage_path text, p_mime_type text, p_file_size_bytes bigint, p_content_hash text, p_issue_date date, p_document_reference text, p_declared_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 set search_path = ''
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
  if pg_catalog.length(private.normalize_declared_name(coalesce(p_declared_name, ''))) not between 2 and 120 then
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
    private.normalize_declared_name(p_declared_name), 'wps023-v1'
  )
  returning id into v_id;

  perform private.worker_transition(
    v_user, 'criminal_record_submitted', v_user, 'worker',
    'certificate_submitted', 'Your criminal record was received and is waiting for review.');

  return pg_catalog.jsonb_build_object('submissionId', v_id, 'status', 'submitted');
end;
$function$;
