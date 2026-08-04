# WPS-018 Acceptance Evidence — Production Readiness, Reliability & Launch Operations

| Field | Value |
| --- | --- |
| Specification | WPS-018 v1.0 |
| Engineering baseline | WES-018 v1.0 |
| Migration | `supabase/migrations/202608030001_wps018_production_readiness.sql` (local only) |
| Manual acceptance | **NOT RUN** — 44 WPS-018 cases, 486 consolidated |
| Hosted deployment | **Not applied** |
| Private beta | **NO-GO** |
| Production | **NO-GO** |

## Executed gates

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | Pass |
| ESLint | `npm run lint` | Pass |
| Mojibake | `npm run check:mojibake` | `No likely mojibake found.` |
| Whitespace | `git diff --check` | Clean |
| Secret scan | `npm run audit:secrets` | Clean — 436 tracked files, 38 commits |
| Migration audit | `npm run audit:migrations` | Clean — 33 migrations |
| Environment audit | `npm run audit:environment` | Clean — 5 variables, 20 routes, 6 assets, 0 notes |
| Bundle audit | `npm run audit:bundle` | Clean — 46 artefacts, 3 exports |
| Clean database reset | `supabase db reset` | Full chain through `202608030001` applied without error |
| Full pgTAP | `supabase test db` | **21 files / 1,831 assertions, `Result: PASS`** |
| WPS-018 pgTAP | single-file run | 136 assertions pass |
| WPS-018 client suite | `npm run test:wps018` | **454 checks pass** |
| All regression suites | 18 suites | 0 failures |
| Expo Doctor | `npx expo-doctor` | **18/18** |
| Android export | `--platform android --clear` | Exported |
| iOS export | `--platform ios --clear` | Exported |
| Web export | `--platform web --clear` | Exported |
| Migration ledger | `supabase migration list` | Through `202608020005` local **and** remote; `202608030001` local only |
| Non-mutating dry run | `supabase db push --linked --dry-run` | `202608030001` is the single pending migration; **no hosted mutation** |
| Production deployment | — | **Not performed** |

Totals before this work: 20 pgTAP files / 1,695 assertions, 17 regression
suites. WPS-018 adds a 136-assertion pgTAP suite and a 454-check client suite,
and grew the WPS-017 suite from 306 to 308 assertions when its fixture was
updated to present real signed session claims.

## Domain authority preserved

Twenty-two legacy staff RPCs were hardened by **renaming the original function
into `private` unchanged** and re-publishing a capability gate under the original
public name. Eight abuse-prone client RPCs were wrapped the same way for rate
limiting — thirty in total.

pgTAP asserts that all 22 keep their public name and signature, that 30
implementations were preserved verbatim in `private`, and that no client role can
call one directly.

**All nineteen pre-existing pgTAP suites pass with no assertion changed.** That is
the evidence that no WPS-006 through WPS-016 behaviour, error code, or message
drifted.

The only pre-existing suite that changed is WPS-017's, whose fixture now presents
the same `amr`/`aal`/`session_id` claims a real access token carries — because
the mechanism it tests is no longer a client attestation. Its assertion count
went **up**, from 306 to 308.

## Admin security closure — the nine required items

| # | Required | Evidence |
| --- | --- | --- |
| 1 | Replace client-attested re-authentication | `staff_auth_freshness_seconds()` reads the signed `amr` claim; a stale, absent, or unverifiable record is refused. Asserted. |
| 2 | Production MFA enforcement | `aal2` enforced per caller; Supabase TOTP selectable; production requires MFA by constraint. Asserted both directions. |
| 3 | Audit every legacy staff RPC | 22 identified and enumerated in the pgTAP structure section |
| 4 | Capability checks via forward-only migration | Rename-wrapper; no body rewritten |
| 5 | Narrow roles cannot reach privileged domains | A Verification Reviewer is refused on disputes, moderation, refunds, and payment summaries. Asserted. |
| 6 | Session invalidation after role removal | `staff_session_revoked()` checked on every capability; revocation beats a valid, fresh token. Asserted. |
| 7 | Periodic staff access review | `staff_access_reviews`, 90-day interval, overdue reporting, self-review refused. Asserted. |
| 8 | Dual control for irreversible actions | Permanent bans and refunds; requester ≠ approver by CHECK; single-use with a retry window. Asserted. |
| 9 | Admin routes inaccessible without server authorization | Three gates; the bundled route is explicitly **never** a security boundary |

## Environment model

Four environments with immutable change history. Production is constrained
closed on three axes — MFA required, no legacy staff gate, no disabled dual
control — each verified by a refused `UPDATE` in pgTAP.

## Rate limiting

Nineteen audited surfaces, each declaring where its limit actually lives. Exactly
one (`provider_webhook`) is recorded as an open gap, and `verify_platform_release()`
**deliberately fails on it** so the gap cannot be forgotten.

Verified: the third report in a two-per-window policy is refused by the server
with SQLSTATE 53400; every limiter subject is stored only as a SHA-256 hash; no
raw account identifier reaches the counter table.

## Observability

Redaction enforced at write time. Verified that a payload containing
`access_token` is replaced with `{"redacted": true}` and that the secret never
reaches the log table. Seven streams declare retention and a named owner; none
contains personal data.

**No external observability provider is selected or enabled.**

## Nothing was enabled

Asserted negatively in both suites: push delivery, push token registration, the
notification scheduler, the payment gateway, payout mode, the earnings release
scheduler, and the marketplace all remain disabled. No live or sandbox provider
mode is selected anywhere.

## Defect found and fixed during this work

**The CI bundle scan would have failed every build.** It searched for the literal
`sb_secret_`, which appears in `@supabase/supabase-js`'s own client-side guard
that *refuses* secret keys. A naive fix still failed on Hermes bytecode, which
packs string literals contiguously. Replaced with `scripts/audit-bundle.mjs`,
which matches credential **values** and is verified in both directions: clean on
46 real artefacts, and it catches a planted secret key and a planted service-role
JWT. Recorded as F1 in the security review.

## Remaining blockers

Private beta — eight, none of them code: 0 of 486 manual cases executed, no
hosted staging project, no SMS provider, no verified backup or performed restore,
no legal review, no company structure, nobody rostered, zero device testing.

Production — a further nine: payment provider deferred, payout licensing
unresolved, no webhook deployed, no load test executed, 16 accepted transitive
advisories, no store assets, no verified domain, no push provider, no web host.

Full detail: `docs/launch/READINESS-GAP-REGISTER.md` and
`docs/testing/WPS-018-LAUNCH-READINESS.md`.

## What is not claimed

- No manual acceptance. All 44 WPS-018 cases and all 486 consolidated cases are
  **NOT RUN**. Two WPS-018 cases are structurally blocked with no staging project.
- No device acceptance. Zero real-device runs exist across every WPS.
- No performance measurement. Budgets and a method exist; **no p95 exists**.
- No penetration testing and no compliance certification.
- No legal approval of any kind.
- No backup verification and no restore has ever been performed.
- No hosted migration applied by this work and no production deployment performed.
