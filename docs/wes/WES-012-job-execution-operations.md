# WES-012 — Job Execution & Operations

## 1. Status and architecture

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **IMPLEMENTED LOCALLY — MANUAL AND HOSTED DEPLOYMENT GATED** |
| Product authority | `docs/wps/WPS-012-job-execution-operations.md` |

WPS-012 adds a one-to-one operational aggregate and immutable event stream beneath the existing booking. The canonical `bookings` row remains the lifecycle, participant, finance, communication, and review join. No parallel booking, payment, chat, review, notification, or ranking system is permitted.

## 2. Existing-system architecture audit

| Area | Existing authority and implementation | WPS-012 treatment |
| --- | --- | --- |
| Booking states | WPS-004: pending provider approval, accepted, rejected, rescheduling requested, confirmed, provider on the way, provider arrived, job started, work in progress, completed, disputed, cancelled, refunded, no-show | Retained; operational states map to these coarse values |
| Quote states | WPS-008 request/invitation lifecycle and quote states submitted, revised, selected, rejected, withdrawn, expired, invalidated by request change | Read-only dependency; no quote mutation |
| Communication | WPS-009 activates on confirmed booking, locks cancellation immediately, and locks completed participant chat after 48 hours; server status messages already exist | Append source-linked status messages to the same conversation |
| Review trigger | WPS-011 requires `bookings.status='completed'` and unique booking review | Customer inspection performs canonical completion; no review duplicate |
| Payment trigger | WPS-007 releases/holds through canonical completed/disputed transitions | Reuse trigger; additional work calls existing adjustment RPCs |
| Cancellation | WPS-004 transition trigger; WPS-008 cancellation events and no-show handling | Unchanged; terminal booking status hides operation controls |
| Rescue | WPS-008 worker no-show/cancellation hooks create controlled replacement search | Unchanged and not reimplemented |
| Dispute hooks | WPS-004 disputed state and WPS-007 earnings hold/refund authority | Unchanged; remaining-issue inspection is not an automatic dispute |
| Notifications | Durable RLS-owned rows with dedupe keys and Realtime invalidation | Transactional event-trigger inserts, minimal payloads |
| Timeline | Immutable `booking_status_history` plus WPS-009 status messages | Add fine-grained immutable operational events; keep coarse history |
| Mock | Static repositories with local persistence and no fallback | Add operation store plus booking/payment/notification integration |
| Missing layer | Coarse worker buttons jumped from arrival to work and worker completion | Server graph, progress evidence, approval, inspection, warranty, return sections |

## 3. Forward schema

Migration `202608010006_wps012_job_execution_operations.sql` creates:

- `booking_operations`, one row per canonical booking with current state/section, simple checklists, and completion warranty;
- immutable `booking_operation_events` with server actor, state, event type, source metadata, and booking-scoped idempotency;
- `job_progress_media` for server-registered private Before/During/After evidence;
- `booking_additional_work_requests` with optional WPS-007 `booking_price_adjustments` link;
- `booking_return_visits` with one open visit and unique numbered sections.

Only forward objects, indexes, constraints, policies, triggers, grants, functions, bucket configuration, and Realtime publication entries are added. Existing data is initialized lazily and legacy booking updates synchronize forward without changing prior rows.

## 4. Transition and completion engineering

`private.job_operation_can_transition` is the single database graph. `transition_booking_operation` validates a server-derived worker and locks the aggregate/booking. `private.job_operation_booking_status` updates only the existing coarse state when necessary. A local transaction flag prevents the legacy-sync trigger from duplicating authoritative WPS-012 events.

`mark_job_ready_for_inspection` requires all worker checklist keys, an After image, no undecided extra work, and a valid warranty. It atomically records Finished and Customer inspection. `respond_job_inspection` derives the customer, validates the inspection checklist, and either returns to Resumed or updates the canonical booking to completed. This invokes existing financial, history, chat, notification, and review eligibility behavior.

Legacy `advance_provider_booking_status(...,'completed',...)` remains for backward compatibility, but WPS-012 screens do not call it; a trigger records a system operational event when older code uses it.

## 5. Timeline, chat, and notifications

`private.append_booking_operation_event` inserts idempotently. A before-update/delete trigger rejects all event mutation, including privileged direct attempts. Participants/staff read events through RLS and `get_booking_operation`.

`private.record_job_operation_side_effects` runs once after insertion. It ensures the existing WPS-009 conversation/members, inserts a `status` message with `operation_*` key and source event, and inserts the relevant counterparty notification with a unique event dedupe key. Completion separately inserts one customer `review_unlocked` notification keyed by booking. Notes, locations, prices, paths, and contact data never enter notification or system-message metadata.

## 6. Additional-work and financial integration

`submit_additional_work_request` is worker-only in Started/Resumed, verifies photo references, and calls `propose_booking_price_adjustment` only when a proposed total exists. The request persists the returned adjustment ID and then moves to Waiting for approval. `respond_additional_work_request` is customer-only and calls `respond_booking_price_adjustment` for approve/reject. Needs clarification does not decide the financial proposal. No WPS-012 table stores payment methods, provider money, fees, commissions, refunds, or ledger balances.

## 7. Progress-media storage

The private `job-progress-media` bucket is capped at 8,388,608 bytes with JPEG/PNG/WebP/HEIC/HEIF allowlisting. Object INSERT requires an authenticated booking participant, self-owned first path segment, operation folder, valid phase, and image extension. Registration checks the actual `storage.objects` owner, metadata MIME/size, safe exact path, booking/section/count, order, caption, and client retry ID.

SELECT is available only after registered metadata exists and the caller remains a participant/staff member, enabling one-hour signed URLs. DELETE is available only to the object owner before registration, supporting a failed-registration rollback. Registered objects are evidence and cannot be directly removed.

## 8. Warranty and return-visit engineering

First-section inspection accepts None/30/60/90/Custom, with Custom bounded to 1–365. If `selected_worker_quote_id` links a quote warranty, the completion commitment is raised to at least that value. Start/end timestamps are written only during first canonical completion.

`request_booking_return_visit` locks a completed booking/aggregate, rejects a second open visit, increments the section, and inserts no booking. `respond_booking_return_visit` records accept/decline. Accepted sections reuse the state graph while `bookings.status` stays completed. Closing a return section updates only its visit/operation rows; it does not rerun canonical completion or reset warranty. WPS-011’s booking uniqueness prevents a duplicate review.

## 9. RLS, grants, and data matrix

| Data | Customer | Booked worker | Staff | Public/anonymous |
| --- | --- | --- | --- | --- |
| Current operation/checklists/warranty | Read; customer mutations via RPC | Read; worker mutations via RPC | Read/audit | None |
| Immutable timeline | Read | Read | Read, never rewrite | None |
| Progress media/paths | Signed read | Signed read/upload/register | Signed read | None |
| Additional work and financial link | Read/respond | Read/request | Read/audit | None |
| Return visits | Read/request | Read/respond/execute | Read/audit | None |
| Notification/system event payload | Recipient/minimal | Recipient/minimal | Existing scoped access | None |
| Public profile/marketplace/reputation | Existing sanitized data only | Existing sanitized data only | Existing authority | No WPS-012 fields |

All client table writes are revoked. Mutations derive `auth.uid()`, role, booking, provider user, and section from server rows. Definer functions use `set search_path=''`; helpers are revoked from client roles. Private schema remains outside Realtime.

## 10. Client and Mock implementation

`src/job-operations` defines the locked graph, domain model, localization, Supabase adapter, and Mock adapter. `JobOperationsPanel` is mounted in customer booking detail and worker job detail. It supplies timeline, predefined updates, delay form, retryable photo staging, additional work, worker/customer checklists, warranty, inspection, and return visits. Existing direct post-confirmation worker buttons are removed from active WPS-012 UI; pre-confirmation accept/reject/reschedule remains.

Mock uses the same graph and gates, fixed participant accounts, idempotent event keys, ordered evidence, WPS-007 Mock price adjustments, canonical booking-status updates, notifications, warranty start, review unlock, and same-booking return sections. The repository is selected once from `EXPO_PUBLIC_DATA_MODE`; no caught Supabase error writes to Mock.

## 11. Localization and accessibility

English and Egyptian Arabic cover every state, predefined update, delay, checklist, price-approval explanation, photo phase/error, inspection response, warranty, return state, system message, and durable notification. Timeline timestamps use the active locale and section numbers are localized. Layouts reverse for RTL and wrap on 320 CSS-pixel widths.

Controls expose button, checkbox, radio, image, selected, disabled, and busy semantics. Touch targets are at least 44 points. Loading, empty, error, retry, staged-upload retry, and signed-image unavailable states are represented without relying on color alone.

## 12. Testing and operations

Dedicated TypeScript regression checks cover graph mappings, schema/RPC contracts, WPS-007/009/011 integration, privacy, Storage, Mock parity, localization, accessibility, and motto. Dedicated pgTAP executes authorization, valid/invalid transitions, idempotency, timeline immutability, system messages, notification dedupe, delay bounds, owned media, explicit extra-price approval, inspection clarification/completion, warranty start, review unlock, staff audit, and a full same-booking return visit.

Run clean local reset, all pgTAP, all custom suites, TypeScript, ESLint, mojibake, `git diff --check`, Expo Doctor, cache-cleared Android/iOS/web exports, local migration list, linked ledger, and non-mutating linked dry-run. Manual cases begin **NOT RUN**. Never execute a hosted push in this work item.
