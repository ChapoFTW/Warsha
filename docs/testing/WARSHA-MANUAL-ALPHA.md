# Warsha manual alpha runbook

Version: 1.0
Date: 2026-08-01
Status: AUTHORITATIVE manual alpha runbook. Record every outcome in
`docs/testing/WARSHA-MANUAL-ALPHA-RESULTS.md`. Never mark a case PASS from an
automated test.

This runbook consolidates:

- `docs/testing/WPS-007-manual-smoke-test.md` (financial cases; staff CLI)
- `docs/testing/WPS-008-acceptance-evidence.md` (marketplace criteria map)
- `docs/testing/WPS-008-final-validation-report.md` (implemented behavior, gates)
- `docs/testing/WPS-008-manual-results.md` (scenarios previously NOT RUN)
- `docs/testing/device-p1-final-validation-report.md` (device setup, OTP, import)

It is local-only. It never authorizes a hosted migration, hosted configuration
change, real SMS, real card payment, real refund, real payout, or `supabase db
push`. All credentials, phone numbers, and money are fictional development
data.

## How to use this runbook

- Work top to bottom. Sections 1–3 prepare the environment; sections 5–33 are
  test cases.
- Each case records: ID, persona, preconditions, exact actions, expected
  visible result, expected state result, PASS / FAIL / BLOCKED, notes, a
  screenshot filename, and a severity when failed.
- **PASS** — the visible result and state result both matched.
- **FAIL** — behavior contradicted the expectation. Record severity, exact
  steps, persona, platform, and a screenshot.
- **BLOCKED** — the case could not be attempted (missing fixture, missing
  control, environment limitation). Blocked is not a pass and not a fail.
- Severity when failed:
  - **P0** — money wrong, security/privacy breach, data loss, crash on a core
    path, account isolation broken.
  - **P1** — a core flow cannot be completed or reports a false success.
  - **P2** — flow completes but with wrong copy, wrong state display, missing
    notification, or confusing recovery.
  - **P3** — cosmetic: layout, truncation, alignment, minor wording.
- Control labels in steps come from the current implementation. If a label
  differs slightly but the function exists, run the case and note the wording
  difference as P3. If the control does not exist at all, record BLOCKED (or
  FAIL if the spec requires it on that screen) and note it.
- Screenshots: save as `docs/testing/alpha-screenshots/<CASE-ID>[-suffix].png`.

## Markers

- **[MOCK-MODE]** — run with `EXPO_PUBLIC_DATA_MODE=mock` in `.env.local`
  (restart Expo after changing). Marketplace Intelligence matching is not
  activated in the local Supabase database (`marketplace_configuration`
  ships disabled and no local job runner processes `private.marketplace_jobs`),
  so quote-flow cases run against the SQLite-backed Mock repository.
- **[LOCAL-OTP]** — works only against local Supabase with the fixed test OTP
  fixtures. Hosted phone auth is disabled and fails closed.
- **[FAIL-CLOSED]** — the expected correct result is a refusal or an
  unavailable state. A visible "working" result is a FAIL.
- **[NOT-AVAILABLE]** — intentionally deferred behavior. Verify absence only;
  do not attempt to force it.
- **[DEVICE]** — must be tested on a real phone (Expo Go or dev build), not
  only web. Web preview may be used for quick smoke of layout, never as the
  acceptance evidence for these cases.
- **[CLI]** — requires a PowerShell helper command on the workstation while
  the phone is in hand (WPS-007 smoke harness or SQL noted in the case).

## Known environment limitations (read before testing)

1. **Marketplace matching in Supabase mode is fail-closed locally.** The
   marketplace screens show "Marketplace Intelligence is not activated on this
   environment." in Supabase mode until configuration activation exists. All
   quote-flow cases (sections 9–13, 16–21) therefore carry [MOCK-MODE].
   Verifying the Supabase-mode unavailable state is itself a case (A09-05).
2. **No admin UI exists (WPS-013 is future).** Staff actions use the WPS-007
   smoke harness or a staff-JWT RPC call. Worker verification approval
   (`public.review_provider_verification`) has no harness command yet — see
   the "Missing fixtures" list at the end.
3. **Native icon/splash acceptance requires a development build** (EAS). Expo
   Go does not faithfully reproduce the standalone native splash/icon.
4. **Financial live systems stay disabled.** Gateway, payouts, scheduler,
   real SMS, real payments, and real refunds remain off. Mock financial modes
   are enabled only for the financial sections and switched off afterwards
   (section 33).

---

## 1. Environment setup

### A01-01 — Workstation prerequisites

- Persona: Tester (workstation)
- Preconditions: Windows workstation with the repository at
  `C:\Users\siefa\Documents\Warsha`.
- Actions:
  1. Verify Docker Desktop is installed and running.
  2. Verify Node.js 20.19+ and npm: `node -v`, `npm -v`.
  3. Verify the Supabase CLI runs: `npx.cmd supabase --version`.
- Expected visible: all three commands print versions without errors.
- Expected state: none.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A01-01.png
- Notes:

### A01-02 — Windows Firewall allowances [DEVICE]

- Persona: Tester (workstation, elevated PowerShell)
- Preconditions: phone testing planned on the same Wi-Fi/hotspot.
- Actions:
  1. If not already present, run once in elevated PowerShell:
     `New-NetFirewallRule -DisplayName "Warsha Expo Metro (Private)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8081 -Profile Private`
     `New-NetFirewallRule -DisplayName "Warsha Supabase (Private)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 54321 -Profile Private`
  2. Confirm the phone and workstation are on the same network without client
     isolation, and Expo Go has Local Network permission on iPhone.
- Expected visible: rules exist; no firewall prompt blocks later steps.
- Expected state: none.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A01-02.png
- Notes:

### A01-03 — LAN environment file [DEVICE]

- Persona: Tester (workstation)
- Preconditions: local Supabase will run on this workstation.
- Actions:
  1. Run `ipconfig` and note the current Wi-Fi IPv4 address.
  2. Ensure the git-ignored `.env.local` contains:
     `EXPO_PUBLIC_DATA_MODE=supabase`,
     `EXPO_PUBLIC_SUPABASE_URL=http://<CURRENT_WIFI_IPV4>:54321`,
     `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<LOCAL_PUBLISHABLE_KEY from supabase status>`.
  3. Never put the service-role key in any Expo variable.
- Expected visible: `.env.local` matches the current network. The IP is not
  committed.
- Expected state: none.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A01-03.png
- Notes: The Wi-Fi IP changes when the network changes; redo this case then.

## 2. Local Supabase startup

### A02-01 — Start and reset the local stack

- Persona: Tester (workstation)
- Preconditions: A01-01 passed; Docker running.
- Actions (from the repository root):
  1. `npx.cmd supabase start --exclude studio,imgproxy,logflare,vector`
  2. `npx.cmd supabase status -o env` — confirm API URL and keys print.
  3. `npx.cmd supabase db reset` — applies every migration and the seed.
- Expected visible: reset completes through the latest migration
  (`202608010001_device_p1_fixes.sql`) with no errors. Local Auth may warn
  that no SMS provider is configured — expected.
- Expected state: `supabase_db_warsha` healthy; seed created the ten launch
  categories and 20 fictional display providers.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A02-01.png
- Notes:

### A02-02 — Prepare smoke personas and fixtures [CLI]

- Persona: Tester (workstation)
- Preconditions: A02-01 passed.
- Actions:
  1. `npm.cmd run smoke:wps007 -- prepare`
  2. `npm.cmd run smoke:wps007 -- modes status`
- Expected visible: prepare creates four local Auth personas and 22 labelled
  booking fixtures, then restores all financial modes to disabled. Status
  shows `gateway_mode=disabled`, `payout_mode=disabled`,
  `automatic_release_scheduler_enabled=false`.
- Expected state: personas from section 4 can sign in.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A02-02.png
- Notes: run `modes on` only when a case carries [MOCK-FIN steps]; section 22–25
  states when.

### A02-03 — Default financial safety [FAIL-CLOSED]

- Persona: Customer A
- Preconditions: A02-02 passed; modes NOT enabled yet; app running (section 3).
- Actions:
  1. Sign in as Customer A, open a fixture booking's payment area.
  2. Look for any online card action; as Provider A check withdrawals.
- Expected visible: no usable online payment or payout action exists while
  modes are disabled; cash copy remains truthful.
- Expected state: no payment/withdrawal rows created.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A02-03.png
- Notes:

## 3. Expo / mobile-device startup

### A03-01 — Start Metro and load the app on iPhone [DEVICE]

- Persona: Tester
- Preconditions: sections 1–2 done.
- Actions:
  1. Kill any old Expo process.
  2. `npx.cmd expo start --lan --clear`
  3. Confirm the terminal prints the exported `.env.local` values (URL must be
     the LAN address, not 127.0.0.1).
  4. Scan the QR code with the iPhone (Expo Go).
- Expected visible: app loads on the phone; home screen shows categories and
  featured workers from local Supabase.
- Expected state: no red-screen errors; no `No route named … exists` warnings
  in the terminal.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A03-01.png
- Notes: For web smoke only: the app also runs in a desktop browser, but
  [DEVICE] cases must not be accepted from web.

### A03-02 — Branding [DEVICE]

- Persona: Tester
- Preconditions: A03-01 passed.
- Actions:
  1. Observe the splash at launch and the header logo on Home and Profile
     auth/loading UI.
- Expected visible: current `BrandLogo` everywhere; the splash motto reads
  `YOUR WORK, OUR MISSION`. No superseded tagline appears.
- Expected state: none.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A03-02.png
- Notes: The *native* home-screen icon and native splash are provable only in
  a development build (`npx.cmd eas-cli build --platform ios --profile
  development`, then `npx.cmd expo start --dev-client --lan --clear`). If no
  dev build is available, record the native-icon check BLOCKED, not FAIL.

### A03-03 — Deep links and router health [DEVICE]

- Persona: Customer A
- Preconditions: A03-01; fixtures exist.
- Actions:
  1. Navigate: booking details, new booking, a provider job (as Provider A),
     and open a notification that deep-links to a booking.
- Expected visible: every destination opens; back navigation is sane.
- Expected state: zero `No route named … exists` warnings in the Metro
  terminal during the whole session.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A03-03.png
- Notes:

## 4. Test personas

All email personas use the local-only password `WarshaSmoke!2026`.

| Persona | Credential | Purpose |
| --- | --- | --- |
| Customer A | `wps007.customer.a@warsha.test` | Owns all 22 financial fixtures |
| Provider A | `wps007.provider.a@warsha.test` | Owns most financial fixtures; worker-side flows |
| Provider B | `wps007.provider.b@warsha.test` | Isolation and recovery cases |
| Staff/Admin | `wps007.staff@warsha.test` | Local `admin` role; guarded CLI commands only |
| Worker W1 [LOCAL-OTP] | phone `01099221106`, OTP `123456` | Phone-first worker registration |
| Worker W2 [LOCAL-OTP] | phone `+201000000008`, OTP `123456` | Second phone worker (isolation, capacity) |
| Customer B | create during A05-01, e.g. `alpha.customer.b@warsha.test` | Fresh onboarding; account isolation |

Sign in from the Profile tab. Sign out before switching personas; never leave
two personas signed in on the same app process. The two OTP numbers are the
only phone numbers the app permits on a local target; no real SMS is ever
sent.

## 5. Customer onboarding and authentication

### A05-01 — New customer sign-up

- Persona: Customer B (new)
- Preconditions: app running; signed out.
- Actions:
  1. Profile tab → create account with `alpha.customer.b@warsha.test` and the
     shared local password.
  2. Complete any required profile fields.
- Expected visible: account created; customer UI available; no worker-only UI
  appears.
- Expected state: user exists in local Auth; no provider profile exists.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A05-01.png
- Notes:

### A05-02 — Sign out and sign back in

- Persona: Customer B
- Preconditions: A05-01.
- Actions: sign out from Profile; sign back in with the same credentials.
- Expected visible: clean sign-out (no stale personal data visible while
  signed out), successful re-login restores the account's data.
- Expected state: prior session cleared; single active session.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A05-02.png
- Notes:

### A05-03 — Wrong password

- Persona: Customer B
- Preconditions: signed out.
- Actions: attempt sign-in with a wrong password.
- Expected visible: a specific, calm error; no crash; no partial sign-in.
- Expected state: no session created.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A05-03.png
- Notes:

### A05-04 — Password reset entry point

- Persona: Customer B
- Preconditions: signed out.
- Actions: use the forgot/reset password path (`reset-password` route).
- Expected visible: the reset flow opens and accepts the email without
  crashing. (Local mail delivery is captured by the local stack, not real
  email; verifying the inbox is out of scope — note what the UI claims.)
- Expected state: no error-state dead end; user can return to sign-in.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A05-04.png
- Notes:

## 6. Worker phone OTP and worker-profile creation

### A06-01 — Register Worker W1 by phone [DEVICE] [LOCAL-OTP]

- Persona: Worker W1
- Preconditions: local target confirmed (A01-03); signed out.
- Actions:
  1. Choose the worker/phone sign-in path.
  2. Try each accepted representation of the number in turn (clear between
     tries): `01099221106`, `1099221106`, `201099221106`, `+201099221106`,
     and one with spaces/dashes.
  3. Confirm the canonical preview shows `+201099221106` each time and the
     input is not rewritten while typing.
  4. Submit; enter OTP `123456`.
  5. Complete worker-profile creation (display name).
- Expected visible: normalization preview correct for all five forms; OTP
  accepted; worker profile created and worker mode available.
- Expected state: worker account exists with confirmed phone;
  `activate_provider_role` succeeded only after phone confirmation.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A06-01.png
- Notes: local OTP hint appears only in dev on a local target.

### A06-02 — Rejected phone inputs

- Persona: Worker W1 (signed out)
- Preconditions: on the phone entry screen.
- Actions: try a foreign number, an Egyptian `013` prefix, a wrong-length
  number, and invalid punctuation.
- Expected visible: each stays disabled/rejected with clear copy; the app
  never guesses a `+20` prefix for invalid input.
- Expected state: no OTP request sent for invalid values.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A06-02.png
- Notes:

### A06-03 — OTP errors, double-tap, and rate limit [LOCAL-OTP]

- Persona: Worker W1
- Preconditions: on the OTP screen for `+201099221106`.
- Actions:
  1. Enter a wrong code → expect the specific invalid-code message.
  2. Tap the request/verify button twice quickly → expect only one app
     request.
  3. Request a new code immediately → expect the rate-limit message
     (local `max_frequency` is 2 s); resend after two seconds → success.
- Expected visible: specific messages for invalid code and rate limit; no
  duplicate requests; resend works.
- Expected state: request 200 → repeat 429 → resend 200 → invalid verify 403 →
  valid verify creates a session (mirrors the automated evidence).
- Result: NOT RUN | Severity if failed: __ | Screenshot: A06-03.png
- Notes:

### A06-04 — Existing worker re-login

- Persona: Worker W1
- Preconditions: A06-01 done; signed out.
- Actions: sign back in with `01099221106` / `123456`.
- Expected visible: returns to the existing worker account and profile — no
  duplicate account, no re-onboarding.
- Expected state: same user ID as A06-01.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A06-04.png
- Notes:

### A06-05 — Email customer adds a phone and becomes a worker [LOCAL-OTP]

- Persona: Customer B
- Preconditions: A05-01; signed in; W2's number `+201000000008` unused.
- Actions:
  1. Choose worker mode from Profile.
  2. Enroll the phone `+201000000008`; verify with `123456`.
  3. Complete worker-profile creation.
- Expected visible: the same account gains a worker profile only after phone
  confirmation; email sign-in still works afterwards.
- Expected state: email/password session is not replaced during the upgrade;
  `phone_confirmed_at` is set before worker creation.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A06-05.png
- Notes: this consumes the W2 fixture number; the standalone W2 persona then
  signs in as this account.

### A06-06 — Hosted phone auth fails closed [FAIL-CLOSED]

- Persona: Worker W1 (signed out)
- Preconditions: OPTIONAL, end of a session — temporarily point `.env.local`
  at the hosted URL; restart Expo.
- Actions: attempt the worker phone flow; then attempt email sign-in.
- Expected visible: phone flow fails closed with the specific
  provider-unavailable message (no generic error, no fake OTP screen); email
  sign-in still works.
- Expected state: no phone mutation attempted after the capability check.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A06-06.png
- Notes: restore `.env.local` to the LAN URL and restart Expo afterwards.

## 7. Worker verification gating

### A07-01 — Upload and submit verification documents

- Persona: Worker W1 (worker mode)
- Preconditions: A06-01; worker profile exists.
- Actions:
  1. Open provider verification from the worker profile area.
  2. Answer the skill-certificate question; upload the required identity
     images (JPEG/PNG/WebP/HEIC, each ≤ 8 MB).
  3. Submit for review.
- Expected visible: uploads accepted with previews; submission moves status to
  under review; documents lock while under review.
- Expected state: verification row exists with the submitted revision; storage
  contains only masked/scoped paths.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A07-01.png
- Notes:

### A07-02 — Oversized/invalid document rejected

- Persona: Worker W1
- Preconditions: verification editable.
- Actions: attempt an image over 8 MB or an unsupported type.
- Expected visible: clear rejection; no partial upload shown as success.
- Expected state: no invalid document row.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A07-02.png
- Notes:

### A07-03 — Staff approval [CLI]

- Persona: Staff/Admin (workstation) + Worker W1 (phone)
- Preconditions: A07-01 submitted.
- Actions:
  1. There is no harness command for verification review yet. Using the staff
     JWT (same guarded mechanism as the smoke harness), call
     `public.review_provider_verification(<provider_id>, 'approved')`.
  2. Refresh the worker app.
- Expected visible: worker sees approved status and any verification badge.
- Expected state: approval recorded with the staff actor; approved fields are
  protected from later silent change.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A07-03.png
- Notes: if no practical staff invocation path is available to the tester,
  record BLOCKED — this is a known missing harness command.

### A07-04 — Unverified worker is not marketplace-eligible [MOCK-MODE] [FAIL-CLOSED]

- Persona: Customer A + an unverified worker
- Preconditions: a worker persona without approved verification.
- Actions: create a Get Quotes request (section 9) matching the unverified
  worker's category/area; watch invitations on the worker side.
- Expected visible: the unverified worker receives no invitation; customer
  discovery/trust surfaces do not present the worker as approved.
- Expected state: hard eligibility excludes non-approved identity.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A07-04.png
- Notes:

## 8. Browse Workers

### A08-01 — Categories and catalog

- Persona: Customer A
- Preconditions: app running; seed applied.
- Actions: from Home, open Services; open several categories.
- Expected visible: exactly the ten launch categories (Plumbing, Electrical,
  Carpentry, AC repair, Cleaning, Painting, Appliance repair, Satellite & TV
  installation, Moving help, General maintenance); each lists fictional
  workers with ratings/prices.
- Expected state: matches `public.service_categories` active rows.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A08-01.png
- Notes:

### A08-02 — Search

- Persona: Customer A
- Preconditions: Home.
- Actions: use the search bar for a category and a worker name; open the
  Featured providers "View all".
- Expected visible: relevant results; empty-state copy for a nonsense query.
- Expected state: none beyond display.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A08-02.png
- Notes:

### A08-03 — Worker profile routes to Request a Quote

- Persona: Customer A
- Preconditions: A08-01.
- Actions: open a worker profile; tap the primary action.
- Expected visible: profile shows trust/rating/price info; the primary action
  is `Request a Quote` (quote-first — direct instant booking is only a
  compatibility path, not the promoted action).
- Expected state: the action leads into the marketplace request flow with the
  worker context.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A08-03.png
- Notes:

### A08-04 — Favourites

- Persona: Customer A
- Preconditions: A08-01.
- Actions: favourite two workers; open Favourites; unfavourite one.
- Expected visible: list updates immediately and persists after app restart.
- Expected state: favourites keyed by (account, worker).
- Result: NOT RUN | Severity if failed: __ | Screenshot: A08-04.png
- Notes:

## 9. Get Quotes

### A09-01 — Create a Get Quotes request [MOCK-MODE]

- Persona: Customer A
- Preconditions: `.env.local` set to `EXPO_PUBLIC_DATA_MODE=mock`; Expo
  restarted.
- Actions:
  1. Home → `Get Quotes`.
  2. Fill `Describe what you need`, choose category, address/area, schedule
     type `ASAP`, payment preference `Cash or online`; attach a photo if the
     form offers it.
  3. Tap `Send request`.
- Expected visible: `Request sent`, then status progresses `Finding eligible
  workers` → `Collecting quotes`.
- Expected state: request persisted locally (Mock SQLite); reopening the app
  shows the same request.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A09-01.png
- Notes:

### A09-02 — Quotes arrive progressively; default sort [MOCK-MODE]

- Persona: Customer A
- Preconditions: A09-01 active request.
- Actions: keep the request open through the collection window; observe.
- Expected visible: `Quote selection opens after the two-minute collection
  window.` is communicated; quotes keep arriving after the first; default
  sort is `Best Value`; the cheapest quote is generally first under price
  sorting.
- Expected state: each quote shows complete terms — price, arrival, duration,
  labor included, materials, message, payment.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A09-02.png
- Notes: if the Mock repository never produces a quote, record FAIL (P1) —
  the Mock path is required by AC-008-078.

### A09-03 — Six deterministic sorts [MOCK-MODE]

- Persona: Customer A
- Preconditions: A09-02 with 2+ quotes.
- Actions: switch through all six sorts: Best Value, Lowest Price, Highest
  Rated, Closest, Fastest Arrival, Most Experienced.
- Expected visible: order changes deterministically per sort; no crash; ties
  are stable.
- Expected state: none beyond display.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A09-03.png
- Notes:

### A09-04 — Expiry and recovery actions [MOCK-MODE]

- Persona: Customer A
- Preconditions: a request allowed to expire without selection (default
  request lifetime is 10 minutes).
- Actions: let a request expire; open it.
- Expected visible: `Request expired` with recovery actions — `Retry now`,
  expand/adjust, schedule for later, and browse workers.
- Expected state: retry creates a fresh matching run; the expired request does
  not silently revive.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A09-04.png
- Notes:

### A09-05 — Supabase mode is honestly unavailable [FAIL-CLOSED]

- Persona: Customer A
- Preconditions: `.env.local` back to `supabase` mode; Expo restarted.
- Actions: Home → `Get Quotes`.
- Expected visible: `Marketplace Intelligence is not activated on this
  environment.` — an honest unavailable state, not a broken form or fake
  matching.
- Expected state: no request row created.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A09-05.png
- Notes: this is the correct current behavior until activation is approved.

## 10. Quote revisions

### A10-01 — Worker revises a quote [MOCK-MODE]

- Persona: Worker side of the Mock flow (or Worker W1 where the Mock flow
  presents worker screens)
- Preconditions: an active request with a submitted quote.
- Actions: open `Quote invitations` → the quote → `Revise quote`; change the
  price; submit.
- Expected visible: customer sees the revised quote plus `Quote history`;
  prior revision remains visible/immutable.
- Expected state: revision recorded; original terms unchanged in history.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A10-01.png
- Notes:

### A10-02 — Withdraw a quote [MOCK-MODE]

- Persona: Worker side
- Preconditions: an active submitted quote.
- Actions: withdraw the quote.
- Expected visible: quote leaves the customer's active list (or shows as
  withdrawn); customer cannot select it.
- Expected state: withdrawal recorded with a reason where prompted.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A10-02.png
- Notes:

### A10-03 — Decline an invitation [MOCK-MODE]

- Persona: Worker side
- Preconditions: a pending invitation.
- Actions: `Decline` the invitation.
- Expected visible: invitation removed from the worker's list; no quote
  submitted.
- Expected state: decline is recorded as invitation response, separate from
  cancellation metrics.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A10-03.png
- Notes:

## 11. Customer selection and worker confirmation

### A11-01 — Selection gate during collection [MOCK-MODE] [FAIL-CLOSED]

- Persona: Customer A
- Preconditions: fresh request, first quote arrived, still inside the
  two-minute collection window.
- Actions: attempt `Select quote` immediately.
- Expected visible: selection is not allowed yet; the two-minute window copy
  explains why.
- Expected state: no selection recorded.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A11-01.png
- Notes:

### A11-02 — Select a quote [MOCK-MODE]

- Persona: Customer A
- Preconditions: collection window elapsed; 2+ quotes.
- Actions: select any quote — deliberately not the cheapest.
- Expected visible: `Waiting for worker confirmation`; the customer may choose
  a more expensive worker without obstruction.
- Expected state: one selected pointer; other quotes not deleted.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A11-02.png
- Notes:

### A11-03 — Worker confirms; booking created [MOCK-MODE]

- Persona: Worker side, then Customer A
- Preconditions: A11-02.
- Actions: worker opens the selected quote → `Confirm selected quote`.
- Expected visible: `Worker confirmed` then `Booking created`; the booking
  opens with the quoted terms.
- Expected state: exactly one booking links to the request; capacity reserves
  only at confirmed booking.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A11-03.png
- Notes:

### A11-04 — Selection lock [MOCK-MODE] [FAIL-CLOSED]

- Persona: Customer A
- Preconditions: a selection already made (A11-02).
- Actions: attempt to select a different quote while the first selection is
  pending/confirmed.
- Expected visible: blocked with clear state; no double selection.
- Expected state: single selected pointer preserved.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A11-04.png
- Notes:

### A11-05 — Worker confirmation timeout [MOCK-MODE]

- Persona: Customer A
- Preconditions: a selection the worker never confirms.
- Actions: wait out the confirmation timeout; observe.
- Expected visible: the request returns to a reviewable state (re-select or
  recovery); no silent dead end.
- Expected state: timed-out selection recorded; customer review restored.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A11-05.png
- Notes:

## 12. Scheduling

### A12-01 — ASAP and Today [MOCK-MODE]

- Persona: Customer A
- Preconditions: new request form.
- Actions: create one ASAP request and one Today request.
- Expected visible: both accepted; schedule intent displayed on the request.
- Expected state: schedule type persisted.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A12-01.png
- Notes:

### A12-02 — Scheduled with Cairo time [MOCK-MODE]

- Persona: Customer A
- Preconditions: new request form.
- Actions: create a Scheduled request for a specific future time.
- Expected visible: times display in Egyptian local time (Africa/Cairo)
  consistently across creation, detail, and worker views.
- Expected state: stored instant converts correctly (no off-by-timezone).
- Result: NOT RUN | Severity if failed: __ | Screenshot: A12-02.png
- Notes:

### A12-03 — Flexible window [MOCK-MODE]

- Persona: Customer A
- Preconditions: new request form.
- Actions: create a Flexible request with a start/end window.
- Expected visible: the window persists on the request until booking
  conversion.
- Expected state: window constraint stored.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A12-03.png
- Notes:

## 13. Worker availability and capacity

### A13-01 — Binary availability toggle

- Persona: Worker W1 (worker mode)
- Preconditions: worker profile exists.
- Actions: toggle Available/Unavailable; restart the app; check it stuck.
- Expected visible: exactly two states — no complicated schedule
  configuration; state survives restart.
- Expected state: guarded `mark_worker_available` value changes.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A13-01.png
- Notes: workers default to available; unavailability is the exception.

### A13-02 — Unavailable worker gets no invitation [MOCK-MODE] [FAIL-CLOSED]

- Persona: Customer A + Worker W1
- Preconditions: W1 set Unavailable; W1 otherwise matchable.
- Actions: create a matching request; watch W1's invitations.
- Expected visible: no invitation for W1 regardless of rating.
- Expected state: availability is a hard filter.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A13-02.png
- Notes:

### A13-03 — Capacity exclusion from confirmed work [MOCK-MODE]

- Persona: Customer A + Worker W1
- Preconditions: W1 has a confirmed booking occupying a time window.
- Actions: create a Scheduled request overlapping that window (including
  travel/buffer).
- Expected visible: W1 is not invited for the overlapping window.
- Expected state: confirmed commitments act as projection sources.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A13-03.png
- Notes:

## 14. Booking lifecycle

### A14-01 — Customer booking detail and timeline

- Persona: Customer A
- Preconditions: fixture bookings exist (A02-02).
- Actions: open several fixture bookings in Orders; inspect status, timeline,
  price breakdown, and attachments.
- Expected visible: coherent status labels and history for each lifecycle
  state; approved price breakdown matches the fixture.
- Expected state: display matches database rows (spot-check with
  `npm.cmd run smoke:wps007 -- observe <fixture-key>`).
- Result: NOT RUN | Severity if failed: __ | Screenshot: A14-01.png
- Notes:

### A14-02 — Provider job progression

- Persona: Provider A
- Preconditions: provider mode; fixture jobs visible in Jobs.
- Actions: open a job; walk the visible transitions the UI offers (accept /
  on my way / arrived / start / complete, as presented).
- Expected visible: each transition updates status and timeline; invalid
  transitions are not offered.
- Expected state: booking status transitions follow the allowed graph only.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A14-02.png
- Notes:

### A14-03 — Completion evidence upload

- Persona: Provider A
- Preconditions: a job at the completion step.
- Actions: complete with 1–2 completion photos (each ≤ 8 MB).
- Expected visible: upload succeeds; completion recorded with evidence.
- Expected state: attachments stored under the uploader's scoped path.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A14-03.png
- Notes:

## 15. Chat

### A15-01 — Two-way conversation on an active booking

- Persona: Customer A ↔ Provider A
- Preconditions: an active fixture booking shared by both.
- Actions: send text both directions; keep both sessions visible (two devices
  or web+device).
- Expected visible: messages deliver promptly in both directions; Chat tab
  lists the conversation.
- Expected state: messages persist after reload; only participants see them.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A15-01.png
- Notes:

### A15-02 — Image attachment rules

- Persona: Customer A
- Preconditions: A15-01 conversation.
- Actions: send a normal photo; then attempt an image over 8 MB.
- Expected visible: normal photo sends and renders; oversized image is
  rejected with clear copy.
- Expected state: size limit enforced client-side before upload.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A15-02.png
- Notes:

### A15-03 — Cancelled booking chat locks immediately [FAIL-CLOSED]

- Persona: Customer A
- Preconditions: a booking that gets cancelled (see section 17).
- Actions: cancel; open the conversation; attempt to send.
- Expected visible: chat is read-only immediately after cancellation; history
  remains readable.
- Expected state: sends are rejected server-side, not only hidden.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A15-03.png
- Notes:

### A15-04 — Completed booking: 48-hour window copy

- Persona: Customer A
- Preconditions: a completed booking (section 25).
- Actions: open its conversation; send a follow-up message; check any
  displayed window/lock copy.
- Expected visible: chat remains writable after completion and communicates
  the exact 48-hour follow-up window; after the window it must be read-only.
- Expected state: lock timestamp equals completion + 48 h.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A15-04.png
- Notes: the 48-hour expiry itself cannot be waited out in one session —
  verify the copy/state now and record the expiry check as a follow-up note.

## 16. Request edits

### A16-01 — Minor clarification within the edit window [MOCK-MODE]

- Persona: Customer A
- Preconditions: an active request younger than 5 minutes, not selected.
- Actions: `Clarify request` → make a minor allowed change (clarifying text)
  → `Save clarification`.
- Expected visible: `Request updated`; invited workers see the clarification
  notice; the request keeps its identity.
- Expected state: immutable revision recorded; edit deadline is exactly five
  minutes or selection, whichever comes first.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A16-01.png
- Notes:

### A16-02 — Major change creates a linked replacement [MOCK-MODE]

- Persona: Customer A
- Preconditions: an active request.
- Actions: attempt a non-minor change (e.g., different category/scope).
- Expected visible: the original is cancelled/invalidated and exactly one
  linked replacement request is created; existing quotes are invalidated.
- Expected state: link between original and replacement recorded.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A16-02.png
- Notes:

### A16-03 — Edits blocked after selection [MOCK-MODE] [FAIL-CLOSED]

- Persona: Customer A
- Preconditions: a request with a selection made.
- Actions: attempt to edit.
- Expected visible: editing is unavailable after selection.
- Expected state: no revision recorded.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A16-03.png
- Notes:

## 17. Request cancellation

### A17-01 — Cancel before selection, no fee [MOCK-MODE]

- Persona: Customer A
- Preconditions: an active request, no selection.
- Actions: `Cancel request`; choose a reason if prompted.
- Expected visible: `Request cancelled`; no fee or penalty language.
- Expected state: rows closed; `automaticFee=false`; invited workers see
  closure, not a punishment.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A17-01.png
- Notes:

### A17-02 — Post-cancellation recovery [MOCK-MODE]

- Persona: Customer A
- Preconditions: A17-01.
- Actions: from the cancelled request, look for the recovery route (create a
  new request / browse workers).
- Expected visible: a usable next step exists; no dead end.
- Expected state: new request is fresh, not a mutation of the cancelled one.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A17-02.png
- Notes:

## 18. Worker cancellation and Rescue Mode

### A18-01 — Worker cancels; Rescue rematching excludes them [MOCK-MODE]

- Persona: Worker side + Customer A
- Preconditions: a confirmed selection/booking from the marketplace flow.
- Actions: worker cancels the accepted work; customer observes the request.
- Expected visible: customer sees `Finding a replacement` (rescue matching);
  original context and attachments are preserved; the failed worker is not
  re-invited.
- Expected state: rescue attempt links the original request; unique active
  attempt; fresh eligibility checks run.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A18-01.png
- Notes:

### A18-02 — Rescue with different terms needs customer reapproval [MOCK-MODE]

- Persona: Customer A
- Preconditions: A18-01 produced a replacement candidate whose terms differ.
- Actions: review the replacement offer.
- Expected visible: customer must explicitly approve changed terms; nothing
  is auto-accepted at a different price.
- Expected state: reapproval recorded before conversion.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A18-02.png
- Notes:

## 19. Running Late

### A19-01 — Worker reports Running Late [MOCK-MODE]

- Persona: Worker side + Customer A
- Preconditions: an accepted job with an arrival expectation.
- Actions: worker uses the Running Late control with a new ETA; customer
  observes.
- Expected visible: customer receives exactly one notification; the latest
  ETA replaces the previous one everywhere it is shown.
- Expected state: authoritative ETA updated; no penalty or fee created.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A19-01.png
- Notes: if the control is absent on the current build, record BLOCKED (P1
  candidate) with the screen you expected it on.

## 20. Customer and worker no-shows

### A20-01 — Customer reports worker no-show [MOCK-MODE]

- Persona: Customer A
- Preconditions: an accepted job whose arrival window has passed by at least
  15 minutes (server-enforced timing gate).
- Actions: attempt the no-show report before the gate (expect refusal), then
  after the gate with the offered evidence fields.
- Expected visible: early attempt is refused with timing copy; valid report is
  accepted and the request/booking moves to a recovery/rescue state.
- Expected state: contextual no-show event recorded with actor and timing; no
  automatic fee.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A20-01.png
- Notes:

### A20-02 — Worker reports customer no-show [MOCK-MODE]

- Persona: Worker side
- Preconditions: worker marked arrived; customer absent ≥ 15 minutes.
- Actions: report customer no-show with evidence fields.
- Expected visible: report accepted only after the timing gate; job resolves
  without penalty language.
- Expected state: event recorded; no financial payment/penalty row exists.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A20-02.png
- Notes:

### A20-03 — No punishment from single events

- Persona: Tester (review)
- Preconditions: A20-01/A20-02 done.
- Actions: check both accounts' bookings, earnings, and notifications.
- Expected visible: no fine, fee, suspension, or automatic punishment appears
  anywhere from a single no-show/cancellation event.
- Expected state: metrics recorded for the matching system only.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A20-03.png
- Notes:

## 21. Emergency flow

### A21-01 — Surcharge preview and explicit approval [MOCK-MODE]

- Persona: Customer A
- Preconditions: Mock mode; a category with Emergency support in the Mock
  catalog.
- Actions: start an Emergency request; read the `Emergency surcharge`
  preview; tap `Approve surcharge and create request`.
- Expected visible: the exact surcharge is shown and explicitly approved
  BEFORE the request exists; no quotes/comparison UI appears for Emergency.
- Expected state: approved preview token/version recorded with the request;
  winner surcharge can never exceed the approved amount.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A21-01.png
- Notes:

### A21-02 — ETA-first dispatch, single winner [MOCK-MODE]

- Persona: Worker side + Customer A
- Preconditions: A21-01 active; an eligible opted-in worker exists in the
  Mock flow.
- Actions: worker taps `Accept emergency request`; customer observes.
- Expected visible: first eligible acceptance wins; customer sees the winner
  and ETA; no competing quotes.
- Expected state: row-locked single winner; exactly one booking.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A21-02.png
- Notes:

## 22. Cash payment

Financial sections 22–25 run in **Supabase mode** against the WPS-007
fixtures. Enable mock financial modes first: `npm.cmd run smoke:wps007 --
modes on` [CLI]. Full command detail lives in
`docs/testing/WPS-007-manual-smoke-test.md`; the fixture index there maps
C-xx/P-xx keys.

### A22-01 — Cash selection and instructions (C-04)

- Persona: Customer A
- Preconditions: modes on; open fixture `C-04 Cash selection`.
- Actions: press Pay in cash; read the instructions.
- Expected visible: copy states cash is paid directly to the worker and
  Warsha does not collect it; status awaits cash collection.
- Expected state: one cash payment row; no ledger posting yet
  (`observe wps007-c04-cash-selection`).
- Result: NOT RUN | Severity if failed: __ | Screenshot: A22-01.png
- Notes:

### A22-02 — Dual cash confirmation (C-05) [CLI]

- Persona: Customer A ↔ Provider A
- Preconditions: cash selected on `C-05 Cash accepted`.
- Actions: Provider A: Jobs → C-05 → "I collected the cash". Then Customer A:
  C-05 → "Yes, I paid in cash".
- Expected visible: reported/waiting state, then both parties see paid-cash;
  no Warsha-held earning shown.
- Expected state: cash payment paid; one cash commission record (10% =
  6,000 piastres on the fixture); ledger balanced debit/credit.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A22-02.png
- Notes:

### A22-03 — Cash disputed (C-06)

- Persona: Customer A ↔ Provider A
- Preconditions: cash selected on `C-06 Cash disputed`; provider reported
  collection.
- Actions: Customer A presses "No, I did not pay"; inspect status and
  notifications.
- Expected visible: failed/disagreed state; no successful-payment claim; a
  cash-dispute notification once. Record BLOCKED if no usable support route
  exists.
- Expected state: no manufactured payment, earning, or commission debt.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A22-03.png
- Notes:

### A22-04 — Cash restriction above EGP 500 debt (P-09/P-10) [CLI]

- Persona: Provider A + Customer A
- Preconditions: follow the WPS-007 doc for `wps007-p09-cash-debt-exact` then
  `wps007-p10-cash-debt-above`.
- Actions: complete the exact-500 flow, verify cash still offered; add the
  EGP 1 flow; open an unstarted Provider A fixture.
- Expected visible: at exactly 500 nothing restricts; above 500 only cash is
  hidden/disabled with a clear explanation; online mock stays available; no
  booking is destroyed.
- Expected state: threshold strictly greater-than; debt 50,000 → 50,010
  piastres.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A22-04.png
- Notes:

## 23. Mock online payment

### A23-01 — Online mock success (C-01) [CLI]

- Persona: Customer A
- Preconditions: modes on; fixture `C-01`.
- Actions: confirm the development-only card warning; Pay now; on the
  workstation: `npm.cmd run smoke:wps007 -- event wps007-c01-online-success
  success c01-success-1`; refresh the app.
- Expected visible: paid status, EGP 1,000, online method, reference and
  receipt; no real card form or provider brand.
- Expected state: one payment, one succeeded attempt; ledger 90,000 provider
  pending / 10,000 commission / 100,000 clearing; one customer + one provider
  notification.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A23-01.png
- Notes:

### A23-02 — Failure then retry (C-02) [CLI]

- Persona: Customer A
- Preconditions: modes on; fixture `C-02`.
- Actions: Pay now → `event wps007-c02-failure-retry failure c02-failure-1` →
  refresh → Try again → `event wps007-c02-failure-retry success
  c02-success-2` → refresh.
- Expected visible: visible failed state, then successful retry; development
  warning stays.
- Expected state: attempt 1 failed, attempt 2 succeeded; exactly one payment
  posting; one failure + one confirmation notification.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A23-02.png
- Notes:

### A23-03 — Duplicate gateway event (C-03) [CLI]

- Persona: Customer A
- Preconditions: modes on; payment started on fixture `C-03`.
- Actions: run `event wps007-c03-duplicate-event success c03-same-event-1`
  twice; refresh; observe.
- Expected visible: one paid payment, one receipt.
- Expected state: second event reports `duplicate=true`; exactly one ledger
  posting; one notification per party.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A23-03.png
- Notes:

## 24. Price adjustment

### A24-01 — Accepted price revision (C-09)

- Persona: Provider A → Customer A
- Preconditions: fixture `C-09`.
- Actions: Provider A proposes EGP 650 with reason "Replacement part
  approved"; Customer A verifies old EGP 500 / new EGP 650 / +EGP 150 and the
  reason; accepts; starts payment.
- Expected visible: one pending proposal before acceptance; accepted total
  becomes the payable amount (65,000 piastres).
- Expected state: superseding immutable snapshot; notifications scoped to the
  two participants only.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A24-01.png
- Notes:

### A24-02 — Rejected price revision (C-10)

- Persona: Provider A → Customer A
- Preconditions: fixture `C-10`.
- Actions: propose EGP 650; Customer A rejects; start payment.
- Expected visible: original EGP 500 remains authoritative.
- Expected state: no snapshot from the rejected proposal; payment amount
  50,000.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A24-02.png
- Notes:

## 25. Completion

### A25-01 — Customer-confirmed completion releases earnings (P-03)

- Persona: Customer A → Provider A
- Preconditions: fixture `P-03` paid and succeeded (via A23-style steps).
- Actions: Customer A presses Confirm successful completion; refresh/repeat;
  Provider A checks Earnings.
- Expected visible: confirmation and available earning appear exactly once.
- Expected state: one customer-release transaction; one earnings-available
  notification.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A25-01.png
- Notes:

### A25-02 — Six-hour release eligibility (P-02) [CLI]

- Persona: Provider A
- Preconditions: fixture `P-02` paid/succeeded, not customer-confirmed.
- Actions: verify displayed eligibility is completion + 6 hours; run
  `npm.cmd run smoke:wps007 -- scheduler wps007-p02-six-hour-release`;
  refresh Earnings.
- Expected visible: pending before, available after; the automatic-scheduler
  warning remains (no persistent scheduler is deployed).
- Expected state: exactly one pending-to-available transfer; scheduler flag
  ends false.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A25-02.png
- Notes:

### A25-03 — Pending earnings display (P-01)

- Persona: Provider A
- Preconditions: A23-01 done without release.
- Actions: open Earnings; locate the C-01 earning.
- Expected visible: EGP 1,000 gross, EGP 100 Warsha fee, EGP 900 net, pending
  release; no bank/escrow/salary/employment language.
- Expected state: earning `pending_release`; 90,000 in pending, not
  available.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A25-03.png
- Notes:

## 26. Reviews and replies

### A26-01 — Submit a review with photos

- Persona: Customer A
- Preconditions: a completed booking (A25-01).
- Actions: open the review prompt; rate, write a comment, attach 1–2 photos
  (JPEG/PNG/WebP, ≤ 5 MB each); submit.
- Expected visible: review submits once; appears on the booking.
- Expected state: verified-booking review row; attachments under scoped
  paths; resubmission for the same booking blocked.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A26-01.png
- Notes:

### A26-02 — Worker reply

- Persona: Provider A
- Preconditions: A26-01.
- Actions: open the review; post a reply.
- Expected visible: reply appears under the review, attributed to the worker.
- Expected state: one response row linked to the review.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A26-02.png
- Notes:

### A26-03 — Profile rating aggregates

- Persona: Customer B
- Preconditions: A26-01.
- Actions: open Provider A's public profile as a different customer.
- Expected visible: average, count, and distribution include the new review;
  anonymous flag respected if chosen.
- Expected state: aggregates match the summary RPC.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A26-03.png
- Notes:

### A26-04 — Review gating [FAIL-CLOSED]

- Persona: Customer A
- Preconditions: a non-completed booking.
- Actions: attempt to review it.
- Expected visible: no review entry point (or a clear refusal) for
  non-completed bookings.
- Expected state: no review row.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A26-04.png
- Notes:

## 27. Warranty / comeback behavior

### A27-01 — Warranty is fail-closed everywhere [NOT-AVAILABLE] [FAIL-CLOSED]

- Persona: Customer A
- Preconditions: completed bookings exist.
- Actions: inspect quote details, booking details, and completed-booking
  screens for warranty/comeback offers.
- Expected visible: quote cards may show the gated `Warranty` field only as
  provided by a quote; no category warranty is active, no comeback request
  can be created, and nothing promises a refund via comeback.
- Expected state: all category warranty rows disabled;
  `create_comeback_request` refuses until activation.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A27-01.png
- Notes: do not attempt to force-enable; activation is deferred by WPS-008.

## 28. Local-data import

### A28-01 — One-time import of mock data [DEVICE]

- Persona: Customer B (or any account with local mock data)
- Preconditions: device previously used in mock mode with saved addresses and
  favourites; `.env.local` now `supabase`; signed in.
- Actions: trigger/accept the local-data import prompt; complete the import.
- Expected visible: accurate success or partial-success copy; skipped items
  (legacy non-UUID favourites, undiscoverable workers) reported as partial,
  not silent loss.
- Expected state: addresses and supported favourites imported atomically; the
  device copy is never deleted or mutated.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A28-01.png
- Notes:

### A28-02 — Retry is idempotent [DEVICE]

- Persona: Customer B
- Preconditions: A28-01 done.
- Actions: retry/re-enter the import path.
- Expected visible: no duplicate addresses or favourites; import marker
  prevents useless re-prompting.
- Expected state: address identity is (account, local_source_id); favourite
  identity is (account, provider_id).
- Result: NOT RUN | Severity if failed: __ | Screenshot: A28-02.png
- Notes:

### A28-03 — Bookings and files are never imported [DEVICE]

- Persona: Customer B
- Preconditions: local mock bookings/attachments exist on the device.
- Actions: run the import; inspect the account's bookings in Supabase mode.
- Expected visible: local bookings and attachment files remain only on the
  device; a device with only excluded bookings is not prompted at all.
- Expected state: no booking rows created by import.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A28-03.png
- Notes:

## 29. English / Arabic / RTL

### A29-01 — Global language switch and RTL [DEVICE]

- Persona: Customer A
- Preconditions: app running.
- Actions: use the header language control to switch to Arabic; walk Home,
  Services, a worker profile, Orders, a booking detail, Chat, and Profile;
  switch back to English.
- Expected visible: natural Egyptian Arabic; RTL mirroring of rows, chevrons,
  and horizontal lists; no clipping, mojibake, or mixed-direction glitches;
  switching back restores LTR cleanly.
- Expected state: language changes no data.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A29-01.png
- Notes:

### A29-02 — Arabic financial surfaces (C-13) [DEVICE]

- Persona: Customer A / Provider A
- Preconditions: at least A23-01 receipt visible.
- Actions: in Arabic, inspect payment, receipt, notifications, earnings,
  destination, and withdrawal screens.
- Expected visible: localized EGP formatting; no reversed amount signs; no
  encoding corruption.
- Expected state: no new transactions from viewing.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A29-02.png
- Notes:

### A29-03 — Arabic marketplace flow [MOCK-MODE] [DEVICE]

- Persona: Customer A
- Preconditions: Mock mode, Arabic.
- Actions: create a request, view quotes, select, confirm.
- Expected visible: request/quote/selection copy is correct Egyptian Arabic
  with proper RTL; status labels match the flow states.
- Expected state: none beyond flow.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A29-03.png
- Notes:

## 30. Accessibility

### A30-01 — Screen reader pass [DEVICE]

- Persona: Tester with VoiceOver (iOS)
- Preconditions: app running on iPhone.
- Actions: with VoiceOver on, traverse Home, a worker profile, the request
  form, a booking detail, and Chat; activate the primary action on each.
- Expected visible/audible: interactive elements have meaningful labels
  (buttons announce purpose, not "button"); focus order is logical; no trap.
- Expected state: none.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A30-01.png
- Notes:

### A30-02 — Dynamic type [DEVICE]

- Persona: Tester
- Preconditions: iOS text size raised two steps.
- Actions: revisit Home, booking detail, quotes list, and receipts.
- Expected visible: text scales without truncating amounts or overlapping
  controls; critical numbers (prices) remain fully visible.
- Expected state: none.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A30-02.png
- Notes:

### A30-03 — Contrast and touch targets [DEVICE]

- Persona: Tester
- Preconditions: normal display settings.
- Actions: review primary/secondary buttons, status chips, and tab bar in
  light conditions; attempt taps near edges of small controls.
- Expected visible: readable contrast on all status/action text; touch
  targets comfortably tappable (no repeated missed taps).
- Expected state: none.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A30-03.png
- Notes:

## 31. App restart / background / reconnect

### A31-01 — Background and return during quote collection [MOCK-MODE] [DEVICE]

- Persona: Customer A
- Preconditions: active request collecting quotes.
- Actions: background the app 1–2 minutes mid-collection; return.
- Expected visible: state resumes correctly (fresh authoritative reload); no
  duplicate quotes; timers reflect reality, not the pause.
- Expected state: request state matches the repository, not a stale cache.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A31-01.png
- Notes:

### A31-02 — Kill and restart [DEVICE]

- Persona: Customer A
- Preconditions: mid-flow (request open or booking active).
- Actions: force-quit the app; relaunch; navigate back to the same entity.
- Expected visible: authoritative state restored; no lost booking; session
  still valid.
- Expected state: no duplicate rows from the restart.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A31-02.png
- Notes:

### A31-03 — Network loss and reconnect [DEVICE]

- Persona: Customer A ↔ Provider A
- Preconditions: active chat (A15-01).
- Actions: enable Airplane Mode on one device; attempt to send; disable;
  observe.
- Expected visible: offline state communicated; the message either sends after
  reconnect or clearly fails — never silently lost; realtime resumes.
- Expected state: no duplicated messages after reconnect.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A31-03.png
- Notes:

### A31-04 — Notification deduplication [DEVICE]

- Persona: Customer A
- Preconditions: a flow that generates notifications (payment, selection,
  Running Late).
- Actions: trigger the event once; background/foreground repeatedly; reopen
  Notifications.
- Expected visible: each event appears exactly once; foregrounding does not
  duplicate entries.
- Expected state: durable dedupe keys hold.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A31-04.png
- Notes:

## 32. Account isolation

### A32-01 — Persona cross-visibility

- Persona: all (sequentially)
- Preconditions: fixtures and at least one earning for Provider A and B.
- Actions: sign in as each persona in turn and navigate bookings, chat,
  earnings, notifications, favourites, and addresses; sign out fully between.
- Expected visible: Customer A sees no provider earnings/destinations;
  Provider A cannot see Provider B's data and vice versa; Customer B sees
  none of Customer A's bookings; signed-out state shows no personal or
  financial data.
- Expected state: RLS blocks every cross-account read.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A32-01.png
- Notes: any cross-account leak is P0.

### A32-02 — Automated probes [CLI]

- Persona: Tester (workstation)
- Preconditions: A32-01 data in place.
- Actions: `npm.cmd run smoke:wps007 -- probes`
- Expected visible: every probe `visible_rows=0`; every anonymous/private ACL
  probe `allowed=false`.
- Expected state: private ledger unreadable to authenticated clients.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A32-02.png
- Notes:

## 33. Safe-mode restoration

### A33-01 — Disable all financial modes [CLI]

- Persona: Tester (workstation)
- Preconditions: financial sections finished.
- Actions:
  1. `npm.cmd run smoke:wps007 -- modes off`
  2. `npm.cmd run smoke:wps007 -- modes status`
- Expected visible: `gateway_mode=disabled`, `payout_mode=disabled`,
  `automatic_release_scheduler_enabled=false`.
- Expected state: Customer A sees no online card action; Provider A sees
  withdrawals disabled; failed-closed attempts create no money state and no
  success notifications.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A33-01.png
- Notes:

### A33-02 — Final restoration checklist

- Persona: Tester
- Preconditions: session ending.
- Actions: verify each item and record it in the results file:
  - every executed case has PASS / FAIL / BLOCKED plus notes;
  - failures include persona, platform, screenshot, and exact steps;
  - modes off confirmed (A33-01);
  - no service-role key was copied into an Expo variable or document;
  - no real card, bank, wallet, webhook, payout, or refund credential used;
  - no hosted migration or `supabase db push` ran;
  - `.env.local` points back at the local LAN target;
  - `EXPO_PUBLIC_DATA_MODE` restored to the intended default.
- Expected visible: all items checked.
- Expected state: environment is safe for the next session.
- Result: NOT RUN | Severity if failed: __ | Screenshot: A33-02.png
- Notes:

---

## Missing fixtures and known blockers for manual alpha

1. **Marketplace activation fixture (Supabase mode).**
   `private.marketplace_configuration` ships disabled and no local runner
   processes `private.marketplace_jobs`, so sections 9–21 cannot run in
   Supabase mode; they run in Mock mode. A local-only, transaction-safe
   activation + job-step helper (analogous to `smoke:wps007 -- scheduler`)
   would unblock Supabase-mode marketplace testing.
2. **Staff verification-approval command.** Approving Worker W1's
   verification requires `public.review_provider_verification` with a staff
   JWT; the smoke harness has no `verify` command. Until one exists, A07-03
   is BLOCKED for non-developers.
3. **No auth-backed seeded workers.** The 20 seeded display providers have
   `user_id = null` — they can never receive invitations or quote. Real
   worker-side flows need W1/W2 registered and verified manually first.
4. **Emergency-eligible worker fixture.** Emergency needs a verified worker
   with category Emergency opt-in (`set_worker_emergency_category`) — no
   seed provides one.
5. **iOS development build.** Native icon/splash acceptance (A03-02 note)
   needs an EAS development build, which is an external account/build action.
6. **48-hour chat expiry** cannot be observed within a single session
   (A15-04) — verify copy now; schedule a follow-up check.
