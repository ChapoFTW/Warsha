# WPS-015 Production Readiness Checklist

| Field | Value |
| --- | --- |
| Specification | WPS-015 v1.0 |
| Overall readiness | **NOT READY — provider selection deferred** |
| Live money movement | **DISABLED** |
| Owner sign-off | Not given |

Every unchecked box below blocks live operation. The database enforces most of
them by construction: an incomplete configuration resolves to `disabled` and
cannot be overridden from a client.

## 1. Provider selection gate

- [ ] Provider selected for payment acceptance
- [ ] Provider selected for payouts (may differ)
- [ ] Entity eligibility confirmed (individual vs incorporated; Commercial Register requirement)
- [ ] Commercial terms agreed: merchant discount rate, per-transaction fees, payout fees, settlement schedule
- [ ] Confirmed **no rolling reserve** is required (WPS-007 locks zero; a reserve requires constitutional review)
- [ ] Confirmed **partial refunds** are supported (required by the cumulative reversal model)
- [ ] Confirmed webhook signing scheme: algorithm, canonical payload, timestamp semantics
- [ ] Confirmed idempotency mechanism
- [ ] Confirmed reconciliation export or inquiry API
- [ ] Chargeback liability allocation and evidence window agreed
- [ ] Contract executed

Reference: `docs/decisions/payment-provider-selection.md`.

## 2. Legal and regulatory gate

- [ ] Egyptian legal confirmation of marketplace disbursement licensing
- [ ] Data protection confirmation for any worker national-ID processing required by the payout provider
- [ ] Tax treatment confirmed (withholding, VAT, reporting) — WPS-007 implements none
- [ ] Accounting sign-off on the ledger model and commission treatment
- [ ] Confirmation that no product language implies escrow, banking, or employment

**No legal, tax, PCI, or regulatory approval may be recorded here without external
professional confirmation.**

## 3. Technical gate

- [ ] Provider registered in `payment_provider_registry` with `selection_status = 'approved'`
- [ ] Sandbox account row created and activated
- [ ] Sandbox API credentials registered out of band
- [ ] Sandbox webhook signing secret registered; `payment_secret_metadata` row present
- [ ] Provider-specific signature verification implemented against the raw request body
- [ ] End-to-end sandbox verification: succeeded, failed, cancelled, expired, refund, chargeback
- [ ] Replay rejection verified in sandbox
- [ ] Duplicate and out-of-order event handling verified in sandbox
- [ ] Amount and currency mismatch handling verified in sandbox
- [ ] Payout destination tokenization confirmed available (otherwise payouts stay closed)
- [ ] Payout event processing verified in sandbox
- [ ] Reconciliation run against a real sandbox settlement statement
- [ ] Edge Function or server webhook boundary deployed
- [ ] Secrets deployed to the server secret store only — never to Git or any Expo bundle

## 4. Operational gate

- [ ] `docs/operations/payment-operations-runbook.md` reviewed and approved
- [ ] `docs/operations/payment-incident-runbook.md` reviewed and approved
- [ ] `docs/operations/payment-reconciliation-runbook.md` reviewed and approved
- [ ] `docs/architecture/payment-threat-model.md` reviewed after provider selection
- [ ] Staff trained on the exception queue and quarantine review
- [ ] Alerting configured for quarantine growth, missing webhooks, and ledger imbalance
- [ ] Secret rotation schedule agreed with an overlap window
- [ ] Maintenance-mode procedure rehearsed

## 5. Quality gate

- [x] Clean local reset applying the chain through `202608020003`
- [x] Full pgTAP: 18 files / 1,289 assertions, `Result: PASS`
- [x] WPS-015 pgTAP: 84/84 assertions
- [x] WPS-015 regression: 190/190 checks
- [x] 15 regression suites, zero failures
- [x] TypeScript, ESLint, mojibake, `git diff --check` clean
- [x] Expo Doctor 18/18
- [x] Cache-cleared Android, iOS and web exports
- [ ] 60 manual alpha cases executed — currently **NOT RUN**
- [ ] Physical-device acceptance — **not claimed**

## 6. Enablement sequence

Modes are enabled in order; each requires owner authorization and cannot be
reached while any precondition is missing.

1. [ ] `mock` — development only (no approval required; never implies a provider)
2. [ ] `sandbox` — after the technical gate
3. [ ] `live` — after every gate above, plus:
   - [ ] Owner authorization for the hosted migration `202608020003`
   - [ ] Owner authorization to set `gateway_mode = 'live'`
   - [ ] Owner authorization to set `payout_mode = 'live'`
   - [ ] Owner authorization to set `reconciliation_enabled = true`
   - [ ] Owner authorization to set `chargeback_handling_enabled = true`
   - [ ] Owner authorization to set `automatic_release_scheduler_enabled = true`

## 7. Current state

| Setting | Value |
| --- | --- |
| `gateway_mode` | `disabled` |
| `payout_mode` | `disabled` |
| `active_payment_provider` | none |
| `active_payout_provider` | none |
| `reconciliation_enabled` | `false` |
| `chargeback_handling_enabled` | `false` |
| `automatic_release_scheduler_enabled` | `false` |
| `maintenance_mode` | `false` |
| Online payment methods | all disabled — `provider_not_selected` |
| Cash | available (governed by WPS-007) |
| Provider accounts configured | 0 |
| Secret metadata registered | 0 |

Pending hosted migration: `202608020003_wps015_production_payments_payouts.sql`.
Deployment command (**not executed**): `npx.cmd supabase db push --linked`.
