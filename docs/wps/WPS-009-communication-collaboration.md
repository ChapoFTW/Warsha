# WPS-009 — Communication & Collaboration

## 1. Metadata and authority

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **LOCKED — IMPLEMENTED LOCALLY, MANUAL ACCEPTANCE PENDING** |
| Depends on | Constitution and WPS-001 through WPS-008 |
| Engineering specification | `docs/wes/WES-009-communication-collaboration.md` |

Authority order is the Warsha Constitution, WPS-009, WES-009, then implementation. WPS-009 extends the existing secure booking conversation; it does not create preselection direct messaging or replace booking, marketplace, financial, trust, authentication, review, notification, localization, or data-mode behavior.

## 2. Purpose

Warsha participants need a simple, private way to coordinate an agreed job while the booking remains the authoritative relationship. Communication supports job completion and evidence; it must not expose phone numbers, bypass price approval, enable off-platform payment, create employment controls, or become a general social inbox.

The active brand motto is only:

- English: `YOUR WORK, OUR MISSION`
- Arabic: `شغلك مهمتنا`

The Constitution may retain “Warsha finishes your work safely, for the fairest price” as mission language. It is not an active UI motto.

## 3. Scope

WPS-009 covers:

- a conversation inbox for confirmed bookings;
- booking-scoped text, image, PDF, quick-reply, status, Running Late, and system messages;
- private attachments and safe signed access;
- lifecycle write locks and historical reads;
- aggregate unread state and ephemeral typing;
- durable in-app notifications;
- a provider-neutral, disabled-by-default call-relay boundary;
- booking-scoped communication safety reports;
- a neutral off-platform coordination reminder;
- Rescue Mode conversation isolation;
- Mock/Supabase parity, English, Egyptian Arabic, RTL, accessibility, and testing.

Voice notes, video, live location, disappearing messages, user edits, user hard deletion, production push, production telephony, contact discovery, and general pre-booking messaging are deferred.

## 4. Conversation availability and lifecycle

1. Quote/request participants cannot message each other before selection and worker confirmation.
2. Marketplace confirmation creates a confirmed booking and activates its conversation.
3. The legacy direct-booking compatibility path activates chat only at confirmed status, not merely on request creation or acceptance.
4. Only the booking customer and assigned worker may read or write.
5. Cancellation makes the conversation immediately read-only. Historical participant reads remain available.
6. A completed booking remains writable for exactly 48 hours from the first authoritative completed status-history event. At the boundary it becomes read-only.
7. Missing completion evidence fails closed.
8. Current disputed behavior is preserved because no higher authority defines a new disputed window: a dispute with recorded completion uses the same 48-hour completion window; a dispute without completion evidence is read-only. This is an explicit retained ambiguity, not an open-ended dispute chat.
9. Refunded post-completion conversations follow the recorded completion boundary and otherwise fail closed.
10. A cancelled original booking and its Rescue replacement are different conversations. The original worker retains only the original read-only history and gains no replacement access.

## 5. Message contract

### Participant-created

- Text is trimmed, 1–2,000 characters, idempotent, and preserved verbatim after validation.
- Images are JPG, PNG, or HEIC where the device supports selection and rendering.
- Files are PDF only at launch.
- Quick replies use a bounded key set and render in the viewer's current language.
- Participant identity is always derived from the authenticated session and booking.

### Server-created

- Booking status messages are created from authoritative booking transitions.
- Running Late messages are created from the guarded WPS-008 Running Late event.
- Off-platform reminders are created by the trusted message transaction when a likely phone/WhatsApp pattern is present.
- Clients cannot create `system`, `status`, or `running_late` messages or insert message rows directly.

The launch quick replies are: on my way, arrived, need access, confirm address, about ten minutes late, and thank you. The quick “late” reply is coordination copy only; only the WPS-008 Running Late action changes the authoritative ETA.

## 6. Attachments

- The `chat-attachments` bucket remains private.
- Paths contain booking ID, authenticated uploader ID, and a generated safe filename.
- Maximum size is 8 MB.
- Allowed MIME types are `image/jpeg`, `image/png`, `image/heic`, and `application/pdf`.
- Original display names are stripped of path/control characters and bounded to 120 characters.
- Attachment metadata is created only by the message RPC after verifying the owned Storage object.
- Participants receive one-hour signed URLs and cannot list unrelated paths.
- A sent attachment cannot be deleted by a participant. The uploader may remove only an unreferenced recent orphan, supporting safe retry/cleanup.
- The UI shows upload state and retains the failed draft for retry.
- No public URL is stored or placed in a notification.

## 7. Privacy and call relay

Phone numbers remain private. WPS-009 defines a provider-neutral capability and request boundary that accepts booking and idempotency identifiers, never a phone number. Configuration defaults to disabled and no production provider adapter, number, SMS, dialer, or call is enabled.

The client shows a restrained unavailable state explaining that secure calling is not configured and the phone number remains private. Mock mode uses the same fail-closed outcome; it does not fabricate or dial a number.

## 8. Safety reports and off-platform reminder

A participant may submit one idempotent, immutable, booking-scoped report using: harassment, threats, hate/discrimination, sexual content, spam/scam, off-platform pressure, privacy, unsafe behavior, or other.

- Reporter comes from `auth.uid()`.
- Accused party is derived as the other booking participant.
- An optional referenced message must belong to the booking.
- Details are optional and bounded to 1,000 characters.
- Reports are readable only by purpose-authorized support/admin staff.
- Reports are not in Realtime and do not expose chat content to staff by themselves.
- A report or reminder creates no automatic suspension, financial action, ranking penalty, or role change.

When likely contact-moving patterns occur, Warsha preserves the participant message and adds a neutral reminder to keep coordination and payment in Warsha for safety and booking protection. Pattern detection is not presented as proof of abuse.

## 9. Inbox, unread, typing, and notifications

- The Chat tab lists only participant bookings whose chat was activated.
- Each row shows worker/customer context, service, booking state, last activity class/time, and aggregate unread count.
- Opening a conversation advances the participant's conversation-level read watermark.
- Exact per-message “seen at” behavior is not required and new reads do not write exact message read timestamps.
- Typing state expires after eight seconds, is never durable history, and is cleared on cancellation, backgrounding, or screen exit.
- Every participant message creates one deduplicated durable in-app notification inside the message transaction.
- The notification contains only the booking routing identifier; it contains no message text, phone number, attachment URL, signed URL, score, address, or trust signal.
- Realtime is an invalidation hint. The repository reload is authoritative after insert, reconnect, AppState return, account switch, or mode switch.
- Production push delivery remains unconfigured and is not claimed.

## 10. Retention and deletion

Messages, attachment metadata, and safety reports are retained as booking evidence until an approved purpose-limited retention schedule exists. Configuration explicitly records `policy_pending`; no cleanup scheduler or silent deletion is introduced. Participants cannot edit or hard-delete message/report history. Future legally required deletion must preserve minimum audit integrity through a separately approved policy and migration.

## 11. Localization, RTL, accessibility, and brand

- All new controls, empty/error states, quick replies, system events, categories, attachment states, and privacy explanations have English and natural Egyptian Arabic copy.
- Logical row direction, right-aligned Arabic input, mixed-direction time/file content, and modal order support RTL.
- Controls have at least 44-point targets, role/state labels, non-color unread/selection indicators, bounded text scaling, and reduced-motion-compatible loading.
- UI uses The Current, dark surfaces, restrained borders, sentence case, no gradients, and no decorative trade imagery.
- The native splash uses the approved English motto before language is known; shared translations provide both exact approved forms.

## 12. Mode isolation and failure behavior

Mock communication data is account-namespaced and imports no Supabase fallback. Supabase failures do not load Mock data. Account/mode changes clear visible inbox and thread state before loading the new scope. Unsupported MIME, oversized file, missing Storage object, stale lifecycle, nonparticipant access, forged system type, disabled telephony, and unconfigured retention all fail closed with a safe user-visible outcome.

## 13. Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-009-001 | Preselection marketplace and pending/accepted direct bookings expose no writable direct chat. |
| AC-009-002 | Worker confirmation activates exactly one booking-scoped conversation. |
| AC-009-003 | Only the booking customer and assigned worker can read conversation history. |
| AC-009-004 | Cross-customer and cross-worker reads/writes are denied. |
| AC-009-005 | Cancellation locks text, attachment upload, quick replies, and typing immediately. |
| AC-009-006 | Completed chat is writable before, and locked exactly at, 48 hours from recorded completion. |
| AC-009-007 | Missing completion evidence fails closed. |
| AC-009-008 | Disputed behavior follows the recorded-completion rule documented in Section 4. |
| AC-009-009 | Rescue original/replacement conversations remain mutually isolated. |
| AC-009-010 | Text validation, trimming, bounds, and client-id idempotency are authoritative. |
| AC-009-011 | Quick replies are bounded, server-validated, and localized at display time. |
| AC-009-012 | Clients cannot forge system, status, Running Late, or reminder messages. |
| AC-009-013 | Booking status messages follow authoritative status changes. |
| AC-009-014 | Running Late chat state follows the guarded WPS-008 event. |
| AC-009-015 | Likely off-platform contact preserves the original message and adds one neutral reminder. |
| AC-009-016 | A reminder alone creates no punishment or financial change. |
| AC-009-017 | Attachments use a private bucket and participant-scoped paths. |
| AC-009-018 | Only JPG, PNG, HEIC, and PDF within 8 MB pass the server boundary. |
| AC-009-019 | Attachment display names are safe and bounded. |
| AC-009-020 | Sent attachment metadata/objects cannot be participant hard-deleted. |
| AC-009-021 | Signed attachment access is short-lived and participant-authorized. |
| AC-009-022 | Upload failure is visible and retryable without duplicating a sent message. |
| AC-009-023 | Chat inbox lists only activated participant bookings. |
| AC-009-024 | Aggregate unread count clears at the conversation watermark. |
| AC-009-025 | New read handling does not require exact per-message seen timestamps. |
| AC-009-026 | Typing is participant-scoped, ephemeral, bounded, and lifecycle-cleared. |
| AC-009-027 | Message notifications are server-created, durable, and deduplicated. |
| AC-009-028 | Notification payloads contain only safe routing identifiers. |
| AC-009-029 | Realtime handlers reload authoritative repository state and clean up by account/mode. |
| AC-009-030 | Call relay exposes no phone number and defaults to disabled. |
| AC-009-031 | Disabled/mock call paths invoke no dialer and create no real call. |
| AC-009-032 | Safety reports derive reporter and accused identities authoritatively. |
| AC-009-033 | Report category/message/detail validation is booking-scoped and bounded. |
| AC-009-034 | Safety reports are immutable and staff-only. |
| AC-009-035 | Staff report access does not itself grant chat-content access. |
| AC-009-036 | One report creates no automatic suspension, role, financial, or ranking action. |
| AC-009-037 | Participants cannot edit or hard-delete messages or reports. |
| AC-009-038 | Retention deletion remains disabled until an approved policy exists. |
| AC-009-039 | Mock mode is account-namespaced and never falls back across modes. |
| AC-009-040 | English, Egyptian Arabic, and RTL cover every WPS-009 state. |
| AC-009-041 | Interactive controls and unread/report states are accessible beyond color. |
| AC-009-042 | Active UI/web/splash motto is exactly approved in English/Arabic. |
| AC-009-043 | Constitution mission text is not presented as an active UI motto. |
| AC-009-044 | Live push, telephony, SMS, webhooks, and schedulers remain disabled. |
| AC-009-045 | Local migrations/tests/exports pass without applying a hosted migration. |

WPS-011 review reports are a separate post-completion moderation workflow from WPS-009 booking safety reports. Review submissions/replies may use the existing durable notification architecture, but helpful votes, reporter identity, moderation reasons, and audit history are not chat payloads or general Realtime events.

## 14. Manual acceptance status

`docs/testing/WPS-009-MANUAL-ALPHA.md`, `docs/testing/WPS-009-MANUAL-RESULTS.md`, and `docs/testing/WPS-009-ACCEPTANCE-EVIDENCE.md` are the acceptance record. Every manual case remains **NOT RUN** until a named tester records device/environment evidence.

## 15. Changelog

- 2026-08-01 — Version 1.0. Locked the confirmed-booking communication extension, lifecycle windows, private attachments, quick/system/Running Late messages, unread/typing behavior, disabled call relay, immutable safety reports, off-platform reminder, Rescue isolation, localization, exact approved motto, and acceptance criteria.
## WPS-012 operational integration

WPS-012 immutable operational events append localized, server-authenticated `status` messages to the existing booking conversation using source-event identifiers. It creates no second chat or participant message path, exposes no private notes or media paths in message metadata, and does not relax WPS-009 writability, privacy, retention, safety, or contact rules.

## WPS-013 dispute integration

WPS-013 participant responses and participant-visible case events project into this same booking conversation with immutable source-event IDs. Staff-private notes and evidence paths never project. The dispute RPC is authoritative for responses even when ordinary post-completion chat is read-only; it does not reopen general chat or expose contact data.

## WPS-014 notification integration

WPS-014 groups unread message and attachment notifications by booking conversation while leaving WPS-009 conversation watermarks as chat-unread authority. Payloads and previews omit message text and attachment filenames. Safety-report receipt is private to the reporter, and the 48-hour read-only boundary is represented by a disabled scheduler job until trusted processing exists.
