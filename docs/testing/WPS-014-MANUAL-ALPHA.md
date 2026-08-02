# WPS-014 Manual Alpha Runbook

## Status and safety

**Overall status: NOT RUN**

Run only against local or explicitly approved non-production customer, worker, unrelated-user, and authorized-staff personas. Do not apply hosted migrations, deliver push/SMS/email, invoke telephony/webhooks, move money, activate schedulers, or perform irreversible operations. Record build, mode, device/browser, OS, locale, persona, timestamp, evidence, and result. Allowed results are `PASS`, `FAIL`, `BLOCKED`, and `NOT RUN`; every case starts **NOT RUN**.

## A. Unified center, categories, and priority

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS014-M01 | Open customer notification center with mixed domain events. | One chronological center renders safe localized rows. | NOT RUN |
| WPS014-M02 | Open worker center in provider mode. | Only worker/all audience rows appear. | NOT RUN |
| WPS014-M03 | Switch Current/Archived. | Views are exclusive; no row is deleted. | NOT RUN |
| WPS014-M04 | Filter each nine-category value. | Only matching rows appear and count labels reconcile. | NOT RUN |
| WPS014-M05 | Trigger Critical, Action Required, Important, Informational events. | Priority is announced without unnecessary alarming copy. | NOT RUN |
| WPS014-M06 | Open an unknown retained legacy type. | Generic safe category copy renders without crash. | NOT RUN |
| WPS014-M07 | Test empty active and archive views. | Correct empty states render. | NOT RUN |
| WPS014-M08 | Force inbox/count RPC failure then retry. | Safe error and retry recover authoritatively. | NOT RUN |
| WPS014-M09 | Pull to refresh and paginate over 20 rows. | No duplicates/gaps; localized ordering remains newest first. | NOT RUN |
| WPS014-M10 | Compare customer/worker category relevance. | Simple role-relevant categories are shown. | NOT RUN |

## B. Sources, grouping, dedupe, and lifecycle

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS014-M11 | Retry one trusted event insert. | One durable row/source link exists. | NOT RUN |
| WPS014-M12 | Send multiple unread messages on one booking. | One grouped row increments deterministically. | NOT RUN |
| WPS014-M13 | Send messages on two bookings. | Two groups remain separate. | NOT RUN |
| WPS014-M14 | Read the group, then send another message. | A new unread group is created; history remains. | NOT RUN |
| WPS014-M15 | Receive first and additional quotes for one request. | Immediate first row groups later quote sources. | NOT RUN |
| WPS014-M16 | Receive quotes on unrelated requests. | They never group together. | NOT RUN |
| WPS014-M17 | Execute five legacy-synchronized operation milestones. | Fine-grained notification appears once; booking history remains once. | NOT RUN |
| WPS014-M18 | Trigger existing financial/review/dispute producers. | Existing event creates one normalized durable row per recipient. | NOT RUN |
| WPS014-M19 | Trigger report/certificate/no-provider missing-source integrations. | Safe intended notice appears once. | NOT RUN |
| WPS014-M20 | Inspect private source links after grouping. | Every source is immutable and points to its durable row. | NOT RUN |

## C. Read, archive, counts, preferences, quiet hours

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS014-M21 | Mark one row read. | Row state and global/category count reconcile. | NOT RUN |
| WPS014-M22 | Mark all read in customer mode. | Only current-mode active rows change. | NOT RUN |
| WPS014-M23 | Archive completed informational row. | Row moves to archive with history intact. | NOT RUN |
| WPS014-M24 | Archive unresolved required-action row. | Server and Mock reject with safe explanation. | NOT RUN |
| WPS014-M25 | Resolve required action then archive. | Archive succeeds after authoritative state closes. | NOT RUN |
| WPS014-M26 | Compare durable global and chat unread counts. | Both are independent; UI never sums them as duplicate messages. | NOT RUN |
| WPS014-M27 | Disable optional category then trigger event. | Non-mandatory notice is suppressed consistently. | NOT RUN |
| WPS014-M28 | Disable Payments/Disputes/Security then trigger required event. | Required in-app notice remains available. | NOT RUN |
| WPS014-M29 | Save valid same-day and cross-midnight quiet hours. | Values persist with timezone and in-app remains immediate. | NOT RUN |
| WPS014-M30 | Try invalid/equal/malformed times and timezone. | Validation rejects without partial write. | NOT RUN |

## D. Routing, Realtime, privacy, and security

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS014-M31 | Open every supported typed route. | Correct authenticated screen opens after server resolution. | NOT RUN |
| WPS014-M32 | Tap one row repeatedly. | Single-flight prevents duplicate navigation. | NOT RUN |
| WPS014-M33 | Open stale/inaccessible target. | Safe fallback appears without resource disclosure. | NOT RUN |
| WPS014-M34 | Attempt arbitrary URL/script payload. | Payload is stripped and no arbitrary navigation occurs. | NOT RUN |
| WPS014-M35 | Change ownership/status after row creation then open. | Route revalidation follows current authority. | NOT RUN |
| WPS014-M36 | Insert/update/delete notifications as client. | Grants/RLS reject every direct write. | NOT RUN |
| WPS014-M37 | Read another account's rows/preferences/counts. | RLS/RPC checks deny without existence leak. | NOT RUN |
| WPS014-M38 | Inspect message/payment/dispute/security payloads and previews. | Prohibited private content is absent. | NOT RUN |
| WPS014-M39 | Trigger Realtime event during open conversation. | Authoritative refresh occurs; active-chat banner is suppressed. | NOT RUN |
| WPS014-M40 | Disconnect/reconnect and background/foreground. | One channel reconciles and cleans up without duplicate durable creation. | NOT RUN |

## E. Push fail-closed, reminders, Mock parity, isolation

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS014-M41 | Inspect Push preference. | It clearly says unavailable and remains off. | NOT RUN |
| WPS014-M42 | Attempt token registration. | SQLSTATE 55000 fail-closed; no token or external request. | NOT RUN |
| WPS014-M43 | Invoke private reminder processor in fixture. | Disabled/zero claimed; no notification delivered. | NOT RUN |
| WPS014-M44 | Create supported reminder-source events. | Private bounded deduped jobs are recorded only. | NOT RUN |
| WPS014-M45 | Complete/cancel source before reminder. | Job is suppressed by current source state. | NOT RUN |
| WPS014-M46 | Repeat core center/group/read/archive/preferences/routes in Mock. | Behavior matches implemented Supabase contract. | NOT RUN |
| WPS014-M47 | Force Supabase failure. | Error propagates; no Mock fallback read/write occurs. | NOT RUN |
| WPS014-M48 | Switch customer/provider mode during delayed reload. | Prior rows/counts/banner disappear before new scope loads. | NOT RUN |
| WPS014-M49 | Logout and sign into another account. | Old storage/channel/state cannot flash or mutate. | NOT RUN |
| WPS014-M50 | Inspect push adapter imports/network. | No Expo/FCM/APNs/OneSignal provider or request exists. | NOT RUN |

## F. Localization, accessibility, brand, and operations

| ID | Procedure | Expected | Status |
| --- | --- | --- | --- |
| WPS014-M51 | Exercise all categories/priorities/actions/states in English. | Complete natural English renders. | NOT RUN |
| WPS014-M52 | Repeat in Egyptian Arabic. | Complete natural Egyptian Arabic renders. | NOT RUN |
| WPS014-M53 | Repeat at 320 CSS px and small Android/iPhone widths in RTL. | Rows/chips/settings wrap and mirror without loss. | NOT RUN |
| WPS014-M54 | Use TalkBack/VoiceOver. | Read state, category, priority, group count, actions, tabs, and switches are announced. | NOT RUN |
| WPS014-M55 | Use keyboard/web focus and large dynamic text. | Order, focus, targets, and wrapping remain usable. | NOT RUN |
| WPS014-M56 | Test reduced motion. | No meaning depends on animation or motion. | NOT RUN |
| WPS014-M57 | Audit splash/onboarding/auth/home/profile/settings/notifications/HTML/manifest/app config/docs/tests/assets. | Only approved exact bilingual motto is active. | NOT RUN |
| WPS014-M58 | Inspect private/public schema and Realtime publication. | Internal moderation/delivery/reminder/token data is not public or published. | NOT RUN |
| WPS014-M59 | Run reset, pgTAP, regressions, lint, Doctor, and three exports. | All local automated gates pass. | NOT RUN |
| WPS014-M60 | Verify operational safety log. | No hosted migration/deploy, push, SMS, telephony, payment/payout, webhook, scheduler, or irreversible action occurred. | NOT RUN |
