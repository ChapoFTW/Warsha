# WPS-025 — Acceptance evidence

Executed 2026-08-08 from the completed local tree.

## Result

WPS-025 automated client, database, build and audit gates pass. Native-device
manual acceptance and screenshots are **NOT RUN**. The linked hosted dry-run is
**BLOCKED** by a transport error before the login-role handshake; it applied
nothing.

## Focused gates

| Gate | Result |
| --- | --- |
| `test:wps025` | **66 checks passed** |
| `test:wps023` | **549 checks passed** |
| `test:wps024` | **696 checks passed** |
| worker authentication regression | PASS — phone/password broker, no worker email UI, no registration OTP |
| profile/phone regression | **52 assertions passed** |
| payment money | **13 assertions passed** |
| WPS-010 worker profile | PASS |
| WPS-012 job operations | **118 contracts passed** |
| WPS-014 notifications | **221 checks passed** |
| WPS-019 support | **860 checks passed** |
| typecheck | PASS |
| lint | PASS — 0 errors, 0 warnings |

## Full regression matrix

All twenty-six registered `test:*` scripts pass after the consolidation review.
The review aligned WPS-011 with the approved high-resolution splash input and
removed an unintended Expo OTA `updates` block so the client again matches the
locked WPS-018 release and rollback policy.

WPS-008 through WPS-025, device P1, brand, provider media, marketplace, worker
auth, profile/phone and payment money pass. WPS-007's local-only smoke harness
also refuses non-local Supabase APIs. Suites that print numeric totals account
for **7,433 passing client assertions or contracts**, in addition to the
passing suites that report only a named contract set.

## Database

| Gate | Result |
| --- | --- |
| pgTAP before reset | **27 files / 2,948 assertions / PASS** |
| Migration audit | **45 migrations, ordering/naming/forward-only clean** |
| Clean migration replay | all 45 migrations and seed applied |
| pgTAP after reset | **27 files / 2,948 assertions / PASS** |

The reset CLI timed out waiting for the local Storage sidecar after migration
and seed completion. Restarting only that local sidecar restored health; the
post-reset database suite then passed in full. No migration error occurred.

WPS-025 adds **zero migrations**. The reset includes the three preceding
worker-auth corrections (`202608130001`, `202608140001`, `202608150001`) that
were already in the working tree before WPS-025 implementation.

## Audits and builds

| Gate | Result |
| --- | --- |
| Secret audit | clean — 661 tracked files, 49 commits |
| Environment audit | clean — 5 variables, 34 top-level routes, 0 open notes |
| Appearance audit | clean — 284 files, 73 roles |
| Mojibake audit | clean |
| Expo Doctor | **18/18** |
| Android cache-cleared export | PASS |
| iOS cache-cleared export | PASS |
| Web cache-cleared export | PASS — **78 static routes** |
| Combined Android/iOS/web export | PASS |
| Bundle credential scan | clean — **84 artefacts** |

## Hosted dry-run

`supabase db push --linked --dry-run` was attempted with cached CLI 2.113.0 and
2.112.0. Both stopped at `Initialising login role` with
`LegacyDbConfigLoginRoleNetworkError` / `TransportError`. There was no schema
comparison and no hosted mutation. The pending chain must be reconfirmed from
a network path that can reach the linked project before any push.

## Screenshots and device acceptance

The in-app browser control environment reported no registered browser instance,
so an automated screenshot could not be captured. No alternate screenshot was
fabricated. Native-device scenarios and the screenshot set remain **NOT RUN**
in `WPS-025-MANUAL-ALPHA.md`.

## Push and rebuild assessment

There is no WPS-025 migration to push. Client changes are safe from the local
schema perspective: both pre- and post-reset pgTAP are green and WPS-025
weakens no authority. The separate pending migration chain cannot be certified
against hosted state until the linked dry-run succeeds.

No native rebuild is required for WPS-025 itself. A development client that
predates WPS-024's Expo Camera plugin must be rebuilt before camera capture can
be tested; an up-to-date development client does not need another rebuild.
