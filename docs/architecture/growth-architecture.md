# Growth architecture (WPS-021)

## Two independent systems

```
REFERRALS                                    ADMIN PROMOTIONS
─────────                                    ────────────────

staff approve a PROGRAMME once               staff approve a CAMPAIGN once
        │                                             │
        ▼                                             ▼
┌──────────────────┐                        ┌──────────────────────┐
│ referral_codes   │  CSPRNG, 31^10         │ growth_campaigns     │
│ immutable        │                        │ immutable after draft│
└────────┬─────────┘                        └──────────┬───────────┘
         │ claim                                       │
         ▼                                             │
┌───────────────────────────┐                          │
│ referral_attributions     │ one per account, EVER    │
└────────┬──────────────────┘                          │
         │ referred account completes a booking        │
         │ carrying a WPS-007 price snapshot           │
         ▼                                             │
┌────────────────────────────────┐                     │
│ referral_rewards               │  ◀── AUTOMATIC.     │
│ status: available              │      No human.      │
│ bounded, single-use, expiring  │                     │
└────────┬───────────────────────┘                     │
         │                                             │
         │  evaluate_referral_benefit    evaluate_promotion_eligibility
         │  (reads no campaign)          (reads no referral state)
         │                                             │
         └──────────────┬──────────────────────────────┘
                        ▼
          ┌──────────────────────────────┐
          │ get_my_booking_benefit       │  returns AT MOST ONE
          └──────────────┬───────────────┘
                         ▼
          ┌──────────────────────────────────┐
          │ booking_benefit_redemptions      │
          │ unique(booking_id) = the         │
          │ stacking rule, as a constraint   │
          └──────────────┬───────────────────┘
                         ▼
     ┌──────────────────────────────────────────────────┐
     │ WPS-007 create_booking_price_snapshot            │
     │   final_price_egp reduced                        │
     │   price_breakdown.discount recorded              │
     │   provider_gross = customer_total + promotion    │
     │   → warsha_promotion_expense                     │
     └──────────────────────────────────────────────────┘
```

Neither branch touches the other. An account that has never referred anybody can
receive a promotion; an account that referred somebody receives its reward with
no campaign in existence.

## Where the human decision sits

Exactly once per system, **in advance**:

| System | The one human decision | What follows |
| --- | --- | --- |
| Referrals | Approve the programme (dual control) | Server grants every qualifying reward automatically |
| Promotions | Approve the campaign (dual control) | Server evaluates every user automatically |

There is no per-referral approval and no per-user approval. Neither is
"not built yet" — both are structurally absent, and pgTAP asserts that no
per-referral approval ever appears in the staff audit trail.

## Why budget is reserved at grant time

A reward reserves the **maximum it could be worth** the moment it is granted.

Reserving at redemption instead would make the budget meaningless: a programme
with a 10,000 EGP budget could grant a million rewards, because none had been
spent yet. Reserving the ceiling means the budget bounds *outstanding
liability*, which is the number that actually matters.

The unused remainder is released on three paths:

| Event | Released |
| --- | --- |
| Redeemed for less than the ceiling | `reserved − actual` |
| Expired unused | The whole reservation |
| Booking cancelled or refunded | The consumed amount; and if the programme says `restore`, the reward comes back and re-reserves |

## What a benefit is allowed to touch

| Value | Effect |
| --- | --- |
| Customer total | **Reduced** |
| `promotion_minor` on the snapshot | Set to the discount |
| Provider gross | **Unchanged** — the benefit is added back |
| Commission basis | **Unchanged** |
| Provider net | **Unchanged** |
| Payout eligibility | **Unchanged** |
| WPS-008 ranking | **Untouched**, and asserted untouched |

Redemption writes two fields: a reduced `final_price_egp` **and**
`price_breakdown.discount`. Both are required — writing only the second leaves
the customer paying full price and inflates provider gross above the job value,
making Warsha fund a worker bonus rather than a customer discount. That was a
real defect caught by pgTAP during implementation and is now asserted
permanently.

## Where each concern lives

| Concern | Owner | WPS-021's part |
| --- | --- | --- |
| Money, ledger, refunds | WPS-007 `create_booking_price_snapshot` | Calls it |
| Enforcement, bans | WPS-016 | Advisory signals only, on its vocabulary |
| Notifications | WPS-014 | Five catalog rows |
| Staff identity, capability, dual control | WPS-017 / WPS-018 | Four capability rows |
| Release control | WPS-017 flags and kill switches | Two flags, two switches |
| Rate limiting | WPS-018 limiter | Four policy rows |
| Observability | WPS-018 event sink | Five event keys |
| Colour and theming | WPS-020 tokens | No literal of its own |

## Failure behaviour

Every path fails to *no benefit*, never to a discount:

- flag absent, disabled, or kill switch active → nothing
- no approved programme or campaign → nothing
- outside window, out of budget, over limit → nothing
- evaluator raises → caught, returns `{ eligible: false }`
- redemption raises → booking untouched, no counter moves

There is no code path in which an error causes money to leave Warsha.
