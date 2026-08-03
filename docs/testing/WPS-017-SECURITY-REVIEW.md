# WPS-017 Security Review — Operations, Analytics & Admin Platform

| Field | Value |
| --- | --- |
| Specification | WPS-017 v1.0 |
| Scope | `202608020005_wps017_operations_analytics_admin.sql`, `src/admin/*`, `app/admin/*`, `components/warsha/AdminShell.tsx` |
| Method | Executed database audit against a clean local reset, plus the 306-assertion WPS-017 pgTAP suite and the 1,543-check client suite |
| Verdict | **Local implementation accepted. Production deployment blocked by design.** |
| Certification | **None claimed.** |

Threat analysis is in `docs/security/admin-threat-model.md`. This document records
what was **executed and observed**, and what was found.

## Executed checks

| Check | Result |
| --- | --- |
| Clean local `supabase db reset` through `202608020005` | Applied without error |
| Full pgTAP suite, 20 files | **1,693 assertions, `Result: PASS`** |
| WPS-017 pgTAP suite | 306 assertions pass |
| Existing 19 suites after the migration | All pass; no assertion changed |
| Every WPS-017 `SECURITY DEFINER` function pins empty `search_path` | 0 violations |
| Private WPS-017 tables exposed to `anon`, `authenticated`, or `PUBLIC` | 0 |
| `authenticated` INSERT/UPDATE/DELETE on any WPS-017 public table | 0 |
| `anon` SELECT on any WPS-017 public table | 0 |
| `anon` EXECUTE on any staff RPC | 0 |
| WPS-017 tables in the `supabase_realtime` publication | 0 |
| Any private table in the `supabase_realtime` publication | 0 |
| Arbitrary SQL executor present (`execute_sql`, `run_sql`, `admin_query`, …) | 0 |
| Service-role reference in the admin client | 0 |
| Immutability triggers fire for the table owner | Verified for role history, assignment history, private notes, support history, incident timeline, configuration history, flag history, kill-switch events, staff audit, access log |

## Findings

### F1 — The build gate does not remove admin code from the bundle *(corrected)*

**Observed.** A web export with `EXPO_PUBLIC_ADMIN_SURFACE` unset still contains
the operations strings. Expo Router's file-based routing bundles every route
module regardless of the flag.

**Impact.** Low. The bundled code holds no secret, no credential, and no
capability; it calls named RPCs that refuse an unauthorized caller. The flag
makes the surface inert, not absent.

**Action taken.** Every document that claimed "a customer build ships without the
operations screens" was corrected to state what actually happens. A security
document that overstates a control is worse than one that omits it.

### F2 — Re-authentication is client-attested, not server-verified

**Observed.** `staff_reauthenticate` records that the client performed a
re-authentication for the current session. The server does not independently
verify a second factor, because no MFA provider is configured.

**Impact.** A compromised session that can drive the client can produce an
attestation. This is the reason production is fail-closed rather than a gap that
was overlooked.

**Control.** `staff_platform_production_requires_mfa` forbids selecting
`production` without `mfa_required`, and `mfa_provider` is constrained to
`'none'`, so `staff_platform_ready()` returns false in production today. Accepted
for local and staging; **blocking for production** until a provider is authorized
through its own specified change.

### F3 — Cross-domain reach through the legacy staff gate

**Observed.** `private.is_staff()` was widened so a WPS-017 grant does not require
a legacy `user_roles` row. Roles holding `legacy_domain_staff_actions`
(Verification Reviewer, Trust & Safety Reviewer, Dispute Reviewer, Financial
Operations, Operations Manager, Super Administrator) satisfy that gate, so a
Verification Reviewer could call a WPS-013 dispute RPC directly against the API.

**Impact.** Medium, bounded. It cannot reach a domain the legacy gate never
protected, it cannot escalate privileges, and every such call is still audited by
the domain's own trail. The admin UI never offers the cross-domain action.

**Why it was not fixed here.** Closing it means replacing `private.is_staff()`
with a per-domain capability check inside each locked domain WPS — a forward
change to WPS-006, 007, 011, 013, 015, and 016. Doing that inside WPS-017 would
have modified six locked specifications without their own review.

**Mitigation now.** Support Agent, Marketplace Operations, and Security
Administrator deliberately do not hold the capability and cannot reach any legacy
staff RPC at all. Verified by pgTAP in both directions.

**Recorded as** T8 in the threat model.

### F4 — The dormant support tables had unreachable policies

**Observed.** `public.support_tickets` and `public.support_messages` had RLS
enabled since WPS-001 but `authenticated` held no `SELECT`, so
`support_ticket_owner_read` could never evaluate. The feature had been dormant,
so nobody noticed.

**Action taken.** Activating support cases grants the missing `SELECT` and adds a
capability-scoped staff policy **alongside** the original owner policy, which was
left untouched. `anon` was explicitly revoked. Participant and staff visibility
are now covered by pgTAP: a participant sees one message where staff see two.

### F5 — Break-glass is unavoidable and therefore made visible

**Observed.** Super Administrator holds every capability by construction. No
technical control can prevent a break-glass holder acting.

**Control.** Every capability reachable only through the break-glass role is
flagged `break_glass` in the immutable audit, surfaced in the audit explorer, and
called out in the runbook as requiring exceptional, expiring, reviewed use.
Detection, not prevention, is the honest control here.

## Verified security properties

- **Server-derived identity.** Every RPC resolves `auth.uid()` itself. No client
  input decides who the caller is.
- **Deny by default.** `require_staff_capability` raises on unknown capability,
  unready platform, missing grant, suspended account, or stale re-authentication.
- **No self-approval.** A role cannot be granted to one's own account; a
  configuration version cannot be approved by its author. Both enforced in SQL.
- **No silent overwrite.** Row lock plus optimistic `lock_version`; a stale
  writer receives `40001`.
- **No enumeration.** Exact identifiers only, rate-limited before any read, with
  the raw term hashed before it reaches the access log.
- **No National ID exposure.** Not searchable, not projected, in any role.
- **No secret in configuration.** Secret-shaped keys rejected by the validator.
- **No security control as a feature flag.** Enforced by a CHECK constraint on
  the flag key.
- **Kill switches only restrict.** They operate the owning domain's control,
  record the prior state, and touch no history.
- **Immutable audit.** Ten tables raise on update and delete for the owner too.
- **Staff notifications are structurally isolated** from customer and worker
  inboxes by the existing WPS-014 visibility rule.
- **Nothing was enabled.** Push, token registration, schedulers, live gateway,
  and live payout modes are all still off; asserted negatively in both suites.

## Deployment verdict

| Environment | Verdict |
| --- | --- |
| Local | **Accepted.** All gates pass. |
| Staging | **Accepted once the migration is applied and the environment is set to `staging` deliberately.** |
| Production | **Blocked by design.** Requires an authorized MFA provider (F2) and a decision on F3. This is a constraint in the database, not a policy note. |
