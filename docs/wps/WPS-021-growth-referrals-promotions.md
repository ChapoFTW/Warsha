# WPS-021 — Growth, Referrals, Promotions & Customer Acquisition

| Field | Value |
| --- | --- |
| Version | 1.1 |
| Status | **LOCKED — IMPLEMENTED LOCALLY, DISABLED BY DEFAULT, MANUAL ACCEPTANCE PENDING** |
| Validation | Clean reset + 24 pgTAP files / 2,329 assertions `PASS`; 363 client checks |
| Authority | Constitution → WPS-007 → WPS-008 → WPS-014 → WPS-016 → WPS-017 → WPS-018 → WPS-021 |
| Engineering baseline | `docs/wes/WES-021-growth-referrals-promotions.md` |
| Migration | `supabase/migrations/202608060001_wps021_growth_referrals_promotions.sql` |
| Supersedes | The dormant `promo_codes` and `wallets` scaffolds from `202607200002` |

---

## 1. Purpose and boundary

WPS-021 is the authority for how a Warsha account brings another account to
Warsha, and for how Warsha may fund a discount for a customer.

It is **not** an authority for money. WPS-007 remains the sole financial and
ledger authority, and WPS-021 contains no ledger, no balance, no payment path,
and no second pricing rule. It is not an authority for enforcement: WPS-016
decides what happens to an account, and WPS-021 may only observe and report. It
is not an authority for ranking: WPS-008 orders workers, and nothing in WPS-021
reaches that ordering.

### 1.1 Two independent systems

These do not depend on each other, and neither reads the other's state.

| | Referral programmes | Admin promotions |
| --- | --- | --- |
| What staff approve | The **programme**, once, in advance | The **campaign**, once, in advance |
| Who receives it | An account that referred somebody who completed a job | Any account matching the campaign's stated criteria |
| How the recipient is chosen | Automatically, on qualification | Automatically, per user, on eligibility |
| Per-recipient human approval | **None** | **None** |
| Requires the other system | No | No |

An account that has never referred anybody can receive a promotion. An account
that referred somebody receives its reward without any campaign existing.

### 1.2 What WPS-021 deliberately does not add

Every item below was specified, considered, and refused — in the document, in
the schema, and in a negative test.

| Refused | Why |
| --- | --- |
| Customer-facing promo-code entry | A code box is an invitation to guess, share, and farm codes. Eligibility is a server decision, not a text field. |
| Public campaign browsing | A campaign a customer can browse is one they can enumerate, screenshot, and resell. |
| Customer wallet or stored balance | No WPS-001…020 authority defines one. A balance would be a second money system beside WPS-007. |
| Transferable credits | A transferable reward is a bearer instrument. |
| Manual per-referral approval | A referral programme with a human queue behind it is not a referral programme. |
| Reward for signup alone | See §4.3. |
| Influencer, affiliate, worker-created, or self-service codes | Each makes a code a public bearer instrument. |
| Automatic first-booking discount | Unless staff explicitly created and approved a campaign for it. |
| Flash sales, countdowns, streaks, mystery rewards, gambling mechanics | Warsha exists to get work done safely at a fair price. Manufactured urgency is not fair pricing. |
| Opaque eligibility (behavioural score, inferred income, likelihood to convert, hidden personalization, paid ranking) | A customer must be able to be told why they qualified. |

---

## 2. The single most important rule

> **Every benefit is Warsha-funded. It reduces what the customer pays. It never
> reduces what the worker earns.**

WPS-007 already implements this in `private.create_booking_price_snapshot`:

```sql
provider_gross_minor := customer_total_minor + promotion_minor - tax_minor;
```

The benefit is *added back* to provider gross. Worker gross, the commission
basis, provider net, and payout eligibility are arithmetically incapable of
being reduced. WPS-021 does not reimplement this and is **forbidden from
bypassing it**: every benefit reaches the customer's price by reducing
`final_price_egp` and recording `price_breakdown.discount`, then calling the
WPS-007 snapshot — and by no other route.

---

## 3. Fail-closed posture

Both systems are off, independently, and each needs affirmative conditions to
become on.

| Gate | Referrals | Promotions |
| --- | --- | --- |
| Feature flag | `growth_referrals` — `enabled=false, audience='none'` | `growth_promotions` — same |
| Kill switch | `growth_referrals` — inactive, restricts only | `growth_promotions` — same |
| Lifecycle | Programme starts as `draft` | Campaign starts as `draft` |
| Approval | WPS-018 dual control | WPS-018 dual control |

An unknown flag, a missing programme, an unreadable configuration, or an
exception anywhere resolves to **no benefit**. There is no code path in which an
error produces a discount.

---

## 4. Referral programmes

### 4.1 Codes

| Property | Rule |
| --- | --- |
| Uniqueness | Globally unique across customers and workers |
| Generation | Cryptographically secure random bytes with rejection sampling. No sequence, counter, timestamp, or derivation from any user attribute |
| Alphabet | 31 characters, excluding `0 O 1 I L` — a code is read aloud and typed by hand |
| Length | 10 — 31¹⁰ ≈ 8.19 × 10¹⁴ |
| Immutability | The code text can never change, by anyone, including staff |
| Revocation | Staff only, with a recorded reason. Never deletes the code or its history |
| Rotation | None. A rotated code would orphan recorded attribution |

Created lazily on first request, so an account that never opens the screen never
occupies code space.

### 4.2 Attribution

| Rule | Enforcement |
| --- | --- |
| One attribution per referred account, ever | Unique constraint on `referred_user_id` |
| Immutable once written | Trigger; only status and qualification fields advance |
| Self-referral impossible | Check constraint, plus an explicit server check, plus an advisory signal |
| A revoked code creates no new attribution | Server check at claim time |
| Expires if it does not qualify | Bounded window, from the programme |

Attribution pays nothing.

### 4.3 Qualification

> **No reward for signing up. Ever.**

A referral qualifies only when the referred account completes a booking that
reaches `completed` under WPS-012 **and** carries a WPS-007 price snapshot. A
completed booking with no snapshot has no authoritative value and qualifies
nothing.

The attribution is marked qualified whether or not a programme is running,
because the fact happened.

### 4.4 Automatic reward issuance

> **Staff approve the programme once, in advance. Nobody approves an individual
> referral.**

When qualification succeeds and an approved, active programme matches, the
server grants the reward **immediately and automatically**. There is no queue,
no review, and no capability that gates an individual reward — asserted in
pgTAP by requiring that no per-referral approval ever appears in the staff audit
trail.

A granted reward is:

| Property | Rule |
| --- | --- |
| Immediately usable | Status `available` on creation |
| Bounded | Fixed amount, or a percentage with a mandatory ceiling |
| Single-use | Consumed by exactly one booking |
| Non-transferable | No policy, grant, or RPC moves one between accounts |
| Expiring | Programme-defined window |
| Not a balance | No amount anyone can spend elsewhere; posts no ledger row |
| Snapshotted | Terms are frozen at grant time, so a later programme version cannot retroactively change what somebody earned |

Retries are idempotent: `unique (attribution_id, beneficiary_user_id)`. Duplicate
qualification creates no duplicate reward and no duplicate budget reservation.

### 4.5 What staff define, in advance

A referral programme may specify: audience (customer or worker); qualifying
event; eligible service and category; minimum booking amount; reward type, value
and maximum; reward expiry; redemption conditions; per-referrer and
per-referred-account limits; overall programme budget; environment; start and
end time; and cancellation treatment.

Only an **approved and active** programme may grant a reward.

### 4.6 Budget is a real bound

A reward reserves the **maximum it could be worth** at grant time, not at
redemption. Reserving at redemption would let a programme grant unlimited
rewards against a small budget because nothing had been spent yet. The unused
remainder is released when the reward is redeemed for less, expires, or is
reversed.

### 4.7 Referral codes are not promo codes

A referral code cannot be redeemed for a discount, is not accepted anywhere a
benefit is evaluated, and has no monetary value. Its only function is to
attribute a new account to an existing one. Enforced structurally: the benefit
evaluators never read the referral code table.

---

## 5. Admin promotions

### 5.1 Campaigns are staff instruments

Created by staff, approved by different staff, activated deliberately. Lifecycle:
`draft` → `scheduled` / `active` → `paused` → `expired` / `cancelled`. Once a
campaign leaves `draft` it is immutable; a change requires a new version, which
must itself be approved. Enforced by trigger, which also rejects `DELETE`.

### 5.2 Approval requires a second person

Activation consumes a WPS-018 dual-control approval, and the creator cannot
approve their own campaign. Enforced in three independent places: a table
constraint (`approved_by <> requested_by`), a runtime check in
`staff_approve_dual_control`, and an explicit creator check in
`staff_activate_campaign` that applies even where dual control is disabled.

The same three apply to referral programmes.

### 5.3 Eligibility is transparent, and evaluated per user automatically

Once a campaign is approved, **no staff member approves an eligible user.** The
server evaluates every authenticated user against criteria that are all stated
facts about the account:

- completed booking count (minimum and maximum — "first completed booking" is
  `max_completed_bookings = 0`)
- account age
- inactivity period
- governorate, service, category
- minimum booking amount
- customer or worker audience

There is no behavioural score, no inferred value, no likelihood-to-convert, and
no paid ranking. A pgTAP assertion requires zero occurrences of such columns.

### 5.4 Visibility is a result, never a row

A customer sees a benefit only when the server confirms, in one transaction:
the flag permits this audience; the kill switch is inactive; the campaign is
approved and `active`; the time window is open; the environment matches; the
account satisfies every criterion; the booking satisfies its restrictions;
budget remains; the global and per-account limits are not reached; and no
benefit is already applied to this booking.

Any failure returns *no benefit*, with no reason disclosed. A client cannot
enumerate campaigns and cannot distinguish "nothing exists" from "you are not
eligible".

---

## 6. Stacking

> **At most one referral reward OR one admin promotion per booking. No stacking
> between them at launch.**

| Combination | Permitted |
| --- | --- |
| One referral reward | Yes |
| One admin promotion | Yes |
| Both on one booking | **No** |
| Two of either | **No** |
| The same benefit twice | **No** |
| A negative or zero customer total | **No** |
| Concurrent redemption of the last budget | **No** |

Enforced by `unique (booking_id)` on `booking_benefit_redemptions` plus a check
that exactly one benefit source is named. A unique index cannot be raced and
cannot be forgotten by a future caller.

Where both would qualify, the larger discount wins; a referral reward wins ties,
because the customer earned it. Every discount is clamped one minor unit below
the booking, so WPS-007 always has at least one unit to charge.

---

## 7. Cancellation and refund

WPS-007's existing `promotion_reversal_minor` reverses the Warsha-funded expense
proportionally. WPS-021 additionally:

- marks the redemption `reversed` and records the released amount;
- releases the campaign or programme budget, so it cannot drift from the ledger;
- clears the discount from the booking, so a later re-snapshot cannot reapply a
  benefit no redemption row backs;
- returns the referral reward to the customer if the programme's
  `cancellation_treatment` is `restore` (the default) and it has not expired,
  re-reserving its ceiling so the budget bound still holds.

---

## 8. Abuse signals

WPS-021 detects. WPS-016 decides. Nothing here punishes, restricts, blocks, or
changes trust state.

| Growth condition | Recorded as (WPS-016 vocabulary) |
| --- | --- |
| Self-referral attempt | `duplicate_identity` |
| Circular referral | `account_farming` |
| Referral velocity / signup burst | `account_farming` |
| Repeated redemption velocity | `abnormal_payment_behavior` |

Growth specifics ride in `safe_detail.growthSignal`. The WPS-016 constraint was
**not widened** — asserted in pgTAP. Duplicate qualification attempts are
prevented outright by the unique key rather than merely signalled.

---

## 9. Notifications, admin, analytics

WPS-014 owns delivery; WPS-021 adds five catalog entries, none critical, none
action-required, none quiet-hours-bypassing. Push remains disabled.

WPS-017/018 own staff identity, capability, dual control, audit, session
freshness, flags, kill switches, and environment isolation. Referral programmes
and campaigns have **separate capabilities** — `manage_referral_programs`,
`approve_referral_program`, `manage_growth_campaigns`, `approve_growth_campaign`
— and therefore separate audit trails.

Five analytics events go to the WPS-018 sink under the existing `marketplace`
category. None carries a user identifier, code, email, phone, device identifier,
or advertising identifier. No profiling, no third-party provider, and no
analytics value reaches WPS-008 ranking.

---

## 10. Localization and accessibility

Full English and Egyptian Arabic across every growth surface, with RTL. The
motto is unchanged: `YOUR WORK, OUR MISSION` / `شغلك مهمتنا`.

- The referral code is selectable text announced character by character, never
  an image.
- A reward announces its state, worth, and expiry as one accessible summary.
- Reward and benefit state is conveyed by text **and** icon, never colour alone.
- The benefit banner announces itself through a live region; its apply control
  reports its disabled state.
- Touch targets meet 44 × 44. Colour pairs meet WCAG AA in both appearances
  using WPS-020 tokens, with no new literal.
- No customer string says pending approval, waiting for a campaign, or eligible
  for a future offer — because none of those is true, and each is asserted
  absent.

---

## 11. Security

| Requirement | Mechanism |
| --- | --- |
| Owner isolation | RLS on every customer-visible table, `auth.uid()` scoped |
| No enumeration of programmes or campaigns | No grant, no policy; access only through RPC |
| No reward enumeration by another account | Owner-only policy; asserted |
| No reward transfer | Immutability trigger on `beneficiary_user_id`; no RPC moves one |
| `SECURITY DEFINER` only where justified | Each such function documents why |
| Empty `search_path` | Every function |
| Minimal grants | `authenticated`, `SELECT` only, on four owner-scoped tables |
| Audit trails | Staff actions via `record_staff_audit`; attribution and rewards immutable |
| Idempotency | Unique keys on claim, qualification, and redemption |
| Bounded queries | Every list RPC takes a capped limit |
| Rate limiting | Four WPS-018 policies |

---

## 12. Deferred and refused

| Item | State | Why |
| --- | --- | --- |
| Reward expiry sweep scheduling | Function built and tested, unscheduled | No scheduler is enabled anywhere in Warsha |
| Programme drafting UI | Deferred | Staff draft through the RPC; the screen manages lifecycle |
| Deep-link invite handling | Deferred | Needs a hosted domain and a device |
| Device fingerprinting | **Refused** | Warsha collects no device identifier |
| Referral leaderboards | **Refused** | Competitive mechanics were excluded by the locked scope |
| Worker-side promotional discounts | **Refused** | Would reduce worker compensation, which §2 forbids |
| Stacking between the two systems | **Deferred** | §6 fixes one benefit per booking at launch |

---

## 13. Acceptance state

- Implemented locally on `feat/wps-021`.
- Migration `202608060001` is local-only. **No hosted push was executed.**
- Manual alpha: `docs/testing/WPS-021-MANUAL-ALPHA.md`. Every case **NOT RUN**.
- Evidence: `docs/testing/WPS-021-ACCEPTANCE-EVIDENCE.md`.
- Both systems ship **disabled**. Enabling either is an operational decision
  recorded through WPS-017, not a deployment side effect.
