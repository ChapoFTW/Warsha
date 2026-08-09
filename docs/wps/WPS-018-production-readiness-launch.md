# WPS-018 — Production Readiness, Reliability & Launch Operations

## Document metadata

| Field | Value |
| --- | --- |
| Specification | WPS-018 |
| Version: 1.0 | |
| Status: LOCKED FOR IMPLEMENTATION | |
| Authority: Warsha Constitution | |
| Depends on: WPS-001 through WPS-017 | |
| Owner | Sief Abdelghfar |
| Authoritative migration | `supabase/migrations/202608030001_wps018_production_readiness.sql` |

WPS-018 is the launch-readiness authority. It prepares the platform for a
controlled private beta and an eventual production launch.

**WPS-018 introduces no customer feature.** It closes the residual WPS-017
security gaps, enforces the environment model, adds server-authoritative rate
limiting, adds provider-neutral observability, and adds a post-deployment
verification gate. Everything else it produces is a plan, a runbook, or an
honest record of what is still missing.

## Relationship to existing systems

WPS-018 **extends and replaces nothing**. Where it hardens a pre-existing staff
RPC, the original function is **renamed into the `private` schema unchanged** and
re-published under its original public name behind a capability gate. Not one
line of WPS-006 through WPS-016 domain logic is rewritten, so no domain
behaviour, error code, or message can drift.

| Authority | Retained | WPS-018 relationship |
| --- | --- | --- |
| WPS-007 / WPS-015 | Ledger, refunds, payouts, reconciliation | Adds dual control on refunds; the decision stays in the domain RPC |
| WPS-013 | Dispute lifecycle | Adds the capability gate; the state machine is untouched |
| WPS-014 | Notification delivery | Reused; push and the scheduler stay disabled |
| WPS-016 | Enforcement, bans, appeals | Adds dual control on permanent bans **on top of** every existing WPS-016 rule |
| WPS-017 | Staff identity, queues, configuration, audit | Corrects two of its own recorded findings and keeps everything else |

## Readiness position

The complete audit is `docs/launch/READINESS-GAP-REGISTER.md`. Its central
finding governs this specification:

> **Automated tests passing is not readiness.** At audit, Warsha had 1,695
> passing pgTAP assertions, 17 passing regression suites, and three passing
> platform exports — and could not have been launched.

WPS-018 closes eighteen gaps. Seventeen remain open, and this document names
every one of them rather than declaring readiness.

## Environment model

Four environments: `local`, `development`, `staging`, `production`.

- Each **must** use a separate Supabase project, separate secrets, separate
  provider modes, and separate feature flags. `docs/launch/ENVIRONMENT-MATRIX.md`
  is the authority; one hosted project is never treated as every environment.
- The environment is stored server-side, returned in the staff session, rendered
  as a persistent badge, and shown as an alert banner in production.
- Every environment or launch-phase change is recorded in immutable history.
- Missing configuration fails closed; the client treats unreadable platform
  status as maintenance rather than assuming the platform is open.
- Production is structurally constrained: it cannot be selected without the MFA
  requirement, it cannot accept the pre-WPS-017 staff gate, and it cannot
  disable dual control. All three are CHECK constraints, not policy notes.

Launch phases: `pre_beta` → `private_beta` → `public_beta` → `production`.

## Admin security closure

WPS-017 recorded three residual findings. All three are closed here.

**1. Re-authentication is now server-verified.** WPS-017 recorded that the client
attested it had re-authenticated. That is removed. GoTrue signs `amr` — the
authentication methods and their timestamps — and `aal` into the access token,
and PostgREST verifies that signature before the claim reaches SQL. Freshness is
computed from `amr`; a token with no verifiable authentication record has no
freshness and is refused. There is nothing left for a client to assert.

**2. MFA is enforced, with a real provider.** Supabase's own TOTP factor is now a
selectable provider, so production has a path to open rather than a permanent
closure. When the environment requires MFA, every capability check requires the
identity provider to have granted `aal2`. There is no override.

**3. Legacy staff RPCs are capability-gated.** Twenty-two pre-WPS-017 staff RPCs
were reachable by any account satisfying `private.is_staff()`. Each is now gated
by its specific domain capability. A Verification Reviewer can no longer reach a
dispute, a refund, a moderation action, or the payment operations summary — and
the pgTAP suite proves it in both directions.

An account that predates WPS-017 keeps its historic access **outside production
only**, so no existing suite changed behaviour. Production forbids that path by
constraint.

Additionally:

- **Session invalidation** is enforced on every capability check. A revoked
  session is refused even when its token is valid and fresh.
- **Periodic access review** records who reviewed which grant, when, and with
  what decision. Overdue grants are reported. Nobody may review their own access.
- **Dual control** applies to permanent bans and refunds: a request, then a
  distinct approver, then a single consumption. The requester can never approve.

### The admin surface remains in the Expo bundle

Evaluated and decided in `docs/architecture/admin-platform-architecture.md`. The
route modules ship in every build because Expo Router bundles them; this was
verified by exporting without the build flag and finding the strings present.

**The presence or absence of admin route code in a bundle is never treated as a
security boundary.** The bundled code holds no secret and grants no access; every
operational action is authorized server-side by capability. A separate web build
was evaluated and rejected: it would duplicate the highest-risk code (session
handling), gain no authorization guarantee, and invite a service-role key onto a
server that does not currently exist.

## Rate limiting and abuse protection

Nineteen surfaces are audited, and each declares **where its limit actually
lives**: the WPS-018 limiter, Supabase Auth, marketplace configuration, a domain
rule, or — for exactly one surface — an open gap.

The limiter is server-authoritative, counts before it reads, stores subjects only
as a hash, and prunes opportunistically without a scheduler. Client debounce is
not a control anywhere.

One honest limitation: a **rejected** call must roll back with the transaction it
aborts, so a rejection cannot be durably recorded from inside the failing path.
What is recorded is **saturation** — the accepted call that fills a subject's
bucket — which commits and is the early-warning signal operations actually needs.

## Observability

Provider-neutral and privacy-enforced. **No external observability provider is
selected or enabled.**

Structured events carry a correlation id, an environment label, a severity, a
category, and a safe detail payload. **Redaction is enforced when the row is
written, not when it is exported**: a payload naming a token, secret, password,
OTP, message body, note, document, national identifier, or payment credential is
rejected, as is an email address, an Egyptian phone number, a JWT-shaped string,
an over-long value, or a nested object. A rejected payload is replaced; the event
still records.

Every stream declares a retention period and a named owning role. No declared
stream contains personal data.

## Migration and database release safety

- Ledgers are compared, then a dry run, then a verified restore point, then the
  apply, then verification. In that order, every time.
- **A remotely applied migration is never edited.** Every correction is a new
  forward migration.
- `audit:migrations` enforces ordering, naming, forward-only structure, pinned
  `search_path`, and the exact `pg_catalog.extract` grammar defect that broke a
  WPS-014 hosted push.
- `verify_platform_release()` re-checks twelve structural guarantees against the
  live database after every deployment. "The migration applied without error" is
  not success.
- The deployment checklist separates schema deployment, Edge Function
  deployment, mobile build, web deployment, provider activation, and
  configuration activation into distinct, individually approved steps.

## Backups and disaster recovery

`docs/operations/backup-runbook.md` and `restore-runbook.md` define frequency,
retention, PITR availability, restoration procedure, drill cadence, RPO, RTO,
and the recovery limits for storage objects, secrets, and provider events.

**No backup is claimed to be working.** The Supabase plan and PITR availability
are unverified, and no restore has ever been performed. A non-destructive
staging restoration drill is specified and is **NOT RUN**.

## Performance

Budgets and a method exist for every operational surface. **No load test has been
executed and no production percentile is claimed anywhere.** Required staging
tests and dataset sizes are in `docs/testing/WPS-018-LOAD-TEST-PLAN.md`.

## Secrets

A complete inventory of seventeen secrets records the key name, classification,
environments, owner, storage location, and rotation method — and **never a
value**. A key that must not be bundled may never carry the `EXPO_PUBLIC_`
prefix, and the environment audit fails the build if one does.

`audit:secrets` scans every tracked file and the entire git history for
credential shapes, not for known values, so the scanner can never itself become
a place a secret is written down.

## Mobile and web release

Application identifiers, versioning, build-number source, profiles, channels,
and permission copy are configured. Store submission, screenshots, descriptions,
content rating, and phased rollout are **prepared, not performed** — no
submission is made by this work.

The later QA distribution work enables over-the-air updates only for standalone
internal Preview builds on the isolated `preview` channel. Production OTA
delivery remains disabled, and this configuration change publishes no update.
Universal and app links require a verified domain Warsha does not yet control;
only the custom scheme works today, and that is recorded as a blocker rather
than configured against an unverified domain.

Web hosting is undecided. `docs/launch/PRODUCTION-LAUNCH-PLAN.md` records the
options, what each must define (CSP, headers, cache policy, redirects, auth
callbacks, indexing), and that admin functionality is never protected by
obscurity on any of them.

## Legal and policy

Every legal item is inventoried and routed to a qualified professional.
**No legal approval is claimed anywhere in this repository, and no document here
constitutes legal advice.** Where an operational placeholder is drafted, it is
explicitly marked as awaiting lawyer or accountant review.

## Private beta

`docs/launch/PRIVATE-BETA-PLAN.md` defines a deliberately narrow launch: a
bounded cohort, one governorate, a small category set, cash only, most features
disabled, manual onboarding, stated support hours, named incident contacts,
explicit success metrics, explicit stop conditions, a data-cleanup policy, and
recorded participant consent.

Egypt-wide coverage and a full category set are technically supported and are
**not** activated for that reason.

## Feature activation matrix

Fifteen capabilities, each recording current state, target phase, required
provider, required secret, required legal approval, required manual test,
activation owner, rollback method, and remaining blockers. Every risky feature
ships disabled. No entry is launch-ready.

## Manual validation debt

Every NOT RUN case across WPS-007 through WPS-018 is consolidated into
`docs/testing/MASTER-MANUAL-TEST-PLAN.md`, grouped by audience and platform,
with a **minimum mandatory subset before private beta** and a larger subset
before production.

**Manual alpha is not complete. Not one case has been executed.**

## Security review

`docs/security/WPS-018-FINAL-THREAT-MODEL.md` covers the mobile, web, and admin
clients, Supabase Auth, PostgreSQL and RLS, Storage, Realtime, Edge Functions,
payment webhooks, provider callbacks, GitHub and CI, EAS, web hosting, staff
accounts, secrets, backups, exports, and logs. Residual risks are stated plainly.

**No penetration testing has been performed and none is claimed. No compliance
certification is claimed.**

## Brand and motto

The active motto remains exactly:

**YOUR WORK, OUR MISSION**
**شغلك مهمتنا**

Audited across the active build, launch documents, and admin surfaces. The
broader Constitution mission remains as mission prose and is not a motto.

## Deployment status

Local only. The hosted migration is **not** applied by this work. No production
deployment was performed. Real payments, payouts, SMS, telephony, push delivery,
schedulers, and external providers all remain disabled.

## Changelog

- 2026-08-03 — Version 1.0. Initial locked specification.
