# Warsha deletion and anonymization model

## The central claim, stated plainly

**Warsha does not offer anonymity. It offers pseudonymization.**

The account UUID survives deletion. It has to: it is the join key under a
worker's payout, a customer's receipt, a dispute somebody else opened, and a
ledger entry that must balance. Anything that can be linked back to an account
is personal data, and the UUID can. So the result is **not anonymous**, and this
document uses the accurate word rather than the comfortable one.

Two related claims Warsha also does not make:

- Reversible encryption is not deletion. Nothing here encrypts data and calls
  it erased.
- A soft delete is not a deletion. Where a row is soft-deleted, it says so.

## Why anonymization rather than deletion

A customer and a worker share a booking. If the customer leaves and the booking
vanishes:

- the worker's completed-job count drops, changing their public ranking;
- their earnings row points at nothing;
- a dispute they were part of loses half its evidence;
- the ledger no longer balances.

One party cannot be allowed to rewrite the other's past. **Deletion of shared
records is not a privacy feature; it is a data-integrity failure with a
privacy-shaped justification.**

So the primitive is anonymization — remove the *person*, keep the *record* —
with a narrow, documented set of true deletions for data that exists only to
serve the departing account.

## The lifecycle

```
requested ─→ cooling_off ─→ approved ─→ processing ─→ anonymized ─→ completed
                 │  ▲             │
                 │  └── (blockers clear)
                 ▼
             blocked / legal_hold ─→ cancelled
                                        ▲
             cooling_off ───────────────┘
```

| State | Meaning | Cancellable |
| --- | --- | --- |
| `cooling_off` | Requested; the window is running | Yes |
| `blocked` | A commitment the account can resolve is open | Yes |
| `legal_hold` | Warsha must keep the data; the account cannot change this | Yes |
| `approved` | Window elapsed, no blockers, awaiting execution | No |
| `processing` | Execution started | No |
| `anonymized` | Personal data removed; authoritative records remain | No |
| `completed` | Done | No |
| `cancelled` | Withdrawn by the account | — |
| `failed` | Execution failed; needs an operator | No |

`blocked` and `legal_hold` are separate states on purpose. Both mean "not yet",
but only the first is something the person can act on. Collapsing them would
send somebody to cancel bookings that were never the obstacle.

## Blockers

| Code | Meaning | Why it blocks |
| --- | --- | --- |
| `active_booking` | A booking is still running | Somebody is relying on it |
| `open_dispute` | A dispute is unresolved | Evidence is still in use |
| `unsettled_payment` | A payment has not settled | The money is in flight |
| `outstanding_earnings` | Warsha owes the worker | Deleting would cancel a real debt in Warsha's favour |
| `active_payout` | A payout is processing | The transfer is in flight |
| `open_chargeback` | A bank dispute is open | Evidence is required |
| `active_enforcement` | A restriction is in force | Deleting would enable ban evasion |
| `open_support_case` | A support case is open | The conversation is unfinished |
| `legal_hold` | A documented hold exists | Not resolvable by the account |

`outstanding_earnings` deserves emphasis. Without it, an account with a live
payable could be deleted and the debt would quietly disappear — in Warsha's
favour. That is the kind of bug that looks like a privacy feature.

Blockers are evaluated **twice**: at request time so the person learns
immediately, and again before execution so a dispute opened during the
cooling-off window still stops it.

## What anonymization does, exactly

Implemented in `private.privacy_anonymize_account`, and each step is logged
with a row count in `private.privacy_anonymization_log`.

| Step | Action |
| --- | --- |
| `profile` | Name → neutral label; photo, phone cleared; `deleted_at` set |
| `provider_profile` | Name → label; biography, cover, specialties, skills, location cleared; unpublished; unavailable; `deleted_at` set |
| `portfolio` | Soft-deleted |
| `addresses` | Soft-deleted |
| `recent_searches` | **Deleted** |
| `recently_viewed` | **Deleted** |
| `favourites` | **Deleted** |
| `display_preferences` | **Deleted** |
| `device_tokens` | Revoked; encrypted token and label cleared; hash retained |
| `notifications_preserved` | Counted, not deleted — see below |
| `auth_disabled` | Recorded; performed at the auth layer, which WPS-022 does not own |

Three preservation decisions look like the wrong choice until you read the
reason:

**Notifications are kept.** WPS-014's `notification_safe_payload` already
reduced their payloads to resource UUIDs at write time, and their titles come
from a generic catalog. There is nothing personal left to remove. Deleting them
would also break `notification_source_links`, which is **immutable by design**
so a re-emitted event can never produce a duplicate years later.

**Device tokens are revoked, not deleted.** The hash is how WPS-014 proves it
stopped sending to a device. Deleting the row would erase that proof.

**Addresses are soft-deleted, not removed.** A booking snapshot already froze
the address it was served at, so the live row has no further purpose — but
WPS-001 references it, and a hard delete would break those references.

## Anonymization is a system operation

It runs with **no end-user session**. This is not a convention; it is enforced
by an existing guard.

`private.prevent_provider_approval_changes` (WPS-010) refuses a change to
`is_published` when `auth.uid()` is present and the actor is not staff. An
anonymization attempted from inside somebody's own signed-in session therefore
fails — correctly. The executor is a server process, and the pgTAP fixture
clears its claims to reflect that rather than to work around the rule.

## Holds override everything

`private.privacy_hold_active(user_id, scope)` is checked at the top of
`privacy_anonymize_account`, and it raises rather than returning a value the
caller might ignore. An `account`-scope hold covers every narrower scope,
because a hold on the person covers everything about the person.

## What the person is shown

Before requesting — never after — the deletion screen lists what goes and what
stays, and states in plain words that the process is neither instant nor total.
Discovering afterwards that the ledger survives is how people end up feeling
deceived by a product that was technically truthful.
