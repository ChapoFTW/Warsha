# WPS-009 Acceptance Evidence

Overall evidence status: **LOCAL AUTOMATED VALIDATION PASSED; LINKED LEDGER/DRY-RUN BLOCKED BY SUPABASE TRANSPORT; MANUAL EVIDENCE NOT RUN**

This register maps AC-009 to intended evidence. It must be updated only with exact commands/results and real manual artifacts. The presence of implementation is not proof of hosted deployment or manual acceptance.

| AC range | Automated evidence target | Manual cases | Current status |
| --- | --- | --- | --- |
| AC-009-001–004 | TypeScript lifecycle; pgTAP activation/cross-account | M009-001–005, 038–039 | Automated **PASS**; manual **NOT RUN** |
| AC-009-005–009 | pgTAP cancellation/completion/dispute/Rescue | M009-026–034 | Automated **PASS**; manual **NOT RUN** |
| AC-009-010–016 | pgTAP send/idempotency/forge/reminder; WPS009 script | M009-006–014 | Automated **PASS**; manual **NOT RUN** |
| AC-009-017–022 | Bucket/RLS/catalog tests; typecheck/exports | M009-015–022 | Automated **PASS**; manual **NOT RUN** |
| AC-009-023–029 | pgTAP inbox/unread/typing/notification; realtime static test | M009-004–005, 023–025, 041–045 | Automated **PASS**; manual **NOT RUN** |
| AC-009-030–031 | pgTAP disabled relay; no-dialer static test | M009-035 | Automated **PASS**; manual **NOT RUN** |
| AC-009-032–038 | pgTAP report derivation/staff/immutability/no-auto-action | M009-036–037, 054 | Automated **PASS**; manual **NOT RUN** |
| AC-009-039–041 | Mock namespace/typecheck; locale/mojibake/lint | M009-038–049 | Automated **PASS**; manual **NOT RUN** |
| AC-009-042–043 | brand/WPS009 static tests; regenerated asset | M009-050–052 | Automated **PASS** plus visual asset inspection; manual **NOT RUN** |
| AC-009-044–045 | reset, all pgTAP/custom tests, Expo Doctor, three exports, migration dry run | M009-053–055 | Local/export **PASS**; linked ledger/dry-run **BLOCKED**; manual **NOT RUN** |

## Automated command ledger

| Command/group | Result | Date/evidence |
| --- | --- | --- |
| `npm.cmd run typecheck` | **PASS** | 2026-08-01; strict `tsc --noEmit`, exit 0 |
| `npm.cmd run lint` | **PASS** | 2026-08-01; zero errors and zero warnings |
| `npm.cmd run check:mojibake` | **PASS** | 2026-08-01; no likely mojibake |
| Nine custom regression scripts including `test:wps009` | **PASS** | 2026-08-01; 333 assertion executions; WPS-007 local-only smoke harness also exits 0 |
| `npx.cmd supabase db reset` | **PASS** | 2026-08-01; clean rebuild through all 24 local migrations and seed |
| `npx.cmd supabase test db` / all pgTAP suites | **PASS** | 2026-08-01; 12 files / 765 assertions |
| `npx.cmd supabase db lint --local --level warning` | **PASS WITH PRE-EXISTING WARNING** | 2026-08-01; no WPS-009 finding; existing WPS-007 `prior_provider_reversal` unused-variable warning remains |
| `npx.cmd expo-doctor` with system CA | **PASS** | 2026-08-01; 18/18 checks |
| Cache-cleared Android export | **PASS** | 2026-08-01; independent `expo export --platform android --clear` |
| Cache-cleared iOS export | **PASS** | 2026-08-01; independent `expo export --platform ios --clear` |
| Cache-cleared web export | **PASS** | 2026-08-01; independent `expo export --platform web --clear`, 28 static routes |
| Local migration list | **PASS** | 2026-08-01; 24/24 local migration-history rows align after reset |
| Linked migration list | **BLOCKED** | 2026-08-01; two read-only attempts failed before login-role initialization with `LegacyDbConfigLoginRoleNetworkError` / `TransportError` |
| Hosted `npx.cmd supabase db push --dry-run` | **BLOCKED; NOTHING APPLIED** | 2026-08-01; CLI printed `DRY RUN`, then failed before login-role initialization with the same transport error |

## pgTAP totals

| Suite | Assertions |
| --- | ---: |
| chat | 35 |
| communication-collaboration | 80 |
| device-p1-fixes | 22 |
| financial-spec | 107 |
| marketplace-intelligence | 96 |
| payments | 101 |
| profile-self-access | 30 |
| provider-verification | 99 |
| provider_jobs | 29 |
| repository-alignment | 35 |
| reviews | 60 |
| rls | 71 |
| **Overall** | **765** |

## Hosted-pending candidate set

The last successful linked comparison in repository evidence ended at `202607290002`. Because the live comparison was transport-blocked on 2026-08-01, the following is the exact repository candidate set relative to that last verified endpoint, not a claim that hosted state was freshly observed:

1. `202607300001_payments_earnings_ledger.sql`
2. `202607300002_financial_spec_alignment.sql`
3. `202607310001_repository_alignment.sql`
4. `202607310002_marketplace_intelligence_schema.sql`
5. `202607310003_marketplace_intelligence_api.sql`
6. `202608010001_device_p1_fixes.sql`
7. `202608010002_profile_self_access.sql`
8. `202608010003_wps009_communication_collaboration.sql`

## Manual artifact ledger

| Artifact | Status |
| --- | --- |
| Android screenshots/video | **NOT RUN** |
| iOS screenshots/video | **NOT RUN** |
| Web screenshots | **NOT RUN** |
| English copy review | **NOT RUN** |
| Egyptian Arabic/RTL review | **NOT RUN** |
| Screen-reader/text-scaling review | **NOT RUN** |
| Attachment upload/retry evidence | **NOT RUN** |
| Reconnect/account-switch evidence | **NOT RUN** |
| Call-relay disabled-state evidence | **NOT RUN** |
| Staff report operational review | **NOT RUN** |

## Deployment evidence boundary

- Hosted migration applied: **NO / NOT AUTHORIZED**
- Production push invoked: **NO / NOT AUTHORIZED**
- Real call/SMS invoked: **NO / NOT AUTHORIZED**
- Real payment/payout/webhook/scheduler invoked: **NO / NOT AUTHORIZED**
