# WPS-019 Manual Alpha — Customer Support, Help Center & Knowledge Management

| Field | Value |
| --- | --- |
| Specification | WPS-019 v1.0 |
| Cases | 58 |
| Status | **every case is NOT RUN** |
| Results file | `docs/testing/WPS-019-MANUAL-RESULTS.md` |
| Prerequisite | A local Supabase with `202608040001` applied, one customer account, one worker account, one staff account holding `manage_support_cases` |

Run each case on a real device in both English and Egyptian Arabic unless the
case says otherwise. A case that cannot be run is **BLOCKED**, never assumed.

---

## A. Help Center discovery (S01–S09)

| # | Case | Expected |
| --- | --- | --- |
| S01 | Open Help Center from the profile tab | Twelve categories, ordered, each with a description and an article count |
| S02 | Switch language to Arabic on the Help Center | Every label, category, and article title is Egyptian Arabic; layout mirrors |
| S03 | Open a category | Its articles list, ordered, with summaries |
| S04 | Open an article | Title, summary, body in paragraphs, related articles |
| S05 | Open the same article in Arabic | A genuinely different body, not the English text |
| S06 | Follow a related-article link | The related article opens |
| S07 | Mark an article helpful | The thanks message replaces the buttons |
| S08 | Mark the same article helpful again after reopening | The state is remembered, not reset |
| S09 | Read an article with a screen reader | Paragraphs are announced separately; the chevron direction matches reading direction |

## B. Search (S10–S18)

| # | Case | Expected |
| --- | --- | --- |
| S10 | Search "payment" in English | Payment articles, labelled as exact matches |
| S11 | Search "الدفع" in Arabic | Arabic payment articles |
| S12 | Search a single character | An explicit "type at least two characters" state, no results scan |
| S13 | Search "paymnt" | The approximate-match heading and the payment article |
| S14 | Search "zzzzqqqq" | An explicit empty state offering the contact form |
| S15 | Search, leave, return | The query appears under recent searches |
| S16 | Tap a recent search | It re-runs |
| S17 | Confirm popular searches | Empty with a single test account — suppressed below five distinct accounts |
| S18 | Search rapidly more than 120 times in five minutes | The server refuses with a rate-limit message, not a client-side block |

## C. Context-aware help (S19–S24)

| # | Case | Expected |
| --- | --- | --- |
| S19 | Open help from a booking screen | Booking articles are first in Suggested |
| S20 | Open help from a payment screen | Payment articles are first |
| S21 | Open help from the verification screen | Verification articles are first |
| S22 | Open help from the earnings screen as a worker | Earnings and withdrawal articles are first |
| S23 | Contact support from the payment surface | The topic is pre-selected as "A payment" |
| S24 | Contact support from the general Help Center | The topic defaults to "Something else" |

## D. Opening a case (S25–S31)

| # | Case | Expected |
| --- | --- | --- |
| S25 | Open a case with a two-character subject | The send button stays disabled |
| S26 | Open a valid case | The case thread opens with the first message |
| S27 | Check the notification inbox | A support-category notification for the opened case |
| S28 | Open the notification | It routes to the case, not to a generic screen |
| S29 | Kill the app mid-submit and retry with the same form | One case, not two |
| S30 | Open a case in Arabic | The case is recorded in Arabic; the thread renders RTL |
| S31 | Open a case as a worker from the earnings surface | Staff see it as a worker case |

## E. The case thread (S32–S38)

| # | Case | Expected |
| --- | --- | --- |
| S32 | Reply to an open case | The reply appears in the thread |
| S33 | Have staff reply | The reply appears, and a notification arrives |
| S34 | Have staff add an internal note | The note is **not** visible to the customer, in any view |
| S35 | View a case list with several cases | Status badges are correct and localized |
| S36 | Open another account's case id directly | Not found — not an empty screen, not a permission hint |
| S37 | Reply to a closed case | Refused with the closed-case notice |
| S38 | Confirm the status badge after each staff transition | The badge tracks the server state |

## F. Reopening (S39–S43)

| # | Case | Expected |
| --- | --- | --- |
| S39 | Have staff resolve a case | The customer is notified, and the survey is offered |
| S40 | Reopen the resolved case | It reopens, and the reason appears in the thread |
| S41 | Reopen an open case | The reopen control is absent |
| S42 | Reopen a case resolved more than 14 days ago | The window-passed notice, no reopen control |
| S43 | Reopen a case three times, then try a fourth | The reopen-limit notice |

## G. Satisfaction (S44–S47)

| # | Case | Expected |
| --- | --- | --- |
| S44 | Submit a rating on a resolved case | The thanks message replaces the survey |
| S45 | Submit a rating twice | The first score is kept |
| S46 | Submit a rating on an open case | The survey is not offered |
| S47 | Submit a rating with a comment in Arabic | Stored and rendered correctly |

## H. Attachments (S48–S51)

**Note:** the attachment picker UI is not implemented (WES-019 §10). These cases
exercise the server and the repository, and are expected to be **BLOCKED** on the
customer surface until the picker ships.

| # | Case | Expected |
| --- | --- | --- |
| S48 | Register an attachment for a case you own | Accepted; it appears in the thread |
| S49 | Register an attachment for a case you do not own | Refused |
| S50 | Register a path that does not exist in storage | Refused |
| S51 | Register the same file twice | Refused as a duplicate |

## I. Staff (S52–S58)

| # | Case | Expected |
| --- | --- | --- |
| S52 | Open the support queue as a support agent | Counts and prioritized cases |
| S53 | Open the support queue as a verification reviewer | Refused |
| S54 | Open the support queue as a customer | Refused |
| S55 | Assign a case to yourself | Assigned; the customer is notified; the status moves to in progress |
| S56 | Resolve with a reason that requires a note, leaving it empty | Refused |
| S57 | Merge a duplicate case from the same requester | The duplicate closes and points at the survivor; both keep their history |
| S58 | Read the queue in Arabic | Macros and resolution reasons are Egyptian Arabic |

---

## Recording

Record every outcome in `docs/testing/WPS-019-MANUAL-RESULTS.md`. A case is
**NOT RUN** until a person has run it on a device and written what happened.
