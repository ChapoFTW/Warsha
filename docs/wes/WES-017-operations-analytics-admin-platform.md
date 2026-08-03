# WES-017 — Operations, Analytics & Admin Platform (Engineering)

## Document metadata

| Field | Value |
| --- | --- |
| Specification | WES-017 |
| Version: 1.0 | |
| Status: ENGINEERING BASELINE | |
| Implements: WPS-017 | |
| Authority: Constitution → domain WPS (006–016) → WPS-017 → WES-017 | |
| Owner | Sief Abdelghfar |
| Migration | `supabase/migrations/202608020005_wps017_operations_analytics_admin.sql` |

## Design rules

1. **Gate, never duplicate.** WPS-017 owns staff identity, routing, and the
   record of what staff did. Every domain decision stays in the RPC that already
   owns it. No second dispute state machine, enforcement ledger, refund path, or
   moderation action exists.
2. **Deny by default.** `private.require_staff_capability` is the single gate.
   An unknown capability, an unready platform, a missing grant, a suspended
   account, or a missing re-authentication all raise `42501`.
3. **Server authority.** `authenticated` holds no `INSERT`/`UPDATE`/`DELETE` on
   any WPS-017 table. Every mutation flows through a guarded `SECURITY DEFINER`
   RPC with an empty `search_path` and fully qualified references.
4. **Immutability by trigger, not by grant.** Role history, assignment history,
   private notes, support history, incident timeline, configuration history,
   flag history, kill-switch events, the staff audit, and the access log all
   raise on update and delete — even for the table owner.
5. **Extend, never narrow.** The two changes that touch earlier work are
   additive: a fourth notification audience, and a widening of
   `private.is_staff()`. No existing policy, grant, or test result moved.
6. **Fail closed.** Production requires MFA by constraint; no MFA provider is
   configured; the build gate is off by default; flags default to disabled;
   kill switches only restrict; export file delivery does not exist.

## Schema

### Public — RLS enabled, `select` only for `authenticated`

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `staff_roles` | Nine roles with a risk tier | Key pattern enforced |
| `staff_capabilities` | Thirty-one capabilities | `high_risk`, `dual_control`, `requires_reauth` flags |
| `staff_role_capabilities` | Deny-by-default mapping | Composite primary key |
| `staff_role_grants` | The only path to staff status | Unique active `(user_id, role_key)`; mandatory reason; expiry must follow the grant; immutable except revocation |
| `staff_queues` | Eighteen queues | Each bound to one capability and one subject type |
| `operational_assignments` | Generic assignment over authoritative records | Unique `(queue_key, subject_id)`; `lock_version > 0`; eight statuses; four priorities |
| `operational_assignment_events` | Append-only case history | Unique `(assignment_id, idempotency_key)`; nine actions |
| `operational_incidents` | Manually opened incidents | Ten categories, four severities, five statuses; resolution requires a timestamp |
| `operational_incident_events` | Immutable timeline | Unique `(incident_id, idempotency_key)` |
| `support_ticket_events` | Immutable support history | Unique `(ticket_id, idempotency_key)` |
| `support_tickets` *(extended)* | Nine categories, four priorities, six statuses | Escalation must reference an authoritative record |
| `support_messages` *(extended)* | `participants` / `staff` visibility | Body length bounded |

### Private — no client grants, not in Realtime

| Table | Purpose |
| --- | --- |
| `staff_platform_configuration` | Singleton: environment, MFA requirement, legacy bridge, re-auth window, search rate limit, export row limit, analytics range and minimum cell, display timezone |
| `staff_audit_events` | Immutable actor / capability / action / target / reason / break-glass / environment |
| `staff_access_log` | Immutable record of every sensitive read across eight surfaces |
| `staff_session_attestations` | Per-session re-authentication, revocable |
| `operational_case_notes` | Staff-private notes, unreachable by any client role |
| `staff_configuration_domains` | Fifteen domains with owner, applier, and allowed keys |
| `staff_configuration_versions` | Versioned change control; unique active version per domain and environment |
| `staff_feature_flags` / `staff_feature_flag_history` | Server-authoritative flags and immutable history |
| `staff_kill_switches` / `staff_kill_switch_events` | Restrictive controls with recorded prior state |
| `staff_export_catalog` / `staff_export_requests` | Five reports with column allowlists; bounded, expiring, audited requests |

### RLS policies

- `staff_roles` / `staff_capabilities` / `staff_role_capabilities` / `staff_queues` — any staff operator
- `staff_role_grants` — own grants, or `manage_staff_roles`
- `operational_assignments` — the capability that owns the queue
- `operational_assignment_events` — inherited from the parent assignment's queue
- `operational_incidents` / `operational_incident_events` — `manage_incidents`
- `support_tickets` — requester, or `manage_support_cases`
- `support_messages` — `manage_support_cases`, or the requester **and** `visibility='participants'`
- `support_ticket_events` — `manage_support_cases`, or the requester

The WPS-001 support tables were dormant: RLS was on but `authenticated` held no
`SELECT`, so the original owner policy was unreachable. Activating support cases
grants that read and adds a capability-scoped staff policy **alongside** the
original policy, which is left untouched.

## Functions

### Capability resolution (private, no client `EXECUTE`)

| Function | Behavior |
| --- | --- |
| `staff_platform_ready()` | False when the platform is disabled or an MFA requirement has no provider |
| `staff_active_role_keys(uuid)` | Active, non-expired grants for a live, non-suspended, non-banned account; optional legacy bridge |
| `staff_capability_keys(uuid)` | Capabilities from those roles |
| `staff_has_capability(text)` | Caller-scoped; granted to `authenticated` because RLS policies call it |
| `staff_capability_is_break_glass(uuid,text)` | True when only the break-glass role supplies it |
| `staff_recent_reauth(uuid)` | Attestation within the configured window for this session |
| `require_staff_capability(text)` | The single gate; raises `42501` or `22023` |
| `staff_is_operator()` / `staff_queue_capability(text)` | Policy helpers, granted to `authenticated` |
| `bootstrap_staff_role(uuid,text,text)` | Owner-only first-administrator bootstrap, unreachable over PostgREST, still audited |
| `record_staff_audit(...)` / `staff_log_access(...)` | Append-only audit and access recording |
| `notify_staff(...)` | Emits a `staff_*` event only; rejects any other key |
| `staff_queue_backlog(text,integer)` | Sanitized backlog projections from the eighteen domain sources |
| `staff_configuration_payload_valid(text,jsonb)` | Key allowlist, secret-shape rejection, scalar-only values |
| `staff_kill_switch_active(text)` | Restrictive gate other systems may consult |
| `staff_suppress(bigint,integer)` | Minimum-cell suppression, returning JSON `null` |
| `staff_search_shape(text,text)` | SHA-256 prefix so a raw search term is never logged |

### Staff RPCs (`authenticated` only, `anon` revoked)

Session: `get_staff_session`, `staff_reauthenticate`, `staff_revoke_my_sessions`.
Roles: `staff_grant_role`, `staff_revoke_role`, `get_staff_role_directory`.
Queues and cases: `get_staff_home`, `get_staff_queue`, `staff_open_case`,
`staff_assign_case`, `staff_transition_case`, `staff_add_case_note`,
`get_staff_case`, `get_staff_workload`.
Search and safe views: `staff_safe_search`, `get_staff_customer_overview`,
`get_staff_worker_overview`.
Configuration: `staff_create_configuration_draft`, `staff_submit_configuration`,
`staff_activate_configuration`, `staff_rollback_configuration`,
`get_staff_configuration`.
Flags and switches: `staff_set_feature_flag`, `get_staff_feature_flags`,
`staff_set_kill_switch`, `get_staff_kill_switches`.
Support: `staff_transition_support_case`, `staff_add_support_note`,
`get_staff_support_case`.
Incidents: `staff_open_incident`, `staff_update_incident`, `get_staff_incidents`.
Audit, analytics, exports: `staff_audit_search`, `get_staff_analytics`,
`staff_request_export`, `staff_export_preview`.

### Client RPCs (any authenticated account)

`get_my_feature_flags`, `get_platform_operational_status`, `open_support_case`,
`reply_support_case`, `get_my_support_cases`, and `get_staff_session` — which
returns `{isStaff: false}` and no configuration for a non-staff caller.

## Concurrency

`staff_assign_case` and `staff_transition_case` take `SELECT … FOR UPDATE`, then
compare `p_expected_version` with `lock_version`. A mismatch raises `40001` with
"This case changed since you opened it", so a second reviewer never silently
overwrites the first. Both are additionally idempotent by
`(assignment_id, idempotency_key)`, so a retried request is a no-op rather than a
second transition.

## WPS-014 reuse

Four surgical, additive changes:

1. `notifications_audience_check` gains `'staff'`.
2. `notification_safe_payload` gains `assignment_id`, `incident_id`, `case_id`,
   and `exception_id` — still UUID-only allowlisting.
3. `notification_resource_id` gains an operational fallback when no customer
   route applies. The existing routing is copied verbatim.
4. `notification_mode_allowed` admits `'staff'` only for an account that
   currently holds a staff capability; `notification_audience` resolves any
   `staff_*` event to the staff audience **first**, before any participant
   lookup.

Because `notification_visible_in_mode` admits only `audience='all'` or
`audience=mode`, a staff notification is structurally invisible to customer and
worker inboxes.

## Client architecture

| Module | Responsibility |
| --- | --- |
| `src/admin/admin-types.ts` | Role, capability, queue, status, dashboard, and configuration contracts plus pure helpers (`hasCapability`, `canPerform`, `sortQueueItems`, `searchTermIsAllowed`, `analyticsRangeIsValid`, `isSuppressedMetric`, `formatEgpMinor`, `formatAge`, `environmentTone`) |
| `src/admin/metric-catalog.ts` | Executable metric definitions; the guard that stops a dashboard inventing a business number |
| `src/admin/admin-copy.ts` | English and Egyptian Arabic operational copy with accessibility labels |
| `src/admin/admin-repository.ts` | Mock/Supabase isolation over the named RPCs; no service-role path, no generic dispatcher |
| `src/admin/mock-admin-state.ts` | Nine personas, seeded cases, configurations, flags, switches, incidents, audit rows, and analytics fixtures, all labelled simulated |
| `src/admin/admin-context.tsx` | Server-derived session; fails closed to no access on any error |
| `components/warsha/AdminShell.tsx` | Operational shell, environment badge, dense rows, accessible metric tiles |
| `app/admin/*` | Guarded routes: home, queue, case, search, analytics, configuration, incidents, audit |

Mock mode holds in-memory state, performs no network call, and never receives a
fallback write after a hosted failure. Mock enforces the same optimistic version
so a stale write is rejected identically in both modes.

## Test coverage

- `supabase/tests/database/operations-admin-platform.test.sql` — 306 assertions
  covering structure, preservation of the six domain authorities, deny-by-default
  role mapping, production fail-closed constraints, customer and worker denial,
  dual control on role grants and configuration approval, re-authentication
  gating, cross-role denial, legacy-gate behaviour in both directions, queue
  isolation at the row level, assignment races and idempotency, private-note
  isolation, search restrictions and rate limiting, safe-view redaction,
  configuration validation and immutable history, flag constraints and
  fail-closed resolution, kill switches operating the domain control, support
  case visibility, incident access, audit explorer bounds and self-logging,
  analytics suppression and capability separation, export authorization and
  revalidation, staff notification isolation, role removal and session
  revocation, private-schema exposure, absence of any arbitrary executor, empty
  `search_path`, RLS, and Realtime exclusion.
- `scripts/wps017-operations-admin.test.mts` — client and documentation
  contracts, capability resolution, queue ordering, search guards, metric-catalog
  completeness against the Mock fixtures, localization parity, accessibility
  labels, Mock parity including the stale-version rejection, role-removal
  behaviour, routing, and the motto regression.

## Deferred

- **Support case attachments.** No new bucket or storage policy; the contract
  fails closed.
- **Export file delivery.** No signed-URL pipeline, no storage, no background
  job; the approved output is a bounded in-band preview.
- **MFA.** No provider; production is constrained closed until one is authorized.
- **Per-domain capability gating of the pre-WPS-017 staff RPCs.** Closing this
  needs a forward change inside each locked domain WPS.
- **Automated incident detection.** Not implemented and not claimed.
- **Materialized analytics.** Every dashboard computes on read; refresh strategy
  and thresholds are in `docs/testing/WPS-017-PERFORMANCE-PLAN.md`.

## Changelog

- 2026-08-03 — Version 1.0. Initial engineering baseline.
