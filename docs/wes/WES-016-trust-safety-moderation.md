# WES-016 — Trust, Safety & Moderation (Engineering)

## Document metadata

| Field | Value |
| --- | --- |
| Specification | WES-016 |
| Version: 1.0 | |
| Status: ENGINEERING BASELINE | |
| Implements: WPS-016 | |
| Authority: Constitution → WPS-016 → WES-016 | |
| Owner | Sief Abdelghfar |
| Migration | `supabase/migrations/202608020004_wps016_trust_safety_moderation.sql` |

## Design rules

1. **Extend, never replace.** No existing table, RPC, trigger, or policy was
   modified or dropped. Unified reports link to domain reports via
   `source_report_id`.
2. **Server authority.** Clients hold no write grant on any trust table.
3. **Immutability by trigger, not by grant.** Report content, enforcement
   history, and the moderation audit raise on update/delete even for the table
   owner.
4. **No automatic permanent bans.** Enforced by CHECK constraints *and* by an
   RPC precondition.
5. **Signals never punish.** The signal recorder performs no enforcement.
6. **Empty `search_path`** on every `SECURITY DEFINER` function.

## Schema

### Public (RLS enabled, `select` only for `authenticated`)

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `trust_reports` | Unified immutable intake | 17 categories, 9 subject types, 8 surfaces, 6 statuses; unique `(reporter_id, idempotency_key)`; self-report forbidden |
| `trust_report_events` | Append-only lifecycle history | — |
| `trust_account_state` | One row per account; current trust level and six restriction flags | `banned` may carry no expiry |
| `trust_enforcement_actions` | Immutable action ledger | Evidence 3–2000 chars required; `permanent_ban` requires `actor_kind='staff'` **and** a `report_id`; a `system` actor may only issue `investigation` |
| `trust_appeals` | Appeals | One per `(enforcement_action_id, appellant_id)`; decision requires `decided_by` |

### Private (no client grants, not in Realtime)

| Table | Purpose |
| --- | --- |
| `trust_report_evidence` | Staff-only evidence references with optional SHA-256 |
| `trust_fraud_signals` | Ten advisory signal kinds with severity and safe detail |
| `trust_moderation_audit` | Immutable actor/timestamp/reason/evidence audit |

### RLS policies

- `trust_reports_reporter_read` — reporter or staff
- `trust_report_events_scoped_read` — staff, or the reporter of the parent report
- `trust_account_state_own_read` — subject or staff
- `trust_enforcement_actions_subject_read` — subject or staff
- `trust_appeals_appellant_read` — appellant or staff

## Functions

### Client RPCs (`authenticated` only; `anon` revoked)

| Function | Behavior |
| --- | --- |
| `submit_trust_report(...)` | Idempotent; rejects self-report; writes report + lifecycle event + audit; performs no enforcement |
| `get_my_trust_reports()` | Reporter's own submissions; status only, no evidence or staff notes |
| `get_my_trust_status()` | Own trust level, restrictions, public reason, expiry, and appeal eligibility |
| `submit_trust_appeal(...)` | Appellant-only; one per action; rejects `restoration`/`investigation` |
| `get_my_trust_appeals()` | Own appeals with decision note |

### Staff RPCs (`private.is_staff()` gated)

| Function | Behavior |
| --- | --- |
| `staff_record_enforcement_action(...)` | Requires evidence and public reason; blocks `permanent_ban` unless a report reached `investigating`/`actioned`; idempotent; upserts trust state; audits |
| `staff_transition_trust_report(...)` | Moves lifecycle status; appends event; audits |
| `staff_decide_trust_appeal(...)` | Requires a decision note; returns `restorationRequired` for overturned outcomes |
| `get_staff_trust_queue_summary()` | Counts only |

### Private helpers (no client EXECUTE)

| Function | Behavior |
| --- | --- |
| `trust_state_allows(user, capability)` | Capability gate for `marketplace`/`communication`/`reviews`/`payments`/`withdrawals`; treats an expired restriction as lifted; returns `true` when no trust row exists |
| `record_trust_fraud_signal(...)` | Records an advisory signal and performs **no** enforcement |
| `record_trust_audit(...)` | Appends an immutable audit row |
| `prevent_trust_report_mutation()` / `prevent_trust_enforcement_mutation()` / `prevent_trust_audit_mutation()` | Immutability triggers |

## Client architecture

| Module | Responsibility |
| --- | --- |
| `src/trust/trust-safety-types.ts` | Category/status/level/action/signal contracts plus the pure `trustStatusAllows`, `permanentBanRequiresReview`, `fraudSignalIsAdvisoryOnly`, and `isTerminalAction` helpers |
| `src/trust/trust-safety-copy.ts` | English and Egyptian Arabic copy data with accessibility labels |
| `src/trust/trust-safety-translations.ts` | Localization hook wrapper |
| `src/trust/trust-safety-repository.ts` | Mock/Supabase isolation over the five client RPCs |

Mock mode holds account-scoped in-memory state, performs no network call, and
reaches no moderation provider.

## Test coverage

- `supabase/tests/database/trust-safety-moderation.test.sql` — 98 assertions
  covering structure, preservation of the six existing authorities, intake
  immutability and idempotency, self-report rejection, reporter scoping,
  client write denial, staff-only enforcement, evidence requirement, the
  no-automatic-ban rule, the system-actor scope constraint, capability gating,
  appeals privacy and uniqueness, decision requirements, advisory-only fraud
  signals, audit completeness and immutability, RLS, grants, empty
  `search_path`, and Realtime exclusion.
- `scripts/wps016-trust-safety.test.mts` — client and documentation contracts,
  category/surface/signal completeness, localization parity, prohibited
  language, accessibility labels, Mock isolation, and the motto regression.

## Deferred

- Staff moderation Admin UI (contracts and runbooks are complete)
- Automated signal generation jobs (signal recording exists; emitters are per-domain)
- Bulk moderation tooling

## Changelog

- 2026-08-02 — Version 1.0. Initial engineering baseline.
