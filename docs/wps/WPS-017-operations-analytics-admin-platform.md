# WPS-017 — Operations, Analytics & Admin Platform

## Document metadata

| Field | Value |
| --- | --- |
| Specification | WPS-017 |
| Version: 1.0 | |
| Status: LOCKED FOR IMPLEMENTATION | |
| Authority: Warsha Constitution | |
| Depends on: WPS-001 through WPS-016 | |
| Owner | Sief Abdelghfar |
| Authoritative migration | `supabase/migrations/202608020005_wps017_operations_analytics_admin.sql` |

WPS-017 is the **single authority** for staff identity, staff capabilities,
operational assignment, operational configuration change control, feature flags,
kill switches, support cases, incidents, the audit explorer, privacy-safe
operational analytics, and approved exports.

It gives authorized Warsha staff one secure workspace for work that needs human
judgement. It is **not a customer product**, and it must never become a general
database browser.

## Relationship to existing systems

WPS-017 **extends and replaces nothing**. Every domain keeps its own authority;
the admin platform gates access to it, routes the work, and records who did
what. It never duplicates a domain record and never takes a domain decision.

| Domain authority | Retained responsibility | WPS-017 relationship |
| --- | --- | --- |
| WPS-006 verification | Identity and certificate decisions | Queues the work and records the case; the decision stays in `review_provider_verification` / `review_provider_certificate` |
| WPS-007 financial system | Ledger, refunds, holds, withdrawals | Inspects safe state and queues exceptions; no ledger entry is ever written here |
| WPS-008 marketplace | Matching, ranking, eligibility | Read-only visibility plus a change-control record for configuration; ranking is never nudged for a favoured worker |
| WPS-009 communication | Booking chat and abuse intake | Untouched; chat is never surfaced as a staff browsing tool |
| WPS-010 worker profiles | Profile, portfolio, certificates | Read-only sanitized projection |
| WPS-011 reviews | Review content and moderation | Queues review reports; `moderate_review` stays the moderation authority |
| WPS-012 job execution | Booking operations and return visits | Read-only projection |
| WPS-013 disputes | Dispute lifecycle and resolution | Queues and assigns; `resolve_booking_dispute` stays the decision |
| WPS-014 notifications | Delivery and routing | Reused for staff alerts through a new `staff` audience |
| WPS-015 production payments | Providers, webhooks, reconciliation, chargebacks | Queues exceptions; the payment maintenance switch operates WPS-015's own control |
| WPS-016 trust and safety | Reports, enforcement, bans, appeals | Queues and assigns; `staff_record_enforcement_action` stays the enforcement authority |

No existing table was dropped, no existing public function was dropped, and no
policy or grant was weakened. Two additive changes touch earlier work, both
documented below: the `staff` notification audience (WPS-014) and the legacy
staff gate widening (`private.is_staff()`).

## Admin platform architecture

The admin platform is a **protected surface inside the existing Expo project**,
under `app/admin/`. The full reasoning, including why a separate web application
was rejected, is in `docs/architecture/admin-platform-architecture.md`.

Three independent gates apply:

1. **Build gate** — `EXPO_PUBLIC_ADMIN_SURFACE=enabled`. Without it the surface
   is inert: the guard refuses to open it and the repository refuses every call.
   It does **not** remove the code from the bundle — Expo Router bundles every
   route module either way, which was verified by exporting without the flag.
   This is defence in depth, never authorization.
2. **Platform gate** — the server reports whether the platform is usable.
   Production is structurally fail-closed: the environment cannot be set to
   `production` without the MFA requirement, and no MFA provider is configured,
   so production denies every staff capability today.
3. **Capability gate** — the signed-in account must hold the specific capability
   for the specific action, checked **inside every RPC**, every time.

The route is not hidden; refusing to render is a usability decision. Security
lives in the third gate alone.

**No service-role key exists anywhere in the client.** The admin platform uses
the same anon key and the staff member's own session, restricted by RLS and
capability checks. There is no arbitrary SQL executor and no generic RPC
dispatcher.

## Staff roles and capabilities

Nine roles, thirty-one capabilities, **deny by default**. A role holds exactly
the capabilities mapped to it; nothing is implied.

| Role | Risk tier | Purpose |
| --- | --- | --- |
| Support Agent | standard | Support cases and safe account context |
| Verification Reviewer | standard | Identity and certificate review |
| Trust & Safety Reviewer | elevated | Reports, moderation, restrictions, appeals |
| Dispute Reviewer | elevated | Booking disputes |
| Financial Operations | elevated | Payments, refunds, withdrawals, reconciliation |
| Marketplace Operations | standard | Marketplace health and configuration authoring |
| Operations Manager | elevated | Queues, assignment, incidents, approvals, exports |
| Security Administrator | critical | Staff roles, audit access, flags, kill switches |
| Super Administrator | critical | Break glass. Production use must be exceptional |

Rules:

- Deny by default; minimum privilege; no role is omnipotent except break-glass.
- Role assignment is staff-only and requires the `manage_staff_roles` capability.
- **A staff member can never grant a role to their own account.**
- Role history is immutable: a grant can be revoked but never rewritten or deleted.
- Revoking a role clears the account's session attestations immediately.
- A deleted, suspended, or banned account holds **no** capability, whatever
  grants exist.
- Every capability reached only through Super Administrator is audited as
  **break-glass** access.

### Legacy compatibility

Existing staff were identified by `public.user_roles.role in ('support','admin')`
and checked through `private.is_staff()`. That result is **unchanged** — this is
a widening, never a narrowing, so no existing behaviour, policy, or test moved.

`private.is_staff()` additionally recognizes a WPS-017 staff member holding the
`legacy_domain_staff_actions` capability, so granting a WPS-017 role no longer
requires handing out a legacy `user_roles` row. Support Agent, Marketplace
Operations, and Security Administrator deliberately do **not** hold that
capability and therefore cannot reach any pre-WPS-017 domain staff RPC.

A `legacy_staff_bridge_enabled` flag can map an existing `user_roles` staff
account to the lowest-privilege role. It is **disabled by default in every
environment** and must be turned on deliberately by a Security Administrator.

**Known limitation.** Within the set of roles that hold
`legacy_domain_staff_actions`, WPS-017 cannot yet prevent a cross-domain call to
a legacy staff RPC — a Verification Reviewer holds `is_staff()` and could call a
dispute RPC directly against the API. Closing that requires a per-domain forward
change inside each locked domain WPS and is deliberately out of scope here. It
is recorded in `docs/security/admin-threat-model.md`.

## Authentication and session security

- An authenticated Supabase account, an active non-expired role grant, and a
  live account are all required; identity is always server-derived.
- High-risk capabilities require a **fresh re-authentication attestation**
  recorded per session, with a configurable window (default fifteen minutes).
- A staff member can revoke their own operations sessions; revoking a role
  revokes them too.
- Login and every privileged action are audited with actor, capability, reason,
  environment, and whether break-glass was used.
- A customer or worker session never confers admin access: staff mode is a
  separate capability set with a separate notification audience.

**MFA is not implemented.** The `mfa_provider` is `none`, and a database
constraint forbids selecting `production` without `mfa_required`. Production
therefore fails closed until a provider is separately authorized. Nothing here
claims a completed second factor.

## Work queues

Eighteen queues, each bound to one capability and one authoritative subject type:

pending identity verification · pending certificates · open disputes · dispute
evidence deadlines · abuse reports · trust investigations · appeals · review
moderation · failed refunds · failed payouts · withdrawal reviews ·
reconciliation exceptions · chargebacks · post-release financial cases ·
marketplace incidents · notification delivery failures · support cases ·
security events

A queue shows a safe identifier, age, priority, status, owner, reason category,
deadline where one applies, and one clear next action. It shows **no** private
information: notes, evidence, and contact details live behind their own
capability on the case screen.

A queue appears only for a capability the caller actually holds, and row-level
security applies the same rule to the underlying table.

## Case assignment and workload

Statuses: `unassigned` · `assigned` · `in_progress` · `waiting_participant` ·
`waiting_provider` · `escalated` · `resolved` · `closed`.

- An operational assignment **references** the authoritative record; it never
  copies it. A `(queue_key, subject_id)` uniqueness rule means one domain
  subject can never acquire two operational cases.
- Every action is idempotent by key.
- Every mutation takes a row lock **and** checks an optimistic `lock_version`,
  so a second reviewer can never silently overwrite an assignment.
- A case cannot be assigned to someone who cannot work that queue.
- Assigning another person needs `assign_cases` **and** the queue capability.
- Assignment history is append-only and immutable.
- Staff-private notes live in the private schema and are unreachable by any
  client role.

## Global safe search

Restricted, rate-limited, audited, and role-sensitive.

- Exact identifier lookup only: booking, marketplace request, dispute, review,
  abuse report, payment, withdrawal, reconciliation exception, support case,
  incident, account, worker.
- A minimum query length, no wildcards, no prefix scan over names, no bulk
  enumeration, and no anonymous access.
- Free-text lookup is limited to an **exact** verified phone or email and needs
  the contact-details capability.
- **National ID is never searchable**, in any role, by any path.
- Results are sanitized projections filtered by the caller's capabilities.
- Every search is recorded; the raw term is **hashed**, never stored.
- The rate limit is enforced before anything is read.

## Customer and worker safe views

Role-appropriate projections only.

Customer: account status, display name, language, standing and restrictions,
booking summary counts, dispute and report counts, support history, and contact
details **only** with `view_contact_details`.

Worker: profile and publication state, verification and certificate states,
availability, booking summary, rating, trust standing, and earnings and payout
summaries **only** with `view_financial_ledger`.

Never exposed anywhere: passwords, access or refresh tokens, payment
credentials, raw private document URLs, National ID, service-role data,
unrelated private chat, the full ledger to a non-financial role, or staff-private
notes to an unauthorized role. Each projection states plainly whether contact and
financial detail were withheld, so a reviewer never mistakes "hidden" for "none".

## Domain operations

Verification, disputes, trust and safety, review moderation, financial
operations, and marketplace operations are all **worked through** WPS-017 and
**decided by** their owning specification. WPS-017 supplies the queue, the
assignment, the safe context, the private notes, the deadline, and the audit
trail. It supplies no second dispute state machine, no second enforcement
ledger, no second refund path, and no second moderation action.

Specifically:

- The criminal-record certificate is **not** a Warsha requirement and appears
  nowhere.
- No automatic permanent ban exists; WPS-016's human-actor and investigated-report
  rules are untouched.
- Moderation is a soft hide; normal moderation never destroys evidence.
- No arbitrary ledger entry, no direct success mutation, no bypass of WPS-007.
- Staff must not manually manipulate ranking for a favoured worker; no such
  control exists.

Real providers stay disabled until the provider, commercial, and legal gates in
`docs/decisions/payment-provider-selection.md` are resolved.

## Configuration management

WPS-017 owns the **change-control record** for fifteen approved configuration
domains: version, schema validation, change reason, author, approval, activation
timestamp, and immutable history.

- Every domain declares its `authoritativeOwner` and who applies an activated
  version. Domains owned elsewhere are applied by that specification's own path,
  recorded in `docs/operations/configuration-change-runbook.md`. WPS-017 does
  not become a second authority for a domain's values.
- Payload validation allowlists keys per domain, rejects nested objects,
  oversized strings, and any key that looks like a secret. **No secret value is
  ever stored in configuration.**
- Environments are separate; draft, pending approval, active, superseded, and
  rejected are distinct states.
- **Dual control**: a version can never be approved by its author.
- History is immutable. Rollback creates a **new corrective version** carrying
  the older payload and follows the same approval path.

## Feature flags

Server-authoritative, disabled by default, fail-closed.

- Environment-specific, with an owner, a mandatory reason, and a review date.
- An enabled flag must name an audience; `none` means nobody.
- Percentage rollout is deterministic per account, so a user's experience does
  not flicker.
- A flag key matching a security-shaped name is refused by a database
  constraint: **a security control is never implemented as a feature flag.**
- Every change is recorded in immutable history.
- An unknown flag, an expired flag, a wrong environment, or a wrong audience all
  resolve to `false`.

Ten flags ship disabled: marketplace activation, online payments, payouts, push
notifications, call relay, Emergency, Rescue Mode, new profile UI, new review UI,
and staff beta tools. **Nothing unfinished is activated.**

## Kill switches and maintenance

Nine controls. A switch **only ever restricts**. It never enables anything, never
deletes data, never touches immutable history, and never affects an existing
booking, conversation, or ledger row.

Where the owning domain already has a maintenance control, the switch operates
that control rather than shadowing it — activating payment maintenance sets
WPS-015's own `maintenance_mode`; disabling new marketplace requests sets
WPS-008's own activation flag. Clearing a switch restores only the recorded prior
value. Each switch states whether it is server-enforced or advisory, and every
change is role-gated, reasoned, confirmed, environment-scoped, and audited.

## Support cases

The dormant WPS-001 support tables are activated and extended, not replaced.

Nine categories: account access · booking help · worker onboarding ·
verification help · payment question · withdrawal question · technical issue ·
app feedback · other.

- Opened by a participant or by staff; idempotent.
- Participant-visible replies and staff-private notes are separate visibilities;
  a participant can never read a staff note, enforced by RLS.
- History is immutable.
- **Escalation references the authoritative record** — a dispute, an abuse
  report, a financial case, or an incident — and never creates a second one.
- This is not a public social-support chat.

Attachments on support cases are **deferred**: no new bucket or storage policy is
created, and the contract fails closed. Recorded as a gap.

## Audit explorer

Read-only, role-gated, bounded, and self-auditing across nine sources: platform
audit logs, staff audit, trust moderation audit, payment audits, dispute events,
configuration history, staff role history, support case events, and operational
assignment events.

Filterable by safe identifier, actor, and a bounded date range. No secret is
shown, there is no unrestricted export, the immutable sources are untouched, and
**opening the explorer is itself recorded**.

## Analytics

Aggregated and privacy-conscious. Analytics support operations and product
decisions; they are **not** surveillance and **not** employee monitoring. There
is no per-person productivity dashboard and no public vanity metric.

- Authoritative timestamps stay UTC; reporting periods are bucketed by the
  **Africa/Cairo** display day, and every response states its timezone and time
  basis.
- Ranges are bounded (366 days maximum). Every response reports whether the
  period is **partial** because it includes today.
- Cohort cells below the configured minimum are **suppressed** and render as
  "hidden", never as zero.
- Financial analytics require the ledger capability in addition to the analytics
  capability, and are derived from the WPS-007 ledger projection — never
  recomputed.
- Individual fraud signals never appear in any dashboard.
- No PII, no addresses, no contact details, no direct links to private records.

Nine dashboards: executive, marketplace, bookings, workers, customers, financial,
trust, verification, and notification health.

### Metric definitions

**Dashboard code may not define a business metric.** Every metric documents its
name, business question, sources, numerator, denominator, inclusion and exclusion
criteria, time basis, update frequency, privacy classification, and known
limitations, in `docs/analytics/WARSHA-METRIC-CATALOG.md` and its executable
mirror `src/admin/metric-catalog.ts`. The regression suite fails if a rendered
metric is not catalogued.

## Data exports

Five approved reports, each role-gated with a column allowlist.

- A sensitive export requires a written reason.
- Ranges are bounded; row counts are capped; authorization is revalidated on
  every download, never trusted from the request.
- An export belongs to the staff member who requested it and expires.
- Every request and download is audited with the reason.
- No unrestricted dump, no tokens, no secrets, no identity documents, no payment
  credentials.

**File delivery is deliberately not implemented.** There is no signed-URL
pipeline, no storage bucket, and no background job, so nothing can leak through
an unauthenticated link. The approved output is a bounded, revalidated,
in-band preview. Recorded as a gap with a fail-closed contract.

## Incident management

Ten categories covering payment provider outage, Supabase outage, notification
outage, marketplace matching failure, storage failure, authentication incident,
security incident, data-integrity issue, migration failure, and other.

Each incident carries a reference, severity, status, start time, commander,
affected systems, internal and public summaries, an immutable timeline,
resolution, and a postmortem reference.

**Incidents are opened and updated by a person. WPS-017 claims no automated
detection, because none is implemented.**

## Staff notifications

WPS-014 is reused, not duplicated. A fourth audience — `staff` — is added. Because
the existing visibility rule admits only `audience='all'` or `audience=mode`, a
staff notification **can never appear in a customer or worker inbox**, and staff
mode is available only to an account that currently holds a staff capability.

Ten staff events: case assigned, case escalated, evidence deadline, high-priority
report, reconciliation exception, payout failure, security incident,
configuration awaiting approval, appeal submitted, incident escalation.

Push delivery, token registration, and the reminder scheduler remain **disabled**;
nothing in WPS-017 turns them on.

## Security and privacy

A formal audit is recorded in `docs/security/admin-threat-model.md`, covering
privilege escalation, staff account compromise, IDOR, service-role exposure, bulk
scraping, unauthorized search and export, audit tampering, role self-escalation,
approval bypass, cross-environment action, accidental production mutation,
private-note leakage, financial abuse, mass suspension, configuration sabotage,
and session persistence after role removal.

Controls: server-derived identity, capability checks on every action, RLS, a
private schema with no client grants, minimal grants, empty `search_path` on
every `SECURITY DEFINER` function, fully qualified references, row locking,
optimistic versioning, immutable audit, confirmation for dangerous actions, dual
control where it matters, sanitized projections, rate limits, an always-visible
environment badge, and a fail-closed production mode.

**No compliance certification is claimed.**

## Localization and accessibility

The admin platform is bilingual. Every operational label a reviewer acts on
exists in English and natural Egyptian Arabic with RTL-safe layout, Cairo dates,
and EGP formatting. Copy states the operational fact, names the environment
before a dangerous action, and says which specification owns the decision being
taken. The motto is **not** repeated on operational screens.

Accessibility: keyboard-reachable controls, visible focus, screen-reader labels
on every status and metric, semantic headers, status distinguishable without
colour, 48px minimum targets, dynamic text, error summaries announced as alerts,
accessible tables instead of decorative charts, RTL-mirrored order, and small
laptop compatibility.

## Brand

The Current, applied in a restrained operational form: serious, dense, legible,
and unmistakably internal. No decoration, no consumer imagery, no purchased-
dashboard look. The active motto remains **YOUR WORK, OUR MISSION / شغلك مهمتنا**
and stays on brand surfaces, not on operational screens.

## Deployment status

Local only. The hosted migration is **not** applied by this work. Real payments,
payouts, refunds, push, SMS, calls, webhooks, schedulers, and external providers
remain disabled. All manual cases are **NOT RUN**.

## Changelog

- 2026-08-03 — Version 1.0. Initial locked specification.
