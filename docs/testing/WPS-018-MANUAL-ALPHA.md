# WPS-018 Manual Runbook — Production Readiness, Reliability & Launch Operations

| Field | Value |
| --- | --- |
| Specification | WPS-018 v1.0 |
| Status | **NOT RUN** |
| Planned cases | 44 |
| Environment | Local Supabase, plus a hosted staging project once one exists |
| Prohibited | Hosted production migration, production deployment, enabling any external provider, production service-role credentials |

WPS-018 adds no customer feature, so this suite tests the launch machinery
itself: session security, environment separation, limits, deployment safety,
recovery, and the rollback paths. Several cases **cannot be executed until a
staging project exists** and are marked BLOCKED rather than pretended.

## A. Server-verified session security (M01 – M09)

| ID | Case |
| --- | --- |
| WPS018-M01 | A freshly signed-in staff member reaches the operations home |
| WPS018-M02 | A high-risk action succeeds immediately after sign-in, with no separate re-authentication step |
| WPS018-M03 | After the freshness window elapses, the same action is refused with a clear message |
| WPS018-M04 | Signing in again restores the ability to take the action |
| WPS018-M05 | The client explains *why* it was refused rather than showing a generic error |
| WPS018-M06 | Revoking my own sessions immediately blocks a high-risk action |
| WPS018-M07 | A revoked session stays revoked until a genuine new sign-in |
| WPS018-M08 | Revoking someone's role blocks them on their next request, without them signing out |
| WPS018-M09 | The session panel shows freshness, assurance level, and revocation state honestly |

## B. MFA enforcement (M10 – M13)

| ID | Case |
| --- | --- |
| WPS018-M10 | With MFA required and no factor enrolled, staff access is refused with a clear message |
| WPS018-M11 | Enrolling a TOTP factor and completing a challenge grants access |
| WPS018-M12 | A single-factor session cannot reach any capability while MFA is required |
| WPS018-M13 | Production cannot be selected without the MFA requirement (expect refusal) |

## C. Capability gates on legacy staff RPCs (M14 – M20)

| ID | Case |
| --- | --- |
| WPS018-M14 | A Verification Reviewer approves a verification successfully |
| WPS018-M15 | The same reviewer is refused when assigning a dispute |
| WPS018-M16 | The same reviewer is refused when moderating a review |
| WPS018-M17 | The same reviewer is refused when initiating a refund |
| WPS018-M18 | A Dispute Reviewer works a dispute end to end |
| WPS018-M19 | A Financial Operations reviewer is refused on the trust queue |
| WPS018-M20 | Every refusal names the missing capability rather than failing silently |

## D. Dual control (M21 – M25)

| ID | Case |
| --- | --- |
| WPS018-M21 | A permanent ban by one staff member is refused pending a second approver |
| WPS018-M22 | The requester cannot approve their own request |
| WPS018-M23 | A second staff member with the same capability approves it |
| WPS018-M24 | The action then proceeds, and every WPS-016 rule still applies |
| WPS018-M25 | An approval cannot be reused for a second action |

## E. Access review (M26 – M28)

| ID | Case |
| --- | --- |
| WPS018-M26 | The review lists every active grant with its last-reviewed date |
| WPS018-M27 | A never-reviewed grant is shown as overdue |
| WPS018-M28 | A staff member cannot review their own access |

## F. Rate limiting from a real client (M29 – M34)

| ID | Case |
| --- | --- |
| WPS018-M29 | Repeated report submissions are refused by the server after the limit |
| WPS018-M30 | The client shows "wait and try again", never a generic failure |
| WPS018-M31 | The client does not retry automatically |
| WPS018-M32 | The limit clears after the window |
| WPS018-M33 | Repeated chat messages are limited without breaking a normal conversation |
| WPS018-M34 | Repeated support cases are limited without blocking a genuine second issue |

## G. Environment separation (M35 – M38)

| ID | Case |
| --- | --- |
| WPS018-M35 | The environment badge matches the project the build actually points at |
| WPS018-M36 | A staging build cannot reach production data — BLOCKED until a staging project exists |
| WPS018-M37 | A customer build does not open the operations surface |
| WPS018-M38 | An unreadable platform status puts the client into maintenance rather than open |

## H. Deployment, verification, and recovery (M39 – M44)

| ID | Case |
| --- | --- |
| WPS018-M39 | Migration list and dry run report the same pending chain |
| WPS018-M40 | Release verification reports the expected failure set and no unexpected one |
| WPS018-M41 | Each server-enforced kill switch moves the owning domain's own control |
| WPS018-M42 | Clearing a kill switch restores exactly the prior value |
| WPS018-M43 | Existing bookings, chat, and history are unaffected by every switch |
| WPS018-M44 | The staging restore drill completes and the data verifies — BLOCKED until a staging project exists |

## Accessibility and localization sweep

Run alongside every section: keyboard navigation with visible focus, screen
reader announcement of every refusal reason, status distinguishable without
colour, RTL mirroring, Egyptian Arabic on every refusal message a staff member
will actually read, and Cairo dates.

## Prohibitions during the run

- No hosted production migration.
- No production deployment.
- No production service-role credential.
- No enabling of payments, payouts, SMS, telephony, push, schedulers, or any
  external provider.
- No irreversible staff action against hosted data.
