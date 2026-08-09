# WPS-023 — Manual alpha suite

Authority: WPS-023. Status: **every case NOT RUN**.

> **Automated tests are not manual evidence.** 2,707 pgTAP assertions and 521
> client checks pass. Not one of them has looked at a screen, and not one of
> them ran on a physical device. Nothing below may be marked PASS on the
> strength of an automated result.
>
> WPS-024 will consolidate and execute the manual backlog from WPS-001 through
> WPS-023. This document does not execute anything.

Results are recorded in [WPS-023-MANUAL-RESULTS](./WPS-023-MANUAL-RESULTS.md).

---

## Environments

| Code | Environment |
| --- | --- |
| **S-iOS** | Small iPhone (SE class), latest iOS |
| **A-old** | Older Android, API 26–29, low RAM |
| **Web** | Desktop browser, keyboard only |

Every case runs in **English and Egyptian Arabic**, and in **light, dark and
system** appearance, unless the case says otherwise.

---

## A — Entry and session (10)

| # | Case | Status |
| --- | --- | --- |
| A-01 | Fresh install, first launch reaches the gateway | NOT RUN |
| A-02 | Signed-out launch shows **no** customer home, not even for one frame | NOT RUN |
| A-03 | Restored customer session lands on the customer home with no gateway flash | NOT RUN |
| A-04 | Restored worker session lands on the worker home with no customer-home flash | NOT RUN |
| A-05 | Restored pending-worker session lands on the application, not the dashboard | NOT RUN |
| A-06 | Expired session returns to the gateway without a crash or a blank screen | NOT RUN |
| A-07 | Loading state does not resemble a signed-in app | NOT RUN |
| A-08 | Appearance preference survives the entire entry sequence | NOT RUN |
| A-09 | Cold launch on A-old: measure gateway time-to-interactive | NOT RUN |
| A-10 | Airplane mode at launch produces a usable state, not a spinner | NOT RUN |

## B — Gateway and brand (6)

| # | Case | Status |
| --- | --- | --- |
| B-01 | Logo geometry correct in LTR | NOT RUN |
| B-02 | Logo **not mirrored** in RTL | NOT RUN |
| B-03 | Motto renders exactly `YOUR WORK, OUR MISSION` / `شغلك مهمتنا` | NOT RUN |
| B-04 | Motto appears once, not repeated across onboarding | NOT RUN |
| B-05 | Help, Privacy and Terms open and return correctly | NOT RUN |
| B-06 | Gateway readable at 200% text scaling without clipping | NOT RUN |

## C — Sign in and account creation (9)

| # | Case | Status |
| --- | --- | --- |
| C-01 | Customer sign-in with email and password | NOT RUN |
| C-02 | Worker sign-in with phone and password; no OTP is requested or sent | NOT RUN |
| C-03 | Wrong password message does not reveal whether the account exists | NOT RUN |
| C-04 | Unknown email or worker phone does not reveal whether the account exists | NOT RUN |
| C-05 | Password reset email arrives and the deep link opens the reset screen | NOT RUN |
| C-06 | Role question appears before any registration field | NOT RUN |
| C-07 | Role options announce selected state to a screen reader | NOT RUN |
| C-08 | Customer registration completes and routes to the address step | NOT RUN |
| C-09 | Worker registration completes and routes to the application | NOT RUN |

## D — Customer address and pin (10)

| # | Case | Status |
| --- | --- | --- |
| D-01 | "Use current location" shows as unavailable **with a reason** | NOT RUN |
| D-02 | "Search for address" shows as unavailable with a reason | NOT RUN |
| D-03 | Manual pin entry completes and confirms | NOT RUN |
| D-04 | Out-of-range coordinate is rejected with a clear message | NOT RUN |
| D-05 | Booking is blocked before a pin is confirmed | NOT RUN |
| D-06 | Booking is permitted after confirmation | NOT RUN |
| D-07 | Re-confirming corrects an inaccurate pin | NOT RUN |
| D-08 | No OS location permission prompt appears anywhere | NOT RUN |
| D-09 | Address form fields are RTL-correct in Arabic | NOT RUN |
| D-10 | Confirmation is announced to a screen reader | NOT RUN |

## E — Worker onboarding (11)

| # | Case | Status |
| --- | --- | --- |
| E-01 | Application shows only gates the worker can act on | NOT RUN |
| E-02 | Outstanding-step count is announced as progress | NOT RUN |
| E-03 | Worker terms and document consent record correctly | NOT RUN |
| E-04 | **No review turnaround is promised** anywhere in either language | NOT RUN |
| E-05 | Certificate step is unavailable before identity review asks for it | NOT RUN |
| E-06 | Pending worker can still reach "Book a service" | NOT RUN |
| E-07 | Pending worker cannot reach opportunities, quotes or earnings | NOT RUN |
| E-08 | Application screen is fully usable at 200% text scaling | NOT RUN |
| E-09 | Arabic application copy reads naturally to a native speaker | NOT RUN |
| E-10 | Every status badge is distinguishable without colour | NOT RUN |
| E-11 | Reduced Motion is respected throughout | NOT RUN |

## F — National ID capture (11)

| # | Case | Status |
| --- | --- | --- |
| F-01 | Front capture via camera | NOT RUN |
| F-02 | Back capture via camera | NOT RUN |
| F-03 | Camera permission denial offers the file path and does not dead-end | NOT RUN |
| F-04 | File selection path works | NOT RUN |
| F-05 | Retake replaces the previous capture | NOT RUN |
| F-06 | Blur warning appears on a deliberately blurry capture | NOT RUN |
| F-07 | Glare warning appears on a deliberately glared capture | NOT RUN |
| F-08 | Low-resolution warning appears on a small capture | NOT RUN |
| F-09 | Warnings are advisory — the upload still proceeds | NOT RUN |
| F-10 | Interrupted upload keeps the captured image and offers retry | NOT RUN |
| F-11 | Capture is announced to a screen reader | NOT RUN |

## G — Identity fields (7)

| # | Case | Status |
| --- | --- | --- |
| G-01 | Manual entry works with no extraction provider configured | NOT RUN |
| G-02 | Copy explains that automatic reading is off | NOT RUN |
| G-03 | Malformed identifier is rejected with a clear message | NOT RUN |
| G-04 | Confirmation returns only the last four digits | NOT RUN |
| G-05 | **The full number never appears on any screen after confirmation** | NOT RUN |
| G-06 | Arabic name entry accepts Arabic script correctly | NOT RUN |
| G-07 | Date fields are usable on A-old | NOT RUN |

## H — Criminal-record certificate (9)

| # | Case | Status |
| --- | --- | --- |
| H-01 | Model A explanation appears **before** any upload control | NOT RUN |
| H-02 | Arabic copy uses الفيش والتشبيه | NOT RUN |
| H-03 | **No copy implies Warsha obtains the certificate**, either language | NOT RUN |
| H-04 | PDF upload accepted | NOT RUN |
| H-05 | Image upload accepted | NOT RUN |
| H-06 | Wrong file type rejected with a clear message | NOT RUN |
| H-07 | Oversized file rejected with a clear message | NOT RUN |
| H-08 | Future issue date rejected | NOT RUN |
| H-09 | Acknowledgement is a checkbox, **not a typed phrase**, and works with a screen reader | NOT RUN |

## I — Review, correction, rejection, appeal (9)

| # | Case | Status |
| --- | --- | --- |
| I-01 | Pending review state is clear and reassuring without promising a time | NOT RUN |
| I-02 | Correction request states exactly what to change | NOT RUN |
| I-03 | Resubmission after correction works | NOT RUN |
| I-04 | Rejection shows a safe reason only | NOT RUN |
| I-05 | **No staff evidence or offence detail is visible to the worker** | NOT RUN |
| I-06 | Appeal is offered from rejected, and only from rejected | NOT RUN |
| I-07 | Appeal submission confirms receipt | NOT RUN |
| I-08 | Appeal outcome is communicated safely | NOT RUN |
| I-09 | Approved-but-not-active state does not claim "you are live" | NOT RUN |

## J — Activation and gating (8)

| # | Case | Status |
| --- | --- | --- |
| J-01 | Activated worker appears in customer discovery | NOT RUN |
| J-02 | Non-activated worker does **not** appear in discovery | NOT RUN |
| J-03 | Non-activated worker receives no quote invitation | NOT RUN |
| J-04 | Non-activated worker cannot submit a quote | NOT RUN |
| J-05 | Non-activated worker cannot accept a job | NOT RUN |
| J-06 | Non-activated worker cannot use booking chat as a worker | NOT RUN |
| J-07 | Non-activated worker cannot reach payouts | NOT RUN |
| J-08 | Worker home leads with work, customer mode is secondary | NOT RUN |

## K — Account switching and lifecycle (7)

| # | Case | Status |
| --- | --- | --- |
| K-01 | Signing out and into a different account shows **no** previous state | NOT RUN |
| K-02 | Switching customer → worker account routes correctly | NOT RUN |
| K-03 | Switching worker → customer account routes correctly | NOT RUN |
| K-04 | Deactivated account (WPS-022) is handled without a dead end | NOT RUN |
| K-05 | Deletion-pending account is handled correctly | NOT RUN |
| K-06 | Banned account reaches a blocked state, not a crash | NOT RUN |
| K-07 | Suspended worker sees the correct state | NOT RUN |

## L — Staff review surface (5)

| # | Case | Status |
| --- | --- | --- |
| L-01 | Queue shows opaque references only, no identity fields | NOT RUN |
| L-02 | Non-capable staff account sees the queue as unavailable | NOT RUN |
| L-03 | Queue read is recorded in `staff_access_log` | NOT RUN |
| L-04 | Empty queue reads as empty, not as an error | NOT RUN |
| L-05 | Queue is usable at 200% scaling on Web | NOT RUN |

## M — Mock parity (6)

| # | Case | Status |
| --- | --- | --- |
| M-01 | Mock gateway, role choice and registration behave as Supabase does | NOT RUN |
| M-02 | Mock refuses activation with outstanding gates | NOT RUN |
| M-03 | Mock refuses a certificate before it is asked for | NOT RUN |
| M-04 | Mock state is account-scoped | NOT RUN |
| M-05 | Mock makes no network call (observed, not asserted) | NOT RUN |
| M-06 | A Supabase failure surfaces as an error, never as Mock data | NOT RUN |

---

## Totals

| Group | Cases |
| --- | --- |
| A Entry and session | 10 |
| B Gateway and brand | 6 |
| C Sign in and creation | 9 |
| D Customer address | 10 |
| E Worker onboarding | 11 |
| F National ID capture | 11 |
| G Identity fields | 7 |
| H Certificate | 9 |
| I Review and appeal | 9 |
| J Activation and gating | 8 |
| K Switching and lifecycle | 7 |
| L Staff surface | 5 |
| M Mock parity | 6 |
| **Total** | **108** |

**108 cases. 0 executed. 108 NOT RUN.**

Combined with the WPS-001 through WPS-022 backlog (728 cases), the outstanding
manual total is **836 cases, none run**.
