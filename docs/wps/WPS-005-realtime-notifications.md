# WPS-005 - Realtime & Notifications

## Document metadata

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** |
| Authority | Warsha Constitution |
| Source | Existing repository, migrations, tests, and implemented behavior |

## 1. Architecture

Realtime subscriptions are centralized in `src/realtime/realtime-service.ts`. Screens and contexts request scoped subscription helpers; they do not create independent Supabase channels. Supabase payloads are invalidation hints, and repositories reload authoritative rows/RPC projections before changing durable UI state.

Primary evidence includes `src/realtime`, `src/notifications`, booking/provider/chat/review/verification/payment contexts, migrations `202607200011`, `202607200013`, `202607270001`, `202607290002`, `202607300001`, `202607300002`, and their pgTAP suites.

## 2. Subscription scopes

- Customer bookings: `bookings` filtered by `customer_id`.
- Worker jobs: `bookings` filtered by owned `provider_id`.
- Booking detail: booking row, status history, and booking attachments filtered by booking ID.
- Booking conversation: messages and typing rows filtered by booking ID.
- Notifications: notification rows filtered by user ID.
- Marketplace worker catalog, verification, provider reviews, booking review/reply/attachments, booking payment, and worker financial rows have dedicated helpers.
- RLS remains authoritative for Realtime delivery; publication membership never grants row access.

## 3. Connection and reconciliation

- A successful initial subscription establishes the live path; reconnect after a prior connection triggers a repository reload.
- Channel errors/timeouts are reported as connection errors without treating payload state as authoritative.
- Customer bookings, notifications, and other applicable contexts reload on app foreground.
- Burst invalidations are coalesced with microtasks or short timers to avoid duplicate fetches.
- Every helper returns cleanup that removes the Supabase channel. Account changes clear state, advance generation tokens, and ignore stale completions.

## 4. Durable notifications

- `public.notifications` is the durable source. Booking, chat, review, verification, financial, refund, earning, and withdrawal server mutations create events with routing identifiers and dedupe keys.
- Notifications are owner-only through RLS. Mutation RPCs resolve the caller from Auth.
- A notification has type, localized/safe title and body, minimal routing data, creation time, optional read time, and optional dismissal time.
- Realtime never creates a durable notification on the client; it only causes refresh and may show a foreground banner for a newly loaded durable row.
- Notification payloads must not contain internal scores, candidate pools, competitor quote data, raw identity documents, secrets, or unnecessary exact location.

## 5. Read, dismiss, and navigation behavior

- Users can mark one notification read, mark all read, dismiss one notification, refresh, and paginate in pages of 20.
- Dismissal is a server-side timestamp in Supabase and local removal in Mock mode; it does not delete the authoritative database row.
- Opening marks unread content read and routes verification, earnings/withdrawal, chat, payment/refund, review reply, customer booking, or worker job to the correct screen.
- Booking-message banners are suppressed while that booking conversation is active.

## 6. Booking-detail and chat behavior

- Booking detail subscribes to booking, history, and attachment invalidations and reconciles immediately on connection.
- Chat subscribes to message and typing invalidations, reloads pages, marks read through a guarded RPC, and uses expiring typing state.
- Chat lifecycle writes are still controlled by server time and booking status: immediate lock on cancellation and exact 48-hour lock after completion.

## 7. Mock parity

- Mock repositories emit the same table/event-shaped invalidations through an in-process listener set.
- Supported Mock mutations create deduplicated local notifications and drive the same contexts/screens.
- Mock events do not open Supabase channels or call Supabase.
- Mock Realtime is process-local only; it does not simulate delivery while the app process is stopped.

## 8. Publication and privacy boundary

- Current publication includes the minimum tables needed for bookings, notifications, chat, reviews, verification, and WPS-007 finance flows.
- Private identity, candidate scoring, ledger internals, configuration, and Storage objects are not published as general client feeds.
- New WPS-008 tables may be published only when a client-visible, RLS-safe projection is required.

## 9. Existing limitations

- There is no Expo push token registration, APNs/FCM delivery, background notification handler, SMS delivery, or email notification worker.
- Realtime requires the app process and network connection; durable rows plus foreground/reconnect reconciliation cover missed live events.
- Notification preference editing is not exposed as a complete mobile workflow.
- Manual reconnect, background/return, logout isolation, push-disabled copy, Arabic/RTL, and accessibility results are not recorded as passed.

