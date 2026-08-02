# Payment Operations Runbook

| Field | Value |
| --- | --- |
| Authority | Constitution → WPS-007 → WPS-015 |
| Status | Baseline — no live provider is configured |
| Owner | Sief Abdelghfar |

This runbook governs routine payment operations. Nothing here authorizes live
money movement; every live action additionally requires the decision gate in
`docs/decisions/payment-provider-selection.md`.

## 1. Environment states

| Surface | Read with |
| --- | --- |
| Gateway | `select private.payment_surface_environment('gateway');` |
| Payout | `select private.payment_surface_environment('payout');` |
| Staff summary | `select public.get_staff_payment_operations_summary();` (staff role) |

A surface returning `disabled` when you expect `live` means a precondition is
missing. Check, in order: `maintenance_mode`, `active_payment_provider`, an
activated `payment_provider_accounts` row for that exact environment,
`api_credentials_registered`, `webhook_secret_registered`, and a registered
`webhook_signing` row in `payment_secret_metadata`. **Never "fix" this by
weakening a constraint.**

## 2. Enabling a mode (requires owner authorization)

Modes are enabled in strict order. Do not skip a step.

1. `mock` — development only. No approval needed. Never implies a provider.
2. `sandbox` — requires provider selection, sandbox credentials, and an activated
   sandbox account row.
3. `live` — requires the complete decision gate: contract, legal and accounting
   confirmation, verified webhook signatures in sandbox, confirmed payout
   tokenization, deployed secrets, and approved runbooks.

Enabling live without every element is impossible by construction: the database
constraints and `payment_surface_environment` fail closed.

## 3. Secret handling and rotation

**Secrets never enter the database, Git, or any Expo bundle.** They live only in
the server-side secret store. The database records only that a secret role is
registered and when it rotates.

Rotation procedure:

1. Provision the new secret in the server secret store alongside the old one.
2. Confirm the provider accepts both during the overlap window.
3. Update `payment_secret_metadata.last_rotated_at` and `rotation_due_at`.
4. Verify a signed test event still validates.
5. Retire the old secret at the provider.
6. Record the rotation in the configuration history audit.

Webhook signing secret rotation follows the same overlap procedure. If a provider
does not support overlapping webhook secrets, schedule rotation inside a
maintenance window (§5) so no event is lost.

If a secret is suspected exposed, follow the incident runbook immediately —
rotation alone is not sufficient.

## 4. Routine daily operations

| Task | Action |
| --- | --- |
| Reconciliation review | Work the exception queue (see the reconciliation runbook) |
| Quarantine review | Investigate every unreviewed `payment_webhook_quarantine` row |
| Attempts requiring review | Resolve every `payment_attempts` row in `requires_review` |
| Withdrawal review | Review withdrawals in `under_review` |
| Chargeback deadlines | Check `evidence_due_at` on open chargebacks |

An amount mismatch is never resolved by accepting the provider's amount. The
immutable booking snapshot is authoritative; a genuine discrepancy is a provider
incident.

## 5. Maintenance mode

Activate by setting `maintenance_mode = true` with a `maintenance_reason` of 3–300
characters. This immediately disables every online surface while leaving cash
available. Existing bookings and payments are never deleted or cancelled.

Deactivate by setting `maintenance_mode = false` and clearing the reason. Confirm
the surface returns to the expected environment afterwards.

## 6. Disabling a single payment method

Set `enabled = false` and an appropriate `unavailable_reason_code` on the relevant
`payment_method_availability` row. The client immediately stops offering it and
shows the localized explanation. Cash availability is governed by WPS-007's
cash-debt rules and must not be disabled here to work around a debt issue.

## 7. Prohibited operational actions

- Granting any client role access to a private payment table
- Storing a secret value, PAN, CVV, wallet PIN, or bank credential anywhere
- Marking a payment paid without a verified provider webhook
- Editing ledger history — corrections post new balanced entries
- Debiting a worker externally after payout, under any circumstance
- Presuming worker responsibility for a chargeback
- Deleting a reconciliation exception or quarantine row to clear a queue
- Enabling live mode without the complete decision gate

## 8. Escalation

Financial correctness, suspected fund loss, or suspected credential exposure
escalates immediately to the owner and follows
`docs/operations/payment-incident-runbook.md`.
