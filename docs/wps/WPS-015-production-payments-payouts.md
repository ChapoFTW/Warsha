# WPS-015 — Production Payments, Payouts & Reconciliation

## Document metadata

| Field | Value |
| --- | --- |
| Specification | WPS-015 |
| Version: 1.0 | |
| Status: LOCKED FOR IMPLEMENTATION | |
| Authority: Warsha Constitution | |
| Depends on: WPS-001 through WPS-014 | |
| Owner | Sief Abdelghfar |
| Currency | Egyptian pound (EGP) |
| Authoritative migration | `supabase/migrations/202608020003_wps015_production_payments_payouts.sql` |

**WPS-007 remains the financial accounting and product authority.** WPS-015 extends
it with the production boundary — provider abstraction, webhook security,
reconciliation, chargebacks, payout operations, and the release scheduler. Where
this document and WPS-007 could be read as conflicting, WPS-007 prevails on
accounting, commission, refunds, earnings, debt, and ledger semantics.

## Scope

WPS-015 covers the production-readiness layer around the existing financial
system: provider-neutral payment intents and checkout, verified webhook
processing, settlement import and reconciliation, chargeback intake, payout
destination tokenization, payout event processing, the six-hour release
scheduler, configuration and secret boundaries, staff operations, and the
customer- and worker-facing production surfaces.

It does **not** select a commercial provider, execute real payments, execute real
payouts, enable webhooks, enable the scheduler, calculate taxes, or perform any
live money movement. See `docs/decisions/payment-provider-selection.md`.

## What WPS-015 explicitly does not do

- It **does not create a second ledger.** Every authoritative posting continues to
  flow through `private.post_financial_transaction` using the existing WPS-007
  transaction types. No new ledger transaction type was introduced.
- It does not create a second payment state machine. `financial_booking_payments`
  remains the authoritative payment status; attempts are a checkout-lifecycle
  concern layered beneath it.
- It does not bypass booking price snapshots, commission, earnings, refunds,
  holds, withdrawals, promotions, cash debt, or double-entry accounting.
- It does not introduce a simplified payment table that avoids the ledger.

## Locked financial rules carried forward from WPS-007

These are restated so that no implementation can drift from them. They are
unchanged, and WPS-015 found no contradiction in the locked authority.

1. Currency is EGP only.
2. Amounts are authoritative as **integer piastres**, stored as **bigint** in
   PostgreSQL and handled as TypeScript `bigint`. No authoritative amount is ever
   converted to a JavaScript `number`.
3. Commission is **10%** of the approved gross job price.
4. Commission rounding is **floor** at the piastre boundary:
   `floor(gross_piastres × commission_bps ÷ 10,000)`.
5. Minimum withdrawal is **EGP 200** (20,000 piastres).
6. Withdrawal fee is **zero**.
7. Rolling reserve: **none**.
8. Earnings release eligibility is **six hours** after provider completion, or
   immediately on customer confirmation, when no active dispute exists.
9. Customer-confirmed release remains available.
10. Dispute holds continue to block release.
11. Promotions are funded entirely by Warsha, and a promotion **does not** reduce
    worker gross or the commission basis.
12. Gateway fees are a separate Warsha expense and never change the customer total
    or worker earnings.
13. Cash commission debt is recorded with no fake clearing entries.
14. The cash-debt restriction threshold is exactly **EGP 500**: exactly EGP 500 is
    still allowed; more than EGP 500 restricts only new cash selection.
15. Future released online earnings offset cash debt first, then reviewed recovery debt.
16. **No external debit from a worker after payout**, under any circumstance.
17. Post-release refunds and chargebacks require a staff-reviewed recovery case.
18. No fake gateway money and no fake clearing entries for cash.
19. No wallet-balance or bank-balance language.
20. No escrow claims unless legally and operationally accurate — Warsha makes none.

## Environment model

Every payment surface resolves to exactly one authoritative environment:

| Mode | Meaning |
| --- | --- |
| `disabled` | The surface is unavailable. This is the default and the fail-closed target. |
| `mock` | Local development simulation. No external call, no real funds, explicitly development-only. |
| `sandbox` | Provider test environment. Requires a complete sandbox configuration. |
| `live` | Real money. Requires a complete live configuration and the full decision gate. |

A `sandbox` or `live` surface **degrades to `disabled`** whenever any required
element is missing: a named provider, an activated provider account for that exact
environment, registered API credentials, and — for the gateway — a registered
webhook signing secret. Sandbox and live credentials can never be mixed, because a
provider account is unique per `(provider_key, environment)`.

Maintenance mode disables every online surface immediately.

## Payment methods

Availability is **server-authoritative**. The client renders only what the server
permits and never declares a method available on its own.

| Method | Launch status |
| --- | --- |
| Cash | Available. Governed by WPS-007 as an explicit offline method. |
| Bank card | Disabled — `provider_not_selected` |
| Meeza card | Disabled — `provider_not_selected` |
| Mobile wallet | Disabled — `provider_not_selected` |
| Hosted checkout | Disabled — `provider_not_selected` |

Only methods confirmed as supported by a selected and configured provider are ever
exposed. Card data is never handled inside Warsha; collection happens in a
provider-hosted or provider-native secure context. Fees and the total are shown
before confirmation. All states are accessible, retry-safe, and available in
English and Egyptian Arabic with RTL.

## Payment intents and checkout

The authoritative amount is derived from the locked booking price snapshot — never
from the client. Intent creation validates customer and booking ownership, carries
an idempotency key, records a provider reference and checkout expiry, and returns
only a safe return route.

The app distinguishes these states, and never collapses them:

`preparing` · `awaiting customer` · `processing` · `succeeded` · `failed` ·
`cancelled` · `expired` · `requires review`

Rules:

- A success redirect **never** marks a payment paid. The client return handler
  only reveals authoritative server state and records that the customer returned.
- A payment becomes paid solely through a verified provider webhook.
- Duplicate taps cannot open parallel checkouts: retry creates a new attempt only
  after a valid terminal failure (`failed`, `cancelled`, `expired`).
- There is no optimistic ledger posting and no client-side paid state.
- An expired checkout is resolved deterministically rather than left pending.

## Webhook security

The production webhook boundary is implemented and **not enabled**. Processing
refuses to act unless the gateway surface is `sandbox` or `live` with complete
configuration. Every event is validated for:

raw-body signature verification · timestamp/replay window · environment match ·
provider account match · event allowlist · event schema · currency · amount
against the immutable snapshot

Failures are quarantined with a reason code and an immutable `raw_body_sha256`
fingerprint. No raw provider payload is retained and none is ever exposed to a
client. Events are idempotent per `(provider, environment, event id)`; duplicates
are reported as duplicates; late and out-of-order events never move a terminal
attempt backwards; unknown events are quarantined for staff review; an amount
mismatch moves the attempt to `requires_review` instead of being accepted.

Webhook processing never trusts a client redirect, a query-string status, a
client-provided amount, a client-provided booking state, or an unsigned event.

## Ledger posting

Successful online payments post through the existing WPS-007 authority only:
balanced, immutable, single-currency, idempotent entries covering commission,
worker gross, Warsha promotion expense, gateway-fee expense, clearing, and refund
liability where applicable. Cash remains separate with no clearing entries. There
is no direct client ledger mutation, no posting before authoritative success, and
no duplicate posting after a webhook retry.

## Refunds

Full and partial refunds use the existing cumulative proportional component
reversal with exact final rounding, unreleased earning reversal, and released
earning recovery cases. Refunds are staff-authorized, integrate with WPS-013
resolutions, and are never initiated directly by a client against the provider.

External refund state and internal ledger state remain explicitly
distinguishable. Warsha does not claim an external refund completed until provider
confirmation is authoritative, and a provider failure never corrupts the ledger.

## Chargebacks

WPS-015 owns payment-provider chargeback processing. **WPS-013 owns** customer–worker
service disputes; the two never merge.

Chargeback intake records the provider reference, amount, reason, status, and
evidence deadline, and always returns `requiresStaffReview`. Worker responsibility
is **never presumed** and never automatic. Financial recovery happens only through
the existing staff-reviewed WPS-007 post-release case, which records
`externalProviderDebit: false`. Chargebacks never directly alter public ranking or
reputation.

## Payout destinations

Launch categories remain Egyptian bank account and Egyptian mobile wallet.

Warsha never stores raw bank credentials or wallet PINs. It stores a provider
token where supported, a masked value, and a SHA-256 fingerprint for duplicate
detection. Ownership, verification status, default selection, disabled state, and
replacement are all supported. Destinations are invisible to customers and to
unrelated workers, and are never published to Realtime.

**If provider tokenization is unavailable, the destination fails closed** rather
than Warsha retaining sensitive raw details.

## Withdrawals and payouts

Withdrawal reservation, the EGP 200 minimum, the zero Warsha fee, exactly-once
reservation release on failure, and exactly-once finalization on success remain
WPS-007 behavior. WPS-015 adds provider payout references, idempotency, verified
payout event processing, manual review, and reconciliation.

**The client cannot mark a payout successful.** Payouts remain disabled until the
full decision gate in the provider selection document is satisfied.

## Six-hour release scheduler

Prepared and **disabled by default**. Server-side only, idempotent by run key,
concurrency-safe, replayable, and locally simulatable. It scans only eligible
earnings and delegates to the existing WPS-007 release authority, which already
honours customer confirmation, disputes, holds, and cash-debt offsets. It logs
safe operational outcomes only. It is not activated.

## Reconciliation

Reconciliation **detects differences; it never conceals them.** A daily run
compares Warsha payment attempts against provider settlements and produces typed
exceptions: unmatched provider record, unmatched Warsha record, amount mismatch,
currency mismatch, duplicate record, missing webhook, late webhook, orphan
provider event, ledger imbalance, and payout mismatch.

Every run performs an explicit debit/credit balancing check across the
authoritative ledger. Exceptions enter a queue for staff resolution. Resolution is
an audit record: it never rewrites ledger history and never performs an automatic
destructive correction.

## Configuration and secrets

Public client configuration, private server configuration, secrets, commercial
policy, and environment mode are separated. **No secret value is ever stored in the
database** — only metadata (which secret role is registered, when it was rotated,
when rotation is due). No secret appears in any Expo client bundle or in Git.
Environment diagnostics are sanitized, configuration changes are audited, and
staff cannot expose secrets.

## Staff operations

Guarded contracts exist for: viewing a payment attempt and safe provider status,
retrying reconciliation, initiating an approved refund, reviewing a failed refund,
reviewing a withdrawal, reviewing a payout failure, reviewing a chargeback,
placing and releasing an earning hold, inspecting a safe ledger transaction,
inspecting a provider-event audit, disabling a provider method, and activating
maintenance mode. A full Admin UI is deferred; the contracts and runbooks are
complete. No raw secret or sensitive provider payload is exposed.

## Customer experience

Shows price components, promotion, total, payment method, authoritative status,
retry, receipt, refund state, cash confirmation, and a clear explanation when a
method is unavailable. Prohibited: wallet-balance language, escrow guarantees,
instant-refund promises, technical gateway terminology, and raw provider errors.

## Worker experience

Answers only: available to withdraw, pending earnings, paid-out earnings, cash
commission due, payout destination, withdrawal status, and hold/review status.
No accounting dashboards, charts, bank-balance language, employment language,
settlement guarantees, or provider API terminology.

## Notifications

Reuses WPS-014 without changing its state machines. Normalized events: payment
required, payment succeeded, payment failed, refund initiated, refund completed,
refund failed/review, earning pending, earning available, earning held, withdrawal
requested, withdrawal processing, withdrawal succeeded, withdrawal failed, payout
destination requires attention, chargeback update, and cash debt threshold
warning. External previews stay generic and privacy-safe, carrying routing
identifiers only.

## Security and compliance

PCI scope is minimized by never handling card data. No PAN, CVV, PIN, or raw wallet
credential is stored. Clients hold no success authority and cannot mutate the
ledger, commission, or provider references. Provider, reconciliation, settlement,
chargeback, quarantine, scheduler, and secret-metadata tables are private with no
client grants and no Realtime publication. Every WPS-015 `SECURITY DEFINER`
function pins an empty `search_path` and fully qualifies object references.

The formal threat model is `docs/architecture/payment-threat-model.md`.

**No legal, tax, PCI, or regulatory approval is claimed.** Every such item requires
external professional confirmation and is recorded as an unresolved blocker.

## Mock and sandbox

Mock mode is preserved with no external calls, deterministic simulations, account
isolation, and explicit development-only labelling. It never claims a licensed
provider. Provider sandbox support activates only when a provider is selected and
credentials are supplied. A sandbox or live failure never falls back to Mock
writes. No real funds are involved anywhere.

## Deployment status

Local only. The migration is validated by a clean local reset and the full pgTAP
suite. Hosted migration is **not authorized** by this work. Production push, live
provider activation, webhooks, refunds, withdrawals, chargeback processing, and the
scheduler all remain **disabled**. All 60 manual alpha cases are **NOT RUN**.

## Changelog

- 2026-08-02 — Version 1.0. Initial locked specification. Provider-neutral
  production foundation implemented; provider activation deferred to a formal
  decision gate.
