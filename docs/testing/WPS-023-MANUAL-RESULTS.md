# WPS-023 — Manual results

Authority: WPS-023. Suite: [WPS-023-MANUAL-ALPHA](./WPS-023-MANUAL-ALPHA.md).

---

## Status

**108 cases. 0 executed. 108 NOT RUN.**

No case in this suite has been executed. No device has been used. No physical
device acceptance is claimed for any part of WPS-023.

---

## Why nothing has run

The implementing session had no physical device, no signed development build,
and no SMS provider for local OTP delivery. Every case in groups A, B, D, F and
K requires at least one of those.

The remaining groups could in principle be exercised in a simulator or a
browser, and deliberately were not, for two reasons:

1. Partial manual evidence is worse than none. A suite half-executed in a
   simulator invites the reading that the flow "mostly works", when the cases
   that would actually catch a problem — a low-RAM Android cold start, a screen
   reader on a real device, an Arabic speaker reading the certificate copy — are
   exactly the ones that were skipped.
2. WPS-024 owns manual execution. Running a subset here would fragment the
   record across two work packages.

---

## What has been verified, and what that is worth

| Evidence | Result | What it does **not** establish |
| --- | --- | --- |
| pgTAP, 26 files | 2,707 assertions PASS | Nothing about any screen |
| Client regressions | 521 checks PASS | Nothing rendered; source and pure functions only |
| Regression suites | 22 of 23 PASS | One pre-existing failure, unrelated |
| TypeScript | PASS | Types, not behaviour |
| ESLint | 0 errors, 0 warnings | Style, not correctness |
| Mojibake | PASS | Encoding, not translation quality |
| Five audits | Clean | Structure, not experience |
| Expo Doctor | 18/18 | Configuration, not runtime |
| Three exports | PASS | The bundle builds; nobody opened it |

**None of this is manual evidence.** Every row above is a machine reading source
or SQL. Not one of them has looked at a screen, and the WPS-023 cases most
likely to find a real problem — RTL layout, Arabic phrasing, screen-reader
order, capture quality on a real camera, cold-start timing on old hardware — are
precisely the ones no automated check can reach.

---

## Highest-risk unexecuted cases

Ranked by what their failure would cost, not by likelihood.

| Case | If it fails |
| --- | --- |
| **A-02** signed-out launch shows no customer home | The defect WPS-023 exists to fix is still present |
| **H-03** no copy implies Warsha obtains the certificate | Workers wait indefinitely for something that will never arrive |
| **I-05** no staff evidence visible to the worker | Disclosure of review evidence to its subject |
| **G-05** full identifier never reappears | Identity data on a screen, in a screenshot, in a crash report |
| **J-02** non-activated worker not discoverable | An unvetted person in a customer's home |
| **K-01** account switch leaks no previous state | Cross-account disclosure of vetting status |
| **F-03** camera denial does not dead-end | Workers permanently unable to complete onboarding |
| **E-09** Arabic reads naturally | The primary market cannot use the flow |

J-02 and I-05 have server-side pgTAP coverage. That covers the data, not the
screen — a screen can render something the server never sent it, from stale
state.

---

## Sign-off

No sign-off is recorded because no case has been executed.

This document must be updated by whoever runs the suite. It must not be updated
to reflect automated results.
