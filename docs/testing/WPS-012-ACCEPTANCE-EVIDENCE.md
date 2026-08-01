# WPS-012 Acceptance Evidence

## Scope and verdict

WPS-012 is implemented and validated locally by extending the canonical WPS-004 booking, WPS-005 worker-job, WPS-007 financial-approval, WPS-009 communication, WPS-010 profile, and WPS-011 review systems. It adds one fine-grained operational aggregate per booking; it does not create a second booking, conversation, financial ledger, or review lifecycle. Manual acceptance and a fresh linked migration comparison remain pending. No hosted migration, deployment, payment, SMS, push delivery, webhook, scheduler, or irreversible production action was executed.

## Automated evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck` |
| ESLint | PASS | `npm.cmd run lint`, zero warnings/errors |
| Mojibake scan | PASS | `npm.cmd run check:mojibake` |
| Patch whitespace | PASS | `git diff --check`; line-ending notices only |
| WPS-012 custom suite | PASS | 118 contracts across database, repository, Mock, UI, localization, accessibility, privacy, integration, and motto behavior |
| Existing custom regressions | PASS | 13/13 commands: payments, WPS-008, device P1, brand, provider-card media, worker auth, profile phone, WPS-009, WPS-010, WPS-011, WPS-012, marketplace, and WPS-007 safe smoke help |
| Clean local database reset | PASS | All forward migrations through `202608010006` plus seed |
| pgTAP | PASS | 15 files / 1,029 assertions, including the dedicated WPS-012 operations suite and every earlier database suite |
| Expo Doctor | PASS | 18/18 checks using the Windows system CA |
| Android export | PASS | Cache-cleared export to `.expo/wps012-android` |
| iOS export | PASS | Cache-cleared export to `.expo/wps012-ios` |
| Web export | PASS | Cache-cleared export to `.expo/wps012-web`; 30 static routes |
| Local migration ledger | PASS | Complete through `202608010006` |
| Linked migration ledger | BLOCKED | Fresh read-only attempt failed before comparison: `LegacyDbConfigLoginRoleNetworkError` / `TransportError` |
| Hosted push dry-run | BLOCKED, NON-MUTATING | CLI printed `DRY RUN: migrations will not be pushed`, then failed at login-role initialization with the same transport error |
| Manual alpha | NOT RUN | 70/70 cases remain NOT RUN |

The Expo implementation was checked against the exact Expo SDK 54 ImagePicker, FileSystem, and Image documentation before code and validation.

## Architecture evidence

- `bookings` remains the canonical commercial and coarse lifecycle record. `booking_operations` is a one-to-one post-confirmation operational aggregate.
- `booking_operation_events` is the append-only participant timeline. Database triggers reject event updates and deletes.
- The server maps fine operational states back to existing booking states so earlier booking, payment, marketplace, messaging, and review behavior continues to observe its established contract.
- Legacy WPS-004/WPS-005 status RPCs are retained for compatibility and synchronize forward into the operational timeline. The active worker job screen delegates post-confirmation actions to WPS-012.
- Additional-work pricing delegates to the existing WPS-007 proposal/response authority. WPS-012 stores operational context and never settles money.
- Operation events add source-linked system messages to the existing WPS-009 conversation and durable deduplicated notifications. Operation-authoritative booking updates suppress only the equivalent coarse user-facing side effect; booking status history is always retained.
- Completion is customer-authoritative after worker readiness and customer inspection. Canonical completion continues to unlock the single WPS-011 review linked to that booking.
- Return visits are numbered operational sections on the same completed booking. They do not create a second booking or a second review.

## State and behavior evidence

The server transition graph covers `confirmed`, `provider_on_the_way`, `provider_arrived`, `started`, `paused`, `waiting_for_parts`, `waiting_for_approval`, `resumed`, `finished`, `customer_inspection`, `completed`, `cancelled`, and `disputed`. Participant roles, allowed predecessor states, booking ownership, active return section, checklist requirements, outstanding approvals, media prerequisites, and idempotency keys are server-authoritative.

Workers can publish predefined updates, report bounded delay reasons/minutes, upload phased progress evidence, pause/resume, request additional work with optional WPS-007 price adjustment, complete the required worker checklist, disclose warranty, and mark the work ready for inspection. Customers can approve/reject/clarify additional work, complete the inspection checklist, approve completion, request clarification or report remaining issues, and request a return visit after canonical completion. A clarification response keeps the same additional-work request actionable instead of silently resolving it.

Warranty choices are None, 30, 60, 90, or custom 1–365 days. An approved quote warranty is a minimum. Warranty dates begin on first canonical customer-approved completion; later return sections cannot reset or shorten them.

## Security evidence

The migration and dedicated tests verify:

- authenticated booking-participant or existing staff read access only;
- server-derived worker/customer/staff actor classification and ownership;
- guarded security-definer RPCs with empty `search_path` and explicit execution grants;
- revoked direct writes on every WPS-012 aggregate and revoked private helper execution;
- append-only event history, stable section numbers, unique idempotency keys, and duplicate-response prevention;
- server validation of every transition, note length, delay, checklist, warranty, media reference, additional-work response, and return-visit response;
- permanent links from operational records to the canonical booking;
- no public operation projection, raw storage path, participant contact detail, internal financial record, private moderation data, or private event payload;
- no WPS-012 table added to general public Realtime exposure; participant subscriptions use the existing authenticated booking boundary;
- no client authority to manufacture completion, review eligibility, price approval, storage ownership, or return sections.

## Storage evidence

The private `job-progress-media` bucket is limited to JPEG, PNG, WebP, HEIC, and HEIF with an 8 MB per-object maximum. Object paths are server-validated as authenticated-user/booking/operation-phase paths with immutable safe filenames. Registration verifies the storage-observed owner, MIME type, size, booking participant, phase, section, and per-section count. Media is hydrated with signed URLs only and stays private after completion. Only the uploader may remove a staged object before successful metadata registration; registered evidence has no client delete path. Supabase failures never fall back to Mock writes.

## Public/private data matrix

| Data/action | Booking customer | Assigned worker | Authorized staff | Public/other account |
| --- | --- | --- | --- | --- |
| Operational aggregate/timeline | Read; customer actions only | Read; worker actions only | Read under existing staff convention | Denied |
| Booking status/history | Existing participant rules | Existing participant rules | Existing staff rules | Existing sanitized booking behavior only |
| Progress-media metadata | Read for own booking | Read/upload for assigned booking | Authorized operational read | Denied |
| Progress-media object | Short-lived signed URL | Short-lived signed URL | Authorized signed access | Denied |
| Registered evidence deletion | Denied | Denied | No new client path | Denied |
| Additional-work request | Read/respond | Create/read | Authorized operational read | Denied |
| WPS-007 price adjustment | Existing customer approval | Existing worker proposal | Existing financial controls | Denied |
| Inspection/checklists | Respond/read | Submit/read | Authorized operational read | Denied |
| Warranty | Read | Declare within rules | Authorized operational read | Not added to public provider projection |
| Return visit | Request/read | Accept/decline/read | Authorized operational read | Denied |
| Conversation system event | Existing participant conversation | Existing participant conversation | Existing communication rules | Denied |
| Notification payload | Recipient only; booking/event IDs | Recipient only; booking/event IDs | Existing notification rules | Denied |
| Review eligibility | One review after canonical completion | Existing provider visibility/reply | Existing review moderation | Existing sanitized visible review only |

## Mock parity evidence

The Mock repository is selected statically and implements the same one-operation-per-booking invariant, transition graph, role checks, immutable events, idempotency, additional-work decisions, WPS-007 price-approval relationship, checklist gates, completion authority, warranty rules, return sections, progress-media metadata, and error semantics. Supabase mode neither injects fixtures nor falls back to Mock reads/writes.

## Localization and accessibility evidence

English and Egyptian Arabic cover every state, timeline event, update, delay, checklist, media phase, approval decision, warranty option, return-visit flow, action, loading, empty, retry, and error state. The panel follows locale direction, gives text input the correct RTL alignment, wraps action groups at compact widths, exposes accessibility labels/roles/state on controls, and uses existing Warsha focus/contrast/touch-target conventions. Automated contracts passed; physical TalkBack/VoiceOver, RTL, dynamic-type, and 320-pixel device acceptance remain manual NOT RUN.

## Motto audit

The only active motto is exactly English `YOUR WORK, OUR MISSION` and Arabic `شغلك مهمتنا`.

| Requested location | Exact locations checked | Result/correction |
| --- | --- | --- |
| Splash | `app.json`; `scripts/render-brand-assets.ps1`; `assets/images/warsha-brand-splash.png`; `assets/images/warsha-current-approved-splash.png` | Exact. Both splash files have SHA-256 `77F74D28EE5E8B240A046564D9FACCE58571276BCC116D139E7AEB5D7C02A5DA`. No correction required. |
| Onboarding | Full `app/` inventory; provider onboarding/profile state in `app/provider-mode.tsx`, `src/providers`, and worker-profile translations | No independent or outdated motto; shared brand localization remains authoritative. |
| Authentication | Profile authentication surfaces, `app/reset-password.tsx`, `src/auth`, `ConfigurationError`, and shared brand components | No independent or outdated motto. |
| Home | `app/(tabs)/index.tsx`, tab layout, `BrandLogo`, `BrandMark`, and `BrandUI` | No independent or outdated motto. |
| Profile | Customer/profile routes, provider profile route, provider/review components, and profile translations | No independent or outdated motto. |
| Settings | Settings sections in `app/(tabs)/profile.tsx`; repository route inventory confirms there is no standalone settings route | No independent or outdated motto. |
| Notifications | `app/notifications.tsx`, `NotificationBanner`, and `src/notifications` | No independent or outdated motto. |
| HTML | `app/+html.tsx` | Description and Open Graph description use the exact English motto. |
| Web manifest | `public/manifest.webmanifest` | Description uses the exact English motto. |
| App config | `app.json` | Approved icon, adaptive, monochrome, favicon, notification, and splash assets remain configured. |
| Shared localization | `src/i18n/translations.ts` | Exact English and Arabic values. |
| Docs | Constitution/brand/decision/audit documents, WPS/WES 009–012, WPS index, and testing documents found by repository scan | Active references are exact; historical mission prose remains labelled as context. No correction required. |
| Tests/scripts | Brand, device P1, WPS-009, WPS-011, and WPS-012 regression scripts plus the asset renderer | Exact assertions pass. Superseded English variants occur only inside negative tests that require their absence. |
| Assets | All 17 `assets/images/warsha-*` files and the existing brand-design source PDF inventory | Eight configured/current assets pass automated brand checks; approved splash pair is hash-identical. No correction required. |

## Pending hosted ledger

The local ledger contains every migration through `202608010006`. The fresh linked ledger and hosted dry-run could not pass login-role initialization. Relative to the last successfully recorded linked endpoint (`202607290002`), the exact local candidate pending sequence is:

1. `202607300001_payments_earnings_ledger.sql`
2. `202607300002_financial_spec_alignment.sql`
3. `202607310001_repository_alignment.sql`
4. `202607310002_marketplace_intelligence_schema.sql`
5. `202607310003_marketplace_intelligence_api.sql`
6. `202608010001_device_p1_fixes.sql`
7. `202608010002_profile_self_access.sql`
8. `202608010003_wps009_communication_collaboration.sql`
9. `202608010004_wps010_worker_profiles_portfolio.sql`
10. `202608010005_wps011_reviews_reputation.sql`
11. `202608010006_wps012_job_execution_operations.sql`

This is an exact comparison to the last verified linked ledger, not a claim that a fresh hosted comparison succeeded.

## Release gate

Local engineering verdict: **PASS**. Hosted deployment verdict: **HOLD** until linked connectivity is restored, the remote ledger/dry-run is freshly reviewed, the complete pending chain receives operational approval, and manual alpha is executed. The documented deployment command is `npx.cmd supabase db push --linked`; it was **not executed**.
