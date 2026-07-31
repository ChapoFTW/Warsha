# WPS-008 acceptance evidence

Date: 2026-07-31  
Scope: local repository and local Supabase only  
Hosted deployment: **NOT PERFORMED**

Status meanings:

- **PASS (automated):** implemented and covered by local static, unit, or pgTAP evidence.
- **DEFERRED (fail-closed):** WPS-approved deferred behavior is implemented as unavailable/neutral until approved configuration exists.
- **VALIDATION PENDING:** implementation exists, but the required replay, native E2E, operational, accessibility, or manual validation was not performed. This is not a pass claim.

Primary evidence:

- `supabase/tests/database/marketplace-intelligence.test.sql`: 96 passing assertions.
- Existing database suites: 537 assertions before WPS-008; all nine suites pass with 633 assertions in the final clean-reset gate.
- `scripts/marketplace-intelligence.test.mts`: 20 assertions.
- `scripts/wps008-alignment.test.mts`: 13 assertions.
- TypeScript, ESLint, mojibake, Expo Doctor, native export, database lint, and migration dry-run results are recorded in `docs/testing/WPS-008-final-validation-report.md`.

| Criterion | Status | Evidence / disposition |
| --- | --- | --- |
| AC-008-001 | PASS (automated) | Authority/cross-spec audit, WPS-001–008 index, WPS-007 snapshot integration test. |
| AC-008-002 | PASS (automated) | Consumer/independent-worker routes only; no enterprise/employment/academy/gamification/email-only worker addition. |
| AC-008-003 | PASS (automated) | New UI uses worker/customer language; internal provider names remain repository-only. |
| AC-008-004 | DEFERRED (fail-closed) | Production activation, retention, signer, personalization, and warranty configuration stay unavailable/neutral. |
| AC-008-005 | PASS (automated) | Worker/service profile actions route to Request a Quote; selection + confirmation precede booking. |
| AC-008-006 | PASS (automated) | Create, invite, quote, compare, select, confirm, and booking conversion are implemented. |
| AC-008-007 | PASS (automated) | Separate Emergency attempts; no quotes; row-locked single winner and one booking asserted. |
| AC-008-008 | PASS (automated) | Existing exact ten-category pgTAP plus repository alignment. |
| AC-008-009 | PASS (automated) | Matching requires provider service/category compatibility. |
| AC-008-010 | PASS (automated) | Wave and worker radii are both applied to private canonical coordinates. |
| AC-008-011 | PASS (automated) | Distance is a hard pre-ranking condition. |
| AC-008-012 | PASS (automated) | Availability, identity approval, profile state, capacity, and cash restriction hard filters. |
| AC-008-013 | PASS (automated) | Emergency requires category opt-in plus worker Emergency availability. |
| AC-008-014 | PASS (automated) | Candidate scoring only runs after all hard filters. |
| AC-008-015 | PASS (automated) | Worker RPC exposes district/governorate only; exact snapshot stays private. |
| AC-008-016 | PASS (automated) | Existing guarded binary availability RPC and two-state worker UI. |
| AC-008-017 | PASS (automated) | Unavailable high-rated test worker receives no invitation. |
| AC-008-018 | PASS (automated) | Existing duration/travel/buffer overlap helper is mandatory before invitation/confirmation. |
| AC-008-019 | PASS (automated) | Workload/fairness contributions are bounded and cannot override filters. |
| AC-008-020 | PASS (automated) | Confirmation rechecks capacity and existing booking commitments become projection sources. |
| AC-008-021 | PASS (automated) | Completed current WPS-007 snapshots feed median, p25, and p75 profiles. |
| AC-008-022 | PASS (automated) | Price is a bounded value component, never an eligibility maximum. |
| AC-008-023 | PASS (automated) | Cold-start is neutral/bounded with category-area benchmark storage. |
| AC-008-024 | PASS (automated) | Sanitized read RPC assertions show no score components or preference labels. |
| AC-008-025 | PASS (automated) | Contextual cancellation/no-show events and versioned rolling metrics. |
| AC-008-026 | PASS (automated) | Server policy version and deterministic tie-breaks; client unit ties asserted. |
| AC-008-027 | PASS (automated) | Scores, weights, exclusion details, and candidate pool are private and client-revoked. |
| AC-008-028 | VALIDATION PENDING | Bounded fairness engine exists; long-run concentration replay was not performed. |
| AC-008-029 | PASS (automated) | New-worker adjustment is bounded to 0.04 after hard eligibility. |
| AC-008-030 | PASS (automated) | Opportunity adjustment clamps to ±0.08 and cannot bypass quality/safety. |
| AC-008-031 | PASS (automated) | Invitation response and actor-attributed cancellation metrics are separate. |
| AC-008-032 | PASS (automated) | First wave configured to three; only eligible candidates invited. |
| AC-008-033 | PASS (automated) | Idempotent run/dedupe keys, bounded radii, maximum invitations, quote-target stop. |
| AC-008-034 | PASS (automated) | Existing invitation remains actionable after target until request closure/eligibility loss. |
| AC-008-035 | PASS (automated) | Unique request/provider quote constraint. |
| AC-008-036 | PASS (automated) | Worker ownership RLS and owned-quote RPC expose no competitor. |
| AC-008-037 | PASS (automated) | Quote validator requires money, timing/duration, labor, materials, message, and payment fields; warranty is gated. |
| AC-008-038 | PASS (automated) | Exact 600/120 timers and durable jobs asserted. |
| AC-008-039 | PASS (automated) | Best Value default, realtime/public participant rows, authoritative reload. |
| AC-008-040 | PASS (automated) | Six deterministic sorts covered in unit tests. |
| AC-008-041 | PASS (automated) | Selection accepts any valid quote; no cheapest override. |
| AC-008-042 | PASS (automated) | Early selection receives serialization error. |
| AC-008-043 | PASS (automated) | Request row lock, expected selection version, and one selected pointer. |
| AC-008-044 | PASS (automated) | Owned selected quote confirmation and unique booking/request links asserted. |
| AC-008-045 | PASS (automated) | Durable confirmation job restores customer review/matching and increments version. |
| AC-008-046 | PASS (automated) | Selected request state blocks late replacement. |
| AC-008-047 | PASS (automated) | Matching/expiry/confirmation are durable private jobs independent of app process. |
| AC-008-048 | PASS (automated) | Repositories reload authoritative rows; realtime is invalidation-only; events/notifications dedupe. |
| AC-008-049 | PASS (automated) | Expired projection returns retry/expand/schedule/browse recovery actions; Retry UI is present. |
| AC-008-050 | PASS (automated) | Preselection cancellation closes rows and records `automaticFee=false`. |
| AC-008-051 | PASS (automated) | Server edit deadline is exactly five minutes or selection, whichever first. |
| AC-008-052 | PASS (automated) | Minor allowlist, immutable revision, invitee notice, revise/withdraw support. |
| AC-008-053 | PASS (automated) | Unknown/non-minor changes cancel/invalidate original and create one linked replacement. |
| AC-008-054 | PASS (automated) | ASAP/Today/Scheduled/Flexible types and Cairo conversion implemented. |
| AC-008-055 | PASS (automated) | Scheduled matching starts on creation; capacity reserves only at confirmed booking. |
| AC-008-056 | PASS (automated) | Flexible start/end constraint persists the window until booking conversion. |
| AC-008-057 | PASS (automated) | Emergency ordering uses ETA first after hard filters. |
| AC-008-058 | PASS (automated) | Accepted-attempt partial uniqueness + request lock; one winner/booking asserted. |
| AC-008-059 | PASS (automated) | Preview token/version is required before insert; winner surcharge cannot exceed approval. |
| AC-008-060 | PASS (automated) | Cancellation event records actor, phase, reason, en-route/arrived, timing, and replacement outcome field. |
| AC-008-061 | PASS (automated) | No single-event punishment or automatic fee path exists. |
| AC-008-062 | PASS (automated) | Rescue links/copies request context and attachments, excludes worker, rechecks, and has unique active attempt. |
| AC-008-063 | PASS (automated) | Emergency and worker-failure paths invoke normal Rescue transaction. |
| AC-008-064 | PASS (automated) | Existing arrival history timestamp plus bounded approximate evidence; no GPS trail table. |
| AC-008-065 | PASS (automated) | Participant authorization and both 15-minute timing gates are server-side. |
| AC-008-066 | PASS (automated) | pgTAP asserts no financial payment/penalty from no-show. |
| AC-008-067 | PASS (automated) | Running Late changes latest ETA and creates one customer notification. |
| AC-008-068 | DEFERRED (fail-closed) | Comeback contract/original-worker targeting implemented; all category warranty rows disabled pending approval. |
| AC-008-069 | DEFERRED (fail-closed) | Comeback creates no refund; activation requires same-issue customer details and valid warranty window. |
| AC-008-070 | PASS (automated) | Reuses existing completed-booking, moderated-review behavior and volume counts. |
| AC-008-071 | DEFERRED (fail-closed) | Customer price-preference personalization is absent/neutral and unlabeled. |
| AC-008-072 | PASS (automated) | Durable deduplicated notification keys and record routes are implemented. |
| AC-008-073 | PASS (automated) | Notification/realtime payloads carry entity IDs and public state only. |
| AC-008-074 | VALIDATION PENDING | Correct English/Egyptian Arabic copy and RTL direction are implemented; device/manual layout review not run. |
| AC-008-075 | PASS (automated) | Private event, funnel inputs, price, fairness, cancellation, rescue, geo, emergency, and capacity records/functions. |
| AC-008-076 | PASS (automated) | Customer rate limit, idempotency/dedupe, bounded evidence; no automatic suspension. |
| AC-008-077 | PASS (automated) | Build-time repository selection: Mock imports no Supabase client path and Supabase never falls back. |
| AC-008-078 | VALIDATION PENDING | SQLite-backed Mock request/invitation/quote/edit/select/confirm/expiry/Emergency paths exist; full native parity E2E not run. |
| AC-008-079 | VALIDATION PENDING | Unit/pgTAP/static/failure/security tests exist; approved native E2E harness and end-to-end run remain open. |
| AC-008-080 | VALIDATION PENDING | Manual test record is explicitly NOT RUN. |

Completion statement: the local implementation is substantial and automated gates are green, but WPS-008 is **not claimed fully accepted or production-ready** while the five VALIDATION PENDING rows, operational activation gates, and manual results remain open.
