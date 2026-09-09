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
PARTIAL.** Today that is 57 of 62 routes — and routes are only Layer 1. The
capability inventory below is the larger, emptier half.

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

---

# Layer 2 — capabilities, actions and states

Sixty-two routes are a map of the doors, not of the building. A route renders in
one state and is counted once; the product behind it has a lifecycle, a set of
actions, and failure paths a render never touches. `provider-job/[id]` is a
single row in Layer 1 and thirteen states with twenty-eight transitions here.

Layer 1 is not superseded and is not restated. Its five evidenced rows stay
exactly as they are. This is what sits on top of them.

## The job lifecycle

Derived from `src/job-operations/job-operation-types.ts` — `OPERATION_STATES`
and `operationTransitions`, read from the code rather than remembered. Thirteen
states, twenty-eight transitions, every one reachable from `confirmed`, one
terminal state.

A transition is its own test. `paused → resumed` working does not tell you
`waiting_for_parts → resumed` works, and both land on the same screen.

| State | Out | Transitions to | Status |
| --- | --- | --- | --- |
| `confirmed` | 1 | `traveling` | UNTESTED |
| `traveling` | 2 | `arrived`, `waiting_for_customer` | UNTESTED |
| `arrived` | 2 | `waiting_for_customer`, `started` | UNTESTED |
| `waiting_for_customer` | 2 | `arrived`, `started` | UNTESTED |
| `started` | 4 | `waiting_for_approval`, `waiting_for_parts`, `paused`, `finished` | UNTESTED |
| `waiting_for_approval` | 3 | `resumed`, `waiting_for_parts`, `paused` | UNTESTED |
| `waiting_for_parts` | 3 | `resumed`, `returning_later`, `paused` | UNTESTED |
| `paused` | 2 | `resumed`, `returning_later` | UNTESTED |
| `resumed` | 4 | `waiting_for_approval`, `waiting_for_parts`, `paused`, `finished` | UNTESTED |
| `returning_later` | 2 | `traveling`, `resumed` | UNTESTED |
| `finished` | 1 | `customer_inspection` | UNTESTED |
| `customer_inspection` | 2 | `completed`, `resumed` | UNTESTED |
| `completed` | 0 | — terminal | UNTESTED |

**28 of 28 transitions unevidenced.** Not one has been driven on a device.

This table is checked against the code by `scripts/mobile-certification.test.mts`:
add a state to `OPERATION_STATES` without adding a row here and the suite fails.
An inventory that can drift out of date in silence is not an inventory.

## Operation updates

`workerUpdates` (8) and `customerUpdates` (3) — what either side can say during
a job. Each has copy in three languages and a notification consequence.

| Group | Count | Status |
| --- | --- | --- |
| Worker updates | 8 | UNTESTED |
| Customer updates | 3 | UNTESTED |

## Cross-cutting capabilities

Not routes at all, and each fails in ways a render cannot show.

| Capability | Status | Note |
| --- | --- | --- |
| Session expiry mid-journey | UNTESTED | the token dies while a form is half-filled |
| Offline submission | UNTESTED | tapping Submit in a lift |
| Permission denied paths | **PARTIAL** | notifications granted; camera, media and location untested |
| Photo capture and crop | **READY** | fixture built — `scripts/android-e2e/photo-fixture.mjs` |
| Arabic RTL on every authenticated screen | UNTESTED | a hard gate, not an axis |
| Enlarged text (1.3x) | **PARTIAL** | gateway only |
| 320dp | **PARTIAL** | gateway only |
| Dark theme | **PARTIAL** | gateway only |
| Deep links | UNTESTED | `warsha://appearance` did not land; cause unestablished |
| Push registration, dispatch, tap, logout | **BLOCKED** | see below — the authority now exists |
| Live arrival tracking | NOT BUILT | `docs/architecture/live-arrival-tracking.md` |

## What Layer 2 changes about the headline

Layer 1 said 5 of 62. Layer 2 adds 28 transitions, 11 update messages and 11
cross-cutting capabilities, of which two carry partial evidence and the rest
carry none. The honest summary is that Warsha's mobile surface is near the
beginning of certification rather than the end, and the route count flattered it
because a route is the cheapest thing in the product to render.

---

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

**Push, end to end.** Recorded here until 2026-09-09 as an authorisation
boundary — "needs a staff session on Production, and the only credential
available here is a QA professional account". **That diagnosis was wrong**, and
the correction matters more than the original entry.

The blocker was never a credential. `private.notification_configuration` holds
the three switches the whole push system reads, and until today **nothing in
Warsha could write them**. Across 115 migrations there was not one `update`
against that table; no admin screen reached it, no staff RPC named it, and the
development automation principal did not hold its capability. WPS-014 seeded the
row with everything off, `202609010001_push_delivery_authority` removed the
CHECK constraints that had made enabling it impossible — stating in its own
comment "Nothing here turns push on; it makes turning it on possible" — and then
no handle was ever fitted.

So `get_my_push_state` answered `provider: disabled` to every caller, and would
have answered that to a Production owner with every capability in the catalogue.
No credential would have changed it.

`202609090002_push_configuration_authority` fits the handle:
`public.staff_set_push_configuration`, capability
`manage_notification_configuration`, bound to the current platform environment,
audited as `push_configuration_changed`, with recent re-authentication required
to turn a switch ON and deliberately not required to turn one OFF.

**What remains genuinely blocked, and it is now a real boundary.** Executing that
function against Production needs a Production *staff session* — an account
holding the capability, MFA satisfied, freshly re-authenticated. No such
credential exists in this environment, and the automation principal cannot
substitute: `private.automation_principals.environment` carries a CHECK
constraint restricting it to `development`, so a Production automation principal
cannot be stored at all. That constraint is a deliberate architectural boundary
and is not being weakened to get past it.

The ordering constraint still holds and is now enforced in the database rather
than only written down: `token_registration_enabled` and `push_delivery_enabled`
are independent, so Phase A can run with registration on and delivery off, and
the authority refuses delivery-without-registration outright.

| Phase | State | Blocked on |
| --- | --- | --- |
| Authority to configure push | **BUILT** | — |
| Phase A — provider on, registration on, delivery off | **READY** | a Production staff session |
| Phase B — delivery on for the synthetic QA proof | NOT STARTED | Phase A |
| `push_notifications` public flag | **CORRECTLY OFF** | the complete proof |
