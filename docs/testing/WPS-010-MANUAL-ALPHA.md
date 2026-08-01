# WPS-010 Manual Alpha Runbook

## Status and safety

**Overall status: NOT RUN**

This runbook is for local or explicitly approved non-production test accounts. It must not apply hosted migrations, send live SMS/calls, move money, run payouts, trigger webhooks, or start schedulers. Use separate Worker A, Worker B, customer, and authorized staff personas. Record device, OS, build, data mode, locale, evidence, and result for every case.

Allowed results are `PASS`, `FAIL`, `BLOCKED`, and `NOT RUN`. Every case below starts as **NOT RUN**.

## A. Accounts, drafts, and isolation

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS010-M01 | Sign in as a new phone-verified worker and open My Work. | A private draft profile opens; no public listing exists. | NOT RUN |
| WPS010-M02 | Save a partially completed profile. | Draft saves without completion blocking. | NOT RUN |
| WPS010-M03 | Restart the app and reopen the draft. | Only that account’s saved profile returns. | NOT RUN |
| WPS010-M04 | Switch from Worker A to Worker B. | No Worker A profile, media, portfolio, certificate, or status flashes. | NOT RUN |
| WPS010-M05 | As Worker B, attempt copied Worker A record/deep-link identifiers. | Private records remain inaccessible. | NOT RUN |
| WPS010-M06 | In Mock mode, repeat A/B account-scope harness checks. | Keys and local media remain account-scoped; no Supabase request occurs. | NOT RUN |

## B. Simple profile and completeness

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS010-M07 | Inspect the checklist on an empty draft. | Five plain tasks appear; no XP, level, badge clutter, or gamification. | NOT RUN |
| WPS010-M08 | Enter display name and trade. | Inputs accept 2–100 characters and remain readable. | NOT RUN |
| WPS010-M09 | Enter a practical 20-character introduction. | Introduction task completes. | NOT RUN |
| WPS010-M10 | Attempt more than 500 biography characters. | Input is bounded without data corruption. | NOT RUN |
| WPS010-M11 | Enter years, experience summary, and specialties. | Years cap at 80; summary and up to 10 specialties save as worker-provided claims. | NOT RUN |
| WPS010-M12 | Select active services from launch taxonomy. | Only existing launch services are selectable; no complex price form appears. | NOT RUN |
| WPS010-M13 | Enter governorate, district, and travel radius. | Area saves with 1–250 km radius; no exact coordinate input is shown. | NOT RUN |
| WPS010-M14 | Toggle Available then Unavailable. | Binary state persists with no weekly schedule or business-hours UI. | NOT RUN |
| WPS010-M15 | Save before all tasks are complete. | Draft saves successfully and remains private. | NOT RUN |
| WPS010-M16 | Try profile submission while a required profile task is missing. | Clear, localized completion guidance appears. | NOT RUN |
| WPS010-M17 | Complete photo, bio, service, area, agreement, and submit. | Profile submits but remains hidden until all server trust gates pass. | NOT RUN |

## C. Private profile photo

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS010-M18 | Choose a supported image. | Square crop/preview opens and the private image appears. | NOT RUN |
| WPS010-M19 | Deny photo permission. | Localized error appears; prior photo remains. | NOT RUN |
| WPS010-M20 | Try unsupported MIME and a file over 5 MB. | Both are rejected without metadata change. | NOT RUN |
| WPS010-M21 | Force upload or registration failure during replacement. | Previous image remains registered and visible; staging is safely handled. | NOT RUN |
| WPS010-M22 | Replace a valid photo successfully. | New signed rendition appears; former object is cleaned after success. | NOT RUN |
| WPS010-M23 | Confirm photo deletion. | Metadata clears first, fallback avatar appears, and stale cleanup is best effort. | NOT RUN |

## D. Portfolio

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS010-M24 | Open Work Photos with no items. | Calm empty state and privacy warning appear. | NOT RUN |
| WPS010-M25 | Create a title-only work example. | A private draft item is created. | NOT RUN |
| WPS010-M26 | Add description, period, and related service. | Metadata saves within bounds. | NOT RUN |
| WPS010-M27 | Select several supported images. | At most remaining slots up to five are processed with visible previews. | NOT RUN |
| WPS010-M28 | Upload the same image twice. | Duplicate is rejected and no second metadata row appears. | NOT RUN |
| WPS010-M29 | Try invalid MIME and an image over 8 MB. | Each is rejected and remains safely retryable. | NOT RUN |
| WPS010-M30 | Force upload/registration failure then retry. | No duplicate or broken public item appears; retry succeeds when transport recovers. | NOT RUN |
| WPS010-M31 | Reorder images and portfolio items. | Order persists after refresh. | NOT RUN |
| WPS010-M32 | Try to publish an item with no image. | Publish is denied with simple guidance. | NOT RUN |
| WPS010-M33 | Publish then unpublish an item. | Public visibility follows state and the worker’s discovery gate. | NOT RUN |
| WPS010-M34 | Delete an image and then an item. | Metadata disappears first; associated private objects are cleaned safely. | NOT RUN |

## E. Certificates

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS010-M35 | Open Professional Certificates. | Skill Certificate links to existing verification; other certificates are separate and optional. | NOT RUN |
| WPS010-M36 | Create a relevant certificate with title/issuer. | Private draft metadata saves. | NOT RUN |
| WPS010-M37 | Pick PDF, JPG, and PNG documents. | Supported files up to 8 MB upload privately. | NOT RUN |
| WPS010-M38 | Try unsupported MIME and an oversized file. | Both are rejected without replacing the prior document. | NOT RUN |
| WPS010-M39 | Submit the certificate. | Worker sees Sent for review and editing locks. | NOT RUN |
| WPS010-M40 | Staff rejects with a reason. | Worker sees the private reason; customers do not. | NOT RUN |
| WPS010-M41 | Resubmit and approve with optional expiry. | Worker sees Verified; public receives only sanitized positive indicator/count. | NOT RUN |
| WPS010-M42 | Attempt public/cross-account certificate file access. | Document is not downloadable and access is denied. | NOT RUN |

## F. Public discovery and privacy

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS010-M43 | Browse a complete, phone/identity-approved, published worker. | Sanitized profile appears with authorized media. | NOT RUN |
| WPS010-M44 | Remove/expire identity approval. | Worker disappears from public catalog and media authorization fails closed. | NOT RUN |
| WPS010-M45 | Test missing phone confirmation, photo, bio, service, or area one at a time. | Each missing required gate keeps profile hidden. | NOT RUN |
| WPS010-M46 | Suspend or delete the worker account/profile. | Profile is hidden with no restriction reason leaked. | NOT RUN |
| WPS010-M47 | Inspect network/domain objects for public profile. | No phone, email, exact coordinates, document path, rejection reason, financial data, or internal score is exposed to UI state. | NOT RUN |
| WPS010-M48 | Open approximate area. | Only area wording and rounded radius appear; no map geometry/home address appears. | NOT RUN |
| WPS010-M49 | Inspect identity, Skill Certificate, and relevant-certificate indicators. | Only approved meaningful indicators render; no Premium/top-worker/XP claims appear. | NOT RUN |
| WPS010-M50 | Open a public profile without optional portfolio/certificate/payment/warranty data. | Layout remains complete and calm with safe empty/omitted states. | NOT RUN |

## G. Reviews and quote conversion

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS010-M51 | Open reviews on a discoverable worker. | Existing aggregate, verified-booking reviews, and worker replies render. | NOT RUN |
| WPS010-M52 | Verify Supabase mode has no fixture review injection. | Only database review data is shown. | NOT RUN |
| WPS010-M53 | Press the primary profile action. | Request a Quote opens a targeted WPS-008 request; no direct fixed booking is required. | NOT RUN |
| WPS010-M54 | Complete quote selection and worker confirmation in an approved test flow. | Existing booking lifecycle begins; communication remains unavailable before confirmation. | NOT RUN |

## H. Language, RTL, accessibility, and small screens

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS010-M55 | Run worker and customer flows in English. | Copy is complete, practical, and not résumé/social language. | NOT RUN |
| WPS010-M56 | Run flows in Egyptian Arabic. | Natural Egyptian Arabic copy is complete and understandable. | NOT RUN |
| WPS010-M57 | Repeat in RTL. | Rows, arrows, fields, chips, and horizontal galleries behave correctly. | NOT RUN |
| WPS010-M58 | Use screen reader on tabs, checklist, image actions, status, and quote action. | Labels, roles, selected/checked/disabled states, and reading order are correct. | NOT RUN |
| WPS010-M59 | Test 320 CSS px/web and a small Android/iPhone viewport. | No page-level horizontal overflow or unreachable action occurs. | NOT RUN |
| WPS010-M60 | Test slow loading, offline retry, and refresh. | Stable loading/empty/error states appear; Supabase never falls back to Mock writes. | NOT RUN |

## Sign-off

Tester, date, build identifier, environment, device matrix, failures, linked issues, and acceptance decision: **NOT RUN / NOT RECORDED**.
