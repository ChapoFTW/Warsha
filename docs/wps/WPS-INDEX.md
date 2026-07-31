# Warsha Specification Authority Index

## Authority order

1. Warsha Constitution
2. Locked WPS documents
3. WES documents
4. Existing implementation, migrations, tests, operations, and experiments

When implementation conflicts with a locked specification, the conflict must be reported and corrected through a forward change. When an as-built WPS records historic behavior later corrected by a locked WPS, the later locked specification governs. Silence in a higher authority does not permit a lower authority to invent material product behavior.

## Document register

| Document | Version | Status | Authority relationship | Implementation state | Migration state | Manual-test state |
| --- | --- | --- | --- | --- | --- | --- |
| `docs/constitution/Warsha-Constitution.md` | 1.0 | **LOCKED** | Highest authority | Repository alignment audited against it | No standalone migration; implemented through forward WPS migrations | Constitutional checklist review performed for alignment; no independent manual suite |
| `docs/wps/WPS-001-foundation-authentication.md` | 1.0 | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** | Records implementation; later locked corrections govern | Expo Router, isolated data modes, customer email/password, worker phone OTP foundation, session/recovery implemented; deletion deferred | Existing migrations `202607200001`-`202607200006`, `202607200009`, alignment `202607310001`; all local | No dedicated manual result set; OTP delivery blocked locally without SMS provider |
| `docs/wps/WPS-002-customer-experience.md` | 1.0 | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** | Records customer baseline; WPS-007/008 corrections govern | Home, categories, discovery, profiles, direct booking compatibility, orders, detail, notifications, payments/reviews integrations implemented | Existing customer/realtime/review/trust/financial/alignment migrations; all local | No dedicated signed manual result set |
| `docs/wps/WPS-003-independent-worker-experience.md` | 1.0 | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** | Records worker baseline; Constitution and WPS-008 simplify/extend it | Worker onboarding/profile, binary availability, jobs, verification, earnings implemented; WPS-008 marketplace flows absent | Provider/jobs/verification/financial/alignment migrations; all local | No dedicated signed manual result set |
| `docs/wps/WPS-004-booking-lifecycle.md` | 1.0 | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** | Authoritative record of existing booking graph; WPS-008 pre-booking lifecycle must convert into it | Creation, assignment, approval, reschedule, milestones, cancellation, history, attachments, chat, financial/review links implemented with listed gaps | Existing booking/jobs/chat/financial/alignment migrations; all local | Automated pgTAP present; no signed end-to-end manual results |
| `docs/wps/WPS-005-realtime-notifications.md` | 1.0 | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** | Records existing invalidation/durable notification architecture | Central Realtime, customer/worker/detail subscriptions, notifications/read/dismiss/foreground/mock parity implemented; push absent | Realtime plus domain publication migrations; all local | No signed reconnect/background/push-disabled manual results |
| `docs/wps/WPS-006-trust-reviews-verification.md` | 1.0 | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** | Records existing trust baseline; WPS-008 eligibility rules govern marketplace use | Reviews, rating summary, replies, attachments, identity verification, optional Skill Certificate, sanitized trust and discovery gating implemented | Review, participant RLS, verification, alignment migrations; all local | Automated pgTAP present; no signed production moderation/document manual results |
| `docs/wps/WPS-007-financial-system.md` | 1.0 | **LOCKED - LOCAL IMPLEMENTATION ALIGNED, LIVE PROVIDERS DISABLED** | Locked within financial scope; WPS-008 must reuse it | Ledger, snapshots, payments, cash debt, earnings, refunds, holds, recovery, provider-neutral adapters and UI implemented locally; live money disabled | `202607300001_payments_earnings_ledger.sql`, `202607300002_financial_spec_alignment.sql`; pending/local only | Runbook prepared; every recorded case remains **NOT RUN** |
| `docs/wps/WPS-008-marketplace-intelligence.md` | 1.2 | **LOCKED FOR IMPLEMENTATION** | Locked marketplace product authority below Constitution and integrated with WPS-007 | Request, invitation, quote, matching, Emergency, Rescue, scheduling, no-show, and capacity paths are implemented locally; production activation remains fail-closed | `202607310001_repository_alignment.sql`, `202607310002_marketplace_intelligence_schema.sql`, and `202607310003_marketplace_intelligence_api.sql`; pending hosted, clean-reset validated locally | 71 criteria pass automated evidence, 4 are approved fail-closed deferrals, and 5 remain validation-pending; manual suite **NOT RUN** |
| `docs/wes/WES-008-marketplace-intelligence.md` | 1.4 | **IMPLEMENTED LOCALLY - PRODUCTION ACTIVATION GATED** | Engineering detail subordinate to Constitution and WPS-001 through WPS-008 | Local schema/API, Expo repositories and flows, Realtime invalidation, Mock path, and automated tests implemented; operational and manual gates remain | Dedicated schema/API migrations `202607310002` and `202607310003`; pending hosted, 96 WPS-008 pgTAP assertions pass | Acceptance evidence is recorded; native E2E, fairness replay, accessibility/RTL device review, and manual suite remain open |

## Migration safety boundary

- This index describes local repository state only.
- No hosted migration was applied while creating these baselines.
- The linked ledger was read without mutation. It ends at `202607290002`; the dry run lists exactly five pending migrations from `202607300001` through `202607310003`.
- The final clean reset and 9-suite/633-assertion pgTAP run passed. This is necessary but not sufficient for production activation; scheduler/alerting, scale, native E2E, and manual gates remain.
