# WPS-019 Manual Results — Customer Support, Help Center & Knowledge Management

| Field | Value |
| --- | --- |
| Specification | WPS-019 v1.0 |
| Runbook | `docs/testing/WPS-019-MANUAL-ALPHA.md` |
| Total cases | 58 |
| Executed | **0** |
| Status | **NOT RUN** |
| Devices | none |
| Tester | none |
| Date | not started |

---

## Summary

**No WPS-019 manual case has been executed.** Not one case has been run on a
device, in either language, by anyone. This file exists so that fact is
recorded rather than assumed.

Four cases (S48–S51) are expected to be **BLOCKED** on the customer surface when
the suite is eventually run: the attachment picker is not implemented, as
recorded in WES-019 §10. The server side of those cases is covered by the pgTAP
suite; the device flow is not.

## Case ledger

| Group | Cases | Outcome |
| --- | --- | --- |
| A. Help Center discovery | S01–S09 | NOT RUN |
| B. Search | S10–S18 | NOT RUN |
| C. Context-aware help | S19–S24 | NOT RUN |
| D. Opening a case | S25–S31 | NOT RUN |
| E. The case thread | S32–S38 | NOT RUN |
| F. Reopening | S39–S43 | NOT RUN |
| G. Satisfaction | S44–S47 | NOT RUN |
| H. Attachments | S48–S51 | NOT RUN (S48–S51 expected BLOCKED on device) |
| I. Staff | S52–S58 | NOT RUN |

| # | Case | Outcome | Device | Language | Notes |
| --- | --- | --- | --- | --- | --- |
| S01 | Help Center opens from profile | NOT RUN | — | — | — |
| S02 | Help Center in Egyptian Arabic | NOT RUN | — | — | — |
| S03 | Category listing | NOT RUN | — | — | — |
| S04 | Article renders | NOT RUN | — | — | — |
| S05 | Arabic article body differs | NOT RUN | — | — | — |
| S06 | Related-article navigation | NOT RUN | — | — | — |
| S07 | Article feedback | NOT RUN | — | — | — |
| S08 | Feedback persists | NOT RUN | — | — | — |
| S09 | Screen reader on an article | NOT RUN | — | — | — |
| S10 | English search | NOT RUN | — | — | — |
| S11 | Arabic search | NOT RUN | — | — | — |
| S12 | Query too short | NOT RUN | — | — | — |
| S13 | Misspelled query | NOT RUN | — | — | — |
| S14 | Empty state | NOT RUN | — | — | — |
| S15 | Recent searches | NOT RUN | — | — | — |
| S16 | Recent search re-runs | NOT RUN | — | — | — |
| S17 | Popular searches suppressed | NOT RUN | — | — | — |
| S18 | Search rate limit | NOT RUN | — | — | — |
| S19 | Booking context | NOT RUN | — | — | — |
| S20 | Payment context | NOT RUN | — | — | — |
| S21 | Verification context | NOT RUN | — | — | — |
| S22 | Earnings context | NOT RUN | — | — | — |
| S23 | Topic pre-selected | NOT RUN | — | — | — |
| S24 | Default topic | NOT RUN | — | — | — |
| S25 | Short subject rejected | NOT RUN | — | — | — |
| S26 | Case opens | NOT RUN | — | — | — |
| S27 | Opening notification | NOT RUN | — | — | — |
| S28 | Notification routes to the case | NOT RUN | — | — | — |
| S29 | Idempotent submit | NOT RUN | — | — | — |
| S30 | Arabic case | NOT RUN | — | — | — |
| S31 | Worker case recorded as worker | NOT RUN | — | — | — |
| S32 | Customer reply | NOT RUN | — | — | — |
| S33 | Staff reply notifies | NOT RUN | — | — | — |
| S34 | Internal note hidden | NOT RUN | — | — | — |
| S35 | Status badges | NOT RUN | — | — | — |
| S36 | Cross-account case not found | NOT RUN | — | — | — |
| S37 | Reply to a closed case | NOT RUN | — | — | — |
| S38 | Badge tracks server state | NOT RUN | — | — | — |
| S39 | Resolution notifies and offers the survey | NOT RUN | — | — | — |
| S40 | Reopen a resolved case | NOT RUN | — | — | — |
| S41 | Reopen control absent when open | NOT RUN | — | — | — |
| S42 | Reopen window expired | NOT RUN | — | — | — |
| S43 | Reopen ceiling | NOT RUN | — | — | — |
| S44 | Rating submitted | NOT RUN | — | — | — |
| S45 | Rating cannot be resubmitted | NOT RUN | — | — | — |
| S46 | No survey before resolution | NOT RUN | — | — | — |
| S47 | Arabic comment | NOT RUN | — | — | — |
| S48 | Register an owned attachment | NOT RUN | — | — | picker not implemented |
| S49 | Attachment on another account's case | NOT RUN | — | — | picker not implemented |
| S50 | Nonexistent storage path | NOT RUN | — | — | picker not implemented |
| S51 | Duplicate attachment | NOT RUN | — | — | picker not implemented |
| S52 | Support agent opens the queue | NOT RUN | — | — | — |
| S53 | Verification reviewer refused | NOT RUN | — | — | — |
| S54 | Customer refused | NOT RUN | — | — | — |
| S55 | Self-assignment | NOT RUN | — | — | — |
| S56 | Resolution note required | NOT RUN | — | — | — |
| S57 | Merge a duplicate | NOT RUN | — | — | — |
| S58 | Arabic staff surface | NOT RUN | — | — | — |

## What this file is not

It is not evidence that WPS-019 works on a device. Automated evidence lives in
`docs/testing/WPS-019-ACCEPTANCE-EVIDENCE.md`, and automated evidence is not
manual acceptance.
