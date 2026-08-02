# WPS-016 Manual Runbook — Trust, Safety & Moderation

| Field | Value |
| --- | --- |
| Specification | WPS-016 v1.0 |
| Status | **NOT RUN** |
| Planned cases | 48 |
| Environment | Local Supabase + Expo development build |
| Prohibited | External moderation providers, AI moderation, automated bans, hosted migration |

## A. Report intake (WPS016-M01 – M12)

| ID | Case |
| --- | --- |
| WPS016-M01 | A report can be submitted from a booking |
| WPS016-M02 | A report can be submitted from chat |
| WPS016-M03 | A report can be submitted from a review |
| WPS016-M04 | A report can be submitted from a worker profile |
| WPS016-M05 | A report can be submitted from a customer profile |
| WPS016-M06 | A report can be submitted from a payment |
| WPS016-M07 | A report can be submitted from a certificate |
| WPS016-M08 | A report can be submitted from profile media |
| WPS016-M09 | All seventeen categories are selectable and localized |
| WPS016-M10 | Submitting the same report twice does not create a duplicate |
| WPS016-M11 | An account cannot report itself and sees a clear message |
| WPS016-M12 | The confidentiality note is shown before submitting |

## B. Reporter experience (WPS016-M13 – M18)

| ID | Case |
| --- | --- |
| WPS016-M13 | The reporter sees their own submissions and statuses |
| WPS016-M14 | The reporter never sees evidence, staff notes, or the outcome detail |
| WPS016-M15 | Another account cannot see the report |
| WPS016-M16 | The reported account is never told who reported |
| WPS016-M17 | Submitting a report changes nothing about the reporter's own account |
| WPS016-M18 | Report statuses are localized in English and Arabic |

## C. Trust state and restrictions (WPS016-M19 – M30)

| ID | Case |
| --- | --- |
| WPS016-M19 | A good-standing account sees no restriction banner |
| WPS016-M20 | A warning is visible with its public reason |
| WPS016-M21 | An investigation is presented as non-accusatory |
| WPS016-M22 | A communication restriction blocks messaging only |
| WPS016-M23 | A review restriction blocks reviews only |
| WPS016-M24 | Marketplace removal hides the worker from discovery |
| WPS016-M25 | A hidden profile is not publicly visible |
| WPS016-M26 | A payment hold is explained without accusation |
| WPS016-M27 | A withdrawal hold is explained without accusation |
| WPS016-M28 | A suspension withholds all capabilities |
| WPS016-M29 | An expired restriction lifts automatically with no staff action |
| WPS016-M30 | A client cannot change its own trust state by any means |

## D. Enforcement and staff flow (WPS016-M31 – M38)

| ID | Case |
| --- | --- |
| WPS016-M31 | A non-staff account cannot reach any staff moderation action |
| WPS016-M32 | An enforcement action without evidence is rejected |
| WPS016-M33 | A permanent ban is rejected without an investigated report |
| WPS016-M34 | A permanent ban succeeds only after investigation, by a staff actor |
| WPS016-M35 | Enforcement history cannot be edited or deleted |
| WPS016-M36 | Restoration clears restrictions and is recorded as its own action |
| WPS016-M37 | The staff queue summary shows counts only |
| WPS016-M38 | Every action appears in the immutable audit with actor, reason and evidence |

## E. Fraud signals (WPS016-M39 – M42)

| ID | Case |
| --- | --- |
| WPS016-M39 | A recorded signal changes no trust state |
| WPS016-M40 | A signalled account retains full access |
| WPS016-M41 | Signals are invisible to the affected user |
| WPS016-M42 | Signals do not affect ranking, reputation or discoverability |

## F. Appeals (WPS016-M43 – M46)

| ID | Case |
| --- | --- |
| WPS016-M43 | An affected account can appeal a warning, restriction, suspension or ban |
| WPS016-M44 | An investigation and a restoration cannot be appealed |
| WPS016-M45 | Only one appeal per action; a second attempt returns the existing appeal |
| WPS016-M46 | An unrelated account cannot read or file an appeal |

## G. Localization, RTL and accessibility (WPS016-M47 – M48)

| ID | Case |
| --- | --- |
| WPS016-M47 | Every trust surface is complete and natural in English and Egyptian Arabic with correct RTL |
| WPS016-M48 | Screen readers announce report status, account status, appeal status, and whether a restriction is active or cleared; status is distinguishable without colour, and the motto is exactly `YOUR WORK, OUR MISSION` / `شغلك مهمتنا` |

## Execution status

All 48 cases: **NOT RUN**.
