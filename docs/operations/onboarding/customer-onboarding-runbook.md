# Runbook — customer onboarding

Authority: WPS-023. Audience: support and operations.

> Every WPS-023 surface currently ships behind a disabled feature flag. This
> runbook describes the flow as implemented, not a flow that is live.

---

## Normal path

1. Gateway → **Create account** → **Customer**.
2. Name, email, password. Account created via WPS-001 `signUp`.
3. `select_my_account_role('customer')` records the choice server-side.
4. Address screen. Governorate, city, street, building, floor, apartment,
   landmark, notes, latitude, longitude.
5. **Confirm this location** → `confirm_my_service_address` sets
   `pin_confirmed_at` and `customer_state = 'complete'`.
6. Customer home.

---

## "I can't find 'use my current location'"

Expected. No map provider is configured, so device location and address search
are both shown as **Not available yet** with an explanation on the screen.

Placing the pin manually is the supported path and is not a workaround. Do not
tell anybody the feature is "coming soon" — no provider has been selected and no
date exists.

---

## "It won't let me book"

Check `get_my_onboarding_state()` for the account:

| Field | Meaning |
| --- | --- |
| `addressConfirmed: false` | No confirmed pin. This is the blocker. |
| `customerState: 'address_required'` | Same thing, from the other side. |
| `accountDeactivated: true` | WPS-022 deactivation. Signing in again reactivates. |
| `deletionStatus` non-null | WPS-022 deletion in progress. Do not override. |
| `accountBanned: true` | WPS-016 enforcement. Route to trust, not to onboarding. |

An address row with coordinates but no `pin_confirmed_at` does **not** count.
That is by design — see
[customer-location-onboarding](../../decisions/customer-location-onboarding.md).

---

## "My pin is in the wrong place"

The customer can re-confirm at any time; `confirm_my_service_address` updates
coordinates and re-stamps `pin_confirmed_at`.

**Support must not edit a customer's coordinates.** There is no staff RPC for
it, deliberately: an address is a physical-safety fact and the person who lives
there is the authority on it.

---

## Errors and what they mean

| Message | Cause | Action |
| --- | --- | --- |
| `A confirmed map pin is required` | Latitude or longitude missing | Ask them to complete both fields |
| `Those coordinates are outside the possible range` | Out of ±90 / ±180 | Usually a typo or swapped fields |
| `Invalid pin source` | Client sent an unknown source | Product defect — escalate |
| `Address not found` | Address id not owned by the caller | Product defect or a stale client — escalate |

---

## What support may not do

- Confirm an address on somebody's behalf.
- Read a customer's exact coordinates for any reason other than an active
  booking or dispute under the existing WPS-013 / WPS-019 authorities.
- Override `deletionStatus` or `accountBanned` from this flow.
