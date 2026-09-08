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

### UX-002 — A cold launch asks "which are you?" before saying what Warsha is

- **Stage:** first contact
- **User goal:** work out what this app is and whether to trust it
- **Severity:** P1
- **Evidence:** rendered — API 24, `pm clear` then launcher intent, resumed
  activity `com.warsha.app/.MainActivity`, accessibility tree captured
- **Status:** OPEN

**Current experience.** A cleared install opens directly on the account-creation
role chooser:

> Warsha
> **How will you use Warsha?**
> **Customer** — Book plumbers, electricians, carpenters and more.
> **Worker** — Offer your services. Needs identity checks before you can start.
> Every account can book services. Choosing Worker also starts your application.
> Sign in

`app/welcome.tsx` exists, is written as "the signed-out gateway ... the first
Warsha screen anybody sees", and is **not** what a cold launch reaches.

**Problem.** The first thing Warsha asks for is a commitment — pick a role,
which begins creating an account — before it has said what the service does, how
pricing works, or why a stranger should be trusted with a home visit. There is
no value proposition and no trust signal anywhere above the fold. "Book
plumbers, electricians, carpenters and more" is the closest thing to one, and it
is card subtext inside a decision the user has not yet been given a reason to
make.

Two smaller problems ride along:

- For a **returning** user, sign-in is the primary intent, and it is the least
  prominent control on the screen — a plain text link below a paragraph of
  explanatory footnote, beneath two large cards.
- The footnote ("Every account can book services. Choosing Worker also starts
  your application.") is doing real work — it resolves a genuine ambiguity about
  what choosing Worker commits you to — but it is placed and styled as fine
  print, which is where users do not read.

**Proposed change.** Not yet decided; this is a product decision as much as a
design one, and it is recorded here rather than guessed at. The options are
materially different: restore `welcome.tsx` as first contact and make role
selection a step inside Create account; or keep the role chooser first and give
it a value proposition and a trust line above the question. Both are defensible;
the second is less disruptive.

**Why it matters.** This is the highest-leverage screen in the product for
abandonment. Everything downstream is reached through it.

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

### UX-004 — First contact has no trust signal and no imagery

- **Stage:** first contact
- **User goal:** decide whether this is for them, and whether it is safe
- **Severity:** P2
- **Evidence:** rendered — `api24-01-first-contact.png`
- **Status:** OPEN

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

### UX-005 — Enlarged text is handled correctly on first contact

- **Stage:** first contact
- **Severity:** none — recorded as a pass
- **Evidence:** rendered — `api24-04-first-contact-large-text.png`, font scale
  1.3x on API 24

At 1.3x every element reflows: the heading wraps to two lines, both card
subtitles wrap to two, the footnote to three, and nothing clips, overlaps or
leaves the viewport. Recorded because "we checked and it was fine" is worth as
much to the next reader as a defect, and because this is the axis where fixed
height rows usually fail.

---

## Coverage

What has and has not been looked at, honestly, so the gaps are visible.

| Journey stage | Rendered | Read | Notes |
| --- | --- | --- | --- |
| First contact (cold launch, role chooser) | yes | yes | UX-002, UX-004 |
| Welcome screen | no | yes | not reached by a cold launch |
| Sign in | no | yes | |
| Create account (beyond the role step) | no | yes | |
| Customer home, discovery, search | no | no | |
| Request creation | no | no | |
| Marketplace, quotes, worker selection | no | no | |
| Job, chat, completion | no | no | |
| Worker onboarding and verification | no | no | Part C priority |
| Worker home, work, quotes, earnings | no | no | Part C priority |
| Arabic RTL | no | partial | hard gate; not yet photographed |
| French | no | partial | |
| Dark | first contact | partial | |
| Enlarged text | first contact | no | UX-005: passes there |

`scripts/android-e2e/flows/journey-screens.mjs` exists to close this table by
photographing the axes rather than reasoning about them.
