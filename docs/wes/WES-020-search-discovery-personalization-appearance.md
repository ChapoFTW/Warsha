# WES-020 — Search, Discovery, Personalization & Appearance (Engineering Baseline)

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **ENGINEERING BASELINE — MANUAL AND HOSTED DEPLOYMENT GATED** |
| Implements | WPS-020 |
| Authority | Constitution → WPS-008 → WPS-010 → WPS-011 → WPS-020 → WES-020 |
| Migration | `supabase/migrations/202608050001_wps020_search_discovery_personalization_appearance.sql` |

Existing marketplace and ranking authorities remain authoritative. This document
records *how* WPS-020 was built and, more importantly, what was refused.

---

## 1. Extension strategy

| Existing thing | What WPS-020 did |
| --- | --- |
| `private.is_provider_publicly_discoverable` | Called from every read path. Never restated, never redefined. |
| `public.get_marketplace_catalog()` | Untouched. Search was added beside it. |
| `public.favourites` | Reused as-is by the discovery home. No second store. |
| WPS-008 `ranking_policy` | Read at call time for the fairness and new-worker bounds. |
| WPS-018 rate limiter | Four new policies inserted. No second limiter. |
| WPS-018 `record_operational_event` | The only analytics sink. No second pipeline. |
| `provider_profiles` | One additive generated column and four indexes. No column changed. |
| `constants/theme.ts` | Kept its exports. `colors` became the dark palette. |

Nothing was dropped. All 22 pre-existing pgTAP suites pass with **no assertion
edited** — the strongest available evidence that this was an extension.

## 2. The appearance refactor

### 2.1 The problem

`StyleSheet.create` is evaluated at module scope. `backgroundColor: colors.background`
is resolved once, when the module is first loaded, and no amount of re-rendering
can change it afterwards. A `Proxy`, a mutable module object, or a context
holding the palette all fail for the same reason: the value was already read.

Three approaches were considered:

| Approach | Rejected because |
| --- | --- |
| Remount the tree on a theme change (`key={scheme}`) | WPS-020 forbids it, and it would discard navigation state, scroll position, and in-flight work |
| CSS variables | Web only; React Native has no equivalent |
| Style factories called with the active palette | **Chosen** |

### 2.2 The transform

Each module-scope stylesheet became a factory whose parameter is *also named*
`colors`:

```ts
const makeStyles = (colors: ThemeColors) => StyleSheet.create({ /* unchanged */ });
```

The parameter shadows what used to be the import, so every one of the ~900
references inside the stylesheet body stayed **byte-identical**. Components then
call `useThemedStyles(makeStyles)` for stylesheets and `useThemeColors()` for
inline props — and again the local binding is named `colors`, so JSX bodies were
untouched too.

A one-shot codemod applied this across 72 files. It reported the four cases it
could not handle safely rather than guessing, and each was fixed by hand:

| File | Why the codemod could not do it |
| --- | --- |
| `BrandMark.tsx` | A module-scope helper (`brandInk`) used the palette; hooks cannot be called there. It takes the palette as a parameter now. |
| `ProviderModeOverlay.tsx` | The stylesheet was declared mid-line after a component |
| `categories/[id].tsx`, `ProviderFilters.tsx` | Components declared mid-line, so the "start of a function" pattern did not match |

### 2.3 The proof it was complete

The codemod's own report is not evidence. Two things are:

1. **The static `colors` import was deleted from all 72 files.** Any component
   the codemod missed then failed to compile. That converts a silent visual
   defect into a build error — which is the whole point, because a hardcoded
   colour looks perfectly correct in the theme it was written for.
2. **`scripts/audit-appearance.mjs` runs on every build** and fails if any
   product file imports the static palette or contains a colour literal.

### 2.4 Provider placement

`AppearanceProvider` sits **above** `AuthProvider`, because the theme must be
correct on the first frame and the configuration-error screen renders outside
authentication entirely. A provider cannot read a context provided below it, so
the account link is *pushed up* by `AppearanceAccountSync`, a component that
renders nothing and lives inside `AuthProvider`.

### 2.5 Synchronous local read

`expo-sqlite/kv-store` exposes `getItemSync`. Its web build is WASM-backed and
does not, so `appearance-storage.web.ts` uses `localStorage` — following the
existing `hooks/use-color-scheme.web.ts` split rather than inventing a pattern.

Static web export runs in Node, where `window` does not exist; that path reports
"no stored preference", which is correct, and the inline `<head>` script paints
the right background before hydration regardless.

## 3. Search implementation

### 3.1 The generated document

```sql
setweight(to_tsvector('simple', display_name), 'A')
|| setweight(to_tsvector('simple', profession_key), 'B')
|| setweight(to_tsvector('simple', about || ' ' || location_label), 'C')
```

`simple` for both locales, for the reason WPS-019 recorded: Postgres ships no
Arabic stemmer, and stemming only English would make relevance asymmetric.

**Skills and specialties are deliberately not in the document.** `array_to_string`
is `STABLE`, not `IMMUTABLE`, and a generated column permits neither that nor a
subquery. Wrapping it in a function marked `immutable` would have worked and
would have been a lie the planner is entitled to believe. They are matched
through their own GIN indexes instead. This is a real constraint honoured.

### 3.2 Why a temporary table, not a CTE

The filter, the conditional approximate pass, the distance filter, and the
scoring update are four sequential phases where each depends on the previous
result *set*. A CTE chain can express it but re-derives the base scan for the
count and the page. The working set is per-transaction and `on commit drop`, and
the creation is guarded by `to_regclass` so a long transaction — a test run,
a batched call — does not raise a notice on every search.

`search_providers` is `VOLATILE` because it enforces a rate limit, which writes.
Marking it `STABLE` would have failed at runtime the first time an authenticated
caller used it, and only for authenticated callers, which is the kind of defect
that reaches production.

### 3.3 What was refused

**Response-time sorting.** The specification lists it. `provider_profiles` has
`response_time_label text` and no numeric column. Shipping the control would have
meant sorting by nothing while appearing to work. It is absent from the sort
enum, absent from the filter metadata, and asserted absent in pgTAP.

**Device location.** The specification describes a permission flow. `expo-location`
is not a dependency; adding a native module and a permission prompt that cannot
be tested without a device, in a project with zero device testing, was judged
worse than not shipping it. The server accepts and tests coordinates; the client
does not ask for them. Distance sorting is therefore unavailable in the app and
`availableSorts()` hides it.

Both are recorded in WPS-020 §17 rather than quietly omitted.

## 4. Browse-time recommendation

`private.discovery_recommended_score` reproduces the WPS-008 `best-value-v1`
weights literally (0.45 / 0.20 / 0.27) and reads `fairnessBound` and
`newWorkerBound` from `private.marketplace_configuration` at call time rather
than copying them. It is an application of a published policy, not a new formula.

Two deviations, both stated in the function's own comment:

- No request means no capacity, ETA, or emergency term.
- With no location, the distance term is **absent and the weights are not
  renormalized**. Renormalizing would let an unlocated browse quietly redistribute
  0.27 of score across rating and experience, changing the ordering of a policy
  nobody authorized changing.

It writes no `marketplace_candidate_scores` row and starts no matching run.
pgTAP asserts the table is still empty after browsing.

## 5. Privacy boundaries in SQL

`private.discovery_provider_card` is the single place a worker becomes a search
result. It is `private`, clients cannot invoke it, and it returns no coordinate,
no contact, no document, no certificate file, and no auth identifier. pgTAP
asserts the absence of each key by name rather than eyeballing the projection.

Distance is `round()`ed inside the database before it is serialized. A rounded
scalar cannot be trilaterated back to a home address; an unrounded one can.

`record_search_query` logs `queryLength` and never `query`. The WPS-018 redaction
allowlist would not have caught this — `query` is not a forbidden key name — so it
is a deliberate choice at the call site, and pgTAP asserts no search text reaches
the log.

## 6. Client architecture

| Module | Role |
| --- | --- |
| `discovery-types.ts` | Import-free contracts and pure rules; executable directly by Node |
| `mock-discovery-state.ts` | Mock over the **shared** mock catalog, per-account |
| `discovery-repository.ts` | Nine methods, nine explicit Mock branches |
| `discovery-context.tsx` | Account-isolated state with a generation guard |
| `discovery-copy.ts` | Import-free bilingual tables |

The generation guard is the WPS-019 pattern: a response that arrives after the
account changed is discarded, and nothing renders for an account other than the
loaded one. That is what makes "sign out of A, sign in as B" incapable of showing
A's history for even one frame.

## 7. Mock parity, stated precisely

Mock reads the same catalog every other Mock surface reads. A second dataset
would give Mock its own reality and stop testing anything.

| Parity | Status |
| --- | --- |
| Search outcomes (`browse`/`exact`/`approximate`/`empty`) | Identical |
| Filters, sorts, pagination, `hasMore` | Identical |
| Recent searches: normalization, 10-item bound, per-account | Identical |
| Recently viewed: idempotent, 20-item bound, per-account | Identical |
| Unknown/hidden worker never entering history | Identical |
| Ranking policy version reported | Identical (`best-value-v1`) |
| Distance present only with a location | Identical |
| Recommendation **algorithm** | Same shape and weights; Mock uses the published defaults because it cannot read `marketplace_configuration`, and says so in the file |
| Text matching **algorithm** | Not identical. Mock is token containment plus trigram; the server is `tsvector` plus `word_similarity`. The *outcomes* match. |

Mock imports no Supabase module, constructs no client, and performs no network
call — all asserted, by three separate checks rather than one loose grep.

## 8. Open engineering items

| Item | State | Why |
| --- | --- | --- |
| Device location and distance sorting | Server built and tested; client absent | No `expo-location`; a permission flow cannot be validated without a device |
| Response-time sorting | Not offered | No numeric source column exists |
| Light native launch screen | Not built | Only a light-ink splash asset exists; producing a dark-ink one is the brand system's authority |
| Per-scheme PWA manifest | Not possible | A web manifest holds one `theme_color` |
| Keyboard appearance | Not wired | Needs a prop on every input; low value before device testing |
| Saved searches / alerts | Not built | Not requested |
| Search relevance tuning | Not started | No real queries exist to tune against |
| Measured on-device contrast | Not done | Computed from the palette only |
