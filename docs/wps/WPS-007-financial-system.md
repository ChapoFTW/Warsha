# WPS-007 — Warsha Financial System

## Document metadata

- Owner: Warsha product and engineering
- Version: 1.0
- Last updated: 2026-07-29
- Currency: Egyptian pound (EGP)
- Authoritative implementation:
  - `supabase/migrations/202607300001_payments_earnings_ledger.sql`
  - `supabase/migrations/202607300002_financial_spec_alignment.sql`

## Status

**LOCKED — LOCAL IMPLEMENTATION ALIGNED, LIVE PROVIDERS DISABLED**

The schema, accounting rules, authorization boundaries, mock paths, and local
tests are implemented. No hosted migration, live payment provider, live payout
provider, production webhook, scheduler, charge, refund, or withdrawal has been
activated by this work.

## Scope

This specification covers booking payments, immutable price snapshots,
provider earnings, Warsha commission, cash commission debt, withdrawals,
refund accounting, post-release recovery cases, chargeback review boundaries,
Warsha-funded promotion accounting, receipts, localization, and provider-neutral
gateway and payout interfaces.

It does not select a commercial provider, calculate taxes, create coupon
campaigns, generate PDF receipts, or perform live money movement.

## Objectives

- Keep authoritative money in integer piastres (`bigint` in PostgreSQL and
  validated decimal strings backed by TypeScript `bigint`).
- Make every authoritative balance change double-entry, append-only, balanced,
  idempotent, and attributable.
- Preserve customer/provider isolation and deny anonymous financial access.
- Keep commercial configuration server-controlled and auditable.
- Fail closed wherever licensed-provider or operational configuration is absent.
- Use product language that does not describe Warsha as a bank, wallet,
  employer, or escrow provider.

## Locked business rules

1. EGP is the only currency.
2. Provider commission is 10% of the approved gross job price.
3. The commission formula is
   `floor(gross_piastres × commission_bps ÷ 10,000)`.
4. There is no fixed, minimum, or maximum commission.
5. The customer pays no Warsha platform fee.
6. Gateway fees are Warsha expenses and never change the customer total or
   provider earnings.
7. Earnings release on customer confirmation or six hours after provider
   completion, if no active dispute exists.
8. No rolling reserve exists.
9. Minimum withdrawal is 20,000 piastres (EGP 200), with zero launch fee.
10. Launch payout destination categories are Egyptian bank account and a
    supported Egyptian mobile wallet. Stored client-visible values are masked.
11. Cash is paid directly to the provider. Warsha records commission debt but
    no gateway payment or fake clearing funds.
12. Cash acceptance becomes restricted only when cash commission debt is
    greater than 50,000 piastres, not when it equals 50,000.
13. Online work remains available while cash is restricted.
14. Future released online earnings offset cash debt first, then reviewed
    provider recovery debt.
15. Pre-release refunds reverse provider pending earnings, commission, tax
    (currently zero), and Warsha promotion expense proportionally.
16. Post-release refunds and chargebacks require a staff-reviewed financial
    case and never initiate an external provider debit.
17. Launch promotions are funded entirely by Warsha.
18. Only an accepted immutable price snapshot can fund a payment.
19. No tax calculation, collection, withholding, or filing is implemented.
20. Online and payout live modes remain disabled until separately approved.

## Financial flows

### Online booking without a promotion

For an approved price of EGP 1,000:

- Customer payment: EGP 1,000
- Provider gross basis: EGP 1,000
- Warsha commission: EGP 100
- Provider net earning: EGP 900
- Gateway fee: separate Warsha expense when supplied by the future gateway

The payment confirmation transaction debits customer payment clearing and
credits provider pending earnings plus Warsha commission. Tax is zero.

### Online booking with a Warsha-funded promotion

For an approved price of EGP 1,000 and promotion of EGP 100:

- Customer payment: EGP 900
- Warsha promotion expense: EGP 100
- Provider gross basis: EGP 1,000
- Warsha commission: EGP 100
- Provider net earning: EGP 900

The payment confirmation transaction debits customer payment clearing and
Warsha promotion expense, then credits provider pending earnings and commission.

### Cash booking

- Customer pays the provider directly.
- Selecting cash creates no payment attempt and no gateway event.
- Customer confirmation posts only the provider cash commission receivable and
  Warsha commission.
- The provider's cash commission debt may be greater than available earnings.
- No ordinary provider-available account is allowed to become unrestrictedly
  negative.

### Withdrawal

- A provider may request at least EGP 200 and no more than authoritative
  available earnings.
- The transaction moves the requested amount from provider available earnings
  into payout clearing atomically.
- A failed or cancelled request moves it back exactly once.
- A paid transition is possible only in configured mock mode today.
- Live payout mode is disabled and fails closed.

## Ledger behavior

Private ledger accounts and entries are inaccessible to normal clients.
Transactions and entries cannot be mutated or deleted. Every posting has at
least two entries, one currency, equal debit and credit totals, and an
idempotency key.

Provider debt uses provider-scoped receivable accounts:

- `provider_cash_commission_debt`
- `provider_recovery_debt`

Warsha expenses use separate system accounts:

- `warsha_promotion_expense`
- `gateway_fee_expense`
- `warsha_financial_loss`

Cash, promotion, gateway fee, refund, release, debt offset, withdrawal, and
post-release recovery transactions are distinct event types. Ledger history is
reversed with new entries; historical entries are never rewritten.

## Configuration defaults

| Setting | Locked value |
| --- | ---: |
| Currency | EGP |
| Commission | 1,000 bps (10%) |
| Fixed commission | 0 |
| Minimum commission | none |
| Maximum commission | none |
| Minimum withdrawal | 20,000 piastres |
| Withdrawal fee | 0 |
| Earnings release delay | 21,600 seconds |
| Cash debt restriction | greater than 50,000 piastres |
| Rolling reserve | 0 bps / disabled |
| Gateway fee payer | Warsha |
| Gateway mode | disabled |
| Payout mode | disabled |
| Automatic release scheduler | disabled |

Configuration is stored in the private schema. Authenticated, anonymous, and
PUBLIC roles have no direct mutation rights. Every configuration update is
copied to private configuration history with its policy version, timestamp, and
actor where available.

## Customer experience

The customer sees only payment methods enabled for that booking and environment.
In live-disabled Supabase mode, online payment is not selectable. Cash is hidden
with a clear explanation when the provider exceeds the cash-debt threshold.
Mock mode exposes generic online-card simulation as development-only.

Payment and receipt views use:

- approved job price
- Warsha-funded promotion
- amount paid
- payment method and status
- refunded amount
- transaction reference
- relevant timestamps

Customers can explicitly confirm successful completion. The guarded server RPC
releases an eligible earning immediately unless an active dispute exists.

## Provider experience

The provider earnings view separates:

- available to withdraw
- pending earnings
- paid-out earnings
- commission due on cash work
- recoverable financial adjustments
- holds and debt offsets
- minimum withdrawal and zero fee
- payout destination and withdrawal status

Pending records show release eligibility. When the scheduler flag is false, the
UI explicitly says automatic delayed release is not running. The UI does not
claim a bank balance, wallet balance, salary, escrow, or guaranteed settlement.

## Staff operations

Guarded staff RPCs can:

- place or release an earning hold
- review withdrawal state
- create a pre-release refund
- open a post-release refund or chargeback case
- decide provider responsibility and Warsha loss allocation

These RPCs validate staff role inside `SECURITY DEFINER` functions with an empty
`search_path`. Normal clients may possess EXECUTE only where the function itself
must distinguish staff; they cannot bypass the internal role check.

## Security model

- All public financial tables have RLS.
- Customers can read only their payment, receipt, snapshot, adjustment, and
  refund projections.
- Providers can read only their earnings, masked payout metadata, withdrawals,
  cash commission records, holds, and financial cases.
- Customers cannot read provider earnings or payout destinations.
- Providers cannot read another provider's financial data.
- Anonymous users have no table or RPC access to private financial data.
- Private configuration, ledger, gateway events, payout fingerprints, and audit
  events are not client-readable.
- No normal client can mark a payment successful, post a gateway event, create
  ledger money, set payout status, manufacture a refund, release arbitrary
  earnings, or change debt/configuration.
- Every financial `SECURITY DEFINER` function fixes `search_path` to empty and
  fully qualifies database objects.
- Full payout values are used transiently to derive a mask and SHA-256
  fingerprint. The public table stores only the mask. No full credential or
  secret is stored.
- Private gateway and ledger tables are not in Realtime. Published public
  financial tables contain sanitized rows and remain protected by RLS.

## Refund and chargeback recovery

### Before release

Refund component targets are computed from the cumulative refunded amount:

`floor(component × cumulative_refund ÷ customer_payment_amount)`.

Each partial refund posts only the difference between the new cumulative target
and prior reversals. The final refund consumes the exact remaining provider,
commission, promotion, and tax components. This prevents repeated-refund
rounding drift and makes duplicate idempotency keys harmless.

### After release

A staff member creates a reviewed case. A decision allocates:

1. available provider earnings, up to approved responsibility;
2. remaining approved responsibility to provider recovery debt;
3. the remainder to Warsha financial loss.

The decision explicitly records `externalProviderDebit: false`. Future online
earnings can offset the debt. Chargebacks use the same review boundary; provider
responsibility is never presumed.

## Cash commission debt

At confirmed cash collection, the ledger debits provider cash commission debt
and credits Warsha commission. Exactly EGP 500 remains allowed. More than
EGP 500 disables only new cash selection for that provider. Existing payments
and bookings are not deleted or cancelled, and online payment remains available.

On release of future online earnings, cash debt is offset before reviewed
recovery debt. The earning records the exact `debtOffsetMinor`, cash records are
settled oldest first, and the remaining net becomes available.

## Promotions

The `promotion_minor` snapshot component is a Warsha-funded expense.
`discount_minor` remains a compatibility alias constrained to the same value.
Provider gross and commission are based on the approved price before promotion.
Customer total is:

`provider gross − promotion + tax`.

No coupon campaign management was added.

## Gateway boundary

The adapter is provider-neutral. The current trusted mock event processor
supports pending, success, and failure with signature-verification simulation
and unique gateway event IDs. A trusted gateway-fee boundary records fees
separately and idempotently.

Chargeback event storage is structurally supported, but no live webhook or
chargeback integration exists. Live mode requires a selected provider,
credentials, verified raw-body signatures, mapped event semantics, commercial
approval, and operational runbooks.

## Payout boundary

The launch metadata categories are `bank_account` and `mobile_wallet`. Exact
banks, wallets, validation, rails, and provider tokens remain deferred. Saving
masked metadata does not mean the destination is operational. Live payout mode
is disabled and a withdrawal cannot be created or marked paid through that
disabled boundary.

## Localization and terminology

Authoritative values are never formatted or converted to JavaScript `number`.
Presentation formatting emits `EGP 1,250` for whole pounds and retains piastres
only when non-zero. Egyptian Arabic uses localized digits and `ج.م`.

Approved terms include booking price, promotion, amount paid, available to
withdraw, pending earnings, paid-out earnings, commission due on cash work, and
financial adjustment. Bank balance, escrow, salary, employment, interest,
investment, and licensed-wallet claims are prohibited.

## Edge cases

- Amounts outside 0–1,000,000,000 piastres are rejected by the current MVP
  bounds.
- Negative customer/payment/earning amounts are rejected.
- A payment must equal its immutable current price snapshot.
- Only one pending price adjustment may exist per booking.
- Payment-started bookings cannot accept a new price.
- Active disputes prevent both customer and scheduled release.
- A withdrawal reservation serializes per provider.
- Duplicate gateway, fee, refund, release, withdrawal, cash, and case decision
  events are idempotent.
- Zero-value ledger entries are omitted; every posted transaction must still
  have at least two non-zero balanced entries.

## Testing

Automated local coverage includes:

- `financial-spec.test.sql`: 105 locked-rule assertions
- `payments.test.sql`: 101 foundation assertions
- all chat, provider-verification, provider-jobs, reviews, and general RLS suites
- `scripts/payment-money.test.ts`: 11 TypeScript bigint/formatting assertions

### Manual smoke-test checklist

Status: **not performed in this implementation pass**.

Customer:

- [ ] Complete a mock online payment and verify approved price, promotion,
  amount paid, reference, and status.
- [ ] Simulate failure, verify no paid state or earning, then retry successfully.
- [ ] Send the same mock event twice and verify one visible payment/earning.
- [ ] Select cash and verify no hosted/gateway language or attempt.
- [ ] Confirm and reject provider cash reports.
- [ ] Review full and partial refund receipt states.
- [ ] Accept and reject a one-time price revision; verify old, new, difference,
  reason, and immutable snapshot behavior.
- [ ] Verify a Warsha promotion leaves provider basis unchanged.
- [ ] Verify English and Egyptian Arabic financial screens.

Provider:

- [ ] Verify pending earnings and six-hour eligibility timestamp.
- [ ] Verify immediate availability after customer completion confirmation.
- [ ] Open a dispute before release and verify a hold.
- [ ] Verify available-to-withdraw excludes reservations, holds, and offsets.
- [ ] Verify EGP 200 minimum and zero fee messaging.
- [ ] Complete mock withdrawal and simulate failure/reservation release.
- [ ] Confirm cash debt at exactly EGP 500 and above EGP 500.
- [ ] Verify online earnings reduce cash debt while online jobs remain available.
- [ ] Verify payout masks never reveal full input.
- [ ] Verify reviewed post-release adjustment visibility.

Staff/developer:

- [ ] Place and remove an earning hold.
- [ ] Review a withdrawal through each allowed transition.
- [ ] Create and repeat a partial refund idempotency key.
- [ ] Open and decide refund/chargeback cases with several responsibility splits.
- [ ] Verify customer/provider/provider-two isolation on a signed-in device.
- [ ] Verify disabled live gateway, payout, webhook, and scheduler behavior.

## Deployment status

Local migrations reset successfully and local automated validation is required
before every deployment. Hosted deployment has not occurred. The pending
migrations must be reviewed by filename in the deployment dry run.

## Deferred provider-dependent work

- Licensed card gateway selection and commercial contract
- Production credentials and secret management
- Raw webhook signature verification and replay runbook
- Live Apple Pay, Google Pay, Meeza, or wallet collection capabilities
- Licensed payout provider, destination tokens, and exact bank/wallet validation
- Production payout callbacks, reconciliation, and failure operations
- Approved scheduler/cron deployment for six-hour release
- Legal and accounting confirmation, including taxes
- Production refund/chargeback money movement and operations
- Optional PDF receipts

## Changelog

- 2026-07-29: Locked WPS-007 defaults; added promotion-expense accounting,
  six-hour/customer release contract, cash commission debt and threshold,
  online debt offsets, payout fail-closed mode, cumulative refund allocation,
  post-release financial cases, gateway-fee separation, localized bigint
  formatting, client capability gating, tests, and security documentation.
## WPS-012 operational integration

WPS-012 additional-work requests call the existing price-adjustment proposal/response RPCs and store only the resulting adjustment reference. Operational events, photos, delays, inspection, warranty, and return visits create no payment, earning, refund, fee, or ledger mutation. Canonical first completion continues to trigger this specification exactly once; return-visit sections leave the completed booking and released financial history unchanged.

## WPS-013 dispute integration

WPS-013 submitted cases reuse this specification's existing earning hold/release checks. Any partial compensation delegates to the existing pre-release refund or post-release financial-case RPC and stores only the resulting reference; dispute logic never creates a second ledger, calculates money client-side, or performs live movement.

## WPS-014 notification integration

WPS-014 classifies and routes this specification's payment, refund, earning, withdrawal, and cash-debt events without changing their state machines or ledger authority. Financial notices are mandatory in-app where required, contain only routing identifiers, never expose amounts or credentials externally, and never perform money mutation from notification actions.
