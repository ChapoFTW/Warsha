# Admin Platform Threat Model

Authority: Warsha Constitution → WPS-017 → WES-017.
Scope: `supabase/migrations/202608020005_wps017_operations_analytics_admin.sql`,
`src/admin/*`, `app/admin/*`.

This is an internal engineering threat model. **No compliance certification is
claimed or implied.**

## Assets

| Asset | Why it matters |
| --- | --- |
| Staff capability set | Grants the ability to act on other people's accounts |
| Customer and worker personal data | Contact details, standing, booking and dispute history |
| Financial state | Ledger totals, earnings, withdrawals, refunds, reconciliation |
| Private evidence and staff notes | Reveals reporters and investigative reasoning |
| Configuration and feature flags | Can change marketplace and money behaviour platform-wide |
| Immutable audit | The only record of what staff did |

## Trust boundaries

1. Anonymous internet → PostgREST. `anon` holds no execute on any staff RPC and
   no select on any WPS-017 table.
2. Authenticated non-staff → staff surface. Every RPC re-checks capability;
   `get_staff_session` returns `{isStaff:false}` and no configuration.
3. Staff → other staff's domain. Capabilities are per-domain; queue rows are
   filtered by RLS using the queue's owning capability.
4. Staff → database. No service-role path, no SQL executor, no dispatcher.

## Threats and controls

### T1 — Privilege escalation by a staff member

*Vector:* a Support Agent grants themselves an elevated role, or edits the
capability map.

**Controls.** `manage_staff_roles` is held only by Security Administrator and
break-glass. `staff_grant_role` refuses when `p_user_id = auth.uid()` —
self-granting is impossible at any privilege level. `authenticated` holds no
`INSERT`/`UPDATE` on `staff_roles`, `staff_capabilities`,
`staff_role_capabilities`, or `staff_role_grants`. Role history is immutable by
trigger, so a grant cannot be back-dated or rewritten.

*Residual.* Two colluding Security Administrators can escalate each other. This
is inherent to any two-person model and is mitigated by immutable audit and the
break-glass flag, not prevented.

### T2 — Staff account compromise

*Vector:* a stolen staff session is used to take a high-risk action.

**Controls.** High-risk capabilities require a re-authentication attestation
recorded against the specific session, expiring on a configurable window.
`staff_revoke_my_sessions` and role revocation both clear attestations
immediately. A suspended or banned account resolves to zero capabilities on the
next call. Every privileged action is audited with actor and environment.

*Residual — stated plainly.* The attestation records that the **client**
performed a re-authentication; the server does not independently verify a second
factor, because no MFA provider is configured. A compromised session that can
drive the client can therefore produce an attestation. This is why production is
constrained closed until an MFA provider is authorized: the constraint
`staff_platform_production_requires_mfa` plus `mfa_provider = 'none'` makes
`staff_platform_ready()` false in production today.

### T3 — Insecure direct object reference (IDOR)

*Vector:* a reviewer changes an identifier in a request to read a case, account,
export, or incident they should not see.

**Controls.** Every read RPC resolves the record first, then derives the
required capability from the record (for a case, from its queue) and calls
`require_staff_capability`. RLS applies the same rule to direct table reads.
`staff_export_preview` additionally checks `requested_by = auth.uid()`, so one
staff member cannot download another's export.

### T4 — Service-role exposure

*Vector:* a service-role key reaches a browser or mobile bundle.

**Controls.** There is no server component in this project and no admin client.
The admin repository uses `getSupabaseClient()` — the same anon client as the
customer app. `.env.example` states the prohibition twice. The regression suite
asserts that neither `src/admin/admin-repository.ts` nor
`src/admin/admin-context.tsx` mentions a service role.

### T5 — Bulk data scraping

*Vector:* a staff account enumerates accounts, contacts, or bookings at scale.

**Controls.** Search accepts exact identifiers only — no wildcard, no prefix scan
over names, no pattern. Free-text lookup is limited to an exact verified phone or
email and needs `view_contact_details`. A per-minute rate limit is checked
**before any read**. Queue and audit reads are paginated and capped. Analytics
return aggregates with a minimum cell size. Exports are capped, allowlisted, and
audited.

*Residual.* A determined operator with `safe_search` can still enumerate slowly
within the rate limit. Detection is the control: every search is recorded with
actor, timestamp, kind, and result count, and the raw term is hashed so the log
itself is not a second copy of the data.

### T6 — Unauthorized search and unauthorized export

*Vector:* a role without the capability reaches search or export.

**Controls.** Both are capability-gated; export additionally requires
re-authentication, a bounded range, a written reason for sensitive reports, a
column allowlist, an expiry, and revalidation of authorization on every
download. `anon` holds execute on neither.

### T7 — Audit tampering

*Vector:* someone edits or deletes the record of what they did.

**Controls.** `staff_audit_events`, `staff_access_log`,
`operational_assignment_events`, `operational_case_notes`, `support_ticket_events`,
`operational_incident_events`, `staff_feature_flag_history`,
`staff_kill_switch_events`, and `staff_configuration_versions` all raise on
update and delete via triggers that fire **for the table owner too**, so the
guarantee does not depend on the grant layer. The audit explorer is read-only and
its own access is logged.

### T8 — Role self-escalation through the legacy gate

*Vector:* the pre-WPS-017 `private.is_staff()` gate is used to bypass capability
checks.

**Controls.** `is_staff()` was **widened, never narrowed**: every account that
passed before still passes, so no existing behaviour changed. It additionally
recognizes a WPS-017 member holding `legacy_domain_staff_actions` — a capability
deliberately withheld from Support Agent, Marketplace Operations, and Security
Administrator, none of whom can therefore reach any legacy domain staff RPC.

*Residual — stated plainly.* Among the roles that **do** hold
`legacy_domain_staff_actions` (Verification Reviewer, Trust & Safety Reviewer,
Dispute Reviewer, Financial Operations, Operations Manager, Super Administrator),
WPS-017 cannot prevent a cross-domain call to a legacy staff RPC made directly
against the API — a Verification Reviewer could call a dispute RPC. Closing this
requires replacing `private.is_staff()` with a per-domain capability check inside
each locked domain WPS, which is a forward change to those specifications and is
deliberately out of scope for WPS-017. The admin UI never offers the cross-domain
action, and every such call is still audited by the domain's own audit trail.

### T9 — Approval bypass and configuration sabotage

*Vector:* an operator activates their own configuration change, or stores a
secret, or edits history to hide a change.

**Controls.** `staff_activate_configuration` refuses when
`created_by = auth.uid()`. Approval requires `approve_configuration`, which the
authoring roles do not hold. Payload validation allowlists keys per domain,
rejects nested objects and oversized strings, and rejects any key matching
`secret|token|password|credential|signature|api_key|private_key`. History is
immutable; an activated payload cannot be rewritten; rollback creates a new
corrective version that follows the same approval path.

### T10 — Cross-environment action and accidental production mutation

*Vector:* an operator acts on production believing they are on staging.

**Controls.** The environment is stored server-side, returned in the session,
rendered as a persistent badge, and shown as a red alert banner in production.
Configuration versions and feature flags are keyed by environment. Every audit
row and kill-switch event records the environment. Production is fail-closed
today.

### T11 — Private-note leakage

*Vector:* a participant or an unauthorized role reads staff-private reasoning.

**Controls.** Case notes live in `private.operational_case_notes` with no client
grant at all, reachable only through `get_staff_case` behind the queue's
capability. Support staff notes use `visibility='staff'` and are excluded from
`get_my_support_cases` and from the participant RLS branch. The pgTAP suite
asserts a participant sees exactly one message where staff see two.

### T12 — Financial operation abuse

*Vector:* a staff member moves money.

**Controls.** WPS-017 writes no ledger entry, creates no payment, and mutates no
payment status. Financial capabilities gate **inspection and queueing**; the
decision stays in WPS-007/WPS-015 RPCs with their own controls. `initiate_refund`
is high risk, requires re-authentication, and is marked dual control. Real
providers remain disabled.

### T13 — Mass suspension

*Vector:* one compromised or malicious account restricts many people at once.

**Controls.** WPS-017 issues no enforcement action of any kind — WPS-016 remains
the only path, and it already requires evidence, a reason, a human actor for a
ban, and an investigated report. WPS-017 exposes no bulk action and no
multi-subject mutation anywhere.

### T14 — Session persistence after role removal

*Vector:* a departing staff member keeps working from an open session.

**Controls.** Capabilities are resolved live from `staff_role_grants` on every
call; there is no cached claim. `staff_revoke_role` sets `revoked_at` and clears
the account's session attestations in the same transaction. The pgTAP suite
asserts that the next `get_staff_session` reports `isStaff:false` and
`reauthValid:false`.

### T15 — Kill switch misuse

*Vector:* a switch is used to damage the platform or to enable something.

**Controls.** A switch can only restrict. Activation records the prior state;
clearing restores only that recorded value. Nothing in the switch path deletes a
row, touches immutable history, or affects an existing booking, conversation, or
ledger entry. Where a domain owns the control, the switch operates the domain's
own column rather than shadowing it. Every change requires the capability,
re-authentication, a reason, and is audited with the environment.

## Controls summary

Server-derived identity · capability check on every action · RLS on every public
WPS-017 table · private schema with zero client grants · minimal grants · empty
`search_path` on every `SECURITY DEFINER` function · fully qualified references ·
row locking plus optimistic versioning · immutable audit and access log ·
idempotency on every mutation · confirmation and re-authentication for dangerous
actions · dual control on role grants and configuration activation · sanitized
hand-written projections · search rate limiting with hashed terms · bounded
analytics with minimum-cell suppression · allowlisted, expiring, revalidated
exports · environment badge · fail-closed production.

## Open items

| Item | Status |
| --- | --- |
| MFA provider | Not selected. Production stays closed by constraint. |
| Per-domain capability gating of legacy staff RPCs | Deferred; needs a forward change in each domain WPS (T8). |
| Export file delivery | Not implemented; no pipeline exists to leak through. |
| Support case attachments | Deferred; no bucket or policy created. |
| Automated anomaly detection on staff behaviour | Not implemented and not claimed. The access log makes it possible later. |
