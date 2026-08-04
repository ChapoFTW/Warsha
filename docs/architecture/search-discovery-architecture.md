# Search, Discovery & Appearance — Architecture Audit

| Field | Value |
| --- | --- |
| Performed | 2026-08-04, before any WPS-020 change |
| Method | Read of every route, component, repository, migration, and test that touches search, discovery, preferences, or colour |
| Authority | Below the Warsha Constitution; input to WPS-020 and WES-020 |

This is the factual audit required by WPS-020 Phase 1. It records what the
repository contained **before** WPS-020, so that later claims about what changed
can be checked rather than believed.

---

## 1. What already exists

### 1.1 Discovery data path

There is exactly one marketplace read path and it is not a search API.

```
app/*  →  useMarketplaceData()  →  dataAdapter  →  get_marketplace_catalog()
                                       ↕
                              mock-adapter / supabase-adapter
```

`public.get_marketplace_catalog()` (`202607310001_repository_alignment.sql:547`)
returns **the entire catalog in one JSONB document**: every active category,
every active service, and every publicly discoverable provider with its nested
services. It takes no arguments. It has no filter, no sort, no pagination, and
no query parameter.

Consequences that matter for WPS-020:

- Every filter, every sort, and every text match in the product today happens
  **in JavaScript, over a fully downloaded catalog**.
- The result set is therefore always complete, which is why client-side
  filtering has been correct so far. It stops being correct the moment the
  catalog is larger than one response.
- There is no server-side text search of any kind for providers or services.

### 1.2 Discoverability gate

`private.is_provider_publicly_discoverable(uuid)` is the single authority for
whether a worker may appear anywhere public. Its current definition lives in
`202608010004_wps010_worker_profiles_portfolio.sql:227` and requires: a live,
unbanned, phone-confirmed auth user; `is_verified`, `is_published`,
`onboarding_status = 'approved'`, not soft-deleted; an approved, unexpired
verification; a display name of 2–100 characters; an `about` of 20–500
characters; an avatar that actually exists in storage; at least one active
service in an active category; and at least one service area with a sane radius.

It is used by 30 call sites across nine migrations, including the RLS policies
on `provider_profiles`, `provider_services`, `provider_service_areas`,
`provider_portfolio`, and `provider_certifications`.

**This gate is complete and correct. WPS-020 must call it, never restate it.**

### 1.3 Search route

`app/search.tsx` (99 lines) is the whole search experience:

- One `TextInput` over a client-side `includes()` match on a joined string of
  name, location, about, skills, service names, and translated profession.
- Six "presets" (`recommended`, `topRated`, `availableNow`, `emergency`,
  `mostBooked`, `recentlyViewed`) passed as a route parameter.
- Filters via `components/warsha/ProviderFilters.tsx` and
  `applyProviderFilters`, using `ProviderFilters` from
  `src/data/marketplace-types.ts`: minimum rating, price range, maximum
  distance, available now, verified only.
- Four sorts: `recommended`, `nearest`, `topRated`, `lowestPrice`.
- Recent searches from `useLocalPreferences()`.

### 1.4 Favourites

`public.favourites` (`202607200002_operations.sql:16`) with
`favourites_own_all` RLS (`202607200003_security_storage.sql:45`) and a
`(customer_id, created_at desc)` index. The client path is
`supabaseFavouriteRepository` in Mock/Supabase form, wrapped by
`src/data/local-preferences.tsx`, which already implements optimistic toggle
with rollback, per-account isolation, and an in-flight guard.

**Favourites are complete. WPS-020 must not create a second saved-provider
system.**

### 1.5 Recent searches

Device-local only, in `src/data/local-preferences.tsx`: `expo-sqlite/kv-store`
under `warsha:recent-searches:v1:<account>`, capped at 6, cleared by
`clearRecentSearches()`. Never leaves the device. No server record exists.

### 1.6 Marketplace ranking (WPS-008)

`private.marketplace_candidate_scores`
(`202607310002_marketplace_intelligence_schema.sql:198`) and the scoring body in
`202607310003_marketplace_intelligence_api.sql` implement the authoritative
`best-value-v1` policy with a quality floor, a fairness bound, and a new-worker
bound. It scores **candidates for a specific marketplace request**, inside a
matching run — it is not a browse-time ranking service.

**This is the only ranking authority in Warsha. WPS-020 must not invent a
second one, and must not present a browse-time ordering as if it were this.**

### 1.7 Appearance

There is no appearance system. There is one hardcoded dark palette.

`constants/theme.ts` exports a flat frozen `colors` object of 19 dark values,
imported by **73 files**. Every one of those files evaluates `colors.X` at
**module scope**, inside `StyleSheet.create`, so the value is baked in when the
module is first evaluated and cannot change afterwards.

Dark is also asserted outside JavaScript:

| Surface | Where | Value |
| --- | --- | --- |
| Native launch screen | `app.json` → `expo-splash-screen` | `#080808`, and a `dark` block with the same value |
| iOS/Android window | `app.json` `backgroundColor`, `ios.backgroundColor`, `android.adaptiveIcon.backgroundColor` | `#080808` |
| Forced UI style | `app.json` `userInterfaceStyle` | `"dark"` |
| Web document | `app/+html.tsx` | `<meta name="theme-color" content="#080808">`, `<meta name="color-scheme" content="dark">` |
| Navigation container | `app/_layout.tsx` `navigationTheme` | `dark: true` and six literal dark colours |
| Status bar | `app/_layout.tsx` | `<StatusBar style="light" />` |

`hooks/use-color-scheme.ts` and `hooks/use-color-scheme.web.ts` exist but are
**dead**: they are consumed only by `hooks/use-theme-color.ts`, which is
consumed only by `components/themed-text.tsx` and `components/themed-view.tsx`,
which are Expo starter leftovers no Warsha screen renders. `Colors.light` and
`Colors.dark` in `constants/theme.ts` are identical dark values, so even that
path could never have produced a light interface.

### 1.8 Accessibility primitives already present

`hooks/use-reduced-motion.ts` correctly reads `AccessibilityInfo` and
subscribes to changes. `motion` tokens exist and forbid bounce and overshoot.
`AppText` sets `writingDirection` and per-language font families. RTL is applied
through `isRTL` and `flexDirection: 'row-reverse'` throughout.

---

## 2. What is incomplete

| Area | Gap |
| --- | --- |
| Search | No server-side search of any kind. Text matching is a client `includes()` over a fully downloaded catalog. |
| Search UX | No focused state, no suggestions, no query suggestions, no loading state distinct from empty, no retry, no offline handling, no pagination, no result-count accuracy guarantee. |
| Typo tolerance | None for provider search. WPS-019 built trigram tolerance for help articles only. |
| Filters | Five filters exist; area, verification tier, completed-job threshold, price model, emergency, and language are absent. No active-filter count, no individual chip removal, no URL state. |
| Sorting | `recommended` is a **local heuristic**, not the WPS-008 authority. This is the single most serious pre-existing defect the audit found: the label claims an authority it does not use. |
| Discovery | The home screen has `featuredProviders` (the unsorted catalog order) and a hardcoded `specialOffers` banner pointing at `cleaning`. Neither answers a user question. |
| Recently viewed | A `recentlyViewed` preset exists in `app/search.tsx` and **always returns nothing** — `if (activePreset === 'recentlyViewed') return false`. It is a dead label with a translation string. |
| Favourites UX | No empty-state guidance beyond one line, no signed-out explanation, no handling of a provider that has become non-discoverable. |
| Personalization | None. |
| Location | `provider.distance` is a static number in the catalog projection. There is no device location, no permission flow, no manual area selection. |
| Appearance | Does not exist. |

---

## 3. What is duplicated

Almost nothing, which is the good news.

- **Recent searches** exist only once (device-local).
- **Favourites** exist once, with one repository and one table.
- **Categories and services** exist once, in `get_marketplace_catalog()`.
- **The discoverability gate** exists once.

Two genuine duplications were found:

1. **`src/data/marketplace-context.tsx` and
   `src/marketplace-intelligence/marketplace-context.tsx`** are different
   things with confusingly similar names — the former is the catalog, the
   latter is WPS-008 request matching. Not a functional duplicate; a naming
   hazard. WPS-020 does not rename either, because renaming a WPS-008 module to
   improve readability is exactly the kind of unrequested change this project
   forbids.
2. **`Colors.light` / `Colors.dark`** in `constants/theme.ts` duplicate the dark
   palette under a light name. This is a real hazard: it would silently produce
   a dark interface for anything that trusted it. WPS-020 makes both real.

---

## 4. What is hardcoded for dark mode

| Classification | Count | Detail |
| --- | --- | --- |
| Palette definition (allowed) | 19 | `constants/theme.ts` `colors` — the only legitimate home for literal values |
| Semantic token candidates | 934 | `colors.X` references across 73 files; all resolve at module scope today |
| Intentional platform values | 6 | `app.json` splash/window/adaptive-icon colours and the web `theme-color`/`color-scheme` meta tags |
| Defects | 14 | 12 inline `rgba(...)` literals in product components and 2 stray hex values |

The 14 defects, itemized:

| File | Literal | Classification |
| --- | --- | --- |
| `app/booking/[id].tsx:55` | `rgba(217,121,121,.5)` | danger border — token candidate |
| `components/warsha/BookingDisputePanel.tsx:102` | `rgba(217,121,121,.55)` | danger border — token candidate |
| `components/warsha/JobOperationsPanel.tsx:106` | `rgba(217,121,121,.6)` | danger border — token candidate |
| `components/warsha/BrandUI.tsx:245-247` | three status border rgba | token candidates |
| `app/conversation/[bookingId].tsx:544,547` | `rgba(0,0,0,.96)`, `rgba(0,0,0,.72)` | scrim — token candidates |
| `app/provider/[id].tsx:266,274,407` | three `rgba(8,8,8,...)` | scrim/overlay — token candidates |
| `components/warsha/OfferBanner.tsx:3` | `rgba(8,8,8,.72)` | scrim — token candidate |
| `components/themed-text.tsx:58` | `#0a7ea4` | dead Expo starter code |
| `app/+html.tsx:11` | `#080808` | intentional platform value, but must become theme-aware |

Three near-identical danger reds (`.5`, `.55`, `.6` alpha) is the signature of a
missing token: the same intent expressed three times, slightly differently, by
three authors.

---

## 5. What must become semantic

All 934 `colors.X` references, plus the 12 inline `rgba` literals.

The existing 19 names are a mix of semantic (`textPrimary`, `border`,
`success`) and literal (`white`, `background`, `surface`). `colors.white` is
used **184 times** and is the single worst offender: it means "the primary
action colour" in a dark theme, and in a light theme the primary action must be
near-black. Every `colors.white` is therefore a token that is *lying about its
role*, and mechanically inverting it would produce white-on-white buttons.

The refactor must be role-driven, not value-driven.

---

## 6. What can remain unchanged

- `private.is_provider_publicly_discoverable` — complete; call it, never restate it.
- `public.favourites`, its RLS, and its index.
- `get_marketplace_catalog()` — it stays as the catalog read; search is added beside it, not in place of it.
- The WPS-008 scoring tables, policy, and matching run.
- `spacing`, `radii`, `typography`, `motion`, `fontFamilies` — none carries colour.
- `hooks/use-reduced-motion.ts`.
- Every WPS-001..019 table, RPC, policy, grant, and test.
- `src/i18n/translations.ts` — including the approved motto.
- The logo geometry in `components/warsha/BrandMark.tsx`. Its `variant` prop is
  already `'light' | 'dark'` ink, so it needs a correct default, not a redesign.

---

## 7. What requires database persistence

| Item | Why |
| --- | --- |
| Appearance preference | Only so it can follow an account across devices. It is **not** required for the feature to work. |
| Recent searches | Owner isolation, bounded history, and a clear action that survives reinstall. |
| Recently viewed | Same, plus it must never be readable by anyone else. |
| Search itself | Correctness. A client cannot be trusted to apply a discoverability gate, and a filter the client applies over an incomplete result set is wrong by construction. |
| Filter metadata | So the client can only offer filters the server can actually answer. |
| Suggestions | So "common services" is derived from the real catalog rather than invented. |

## 8. What should remain device-local

| Item | Why |
| --- | --- |
| The **startup** appearance value | It must be readable synchronously, before any network call and before authentication, or the first frame is wrong. |
| Signed-out appearance | There is no account to attach it to. |
| Mock-mode everything | Mock must never reach Supabase. |
| Reduced Motion, text scaling, screen-reader state | Owned by the operating system. Warsha reads them and never stores them. |

---

## 9. Governing findings

1. **The catalog is not a search engine.** Everything called "search" today is a
   client-side substring match over a full download. It has been correct only
   because the dataset is small, and it will fail silently — with wrong results,
   not an error — as soon as it is not.

2. **"Recommended" does not use the recommendation authority.** `app/search.tsx`
   sorts by a local heuristic and labels it `recommended`, while the real
   `best-value-v1` policy sits in WPS-008 scoring an entirely different flow.
   This is the most serious defect in the audit, because it is invisible: the
   label is plausible and the output is *reasonable*, so nobody would look.

3. **Dark is not a theme, it is an assumption.** It is asserted in seven places
   across four languages (TypeScript, JSON, HTML meta, and native config), and
   934 references resolve it at module-evaluation time. Adding a light theme is
   therefore not a palette change; it is a change to *when* colour is decided.

4. **`recentlyViewed` is a label with no feature behind it.** It has a
   translation, a preset, a route parameter, and a code path that returns the
   empty set unconditionally.

5. **Nothing needs to be torn down.** The gate, the ledger of favourites, the
   ranking authority, and the catalog are all sound. WPS-020 is an extension in
   every part, and the audit found no case where replacing existing work would
   be justified.
