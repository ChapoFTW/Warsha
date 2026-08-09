# Mobile Store Submission Runbook

Authority: Warsha Constitution → WPS-018.
Status: **NOTHING HAS BEEN SUBMITTED.** No listing exists on either store.

## Identity

| | Value |
| --- | --- |
| iOS bundle identifier | `com.warsha.app` |
| Android application id | `com.warsha.app` |
| Scheme | `warsha://` |
| EAS project | configured in `app.json` |
| Build numbers | EAS remote, auto-incremented on production builds |
| Runtime version | tracks the app version |
| Over-the-air updates | Preview internal channel only; Production **not enabled** |

The Android application id and the upload keystore are permanent. Changing
either means a new listing and losing every install and review.

## Before a first submission

- [ ] Apple Developer Program enrolment complete, under the correct legal entity
- [ ] Google Play Console account complete, under the correct legal entity
- [ ] The legal entity actually exists (gap G24 — **it does not**)
- [ ] A verified domain for the privacy policy and terms URLs (gap G33 — **none**)
- [ ] Privacy policy and terms published, reachable, and legally reviewed
- [ ] Support contact that a person answers
- [ ] Icon, splash, and notification assets from the approved The Current set
- [ ] Screenshots for every required device size, in English and Arabic
- [ ] Descriptions in English and Egyptian Arabic
- [ ] Content rating questionnaires completed honestly
- [ ] Apple privacy nutrition labels completed honestly
- [ ] Android Data Safety form completed honestly

## Data disclosure — answer accurately

Warsha collects, and both stores must be told so:

| Data | Why | Linked to identity |
| --- | --- | --- |
| Name and display name | Bookings and communication | Yes |
| Phone number | Worker sign-in and account contact | Yes |
| Email | Customer sign-in | Yes |
| Approximate location | Marketplace matching | Yes |
| Precise address | Only for an agreed booking | Yes |
| Photos and documents | Verification, portfolio, job evidence, disputes | Yes |
| Messages | Booking communication | Yes |
| Payment records | Financial obligations | Yes |

Warsha does **not** collect: contacts, browsing history, advertising
identifiers, health data, or biometrics. There is no third-party analytics and no
advertising SDK. Say that plainly rather than leaving fields blank.

Push tokens will appear here **when** push is activated. Until then, push is
disabled and the disclosure says so.

## Permissions

Every permission string is already in `app.json` and explains the actual use:

- Photos — "Allow Warsha to attach photos to your service request."
- Camera — "Allow Warsha to take photos for booking messages."
- Microphone — explicitly disabled.

A reviewer who cannot see why a permission is needed rejects the build. So does
a user.

## Building

1. Confirm the profile and channel.
2. Confirm the environment variables. A store build must **not** carry
   `EXPO_PUBLIC_ADMIN_SURFACE`.
3. Build with EAS.
4. Install on a real iOS device and a real Android device.
5. Smoke test the whole path: sign in, request, quote, book, chat, complete,
   review. On a real network, in Arabic and in English.
6. Confirm the build points at the intended environment.

## Testing tracks

| Store | Track | Use |
| --- | --- | --- |
| Google Play | Internal | The team |
| Google Play | Closed | Private beta participants |
| Google Play | Production, phased | Public |
| Apple | TestFlight internal | The team |
| Apple | TestFlight external | Private beta participants, after review |
| Apple | App Store, phased | Public |

TestFlight external requires review. Budget days, not hours.

## Phased rollout

Production releases roll out in phases. A rollout that cannot be halted is not
phased.

| Day | Android | iOS |
| --- | --- | --- |
| 1 | 5% | 1% |
| 3 | 20% | 10% |
| 7 | 50% | 50% |
| 10 | 100% | 100% |

Halt on: a crash rate above baseline, a spike in support contacts, any money
report, or any review describing data loss.

## Review rejections to expect

| Reason | Preparation |
| --- | --- |
| Incomplete demo account | Provide working credentials that reach a populated state |
| Unclear permission purpose | The strings above |
| Missing privacy policy | Requires the domain (G33) |
| Payment method questions | Warsha connects users to independent workers for real-world services; that is outside in-app purchase rules. Be ready to explain it clearly. |
| Worker classification language | Warsha never implies employment. Review every listing string for it. |

## After

- [ ] Confirm the live listing shows the approved assets and copy
- [ ] Confirm the deep link opens the app
- [ ] Confirm the privacy policy URL resolves
- [ ] Watch crash reports and reviews daily for the first week
- [ ] Record the submission and the release in the deployment log

## Never

- Never submit without a device smoke test.
- Never submit a build carrying the admin surface flag.
- Never answer a data disclosure question optimistically.
- Never claim a capability that is switched off.
- Never rotate or lose the Android upload keystore.
