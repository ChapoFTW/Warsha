# Warsha Launch Readiness Gap Register

Authority: Warsha Constitution → WPS-018.
Compiled: 2026-08-03, before WPS-018 implementation.
Method: repository audit, executed database probes, executed dependency audit,
executed export inspection. Nothing below is inferred from a passing test.

**Automated tests passing is not readiness.** At the time of this audit Warsha
had 1,695 passing pgTAP assertions, 17 passing regression suites, and three
passing platform exports — and could not have been launched, for the reasons
below.

Severity: **B** blocks private beta · **P** blocks production · **W** watch.

## Closed by WPS-018

| # | Gap | Sev | Evidence at audit | Closed by |
| --- | --- | --- | --- | --- |
| G01 | High-risk staff re-authentication was client-attested | P | `staff_reauthenticate` inserted an attestation on request; WPS-017 F2 recorded it | Server-verified `amr` freshness; a stale or unverifiable token is refused |
| G02 | No MFA provider; production admin permanently closed with no path | P | `mfa_provider` constrained to `'none'` | Supabase TOTP is now selectable; `aal2` enforced per caller |
| G03 | 22 legacy staff RPCs gated only by `private.is_staff()` | P | A Verification Reviewer could call a dispute or refund RPC directly | Each RPC renamed into `private` unchanged and re-published behind its domain capability |
| G04 | Narrow roles could reach financial, moderation, and dispute operations | P | Same as G03 | Capability gate; proven in both directions by pgTAP |
| G05 | Session invalidation depended on token expiry | P | Revocation cleared an attestation the client could recreate | `staff_session_revoked()` is checked on every capability |
| G06 | No periodic staff access review | P | No table, no cadence, no owner | `staff_access_reviews` with an interval, overdue reporting, and no self-review |
| G07 | No dual control on irreversible actions | P | Refunds and bans were single-actor | Approval tickets with a distinct approver, enforced in SQL |
| G08 | No CI/CD of any kind | B | No `.github/` directory existed | `validate.yml` (7 gate groups) and `deploy-database.yml` (manual, environment-approved) |
| G09 | No secret scanning | P | No scanner; history never checked | `audit:secrets` over 406 tracked files and 37 commits |
| G10 | No migration-order or forward-only enforcement | B | Manual review only | `audit:migrations`, including the `pg_catalog.extract` defect that broke a WPS-014 push |
| G11 | No route, asset, or environment audit | B | Manual review only | `audit:environment`; found two real defects on first run |
| G12 | No server-side rate limiting outside marketplace and staff search | P | Only two surfaces had limits | 19 policies, a server-authoritative limiter, and an explicit owner per surface |
| G13 | No structured observability, no redaction policy, no retention | P | Only domain audit tables existed | `operational_log_events` with write-time redaction, retention, and named owners |
| G14 | No post-deployment verification | P | "The migration applied" was the only signal | `verify_platform_release()` with 12 structural checks |
| G15 | Single environment model; one project treated as everything | P | `environment` allowed 3 values, defaulted local, unenforced | Four environments, immutable change history, production constrained closed |
| G16 | No iOS bundle identifier or Android application id | B | `app.json` had neither; no store build was possible | `com.warsha.app` on both, runtime version policy set |
| G17 | Single skeletal EAS profile set with no channels or environments | B | `eas.json` had three empty profiles | Profiles with channels and non-secret environment switches |
| G18 | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` read but undeclared | W | Found by `audit:environment` | Declared in `.env.example` |

## Open — blocking private beta

| # | Gap | Sev | Detail | Owner |
| --- | --- | --- | --- | --- |
| G19 | **All manual suites are NOT RUN** | B | WPS-007 through WPS-018: 0 of ~600 cases executed. This is the single largest blocker. | Owner |
| G20 | No hosted staging project | B | One Supabase project exists. The environment model is enforced in code but has nowhere to be enforced. | Operations Manager |
| G21 | No SMS provider | B | Worker phone OTP cannot be delivered. Workers cannot sign in on a real device. | Operations Manager |
| G22 | No backup verification | B | Supabase plan and PITR availability unconfirmed; no restore has ever been performed. A backup that has never been restored is a hope. | Security Administrator |
| G23 | No legal review of any document | B | Terms, privacy policy, worker and customer terms, refund and dispute policy all absent or unreviewed. | Owner |
| G24 | No company structure or tax position | B | Egyptian entity, invoicing, and tax treatment unresolved. | Owner |
| G25 | No incident on-call or contact path | B | Runbooks name roles; no human is rostered and no channel exists. | Operations Manager |
| G26 | No physical-device testing | B | Zero iOS or Android device runs recorded across every WPS. | Owner |

## Open — blocking production

| # | Gap | Sev | Detail | Owner |
| --- | --- | --- | --- | --- |
| G27 | Payment provider undecided | P | `docs/decisions/payment-provider-selection.md` remains DEFERRED; every unknown is commercial or legal. | Owner |
| G28 | Payout licensing unresolved | P | Marketplace disbursement licensing in Egypt is not established. | Owner |
| G29 | No webhook endpoint deployed | P | `provider_webhook` is the one rate-limit policy recorded as an open gap, and `verify_platform_release()` fails on it deliberately. | Financial Operations |
| G30 | No load test executed | P | Budgets and a method exist; no measurement does. No p95 is claimed anywhere. | Operations Manager |
| G31 | 16 dependency vulnerabilities | P | 14 moderate, 2 high, all transitive through the Expo toolchain (`brace-expansion`, `postcss`, `tar`, `uuid`). No direct dependency is affected. `npm audit fix --force` would break the toolchain and was not run. | Operations Manager |
| G32 | No store listing assets or copy | P | No screenshots, descriptions, content rating, or privacy nutrition labels. | Owner |
| G33 | No verified web domain | P | Universal and app links cannot be configured without a domain Warsha controls. Only the custom scheme works. | Operations Manager |
| G34 | Push provider undecided | P | APNs and FCM credentials do not exist. | Operations Manager |
| G35 | No web hosting decision | P | Expo web on Vercel vs EAS Hosting undecided; CSP, headers, and cache policy unwritten. | Operations Manager |

## Open — watch

| # | Gap | Detail |
| --- | --- | --- |
| G36 | `private.is_staff()` remains reachable by pre-WPS-017 `user_roles` accounts outside production | Grace is on in local and staging by design so no existing suite changed. Production forbids it by constraint. Remove the grace path once no legacy account remains. |
| G37 | A rate-limit **rejection** cannot be durably recorded | It must roll back with the transaction it aborts. Saturation — the accepted call that fills the bucket — is recorded instead. Documented, not hidden. |
| G38 | Analytics compute on read | Acceptable at current volume. Materialization triggers are recorded in the performance plan. |
| G39 | Support case attachments deferred | No bucket or policy created; the contract fails closed. |
| G40 | Export file delivery not implemented | No signed-URL pipeline exists, so nothing can leak through one. The bounded preview is the approved output. |

## Verdict at audit

Private beta: **blocked** by G19–G26.
Production: **blocked** by G19–G35.

Neither verdict changes because a test suite is green.
