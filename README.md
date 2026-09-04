# Warsha

> **Warsha**
> Home services, without the uncertainty.
>
> Warsha connects customers with skilled professionals and provides the workflow,
> information, and trust mechanisms needed to manage a service request from
> discovery through completion.

---

## Overview

Warsha is a two-sided home-services marketplace for Egypt. A customer describes
the work they need; professionals respond with a quote; the customer decides
before anything begins. Price, scope and identity are settled before a
technician is at the door, which is the part of hiring a tradesperson that
normally goes wrong.

It is not a directory and not a dispatch queue. The repository carries the whole
service lifecycle — discovery, request creation, quoting, job state, payment,
reviews, disputes and support — together with the verification, capability and
audit machinery that makes those states trustworthy.

The product is in closed alpha. Claims made on the public site are deliberately
limited to what the platform can currently support.

| | |
| --- | --- |
| Public site | <https://usewarsha.com> |
| Customer / worker app | <https://app.usewarsha.com> |
| Staff console | <https://admin.usewarsha.com> |

---

## Product surfaces

Five surfaces, three codebases, one set of product rules. The separations are
deliberate and are enforced by tests.

| Surface | Where it lives | Built with |
| --- | --- | --- |
| Public marketing site | `web/app/[locale]/` | Next.js App Router, statically generated per locale |
| Customer / worker web app | `web/app/app/` | Next.js App Router, Supabase browser session |
| Staff console | `web/app/admin/` | Next.js App Router, capability-gated |
| Android and iOS | `app/` | Expo Router over React Native |
| Backend | `supabase/` | PostgreSQL migrations, RLS policies, Edge Functions |

**The web origins are separated by host, not by path.** `web/middleware.ts`
rewrites `app.usewarsha.com/jobs` to `/app/jobs` and
`admin.usewarsha.com/users` to `/admin/users`, so the path prefix is never
visible and the public host cannot reach either tree. A flaw in a marketing page
therefore cannot reach a signed-in session: they are different browser origins.

**Administration is web-only, and that is a decision rather than a gap.** The
native client carries no staff surface; `scripts/native-admin-boundary.test.mts`
fails the build if one reappears. Do not file it as a mobile parity defect.

---

## Tech stack

Versions below are the ones the repository actually pins.

**Mobile (repository root)**

| | |
| --- | --- |
| Expo | `~54.0.37` |
| React Native | `0.81.5` |
| React | `19.1.0` |
| Expo Router | `~6.0.24` (file-based routing from `app/`) |
| TypeScript | `~5.9.2` |
| Rendering | `react-native-svg`, `react-native-reanimated`, `react-native-maps` |
| Platform | `expo-notifications`, `expo-location`, `expo-camera`, `expo-secure-store`, `expo-sqlite`, `expo-updates` |

**Web (`web/`, its own npm workspace with its own lockfile)**

| | |
| --- | --- |
| Next.js | `15.5.23` (App Router, typed routes) |
| React | `19.1.0` |
| TypeScript | `~5.9.2` |
| Data | `@supabase/supabase-js` |

**Backend (`supabase/`)**

PostgreSQL with row-level security, 99 forward-only migrations, pgTAP tests, and
six Deno Edge Functions.

Both clients talk to Supabase directly with a publishable/anon key and the
signed-in user's own session. **There is no service-role path in either client.**
Authorization is row-level security plus server-side capability checks.

---

## Repository structure

```text
/
├── app/                  # Expo Router screens — the Android and iOS client
├── components/warsha/    # Shared native components (buttons, cards, brand mark)
├── constants/            # Appearance and design tokens: colour, spacing, type, motion
├── hooks/                # Shared native hooks (reduced motion, press feedback)
├── src/                  # Shared product logic: i18n, auth, bookings, payments,
│                         #   discovery, notifications, providers, privacy, brand
├── locales/              # Native translation bundles (en, ar)
├── web/                  # Next.js: public site, customer/worker app, staff console
│   ├── app/[locale]/     #   public marketing site
│   ├── app/app/          #   authenticated customer + worker application
│   ├── app/admin/        #   staff console
│   ├── components/       #   shared web components and CSS modules
│   └── lib/              #   web copy, routing, Supabase clients, preferences
├── supabase/
│   ├── migrations/       #   forward-only schema, RLS policies, functions
│   ├── functions/        #   Edge Functions (Deno)
│   └── tests/database/   #   pgTAP tests
├── scripts/              # Every validation gate and automation entry point
├── docs/                 # Constitution, runbooks, architecture, WPS specs
├── plugins/              # Expo config plugins
└── assets/               # Brand marks, icons, fonts
```

### Shared authorities

Warsha resolves questions in one place rather than per surface. Before adding a
colour, an icon, a preference key or a copy string, search for the existing
authority.

| Concern | Authority |
| --- | --- |
| Colour and appearance roles | `constants/appearance.ts`, restated for web in `web/app/globals.css` |
| Spacing, radii, typography, motion | `constants/theme.ts` |
| Supported locales and locale resolution | `src/preferences/preference-authority.ts` |
| Native translations | `src/i18n/translations.ts`, `locales/` |
| Web copy | `web/lib/copy.ts`, `web/lib/app-copy.ts` |
| Service and profession icons | `src/brand/warsha-icons.ts` |
| Brand mark geometry | `src/brand/mark-geometry.ts` |
| Notification copy | `src/notifications/notification-copy.ts` |

---

## Getting started

**Prerequisites**

- Node.js. EAS builds pin `22.14.0` (`eas.json`); several scripts use
  `node --experimental-strip-types`, so Node 22 or newer is required locally.
- npm. The repository uses npm workspaces with two lockfiles — one at the root
  and one in `web/`.
- A Supabase project, or the Supabase CLI for a local stack.
- For device builds: EAS CLI `>= 21.0.2`, plus Xcode for iOS and Android Studio
  for Android.

**Install**

```bash
npm install
npm --prefix web install
```

---

## Environment configuration

Copy `.env.example` and fill it in. It is the documented template and it carries
no values.

```bash
cp .env.example .env.local          # mobile + scripts
cp .env.example web/.env.local      # web (Next.js reads its own variables)
```

Two prefixes, because the two toolchains read different ones:

- `EXPO_PUBLIC_*` is inlined into the mobile bundle by Expo.
- `NEXT_PUBLIC_*` is inlined into the web bundle at build time by Next.js.

Both name the same Supabase project and the same publishable key; only the
variable name differs. Setting one does not set the other, and Vercel needs the
`NEXT_PUBLIC_*` pair configured in the project settings, not only on disk.

**Never commit a secret.** Every `.env*` file is gitignored, and
`npm run audit:secrets` fails the build if a credential-shaped string reaches
source or a generated report. In particular, a service-role key must never
appear in an `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*` variable: those are shipped to
the device and the browser.

Warsha runs separate Supabase projects for Development and Production. They hold
different data, different configuration and different keys, and are never
addressed by the same environment file. Which project a surface is bound to is
an operational decision — see `docs/operations/` — not something to change
casually while developing.

---

## Running locally

```bash
npm start                 # Expo dev server (then press a / i, or scan)
npm run android           # Expo dev server, opening Android
npm run ios               # Expo dev server, opening iOS
npm run web               # the Expo web target (not the Next.js site)

npm run web:dev           # Next.js: public site, app and console together
npm run web:build         # production build of the Next.js artifact
```

The three web surfaces run from one Next.js server. Locally they are reached by
host: `localhost:3000` is the public site, `app.localhost:3000` the application,
`admin.localhost:3000` the console — the same rewrite rules `web/middleware.ts`
applies in production.

Supabase, if you are running it locally:

```bash
npx supabase start
npx supabase db reset     # applies supabase/migrations and supabase/seed.sql
npm run db:test           # pgTAP suite
```

---

## Testing and validation

Every gate is a real script in `scripts/`. There is no hidden CI configuration
that runs something different.

```bash
npm run typecheck         # root TypeScript
npm run web:typecheck     # the Next.js compiler boundary, which is separate
npm run lint              # expo lint
npm run test:all          # the deterministic regression inventory
npm run audit:all         # secrets, migrations, environment and appearance audits
npm run db:test           # pgTAP database tests
npm run web:build         # the deployable web artifact must compile
```

`npm run test:all` runs the 69 scripts listed in
`scripts/warsha-automation/policy.mjs` as `DETERMINISTIC_TEST_SCRIPTS`. They are
deterministic and need no network, no device and no database. Between them they
cover payments and money handling, the marketplace and job lifecycle, disputes,
notifications, privacy and data lifecycle, authentication and vetting, the icon
and brand systems, RTL direction, French localization, the spacing system, web
routing and session authority, and the native/admin boundary.

Browser-driven audits need a running server and are run separately:

```bash
npm run web:build && npm --prefix web run start   # then, against it:
npm run test:web-accessibility    # axe-core plus a real keyboard walk
npm run test:web-presentation     # overflow at six widths, theme, metadata
npm run test:web-route-crawl
```

The planner that decides which gates a given change actually requires:

```bash
npm run warsha:impact             # what surfaces and domains this change touches
npm run warsha:validate           # plan and run the gates that follow from it
npm run warsha:release-check
```

Do not weaken a test to make a change pass. If an assertion is wrong, the
assertion is what changes, and it changes to something at least as strict.

---

## Database and Supabase

- **Migrations are the schema.** `supabase/migrations/` is forward-only and
  authoritative; `npm run audit:migrations` enforces that. Never edit a
  deployed database by hand and never rewrite migration history.
- **RLS lives in the repository.** Policies, grants and security-definer
  functions are migrations like anything else. Both clients authenticate as the
  signed-in user, so a missing policy is a broken feature, not an open door.
- **Edge Functions are in `supabase/functions/`**: `location-proxy`,
  `privacy-export`, `push-dispatch`, `vision-extract`, `warsha-automation` and
  `worker-auth`, with shared code in `_shared`.
- **pgTAP tests are in `supabase/tests/database/`** and run with
  `npm run db:test`. They execute as superuser, so they cannot observe a
  failure that only appears in a PostgREST session — verify RPC behaviour over
  HTTP as well.

---

## Localization

English, Arabic and French, on every surface. `supportedLocales` in
`src/preferences/preference-authority.ts` is the single list both platforms read.

- **Arabic is right-to-left and first-class.** The web sets `lang` and `dir` on
  the server so an Arabic reader never sees a frame of English; layout is built
  from CSS logical properties, so `dir="rtl"` reverses it without a mirrored
  stylesheet. Native resolves direction in JavaScript rather than through
  `I18nManager.forceRTL`, which would require a restart.
- **Not everything mirrors.** Service and profession icons denote objects, not
  directions, and are marked `rtlFlip: false`. The homepage photograph is never
  mirrored either.
- **Longer strings are the normal case.** French and Arabic labels are routinely
  longer than the English they were laid out against; `test:french-localization`
  and `test:rtl-direction` exist because that has broken layouts before.

Public pages are locale-routed — `/en`, `/ar`, `/fr` are real generated routes,
so an Arabic page is shareable as an Arabic page.

---

## Appearance and design system

- **Light, dark and system**, with the choice persisted and the system setting
  followed live. The web resolves the stored preference in a synchronous `<head>`
  script so there is no flash of the wrong theme before first paint.
- **Colour is a runtime decision.** `constants/appearance.ts` is the only file
  allowed to name a literal colour; everything else names a semantic role.
  `npm run audit:appearance` fails the build if a component hardcodes a value or
  imports the static palette.
- **Motion is a shared authority**, not per-component numbers: `motion` and
  `pressFeedback` in `constants/theme.ts`, restated as `--motion-*` and
  `--ease-standard` in `web/app/globals.css`, with `test:web-brand` asserting the
  two tables agree. Reduced motion is honoured on both platforms —
  `hooks/use-reduced-motion.ts` on native, `prefers-reduced-motion` on web.
- **One icon family.** Service and profession marks resolve through
  `src/brand/warsha-icons.ts`; `npm run test:warsha-icons` covers the mapping.
- **One brand mark.** "The Current" is drawn from `src/brand/mark-geometry.ts` on
  every surface, and takes the colour of the surface it sits on.

---

## Development workflow

**Changes are umbrella changes.** A defect found on one surface is a defect on
every surface that shares the behaviour until it has been checked. Before
closing a bug, a validation rule, a localization gap or a visual inconsistency,
audit the other applicable surfaces — public web, customer/worker web, admin,
Android, iOS, English, Arabic and French, light, dark and system — and fix it
everywhere it applies. Report what was checked even when it finds nothing.

This does not mean identical layouts. It means product rules, identity,
localization, validation and brand behaviour do not disagree with themselves.

Parity is not always the answer, and the exceptions are architectural: the staff
console is web-only, and a pointer hover has no native equivalent to copy.

Read before starting work that touches more than one surface:

- [`docs/constitution/cross-platform-parity.md`](docs/constitution/cross-platform-parity.md)
- [`docs/constitution/Warsha-Constitution.md`](docs/constitution/Warsha-Constitution.md)
- [`docs/operations/engineering-automation-runbook.md`](docs/operations/engineering-automation-runbook.md)

---

## Deployment and release safety

**Production changes must be deliberate.** Do not change Production Supabase
configuration, live environment variables, feature flags or DNS, and do not push
a release-affecting change, without explicit authorization.

Facts worth knowing before you push anything:

- **Pushing `main` publishes the website.** Vercel builds this repository on
  every push to `main` and deploys `web/` to the live domain. There is no
  separate deploy step and no staging gate in front of it.
- **Development and Production are separate Supabase projects.** A Preview
  environment never carries Production authority.
- **OTA cannot carry a native change.** An update that touches a native
  dependency, an Expo config plugin or `app.config.js` requires a new binary.
  `npm run warsha:impact` classifies this for you.
- **A release starts from a clean, validated commit.** Uncommitted work is not
  releasable, and the validation gates must have passed on exactly the source
  being shipped.
- **Some steps are human-only** by design: Vercel and DNS, iOS signing and store
  submission, applying migrations to a hosted project, deploying Edge Functions,
  and provider configuration.

Build profiles are defined in `eas.json` (`development`, `preview`,
`production`). The release, rollback and store-submission procedures are in
[`docs/operations/`](docs/operations/).

---

## Engineering expectations

- **TypeScript must be correct.** `npm run typecheck` and `npm run web:typecheck`
  are separate compiler boundaries and both must pass.
- **Behaviour changes come with tests.** Add to the deterministic inventory
  rather than testing by hand, and never relax an existing assertion to make a
  change pass.
- **Every user-visible string is translated** in all three languages, and is
  checked in Arabic RTL as well as English.
- **Accessibility is not optional.** Keyboard focus stays visible, hover is never
  the only way to reveal information, touch targets stay large enough, and
  reduced motion is respected.
- **Use the shared authority.** Before inventing a colour, an icon, a preference
  key, a duration or a copy string, search for the one that already exists.
- **No secrets in the repository**, in source, in a fixture, or in a generated
  report.
- **Schema changes are migrations.** Never a manual edit to a hosted database.
