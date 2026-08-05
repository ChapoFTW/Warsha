# Growth architecture (WPS-021)

## The one-page version

```
                    ┌──────────────────┐
                    │ referral_codes   │  one per account, immutable,
                    │  CSPRNG, 31^10   │  revocable only by staff
                    └────────┬─────────┘
                             │ claim (server-validated, rate-limited)
                             ▼
                 ┌───────────────────────────┐
                 │ referral_attributions     │  one per referred account, EVER
                 │  status: pending          │  immutable once written
                 └────────┬──────────────────┘
                          │ booking reaches `completed`
                          │ AND a WPS-007 price snapshot exists
                          ▼
              ┌────────────────────────────────┐
              │ referral_reward_entitlements   │  NOT money. No balance.
              │  status: recorded              │  Posts no ledger row.
              └────────┬───────────────────────┘
                       │ only if staff linked the rule to a campaign
                       ▼
            ┌──────────────────────────────────┐
            │ campaign_eligibility_grants      │
            └────────┬─────────────────────────┘
                     │ customer opens a booking
                     ▼
        ┌────────────────────────────────────────────┐
        │ private.evaluate_promotion_eligibility     │  12 conditions,
        │  returns at most ONE offer, or nothing     │  one transaction
        └────────┬───────────────────────────────────┘
                 │ redeem (row lock, then re-evaluate)
                 ▼
        ┌───────────────────────┐
        │ campaign_redemptions  │  unique(booking_id) — one promotion per booking
        └────────┬──────────────┘
                 ▼
   ┌──────────────────────────────────────────────────┐
   │ WPS-007 private.create_booking_price_snapshot    │
   │   provider_gross = customer_total + promotion    │
   │   → warsha_promotion_expense                     │
   └──────────────────────────────────────────────────┘
```

## Why the entitlement is inert

The locked scope forbids a customer wallet, a credit balance, and booking
credits. A referral must still reward somebody. Those two facts are only
compatible if a reward is a **record that something was earned**, not a stored
value.

An entitlement therefore has no amount, cannot be transferred, cannot be summed,
and posts nothing. It becomes real only when staff have already approved a
campaign to honour it. If nobody approved one, the entitlement sits in the
owner's history marked *earned*, and Warsha owes nothing it has not authorised.

The alternative — creating a campaign automatically when a referral qualifies —
would mean the system approves its own spending. That is what
[the dual-control rule](../wps/WPS-021-growth-referrals-promotions.md) exists to
prevent, so it cannot be reintroduced through the back door.

## What a promotion is allowed to touch

| Value | Effect of a promotion |
| --- | --- |
| Customer total | **Reduced** |
| `promotion_minor` on the snapshot | Set to the discount |
| Provider gross | **Unchanged** — the promotion is added back |
| Commission basis | **Unchanged** |
| Provider net | **Unchanged** |
| Payout eligibility | **Unchanged** |
| WPS-008 ranking | **Untouched**, and asserted untouched |

The redemption path writes two fields on the booking: `price_breakdown.discount`
and a reduced `final_price_egp`. Both are required. Writing only the first
leaves the customer paying full price and inflates provider gross above the job
value, which would make Warsha fund a bonus rather than a discount — a defect
caught by pgTAP during implementation and now asserted permanently.

## Where each concern actually lives

| Concern | Owner | WPS-021's part |
| --- | --- | --- |
| Money, ledger, refunds | `create_booking_price_snapshot` | Calls it |
| Enforcement, bans, restrictions | WPS-016 | Records advisory signals only |
| Notification delivery, preferences, quiet hours | WPS-014 | Five catalog rows |
| Staff identity and capability | WPS-017/018 | Two capability rows |
| Approval of irreversible actions | WPS-018 dual control | Consumes it |
| Release control | WPS-017 flags and kill switches | Two flags, one switch |
| Rate limiting | WPS-018 limiter | Four policy rows |
| Observability | WPS-018 event sink | Five event keys |
| Colour and theming | WPS-020 tokens | No literal of its own |

## Failure behaviour

Every path fails to *no promotion*, never to a discount:

- flag absent → off
- flag disabled → off
- kill switch active → off
- campaign missing, unapproved, expired, out of budget, over limit → no offer
- eligibility evaluator raises → caught, returns `{ eligible: false }`
- redemption raises → the booking is untouched, no counter moves

There is no code path in which an error produces money leaving Warsha.
