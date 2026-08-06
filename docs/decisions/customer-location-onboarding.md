# Decision — customer location onboarding

Authority: WPS-023. Status: **LOCKED**. Map provider: **not selected**.

---

## The locked rule

- GPS permission is **optional**.
- A confirmed map pin is **mandatory** before a real booking or marketplace
  request.
- Manual pin placement is **always available**.
- The user can always correct an inaccurate detected location.

These are compatible because manual placement is a **first-class path, not a
fallback**. Today it is the only working path, which satisfies the rule rather
than bending it.

---

## Why a confirmed pin is a separate fact from having coordinates

`public.addresses` already had `latitude` and `longitude`. They were not enough.

Coordinates can arrive from a guess, a governorate centroid, a stale device fix,
or a geocoder resolving a street name to the middle of a long street. Any of
those produces a plausible number that sends a worker to the wrong building.

`pin_confirmed_at` records something different: **a human looked at this
position and said yes**. A constraint enforces that a confirmed pin cannot exist
without the coordinates it confirms and the path that produced them:

```sql
check (pin_confirmed_at is null
       or (latitude is not null and longitude is not null and pin_source is not null))
```

`pin_source` is one of `device_location`, `address_search`, `manual_pin`, so a
reviewer or a support agent can tell how a coordinate was arrived at.

---

## No provider is configured, and the app says so

No map or geocoding provider has been selected for Warsha. Rather than pretend
otherwise, `src/onboarding/location-provider.ts` reports its own capabilities:

```ts
export const locationCapability = {
  deviceLocation: false,
  addressSearch: false,
  interactiveMap: false,
  manualPin: true,      // always
  providerKey: null,
};
```

`requestDeviceLocation()` and `searchAddress()` throw
`LocationProviderUnavailable`. They do **not** degrade into a stub returning a
plausible coordinate — a plausible wrong coordinate is worse than an honest
failure, because nothing downstream can tell it was invented.

### The unavailable options are shown, not hidden

The address screen renders "Use my current location" and "Search for an address"
with a *Not available yet* badge and an explanation, rather than omitting them.

Hiding them is the easier design and the worse one. Somebody who expects "use my
location", cannot find it, and concludes the app is broken will file a support
ticket. Somebody who sees it greyed out with a reason knows where they stand.

The screen also states plainly that location permission is optional and never
has to be granted.

---

## `expo-location` is deliberately not a dependency

Adding it would:

- put a permission prompt in front of people for a capability the product cannot
  currently use;
- require a new dev-client build;
- be impossible to accept without a physical device, which WPS-023 cannot claim.

This follows the precedent WPS-020 set when it refused device-location sorting
for the same reason. The server accepts and validates coordinates; the client
does not ask the OS for them.

The regression suite asserts `expo-location` does not appear in the location
boundary, so the dependency cannot reappear without the decision being revisited.

---

## Governorates are a fixed list, with no coordinates

`governorates` in the location boundary is twenty-seven names. It exists so
somebody can pick "Cairo" without a geocoder.

It deliberately carries **no coordinates**. A governorate centroid presented as
a service address is exactly the kind of plausible wrong answer this module
refuses to give.

---

## Fields collected

Governorate · city or district · street · building · floor · apartment ·
landmark · notes for the worker · latitude · longitude.

`building`, `floor`, `apartment` and `landmark` already existed on
`public.addresses`; WPS-023 adds `service_notes`, `pin_confirmed_at` and
`pin_source`, plus a coordinate-range constraint.

---

## Privacy

- Exact coordinates stay private. They never enter public discovery.
- The exact address never enters general analytics.
- A worker receives the minimum location needed, at the booking lifecycle stage
  that requires it — WPS-004 and WPS-012 govern that, unchanged.
- **No background location tracking. No continuous collection. No forced
  permission loop.**
- WPS-022 governs retention, export and deletion.

---

## What this blocks

`private.worker_activation_gates` includes `current_address_provided`, which
requires a **confirmed** address. A worker cannot be activated without one, for
the same reason a customer cannot book without one: an unconfirmed coordinate is
not an address.

---

## Open questions

Q-13 — which provider may be used, and does its data processing require a
transfer assessment.
Q-14 — does a customer's exact coordinate require separate consent from the
address itself.

Both in [WPS-023 §18](../wps/WPS-023-authentication-role-onboarding-worker-vetting.md).

---

## Review trigger

Revisit when a map provider is selected and its privacy assessment is complete,
or when device testing is available to accept a permission flow.
