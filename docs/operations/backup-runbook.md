# Backup Runbook

Authority: Warsha Constitution → WPS-018.

## Current status, stated plainly

**No backup is claimed to be working.** The Supabase plan is unconfirmed, PITR
availability is unconfirmed, and no restore has ever been performed. This is gap
G22 and it blocks private beta.

A backup that has never been restored is not a backup. It is a hope with a
filename.

## What must be true before any hosted environment carries real data

| # | Requirement |
| --- | --- |
| B01 | The Supabase plan is confirmed, and its backup and PITR capabilities recorded here |
| B02 | Daily backups confirmed running on staging and production |
| B03 | Retention confirmed against the plan, not assumed |
| B04 | A restore has been **performed** on staging and the data verified |
| B05 | RPO and RTO agreed and recorded |
| B06 | The storage recovery limitation is understood by the team |
| B07 | A restore drill is scheduled and owned |

## Targets

| | Private beta | Production |
| --- | --- | --- |
| Backup frequency | Daily | Daily plus PITR |
| Retention | 7 days | 30 days minimum |
| RPO — acceptable data loss | 24 hours | 5 minutes with PITR |
| RTO — acceptable downtime | 8 hours | 2 hours |
| Drill cadence | Once before launch | Quarterly |

These are targets to verify, not measurements. Until B04 is done, RTO is unknown.

## What is covered, and what is not

| Asset | Covered by the database backup | Recovery if lost |
| --- | --- | --- |
| Tables, rows, schema, functions, policies | Yes | Restore |
| Auth users and identities | Yes | Restore |
| **Storage objects** — documents, photos, evidence | **No** | Separate; see below |
| **Secrets** — provider credentials, signing keys | **No** | Re-issue; see below |
| **Provider events** — settlements, webhooks | **No** | Re-import from the provider |
| Mobile signing keys | No | **Android keystore loss is unrecoverable** |

### Storage

Supabase Storage is **not** included in a database backup. A restore brings back
the row that references a file and not the file. That means identity documents,
portfolio images, job progress media, dispute evidence, and review photos are
**not currently recoverable**.

Before real data exists, one of these must be true: a documented storage backup
job, or an accepted, written decision that storage loss is tolerable and users
are told so. Neither exists today.

### Secrets

Secrets are never in a backup by design. Recovery is re-issue and rotate, per
`secret-rotation-runbook.md`. The Android upload keystore is the exception that
cannot be re-issued: lose it and the app can never be updated under the same
listing. It lives in EAS managed credentials for exactly that reason.

### Provider events

Settlements and webhook events originate with the provider. After a restore,
reconciliation is re-run and the exception queue worked. WPS-015 already
verifies signature, replay, environment, and amount, so re-import is safe.

## Ledger reconstruction check

After any restore, before reopening:

1. The double-entry ledger balances — every transaction's entries sum to zero.
2. Earnings projections agree with the ledger.
3. No payment sits in a state its booking contradicts.
4. Every reconciliation exception since the restore point is re-raised.
5. Cash commission debt is recomputed and compared.

If any check fails, the platform stays closed. A ledger that does not balance is
not an inconvenience; it is the product failing its central promise.

## Taking a backup before a migration

Every schema deployment records a restore point first. The reference goes in the
deployment record and, for CI-driven deployment, in the environment's
`PRE_MIGRATION_BACKUP_REF` variable — the workflow refuses to apply without it.

## What is not automated

No scheduler runs anywhere in Warsha. There is no automated backup verification,
no automated drill, and no alert if a backup fails. All three are manual and
owned by the Security Administrator, and that is a known weakness recorded here
rather than papered over.
