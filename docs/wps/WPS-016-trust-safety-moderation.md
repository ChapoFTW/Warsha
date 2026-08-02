# WPS-016 — Trust, Safety & Moderation

## Document metadata

| Field | Value |
| --- | --- |
| Specification | WPS-016 |
| Version: 1.0 | |
| Status: LOCKED FOR IMPLEMENTATION | |
| Authority: Warsha Constitution | |
| Depends on: WPS-001 through WPS-015 | |
| Owner | Sief Abdelghfar |
| Authoritative migration | `supabase/migrations/202608020004_wps016_trust_safety_moderation.sql` |

WPS-016 is the **single authority** for platform trust state, abuse handling,
moderation, enforcement, bans, reports, fraud signals, investigations, appeals,
and operational safety.

## Relationship to existing systems

WPS-016 **extends and never replaces**. Each domain keeps its own authority; the
unified layer links to them rather than duplicating them.

| Domain authority | Retained responsibility | WPS-016 relationship |
| --- | --- | --- |
| WPS-006 verification | Identity, documents, certificates | Reports may cite a verification; verification decisions stay in WPS-006 |
| WPS-009 `booking_abuse_reports` | Chat abuse intake and immutability | Remains the chat intake; unified reports link via `source_report_id` |
| WPS-011 `review_reports`, `moderate_review` | Review moderation | Remains the review authority; WPS-016 never moderates review content itself |
| WPS-013 disputes | Customer–worker service disputes | Unchanged; a dispute is not an abuse report |
| WPS-015 chargebacks | Payment-provider disputes | Unchanged; a chargeback is not a trust action |
| WPS-007 `provider_earning_holds` | Financial holds and ledger | Remains the money authority; a WPS-016 payment/withdrawal hold is a trust restriction, not a ledger posting |
| WPS-008 marketplace eligibility | `is_provider_publicly_discoverable` | Remains the hard gate; trust restrictions are an additional gate, never a replacement |
| WPS-014 notifications | Delivery and routing | Reused unchanged |

No existing table, RPC, trigger, or policy was modified or removed.

## Platform safety model

Eleven measures plus restoration, all server authoritative:

| Measure | Effect |
| --- | --- |
| Warning | Recorded and shown to the account; no capability loss |
| Temporary restriction | Time-bounded capability limits |
| Investigation | Account under review; **not** an accusation and not punitive |
| Suspension | All capabilities withheld while active |
| Permanent ban | Terminal; carries no expiry; **never automatic** |
| Marketplace removal | Removed from discovery |
| Hidden profile | Profile not publicly visible |
| Payment hold | Payments withheld pending review |
| Withdrawal hold | Withdrawals withheld pending review |
| Communication restriction | Messaging limited |
| Review restriction | Leaving reviews limited |
| Restoration | Explicitly clears restrictions; always a separate audited action |

Trust levels: `good_standing`, `warned`, `restricted`, `under_investigation`,
`suspended`, `banned`.

**Clients cannot self-modify trust state.** `authenticated` holds no
`INSERT`/`UPDATE`/`DELETE` on any trust table; every mutation flows through a
guarded `SECURITY DEFINER` RPC that checks `private.is_staff()`. An expired
restriction is treated as lifted without needing a background job.

## Reporting model

One unified, immutable intake across all eight surfaces — bookings, chat,
reviews, providers, customers, payments, certificates, profile media — with
seventeen categories:

fraud · impersonation · abusive language · harassment · discrimination · fake
profile · fake documents · fake certificates · spam · scam · dangerous behaviour ·
off-platform payment requests · off-platform contact solicitation · illegal
activity · inappropriate content · copyright · privacy

Rules:

- Report **content is immutable**: reporter, subject, category, details, source,
  and timestamp can never be rewritten, and no report can ever be deleted.
- Only the lifecycle status moves, only through the staff RPC, and every
  transition is appended to `trust_report_events`.
- Submission is idempotent per reporter and key.
- An account cannot report itself.
- A reporter sees only their own submissions and never the outcome detail,
  evidence, or staff notes.
- **Reporting is never itself an enforcement action** and never changes trust
  state.
- Reporter identity is never disclosed to the reported account.

Lifecycle: `submitted` → `triage` → `investigating` → `actioned` | `dismissed` |
`duplicate`.

## Enforcement model

- Every action requires an actor, a reason code, a public reason, and an
  **evidence summary**; the database rejects an action without evidence.
- Enforcement history is **immutable** — no update, no delete, even for the
  table owner.
- Actions are idempotent by key.
- **No automatic permanent bans.** A permanent ban requires a human staff actor
  *and* a report that reached `investigating` or `actioned`. A database
  constraint additionally forbids a `system` actor from issuing anything except a
  non-punitive `investigation`.
- Staff review remains authoritative throughout.
- Restoration after a successful appeal is a separate, explicit, audited action
  so history always shows who restored access.

## Fraud signals

Ten advisory signal kinds: excessive cancellations, duplicate identities,
repeated failed verification, abnormal payment behaviour, repeated chargebacks,
suspicious review activity, fake portfolio attempts, certificate abuse, repeated
abuse reports, account farming.

**Signals do not punish.** They are private, staff-visible only, never change
trust state, never create an enforcement action, and never affect ranking,
reputation, or discoverability on their own. They exist to direct human
attention. This is enforced structurally: the signal recorder performs no
enforcement, and the pgTAP suite asserts that a signalled account retains full
access.

## Appeals

Any account subject to a warning, restriction, suspension, or ban may appeal.
Investigations and restorations are not appealable because neither is punitive.

- One appeal per enforcement action per appellant.
- A decision note is mandatory.
- Outcomes: `upheld`, `overturned`, `partially_overturned`; plus `under_review`
  and `withdrawn`.
- An overturned or partially overturned appeal returns `restorationRequired`,
  and restoration must then be recorded as its own audited action.
- Appeals are private to the appellant and staff. No other account can read or
  file one.

## Audit model

Every moderation action records **actor, timestamp, reason, and evidence** in
`private.trust_moderation_audit`, which is immutable — update and delete both
raise. Report submissions, status transitions, enforcement actions, appeal
submissions, and appeal decisions are all audited. This complements, and does not
replace, `public.audit_logs` and the WPS-015 financial audits.

## Security

- RLS on all five public trust tables: reporter-scoped, subject-scoped, and
  appellant-scoped reads, plus staff.
- `anon` has no access to any trust table or RPC.
- Private evidence, fraud signals, and moderation audit are readable by no client
  role at all.
- Every WPS-016 `SECURITY DEFINER` function pins an empty `search_path` and fully
  qualifies object references.
- No trust table is published to Realtime.
- Appeals privacy: only the appellant and staff can read an appeal.

## Localization and accessibility

Full English and natural Egyptian Arabic for report intake, all seventeen
categories, report statuses, trust levels, restrictions, and appeals, with RTL
support. Copy explains the restriction without accusing, never reveals who
reported, never exposes evidence or signals, and always offers the appeal route
where one exists.

Accessibility: dedicated screen-reader labels for report status, account status,
appeal status, and whether a restriction is active or cleared; status is
distinguishable without relying on colour.

## Mock and Supabase isolation

Full Mock parity with no external call. **There is no external moderation
provider and no AI moderation anywhere in WPS-016** — every decision is made by a
human staff member.

## Deployment status

Local only. Hosted migration is **not** applied by this work. All manual cases
are **NOT RUN**.

## Changelog

- 2026-08-02 — Version 1.0. Initial locked specification.
