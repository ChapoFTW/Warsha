# WPS-020 — Search, Discovery, Personalization & Appearance

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **LOCKED — IMPLEMENTED LOCALLY, MANUAL ACCEPTANCE PENDING** |
| Authority | Warsha Constitution. Depends on WPS-001 through WPS-019. Subordinate to WPS-008 for ranking, WPS-010 for worker profiles, WPS-011 for reputation, WPS-017/018 for analytics. |
| Migration | `supabase/migrations/202608050001_wps020_search_discovery_personalization_appearance.sql` (local only) |
| Architecture audit | `docs/architecture/search-discovery-architecture.md` |
| Engineering baseline | `docs/wes/WES-020-search-discovery-personalization-appearance.md` |
| Appearance system | `docs/brand/WARSHA-APPEARANCE-SYSTEM.md` |
| Storage decision | `docs/decisions/appearance-preference-storage.md` |
| Manual acceptance | **NOT RUN** — 102 cases, 0 executed |

---

## 1. Purpose

Two things were true before WPS-020, and both were invisible.

**Warsha had no search.** It had a substring match, running in JavaScript, over
a complete download of every provider in the catalog. That has been correct only
because the dataset is small. The moment it is not, the interface returns wrong
results and reports them as right.

**Warsha had no appearance system.** It had one hardcoded dark palette, resolved
at module-evaluation time in 73 files and asserted separately in `app.json`, in
the HTML shell, in the navigation container, and in the status bar. `Colors.light`
existed and contained dark values, so anything that trusted it rendered dark and
looked correct.

WPS-020 fixes both by changing *where the decision is made*: search moves to the
server, and colour moves from module-evaluation time to render time.

## 2. What WPS-020 does not do

- It does not replace the marketplace engine. WPS-008 `best-value-v1` remains the
  only ranking authority, and browse-time recommendation is an application of it.
- It does not replace the catalog. `get_marketplace_catalog()` is untouched.
- It does not create a second saved-provider store. `public.favourites` is the
  only one, and pgTAP asserts there is exactly one.
- It does not create a second analytics pipeline. Events go to WPS-018
  `record_operational_event`.
- It does not create a second rate limiter, a second notification system, or a
  second staff surface. WPS-020 has no staff surface at all.
- It does not redesign the dark theme. Every dark value is asserted literally.
- It contains **no AI**. Search is Postgres full-text with a bounded trigram
  fallback. Recommendation is a published formula over declared data.
- It contains **no advertising and no paid placement**. Nothing in the schema
  can express a bid, a sponsorship, or a promoted slot.

---

# PART A — APPEARANCE

## 3. The three preferences

| Preference | English | Arabic | Behaviour |
| --- | --- | --- | --- |
| System | System | حسب الجهاز | Follows the device or browser, live |
| Light | Light | فاتح | Always light |
| Dark | Dark | داكن | Always dark |

`system` is stored as `system`. Storing the currently resolved scheme would turn
"follow my phone" into "always dark" the first time it was saved, and the person
would never find out — it would look right until they changed their phone.

Copy: *"Choose Warsha's appearance, or match your device setting."* /
*"اختار شكل ورشة، أو خليه يتغير حسب إعدادات جهازك."*

## 4. Storage and precedence

Full detail: `docs/decisions/appearance-preference-storage.md`.

Local first, account second. The device value is authoritative at startup
because the first frame is painted before there is a session. Precedence, applied
once per account transition:

1. An explicit local choice on this device wins, and is pushed to the account.
2. Otherwise the account's stored preference, after session hydration.
3. Otherwise `system`.

Signing out does not change the appearance. Mock mode never reaches Supabase, and
a Supabase failure never writes into Mock.

## 5. No flash

The local preference is read **synchronously** in the state initializer, so there
is no frame in which Warsha has rendered without having decided. Static web
export cannot know the visitor's choice, so an inline `<head>` script paints the
correct background before React exists.

A theme change rebuilds style objects and re-renders. It does **not** remount:
navigation history, scroll position, form contents, and in-flight requests all
survive. The regression suite asserts the root is not keyed on the scheme,
because keying it is the obvious and completely invisible way to break this.

## 6. Semantic tokens

73 roles across background, text, border, action, status, brand, input,
navigation, card, and skeleton families — every one defined in both themes, with
the TypeScript type making an omission a build failure rather than a screenshot
someone notices later.

The governing case is `colors.white`, used 184 times. In dark it meant *the
primary action surface*. Inverted mechanically, it would have produced a white
button on a white card. It is aliased to `actionPrimaryBackground`, so every call
site resolves correctly in both themes; the audit forbids new uses.

`scripts/audit-appearance.mjs` enforces three properties: no product file imports
the static palette, no product file contains a colour literal, and both themes
define every role with different values except four documented exceptions.

## 7. Light theme direction

Warm off-white canvas (`#F4F2EE`) rather than pure white, so the interface reads
as paper. White cards above it, so elevation still rises toward the light — the
same direction as dark. Near-black text (`#111111`), not pure black. Status text
darkens for legibility while `brandPrimary` keeps the real green for marks:
`#2FBF71` on white is roughly 2:1 and cannot carry body text.

No gradients, no glassmorphism, no decorative elevation. Full rationale and the
complete value table: `docs/brand/WARSHA-APPEARANCE-SYSTEM.md`.

## 8. Logo

Geometry untouched — the regression suite asserts the SVG path byte-for-byte.
Only the ink changes, expressed as the surface the mark sits on rather than as a
colour, which is why every existing call site stayed correct in both themes
without being edited. The mark is never boxed in a tile to dodge theme
switching, and never mirrored for RTL.

The approved motto is unchanged: **YOUR WORK, OUR MISSION / شغلك مهمتنا**.

## 9. System surfaces — what is and is not controlled

| Surface | Controlled |
| --- | --- |
| Every Warsha screen, navigation container, status bar | **Yes** |
| Android root view and navigation bar background | **Yes**, via `expo-system-ui` |
| Web document background, `theme-color`, `color-scheme`, form controls | **Yes** |
| iOS/Android **native launch screen** | **No** — stays dark; see §16 |
| PWA manifest `theme_color` | **No** — a manifest holds one value |
| Keyboard appearance | **No** — not wired |

`userInterfaceStyle` moved from `"dark"` to `"automatic"`. This was mandatory:
pinned to `dark`, iOS reports dark regardless of the device setting and "System"
could never have worked.

---

# PART B — SEARCH AND DISCOVERY

## 10. Search

Server-authoritative in every respect that matters.

- **Discoverability** is `private.is_provider_publicly_discoverable`, unchanged
  and unrestated. Every read path calls it. pgTAP asserts that no combination of
  permissive filters reveals a hidden worker.
- **Matching** is Postgres full-text over a generated document (display name
  weight A, profession B, about and area C), plus declared skills and
  specialties, plus service and category names.
- **Spelling tolerance runs only when the exact search found nothing**, so a
  correctly spelled query is never diluted. Trigram *word* similarity above 0.5.
- **Four explicit outcomes**: `browse`, `exact`, `approximate`, `empty`. An
  approximate result is labelled as approximate, so a guess is never presented
  as certainty.
- **Pagination** is stable: ordering is fully specified down to `p.id`, so page
  two cannot repeat or skip a row page one already showed. The count describes
  the whole result set, not the page.

The landing state offers recent searches, trades, and **common services** —
ranked by how many discoverable workers offer them. That is a real fact Warsha
has. It is never called "popular", because Warsha has no traffic data and will
not invent a popularity signal. pgTAP asserts no suggestion field claims it.

## 11. Filters

Category, service, area, minimum rating, completed-job threshold, available now,
verified skill certificate, approved professional certificate, emergency
availability, price model, and language.

Every filter is applied by the server. The client's filter state is a *request*,
never a decision, and nothing filters an already-fetched page and calls it a
result set. The client renders only the filters `get_discovery_filters()`
returns, so a filter cannot be offered that the server cannot answer — the
emergency filter, for instance, appears only when a worker actually provides it.

Active filters show a count, can be removed individually, and can be reset. They
survive navigating to a provider and back. On web the query lives in the URL.

## 12. Sorting

| Sort | Definition |
| --- | --- |
| Recommended | An **application of WPS-008 `best-value-v1`** at browse time |
| Distance | Ascending from the caller's location; refused without one |
| Rating | Average rating descending, with review count always shown |
| Most reviewed | Review count descending |
| Availability | Available workers first |

**Recommended is not a new formula.** It applies the published weights (0.45
rating, 0.20 logarithmic experience confidence, 0.27 distance) and reads the
fairness and new-worker bounds from `private.marketplace_configuration` at call
time. Two honest deviations, recorded here and in the migration: there is no
request, so there is no capacity, ETA, or emergency term; and when the caller has
no location, the distance term is simply absent and the remaining weights are
**not** renormalized — an unlocated browse cannot earn a distance score, which
inflates nobody.

Browsing writes no `marketplace_candidate_scores` row and starts no matching run.
pgTAP asserts it. Browsing does not consume marketplace opportunity.

**Response time is not offered.** `provider_profiles` stores a free-text response
label and no numeric value, so the option would sort by nothing. This is stated
in the contract, in the filter metadata, and in pgTAP, rather than shipped as a
control that quietly does nothing.

A sort the data cannot honestly answer is **refused** with an error rather than
silently degraded — which is why the client can only ever offer what the server
will deliver.

## 13. Discovery surfaces

Each answers exactly one question, and a section with no answer is not rendered.

| Section | Question |
| --- | --- |
| Trades | "What do you need help with?" |
| Continue where you left off | recently viewed |
| Workers you saved | favourites, from the existing store |
| Available near you | "Who is available now?" |
| Proven professionals | verified certificate and completed work |

**Removed:** the "Special offers" banner. It advertised a 20% discount that
nothing in Warsha honours, pointed at a hardcoded category, and answered no
question. An invented discount shown to a customer is worse than advertising —
it is a false claim. Recorded here as a deliberate removal.

## 14. Recently viewed, favourites, personalization

**Recently viewed** is private, bounded at 20 by database trigger, clearable, and
owner-isolated by RLS. A worker who is not publicly discoverable is never written
to it and never read back out of it. It changes what *you* see next and changes
nothing about who anyone else is shown — and the screen says so.

**Favourites** reuses `public.favourites` unchanged. No second store exists.

**Personalization** uses only transparent signals: saved workers, recently
viewed, chosen area, language, and mode. There is no behavioural scoring, no
inference of any protected attribute, and no engagement optimization. The
discovery home states plainly whether it is personalized, and falls back to
non-personalized discovery for a signed-out visitor rather than failing.

## 15. Location, analytics, and privacy

Warsha requests **no device location**. Area selection is manual. The server
supports coordinates and it is tested, but no client asks for permission, so
distance sorting is not offered — see §16.

No public projection ever carries a coordinate, a contact detail, a document, a
certificate file, or an auth identifier; pgTAP asserts the absence of each key by
name. Distance, when present, is rounded to the kilometre before it leaves the
database, so it cannot be trilaterated back to an address. Area is a label.

Analytics uses WPS-018 `record_operational_event`. **Search text is never
logged** — only its length. A query can contain a street, a surname, or a
description of a private problem. There is no third-party analytics provider.

Four surfaces are rate limited on the WPS-018 limiter. No second limiter exists.

Anonymous callers may search and browse — forcing a sign-in to look at a plumber
would be hostile — and may write nothing and read no history. Every history RPC
is denied at the grant, before any function body runs.

---

## 16. Validation

Full measured results: `docs/testing/WPS-020-ACCEPTANCE-EVIDENCE.md`.

| Gate | Result |
| --- | --- |
| Clean `supabase db reset` | Full chain through `202608050001` applies |
| Full pgTAP | **23 files / 2,170 assertions, `Result: PASS`** |
| WPS-020 pgTAP | 138 assertions |
| WPS-020 client suite | 877 checks |
| All regression suites | 20 of 21; one pre-existing failure WPS-020 did not cause (§19) |
| Appearance audit | Clean — 73 roles in both themes, no colour literal outside the theme |
| TypeScript, ESLint, mojibake, whitespace | Clean |
| Secret, migration, environment, bundle audits | Clean |
| Expo Doctor, three cache-cleared exports | see the evidence document |
| Hosted migration | **Not applied** |

## 17. What is not claimed

- **Manual acceptance has NOT RUN.** All 102 cases are NOT RUN, and they join a
  backlog of consolidated cases that has never been executed.
- **No device testing of any kind.** No screenshot of the light theme exists.
- **No measured contrast.** Contrast ratios were computed from the palette, not
  sampled from a rendered screen. See
  `docs/testing/WPS-020-ACCESSIBILITY-REVIEW.md`.
- **No device location.** `expo-location` is not a dependency, and adding a
  native module plus a permission flow that cannot be tested without a device
  was judged worse than not shipping it. The server side is built and tested;
  the client does not ask. Distance sorting is therefore unavailable in the app.
- **The native launch screen stays dark in both appearances.** Only a light-ink
  splash asset exists; a light launch screen would show an invisible logo, and
  producing a dark-ink brand asset is the brand system's authority, not WPS-020's.
- **The PWA manifest keeps one theme colour.** A web manifest has no per-scheme
  form.
- **Keyboard appearance is not themed.** It would need a prop on every input.
- **Search relevance has not been measured**, because there are no real queries.
- **No support for saved searches or search alerts.** Not requested, not built.

## 18. Recorded changes to earlier work

Four, all deliberate:

1. **`app.json` `userInterfaceStyle`: `dark` → `automatic`.** Mandatory. Pinned
   to `dark`, the OS reports dark to the app and "System" cannot function.
2. **`Colors.light` in `constants/theme.ts` now holds light values.** It held
   dark values under a light name, so anything trusting it rendered dark and
   looked correct. This was a latent trap, not a working feature.
3. **`components/warsha/OfferBanner.tsx` deleted.** See §13.
4. **`components/themed-text.tsx` link colour** moved from a literal `#0a7ea4`
   to the theme tint. Expo starter code, but it was the last colour literal
   outside the palette and the audit is absolute.
5. **`hooks/use-color-scheme.ts` now reports the resolved app appearance**, not
   the device setting, and `hooks/use-color-scheme.web.ts` was deleted. The two
   answered different questions while looking identical: a person who chose
   Light on a dark phone got `"dark"` from a hook named `useColorScheme`, and
   the web variant additionally returned `"light"` until hydration, so the
   platforms did not agree with each other either. There is nothing
   platform-specific left to decide, so the split is gone. The return type
   narrows from `'light' | 'dark' | null` to `'light' | 'dark'`, which let the
   dead `?? 'light'` guard in `use-theme-color.ts` go with it.

No existing table, RPC, policy, grant, or test was dropped or weakened. All 22
pre-existing pgTAP suites pass unchanged, with no assertion edited.

## 19. Pre-existing failure recorded, not fixed

`npm run test:wps018` fails on one assertion: *"over-the-air updates are not
enabled."* `app.json` carries an `"updates"` block pointing at an Expo update
URL, plus an `ios.infoPlist` block. Neither was in `HEAD` when WPS-020 began —
both were uncommitted working-tree changes already present, and they were swept
into the same `wip` commit as WPS-020's own single `app.json` line.

WPS-020 did not cause it. The WPS-018 suite reads five properties from
`app.json`, and `userInterfaceStyle` — the only line WPS-020 changed — is not
one of them.

Neither the file nor the assertion was touched. The assertion is correct and is
doing its job: WPS-018 recorded "no over-the-air updates" as a launch-readiness
property, and something enabled them. Whether Warsha ships with EAS Update
enabled is a launch decision for the WPS-018 gap register, not something to be
quietly resolved inside a search-and-appearance change.

## 20. Session interruption and recovery

The implementing session hit its limit mid-write on `hooks/use-color-scheme.ts`.
The write did not land; the file was recovered **unchanged**, at its original
single-line content, and was completed in the following session. Everything else
had already been written and committed as `9237b82`.

Every gate in §16 was re-executed from the recovered tree. No result in this
document is carried over from before the interruption.
