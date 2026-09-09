# Mobile visual certification

Opened 2026-09-09. Functional correctness is not certification. A screen can
pass every assertion and still be ugly, confusing, or laid out backwards — so
every capability now carries **two** statuses, and both must be PASS.

| | |
| --- | --- |
| **FUNCTIONAL** | it does the right thing |
| **VISUAL** | it *looks* right, on the axes below, judged by looking |

A row cannot be inferred: functionality is not read off a screenshot, and visual
quality is not read off source code. The first finding in this document proves
why — it was invisible in the code and obvious in the picture.

## Evidence

Screenshots and their metadata live at `D:/Warsha-Temp/visual-cert/`, indexed by
`evidence.json`. Every capture records route, state, role, locale, direction,
viewport in dp, density, API level, font scale, theme and build mode. A
screenshot without those is a picture, not evidence, because nobody can
reproduce or compare it.

## Severity

| | |
| --- | --- |
| **V-P0** | the action is impossible or dangerously misleading |
| **V-P1** | major comprehension, abandonment or trust problem |
| **V-P2** | meaningful polish or usability inconsistency |
| **V-P3** | minor refinement |

---

# FIRST CONTACT

## `create-account` — role choice

**User goal:** decide whether I am here to hire someone or to work.

| Axis | Evidence | Verdict |
| --- | --- | --- |
| EN · 320dp · light · 1.0× | `firstcontact-role-chooser-en-320dp-light.png` | **PASS** |
| AR RTL · 320dp · light · 1.0× | `firstcontact-role-chooser-ar-320dp-light.png` | **FAIL** — V-P1 |
| FR · dark · enlarged | not captured | UNTESTED |

**English reads well.** The heading wraps to two lines at 320dp without
crowding, the two cards carry equal weight — correct, because this is a genuine
choice and neither option is the "primary" one — and `Sign in` sits below as a
quiet third path. The copy is honest early: *"Needs identity checks before you
can start"* appears before anybody invests effort, which is the right place for
it.

### V-P1 — the Arabic layout is mirrored twice, so rows run the wrong way

In Arabic the card icon sits on the **far left** while its label is
right-aligned on the **right**, with the width of the card between them. The
icon is detached from the word it belongs to.

**Root cause, and it is not this screen.** Warsha decides direction in
JavaScript from the Warsha language preference — `src/i18n/direction.ts` — and
every mirrored row applies `row-reverse` itself. That is a complete strategy,
and it only works while the platform is not mirroring as well.
`localization.tsx` called `I18nManager.allowRTL(true)`. On a phone whose own
locale is Arabic — **most of Warsha's market** — `I18nManager.isRTL` became
true, the platform mirrored every `flexDirection: 'row'`, and the app's own
`row-reverse` mirrored it back.

The blast radius is not one screen: **65 `row-reverse` sites across 64 files**,
which is every deliberately mirrored row in the product.

It was invisible on a phone set to English, where the JS mirroring was the only
mirroring and was correct. That is exactly why it survived — the broken
configuration is the one nobody develops on.

**Fixed** by removing the platform's permission to mirror, so the JavaScript
rule is the only rule and all four combinations agree: Warsha in English or
Arabic, on a phone in English or Arabic. `forceRTL` is deliberately still not
used; it needs a restart, and restarting somebody mid-task to change a layout is
worse than the layout.

**Retest status: PENDING A REBUILD.** The fix is in the source and the
regression suite asserts it, but the screenshot above was taken with the
installed Production APK. It cannot be re-verified visually until an APK
carrying the fix is built and installed, and this row stays FAIL until then.

### V-P2 — both role icons are tools

`home-repair-service` (a toolbox) marks **Customer**; `handyman` (hammer and
wrench) marks **Professional**. Both are tool imagery, so for a reader relying
on recognition rather than text — the low-literacy gate's primary channel — the
two cards look like two kinds of tradesperson rather than "I need help" and "I
do the work". The words carry the distinction; the marks do not.

Not fixed yet: choosing the replacement is a product decision about Warsha's
visual language, and it should be made once for the whole icon set rather than
patched on one screen.

### Observation, not a defect

`تسجيل الدخول` renders correctly. An earlier reading of the low-resolution
screenshot suggested a typo; the accessibility tree showed the string was right.
Worth recording as a method note — **read the tree before filing a copy defect
from a 320px-wide image.**

### Text direction is not affected by the layout fix — checked, not assumed

Disabling platform mirroring could plausibly have broken Arabic **text**, which
is a separate concern from Arabic **layout**. It does not, and the reason is
that Warsha never relied on the platform for it either:

| Primitive | Sets |
| --- | --- |
| `Typography.tsx` (AppText) | `textAlign: isRTL ? 'right' : 'left'`, `writingDirection: isRTL ? 'rtl' : 'ltr'` |
| `BrandUI.tsx` (text field) | `isRTL && fieldRTL` → `textAlign: 'right'`, `writingDirection: 'rtl'` |

Both read Warsha's own `isRTL`, not `I18nManager.isRTL`, so alignment and bidi
were already JS-owned and are unchanged by the fix. The rtl-direction suite
asserts both, across 51 shared components.

### One behaviour that genuinely changes, and must be checked

Platform mirroring was doing something else besides breaking rows: it also
mirrored anything that reads `I18nManager.isRTL` for itself — navigation
transitions and the back-gesture edge among them. For a user on an Arabic
phone, those were mirrored and will now be LTR.

This is not a regression against the intended architecture — a user on an
English phone with Warsha in Arabic always had LTR navigation — but it is a
change for Arabic-phone users, and it is the kind of thing that has to be
looked at rather than reasoned about. **Navigation and back affordances are on
the retest list for that reason.**

---

# Not yet inspected

Everything else. Listed so the gaps are visible rather than implied.

| Journey | Status |
| --- | --- |
| CUSTOMER | UNTESTED |
| PROFESSIONAL | UNTESTED — Arabic states are a hard gate |
| JOB LIFECYCLE | UNTESTED — 13 states, 28 transitions |
| CHAT | UNTESTED |
| SETTINGS | UNTESTED |
| ACCOUNT / PRIVACY | UNTESTED |
| ERROR / EMPTY / OFFLINE | UNTESTED |
| PERMISSIONS | UNTESTED |
| MAPS / LIVE TRACKING | NOT BUILT |
| Money screens (the currency gate) | UNTESTED — formatters unit-proven, layout unproven |

## Method note for whoever continues this

The emulator used here is 320×640 at 160dpi — 320dp, the compact hard gate — on
API 35, running the Production APK in supabase mode.

Arabic is reached with `adb shell cmd locale set-app-locales com.warsha.app
--locales ar-EG`. Setting `system_locales` alone does **not** work, and neither
does clearing app data: Warsha keeps its own language preference and defaults to
English. That per-app locale is also what exposed the mirroring defect, because
it makes the *platform* Arabic as well as the app — which is the configuration a
real Egyptian user has and the one a developer almost never tests.
