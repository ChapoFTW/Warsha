# WES-021 — Growth, Referrals, Promotions & Customer Acquisition (Engineering Baseline)

| Field | Value |
| --- | --- |
| Version | 1.1 |
| Status | **ENGINEERING BASELINE — MANUAL AND HOSTED DEPLOYMENT GATED** |
| Implements | WPS-021 |
| Authority | Constitution → WPS-007 → WPS-016 → WPS-017 → WPS-018 → WPS-021 → WES-021 |
| Migration | `supabase/migrations/202608060001_wps021_growth_referrals_promotions.sql` |

This document records *how* WPS-021 was built, and what it deliberately did not
build.

---

## 0. The correction in version 1.1

Version 1.0 of this baseline shipped a design in which a qualifying referral
produced an **inert entitlement** that only became real if staff later linked it
to an approved promotion campaign. That was wrong, and it was wrong in a way
worth recording rather than quietly replacing.

The defect was not a bug in the code — the code did what the design said. The
defect was that the design put a human in the loop **per referral**. Somebody
who invited a friend, whose friend then completed a real job, held something
labelled "earned" that paid nothing until an unrelated administrative act
happened. That is not a referral programme; it is a promise with a manual queue
behind it.

The correct model puts the human decision **once, in advance**:

| Concern | v1.0 (wrong) | v1.1 (correct) |
| --- | --- | --- |
| What staff approve | Each campaign, then a link per reward | The **programme**, once |
| What qualification produces | An inert entitlement | An **available, redeemable reward** |
| When the customer can use it | After an unrelated admin act | **Immediately** |
| Coupling to campaigns | Required | **None** |
| Table | `referral_reward_entitlements` + `campaign_eligibility_grants` | `referral_programs` + `referral_rewards` |

Both coupling tables are gone, and pgTAP asserts they no longer exist so the
model cannot silently return.

---

## 1. Extension strategy

WPS-021 introduces **no new infrastructure**. Every cross-cutting concern was
already solved by an earlier WPS.

| Concern | Existing authority reused | New code written |
| --- | --- | --- |
| Warsha-funded discount reaching the ledger | `private.create_booking_price_snapshot` (WPS-007) | None |
| Financial account for the expense | `warsha_promotion_expense` (WPS-007) | None |
| Refund reversal | `promotion_reversal_minor` (WPS-007) | None |
| Creator ≠ approver | `staff_dual_control_requests` + `consume_dual_control` (WPS-018) | None |
| Fail-closed release control | `private.staff_feature_flags` (WPS-017) | Two seed rows |
| Restrictive kill switches | `private.staff_kill_switches` (WPS-017) | Two seed rows |
| Staff capability gate | `private.require_staff_capability` (WPS-018) | Four capability rows |
| Staff audit trail | `private.record_staff_audit` (WPS-017) | None |
| Advisory fraud signals | `private.record_trust_fraud_signal` (WPS-016) | None |
| Notifications, preferences, quiet hours, dedupe | `private.prepare_notification` (WPS-014) | Five catalog rows |
| Rate limiting | `private.enforce_rate_limit` (WPS-018) | Four policy rows |
| Privacy-safe analytics | `private.record_operational_event` (WPS-018) | None |
| Theme tokens | WPS-020 `ThemeColors` | None |

Three allowlists on already-applied migrations had no room for a `growth`
member. Each was honoured rather than widened:

- `operational_log_category_check` → growth events log under `marketplace`.
- `staff_capabilities_domain_check` → the four capabilities live in `marketplace`.
- `trust_fraud_signals_key_check` → growth abuse maps onto the existing WPS-016
  vocabulary, so it lands in the queue staff already triage.

Loosening a check constraint to fit a new feature is how allowlists stop meaning
anything.

---

## 2. Automatic issuance

`private.qualify_referral_for_booking` runs from the booking-completion trigger.
No staff capability gates it, and pgTAP asserts that no per-referral approval
row ever appears in the staff audit trail — only the programme approval does.

The order inside it matters:

1. The booking must be `completed` **and** carry a WPS-007 price snapshot. A
   completed booking with no snapshot has no authoritative value, so it cannot
   qualify anything.
2. The attribution row is locked and checked for expiry.
3. The **programme row is locked before its budget is read**. Two referrals
   qualifying in the same instant therefore cannot both consume the last of the
   budget.
4. The attribution is marked qualified — this happens whether or not a programme
   is running, because the fact happened.
5. Programme conditions are checked (qualifying event, minimum booking, service,
   category).
6. `private.grant_referral_reward` inserts the reward.

### 2.1 Budget is reserved at the ceiling, at grant time

A reward reserves the **maximum** it could ever be worth the moment it is
granted, not the moment it is used.

This is the difference between a budget that bounds spending and one that only
looks like it does. Reserving at consumption time would let a programme grant
ten thousand rewards against a budget of ten, because nothing had been spent
yet. Reserving the ceiling means the budget bounds *outstanding liability*, and
the unused remainder is released when the customer redeems for less, when the
reward expires, or when the booking is cancelled.

### 2.2 Idempotency

`unique (attribution_id, beneficiary_user_id)` plus `on conflict do nothing`.
The trigger may fire more than once — WPS-012 allows a terminal state to be
re-asserted — and a duplicate reward is a real financial defect, not a cosmetic
one.

---

## 3. Independence

Two evaluators, neither of which reads the other's tables:

- `private.evaluate_referral_benefit` — reads rewards and programmes.
- `private.evaluate_promotion_eligibility` — reads campaigns only.

pgTAP asserts this by grepping each function's own definition for the other
system's table names and requiring zero matches. That is a stronger check than
reading the code, because it keeps holding after somebody edits the code.

`public.get_my_booking_benefit` combines them and returns **at most one**. Where
both qualify, the larger discount wins; a referral reward wins ties, because the
customer earned it.

---

## 4. Stacking, expressed as a constraint

`public.booking_benefit_redemptions` has `unique (booking_id)` and a check that
exactly one of `referral_reward_id` / `campaign_id` is set, matching the `source`
discriminator.

That single index **is** the stacking rule. A status check in application code
can be raced; a unique index cannot, and it cannot be forgotten by a future
caller either.

---

## 5. The money path

```sql
final_price_egp = (v_base - p_discount)::numeric / 100
price_breakdown.discount = p_discount / 100
```

Both fields, every time. WPS-007 treats `final_price_egp` as the
**customer-facing** total and derives

```
provider_gross := customer_total + promotion
```

Writing only `price_breakdown.discount` — which v1.0 did before a pgTAP
assertion caught it — leaves the customer paying full price and pushes provider
gross *above* the job's value. Warsha would be funding a worker bonus nobody
authorised instead of a customer discount. The assertion on `provider_gross_minor`
is now permanent.

---

## 6. Code generation

Ten characters from a 31-symbol alphabet using `extensions.gen_random_bytes(1)`,
with rejection sampling.

**Rejection sampling, not modulo.** `256 mod 31 = 8`, so a plain modulo would
make the first eight symbols measurably more likely. Bytes ≥ 248 are drawn
again. The loop is bounded so a pathological entropy source cannot hang a
transaction.

**The alphabet excludes `0 O 1 I L`.** A referral code is read aloud across a
room and typed by somebody who did not hear it clearly. Ambiguous glyphs convert
a growth feature into a support ticket.

**Collision is handled by the unique index, not a pre-check.** `select where not
exists` then `insert` is a race. At 31¹⁰ ≈ 8.19 × 10¹⁴ the retry path is
effectively unreachable, but it exists rather than being assumed away.

---

## 7. Retiring two dormant scaffolds

`202607200002` left four unused tables. `public.promo_codes` carried a policy
granting **every authenticated account** `select` on every active code;
`public.wallets` carried a `balance_egp` column.

All four are RLS-enabled with **no policy**, stripped of every client grant, and
commented as retired. RLS with no policy is deny-by-default: revoked grants
alone would leave them one accidental `grant` away from being readable.

They are **not dropped**. They exist on the hosted project and `promo_code_uses`
carries foreign keys into `customer_profiles` and `bookings`. Retiring is
reversible and loses nothing; dropping is neither.

The wallet pair was **missed by the first pass of the architecture audit**,
which searched the client source rather than the schema. A pgTAP assertion
failed with `have: 2` and was correct.

---

## 8. Client architecture

| Module | Role |
| --- | --- |
| `src/growth/growth-types.ts` | Import-free contracts and pure rules; executable directly by Node |
| `src/growth/mock-growth-state.ts` | Per-account Mock mirroring the corrected model |
| `src/growth/growth-repository.ts` | Method-per-RPC with an explicit Mock branch each |
| `src/growth/growth-context.tsx` | Account-isolated referral state, WPS-019 generation guard |
| `src/growth/growth-copy.ts` | Import-free bilingual tables |

The context holds referral state only. Booking benefits are read per booking by
the banner, because a benefit depends on the booking's value — and keeping them
apart stops the two systems from sharing state they must not share.

The client has **no path that grants or approves a reward**. A regression
assertion greps the repository for `grantReward`, `issueReward`, and
`approveReferral` and requires zero matches.

---

## 9. Screens

| Screen | Audience |
| --- | --- |
| `app/referrals.tsx` | Customer and worker — code, share, invite status, reward list with expiry |
| `components/warsha/EligiblePromotionBanner.tsx` | Customer — the one benefit, inside the booking |
| `app/admin/campaigns.tsx` | Staff — referral programmes and campaigns, in separate sections |

The reward list shows *ready to use*, *used*, or *expired*, with days remaining
on a live reward. No string anywhere says pending approval, waiting for a
campaign, or eligible for a future offer — asserted as absences, because this is
exactly the kind of copy that creeps back in.

---

## 10. Mock parity

| Parity | Status |
| --- | --- |
| Code shape, alphabet, length | Identical |
| One code per account; self-referral rejected | Identical |
| One attribution per referred account | Identical |
| Qualification only on completion | Identical |
| **Automatic issuance on qualification** | Identical |
| Idempotent qualification | Identical |
| Budget reserved at the ceiling on grant | Identical |
| Per-referrer limit | Identical |
| Reward expiry and effective status | Identical |
| Oldest-expiry-first reward selection | Identical |
| Percentage cap enforcement | Identical |
| One benefit per booking | Identical |
| Referral wins ties against a campaign | Identical |
| Cancellation restores the reward | Identical |
| Campaign criteria (completed count, account age) | Identical |
| Separate kill switches | Identical |
| Code **generation** | Not identical. Mock uses a seeded deterministic generator so tests are reproducible; the server uses `gen_random_bytes`. Alphabet, length, and uniqueness match. |

---

## 11. Open engineering items

| Item | State | Why |
| --- | --- | --- |
| Reward expiry sweep scheduling | Function built, unscheduled | `private.expire_referral_rewards()` exists and is tested; no scheduler is enabled anywhere in Warsha |
| Programme drafting UI | Not built | Staff draft through the RPC; the screen lists, activates, pauses, cancels |
| Native deep-link invite association | Not built | Needs a hosted domain and a device |
| Device fingerprint signal | Not wired | Warsha collects no device identifier |
| Clipboard copy affordance | Not built | `expo-clipboard` is not a dependency; the code is selectable and shareable |
| Measured on-device contrast | Not done | Computed from the palette only, as with WPS-020 |
