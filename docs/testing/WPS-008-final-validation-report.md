# WPS-008 final local validation report

Date: 2026-07-31  
Branch / starting commit: `v0.8` / `7eae51a`  
Scope: existing dirty working tree, local Supabase, and linked-ledger read-only checks  
Hosted mutations: **NONE**

This report records the requested 20 handoff items. It does not claim production activation or full WPS-008 acceptance.

## 1. Local database availability and validation

Docker and the local Supabase database were available. `supabase_db_warsha` was healthy. A final `supabase db reset` rebuilt the database from an empty local state and applied every migration through `202607310003_marketplace_intelligence_api.sql` successfully.

Local Auth warns that no SMS provider is configured and disables phone delivery. This is an expected local/operational limitation, not a migration failure.

## 2. Alignment migration result

`202607310001_repository_alignment.sql` executes successfully in the clean reset. Its 35-assertion pgTAP suite passes. It resolves the five documented repository gaps without weakening RLS:

- phone-first worker authentication and optional worker email;
- binary Available/Unavailable with private capacity foundations;
- immediate cancellation and exact 48-hour completion chat locks;
- the exact ten-category launch taxonomy; and
- approved-verification discovery, trust, service, direct-booking, and marketplace eligibility gates.

## 3. pgTAP totals

| Suite | Assertions | Result |
| --- | ---: | --- |
| `chat.test.sql` | 35 | PASS |
| `financial-spec.test.sql` | 107 | PASS |
| `marketplace-intelligence.test.sql` | 96 | PASS |
| `payments.test.sql` | 101 | PASS |
| `provider-verification.test.sql` | 99 | PASS |
| `provider_jobs.test.sql` | 29 | PASS |
| `repository-alignment.test.sql` | 35 | PASS |
| `reviews.test.sql` | 60 | PASS |
| `rls.test.sql` | 71 | PASS |
| **Overall** | **633** | **PASS — 9/9 files** |

The final WPS-008 count includes direct regression coverage for the guarded category-level Emergency opt-in RPC.

## 4. WPS-001 through WPS-006 files

The audited as-built baselines were created:

- `docs/wps/WPS-001-foundation-authentication.md`
- `docs/wps/WPS-002-customer-experience.md`
- `docs/wps/WPS-003-independent-worker-experience.md`
- `docs/wps/WPS-004-booking-lifecycle.md`
- `docs/wps/WPS-005-realtime-notifications.md`
- `docs/wps/WPS-006-trust-reviews-verification.md`

They record existing behavior and limitations; later locked Constitution/WPS-007/WPS-008 rules govern any historic behavior they describe.

## 5. WPS index status

`docs/wps/WPS-INDEX.md` now records the authority order, WPS-001 through WPS-008, WES-008 version 1.4, actual local implementation state, exact WPS-008 migrations, final test totals, read-only linked-ledger result, and honest manual/activation status.

## 6. PROD-001 resolution

**RESOLVED.** WPS-001 through WPS-006 exist as repository-audited as-built baselines. The authority audit found no unresolved contradiction blocking WPS-008. WPS-008 version 1.2 and WES-008 version 1.4 also resolve PROD-002 through PROD-011 using the product-owner decisions.

## 7. Cross-spec conflicts and resolutions

No unresolved cross-spec conflict remains. The repository gaps listed in item 2 were corrected by forward changes. Existing direct booking remains only a compatibility path; Browse Worker now presents Request a Quote. WPS-008 conversion reuses the existing booking/chat/review/verification systems and WPS-007 price snapshots rather than creating a competing post-agreement lifecycle or money model.

## 8. WPS-008 files created and changed

Specification and evidence:

- `docs/wps/WPS-008-marketplace-intelligence.md` — locked version 1.2 with all decided product rules.
- `docs/wes/WES-008-marketplace-intelligence.md` — version 1.4, reconciled to the implemented local schema/API and deployment gates.
- `docs/testing/WPS-008-acceptance-evidence.md` — all 80 criteria mapped.
- `docs/testing/WPS-008-manual-results.md` — explicit **NOT RUN** record.
- `docs/testing/WPS-008-final-validation-report.md` — this report.

Application and tests:

- `src/marketplace-intelligence/` — types, translations, Mock/Supabase repositories, repository selection, and React context.
- `app/marketplace-request/`, `app/worker-quotes.tsx`, and `app/worker-quote/` — customer and worker marketplace routes.
- Existing root, home, provider, booking, job, notification, Realtime, and localization modules were integrated forward without removing the WPS-007 work.
- `scripts/marketplace-intelligence.test.mts` and `supabase/tests/database/marketplace-intelligence.test.sql` provide unit and database coverage.

## 9. New migrations

Marketplace Intelligence adds:

- `202607310002_marketplace_intelligence_schema.sql`
- `202607310003_marketplace_intelligence_api.sql`

They follow the pending WPS-007 migrations and `202607310001_repository_alignment.sql`. All execute successfully on the final clean local reset.

## 10. Implemented marketplace behavior

- Requests: Browse Worker, Get Quotes, Emergency, retry, minor revision, major linked replacement, expiry, cancellation, and recovery projections.
- Invitations and matching: server-authoritative hard eligibility, private coordinates, distance/radius gates, capacity exclusion, hidden fixed-precision scores, bounded opportunity/new-worker adjustments, controlled waves, and useful-quote target 5.
- Quotes: complete terms, immutable revisions, six deterministic customer sorts, two-minute selection gate, row-locked selection, worker confirmation timeout, and one booking conversion.
- Emergency: authoritative surcharge preview/approval before creation, category opt-in, ETA-first dispatch, no competition quotes, and a single atomic winner.
- Rescue: normal re-matching, failed-worker exclusion, attachment/context preservation, fresh eligibility, and customer reapproval when terms differ.
- Scheduling/capacity: ASAP/Today/Scheduled/Flexible inputs, Cairo time handling, confirmed-commitment projections, resolved duration/travel/buffer, and fail-closed missing inputs.
- Reliability: Running Late updates the authoritative ETA; customer and worker no-show timing/evidence are server-controlled; no automatic MVP fee or punishment is created.
- Background contracts: durable, idempotent, `SKIP LOCKED` jobs exist, while production processing remains disabled until a trusted worker and monitoring are approved.

## 11. Exact public RPC signatures

The WPS-008 API migration revokes `PUBLIC`/anon execution and grants these guarded signatures to `authenticated`:

```text
preview_emergency_request(jsonb)
create_marketplace_request(jsonb,text)
edit_marketplace_request(uuid,integer,jsonb,text)
cancel_marketplace_request(uuid,text,text)
select_worker_quote(uuid,uuid,integer,text)
retry_marketplace_request(uuid,text,text)
report_worker_no_show(uuid,jsonb,text)
create_comeback_request(uuid,jsonb,text)
set_worker_emergency_category(text,boolean)
view_quote_invitation(uuid)
submit_worker_quote(uuid,jsonb,text)
revise_worker_quote(uuid,jsonb,text)
decline_quote_invitation(uuid,text,text)
withdraw_worker_quote(uuid,text,text)
confirm_selected_quote(uuid,uuid,text)
accept_emergency_request(uuid,text)
report_worker_running_late(uuid,integer,text,text,text)
report_customer_no_show(uuid,jsonb,text)
get_customer_marketplace_request(uuid)
get_customer_quotes(uuid,text)
get_worker_quote_invitations(timestamptz,integer)
get_worker_quote(uuid)
get_marketplace_capabilities()
```

`mark_worker_available(boolean)` remains the reused guarded binary-availability RPC from repository alignment.

## 12. RLS and ACL review

The final local catalog check reports:

- 11/11 public WPS-008 tables have RLS enabled;
- 23/23 WPS-008 public RPCs are `SECURITY DEFINER` with a fixed empty search path;
- anon has EXECUTE on 0/23, authenticated has EXECUTE on 23/23 guarded RPCs;
- anon/authenticated have zero table grants in the private schema;
- the public request table has zero exact-address snapshot columns;
- the request-attachment bucket is private and has three customer-scoped object policies.

The 633-assertion run covers participant isolation, private score/config access, quote ownership, exact-address privacy, and existing RLS. Supabase local database lint reports no WPS-008 issue. Its only remaining item is a non-blocking unused-variable warning in the pre-existing WPS-007 `process_financial_refund` function. No P0/P1 security defect was found locally.

Worker request-attachment signing is intentionally fail-closed until the production Edge signer is deployed; no broad Storage grant was added.

## 13. Realtime and notifications

`marketplace_requests`, `quote_invitations`, and `worker_quotes` are in the local Realtime publication. The central Realtime service uses customer/provider filters where available and treats payloads as invalidation hints followed by authoritative repository reload. Durable notifications use recipient/type/dedupe keys for request expiry, selection, Running Late, no-show, and related lifecycle events. Exact locations, scores, jobs, and private configuration are not published.

## 14. Mock-mode behavior

Build-time data-mode selection chooses exactly one repository. The Mock repository imports no Supabase client and uses an Expo SQLite KV namespace for request, invitation, quote, edit, select, confirm, expiry, and Emergency flows. The Supabase repository does not fall back to Mock. Full native Mock parity/account-switch E2E remains validation-pending under AC-008-078.

## 15. Validation results

| Gate | Result |
| --- | --- |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS, zero warnings |
| `npm.cmd run test:payments` | PASS, 11 assertions |
| `npm.cmd run test:wps008-alignment` | PASS, 13 assertions |
| `npm.cmd run test:marketplace` | PASS, 20 assertions |
| `npm.cmd run check:mojibake` | PASS; checker also covers docs/scripts/Supabase |
| `git diff --check` | PASS; only Git LF-to-CRLF notices |
| `npx.cmd expo-doctor` | PASS, 18/18 checks |
| Android Expo export | PASS, 1,667 modules |
| iOS Expo export | PASS, 1,671 modules |
| Clean local `supabase db reset` | PASS |
| Full local `supabase test db` | PASS, 9 files / 633 assertions |
| Local `supabase db lint --level warning` | No WPS-008 findings; one pre-existing WPS-007 unused-variable warning |
| Linked `supabase migration list` | PASS, read-only |
| Linked `supabase db push --dry-run` | PASS, five exact pending migrations; nothing pushed |

## 16. Remaining P2/P3 limitations

P2 production-activation gates:

- trusted marketplace worker/scheduler, secrets, cadence, lease monitoring, lag/failure alerts, and runbook are not deployed;
- production-scale Haversine query plans/load are not verified; PostGIS/GiST remains a scale-trigger option;
- exact launch wave/ranking/duration/travel configuration requires approval before enabling the feature;
- native E2E, long-run fairness replay, Mock account-switch parity, and manual accessibility/RTL/device validation remain open; and
- WPS-007 manual financial smoke results remain **NOT RUN**, although automated financial integration passes with live providers disabled.

P3/approved fail-closed limitations:

- worker request-attachment signing, category warranties, analytics/evidence retention, and customer price personalization remain unavailable until their approval/operations gates exist;
- local phone OTP delivery is disabled because no SMS provider is configured; and
- the pre-existing WPS-007 refund function has one unused-variable lint warning with no runtime/security effect shown by the tests.

## 17. Manual testing status

WPS-008 manual/device testing is **NOT RUN**. WPS-007 manual financial smoke testing is also **NOT RUN**. Automated tests and exports are not represented as manual results.

The 80-criterion evidence matrix currently records 71 automated passes, 4 approved fail-closed deferrals, and 5 validation-pending criteria: AC-008-028, AC-008-074, AC-008-078, AC-008-079, and AC-008-080. Therefore full WPS-008 completion is not claimed.

## 18. Deployment-safety decision

The migration sequence is locally executable, linted for WPS-008, fully pgTAP-tested, and recognized correctly by the linked dry run. The marketplace and scheduler configuration ship disabled, so the new feature fails closed.

The pending batch is nevertheless **NOT YET APPROVED FOR HOSTED DEPLOYMENT OR PRODUCTION ACTIVATION**. Open production-scale, scheduler/alerting, Mock/native E2E, and manual gates must be resolved or explicitly accepted by the deployment authority. The successful dry run is not SQL execution evidence and does not authorize a real push.

## 19. Exact pending migration list

The linked remote ledger ends at `202607290002`. The read-only dry run lists exactly:

1. `202607300001_payments_earnings_ledger.sql`
2. `202607300002_financial_spec_alignment.sql`
3. `202607310001_repository_alignment.sql`
4. `202607310002_marketplace_intelligence_schema.sql`
5. `202607310003_marketplace_intelligence_api.sql`

No hosted migration was applied.

## 20. Safe deployment command — not executed

After explicit deployment authorization, backup/recovery confirmation, environment preflight, and acceptance of every remaining gate, the linked command from this repository is:

```powershell
npx.cmd supabase db push
```

This command was **not executed**. Only `npx.cmd supabase db push --dry-run` was run.
