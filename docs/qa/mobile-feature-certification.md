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
| `create-account` (professional form) | professional | **PARTIAL** | mock, API 24, EN + AR, accessibility tree measured (101 words/6 tappable EN, 92/7 AR). Not yet: FR, 320dp, dark, enlarged |
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
| `onboarding/worker` | UNTESTED |
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
