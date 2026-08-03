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
- A worker can sign in by phone OTP.
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
