# WPS-021 manual alpha suite

62 cases. Every one begins as **NOT RUN** in
`docs/testing/WPS-021-MANUAL-RESULTS.md`. Automated evidence does not satisfy any
case here — a passing pgTAP assertion proves the server behaves, not that a
person understood the screen.

Run each case in **both** languages and **both** appearances unless stated.

---

## A. Fail-closed posture (1–8)

| # | Case | Expected |
| --- | --- | --- |
| 1 | Open Profile with both growth flags off | No "Invite to Warsha" entry does anything misleading; the screen explains invites are not available yet |
| 2 | Open `/referrals` directly with flags off | Unavailable state, no code shown, no error |
| 3 | Open a booking with promotions off | No offer banner anywhere |
| 4 | Enable `growth_referrals` only | Referral screen works; still no promotion banner on any booking |
| 5 | Enable `growth_promotions`, leave the campaign in draft | Still no banner |
| 6 | Activate the campaign, then set the kill switch | Banner disappears within one reload |
| 7 | Clear the kill switch | Banner returns |
| 8 | Delete the flag row entirely | Behaves as off, not as on |

## B. Referral code (9–18)

| # | Case | Expected |
| --- | --- | --- |
| 9 | First open of the referral screen | A ten-character code appears |
| 10 | Close and reopen | The same code, not a new one |
| 11 | Read the code aloud to another person and have them type it | No character is ambiguous; no `0 O 1 I L` appears |
| 12 | Long-press the code | Text is selectable |
| 13 | Tap Share | The OS share sheet opens with the code in the message |
| 14 | Turn on the screen reader and focus the code | Announced character by character, not as a word |
| 15 | Same, in Arabic | Announced correctly, layout mirrored |
| 16 | Sign out, sign in as a different account | A different code; no frame of the previous account's code |
| 17 | Worker account opens the referral screen | A code is issued for the worker too |
| 18 | Staff revokes a code, owner reopens the screen | Status reflects revocation; history is not deleted |

## C. Claiming (19–28)

| # | Case | Expected |
| --- | --- | --- |
| 19 | Enter your own code | "You cannot use your own invite code" |
| 20 | Enter a random ten-character string | "That invite code is not valid" |
| 21 | Enter fewer than ten characters and submit | Rejected without a server round trip |
| 22 | Enter a valid code from another account | "Invite code applied" |
| 23 | Enter a second valid code afterwards | "An invite code was already applied" |
| 24 | Enter a revoked code | Same message as an unknown code — no way to tell them apart |
| 25 | Type in lower case | Accepted; input upper-cases as you type |
| 26 | Submit eleven times in an hour | The eleventh is rate limited with a clear message |
| 27 | Screen reader: submit and listen | The result is announced without moving focus |
| 28 | Arabic: all of the above | Messages read naturally in Egyptian Arabic |

## D. Qualification (29–36)

| # | Case | Expected |
| --- | --- | --- |
| 29 | Claim a code, then check the referrer's screen | One invite "Waiting on first job" |
| 30 | Referred account books but does not complete | Still waiting; no reward |
| 31 | Referred account cancels the booking | Still waiting; no reward |
| 32 | Referred account completes a booking | Referrer sees "Confirmed" and one earned reward |
| 33 | Referrer's reward status wording | Reads as *earned*, never as a balance or an amount of money |
| 34 | Re-open the completed booking, force the status again | No second reward appears |
| 35 | Referrer opens the screen after 90 days with no completion | The invite shows as expired |
| 36 | Read the "how it works" text | It says plainly that signing up alone earns nothing |

## E. Promotion presentation (37–48)

| # | Case | Expected |
| --- | --- | --- |
| 37 | Eligible customer opens a booking | Offer banner appears above the price adjustment card |
| 38 | Banner wording | States the amount saved and that Warsha pays for it |
| 39 | Ineligible customer opens a booking | No banner, and no hint that one exists |
| 40 | Apply the offer | Price summary discount line updates; total drops |
| 41 | Confirm the worker's side | Worker earnings and payout are unchanged |
| 42 | Try to apply twice | The second attempt is refused |
| 43 | Two devices, same account, apply simultaneously | Exactly one succeeds |
| 44 | Cancel the booking after applying | Budget is released; no orphaned discount remains |
| 45 | Campaign budget runs out mid-session | Banner disappears on reload; applying fails cleanly |
| 46 | Screen reader on the banner | The offer is announced; the apply control reports disabled while busy |
| 47 | Apply, then look at the applied state | Confirmed by an icon **and** a word, not by colour |
| 48 | Arabic and RTL | Banner mirrors correctly; the Arabic title is used |

## F. Absences that must stay absent (49–54)

| # | Case | Expected |
| --- | --- | --- |
| 49 | Search the whole app for a promo-code entry field | **None exists** |
| 50 | Search the whole app for a campaign list a customer can open | **None exists** |
| 51 | Search the whole app for a wallet, balance, or credits display | **None exists** |
| 52 | Look for a countdown, streak, flash sale, or mystery reward | **None exists** |
| 53 | Try to redeem using a referral code as a promotion | Refused |
| 54 | Confirm the motto on every growth surface | `YOUR WORK, OUR MISSION` / `شغلك مهمتنا`, unchanged |

## G. Staff administration (55–62)

| # | Case | Expected |
| --- | --- | --- |
| 55 | Non-staff opens `/admin/campaigns` | Refused by the WPS-017 gate |
| 56 | Staff without the capability opens it | Refused |
| 57 | Author creates a draft | Appears with status Draft |
| 58 | The **author** tries to activate it | Refused: "cannot be activated by its creator" |
| 59 | A second staff member tries to activate without approval | Refused: needs a second approver |
| 60 | A third approves, the second activates | Succeeds |
| 61 | Try to edit an activated campaign | Refused; the screen explains a new version is required |
| 62 | Check the audit log after each action | Every action recorded with actor, capability, and reason |
