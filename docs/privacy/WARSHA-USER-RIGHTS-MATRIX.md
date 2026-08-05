# Warsha user-rights matrix

What a person can actually do about their own data, what happens when they do
it, and where it is enforced.

> This describes **product behaviour**, not legal entitlement. Which of these
> Warsha is obliged to offer under Egyptian law is an open question — see
> [WARSHA-PRIVACY-LEGAL-QUESTIONS](WARSHA-PRIVACY-LEGAL-QUESTIONS.md).

## The rights, as built

| Right | Available | Surface | Enforced by | Limits |
| --- | --- | --- | --- | --- |
| See what is stored | Yes | Privacy centre | `get_my_privacy_overview` | Categories, not row dumps |
| Correct profile information | Yes | Profile | WPS-002 / WPS-010 | Verified fields need staff review |
| See consent decisions | Yes | Privacy centre | `get_my_consents` | — |
| Withdraw optional consent | Yes | Privacy centre | `record_my_consent` | Required purposes cannot be declined |
| Clear search history | Yes | Privacy centre | `clear_my_privacy_history` | Irreversible |
| Clear viewing history | Yes | Privacy centre | `clear_my_privacy_history` | Irreversible |
| Manage notification preferences | Yes | Notification preferences | WPS-014 | Security notices are mandatory |
| Request a copy of data | Yes | Privacy centre | `request_my_data_export` | Manifest only; no file yet |
| Deactivate | Yes | Privacy centre | `set_my_account_deactivated` | Reversible by signing in |
| Request deletion | Yes | Deletion screen | `request_account_deletion` | Blockers apply |
| Cancel a deletion request | Yes | Deletion screen | `cancel_account_deletion` | Only before processing starts |
| See why deletion is blocked | Yes | Deletion screen | `blocker_codes` | Codes only; no evidence, no names |
| Object to a hold | **No** | Support | — | A hold is not user-contestable |
| Erase a booking | **No** | — | — | Two people share it |
| Erase a financial record | **No** | — | — | WPS-007 authority |
| Erase a safety report | **No** | — | — | WPS-016 authority |

## What deletion actually does

**Removed:** display name → neutral label · profile photo · phone · addresses
(soft-deleted) · worker biography, cover image, specialties, skills, location
label · portfolio (soft-deleted) · worker listing unpublished and unavailable ·
recent searches · recently viewed · favourites · appearance preference · device
tokens revoked and labels cleared.

**Kept, and why:**

| Kept | Why |
| --- | --- |
| Bookings | The other party's record would otherwise have a hole in it |
| Messages | Dispute evidence belongs to both participants |
| Reviews | Shown under a neutral reviewer label; a worker's reputation rests on them |
| Disputes | WPS-013 authority; a resolved dispute is a record of a decision |
| Trust history | WPS-016 authority; erasing it would enable ban evasion |
| Payments, earnings, ledger | WPS-007 authority; deleting would unbalance the books |
| Referral attribution | Deleting it enables delete-and-recreate referral fraud |
| Consent history | It is the proof of what was agreed |
| Notifications | Payloads are already only resource UUIDs; titles are generic |
| Account UUID | The join key under a payout and a receipt |

**This makes the result pseudonymous, not anonymous.** The deletion screen says
so before the request is made, not after.

## What a person is told, and when

| Moment | What they see |
| --- | --- |
| Before requesting | What goes, what stays, that it is not instant, that it is not total |
| On request, clean | Cooling-off window with hours remaining, and how to cancel |
| On request, blocked | Which of *their own* commitments is in the way |
| On request, held | That Warsha must keep the data, that nothing they do changes it, and where to ask |
| During cooling-off | Time left and a cancel control |
| Once processing | That it can no longer be cancelled |
| On completion | That personal information has been removed |

Every one of those is a notification with an **empty payload** in the `security`
category, so it cannot be suppressed by preferences and cannot leak on a lock
screen.

## What is deliberately absent

- No "are you sure you want to lose everything".
- No guilt, no retention offer, no "we'll miss you".
- No instruction to contact support for an ordinary deletion.
- No requirement to type a phrase — the confirmation is a second labelled
  press, which is reachable by screen reader and by anyone with a tremor.
- No claim that deletion is immediate.
- No claim that every record is erased.

All six are asserted absent by `npm run test:wps022`.

## Export scope

Included: profile · addresses · bookings · reviews written · messages sent ·
support cases · payments · consents · search history · referrals.

Excluded, and stated inside the manifest itself: another participant's contact
details · staff notes and internal case history · the identity of anyone who
reported a safety concern · fraud and trust signal internals · payment-provider
secrets and full card or bank numbers.

The exclusion list travels **with the file** rather than living only in a help
article nobody opens.
