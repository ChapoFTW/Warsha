# Warsha financial decisions

## Metadata

- Decision set: WPS-007
- Status: locked for local implementation
- Date: 2026-07-29
- Review owner: Warsha product, finance, legal, security, and engineering

## Decision 1 — EGP-only integer piastres

Decision: all authoritative monetary values use PostgreSQL `bigint` piastres and
TypeScript `bigint` helpers. Formatting is presentation-only.

Rationale: avoids floating-point drift and makes ledger equality exact.

Consequences: inputs accept at most two decimal EGP places; no multi-currency or
foreign-exchange logic exists.

Review trigger: expansion outside Egypt or a provider contract requiring a
different authoritative unit.

## Decision 2 — Ten-percent provider commission

Decision: commission is 1,000 basis points of approved provider gross, floored
at the piastre boundary. Fixed/minimum/maximum commission are absent.

Rationale: implements the locked commercial model deterministically.

Consequences: fractional piastres accrue to provider net because commission is
floored. Clients cannot choose or modify the rate.

Review trigger: an approved commercial-model change with migration, accounting,
product, and legal review.

## Decision 3 — Gateway fees belong to Warsha

Decision: gateway fees are separate Warsha expenses.

Rationale: the customer pays the approved payable total and provider earnings
must not vary with processor pricing.

Consequences: future gateway events must provide fee amounts explicitly; the
system invents no fee.

Review trigger: signed processor terms and an approved accounting mapping.

## Decision 4 — Dual earnings release

Decision: release occurs on customer confirmation or six hours after provider
completion, absent an active dispute.

Rationale: rewards explicit confirmation while avoiding indefinite delay.

Consequences: eligibility timestamps and an idempotent scheduler contract exist.
Automatic delayed release is not operational until a trusted scheduler is
deployed; the UI must disclose that state.

Review trigger: scheduler deployment, dispute-policy revision, or a change to
the six-hour period.

## Decision 5 — No rolling reserve

Decision: no percentage reserve or general holdback exists.

Rationale: all normally released net earnings should be withdrawable.

Consequences: only explicit dispute, withdrawal, investigation, or other
auditable transactional holds may reduce availability.

Review trigger: legal/risk approval of a different reserve model.

## Decision 6 — EGP 200 minimum withdrawal, zero fee

Decision: minimum withdrawal is 20,000 piastres and provider fee is zero.

Rationale: locked launch economics.

Consequences: reservations are atomic and cannot exceed available earnings;
failed/cancelled requests restore the reservation once.

Review trigger: payout-provider commercial terms or approved launch pricing.

## Decision 7 — Provider-neutral masked payout metadata

Decision: launch categories are bank account and supported Egyptian mobile
wallet. Public storage contains masks only; a private fingerprint prevents
duplicates.

Rationale: no provider or compliant secret vault is selected.

Consequences: saving metadata does not make payout operational. Live payout
mode fails closed.

Review trigger: licensed payout provider selection, token format, approved
validation, encryption/vault review, and operational approval.

## Decision 8 — Cash creates commission debt, not clearing funds

Decision: customer pays the provider directly; Warsha accrues 10% provider
commission debt after dual cash confirmation.

Rationale: Warsha never handled the cash and must not represent fictional funds.

Consequences: cash commission debt can be negative from the provider's
perspective; unrelated available earnings cannot become unrestrictedly
negative.

Review trigger: licensed cash-repayment flow or launch cash-policy change.

## Decision 9 — Cash restriction begins above EGP 500

Decision: exactly 50,000 piastres remains allowed; greater debt blocks only new
cash selection.

Rationale: matches the locked inclusive/exclusive interpretation.

Consequences: online work remains allowed and released online earnings offset
cash debt first. Existing bookings are never silently destroyed.

Review trigger: approved risk-policy threshold change.

## Decision 10 — Cumulative-floor pre-release refunds

Decision: partial component reversals use cumulative floor allocation, with the
final refund consuming the exact remainder.

Rationale: deterministic piastre behavior without drift across multiple partial
refunds.

Consequences: immutable reversal entries preserve history; duplicate
idempotency keys cannot duplicate funds.

Review trigger: gateway refund allocation requirements or accounting-policy
revision.

## Decision 11 — Reviewed post-release recovery

Decision: post-release refunds and chargebacks create staff-reviewed cases.
Recovery uses available earnings, then approved provider debt; Warsha absorbs
the remainder.

Rationale: no surprise external debit and no assumption that every chargeback
is provider fault.

Consequences: decisions are auditable and idempotent, future earnings may offset
approved debt, and external provider debit is always false.

Review trigger: licensed-provider recovery capabilities plus legal, risk, and
operations approval.

## Decision 12 — Warsha-funded promotions

Decision: launch promotions reduce only customer payable amount. Provider gross
and commission basis remain the approved job price.

Rationale: providers do not fund Warsha acquisition discounts.

Consequences: promotion expense is a separate ledger component and refund
reversal component. No campaign system is added.

Review trigger: approved promotion funding policy or campaign milestone.

## Decision 13 — No MVP tax engine

Decision: no tax calculation, collection, withholding, or filing.

Rationale: legal and accounting treatment is not finalized.

Consequences: tax remains zero and UX makes no inclusive/exclusive claim.

Review trigger: formal legal/accounting determination and implementation plan.

## Decision 14 — Environment-gated payment methods

Decision: cash and generic online card are architectural methods, but the UI
shows only methods enabled by the server/environment.

Rationale: unavailable methods must not be presented as usable.

Consequences: mock online behavior is development-only; Apple Pay, Google Pay,
Meeza, and wallet collection are not hard-coded.

Review trigger: verified provider capability and commercial approval.

## Decision 15 — Server authority and fail-closed live modes

Decision: configuration, gateway events, ledger posting, releases, refunds,
payout transitions, and debt changes remain server-authoritative.

Rationale: financial state cannot trust an authenticated client.

Consequences: live gateway, payout, webhook, and scheduler modes stay disabled
until credentials, signatures, configuration, approval, and operations exist.

Review trigger: production provider readiness review.

## Decision 16 — One pending price adjustment and immutable versions

Decision: one pending provider proposal per booking; customer acceptance creates
a new price snapshot. Unapproved totals cannot fund payment.

Rationale: explicit informed customer approval and traceable price history.

Consequences: payment-started bookings reject new price changes.

Review trigger: a future multi-line change-order milestone.

## Decision 17 — Product terminology boundary

Decision: use booking price, amount paid, earnings, available to withdraw,
commission due, and financial adjustment. Avoid bank balance, escrow, salary,
employment, investment, interest, and licensed-wallet claims.

Rationale: accurately describes Warsha's marketplace role.

Consequences: product, support, notification, and marketing copy must be audited
when financial surfaces change.

Review trigger: legal review or any new money-holding/provider relationship.
