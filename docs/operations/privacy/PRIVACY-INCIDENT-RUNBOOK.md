# Runbook — privacy incidents

**Owner:** Security administrator
**Capability:** `review_privacy_incidents` · `manage_incidents` (WPS-017)

---

## 1. A privacy incident is an incident

There is no separate privacy incident system. A privacy incident **is** a
`public.operational_incidents` row with category `security_incident` or
`data_integrity`, plus a `private.privacy_incident_details` row carrying the
privacy facts.

The commander, severity, timeline and postmortem stay where every other incident
keeps them. Only the privacy-specific facts are new.

## 2. Categories

| Category | Example |
| --- | --- |
| `unauthorized_access` | Someone reached data they had no capability for |
| `incorrect_export` | An export contained data belonging to another account |
| `cross_account_exposure` | One account's data rendered for another |
| `public_storage_exposure` | A private object became publicly readable |
| `secret_exposure` | A key or token reached a client, a log, or a repository |
| `excessive_logging` | Personal data written to a log that should not hold it |
| `retention_failure` | Data kept past an approved rule, or deleted before one |
| `deletion_failure` | An anonymization run left personal data behind |
| `misdirected_notification` | A notification reached the wrong account |
| `unauthorized_staff_access` | A staff member read records without a legitimate reason |

## 3. Triage

1. **Contain first.** Pull the relevant kill switch before investigating.
   `privacy_requests` stops new privacy requests; `uploads` stops uploads;
   `read_only_maintenance` stops writes. Containment beats diagnosis.
2. **Open the incident** through WPS-017 with a real severity.
3. **Record the privacy facts** in `private.privacy_incident_details`:
   category, affected data classes, an affected-account estimate, containment
   note.
4. **Preserve evidence.** If accounts are involved in a matter that may run on,
   place holds — see [LEGAL-HOLD-RUNBOOK](LEGAL-HOLD-RUNBOOK.md).
5. **Do not delete anything** to make the problem go away. Deleting evidence
   during an incident turns a privacy incident into a worse one.

## 4. Affected data classes

Record them by classification key, not prose:
`identity_sensitive` and `credential_secret` are the two that change the
severity of everything else. An incident touching either is `sev1` until proven
otherwise.

## 5. External notification

```sql
external_notification_decision in (
  'not_assessed',              -- default
  'legal_review_requested',
  'notification_not_required',
  'notification_required',
  'notification_sent'
)
```

**This field records a decision. It never performs one.**

Nothing in this codebase contacts a regulator, and nothing here should imply
that it has. Setting `notification_sent` means *a human sent a notification and
recorded that fact* — it is not a trigger.

Whether Warsha has a breach-notification duty at all, to whom, and within what
period, is **unresolved** (Q-10). Route it to counsel before setting anything
other than `legal_review_requested`.

## 6. Specific playbooks

### Secret exposure

1. Rotate the key immediately — before writing anything down.
2. Check `npm run audit:secrets`; it scans every tracked file and every commit.
3. If the key reached a published bundle, treat every account as affected.
4. A leaked **service-role** key bypasses RLS entirely. Rotate, then audit
   `private.staff_access_log` and `private.staff_audit_events` for the window.

### Public storage exposure

1. Set the bucket `public = false` immediately.
2. Drop any permissive policy.
3. Enumerate what was reachable, by path prefix.
4. Objects reachable by URL must be assumed cached externally. Say so.

This is exactly what the retired `avatars` bucket would have been if anyone had
written to it — public, unbounded, and writable by any authenticated account.

### Cross-account exposure

1. Identify the query or policy that allowed it.
2. Check whether the account-generation guard in the relevant React context was
   bypassed — that is the client-side cause.
3. Check RLS **and** grants. A policy without a grant is unusable; a grant
   without a policy is wide open.

### Deletion failure

1. Do **not** re-run blindly. A partial run means something raised.
2. Read `private.privacy_anonymization_log` for the request; every step logs a
   row count.
3. Check for a hold placed after approval.
4. Fix the cause, then re-run — the steps are individually idempotent.

## 7. Closing

An incident closes when: the cause is fixed, the affected set is known, the
external-notification decision is recorded with a named decision-maker, and a
regression test exists that would have caught it.

**The last one is not optional.** Every defect in WES-022 §5 has a test beside
it, and an incident without one is an incident that recurs.
