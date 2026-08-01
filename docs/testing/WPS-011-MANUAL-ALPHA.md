# WPS-011 Manual Alpha Runbook

## Status and safety

**Overall status: NOT RUN**

Run only with local or explicitly approved non-production customer, worker, and authorized-staff personas. Do not apply hosted migrations, send live SMS/push, move money, trigger webhooks, activate schedulers, or perform irreversible operations. Record device, OS, build, data mode, locale, evidence, and result for every case.

Allowed results are `PASS`, `FAIL`, `BLOCKED`, and `NOT RUN`. Every case below starts as **NOT RUN**.

## A. Eligibility, uniqueness, and editing

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS011-M01 | Open review on an incomplete booking. | Submission is unavailable and server rejection is clear. | NOT RUN |
| WPS011-M02 | Complete a booking as its customer and submit six valid scores. | One verified review is linked to that booking. | NOT RUN |
| WPS011-M03 | Attempt a second review for the same booking. | Duplicate creation is denied; the original remains. | NOT RUN |
| WPS011-M04 | Attempt review creation as the provider or unrelated account. | Access is denied without leaking booking data. | NOT RUN |
| WPS011-M05 | Omit each dimension in turn and try scores below 1 or above 5. | Invalid submissions are rejected. | NOT RUN |
| WPS011-M06 | Edit scores, comment, anonymity, and photos inside the deadline. | The same review updates and revision increases. | NOT RUN |
| WPS011-M07 | Refresh after an in-window edit. | Updated review, deadline, and booking link persist. | NOT RUN |
| WPS011-M08 | Attempt an edit at or after the deadline. | Edit is denied and the review is unchanged. | NOT RUN |
| WPS011-M09 | Attempt customer review deletion after publication. | No delete path exists and the permanent link remains. | NOT RUN |
| WPS011-M10 | Change the local approved edit-window configuration within its bounds. | New reviews receive the configured deadline; existing deadlines do not silently move. | NOT RUN |

## B. Photos, reply, and visibility

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS011-M11 | Add supported JPEG, PNG, and WebP photos. | Private uploads render through expiring signed URLs. | NOT RUN |
| WPS011-M12 | Attempt a fifth photo. | The four-photo maximum is enforced. | NOT RUN |
| WPS011-M13 | Attempt unsupported MIME and a file over 5 MB. | Both fail without registering metadata. | NOT RUN |
| WPS011-M14 | Force upload/registration failure, then retry. | No fallback write, duplicate, or broken public image appears. | NOT RUN |
| WPS011-M15 | Replace/remove photos during an allowed edit. | Metadata changes atomically; superseded objects receive best-effort cleanup. | NOT RUN |
| WPS011-M16 | Copy a raw object path into another account/session. | The private object cannot be fetched directly. | NOT RUN |
| WPS011-M17 | Publish a provider reply. | One public reply appears on the linked review. | NOT RUN |
| WPS011-M18 | Retry the identical reply request. | Retry is idempotent and no duplicate row appears. | NOT RUN |
| WPS011-M19 | Attempt to edit/delete/replace a published reply. | The immutable reply remains unchanged. | NOT RUN |
| WPS011-M20 | Attempt reply as another provider or customer. | Access is denied. | NOT RUN |

## C. Helpful voting and sorting

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS011-M21 | Vote Helpful on a visible review. | Helpful total increases once. | NOT RUN |
| WPS011-M22 | Repeat the same vote. | No duplicate vote or count inflation occurs. | NOT RUN |
| WPS011-M23 | Change Helpful to Not Helpful. | The current vote updates and both totals remain correct. | NOT RUN |
| WPS011-M24 | Vote from a second eligible account. | Its independent vote is counted. | NOT RUN |
| WPS011-M25 | Attempt to vote as review author. | Vote is denied. | NOT RUN |
| WPS011-M26 | Attempt to vote as reviewed provider. | Vote is denied. | NOT RUN |
| WPS011-M27 | Sort Newest. | Stable descending publication order appears. | NOT RUN |
| WPS011-M28 | Sort Highest and Lowest rated. | Overall-score ordering and stable ties are correct. | NOT RUN |
| WPS011-M29 | Sort Most helpful. | Helpful evidence orders reviews without changing marketplace rank. | NOT RUN |
| WPS011-M30 | Refresh and switch accounts after voting. | Each account sees only its own vote state; aggregate totals remain public. | NOT RUN |

## D. Reports and moderation

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS011-M31 | Report a visible review as spam. | One private submitted report is created. | NOT RUN |
| WPS011-M32 | Report using abuse, fake review, and offensive content. | Every approved reason is accepted and localized. | NOT RUN |
| WPS011-M33 | Enter overlong report details. | Input is bounded without leaking or corrupting data. | NOT RUN |
| WPS011-M34 | Submit another active report for the same account/review. | Duplicate active reporting is prevented. | NOT RUN |
| WPS011-M35 | Inspect as reporter. | The reporter sees own status but no staff-only audit details. | NOT RUN |
| WPS011-M36 | Inspect report as unrelated account or public user. | Report, reporter identity, and details are denied. | NOT RUN |
| WPS011-M37 | Move a report submitted → in review → resolved as staff. | Guarded transitions succeed and immutable events accumulate. | NOT RUN |
| WPS011-M38 | Attempt a staff transition as a normal account. | It is denied. | NOT RUN |
| WPS011-M39 | Soft-hide a review with a staff reason. | Public review/reply/photos/votes/rating contribution disappear; records remain. | NOT RUN |
| WPS011-M40 | Restore the review. | Public sanitized content returns and both moderation events remain auditable. | NOT RUN |

## E. Reputation, badges, and privacy

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS011-M41 | Open a provider with no reviews/jobs. | Calm empty metrics appear; unavailable rates are not fabricated. | NOT RUN |
| WPS011-M42 | Compare six-score averages and rating distribution to fixtures. | Counts and rounded averages match visible reviews only. | NOT RUN |
| WPS011-M43 | Compare completed jobs and repeat-customer percentage to completed bookings. | Deterministic totals match product rules. | NOT RUN |
| WPS011-M44 | Compare response/completion rates to eligible 180-day events. | Explicit denominators and unavailable states are correct. | NOT RUN |
| WPS011-M45 | Compare years on platform around an anniversary boundary. | Only full elapsed years are shown. | NOT RUN |
| WPS011-M46 | Exercise identity, skill, professional, Top Rated, Fast Responder, and Experienced thresholds. | Badges appear only at approved thresholds. | NOT RUN |
| WPS011-M47 | Recalculate confidence fixtures. | `wps011-v1` score and evidence sufficiency match approved weights. | NOT RUN |
| WPS011-M48 | Change helpful votes/report counts. | Confidence and marketplace order do not change. | NOT RUN |
| WPS011-M49 | Inspect public network/domain payloads. | No reviewer contact/account ID, raw path, report, voter, staff, or moderation field exists. | NOT RUN |
| WPS011-M50 | Hide a review and inspect reputation. | Hidden content makes no public metric/badge/confidence contribution. | NOT RUN |

## F. Modes, language, accessibility, and lifecycle

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS011-M51 | Repeat create/edit/vote/report/moderation fixtures in Mock. | Behavior matches Supabase contracts with no Supabase request. | NOT RUN |
| WPS011-M52 | Force a Supabase transport/server error. | Error propagates; no Mock fallback read or write occurs. | NOT RUN |
| WPS011-M53 | Switch Customer A/B and Worker A/B in Mock. | Private edits, votes, reports, media, and ownership remain isolated. | NOT RUN |
| WPS011-M54 | Run all review/profile states in English. | Complete copy and motto `YOUR WORK, OUR MISSION` render exactly. | NOT RUN |
| WPS011-M55 | Run all states in Egyptian Arabic. | Natural copy and motto `شغلك مهمتنا` render exactly. | NOT RUN |
| WPS011-M56 | Repeat in RTL. | Score rows, sort chips, galleries, metrics, and report controls mirror correctly. | NOT RUN |
| WPS011-M57 | Use screen reader on scores, photos, reply, votes, sorts, reports, badges, and states. | Labels, roles, values, selected/disabled states, and reading order are correct. | NOT RUN |
| WPS011-M58 | Test 320 CSS px and small Android/iPhone viewports. | No page-level overflow or unreachable action occurs. | NOT RUN |
| WPS011-M59 | Test loading, empty, offline error, retry, refresh, and expired signed URL. | Stable states recover from authoritative data without stale private content. | NOT RUN |
| WPS011-M60 | Background/return, reconnect, logout, and account switch during pending work. | Reconciliation is safe and previous-account content never flashes or mutates. | NOT RUN |

## Sign-off

Tester, date, build identifier, environment, device matrix, evidence links, failures, linked issues, and acceptance decision: **NOT RUN / NOT RECORDED**.
