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

A signed-in session sitting on a public route is sent onward. That is what makes
sign-in and account creation land in the right place without either screen
needing to know where that is.

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
