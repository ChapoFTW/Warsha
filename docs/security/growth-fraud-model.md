# Growth fraud model (WPS-021)

## The rule that shapes everything below

> **WPS-021 detects. WPS-016 decides.**

Nothing in this document blocks an account, restricts an account, voids a
completed qualification, or changes trust state. Every signal is advisory and is
written through `private.record_trust_fraud_signal`, whose own comment reads
*"Deliberately no enforcement here. Signals inform staff; they never punish."*

A growth feature that punishes automatically will eventually punish a real
customer for something a real customer did. Referral abuse is not urgent enough
to justify that.

## Signals, and how they are recorded

WPS-016 constrains `signal_key` to ten values. WPS-021 **maps onto that
vocabulary** rather than widening the constraint, so growth abuse arrives in the
queue staff already triage, and the growth specifics ride in `safe_detail`.

| Growth condition | Recorded as | Severity | `safe_detail.growthSignal` |
| --- | --- | --- | --- |
| An account claims its own code | `duplicate_identity` | low | `self_referral_attempt` |
| A referred B, then B's code was claimed by A | `account_farming` | low | `circular_referral` |
| More than 10 attributions to one referrer in 24 h | `account_farming` | medium | `signup_burst` |
| More than 5 redemptions by one account in 7 days | `abnormal_payment_behavior` | low | `promotion_velocity` |

Widening `trust_fraud_signals_key_check` was considered and rejected. WPS-016 is
listed as a preserved authority; a new feature that edits another authority's
allowlist to fit itself is how allowlists stop meaning anything. A pgTAP
assertion proves the constraint was not widened.

## Threats and what actually stops them

| Threat | Control | Enforcement point |
| --- | --- | --- |
| Guessing a referral code | 31¹⁰ ≈ 8.19 × 10¹⁴ space, plus a 10-per-hour claim limit | `growth_referral_claim` policy |
| Enumerating which codes exist | An unknown code and a revoked code return the identical answer | `claim_referral_code` |
| Enumerating campaigns | No grant, no policy on `growth_campaigns`; visibility is a computed result | Table privileges |
| Probing for campaign existence through eligibility | 60-per-hour lookup limit; failure discloses no reason | `growth_promotion_lookup` |
| Self-referral | Check constraint, plus an explicit server check, plus a signal | Three independent places |
| One person, many accounts | Velocity and burst signals for staff review | Advisory only |
| Reward for signing up | Structurally impossible: qualification requires a completed booking **and** a WPS-007 price snapshot | `qualify_referral_for_booking` |
| Double reward from a repeated completion event | `unique (attribution_id, beneficiary_user_id)` + `on conflict do nothing` | Database |
| Two promotions on one booking | `unique (booking_id)` on redemptions | Database |
| Racing the last unit of budget | `select … for update` on the campaign, then re-evaluate **inside** the lock | `redeem_promotion` |
| Refund farming (redeem, cancel, repeat) | Cancellation reverses the redemption and releases the budget; velocity signal fires | Trigger + signal |
| A staff member funding their own campaign | Creator ≠ activator check, plus WPS-018 dual control, plus a table constraint | Three independent places |
| Promotion reducing worker pay | Arithmetically impossible under WPS-007 | `create_booking_price_snapshot` |

## Deliberately not built

**Device fingerprinting.** The specification lists a duplicate-device signal.
Warsha collects no device identifier, and WPS-021 has no authority to start.
The signal name exists in this document so the gap is visible, but nothing
computes it and nothing stores a fingerprint. Adding one requires a WPS that
weighs the privacy cost explicitly.

**Automatic clawback.** A qualified referral is never retroactively voided by an
automated rule. Staff may void an entitlement; a heuristic may not.

**Scoring accounts.** There is no growth risk score, no reputation number, and
no input from any of this into WPS-008 ranking. A pgTAP assertion proves no
ranking or matching function reads a growth table.

## Residual risk, stated plainly

A determined operator with several real phone numbers and the patience to
complete real bookings can earn several referral entitlements. This is accepted:
each such referral produced a **real completed job** that Warsha took commission
on, and the reward is capped at 10 per 30 days and 50 per lifetime per referrer.
The economics do not favour the attacker, and the alternative — blocking
accounts on suspicion — costs more in real customers than it saves.
