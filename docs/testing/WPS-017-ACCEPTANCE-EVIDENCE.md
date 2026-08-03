# WPS-017 Acceptance Evidence — Operations, Analytics & Admin Platform

| Field | Value |
| --- | --- |
| Specification | WPS-017 v1.0 |
| Engineering baseline | WES-017 v1.0 |
| Migration | `supabase/migrations/202608020005_wps017_operations_analytics_admin.sql` (local only) |
| Manual acceptance | **NOT RUN** — 66 cases |
| Hosted deployment | **Not applied** |

## Executed gates

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | Pass |
| ESLint | `npm run lint` | Pass |
| Mojibake | `npm run check:mojibake` | `No likely mojibake found.` |
| Whitespace | `git diff --check` | Clean |
| Clean database reset | `supabase db reset` | Applied the full chain through `202608020005` without error |
| Full pgTAP | `supabase test db` | **20 files / 1,693 assertions, `Result: PASS`** |
| WPS-017 pgTAP | `supabase test db supabase/tests/database/operations-admin-platform.test.sql` | **306 assertions, `Result: PASS`** |
| WPS-017 client suite | `npm run test:wps017` | **1,543 checks passed** |
| All 17 regression suites | each `npm run test:*` | 0 failures |
| Expo Doctor | `npx expo-doctor` | **18/18 checks passed** |
| Android export | `npx expo export --platform android --clear` | Exported |
| iOS export | `npx expo export --platform ios --clear` | Exported |
| Web export | `npx expo export --platform web --clear` | Exported, admin routes present |
| Migration ledger | `supabase migration list` | Everything through `202608020004` local **and** remote; `202608020005` local only |
| Non-mutating dry run | `supabase db push --linked --dry-run` | `202608020005` is the single pending migration; **no hosted mutation** |

Existing suite totals before this work were 19 files / 1,387 assertions. WPS-017
adds 306 and changes none of the previous 1,387.

## Preserved authorities

pgTAP asserts each of these still exists and still owns its decision:

`resolve_booking_dispute` · `staff_record_enforcement_action` ·
`review_provider_verification` · `process_financial_refund` · `moderate_review` ·
`review_reconciliation_exception` · `disputes` · `trust_reports` ·
`review_reports` · `provider_verifications` · `financial_refunds` ·
`reconciliation_exceptions`

No table was dropped, no public function was dropped, and no policy or grant was
weakened. The regression suite asserts the absence of `drop table` and
`drop function public.` in the migration.

## Additive changes to earlier work

| Change | Why it is safe |
| --- | --- |
| `notifications_audience_check` gains `'staff'` | The existing rule admits only `audience='all'` or `audience=mode`, so a staff notification is structurally invisible to customer and worker inboxes. Asserted in both directions. |
| `notification_safe_payload` gains four UUID keys | Still UUID-only allowlisting; no new value type is accepted. |
| `notification_resource_id` gains an operational fallback | The existing routing is copied verbatim; only the `else` branch changed. |
| `notification_mode_allowed` admits `'staff'` | Only for an account currently holding a staff capability. |
| `private.is_staff()` widened | Every account that passed before still passes. Verified by pgTAP with a legacy `user_roles` row and by all 19 pre-existing suites passing unchanged. |
| `support_tickets` / `support_messages` gain `SELECT` for `authenticated` | They were dormant with unreachable policies. RLS now restricts rows; `anon` explicitly revoked. |

## Capability model evidence

- Nine roles, thirty-one capabilities, deny by default.
- Only break-glass reaches every capability (asserted).
- Support Agent holds no high-risk capability (asserted).
- Verification Reviewer cannot reach dispute or refund capabilities (asserted).
- A customer and a worker are denied on the home, queues, search, analytics, the
  audit explorer, and the role directory (asserted).
- A revoked role removes access on the next call and clears re-authentication
  (asserted).
- A suspended account loses every capability whatever grants it holds (asserted).
- Self-granting a role is refused (asserted).
- A configuration version cannot be approved by its author (asserted).
- High-risk actions are refused without a fresh re-authentication (asserted).

## Concurrency evidence

- A stale `lock_version` raises `40001` on both assignment and transition.
- A successful assignment advances the version.
- Repeating an action with the same idempotency key returns `duplicate: true`
  and creates no second event.
- A case cannot be assigned to someone who cannot work the queue.
- Assigning another person requires `assign_cases` **and** the queue capability.
- Mock mode rejects a stale version identically, so parity is behavioural rather
  than cosmetic.

## Privacy evidence

- Private WPS-017 tables are exposed to no client role (asserted, zero rows).
- A participant sees one support message where staff see two (asserted).
- Private case notes are unreachable without the queue capability (asserted).
- Search refuses short terms, wildcards, and name lookup; the raw term never
  reaches the access log (asserted).
- No National ID path exists anywhere (asserted negatively).
- A cohort below the minimum cell is suppressed and renders as hidden, never zero
  (asserted in SQL and in the client).
- Financial analytics require the ledger capability in addition to analytics
  (asserted).
- An export cannot be downloaded by another staff member (asserted).

## Nothing was enabled

Asserted negatively in the migration and the client suite:

- push delivery, push token registration, and the reminder scheduler stay off;
- no live gateway mode and no live payout mode is selected;
- no external provider, webhook, SMS, call relay, or scheduler is activated;
- every feature flag ships disabled;
- every kill switch ships inactive and can only restrict.

## Deferrals recorded, not hidden

| Item | Status |
| --- | --- |
| MFA | No provider. Production is closed by database constraint. |
| Export file delivery | Not implemented. No pipeline exists to leak through; the approved output is a bounded in-band preview. |
| Support case attachments | Deferred. No bucket or storage policy created. |
| Per-domain gating of legacy staff RPCs | Deferred; needs a forward change in six locked domain WPS documents. Recorded as T8 / F3. |
| Automated incident detection | Not implemented and not claimed. |
| Materialized analytics | Not built. Trigger conditions recorded in the performance plan. |
| Eight marketplace and worker metrics | Deferred with reasons in the metric catalog rather than implemented with a guessed definition. |

## Corrections made during review

**The build gate does not remove admin code from the bundle.** A web export with
`EXPO_PUBLIC_ADMIN_SURFACE` unset still contains the operations strings, because
Expo Router bundles every route module. Four documents and two source comments
that claimed otherwise were corrected. The flag makes the surface inert, not
absent. Recorded as F1 in the security review.

## What is not claimed

- No manual acceptance. All 66 cases are **NOT RUN**.
- No physical-device acceptance.
- No performance measurement. The performance plan sets budgets and a method; no
  load test was executed and no p95 exists.
- No compliance certification of any kind.
- No hosted migration was applied and no production credential was used.
