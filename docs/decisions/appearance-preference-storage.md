# Decision — Where the appearance preference lives

| Field | Value |
| --- | --- |
| Date | 2026-08-05 |
| Status | **Decided** |
| Authority | WPS-020 Part A |
| Implements | `src/appearance/appearance-types.ts`, `appearance-storage.ts`, `appearance-context.tsx` |

## The decision

**Local first, account second, with a single deterministic precedence rule.**

The device-local value is the authority at startup. The account value exists
only so a choice can follow someone to a second device.

## Why local has to be first

The first frame is painted before there is a session, before a network request
has returned, and — when Supabase is unconfigured — before `AuthProvider` even
mounts. Any design in which the server is the source of truth has a window where
the app is rendered and the answer has not arrived. That window is the flash.

So the preference is read **synchronously**, in the state initializer, from a
store that can answer without awaiting anything:

| Platform | Store | Why |
| --- | --- | --- |
| iOS / Android | `expo-sqlite/kv-store` `getItemSync` | Already the app's storage; has a real synchronous read |
| Web (runtime) | `localStorage` | The web build of expo-sqlite is WASM-backed and has no synchronous read |
| Web (static export) | Inline `<head>` script | Runs before React exists; nothing else can |

## Precedence

Applied once per account transition. Implemented in `precedence()` and asserted
by the regression suite.

1. **An explicit local choice on this device wins.** It is what the person most
   recently told *this* device to do, and it is already on screen. A server
   round trip is not allowed to argue with it.
2. **Otherwise the account's stored preference**, once the session has hydrated.
   This is what makes a fresh install adopt what you chose on your phone.
3. **Otherwise `system`.**

"Explicit" means a person tapped an option. A default is not explicit — which is
the distinction that lets a fresh install take the account preference instead of
overwriting it with `system`.

When a local choice differs from the account's, the local choice is pushed up.
Last write wins, and the writer is the device the person was actually holding.

## Behaviour, stated exactly

| Situation | What happens |
| --- | --- |
| First launch, nothing stored | `system`. Follows the device. |
| Device appearance changes while `system` is selected | Warsha changes immediately, no relaunch |
| App restart | The stored preference is applied before the first frame |
| Signed out, changes appearance | Saved on the device. Nothing is sent anywhere. |
| Signs in, account has no preference | The device's choice is kept and saved to the account |
| Signs in, account has a preference, device choice is explicit | The device's choice wins and is pushed up |
| Signs in, account has a preference, device value is only a default | The account's preference is adopted |
| Signs out | **The appearance does not change.** The device keeps it. |
| Switches to a different account | That account's preference is adopted on hydration |
| Mock mode | Local store only. `appearanceRepository` returns `null` and writes nothing. |
| Supabase read or write fails | Silently ignored. The local value stands. |

## Why signing out does not reset the appearance

Two reasons. A theme is a property of the eyes looking at the screen, not of the
account — a shared phone in a dark room is still in a dark room. And flipping to
a different theme at the moment of sign-out would read as a fault, not a
feature.

The preference is `light`, `dark`, or `system`. It is not personal data, and
leaving it behind on the device discloses nothing about who was signed in.

## Account isolation

The **local** key is device-level and single, because it must be readable before
anything knows who is signed in. It holds one of three words.

Isolation is enforced where it matters — on the **server** value, which is
row-level-secured to its owner and asserted by pgTAP in both directions. On
sign-in, the account's preference is fetched and the precedence rule applies, so
account B never inherits account A's stored choice.

The one visible consequence: signing in as an account whose stored preference
differs can change the appearance immediately after sign-in. That is intended
and documented here rather than hidden — the alternative is showing you the
wrong theme on a device you already told what to do.

## What was rejected

**Server-only.** Guarantees a flash, and does not work signed out at all.

**Adding `appearance` to `notification_preferences`.** That table is about
notifications. Overloading it would make a future notification migration
accidentally a theme migration.

**A general `user_preferences` blob.** A JSON bag with no constraint is where
preferences go to become unvalidatable. `user_display_preferences.appearance` is
a `CHECK`-constrained column, so the database refuses `"auto"` the same way the
TypeScript does.

**Account-scoped local keys.** They would fix the sign-in-transition change, but
at the cost of the thing that matters most: the pre-authentication read. There
is no account key available before the session hydrates, so a per-account local
key cannot be the startup source of truth.
