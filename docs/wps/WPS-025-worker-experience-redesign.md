# WPS-025 — Worker Experience Redesign

| | |
| --- | --- |
| **Version** | 1.0 |
| **Status** | LOCKED — IMPLEMENTED LOCALLY, DEVICE ACCEPTANCE PENDING |
| **Authority** | Approved WPS-025 architecture study |
| **Depends on** | WPS-003, WPS-006, WPS-007, WPS-008, WPS-010, WPS-012, WPS-014, WPS-023 and WPS-024 |

## 1. Purpose

Warsha contains a customer product and a worker product. WPS-025 makes the
worker product state-driven: after authentication the worker should see the
single most important next action, not a list of backend subsystems they must
understand.

The customer product is unchanged.

## 2. Locked product decisions

1. `/worker` is the canonical authenticated worker home.
2. A worker session opens in the worker experience. Requesting a service is an
   explicit action and is never remembered across sessions as the worker's
   default experience.
3. The dashboard chooses its primary card from authoritative worker, vetting,
   verification and booking state.
4. Worker onboarding is one guided journey. Backend gates and lifecycle
   authorities remain separate and unchanged.
5. `/worker/verification` is the only worker-facing verification experience.
   It composes the existing WPS-006 document authority and WPS-023 onboarding
   authority; it does not merge or replace them in the backend.
6. Editable numeric fields begin blank. A database default is not presented as
   an answer supplied by the worker.
7. Earnings keep all arithmetic in `BigInt`; formatting consumes the exact
   decimal string and never converts it through floating point or passes a
   `BigInt` to `Intl.NumberFormat`.
8. Legacy worker paths remain compatible through redirects or thin wrappers.
9. Customer home, customer routing, authentication, RLS, grants, verification
   decisions, provider activation and Supabase architecture are unchanged.

## 3. State priority

The dashboard priority is deterministic:

1. suspended account;
2. active job;
3. new work requests;
4. incomplete verification;
5. documents under review;
6. available and waiting;
7. unavailable.

No review duration is invented. A suspended worker is sent to support. A live
job opens directly. Secondary actions remain available below the primary task.

## 4. Guided journey

The presentation is continuous:

```text
Welcome and agreements
  → basic information
  → trade and services
  → service area and current address
  → ID front, ID back, selfie and confirmed identity fields
  → criminal-record document
  → review/status
  → worker home
```

Each transition is derived from server gates. The UI cannot approve a worker,
skip a gate, or create a second lifecycle.

## 5. Compatibility

| Legacy path | Canonical destination |
| --- | --- |
| `/worker-home` | `/worker` |
| `/provider-mode` | `/worker` |
| `/provider-verification` | `/worker/verification` |
| `/onboarding/identity` | `/worker/verification` |
| `/onboarding/certificate` | `/worker/verification?step=certificate` |

The legacy job and quote detail components remain the implementation source
behind canonical `/worker/jobs/[id]` and `/worker/requests/[id]` wrappers. This
preserves hardened job, dispute, payment and quote authorities without a fork.

## 6. Backend and migration impact

WPS-025 introduces **no database migration**. It changes presentation,
navigation and client composition only. It drops no policy, constraint, grant,
RPC, trigger, Edge Function or storage rule.

## 7. Acceptance

Automated acceptance is recorded in
`docs/testing/WPS-025-ACCEPTANCE-EVIDENCE.md`. Native-device visual and
accessibility acceptance remains pending and is defined in
`docs/testing/WPS-025-MANUAL-ALPHA.md`.
