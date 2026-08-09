# Go / No-Go Criteria

Authority: Warsha Constitution → WPS-018.
Assessed: 2026-08-03.

Every criterion is **binary**. "Mostly", "should be fine", and "we can fix it
after launch" are all NO. A criterion is GO only when someone has personally
verified it, not when a test that covers it is green.

Verdict today — **private beta: NO-GO. Production: NO-GO.**

## Private beta

### Product

| # | Criterion | State |
| --- | --- | --- |
| P01 | Minimum manual subset executed and signed (see MASTER-MANUAL-TEST-PLAN) | **NO — 0 of 214 cases run** |
| P02 | A customer can request, receive a quote, book, and complete on a real handset | **NO — no device testing** |
| P03 | A worker can sign in with phone and password on a real handset without OTP | **NOT RUN — implementation automated evidence passes; device execution pending** |
| P04 | A dispute can be opened, worked, and resolved end to end | NO — not manually verified |
| P05 | Egyptian Arabic and RTL verified on device by a native speaker | NO |
| P06 | Cash commission debt is correct after ten real bookings | NO |

### Platform

| # | Criterion | State |
| --- | --- | --- |
| P07 | A separate hosted staging project exists | **NO** |
| P08 | The migration chain applies cleanly to staging from empty | NO |
| P09 | `verify_platform_release()` returns only the expected failure set | NO — not run against a hosted project |
| P10 | Backups confirmed on the actual plan | **NO — plan and PITR unverified** |
| P11 | A restore has been **performed** on staging, not merely configured | **NO** |
| P12 | Every CI gate passes on the branch being launched | GO — locally; CI has never executed |
| P13 | Rate limits verified against a real client, not only pgTAP | NO |

### Operations

| # | Criterion | State |
| --- | --- | --- |
| P14 | A named person is rostered for support hours | **NO** |
| P15 | A named incident commander and contact path exist | **NO** |
| P16 | Staff roles granted to real people with MFA enrolled | NO |
| P17 | An access review has been performed once | NO |
| P18 | The rollback has been rehearsed on staging | NO |

### Legal

| # | Criterion | State |
| --- | --- | --- |
| P19 | Customer and worker terms reviewed by a lawyer | **NO** |
| P20 | Privacy policy reviewed and published at a reachable URL | **NO** |
| P21 | Cash handling and commission position reviewed by an accountant | **NO** |
| P22 | Participant consent text reviewed | **NO** |
| P23 | Company structure sufficient to trade | **NO** |

**Private beta: 0 of 23 satisfied. NO-GO.**

## Production

Everything above, plus:

### Money

| # | Criterion | State |
| --- | --- | --- |
| R01 | Payment provider selected and contracted | **NO — DEFERRED** |
| R02 | Gateway credentials issued and bound to the production environment only | NO |
| R03 | Webhook endpoint deployed, signature verified, replay tested | **NO** |
| R04 | Payout licensing established | **NO** |
| R05 | Chargeback liability understood and accepted in writing | NO |
| R06 | Reconciliation run against real settlement data | NO |
| R07 | Refund path exercised end to end with a real payment | NO |
| R08 | Tax treatment, invoicing, and receipts confirmed by an accountant | NO |

### Security

| # | Criterion | State |
| --- | --- | --- |
| R09 | MFA enrolled for every staff account | NO |
| R10 | Production admin access verified closed until MFA is configured | GO — by constraint |
| R11 | No legacy staff account remains | NO |
| R12 | Secret rotation performed once and documented | NO |
| R13 | Dependency advisories resolved or accepted in writing | **NO — 2 high, 14 moderate** |
| R14 | An independent security review has been considered and decided | NO |

### Scale

| # | Criterion | State |
| --- | --- | --- |
| R15 | Load tests executed on staging at the specified dataset sizes | **NO — none executed** |
| R16 | Every surface within its budget at p95 on staging | NO |
| R17 | Observability alerting owned by a named person | NO |

### Distribution

| # | Criterion | State |
| --- | --- | --- |
| R18 | iOS and Android builds accepted by review | NO — not submitted |
| R19 | Store listings, screenshots, and content rating complete | **NO** |
| R20 | A verified domain exists for links and policy URLs | **NO** |
| R21 | Web hosting decided, CSP and headers defined | **NO** |
| R22 | Phased rollout configured | NO |

**Production: 1 of 22 satisfied. NO-GO.**

## How a criterion becomes GO

1. A named person performs the check, on the real environment.
2. The evidence is recorded — a command output, a screenshot reference, a
   signature, an approval reference. Not "done".
3. The date is recorded. A criterion verified more than 90 days ago is stale and
   returns to NO.

## Who decides

| Decision | Who |
| --- | --- |
| Private beta go | Owner, with Operations Manager and Security Administrator |
| Production go | Owner, with all three plus written legal and accounting sign-off |
| Stop, at any time, for any reason | Anyone on the team |

The authority to stop is deliberately wider than the authority to launch.

## The honest summary

Warsha's engineering is in good shape: 21 pgTAP suites, 1,831 assertions, 18
regression suites, three clean exports, and a database whose security posture is
enforced by constraints rather than by convention.

None of that is readiness. What stands between here and a private beta is not
code — it is a staging environment, an SMS provider, a verified restore, a
rostered human, a lawyer, and roughly two hundred manual test cases that nobody
has run yet.
