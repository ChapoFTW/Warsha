# WPS-014 — Notifications & Engagement

## 1. Metadata and authority

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **LOCKED FOR IMPLEMENTATION** |
| Authority | Warsha Constitution |
| Depends on | WPS-001 through WPS-013 |
| Engineering specification | `docs/wes/WES-014-notifications-engagement.md` |

Authority order is Constitution → WPS-014 → WES-014 → implementation. WPS-014 extends the existing WPS-005 durable notification and centralized Realtime foundation. It creates no second inbox, client event log, domain mutation path, marketing system, or push source of truth.

## 2. Purpose and boundaries

Warsha informs a customer or independent worker when a meaningful marketplace, booking, communication, financial, verification, review, dispute, security, or account event changes what they know or need to do. Notifications must be timely, calm, useful, private, and low-noise.

In-app durable notifications are authoritative. Realtime only invalidates and reconciles. Push is a disabled delivery abstraction. Notifications cannot mutate a booking, payment, review, dispute, verification, or marketplace record. No streak, reward, fake urgency, scarcity, social pressure, marketing opt-in, or promotional spam is permitted.

No AI-generated notification content or summaries are permitted. No ranking, reputation, badge, confidence, or marketplace-order manipulation may be derived from notification delivery, reads, archives, preferences, or engagement.

## 3. Existing architecture disposition

- `public.notifications` remains the only durable inbox source.
- Existing server-side business transactions remain notification producers.
- Existing `dedupe_key`, owner RLS, read/dismiss compatibility RPCs, centralized Realtime subscription, foreground banner, and Mock/Supabase repository split are extended.
- Existing WPS event tables remain source authority. WPS-014 adds source links and delivery metadata, not a parallel event system.
- Dismissal becomes archive compatibility; no user hard deletion is introduced.
- Existing title/body columns become privacy-safe generic external previews. Authenticated in-app presentation is localized from the safe notification type.

## 4. Unified notification center

One chronological center serves both customer and worker modes. It supports inbox and archived history, unread/read, mark one/all read, owner-only archive, category filtering, grouped counts, pagination, pull-to-refresh, loading/empty/error/retry states, foreground banners, reconnect/foreground reconciliation, and localized timestamps.

Rows expose a product label, useful authenticated detail, priority, non-color unread state, group count when applicable, one primary action only when current access is valid, and an archive action when policy permits. Users never see internal event identifiers or technical type names.

## 5. Categories, priorities, and audiences

The locked categories are Marketplace, Bookings, Messages, Payments, Worker Account, Reviews, Disputes, Security, and System.

Priorities are Critical, Action Required, Important, and Informational. Priority is server-derived and cannot override access or privacy. Critical language remains factual and non-alarming.

Every notification is scoped to Customer, Worker, or All audience. An account with both roles sees the appropriate customer/worker subset after a mode switch; Security and System remain available in both modes.

## 6. Event coverage and silence rules

Existing WPS producers are normalized for:

- marketplace quote invitations/receipts/revisions, selection confirmation, request edits/cancellation/expiry, award elsewhere, invitation expiry, Emergency, Rescue, replacement, and no-provider outcomes;
- participant messages or attachments, conversation locking where authoritative, and abuse-report receipt;
- booking confirmation, travel, arrival, start, pause/resume, approval, additional work, inspection, completion, return visits, cancellation, and no-show;
- payment requirement/success/failure, refund state, earnings state, withdrawals, cash confirmation, and threshold warning;
- identity/certificate verification and worker discoverability changes;
- review availability/submission/reply/report receipt/moderation and dispute publication holds;
- dispute opening, evidence/response requests, evidence submission, staff review, resolution, withdrawal, and closure; and
- supported password, email, and phone changes.

No notification is invented for unsupported suspicious-session telemetry, nonexistent account-deactivation workflows, staff-private notes, helpful votes, typing, read receipts, candidate scoring, private moderation processing, background queue churn, or successful no-op retries.

## 7. Grouping and deduplication

Each trusted source uses a stable source key, recipient, type, and dedupe key. Retried source actions create no duplicate durable record.

Unread participant messages or attachments group per recipient and booking conversation. Quote arrivals group per recipient and marketplace request after the first row. A grouped row retains immutable source relationships, increments deterministically, and uses the latest authoritative event time. Unrelated bookings or requests never group.

Legacy booking milestones managed by WPS-012 suppress their duplicate coarse notification while preserving WPS-004 history. The fine-grained WPS-012 source remains user-facing.

## 8. Read, archive, and counts

Read state is owner-specific and server-authoritative. Opening a valid target may mark its notification read. Mark all affects only the current account and audience mode.

Archive preserves the row and source history. The compatibility dismiss RPC invokes archive. Users cannot hard-delete notifications or edit source, type, recipient, priority, route, or payload. An unresolved required action cannot be archived until the authoritative target state shows it is no longer open.

Server counts include global unread notification rows, grouped notification counts by category, and the existing conversation watermark-derived chat unread total. Grouped message notifications and chat messages are reported separately and never summed into a misleading combined message count.

## 9. Preferences and quiet hours

Preferences are owner-only and grouped by the nine product categories. Customer and worker UI shows only relevant simple groups. Non-critical informational/important in-app categories may be disabled. Critical, security, financial, dispute, cancellation, and required-action in-app notices bypass opt-out.

Push is displayed as prepared but unavailable and defaults off. Email/SMS delivery is not activated by WPS-014.

Optional quiet hours store an IANA user-local timezone plus start/end local times, including windows that cross midnight. They affect only future non-critical push delivery. In-app rows are created immediately. Critical and configured required-action events may bypass quiet hours. No UI claims delayed push delivery works while the provider and scheduler are disabled.

## 10. Push and reminders

The provider-neutral push boundary is disabled by default and fails closed. No Expo Push, FCM, APNs, OneSignal, credential, real token delivery, background handler, or provider request is enabled. Token registration is owner-bound and rejected while registration is disabled; revocation remains safe. Delivery attempts and token secrets are private.

Reminder policies cover confirmation, approaching work, inspection, payment, review opportunity, dispute deadlines, verification correction, and incomplete profiles. Each policy is conservative, state-checked, deduplicated, frequency-bounded, and suppressed after completion/cancellation/resolution. Trusted jobs may be recorded, but production processing remains disabled until an approved scheduler exists. Mock may simulate policy decisions locally and labels them as simulation.

## 11. Privacy-safe content

External previews are generic by category and never contain message bodies, attachment names, address, phone, email, identity/certificate details, payment credentials, financial internals, dispute evidence, staff notes, private rejection reasons, competitor data, or exact amounts.

Stored route payloads contain only allowlisted routing/source identifiers. Authenticated in-app copy may explain the safe event type after owner and target authorization. Staff-private dispute notes, competitor quotes, identity documents, certificate documents, raw financial details, and moderation reasons never enter notification rows or Realtime payloads.

## 12. Safe routing

Actions use an allowlisted route type and validated resource identifier. Arbitrary URLs are prohibited. Opening calls a guarded server resolver that rechecks notification ownership, authentication, current customer/worker mode, and access to the booking, conversation, marketplace request/quote, provider profile, financial screen, verification, review, dispute, or preferences target.

Stale or inaccessible targets produce a safe localized fallback without revealing whether another account owns the resource. No booking, financial, or dispute mutation occurs directly from a notification. Repeated taps are single-flight.

## 13. Realtime and lifecycle

The centralized WPS-005 service subscribes to owner-filtered notification invalidations. Payloads are IDs only; the repository reload is authoritative. Burst changes coalesce. Login, reconnect, app foreground, account switch, logout, and customer/worker mode switch clear old state and reconcile counts/inbox. Every subscription is removed on cleanup.

The implemented lifecycle is Created → Available In-App → Read → Archived. Push Pending/Delivered/Failed remain private future states and are not claimed while push is disabled. Clients never set delivery success.

## 14. Security and access

Clients cannot insert durable notifications or update their recipient, type, priority, source, group, route, copy, or delivery fields. Owner mutations use authenticated guarded RPCs. Direct preference writes are revoked. Templates, configuration, source-link internals, delivery attempts, token secrets, reminder jobs, and operational metrics are private.

Security-definer functions use an empty `search_path`, fully qualify references, derive `auth.uid()`, bound input, lock race-sensitive rows, deny PUBLIC/anon, and grant authenticated execution only where ownership is rechecked. A notification source ID grants no target access.

## 15. Mock, localization, accessibility, and brand

Mock implements account/mode isolation, categories, priorities, safe payloads, grouping, source dedupe, read/all-read, archive, counts, preferences, cross-midnight quiet-hour policy, disabled push, typed routes, stale/unauthorized fallbacks, reminder simulation, and reconnect-style invalidation. It makes no Supabase call and receives no Supabase fallback.

English and natural Egyptian Arabic cover every category, priority, event template, action, preference, quiet-hour state, disabled push explanation, fallback, reminder, and loading/empty/error state. Layout, icons, actions, and timestamps support RTL.

Rows, unread/group state, badges, actions, archive/read controls, time controls, loading/error/empty states, and grouped notifications expose screen-reader semantics, non-color state, dynamic type, 44-point targets, small-screen wrapping, reduced-motion behavior, and RTL-aware focus order.

The only active motto remains `YOUR WORK, OUR MISSION` and `شغلك مهمتنا`. Constitution mission prose is not an active motto.

## 16. Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-014-001 | `public.notifications` remains the single durable inbox and existing WPS domain authorities are not duplicated. |
| AC-014-002 | Durable rows are created only by trusted server transactions/functions; clients cannot forge notification authority. |
| AC-014-003 | One unified customer/worker center supports chronological inbox and archived history. |
| AC-014-004 | Categories, priorities, audiences, action requirements, and generic previews are server-derived. |
| AC-014-005 | Stable source/dedupe keys make retries idempotent. |
| AC-014-006 | Message/attachment rows group by booking and quote arrivals group by request without combining unrelated work. |
| AC-014-007 | WPS-012-owned milestones do not also emit a duplicate coarse booking notification. |
| AC-014-008 | Read, mark-all, and archive are owner- and mode-scoped and never delete history. |
| AC-014-009 | Unresolved required actions cannot be archived merely because they were read. |
| AC-014-010 | Global, message, and category unread counts reconcile from server state after changes/reconnect. |
| AC-014-011 | Logout, account switch, and mode switch clear prior visible rows/counts/subscriptions before reload. |
| AC-014-012 | Preferences are simple and owner-only; mandatory in-app notices cannot be silenced. |
| AC-014-013 | Cross-midnight quiet hours validate in the user's IANA timezone and affect push policy only. |
| AC-014-014 | Push/provider registration/delivery remain disabled and fail closed with no external request. |
| AC-014-015 | Stored/external preview content contains no prohibited sensitive fields. |
| AC-014-016 | Routing is typed, allowlisted, authenticated, mode-safe, and target-authorized; stale/inaccessible targets fail safely. |
| AC-014-017 | Realtime only invalidates and reloads; it never creates a client durable row. |
| AC-014-018 | Reminder policy is idempotent, bounded, state-checked, and production processing stays disabled. |
| AC-014-019 | Staff-private notes, competitor quotes, private certificates/identity, and financial internals never leak. |
| AC-014-020 | Mock and Supabase contracts remain isolated and behaviorally equivalent for implemented capability. |
| AC-014-021 | English, Egyptian Arabic, RTL, accessibility source checks, and exact motto regressions pass. |
| AC-014-022 | All existing tests and platform exports remain green without hosted migration/provider activation. |

## 17. Deferred and prohibited behavior

Production push providers, token activation, background notification handlers, scheduler execution, marketing campaigns, behavioral profiling, attribution, hard deletion, arbitrary deep links, rich lock-screen private content, SMS, email delivery, telephony, webhooks, live payments/payouts, and manipulative engagement remain deferred or prohibited.

## 18. Acceptance boundary

WPS-014 remains local-only until clean reset, full pgTAP, all regressions, TypeScript, ESLint, mojibake, Expo Doctor, Android/iOS/web exports, motto/security/privacy/accessibility audits, linked migration comparison, non-mutating hosted dry-run, and manual evidence are reviewed. Manual cases begin **NOT RUN**. No hosted migration, deployment, push, SMS, telephony, payment, payout, webhook, scheduler, or irreversible operation is authorized.
