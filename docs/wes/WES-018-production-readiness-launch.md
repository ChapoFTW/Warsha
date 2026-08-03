# WES-018 — Production Readiness, Reliability & Launch Operations (Engineering)

## Document metadata

| Field | Value |
| --- | --- |
| Specification | WES-018 |
| Version: 1.0 | |
| Status: ENGINEERING BASELINE | |
| Implements: WPS-018 | |
| Authority: Constitution → domain WPS (001–016) → WPS-017 → WPS-018 → WES-018 | |
| Owner | Sief Abdelghfar |
| Migration | `supabase/migrations/202608030001_wps018_production_readiness.sql` |

## Design rules

1. **Move, never rewrite.** A pre-existing staff RPC is hardened by renaming the
   original function into `private` and re-publishing a thin gate under the
   original public name. The domain body is byte-identical, so no behaviour,
   error code, or message can drift.
2. **Verify, never accept.** Session freshness and assurance come from claims the
   identity provider signed and PostgREST verified. Nothing the client says is
   trusted.
3. **Fail closed everywhere.** No verifiable authentication record means no
   freshness. Unreadable platform status means maintenance. An unknown rate-limit
   policy raises rather than allowing traffic.
4. **Constrain, do not document.** Production's guarantees are CHECK constraints:
   MFA required, no legacy gate, no disabled dual control.
5. **Be honest in the artefact.** Where a control cannot work — a rejection that
   must roll back — the code says so in a comment and the tests assert the honest
   behaviour instead of pretending.

## The rename-wrapper technique

```sql
alter function public.moderate_review(uuid,text,text) rename to moderate_review_impl;
alter function public.moderate_review_impl(uuid,text,text) set schema private;
revoke all on function private.moderate_review_impl(uuid,text,text)
  from public, anon, authenticated;

create or replace function public.moderate_review(p_review_id uuid, p_action text, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_domain_staff_write('moderate_reviews');
  return private.moderate_review_impl(p_review_id, p_action, p_reason);
end $$;
```

Thirty functions were treated this way: twenty-two staff RPCs gaining a
capability gate, and eight abuse-prone client RPCs gaining a rate limit.
`ALTER FUNCTION … RENAME` preserves the owner, the `SECURITY DEFINER` marking,
and the pinned `search_path`, so the security posture of the original is carried
across intact. No internal caller existed for any of them, which was verified
before the change.

## Schema

### Private (no client grants, not in Realtime)

| Table | Purpose |
| --- | --- |
| `platform_environment_events` | Immutable environment and launch-phase history |
| `staff_dual_control_requests` | Approval tickets; requester ≠ approver enforced by CHECK |
| `staff_access_reviews` | Immutable review decisions per grant |
| `rate_limit_policies` | Nineteen audited surfaces, each naming its enforcement owner |
| `rate_limit_events` | Hashed-subject counters, opportunistically pruned |
| `rate_limit_saturation_events` | Durable early-warning signal |
| `operational_log_events` | Structured events with correlation id and redacted payload |
| `observability_retention_policy` | Retention, owner, and personal-data flag per stream |

### Configuration extensions

`staff_platform_configuration` gains `launch_phase`, `expected_project_ref`,
`legacy_staff_rpc_grace_enabled`, `dual_control_enabled`,
`access_review_interval_days`, and `session_registry_enabled`, plus four
constraints that make production structurally safe.

## Functions

### Session security

| Function | Behaviour |
| --- | --- |
| `staff_auth_freshness_seconds()` | Seconds since the most recent `amr` timestamp; NULL when unverifiable |
| `staff_assurance_level()` | The `aal` the identity provider granted |
| `staff_session_revoked()` | True when this session was explicitly revoked |
| `staff_mfa_satisfied()` | True when MFA is not required, or `aal2` was granted |
| `staff_recent_reauth(uuid)` | Not revoked, MFA satisfied, and freshness within the window |
| `require_staff_capability(text)` | WPS-017 contract plus revocation and MFA |

### Domain gating

| Function | Behaviour |
| --- | --- |
| `require_domain_staff(text)` | WPS-017 staff need the capability; a pre-WPS-017 account keeps historic access outside production. Preserves the exact `42501` / `Staff access required` contract every domain suite asserts |
| `require_domain_staff_write(text)` | The above plus the privileged-action rate limit |
| `staff_has_wps017_grant(uuid)` | Distinguishes the two populations |

### Dual control, review, limiting, logging, verification

`consume_dual_control` (single-use, with a five-minute retry window so an
idempotent retry is not punished), `staff_request_dual_control`,
`staff_approve_dual_control`, `get_staff_access_review`,
`staff_record_access_review`, `enforce_rate_limit`, `rate_limit_subject_hash`,
`operational_payload_safe`, `record_operational_event`, `verify_platform_release`.

## Concurrency and idempotency

`consume_dual_control` takes `FOR UPDATE`, refuses an unapproved, expired, or
already-consumed ticket, and allows re-consumption within five minutes so a
client retry of an idempotent RPC is not rejected as a second action.

`enforce_rate_limit` counts before it writes, so a caller already at the limit
does not extend their own lockout by retrying.

## CI/CD

`.github/workflows/validate.yml` — four parallel jobs on every pull request:
static analysis and audits, regression suites, migrations and pgTAP, and Expo
Doctor plus three exports. Read-only permissions, concurrency cancellation,
lockfile-exact `npm ci`, **no secret referenced anywhere**, and a scan of the
exported bundles for credential shapes.

`.github/workflows/deploy-database.yml` — manual dispatch only, with a typed
confirmation, a protected-branch guard, a GitHub environment for approval and
credentials, ledger comparison, a mandatory dry run, a required recorded restore
point, and post-migration verification. It deploys **only** schema; it never
builds or ships a client.

## Audit scripts

| Script | Enforces |
| --- | --- |
| `audit:secrets` | Credential shapes across every tracked file and all 37 commits; tracked env files and signing artefacts |
| `audit:migrations` | Ordering, naming, forward-only structure, pinned `search_path`, the `pg_catalog.extract` grammar defect, and modification of already-committed migrations |
| `audit:environment` | Undeclared or non-public environment reads, public-prefixed secrets, unregistered routes, unguarded admin screens, missing or superseded assets, and EAS profile completeness |

All three found real defects on their first run.

## Client architecture

| Module | Responsibility |
| --- | --- |
| `src/launch/launch-types.ts` | Environments, phases, the fifteen-row activation matrix, the seventeen-row secret inventory, and pure helpers (`isRateLimited`, `classifyStaffRefusal`, `environmentAllowsRiskyAction`, `secretIsBundleSafe`) |
| `src/launch/platform-status-repository.ts` | Platform status with fail-closed maintenance on any read failure |
| `src/admin/admin-types.ts` | `StaffSession` extended with launch phase, assurance level, MFA state, freshness, and revocation |

## Test coverage

- `supabase/tests/database/production-readiness-launch.test.sql` — 136
  assertions covering the environment constraints and immutable history, verified
  freshness including the unverifiable-token case, MFA enforcement in both
  directions, session revocation beating a valid token, the closed cross-domain
  gap, legacy grace on and off, dual control including self-approval refusal and
  the preserved WPS-016 evidence rule, access review and self-review refusal,
  rate limiting with hashed subjects, redaction of eight forbidden payload
  shapes, release verification reporting an honest failure, and every
  disabled-provider guarantee.
- `scripts/wps018-production-readiness.test.mts` — launch contracts, activation
  matrix completeness, secret inventory completeness with no embedded value, CI
  gate coverage, deployment guard coverage, mobile and web configuration,
  document substance, fail-closed client behaviour, and the motto regression.

## Deferred

- Hosted staging project, SMS provider, backup verification, and device testing.
- Payment and payout providers, webhook endpoint, push provider, web host, and
  verified domain.
- Load execution; only budgets and a method exist.
- Sixteen transitive dependency advisories; `npm audit fix --force` would break
  the Expo toolchain and was deliberately not run.
- Removal of the legacy grace path once no pre-WPS-017 staff account remains.

## Changelog

- 2026-08-03 — Version 1.0. Initial engineering baseline.
