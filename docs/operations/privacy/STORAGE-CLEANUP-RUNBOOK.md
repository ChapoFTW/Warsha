# Runbook — storage cleanup

**Owner:** Security administrator (identity buckets), Operations manager (rest)
**Capability:** `review_retention`
**Status:** Preview only. No automated deletion exists.

---

## 1. The rule that matters most

**Do not delete an object because a read was ambiguous.**

A cleanup job that treats "I could not find the owning row" as "there is no
owning row" will eventually destroy evidence during an outage. Every deletion
must follow a **positive** confirmation that the row is gone, not a failure to
confirm that it exists.

This is why `staff_storage_orphan_preview` returns `deletionPerformed: false`
and has no delete path at all.

## 2. The bucket matrix

The full matrix is in
[WARSHA-PRIVACY-OPERATIONS](../../privacy/WARSHA-PRIVACY-OPERATIONS.md) §
Storage bucket matrix, and is enforced by `private.storage_bucket_lifecycle`.

pgTAP asserts both directions: every bucket has a lifecycle row, and every
lifecycle row describes a real bucket. A bucket with no row has no documented
owner; a row with no bucket is fiction.

## 3. Orphan preview

```sql
select public.staff_storage_orphan_preview('review-attachments');
```

Returns object count and orphan count. **Counts only** — a list of orphaned
object names in a staff response is itself a small data leak, since the paths
carry account and resource identifiers.

Four buckets have a supported check: `review-attachments`, `dispute-evidence`,
`support-attachments`, `provider-portfolios`. Others return
`supported: false` rather than a misleading zero.

Every preview writes a staff audit entry.

## 4. Before deleting anything, by hand

1. **Check for a hold.** Every bucket declares a `hold_scope`. Confirm no active
   hold covers it for the account concerned.
   ```sql
   select private.privacy_hold_active('<user_id>', 'dispute_evidence');
   ```
2. **Confirm the row is gone**, positively:
   ```sql
   select exists (select 1 from public.review_attachments where storage_path = '<name>');
   ```
   `false` from a query that ran is a confirmation. A query that errored is not.
3. **Check the retention rule.** If it is `manual_review`, a human decides per
   object. If it is `pending`, the duration has not been reviewed — do not act
   on it at all.
4. **Record what you deleted**, and why, in the incident or case that prompted
   it.

## 5. The identity buckets

`verification-documents` and `provider-certificates` are
`identity_sensitive`, `private_staff`, and governed by the `identity_documents`
rule — which is `manual_review`, `legal_review_status = 'pending'`.

**Do not delete anything from these buckets.** The retention duration is an open
legal question (Q-01), and an identity document may be evidence in a fraud,
safety, payment or legal matter. If space or policy pressure suggests otherwise,
that is a conversation with counsel, not a cleanup task.

## 6. The retired `avatars` bucket

It is private, bounded, and carries **no policy** — `storage.objects` is
deny-by-default for it. Nothing can read or write it through the API.

**Do not delete it, and do not delete its objects.** Hosted objects may exist
that a local migration cannot see, and dropping a bucket is irreversible. It is
retired in place, exactly as WPS-021 retired `promo_codes` and `wallets`.

If objects are later confirmed present and confirmed unreferenced, that is a
separate reviewed operation with a written decision — not a cleanup.

## 7. Privacy exports

`privacy-exports` is the one bucket with a short, clear lifecycle: owner-scoped
path, 300-second signed URLs, 72-hour expiry, `expired_privacy_exports` rule.

Currently **no objects exist**, because no worker produces them — see
[DATA-EXPORT-RUNBOOK](DATA-EXPORT-RUNBOOK.md).

When they do, the sweep must delete the object **and** update the row in the
same operation. An object without a row is an orphan; a row without an object is
a broken download that reads as available.

## 8. Anonymization and storage

`private.privacy_anonymize_account` clears **rows**. It does not delete storage
objects.

After an anonymization run, the following objects remain and require this
runbook:

| Bucket | What remains |
| --- | --- |
| `profile-images` | The avatar, now unreferenced |
| `provider-portfolios` | Portfolio images behind soft-deleted rows |
| `provider-certificates` | Certificates — subject to Q-01, do not delete |
| `verification-documents` | Documents — subject to Q-01, do not delete |

This is a genuine gap, recorded in WES-022 §9 and in the acceptance evidence
rather than glossed over here.

## 9. What is never deleted

- Anything under an active hold.
- Anything belonging to an open dispute, investigation, or payment matter.
- Identity documents, pending Q-01.
- Anything where the owning row's absence could not be positively confirmed.
