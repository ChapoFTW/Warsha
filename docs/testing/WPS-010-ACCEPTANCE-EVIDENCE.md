# WPS-010 Acceptance Evidence

## Scope and verdict

WPS-010 is implemented and validated locally. Manual acceptance and a fresh linked migration comparison remain pending. No hosted migration, live payment, SMS, call, payout, webhook, or scheduler action was executed.

## Automated evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck` |
| ESLint | PASS | `npm.cmd run lint`, zero warnings/errors |
| Mojibake scan | PASS | `npm.cmd run check:mojibake` |
| Patch whitespace | PASS | `git diff --check` |
| WPS-010 custom suite | PASS | rollback, privacy, account scope, bounds, repository isolation, SDK 54 picker contracts, localization/RTL/accessibility source contracts |
| All custom regressions | PASS | 11/11 commands: financial, WPS-008, device P1, brand, provider-card media, worker auth, profile phone, WPS-009, marketplace, WPS-007 safe smoke help, WPS-010 |
| Clean local database reset | PASS | all migrations through `202608010004` plus seed |
| pgTAP | PASS | 13 files, 842 assertions; dedicated WPS-010 file has 77 assertions |
| Expo Doctor | PASS | 18/18 using Windows system CA |
| Android export | PASS | separate `--clear` export to `.expo/wps010-android` |
| iOS export | PASS | separate `--clear` export to `.expo/wps010-ios` |
| Web export | PASS | separate `--clear` export to `.expo/wps010-web`; 30 static routes include both new routes |
| Local migration ledger | PASS | complete through `202608010004` |
| Linked migration ledger | BLOCKED | CLI failed before comparison: `LegacyDbConfigLoginRoleNetworkError` / `TransportError` |
| Hosted push dry-run | BLOCKED, NON-MUTATING | CLI printed dry-run/no-push notice, then failed during login-role initialization with the same transport error |
| Manual alpha | NOT RUN | 60/60 cases remain NOT RUN |

## Security evidence

The dedicated pgTAP suite verifies:

- Worker A owner read/manage and Worker B/customer/anonymous denial for draft/private records;
- no anonymous grants on service-area geometry, raw portfolio image rows, or certificate metadata;
- private profile, portfolio, and certificate buckets with exact server limits/MIME lists;
- full active-account, phone, identity, minimum-profile, service, area, and restriction discovery gate;
- authorized public photo/portfolio object reads only for a discoverable worker;
- no public certificate object reads;
- public certificate boolean/count with no private certificate metadata;
- catalog denial of contact, exact geometry, document, financial, and internal matching fields;
- invalid MIME, oversize, and duplicate portfolio rejection;
- no Realtime publication of certificate reasons or private portfolio paths;
- preservation of existing review submission/aggregate APIs.

The client custom suite separately verifies compare-and-set media replacement: when authorization fails after registration, metadata is restored to the previous photo and the previous object is not removed.

## Public/private matrix

| Data | Worker owner | Authorized staff | Discoverable customer/anonymous | Other worker/customer while draft |
| --- | --- | --- | --- | --- |
| Profile draft/services/area | Read; aggregate profile changes | Existing operational authority | Sanitized catalog only | Denied |
| Photo object reference | Owner repository only | Operationally restricted | Short-lived signed rendition; not exported in app-domain model | Denied |
| Portfolio draft metadata/images | Manage | Operationally restricted | Published sanitized metadata and signed rendition only | Denied |
| Certificate metadata/reason/file | Read/manage eligible states | Review/read | Boolean/count only; no file | Denied |
| Identity/Skill Certificate documents/reason | Existing WPS-006 owner/staff access | Review/read | Approved booleans only | Denied |
| Reviews/replies | Existing verified-booking rules | Existing moderation authority | Existing sanitized review aggregate | Existing RLS |

## Pending hosted ledger

The fresh linked ledger could not be obtained. Relative to the last successfully recorded linked state (`202607290002`), the exact local candidate pending sequence is:

1. `202607300001_payments_earnings_ledger.sql`
2. `202607300002_financial_spec_alignment.sql`
3. `202607310001_repository_alignment.sql`
4. `202607310002_marketplace_intelligence_schema.sql`
5. `202607310003_marketplace_intelligence_api.sql`
6. `202608010001_device_p1_fixes.sql`
7. `202608010002_profile_self_access.sql`
8. `202608010003_wps009_communication_collaboration.sql`
9. `202608010004_wps010_worker_profiles_portfolio.sql`

This list is an exact comparison to the last verified ledger, not a claim that a fresh remote comparison succeeded.

## Release gate

Local engineering verdict: **PASS**. Hosted deployment verdict: **HOLD** until linked connectivity is restored, the remote ledger and dry-run are freshly reviewed, operations approves the full pending chain, and manual alpha is executed. The safe deployment command is `npx.cmd supabase db push --linked`; it was **not executed**.
