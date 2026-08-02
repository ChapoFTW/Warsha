# WPS-014 Acceptance Evidence

## Scope and verdict

WPS-014 extends the existing WPS-005 durable `public.notifications` inbox, centralized Realtime invalidation, repositories, context, banner, screen, domain producers, and Mock boundary. It creates no parallel event system and changes no booking, marketplace, financial, communication, review, operation, dispute, verification, profile, or ranking authority. Production push, token activation, provider delivery, scheduler execution, hosted migration/deployment, SMS, telephony, payments, payouts, and webhooks were not authorized or executed.

## Automated evidence

This table is updated only from executed gates. A failed, blocked, or unrun gate is never recorded as passed.

| Gate | Result | Evidence |
| --- | --- | --- |
| Exact Expo SDK 54 documentation | PASS | Official Expo 54 overview, Notifications, Linking, and Application documentation reviewed before client changes |
| TypeScript | PASS | `npm.cmd run typecheck` |
| Clean local database reset | PASS | `npx.cmd supabase db reset` applied every migration through `202608020002_wps014_notifications_engagement.sql` and seeded successfully |
| Focused WPS-014 pgTAP | PASS | `notifications-engagement.test.sql` executed **82/82** assertions |
| WPS-014 TypeScript regression | PASS | 217/217 checks |
| ESLint | PASS | `npm.cmd run lint` |
| Mojibake | PASS | `npm.cmd run check:mojibake`: no likely mojibake |
| Patch whitespace | PASS | `git diff --check` reports no whitespace errors |
| Existing regressions | PASS | 14 suites executed, all exit 0 (see per-suite totals below) |
| Full pgTAP | PASS | `npx.cmd supabase test db` executed **17 files / 1,205 assertions**, `Result: PASS` |
| Expo Doctor | PASS | 18/18 checks passed, no issues detected |
| Android export | PASS | Cache-cleared `npx.cmd expo export --platform android --clear` |
| iOS export | PASS | Cache-cleared `npx.cmd expo export --platform ios --clear` |
| Web export | PASS | Cache-cleared static export including `/notifications` and `/notification-preferences` routes |
| Repository migration order | PASS | Forward files are ordered through `202608020002_wps014_notifications_engagement.sql` |
| CLI local migration ledger | PASS | Local reset ledger applied the full chain in order, ending at `202608020002` |
| Linked list/dry-run | PASS | `npx.cmd supabase migration list` and `npx.cmd supabase db push --linked --dry-run` executed read-only; exactly one pending migration |
| Manual alpha | NOT RUN | 60/60 cases remain NOT RUN |

### Migration repair executed before validation

`202608020002_wps014_notifications_engagement.sql` was **local-only** (recorded in neither the hosted ledger nor any applied local ledger), so it was corrected in place rather than superseded by a forward migration. No already-applied migration was edited.

| # | Defect | SQLSTATE | Location | Correction |
| --- | --- | --- | --- | --- |
| 1 | `pg_catalog.extract(epoch from ...)` — `EXTRACT(field FROM source)` is special parser grammar valid only for the unqualified keyword; schema-qualifying it makes it an ordinary function call, so `from` is a syntax error | 42601 | `refresh_notification_discoverability`, `notify_auth_security_change` | Replaced with the fully-qualified ordinary-function equivalent `pg_catalog.date_part('epoch', ...)` |
| 2 | PL/pgSQL variable `provider_id` shadowed `private.notification_discoverability_state.provider_id` | 42702 | `refresh_notification_discoverability` | Variable renamed to `target_provider_id` |
| 3 | PL/pgSQL variable `request_id` shadowed `public.quote_invitations.request_id` | 42702 | `private.notification_audience` | Variable renamed to `target_request_id` |
| 4 | PL/pgSQL variable `request_id` shadowed `public.quote_invitations.request_id` / `public.worker_quotes.request_id` | 42702 | `public.resolve_notification_route` | Variable renamed to `target_request_id` |

Defects 2–4 only surface at trigger/RPC execution time, which is why the original failure masked them. Defect 3 additionally broke `create_marketplace_request`, whose `when others` handler re-raised it as a generic `P0001`.

Two assertions in the WPS-014 pgTAP suite were corrected because they asserted behavior that contradicted the intended security model. **No grant, policy, trigger, or RLS rule was weakened to make any test pass.**

| Assertion | Problem | Correction |
| --- | --- | --- |
| `terminal booking state suppresses future reminder` | Setup performed `update public.bookings` while `set local role authenticated`, but `authenticated` deliberately holds only `SELECT` on `public.bookings` (pre-existing hardening from `202607200012` / `202607290001`) | Drives the transition as the table owner with the customer identity set, matching the fixture pattern already used in the same file. Granting UPDATE was rejected as a security weakening |
| `anonymous inbox access is denied` | Expected the in-function `Authentication required` message, but EXECUTE is revoked from `anon`, so denial happens earlier at the privilege layer | Now asserts the actual, stronger denial `42501 permission denied for function get_my_notifications`, consistent with the suite's own `has_function_privilege('anon', ...) = false` assertion |

### Executed pgTAP totals per suite

| Suite | Assertions |
| --- | --- |
| `chat.test.sql` | 35 |
| `communication-collaboration.test.sql` | 80 |
| `device-p1-fixes.test.sql` | 22 |
| `disputes-resolution.test.sql` | 94 |
| `financial-spec.test.sql` | 107 |
| `job-execution-operations.test.sql` | 107 |
| `marketplace-intelligence.test.sql` | 96 |
| `notifications-engagement.test.sql` | **82** |
| `payments.test.sql` | 101 |
| `profile-self-access.test.sql` | 30 |
| `provider-verification.test.sql` | 99 |
| `provider_jobs.test.sql` | 29 |
| `repository-alignment.test.sql` | 35 |
| `reviews-reputation.test.sql` | 80 |
| `reviews.test.sql` | 60 |
| `rls.test.sql` | 71 |
| `worker-profiles-portfolio.test.sql` | 77 |
| **Total (17 files)** | **1,205** |

### Executed regression suite totals

| Suite | Result |
| --- | --- |
| `test:payments` | PASS — 11 assertions |
| `test:wps008-alignment` | PASS — 13 assertions |
| `test:device-p1` | PASS — 73 assertions |
| `test:brand` | PASS — 8 assets, 54 manual-review items |
| `test:provider-card` | PASS — qualitative |
| `test:worker-auth` | PASS — qualitative |
| `test:profile-phone` | PASS — 52 assertions |
| `test:wps009` | PASS — qualitative |
| `test:wps010` | PASS — qualitative |
| `test:wps011` | PASS — 100 contracts |
| `test:wps012` | PASS — 118 contracts |
| `test:wps013` | PASS — 182 contracts |
| `test:wps014` | PASS — 217 checks |
| `test:marketplace` | PASS — 20 assertions |

### Executed database security audit

Verified directly against the migrated local catalog after a clean reset:

| Control | Result |
| --- | --- |
| SECURITY DEFINER functions pinned to empty `search_path` | PASS — 252/252 in `public`+`private`; 0 non-compliant |
| Private notification tables exposed to `anon`/`authenticated`/`PUBLIC` | PASS — 0 grants (tokens, delivery attempts, reminder jobs, event catalog, source links, configuration, operational events, discoverability/cash-debt state) |
| Direct `INSERT`/`UPDATE`/`DELETE` on `public.notifications` / `notification_preferences` for clients | PASS — absent; `SELECT` only |
| RLS on `public.notifications` / `notification_preferences` | PASS — enabled; owner-only `user_id = auth.uid()` |
| Client RPC EXECUTE grants | PASS — all 14 RPCs granted to `authenticated` only; `anon` and `PUBLIC` revoked |
| Private helper functions executable by clients | PASS — 0 |
| Realtime publication | PASS — only `public.notifications`; no `private` table published |
| Fail-closed configuration | PASS — `push_delivery_enabled`, `token_registration_enabled`, `scheduler_enabled` all false |
| Payload allowlisting | PASS — `notification_safe_payload` rebuilds payloads from 14 allowlisted keys, each coerced through `notification_data_uuid`, so only valid UUIDs survive; message bodies, attachment filenames, phone/email, addresses, identity/certificate data, staff dispute notes, and financial internals are structurally excluded |
| Generic titles/bodies | PASS — server overwrites client-supplied copy (pgTAP assertions on generic title/body) |
| Source-link immutability | PASS — `notification_source_links_immutable` BEFORE UPDATE OR DELETE trigger |
| Required-action archive prevention | PASS — pgTAP `unresolved action cannot be archived` (55000) |
| Critical-notification preference bypass | PASS — mandatory categories bypass preference suppression |
| Push registration fails closed while disabled | PASS — pgTAP `token registration fails closed` (55000) |
| Anonymous / unrelated-account denial | PASS — anon denied at privilege layer; unrelated account sees 0 rows and cannot mutate |

Observation, not a WPS-014 regression: `anon` and `authenticated` retain the Supabase platform-default `REFERENCES`/`TRIGGER`/`TRUNCATE` grants on `public` tables. This is project-wide and pre-existing (identical on `public.bookings`), and was not introduced or altered by WPS-014.

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

Observed directly from `npx.cmd supabase migration list` (read-only). Every migration through `202608020001_wps013_disputes_resolution.sql` is present both locally and remotely. Exactly one migration is local-only:

`202608020002_wps014_notifications_engagement.sql`

`npx.cmd supabase db push --linked --dry-run` confirmed the same single pending migration:

```
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 202608020002_wps014_notifications_engagement.sql
```

**No hosted mutation was performed at any point.** No real push was executed, no hosted migration was rolled back, and no remotely applied migration was edited.

All database and client gates now pass, so the automated blockers are cleared and the hosted push is technically safe to retry. The release verdict remains **HOLD** solely because the 60 manual alpha cases are still **NOT RUN**; no physical-device acceptance is claimed. The exact retry command is:

```
npx.cmd supabase db push --linked
```

It was deliberately **not** executed as part of this validation.
