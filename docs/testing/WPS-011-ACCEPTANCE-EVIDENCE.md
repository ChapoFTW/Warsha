# WPS-011 Acceptance Evidence

## Scope and verdict

WPS-011 is implemented and validated locally by extending the existing review, booking, trust, provider-profile, marketplace, notification, Realtime, private-storage, and Mock paths. Manual acceptance and a fresh linked migration comparison remain pending. No hosted migration, deployment, payment, SMS, push delivery, webhook, scheduler, or irreversible production action was executed.

## Automated evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck` |
| ESLint | PASS | `npm.cmd run lint`, zero warnings/errors |
| Mojibake scan | PASS | `npm.cmd run check:mojibake` |
| Patch whitespace | PASS | `git diff --check`; line-ending notices only |
| WPS-011 custom suite | PASS | 100 contracts across database, client, Mock, localization, accessibility, privacy, and motto |
| Existing custom regressions | PASS | 12/12 commands: payments, WPS-008, device P1, brand, provider-card media, worker auth, profile phone, WPS-009, WPS-010, WPS-011, marketplace, and WPS-007 safe smoke help |
| Clean local database reset | PASS | All forward migrations through `202608010005` plus seed |
| pgTAP | PASS | 14 files / 922 assertions; dedicated WPS-011 file has 80 assertions |
| Expo Doctor | PASS | 18/18 with the Windows system CA |
| Android export | PASS | Separate cache-cleared export to `.expo/wps011-android` |
| iOS export | PASS | Separate cache-cleared export to `.expo/wps011-ios` |
| Web export | PASS | Separate cache-cleared export to `.expo/wps011-web`; 30 static routes |
| Local migration ledger | PASS | Complete through `202608010005` |
| Linked migration ledger | BLOCKED | Fresh attempt failed before comparison: `LegacyDbConfigLoginRoleNetworkError` / `TransportError` |
| Hosted push dry-run | BLOCKED, NON-MUTATING | CLI printed `DRY RUN: migrations will not be pushed`, then failed at login-role initialization with the same transport error |
| Manual alpha | NOT RUN | 60/60 cases remain NOT RUN |

## Security evidence

The dedicated database suite and client contracts verify:

- completed-booking customer eligibility and one review per booking;
- server-derived actor/booking/provider ownership for create, edit, reply, vote, report, moderation, and attachment registration;
- a bounded configurable edit deadline with private immutable edit history;
- one immutable provider reply;
- reporter/staff-only reports and staff-attributed immutable workflow/moderation events;
- public soft-hide of review, reply, photos, helpful totals, and rating contribution without record deletion;
- one current vote per account/review, duplicate prevention, author/provider denial, and private voter identity;
- column-level grants that expose scores but not moderation metadata;
- security-definer functions with empty `search_path`, minimal execution grants, and guarded private helpers;
- no public reviewer contact/account ID, report, moderation reason, staff identity, voter, raw object path, internal matching score, or financial field;
- no new private review/report/audit path in general Realtime publication.

## Storage evidence

The existing private `review-attachments` bucket remains authoritative. The migration and repository enforce JPEG/PNG/WebP only, 5 MB per file, four images per review, immutable UUID-like filenames beneath authenticated customer/booking scope, server-observed MIME/size/owner validation, duplicate-content hashing, and signed URL hydration only. An anonymous/object read is authorized only through the sanitized visible-review predicate; no bucket or raw path is public. Failed registration/replacement performs best-effort cleanup and Supabase failures never fall back to Mock writes.

## Public/private data matrix

| Data | Review customer | Reviewed provider | Authorized staff | Public/other account |
| --- | --- | --- | --- | --- |
| Visible review and six scores | Read; edit until deadline | Read | Read | Sanitized projection |
| Hidden review | Participant read | Participant read | Read | Denied |
| Reviewer identity/contact | Own account context | Sanitized reviewer label only | Existing authorized operational access | Sanitized label; no contact/account ID |
| Edit deadline/revision | Read own review state | No mutation | Read as authorized | Deadline/revision omitted from public list |
| Edit audit | Denied direct client access | Denied | Read | Denied |
| Reply | Read | Create once; immutable | Read/moderate with review | Visible only while review visible |
| Photo metadata/raw path | Owner repository scope | No raw path | Authorized operational read | Signed rendition only while visible |
| Helpful vote row | Own vote only | Cannot vote on own reviewed work | Operationally restricted | Aggregate totals only |
| Report/details/reporter | Own report/status | Denied unless reporter | Read/transition | Denied |
| Report/moderation audit | Denied | Denied | Read/append via guarded RPC | Denied |
| Reputation metrics/badges/confidence | Sanitized summary | Same public summary | Same plus separately authorized operations | Sanitized summary for discoverable provider only |

## Product and Mock evidence

The UI and repositories cover six required scores, optional photos, bounded edits, immutable reply messaging, four report reasons, four sort orders, Helpful/Not Helpful voting, rating/dimension breakdowns, completed-job and behavioral rates, repeat-customer percentage, full years on platform, six approved trust badges, and versioned `wps011-v1` confidence. Helpful/report/confidence values do not write to or reorder WPS-008 matching. No AI summary exists.

Mock implements the same eligibility, uniqueness, deadline, score bounds, photos, vote uniqueness/update, report uniqueness, sorting, moderation visibility, reputation formulas, and account isolation in its own statically selected repository. Supabase mode has no fixture injection or fallback read/write.

## Localization and accessibility evidence

English and Egyptian Arabic copy covers review dimensions, scores, deadline, edit, photo, reply immutability, sorts, helpful states, reporting reasons/status, reputation metrics, badges, loading, empty, error, and retry states. Components use the current locale direction, wrap compact metrics/actions, expose labelled score/vote/report/photo/sort controls and state, and avoid public contact data. Automated contracts passed; physical screen-reader, RTL, and 320-pixel device acceptance remain manual NOT RUN.

## Motto audit

The official active motto is exactly English `YOUR WORK, OUR MISSION` and Arabic `شغلك مهمتنا`.

| Requested location | Exact locations checked | Result/correction |
| --- | --- | --- |
| Splash | `app.json`; `scripts/render-brand-assets.ps1`; `assets/images/warsha-brand-splash.png`; `assets/images/warsha-current-approved-splash.png` | Config and renderer are exact. The stale brand splash was replaced; both approved and configured splash files now have SHA-256 `77F74D28EE5E8B240A046564D9FACCE58571276BCC116D139E7AEB5D7C02A5DA`. |
| Onboarding | Full `app/` route inventory; worker onboarding/profile state in `app/provider-mode.tsx`, `src/providers`, and `src/i18n/worker-profile-translations.ts` | No standalone motto variant; shared brand localization is authoritative. |
| Authentication | `app/(tabs)/profile.tsx`; `app/reset-password.tsx`; `src/auth/*`; `components/warsha/ConfigurationError.tsx`; `components/warsha/BrandLogo.tsx` | No independent/outdated motto. Shared brand UI/localization remains exact. |
| Home | `app/(tabs)/index.tsx`; `app/(tabs)/_layout.tsx`; `components/warsha/BrandLogo.tsx`; `components/warsha/BrandMark.tsx`; `components/warsha/BrandUI.tsx` | No independent/outdated motto. |
| Profile | `app/(tabs)/profile.tsx`; `app/provider/[id].tsx`; provider-profile/review components under `components/warsha`; worker-profile translations | No independent/outdated motto. |
| Settings | Profile/settings sections in `app/(tabs)/profile.tsx` and full route inventory (there is no separate settings route) | No independent/outdated motto. |
| Notifications | `app/notifications.tsx`; `components/warsha/NotificationBanner.tsx`; `src/notifications/*` | No independent/outdated motto or private moderation payload copy. |
| HTML | `app/+html.tsx` | Description and Open Graph description are exactly the approved English motto. |
| Web manifest | `public/manifest.webmanifest` | Description is exactly the approved English motto. |
| App config | `app.json` | Uses approved icon/adaptive/monochrome/favicon/notification/splash assets; configured splash corrected. |
| Shared localization | `src/i18n/translations.ts` | Exact English and Arabic motto strings. |
| Docs | Constitution, `docs/brand/*`, `docs/decisions/brand-decisions.md`, all `docs/audits/*`, WPS/WES 009–011, WPS index, and all testing docs found by repository scan | Three stale manual/evidence/audit documents were corrected. Constitution and the 20-page brand-design PDF retain only explicitly labelled mission prose, not an active motto. |
| Tests/scripts | `scripts/brand-system.test.mts`, `scripts/device-p1-regressions.test.mts`, `scripts/wps009-communication.test.mts`, `scripts/wps011-reviews-reputation.test.mts`, `scripts/render-brand-assets.ps1` | Exact motto assertions pass; forbidden historical variants appear only as negative test patterns. |
| Assets | All 17 `assets/images/warsha-*` files plus `docs/brand/Warsha marketplace logo design.pdf` | Brand regression checked eight configured/current assets. Configured splash visually/textually audited and corrected; remaining raster icons contain no motto. PDF text extraction covered all 20 pages and found only labelled mission prose on pages 1 and 10. |

## Pending hosted ledger

The fresh linked ledger could not be obtained. Relative to the last successfully recorded linked endpoint (`202607290002`), the exact local candidate pending sequence is:

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

This is an exact comparison to the last verified ledger, not a claim that the fresh remote comparison succeeded.

## Release gate

Local engineering verdict: **PASS**. Hosted deployment verdict: **HOLD** until linked connectivity is restored, the remote ledger/dry-run is freshly reviewed, the full pending chain receives operational approval, and manual alpha is executed. The documented deployment command is `npx.cmd supabase db push --linked`; it was **not executed**.
