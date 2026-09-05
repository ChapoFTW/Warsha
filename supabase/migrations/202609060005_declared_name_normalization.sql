-- The declared name is stored the way it was typed, minus the typing accidents.
--
-- Live Development proof of the repaired criminal-record flow submitted
-- `'  محمد   أحمد  '` straight at the RPC and read back
-- `'محمد   أحمد'`: `btrim` had removed the outer spaces and left the
-- three in the middle. The client collapses them before sending, so the app was
-- always storing the tidy value — but that made the guarantee a property of the
-- caller rather than of the column, and any direct API call stored whatever it
-- sent.
--
-- That matters more here than it would elsewhere. A reviewer compares this
-- string against the name printed on a criminal record, and two submissions of
-- the same name that differ only by an invisible run of spaces look like two
-- different names in a list.
--
-- So the same normalization the client applies is applied again on the server,
-- and the length check now measures the normalized value rather than the raw
-- one — otherwise `'a          b'` would pass a 2..120 test on whitespace.
--
-- Deliberately narrow: leading, trailing and repeated whitespace, and nothing
-- else. No case change, no transliteration, no character filter. These names are
-- usually Arabic and sometimes French, and the whole purpose of the field is
-- that it matches a document Warsha did not write.

create or replace function private.normalize_declared_name(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'))
$$;

revoke all on function private.normalize_declared_name(text) from public, anon, authenticated;

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
    'certificate_submitted', 'Your certificate was received and is waiting for review.');

  return pg_catalog.jsonb_build_object('submissionId', v_id, 'status', 'submitted');
end;
$function$;
