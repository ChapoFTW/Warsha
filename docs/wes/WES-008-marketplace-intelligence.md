# WES-008 — Marketplace Intelligence Engineering Specification

## 1. Metadata and authority

| Field | Value |
| --- | --- |
| Title | WES-008 — Marketplace Intelligence Engineering Specification |
| Version | 1.4 |
| Status | **IMPLEMENTED LOCALLY - PRODUCTION ACTIVATION GATED** |
| Implements | WPS-008 |
| Constraint | Must not contradict the Warsha Constitution or WPS-008 |
| Repository audit date | 2026-07-31 |

Authority order:

1. Warsha Constitution
2. WPS-008
3. WES-008
4. Implementation

The Constitution overrides WPS-008 and this WES. WPS-008 overrides this WES. The forward-only local implementation is present, while production activation remains fail-closed until Section 33 deployment gates are satisfied.

Status labels used here:

- **EXISTING:** Present in the inspected working tree. This does not prove hosted deployment.
- **IMPLEMENTED LOCALLY:** Present in forward-only migrations or application code and validated locally. It does not prove hosted deployment or manual UX completion.
- **REUSED:** Existing object or pattern intended to remain authoritative.
- **PROPOSED:** Required engineering addition or change; it does not exist yet.
- **MIGRATION REQUIRED:** Must be delivered through a forward-only migration.
- **DEFERRED:** Intentionally not activated until its WPS review trigger.
- **FUTURE:** Outside WPS-008 launch implementation.

### Table of contents

1. [Metadata and authority](#1-metadata-and-authority)
2. [Repository assumptions](#2-repository-assumptions)
3. [Existing-system audit requirements](#3-existing-system-audit-requirements)
4. [Domain model](#4-domain-model)
5. [Implemented schema](#5-implemented-schema)
6. [Enumerations and state machines](#6-enumerations-and-state-machines)
7. [Indexes and constraints](#7-indexes-and-constraints)
8. [Geographic model](#8-geographic-model)
9. [Eligibility engine](#9-eligibility-engine)
10. [Ranking engine](#10-ranking-engine)
11. [Historical pricing engine](#11-historical-pricing-engine)
12. [Fairness engine](#12-fairness-engine)
13. [Capacity inference](#13-capacity-inference)
14. [Quote invitation waves](#14-quote-invitation-waves)
15. [Quote lifecycle](#15-quote-lifecycle)
16. [Request lifecycle](#16-request-lifecycle)
17. [Scheduling](#17-scheduling)
18. [Emergency dispatch](#18-emergency-dispatch)
19. [Rescue Mode](#19-rescue-mode)
20. [Cancellation/no-show intelligence](#20-cancellationno-show-intelligence)
21. [Warranty/comeback preparation](#21-warrantycomeback-preparation)
22. [Realtime](#22-realtime)
23. [Notifications](#23-notifications)
24. [Background jobs](#24-background-jobs)
25. [RPC/API design](#25-rpcapi-design)
26. [RLS and grants](#26-rls-and-grants)
27. [Rate limiting and abuse controls](#27-rate-limiting-and-abuse-controls)
28. [Mock mode](#28-mock-mode)
29. [Localization and accessibility](#29-localization-and-accessibility)
30. [Observability and analytics](#30-observability-and-analytics)
31. [Testing strategy](#31-testing-strategy)
32. [Migration strategy](#32-migration-strategy)
33. [Deployment gates](#33-deployment-gates)
34. [Open engineering questions](#34-open-engineering-questions)
35. [Acceptance mapping](#35-acceptance-mapping)
36. [Changelog](#36-changelog)

## 2. Repository assumptions

### 2.1 Audited working tree

The baseline is the inspected workspace, including its existing uncommitted WPS-007 work. No file outside the three WPS-008 authority documents was changed by the documentation task.

The application currently uses:

- **EXISTING:** Expo 54.0.35 and Expo Router 6.0.24;
- **EXISTING:** React Native 0.81.5 and React 19.1;
- **EXISTING:** TypeScript 5.9;
- **EXISTING:** Supabase JavaScript 2.110;
- **EXISTING:** PostgreSQL migrations, RLS, SECURITY DEFINER RPCs, Storage, and Realtime;
- **EXISTING:** repository selection between Mock and Supabase modes;
- **EXISTING:** pgTAP suites under supabase/tests/database; and
- **EXISTING:** custom Node-based checks for financial logic, smoke behavior, and mojibake.

The repository instruction requires the exact Expo SDK 54 documentation to be read before implementation code is written. This documentation-only baseline does not replace that required implementation preflight.

### 2.2 Terminology mapping

Product-facing “worker” maps to the existing provider_profiles entity and provider_id identifiers. WPS-008 implementation may retain provider terminology internally to reduce migration risk. New customer-facing copy uses “worker” where practical.

### 2.3 Authority reconciliation

WPS-001 through WPS-006 now exist as as-built baselines. They were audited against the repository, the Constitution, WPS-007, and WPS-008. They record legacy/direct behavior without overriding later locked corrections. No cross-spec contradiction remains that blocks WPS-008 implementation; PROD-001 is resolved in Section 34.2.

### 2.4 Deployment knowledge

The workspace contains uncommitted WPS-007 migration files:

- supabase/migrations/202607300001_payments_earnings_ledger.sql
- supabase/migrations/202607300002_financial_spec_alignment.sql

WPS-007 documents them as locally implemented and not hosted. On 2026-07-31 the linked ledger was read without mutation: remote history ends at `202607290002`, and the dry run names five pending migrations from `202607300001` through `202607310003`. No hosted migration was applied.

No production marketplace scheduler, push dispatcher, or Marketplace Intelligence Edge Function exists in the inspected repository.

## 3. Existing-system audit requirements

### 3.1 Audit findings

| Area | Existing object or behavior | WPS-008 disposition |
| --- | --- | --- |
| Provider profile | public.provider_profiles stores user_id, categories, experience, ratings, completed jobs, service radius, is_verified, is_available, emergency_available, onboarding_status, publication state, and soft deletion. | **REUSED.** Provider equals worker internally. Hard eligibility must additionally require approved identity verification and active ownership. |
| Categories | public.service_categories exists. The original seed contained Plumbing, Electrical, Carpentry, AC Repair, Cleaning, and Painting. | **ALIGNED LOCALLY.** The seed, Mock catalog, and forward-only repository-alignment migration now define exactly the ten locked active launch categories and deactivate, without deleting, any extra category. Hosted deployment is not claimed. |
| Services | public.services stores category, pricing type, decimal legacy price, duration label, and active/deleted state. | **REUSED** for service compatibility. Historical marketplace money uses integer piastres from WPS-007 snapshots and new quotes. |
| Provider services | public.provider_services stores offered service, custom price, pricing type, transport fee, emergency surcharge, and active state. | **REUSED** for service compatibility and current service terms. It does not represent competitive quotes. |
| Service areas | public.provider_service_areas stores governorate, district, optional latitude/longitude, and radius. public.provider_profiles also stores service_radius_km. | Existing coordinates are optional and existing read policy is public. Exact matching coordinates require a restricted canonical location model; do not expose a worker’s precise base. |
| Availability | public.provider_profiles.is_available is the worker-controlled binary flag. Legacy provider_availability rows remain stored for compatibility but are not public and are no longer read or rewritten by onboarding, direct booking, or rescheduling. | **ALIGNED LOCALLY.** Worker UX exposes only Available/Unavailable. Private, client-inaccessible capacity configuration, deterministic fallback travel, category duration defaults, and fail-closed overlap evaluation are added by the forward-only repository-alignment migration. Marketplace activation still requires the approved configuration values in Section 34.3. |
| Emergency opt-in | provider_profiles.emergency_available is profile-wide. | **IMPLEMENTED LOCALLY.** `provider_emergency_categories` and its guarded owner RPC add category-level opt-in; the profile-wide flag remains a compatibility hard gate rather than silently enabling every category. |
| Booking model | public.bookings is already assigned to one provider and one service. It includes direct-booking status, price, schedule, address snapshot, type, notes, attachments, reschedule fields, cancellation fields, and completion notes. | **REUSED after confirmation.** A marketplace request remains separate until an atomic conversion creates one booking. |
| Booking states | pending_provider_approval, accepted, rejected, rescheduling_requested, confirmed, provider_on_the_way, provider_arrived, job_started, work_in_progress, completed, disputed, cancelled, refunded, and no_show. | **REUSED.** Marketplace pre-booking states must not be forced into the booking state machine. |
| Scheduling | bookings stores scheduled_date and scheduled_time in addition to booking_type scheduled/emergency. Existing direct-booking RPCs validate with Africa/Cairo and no longer consult worker-maintained weekly availability. | **REUSED at conversion**, with new request timestamps/windows and the server-side inferred-capacity contract. Browse Workers now uses Request a Quote before conversion. |
| Direct booking | public.create_customer_booking creates a provider-assigned booking. | Remains only a safe compatibility path during migration. It is not the WPS-008 Browse Workers or Get Quotes request API and is not the primary customer action. |
| Legacy quotes | public.booking_quotes and public.quote_items exist and use decimal EGP against an already assigned booking. No application repository uses them. | **NOT REUSED as marketplace quotes.** Their ownership, lifecycle, money unit, and assigned-booking dependency do not meet WPS-008. Keep for compatibility; do not silently repurpose. |
| Price revisions | public.booking_price_snapshots and public.booking_price_adjustments in pending WPS-007 migrations use integer piastres and explicit customer approval. | **REUSED after booking conversion.** Preselection quote revisions use separate immutable quote revisions. |
| Payments | WPS-007 adds financial_booking_payments and private configuration/ledger. get_my_booking_payment_options applies cash restriction only after a booking exists. | **REUSED.** Marketplace eligibility needs a private provider-level payment-compatibility helper without creating a booking or payment. |
| Cash debt | private.provider_cash_restricted implements the locked “greater than EGP 500” rule. Online remains available when enabled. | **REUSED as a hard filter** for cash-only requests. The client never supplies a trusted restriction flag. |
| Provider jobs | SECURITY DEFINER RPCs use row locks and server-validated transitions for accept, reject, reschedule, advance, cancel, and no-show actions. | **REUSED pattern** for marketplace mutation RPCs and post-conversion lifecycle. |
| Verification | public.provider_verifications and private.provider_verification_identities exist. Approved verification synchronizes provider_profiles.is_verified. | **ALIGNED LOCALLY.** Public RLS, catalog/trust projections, service offers, portfolio/certification projections, and direct booking require both the synchronized verified flag and an approved verification record. The same private hard gate is mandatory for future invitation and Emergency eligibility. |
| Reviews | public.reviews stores one 1–5 rating, moderation, reply, and attachments. Rating aggregates are exposed through a sanitized RPC. | **REUSED** for launch quality/review volume. Multi-dimensional review inputs are **FUTURE / not currently modeled**. |
| Portfolio and evidence | provider_portfolio, provider_certifications, booking_attachments, review_attachments, dispute_evidence, and private buckets exist. | **REUSED where ownership matches.** Marketplace request attachments require their own request-scoped metadata and storage authorization. |
| Notifications | public.notifications supports read, dismiss, dedupe_key, localization patterns, and owner RLS. Booking, review, verification, chat, and finance events are server-created. | **REUSED and extended.** Marketplace events must be server-created and globally deduplicated by recipient, type, and dedupe key. |
| Realtime | src/realtime/realtime-service.ts centralizes filtered subscriptions and Mock events. Existing publications cover notifications, booking detail, chat, reviews, verification, provider profiles, and selected financial tables. | **REUSED and extended** with narrow request, invitation, and quote subscriptions followed by authoritative reload. |
| Chat | Booking-scoped chat uses participant RLS and guarded RPCs. | **ALIGNED LOCALLY.** Cancellation locks message, attachment-upload, and typing writes immediately; the first recorded completion transition starts an exact 48-hour write window; missing completion evidence fails closed; history reads remain unchanged. Mock and UI lifecycle checks use the same strict boundary. |
| Auth | Customer email/password sign-in, registration, recovery, and existing accounts remain supported. Worker sign-in and registration use verified-phone SMS OTP, and worker email is optional. Existing email customers may add and verify a phone before first worker activation. | **ALIGNED LOCALLY.** New worker-role activation is server-guarded by auth.users.phone_confirmed_at; an already-created provider profile is returned unchanged to preserve existing accounts. Hosted SMS-provider configuration remains an operational deployment requirement. |
| Mock repositories | Repositories choose Mock or Supabase explicitly. Existing Mock data is stored in Expo SQLite KV storage and emits local realtime events. Some storage keys are not fully account-scoped. | **IMPLEMENTED LOCALLY / VALIDATION PENDING.** Marketplace Mock uses a dedicated SQLite KV namespace and imports no Supabase client path. Full native parity and account-switch E2E remain AC-008-078. |
| pgTAP | Suites use transactions, plan counts, temporary Auth users, JWT claim switching, role switching, throws_ok, lives_ok, privilege checks, and rollback. | **REUSED and extended.** The final clean-reset run passed all nine suites and 633 assertions: 537 existing plus 96 WPS-008 assertions. |
| Scheduler | WPS-007 contains a private scheduler contract but documents automatic scheduling as disabled. No marketplace scheduler is deployed. | **DEPLOYMENT BLOCKER.** Background matching cannot pass acceptance until a trusted scheduler/worker is active. |

### 3.2 Required re-audit immediately before implementation

The pre-implementation re-audit completed on 2026-07-31. Engineering re-read the authority chain and Expo SDK 54 reference, preserved the dirty tree, executed a clean local reset, and reconciled WPS-001 through WPS-007. Remaining environment/deployment checks still apply:

1. Re-read the Constitution, WPS-008, and this WES in order.
2. Reconcile WPS-001 through WPS-006 and record PROD-001 resolution.
3. Re-read exact Expo SDK 54 documentation required by AGENTS.md.
4. Record git status and preserve unrelated/uncommitted work.
5. Inspect the final ordered migrations rather than assuming this audit is current.
6. Read the linked and local migration ledgers without applying hosted changes.
7. Confirm whether PostGIS, pg_cron, Vault, and network extensions are available in the target environments.
8. Re-run schema discovery for every object in the audit table.
9. Confirm WPS-007 local migration and test status.
10. Resolve the blocking questions in Section 34.

## 4. Domain model

### 4.1 Entity mapping

| Product concept | Engineering object | Status |
| --- | --- | --- |
| Worker | public.provider_profiles | **EXISTING / REUSED** |
| Worker-offered service | public.provider_services | **EXISTING / REUSED** |
| Customer address | public.addresses | **EXISTING / REUSED** |
| Confirmed job | public.bookings | **EXISTING / REUSED** |
| Approved final price | public.booking_price_snapshots | **EXISTING IN PENDING WPS-007 WORK / REUSED** |
| Marketplace request | public.marketplace_requests | **IMPLEMENTED LOCALLY** |
| Request revision | public.marketplace_request_revisions | **IMPLEMENTED LOCALLY** |
| Request attachment reference | public.marketplace_request_attachments | **IMPLEMENTED LOCALLY** |
| Exact request location | private.marketplace_request_locations | **IMPLEMENTED LOCALLY** |
| Worker matching location | private.worker_matching_locations | **IMPLEMENTED LOCALLY** |
| Category emergency opt-in | public.provider_emergency_categories | **IMPLEMENTED LOCALLY** |
| Matching run | private.marketplace_matching_runs | **IMPLEMENTED LOCALLY** |
| Candidate and score | private.marketplace_candidate_scores | **IMPLEMENTED LOCALLY** |
| Quote invitation | public.quote_invitations | **IMPLEMENTED LOCALLY** |
| Worker quote | public.worker_quotes | **IMPLEMENTED LOCALLY** |
| Quote revision | public.worker_quote_revisions | **IMPLEMENTED LOCALLY** |
| Worker metrics | private.worker_marketplace_metrics | **IMPLEMENTED LOCALLY** |
| Worker pricing profile | private.worker_pricing_profiles | **IMPLEMENTED LOCALLY** |
| Area/category price benchmark | private.marketplace_pricing_benchmarks | **IMPLEMENTED LOCALLY** |
| Opportunity state | private.worker_opportunity_state | **IMPLEMENTED LOCALLY** |
| Capacity projection | private.worker_capacity_projections | **IMPLEMENTED LOCAL CACHE** |
| Marketplace event | private.marketplace_events | **IMPLEMENTED LOCALLY** |
| Cancellation event | public.marketplace_cancellation_events | **IMPLEMENTED; client reads sanitized through RPCs** |
| No-show event | public.marketplace_no_show_events | **IMPLEMENTED; client reads sanitized through RPCs** |
| Running-late event | public.marketplace_running_late_events | **IMPLEMENTED LOCALLY** |
| Emergency dispatch attempt | private.emergency_dispatch_attempts | **IMPLEMENTED LOCALLY** |
| Rescue attempt | private.marketplace_rescue_attempts | **IMPLEMENTED LOCALLY** |
| Due background work | private.marketplace_jobs | **IMPLEMENTED; external production scheduler gated** |
| Warranty/comeback link | public.marketplace_comeback_requests | **IMPLEMENTED FAIL-CLOSED; category activation deferred** |

Candidate scores, exact exclusions, trust signals, abuse signals, pricing classification, fairness state, and capacity internals are never client-readable.

### 4.2 Durable records versus calculated state

Durable business records include requests, revisions, attachments, invitations, quotes, quote revisions, selections, confirmations, cancellation/no-show/running-late reports, emergency acceptance, rescue outcome, and booking links.

Recomputable or cached state includes candidate scores, ranking components, pricing profiles, opportunity state, capacity projections, and aggregate metrics. Recomputable state records its policy version and as-of time and must not become the sole evidence for a consequential dispute.

## 5. Implemented schema

The objects in this section are implemented by `202607310002_marketplace_intelligence_schema.sql` and `202607310003_marketplace_intelligence_api.sql`. They remain locally validated rather than claimed as hosted deployment.

### 5.1 Private marketplace configuration

private.marketplace_configuration stores one active version with:

- enabled flag and policy_version;
- marketplace maximum radius;
- per-wave radius policy;
- first-wave size, maximum invitations, five-useful-quote target, and wave cadence;
- default 10-minute request lifetime, quote-validity policy, two-minute initial collection window, confirmation timeout, and request expiry;
- five-minute edit window;
- 15-minute worker no-show threshold after the latest authoritative ETA;
- fail-closed per-category warranty enablement and duration;
- ranking component weights and quality floors;
- fairness bounds, decay windows, and new-worker rules;
- routing-provider and deterministic travel-fallback configuration;
- per-category default estimated durations;
- the locked 30-minute post-completion buffer;
- rate limits;
- scheduler enabled state;
- evidence and analytics retention settings; and
- updated_at and updated_by.

private.marketplace_configuration_history stores immutable prior values.

**Fail-closed rule:** the migration creates configuration disabled. Marketplace creation and matching remain unavailable until every required WPS decision has an approved, validated value and the production scheduler gate is satisfied.

### 5.2 Canonical matching locations

private.worker_matching_locations:

- provider_id primary key;
- canonical geographic point;
- source and verification state;
- updated_at; and
- no normal client grants.

private.marketplace_request_locations:

- request_id primary key;
- customer-owned address_id;
- immutable exact address snapshot;
- canonical geographic point;
- verification/source metadata; and
- created_at.

The public request stores only approximate governorate/district and a non-reversible coarse area identifier suitable for quoting.

### 5.3 Emergency category settings

public.provider_emergency_categories:

- provider_id;
- category_id;
- enabled;
- updated_at; and
- primary key on provider_id plus category_id.

Only the owning worker may view the complete settings. Mutations occur through a guarded RPC. Eligibility also requires the category itself to be emergency-enabled through server-controlled category configuration.

### 5.4 Marketplace requests

public.marketplace_requests:

- id;
- customer_id;
- flow_kind: browse_worker, get_quotes, emergency, rescue, or comeback;
- status;
- category_id and optional service_id;
- targeted_provider_id for Browse Workers;
- replacement_for_request_id for a major edit;
- rescue_for_booking_id;
- comeback_for_booking_id;
- current_revision;
- issue_description and optional complexity input;
- schedule_kind: asap, today, scheduled, or flexible;
- requested_start_at and requested_end_at;
- timezone, fixed to Africa/Cairo for launch;
- estimated_duration_minutes when known;
- requested payment compatibility: cash, online, or either;
- approximate governorate, district, and coarse area identifier;
- edit_deadline_at;
- collection_not_before;
- expires_at;
- selected_quote_id;
- selection_version;
- selected_at;
- confirmation_deadline_at;
- confirmed_at;
- converted_booking_id;
- idempotency_key;
- created_at, updated_at, cancelled_at, closed_at; and
- soft-deletion only if a later retention policy explicitly permits it.

Constraints enforce:

- the targeted worker only for Browse Workers;
- no quote selection for Emergency;
- flexible requests have a valid time range;
- scheduled times are future-valid;
- replacement, rescue, and comeback links match their flow;
- selected/confirmed/converted fields agree with status;
- idempotency uniqueness per customer;
- no self-replacement cycle; and
- one converted booking per request.

### 5.5 Request revisions and attachments

public.marketplace_request_revisions is immutable and stores:

- request_id and monotonically increasing revision;
- minor or major classification;
- sanitized before/after change set;
- created_by and created_at;
- idempotency key; and
- linked replacement request for a major edit.

public.marketplace_request_attachments stores:

- id, request_id, revision, uploader_id;
- storage_path, MIME type, byte size, attachment kind;
- created_at and invalidated_at.

The private `marketplace-request-attachments` Storage bucket is implemented with customer-scoped paths, bounded image MIME types, and a 10 MB object limit. Customer ownership policies are implemented. Worker object signing remains fail-closed until the production Edge signer is deployed; no worker receives a broad Storage grant. Rescue preserves authorized metadata and audit history without making the bucket public.

### 5.6 Matching runs and candidate scores

private.marketplace_matching_runs:

- id, request_id, request_revision;
- reason: initial, additional_wave, retry, rescue, or emergency_expansion;
- policy_version and configuration snapshot;
- wave_number and search radius;
- status;
- candidate, eligible, invited, response, and quote counts;
- idempotency key;
- started_at, completed_at, and failure metadata.

private.marketplace_candidate_scores:

- matching_run_id and provider_id primary key;
- eligible boolean;
- ordered exclusion codes;
- distance and ETA estimates;
- normalized component values;
- bounded fairness and new-worker adjustments;
- final fixed-precision score and rank;
- pricing/capacity/fairness version references; and
- calculated_at.

This table is private and not in Realtime.

### 5.7 Invitations

public.quote_invitations:

- id, request_id, provider_id, matching_run_id;
- request_revision and wave_number;
- status;
- invited_at, viewed_at, responded_at, expires_at, closed_at;
- sanitized outcome reason; and
- unique request/provider constraint.

The row records one durable opportunity. It is not deleted when the quote target is reached. Response mutations are idempotent.

### 5.8 Quotes and immutable revisions

public.worker_quotes:

- id, request_id, invitation_id, provider_id;
- status and current_revision;
- price_minor and currency EGP;
- proposed_start_at or ETA minutes;
- estimated_duration_minutes;
- message;
- labor_included;
- materials_inclusion state and bounded explanation;
- warranty_days when an approved warranty policy permits it;
- supported payment methods;
- submitted_at, updated_at, expires_at, withdrawn_at;
- selected_at and rejected_at; and
- idempotency key.

public.worker_quote_revisions is immutable and stores the complete quoted terms for each version, revision reason, created_at, and actor.

There is one quote row per request/provider and one active quote per request/provider. The worker may revise the owned quote before customer selection; one current revision pointer exists while all prior revisions remain immutable. Selection locks the quote permanently, and later price change uses WPS-007 booking price adjustments.

### 5.9 Marketplace intelligence

private.worker_marketplace_metrics stores versioned rolling aggregates:

- invitations;
- views;
- quotes;
- response-time distribution;
- selections and wins;
- completed jobs;
- worker- and customer-caused cancellations;
- no-shows;
- opportunity utilization;
- relevant windows and sample sizes; and
- as_of and policy_version.

private.worker_pricing_profiles stores provider/category/service/coarse-area aggregates:

- sample size;
- median, p25, and p75 approved provider gross price;
- original quote median;
- quote-to-final variance;
- revision frequency;
- materials and urgency dimensions;
- last completion and as_of;
- confidence state; and
- pricing policy version.

private.marketplace_pricing_benchmarks stores the same robust aggregates for service/area, category/area, service-wide, and category-wide fallback levels.

private.worker_opportunity_state stores only the bounded, recoverable state required for efficient ranking, with recent-window counters, last opportunity, calculated adjustment, as_of, and fairness policy version.

private.worker_capacity_projections stores a cache by provider and time bucket:

- committed workload minutes;
- travel minutes;
- buffer minutes;
- overlap/conflict flag;
- source booking version;
- as_of and expires_at.

All four tables deny normal client access.

### 5.10 Operational events

public.marketplace_cancellation_events records actor, request/booking phase, normalized reason, free text within limits, en-route/arrived state, timestamp, replacement outcome, and idempotency.

public.marketplace_no_show_events records reporter, reported party, request/booking, eligibility time, report time, milestone timestamps, approximate evidence reference, review state, and idempotency. Raw GPS trails are not stored.

public.marketplace_running_late_events records booking, reporting worker, delay estimate, predefined reason, bounded optional note, created_at, and superseded_at.

private.emergency_dispatch_attempts records request, worker, wave, ETA, invitation state, acceptance attempt, and atomic outcome.

private.marketplace_rescue_attempts records source request/booking, cancelled provider, candidate or prior quote, attempt state, selected outcome, and timestamps.

private.marketplace_events records a minimal append-only analytical/audit event with actor class, entity type/id, event type, policy version, privacy-classified metadata, occurred_at, and dedupe key.

### 5.11 Background job queue

private.marketplace_jobs:

- id;
- job_kind;
- request_id or provider_id;
- run_at;
- state: pending, leased, succeeded, retryable_failed, terminal_failed, or cancelled;
- attempt count and maximum attempts;
- lease owner and lease expiry;
- idempotency/dedupe key;
- last sanitized error code;
- created_at and completed_at.

Normal clients have no access. Job leases use skip-locked row selection, expire safely, and keep business mutations idempotent.

### 5.12 Existing booking links

**IMPLEMENTED LOCALLY:** The forward migrations add nullable links to public.bookings:

- marketplace_request_id, unique when non-null;
- selected_worker_quote_id, unique when non-null; and
- rescue_attempt_id when replacement created the booking.

The conversion transaction copies the approved scope, address, schedule, provider, service, quote terms, and applicable emergency/warranty terms into existing immutable booking and WPS-007 price structures.

No marketplace record can directly mutate an accepted booking price.

## 6. Enumerations and state machines

The repository currently prefers text columns with CHECK constraints. WPS-008 follows that established pattern rather than introducing PostgreSQL enum types.

### 6.1 Request state machine

| Current state | Allowed next states |
| --- | --- |
| draft | matching, cancelled |
| matching | collecting_quotes, worker_confirmed for atomic Emergency acceptance, expired, cancelled, rescue_matching |
| collecting_quotes | customer_reviewing, selection_pending_confirmation, matching for another wave, expired, cancelled |
| customer_reviewing | selection_pending_confirmation, matching, expired, cancelled |
| selection_pending_confirmation | worker_confirmed, customer_reviewing after timeout, matching when no valid quote remains, expired |
| worker_confirmed | converted_to_booking |
| converted_to_booking | closed |
| rescue_matching | customer_reviewing, selection_pending_confirmation, worker_confirmed for Emergency, expired, cancelled |
| cancelled | none |
| expired | none, except creation of a distinct retry request |
| closed | none |

Every mutation:

- locks the request row;
- checks expected revision/selection version;
- rejects self-transitions;
- rejects invalid ordering;
- records an immutable event;
- updates or cancels due jobs; and
- creates durable notifications in the same transaction.

### 6.2 Invitation state machine

| Current state | Allowed next states |
| --- | --- |
| invited | viewed, quoted, declined, expired, request_closed, worker_ineligible |
| viewed | quoted, declined, expired, request_closed, worker_ineligible |
| quoted | withdrawn, expired, request_closed, worker_ineligible |
| declined | none |
| withdrawn | none |
| expired | none |
| request_closed | none |
| worker_ineligible | none |

The invitation response is idempotent. A duplicate identical response returns the existing outcome; a conflicting terminal response is rejected.

### 6.3 Quote state machine

| Current state | Allowed next states |
| --- | --- |
| submitted | revised when enabled, selected, rejected, withdrawn, expired, invalidated_by_request_change |
| revised | revised when enabled, selected, rejected, withdrawn, expired, invalidated_by_request_change |
| selected | rejected only when selection times out or is invalidated before confirmation |
| rejected | none |
| withdrawn | none |
| expired | none |
| invalidated_by_request_change | none |

Selection locks both request and quote. A late submission may remain visible only if valid and cannot replace the selected quote.

### 6.4 Emergency attempt state

invited → viewed → accepted or declined/expired/closed/ineligible.

Only one acceptance may atomically move the request to worker_confirmed. Every losing concurrent attempt receives the already-awarded outcome without creating another booking.

## 7. Indexes and constraints

Named indexes and constraints are implemented in the schema migration. Production-scale EXPLAIN and load review remain a deployment-activation gate.

### 7.1 Required uniqueness

- marketplace_requests(customer_id, idempotency_key)
- marketplace_request_revisions(request_id, revision)
- quote_invitations(request_id, provider_id)
- worker_quotes(request_id, provider_id)
- worker_quote_revisions(quote_id, revision)
- marketplace_matching_runs(request_id, idempotency_key)
- marketplace_jobs(job_kind, dedupe_key) for active jobs
- notifications(user_id, type, dedupe_key) where dedupe_key is not null
- bookings.marketplace_request_id where non-null
- bookings.selected_worker_quote_id where non-null
- one successful emergency acceptance per request

### 7.2 Queue and lifecycle indexes

- open customer requests by customer_id and updated_at descending;
- actionable requests by status and next due timestamp;
- worker invitations by provider_id, status, and invited_at descending;
- request invitations by request_id and status;
- active quotes by request_id, status, and submitted_at;
- selection confirmation deadlines;
- request, invitation, and quote expiry timestamps;
- pending marketplace jobs by run_at;
- expiring job leases;
- cancellation/no-show events by participant and occurred_at; and
- pricing/capacity profile keys plus as_of.

### 7.3 Partial indexes

Terminal rows are excluded from hot-path indexes where safe. Partial uniqueness is used for pending jobs, current profiles, active selections, and current price/capacity cache entries.

### 7.4 Data constraints

- All marketplace money is bigint integer piastres and EGP.
- Latitude is −90 through 90 and longitude is −180 through 180 before conversion to a geographic point.
- Radius, ETA, duration, travel, and buffer values are bounded and non-negative.
- requested_end_at follows requested_start_at.
- Timestamps are stored as timestamptz.
- Revision numbers start at one and increase by exactly one under row lock.
- JSON metadata is bounded in size and validated by its owning RPC.
- Free text is trimmed and length-limited.
- One request cannot reference itself as a replacement.
- Cross-table provider, invitation, quote, and request identities must agree.

## 8. Geographic model

### 8.1 Audit conclusion

PostGIS is not enabled by the current migration history. Optional latitude/longitude columns exist but are insufficiently complete and publicly readable service-area rows are unsuitable for exact worker base locations.

### 8.2 Implemented local model

**IMPLEMENTED LOCALLY:** Canonical latitude/longitude is stored in private tables with strict coordinate bounds. Matching uses the deterministic Haversine helper and applies both request-wave and worker-radius limits before ranking.

The implemented MVP uses bounded private latitude/longitude values and a deterministic Haversine calculation after relational hard filters. Existing public service-area coordinates are retained for compatibility but are never treated as authoritative matching input.

PostGIS/GiST remains an operational scaling option after target-environment preflight and query-plan review. Activation remains gated if the measured candidate volume cannot meet the approved performance target with the implemented private-coordinate plan; semantic radius checks do not silently weaken.

### 8.3 Matching sequence

1. Filter by compatible category/service and other relational hard gates.
2. Load only verified canonical points from private tables.
3. Calculate deterministic Haversine distance for the remaining candidates.
4. Require distance to be within both the current wave radius and the worker’s maximum radius.
5. Apply the marketplace maximum.
6. Record distance only in restricted candidate results.

### 8.4 Privacy

Workers receive approximate governorate/district and travel-relevant context before agreement. Exact address and point remain private until confirmation and booking conversion. Candidate scores never expose customer coordinates. Logs must not contain raw coordinates.

## 9. Eligibility engine

### 9.1 Authority

Eligibility is a private, server-authoritative function. Client flags are never trusted.

`private.create_marketplace_wave` performs restricted eligibility evaluation inside the locked wave transaction and writes the following structured result to private candidate records:

- eligible boolean;
- ordered exclusion codes;
- distance;
- schedule conflict;
- payment compatibility;
- capacity summary class; and
- policy version.

It does not return to normal clients.

### 9.2 Evaluation order

1. Active request and supported flow.
2. Service/category compatibility.
3. Trusted request and worker locations.
4. Distance within worker, wave, and marketplace radii.
5. provider_profiles.is_available and no active temporary unavailability.
6. Owned, active, published, non-deleted provider account.
7. Approved provider_verifications state and provider_profiles.is_verified.
8. No suspended, blocked, or future legal restriction.
9. Payment-method compatibility.
10. Cash restriction for cash-only work using the WPS-007 private rule.
11. Category-level emergency eligibility and worker opt-in for Emergency.
12. Required category credential when a future locked rule exists.
13. Prohibited schedule conflict.
14. Quality/safety floor applicable to the ranking policy.

The function is called again at invitation creation, quote submission, selection, confirmation, Emergency acceptance, and Rescue reassignment.

### 9.3 Payment compatibility

A new private helper returns cash/online availability for a provider and environment without creating a booking or exposing debt. It reuses private.provider_cash_restricted and WPS-007 gateway configuration.

Cash-only excludes a cash-restricted worker. Either-payment requests may retain the worker when at least one requested method is enabled. Online cannot be advertised while live gateway mode remains disabled.

## 10. Ranking engine

### 10.1 Deterministic rule-based policy

WPS-008 launch matching is rule-based, not AI.

Every eligible candidate receives fixed-precision normalized components:

- distance;
- ETA;
- reliability;
- quality;
- historical pricing/value;
- customer relationship;
- capacity;
- response performance;
- fairness adjustment; and
- new-worker adjustment.

Components use integer or PostgreSQL numeric arithmetic. Floating-point results are not used for authoritative ordering.

### 10.2 Implemented score contract

Each base component is normalized to 0–1,000,000. Configured base weights sum to 10,000 basis points.

The weighted base score is:

round(sum(component × weight) ÷ 10,000)

Bounded fairness and new-worker adjustments are then applied and the final score is clamped to 0–1,000,000.

Exact weights, component curves, floors, and adjustment caps remain configuration values that cannot be activated until approved under WPS-008.

Deterministic tie-break order:

1. final score descending;
2. ETA ascending when available;
3. distance ascending;
4. provider UUID ascending.

### 10.3 Safety properties

- Ineligible candidates never enter ranking.
- Higher price never causes exclusion.
- Insufficient pricing history produces a neutral benchmark score.
- Fairness cannot pass a quality or safety floor.
- Exact scores, weights, components, and rank are not returned to customers or workers.
- Restricted records retain policy version and exclusion reasons for authorized debugging.
- Candidate generation is bounded by indexed category and geography queries.

### 10.4 Emergency ranking

Emergency uses a separate policy. After eligibility, ETA is primary; reliability, emergency history, distance, and capacity may break ties without creating quote competition.

## 11. Historical pricing engine

### 11.1 Authoritative source

Profiles are built from completed bookings with an approved immutable WPS-007 price snapshot and no unresolved state that makes the amount unsuitable.

The implemented baseline price is `provider_gross_minor` from the current immutable WPS-007 snapshot, because a Warsha-funded promotion must not reduce the worker’s market price. Materials inclusion, emergency fee, category, service, complexity, and location remain explicit dimensions so unlike jobs are not silently compared.

### 11.2 Aggregates

For each eligible cohort calculate:

- sample size;
- median;
- p25 and p75;
- original quote median;
- quote-to-final absolute and percentage variance;
- price-revision frequency;
- completion recency; and
- last observation.

Recency weighting, history thresholds, and area granularity are unresolved WPS decisions. Profiles remain neutral and cannot affect ranking until the configured threshold is met.

### 11.3 Cold-start cascade

When worker-specific history is insufficient:

1. service plus coarse area benchmark;
2. category plus coarse area benchmark;
3. service-wide benchmark;
4. category-wide benchmark;
5. neutral component when no valid benchmark exists.

Cold start never creates a negative penalty or public label.

### 11.4 Refresh

Completion and approved price revision events enqueue an idempotent profile refresh. A scheduled reconciliation rebuilds stale profiles and compares aggregate counts with source data. Neither path requires the mobile app.

## 12. Fairness engine

### 12.1 Inputs

The fairness calculation uses recent:

- invitations;
- actionable quote opportunities;
- quotes;
- response time;
- selections/wins;
- completed jobs;
- worker cancellations;
- customer cancellations;
- no-shows; and
- time since the last opportunity.

### 12.2 Rules

- Only eligible candidates above quality/safety floors receive an adjustment.
- Adjustments are bounded and smaller than the range reserved for clearly superior customer outcomes.
- Recent concentration reduces adjustment; time without opportunity permits recovery.
- A verified new worker may receive a bounded temporary adjustment.
- Repeated ignored invitations may reduce adjustment.
- Customer-caused cancellation is not worker failure.
- A single cancellation, no-show allegation, or abuse signal does not create a permanent punitive value.
- Every calculation records fairness policy version and as-of time.

Exact windows, bounds, new-worker duration, and exit thresholds remain disabled configuration until approved.

### 12.3 Concentration validation

Offline replay compares invitation and win concentration with and without the fairness adjustment, while asserting unchanged eligibility and quality floors. Fairness activation requires measurable reduction in concentration without material degradation of customer outcomes.

## 13. Capacity inference

### 13.1 Source of truth

Capacity is derived from:

- confirmed future bookings;
- active bookings;
- selected and confirmed schedule windows;
- estimated duration;
- travel duration;
- buffer;
- overlap; and
- total estimated minutes in a rolling 24-hour period.

The worker’s explicit state remains provider_profiles.is_available. Weekly provider_availability is not a required WPS-008 input.

Every active launch category must have one server-controlled default duration in private marketplace configuration. A validated service-, request-, or quote-level estimate takes precedence; otherwise the category default is mandatory. Normal clients cannot read or mutate capacity policy values.

The configured routing provider is authoritative for travel estimates. The provider adapter must return a duration, source, calculated-at timestamp, and route-policy version. It must not expose provider credentials or raw provider responses to clients.

When routing is unavailable, the server computes deterministic travel minutes from trusted coordinates using:

estimated road distance = straight-line distance × configured road factor

estimated travel minutes = ceiling(estimated road distance ÷ configured average urban speed × 60)

The road factor and average urban speed are positive, bounded, versioned configuration values. Identical inputs and a policy version must produce identical fallback output.

### 13.2 Interval model

Each commitment occupies:

travel-before + job duration + a fixed 30-minute post-completion buffer + travel-after where calculable.

A prohibited overlap is a hard conflict. Non-conflicting workload contributes a bounded capacity ranking component. Selection alone does not reserve capacity; successful worker confirmation does.

Confirmed bookings and other confirmed scheduled commitments are capacity sources. Candidate eligibility compares the proposed commitment with relevant existing commitments using their scheduled windows, resolved duration, travel, and fixed buffer. A worker is excluded before ranking when those intervals overlap.

Missing duration resolves to the request category’s configured default. Missing routing-provider travel time resolves through the deterministic fallback. If either relevant location is missing and overlap cannot be safely ruled out, the result is a hard conflict rather than an optimistic estimate.

Rolling 24-hour workload sums resolved job duration, travel, and the fixed buffer for commitments intersecting the applicable 24-hour window. Capacity ranking remains bounded and cannot override a hard conflict or any other eligibility failure.

### 13.3 Cache behavior

Capacity projections are caches. Confirmation, rescheduling, cancellation, rescue, start, completion, and relevant location change invalidate affected buckets. A stale or missing cache triggers authoritative recomputation rather than optimistic availability.

Capacity policy values and category defaults are versioned configuration. Missing or invalid server configuration fails closed for scheduled conflict checks and keeps the ranking component neutral. Routing failures use the locked deterministic fallback; missing locations become hard conflicts whenever non-overlap cannot be proven.

## 14. Quote invitation waves

### 14.1 Transactional wave function

`private.create_marketplace_wave(request_id, reason, idempotency_key)` is implemented as the only creator of quote invitations.

Within one transaction it:

1. locks the request;
2. verifies actionable state and due time;
3. counts valid quotes and active prior invitations;
4. stops if five useful active quotes (or the configured target) exist;
5. creates a matching run;
6. expands to the configured wave radius without exceeding limits;
7. generates candidates through indexed service and geography filters;
8. runs eligibility;
9. calculates versioned ranking;
10. excludes previously invited workers;
11. inserts the bounded wave;
12. records notifications;
13. schedules the next due decision only when needed; and
14. commits one auditable outcome.

Unique request/provider invitation constraints make retries idempotent.

### 14.2 Target reached

Reaching the configurable target, initially five useful active quotes, cancels future wave jobs but does not expire existing invitations or quotes. Already invited workers remain able to quote until request closure under the locked validity and eligibility rules.

### 14.3 Background requirement

Wave timing is driven by private jobs and a trusted worker. The client may request an authoritative refresh but cannot advance wave state or select candidates.

## 15. Quote lifecycle

### 15.1 Submission

submit_worker_quote:

- resolves the worker from auth.uid;
- locks the invitation and request;
- rechecks eligibility and expiry;
- validates EGP integer-piastre price and bounded terms;
- inserts one quote plus immutable revision one;
- changes invitation to quoted;
- creates a customer notification with no competitor data; and
- enqueues any matching-state reconciliation.

### 15.2 Revision

Before customer selection, a quote revision:

- is allowed only before selection and expiry;
- appends a complete immutable revision;
- increments under lock;
- preserves the previous quote;
- updates suspicious-revision signals; and
- notifies the customer without exposing other quotes.

Only one current revision is active. Once selected, the quote is immutable; any later price change is a WPS-007 booking price adjustment after conversion.

### 15.3 Withdrawal and expiry

Only the quoting worker may withdraw an unselected quote. An MVP quote has no separate timer: it remains valid until request expiry, withdrawal, material-edit invalidation, selection of another worker, or ineligibility. Each closure is authoritative, idempotent, and records a distinct status/reason.

### 15.4 Customer comparison projection

get_customer_quotes returns sanitized worker identity/trust indicators, quote terms, public rating summary, distance/ETA display values, warranty when approved, and the selected sort key. It never returns internal score, rank value, components, exclusions, candidate pool, or other private signals.

## 16. Request lifecycle

### 16.1 Creation

create_marketplace_request:

- resolves customer_id from auth.uid;
- validates customer profile, category/service, flow, timing, address ownership, and attachments;
- snapshots the trusted location privately;
- sets revision one, edit deadline, collection window, and expiry;
- writes an initial revision and audit event;
- enqueues matching; and
- returns the request ID.

The client cannot create candidate, invitation, score, or job rows.

For non-Emergency requests, authoritative creation sets `expires_at = created_at + 10 minutes`, `edit_deadline_at = created_at + 5 minutes`, and `collection_not_before = created_at + 2 minutes` by default. All values are read from server configuration. Initial quote validity derives from request state rather than a separate MVP quote timer.

### 16.2 Selection and confirmation

select_worker_quote locks the request and quote, enforces the collection window and expected selection version, rechecks worker/quote eligibility, records one selection, rejects competing quotes only as required by lifecycle, schedules confirmation timeout, and notifies the selected worker.

confirm_selected_quote resolves the selected worker from auth.uid, locks request/quote, verifies the deadline and eligibility, reserves capacity, creates one booking and approved initial price snapshot through WPS-007-compatible trusted logic, links the records, and closes competing invitations atomically.

### 16.3 Confirmation timeout

The background worker locks the request. If still pending and the deadline passed, it rejects only the timed-out selection, notifies both parties, and returns the request to reviewing or matching depending on valid remaining quotes and request expiry.

### 16.4 Expiry and recovery

Expiry closes actionable invitations/quotes and creates a customer outcome with recovery actions. Retry creates a new linked request; it does not reopen a terminal row.

### 16.5 Editing

Minor edits are limited to description clarification, additional photos, corrected notes, compatible timing adjustments, and small address clarification. They append an audited revision and update the same request under the five-minute/selection lock. Invitations record the new revision and workers may retain, revise, or withdraw their quote.

Major edits include category, fundamental scope, material location, or any change that can invalidate pricing or eligibility. They close the original, invalidate quotes/invitations, and create one linked replacement transactionally. Uncertain classification is always major.

## 17. Scheduling

### 17.1 Storage

All request timestamps are timestamptz. timezone is stored as Africa/Cairo for launch. Customer input is normalized once at the boundary.

- ASAP: earliest feasible start; no fake midnight time.
- Today: valid remaining interval in the Cairo calendar day.
- Scheduled: exact future start and calculated/requested end.
- Flexible: inclusive future start/end window.

### 17.2 Matching and reservation

All schedule kinds begin matching immediately. Eligibility checks prohibited overlaps. Confirmation, not selection, reserves the time and refreshes capacity.

Flexible matching compares the worker’s commitments against the requested range and returns valid proposed times without silently turning the request into an exact appointment.

### 17.3 Existing booking conversion

The selected/proposed time is converted into existing booking scheduling fields. Any additional window data remains linked through marketplace_request_id until the booking schema has a separately approved window model.

## 18. Emergency dispatch

### 18.1 Separate execution path

Emergency requests do not create worker_quotes. They use emergency_dispatch_attempts and private invitations with a sanitized worker projection.

### 18.2 Atomic acceptance

accept_emergency_request:

1. resolves the worker;
2. locks the request;
3. verifies the attempt remains invited;
4. reruns every hard filter;
5. verifies the request is not awarded;
6. verifies the customer-approved surcharge state;
7. records the winner;
8. closes all other attempts;
9. creates one booking and initial approved price snapshot; and
10. enqueues notifications and capacity refresh.

The first transaction to satisfy every condition wins.

### 18.3 Rate and misuse controls

Emergency creation has stricter customer/account/device/location rate limits. Misuse signals remain private and require pattern/manual review. One signal never auto-suspends.

### 18.4 Customer-approved surcharge sequence

Before request insertion, a guarded price-preview contract resolves WPS-007-compatible authoritative price components and the applicable Emergency surcharge. The client displays that surcharge and submits an explicit approval token/version. `create_marketplace_request` validates the unexpired approval and only then creates the Emergency request. Acceptance verifies the same approved component/version. A missing, stale, changed, hidden, or retroactive surcharge fails closed.

## 19. Rescue Mode

### 19.1 Trigger

A trusted cancellation transaction enqueues Rescue Mode when an agreed worker cancels. The original request, location, schedule, scope, and authorized attachments remain linked. The cancelled worker is excluded.

### 19.2 Re-evaluation

Rescue Mode:

- locks the request/booking relationship;
- verifies financial state;
- identifies still-valid prior quotes;
- reruns eligibility;
- starts a rescue matching run when needed;
- prevents duplicate replacement bookings; and
- records every attempt and outcome.

### 19.3 Financial integrity

Rescue cannot silently move a payment, alter a price snapshot, release earnings, or transfer an agreement. Any replacement price requires the WPS-007-approved flow and explicit customer approval.

### 19.4 Normal Rescue execution

Normal Rescue automatically restarts invitation waves and may reuse still-valid prior quotes after eligibility recheck. The cancelled worker is excluded. The customer does not recreate the request. A replacement that preserves the approved agreement may continue through confirmation; any new price requires explicit customer approval through the applicable quote/selection and WPS-007 price controls. One request-to-booking uniqueness constraint and locked conversion prevent duplicate bookings.

## 20. Cancellation/no-show intelligence

### 20.1 Cancellation

Every post-agreement cancellation records actor, phase, normalized reason, timing relative to service, en-route/arrived state, recent rate, total volume, and rescue result. Aggregation distinguishes worker, customer, system, and mutually resolved causes. MVP creates no automatic cancellation fee. Worker cancellation starts Rescue Mode; customer cancellation defers to WPS-007 wherever money moved.

Potential interventions are policy outputs, never direct consequences of one event. Financial consequences remain governed by WPS-007 and an approved cancellation policy.

### 20.2 Running Late

report_worker_running_late resolves the assigned worker, validates an active booking milestone, bounds the delay and note, records the event, supersedes a prior active update, changes the authoritative ETA, and notifies the customer.

### 20.3 No-show

report_customer_no_show and report_worker_no_show:

- resolve the caller;
- verify the caller is the correct booking participant;
- verify the required milestone and elapsed time;
- store timestamp and minimal approximate-radius evidence;
- create an internal reviewable event; and
- create no automatic financial penalty.

For a customer report of worker no-show, the authoritative eligibility time is the latest ETA plus 15 minutes. A Running Late event replaces the prior ETA used by this calculation. One report creates no automatic punishment.

Raw GPS history is not stored. Evidence retention remains blocked pending policy.

## 21. Warranty/comeback preparation

The schema supports fail-closed per-category warranty configuration. No customer-facing warranty is returned unless the category is explicitly enabled with an approved duration. Exact durations are configuration, not hardcoded WPS behavior, and workers cannot create unlimited warranties.

marketplace_comeback_requests links:

- original completed booking;
- original provider;
- same-issue customer statement;
- evidence references;
- original-worker response deadline;
- routed marketplace request;
- dispute link when contested; and
- status/outcome.

The original worker receives the first opportunity. No automatic refund is created. Existing reviews, disputes, price snapshots, payments, refunds, and evidence records are linked rather than duplicated.

## 22. Realtime

### 22.1 Central service

Extend src/realtime/realtime-service.ts rather than creating screen-local channels.

Customer subscriptions:

- own marketplace request;
- quotes for that request;
- selection/confirmation changes; and
- Rescue Mode status.

Worker subscriptions:

- own quote invitations;
- own quote state;
- request revision reflected on the invitation;
- selection outcome; and
- Emergency/Rescue invitation state.

### 22.2 Publication boundary

Implemented local publication additions:

- marketplace_requests;
- quote_invitations;
- worker_quotes;
- marketplace_running_late_events; and
- any minimal client-visible rescue projection approved during implementation.

Do not publish candidate scores, exact locations, configuration, jobs, pricing profiles, opportunity state, capacity internals, abuse events, or raw audit records.

### 22.3 Client behavior

- Use narrow equality filters by customer, provider, or request.
- Treat a Realtime payload as an invalidation hint.
- Reload through the authoritative repository/RPC.
- Deduplicate stable event identities.
- Reconcile on subscribe/reconnect and AppState return.
- Clean up on unmount, logout, account switch, and customer/worker mode switch.
- Clear account-scoped state before another account loads.
- Never create a durable notification from a client Realtime handler.

## 23. Notifications

### 23.1 Existing architecture

Reuse public.notifications, owner RLS, read/dismiss RPCs, dedupe_key, central Realtime subscription, and established server-side localization pattern.

### 23.2 Event types

Customer:

- marketplace_quote_received
- marketplace_search_expanded
- marketplace_request_updated
- marketplace_request_expired
- marketplace_selection_pending
- marketplace_worker_confirmed
- marketplace_confirmation_expired
- marketplace_worker_cancelled
- marketplace_rescue_started
- marketplace_replacement_found
- marketplace_worker_running_late
- marketplace_worker_arrived
- marketplace_no_worker_found

Worker:

- marketplace_quote_invitation
- marketplace_request_updated
- marketplace_quote_selected
- marketplace_confirmation_required
- marketplace_awarded_elsewhere
- marketplace_request_cancelled
- marketplace_quote_expired
- marketplace_emergency_invitation
- marketplace_rescue_invitation

### 23.3 Safety

Every event is inserted in the authoritative business transaction with a deterministic dedupe key. Payloads use only request_id, booking_id, invitation_id, or quote_id as needed. They contain no scores, weights, exclusion reasons, candidate pool, competitor identity/price, exact customer location, or trust internals.

English and Egyptian Arabic content is selected using the recipient’s preferred language. Unknown language falls back to English. Routing code verifies ownership again when opened.

## 24. Background jobs

### 24.1 Required job kinds

- start_matching;
- open_customer_review;
- send_additional_wave;
- expire_request;
- expire_invitation;
- expire_quote;
- expire_selection_confirmation;
- scheduled_reminder;
- start_rescue;
- refresh_worker_metrics;
- refresh_pricing_profile;
- refresh_capacity;
- reconcile_notifications; and
- evaluate_no_show_eligibility.

### 24.2 Edge Functions

**IMPLEMENTED LOCALLY; PRODUCTION INVOCATION GATED:**

1. supabase/functions/marketplace-worker — authenticated only as a trusted scheduled worker; leases due private jobs, invokes private mutation functions, records sanitized results, and returns idempotent batch summaries.
2. supabase/functions/marketplace-worker-health — trusted operational health endpoint exposing no customer, worker, score, location, or quote data; verifies scheduler recency and queue health.

Client-facing mutations remain guarded database RPCs so identity comes from auth.uid and race-sensitive changes remain atomic.

No push-delivery Edge Function is specified because the existing product implements durable in-app notifications and no approved push-provider contract was found. Adding external push is a separate engineering/product decision.

### 24.3 Scheduler

No trusted scheduler is currently deployed. Contracts and local simulation may be implemented, but:

- marketplace_configuration.scheduler_enabled remains false;
- due jobs do not claim successful automation;
- selection/emergency mutations fail safely when required background guarantees are unavailable; and
- WPS-008 cannot pass background-operation acceptance or deploy until a trusted scheduler invokes marketplace-worker.

Scheduler selection, secrets, cadence, retry alerting, and runbook require an explicit deployment record.

## 25. RPC/API design

Every RPC uses a fixed empty search_path, fully qualified objects, explicit authorization, bounded inputs, row locks for state changes, and sanitized returns. Mutation EXECUTE is revoked from PUBLIC and anon. Authenticated grants exist only where the function resolves and checks the caller.

### 25.1 Customer mutations

| Public RPC signature | Purpose |
| --- | --- |
| create_marketplace_request(p_request jsonb, p_idempotency_key text) | Create and enqueue a customer-owned request. |
| edit_marketplace_request(p_request_id uuid, p_expected_revision integer, p_patch jsonb, p_idempotency_key text) | Apply an approved minor edit or create a linked major replacement. |
| cancel_marketplace_request(p_request_id uuid, p_reason text, p_idempotency_key text) | Cancel before selection or invoke the approved post-selection path. |
| select_worker_quote(p_request_id uuid, p_quote_id uuid, p_expected_selection_version integer, p_idempotency_key text) | Race-safe customer selection after the fairness window. |
| retry_marketplace_request(p_request_id uuid, p_strategy text, p_idempotency_key text) | Create a linked retry/expansion/scheduled request after terminal expiry. |
| report_worker_no_show(p_booking_id uuid, p_evidence jsonb, p_idempotency_key text) | Authorized customer no-show report. |
| create_comeback_request(p_booking_id uuid, p_details jsonb, p_idempotency_key text) | Disabled until warranty policy activation. |

### 25.2 Worker mutations

| Public RPC signature | Purpose |
| --- | --- |
| mark_worker_available(p_available boolean) | Update the simple owned availability state. |
| set_worker_emergency_category(p_category_id text, p_enabled boolean) | Manage owned category-level Emergency opt-in. |
| view_quote_invitation(p_invitation_id uuid) | Idempotently mark an owned invitation viewed. |
| submit_worker_quote(p_invitation_id uuid, p_quote jsonb, p_idempotency_key text) | Create one owned quote with immutable revision one. |
| revise_worker_quote(p_quote_id uuid, p_quote jsonb, p_idempotency_key text) | Replace the owned current terms before selection while appending an immutable auditable revision. |
| decline_quote_invitation(p_invitation_id uuid, p_reason text, p_idempotency_key text) | Decline an owned invitation without pre-agreement penalty. |
| withdraw_worker_quote(p_quote_id uuid, p_reason text, p_idempotency_key text) | Withdraw an eligible unselected owned quote. |
| confirm_selected_quote(p_request_id uuid, p_quote_id uuid, p_idempotency_key text) | Confirm the selected owned quote within the deadline. |
| accept_emergency_request(p_invitation_id uuid, p_idempotency_key text) | First-valid atomic Emergency acceptance. |
| report_worker_running_late(p_booking_id uuid, p_delay_minutes integer, p_reason_code text, p_note text, p_idempotency_key text) | Send an assigned-worker delay update. |
| report_customer_no_show(p_booking_id uuid, p_evidence jsonb, p_idempotency_key text) | Authorized worker no-show report after the approved wait. |

### 25.3 Read APIs

| Public RPC signature | Sanitized result |
| --- | --- |
| get_customer_marketplace_request(p_request_id uuid) | Owned request, lifecycle, recovery actions, and safe counts. |
| get_customer_quotes(p_request_id uuid, p_sort text) | Owned request’s quotes and public comparison data; no internal score. |
| get_worker_quote_invitations(p_cursor timestamptz, p_limit integer) | Owned invitations with approximate request details. |
| get_worker_quote(p_quote_id uuid) | Owned quote and own revisions only. |
| get_marketplace_capabilities() | Enabled flows and safe configuration-derived capability flags, never weights. |

### 25.4 Trusted-only APIs

- private.start_marketplace_matching
- private.create_marketplace_wave
- private.expire_marketplace_request
- private.expire_quote_invitation
- private.expire_worker_quote
- private.expire_selected_confirmation
- private.trigger_rescue_matching
- private.refresh_worker_marketplace_metrics
- private.refresh_worker_pricing_profiles
- private.refresh_worker_capacity
- private.lease_marketplace_jobs
- private.complete_marketplace_job

No client can invoke these functions.

## 26. RLS and grants

### 26.1 Table policy matrix

| Object | Customer access | Worker access | Anonymous | Staff/trusted |
| --- | --- | --- | --- | --- |
| marketplace_requests | Own rows only, preferably through sanitized RPC | No direct row access; invited projection via RPC | None | Authorized operations only |
| marketplace_request_revisions | Own request revisions | No direct access; revision notice through invitation projection | None | Authorized operations only |
| marketplace_request_attachments | Own metadata | No direct metadata; signed access through invitation check | None | Authorized operations only |
| quote_invitations | No direct candidate-pool read | Own invitations only | None | Trusted matching |
| worker_quotes | Quotes addressed to own request | Own quote only | None | Trusted lifecycle |
| worker_quote_revisions | Revisions for own request’s quotes | Own revisions only | None | Trusted lifecycle |
| provider_emergency_categories | No direct access | Own settings only | None | Trusted eligibility |
| cancellation/no-show/running-late events | Own participant-safe projection | Own participant-safe projection | None | Full authorized review |
| marketplace_comeback_requests | Own records | Original/assigned worker projection | None | Authorized review |
| notifications | Existing owner-only policy | Existing owner-only policy | None | Trusted insertion |
| all private marketplace objects | None | None | None | Service role or guarded staff/trusted functions |

### 26.2 Mutation rules

- Revoke direct INSERT, UPDATE, and DELETE from authenticated clients on marketplace business tables.
- Grant SELECT only where column exposure and RLS are both safe.
- Prefer sanitized SECURITY DEFINER read RPCs when a table contains fields one participant must not see.
- Do not rely on RLS alone to hide columns in a row visible to both parties.
- Resolve customer profile and provider profile from auth.uid.
- Never accept an authoritative customer_id or provider_id from the client.
- Prevent user-editable metadata from granting staff or worker eligibility.
- Keep private matching and financial helpers inaccessible to authenticated users.

### 26.3 Storage

Request attachment read/upload/delete policies validate:

- bucket;
- path grammar;
- auth.uid ownership;
- request ownership or active invitation authorization;
- MIME and size;
- request state and revision; and
- signed URL expiry.

Workers never list a bucket or infer other request paths.

## 27. Rate limiting and abuse controls

### 27.1 Technical controls

- request creation throttles by account and privacy-preserving device/network signal;
- stricter Emergency throttles;
- idempotency on every mutation;
- one invitation per request/worker;
- one quote per request/worker;
- bounded quote revisions when enabled;
- bounded attachments, text, money, duration, ETA, and location;
- selection and confirmation version checks;
- suspicious revision and underquote-to-final variance events;
- ignored-invitation rate based on actionable opportunities;
- duplicate-account signal preparation;
- location plausibility validation;
- notification deduplication;
- append-only audit events; and
- staff-review flags.

### 27.2 Enforcement

Private counters use time buckets and row locks. A rate-limited request returns a stable safe error without revealing thresholds. One signal cannot suspend a user. Automatic controls may temporarily reject excessive creation or duplicate mutations, while consequential account action requires approved policy and review.

## 28. Mock mode

### 28.1 Isolation

Marketplace repositories select Mock or Supabase once from environment.dataMode. Mock modules must not import or initialize the Supabase client. Supabase errors do not fall back to Mock data.

### 28.2 Parity

Mock mode implements:

- requests;
- invitations;
- eligibility;
- ranking;
- pricing benchmarks;
- capacity;
- fairness;
- waves;
- quote submission and allowed revisions;
- selection and confirmation;
- expiry and timer simulation;
- editing;
- scheduling;
- availability;
- Rescue Mode;
- Emergency;
- notifications;
- realtime-like invalidations; and
- account isolation.

### 28.3 Deterministic engine

Pure TypeScript domain functions implement normalization, pricing quantiles, fairness bounds, capacity overlap, quote sorting, and state transitions. Mock repositories use the same versioned policy contract and a controllable clock/random seed. Supabase mode independently enforces the authoritative SQL rules; parity tests compare fixtures and outcomes.

Storage keys include the active Mock account and schema version. Account switch clears visible state before loading another namespace.

Development simulations are guarded by dataMode and development build state and cannot appear in production.

## 29. Localization and accessibility

### 29.1 Localization

- Add English and natural Egyptian Arabic copy for every request, invitation, quote, sort, status, notification, expiry, Emergency, Rescue, no-show, Running Late, and failure state.
- Keep authoritative amounts in piastres and reuse WPS-007 money formatting.
- Use Africa/Cairo-aware date formatting.
- Do not concatenate translated fragments when grammar changes by language.
- Arabic content uses correct UTF-8 source text and passes the mojibake check.
- Worker-facing copy uses simple sentences and “Unable to Complete Job” where appropriate.

### 29.2 RTL

- Logical start/end layout replaces fixed left/right assumptions.
- Quote cards, sort controls, timelines, price breakdowns, and icons are visually verified in RTL.
- Numerals, currency, ETA, and time remain understandable in mixed-direction text.

### 29.3 Accessibility

- Large worker actions and minimum touch targets;
- descriptive accessibility labels for sort and selection state;
- selected/disabled/expired state conveyed beyond color;
- readable text scaling;
- predictable focus order;
- announcements for live quote, selection, confirmation, expiry, and rescue changes; and
- reduced-motion-safe updates.

## 30. Observability and analytics

### 30.1 Events

Emit restricted events for the WPS-008 analytics list with:

- event ID and dedupe key;
- request/booking/provider pseudonymous references;
- category/service and coarse area;
- policy versions;
- event time;
- safe duration/count/price fields; and
- no raw customer address, phone number, chat content, attachment content, national ID, score components, or secret.

### 30.2 Operational metrics

- due-job lag and oldest pending job;
- job retry/terminal-failure count;
- matching latency and candidate query duration;
- eligible-pool size;
- waves and invitations per request;
- time to first quote and selection;
- selection confirmation timeout rate;
- Realtime reconnect/reconciliation failures;
- notification dedupe conflicts;
- Rescue and Emergency success;
- pricing/capacity profile staleness; and
- RLS/RPC authorization failures by safe error code.

### 30.3 Auditability

Authorized support can trace request → matching run → invitation → quote → selection → confirmation → booking by IDs and policy versions without seeing private scores unless explicitly authorized.

Retention and deletion schedules are not invented here. Production analytics/evidence retention remains blocked pending approved privacy/legal policy.

## 31. Testing strategy

No test in this section is claimed to exist or pass.

### 31.1 Unit tests

Add TypeScript tests for:

- score normalization and deterministic ties;
- price median, p25, p75, sparse history, and promotion neutrality;
- fairness bounds, decay, concentration, and customer-cancellation attribution;
- capacity intervals, overlap, rolling 24-hour workload, and stale cache behavior;
- Best Value and every customer sort;
- request, invitation, quote, Emergency, and Rescue state mapping;
- clock-driven expiry and confirmation behavior;
- Mock account isolation;
- English/Arabic money, time, and status formatting; and
- RTL-sensitive presentation state.

Use the repository’s existing Node test style unless a separately reviewed test framework is introduced.

### 31.2 Database integration and security tests

Create supabase/tests/database/marketplace-intelligence.test.sql using existing pgTAP conventions.

Required cases:

- service mismatch excluded;
- outside worker radius excluded;
- outside marketplace radius excluded;
- unavailable worker excluded;
- unverified worker excluded;
- inactive/suspended/blocked worker excluded;
- cash-restricted worker excluded from cash-only but not an available online method;
- Emergency category and opt-in required;
- eligible worker included;
- distance and ETA ordering;
- capacity adjustment and hard conflict;
- robust pricing and higher-price participation;
- cold-start neutrality;
- fairness bound, recovery, new-worker opportunity, and quality floor;
- invitation uniqueness;
- wave retry idempotency;
- target quote stops new waves;
- existing invitees may still quote;
- quote isolation and one quote per worker/request;
- collection window and early close;
- race-safe selection;
- selected-worker-only confirmation;
- confirmation timeout;
- late quote cannot replace selection;
- request background jobs independent of a client;
- customer cancellation;
- minor edit notice and quote options;
- major edit replacement and invalidation;
- scheduled capacity reservation;
- Available/Unavailable behavior;
- expiry recovery projection;
- Emergency first acceptance and concurrent race;
- Rescue data preservation and duplicate-booking prevention;
- no-show and Running Late authorization;
- PUBLIC and anon denial on every mutation RPC;
- cross-customer, cross-worker, and cross-mode denial;
- notification dedupe;
- storage attachment isolation;
- Realtime publication allow-list;
- private table and function denial; and
- exact-address and score non-disclosure.

### 31.3 End-to-end tests

An approved E2E harness must cover:

- Customer Get Quotes through confirmed booking;
- Browse Worker request and decline/accept outcome;
- background app during quote collection and authoritative return;
- live quote arrival and all customer sorts;
- confirmation timeout and reselection;
- minor and major edits;
- Scheduled and Flexible requests;
- Emergency concurrent accept;
- worker cancellation and Rescue Mode;
- Running Late and both no-show reports;
- English, Egyptian Arabic, and RTL;
- logout/account switch with no stale data; and
- Mock and local Supabase flows without cross-mode fallback.

No E2E framework is currently installed. Framework selection is an engineering deployment question, not evidence that E2E tests exist.

### 31.4 Smoke tests

Provide:

- deterministic local Mock smoke script;
- local Supabase marketplace smoke script;
- manual customer checklist;
- manual worker checklist;
- background scheduler checklist;
- Realtime reconnect checklist;
- accessibility and RTL checklist; and
- deployment-safe capability check showing disabled production features honestly.

### 31.5 Failure tests

Cover:

- scheduler absent or stale;
- job lease expiry and retry;
- duplicate Edge invocation;
- database deadlock/retry-safe idempotency;
- no location or invalid location;
- PostGIS unavailable;
- no eligible worker;
- all workers decline;
- request, invite, quote, and confirmation expiry races;
- worker becomes ineligible after quoting;
- payment capability changes before confirmation;
- cash threshold crossed before confirmation;
- attachment upload succeeds but metadata fails;
- notification insert retry;
- Realtime disconnect/account switch;
- stale capacity/pricing cache;
- WPS-007 price-snapshot failure during conversion;
- Rescue conversion failure; and
- Emergency losing concurrent acceptance.

### 31.6 Full validation required before completion

- TypeScript;
- ESLint with zero warnings;
- mojibake;
- git diff check;
- Expo Doctor;
- Android export;
- iOS export;
- local Supabase migration list;
- linked migration list;
- exact dry run;
- local database reset;
- all pgTAP suites;
- all existing custom tests;
- new unit, integration, E2E, smoke, and failure tests; and
- honest manual-smoke status.

No hosted migration is applied by validation.

## 32. Migration strategy

### 32.1 Forward-only plan

**IMPLEMENTED filenames:** `supabase/migrations/202607310002_marketplace_intelligence_schema.sql` and `supabase/migrations/202607310003_marketplace_intelligence_api.sql`.

The primary migration must:

1. verify required prior objects;
2. enable approved geospatial support;
3. add the four missing locked categories;
4. add configuration and private intelligence tables;
5. add marketplace request/invitation/quote/event/job tables;
6. add booking links;
7. add constraints and indexes;
8. add private helpers and public guarded RPCs;
9. enable RLS on every public addition;
10. revoke PUBLIC/anon and grant minimum authenticated access;
11. add only the approved Realtime tables;
12. create private Storage bucket policies;
13. seed disabled configuration;
14. preserve legacy quotes/bookings without rewriting them; and
15. avoid claiming scheduler or hosted activation.

A corrective migration is created only for a later proven defect. Remotely applied migrations are never edited.

### 32.2 Data migration

- Do not turn legacy booking_quotes into worker_quotes.
- Do not infer worker matching coordinates from display labels.
- Do not copy public service-area coordinates into the private canonical location without worker confirmation and validation.
- Do not fabricate pricing history from incomplete or non-completed bookings.
- Backfill pricing profiles only from qualifying WPS-007 snapshots.
- Existing provider emergency_available may prefill a review prompt, but category opt-in is not silently assumed for every category.
- Existing weekly availability remains for compatibility until its constitutional migration is complete; WPS-008 matching does not require it.

### 32.3 Ledger verification

Final read-only ledger verification recorded:

- local and linked lists agree through `202607290002`;
- pending WPS-007 migrations are `202607300001` and `202607300002`;
- the dry run additionally names `202607310001`, `202607310002`, and `202607310003`; and
- no hosted mutation occurred.

## 33. Deployment gates

WPS-008 is safe to deploy only when all gates pass:

- [x] Constitution, WPS-008, WES-008, WPS-001 through WPS-007, and exact Expo SDK 54 documentation were reviewed.
- [x] Every Section 34 blocking product question is resolved in an authoritative document.
- [x] Existing email-only worker auth is reconciled with phone-primary, optional-email constitutional behavior.
- [x] Weekly availability is no longer required by the WPS-008 worker experience.
- [x] Chat enforces immediate cancelled read-only and the approved completed follow-up window.
- [x] All ten locked categories exist without extras.
- [x] Local and linked ledgers are readable and the dry run names the exact pending migrations.
- [x] Every forward-only migration executes on a clean local reset.
- [x] Every existing and new automated test suite passes: 9 pgTAP suites / 633 assertions plus 44 custom assertions.
- [x] TypeScript, ESLint zero warnings, mojibake, Expo Doctor 18/18, Android export, and iOS export pass.
- [x] Local review and lint found no P0 or P1 security issue; one non-blocking pre-existing WPS-007 unused-variable lint warning remains.
- [x] RLS, grants, exact-address privacy, score privacy, quote isolation, and Storage isolation pass local automated/catalog checks; worker attachment signing remains deliberately unavailable.
- [ ] Mock/Supabase separation and account isolation pass.
- [ ] Private-coordinate Haversine query plans are verified against production-scale data; PostGIS/GiST remains a scale-trigger option.
- [x] Marketplace and scheduler configuration remain disabled until a trusted scheduler and marketplace-worker are deployed, secured, monitored, and exercised.
- [ ] Background job lag and failure alerts are operational.
- [x] WPS-007 financial integration passes without enabling live gateway/payout behavior.
- [x] Manual smoke-test status is reported honestly as **NOT RUN**.
- [x] No hosted migration was applied; any future push requires explicit deployment authorization.

## 34. Open engineering questions

### 34.1 Repository alignment status

The five previously documented repository contradictions are resolved in the local working tree by `202607310001_repository_alignment.sql` and the associated application changes. This records implementation status only; it does not claim a hosted migration or production activation.

| ID | Resolution | Verification |
| --- | --- | --- |
| GAP-001 | Worker registration and sign-in are phone-first SMS OTP flows; email is optional for workers; existing customer email/password behavior remains. New worker activation requires Supabase-confirmed phone ownership while existing provider accounts are preserved. | TypeScript unit coverage plus pgTAP activation/grant tests. |
| GAP-002 | Weekly availability is removed from worker UX and matching RPCs. Available/Unavailable is a guarded binary mutation. Capacity foundations use confirmed scheduled commitments, resolved duration, deterministic fallback travel, and the fixed 30-minute buffer, with missing information failing closed. | TypeScript/unit boundaries plus pgTAP capacity/configuration tests. |
| GAP-003 | Server message, attachment-upload, and typing writes lock immediately on cancellation and at the exact 48-hour completion boundary; history reads remain unchanged. | TypeScript boundary tests plus pgTAP lifecycle/failure tests. |
| GAP-004 | The seed, Mock catalog, public catalog, and forward migration expose exactly the ten locked launch categories. | pgTAP exact-set assertion and Mock adapter audit. |
| GAP-005 | Public provider-related RLS, the catalog/trust RPCs, service offers, and direct booking require approved identity verification. The private eligibility helper is revoked from clients and is mandatory for future WPS-008 invitation and Emergency paths. | pgTAP public-visibility, catalog, trust, direct-booking, and privilege tests. |

### 34.2 Product decision register

The product-owner decisions are incorporated into WPS-008 version 1.2. None remains a blocker:

| ID | Status | Resolution |
| --- | --- | --- |
| PROD-001 | **RESOLVED** | WPS-001 through WPS-006 now exist as audited as-built baselines. Cross-spec review found no unresolved contradiction; later locked WPS-007/008 corrections govern recorded legacy behavior. |
| PROD-002 | **RESOLVED** | Request lifetime is 10 minutes by default from authoritative creation. MVP initial quotes have no independent timer. |
| PROD-003 | **RESOLVED** | Target is five useful active quotes, configurable; new waves stop at target while existing invitees may respond. |
| PROD-004 | **RESOLVED** | Owned quote revisions are enabled before selection with one current version and immutable history; selection locks the quote. |
| PROD-005 | **RESOLVED** | Enumerated minor edits preserve/audit; category, fundamental scope, material location, or price/eligibility risk is major; uncertainty is major. |
| PROD-006 | **RESOLVED** | WPS-007-compatible surcharge is shown and explicitly approved before Emergency request creation. |
| PROD-007 | **RESOLVED** | Normal Rescue restarts waves automatically, reuses valid quotes only after eligibility, excludes the cancelling worker, and requires customer approval for a changed price. |
| PROD-008 | **RESOLVED** | Customer worker-no-show report becomes eligible 15 minutes after the latest authoritative ETA; Running Late changes that ETA. |
| PROD-009 | **RESOLVED** | Warranty is fail-closed and category-configurable. Nothing is displayed until a category and duration are approved. |
| PROD-010 | **RESOLVED** | MVP has no automatic cancellation fee; context is recorded, worker cancellation starts Rescue, and WPS-007 governs moved money. |
| PROD-011 | **RESOLVED** | Browse Workers MVP uses Request a Quote, customer acceptance, worker confirmation, then existing booking conversion. Fixed-price direct booking is outside MVP except safe compatibility. |

### 34.3 Deferred configuration requiring approval before activation

- exact wave sizes, cadence, and radius steps;
- exact ranking weights and normalization curves;
- fairness windows, bounds, and new-worker exit;
- worker-specific pricing history threshold;
- pricing area granularity and recency;
- routing-provider credentials and operational service selection;
- initial per-category duration values, configured before activation;
- road-factor and average-urban-speed configuration values, configured before activation;
- analytics/evidence retention;
- customer pricing personalization;
- category credentials when legally required; and
- approved per-category warranty enablement and duration values.

The schema and contracts may support these values, but marketplace_configuration.enabled remains false until required launch values are approved.

### 34.4 Operational questions

| ID | Question | Gate |
| --- | --- | --- |
| OPS-001 | What trusted scheduler invokes marketplace-worker, with what secrets, cadence, retry policy, and alerting? | Background operation and deployment. |
| OPS-002 | What is the actual linked migration ledger, especially for uncommitted WPS-007 migrations? | Migration ordering and dry run. |
| OPS-003 | Is PostGIS available and approved in every target environment? | Geographic eligibility and indexed performance. |
| OPS-004 | Which E2E harness is approved for Expo 54 native flows? | Automated end-to-end acceptance. |
| OPS-005 | What operational role may inspect restricted candidate-score and evidence records? | Support authorization and auditability. |

## 35. Acceptance mapping

| WPS-008 area | Implementation | Primary verification |
| --- | --- | --- |
| Authority, mission, scope, terminology | Document hierarchy, deployment gates, worker/provider mapping | AC-008-001–004 review |
| Marketplace flows | marketplace_requests flow_kind and separate Emergency path | E2E and pgTAP AC-008-005–007 |
| Categories | Forward-only seed additions for four missing categories | Migration/pgTAP AC-008-008 |
| Eligibility | private eligibility helper and repeated hard-filter checks | pgTAP AC-008-009–015 |
| Geography | Restricted canonical coordinates, deterministic distance, dual-radius checks, approximate projection | pgTAP, query plan, privacy tests |
| Availability/capacity | is_available plus inferred interval projections | Unit/pgTAP AC-008-016–020 |
| Historical pricing | WPS-007 completed snapshots, robust profiles, cold-start cascade | Unit/pgTAP AC-008-021–024 |
| Behavioral intelligence | Versioned restricted metrics and contextual events | pgTAP/replay AC-008-025 |
| Ranking | Fixed-precision versioned policy and hidden score records | Unit/security AC-008-026–027 |
| Fairness | Bounded recoverable adjustment after quality floors | Replay/unit/pgTAP AC-008-028–031 |
| Progressive waves | Locked idempotent wave function plus trusted job queue | pgTAP/failure AC-008-032–034 |
| Quotes | invitation-scoped quote and immutable revisions | pgTAP/security AC-008-035–038 |
| Comparison/sorting | Sanitized customer projection and pure sort functions | Unit/E2E AC-008-039–041 |
| Selection/confirmation | Row locks, expected version, deadline job, atomic booking conversion | Concurrency/pgTAP AC-008-042–046 |
| Request lifecycle/background | Durable state machine, jobs, authoritative reload | E2E/failure AC-008-047–050 |
| Editing | Immutable revisions and linked replacements | pgTAP/E2E AC-008-051–053 |
| Scheduling | timestamptz windows, Cairo normalization, confirmation reservation | Unit/pgTAP AC-008-054–056 |
| Emergency | Separate attempts and first-valid locked acceptance | Concurrency/E2E AC-008-057–059 |
| Cancellations/Rescue | Context events, trusted rescue runs, booking uniqueness | pgTAP/E2E AC-008-060–063 |
| No-show/Running Late | Participant/timer authorization and minimal evidence | pgTAP/E2E AC-008-064–067 |
| Warranty/comeback | Disabled linked contract pending policy | pgTAP/E2E AC-008-068–069 after activation |
| Reputation/preferences | Existing moderated reviews; neutral deferred personalization | pgTAP/review AC-008-070–071 |
| Notifications/Realtime | Existing notification table, central filtered subscriptions, reload | Integration/E2E AC-008-072–074 |
| Analytics/anti-abuse | Restricted append-only events, throttles, review flags | Security/failure AC-008-075–076 |
| Mode isolation | Separate repositories, account namespaces, controllable clock | Unit/E2E AC-008-077–078 |
| Test completeness | Unit, pgTAP, integration, E2E, smoke, failure, manual | Gate AC-008-079–080 |

## 36. Changelog

- 2026-07-31 — Version 1.4. Recorded the forward-only local schema/API and Expo implementation, 96-assertion WPS-008 pgTAP suite, 20 marketplace unit assertions, participant RLS, and fail-closed production scheduler, worker attachment signer, warranty-category, retention, and hosted-deployment gates. No hosted deployment or unperformed manual result is claimed.
- 2026-07-31 — Version 1.3. Reconciled WPS-001 through WPS-006, resolved PROD-001 through PROD-011, and specified authoritative timing, quote revision, edit, Emergency surcharge, Rescue, no-show, warranty, cancellation, and Browse Worker engineering contracts.
- 2026-07-31 — Version 1.2. Recorded the local repository alignment for phone-first worker accounts, binary availability and capacity foundations, approved-verification gating, booking-chat locks, and the exact ten-category taxonomy. No hosted deployment is claimed.
- 2026-07-31 — Version 1.1. Implemented the locked GAP-002 engineering policy for routing estimates, deterministic travel fallback, category duration defaults, fixed 30-minute buffer, fail-safe missing information, overlap exclusion, and rolling capacity.
- 2026-07-31 — Version 1.0. Initial **PROPOSED ENGINEERING BASELINE** based on the inspected repository. No implementation, migration, test, configuration, or hosted deployment is claimed.
