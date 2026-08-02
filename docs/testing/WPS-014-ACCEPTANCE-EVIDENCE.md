# WPS-014 Acceptance Evidence

## Scope and verdict

WPS-014 extends the existing WPS-005 durable `public.notifications` inbox, centralized Realtime invalidation, repositories, context, banner, screen, domain producers, and Mock boundary. It creates no parallel event system and changes no booking, marketplace, financial, communication, review, operation, dispute, verification, profile, or ranking authority. Production push, token activation, provider delivery, scheduler execution, hosted migration/deployment, SMS, telephony, payments, payouts, and webhooks were not authorized or executed.

## Automated evidence

This table is updated only from executed gates. A failed, blocked, or unrun gate is never recorded as passed.

| Gate | Result | Evidence |
| --- | --- | --- |
| Exact Expo SDK 54 documentation | PASS | Official Expo 54 overview, Notifications, Linking, and Application documentation reviewed before client changes |
| TypeScript | PASS | `npm.cmd run typecheck` |
| Clean local database reset | BLOCKED | Supabase CLI 2.111.0 was available, but local runtime status did not complete within the environment limit; no reset result is inferred |
| Focused WPS-014 pgTAP | NOT RUN | 82-assertion suite created; requires the blocked clean local database |
| WPS-014 TypeScript regression | PASS | 217/217 checks |
| ESLint | PASS | `npm.cmd run lint` |
| Mojibake | PASS | `npm.cmd run check:mojibake`: no likely mojibake |
| Patch whitespace | PASS | `git diff --check` after the two reported trailing spaces were corrected |
| Existing regressions | PASS | 13 existing suites: 631 enumerated checks plus four qualitative suites; WPS-007 local-only smoke harness also passed |
| Full pgTAP | NOT RUN | Candidate total is 17 files / 1,205 assertions (prior validated 1,123 plus 82 WPS-014); database execution is blocked |
| Expo Doctor | PASS | 18/18 with Node system CA; initial run exposed only local certificate/network failures |
| Android export | PASS | Cache-cleared export to `tmp/wps014-final-android` |
| iOS export | PASS | Cache-cleared export to `tmp/wps014-final-ios` |
| Web export | PASS | Cache-cleared static export, including notification/preferences routes, to `tmp/wps014-final-web` |
| Repository migration order | PASS | Forward files are ordered through `202608020002_wps014_notifications_engagement.sql` |
| CLI local migration ledger | BLOCKED | Local Supabase runtime unavailable; file order is not presented as a CLI database ledger |
| Linked list/dry-run | NOT RUN | Prior linked comparison remains transport-blocked; no fresh hosted state is inferred and no hosted mutation was attempted |
| Manual alpha | NOT RUN | 60/60 cases remain NOT RUN |

## Architecture evidence

- `public.notifications` remains the sole durable in-app source.
- One shared server insert trigger derives safe event metadata, strips payloads to allowlisted UUIDs, enforces source dedupe, and groups only same-conversation or same-request events.
- Private immutable source links preserve every grouped source relationship.
- Owner/mode RPCs project the inbox, archived history, global/category/chat counts, preferences, and typed guarded routes.
- Existing WPS domain producers remain authoritative; narrowly scoped triggers cover only previously missing meaningful transitions.
- The WPS-012 legacy synchronization path retains booking history but suppresses its duplicate coarse notification for five fine-grained operation milestones.
- Realtime remains owner-filtered invalidation followed by authoritative reload, with reconnect/foreground/account/mode cleanup.

## Security and privacy evidence

- Authenticated clients retain owner-RLS reads for compatibility but cannot insert, update, or delete notification rows.
- Preference writes are RPC-only; push/email/SMS are forced off.
- Templates, source links, configuration, token secrets, delivery attempts, reminder jobs, and operational metrics are private.
- Route resolution validates Auth, current mode, row ownership, route allowlist, and canonical target relationship; arbitrary URLs are absent.
- Stored payloads contain only allowlisted identifiers. Generic external previews exclude messages, filenames, contacts, addresses, identity/certificate material, financial internals, dispute evidence, and staff notes.
- Required actions cannot be archived while the authoritative action remains open.

## Motto audit

The only active motto is exactly English `YOUR WORK, OUR MISSION` and Arabic `شغلك مهمتنا`. No active drift was found, so no motto source or asset needed correction.

| Requested location | Locations checked | Result |
| --- | --- | --- |
| Splash | `app.json`, `scripts/render-brand-assets.ps1`, `assets/images/warsha-current-approved-splash.png` (visual inspection) | Config selects the approved asset; asset visibly reads the exact English motto |
| Onboarding | Full `app/` inventory; worker onboarding/profile state in `app/provider-mode.tsx`, `app/(tabs)/profile.tsx`, and `src/providers` | No standalone customer onboarding route or independent motto; shared brand sources only |
| Authentication | `app/(tabs)/profile.tsx`, `app/reset-password.tsx`, shared `BrandLockup` | No independent or outdated motto variant |
| Home | `app/(tabs)/index.tsx`, `components/warsha/Header.tsx`, shared brand localization | No independent or outdated motto variant |
| Profile | `app/(tabs)/profile.tsx`, provider-profile routes, shared lockup | No independent or outdated motto variant |
| Settings | Profile controls and `app/notification-preferences.tsx`; no standalone general-settings route exists | No independent or outdated motto variant |
| Notifications | `app/notifications.tsx`, `app/notification-preferences.tsx`, `NotificationBanner.tsx`, notification translations | No independent or outdated motto variant |
| HTML | `app/+html.tsx` | Exact English motto in description and Open Graph description |
| Web manifest | `public/manifest.webmanifest` | Exact English motto in description |
| App config | `app.json` | Approved icon/favicon/splash asset references; no competing text variant |
| Docs | Constitution distinction, brand docs, WPS/WES register, audits, acceptance/manual documents | Active motto exact; broader Constitution line retained only as mission prose |
| Tests | Brand, device P1, WPS-009/011/012/013/014 regressions | Positive bilingual locks and intentional negative stale-variant assertions pass |
| Assets | Approved icon/adaptive/monochrome/notification/favicon assets and splash generator/output | Brand suite passed 8 assets / 54 review items; splash inspected visually |

## Public/private data matrix

| Data/action | Owner in current mode | Owner in other mode | Staff/private processor | Public/unrelated |
| --- | --- | --- | --- | --- |
| Active/archived inbox projection | Read safe rows | Mode-filtered | Existing authorized operations | Denied |
| Read/mark-all/archive | Guarded RPC | Wrong-mode denied | No client authority | Denied |
| Category/priority/audience/source/route | Read safe metadata | Mode-filtered | Server-derived | Denied |
| Notification payload | Allowlisted route UUIDs | Mode-filtered | Server sanitized | Denied |
| Preferences/quiet hours | Own guarded read/write | Same account | Private policy use | Denied |
| Device token secret/delivery attempt | Hidden | Hidden | Private, disabled | Hidden |
| Reminder jobs/operational events | Hidden | Hidden | Private, scheduler disabled | Hidden |
| Domain target | Existing domain authorization | Existing mode authorization | Existing staff authority | Existing public projection only |

## Pending migration chain and release gate

Relative to the last successfully verified hosted migration `202607290002`, the candidate pending chain is:

`202607300001`, `202607300002`, `202607310001`, `202607310002`, `202607310003`, `202608010001`, `202608010002`, `202608010003`, `202608010004`, `202608010005`, `202608010006`, `202608020001`, `202608020002`.

This is repository evidence carried forward from the last verified hosted boundary, not a fresh hosted observation. The implementation verdict remains **HOLD** until clean reset, focused/full pgTAP, fresh linked comparison/dry-run, and manual alpha are reviewed. The exact documented deployment command is `npx.cmd supabase db push --linked`; it was not executed.
