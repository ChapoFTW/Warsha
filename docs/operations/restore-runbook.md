# Restore Runbook

Authority: Warsha Constitution → WPS-018.

## When a restore is the right answer

Almost never. A restore loses every write since the restore point: bookings,
messages, payments, disputes, reviews, and audit. Reach for it only for:

- data corruption that a forward correction cannot repair;
- a security compromise where the data can no longer be trusted;
- a migration that destroyed data and cannot be corrected forward.

For everything else — a bad feature, a bad client, a provider outage — use a
flag, a kill switch, or a forward migration. See `ROLLBACK-PLAN.md`.

**The decision to restore production belongs to the Owner.** Nobody else makes it.

## Before

1. **Stop the bleeding first.** Activate `read_only_maintenance` and any relevant
   surface switch. A restore against a live, writing platform loses more data
   than one against a quiet platform.
2. Open an incident. Record the reason, the chosen restore point, and what will
   be lost by choosing it.
3. Write down what is lost — approximately how many bookings, payments, and
   messages fall in the window. Say it out loud before you do it.
4. **Take a backup of the current, broken state.** You may need it to recover
   what the restore discards, and you cannot take it afterwards.

## Restoring

Supabase restores create a new database state from a backup or a point in time.
Follow the Supabase documentation for the plan in use; do not improvise a
`pg_restore` against a live project.

1. Confirm the exact restore point and the project reference. Twice.
2. Confirm you are pointed at the intended environment. The environment badge is
   the authority.
3. Perform the restore.
4. Wait for it to complete. Do not begin verification early.

## Verification — before anyone is let back in

### Structural

Run `public.verify_platform_release()` as a staff member holding
`view_audit_logs`. Compare against the expected failure set. An unexpected
failure means the restore did not produce the platform you expected.

### Ledger

Per `backup-runbook.md`: entries balance, projections agree, no payment
contradicts its booking, exceptions re-raised, cash debt recomputed. **If the
ledger does not balance, the platform stays closed.**

### Auth

- A customer can sign in with email and password.
- A worker can sign in with phone and password without an OTP or visible email.
- A staff member can reach the operations home.
- Sessions from before the restore point behave predictably.

### Storage

Storage is **not** restored with the database. Expect rows referencing files
that exist and files referencing rows that do not.

- Identify verification documents, portfolio images, progress media, dispute
  evidence, and review photos whose rows were restored.
- Confirm which files still exist.
- For those that do not, tell the affected people and ask for re-upload. Do not
  silently show a broken record.

### Provider state

Re-run reconciliation and work the exception queue. Payments the provider
processed after the restore point exist there and not here; reconciliation is
how they come back.

## Reopening

1. Clear the kill switches, one at a time, most restrictive last.
2. Watch the first real transaction of each kind personally.
3. Tell affected users what happened, in plain Egyptian Arabic, including what
   was lost. Do not minimise it.
4. Keep the incident open for 48 hours.

## The staging drill

**Status: NOT RUN.** This blocks private beta (criterion P11).

Non-destructive, on staging only:

1. Record the current row counts for bookings, payments, messages, and disputes.
2. Take a backup.
3. Create a marker: a synthetic booking with a recognisable reference.
4. Restore to the point **before** the marker.
5. Confirm the marker is gone and the earlier data is intact.
6. Run the full verification above.
7. Record how long each step actually took — that measurement is the real RTO,
   and the number in the backup runbook is a target until this drill produces it.
8. Confirm which storage objects survived.

Run it once before launch and quarterly after.

## What a restore never repairs

- An immutable audit record written after the restore point — it is simply gone.
- A notification already read.
- A payment the provider already settled.
- Trust. Tell people what happened.

---

## The restore drill that HAS been run, 2026-09-01

The staging drill above is still **NOT RUN**, and it still blocks P11 — it needs
a second Supabase project, and Warsha has exactly one. What was run is the layer
underneath it: whether a Warsha dump actually restores into an empty database
and comes back correct. That question is answerable without a second project,
and it had never been answered.

### Method

Isolated by construction. Nothing hosted was touched, and nothing was
overwritten.

1. `pg_dump -Fc` of the full local database (schema + data + migration ledger).
2. `create database warsha_restore_drill` — a fresh, empty database in the same
   local cluster.
3. `pg_restore --no-owner --no-privileges` into it.
4. Compared object inventories and ran representative queries.
5. `drop database warsha_restore_drill`, deleted the dump, confirmed both gone.

### Result

| | Source | Restored |
| --- | --- | --- |
| Tables (`public` + `private`) | 240 | 240 |
| Functions (`public` + `private`) | 672 | 672 |
| RLS policies (`public`) | 119 | 119 |
| Migration ledger rows | 97 | 97 |
| `public.services` | 176 | 176 |
| `private.notification_event_catalog` | 108 | 108 |
| `private.notification_push_copy` | 30 | 30 |
| `private.staff_feature_flags` | 30 | 30 |
| `public.legal_document_versions` | 26 | 26 |

**RLS survived**: 128 of 128 `public` tables have row-level security enabled in
the restored copy. A `SECURITY DEFINER` function
(`private.notification_category`) executed correctly against it.

### The one finding, and it matters

`pg_restore` reported exactly two errors, both the same:

```
ERROR: permission denied for table secrets
COPY vault.secrets (...) FROM stdin
```

**Supabase Vault does not come back with the database.** Not because the drill
was done wrongly — `vault.secrets` is managed and not writable even by
`postgres` — but because it is a genuinely separate restore path. Anybody
following this runbook and watching row counts match would conclude the restore
was complete, and every Edge Function secret would still be missing.

So step 4 of **Secrets** below is not optional and is not a formality.

### What this drill does NOT establish

- That a **Supabase** backup restores. Supabase restores a whole cluster from
  its own snapshot; this exercised `pg_dump`/`pg_restore` on Warsha's schema,
  which is the artifact and the procedure, not the platform's mechanism.
- Any **RTO**. The drill ran against a local dataset of a few megabytes.
- **Storage objects.** Buckets are not in a database dump at all.
- **Point-in-time recovery.** Whether PITR is even available depends on the
  project's plan, which is an owner question.

## Recovery order, after any restore

Numbered because the order is load-bearing: applying migrations before the
secrets are back leaves Edge Functions failing in ways that look like migration
faults.

1. **Database.** Restore, then confirm the migration ledger row count equals the
   number of files in `supabase/migrations/`. They must be equal. If the ledger
   is short, the restore predates migrations that have been applied and the
   forward chain must be pushed before anything else runs.
2. **Schema reconciliation.** `npx supabase db push --linked --dry-run` must
   report an empty list. Anything it wants to push is drift between the restore
   point and the repository.
3. **Verification.** `npm run db:test` against the restored database. 3345
   pgTAP assertions, including every RLS contract.
4. **Secrets.** Vault does **not** come back with the database. Re-set every
   Edge Function secret from `docs/operations/secret-rotation-runbook.md`:
   `GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT`, `GOOGLE_MAPS_SERVER_KEY`,
   `WARSHA_DEVELOPMENT_AUTOMATION_TOKEN`, and — once push is activated —
   `EXPO_ACCESS_TOKEN`. Verify each published digest rather than trusting the
   upload; see the encoding trap in that runbook.
5. **Edge Functions.** Redeploy all of them:
   `location-proxy`, `privacy-export`, `push-dispatch`, `vision-extract`,
   `warsha-automation`, `worker-auth`. A function deployed against the previous
   database state is not automatically wrong, but it has not been proven right.
6. **Storage.** Buckets and objects are outside the database dump entirely.
   Confirm `privacy-exports`, `booking-attachments`, `dispute-evidence` and
   `verification-documents` exist with their policies before anybody uploads.
7. **Web and native configuration.** Vercel environment variables are not part
   of a database restore. If the project reference changed,
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must be
   updated for Production, Preview and Development, and the mobile build needs
   the matching `EXPO_PUBLIC_*` values and a new binary or OTA.
8. **Governance state.** Feature flags, kill switches and provider activations
   live in the database and come back with it — but confirm them explicitly with
   `npm run automation:govern state`. A restore that silently re-enables a
   provider somebody disabled during an incident is its own incident.
9. **Incident validation.** Sign in as a customer and as a worker. Create one
   booking. Send one message. Open the privacy centre. Confirm the admin console
   loads and one audited staff action records. Only then close the incident.
