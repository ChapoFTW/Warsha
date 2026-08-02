# WPS-004 - Booking Lifecycle

## Document metadata

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** |
| Authority | Warsha Constitution |
| Source | Existing repository, migrations, tests, and implemented behavior |

## 1. Scope and authority

This document records the authoritative **existing booking** lifecycle. WPS-008 may add a pre-booking request/invitation/quote lifecycle, but it converts into this lifecycle rather than silently inventing extra booking states. WPS-007 remains authoritative for approved price, payment, refund, earnings, and financial dispute behavior.

Primary evidence is `bookingTransitions` in the client, `private.enforce_booking_transition()`, guarded booking/job RPCs, migrations `202607200007`, `202607200010`, `202607200012`, `202607200013`, `202607300001`, `202607300002`, `202607310001`, and the booking, chat, financial, RLS, and alignment pgTAP suites.

## 2. Creation and assignment

- The implemented creation RPC assigns one already selected worker/provider and active service.
- It resolves the customer from Auth, validates a sufficiently detailed issue, address ownership, booking type, worker discoverability/availability, active service/category, future schedule where required, capacity conflict, and idempotency.
- It snapshots worker/customer/service/address/pricing inputs and creates `pending_provider_approval`.
- Creation does not implement WPS-008 marketplace requests, progressive invitations, competing quotes, or selection. Those are a distinct future pre-booking lifecycle.

## 3. Authoritative transitions

| From | Valid next state(s) |
| --- | --- |
| `pending_provider_approval` | `accepted`, `rejected`, `rescheduling_requested`, `cancelled` |
| `accepted` | `confirmed`, `rescheduling_requested`, `cancelled` |
| `rescheduling_requested` | `pending_provider_approval`, `accepted`, `confirmed`, `cancelled` |
| `confirmed` | `provider_on_the_way`, `rescheduling_requested`, `cancelled` |
| `provider_on_the_way` | `provider_arrived`, `cancelled` |
| `provider_arrived` | `job_started`, `no_show`, `cancelled` |
| `job_started` | `work_in_progress`, `completed`, `disputed` |
| `work_in_progress` | `completed`, `disputed` |
| `completed` | `disputed` |
| `disputed` | `refunded` |
| `rejected`, `cancelled`, `refunded`, `no_show` | no next state |

Any other state change is rejected by the database trigger even if attempted through direct SQL by a role that can update.

The schema still accepts `draft`, `awaiting_quote_approval`, and `awaiting_customer_confirmation`, but current authorized RPCs do not enter or transition those legacy/prepared values. They must not be claimed as active flows.

## 4. Acceptance, rejection, and confirmation

- Only the assigned worker who owns an approved, published profile can accept or reject `pending_provider_approval`.
- Rejection requires a bounded reason and is terminal.
- Acceptance moves to `accepted` once; duplicate or wrong-worker calls are rejected.
- The assigned worker advances `accepted` to `confirmed`. In WPS-008, marketplace worker confirmation will precede/atomically cause booking conversion, so the conversion contract must choose a consistent initial booking state without bypassing this graph.

## 5. Rescheduling

- A customer may reschedule an eligible pending/accepted/confirmed booking to a future time through a guarded RPC.
- A worker may propose a future date/time from pending, accepted, or confirmed. The original schedule and prior state remain recorded.
- Only the booking customer may accept or reject the proposal. Acceptance applies the proposed schedule and restores the appropriate actionable state; rejection clears the proposal and restores the prior state.
- Conflict checks use worker-level serialization, duration, travel fallback, and the fixed capacity buffer where configured.

## 6. Travel, arrival, and work

- The worker progresses `confirmed` to `provider_on_the_way`, then `provider_arrived`, then `job_started`.
- Work may move to `work_in_progress` or directly from `job_started` to `completed` when valid.
- Completion may store bounded notes and private completion-evidence attachments.
- The current lifecycle stores milestone timestamps through immutable status history; it does not implement continuous live tracking.

## 7. No-show, cancellation, and dispute

- The existing worker-side no-show RPC is authorized only for the assigned worker after `provider_arrived` and records a bounded reason. In product terms this represents the customer being unavailable; the function name is legacy and ambiguous.
- Customer cancellation is allowed through the currently cancellable pre-work states, records reason/time, and is audited through status history.
- There is no implemented post-agreement worker-cancellation RPC, Rescue Mode, or customer report of worker no-show in this baseline. WPS-008 governs those forward additions.
- A worker may open `disputed` from `job_started` or `work_in_progress` with a problem description. A completed booking may also enter dispute under the database graph through an authorized future/support path.
- `disputed` may become `refunded`; WPS-007 controls whether money actually moved, refund amount, holds, recovery, and ledger entries. A status label alone cannot manufacture a refund.

## 8. Booking history and attachments

- Every creation/status change inserts immutable `booking_status_history` with actor and metadata; helper annotations add bounded notes without duplicating the status row.
- Customers and assigned workers can read their booking and history. Unrelated users cannot.
- Customer issue and worker completion-evidence attachment metadata are participant scoped; objects are private and read through signed URLs.
- Upload path, size, MIME type, lifecycle stage, and ownership are validated. Failed multi-step mutations attempt both metadata and object rollback.

## 9. Chat relationship

- Chat is booking-scoped and participant-only.
- Existing messages and attachments remain readable for booking history.
- Cancellation makes chat writes and typing read-only immediately.
- Completion leaves chat writable only until the exact 48-hour follow-up boundary; it is read-only at and after 48 hours.
- Message sends are idempotent by client ID, and system messages record lifecycle changes.

## 10. Price, quote, payment, and review relationships

- Legacy `booking_quotes`, `quote_items`, `change_orders`, and states exist in the early schema but are not the WPS-008 pre-booking marketplace quote implementation.
- WPS-007 `booking_price_snapshots` and `booking_price_adjustments` are the authoritative implemented mechanism for post-agreement price changes. Worker proposal plus explicit customer approval creates a new immutable current snapshot.
- Payment intents, cash confirmation, refunds, earnings, receipts, and releases use WPS-007 RPCs and never rely on a client-calculated amount.
- One review is allowed only for the customer of an eligible completed booking, subject to dispute/moderation rules.

## 11. Actor permissions

- Customer: create own booking, list/read own booking/history/attachments, cancel/reschedule where allowed, accept/reject worker reschedule, use chat, use customer payment actions, and review eligible completion.
- Assigned worker: read assigned booking/history/attachments, accept/reject/propose time, advance permitted milestones, report customer no-show at the implemented point, add completion evidence, use chat, propose controlled price adjustment, use worker payment/earnings actions, and reply once to a review.
- Unrelated authenticated user and anonymous user: no private booking, chat, attachment, payment, or history access.
- Staff/service operations: only through explicit roles or trusted contracts; no normal client receives general staff authority.

## 12. Known limitations

WPS-011 extends the post-completion review relationship with bounded editing, dimensions, photos, helpful voting, reporting, and moderation. Booking completion and permanent booking linkage remain governed by WPS-004.

- Pre-booking WPS-008 marketplace states and conversion are not implemented in this baseline.
- Customer worker-no-show reporting, post-agreement worker cancellation, Rescue Mode, Running Late, warranty comeback, and a complete support dispute UI are absent.
- Manual end-to-end transition, attachment, chat-boundary, Arabic/RTL, and native background tests are not recorded as passed.

## WPS-012 extension note

WPS-012 adds fine-grained post-confirmation operational states beneath this canonical booking graph. It maps travel/work/inspection states to the existing WPS-004 statuses, keeps `booking_status_history`, cancellation, no-show, dispute, refund, and terminal rules intact, and makes customer inspection the active WPS-012 completion path. Legacy WPS-004 completion calls remain compatible and synchronize into the operational timeline.

## WPS-013 dispute integration

WPS-013 extends the dormant dispute relationship without changing this booking graph for normal cases. A submitted case stays permanently linked to its booking, reads this specification's immutable status history and attachments as evidence, and leaves booking state unchanged. The legacy `disputed` status remains compatible and bootstraps a WPS-013 case; new WPS-013 cases do not require that status.

## WPS-014 notification integration

WPS-014 normalizes booking notifications at the existing durable insert boundary and preserves this booking graph. WPS-012 fine-grained operational milestones own their user-facing row, so the five legacy-synchronized statuses no longer create an additional coarse durable notification; booking history remains unchanged.
