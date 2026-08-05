# Runbook — data export

**Owner:** Security administrator
**Capability:** `review_privacy_requests` (state only)
**Status:** Partially implemented. Read §1 before promising anything.

---

## 1. The honest limitation

**Warsha generates an export manifest. It does not generate an export file.**

Producing a downloadable archive requires a worker, scheduler, or Edge Function
that reads across every domain, serialises it, and writes an object. None is
deployed. The request therefore stops at `manifest_ready`, and the client says
*"being prepared"* — which is true — and never says *"ready"*.

Do not tell anyone their export is ready. Nothing produces the file yet.

## 2. What does work

| Step | Status |
| --- | --- |
| Owner-scoped request with rate limit (3/day) | Works |
| Idempotent retry | Works — the key is resolved before the open-request cap |
| One open request at a time | Works |
| Manifest generation from the inventory | Works |
| Expiry (72 h default) | Works |
| Owner-scoped private bucket and read policy | Works |
| Exclusion list carried inside the manifest | Works |
| File generation | **Missing** |
| Download and signed URL issue | **Missing** (nothing to sign) |
| Expiry sweep of objects | **Missing** (no objects) |

## 3. Manifest contents

Ten sections: profile · addresses · bookings · reviews written · messages sent ·
support cases · payments · consents · search history · referrals.

Each carries a key, a format (`json` or `csv`), and a **row count**. The
manifest carries no content — it says what exists and how much.

The manifest also carries its own exclusion list, so the answer travels with the
file rather than living only in a help article:

- other participants' contact details
- staff notes and internal case history
- the identity of anyone who reported a safety concern
- fraud and trust signal internals
- payment provider secrets and full card or bank numbers

## 4. Checking a request

```sql
-- As DBA. There is deliberately no staff RPC that returns a manifest.
select id, status, requested_at, expires_at, download_count
from public.privacy_export_requests
where user_id = '<uuid>'
order by requested_at desc;
```

**Do not read the `manifest` column to answer a support question.** It is that
account's data. If somebody needs to know what is in their export, tell them the
category list above — it is identical for everyone.

## 5. If someone reports they cannot request an export

Work down in order:

1. **Is the surface open?**
   ```sql
   select private.privacy_surface_enabled('export');
   ```
   False means one of: `privacy_center` or `data_export` flag off for this
   environment, `privacy_center_enabled` or `export_enabled` false, or the
   `privacy_requests` kill switch is active.

2. **Do they already have one open?** The cap is one. `55000` is raised, and the
   copy says *"One copy is already being prepared."*

3. **Have they hit the rate limit?** Three per day. Wait, or investigate why
   somebody is requesting more than three exports in a day.

4. **Is it a retry?** A retry with the same idempotency key returns the existing
   request with `created: false`. That is correct behaviour, not a failure.

## 6. When the worker is built

Requirements, so it is built correctly the first time:

- Read **only** the requesting account's rows. Use the same scoping the manifest
  uses; do not add a table without adding it to `private.data_inventory` first.
- Never include a table classified `trust_restricted`, `credential_secret`, or
  `operational_audit`, and never include another participant's contact details.
- Write to `privacy-exports` at `{user_id}/{export_id}.json`. The path
  constraint on the table enforces the prefix; the storage policy scopes reads
  to the owner's own folder.
- Set `status = 'ready'` and `storage_path` in the same transaction.
- Issue download URLs at **300 seconds**, per the bucket matrix.
- Emit `privacy_export_ready`. The payload must stay empty.
- On expiry, delete the object **and** update the row. An object without a row
  is an orphan; a row without an object is a broken download.

## 7. Expiry

`expired_privacy_exports` — proposed 3 days after expiry, action `delete`,
`legal_review_status = 'pending'`, execution disabled.

Until execution is approved, expired requests simply read as `expired` — the
read path computes that from `expires_at` rather than trusting a stored status,
so an expired export never appears available even if no sweep has run.

## 8. What never happens

- Staff never read the contents of an export.
- An export never contains another account's private data.
- An export is never emailed or sent anywhere; it is downloaded by its owner.
- A signed URL is never longer-lived than 300 seconds.
