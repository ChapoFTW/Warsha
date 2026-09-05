-- The declared signed-URL lifetimes, and the one that was never true.
--
-- ## What was wrong
--
-- `private.storage_bucket_lifecycle` has carried a `signed_url_seconds` for
-- every bucket since WPS-022. Nothing read it. Every call site passed its own
-- numeric literal, and two had drifted four times past the declared policy:
-- chat attachments and booking attachments were signed for 3600 seconds against
-- a declared 900.
--
-- A signed URL is a bearer token. Anyone holding the string can fetch the
-- object with no session and no further check, so the expiry IS the blast
-- radius. A URL that reaches a screenshot, a support ticket, a shared browser
-- history or a proxy log stays usable for exactly as long as this number says.
--
-- The clients now read `src/storage/signed-url-policy.ts`, and
-- `scripts/signed-url-policy.test.mts` fails if a call site writes a literal or
-- if that table stops agreeing with this one. This migration exists so the two
-- authorities agree in the direction of *less* exposure.
--
-- ## The one value changed here
--
-- `support-attachments` declared 900 while the support client had always signed
-- for 300. The code was stricter than the policy, so the policy is corrected to
-- the behaviour that was actually shipping rather than the behaviour being
-- relaxed to match a number nobody had implemented. Nothing gets longer.

update private.storage_bucket_lifecycle
set signed_url_seconds = 300
where bucket_id = 'support-attachments'
  and signed_url_seconds > 300;

-- A guard rail rather than a comment. Nothing in the product signs a URL for
-- longer than an hour, and the two buckets holding a criminal record and a full
-- personal-data export are held to five minutes. A future edit that loosens
-- either of those has to remove this constraint, which is a deliberate act
-- somebody has to justify in review rather than a number quietly growing.
alter table private.storage_bucket_lifecycle
  drop constraint if exists storage_bucket_lifecycle_signed_url_bounds;

alter table private.storage_bucket_lifecycle
  add constraint storage_bucket_lifecycle_signed_url_bounds check (
    signed_url_seconds >= 0
    and signed_url_seconds <= 3600
    and (bucket_id not in ('worker-criminal-records', 'privacy-exports', 'support-attachments')
         or signed_url_seconds <= 300)
  );
