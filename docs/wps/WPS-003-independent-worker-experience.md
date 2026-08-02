# WPS-003 - Independent Worker Experience

## Document metadata

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** |
| Authority | Warsha Constitution |
| Source | Existing repository, migrations, tests, and implemented behavior |

## 1. Terminology and authority

Product language uses **independent worker** or **worker**. Existing implementation names such as `provider_profiles`, `provider-mode`, and `provider_jobs` remain technical mappings only. This document does not imply employment, promised work, managed shifts, or a career program.

Primary evidence includes `app/provider-mode.tsx`, `app/provider-job`, `app/provider-earnings.tsx`, `app/provider-verification.tsx`, `src/providers`, `src/provider-jobs`, `src/verification`, WPS-007, migrations `202607200008`, `202607200010`, `202607290002`, `202607300001`, `202607300002`, and `202607310001`.

## 2. Activation and onboarding

- A new worker activates through verified phone OTP. Email is optional.
- The worker profile is separate from the Auth/user profile and maps to `provider_profiles.user_id`.
- Onboarding collects public name/photo, profession, biography, experience, languages, skills, category membership, offered services, pricing model and price inputs, service area/radius, emergency preference, and agreement acceptance.
- A draft can be saved before submission. Submission changes the profile to a staff-review state; protected approval/publication/verification fields cannot be self-approved by the worker.
- Avatar uploads are bounded images in the profile-images bucket. Supabase foundation writes use the aggregate `save_provider_foundation(jsonb,boolean)` RPC to validate and replace child service/area records consistently.

## 3. Worker mode and job-first navigation

- Worker mode has two primary sections: Jobs and Profile. Earnings and Verification are prominent supporting actions.
- The UX uses large actions, short status labels, progressive profile steps, and Egyptian-Arabic/RTL support rather than an enterprise dashboard.
- There are no teams, shifts, dispatchers, employment metrics, training, badges, gamification, or career ladders.

## 4. Availability and inferred capacity

- Current worker-facing availability is one binary choice: **Available** or **Unavailable**.
- `mark_worker_available(boolean)` is owner-guarded and clears the old temporary-unavailable value.
- **Previous behavior:** migrations and schema included weekly availability rows, working windows, breaks, and dated availability.
- **Current aligned behavior:** `202607310001_repository_alignment.sql` removes weekly scheduling from public matching/direct-booking behavior. Legacy rows remain only for owner/history compatibility and are not a marketplace eligibility requirement.
- Structured booking duration, deterministic fallback travel, confirmed commitments, a fixed 30-minute capacity buffer, and fail-closed conflict checks form the current capacity foundation. Full WPS-008 capacity ranking is not yet active.

## 5. Job requests and lifecycle actions

- The worker sees bookings assigned to the owned provider profile and receives Realtime invalidations scoped by provider ID.
- For a pending request the assigned approved/published worker may accept, reject with a reason, or propose another future time.
- The customer, not the worker, accepts or rejects a proposed time. A proposal preserves the original schedule until accepted.
- The worker may progress a valid booking through confirmation, on the way, arrived, work started, work in progress, completion, or dispute according to the authoritative transition graph.
- Completion may include notes and private completion-evidence images. Failed metadata or state mutation triggers best-effort object/metadata rollback.
- The worker-side no-show action currently records the customer as unavailable only after the worker has reached `provider_arrived`; a customer report of worker no-show is not implemented in this baseline.
- Post-agreement worker cancellation and WPS-008 Rescue Mode are not implemented in the existing worker-job repository.

## 6. Earnings and financial boundaries

- The Earnings screen reuses WPS-007 projections for pending, available, held, paid, cash-debt, withdrawal, destination, and recovery states.
- Worker money is not a salary or guaranteed income. All balances and releases are ledger-backed and server-authoritative.
- Mock gateway/payout behavior is development-only. Live providers, live payouts, and a persistent release scheduler are disabled.
- No hidden deduction may be inferred from invitation, cancellation, no-show, or ranking behavior.

## 7. Verification

- Identity verification collects National ID front/back and selfie; the Skill Certificate answer and document are optional.
- Editable, submitted, under-review, approved, rejected, resubmission-required, and expired states are implemented.
- Documents are private and owner/staff scoped. The worker sees short-lived signed URLs for owned documents.
- Approved identity controls marketplace discovery. Optional Skill Certificate approval is displayed separately and is not required for general identity approval.
- Staff review exists as a guarded RPC and pgTAP contract; no production admin UI is included in this mobile repository.

## 8. Notifications and Realtime

- Workers receive durable booking, chat, review, verification, payment/earnings, and withdrawal notifications produced by authoritative server mutations.
- Provider Jobs, Verification, Reviews, and Earnings reconcile from the authoritative repository on Realtime signals, reconnect, pull-to-refresh, and app foreground where implemented.
- Mock repositories emit equivalent local invalidations and deduplicated local notifications for supported flows.

WPS-011 governs the worker's one-time immutable public review reply, public reputation metrics and badges, and staff-audited review moderation. WPS-003 continues to govern worker identity, job lifecycle actions, and worker-owned private data.

## 9. What is inferred instead of configured

- The locked direction is to infer capacity from committed work, duration, travel, and buffer; pricing/reliability from completed behavior; and opportunity fairness from invitation history.
- Only the capacity foundation exists today. Historical pricing, behavioral scoring, ranking, and fairness remain WPS-008 implementation work.
- Workers do not configure weekly shifts, lunch breaks, vacations, opportunity weights, ranking, price tiers, or customer trust rules.

## 10. Existing limitations

- WPS-008 invitations, private quote submission/revision, selection confirmation, Emergency acceptance, Rescue Mode, Running Late, and marketplace no-show flows are absent.
- Provider foundation reads currently depend on direct owner table access; authorization must remain RLS/ACL reviewed during implementation.
- No push notifications, production maps/ETA, masked calls, staff moderation UI, background scheduler, or production payout provider is active.
- Manual worker comprehension, low-literacy usability, Arabic/RTL, accessibility, and native lifecycle testing is not recorded as passed.

WPS-012 governs fine-grained post-confirmation job execution, progress evidence, additional-work approval context, worker readiness, customer inspection, warranty, and return sections. WPS-003's legacy job actions remain compatible, while the active worker job surface delegates post-confirmation execution to the WPS-012 operational aggregate.

## WPS-014 notification integration

WPS-014 uses the persisted customer/provider app mode to scope worker inbox rows, counts, Realtime reconciliation, preferences, and routes. It adds no employment framing, availability pressure, opportunity gamification, ranking manipulation, or promotional engagement.

