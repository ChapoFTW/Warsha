# WPS-017 Manual Runbook — Operations, Analytics & Admin Platform

| Field | Value |
| --- | --- |
| Specification | WPS-017 v1.0 |
| Status | **NOT RUN** |
| Planned cases | 66 |
| Environment | Local Supabase + Expo development build, `EXPO_PUBLIC_ADMIN_SURFACE=enabled` |
| Prohibited | Hosted migration, production service-role credentials, irreversible staff actions against hosted data, enabling any real provider |

Run every case in both English and Egyptian Arabic where the screen has copy.
Record a failure the moment the screen is confusing, not only when it errors —
Manual Alpha treats friction as a defect.

## A. Access, session, and environment (M01 – M09)

| ID | Case |
| --- | --- |
| WPS017-M01 | With the admin flag unset, the operations surface refuses to open |
| WPS017-M02 | A customer account sees "no operations access" and no configuration |
| WPS017-M03 | A worker account sees "no operations access" and no configuration |
| WPS017-M04 | A staff account opens the operational home and sees only its own queues |
| WPS017-M05 | The environment badge is visible on every operations screen |
| WPS017-M06 | A high-risk action is refused until re-authentication is recorded |
| WPS017-M07 | Re-authenticating unlocks the action and the session reflects it |
| WPS017-M08 | Revoking my own sessions immediately removes the re-authentication |
| WPS017-M09 | Switching to customer mode and back does not leak staff state |

## B. Roles and capabilities (M10 – M17)

| ID | Case |
| --- | --- |
| WPS017-M10 | A Security Administrator can grant a role with a written reason |
| WPS017-M11 | Granting a role to my own account is refused with a clear message |
| WPS017-M12 | A Support Agent cannot open the dispute or reconciliation queue |
| WPS017-M13 | A Dispute Reviewer cannot open a financial queue |
| WPS017-M14 | A Financial Operations reviewer cannot open the trust queue |
| WPS017-M15 | Revoking a role removes access on the next screen, with no sign-out |
| WPS017-M16 | A revoked staff member's re-authentication is cleared |
| WPS017-M17 | Role history shows the grant and the revocation, and cannot be edited |

## C. Queues and case work (M18 – M28)

| ID | Case |
| --- | --- |
| WPS017-M18 | The home lists only queues my capabilities allow |
| WPS017-M19 | Each queue row shows identifier, age, priority, status, owner, and deadline |
| WPS017-M20 | An overdue item is distinguishable without relying on colour |
| WPS017-M21 | Backlog items not yet opened as cases are listed separately |
| WPS017-M22 | Claiming a case assigns it to me and advances the version |
| WPS017-M23 | Two reviewers acting on one case produce a clear conflict message |
| WPS017-M24 | Reloading after a conflict shows the current state |
| WPS017-M25 | Repeating the same action does not create a second event |
| WPS017-M26 | A case cannot be assigned to someone who cannot work the queue |
| WPS017-M27 | Escalation is visible in the timeline and notifies the owner |
| WPS017-M28 | Resolving and closing behave differently and both are final in the list |

## D. Private notes and staff notifications (M29 – M33)

| ID | Case |
| --- | --- |
| WPS017-M29 | A staff-private note is visible to staff who can work the queue |
| WPS017-M30 | A participant never sees a staff-private note anywhere |
| WPS017-M31 | A staff notification appears in staff mode only |
| WPS017-M32 | No staff notification appears in a customer or worker inbox |
| WPS017-M33 | No push notification is delivered for any staff event |

## E. Search and safe views (M34 – M41)

| ID | Case |
| --- | --- |
| WPS017-M34 | A short search term is refused with a clear message |
| WPS017-M35 | A wildcard search is refused |
| WPS017-M36 | A name search is refused without the contact capability |
| WPS017-M37 | An exact identifier resolves within the caller's capabilities |
| WPS017-M38 | Searching repeatedly triggers the rate limit and recovers |
| WPS017-M39 | A safe customer view states plainly when contact detail is hidden |
| WPS017-M40 | A safe worker view states plainly when earnings are hidden |
| WPS017-M41 | No National ID appears anywhere, in any role |

## F. Configuration, flags, and kill switches (M42 – M51)

| ID | Case |
| --- | --- |
| WPS017-M42 | A configuration draft records a reason and validates the payload |
| WPS017-M43 | An unknown or secret-shaped key is refused |
| WPS017-M44 | The author cannot approve their own version |
| WPS017-M45 | A second approver can activate, and the previous version is superseded |
| WPS017-M46 | A rollback creates a new corrective version and never edits history |
| WPS017-M47 | Every domain states its owner and who applies the activated version |
| WPS017-M48 | Every feature flag is off by default with a written reason |
| WPS017-M49 | Enabling a flag requires an audience and takes effect deterministically |
| WPS017-M50 | Activating a kill switch requires a reason and a confirmation |
| WPS017-M51 | Clearing a kill switch restores exactly the prior state |

## G. Support cases (M52 – M56)

| ID | Case |
| --- | --- |
| WPS017-M52 | A customer can open a support case and see their own thread |
| WPS017-M53 | A staff reply reaches the participant; a staff note does not |
| WPS017-M54 | Escalation without an authoritative record is refused |
| WPS017-M55 | Escalation with a linked dispute or report succeeds and shows the link |
| WPS017-M56 | Support case history cannot be edited after the fact |

## H. Incidents, audit, analytics, exports (M57 – M66)

| ID | Case |
| --- | --- |
| WPS017-M57 | An incident can be opened manually with severity and affected systems |
| WPS017-M58 | The incident timeline is append-only and readable in order |
| WPS017-M59 | A sev1 or sev2 incident notifies the incident-capable staff |
| WPS017-M60 | The audit explorer is read-only across every source |
| WPS017-M61 | An unbounded audit range is refused |
| WPS017-M62 | Every dashboard states its timezone, time basis, and partial period |
| WPS017-M63 | A suppressed cohort renders as hidden, never as zero |
| WPS017-M64 | Financial analytics are refused without the ledger capability |
| WPS017-M65 | An export requires a reason and returns only allowlisted columns |
| WPS017-M66 | Another staff member cannot download my export |

## Accessibility and localization sweep

Run alongside every section:

- keyboard navigation reaches every control, with visible focus;
- screen reader announces status, priority, environment, and every metric;
- status is distinguishable without colour;
- RTL mirrors order and the focus path;
- Arabic copy is natural Egyptian Arabic on every workflow label;
- dates render in Africa/Cairo and money as EGP;
- Reduced Motion is respected;
- the layout is usable on a small laptop.

## Prohibitions during the run

- No hosted migration.
- No production service-role credential.
- No irreversible staff action against hosted data.
- No enabling of payments, payouts, refunds, push, SMS, calls, webhooks,
  schedulers, or any external provider.
