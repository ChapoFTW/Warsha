# WPS-012 — Job Execution & Operations

## 1. Metadata and authority

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **LOCKED FOR LOCAL IMPLEMENTATION — MANUAL AND HOSTED ACCEPTANCE PENDING** |
| Depends on | Constitution and WPS-001 through WPS-011 |
| Engineering specification | `docs/wes/WES-012-job-execution-operations.md` |

Authority order is the Warsha Constitution, WPS-012, WES-012, then implementation. WPS-012 extends the canonical booking, communication, notification, marketplace, finance, profile, review, and reputation systems. It does not create a second booking lifecycle, payment authority, conversation, review, ranking signal, or public evidence model.

WPS-004 remains authoritative for the coarse booking lifecycle. WPS-007 remains the only authority for prices, customer money, and worker earnings. WPS-008 remains the authority for pre-booking quotes, Rescue, no-show, and category warranty foundations. WPS-009 remains the authority for participant communication. WPS-011 remains the authority for completed-booking review eligibility and reputation.

## 2. Purpose and product contract

After a worker confirms a booking, participants need a clear account of travel, arrival, work, delays, decisions, evidence, inspection, and completion. WPS-012 adds a server-authoritative operational layer to that same booking. It starts at confirmation and ends when the customer approves completion. Every meaningful operation is chronological, localized, immutable, participant-visible, and staff-auditable.

Operational activity never changes price, payment, rating, ranking, eligibility, or public profile state by itself. Completion changes the canonical booking to `completed`, allowing the existing WPS-007 and WPS-011 triggers to act.

## 3. Operational state graph

The locked states are Confirmed, Traveling, Arrived, Waiting for customer, Started, Waiting for approval, Waiting for parts, Paused, Resumed, Returning later, Finished, Customer inspection, and Completed.

Valid transitions are:

- Confirmed → Traveling.
- Traveling → Arrived or Waiting for customer.
- Arrived → Waiting for customer or Started.
- Waiting for customer → Arrived or Started.
- Started → Waiting for approval, Waiting for parts, Paused, or Finished.
- Waiting for approval → Resumed, Waiting for parts, or Paused.
- Waiting for parts → Resumed, Returning later, or Paused.
- Paused → Resumed or Returning later.
- Resumed → Waiting for approval, Waiting for parts, Paused, or Finished.
- Returning later → Traveling or Resumed.
- Finished → Customer inspection.
- Customer inspection → Completed or Resumed.
- Completed is terminal within an operation section.

Only server RPCs may advance the graph. Worker actions control travel and work states. The worker cannot mark WPS-012 completion. The worker completes the handoff checklist and requests inspection; the customer approves completion or returns the operation to Resumed with clarification or a remaining issue.

The layer maps onto WPS-004 without adding booking statuses: Confirmed maps to `confirmed`; Traveling to `provider_on_the_way`; Arrived and Waiting for customer to `provider_arrived`; Started to `job_started`; intermediate work/inspection states to `work_in_progress`; and customer-approved completion to `completed`.

## 4. Immutable operational timeline

Each transition, predefined update, delay, progress-photo registration, additional-work decision, inspection response, completion, and return-visit action appends one immutable event. Events carry the booking, operation section, resulting state, bounded event type, server-derived actor class and actor ID, bounded note, non-sensitive metadata, idempotency key, and server timestamp.

Clients cannot insert, update, or delete timeline rows. Authenticated participants read only their booking timelines; support/admin staff may audit them. Staff cannot rewrite an event. Legacy WPS-004 milestone calls append synchronized system events so existing clients and histories remain compatible.

## 5. Predefined updates and delays

Workers may publish only: “I’m on my way,” “I’ve arrived,” “I’m waiting outside,” “I’ve started,” “I need additional parts,” “I’ll return tomorrow,” “I’m running late,” and “I’ve finished.” Customers may publish only: “I’ll be there shortly,” “I’ve inspected the work,” and “I’ve approved the additional work.” These are structured keys, not client-authored system text.

Delay reasons are Running late, Traffic, Waiting for parts, Weather, Need customer, Need helper, and Need tomorrow. Optional minutes are bounded from 1 through 1,440 and notes from 1 through 1,000 characters. A delay is evidence and notification context; it never changes money or reputation. Waiting for parts may move a valid active operation into that state.

## 6. Progress media

Before, During, and After photos are separate from chat attachments. They remain private at all times, including after completion, and are visible only to the customer, booked worker, and authorized staff. The private `job-progress-media` bucket accepts JPEG, PNG, WebP, HEIC, and HEIF images up to 8 MB.

Object paths use the authenticated uploader, booking, operation namespace, phase, and a safe immutable client ID. Server registration verifies object ownership, exact booking participation, MIME, byte size, safe path, phase, section, caption up to 500 characters, ordering, count, and retry ID. Participant reads use one-hour signed URLs; raw paths never enter UI domain state or public projections. A failed registration removes only the caller’s unregistered staged object. Registered evidence cannot be directly deleted.

## 7. Additional work

An active worker may request additional work with a 3–2,000 character explanation, up to eight progress-photo references from the same booking/section/uploader, and an optional proposed new total. The operation moves to Waiting for approval.

If a total is supplied, the server calls WPS-007 `propose_booking_price_adjustment`; the WPS-012 row stores its immutable adjustment ID. The request alone never mutates the booking price. The customer may Approve, Reject, or request clarification. Approval/rejection calls WPS-007 `respond_booking_price_adjustment`; clarification leaves the financial proposal pending and the operation waiting. Approved/rejected work resumes. WPS-012 never creates payments, earnings, refunds, or ledger entries.

## 8. Inspection and completion

Before inspection the worker confirms Work finished, Area cleaned, Photos uploaded, and Customer informed. At least one registered After photo is required for the WPS-012 handoff. Pending or clarification-needed additional work blocks inspection.

The customer confirms Work inspected, Satisfied, and Close booking; Review later is optional and does not submit a review. Approve changes the canonical booking to `completed`. Request clarification or Report remaining issue requires an explanation and returns the operation to Resumed. Existing dispute hooks remain available through WPS-004/WPS-007 and are not duplicated by the checklist.

## 9. Warranty commitment

The worker may attach no added warranty, 30, 60, 90, or a custom 1–365 day commitment at the first inspection handoff. If an approved WPS-008 quote already promises warranty days, WPS-012 cannot shorten them; the quote value is the minimum. The final warranty begins only at first canonical completion and ends after the committed number of days. A return visit cannot reset, shorten, or replace the original warranty dates.

The commitment is evidence and service coverage metadata. It does not automatically create a refund, free replacement, payment adjustment, reputation change, or marketplace ranking input.

## 10. Same-booking return visits

After completion, the customer may request a return visit with a reason. The request retains the same booking ID, customer, worker, price history, conversation, operation history, and single WPS-011 review. Only one return visit may be open at a time.

An accepted visit increments the operation section and reuses the state graph from Confirmed. The canonical booking stays `completed` throughout the return section, so money is not released twice and review eligibility is not recreated. Customer approval closes the return-visit row and section. A decline is recorded but does not erase the request. Return-visit acceptance does not promise that work is free; any new price still requires WPS-007 approval.

## 11. Notifications and communication

Traveling, Arrived, Started, Paused, Resumed, Waiting for approval, Additional work, Delay, Finished, Inspection, Completed, Return visit, and Review unlocked create durable, deduplicated notifications for the relevant counterparty. Notification payloads contain booking/event identifiers only, never notes, addresses, contact details, media paths, prices, moderation data, or message bodies.

The same immutable source event creates one WPS-009 `status` message with its source-event ID, event key, state, and section. System messages are localized by the client and cannot be forged by either participant. Return-visit system updates may be appended to the existing read-only completed conversation; WPS-009 still controls participant chat writability and retention.

## 12. Existing lifecycle integrations

- Quote states remain `submitted`, `revised`, `selected`, `rejected`, `withdrawn`, `expired`, and `invalidated_by_request_change`; invitation and request graphs remain WPS-008 authority.
- Cancellation remains WPS-004/WPS-008 authority. Pre-execution customer/worker cancellation, no-show, and Rescue behavior is unchanged. WPS-012 defines no financial cancellation fee.
- Rescue remains triggered by the existing worker no-show/cancellation hooks before an operation can continue; it creates no operational substitute booking.
- WPS-007 release/hold logic observes the canonical `completed`/`disputed` status exactly once.
- WPS-011 review submission still requires the canonical completed booking and its existing unique booking constraint.
- Operational updates never directly modify reviews, ratings, reputation metrics, badges, confidence, matching, or discovery ranking.

## 13. Privacy, security, and public boundary

Actor identity always derives from `auth.uid()` and the canonical booking/provider relationship. No operation table is public. RLS limits reads to participants and staff. Public marketplace/profile RPCs receive no timeline, media, additional-work, delay, inspection, warranty-detail, or return-visit fields. Internal actor IDs, notes, Storage paths, idempotency keys, financial adjustment IDs, and staff access never enter public projections.

Security-definer functions use an empty `search_path`, validate bounded inputs, lock mutable rows, and keep private helpers unexecutable by clients. Operational tables may use RLS-scoped Realtime invalidation; no private schema table is published.

## 14. Mock, localization, accessibility, and brand

Mock implements the same actor gates, state graph, event ordering, idempotency, media checks, WPS-007 adjustment reuse, checklists, customer completion, warranty start, one open return visit, same-booking sections, notifications, and review unlock. Data-mode selection is static and errors never fall back from Supabase to Mock.

English and natural Egyptian Arabic localize states, events, actions, delays, checklists, errors, empty/loading states, system messages, and notifications. Rows reverse in RTL. Checkboxes, radio choices, images, progress state, buttons, disabled/busy state, and errors expose accessibility semantics, meaningful labels, 44-point targets, small-screen wrapping, and retry behavior.

The only active motto is English `YOUR WORK, OUR MISSION` and Arabic `شغلك مهمتنا`. Historical mission prose may remain only in Constitution/history context.

## 15. Compatibility and deferred features

The earlier WPS-004 worker-completion RPC remains callable for preserved WPS-001–WPS-011 compatibility and synchronizes into the WPS-012 timeline. Current WPS-012 UI no longer exposes that direct completion path. Removing the legacy RPC requires a separate migration and compatibility decision.

Live push delivery, SMS, telephony, maps/automatic travel tracking, background location, automated image analysis, AI summaries, automatic price estimation, automatic dispute/refund decisions, public progress galleries, scheduler-driven reminders, production staff tooling, and hosted activation are deferred.

## 16. Acceptance boundary

WPS-012 remains local-only until clean reset, full pgTAP, TypeScript regression, lint, mojibake, Expo Doctor, Android/iOS/web exports, motto audit, linked-ledger/dry-run, security/accessibility review, and manual evidence are reviewed. Manual cases begin **NOT RUN**. No hosted migration, deployment, provider activation, payment, SMS, phone call, push delivery, webhook, or scheduler is authorized.

## 17. WPS-013 dispute integration

WPS-013 reads this specification's immutable operation events, progress photos, additional-work approvals, inspection, checklists, warranty, and return visits as evidence. Return-visit and warranty-work resolutions create a new section through WPS-012 while preserving the completed booking, participants, history, financial record, and single review.

## WPS-014 notification integration

WPS-014 maps immutable operation event IDs to deduplicated booking notifications, required-action priority, safe routing, and conservative disabled reminders. Fine-grained events own travel/arrival/start/progress/completion notices during legacy synchronization; no progress note, photo path, checklist detail, delay reason, or private metadata enters notification payloads.
