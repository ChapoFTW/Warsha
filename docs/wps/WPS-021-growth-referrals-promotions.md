# WPS-021 — Growth, Referrals, Promotions & Customer Acquisition

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **LOCKED — IMPLEMENTED LOCALLY, MANUAL ACCEPTANCE PENDING** |
| Authority | Constitution → WPS-007 → WPS-008 → WPS-014 → WPS-016 → WPS-017 → WPS-018 → WPS-021 |
| Engineering baseline | `docs/wes/WES-021-growth-referrals-promotions.md` |
| Migration | `supabase/migrations/202608060001_wps021_growth_referrals_promotions.sql` |
| Supersedes | The dormant `public.promo_codes` / `public.promo_code_uses` scaffold |

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

### 1.1 What WPS-021 adds

| Capability | Audience |
| --- | --- |
| A personal referral code and share link | Customer and worker |
| Immutable referral attribution | System |
| Qualification on an authoritative completed event | System |
| A recorded, bounded, auditable reward entitlement | Customer and worker |
| Staff-created, staff-approved, Warsha-funded promotional campaigns | Staff only |
| A single server-authoritative eligibility answer per booking | Customer |
| Advisory growth-abuse signals | Staff only |

### 1.2 What WPS-021 deliberately does not add

Every item below was specified, considered, and refused. Each is refused in the
document, in the schema, and in a negative test.

| Refused | Why |
| --- | --- |
| Customer-facing promo-code entry | A code box is an invitation to guess, share, and farm codes. Eligibility is a server decision, not a text field. |
| Public campaign browsing | A campaign a customer can browse is a campaign a customer can enumerate, screenshot, and resell. |
| Customer wallet or credit balance | No WPS-001…020 authority defines one. Inventing a balance would create a second money system beside WPS-007. |
| Booking credits, campaign credits | Same reason. A credit is a liability, and WPS-021 has no authority to create liabilities. |
| Influencer, affiliate, worker-created, or self-service codes | Every one of these makes a code a public bearer instrument. |
| Automatic first-booking discount | An automatic discount is a promotion nobody approved. |
| Flash sales, countdowns, streaks, mystery rewards, gambling mechanics | Warsha exists to get work done safely at a fair price. Manufactured urgency is not fair pricing. |
| A referral code that also functions as a promo code | These are separate concepts and must remain structurally separate. See §4.6. |

---

## 2. The single most important rule

> **A promotion is Warsha-funded. It reduces what the customer pays. It never
> reduces what the worker earns.**

This is not a new rule. WPS-007 already implements it in
`private.create_booking_price_snapshot`:

```sql
provider_gross_minor := customer_total_minor + promotion_minor - tax_minor;
```

The promotion is *added back* to provider gross. Worker gross, the commission
basis, provider net, and payout eligibility are arithmetically incapable of
being reduced by a promotion. WPS-021 does not reimplement this. WPS-021 is
**forbidden from bypassing it** — every promotion reaches the customer's price
through the WPS-007 snapshot path and through no other route.

---

## 3. Fail-closed posture

Promotions are off. They are off by default, off in every environment, and off
in a way that requires four independent affirmative conditions to become on.

| Gate | Authority | Default |
| --- | --- | --- |
| `growth_promotions` feature flag | WPS-017 `private.staff_feature_flags` | `enabled=false`, `audience='none'` |
| `growth_promotions` kill switch | WPS-017 `private.staff_kill_switches` | inactive, but restricts when active |
| Campaign `status` | WPS-021 | `draft` |
| Campaign approval | WPS-018 dual control | unapproved |

An unknown flag, a missing campaign, an unreadable configuration, or an
exception anywhere in eligibility resolves to **no promotion**. There is no code
path in which an error produces a discount.

Referrals are separately flagged by `growth_referrals` and are likewise off
until deliberately enabled.

---

## 4. Referrals

### 4.1 Codes

Every account may hold at most one referral code, for its lifetime.

| Property | Rule |
| --- | --- |
| Uniqueness | Globally unique across customers and workers |
| Generation | Cryptographically secure random bytes. No sequence, no counter, no timestamp, no account identifier, no derivation from any user attribute |
| Alphabet | 28 characters, excluding `0 O 1 I L` — a code is read aloud and typed by hand |
| Length | 10 characters — 28¹⁰ ≈ 2.96 × 10¹⁴ |
| Immutability | The code text can never be changed, by anyone, including staff |
| Revocation | Staff only, with a recorded reason. Revocation never deletes the code or its history |
| Rotation | None. A rotated code would break attribution already recorded against it |

A code is created lazily on first request, not at signup, so an account that
never opens the referral screen never occupies code space.

### 4.2 Attribution

Attribution is the permanent record that account B arrived through account A's
code.

| Rule | Enforcement |
| --- | --- |
| One attribution per referred account, ever | Unique constraint on `referred_user_id` |
| Attribution is immutable once written | Trigger; only status and qualification fields may advance |
| Self-referral is impossible | Check constraint `referrer_user_id <> referred_user_id`, plus an explicit server check |
| A revoked code cannot create new attribution | Server check at claim time |
| Attribution can be claimed only by an account with no prior attribution | Unique constraint |
| Attribution expires if it does not qualify | Bounded window, default 90 days |

Attribution is recorded at claim time and **does not** pay anything.

### 4.3 Qualification

> **No reward for signing up. Ever.**

A referral qualifies only when the referred account completes an authoritative
qualifying event, defined as a booking reaching a **completed** state under
WPS-012 with a WPS-007 price snapshot present.

| Rule | Enforcement |
| --- | --- |
| Qualification is idempotent | Unique idempotency key per attribution; repeated events are no-ops |
| Qualification is triggered by the authoritative event, not by a client call | Server-side, invoked from booking completion |
| A cancelled or disputed booking does not qualify | Status checked at qualification time |
| Qualification happens at most once per attribution | Status transition guard |

### 4.4 What a reward actually is

This is the design decision that keeps WPS-021 inside its authority.

A qualified referral writes an immutable **reward entitlement**. An entitlement
is a record that an account has earned something. It is **not** money, not a
balance, and not a credit. It has no financial effect of any kind on its own.

An entitlement becomes real in exactly one way: staff link a reward rule to an
approved campaign, and the beneficiary later becomes eligible for that campaign
on a qualifying booking. The discount is then applied by the WPS-007 snapshot
path like any other promotion, funded by Warsha.

If no campaign is linked, the entitlement is recorded, visible to its owner as
earned, auditable by staff, and **explicitly unfulfilled**. Warsha owes nothing
it has not approved.

This is why WPS-021 needs no wallet. There is nothing to store a balance in
because there is no balance — there is a history of earned entitlements and a
separate, staff-controlled mechanism for honouring them.

### 4.5 Reward rules are bounded

| Bound | Value |
| --- | --- |
| Reward rules are staff-defined only | No self-service |
| Maximum entitlements per referrer per rolling 30 days | Configured, default 10 |
| Maximum lifetime entitlements per referrer | Configured, default 50 |
| A rule names its beneficiary explicitly | `referrer`, `referred`, or `both` |
| Every entitlement records the rule key and version that produced it | Immutable |

### 4.6 Referral codes are not promo codes

A referral code cannot be redeemed for a discount. It is not accepted anywhere a
promotion is evaluated. It has no monetary value, no campaign association, and
no price effect. Its only function is to attribute a new account to an existing
one.

This is enforced structurally: referral codes and campaigns live in different
tables, the eligibility evaluator never reads the referral code table, and the
claim function never reads the campaign table. A pgTAP assertion proves a
referral code presented as a promotion produces nothing.

---

## 5. Promotions

### 5.1 Campaigns are staff instruments

A campaign is created by staff, approved by different staff, and activated
deliberately. There is no other origin.

| Lifecycle state | Meaning | Mutable? |
| --- | --- | --- |
| `draft` | Being written | Yes |
| `scheduled` | Approved, window not yet open | **No** |
| `active` | Approved, window open, redeemable | **No** |
| `paused` | Temporarily suspended by staff | **No** |
| `expired` | Window closed | **No** |
| `cancelled` | Terminated by staff | **No** |

Once a campaign leaves `draft` it is immutable. A change requires a **new
version** — a new row with an incremented version, which must itself be approved.
The immutability is enforced by trigger, not by convention, and the trigger
rejects `DELETE` outright.

### 5.2 Approval requires a second person

Activation consumes a WPS-018 dual-control approval. The creator cannot approve
their own campaign — this is enforced in three independent places:

1. `staff_dual_control_distinct_check` — a table constraint (`approved_by <> requested_by`)
2. `public.staff_approve_dual_control` — an explicit runtime check
3. `public.staff_activate_campaign` — an explicit check that the activator is not the creator

Where dual control is disabled for the environment, the third check still
applies, so a single actor can never both author and activate a campaign.

### 5.3 Campaign parameters

| Parameter | Rule |
| --- | --- |
| `discount_type` | `percentage` or `fixed` |
| `discount_value` | Percentage 1–50; fixed amount in minor units |
| `max_discount_minor` | Mandatory ceiling for percentage campaigns |
| `starts_at` / `ends_at` | Both required; end must follow start |
| `budget_minor` | Mandatory. A campaign without a budget cannot be approved |
| `global_redemption_limit` | Mandatory |
| `per_account_limit` | Mandatory, ≥ 1 |
| `audience` | `customer` or `worker` |
| `service_keys` / `category_keys` / `city_keys` | Optional restrictions; empty means unrestricted |
| `first_booking_only` | Optional |
| `environment` | Bound at creation; a campaign is valid in one environment only |

### 5.4 Visibility is an eligibility result, never a row

> **No promotion appears because a row exists.**

A customer sees a promotion only when the server returns an eligibility result
confirming, in one transaction, all of the following:

1. the `growth_promotions` feature flag permits this audience;
2. the `growth_promotions` kill switch is inactive;
3. the campaign is approved;
4. the campaign status is `active`;
5. the current time is inside `[starts_at, ends_at)`;
6. the campaign environment equals the running environment;
7. the authenticated customer satisfies audience, restriction, and grant rules;
8. the booking satisfies service, category, city, and first-booking rules;
9. remaining budget covers the computed discount;
10. the global redemption limit is not reached;
11. the per-account limit is not reached;
12. no incompatible prior redemption exists for this booking.

Any single failure returns *no promotion*, with no reason disclosed to the
client beyond eligibility being absent. A client cannot enumerate campaigns, and
a client cannot distinguish "no campaign exists" from "you are not eligible".

### 5.5 Stacking

The authoritative stacking rule is deliberately the simplest one that is safe:

> **At most one promotion per booking.**

| Combination | Permitted |
| --- | --- |
| One promotion | Yes |
| Two promotions | **No** |
| Referral entitlement honoured through a campaign, plus a second campaign | **No** |
| A promotion applied twice to one booking | **No** — unique constraint on `booking_id` |
| A promotion producing a negative or zero customer total | **No** — WPS-007 rejects it |
| Concurrent redemption of the last remaining budget | **No** — resolved by row lock |

Unlimited stacking is not merely discouraged; a unique index on
`campaign_redemptions(booking_id)` makes a second promotion on a booking
impossible to write. Budget and redemption counters are updated under
`select … for update` on the campaign row, so two concurrent redemptions of the
final unit cannot both succeed.

The customer total floor is WPS-007's existing `customer_total_minor >= 1`
check. A promotion larger than the booking is clamped to the booking value
before the snapshot is written, so a discount can never create a negative total
or a payment owed by Warsha to the customer.

### 5.6 Redemption is reversible with the booking

A redemption is linked to the booking and to the price snapshot version it
produced. When the booking is refunded or cancelled, WPS-007's existing
`promotion_reversal_minor` computation reverses the Warsha-funded expense
proportionally, and WPS-021 releases the corresponding budget back to the
campaign. Budget released is recorded, never silently recalculated.

---

## 6. The legacy `promo_codes` scaffold

`public.promo_codes` and `public.promo_code_uses` have existed since
`202607200002_operations.sql`. They are referenced by no application code, no
test, and no RPC. `public.promo_codes` carries a policy granting `select` to
every authenticated user on every active code.

**Treatment: retired in place, not dropped.**

| Action | Reason |
| --- | --- |
| Drop the `public_active_promos` policy | It let any signed-in account enumerate every active code |
| Revoke all privileges from `anon`, `authenticated`, `public` | The tables become unreachable from PostgREST |
| Enable RLS with **no policy** on both tables | Deny-by-default, not deny-by-grant |
| Add `comment on table` marking them retired and naming WPS-021 | The next engineer must not have to guess |
| **Do not drop the tables** | They exist on the hosted project. Dropping is irreversible and would discard any historical rows; retiring is reversible and loses nothing |
| **Do not reuse them** | A second promotion system is exactly what this specification forbids |

Regression coverage proves an authenticated customer can select neither table,
and cannot enumerate `growth_campaigns` either.

---

## 7. Abuse signals

WPS-021 detects. WPS-016 decides. Nothing in WPS-021 punishes an account,
restricts an account, blocks an account, or changes trust state.

| Signal | Meaning |
| --- | --- |
| `growth_self_referral_attempt` | An account tried to claim its own code |
| `growth_circular_referral` | A referred B and B's code was later claimed by A |
| `growth_referral_velocity` | Attribution rate above the configured bound |
| `growth_signup_burst` | Many attributions to one referrer in a short window |
| `growth_duplicate_device` | Repeated attribution from one device fingerprint hash |
| `growth_repeated_cancellation` | A referred account repeatedly cancels near-qualification |
| `growth_synthetic_account` | Combined weak-signal heuristic |
| `growth_promotion_velocity` | Redemption rate above the configured bound |

Every signal is written through `private.record_trust_fraud_signal`, whose own
comment reads *"Deliberately no enforcement here. Signals inform staff; they
never punish."* WPS-021 adds no second fraud table and no automatic action.

A signal never blocks a booking, never voids a completed qualification, and
never reduces a worker's earnings.

---

## 8. Notifications

WPS-014 owns delivery. WPS-021 adds five catalog entries and inserts into
`public.notifications` like every other producer.

| Event | Priority | Audience |
| --- | --- | --- |
| `referral_qualified` | important | all |
| `referral_pending` | informational | all |
| `promotion_available` | informational | customer |
| `promotion_expiring` | informational | customer |
| `promotion_redeemed` | informational | customer |

All five are informational or important — none is `critical`, none is
`action_required`, and none bypasses quiet hours. Each carries a `dedupe_key` so
a retried producer cannot notify twice. Category preferences and quiet hours are
respected by the existing `prepare_notification` trigger without WPS-021 doing
anything special, which is the point of reusing it.

Push remains disabled. These are in-app notifications only.

---

## 9. Staff administration

WPS-017 owns staff identity and capability. WPS-021 adds two capabilities in the
existing `marketplace` domain and grants them to existing roles.

| Capability | High risk | Dual control | Re-auth |
| --- | --- | --- | --- |
| `manage_growth_campaigns` | Yes | No | No |
| `approve_growth_campaign` | Yes | **Yes** | **Yes** |

Staff can draft, submit, activate, pause, cancel, list, inspect, and preview
eligibility. Every action writes a `private.record_staff_audit` row naming the
actor, capability, action, subject, and reason. There is no unaudited campaign
mutation.

Eligibility preview answers "would this account qualify" **without** creating a
redemption, consuming budget, or notifying anyone.

---

## 10. Analytics

Five events, written through the WPS-018 `record_operational_event` sink under
the existing `marketplace` category.

| Event | Payload |
| --- | --- |
| `growth.referral_code_issued` | role only |
| `growth.referral_claimed` | outcome only |
| `growth.referral_qualified` | rule key only |
| `growth.promotion_offered` | campaign key, discount minor |
| `growth.promotion_redeemed` | campaign key, discount minor |

No event carries a user identifier, a code, an email, a phone number, a device
identifier, or an advertising identifier. The WPS-018
`private.operational_payload_safe` allowlist rejects those key names at write
time and drops the payload rather than the event.

No profiling. No advertising identifiers. No third-party marketing provider. No
analytics value reaches WPS-008 ranking.

---

## 11. Localization and accessibility

Full English and Egyptian Arabic across every growth surface, with RTL layout.
The motto is unchanged: `YOUR WORK, OUR MISSION` / `شغلك مهمتنا`.

Accessibility requirements, audited in `docs/testing/WPS-021-ACCESSIBILITY-REVIEW.md`:

- The referral code is selectable text with an accessible label reading the code
  character by character, never an image.
- Share controls carry explicit accessible labels and hints.
- Reward state is conveyed by text and icon, never by colour alone.
- Campaign and reward cards expose a single accessible summary rather than a
  stream of unlabelled fragments.
- The eligible-promotion banner announces itself through a live region and is
  reachable in the focus order.
- All touch targets meet the existing 44 × 44 minimum.
- Every colour pair meets WCAG AA in both appearances, using the WPS-020
  semantic tokens with no new literal.

---

## 12. Security requirements

| Requirement | Mechanism |
| --- | --- |
| Owner isolation | RLS on every customer-visible table, `auth.uid()` scoped |
| No client enumeration of campaigns | No grant, no policy; access only through RPC |
| `SECURITY DEFINER` only where justified | Each such function documents why |
| Empty `search_path` | Every function |
| Minimal grants | `authenticated` only, on RPCs only |
| Audit trails | Staff actions through `record_staff_audit`; attribution and rewards immutable by trigger |
| Idempotency | Unique keys on claim, qualification, and redemption |
| Bounded queries | Every list RPC takes a capped limit |
| Rate limiting | Four new WPS-018 policies |

---

## 13. Deferred and refused, recorded

| Item | State | Why |
| --- | --- | --- |
| Entitlement fulfilment automation | Deferred | Requires a funding decision that is the owner's, not engineering's |
| Deep-link invite handling | Deferred | The share link resolves to a web route; native deep-link association needs a device and a hosted domain |
| Device fingerprinting | **Refused** | Warsha collects no device identifier. The duplicate-device signal is available only if a future WPS authorizes a hash source |
| Referral leaderboards | **Refused** | Competitive mechanics were excluded by the locked scope |
| Promotion A/B testing | Not built | Not requested; would require a second ranking-adjacent system |
| Worker-side promotional discounts | **Refused** | A worker discount would reduce worker compensation, which §2 forbids |

---

## 14. Acceptance state

- Implemented locally on `feat/wps-021`.
- Migration `202608060001` is local-only. **No hosted push was executed.**
- Manual alpha suite: `docs/testing/WPS-021-MANUAL-ALPHA.md`. Every case is
  **NOT RUN**.
- Evidence: `docs/testing/WPS-021-ACCEPTANCE-EVIDENCE.md`.
- Promotions and referrals both ship **disabled**. Enabling either is an
  operational decision recorded through WPS-017, not a deployment side effect.
