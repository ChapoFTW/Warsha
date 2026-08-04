# Warsha Support Architecture Audit (Phase 1 of WPS-019)

| Field | Value |
| --- | --- |
| Performed | 2026-08-04 |
| Method | Repository read of all 33 migrations, 21 pgTAP suites, `src/`, `app/`, `scripts/`, and `docs/`; no hosted query |
| Scope | Every support-, help-, knowledge-, ticket-, and contact-related surface |
| Purpose | Establish what already exists so WPS-019 extends rather than duplicates |

This audit is the authority for what WPS-019 may touch. It was written **before**
any WPS-019 change and its findings are cited by `docs/wps/WPS-019-customer-support-help-center.md`.

---

## 1. What already exists

### 1.1 Support tables

| Object | Introduced | State |
| --- | --- | --- |
| `public.support_tickets` | `202607200002_operations.sql` line 25 | Live. Originally 7 columns; WPS-017 added `category`, `priority`, `escalated_to_type`, `escalated_to_id`, `opened_by_staff`, `closed_at`, `last_reply_at`, `idempotency_key` and five CHECK constraints. |
| `public.support_messages` | `202607200002_operations.sql` line 26 | Live. WPS-017 added `visibility` (`participants` \| `staff`) and `idempotency_key`. |
| `public.support_ticket_events` | `202608020005` (WPS-017) | Live, immutable by trigger `support_ticket_events_immutable`. |

`support_tickets` and `support_messages` sat **dormant for six weeks** — created by
the original operations migration, referenced by nothing, with no RLS beyond the
default and no RPC. WPS-017 activated them. WPS-019 must not recreate them.

### 1.2 Support RPCs

All six exist and all six are already reachable from `authenticated`:

| RPC | Authority | Notes |
| --- | --- | --- |
| `public.open_support_case(text,text,text,text)` | WPS-017 | **Wrapped by WPS-018.** The WPS-017 body now lives at `private.open_support_case_impl`; the public name is a rate-limiting wrapper. |
| `public.reply_support_case(uuid,text,text)` | WPS-017 | Not wrapped. Participant or staff; refuses a closed case. |
| `public.get_my_support_cases()` | WPS-017 | Returns participant-visible messages only. |
| `public.staff_transition_support_case(uuid,text,text,text,text,text,uuid)` | WPS-017 | Requires `manage_support_cases`; escalation must point at an authoritative record. |
| `public.staff_add_support_note(uuid,text,text)` | WPS-017 | Writes `visibility='staff'`. |
| `public.get_staff_support_case(uuid)` | WPS-017 | Returns all messages including staff-only notes. |

### 1.3 Staff operations integration

Already wired, and WPS-019 reuses every piece of it unchanged:

- Capability `manage_support_cases` (`202608020005` line 203), granted to
  `support_agent`, `operations_manager`, and `super_administrator`.
- Queue `support_cases` (`202608020005` line 783): domain `support`, subject type
  `support_case`, 24-hour target response, sort weight 170.
- `public.get_staff_queue('support_cases')` reads `support_tickets` directly
  (line 1171) for statuses `open`, `in_progress`, `waiting_participant`.
- Generic assignment layer `public.operational_assignments` +
  `operational_assignment_events` + `private.operational_case_notes`, with
  `staff_open_case`, `staff_assign_case`, `staff_transition_case`,
  `staff_add_case_note`, `get_staff_case`, `get_staff_workload`.
- `public.staff_safe_search(p_query,'support_case')` resolves a case by UUID and
  is capability-gated.
- `get_staff_customer_overview` counts a user's support cases.
- `staff_audit_search` projects `support_ticket_events` into the audit explorer.

### 1.4 RLS and grants

| Object | Policy | Effect |
| --- | --- | --- |
| `support_tickets` | `support_tickets_scoped_read` | Owner or `manage_support_cases`. |
| `support_messages` | scoped read (line 3492) | Staff, or a participant on their own ticket — and **only** `visibility='participants'`. |
| `support_ticket_events` | `support_ticket_events_scoped_read` | Staff, or the ticket owner. |

`insert`, `update`, and `delete` are revoked from `anon` and `authenticated` on
all three tables; every write goes through a `SECURITY DEFINER` RPC. `anon` has
no access at all.

### 1.5 Storage

Twelve buckets exist. **None is for support.** The closest analogue is
`dispute-evidence` (`202608020001`, WPS-013): private, 8 MB, MIME-restricted to
`image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`, with a
three-part enforcement pattern that WPS-019 reuses verbatim in shape:

1. An `INSERT` policy that binds the object path to the caller's UUID, the parent
   record, participation, and the record's status, and validates
   `metadata->>'mimetype'` and `metadata->>'size'` at policy level.
2. A registration RPC that re-reads `storage.objects` server-side and refuses a
   mismatch — the client's claim about its own upload is never trusted.
3. A `SELECT` policy that grants read only to a **registered** object, plus a
   `DELETE` policy that lets an uploader clean up an **unregistered** orphan.

### 1.6 Notifications

WPS-014 (`202608020002`) owns every notification. The architecture is:

- One table, `public.notifications`; a `BEFORE INSERT` trigger
  `private.prepare_notification()` derives category, priority, audience, route
  type, resource id, grouping, dedupe key, and generic copy.
- `private.notification_event_catalog` is the typed registry of event keys.
- `private.notification_safe_payload()` is a **strict allowlist** of 14 UUID keys;
  anything else in `data` is discarded before the row is stored.
- Nine categories: `marketplace`, `bookings`, `messages`, `payments`,
  `worker_account`, `reviews`, `disputes`, `security`, `system`.
- Twelve route types; `public.resolve_notification_route()` re-authorizes the
  target at open time rather than trusting the stored route.
- Push delivery, token registration, and the reminder scheduler are all disabled.

**There is no support notification of any kind.** No event key, no category, no
route type, no catalog row.

### 1.7 Client code

| Surface | State |
| --- | --- |
| Help Center | **Does not exist.** |
| FAQ / knowledge base / articles | **Does not exist.** No table, no file, no route. |
| Contact support | **Does not exist.** |
| Ticket history / detail | **Does not exist.** |
| Support repository | **Does not exist.** `src/` has no support module. |
| Support translations | **Does not exist.** |
| Support Mock state | **Does not exist.** |
| Staff support queue UI | Partially exists: `app/admin/queue/[key].tsx` and `app/admin/case/[id].tsx` render the generic assignment layer, which includes `support_cases`. There is no support-specific staff view, no macro, no template, no merge, and no SLA display. |

A repository-wide grep for `support_tickets`, `supportCase`, and `supportTicket`
across `src/`, `app/`, and `scripts/` returns **twelve hits, none of them a
customer surface** — all are capability strings, queue keys, or the WPS-018
activation-matrix row.

### 1.8 Localization

`src/i18n/` holds a base `translations.ts` plus six domain translation modules,
each exporting an `en`/`ar` record and a `use*Text()` hook. RTL is handled by
`useLocalization().isRTL` driving `flexDirection: 'row-reverse'` at the component
level; `I18nManager.allowRTL(true)` is set in the provider. There is no support
translation module.

---

## 2. What is dormant

| Item | Why it is dormant |
| --- | --- |
| `support_tickets.assigned_to` | Written only as a side effect of `staff_transition_support_case`; never read as an ownership model, never surfaced, no reassignment path. |
| `support_tickets.opened_by_staff` | Column exists; no RPC ever sets it true. |
| `support_tickets.priority` | Settable by staff; never displayed and never used to order any queue. |
| `support_tickets.escalated_to_type` / `_id` | Constraint-enforced but never read back by any query or surface. |
| `open_support_case`, `reply_support_case`, `get_my_support_cases` | Fully implemented, fully tested, **zero callers**. Warsha has a working support backend that no user can reach. |
| `support_messages.visibility='staff'` | Written by `staff_add_support_note`; RLS correctly hides it; no staff surface renders it. |

The single most important audit finding: **the support backend is complete and
unreachable.** WPS-019's largest deliverable is not new server capability — it is
the customer, worker, and staff surface that makes the existing capability usable,
plus the knowledge base that prevents most tickets from being opened at all.

---

## 3. What is duplicated

Nothing yet. Three near-misses were checked and cleared:

| Candidate | Verdict |
| --- | --- |
| WPS-013 disputes | **Not a duplicate.** A dispute is a booking-scoped financial/quality conflict with its own eligibility window, evidence model, and resolution authority. A support case is everything that is not that. WPS-017 already encodes the boundary: escalation stores a *pointer* to the dispute and never copies it. |
| WPS-016 abuse reports | **Not a duplicate.** A trust report is an accusation about a person or artefact routed to moderation. A support case is a request for help. Same escalation-by-pointer rule applies. |
| WPS-009 booking chat | **Not a duplicate.** Chat is participant-to-participant inside a confirmed booking, 48-hour windowed. Support is participant-to-Warsha, unbounded by booking. |

**Risk WPS-019 must actively avoid:** the moment a support case gains
attachments, a reply thread, and unread state, it looks like a second chat
system. It is not one, and it must not reuse `conversations`/`messages`, must not
appear in the chat tab, and must not produce `messages` category notifications.

---

## 4. What WPS-019 extends

| Existing thing | Extension | Rule |
| --- | --- | --- |
| `public.support_tickets` | Add linked entity, origin surface, locale, SLA timestamps, reopen count, satisfaction, merge pointer | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` only |
| `public.support_messages` | Add attachment linkage and macro provenance | Additive |
| `public.open_support_case` | New **8-argument overload** carrying context; the 4-argument WPS-018 wrapper is untouched | No default values on the new overload, so the 4-argument call stays unambiguous |
| `private.open_support_case_impl` | Reused verbatim by the new overload | WPS-018 asserts exactly 30 `_impl` functions; WPS-019 adds none |
| WPS-014 notification catalog | Add `support` category, `support_case` route type, six catalog rows, one payload allowlist key | Widening only |
| WPS-017 queue `support_cases` | Unchanged; gains a support-specific staff view above it | No new queue |
| WPS-017 capability `manage_support_cases` | Unchanged; reused for every WPS-019 staff action | No new staff role |
| WPS-013 storage pattern | New `support-attachments` bucket following the same three-part shape | No shared bucket |

New objects (nothing above replaced): a knowledge base (categories, articles,
localized bodies, immutable version history, feedback), search infrastructure,
support attachments, SLA policy, macros, resolution reasons, and satisfaction.

---

## 5. What must remain unchanged

1. Every WPS-013 dispute object, RPC, and policy. Support escalates by pointer.
2. Every WPS-016 trust object. Support escalates by pointer.
3. Every WPS-009 chat object. Support is not chat.
4. The WPS-018 wrapper contract: 22 legacy staff RPCs keep their public name and
   signature, and exactly 30 `_impl` functions exist in `private`.
5. `private.is_staff()` and the capability model. WPS-019 introduces no staff
   role, no capability, and no bypass.
6. The nine existing notification categories keep their meaning; `support` is a
   tenth, not a re-slicing of the nine.
7. Every existing RLS policy and grant. WPS-019 adds policies; it relaxes none.
8. `YOUR WORK, OUR MISSION` / `شغلك مهمتنا`.

---

## 6. Known consequence of this audit

Adding a tenth notification category changes one existing automated assertion:
`scripts/wps014-notifications-engagement.test.mts` asserts
`notificationCategories.length === 9`. WPS-019 updates it to `10`.

This is a deliberate, recorded widening of the same kind WPS-018 made to the
WPS-017 suite. It is called out here so it is never mistaken for test drift.
