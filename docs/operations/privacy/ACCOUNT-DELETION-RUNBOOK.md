# Runbook — account deletion

**Owner:** Security administrator
**Capability:** `review_privacy_requests` (state only)
**Status:** Request, cancellation and execution work. Execution runs from
cron every ten minutes (`202609170009`).

---

## 1. How a request is carried out

`private.process_account_deletions(limit)` runs every ten minutes under the
cron job `warsha-account-deletions`. Each run does two things:

1. **Judges** every request whose cooling-off window has elapsed, against
   `private.privacy_deletion_blockers`: no blockers → `approved`; a legal hold →
   `legal_hold`; anything else → `blocked`, with the codes recorded so the
   account is told which commitment stands in the way. A blocked request is
   judged again on the next run, because blockers clear on their own when the
   job ends or the dispute closes.
2. **Executes** every approved request: `private.privacy_anonymize_account`,
   then `completed`. Each request runs in its own exception block, so one
   failure is recorded against that request (`failed`, with the SQLSTATE and
   message in `failure_reason`) and the rest still run.

It obeys `privacy_configuration.deletion_enabled`. A Warsha that does not offer
deletion does not quietly perform it, and the processor says `enabled: false`
and changes nothing.

**Until 2026-09-17 none of this existed.** Requests sat in `cooling_off`
forever while the app said "your account will be deleted after the waiting
period". If you are reading a request older than that, it was waiting on this,
not on a blocker.

## 2. States

| State | Meaning | Cancellable |
| --- | --- | --- |
| `cooling_off` | Window running (168 h default) | Yes |
| `blocked` | A commitment the account can resolve | Yes |
| `legal_hold` | Warsha must keep the data | Yes |
| `approved` | Window elapsed, blockers clear | No |
| `processing` | Execution started | No |
| `anonymized` | Personal data removed | No |
| `completed` | Done | No |
| `cancelled` | Withdrawn | — |
| `failed` | Execution failed | No |

## 3. Reading the queue

```
staff → /admin/privacy → Deletion requests
```

Shows a truncated reference, the state, the request date, and a **blocker
count**. It does not show which blockers, the reason code, or any contents —
those are the account's affairs.

The read is recorded in `private.staff_access_log` under `audit_explorer` with
shape `privacy_deletion_requests`.

## 4. Blockers

| Code | Told to the user as |
| --- | --- |
| `active_booking` | "You have a booking that is still going on." |
| `open_dispute` | "You have a dispute that is still open." |
| `unsettled_payment` | "You have a payment that has not settled." |
| `outstanding_earnings` | "You have earnings Warsha has not paid you yet." |
| `active_payout` | "You have a payout being processed." |
| `open_chargeback` | "There is a payment being investigated with your bank." |
| `open_support_case` | "You have a support case that is still open." |
| `active_enforcement` | "There is a restriction on your account." |
| `legal_hold` | "We have to keep your information for now. We cannot say more, and nothing you do will change it." |

Blockers are evaluated at request time **and** again before execution, so a
dispute opened during the cooling-off window still stops it.

**A blocked request stays cancellable.** An account that cannot leave yet is not
trapped in a workflow it did not want.

## 5. Handling a support query

**"I asked to delete my account, what is happening?"**
Check the state. If `cooling_off`, tell them the window and that they can cancel.
If `blocked`, read them their own blocker sentences — they are safe to repeat
verbatim. If `legal_hold`, use the hold sentence and nothing more.

**"Why is it blocked?"**
The blocker sentence is the whole answer. Do not elaborate, do not speculate,
and do not check the trust or dispute tables to give a fuller explanation. The
codes are deliberately opaque because a blocked-deletion screen is an oblique
channel.

**"Will my reviews be deleted?"**
No. They remain under a neutral reviewer label. This is on the deletion screen
before the request is made.

**"Will you delete my payment history?"**
No, and say why: Warsha must keep financial records, and deleting them would
break the other party's record too.

**"I changed my mind."**
They cancel it themselves from the deletion screen. Do not do it for them —
there is no staff RPC that cancels somebody's request, deliberately.

## 6. What execution does

`private.privacy_anonymize_account(user_id, request_id)`:

1. Refuses if a hold is active (raises `42501`).
2. Profile: name → neutral label, photo and phone cleared, `deleted_at` set.
3. Worker profile: name → label; biography, cover, specialties, skills, location
   cleared; unpublished; unavailable; `deleted_at` set.
4. Portfolio: soft-deleted. Addresses: soft-deleted **and emptied** — street,
   building, floor, flat, landmark, access notes, the local id and the
   coordinates all go; the governorate and district, which the marketplace
   already showed, stay, and the label becomes the neutral one.
4b. The exact location of past requests (`marketplace_request_locations`):
   **deleted**, like the matching anchor. The request keeps its coarse area.
5. Searches, views, favourites, display preferences: **deleted**.
6. Device tokens: revoked, labels cleared, hashes retained.
7. Notifications: **preserved** — payloads already hold only resource UUIDs.
8. Sign-in: revoked. `private.privacy_revoke_sign_in` deletes the sessions,
   refresh tokens and sign-in identities, then bans the account at the auth
   layer and clears its email, phone and password. The account row itself stays,
   because every immutable record points at it. A second factor, if the account
   has one, is **not** removed here: `staff-authority-boundary` holds that no
   Warsha function may name that table, and a banned account with no credential
   cannot use it. Staff off-boarding removes factors.
9. Every step logged with a row count to `private.privacy_anonymization_log`.

**It must run without an end-user session.** The WPS-010 guard on `is_published`
refuses an unpublish from a signed-in non-staff session, which is correct: this
is a system operation.

## 7. What execution will not do

Never touches: bookings · messages · reviews · disputes · trust history ·
`financial_ledger_entries` · `provider_earnings_ledger` ·
`financial_booking_payments` · payouts · refunds · `referral_attributions` ·
consent history.

pgTAP asserts every one of those absences against the function's own body.

## 8. If execution fails

Set `failed` with a `failure_reason`. Do not retry blindly — the anonymization
steps are individually idempotent (each uses `coalesce(deleted_at, now())` or a
delete), but a partial run means something raised, and the reason matters more
than the retry.

Check first: is a hold active that was not active at approval?

## 9. Sign-in

Revoked with the rest, since `202609170009`. The log records `auth_sessions`,
`auth_identities`, `auth_factors` and `auth_sign_in_disabled` with their row
counts, in place of the `auth_disabled: 0` that used to stand for the gap.

What is *not* done, and deliberately: the `auth.users` row is not deleted. It is
what `legal_acceptances`, consent history, trust records, bookings and the
ledger point at, and removing it would take that evidence with it. Hard deletion
remains unsupported (ACC-03).
