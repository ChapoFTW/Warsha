# Runbook — account deletion

**Owner:** Security administrator
**Capability:** `review_privacy_requests` (state only)
**Status:** Request and cancellation work. Execution is **not scheduled**.

---

## 1. The honest limitation

`private.privacy_anonymize_account` is built, tested, and **unwired**. Nothing
advances a request from `cooling_off` to `approved` to `processing`. A scheduler
is required and does not exist.

Until it does, a request that completes its cooling-off window sits in
`cooling_off`. It is not lost, and it is not silently ignored — but no personal
data has been removed. Do not tell anyone their account has been deleted.

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

## 6. What execution will do, when it is wired

`private.privacy_anonymize_account(user_id, request_id)`:

1. Refuses if a hold is active (raises `42501`).
2. Profile: name → neutral label, photo and phone cleared, `deleted_at` set.
3. Worker profile: name → label; biography, cover, specialties, skills, location
   cleared; unpublished; unavailable; `deleted_at` set.
4. Portfolio and addresses: soft-deleted.
5. Searches, views, favourites, display preferences: **deleted**.
6. Device tokens: revoked, labels cleared, hashes retained.
7. Notifications: **preserved** — payloads already hold only resource UUIDs.
8. Every step logged with a row count to `private.privacy_anonymization_log`.

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

## 9. Sign-in is not disabled

Disabling authentication is an `auth` schema operation WPS-022 does not own. The
anonymization log records `auth_disabled: 0` so the log and this runbook agree
about what remains outstanding. Until it is wired, an anonymized account can
still sign in — to a profile with no name, no photo, and no history.

That is a real gap, and it is listed in the acceptance evidence rather than
hidden here.
