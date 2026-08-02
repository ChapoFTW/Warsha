# Payment Incident Runbook

| Field | Value |
| --- | --- |
| Authority | Constitution → WPS-007 → WPS-015 |
| Status | Baseline — no live provider is configured |
| Owner | Sief Abdelghfar |

## Severity

| Level | Definition | First action |
| --- | --- | --- |
| **SEV1** | Suspected fund loss, credential exposure, or ledger imbalance | Maintenance mode on, escalate to owner immediately |
| **SEV2** | Provider outage, webhook delivery failure, or payout failure affecting multiple workers | Assess, then maintenance mode if customers are being charged without confirmation |
| **SEV3** | Isolated failed payment, single reconciliation exception, single quarantined event | Work through the normal queue |

## Universal first steps

1. **Stop the bleeding.** For SEV1/SEV2, set `maintenance_mode = true` with a
   reason. Cash remains available; customers are not stranded.
2. **Do not mutate the ledger.** Never edit or delete a ledger entry. Corrections
   are new balanced postings only.
3. **Preserve evidence.** Quarantine rows, gateway events, and reconciliation
   exceptions are the audit trail. Never delete them to clear a queue.
4. **Record the timeline** with UTC timestamps.

## Incident: webhook signature failures

Symptom: `payment_webhook_quarantine` filling with `signature_invalid`.

1. Confirm whether the signing secret was rotated recently. A stale secret on
   either side produces exactly this.
2. Verify the raw body is being passed to verification **unparsed**. Re-serializing
   JSON before verification is the most common cause of false failures.
3. Confirm environment: a sandbox event arriving at a live endpoint quarantines as
   `environment_mismatch`, not `signature_invalid`.
4. Do **not** disable signature verification to clear the backlog. Once the cause
   is fixed, replay the affected events through the provider.

## Incident: webhook delivery stopped (missing webhooks)

Symptom: attempts in `succeeded` with payments not `paid`; reconciliation raises
`missing_webhook`.

1. Check provider status and endpoint health.
2. Use the provider's transaction inquiry API to establish authoritative status.
3. Replay missed events from the provider. Processing is idempotent per provider
   event id, so replay is safe.
4. If replay is impossible, reconcile through the exception queue with a staff
   resolution note. Never mark a payment paid by hand without provider evidence.

## Incident: replay or duplicate event flood

Processing is already idempotent: a repeated provider event returns `duplicate`
and posts nothing. Confirm no duplicate ledger transaction exists for the affected
payments, then investigate why the provider is redelivering.

## Incident: amount mismatch

Symptom: quarantine reason `amount_mismatch`; the attempt is moved to
`requires_review`.

The immutable booking snapshot is authoritative. **Never** accept the provider
amount to make the mismatch disappear.

1. Establish the true charged amount from the provider.
2. If the customer was overcharged, initiate an approved refund of the difference
   through the existing WPS-007 refund RPC.
3. If undercharged, do not silently absorb it — record a reconciliation exception
   and decide explicitly.
4. Investigate whether the snapshot could have been altered after intent creation.

## Incident: ledger imbalance

Symptom: reconciliation reports `ledger_balanced = false` or a `ledger_imbalance`
exception.

This is **SEV1**. Enable maintenance mode. Do not post further transactions until
the cause is understood. Identify the unbalanced transaction, determine the
correct entries, and post a new balanced correcting transaction. History is never
rewritten.

## Incident: payout failure

1. Confirm whether the reservation was released exactly once. Double release and
   zero release are both defects.
2. Confirm the destination tokenization state. A destination that is not
   `tokenized` must fail closed rather than being retried against raw details.
3. Never debit the worker externally to recover a failed payout.
4. Notify through WPS-014 using the withdrawal-failed event.

## Incident: suspected credential or secret exposure

**SEV1.**

1. Maintenance mode on.
2. Revoke the exposed credential at the provider immediately.
3. Rotate every secret sharing the exposure path.
4. Audit `payment_gateway_events` and `payout_provider_events` for activity that
   is not attributable to Warsha.
5. Verify no secret entered Git or an Expo bundle; if it did, treat the value as
   permanently compromised regardless of later removal.
6. Escalate to the owner and record whether legal notification obligations apply.

## Incident: chargeback received

1. Record it through the chargeback intake; it always requires staff review.
2. Gather evidence before the `evidence_due_at` deadline.
3. **Never** automatically blame or externally debit the worker.
4. Any financial recovery goes through the staff-reviewed WPS-007 post-release
   case, which records `externalProviderDebit: false`.
5. Chargebacks must not alter public ranking or reputation.

## Recovery and closure

Before leaving maintenance mode: confirm the ledger balances, the exception queue
is worked, quarantine is reviewed, and the root cause is understood. Record the
incident, its cause, its resolution, and any follow-up in the audit trail.

Never claim legal, tax, PCI, or regulatory conclusions in an incident record
without external professional confirmation.
