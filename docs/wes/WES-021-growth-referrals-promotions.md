# WES-021 — Growth, Referrals, Promotions & Customer Acquisition (Engineering Baseline)

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **ENGINEERING BASELINE — MANUAL AND HOSTED DEPLOYMENT GATED** |
| Implements | WPS-021 |
| Authority | Constitution → WPS-007 → WPS-016 → WPS-017 → WPS-018 → WPS-021 → WES-021 |
| Migration | `supabase/migrations/202608060001_wps021_growth_referrals_promotions.sql` |

This document records *how* WPS-021 was built, and what it deliberately did not
build.

---

## 1. Extension strategy

WPS-021 introduces **no new infrastructure**. Every cross-cutting concern was
already solved by an earlier WPS, and the audit's central finding was that the
work remaining was product logic, not platform.

| Concern | Existing authority reused | New code written |
| --- | --- | --- |
| Warsha-funded discount reaching the ledger | `private.create_booking_price_snapshot` (WPS-007) | None |
| Financial account for the expense | `warsha_promotion_expense` (WPS-007) | None |
| Refund reversal of a promotion | `promotion_reversal_minor` (WPS-007) | None |
| Creator ≠ approver | `staff_dual_control_requests` + `consume_dual_control` (WPS-018) | None |
| Fail-closed release control | `private.staff_feature_flags` (WPS-017) | Two seed rows |
| Restrictive kill switch | `private.staff_kill_switches` (WPS-017) | One seed row |
| Staff capability gate | `private.require_staff_capability` (WPS-018) | Two capability rows |
| Staff audit trail | `private.record_staff_audit` (WPS-017) | None |
| Advisory fraud signals | `private.record_trust_fraud_signal` (WPS-016) | None |
| Notification delivery, preferences, quiet hours, dedupe | `private.prepare_notification` (WPS-014) | Five catalog rows |
| Rate limiting | `private.enforce_rate_limit` (WPS-018) | Four policy rows |
| Privacy-safe analytics | `private.record_operational_event` (WPS-018) | None |
| Theme tokens | WPS-020 `ThemeColors` | None |

Two constraints shaped the schema rather than being worked around:

- `operational_log_category_check` admits a fixed category list with no `growth`
  member. Growth events are logged under `marketplace`, which is where customer
  acquisition belongs, rather than altering a constraint on an applied
  migration.
- `staff_capabilities_domain_check` likewise has no `growth` domain, so the two
  new capabilities live in `marketplace`.

Neither constraint was modified. Editing an applied migration is forbidden, and
loosening a check constraint to fit a new feature is how allowlists stop
meaning anything.

---

## 2. The entitlement decision

The specification asked for referral rewards and for credits. The locked scope
then removed wallets, credit balances, and booking credits. Those two facts are
only compatible under one design.

A reward is an **entitlement record**, not a stored value:

```
referral_attributions ──qualifies──▶ referral_reward_entitlements
                                              │
                                              │ staff link a rule to a campaign
                                              ▼
                                     campaign_eligibility_grants
                                              │
                                              │ customer books
                                              ▼
                                      campaign_redemptions
                                              │
                                              ▼
                            WPS-007 price snapshot (promotion_minor)
                                              │
                                              ▼
                                   warsha_promotion_expense
```

The entitlement is inert. It carries no amount that anyone can spend, cannot be
transferred, cannot be summed into a balance, and produces no ledger row. The
only path from "earned" to "money" runs through a campaign that a human
approved.

This is what allows WPS-021 to honestly claim it creates no second financial
system. There is no balance to reconcile because there is no balance.

A consequence, recorded rather than hidden: an entitlement with no linked
campaign stays unfulfilled indefinitely. That is deliberate. The alternative —
auto-creating a campaign when a referral qualifies — would mean the system
approves its own spending, which §5.2 of WPS-021 exists to prevent.

---

## 3. Code generation

```sql
create or replace function private.generate_referral_code()
returns text language plpgsql security definer set search_path='' as $$
```

Ten characters drawn from a 28-symbol alphabet using
`extensions.gen_random_bytes(1)` per character, with rejection sampling.

Three details matter:

**Rejection sampling, not modulo.** `byte % 28` maps 256 bytes onto 28 symbols
unevenly — the first twelve symbols occur 10 times each and the rest 9, a
measurable bias. Bytes ≥ 252 are drawn again instead. The loop is bounded so a
pathological entropy source cannot hang a transaction.

**The alphabet excludes `0 O 1 I L`.** A referral code is read aloud across a
room and typed by someone who did not hear it clearly. Ambiguous glyphs convert
a growth feature into a support ticket.

**Collision is handled by the unique index, not by a pre-check.** The function
inserts and retries on `unique_violation`, bounded to 5 attempts. A
`select … where not exists` pre-check is a race, and at 2.96 × 10¹⁴ possible
codes the retry path is effectively unreachable — but it exists rather than
being assumed away.

---

## 4. Eligibility as one transaction

`private.evaluate_promotion_eligibility(p_user_id, p_booking_id)` returns the
single answer. Twelve conditions are checked in one pass, ordered cheapest
first so an off flag costs one index lookup rather than a join:

1. feature flag → 2. kill switch → 3. campaign approved → 4. status `active`
→ 5. time window → 6. environment → 7. audience → 8. eligibility grant
→ 9. booking restrictions → 10. budget → 11. global limit → 12. per-account
limit and prior redemption.

The function is `security definer` because it reads
`private.staff_feature_flags`, `private.staff_kill_switches`, and
`public.growth_campaigns`, none of which the caller may read directly. That is
the justification, and it is written in the function body.

It returns at most one campaign. Where several would qualify, the ordering is
deterministic — largest discount, then earliest `ends_at`, then campaign key —
so the same booking always sees the same offer. A non-deterministic offer would
be untestable and would look, to a customer who reloaded, like a bug or a trick.

The failure mode is uniform: any exception is caught and resolved to *no
promotion*. An eligibility evaluator that throws would otherwise turn a
configuration mistake into a broken checkout.

---

## 5. Concurrency

Two customers redeeming the last unit of budget is the interesting case.

`public.redeem_promotion` takes `select … from public.growth_campaigns where id
= … for update` before re-evaluating eligibility, so the second transaction
blocks until the first commits and then observes the consumed budget. The
re-evaluation inside the lock is what makes this correct — evaluating before
the lock and trusting the result afterwards is the classic time-of-check bug.

A second promotion on one booking is prevented by a unique index on
`campaign_redemptions(booking_id)` rather than by a status check. A check can be
raced; a unique index cannot.

Qualification is idempotent through `unique (attribution_id)` on the entitlement
table plus `on conflict do nothing`. The booking-completion trigger may fire more
than once — WPS-012 allows a terminal state to be re-asserted — and a duplicate
reward would be a real financial defect.

---

## 6. Retiring the legacy scaffold

```sql
drop policy if exists public_active_promos on public.promo_codes;
alter table public.promo_codes enable row level security;
alter table public.promo_code_uses enable row level security;
revoke all on public.promo_codes from anon, authenticated, public;
revoke all on public.promo_code_uses from anon, authenticated, public;
comment on table public.promo_codes is 'RETIRED by WPS-021 …';
```

RLS enabled with **no policy** is the deny-by-default posture. Revoking grants
alone would leave the tables one accidental `grant` away from being readable
again; RLS with no policy means even a future grant returns zero rows.

The tables are not dropped. They exist on the hosted project, `promo_code_uses`
carries foreign keys into `customer_profiles` and `bookings`, and a drop is
irreversible. Retiring loses nothing and can be undone; dropping cannot. The
`comment on table` exists so the next engineer reads the decision instead of
rediscovering the tables and wondering whether they are live.

---

## 7. Client architecture

| Module | Role |
| --- | --- |
| `src/growth/growth-types.ts` | Import-free contracts and pure rules; executable directly by Node |
| `src/growth/mock-growth-state.ts` | Per-account Mock over the shared mock catalog |
| `src/growth/growth-repository.ts` | Method-per-RPC with an explicit Mock branch each |
| `src/growth/growth-context.tsx` | Account-isolated state with the WPS-019 generation guard |
| `src/growth/growth-copy.ts` | Import-free bilingual tables |

The generation guard is unchanged from WPS-019 and WPS-020: a response that
arrives after the account changed is discarded. Referral codes and reward
history are among the most identifying data in the app, so a single frame of
the previous account's referral screen would be a real leak.

Mock imports no Supabase module, constructs no client, and performs no network
call — asserted by three separate checks.

---

## 8. Screens

| Screen | Audience |
| --- | --- |
| `app/referrals.tsx` | Customer and worker — code, share, status list, reward history |
| Promotion banner inside the existing booking summary | Customer, only when eligible |
| `app/staff/campaigns.tsx` | Staff — list, draft, submit, activate, pause, cancel, preview |

There is no promo-code entry field anywhere in the app. There is no campaign
browser. There is no balance display. A regression assertion greps for a code
input in the customer tree and fails if one appears, because this is exactly the
kind of feature that gets added back by someone who did not read the scope.

---

## 9. Mock parity

| Parity | Status |
| --- | --- |
| Code shape, alphabet, length | Identical |
| One code per account, immutable | Identical |
| Self-referral rejection | Identical |
| One attribution per referred account | Identical |
| Qualification only on completion | Identical |
| Idempotent qualification | Identical |
| Entitlement bounds (30-day and lifetime) | Identical |
| Campaign lifecycle and immutability after `draft` | Identical |
| Twelve-condition eligibility | Identical |
| One promotion per booking | Identical |
| Budget and limit consumption | Identical |
| Fail-closed with flags off | Identical |
| Code **generation** | Not identical. Mock uses a seeded deterministic generator so tests are reproducible; the server uses `gen_random_bytes`. The alphabet, length, and uniqueness guarantees match. |

---

## 10. Open engineering items

| Item | State | Why |
| --- | --- | --- |
| Entitlement fulfilment automation | Not built | Requires an owner funding decision |
| Native deep-link invite association | Not built | Needs a hosted domain and a device |
| Device fingerprint signal | Not wired | Warsha collects no device identifier; the signal exists but has no source |
| Campaign performance analytics beyond counters | Not built | Would need a reporting surface WPS-017 does not yet expose |
| Referral share sheet on web | Partial | `navigator.share` is unavailable on desktop browsers; falls back to copy |
| Measured on-device contrast | Not done | Computed from the palette only, as with WPS-020 |
