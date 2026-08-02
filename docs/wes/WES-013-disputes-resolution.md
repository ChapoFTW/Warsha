# WES-013 — Disputes & Resolution

## 1. Status and architecture

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **IMPLEMENTED LOCALLY — MANUAL AND HOSTED DEPLOYMENT GATED** |
| Product authority | `docs/wps/WPS-013-disputes-resolution.md` |

WPS-013 extends the dormant `disputes`, `dispute_evidence`, and `dispute-evidence` bucket. `bookings` remains the canonical participant/commercial record; WPS-007 remains financial authority, WPS-009 the conversation, WPS-011 the review system, and WPS-012 the operational evidence and return-visit system.

## 2. Existing-system architecture audit

| Area | Existing evidence/authority | WPS-013 treatment |
| --- | --- | --- |
| Booking | `bookings`, immutable `booking_status_history`, attachments, legacy `disputed` hook | Preserve status graph; active dispute is its own aggregate linked to booking |
| Finance | WPS-007 price snapshots, adjustments, payments, earnings holds, refunds, reviewed post-release cases | Existing release checks already query `public.disputes`; submit/terminal events synchronize hold and delegate financial outcomes to WPS-007 RPCs |
| Communication | WPS-009 booking conversation, immutable messages, source-linked system events, lifecycle locks | Reuse same conversation; guarded dispute responses may append after ordinary follow-up expiry; internal notes never append |
| Operations | WPS-012 events, progress media, additional work, checklists, warranty, return sections | Count/reference automatically; return/warranty resolution inserts into existing return-visit model |
| Reviews | WPS-011 unique booking review, reply, reports, moderation, reputation | Temporary public hold during active submitted dispute; no score/reputation mutation |
| No-show | WPS-008 worker/customer no-show evidence and Rescue hooks | Referenced evidence; no duplicate no-show record or Rescue action |
| Verification/profile | Existing owner/staff verification and sanitized public provider projection | Read-only authorized context; no automatic status/profile change |
| Storage | Private buckets, owned scoped paths, signed URLs, staged-object cleanup | Harden existing private dispute bucket and register evidence server-side |
| Reports | WPS-009 chat safety reports and WPS-011 review reports | Remain separate; no copy, conversion, or automatic decision |
| Dormant dispute hooks | Minimal `disputes`/`dispute_evidence`, opener-only RLS, no participant RPC | Forward extension, strict graph, participant/staff RLS, immutable events and client repository |

## 3. Forward schema

Migration `202608020001_wps013_disputes_resolution.sql` alters the existing dispute tables with policy version, timestamps, resolution/delegation references, evidence metadata, content hash, safe name, MIME, size, and retry keys. It adds `dispute_events` and private `dispute_policy_config`, partial unique indexes for one active dispute and evidence deduplication, immutable triggers, indexes, RLS, grants, functions, and Storage policies.

Existing rows are normalized forward to bounded legacy-compatible values. No prior migration or row is deleted. Private configuration is not client-readable.

## 4. Eligibility and lifecycle engineering

`private.dispute_actor` derives customer, worker, or staff from Auth and the booking/provider relationship. `private.dispute_eligible_until` applies active-state, 14-day completion, warranty-grace, and worker-no-show rules using authoritative history and WPS-012 warranty dates. The create RPC is customer-only; legacy worker-created disputed booking history remains compatible but is not expanded into an unguarded client path.

`private.dispute_can_transition` is the database graph. Mutations lock the dispute and booking, validate actor/state/input/idempotency, update the aggregate, and append through `private.append_dispute_event`. Direct table writes are revoked. Draft is private operational preparation; submission activates finance/review/notification effects.

## 5. Evidence and projection engineering

`get_booking_dispute` returns only participant-visible events to participants, includes staff-only events only for staff, and exposes registered evidence references plus safe automatic-evidence counts. Signed URLs are hydrated in the repository and raw paths remain outside UI domain state except transient owner retry state.

Registration validates the actual `storage.objects` row, `owner_id`, MIME, size, path, booking, dispute, count, hash, safe display name, and caller participation. Registered evidence is immutable; a storage DELETE policy applies only when no evidence row references the object.

## 6. Conversation and notification engineering

An after-event trigger ensures the existing booking conversation and participant membership. Participant-visible state events create one localized `status` message keyed by source event. Participant response events create one booking-scoped text message with the event as immutable source. Staff-only notes produce no conversation row.

The same trigger inserts recipient-owned notifications for the required events with `dispute:<event-id>:<recipient>` dedupe keys. Data contains only booking/dispute/event IDs. Realtime remains an invalidation hint and reloads the guarded projection.

## 7. Review-publication engineering

`reviews.dispute_publication_hold_id` is not granted publicly. Submission sets a visible review to the existing non-public `flagged` moderation state and records the hold. A review inserted while the hold is active receives the same state. WPS-011 public policies, summaries, voting, reports, replies, and attachment access already require Visible, so the review immediately leaves all public aggregates.

Terminal dispute state clears the hold and restores only a still-flagged review; an independently hidden review stays hidden. WPS-011 moderation Restore resolves to Flagged while an active dispute hold remains. Participant review RPC access and the unique booking link are unchanged.

## 8. Financial and return-visit delegation

Submission moves unreleased WPS-007 earnings to `held_for_dispute`. Terminal state invokes `private.release_provider_earning`, which re-checks completion, confirmation/time, other active disputes, debts, and existing financial idempotency.

Partial compensation calls `process_financial_refund` for unreleased earnings or `create_post_release_financial_case` for released earnings. The returned ID is stored as an opaque reference. WPS-013 does not calculate ledger allocation. Return Visit/Warranty Work resolution inserts one requested row in `booking_return_visits`, increments the existing operation section, and appends through the WPS-012 event helper.

## 9. RLS and data matrix

| Data | Customer | Booked worker | Staff | Public/other |
| --- | --- | --- | --- | --- |
| Dispute aggregate | Own booking | Assigned booking after draft | Authorized all-case read | None |
| Participant events | Read | Read | Read | None |
| Internal notes | None | None | Read | None |
| Evidence metadata/object | Signed read/upload | Signed read/upload | Signed read | None |
| Existing booking/operation/chat evidence | Existing participant rules | Existing participant rules | Existing staff rules | Existing sanitized rules only |
| Financial reference | Safe outcome state only | Safe outcome state only | Existing financial authority | None |
| Review hold | Own booking review remains readable | Own provider booking review remains readable | Authorized read | Review absent while held |

## 10. Client and Mock implementation

`src/disputes` defines types, copy, Supabase and Mock repositories, safe image/PDF upload, projection mapping, and static data-mode selection. `DisputePanel` mounts in customer booking and worker job detail, subscribes to booking-scoped dispute invalidations, renders evidence sources and immutable timeline, and exposes actions allowed by the server-returned viewer role/state.

Mock persists account-scoped disputes, events, and evidence, emits table-shaped invalidations, uses existing Mock notification/message/return-visit boundaries, models review publication holds without overriding staff moderation, projects participant-visible events into both participants' existing Mock booking conversation, and never calls or receives fallback from Supabase.

## 11. Localization and accessibility

English and Egyptian Arabic cover all ten reasons, ten states, participant/staff actions, evidence types, outcome types, finance/return explanations, privacy, errors, and empty/loading/retry states. Text inputs align by locale; rows and action groups reverse/wrap for RTL.

Buttons, radio choices, evidence links/images, timelines, status, selected/disabled/busy state, and errors expose semantic labels. Touch targets are at least 44 points and status never relies on color alone.

## 12. Testing and operations

Dedicated pgTAP covers schema, migration normalization, eligibility windows, one active dispute, roles, transitions, immutability, internal-note isolation, evidence ownership/MIME/size/hash, notification dedupe, conversation integration, financial hold/delegation, review publication hold, WPS-012 return visits, RLS, and public isolation.

Dedicated TypeScript regression covers repository mode isolation, Mock parity, UI wiring, localization, RTL, accessibility, brand, and migration contracts. Clean reset, 16 pgTAP files / 1,123 assertions, 13 regression suites including 182 WPS-013 contracts, TypeScript, lint, mojibake, `git diff --check`, Expo Doctor 18/18, and cache-cleared Android/iOS/web exports pass. Linked list and non-mutating dry-run were attempted but failed before login-role initialization with a Supabase transport error; nothing was applied. Manual files remain **NOT RUN**. Never run a hosted push in this work item.
