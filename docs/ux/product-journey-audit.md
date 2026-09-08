# Warsha product journey audit

Opened 2026-09-08. This is a living document: it is written as findings are
established, and every finding says what evidence it rests on.

## How to read this

**Evidence** is the load-bearing column. Warsha's journey cannot be judged from
JSX — a heading that reads well in a component wraps to three lines in French,
a control that is clearly primary in source sits under the fold at 320dp, and a
screen that is obviously RTL-safe in code still renders a Latin-pointing chevron
on a device. So each finding is labelled:

| Label | Means |
| --- | --- |
| **rendered** | Observed on a device. A screenshot or an accessibility tree is named. |
| **read** | Established from source only. Real, but not yet seen. Weaker. |

A **read** finding is not promoted to a fix until it has been seen, unless the
defect is one source can prove on its own (a missing translation key, a control
with no accessible label).

### Severity

| | |
| --- | --- |
| **P0** | The journey is impossible, or unsafe. Fix immediately. |
| **P1** | Major comprehension or abandonment risk. Fix within this programme. |
| **P2** | Meaningful friction or a visible polish defect. Fix where coherent. |
| **P3** | Optional refinement. Recorded, not scheduled. |

### Device and build

Findings marked **rendered** were captured on an **API 24 (Android 7.0) x86_64
emulator, Nexus 6 profile**, running a release APK built from this repository
with `EXPO_PUBLIC_DATA_MODE=mock`.

API 24 is deliberate: it is Warsha's declared floor, it is the cheapest device
class a real Egyptian customer or worker is likely to hold, and it is the
hardest case for the layout. Mock mode is not a test fixture — it is a
first-class data mode, and it is the only reason a full journey can be
photographed on this machine at all, whose TLS is intercepted by antivirus so
the app cannot reach Supabase (see
`docs/operations/release-readiness-continuation.md`).

---

## Findings

### UX-001 — Language and appearance competed with every early screen

- **Stage:** every signed-out screen, plus both home shells
- **User goal:** whatever the screen was for
- **Severity:** P1
- **Evidence:** rendered, before and after — API 24, first launch after
  `pm clear`. Accessibility tree before:

  ```
  [tap] Language. Choose language
        EN
  [tap] Appearance. System
        Warsha
        How will you use Warsha?
  ```

  and after:

  ```
        Warsha
        How will you use Warsha?
  [tap] Customer. Book plumbers, electricians, carpenters and more.
  ```

  Screenshots `api24-01-first-contact.png`, `api24-03-first-contact-dark.png`,
  `api24-04-first-contact-large-text.png`.
- **Status:** FIXED, commit `06b2a62`, verified on device

**Current experience (before).** On the first screen a new user sees, the two
topmost interactive elements were a language pill and an appearance pill,
floating above the brand mark and above the question the screen exists to ask.
They were rendered by the root layout on every routed screen — welcome, sign-in,
create-account, role selection, onboarding — and embedded again in the customer
header and the worker home.

**Problem.** These are the two settings a person touches roughly once in the
life of an install. They were given the most valuable position on every screen
in the product, and on first contact they outranked the brand.

**Change.** Moved into Settings as *Language & appearance*, reachable from the
customer profile and worker settings. No engine change: `resolveLanguage`
already prefers the device locale until somebody chooses explicitly, and
appearance already defaults to System, so signed-out behaviour was already what
the product wanted. One exception survives — `ConfigurationError`, which renders
when the app cannot configure itself and therefore has no Settings to offer.

**Why it improves the journey.** Every early screen now leads with its own
purpose. Nothing was taken away from anyone: the choices are where people look
for choices.

---

### UX-002 — WITHDRAWN: the role chooser was a mock-mode artefact

- **Stage:** first contact
- **Severity:** was recorded P1
- **Status:** **WITHDRAWN 2026-09-08.** The finding was wrong.

**What was recorded.** That a cleared install opens on the account-creation role
chooser rather than `welcome.tsx`, so Warsha asks for a commitment before saying
what it is.

**Why it was wrong.** The screenshots were taken from a build made with
`EXPO_PUBLIC_DATA_MODE=mock`, and mock mode is not signed out. In
`src/onboarding/onboarding-context.tsx`:

```ts
const accountKey = mode === 'mock' ? 'mock-user' : user?.id ?? null;
```

`AuthGate` derives `signedIn = onboarding.accountKey !== null`, so under mock
mode the app believes an account is present. `routeFor` then finds no role
selected and returns `role_choice`, which `homeRouteFor` maps to
`/create-account`. A real signed-out launch returns `gateway` → `/welcome`,
which is what the production APK does: the push proof, run against the EAS
production build, logged "THE PRODUCTION APP LAUNCHES to the welcome screen".

**The lesson, which is the reason this is corrected in place rather than
deleted.** Rendering is necessary but not sufficient. A screenshot is only
evidence about the build it came from, and the build was not representative of
the journey being judged. "Rendered" is now a claim about *which* build, and the
methodology note below says which build is admissible for what.

## Which build is admissible for which finding

Neither build can answer everything, and using the wrong one produced UX-002.

| Build | Signed-out journey | Authenticated journeys |
| --- | --- | --- |
| `EXPO_PUBLIC_DATA_MODE=supabase` | **authoritative** — routes to `/welcome` | unreachable here: sign-in needs network, and this host's TLS is intercepted |
| `EXPO_PUBLIC_DATA_MODE=mock` | **inadmissible** — believes it is signed in | **authoritative** — the only way to reach customer and worker screens on this machine |

Every rendered finding below names the mode it was captured under.

---

### UX-003 — French users read English in the screen for choosing their language

- **Stage:** Settings → Language & appearance
- **Severity:** P2
- **Evidence:** read — `src/discovery/discovery-translations.ts` selected
  `language === 'ar' ? 'ar' : 'en'`
- **Status:** FIXED, commit `06b2a62`

`useDiscoveryText` mapped French to English wholesale. Mostly invisible — until
language moved into Settings, at which point the screen for choosing your
language rendered in English for the one group most likely to be looking for it.
French is now a real table layered over English, the shape `web/lib/copy.ts` and
`lib/app-copy.fr.ts` already use.

The wider gap is unchanged and recorded here: `discoveryCopy` is still English
and Arabic for most of its keys, and French still falls back to English outside
the settings vocabulary. That is a content programme, not a defect in this
tranche.

---

### UX-004 — The role chooser distinguishes two roles by text alone

- **Stage:** role chooser (`/create-account`), reached from Welcome
- **User goal:** work out which of these two things they are
- **Severity:** P2
- **Evidence:** rendered (mock mode) — `api24-01-first-contact.png`. The
  filename says "first contact" because it was captured before UX-002 was
  withdrawn; the screen is the role chooser.
- **Status:** PARTLY FIXED. Each role now carries a mark — a service icon for
  Customer, a tools icon for Worker — so the two are discriminable before either
  label is read. The mark never carries the meaning alone: the label and the
  accessible name still say which is which, and the icon is hidden from screen
  readers so it is not announced twice. The trust signal moved to the gateway
  where it belongs (UX-006) rather than being added here, because the role
  chooser's job is role selection.

The screen is typographically clean and the monochrome direction reads calm and
premium, which is the right foundation. What it does not do is give anybody a
reason to proceed.

- **No icons on the role cards.** "Customer" and "Worker" are distinguished by
  a word and a sentence. For the low-reading-load audience this programme names
  as a first-class requirement, an icon is the fastest possible discriminator
  and there is none. Both cards are identical rectangles of text.
- **No trust signal.** Nothing on the first screen says workers are identity
  checked, or that a price is agreed before work starts — both of which are
  true, both of which are Warsha's actual differentiators, and both of which
  appear nowhere until much later.
- **Sign in has the weakest affordance on the screen.** For a returning user it
  is the primary intent, and it is rendered as bold body text below a paragraph
  of fine print, beneath two large cards.
- **Roughly a quarter of the screen below the fold is empty**, so the content is
  not short of room for any of the above.

---

### UX-005 — Enlarged text is handled correctly on the role chooser

- **Stage:** role chooser
- **Severity:** none — recorded as a pass
- **Evidence:** rendered (mock mode) — `api24-04-first-contact-large-text.png`,
  font scale 1.3x on API 24

At 1.3x every element on the role chooser reflows: the heading wraps to two
lines, both card
subtitles wrap to two, the footnote to three, and nothing clips, overlaps or
leaves the viewport. Recorded because "we checked and it was fine" is worth as
much to the next reader as a defect, and because this is the axis where fixed
height rows usually fail.

---

### UX-006 — The gateway now says what Warsha is before asking for anything

- **Stage:** first contact (`/welcome`)
- **User goal:** understand the service and decide whether to continue
- **Severity:** was P1
- **Evidence:** rendered (supabase mode) — `gw-05-gateway-ar.png`,
  `gw-05-gateway-fr.png`, `gw-05-gateway-en.png`, `gw-06-gateway-320dp.png`,
  `gw-03-first-contact-dark.png`, `gw-04-first-contact-large-text.png`
- **Status:** FIXED

**Before.** "Welcome to Warsha" over "Sign in to book a service, or create an
account to get started" — a greeting and an instruction, which between them said
nothing about what the service does or why a stranger should be let into a
home. The primary button was Sign in, which is the one action a first-time
visitor cannot take.

**After.** The value proposition first, taken verbatim from `web/lib/copy.ts` so
the marketing site and the app cannot disagree about what Warsha is; then two
reasons to believe it, each an icon and a short clause — workers are identity
checked, and the price is agreed before work starts. Both are true, both are
Warsha's actual differentiators, and neither appeared anywhere before a person
had already committed. Then **Get started** as the primary action, and **I
already have an account** as the secondary.

Deliberately not a carousel, and deliberately short.

**Rendered in all three languages, and it holds:**

| | |
| --- | --- |
| Arabic | `ar-rEG-ldrtl`. Icons mirror to the right, footer links reverse, natural Egyptian copy: «صلّح اللي محتاج تصليح، بسعر اتفقت عليه الأول.» and «يلا نبدأ» |
| French | `fr-rFR-ldltr`. The longest trust line, "Vous acceptez le prix avant le début des travaux", fits on one line at 411dp |
| 320dp | Everything fits with no scrolling: the heading wraps to two lines, one trust line wraps to two, both buttons and the footer remain on screen |

The French rendering also proves the new French layer works — before this
tranche `useOnboardingText` mapped French to English, so a French speaker's
first sentence from Warsha was in English.

---

### UX-007 — Warsha calls the same role three different things

- **Stage:** cross-surface
- **Severity:** P2
- **Evidence:** read — app (`roleWorker: 'Worker'`, `/worker` routes,
  `workerCapabilityActive`), public web (`navFind: 'Find a professional'`,
  `navWorker: 'Work with Warsha'`, `footerBecomeWorker: 'Become a professional'`),
  and this programme's own brief, which says "technician"
- **Status:** OPEN — needs a product decision, not an engineering one

The app says **Worker**, the website says **professional**, and the brief says
**technician**. French already resolves to *Professionnel* and Arabic to
*صنايعي*, so English is the surface where the three compete.

This is not cosmetic. It is the noun for one of Warsha's two audiences, it
appears in the first decision a new user makes, and the parity constitution
exists precisely to stop surfaces disagreeing about identity. Renaming it is a
one-line change per table and a large change to the product's voice, so it is
recorded rather than guessed at.

---

### Testing note — how to make an Android emulator change language

Recorded because it cost an hour and the obvious method does not work.

`setprop persist.sys.locale ar-EG` followed by a zygote restart, and even a full
reboot, left `am get-config` reporting `en-rUS`. On API 24+ the framework takes
its locale list from the settings provider once userdata is initialised, and the
property is ignored:

```
adb shell settings put system system_locales ar-EG
adb reboot
```

produced `ar-rEG-ldrtl` first try. `scripts/android-e2e/flows/journey-screens.mjs`
writes both, because the property is what a genuinely fresh boot reads.

---

## Coverage

What has and has not been looked at, honestly, so the gaps are visible.

| Journey stage | Rendered | Read | Notes |
| --- | --- | --- | --- |
| First contact (Welcome) | yes (supabase) | yes | UX-006 fixed; EN/AR/FR, 320dp, dark, 1.3x |
| Role chooser | yes (mock) | yes | UX-004, UX-005 |
| Welcome screen | no | yes | not reached by a cold launch |
| Sign in | no | yes | |
| Create account (beyond the role step) | no | yes | |
| Customer home, discovery, search | no | no | |
| Request creation | no | no | |
| Marketplace, quotes, worker selection | no | no | |
| Job, chat, completion | no | no | |
| Worker onboarding and verification | no | no | Part C priority |
| Worker home, work, quotes, earnings | no | no | Part C priority |
| Arabic RTL | gateway only | partial | hard gate; the journey beyond Welcome is not photographed |
| French | gateway only | partial | |
| Dark | first contact | partial | |
| Enlarged text | first contact | no | UX-005: passes there |

`scripts/android-e2e/flows/journey-screens.mjs` exists to close this table by
photographing the axes rather than reasoning about them.
