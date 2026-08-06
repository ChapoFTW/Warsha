# Role-based navigation architecture

Authority: WPS-023. Subordinate to the Warsha Constitution, WPS-002, WPS-003
and WPS-010.

---

## The account model

Every authenticated account may use customer functionality. Worker capability is
an **additional, server-approved role** on top of that. Worker approval never
removes customer capability.

This is not the only defensible model — permanently exclusive account types
would also work — but it is the one that matches how the people using Warsha
actually live. A plumber's own boiler breaks. Making them hold two accounts, or
sign out to hire an electrician, would be absurd.

It also means the model has to be stated precisely, because "worker" then means
two different things in two different sentences:

- **`intended_role = 'worker'`** — what this account asked to become. A
  preference. Not an authorization fact, and nothing reads it as one.
- **`workerCapabilityActive = true`** — this account may act as a worker. The
  only permission fact in the payload, computed server-side by
  `private.worker_capability_active()`.

The gap between them is the entire vetting lifecycle.

---

## Route resolution

`routeFor(state, signedIn)` in `src/onboarding/onboarding-types.ts` is a total,
import-free function. It is the single place the decision is made, and it is
exercised directly by the regression suite without a React tree.

```
not signed in, or state unknown  → gateway
banned                           → account_blocked
no role selected                 → role_choice
worker                           → workerCapabilityActive
                                     ? worker_home
                                     : worker_onboarding
customer                         → addressConfirmed
                                     ? customer_home
                                     : customer_address
```

### The unknown-state case

`routeFor(null, true)` returns `gateway`, not `customer_home`.

A signed-in session whose onboarding state has not resolved — or failed to load
— must not fall through to an operational screen. Defaulting to the customer
home is the "helpful" behaviour and it is precisely the bug WPS-023 exists to
fix: it is how a worker sees customer discovery, and how a fail-closed provider
becomes a fail-open one.

`OnboardingProvider` reinforces this. A load failure sets an error flag and the
context passes `null` into `routeFor`, so an unreadable onboarding state is
**never** interpreted as "no worker application". Interpreting it that way would
route a pending worker to the customer home and quietly imply their application
had vanished.

---

## Two homes

**Customer home** — `app/(tabs)`, unchanged from WPS-002. Services, search,
provider discovery, marketplace requests, bookings, favourites, support.

**Worker home** — `app/worker-home.tsx`. Available jobs, quotes, active jobs,
earnings, profile, support. Work first, because a worker did not open Warsha to
hire a plumber.

**Pending worker home** — `app/onboarding/worker.tsx`. For any worker who is not
yet active, this *is* their home. It shows their application state, what is
outstanding, and what happens next.

A worker is never routed to customer discovery as their operational home. That
is asserted directly:

```
routeFor(workerActive, true) !== 'customer_home'
```

### Customer mode as a secondary action

Both worker screens carry a "Book a service" card, at the bottom, in a single
card, never competing with the work. `showsCustomerModeAction()` gates it, and
the regression suite asserts the ordering:

```
workerHomeCode.indexOf('workerHomeOpportunities')
  < workerHomeCode.indexOf('workerHomeBookAsCustomer')
```

A pending application does not remove it. Somebody waiting three days for a
document review should not also be locked out of hiring an electrician.

---

## Approved is not active

`routeFor(workerApprovedNotActive, true)` returns `worker_onboarding`, not
`worker_home`.

`approved` means a reviewer accepted the application. `active` means every
activation gate passes *and* a human activated the account. A worker who was
approved but whose profile photo is missing has passed review and cannot yet
take a job, and sending them to a dashboard full of controls the server will
refuse would be a worse experience than telling them what is missing.

The copy keeps the two apart for the same reason: telling somebody "you are
live" when they cannot take a job reads as a broken product.

---

## Account isolation

`OnboardingProvider` uses the generation-guard pattern WPS-019, WPS-020,
WPS-021 and WPS-022 all use.

```ts
const current = ++generation.current;
const key = accountRef.current;
...
if (current !== generation.current || accountRef.current !== key) return;
```

A response arriving after the account changed is discarded, and the context
never renders state belonging to an account other than the loaded one:

```ts
const visibleState = loadedAccount === accountKey ? state : emptyOnboardingState;
```

It matters here as much as it did for privacy. One frame of the previous
account's vetting state — a rejection reason, an outstanding-documents list —
would be among the worse leaks the product could produce.

---

## Session states the router handles

No session · customer · worker onboarding incomplete · documents missing · under
review · correction required · rejected · appeal pending · approved but not
active · active · suspended · deactivated · deletion pending · banned · stale or
revoked session.

Each resolves through the same `routeFor` call. Deactivation, deletion status
and ban state arrive in the same server payload as everything else, so there is
no second source of truth about whether an account may proceed.

---

## What this layer is not

Client navigation is not authorization. Every route it steers around is
independently refused by RLS, a capability check, or
`private.require_active_worker()`.

The honest test: delete `AuthGate.tsx` and `routeFor`, and the product looks
wrong — a worker lands on customer discovery, a pending worker sees a dashboard
— but nothing becomes readable, writable or bookable that was not before.
