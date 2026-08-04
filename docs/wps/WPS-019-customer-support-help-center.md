# WPS-019 — Customer Support, Help Center & Knowledge Management

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **LOCKED — IMPLEMENTED LOCALLY, MANUAL ACCEPTANCE PENDING** |
| Authority | Below the Warsha Constitution; extends WPS-017 support cases and WPS-014 notifications; subordinate to WPS-013 for disputes and WPS-016 for abuse |
| Migration | `supabase/migrations/202608040001_wps019_customer_support_help_center.sql` (local only) |
| Architecture audit | `docs/architecture/support-architecture-audit.md` |
| Engineering baseline | `docs/wes/WES-019-customer-support-help-center.md` |
| Manual acceptance | **NOT RUN** |

---

## 1. Purpose

Warsha already had a working support backend that no user could reach. Six RPCs,
three tables, a staff queue, a capability, RLS, and 308 passing assertions — and
not one customer, worker, or staff screen called any of it. There was no help
article, no FAQ, no contact form, and no way to see a reply.

WPS-019 closes that. It is the authority for every customer-, worker-, and
staff-facing support experience, and it does two things:

1. **Makes the existing support system reachable** — a Help Center, a contact
   form, a ticket history, a reply thread, attachments, reopening, and a
   satisfaction survey, plus the staff view that makes a queue workable.
2. **Prevents most cases from being opened at all** — a searchable, localized,
   versioned knowledge base that is offered before the contact form, and is
   ordered by what the customer was doing when they asked for help.

The second is the more important one. A support system measured by how well it
answers tickets is measuring the wrong thing.

## 2. What WPS-019 does not do

- It does not create a second ticket system. `public.support_tickets` remains
  the single support record.
- It does not create a second chat. A support case is not a conversation, does
  not use `public.conversations`, and never appears in the chat tab.
- It does not create a second notification system. Every support notification is
  a WPS-014 notification in a new `support` category.
- It does not create a staff role, a capability, or a queue. Staff access is the
  existing `manage_support_cases` capability, unchanged.
- It does not decide disputes, moderate content, issue refunds, or approve
  verifications. Escalation stores a pointer to the authoritative record; WPS-013
  and WPS-016 keep their authority absolutely.
- It contains no AI. Search is Postgres full-text with a bounded trigram
  fallback. Articles are written by people. Nothing is generated at any point.

## 3. Customer experience

| Requirement | Delivered as |
| --- | --- |
| Help Center | `app/help/index.tsx` — search, suggestions, categories, popular |
| FAQ / knowledge base | 12 categories, 29 published articles, both languages |
| Categorized articles | `app/help/category/[key].tsx` |
| Onboarding, payment, booking, provider, dispute, verification, account, notification, chat, review, trust guides | One category each; see §7 |
| Contact support | `app/support/new.tsx`, pre-filled from the originating surface |
| Ticket history | `app/support/index.tsx` |
| Ticket details, reply thread, status | `app/support/case/[id].tsx` |
| Booking-, payment-, dispute-linked tickets | `linked_type` / `linked_id` pointer, validated server-side |
| Attachments, screenshots | Private bucket, server-validated registration |
| Reopen rules | Resolved only, 14 days, at most 3 times — all decided by the server |
| Satisfaction survey | 1–5 plus an optional comment, once, after resolution |

## 4. Worker experience

The same surfaces, with worker-specific content and context. A case opened from
the earnings, portfolio, verification, or onboarding surface is recorded as a
worker case (`requester_mode = 'worker'`), so staff see whose problem it is
before they read a word. Worker guidance covers onboarding, verification,
portfolio, quoting, marketplace behaviour, getting paid, and withdrawal.

## 5. Staff experience

Extends the WPS-017 operations platform; replaces none of it.

| Capability | Delivered as |
| --- | --- |
| Support queue | `get_staff_support_queue`, prioritized, with live counts |
| Assignment and ownership | `staff_assign_support_case` — an assignee who cannot work support cases is refused |
| Escalation, priority | WPS-017 `staff_transition_support_case`, unchanged |
| Internal notes | WPS-017 `staff_add_support_note`, `visibility='staff'`, unchanged |
| Macros / response templates | `private.support_macros`, bilingual; a macro fills the box, a human presses send |
| Merge duplicates | `staff_merge_support_cases` — closes and points, never deletes; same requester only |
| Resolution reasons | `private.support_resolution_reasons`, eight reasons, three requiring a note |
| SLA timers | `private.support_sla_policy` per priority; applied by trigger on insert |
| Satisfaction metrics, ticket analytics | `get_staff_support_analytics`, minimum-cell suppressed |

## 6. Service levels

| Priority | First response | Resolution |
| --- | --- | --- |
| Urgent | 2 hours | 24 hours |
| High | 6 hours | 48 hours |
| Normal | 24 hours | 96 hours |
| Low | 48 hours | 168 hours |

These are **internal operating targets**, held in `private`. They are never
shown to a customer, because Warsha has not promised them to anyone and has no
staff rostered to meet them. See §12.

The first-response clock is stopped by an `AFTER INSERT` trigger on
`support_messages`, not by an RPC. That is deliberate: it makes it impossible
for a staff reply to be sent without the clock stopping, including through the
untouched WPS-017 reply path.

## 7. Knowledge base

Twelve categories: getting started, bookings, payments, choosing a worker, when
something goes wrong, verification, your account, notifications, messages,
reviews, trust and safety, working on Warsha.

Twenty-nine articles, each with a full English body and a full Egyptian Arabic
body — spoken register, not Modern Standard translation. A customer confused
enough to open support is not helped by formal prose they have to decode.

Articles carry `status` (draft / published / archived), an immutable
`help_article_versions` history, surface and tag metadata, and explicit related
articles. A draft is invisible to a non-staff caller in every read path and in
search, enforced by RLS as well as by each function.

**An article cannot be published without an English body.** Arabic-first
authoring is supported; publishing without English is refused.

## 8. Search

- Full-text over title (weight A), summary (B), and body (C), using the `simple`
  configuration for both locales. Postgres ships no Arabic stemmer, and stemming
  only one language would make relevance asymmetric between them.
- Surface and tag boosts, so help opened from the payment screen ranks payment
  articles first.
- **Spelling tolerance runs only when the exact search found nothing**, so a
  correctly spelled query never has its results diluted. It uses trigram
  *word* similarity above 0.5 against title, summary, and tags.
- Four explicit outcomes: `exact`, `approximate`, `empty`, `too_short`. An
  approximate result is labelled as approximate in the UI, so a guess is never
  presented as certainty.
- Recent searches are the caller's own. Popular searches are suppressed below
  five distinct accounts — the same minimum-cell rule WPS-017 applies to
  analytics, so one person's query can never become everyone's suggestion.

## 9. Context-aware recommendations

Fifteen originating surfaces are recognized. Opening support from a surface
reorders the Help Center to put that surface's articles first and pre-selects
the matching contact topic.

This is an ordering rule over authored metadata. It is not a recommendation
model, it learns nothing, and it is stated as such wherever it appears.

## 10. Security

| Property | How |
| --- | --- |
| Owner isolation | RLS plus `requester_id = auth.uid()` in every participant RPC |
| Staff isolation | `manage_support_cases`, through the WPS-018 capability gate — including MFA, session revocation, and platform readiness |
| Narrow-role denial | A verification reviewer is refused on the support queue and on merge; asserted both directions |
| Attachment isolation | Path binds uploader, case, and extension; read requires a **registered** object on a visible case |
| Private notes | `visibility='staff'`; the participant read path filters to `participants` and RLS enforces it independently |
| Search safety | Draft and archived articles are unreachable in every path; `anon` reaches nothing at all |
| Rate limiting | Six surfaces on the WPS-018 limiter; none left to the client |
| Ticket ownership | Server-derived; no caller ever states who owns a case |
| Anonymous denial | Denied at the grant, before any function body runs |
| Cross-account denial | Asserted for read, reply, reopen, satisfaction, and merge |
| Audit | Every staff action writes to the WPS-017 immutable audit |

A support notification carries **only the case id**. It never carries the
subject, the body, or any detail of the customer's problem — a notification is
visible on a lock screen.

## 11. Validation

Full measured results: `docs/testing/WPS-019-ACCEPTANCE-EVIDENCE.md`.

| Gate | Result |
| --- | --- |
| Clean `supabase db reset` | Full chain through `202608040001` applies |
| Full pgTAP | **22 files / 2,032 assertions, `Result: PASS`** |
| WPS-019 pgTAP | 201 assertions |
| WPS-019 client suite | 858 checks |
| All regression suites | 19 suites, 0 failures |
| Existing suites | All 21 pgTAP suites pass; three assertions were made more precise (§13) |
| TypeScript, ESLint, mojibake, whitespace | Clean |
| Secret, migration, environment, bundle audits | Clean |
| Expo Doctor, three exports | 18/18; all three export, all 7 WPS-019 routes present |
| Hosted migration | **Not applied**; two migrations pending |

## 12. What is not claimed

- **Manual acceptance has NOT RUN.** Every WPS-019 case is NOT RUN, and it joins
  a backlog of 486 consolidated cases that have never been executed.
- No device testing of any kind.
- **No support team exists.** The service levels in §6 are targets in a table
  with nobody rostered to meet them. They are internal and unpublished for
  exactly that reason.
- No SLA breach alerting is scheduled. `staff_support_sla_breach` is catalogued
  but nothing emits it, because WPS-014's scheduler is disabled.
- No article has been reviewed by a lawyer, and the payment, dispute, and refund
  articles describe product behaviour, not legal entitlement.
- No push delivery. A support reply reaches an in-app inbox and nothing else.
- Search relevance has not been measured against real queries, because there
  are none.

## 13. Recorded assertion changes

Three existing automated assertions changed, all deliberately:

1. `scripts/wps014-notifications-engagement.test.mts` asserted nine notification
   categories. Support is a tenth. Updated to 10.
2. `scripts/wps014-notifications-engagement.test.mts` asserted that every
   category is database constrained by checking a single migration file. The
   constraint now spans two forward migrations — WPS-014 defined the original
   nine, WPS-019 widened it — so the assertion checks the schema rather than one
   file. The property under test is unchanged.
3. `supabase/tests/database/operations-admin-platform.test.sql` asserted that a
   customer's inbox was empty as a proxy for "no staff notification leaks into a
   customer inbox". A customer now legitimately has support notifications, so the
   assertion was rewritten to test the property directly: no item with a
   `staff_` event key or a `staff` audience reaches a customer inbox.

None weakened a check. The third strengthened one.

## 14. Defect found outside WPS-019 scope

`npm run audit:secrets` — a required CI gate — was failing on every run before
WPS-019 began, broken by the WPS-018 commit that introduced it. The scanner was
flagging its own pattern definitions and the security review documenting them.

It was fixed during WPS-019 recovery because a red gate blocks WPS-019's own
validation and every future build. The fix removes the self-reference and
neutralizes two exact literals by value, never by path. Detection is unchanged
and was re-verified in both directions. Full detail is in
`docs/testing/WPS-019-ACCEPTANCE-EVIDENCE.md`.

This was a WPS-018 defect, not a WPS-019 feature, and is recorded as such.
