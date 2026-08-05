# WPS-021 manual alpha suite

68 cases. Every one begins as **NOT RUN** in
`docs/testing/WPS-021-MANUAL-RESULTS.md`. Automated evidence does not satisfy any
case here — a passing pgTAP assertion proves the server behaves, not that a
person understood the screen.

Run each case in **both** languages and **both** appearances unless stated.

---

## A. Fail-closed posture (1–8)

| # | Case | Expected |
| --- | --- | --- |
| 1 | Open Profile with both growth flags off | The invite entry explains invites are not available yet |
| 2 | Open `/referrals` directly with flags off | Unavailable state, no code, no error |
| 3 | Open a booking with both flags off | No benefit banner anywhere |
| 4 | Enable `growth_referrals` only | Referral screen works; still no campaign banner |
| 5 | Enable `growth_promotions`, leave the campaign in draft | Still no banner |
| 6 | Activate a campaign, then set the promotions kill switch | Banner disappears on reload |
| 7 | Set the **referrals** kill switch with a campaign live | The campaign banner still shows — the switches are independent |
| 8 | Delete a flag row entirely | Behaves as off, not as on |

## B. Referral code (9–18)

| # | Case | Expected |
| --- | --- | --- |
| 9 | First open of the referral screen | A ten-character code appears |
| 10 | Close and reopen | The same code, not a new one |
| 11 | Read the code aloud and have someone type it | No character is ambiguous; no `0 O 1 I L` |
| 12 | Long-press the code | Text is selectable |
| 13 | Tap Share | The OS share sheet opens with the code |
| 14 | Screen reader on the code | Announced character by character, not as a word |
| 15 | Same, in Arabic | Announced correctly, layout mirrored |
| 16 | Sign out, sign in as a different account | A different code; no frame of the previous account's |
| 17 | Worker account opens the screen | A code is issued for the worker too |
| 18 | Staff revokes a code, owner reopens | Status reflects revocation; history is not deleted |

## C. Claiming (19–28)

| # | Case | Expected |
| --- | --- | --- |
| 19 | Enter your own code | "You cannot use your own invite code" |
| 20 | Enter a random ten-character string | "That invite code is not valid" |
| 21 | Enter fewer than ten characters | Rejected without a server round trip |
| 22 | Enter a valid code from another account | "Invite code applied" |
| 23 | Enter a second valid code afterwards | "An invite code was already applied" |
| 24 | Enter a revoked code | Same message as an unknown code — indistinguishable |
| 25 | Type in lower case | Accepted; input upper-cases as you type |
| 26 | Submit eleven times in an hour | The eleventh is rate limited with a clear message |
| 27 | Screen reader: submit and listen | The result is announced without moving focus |
| 28 | Arabic: all of the above | Messages read naturally in Egyptian Arabic |

## D. Automatic qualification and issuance (29–40)

| # | Case | Expected |
| --- | --- | --- |
| 29 | Claim a code, check the referrer's screen | One invite "Waiting on first job", **no reward** |
| 30 | Referred account books but does not complete | Still waiting; no reward |
| 31 | Referred account cancels the booking | Still waiting; no reward |
| 32 | Complete the booking with **no active programme** | Invite shows Confirmed; **no reward** |
| 33 | Activate a programme, then complete another referral's booking | A reward appears **immediately**, with no staff action |
| 34 | Read the reward wording carefully | Says *ready to use*. Never says pending approval, waiting for a campaign, or eligible for a future offer |
| 35 | Check the reward's stated worth and expiry | Both shown; expiry counts down in days |
| 36 | Check the staff audit log after the reward appeared | **No entry** for approving that reward. Only the programme approval is recorded |
| 37 | Force the completed status again | No second reward |
| 38 | Referrer opens the screen after the attribution window with no completion | The invite shows as expired |
| 39 | Read "how it works" | States plainly that signing up earns nothing and that rewards are automatic |
| 40 | Exhaust the programme's per-referrer limit | Further qualifications grant nothing; earlier rewards unaffected |

## E. Automatic redemption (41–52)

| # | Case | Expected |
| --- | --- | --- |
| 41 | Open a new eligible booking as the referrer | The reward banner appears automatically |
| 42 | Banner wording | Labelled as **your referral reward**, states the saving and that Warsha pays |
| 43 | Open a booking below the programme's minimum | No banner |
| 44 | Apply the reward | Price summary discount updates; total drops |
| 45 | Confirm the worker's side | Worker earnings and payout unchanged |
| 46 | Try to apply twice | Refused |
| 47 | Open a second booking after using the reward | No banner — it was consumed |
| 48 | Cancel the booking that used it | Reward returns to *ready to use*; budget released |
| 49 | Let a reward reach its expiry date | Shows as expired; no banner offered |
| 50 | Two devices, same account, apply simultaneously | Exactly one succeeds |
| 51 | Screen reader on the banner | Announced; apply control reports disabled while busy |
| 52 | Arabic and RTL | Banner mirrors; Arabic title used |

## F. Admin promotion independence (53–60)

| # | Case | Expected |
| --- | --- | --- |
| 53 | An account that has **never referred anybody** meets a campaign's criteria | Campaign banner appears |
| 54 | Same account, check its referral screen | No rewards — the two are unrelated |
| 55 | An account holding a referral reward also matches a campaign | Exactly one benefit is offered, not both |
| 56 | Apply it, then look at the booking | One discount line only |
| 57 | Account below the campaign's completed-booking criterion | No banner |
| 58 | Account below the campaign's account-age criterion | No banner |
| 59 | Pause the campaign; reload a qualifying booking | No banner; referral rewards still work |
| 60 | Campaign budget runs out mid-session | Banner disappears on reload; applying fails cleanly |

## G. Absences that must stay absent (61–64)

| # | Case | Expected |
| --- | --- | --- |
| 61 | Search the whole app for a promo-code entry field | **None exists** |
| 62 | Search the whole app for a campaign list a customer can open | **None exists** |
| 63 | Search the whole app for a wallet, balance, or credits display | **None exists** |
| 64 | Confirm the motto on every growth surface | `YOUR WORK, OUR MISSION` / `شغلك مهمتنا`, unchanged |

## H. Staff administration (65–68)

| # | Case | Expected |
| --- | --- | --- |
| 65 | Non-staff, then staff without capability, open `/admin/campaigns` | Both refused |
| 66 | The **author** tries to activate their own programme, then their own campaign | Both refused |
| 67 | A second staff member activates without approval, then with a third's approval | Refused, then succeeds |
| 68 | Try to edit an activated programme and an activated campaign | Both refused; screen explains a new version is required |
