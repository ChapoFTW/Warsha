# WPS-013 Manual Alpha Runbook

## Status and safety

**Overall status: NOT RUN**

Run only against local or explicitly approved non-production customer, assigned-worker, unrelated-user, and authorized-staff personas. Do not apply hosted migrations, move money, send live SMS/push, invoke telephony/webhooks, activate schedulers, or perform irreversible operations. Record build, data mode, device/browser, OS, locale, persona, timestamp, evidence, and result for every case.

Allowed results are `PASS`, `FAIL`, `BLOCKED`, and `NOT RUN`. Every case starts **NOT RUN**.

## A. Eligibility and opening

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS013-M01 | Open an eligible active-work booking as customer. | Exceptional-dispute explanation and Open action appear. | NOT RUN |
| WPS013-M02 | Open an eligible completed booking inside 14 days. | Customer may create one draft. | NOT RUN |
| WPS013-M03 | Open a completed booking after 14 days with no warranty. | Server rejects opening without leaking internal dates. | NOT RUN |
| WPS013-M04 | Open inside an active warranty and 72-hour grace. | Warranty window is honored server-side. | NOT RUN |
| WPS013-M05 | Open a worker-no-show booking inside/outside 48 hours. | Only the configured window succeeds. | NOT RUN |
| WPS013-M06 | Try rejected, ordinary cancelled, refunded, deleted/archived bookings. | Dispute opening is unavailable. | NOT RUN |
| WPS013-M07 | Try opening as worker or unrelated account. | No customer-open authority or booking data leaks. | NOT RUN |
| WPS013-M08 | Create Draft, then try a second active case. | One active dispute per booking is enforced. | NOT RUN |
| WPS013-M09 | Retry create with the same key. | One draft and one bootstrap event exist. | NOT RUN |
| WPS013-M10 | Exercise all ten reason choices and description bounds. | Approved reasons pass; short/over-4,000 text fails. | NOT RUN |

## B. Lifecycle and immutable timeline

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS013-M11 | Save a draft and inspect as customer/worker/staff. | Customer and staff see it; worker does not. | NOT RUN |
| WPS013-M12 | Submit a draft twice with one key. | One Submitted event/message/notification exists. | NOT RUN |
| WPS013-M13 | Worker sends a normal response. | State becomes Waiting Staff and response is immutable. | NOT RUN |
| WPS013-M14 | Worker accepts responsibility. | Response is recorded without automatic fault, money, or ranking action. | NOT RUN |
| WPS013-M15 | Worker contests. | Contest is recorded without deciding the case. | NOT RUN |
| WPS013-M16 | Staff assigns the case. | Assignment and timestamp are server-derived. | NOT RUN |
| WPS013-M17 | Staff requests customer evidence, then customer responds. | Waiting Customer → Waiting Staff follows the locked graph. | NOT RUN |
| WPS013-M18 | Staff requests worker evidence, then worker responds. | Waiting Worker → Waiting Staff follows the locked graph. | NOT RUN |
| WPS013-M19 | Start review, then attempt customer withdrawal. | Withdrawal is rejected at Under Review. | NOT RUN |
| WPS013-M20 | Attempt direct event insert/update/delete as participant and privileged SQL fixture. | Grants and immutable trigger reject mutation. | NOT RUN |

## C. Evidence and Storage

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS013-M21 | Inspect automatic booking evidence counts. | Timeline, attachments, chat/system, operations, progress, additional work, return, review/reply, no-show, and warranty are represented without copying. | NOT RUN |
| WPS013-M22 | Upload valid JPEG, PNG, WebP, HEIC, and PDF fixtures. | Each registers privately and opens by a signed URL. | NOT RUN |
| WPS013-M23 | Try zero-byte, over-8-MB, and unsupported MIME objects. | Client/server reject without evidence metadata. | NOT RUN |
| WPS013-M24 | Try unsafe path, traversal, slash/control filename, mismatched booking/dispute. | Server rejects every object. | NOT RUN |
| WPS013-M25 | Stage an object owned by another user. | Registration fails on server-authoritative ownership. | NOT RUN |
| WPS013-M26 | Upload identical content under another name. | Duplicate content is rejected. | NOT RUN |
| WPS013-M27 | Retry one evidence client ID. | One evidence row and one timeline event exist. | NOT RUN |
| WPS013-M28 | Upload ten files, then an eleventh. | Configured count limit rejects the eleventh. | NOT RUN |
| WPS013-M29 | Force registration failure after upload. | Only the unregistered staged object is cleaned up. | NOT RUN |
| WPS013-M30 | Delete registered evidence; test raw/expired URL as unrelated account. | Deletion and unauthorized/expired access fail; authorized reload re-signs. | NOT RUN |

## D. Staff resolution and subsystem integration

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS013-M31 | Add participant-visible and staff-private staff notes. | Visible update reaches participants; private note is staff-only everywhere. | NOT RUN |
| WPS013-M32 | Resolve as Booking upheld, No action, Administrative action, and Other. | Bounded explanation persists; no automatic penalty occurs. | NOT RUN |
| WPS013-M33 | Attempt Partial compensation without WPS-007 payment/action. | Resolution is rejected. | NOT RUN |
| WPS013-M34 | Use approved pre-release refund fixture. | Existing WPS-007 refund authority returns the stored reference; no duplicate ledger. | NOT RUN |
| WPS013-M35 | Use approved post-release case fixture. | Existing reviewed financial case is referenced; no direct money movement. | NOT RUN |
| WPS013-M36 | Resolve as Return visit. | One WPS-012 requested section appears on the same completed booking. | NOT RUN |
| WPS013-M37 | Resolve as Warranty work. | Same-booking WPS-012 return path is reused; original warranty is not reset. | NOT RUN |
| WPS013-M38 | Try return resolution while another return visit is active. | Duplicate open visit is rejected. | NOT RUN |
| WPS013-M39 | Reject and then Close; resolve and then Close. | Only approved terminal transitions succeed. | NOT RUN |
| WPS013-M40 | Inspect booking/payment/review counts after resolution. | One booking, payment authority, operation root, and review remain. | NOT RUN |

## E. Communication, notifications, reviews, and public privacy

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS013-M41 | Open existing booking conversation during case flow. | Source-linked localized case status events appear there. | NOT RUN |
| WPS013-M42 | Respond after ordinary completed-chat write expiry. | Guarded dispute response appears; general chat remains read-only. | NOT RUN |
| WPS013-M43 | Inspect response/status message metadata. | Only dispute/source routing IDs and safe state are present. | NOT RUN |
| WPS013-M44 | Trigger Opened, Evidence requested/submitted, Under review, Resolved, Closed twice. | Required durable notifications appear once per recipient/event. | NOT RUN |
| WPS013-M45 | Inspect notification payloads. | No note, evidence path, contact, address, price, staff identity, or moderation data appears. | NOT RUN |
| WPS013-M46 | Create Draft while a review is public. | Draft does not affect publication/reputation. | NOT RUN |
| WPS013-M47 | Submit with an existing visible review. | Review becomes temporarily non-public without deletion/content change. | NOT RUN |
| WPS013-M48 | Submit review while a case is active. | One review is stored and held from public projection. | NOT RUN |
| WPS013-M49 | Staff hides a held review, then resolve case. | Independently hidden review remains hidden. | NOT RUN |
| WPS013-M50 | Inspect provider/profile/marketplace APIs during and after case. | No dispute data or ranking/badge/confidence manipulation is exposed. | NOT RUN |

## F. Mock, localization, accessibility, brand, and recovery

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS013-M51 | Repeat draft → evidence → submit → response → review → resolve → close in Mock. | Eligibility, graph, events, evidence, notifications, return reference, and errors match. | NOT RUN |
| WPS013-M52 | Force Supabase read/write/upload/sign failure. | Error propagates; no Mock read/write occurs. | NOT RUN |
| WPS013-M53 | Switch customer/worker/unrelated accounts during reload. | No previous participant data flashes or mutates. | NOT RUN |
| WPS013-M54 | Run all reasons/states/errors in English. | Complete natural English copy and exact approved motto render. | NOT RUN |
| WPS013-M55 | Run all reasons/states/errors in Egyptian Arabic. | Natural Egyptian Arabic and `شغلك مهمتنا` render exactly. | NOT RUN |
| WPS013-M56 | Repeat in RTL at 320 CSS px and small Android/iPhone sizes. | Rows, chips, evidence, timeline, and actions mirror/wrap without loss. | NOT RUN |
| WPS013-M57 | Use TalkBack/VoiceOver and keyboard navigation. | Labels, radio/link/button roles, selected/disabled/busy state, order, and focus are correct. | NOT RUN |
| WPS013-M58 | Test loading, empty, error, retry, offline, reconnect, background/foreground, and expired signed URL. | State recovers from authoritative data without privacy leak. | NOT RUN |
| WPS013-M59 | Audit splash, onboarding, auth, home, profile, settings, notifications, HTML, manifest, app config, docs, tests, and assets. | Only `YOUR WORK, OUR MISSION` / `شغلك مهمتنا` are active mottos. | NOT RUN |
| WPS013-M60 | Verify no live providers/hosted mutations occurred. | Payments, SMS, telephony, push, webhooks, schedulers, migrations, and deployment remain inactive. | NOT RUN |
