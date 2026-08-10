# Authentication entry architecture

Authority: WPS-023. Subordinate to the Warsha Constitution and WPS-001.

---

## What was there before

There was no gate.

`AuthProvider` (WPS-001) resolved a Supabase session and put it in React
context. `RootLayout` mounted seventeen providers and rendered `<Stack>`.
Nothing between those two facts branched on whether a session existed.

The consequence, reproducible on any clean install: the app opened onto
`app/(tabs)/index.tsx` — the customer home — with a tab bar, a category grid and
a provider list. The only authentication surface in the product was
`app/(tabs)/profile.tsx`, which rendered a sign-in form instead of a profile
when `auth.user` was null.

Everything else was defended by RLS underneath. That worked, in the sense that
no data leaked. It was still wrong in three ways:

1. A new person's first impression was a product they could not use, with no
   explanation of what Warsha is.
2. Every screen had to defend itself individually, and the defence was invisible
   — a screen that forgot would look identical to one that did not.
3. "Who is this?" was answered in twenty places instead of one.

---

## The entry sequence

```
Native splash                    app.json, unchanged
  ↓
Font loading                     RootLayout, unchanged
  ↓
Appearance resolution            AppearanceProvider (WPS-020), unchanged
  ↓
Session hydration                AuthProvider (WPS-001), unchanged
  ↓
Onboarding state fetch           OnboardingProvider (WPS-023)
  ↓
AuthGate decides                 components/warsha/AuthGate.tsx
  ↓
  ├── signed out          → /welcome
  ├── no role selected    → /create-account
  ├── customer, no pin    → /onboarding/address
  ├── customer, ready     → /(tabs)
  ├── worker, not active  → /onboarding/worker
  ├── worker, active      → /worker-home
  └── banned              → /welcome
```

---

### First-paint authority (Preview correction)

`ready` is necessary but is not, by itself, permission to mount the current
route. Expo Router applies `router.replace()` from an effect, and effects run
after paint. A resolved signed-out session on the initial `/` therefore used to
mount the customer tabs for one frame before the effect replaced `/` with
`/welcome`.

`src/navigation/startup-route-policy.ts` now returns one of three states:

- `loading`: an account-scoped authority is unresolved;
- `redirecting`: the target is known but the current pathname is unsafe;
- `render`: the current pathname is valid for the resolved authority.

Only `render` mounts the Router stack. Both other states mount the neutral
Warsha loading mark on the already-resolved canvas, with the current language,
direction and theme. A redirect is therefore never mistaken for permission to
paint the route being replaced.

On native, `preventAutoHideAsync()` is called at module scope and `AuthGate`
hides the splash only after a safe route is renderable. On web the same route
decision prevents protected React content from mounting during hydration.
Preview, development and standalone builds all execute this same JavaScript
authority; development shells may depict the native splash differently, as
documented by Expo, but cannot bypass the React gate.

Persisted sessions are also validated with `auth.getUser()` before Auth
readiness. `getSession()` alone proves only that storage contained a token; an
expired or revoked token now fails closed into the signed-out route without an
intermediate product shell.

---

## Why the gate renders nothing rather than redirecting

The tempting design is: render the app, and redirect once the session resolves.
It is one `useEffect` and no loading state.

It is also exactly what Warsha did, and it is *why* the app opened onto the
customer home. A redirect that arrives one frame late has already shown somebody
a screen they should not have seen. On a slow connection "one frame" can be a
second of a stranger's home screen, or a worker looking at customer discovery
and reasonably concluding the app is broken.

So `AuthGate` renders a branded canvas until `ready`, and `ready` requires
**both** the session and the onboarding state for **this** account.

### The loading state is deliberately not a skeleton

No tab bar, no placeholder cards, no greeting with a blank name. A loading
screen that impersonates the signed-in app is a loading screen that lies about
whether you are signed in — and it is the specific dark pattern of making
somebody feel logged in before they are.

It is the brand loading mark on the canvas colour, announced as a
`progressbar`, and nothing else.

---

## Public routes

```ts
const PUBLIC_ROUTES = ['/welcome', '/sign-in', '/create-account',
                       '/reset-password', '/legal'];
```

A signed-out session sitting on a public route **stays there**. Bouncing
somebody off the sign-in screen back to the gateway would make signing in
impossible — an obvious bug that a naive "always redirect to `/welcome`" gate
would ship.

A signed-in session sitting on an **account-entry** route is sent onward. Legal
and privacy documents are intentionally public before signup and remain valid
shared routes after signup; they are not treated as account-entry screens. That
distinction also keeps the governed renewed-acceptance screen reachable.

---

## What the gate does not do

It does not police navigation. Once somebody is past entry, `AuthGate` corrects
exactly two situations — a non-active worker sitting on `/worker-home`, and a
customer without a confirmed pin sitting on the root — and otherwise leaves the
router alone.

**It is not an authorization boundary and nothing depends on it being one.**
Every operation it steers around is independently refused by RLS, a capability
check, or `private.require_active_worker()`. If `AuthGate.tsx` were deleted
entirely, the product would look wrong and stay secure.

---

## The signed-out server surface

WPS-023's Phase 1 audit queried the running database rather than the migration
source. That distinction is the whole reason the finding exists: the source said
the surface was closed, and the database said otherwise.

Fifteen `public` functions were executable by `anon`, including
`staff_create_legal_hold`. WPS-022 had revoked them **from `anon`**, which is a
no-op against a grant inherited **from `PUBLIC`**. See WPS-023 §5.1.

After the repair the anonymous execute surface is exactly nine sanitized reads,
all of them deliberate WPS-020 / WPS-006 / WPS-011 decisions:

`get_marketplace_catalog` · `get_marketplace_catalog_v2` · `get_discovery_home` ·
`get_discovery_filters` · `get_search_suggestions` · `search_providers` ·
`get_provider_rating_summary` · `get_provider_reputation_summary` ·
`get_provider_trust_indicators`

Those return only what is already publicly discoverable. WPS-023 gates the
**client entry**, not those reads, and WPS-020's suite asserts the grant.

The bound is asserted as a property rather than a list: *no function outside the
allowlist is anon-executable*, whatever gets added later.

---

## The three static legal screens

The gateway offers Help, Privacy and Terms. These are local, static screens with
no network call.

The Help Center (WPS-019) requires an authenticated read. Opening an anonymous
route to serve three links on the gateway would widen the signed-out surface
that WPS-023 exists to narrow — for a benefit measured in three paragraphs. The
static screens say what Warsha can honestly say today and stop, and point at the
full Help Center once signed in.

---

## The authentication method (worker phone/password correction)

Superseded by WPS-024. WPS-001 registered customers by email and password and
workers by phone and an SMS code; WPS-023 inherited that split.

Customers register and sign in with email/password, with their existing email
confirmation behaviour unchanged. Workers register and sign in with
phone/password and never see or supply an email address.

Supabase Auth still uses its email/password provider internally. The public
`worker-auth` Edge boundary generates a UUIDv4, derives a reserved
`worker.<uuid>@auth.warsha.invalid` identity, and stores the phone mapping in
`private.worker_auth_identities`. Only two service-role RPCs can preflight or
resolve that mapping. The broker returns session tokens, not the synthetic
address. Client and staff contact projections explicitly return no worker email.

A phone number is **required contact information** on every account. It is
collected at registration, validated to the Egyptian mobile shape, stored
uniquely, and **not verified**.

### Why Phone Auth stays out of the path

It could not work. Supabase Phone Auth is disabled and no SMS provider is
configured, so the worker path ended at a code that was never sent. Three
separate server-side rules enforced the same impossible requirement:

| Rule | Effect |
| --- | --- |
| `activate_provider_role` raised `Verified phone required` | No worker could be activated |
| `verified_phone` activation gate | No worker could complete onboarding |
| `is_provider_publicly_discoverable` | No approved worker could ever appear in search |

All three now ask `private.account_contact_phone(user_id) is not null` — one
definition, in one function, because it was previously three slightly different
inline expressions and that is how a rule ends up enforced in two places and not
the third.

### The two facts, kept apart

- `public.profiles.phone` — a contact detail somebody typed. Required.
- `auth.users.phone_confirmed_at` — proof of possession. **Null for every
  account.**

The activation gate was renamed `verified_phone` → `phone_number_provided`
rather than redefined, because a gate whose name claims verification would be
believed by the next person to read it.

`account_contact_phone` reads both stores deliberately: `profiles.phone` is
written once by the insert trigger, while `auth.users.phone` is what Supabase
updates when somebody confirms a number through `updateUser`, and nothing syncs
that back.

### Optional Phone Auth remains separate and fails closed

`assertPhoneAuthAvailable()` survives and guards exactly three things:
confirming a number, changing a number, and any future high-risk step-up that is
explicitly approved. It is absent from `signUp`, and
`scripts/device-p1-regressions.test.mts` asserts that it stays absent.

Confirming a number grants nothing. It used to activate the worker role, which
made verification a precondition dressed as a convenience.

Full reasoning, alternatives and the reversal path:
[phone-verification-deferral](../decisions/phone-verification-deferral.md).
