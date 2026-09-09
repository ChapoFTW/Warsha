# Mobile feature certification

Opened 2026-09-09. The inventory is **derived from the product**, not from
memory: every row below comes from the Expo Router tree under `app/`, which is
the only thing that decides what a person can actually reach.

A feature that exists in code and is not in this table is a QA defect in its own
right. If you add a route, add a row.

## How to read a status

| | |
| --- | --- |
| **UNTESTED** | Nobody has rendered it. The default, and the honest one. |
| **PARTIAL** | Rendered on some axes, not all. The row says which. |
| **PASS** | Rendered and checked on every axis that applies. |
| **FAIL** | A defect is open against it. |
| **BLOCKED** | Cannot be tested here, with the reason named. |

**"All features tested" is not sayable while a single row is UNTESTED or
PARTIAL.** Today that is 57 of 62.

## Which build is admissible

This cost a withdrawn finding once, so it is stated before the table.
`EXPO_PUBLIC_DATA_MODE=mock` sets an `accountKey`, so the app believes it is
signed in and never routes to the gateway — mock mode is **authoritative for the
authenticated journeys and inadmissible for the signed-out one**. A
supabase-mode build is authoritative before sign-in and cannot reach the
authenticated journeys on this machine, because sign-in needs a backend.

Every evidence entry names its mode. One that does not is not evidence.

## Axes every row must eventually satisfy

EN · AR RTL · FR · 320dp · normal phone · enlarged text · light · dark ·
accessibility tree · offline behaviour · error paths · permissions.

Arabic professional rendering is a hard gate, not an axis to get to later.

---

## Auth and first contact

| Route | Role | Status | Evidence |
| --- | --- | --- | --- |
| `welcome` | both | **PASS** | supabase mode, API 24. EN/AR/FR, 320dp, dark, 1.3× text. `gw-05-gateway-{ar,fr,en}.png`, `gw-06-gateway-320dp.png` |
| `create-account` (role choice) | both | **PARTIAL** | mock, API 24, EN + AR. Not yet: FR, 320dp, dark, enlarged |
| `create-account` (professional form) | professional | **PARTIAL** | mock, API 24 + API 35, EN + AR, tree measured (101 words/6 tappable EN, 92/7 AR). **Registration completed end to end** on API 35: fields, both consents, submit. Not yet: FR, 320dp, dark, enlarged |
| `create-account` (customer form) | customer | UNTESTED | |
| `sign-in` | both | **PARTIAL** | production APK, API 35, EN only, via `push-proof.mjs`. Sign-in latency now reported (3.5s) |
| `forgot-password` | both | UNTESTED | |
| `reset-password` | both | UNTESTED | |
| `resend-confirmation` | customer | UNTESTED | |
| `auth/confirm` | customer | UNTESTED | |

## Customer

| Route | Status |
| --- | --- |
| `(tabs)/index` (home) | UNTESTED |
| `(tabs)/orders` | UNTESTED |
| `(tabs)/chat` | UNTESTED |
| `(tabs)/profile` | UNTESTED |
| `categories/[id]` | UNTESTED |
| `search` | UNTESTED |
| `provider/[id]` | UNTESTED |
| `favourites` | UNTESTED |
| `recently-viewed` | UNTESTED |
| `marketplace-request/new` | UNTESTED |
| `marketplace-request/[id]` | UNTESTED |
| `booking/new/[providerId]` | UNTESTED |
| `booking/[id]` | UNTESTED |
| `booking/success/[id]` | UNTESTED |
| `conversation/[bookingId]` | UNTESTED |
| `onboarding/address` | UNTESTED |
| `referrals` | UNTESTED |

## Professional

Priority. Arabic is a hard gate on every row here.

| Route | Status |
| --- | --- |
| `onboarding/worker` | **PARTIAL** — step 1 and 2 of 7 rendered (mock, API 35, EN). Step 1 accepts professional terms; step 2 is profile and photo. Blocked at photo capture, which the harness cannot yet supply |
| `onboarding/identity` | UNTESTED |
| `onboarding/certificate` | UNTESTED |
| `worker/index` (home) | UNTESTED |
| `worker-home` | UNTESTED |
| `worker/requests`, `worker/requests/[id]` | UNTESTED |
| `worker-quotes`, `worker-quote/[id]` | UNTESTED |
| `worker/jobs`, `worker/jobs/[id]` | UNTESTED |
| `provider-job/[id]` (travel/arrive/start/complete) | UNTESTED |
| `worker/earnings`, `provider-earnings` | UNTESTED |
| `worker/profile`, `provider-portfolio` | UNTESTED |
| `worker/verification`, `provider-verification` | UNTESTED |
| `provider-certificates` | UNTESTED |
| `worker/settings` | UNTESTED |
| `provider-mode` (Customer Mode / Return to Work) | UNTESTED |

## Shared, settings, legal

| Route | Status | Note |
| --- | --- | --- |
| `appearance` (Language & appearance) | **PARTIAL** | Built and unit-covered; the deep link used to reach it in the harness did not land, so it is not yet rendered |
| `notification-preferences` | UNTESTED | |
| `notifications` | UNTESTED | |
| `privacy`, `privacy-delete` | UNTESTED | |
| `legal/index`, `legal/[topic]`, `legal/consent`, `legal/document/[key]` | UNTESTED | |
| `help/index`, `help/category/[key]`, `help/article/[slug]`, `help/manual/[id]` | UNTESTED | |
| `support/index`, `support/new`, `support/case/[id]` | UNTESTED | |
| `icon-gallery` | UNTESTED | developer surface; confirm whether it should ship at all |

## System behaviours

Not routes, and each needs its own evidence.

| Behaviour | Status | Note |
| --- | --- | --- |
| API 24 / 25 launch | **PASS** | CI, both legs green: installs, starts, Hermes runs, RN mounts, no fatal |
| Push registration | **BLOCKED** | `get_my_push_state` reports `provider: disabled`, `registrationAvailable: false`. Needs a staff session to enable; see below |
| Push dispatch / receipt / tap / route | **BLOCKED** | same |
| Logout disassociation | **BLOCKED** | same |
| Permissions (notifications) | **PARTIAL** | POST_NOTIFICATIONS granted and verified on device |
| Location permission / background | UNTESTED | nothing built; see `docs/architecture/live-arrival-tracking.md` |
| Deep links | UNTESTED | the `warsha://appearance` attempt did not land — cause not yet established |
| Offline / network failure | UNTESTED | |
| App resume / background | UNTESTED | |
| Stale session | UNTESTED | |

## What the professional onboarding walk found

Rendered (mock, API 35, EN) by driving a synthetic registration through to
onboarding. Recorded because a low-literacy audit should say when something is
**right**, not only when it is wrong.

**Step 1 of 7 — accept terms.** 67 words, 2 tappable. Carries `Step 1 / 7`, so
progress is countable rather than described. "We will guide you. Finish one
simple step at a time." is short, plain, and tells somebody what kind of thing
is about to happen. One primary action.

**Step 2 of 7 — tell customers about you.** 65 words, 2 tappable. "Add your
photo — Required — Customers will see this photo." states the ask, the
obligation and the reason in three short lines, which is the shape this
programme asks for.

Both screens keep the step counter, both have exactly one obvious forward
action, and neither requires reading a paragraph to know what to do. On this
evidence the professional onboarding entry is closer to the low-literacy bar
than the signup form was before UX-008.

Terminology confirmed rendered: "the professional terms", not "the worker
terms".

## Harness defects found and fixed while doing this

Worth separating from product findings, because three of these looked exactly
like product defects:

1. **`scrollDown` used hard-coded coordinates** — `540 1400 -> 540 600`, taken
   from a 1080-wide device. On the 320x640 emulator every one is off-screen, so
   the swipe silently did nothing and the signup form appeared to have no
   submit button. It now reads `wm size` once and derives the gesture.
2. **The consent matcher was too narrow** — `'I agree to Warsha'` matched the
   first consent but not "I agree to *the Worker Verification Policy*", so one
   box stayed unchecked and Create account stayed correctly disabled. A working
   gate that looked like a broken button.
3. **Consents were tapped twice.** React Native puts the accessible name on the
   pressable row and on the text inside it, so each consent appears twice at the
   same coordinates; tapping every match checked and immediately unchecked it.
4. **The consents were searched for before being scrolled into view**, so the
   search found nothing at all — UIAutomator only reports what is on screen, and
   filling the password grows the form by expanding the checklist.

## Blocked, and by what

**Push, end to end.** The backend reports the push provider disabled and token
registration unavailable in Production. Enabling it goes through
`private.notification_configuration`, gated by the
`manage_notification_configuration` capability — which needs a **staff session on
Production**, and the only credential available here is a QA professional
account. This is an authorisation boundary, not a technical one.

Note the ordering constraint it creates: the instruction is not to enable
`push_notifications` until the proof is green, and the proof cannot run until
token registration is enabled. Those are two different switches —
`token_registration_enabled` and `push_delivery_enabled` are independent columns
— so the proof can be run with registration on and delivery still off. That
sequencing is a decision to take deliberately rather than by accident.
