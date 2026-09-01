# Observability

Authority: Warsha Constitution → WPS-018. This is the document
`src/observability/client-error-reporter.ts` points at.

Four things are routinely collapsed into "monitoring", and Warsha has different
amounts of each. Keeping them apart is the whole point of this page, because a
readiness review that reads "health endpoints: done" and concludes somebody
would be woken up is wrong in a way that only shows during an outage.

| | What it means | Warsha today |
| --- | --- | --- |
| **Instrumentation** | The code emits or exposes something | **Done** |
| **Monitoring provider** | Something outside Warsha polls or receives it | **Not configured** |
| **Alerting** | A rule turns a signal into a page | **Not configured** |
| **On-call** | A named person receives the page | **Not assigned** |

Only the first column is a repository concern. The other three are owner
actions and are listed at the bottom.

---

## 1. What the code emits

### Client failures — implemented, both surfaces

`public.report_client_error` records the error's **class**, the **component**,
the **surface** and whether it was **fatal**, into
`private.operational_log_events` beside every server-side operational event.

Four things reach it:

| Source | Catches | Fatal |
| --- | --- | --- |
| `components/warsha/AppErrorBoundary.tsx` | a native render throw | yes |
| `web/components/route-error-view.tsx` | a web render throw | yes |
| `src/observability/global-error-handlers.ts` → `ErrorUtils` | any uncaught native JS error | as reported |
| `src/observability/global-error-handlers.ts` → `error` / `unhandledrejection` | everything outside a render | no |

The last row is the one that was missing longest and matters most. An error
boundary only sees what React throws while **rendering**; it never sees an
unhandled promise rejection, and `void somePromise()` is the idiom this codebase
uses everywhere. Those failures were completely silent.

**There is no message and no stack, deliberately.** `private.operational_payload_safe`
refuses any key called `message` and any value that looks like a JWT, an email
address or an Egyptian phone number, because an operations log is read by staff
and a client error message is unbounded text from somebody's device — it
routinely carries the URL they were on and the record they were opening.
"TypeError in DiscoverPage on web" identifies a defect precisely and says
nothing about the person who met it.

Renaming a field to slip past that filter would defeat a privacy control on
purpose. Messages and stacks are what a crash SDK is for, under its own
retention rules — see section 3.

### Health and readiness — implemented

Two endpoints, on every host (`usewarsha.com`, `app.usewarsha.com`,
`admin.usewarsha.com`), exempted from the locale and host rewrites in
`web/middleware.ts` so one address works wherever a monitor is pointed.

| Endpoint | Question | Cost | Poll |
| --- | --- | --- | --- |
| `GET /api/health` | is this deployment serving? | nothing | often — every 30–60s |
| `GET /api/ready` | could a signed-in person use it? | two probes, cached 15s | every 1–5 min |

The separation is not tidiness. A liveness check that reaches the database turns
every monitor into permanent synthetic load, makes a Supabase blip page somebody
about the *web* being down, and hands anybody on the internet an
unauthenticated way to spend Warsha's database budget. `/api/health` therefore
touches nothing at all.

`/api/ready` probes PostgREST and GoTrue and answers **503** when either is
unreachable, so a monitor never has to parse a body. It returns `ok` or
`unreachable` per dependency and nothing else — no project URL, no key, no
upstream status code, no error text.

**No Edge Function is probed.** The only way to check one is to invoke it, and
invoking `privacy-export` builds somebody's export, `vision-extract` spends a
paid OCR call, and `push-dispatch` drains the delivery queue. Their health is
already recorded from real traffic in `private.ocr_requests`,
`private.provider_health_samples` and
`private.notification_delivery_attempts` — facts rather than synthetic polls.

### Server-side operations — pre-existing

`private.operational_log_events`, `private.staff_audit_events`,
`private.notification_operational_events`, `private.ocr_requests`,
`private.external_provider_events`. All queryable from the admin console.

---

## 2. What nothing does yet

**Nothing polls `/api/health` or `/api/ready`.** They exist; they are not
watched. If the web went down right now, the first person to know would be a
customer.

**Nothing reads `private.operational_log_events` on a schedule.** A spike in
`client_error_fatal` is visible in the admin console to whoever opens it.

---

## 3. Native crash reporting — the vendor decision

### What is and is not covered

A JavaScript handler cannot report a **native** crash. When the process dies in
Kotlin or Swift there is no JavaScript left to run. Catching those requires an
SDK that installs a signal handler and writes a report to disk for the *next*
launch to upload. Warsha has no such SDK, and cannot have one without an
account.

So today: every JS failure is recorded, by class, with no message. Every native
process crash is invisible.

### Options evaluated

| | Native crashes | Web | Expo fit | Data residency | Cost |
| --- | --- | --- | --- | --- | --- |
| **Sentry** | yes | `@sentry/nextjs` | official Expo integration; source maps via EAS; release tagging from `expo-updates` | EU region available | free tier, then paid |
| **Firebase Crashlytics** | yes, strongest | no | needs `@react-native-firebase`, a much larger native footprint | US/multi-region | free |
| **Bugsnag** | yes | yes | supported | EU available | paid only |

### Recommendation, not a commitment

**Sentry, EU region**, if and when the owner decides. It is the only option that
covers both surfaces with one vendor, it has a first-party Expo integration that
tags releases from `expo-updates` and uploads source maps from EAS, and an EU
region is available — which matters because Warsha processes Egyptian personal
data and its subprocessor register (`private.external_providers`) records a
data-processing agreement for every vendor.

**This is deliberately not adopted here.** Choosing it means an account, a
price, a DPA, a retention setting and a new row in the subprocessor register.
Those are owner decisions, and `@sentry/react-native` is a native dependency
that would require a new binary for a vendor nobody has chosen.

**No adapter interface has been written for it either.** Warsha already has the
seam — `reportClientError(rpc, …)` takes its transport as an argument, and
`ErrorReportRpc` is the contract. A second vendor-shaped interface with no
implementation behind it would be abstraction for its own sake, which
`docs/constitution/` forbids and which the OCR and Maps provider contracts
avoided by having a real implementation on day one.

### What must be true before it is enabled

* **Never on by default in production.** Configured by DSN; absent DSN, absent SDK behaviour.
* **A Development test mode first**, proving a deliberate crash arrives.
* **Privacy-safe context only.** No auth token, no session, no identity document, no privacy-export contents, no free-text form value. The `beforeSend` hook must strip request bodies and headers, and the same rule that governs `report_client_error` governs what may be attached.
* **A subprocessor row** in `private.external_providers` with the DPA recorded, through `warsha_automation_record_subprocessor_agreement`.

---

## 4. Exactly what the owner has to do

| # | Action | Why it cannot be done from the repository |
| --- | --- | --- |
| 1 | Point an uptime provider at `https://usewarsha.com/api/health`, `https://app.usewarsha.com/api/health` and `https://admin.usewarsha.com/api/health` | needs an account with the provider |
| 2 | Add `https://app.usewarsha.com/api/ready` on a slower interval, alerting on 503 | same |
| 3 | Decide the alert rule and the notification channel | a business decision about who is woken and when |
| 4 | Name an on-call recipient | there is nobody to name from here |
| 5 | Choose a crash vendor, accept its DPA, set the region and retention | account, price, legal |
| 6 | Provide the DSN as an EAS environment variable and a Vercel variable | credentials |

Steps 1–4 need no code change. The endpoints are live the moment a deployment
carries them.

---

## 5. Verification

`npm run test:operational-monitoring` asserts the shape: liveness touches no
dependency, readiness probes exactly two and answers 503, neither leaks a
configuration value or an upstream error, both are exempt from the middleware
rewrites, and this document still says plainly that nothing polls them.

`npm run test:client-error-reporting` asserts the reporting path: the boundaries
report, the global handlers catch what the boundaries cannot, a looping failure
stops reporting rather than flattening a battery, a broken reporter never throws
out of the handler that called it, and no source carries a message or a stack.
