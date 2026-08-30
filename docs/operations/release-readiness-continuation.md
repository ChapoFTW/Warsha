# Release-readiness audit — where it stands, and what is left

Written 2026-08-30 at commit `d86b98b`, 14 commits ahead of `origin/main`,
working tree clean, **nothing pushed**.

This is the continuation note for whoever picks the audit up. It is not a
summary of what went well; it is the list of what has not been done, and the
things a next pass needs to know before it starts.

## Read this first

- **`origin/main` auto-deploys the public web to usewarsha.com.** The fourteen
  commits are deliberately unpushed. Pushing is a production deployment, and
  the audit that was supposed to precede it is not finished.
- **Hosted Development is ahead of `origin/main`.** Migrations `202608300001`
  and `202608300002` were applied there on 2026-08-30; the ledger reports 81/81.
  Migrations `202608300003` through `202608300006` are applied **locally only**
  and still need `supabase db push` against Development.
- **Preview and Production were not touched and were not inspected.**

## What this machine cannot do

These are environment limits, not product findings. Do not spend time
re-discovering them.

| Blocked | Evidence |
| --- | --- |
| Firefox and WebKit | `playwright install` downloads, then fails `EPERM` writing `firefox.exe`. Chromium works. |
| Any Edge Function | The Deno runtime and `supabase functions deploy` both fail fetching `https://jsr.io/@supabase/supabase-js/meta.json` with `invalid peer certificate: UnknownIssuer`. TLS is intercepted here. This affects functions already in production, not just new ones. |
| Authenticated hosted testing | Hosted Development requires email confirmation and no mailbox or service key is available locally. |
| Android/iOS on device | No device attached; `adb` is not on PATH. |

## Phases still not executed

Nothing below has been run. None of it should be reported as passing.

1. Worker end-to-end journey — registration, onboarding, trade selection,
   verification, OCR paths, opportunities, job lifecycle, earnings.
2. Admin end-to-end — every `/admin/*` route against staff, anon, customer,
   worker and insufficient-capability principals.
3. Authentication and session torture — expired tokens, refresh, revoked
   refresh, simultaneous tabs, account switching, refresh mid-mutation,
   replayed and malformed callbacks, offline during login.
4. State persistence beyond the deterministic suite — background/foreground,
   tab switch, locale and theme switch, temporary network loss, and the
   EPHEMERAL / DRAFT / SERVER-PERSISTED / MUST-NOT-PERSIST classification.
5. Network and failure engineering — offline, latency, timeout, and the 4xx/5xx
   matrix against core flows, checking for stuck spinners, duplicate writes and
   lost drafts.
6. Load and concurrency — races on request creation, matching, acceptance,
   cancellation, withdrawal.
7. Performance measurement — Core Web Vitals, query plans, list rendering,
   startup path. Only bundle sizes were recorded (19 MB per export, 7.5 MB
   Android Hermes bundle).
8. Time and timezone — Cairo, UTC boundaries, a DST-capable zone, relative
   timestamps, server/client conversion.
9. Email and auth communications — link generation, redirect targets, expiry,
   malformed callbacks, EN/AR/FR.
10. Deep links — native deep links and notification targets.
11. Observability, backup and disaster recovery — assessed only as far as
    reading configuration; no capability gap analysis was written.
12. Feature-to-test coverage matrix.

## Findings recorded but not fixed

- **Server-side search is English-only.** `provider_profiles.search_document` is
  generated from `display_name`, `profession_key`, `about` and `location_label`,
  all Latin, and the search also matches `services.name` and
  `service_categories.id`, also English. The Arabic and French service
  vocabulary lives only in the TypeScript catalogue, so an Arabic query for a
  service term returns nothing. Verified: "electrical" finds the electrician,
  "سباكة" finds nobody. This is a data and schema change, not a fix.
- **No prefix or stem matching.** "electric" returns nothing while "electrical"
  works.
- **76 functions raise `P0002` for "not found"**, which PostgREST answers as
  HTTP 500. Clients cannot distinguish a missing record from a broken server,
  and every not-found looks like a server error in observability. No function
  uses PostgREST's `PTxxx` status codes. Changing this is a product-wide
  behaviour change and was deliberately not attempted late in an audit.
- **`marketplace_request_attachments` is deferred scaffolding** — storage
  policies and a table exist, the table has no RLS policies and no client
  grants, and nothing can reach it. Commented as such in `202608300005`.
- **The `avatars` bucket still exists** and cannot be deleted from SQL
  (`storage.protect_delete`). Removing it is an operational step to run
  identically in every environment through the Storage API.

## The privacy surface is off, and the reason has changed

`private.staff_feature_flags` gates it per environment, and absence means off:

| Flag | Recorded reason |
| --- | --- |
| `data_export` | "no worker exists to produce the file yet" — **resolved**; the producer landed in `202608300006` |
| `account_deletion` | "until retention durations have had legal review" — human/legal |
| `privacy_center` | "until the copy has been read on a device" — physical device |

Enabling any of them is a governance decision, not an engineering one. The
`data_export` reason is now out of date and should be rewritten by whoever
makes that decision.

## Reproducing the browser work

    npm run web:dev                      # note the port it prints
    npm run test:web-route-crawl         # 75 routes
    npm run test:web-accessibility       # axe, WCAG 2.2 AA
    npm run test:web-presentation        # responsive, theme, SEO
    npm run test:web-customer-journey    # signed-in customer journey
    npm run test:privacy-export-journey  # needs the local stack only

`app.` and `admin.` are separate origins. Crawling an application path on the
public host measures the middleware redirect and nothing else.

Two traps that cost time and will cost it again:

- A client-gated route paints a skeleton and only redirects once the session
  resolves, around 1500 ms. A shorter settle time reports a blank page.
- Running `web:dev` replaces the production `.next`, which
  `test:web-bilingual` reads. Run `npm run web:build` before the final
  validation or that suite fails for a reason that has nothing to do with the
  code.
