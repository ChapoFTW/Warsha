# WPS-022 manual alpha suite

72 cases. Every one requires a real device, a real screen reader, or a second
account — which is exactly why none of them is covered by the 2,547 automated
assertions.

A passing assertion proves the server behaves. It does not prove that somebody
reading a deletion screen in a stairwell understood that their payment history
would remain.

## Preconditions

- Two customer accounts, one worker account, one security administrator.
- One account with an active booking (for the blocked path).
- Flags `privacy_center`, `data_export`, `account_deletion` enabled in `local`,
  and the matching configuration booleans set true.
- Both languages, both themes, and a screen reader available.

---

## A. Surface gating (1–8)

| # | Case | Expected |
| --- | --- | --- |
| 1 | Profile entry with all flags off | No privacy row in the settings list |
| 2 | Direct `/privacy` with flags off | Unavailable state, no error |
| 3 | Direct `/privacy-delete` with flags off | Unavailable state, no error |
| 4 | Privacy centre on, export off | Export section says unavailable; the rest works |
| 5 | Privacy centre on, deletion off | No deletion request control; the rest works |
| 6 | `privacy_requests` kill switch active | New requests refused; existing state still readable |
| 7 | Flag row absent for the environment | Surface closed, not open |
| 8 | Configuration true but flag false | Surface closed |

## B. Reading what is stored (9–14)

| # | Case | Expected |
| --- | --- | --- |
| 9 | Category list renders | Every personal class listed with an export marker |
| 10 | Export markers are correct | Identity, trust, support, credentials marked not-included |
| 11 | Screen reader on a category | Announces name and whether it is in the export |
| 12 | Arabic category list | Reads naturally; no English leaks |
| 13 | Text scaled to 200% | No clipping, no overlap |
| 14 | Category list in dark theme | Legible; no colour-only meaning |

## C. Consent (15–26)

| # | Case | Expected |
| --- | --- | --- |
| 15 | Required purposes render as statements | Check mark and "Needed to use Warsha", no switch |
| 16 | Optional purposes render as switches | Switch plus the word On or Off |
| 17 | Turning marketing on | Saves; announces "Saved." |
| 18 | Turning marketing off | Saves; the earlier grant is not erased |
| 19 | Screen reader on a switch | Announces title, explanation, and checked state |
| 20 | Screen reader on a required purpose | Announces it as required, not as a control |
| 21 | Arabic consent copy | Reads as Egyptian Arabic, not translated English |
| 22 | RTL layout of switches | Switch and label on the correct sides |
| 23 | Diagnostics defaults off | Off on a fresh account |
| 24 | Location defaults off | Off on a fresh account |
| 25 | Consent survives sign-out and back in | Decisions persist |
| 26 | Account switch | Second account sees its own decisions, never the first's |

## D. History clearing (27–32)

| # | Case | Expected |
| --- | --- | --- |
| 27 | Clear searches only | Searches gone; recently viewed untouched |
| 28 | Clear views only | Views gone; searches untouched |
| 29 | Clear both | Both gone |
| 30 | Confirmation announced | "Cleared." announced politely |
| 31 | Clearing with nothing stored | No error; honest empty state |
| 32 | Search screen after clearing | Genuinely empty, not cached |

## E. Export (33–41)

| # | Case | Expected |
| --- | --- | --- |
| 33 | Request a copy | Appears as "Being prepared", never "Ready" |
| 34 | The waiting note is shown | Explains it takes a while |
| 35 | Second request while one is open | Refused with "One copy is already being prepared." |
| 36 | Manifest row counts render | Plausible totals |
| 37 | Exclusion list is visible | Five exclusions readable on screen |
| 38 | Expiry countdown | Hours remaining shown and decreasing |
| 39 | Screen reader on an export row | Announces state, size and expiry as one summary |
| 40 | Arabic export section | Reads naturally |
| 41 | Account switch | Second account sees no export of the first |

## F. Deactivation (42–47)

| # | Case | Expected |
| --- | --- | --- |
| 42 | Deactivate | Confirmation shown; nothing disappears |
| 43 | Worker listing after deactivation | Not discoverable in search |
| 44 | Bookings after deactivation | Still present and intact |
| 45 | Reactivate | Listing returns; nothing was lost |
| 46 | Copy distinguishes it from deletion | "This is not deletion" is visible |
| 47 | Deactivation appears above deletion | Order is correct on screen |

## G. Deletion — the honest path (48–58)

| # | Case | Expected |
| --- | --- | --- |
| 48 | Deletion is findable | Reachable from profile in two presses |
| 49 | What-goes list before requesting | Four items, shown before any request |
| 50 | What-stays list before requesting | Four items, shown before any request |
| 51 | "Not instant" is visible | Stated before requesting |
| 52 | "Not total" is visible | Stated before requesting |
| 53 | Confirmation is two presses | No phrase to type |
| 54 | Screen reader can complete the confirmation | Fully reachable |
| 55 | Cooling-off hours shown | Time remaining visible and decreasing |
| 56 | Cancel while cooling off | Cancelled; confirmation announced |
| 57 | Request again after cancelling | Allowed |
| 58 | Retry the same request | No second request appears |

## H. Deletion — blocked (59–66)

| # | Case | Expected |
| --- | --- | --- |
| 59 | Request with an active booking | Blocked state, booking sentence shown |
| 60 | The blocker names nobody | No other party, reporter or staff mentioned |
| 61 | Blocked request is still cancellable | Cancel control present and working |
| 62 | Resolve the booking, request again | Proceeds to cooling off |
| 63 | Legal hold state | Hold sentence shown, no reason given |
| 64 | Hold does not list actionable steps | No "finish the following" framing |
| 65 | Screen reader on the blocked state | Reads the reason as a sentence |
| 66 | Arabic blocked copy | Reads naturally; no English leaks |

## I. Staff (67–72)

| # | Case | Expected |
| --- | --- | --- |
| 67 | Non-staff opens `/admin/privacy` | Refused |
| 68 | Staff without the capability | Refused per section |
| 69 | Queue shows truncated references | Never a full account id |
| 70 | Queue shows no reason and no blockers | Only a count |
| 71 | Retention preview reports execution disabled | Every rule |
| 72 | Preview deletes nothing | Row counts unchanged afterwards |

---

## What these cases are for

The automated suites already prove the server enforces its rules. These cases
exist to answer questions no assertion can:

- Does somebody reading the deletion screen understand that their payment
  history stays?
- Does the blocked-deletion sentence read as helpful, or as stonewalling?
- Does the Arabic sound like a person wrote it?
- Can somebody using a screen reader actually complete a deletion?
- Does "being prepared" read as progress, or as broken?

Until they are executed, WPS-022's user-facing behaviour is unverified.
