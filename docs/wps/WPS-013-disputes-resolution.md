# WPS-013 — Disputes & Resolution

## 1. Metadata and authority

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **LOCKED FOR LOCAL IMPLEMENTATION — MANUAL AND HOSTED ACCEPTANCE PENDING** |
| Depends on | Constitution and WPS-001 through WPS-012 |
| Engineering specification | `docs/wes/WES-013-disputes-resolution.md` |

Authority order is the Warsha Constitution, WPS-013, WES-013, then implementation. WPS-013 activates and extends the existing booking-linked dispute foundation. It does not create another booking, financial ledger, conversation, review, verification, profile, operational timeline, ranking input, or public evidence model.

## 2. Purpose and product contract

Disputes are an exceptional, evidence-based path for resolving incomplete work, poor quality, property damage, incorrect additional work, pricing disagreement, warranty disagreement, worker no-show, customer unavailability, safety issues, or another clearly described problem. The process protects both parties, records every consequential action, explains what is waiting and why, and never treats one allegation as proof or automatic punishment.

The canonical booking remains the participant and commercial relationship. WPS-012 evidence is reused automatically. WPS-007 alone controls holds, refunds, credits, adjustments, compensation, releases, and ledger entries. WPS-011 alone controls reviews and reputation. No AI summary, automatic fault decision, ranking change, identity change, or public accusation is permitted.

## 3. Eligibility and opening windows

Eligibility is server-authoritative. The booking must exist, be undeleted, belong to the authenticated customer, be in an eligible agreed/work/completed/no-show state, not already have an active dispute, and not already have a final unresolved legacy outcome. Draft creation does not affect review publication or financial release until submission.

The initial policy is versioned `wps013-v1`:

- active confirmed/work states remain eligible while the booking is active;
- completed bookings remain eligible for 14 days after first authoritative completion;
- a recorded WPS-012 warranty extends warranty-disagreement eligibility through warranty end plus 72 hours;
- worker-no-show cancellation remains eligible for 48 hours after its terminal status event;
- deleted/archived, rejected, ordinary cancelled, refunded, and expired-window bookings are ineligible.

The private configuration stores these windows and evidence limits. A change requires an approved forward product decision and migration. Only one dispute in Draft, Submitted, Waiting Customer, Waiting Worker, Waiting Staff, or Under Review may exist for a booking. A booking with a Resolved, Closed, or Rejected dispute cannot open another case; a withdrawn draft/submission may be reopened within the original booking window.

## 4. State graph

The locked states are Draft, Submitted, Waiting Customer, Waiting Worker, Waiting Staff, Under Review, Resolved, Closed, Rejected, and Cancelled.

- Draft → Submitted or Cancelled.
- Submitted → Waiting Customer, Waiting Worker, Waiting Staff, Under Review, Rejected, or Cancelled.
- Waiting Customer → Waiting Staff after the customer responds, or Under Review when staff proceeds.
- Waiting Worker → Waiting Staff after the worker responds, or Under Review when staff proceeds.
- Waiting Staff → Waiting Customer, Waiting Worker, Under Review, Resolved, or Rejected.
- Under Review → Waiting Customer, Waiting Worker, Resolved, or Rejected.
- Resolved or Rejected → Closed.
- Closed and Cancelled are terminal. Rejected may only transition to Closed.

Only guarded server RPCs transition state. The opening customer may withdraw before Under Review. A worker may respond, accept responsibility, or contest; none of those responses independently decides fault or moves money. Authorized staff may assign, request evidence, begin review, resolve, reject, add an internal note, and close.

## 5. Immutable dispute timeline

Every creation, submission, response, responsibility response, evidence registration, assignment, evidence request, review start, resolution, rejection, withdrawal, internal note, and closure appends an immutable event with dispute, booking, server-derived actor, visibility, state, bounded note, non-sensitive metadata, idempotency key, and server timestamp.

Participant-visible events are readable by the customer, booked worker, and authorized staff. Staff-only notes are visible only to authorized staff and never enter participant RPCs, messages, notifications, Realtime payloads, or public data. No client may insert, update, or delete an event.

## 6. Existing and additional evidence

Authorized reviewers rely on evidence already linked to the booking:

- booking status history and booking attachments;
- WPS-009 chat history and system events;
- WPS-012 operational events and progress photos;
- additional-work requests, explanations, photos, and WPS-007 approval references;
- worker/customer inspection checklists and completion decision;
- warranty commitment and dates;
- return-visit requests and outcomes;
- WPS-008 no-show evidence where present;
- WPS-011 review, reply, reports, and moderation state where authorized;
- WPS-007 immutable approved-price and financial records where authorized.

The dispute record stores references and counts, not copied evidence or generated summaries. Participants may add up to ten JPEG, PNG, WebP, HEIC, or PDF files of at most 8 MB each. Evidence is immutable after registration, private after resolution, and accessible only through short-lived signed URLs.

## 7. Participant and staff actions

The customer may create a draft, add evidence, submit, respond when requested, and withdraw before review. The assigned worker may read the submitted dispute, add evidence, respond, accept responsibility, or contest. Staff may assign the case to themselves, request evidence from either party, start review, add participant-visible updates or staff-only notes, resolve, reject, and close.

Descriptions and responses are bounded plain text. Actor identity, participant role, booking, worker account, assignee, timestamps, and transitions derive from server state. A response is also preserved in the existing booking conversation through a server-created booking-scoped message, even when ordinary completed-chat writing has expired. Ordinary WPS-009 chat locking remains unchanged.

## 8. Resolution and delegation

Resolution types are Booking upheld, Partial compensation, Return visit, Warranty work, No action, Administrative action, and Other. Staff records a participant-visible explanation. Responsibility is not inferred from the resolution label and no outcome automatically changes marketplace ranking, review score, verification, profile publication, account role, or eligibility.

Partial compensation must delegate to an existing WPS-007 pre-release refund or reviewed post-release financial case using the authoritative payment and amount. WPS-013 stores only the returned financial reference and action class. It performs no amount calculation or external money movement.

Return visit and Warranty work outcomes create a request in the existing WPS-012 `booking_return_visits` model on the same completed booking. The worker still accepts or declines through WPS-012. No duplicate booking, review, payment release, warranty period, or operation root is created.

## 9. Financial holds

Submission places eligible unreleased WPS-007 earnings in the existing `held_for_dispute` state. All WPS-007 confirmation and release paths already fail closed while an active dispute exists. Terminal resolution, rejection, cancellation, or closure asks the WPS-007 release helper to re-evaluate eligibility; it does not bypass the customer-confirmation, release-time, refund, or reviewed-case rules.

No live payment, refund provider call, payout, webhook, scheduler, or external debit is activated.

## 10. Communication and notifications

WPS-009 remains the only booking conversation. Dispute status events use source-linked localized system messages. Participant response text is inserted by the guarded dispute transaction into that conversation with its source event; it cannot be forged as a staff/system action. Staff-only notes never enter the conversation.

Durable deduplicated notifications cover dispute opened, evidence requested, evidence submitted, staff reviewing, resolved, and closed. Payloads contain booking, dispute, and source-event routing identifiers only—never response text, evidence paths, contact data, addresses, prices, staff notes, or moderation data. Live push remains disabled.

## 11. Review publication

WPS-011 still owns one completed-booking review, edit window, immutable reply, reporting, moderation, reputation, and public projections. A Submitted, waiting, or Under Review dispute temporarily delays public publication of that booking's review and removes it from public reputation aggregates without deleting or changing its content. Drafts do not delay publication.

Participants and authorized staff retain access. A newly submitted review during an active dispute is stored once and held from public publication. Terminal dispute state releases the hold only if staff review moderation has not independently hidden the review. The dispute outcome never changes scores, creates a review, edits a reply, or adds a reputation/ranking penalty.

## 12. Security, privacy, and public boundary

RLS and guarded RPCs limit disputes, participant-visible events, and registered evidence to the booking customer, assigned worker, and authorized support/admin staff. Staff-only events require staff and are omitted from participant projections. Direct writes are revoked. Security-definer functions use empty `search_path`, qualify objects, validate bounded inputs, lock mutable rows, and expose minimal grants.

The private evidence bucket exposes no public URL or listing. Public provider, marketplace, review, and reputation projections expose no dispute existence, allegation, party, status, response, staff identity, evidence, resolution explanation, financial reference, or internal note.

## 13. Storage

The existing private `dispute-evidence` bucket is hardened to 8 MB and the allowed MIME set. Paths contain authenticated uploader, booking, dispute, and an immutable safe generated filename. Registration verifies actual Storage ownership, participant relationship, booking/dispute match, MIME, size, filename, content hash, duplicate content, count, and retry key.

The uploader may delete only an unregistered staged object for failed-upload cleanup. Registered evidence cannot be directly deleted by a participant. Signed URLs expire after 15 minutes in the client and are regenerated on reload.

## 14. Mock, localization, accessibility, and brand

Mock implements the same account isolation, eligibility, one-active-case rule, graph, event visibility, evidence validation, responsibility responses, review hold, WPS-007 delegation boundary, WPS-012 return-visit reuse, messages, notifications, and terminal behavior. Data-mode selection is static; Supabase failures never read or write Mock.

English and natural Egyptian Arabic cover reasons, states, actions, evidence, responses, staff decisions, financial explanations, loading, empty, error, retry, and privacy copy. Layout and text align for RTL. Controls expose labels, roles, selected/disabled/busy state, 44-point targets, non-color status, readable timelines, and compact-width wrapping.

The only active motto is English `YOUR WORK, OUR MISSION` and Arabic `شغلك مهمتنا`.

## 15. Deferred and prohibited behavior

Production staff dashboards, automatic resolution, AI summaries, automated image review, fraud scoring, automatic suspension, automatic ranking/reputation changes, public dispute labels, participant deletion, evidence cleanup schedulers, push, SMS, telephony, live payment/refund calls, webhooks, and hosted activation are deferred or prohibited. One allegation, response, or resolution never independently changes verification or marketplace eligibility.

## 16. Acceptance boundary

WPS-013 remains local-only until clean database reset, full pgTAP, all TypeScript regressions, lint, mojibake, Expo Doctor, Android/iOS/web exports, motto audit, local/linked migration evidence, hosted dry-run, security/storage/accessibility review, and manual evidence are reviewed. Manual cases begin **NOT RUN**. No hosted migration, deployment, provider activation, live payment, SMS, telephony, push, webhook, scheduler, or irreversible action is authorized.
