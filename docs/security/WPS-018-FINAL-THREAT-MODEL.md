# WPS-018 Final Cross-Platform Threat Model

Authority: Warsha Constitution → WPS-018.
Scope: mobile client, web client, admin client, Supabase Auth, PostgreSQL and
RLS, Storage, Realtime, Edge Functions, payment webhooks, provider callbacks,
GitHub and CI, EAS, web hosting, staff accounts, secrets, backups, exports, logs.

**No penetration testing has been performed and none is claimed. No compliance
certification is claimed.** This is an internal engineering threat model written
by the team that built the system, with the blind spots that implies.

## Method

Executed against a clean local reset: 21 pgTAP suites and 1,831 assertions, three
audit scripts, three cache-cleared exports, and direct inspection of the exported
bundles and the git history. Every claim below is something that was run, not
something that was reasoned about.

## Surface by surface

### Mobile client

| Threat | Control | Residual |
| --- | --- | --- |
| Reverse engineering the bundle | No secret is bundled; the anon key is public by design and constrained by RLS | The app's RPC surface is discoverable. Every RPC authorizes server-side, so discovery gains nothing. |
| Admin code in a customer build | Verified present; it holds no secret and grants no access | **Accepted and documented.** A bundled route is never treated as a security boundary. |
| Tampered client | Every action re-authorized server-side by capability and RLS | A determined user can call any RPC as themselves. That is the design assumption. |
| Local storage theft | Sessions in `expo-secure-store`, Keychain/Keystore-backed | A rooted or jailbroken device is out of scope |
| No OTA rollback | Deliberate; mitigation is server-side flags and switches | A client bug that cannot be neutralised server-side is slow to fix. Recorded in the rollback plan. |

### Web client

| Threat | Control | Residual |
| --- | --- | --- |
| XSS | React escaping; no `dangerouslySetInnerHTML`; no inline script | **CSP is undefined** because the host is undecided (G35) |
| Clickjacking | Frame denial required by the launch plan | **Not configured** — no host |
| Token theft via storage | `localStorage` on web, which XSS can reach | Mitigated by the absence of injection surfaces; CSP will harden it. Honest residual. |
| Indexed staff surface | Staff surface never served on a customer deployment; robots rules required | **Not configured** — no host |

### Admin client

Covered in depth in `docs/security/admin-threat-model.md`. WPS-018 closes its
three residual findings: client-attested re-authentication, no MFA provider, and
cross-domain reach through `private.is_staff()`.

| Threat | Control after WPS-018 |
| --- | --- |
| Forged re-authentication | Freshness comes from the signed `amr` claim; an unverifiable token has no freshness and is refused |
| Missing second factor | `aal2` enforced per caller; production cannot be selected without requiring it |
| Cross-domain reach | Each of 22 legacy staff RPCs now requires its specific capability |
| Stolen session | Revocation checked on every capability; revocation beats a valid, fresh token |
| Single-actor irreversible action | Dual control on permanent bans and refunds, requester ≠ approver enforced in SQL |
| Accumulated access | 90-day review, overdue reporting, no self-review |

**Residual:** two colluding Security Administrators can escalate each other.
Inherent to a two-person model; mitigated by immutable audit and the break-glass
flag, not prevented.

### Supabase Auth

| Threat | Control | Residual |
| --- | --- | --- |
| Credential stuffing | GoTrue throttling; policy recorded in the limiter table | Not independently verified |
| Worker credential abuse | Phone/password broker is rate-limited and returns generic failures | Synthetic Auth identity is service-role-only and never a contact projection |
| Session fixation | GoTrue session handling; `session_id` used for revocation | — |
| Privilege via metadata | No authorization decision reads user metadata | — |

### PostgreSQL and RLS

| Threat | Control |
| --- | --- |
| Direct table access | RLS on every public table; the release verification asserts it |
| Private schema exposure | Zero grants to `anon`, `authenticated`, or `PUBLIC`; asserted |
| `search_path` hijack | Every SECURITY DEFINER function pins a search path; asserted across the whole database |
| Arbitrary SQL | No executor, no dispatcher, no raw query surface; asserted |
| IDOR | Every read resolves the record then derives the required capability |
| Enumeration | Exact identifiers only, rate-limited before any read, terms hashed in the log |

### Storage

| Threat | Control | Residual |
| --- | --- | --- |
| Private document access | Owner-or-staff policies per bucket | — |
| Path traversal | Server-side path validation in WPS-013 evidence handling | — |
| **Loss** | — | **Storage is not covered by database backups (G22).** Documents, evidence, and media are currently unrecoverable. |

### Realtime

No private table is published. No WPS-017 or WPS-018 table is published.
Asserted in both suites.

### Edge Functions and webhooks

None deployed. `provider_webhook` is the single rate-limit policy recorded as an
open gap, and `verify_platform_release()` fails on it **deliberately** so the
gap cannot be forgotten.

When a webhook is deployed, WPS-015 already verifies signature, replay window,
environment, allowlist, amount, and currency, and quarantines what fails.

### GitHub and CI

| Threat | Control |
| --- | --- |
| Secret in a workflow | `validate.yml` references no secret at all; asserted by the regression suite |
| Deployment from an unreviewed branch | Protected-branch guard in the deploy workflow, plus branch protection |
| Unapproved production change | GitHub environment with required reviewers |
| Secret in a log | No secret is available to the validation jobs |
| Poisoned dependency | `npm ci` is lockfile-exact; no `npm install` in CI |
| Secret committed | `audit:secrets` over every tracked file and all 37 commits |

**Residual:** a compromised GitHub account with write access to a protected
branch could merge a malicious change. Mitigated by required review, not
prevented. Branch protection is **not yet configured on the remote** (G08 note).

### EAS

Signing keys live in EAS managed credentials so no human handles them. **The
Android upload keystore is unrecoverable if lost** — recorded in the backup and
store runbooks.

### Secrets

Seventeen inventoried by name, owner, storage, and rotation. No value anywhere.
A key that must not be bundled may never carry the public prefix, and the
environment audit fails the build if one does. The secret scanner looks for
shapes, not values, so it can never become a place a secret lives.

**Residual:** no rotation has ever been performed (R12).

### Backups

**The largest residual risk in this document.** No backup has been verified, no
restore has been performed, and storage is not covered at all. Until the staging
drill runs, RTO is unknown and recoverability is unproven.

### Exports

Role-gated, reason-required, bounded, column-allowlisted, expiring, and
revalidated on every download. No file delivery pipeline exists, so there is
nothing to leak through one.

### Logs

Redaction is enforced at write time, not export time: forbidden keys, email
addresses, Egyptian phone numbers, JWT-shaped strings, over-long values, and
nested objects are all rejected, and the payload is replaced rather than the
event dropped. Every stream declares retention and a named owner. No declared
stream contains personal data.

## Residual risk register

| # | Risk | Severity | Status |
| --- | --- | --- | --- |
| RR1 | Storage objects are unrecoverable | **High** | Open (G22) |
| RR2 | No backup has been restored; RTO unknown | **High** | Open (G22) |
| RR3 | Nothing detects anything; response depends on a human noticing | **High** | Open (G25) |
| RR4 | 2 high, 14 moderate transitive advisories | Medium | Accepted; breaking fix refused (G31) |
| RR5 | No CSP or security headers; host undecided | Medium | Open (G35) |
| RR6 | Two colluding administrators can escalate | Medium | Inherent; detected, not prevented |
| RR7 | Legacy staff accounts work outside production | Low | By design; forbidden in production; remove the path when none remain (G36) |
| RR8 | A rate-limit rejection cannot be durably recorded | Low | Documented; saturation recorded instead (G37) |
| RR9 | Web `localStorage` token is XSS-reachable | Low | No injection surface today; CSP will harden |
| RR10 | Branch protection not yet configured on the remote | Medium | Open |
| RR11 | No independent security review | Medium | Decision pending (R14) |
| RR12 | Admin code ships in every bundle | Low | Accepted and documented |

## Verdict

The **enforced** security posture is strong and, importantly, enforced by
database constraints and immutable structures rather than by convention: an
operator cannot select production without MFA, cannot keep the legacy staff gate,
cannot disable dual control, cannot approve their own change, and cannot edit an
audit record.

The **operational** security posture is not ready. Nothing is monitored, nothing
has been restored, and no rotation or access review has been performed. Those are
not code problems and no amount of passing tests will close them.

Production is NO-GO. That verdict comes from RR1, RR2, and RR3, not from the
codebase.
