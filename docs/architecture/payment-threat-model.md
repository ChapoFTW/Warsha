# Warsha Payment Threat Model

| Field | Value |
| --- | --- |
| Authority | Constitution → WPS-007 → WPS-015 |
| Status | Baseline — no live provider is configured |
| Owner | Sief Abdelghfar |
| Last reviewed | 2026-08-02 |

This is a formal engineering threat model. It makes **no legal, tax, PCI, or
regulatory approval claim**; every such item requires external professional
confirmation and is tracked as an unresolved blocker in
`docs/decisions/payment-provider-selection.md`.

## Assets

| Asset | Sensitivity |
| --- | --- |
| Authoritative ledger entries | Critical — integrity |
| Booking price snapshots | Critical — integrity |
| Provider API and webhook signing secrets | Critical — confidentiality |
| Payout destination tokens and fingerprints | High — confidentiality |
| Worker earnings, debt, and withdrawal state | High — integrity and confidentiality |
| Customer payment status and receipts | High — integrity and confidentiality |
| Provider event audit and reconciliation history | High — integrity, non-repudiation |
| Worker national ID (if a provider requires it for payouts) | Critical — confidentiality, minimization |

## Trust boundaries

1. **Client → Supabase.** The Expo client is fully untrusted. It holds no secret
   and no authority over money.
2. **Provider → Warsha server.** Inbound webhooks are untrusted until the raw-body
   signature is verified.
3. **Warsha server → Provider.** Outbound calls carry secrets that exist only in
   the server secret store.
4. **Staff → Warsha server.** Staff are trusted for review, not for arbitrary
   money mutation or secret access.

## Threats and controls

### T1 — Client forges a successful payment

*Vector:* tampered redirect, spoofed query string, direct table write, replayed RPC.

**Controls.** `authenticated` holds no `INSERT`/`UPDATE`/`DELETE` on financial
tables. `resolve_payment_checkout_return` reveals authoritative state only and can
never set `paid`. A payment becomes paid solely through a verified provider
webhook. Ledger posting is `SECURITY DEFINER` and private.
*Residual:* none identified at the database layer.

### T2 — Forged or replayed provider webhook

*Vector:* unsigned request, captured-and-replayed event, cross-environment event.

**Controls.** Raw-body signature verification; replay window (default 300s,
bounded 30–3600); environment and provider-account matching; event allowlist;
schema validation; idempotency per `(provider, environment, event id)`; quarantine
with reason code on any failure.
*Residual:* depends on the selected provider's signing scheme, which is an
unresolved blocker. Verification must use the **raw** body — re-serializing before
verification breaks the guarantee.

### T3 — Amount manipulation

*Vector:* client-supplied amount, provider reporting a different amount.

**Controls.** The amount derives from the immutable booking snapshot. A webhook
amount that disagrees is quarantined as `amount_mismatch` and the attempt moves to
`requires_review`. Reconciliation raises `amount_mismatch` independently.
*Residual:* requires human resolution by design; never auto-accepted.

### T4 — Duplicate or double posting

*Vector:* webhook retry, duplicate tap, concurrent request.

**Controls.** Unique index on provider event identity; unique index on
`(provider_adapter, environment, provider_reference)`; ledger idempotency keys;
retry permitted only after a valid terminal failure; withdrawal reservation
serializes per worker.
*Residual:* none identified.

### T5 — Secret exposure

*Vector:* secret in the Expo bundle, in Git, in the database, or in logs.

**Controls.** No secret value is stored in the database — only metadata. No
`EXPO_PUBLIC_*` secret is permitted; `assertNoClientPaymentSecrets` fails the build
contract if one appears. Secrets live only in the server secret store. Diagnostics
are sanitized. Rotation is documented with an overlap window.
*Residual:* an Expo bundle is publicly readable by design; any secret placed there
is permanently compromised. This is why no client-side provider call exists.

### T6 — Cross-account financial data exposure

*Vector:* customer reading worker payout data, worker reading another worker's
earnings, anonymous access.

**Controls.** RLS on public financial tables; owner-scoped policies; every WPS-015
table private with no client grants; `anon` revoked from every payment RPC;
Realtime publishes no private table.
*Residual:* none identified.

### T7 — Card data entering Warsha scope

*Vector:* building a native card form, logging a payload.

**Controls.** No PAN, CVV, PIN, or raw wallet credential is stored or accepted.
Collection occurs only in a provider-hosted or provider-native secure context. No
raw provider payload is retained — quarantine stores only a SHA-256 fingerprint.
*Residual:* PCI scope is *minimized by architecture*; this is **not** a PCI
assessment or certification.

### T8 — Payout to a wrong or hostile destination

*Vector:* unverified destination, destination swapped before payout, stored raw
credentials.

**Controls.** Ownership validation; verification status; SHA-256 fingerprint
duplicate detection; masked display only; tokenization required — a destination
that is not `tokenized` **fails closed** rather than being paid against raw
details. Destinations are invisible to customers and unrelated workers.
*Residual:* provider tokenization availability is an unresolved blocker; without
it, payouts stay disabled.

### T9 — Chargeback abuse and unfair worker loss

*Vector:* fraudulent chargeback, automatic worker debit.

**Controls.** Chargeback intake always requires staff review. Worker
responsibility is never presumed. No external debit from a worker after payout,
ever. Recovery flows only through the reviewed WPS-007 post-release case recording
`externalProviderDebit: false`. Chargebacks never alter ranking or reputation.
*Residual:* commercial liability allocation is an unresolved blocker.

### T10 — Silent financial drift

*Vector:* provider and Warsha diverging unnoticed; reconciliation concealing a gap.

**Controls.** Daily reconciliation with typed exceptions; explicit debit/credit
balancing per date; immutable exception and quarantine history; resolution is
audit-only and never rewrites history; deletion to clear a queue is prohibited.
*Residual:* requires operational discipline; the runbook makes it explicit.

### T11 — Privilege escalation through staff tooling

*Vector:* staff RPC used to mint money or read secrets.

**Controls.** `private.is_staff()` checked inside `SECURITY DEFINER` functions with
empty `search_path`. Staff summary returns counts and safe status only. Staff
cannot expose secrets, edit ledger history, or mark a payment paid.
*Residual:* staff can resolve exceptions; resolution is audited and non-destructive.

### T12 — Worker national-ID over-collection

*Vector:* a payout provider requiring a recipient national ID for every disbursement.

**Controls.** Not implemented. No national ID is collected for payouts today.
*Residual:* **unresolved blocker.** If the selected provider requires it, the
lawfulness, proportionality, retention limit, and access control must be confirmed
by Egyptian legal counsel before any collection begins.

### T13 — search_path and injection attacks on definer functions

**Controls.** Every WPS-015 `SECURITY DEFINER` function pins `search_path = ''`
and fully qualifies every object reference; a pgTAP assertion enforces this.
*Residual:* none identified.

## Fail-closed summary

| Condition | Result |
| --- | --- |
| No provider selected | Every online surface `disabled` |
| Provider named, no activated account | `disabled` |
| Account present, webhook secret unregistered | Gateway `disabled` |
| Maintenance mode on | Every online surface `disabled` |
| Reconciliation not enabled | Run returns `disabled`, creates nothing |
| Scheduler not enabled | Batch returns `disabled`, releases nothing |
| Chargeback handling not enabled | Intake returns `disabled` |
| Destination not tokenized | Payout closed |

## Review triggers

Re-review this model when a provider is selected, when any mode is enabled, when a
webhook scheme changes, when payout tokenization becomes available, or after any
SEV1 incident.
