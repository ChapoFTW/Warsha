# Warsha Master Manual Test Plan

Authority: Warsha Constitution → WPS-018.
Compiled: 2026-08-04. Supersedes nothing; it consolidates.

## Purpose

Ten separate manual suites accumulated across WPS-007 through WPS-018, none of
them executed. This plan deduplicates them into one ordered programme grouped by
who is testing and on what, and splits it into a **minimum mandatory subset
before private beta** and a larger subset before production.

**Manual alpha is not complete. Not one case has been executed anywhere.**

## Source inventory

| Suite | Cases | State |
| --- | --- | --- |
| `WARSHA-MANUAL-ALPHA.md` (foundation, WPS-001–006) | ~108 items | **NOT RUN** |
| `WPS-007-manual-smoke-test.md` | ~22 | **NOT RUN** |
| `WPS-009-MANUAL-ALPHA.md` | 55 | **NOT RUN** |
| `WPS-010-MANUAL-ALPHA.md` | 60 | **NOT RUN** |
| `WPS-011-MANUAL-ALPHA.md` | 60 | **NOT RUN** |
| `WPS-012-MANUAL-ALPHA.md` | 70 | **NOT RUN** |
| `WPS-013-MANUAL-ALPHA.md` | 60 | **NOT RUN** |
| `WPS-014-MANUAL-ALPHA.md` | 60 | **NOT RUN** |
| `WPS-015-MANUAL-ALPHA.md` | 60 | **NOT RUN** |
| `WPS-016-MANUAL-ALPHA.md` | 48 | **NOT RUN** |
| `WPS-017-MANUAL-ALPHA.md` | 66 | **NOT RUN** |
| `WPS-018-MANUAL-ALPHA.md` | 44 | **NOT RUN** |
| **Total before deduplication** | **~713** | **0 executed** |

After deduplication — the same booking is created in a dozen suites, the same
sign-in in eight — the consolidated programme below is **486 distinct cases**.

## Groups

| Group | Cases | Beta subset | Production subset |
| --- | --- | --- | --- |
| A. Customer journey | 84 | 34 | 84 |
| B. Worker journey | 78 | 32 | 78 |
| C. Staff operations | 71 | 22 | 71 |
| D. Financial | 62 | 18 | 62 |
| E. Trust and safety | 48 | 14 | 48 |
| F. Accessibility | 34 | 12 | 34 |
| G. Arabic and RTL | 38 | 20 | 38 |
| H. iOS | 22 | 18 | 22 |
| I. Android | 22 | 18 | 22 |
| J. Web | 18 | 6 | 18 |
| K. Offline and reconnect | 14 | 8 | 14 |
| L. Performance | 12 | 4 | 12 |
| M. Security | 26 | 12 | 26 |
| N. Deployment | 19 | 16 | 19 |
| **Total** | **486** | **234** | **486** |

## A. Customer journey (84)

Sign-up, sign-in, recovery, session persistence · address management · category
and worker discovery · direct booking · marketplace request creation, editing,
expiry, cancellation · quote comparison and selection · confirmation and
rescheduling · booking detail and timeline · progress updates and delays ·
additional-work approval and rejection · completion confirmation · warranty and
return visits · review submission, editing window, and photos · chat, quick
replies, and attachments · notification inbox, grouping, and preferences ·
dispute opening and evidence · support case opening and replies.

Sources: WARSHA alpha, WPS-002, 004, 008, 009, 011, 012, 013, 014, 017.

## B. Worker journey (78)

Phone OTP sign-in on a real network · onboarding and profile · identity
verification submission, correction, and expiry · certificate submission ·
portfolio management · availability toggle · marketplace invitations and waves ·
quote submission and revision · confirmation deadline · job execution states ·
arrival, delay, and running-late · progress media · additional-work requests ·
completion · earnings, holds, and cash commission debt · withdrawal request ·
review replies · dispute participation · trust restrictions and appeals.

Sources: WARSHA alpha, WPS-003, 006, 008, 010, 012, 013, 015, 016.

## C. Staff operations (71)

Operations home and queue visibility per role · case claim, assignment, and
races · private notes · verification and certificate review · dispute workflow ·
abuse report triage and enforcement · appeals · review moderation · financial
exception review · reconciliation · safe search restrictions · safe account
views and redaction · configuration change control and dual control · feature
flags · kill switches · support cases · incidents · audit explorer · analytics
suppression and timezone · exports.

Sources: WPS-016, 017, 018.

## D. Financial (62)

Price snapshots and revisions · explicit approval · cash settlement · commission
calculation at 10% · cash commission debt accrual and threshold · earnings
pending, available, and held · six-hour release behaviour with the scheduler
disabled · refunds · post-release cases · withdrawal minimum at 200 EGP ·
withdrawal review · ledger balance after every operation · receipts · no hidden
deduction anywhere.

Sources: WPS-007 smoke, WPS-015, WPS-017.

## E. Trust and safety (48)

Report intake from all eight surfaces · seventeen categories · reporter
confidentiality · trust levels and restrictions · enforcement with evidence · no
automatic ban · appeals and restoration · fraud signals remaining advisory ·
communication and marketplace restrictions.

Source: WPS-016.

## F. Accessibility (34)

Screen reader on every primary flow · keyboard navigation on web · visible
focus · status distinguishable without colour · minimum touch targets · dynamic
text · error summaries announced · reduced motion · accessible tables in
analytics · RTL focus order.

## G. Arabic and RTL (38)

Every primary flow in Egyptian Arabic · layout mirroring · date and currency
formatting in Cairo and EGP · mixed-direction content · Arabic numerals in
money · no untranslated customer-facing string · natural phrasing reviewed by a
native speaker · staff workflow labels.

## H. iOS (22) and I. Android (22)

The same core set on real devices: install, sign-in, permissions, camera and
photo attachment, push disabled, deep link, background and foreground, network
loss, notification banner, splash and icon, Arabic layout, small-screen layout,
completion of one booking end to end.

**Zero device runs have been recorded across every WPS to date.**

## J. Web (18)

Sign-in, session persistence, primary flows, admin surface guard, responsive
layout, keyboard navigation, deep link handling, and confirmation that the admin
surface is absent from a customer deployment.

## K. Offline and reconnect (14)

Realtime disconnect and reconnect · invalidation after reconnect · optimistic
action while offline · queued action on restore · chat reconnect · notification
catch-up · stale data indication.

## L. Performance (12)

Perceived readiness on a mid-range Android on a 3G-class connection for: home,
discovery, request creation, quote list, booking detail, chat, notification
inbox, staff queue.

## M. Security (26)

Cross-account access attempts on every domain · staff capability denial per role ·
stale session refusal · MFA enforcement · session revocation · rate limits from a
real client · export authorization · private note isolation · storage path
access · no credential in any bundle.

## N. Deployment (19)

Clean reset · migration list and dry run · staging apply · release verification ·
restore drill · kill switch activation and clearing with domain confirmation ·
rollback rehearsal · store internal track install · web deploy and previous-build
rollback.

## Minimum mandatory subset before private beta — 234 cases

Everything that, if broken, would harm a real participant or lose money.

| Group | Beta cases | Rationale |
| --- | --- | --- |
| A | 34 | One complete customer path plus cancellation and dispute |
| B | 32 | One complete worker path including real-device OTP |
| C | 22 | Only the queues staffed during the beta |
| D | 18 | Cash only; every commission and debt case |
| E | 14 | Report, restrict, appeal |
| F | 12 | Screen reader on the primary paths |
| G | 20 | Every screen a beta participant will actually see |
| H | 18 | Full core set on a real iPhone |
| I | 18 | Full core set on a real Android |
| J | 6 | Staff use only; customers are on mobile |
| K | 8 | Egyptian networks are not reliable |
| L | 4 | The four slowest screens |
| M | 12 | Cross-account and staff capability denial |
| N | 16 | Including the restore drill and rollback rehearsal |

Deferred to production: everything exercising a disabled capability — online
payments, payouts, push, call relay, Emergency, Rescue Mode — plus the full
accessibility and web sets.

## Before production — all 486

Plus re-running the beta subset against production configuration, because a
capability that was disabled during the beta has never been exercised by a real
person.

## Execution rules

1. **On a real device on a real network.** A simulator on office wifi is not a
   test of an Egyptian worker's experience.
2. **In both languages** for any case with visible copy.
3. **Record the result immediately** — pass, fail, or blocked, with a note.
4. **Every friction point is a defect.** A confusing screen fails even when the
   function works. That is Manual Alpha discipline and it carries into the beta.
5. **A blocked case is not a pass.** It is a blocker with an owner.
6. **No case is marked from automated evidence.** The automated suites prove the
   server refuses the wrong caller; they prove nothing about whether a person
   can understand the screen.

## Status

| | |
| --- | --- |
| Consolidated cases | 486 |
| Executed | **0** |
| Passed | 0 |
| Failed | 0 |
| Blocked | 0 |
| Beta subset executed | **0 of 234** |
| Device runs | **0** |

This is gap G19 and it is the largest single blocker to a private beta.
