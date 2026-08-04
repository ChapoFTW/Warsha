# WPS-020 Acceptance Evidence — Search, Discovery, Personalization & Appearance

| Field | Value |
| --- | --- |
| Specification | WPS-020 v1.0 |
| Engineering baseline | WES-020 v1.0 |
| Architecture audit | `docs/architecture/search-discovery-architecture.md` |
| Migration | `supabase/migrations/202608050001_wps020_search_discovery_personalization_appearance.sql` (local only) |
| Manual acceptance | **NOT RUN** — 102 cases, 0 executed |
| Hosted deployment | **Not applied** |
| Local implementation | **Accepted** |

Every result below was executed from the final repository state on 2026-08-05.
Nothing is carried over from an earlier run, and nothing here is inferred.

## Executed gates

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | Pass |
| ESLint | `npm run lint` | Pass, 0 errors, 0 warnings |
| Mojibake | `npm run check:mojibake` | `No likely mojibake found.` |
| Whitespace | `git diff --check` | Clean |
| Secret scan | `npm run audit:secrets` | Clean — 465 tracked files, 40 commits |
| Migration audit | `npm run audit:migrations` | Clean — 35 migrations, forward-only verified |
| Environment audit | `npm run audit:environment` | Clean — 5 variables, 24 routes, 6 assets, 0 notes |
| **Appearance audit** | `npm run audit:appearance` | Clean — 202 files, **73 semantic roles in both themes**, no colour literal outside the theme |
| Bundle audit | `node scripts/audit-bundle.mjs dist/web dist/android dist/ios` | Clean — 55 artefacts across 3 exports |
| Clean database reset | `supabase db reset` | Full chain through `202608050001` applied without error |
| Full pgTAP | `supabase test db` | **23 files / 2,170 assertions, `Result: PASS`** |
| WPS-020 pgTAP | single-file run | **138 assertions pass** |
| WPS-020 client suite | `npm run test:wps020` | **872 checks pass** |
| All regression suites | 21 suites, exit-code checked | **20 pass, 1 pre-existing failure** (see below) |
| Expo Doctor | `npx expo-doctor` | **18/18** |
| Android export | `--platform android --clear` | Exported |
| iOS export | `--platform ios --clear` | Exported |
| Web export | `--platform web --clear` | Exported; `appearance.html`, `recently-viewed.html`, `search.html` all present |
| No-flash script in the export | grep of `dist/web/index.html` | Present, including the `prefers-color-scheme` fallback |
| Migration ledger | `supabase migration list --linked` | Through `202608020005` local **and** remote; `202608030001`, `202608040001`, `202608050001` local only |
| Non-mutating dry run | `supabase db push --linked --dry-run` | Three pending migrations; **no hosted mutation** |
| Hosted push | — | **Not executed** |

Totals before WPS-020: 22 pgTAP files / 2,032 assertions, 20 regression suites.
WPS-020 adds a 138-assertion pgTAP suite and an 872-check client suite.

## Pre-existing failure, not caused by WPS-020

**`npm run test:wps018` fails**, on this assertion:

```
notMatch(appJson, /"updates"/, 'over-the-air updates are not enabled');
```

`app.json` in the working tree contains an `"updates"` block pointing at an Expo
update URL, plus an `ios.infoPlist` block. Neither is in `HEAD`:

```
$ git show HEAD:app.json | grep -c updates   →  0
$ git show HEAD:app.json | grep -c infoPlist →  0
```

Both were uncommitted working-tree changes present **before this session began**
— the session's opening `git status` already showed `app.json` as modified. The
WPS-018 suite reads only five properties from `app.json`, and `userInterfaceStyle`
— the single line WPS-020 changed — is not one of them.

It was left alone in both directions. The assertion is correct and is doing
exactly its job: WPS-018 recorded "over-the-air updates are not enabled" as a
launch-readiness property, and something enabled them. Reverting the file would
discard someone else's work; weakening the assertion would erase a real signal
about launch posture. It needs a decision from whoever ran `eas update:configure`,
not a quiet fix here.

## Existing architecture preserved

| Preserved | Evidence |
| --- | --- |
| `private.is_provider_publicly_discoverable` | Called from 8+ WPS-020 paths; asserted never redefined |
| `public.get_marketplace_catalog()` | Asserted present and asserted not rewritten |
| `public.favourites` | Reused; asserted exactly one favourites table exists |
| WPS-008 ranking policy and score store | Asserted present, unreadable to clients, and **empty after browsing** |
| WPS-018 rate limiter | Four policies added; asserted all four name the same limiter |
| WPS-018 observability | The only analytics sink; asserted no second pipeline exists |
| `provider_profiles` | One additive generated column; no column altered |
| Dark theme values | Each asserted literally in `scripts/brand-system.test.mts` and the WPS-020 suite |
| Logo geometry | SVG path asserted byte-for-byte |
| Approved motto | `src/i18n/translations.ts` has **no diff** |

**All 22 pre-existing pgTAP suites pass with no assertion edited.**

## Security verified

| Property | Evidence |
| --- | --- |
| Hidden workers unreachable | A draft worker and an unverified worker are absent from every browse, search, filter, and history path |
| Filters cannot widen the gate | Asserted that no combination of permissive filters reveals a hidden worker |
| Cross-account denial | Read, suggestion, and history all refused; RLS hides rows entirely; direct inserts for another account raise 42501 |
| Anonymous denial | History reads, search recording, view recording, and preference writes all refused **at the grant** |
| Anonymous browsing allowed | Asserted working, and asserted still unable to reach a hidden worker |
| Bounded history | 15 searches leave 10 rows; the bound is a database trigger, not client code |
| No coordinate leakage | Asserted that no result carries `latitude`, `longitude`, `phone`, `email`, `userId`, `documentPath`, or `storagePath` |
| Distance cannot be trilaterated | Asserted every returned distance is a whole kilometre |
| Ranking non-interference | `marketplace_candidate_scores` asserted empty after browsing |
| No search text in analytics | Asserted the log contains the event but not the query |
| Preference fidelity | `system` asserted stored as `system`; `auto` and `null` refused |
| Search path | Every WPS-020 `SECURITY DEFINER` function pins an empty `search_path`; asserted |
| RLS coverage | Every public table in the schema still has RLS; asserted globally |
| Realtime | No WPS-020 table is broadcast |

## Nothing was enabled

Asserted negatively: the marketplace stays disabled, every feature flag stays
off, no WPS-020 table is broadcast over Realtime, and no external search,
personalization, or analytics provider is selected anywhere.

## Localization verified

- 97 vocabulary keys, identical key sets in English and Egyptian Arabic.
- Every Arabic value asserted to contain Arabic script; every English value
  asserted to contain none.
- The three appearance labels asserted **exactly**: System / Light / Dark and
  حسب الجهاز / فاتح / داكن.
- Every WPS-020 surface asserted to handle RTL; the logo asserted never mirrored.
- The approved motto is untouched and the WPS-020 vocabulary asserted not to
  restate it.

## Mock parity

Nine repository methods, nine explicit Mock branches, verified programmatically.
Mock imports no Supabase module, constructs no client, and performs no network
call — three separate assertions rather than one loose grep.

Parity is stated precisely rather than overclaimed. Mock reads the **same** mock
catalog every other Mock surface reads, and matches the server on: all four
search outcomes, filters, sorts, pagination and `hasMore`, recent-search
normalization and its 10-item bound, recently-viewed idempotence and its 20-item
bound, per-account isolation, refusal to record an unknown worker, the reported
ranking policy version, and distance appearing only with a location.

Two differences, both stated in the file itself: Mock cannot read
`private.marketplace_configuration`, so it uses the policy's published default
bounds; and its text matching is token containment plus trigram rather than
`tsvector` plus `word_similarity`. The **outcomes** match; the algorithms do not
pretend to.

## Accessibility

Contrast ratios were **computed from the palette**, not sampled from a screen.
Full table and findings: `docs/testing/WPS-020-ACCESSIBILITY-REVIEW.md`.

Headline: the light theme meets AA on every text pair. The dark theme has three
greys at 3.61:1 — all resolving to the locked `#6E6E6E` — which were **not**
changed, because altering a locked brand value is the brand system's decision,
not a search-and-theme change's. Recorded as an open item with a proposed value.

## Deliberate changes to earlier work

| Change | Why |
| --- | --- |
| `app.json` `userInterfaceStyle`: `dark` → `automatic` | Mandatory. Pinned to `dark`, iOS reports dark regardless of the device setting and "System" cannot function. |
| `Colors.light` now holds light values | It held dark values under a light name — a latent trap, not a working feature |
| `components/warsha/OfferBanner.tsx` deleted | Advertised a 20% discount nothing honours, pointed at a hardcoded category, answered no question |
| `components/themed-text.tsx` link colour → theme tint | The last colour literal outside the palette |
| `scripts/brand-system.test.mts` palette assertions redirected | The locked values moved file; the check follows them and now also proves a light theme exists and dark was not redesigned |
| `scripts/brand-system.test.mts` brand-ink assertion updated | The ink is now theme-derived from the surface; the new assertion is stricter, checking both themes' `brandMark` |

None weakened a check. The brand-suite changes strengthened two.

## Known residue

Six translation keys in `src/i18n/translations.ts` are now unused:
`specialOffers`, `offerTitle`, `offerBody`, `claimOffer`, `featuredProviders`,
and `recentlyViewedProviders`. They belonged to the removed offer banner and the
replaced home shelves.

They were deliberately **not** removed. `src/i18n/translations.ts` holds the
approved motto, and "no diff on the motto file" is a claim worth more than six
dead strings. Recorded here rather than left for someone to discover.

## What is not claimed

- **No manual acceptance.** All 102 WPS-020 cases are NOT RUN, joining a backlog
  that has never been executed.
- **No device testing.** No screenshot of the light theme exists on any device.
- **No measured contrast** on a real display at any brightness.
- **No screen-reader verification.** Announcements are asserted from source
  properties, which is not the same as hearing them.
- **No device location.** `expo-location` is not a dependency. The server side
  is built and tested; the client does not ask, so distance sorting is
  unavailable in the app.
- **The native launch screen stays dark in both appearances.** Only a light-ink
  splash asset exists.
- **The PWA manifest keeps one theme colour.** A web manifest has no per-scheme form.
- **No search relevance measurement.** There are no real queries.
- **No hosted migration applied and no deployment performed.**

## Deployment verdict

| Environment | Verdict |
| --- | --- |
| Local | **Accepted.** Every gate passes except the pre-existing WPS-018 `app.json` failure, which WPS-020 did not cause and did not touch. |
| Staging | **Accepted once a staging project exists.** It does not (WPS-018 gap G20). |
| Production | **Blocked**, and not by this code — by the WPS-018 launch blockers, which WPS-020 does not change and does not reduce. |

WPS-020 is safe to commit. It is not safe to launch, and nothing here moves the
launch verdict.
