# WES-009 — Communication & Collaboration Engineering Specification

## 1. Metadata and authority

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **IMPLEMENTED LOCALLY — PRODUCTION PROVIDERS AND MANUAL ACCEPTANCE GATED** |
| Implements | WPS-009 |
| Forward migration | `202608010003_wps009_communication_collaboration.sql` |
| Repository audit date | 2026-08-01 |

The Constitution overrides WPS-009; WPS-009 overrides this WES; this WES overrides implementation convenience. No hosted migration or live external communication provider is authorized by this document.

## 2. Existing-system audit

| Area | Audited baseline | WPS-009 disposition |
| --- | --- | --- |
| Booking chat | `conversations`, `conversation_members`, `messages`, `message_attachments`, `conversation_typing`; guarded send/read/typing RPCs | Reused and extended, never rebuilt. |
| Lifecycle | `private.is_booking_chat_writable`; cancellation lock and completion history window in `202607310001` | Confirmation activation added; exact cancellation/48-hour behavior retained. |
| Disputes | Existing rule is writable inside a recorded completion window and otherwise closed | Preserved and documented because WPS-004/009 do not authorize an open-ended disputed chat. |
| Attachments | Private bucket, image-only 8 MB upload, signed reads, sender delete | Tightened to JPG/PNG/HEIC/PDF, safe metadata, orphan-only delete. |
| System messages | Booking trigger writes `system` metadata from status | Future status rows use `status`; legacy `system` rows remain readable. |
| Running Late | Guarded WPS-008 event and durable notification | Adds server-created chat event; no client ETA authority. |
| Notifications | Owner RLS, read/dismiss RPCs, dedupe column/index, centralized Realtime | Message transaction now uses deterministic dedupe and booking-only payload. |
| Realtime | `src/realtime/realtime-service.ts`; payload is invalidation then reload | Reused; inbox adds filtered member/notification invalidations. |
| Chat tab | Placeholder empty state | Replaced with confirmed-booking conversation inbox. |
| Mock | SQLite KV message list, unscoped by account, local invalidations | Versioned account namespace and server-behavior parity added. |
| Telephony | No relay provider or masked-call infrastructure | Explicit provider-neutral disabled boundary; no numbers/dialer. |
| Reports | General legacy reporting tables, no booking communication contract | New immutable booking-scoped staff-only record and RPC. |
| Brand motto | Web manifest used Constitution mission text; current renderer omitted the approved motto | Corrected to exact approved EN/AR motto; historical evidence remains unchanged. |

Expo SDK 54 versioned DocumentPicker, FileSystem, and ImagePicker documentation was reviewed before adding the PDF path. `expo-document-picker` is pinned to the SDK-compatible `~14.0.8`; `copyToCacheDirectory: true` permits immediate `File` access.

## 3. Domain model

### 3.1 Reused rows

- One `conversations` row per non-null booking.
- Two `conversation_members` rows: booking customer and assigned worker auth profile.
- Immutable participant/system `messages` rows.
- Zero or one launch attachment per participant message.
- Ephemeral `conversation_typing` row per booking/user.
- Owner-only `notifications` rows.

### 3.2 Extended message types

| Type | Creator | Authoritative payload |
| --- | --- | --- |
| `text` | Participant RPC | Trimmed body |
| `image` | Participant RPC | Verified private object and attachment metadata |
| `file` | Participant RPC | Verified private PDF object and safe display name |
| `quick_reply` | Participant RPC | Bounded `quick_reply_key` metadata |
| `system` | Trusted transaction | Reminder/legacy event metadata |
| `status` | Booking status trigger | `booking_<status>` event |
| `running_late` | Running Late trigger | Trusted delay/reason/source event metadata |

`sender_id` is null for trusted system/status/Running Late rows. Direct authenticated insert/update/delete remains revoked.

### 3.3 New safety record

`public.booking_abuse_reports` stores booking, reporter, accused party, optional booking message, category, optional bounded details, idempotency key, and creation time. The RPC derives both parties; the table has a staff-only SELECT policy and a trigger rejecting every UPDATE/DELETE.

### 3.4 Private configuration

`private.communication_configuration` is a singleton with policy version, call-relay mode/provider, message/report retention values, policy status, and audit fields. Defaults are:

- call relay: `disabled`;
- provider: null;
- retention values: null;
- retention status: `policy_pending`.

No normal client grant exists.

## 4. Lifecycle functions

### `private.booking_chat_is_activated(uuid)`

Returns true when the current booking status or immutable history demonstrates `confirmed` or a later operational state. Pending and accepted alone return false. A later cancelled status preserves historical activation through history.

### `private.is_booking_chat_writable(uuid,timestamptz)`

Requires participant membership and activation, then applies in order:

1. cancelled → false;
2. first completed history exists → `at < completed_at + 48 hours`;
3. completed/disputed/refunded without completion evidence → false;
4. otherwise active → true.

The helper is repeated at Storage insert, participant send, and typing writes. Client lifecycle code duplicates only presentation behavior; SQL remains authoritative.

## 5. Mutation RPCs

### `send_booking_message_v2`

Signature: `(booking_id, message_type, body, attachment_path, attachment_mime_type, attachment_file_name, client_id) → message_id`.

The transaction:

1. resolves `auth.uid()` and both booking participants;
2. takes a booking/client advisory transaction lock;
3. returns an existing same-sender idempotent result or rejects a cross-sender client-ID collision;
4. checks authoritative lifecycle;
5. validates participant-created type and bounded payload;
6. validates owned private Storage object, MIME, size, path, and safe display name;
7. creates/reuses conversation and participant rows;
8. inserts message and attachment metadata;
9. optionally inserts a trusted neutral reminder without rewriting the participant message; and
10. inserts one generic durable notification using `booking-message:<message_id>` dedupe.

The original six-argument `send_booking_message` remains a compatibility wrapper. It cannot bypass v2 validation.

### `mark_booking_messages_read`

Advances only the caller's `conversation_members.last_read_at`. Historic message-level read values remain untouched; new reads do not require exact seen state.

### `set_booking_typing`

Reuses the existing eight-second upsert/delete contract and now requires activation/writability. Cancellation trigger removes rows immediately.

### `report_booking_communication_abuse`

Validates membership, activation, category, optional message ownership, details, and idempotency. Reporter is `auth.uid()`; accused is the other participant. No account/financial/marketplace mutation occurs.

### `request_booking_call_relay`

Accepts only booking and client idempotency identifiers. It resolves membership and reads private mode. Disabled or absent provider raises SQLSTATE `55000`. The provider branch also fails closed because no adapter is deployed. The contract contains no phone-number argument or response.

## 6. Read RPCs

### `get_my_booking_conversations()`

Returns at most 100 activated participant bookings with:

- booking ID, service, status;
- derived counterpart display name;
- last message time/type, not body;
- aggregate unread count after member watermark;
- writable state and optional completion deadline.

It exposes no message text, attachment URL, phone, exact address, marketplace score, safety report, or candidate data.

### `get_booking_communication_capabilities(uuid)`

Returns activated/writable/deadline, disabled relay state/reason, and safety-report availability after participant authorization. It returns no provider configuration or phone number.

Ordinary conversation reads continue through participant RLS. Attachment hydration creates one-hour signed URLs only after metadata SELECT succeeds under participant policy.

## 7. Attachment/storage engineering

- Bucket is private, 8 MB, with allowed MIME allow-list.
- Object path regex is `<booking UUID>/<uploader UUID>/<generated safe filename>`.
- Storage INSERT policy requires uploader path identity, participant membership, active writable lifecycle, MIME, and size.
- RPC independently validates object owner, MIME, size, path, and message kind.
- `message_attachments.file_name` is optional for images and required/sanitized for PDF.
- `byte_size` is bounded by constraint.
- Participant Storage DELETE is limited to owned objects created within one hour that have no attachment metadata reference.
- Sent object/metadata hard deletion is not granted.
- The client deletes an upload orphan only after a definite server rejection; an ambiguous network failure never risks deleting a committed object. A sent idempotent retry returns the existing message and removes only the new unused retry upload.

## 8. System events and abuse reminder

`private.record_booking_chat_system_message` skips unactivated booking states. At confirmation and later transitions it writes a trusted `status` row. The existing trigger name is retained so only one trigger fires.

`private.record_running_late_chat_message` follows a successful insert into `marketplace_running_late_events`; the guarded WPS-008 RPC remains the only participant path to that event. The message is informational and does not independently change ETA.

`private.chat_has_off_platform_pattern` recognizes a conservative Egyptian phone/WhatsApp pattern. A match creates a neutral `system/off_platform_reminder` row keyed to the source message ID. It stores no extracted phone or abuse score and triggers no automatic enforcement.

## 9. RLS, grants, Realtime, and staff purpose limitation

| Object | Customer | Assigned worker | Other account | Staff |
| --- | --- | --- | --- | --- |
| Conversation/message | Own booking read; guarded write | Own booking read; guarded write | None | None by report role alone |
| Attachment metadata/object | Own booking signed read; guarded upload | Own booking signed read; guarded upload | None | No WPS-009 broad read |
| Typing | Own booking ephemeral read/write RPC | Own booking ephemeral read/write RPC | None | None |
| Safety report | Submit RPC; no read | Submit RPC; no read | None | Staff-only SELECT |
| Private configuration | None | None | None | Trusted SQL only |

Safety reports are deliberately absent from Realtime. `conversation_members` is added to Realtime for user-filtered inbox invalidation. The central client subscribes to `conversation_members user_id=eq.<uid>` and owner-filtered notifications; conversation detail remains booking-filtered. Payloads select only IDs, then repositories reload authoritative state. Candidate, location, configuration, report, and content tables are not newly published.

## 10. Client and Mock implementation

### Inbox

`app/(tabs)/chat.tsx` reconciles customer bookings and worker jobs, clears on account scope change, loads the authoritative inbox RPC, and subscribes only through `realtime-service.ts`. Cards expose context, service, status, last activity class/time, unread badge, and route to the existing booking conversation.

### Conversation

The existing screen adds:

- bounded localized quick-reply chips;
- JPG/PNG/HEIC image picker and PDF DocumentPicker;
- upload state and failed-draft retry;
- private image preview and signed PDF browser view;
- status/Running Late/reminder system chips;
- disabled secure-call explanation with no dialer code;
- accessible booking-scoped safety report sheet;
- no exact “seen” label requirement.

Booking and worker detail links render only after `isBookingChatActivated`.

### Mock parity

Mock message keys include account ID and booking ID. Lifecycle, quick replies, reminder insertion, disabled relay capabilities, reports, inbox, unread shape, and local invalidations follow the same interface. Mock imports no Supabase repository and Supabase failures never fall back.

## 11. Notifications

Message notification title/body are generic and localized by client type. Authoritative data is `{booking_id}` only. Dedupe is `(recipient,type,booking-message:<message_id>)`. Message content, quick key, attachment name/path/URL, phone, address, report, and trust data are absent.

Production push is not configured. WPS-009 validates durable in-app notification creation only and does not add an Edge Function, token table, provider credentials, or push dispatch.

## 12. Brand and motto regression boundary

Current active sources use only `YOUR WORK, OUR MISSION` and `شغلك مهمتنا`. The splash generator, generated splash, manifest, HTML metadata, translation catalog, brand system, brand decision, WPS-009, WES-009, and static tests are aligned. Static regression scope targets active sources, not the Constitution or historical/manual evidence that must preserve what was observed at the time.

## 13. Retention

No retention duration was authorized. Null durations plus `policy_pending` prevent implementation from inventing a cleanup schedule. No message/report deletion job, trigger, Edge Function, or Storage sweeper is activated. A future policy needs product/privacy/legal approval, participant evidence rules, a forward migration, operational runbook, and tests.

## 14. Testing

### TypeScript/static

`scripts/wps009-communication.test.mts` covers activation and exact boundaries, disputed behavior, off-platform matching, safe filenames, bounded keys/categories, disabled relay, migration/RPC presence, notification payload constraints, SDK 54 DocumentPicker use, no dialer, exact approved motto, and Constitution-only mission allowance.

Existing `wps008-alignment`, device P1, brand, provider-card, worker-auth, profile-phone, marketplace, payments, WPS-007 smoke, lint, typecheck, and mojibake suites remain required.

### pgTAP

`communication-collaboration.test.sql` covers 80 catalog, lifecycle, idempotency, notification, unread, typing, attachment, call-relay, report, staff-purpose, cross-account, Rescue isolation, dispute, retention, and deletion assertions. Existing `chat.test.sql` now uses a confirmed fixture for participant send while preserving the pending ownerless denial case.

### Manual

All manual cases in the WPS-009 manual-alpha and results records remain **NOT RUN**. Local automated evidence is recorded separately and is not substituted for native usability, RTL, accessibility, upload, reconnect, or cache review.

## 15. Deployment and failure gates

- Hosted migration: not applied.
- Live telephony/dialer: disabled.
- Live push: disabled/unconfigured.
- Live SMS/payment/payout/webhook/scheduler behavior: unchanged and not enabled.
- Retention scheduler: absent.
- Call provider credentials/numbers: absent.
- Manual device acceptance: NOT RUN.

The clean local reset, 12 pgTAP suites / 765 assertions, custom tests, typecheck, zero-warning client lint, mojibake scan, Expo Doctor 18/18, and separate cache-cleared Android/iOS/web exports pass. The local migration ledger aligns through `202608010003`. Linked migration-list and `supabase db push --dry-run` attempts were blocked before login-role initialization by a Supabase `TransportError`; no hosted statement ran. Only a separately authorized `supabase db push`, after a successful fresh linked comparison and manual gate decision, may apply hosted migrations.

## 16. AC-009 traceability

| Acceptance area | Implementation | Verification |
| --- | --- | --- |
| AC-009-001–009 lifecycle/isolation | activation/writable helpers, hidden preconfirmation links, booking-scoped participant RLS | TypeScript boundary tests and pgTAP lifecycle/cross-account/Rescue cases |
| AC-009-010–016 messages/system/reminder | v2 RPC, bounded keys, trusted triggers, reminder helper | pgTAP forge/idempotency/preservation and static migration tests |
| AC-009-017–022 attachments | bucket allow-list, Storage policies, metadata columns, orphan cleanup, DocumentPicker/File | Catalog/RLS tests, typecheck/export, manual cases pending |
| AC-009-023–029 inbox/unread/typing/notifications/realtime | inbox/read RPCs, centralized filtered subscriptions, safe dedupe payload | pgTAP unread/notification/typing and client static checks |
| AC-009-030–031 call privacy | private disabled config, capability/request RPC, disabled adapter/UI | pgTAP `55000`, static no-dialer test, manual state pending |
| AC-009-032–038 reports/deletion/retention | derived-party report RPC, immutable table, staff RLS, pending config | pgTAP staff-purpose/immutability/no-auto-action/catalog tests |
| AC-009-039–041 mode/localization/accessibility | account-scoped Mock, EN/AR copy, RTL/accessibility state | Typecheck/static; native manual cases pending |
| AC-009-042–043 motto | translations, renderer, manifest, HTML, brand docs | brand and WPS-009 static regression tests |
| AC-009-044–045 activation/deployment safety | disabled provider/config and forward-only migration | local validation plus hosted dry-run only |

## 17. Changelog

- 2026-08-01 — Version 1.0. Recorded the audited as-built extension, forward schema/RPC/RLS changes, Expo/Mock/realtime client work, exact motto correction, automated evidence, and fail-closed deployment state.
