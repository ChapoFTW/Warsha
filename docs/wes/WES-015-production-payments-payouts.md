# WES-015 — Production Payments, Payouts & Reconciliation (Engineering)

## Document metadata

| Field | Value |
| --- | --- |
| Specification | WES-015 |
| Version: 1.0 | |
| Status: ENGINEERING BASELINE | |
| Implements: WPS-015 | |
| Authority: Constitution → WPS-007 → WPS-015 → WES-015 | |
| Owner | Sief Abdelghfar |
| Migration | `supabase/migrations/202608020003_wps015_production_payments_payouts.sql` |

Where this document and WPS-015 could be read as conflicting, WPS-015 prevails.
Where WPS-015 and WPS-007 could be read as conflicting on accounting, WPS-007
prevails.

## Design rules

1. **One ledger.** All money posts through `private.post_financial_transaction`
   with the existing WPS-007 transaction types. WES-015 introduces no new ledger
   transaction type, no ledger table, and no bypass table.
2. **One payment state machine.** `public.financial_booking_payments.status`
   stays authoritative. `private.payment_attempts.status` is a checkout-lifecycle
   concern beneath it and never substitutes for it.
3. **Fail closed.** Every surface resolves through
   `private.payment_surface_environment(...)`, which returns `disabled` unless
   every configuration precondition holds.
4. **No secret in the database.** Only secret *metadata* is stored.
5. **Server authority.** No client input decides availability, amount, or success.
6. **Empty `search_path`.** Every `SECURITY DEFINER` function pins
   `set search_path = ''` and fully qualifies object references.

## Schema additions

All additions are in the `private` schema with `revoke all ... from public, anon,
authenticated`, and none are published to Realtime.

| Table | Purpose |
| --- | --- |
| `payment_provider_registry` | Provider catalogue with capability flags and selection status. No credentials. |
| `payment_provider_accounts` | Merchant account binding, unique per `(provider_key, environment)`. Booleans record that a secret was registered out of band. |
| `payment_method_availability` | Server-authoritative method availability per environment, with a typed unavailability reason. |
| `payment_secret_metadata` | Which secret roles are registered and when they rotate. **No secret values.** |
| `payment_webhook_quarantine` | Rejected or unknown events with a reason code and `raw_body_sha256` fingerprint. No payload. |
| `payment_settlements` / `payment_settlement_lines` | Imported provider settlement statements. |
| `reconciliation_runs` / `reconciliation_exceptions` | Daily reconciliation runs and the typed exception queue. |
| `payment_chargebacks` | Provider chargeback records linked to a reviewed WPS-007 financial case. |
| `payout_provider_references` | Payout destination tokenization state. Fails closed without a token. |
| `payout_provider_events` | Verified payout provider events, idempotent per provider event id. |
| `earning_release_scheduler_runs` | Scheduler run audit, including disabled runs. |

### Extensions to existing tables

- `payment_configuration`: `gateway_mode` and `payout_mode` widened to
  `disabled|mock|sandbox|live`; added `active_payment_provider`,
  `active_payout_provider`, `webhook_replay_tolerance_seconds` (30–3600, default
  300), `reconciliation_enabled`, `chargeback_handling_enabled`,
  `maintenance_mode`, `maintenance_reason`. Constraints forbid a non-mock mode
  without a named provider.
- `payment_attempts`: `status` gains `requires_review`; added `environment`,
  `provider_reference`, `checkout_expires_at`, `return_route`, `failure_code`,
  `terminal_at`. A partial unique index on
  `(provider_adapter, environment, provider_reference)` makes a duplicated
  provider record incapable of creating a second attempt.
- `payment_gateway_events`: `processing_status` gains `duplicate` and
  `quarantined`; added `environment`, `provider_account_id`,
  `signature_algorithm`, `provider_event_at`, `replay_window_ok`,
  `quarantine_reason`, `processed_at`. A unique index on
  `(gateway_name, environment, gateway_event_id)` enforces event idempotency.

## Functions

### Readiness

`private.payment_surface_environment(p_surface text) → text`
Returns `disabled|mock|sandbox|live`. For `sandbox`/`live` it requires a named
provider, an activated account for that exact environment, registered API
credentials, and — for the gateway — both a registered webhook secret on the
account and a registered `webhook_signing` secret-metadata row. Maintenance mode
forces `disabled`.

`private.payment_method_enabled(p_method_key text) → boolean`
Resolves a method against the current gateway environment. `cash` resolves against
the `live` row because it is an offline method governed by WPS-007.

### Client projections (`authenticated` only, `anon` revoked)

- `public.get_production_payment_capabilities()` — safe environment and policy summary.
- `public.get_payment_method_availability()` — server-authoritative method list.
- `public.resolve_payment_checkout_return(p_attempt_id uuid)` — reveals authoritative
  state after a hosted-checkout return, expires a stale checkout deterministically,
  and **never** marks a payment paid.

### Trusted server boundary (no client grant)

- `private.process_verified_payment_webhook(...)` — validates signature, environment,
  replay window, event allowlist, currency, attempt linkage, and amount against the
  immutable snapshot; quarantines on any failure; idempotent per provider event;
  tolerant of late and out-of-order events; moves an amount mismatch to
  `requires_review`. Marking the attempt succeeded is all it does — the money
  posting stays with WPS-007 so exactly one balanced transaction exists per
  authoritative event.
- `private.run_payment_reconciliation(p_business_date, p_run_kind, p_idempotency_key)` —
  disabled unless `reconciliation_enabled`; idempotent by run key; emits typed
  exceptions and an explicit debit/credit balancing check.
- `private.run_earning_release_batch(p_limit, p_run_reason, p_idempotency_key)` —
  disabled by default; idempotent; delegates to
  `private.release_eligible_provider_earnings`.
- `private.process_verified_payout_event(...)` — quarantines unsigned or
  mismatched events; idempotent; leaves withdrawal state to the WPS-007 review RPC
  so reservations release exactly once.
- `private.record_payment_chargeback(...)` — disabled unless
  `chargeback_handling_enabled`; always returns `requiresStaffReview`.

### Staff

- `public.review_reconciliation_exception(p_exception_id, p_status, p_resolution_note)` —
  `private.is_staff()` gated; audit-only resolution that never rewrites ledger history.
- `public.get_staff_payment_operations_summary()` — counts and safe status only.

## Client architecture

| Module | Responsibility |
| --- | --- |
| `src/payments/production-payment-types.ts` | Environment, method, attempt-status, and checkout-phase contracts, plus the pure `checkoutPhaseFor`, `canCreateRetryAttempt`, and `onlineMethodsSelectable` helpers. |
| `src/payments/production-payment-repository.ts` | Mock/Supabase isolation, safe RPC projections, `assertNoClientPaymentSecrets`, and `effectiveEnvironment` degradation. |
| `src/payments/production-payment-translations.ts` | English and Egyptian Arabic copy with the prohibited-language rules encoded. |

Mock mode performs no external call, reports
`onlinePaymentsDevelopmentOnly: true`, and never falls back from a sandbox or live
failure to a Mock write. Amounts remain `bigint`-backed strings; no authoritative
amount is converted to `number`.

## Test coverage

- `supabase/tests/database/production-payments-payouts.test.sql` — 84 assertions
  covering disabled/mock/sandbox/live resolution, live fail-closed, credential
  separation, maintenance mode, signature/replay/environment/allowlist/currency/
  orphan webhook rejection, quarantine without payloads, reconciliation
  idempotency and balancing, scheduler disablement and idempotency, payout
  tokenization fail-closed, chargeback disablement, private-table isolation,
  RPC grants, empty `search_path`, Realtime safety, and staff authority.
- `scripts/wps015-production-payments.test.mts` — client and documentation
  contracts, locked-rule preservation, no-second-ledger checks, secret-boundary
  enforcement, checkout phase behavior, localization parity, prohibited language,
  and the motto regression.

## Deferred

- Provider-specific signature verification (algorithm and canonical payload)
- Provider-specific intent creation and refund calls
- Edge Function deployment and secret provisioning
- Admin UI surfaces for staff contracts
- Tax calculation (none exists, per WPS-007)

## Changelog

- 2026-08-02 — Version 1.0. Initial engineering baseline.
