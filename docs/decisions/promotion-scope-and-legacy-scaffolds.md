# Decision: promotion scope, and the two dormant scaffolds

| Field | Value |
| --- | --- |
| Date | 2026-08-05 |
| Authority | WPS-021 |
| Status | **DECIDED** |

---

## 1. Promotions are staff instruments, not a customer feature

**Decision.** No public promo-code entry, no public campaign browsing, no
influencer or affiliate codes, no self-service codes, no automatic first-booking
discount, and no urgency mechanics.

**Why.** Each of those turns a discount into a bearer instrument that circulates
outside Warsha's control. A code box invites guessing and farming; a browsable
campaign list is a list somebody screenshots and resells; an automatic discount
is spending nobody approved. The owner's locked scope removed them, and the
implementation makes them structurally absent rather than merely unbuilt — there
is no client path to enumerate campaigns, so re-adding a code box would require
new server surface, not just a new screen.

**Consequence, stated honestly.** A customer cannot be handed a code by a
marketing campaign and type it in. Promotions reach people only through a
server-side eligibility grant. If Warsha later needs shareable codes, that is a
new WPS with its own abuse analysis — not a small addition to this one.

## 2. A referral reward is an automatic, bounded, redeemable benefit

> **Superseded 2026-08-05.** The original text of this section is preserved in
> §2a below, because the reasoning that produced the wrong answer is worth
> keeping.

**Decision.** Qualification grants a reward **automatically**. The reward is
immediately available, bounded by a fixed amount or a capped percentage,
single-use, non-transferable, and expiring. It requires no campaign and no
further human act.

**Why.** Staff approve the *programme* in advance, including its reward value,
budget, limits, and expiry. That approval is the funding decision. Requiring a
second, per-referral approval afterwards does not add control — the money was
already authorised when the programme was approved — it only adds a queue
between a customer and something they were told they earned.

**How it stays inside WPS-007.** A reward carries no spendable balance and posts
no ledger row. It is a permission to receive a discount on one future eligible
booking, and that discount is applied by the WPS-007 snapshot path exactly like
any other promotion. There is still no second money system, because there is
still no balance.

**How the budget stays real.** A reward reserves its ceiling at grant time, not
at redemption. See `docs/architecture/growth-architecture.md`.

### 2a. Superseded: the inert entitlement model

The original design recorded an inert entitlement that only became real when
staff later linked it to an approved promotion campaign.

**The reasoning was:** the locked scope forbade a wallet, a credit balance, and
booking credits, and WPS-007 is the sole financial authority — so a reward must
not carry a stored value. An entitlement is a fact about the past, which is safe
to record, and letting the system fund a reward on its own would be the system
approving its own spending.

**Why that was wrong.** The premise was right and the conclusion did not follow.
Avoiding a stored balance does not require avoiding automatic issuance. A reward
can be automatic *and* carry no balance, which is what §2 now does. The design
also failed a plainer test: it made "you earned a reward" true and "you can use
it" false at the same time, with no date attached to the second. And the fear of
self-approval was misplaced — the spending was authorised when a human approved
the programme, so the automation was executing a decision rather than making one.

**What was removed.** `referral_reward_entitlements` and
`campaign_eligibility_grants`, plus `growth_campaigns.requires_grant`. pgTAP
asserts all three no longer exist, so the coupling cannot silently return.

## 3. `public.promo_codes` and `public.promo_code_uses` — retired in place

**Found.** Created day-one in `202607200002_operations.sql`. Referenced by no
application code, no RPC, and no test. `public_active_promos` granted **every
authenticated account** `select` on every active code. `usage_limit` was a
column nothing enforced.

**Decision.** Drop the policy, revoke all grants, enable RLS with **no policy**,
and comment both tables as retired. Do **not** drop them, and do **not** reuse
them.

**Why not drop.** They exist on the hosted project and `promo_code_uses` carries
foreign keys into `customer_profiles` and `bookings`. A drop is irreversible and
would discard any historical row; retiring loses nothing and can be undone.

**Why RLS with no policy rather than revoking grants alone.** Revoked grants are
one accidental `grant` away from being readable again. RLS with no policy means
even a future grant returns zero rows.

**Why not reuse.** Reviving the scaffold is precisely the "second promotion
system" WPS-021 exists to prevent.

## 4. `public.wallets` and `public.wallet_transactions` — retired in place

**Found.** The same day-one migration also left `public.wallets`, carrying a
`balance_egp numeric(12,2)` column, and `public.wallet_transactions`. Both are
empty, referenced by no code, and already had RLS enabled with no policy — but
still carried the default Supabase grants to `anon` and `authenticated`.

This was **missed in the first pass of the WPS-021 architecture audit**, which
searched the client source for wallet usage rather than the schema. It surfaced
when a pgTAP assertion asserting no wallet table exists failed with `have: 2`.
The assertion was right and the audit was wrong.

**Decision.** Revoke every grant, keep RLS with no policy, and comment both
tables as retired, naming WPS-021 and stating that Warsha has no customer wallet.

**Why this matters more than tidiness.** A dormant table with a `balance_egp`
column is exactly what a future engineer would revive when asked to "add referral
credits". The comment is there to stop that conversation before it starts, and a
regression assertion proves no function anywhere reads the table.

## 5. Growth events use the existing `marketplace` category

**Decision.** Growth analytics are logged under `marketplace`, and the two new
staff capabilities live in the `marketplace` domain.

**Why.** `operational_log_category_check` and `staff_capabilities_domain_check`
are fixed allowlists on already-applied migrations with no `growth` member.
Customer acquisition is marketplace activity, so the existing category is
honest. Widening a constraint to fit a new feature is how allowlists stop
meaning anything, and the same reasoning applies to the WPS-016 fraud
vocabulary (see `growth-fraud-model.md`).

## 6. No clipboard dependency

**Decision.** The referral screen has no copy-to-clipboard button. The code is
selectable text and shareable through React Native's built-in `Share`.

**Why.** `expo-clipboard` is not a dependency. Adding a native module that
cannot be verified without a device, in a project with zero device testing, was
judged worse than not shipping the affordance — the same call WPS-020 made about
`expo-location`.

**Consequence.** Copying is a long-press-and-select interaction rather than one
tap. Recorded as an open item rather than hidden.
