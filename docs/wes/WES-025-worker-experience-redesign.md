# WES-025 — Worker Experience Redesign

| | |
| --- | --- |
| **Version** | 1.0 |
| **Status** | ENGINEERING BASELINE — DEVICE ACCEPTANCE PENDING |
| **Implements** | WPS-025 |

## 1. Root cause

The worker experience mirrored implementation boundaries. Worker home,
provider mode, onboarding, WPS-006 verification, WPS-023 identity lifecycle,
certificates and activation appeared as separate products. A persisted
customer/provider display choice could also reopen a worker on customer home.
The result was technically connected but required workers to infer application
state and choose the next subsystem themselves.

Five narrower presentation defects followed from that architecture:

- the dashboard was navigation-first instead of state-first;
- identity and criminal-record presentation was duplicated;
- editable numeric fields surfaced backend defaults as apparent answers;
- active-job controls existed but an outer status gate hid them after the
  accepted state;
- earnings passed a `BigInt` to `Intl.NumberFormat`, which is not reliable on
  Hermes.

## 2. Implemented architecture

`AuthGate` derives the session experience from the server-authoritative route
target. `worker-route-policy.ts` classifies worker, customer and shared routes.
Worker mode is session-scoped, so an explicit service request never changes the
next-launch destination.

`worker-dashboard-policy.ts` is a pure priority function over worker lifecycle,
verification, availability and bookings. `/worker` renders its result as the
single dominant task.

`worker-onboarding-policy.ts` derives the first incomplete journey step from
existing WPS-023 gates. The guided UI calls existing repositories; it owns no
lifecycle state.

`/worker/verification` composes both established authorities:

```text
camera / picker
  → WPS-006 private upload and document registration
  → WPS-023 capture metadata and quality warnings
  → WPS-023 field confirmation
  → WPS-006 verification submission
  → WPS-023 identity lifecycle submission
```

The criminal-record picker reads the actual Expo File, validates actual bytes,
uploads to `worker-criminal-records`, then calls the existing five-argument
`submit_my_criminal_record` RPC. An RPC failure removes the staged object.

## 3. Files changed by WPS-025

New worker product and policy files:

- `app/worker/_layout.tsx`
- `app/worker/index.tsx`
- `app/worker/requests.tsx`
- `app/worker/requests/[id].tsx`
- `app/worker/jobs.tsx`
- `app/worker/jobs/[id].tsx`
- `app/worker/verification.tsx`
- `app/worker/earnings.tsx`
- `app/worker/profile.tsx`
- `app/worker/settings.tsx`
- `src/navigation/worker-route-policy.ts`
- `src/worker/worker-copy.ts`
- `src/worker/worker-dashboard-policy.ts`
- `src/worker/worker-onboarding-policy.ts`
- `scripts/wps025-worker-experience.test.mts`

Changed routing and screens:

- `app/_layout.tsx`
- `app/worker-home.tsx`
- `app/provider-mode.tsx`
- `app/provider-verification.tsx`
- `app/onboarding/worker.tsx`
- `app/onboarding/address.tsx`
- `app/onboarding/identity.tsx`
- `app/onboarding/certificate.tsx`
- `app/provider-certificates.tsx`
- `app/worker-quotes.tsx`
- `app/provider-job/[id].tsx`
- `components/warsha/AuthGate.tsx`
- `components/warsha/ProviderJobsContent.tsx`

Changed client authorities and presentation policy:

- `src/providers/provider-context.tsx`
- `src/onboarding/onboarding-context.tsx`
- `src/onboarding/onboarding-repository.ts`
- `src/onboarding/onboarding-copy.ts`
- `src/onboarding/onboarding-translations.ts`
- `src/onboarding/onboarding-types.ts`
- `src/verification/verification-context.tsx`
- `src/notifications/notification-context.tsx`
- `src/support/support-types.ts`
- `src/payments/money.ts`

Changed regression registration/coverage:

- `package.json`
- `scripts/payment-money.test.mts`
- `scripts/wps010-worker-profile.test.mts`
- `scripts/wps019-customer-support.test.mts`
- `scripts/wps023-authentication-onboarding-vetting.test.mts`

## 4. Architecture impact

No backend authority moved. No authentication, schema, RLS, grant, activation,
verification-decision or Edge Function logic changed. WPS-025 adds no
migration. The presentation now has one canonical worker shell and one
verification journey while legacy paths remain compatible.

## 5. Native build impact

WPS-025 adds no package, plugin or native configuration. No native rebuild is
required when the installed development client already contains the WPS-024
Expo Camera configuration. A development client built before Expo Camera was
added must be rebuilt to exercise document capture; web/JS navigation changes
alone do not require one.
