# WPS-012 Manual Alpha Runbook

## Status and safety

**Overall status: NOT RUN**

Run only with local or explicitly approved non-production customer, worker, and authorized-staff personas. Do not apply hosted migrations, send live SMS/push, move money, trigger webhooks, activate schedulers, or perform irreversible operations. Record device, OS, build, data mode, locale, evidence, and result for every case.

Allowed results are `PASS`, `FAIL`, `BLOCKED`, and `NOT RUN`. Every case starts as **NOT RUN**.

## A. State graph and timeline

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS012-M01 | Open a pending/accepted booking. | Operational controls are absent until confirmation. | NOT RUN |
| WPS012-M02 | Confirm a booking and open both participant details. | One Confirmed operation is shown on the canonical booking. | NOT RUN |
| WPS012-M03 | Execute Confirmed → Traveling → Arrived → Started. | Each valid transition succeeds and coarse booking status maps correctly. | NOT RUN |
| WPS012-M04 | Try Confirmed → Arrived and Traveling → Started. | State skipping is rejected server-side. | NOT RUN |
| WPS012-M05 | Exercise Waiting for customer from Traveling and Arrived. | Both valid paths preserve one ordered timeline. | NOT RUN |
| WPS012-M06 | Exercise Paused → Resumed and Waiting for parts → Returning later → Traveling. | Only approved branches are available. | NOT RUN |
| WPS012-M07 | Attempt transition as customer, unrelated user, or another worker. | Access is denied without booking leakage. | NOT RUN |
| WPS012-M08 | Retry the same transition request. | One event/message/notification exists. | NOT RUN |
| WPS012-M09 | Refresh/reconnect during transition. | Server state wins and chronology is stable. | NOT RUN |
| WPS012-M10 | Attempt direct event insert/update/delete as participant. | All timeline writes are denied. | NOT RUN |
| WPS012-M11 | Inspect as authorized staff and attempt a rewrite. | Full history is readable but immutable. | NOT RUN |
| WPS012-M12 | Complete through a legacy WPS-004 client fixture. | Existing behavior works and a synchronized system event appears. | NOT RUN |

## B. Predefined updates, delays, and communication

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS012-M13 | Publish every worker predefined update. | Approved localized event keys appear; arbitrary system text cannot be supplied. | NOT RUN |
| WPS012-M14 | Publish every customer predefined update. | Approved customer keys appear with server-derived actor. | NOT RUN |
| WPS012-M15 | Attempt a worker key as customer and customer key as worker. | Role mismatch is rejected. | NOT RUN |
| WPS012-M16 | Submit each approved delay reason. | Each creates one timeline event and relevant notification. | NOT RUN |
| WPS012-M17 | Enter 1 and 1,440 delay minutes, then 0 and 1,441. | Boundary values pass; out-of-range values fail. | NOT RUN |
| WPS012-M18 | Submit Waiting for parts from a valid active state. | State and coarse status update without price/rating change. | NOT RUN |
| WPS012-M19 | Open the existing conversation after events. | Localized server-authenticated system messages share source IDs with timeline. | NOT RUN |
| WPS012-M20 | Inspect message/notification payloads. | No note, address, contact, price, or media path is exposed. | NOT RUN |

## C. Progress media

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS012-M21 | Upload JPEG/PNG/WebP/HEIC/HEIF fixtures at valid sizes. | Each registers privately and renders by signed URL. | NOT RUN |
| WPS012-M22 | Upload Before, During, and After photos with ordering. | Phases and order persist across refresh. | NOT RUN |
| WPS012-M23 | Add/remove optional captions before registration. | Bounded captions persist; absent caption is calm. | NOT RUN |
| WPS012-M24 | Try unsupported MIME, zero bytes, and over 8 MB. | Upload/registration fails without metadata. | NOT RUN |
| WPS012-M25 | Try unsafe filename/path traversal or mismatched phase. | Server rejects registration. | NOT RUN |
| WPS012-M26 | Stage another user’s path or object. | Server-authoritative owner/booking check rejects it. | NOT RUN |
| WPS012-M27 | Force registration failure after upload. | Only unregistered staged object rolls back; retry remains available. | NOT RUN |
| WPS012-M28 | Retry the same client media ID. | One metadata/event row exists. | NOT RUN |
| WPS012-M29 | Attempt direct deletion after registration. | Evidence remains private and immutable. | NOT RUN |
| WPS012-M30 | Copy raw path/signed URL into unrelated/expired session. | Raw read fails; expired URL requires authorized re-signing. | NOT RUN |

## D. Additional work and finance

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS012-M31 | Submit explanation only from Started. | Request enters Waiting for approval without price change. | NOT RUN |
| WPS012-M32 | Submit same-section owned progress photos. | Valid references attach; cross-booking/uploader references fail. | NOT RUN |
| WPS012-M33 | Submit optional proposed new total. | One pending WPS-007 adjustment is linked; booking total is unchanged. | NOT RUN |
| WPS012-M34 | Customer approves request with price. | WPS-007 accepts snapshot and operation resumes. | NOT RUN |
| WPS012-M35 | Customer rejects request with price. | WPS-007 rejects adjustment and operation resumes without price mutation. | NOT RUN |
| WPS012-M36 | Customer requests clarification. | Request remains unresolved/waiting and price is not decided. | NOT RUN |
| WPS012-M37 | Try responding as worker/unrelated customer. | Response is denied. | NOT RUN |
| WPS012-M38 | Retry request and decision. | No duplicate request, adjustment, event, or notification occurs. | NOT RUN |
| WPS012-M39 | Attempt inspection with pending/clarification-needed work. | Handoff is blocked. | NOT RUN |
| WPS012-M40 | Inspect financial tables after non-price events. | No payment/earning/refund/ledger row is created by WPS-012. | NOT RUN |

## E. Inspection, completion, warranty, and reviews

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS012-M41 | Omit each worker checklist item. | Ready for inspection remains disabled/rejected. | NOT RUN |
| WPS012-M42 | Complete checklist without an After photo. | Inspection is blocked. | NOT RUN |
| WPS012-M43 | Complete checklist with After photo. | Finished and Customer inspection events append atomically. | NOT RUN |
| WPS012-M44 | Customer requests clarification with reason. | Booking remains work in progress and operation resumes. | NOT RUN |
| WPS012-M45 | Customer reports remaining issue with reason. | Issue is recorded and work resumes; no automatic dispute/refund occurs. | NOT RUN |
| WPS012-M46 | Approve without required customer checks. | Completion is rejected. | NOT RUN |
| WPS012-M47 | Approve with required checks. | Canonical booking completes and operation becomes Completed. | NOT RUN |
| WPS012-M48 | Inspect review/payment integrations. | One review unlock and existing WPS-007 completion behavior occur. | NOT RUN |
| WPS012-M49 | Select None/30/60/90/custom 1/365; try custom 0/366. | Approved choices persist; invalid bounds fail. | NOT RUN |
| WPS012-M50 | Use a quote with a longer warranty. | Completion commitment cannot shorten approved quote warranty; start is completion time. | NOT RUN |

## F. Return visits and lifecycle boundaries

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS012-M51 | Request return visit after completion. | Same booking opens section 2 with same participants/history. | NOT RUN |
| WPS012-M52 | Request a second open visit. | Duplicate open visit is rejected. | NOT RUN |
| WPS012-M53 | Accept a visit as booked worker. | Section enters Confirmed and reuses graph. | NOT RUN |
| WPS012-M54 | Decline with reason. | Decline is immutable; canonical booking stays completed. | NOT RUN |
| WPS012-M55 | Execute accepted return through inspection. | Section completes without toggling canonical completion. | NOT RUN |
| WPS012-M56 | Inspect warranty after return completion. | Original start/end/days are unchanged. | NOT RUN |
| WPS012-M57 | Inspect reviews after multiple return sections. | Booking still owns at most one review. | NOT RUN |
| WPS012-M58 | Inspect payment/earnings after return completion. | Release/completion side effects do not run twice. | NOT RUN |
| WPS012-M59 | Cancel/no-show before execution and trigger Rescue fixture. | Existing WPS-004/WPS-008 behavior remains authoritative. | NOT RUN |
| WPS012-M60 | Open a disputed/refunded/cancelled booking. | Existing terminal/dispute UI applies; operation actions are unavailable. | NOT RUN |

## G. Mock, localization, accessibility, brand, and recovery

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS012-M61 | Repeat core transition/approval/inspection/return flow in Mock. | State, booking, price decision, timeline, notifications, and review unlock match. | NOT RUN |
| WPS012-M62 | Force Supabase read/write failure. | Error propagates with no Mock fallback read/write. | NOT RUN |
| WPS012-M63 | Switch accounts during pending action. | Previous participant content never flashes or mutates. | NOT RUN |
| WPS012-M64 | Run all states/errors in English. | Complete natural English copy and approved motto render. | NOT RUN |
| WPS012-M65 | Run all states/errors in Egyptian Arabic. | Natural Egyptian Arabic and `شغلك مهمتنا` render exactly. | NOT RUN |
| WPS012-M66 | Repeat in RTL. | Timeline, rows, chips, checklists, galleries, and actions mirror correctly. | NOT RUN |
| WPS012-M67 | Use screen reader on states, events, photos, checks, choices, actions, errors. | Labels, roles, selected/checked/disabled/busy state, and reading order are correct. | NOT RUN |
| WPS012-M68 | Test 320 CSS px and small Android/iPhone viewports. | No page overflow or unreachable action occurs. | NOT RUN |
| WPS012-M69 | Test loading, empty, offline, retry, refresh, background/foreground, expired signed URL. | Authoritative recovery is stable and private data does not leak. | NOT RUN |
| WPS012-M70 | Audit splash, onboarding, auth, home, profile, settings, notifications, HTML, manifest, app config, docs, tests, and assets. | Only `YOUR WORK, OUR MISSION` / `شغلك مهمتنا` are active mottos. | NOT RUN |
