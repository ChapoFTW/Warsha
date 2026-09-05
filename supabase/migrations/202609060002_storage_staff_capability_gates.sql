-- Staff reads of identity material go through a capability, not a badge.
--
-- ## The alternate path
--
-- Warsha gates staff access to a worker's documents with a capability AND an
-- audit record. `staff_worker_document_reference` resolves the capability for
-- the document kind, calls `private.require_staff_capability`, and writes to
-- `private.staff_access_log` before returning a path. A `support_agent` asking
-- that RPC for a national ID is refused.
--
-- The storage policies did not agree. `verification_document_select` and
-- `wps010_certificate_media_read` admitted any `private.is_staff()`, so the same
-- `support_agent` could select the row straight out of `storage.objects`, sign a
-- URL for it, and read the document with no capability check and no entry in the
-- access log. The audited path was the narrow one; the unaudited path was open.
--
-- Storage signs a URL only after the caller passes the SELECT policy for that
-- exact row, so the policy IS the authorization for signing, listing and
-- downloading. Narrowing it here closes all three at once.
--
-- ## Why this is safe to narrow
--
-- No surface reads either bucket as staff. Nothing under `web/` signs
-- `verification-documents` or `provider-certificates`, and the worker-facing
-- reads in `src/verification` and `src/providers` use the owner branch, which is
-- untouched. The broad grant was serving no product behaviour.
--
-- `review_identity_verification` is the capability the RPC path already requires
-- for identity documents, held by `super_administrator` and
-- `verification_reviewer`. Certificates are part of the same verification file
-- and are gated the same way.
--
-- Deliberately NOT changed: `job_progress_media_participant_object_read` still
-- admits any staff. Those are photographs of work in progress, read while
-- handling a dispute, and narrowing them is a question about the dispute
-- capability model rather than an identity-exposure fix.

-- Identity documents: national ID and equivalent.
drop policy if exists verification_document_select on storage.objects;
create policy verification_document_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-documents'
    and private.verification_provider_id(name) is not null
    and (
      private.staff_has_capability('review_identity_verification')
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and private.owns_provider(private.verification_provider_id(name))
      )
    )
  );

-- Professional certificates submitted as part of the same verification file.
drop policy if exists wps010_certificate_media_read on storage.objects;
create policy wps010_certificate_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'provider-certificates'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.staff_has_capability('review_identity_verification')
    )
  );
