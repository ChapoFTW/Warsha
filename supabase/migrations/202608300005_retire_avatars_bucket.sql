-- The `avatars` bucket is retired in favour of `profile-images`.
--
-- `avatars` was created public in 202607200003 with two policies:
-- `public_media_read` (anon and authenticated could read every object) and
-- `own_avatar_write`. Both were removed by later hardening --
-- `public_media_read` in 202607200012, because a world-readable media bucket is
-- a leak, and `own_avatar_write` in 202608070001 -- and 202608070001 also
-- flipped the bucket private. Nothing replaced them.
--
-- What is left is a bucket with zero policies. No client can write to it (an
-- upload returns "new row violates row-level security policy") and no client
-- can read from it. The live avatar path moved to `profile-images`, where
-- `provider-repository.ts` uploads and `supabase-adapter.ts` mints signed URLs;
-- `provider_profiles.avatar_url` is fed from there and
-- `private.is_provider_publicly_discoverable` requires it.
--
-- The bucket row is NOT deleted here. `storage.protect_delete()` refuses direct
-- deletion from `storage.buckets` -- deliberately, to stop migrations orphaning
-- objects -- so removal has to go through the Storage API. Doing that from a
-- migration is impossible, and doing it by hand against Development alone would
-- put Development's storage inventory out of step with Preview and Production
-- with nothing in the ledger to explain why.
--
-- So the retirement is recorded and enforced rather than executed: the bucket
-- is emptied of privileges it no longer has, and
-- `supabase/tests/database/api-session-safety.test.sql` asserts it stays
-- policy-free and that `profile-images` remains the bucket with the policies.
-- Actually deleting the bucket is an operational step to run identically in
-- every environment, and it is reported as such.

do $$
declare
  v_objects bigint;
begin
  select count(*) into v_objects from storage.objects where bucket_id = 'avatars';
  if v_objects > 0 then
    raise exception
      'avatars bucket holds % object(s); it was believed unreachable and empty', v_objects;
  end if;
end
$$;

-- `marketplace-request-attachments` is NOT retired, and the difference matters
-- because the two look alike from a bucket listing.
--
-- It has three customer-scoped storage policies, a real table
-- (`public.marketplace_request_attachments`), and WPS-008 recorded its worker
-- signing path as "intentionally fail-closed" pending later work. But the table
-- has no RLS policies and no grants to `anon` or `authenticated`, so no client
-- can record or read an attachment row, and no surface offers one.
--
-- That is deferred scaffolding, not an orphan. Retiring it would destroy a
-- deliberate design; wiring it is a feature -- table policies, grants, a
-- recording RPC, worker signed access, a picker on two clients and its
-- localization -- not an audit fix. It is reported as scoped follow-up work.

comment on table public.marketplace_request_attachments is
  'DEFERRED SCAFFOLDING as of 2026-08-30. Storage policies exist; this table has '
  'no RLS policies and no client grants, so no surface can reach it. Customer '
  'request attachments are not a shipped feature. Wiring requires policies, '
  'grants, a recording RPC, worker signed access and client UI.';
