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
| EN · 320dp · light | `final-gateway-en-320.png` | **PASS** |
| AR RTL · 320dp · light | `final-gateway-ar-320.png` | **PASS** |
| AR RTL · 320dp · dark | `gw-ar-320-dark.png` | **PASS** |
| AR RTL · 320dp · 1.3x text | `gw-ar-320-enlarged.png` | **PASS** |
| AR RTL · 411dp · light | `gw-ar-411.png` | **PASS** |
| FR · 320dp · light | `gw-fr-320.png` | **PASS** |
| AR role chooser · 320dp | `rolechooser-ar-320-final.png` | **PASS** |

### V-P1 — RESOLVED, on a build carrying the fix

The mark now sits on the reading edge beside its label, in every cell above.

| Screen | Before | After |
| --- | --- | --- |
| Gateway trust row | icon 24–44, text 52–296 | text 24–268, **icon 276–296** |
| Gateway links | Help 81–139, Privacy 177–239 | **Privacy 81–143, Help 181–239** |
| Role chooser card | icon 24–44, text 101–279 | text 41–219, **icon 242–268** |

Help moving to the right IS the mirror: the JSX order is Help then Privacy.

**English is byte-identical to before the fix** — Help 59–90, Privacy 128–179 —
so the neutral baseline changed nothing for LTR readers. French renders LTR
correctly with icons at 24–44.

No horizontal overflow in any cell, including 1.3x text at 320dp, measured by
walking every node's bounds rather than by looking. Enlarged text grows the row
(trust line 21px → 24px) without clipping.

The root cause and its proof are in `scripts/rtl-layout-baseline.test.mts`.

### V-P2 — RESOLVED, both role marks now mean different things

`home` for the customer, `engineering` for the professional. Rendered in Arabic
at 320dp: a house and a person, distinguishable as shapes before either label is
read — which is the whole point for a reader who depends on the mark.

### Superseded: the original V-P2 text

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

## Representative component sweep — Arabic, 320dp, on the final build

Seven surfaces rendered and measured. Every one: zero horizontal overflow, every
tap target at least 44dp, text on the reading edge.

| Surface | Evidence | Numbers | Verdict |
| --- | --- | --- | --- |
| Gateway trust rows + links | `final-gateway-ar-320.png` | icon 276–296, text 24–268; links mirrored | **PASS** |
| Role chooser cards | `rolechooser-ar-320-final.png` | text 41–219, mark 242–268 | **PASS** |
| Professional signup fields | `signup-pro-ar-320.png` | labels and hints right-aligned, overflow 0 | **PASS** |
| Consent rows | `signup-pro-ar-consents.png` | checkbox 257–283 (right), row tap 246×48 | **PASS** |
| Navigation header + back | `legal-doc-ar-320.png` | back 276–320, arrow points right | **PASS** |
| Legal document body | `legal-doc-ar-bidi-fixed.png` | bidi defect found and fixed | **PASS** after fix |
| Sign-in fields | `signin-ar-320.png` | overflow 0, CTA 272×48, no target under 44dp | **PASS** |

### Two findings that measurement dismissed

Both looked like defects in a 320px-wide screenshot and were not:

**Consent checkboxes look like 26px tap targets.** They are not — the whole row
is the pressable, 246×48. The box is only its indicator.

**The sign-in button label looked truncated** — 84px against the same string at
146px in the heading. Different font sizes: the heading's line box is 44px, the
button's is 20px, and 84px is what that string measures at button size. The
accessibility label carries the full text.

The lesson is the same one the earlier "typo" taught: **read the tree before
filing a defect from a small image.** Three times now a rendered screenshot has
suggested something the measurements disproved.

### One real defect, found by reading rather than measuring

The legal header rendered the same ISO date two different ways —
`2026-08-06` and `06-08-2026` in one sentence. Bidi reordering of
hyphen-separated digit runs. Fixed with LTR isolates and verified on device;
the web had the identical defect at five sites and now uses `<bdi>`.

Numbers alone would not have caught it: no bound was wrong, no target was small,
nothing overflowed. It needed somebody to read the sentence.

## What is still NOT proven, and why the programme row stays open

The RTL **architecture** is proven and the gateway and role chooser **pass**.
The RTL **visual certification of the product** does not, because two screens
are not a component sweep.

| Still unproven | Why it matters |
| --- | --- |
| Auth fields, consent rows, settings, lists, chat, job cards, tabs | Each is a different row shape; the gateway proves the baseline, not every consumer of it |
| Headers and back affordance | Navigation direction is wired via `LocaleDirContext` and has never been rendered |
| Modals, sheets, portals | A separately-mounted native surface may not inherit the neutral root, which would reproduce the double-authority bug in one place |
| Accessibility traversal order | Measured bounds prove visual order; they do not prove the order a screen reader announces |
| Bidi content | Arabic + phone, + EGP, + dates, + Latin names, + address are untested |
| Chat preview close | Moved to trailing without rendered evidence — it needs an authenticated conversation carrying an image |

---

# UX/UI redesign programme — 2026-09-10

Opened on the owner's assessment that the product "feels primitive and lacks a
unique yet familiar product feel", anchored on the profession/trade screens.

## What the measurement said, before any opinion

Two numbers explain most of the feeling, and neither is visible in a screenshot:

| | |
| --- | --- |
| **Type scale adoption** | 9 files used Warsha's seven-step scale; 71 did not, between them naming FIFTEEN font sizes — 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 22, 24, 26, 27, 28. One provider profile used ten of them. |
| **Selection controls** | Four screens each drew their own row, with three different heights and three ideas of what "selected" looks like. All four used a stock `check-box-outline-blank` at 26px. |

Fifteen sizes is not a hierarchy, it is the absence of one. And nearly none of
those ad-hoc sizes declared a line height, so they inherited the platform's
~1.2 — which is why the screens that skipped the scale are exactly the screens
where Arabic is crowded. Cairo has taller ascenders and deeper descenders than
Inter at the same size.

## Findings the renders produced

| Severity | Finding | Status |
| --- | --- | --- |
| **V-P1** | The role card's icon well was filled with `surfaceElevated`, which in LIGHT resolves to #FFFFFF — the same value as the `surface` card it sits in. The container did not exist in Warsha's default appearance and the mark floated in an empty column. Correct in dark, gone in light, which is why nobody had seen it. | FIXED |
| **V-P1** | The trade list presented 34 rows flat, discarding the category ordering the taxonomy has always had. For a professional who does not read fluently that is a wall. Grouped under the category names Warsha already translates, it is a handful of short sections found by heading. | FIXED |
| **V-P1** | Past the ten-trade cap, taps did nothing at all — `toggle` declined in silence, which reads as breakage rather than a rule. | FIXED |
| **V-P1** | `Alert.alert` renders in Android's stock accent, teal on a default device, with ALL CAPS buttons. Eighteen screens. Warsha's own surfaces looked designed and the moment a decision mattered the dialog looked like a different application. | FIXED at the theme |
| **V-P1** | Warsha resolved Light/Dark/System in JavaScript and never told Android, so every platform-drawn surface followed the phone. Choose Dark inside Warsha on a light phone and every dialog came back white. | FIXED |
| **V-P2** | "Selected" was a one-pixel border changing colour — close to invisible on a phone, and the only question a selection control exists to answer. | FIXED |
| **V-P2** | Worker onboarding listed every field's label, badge and reason as a manifest ABOVE the form, so each name appeared twice and on a 320dp screen the first control sat at the very bottom edge. | FIXED |
| **V-P2** | The gateway was one centred column; at 411dp that left ~700px of nothing above and below. | FIXED |
| **V-P2** | The gateway's second trust mark was `handshake` — two interlocking hands, which at 20px has no silhouette. A grey blob beside the sentence it was meant to support. | FIXED |
| **V-P2** | Chat message timestamps were 9px, below every accessibility floor; message bodies 14px on a 20px line, the tightest running text in the product, on the screen where the most reading happens. | FIXED |
| **V-P2** | "Sign in" on the role screen was a ghost button — the only route back for a returning person, rendering as a line of body text with no affordance. | FIXED |
| **V-P3** | The service-area card explained two of its three fields after the control and the third before it. | FIXED |

## Cross-surface

The web turned out to be AHEAD on one axis and behind on another. It had named
its form rhythm semantically — label to control, control to helper, field to
field — where mobile had nothing equivalent; and it had no type scale at all,
where mobile had one it was ignoring. Both now share one scale and one set of
relationships, and `test:web-brand` asserts they agree, exactly as it already
did for colour and motion.

## What is now measurable rather than argued

| Gate | What it holds |
| --- | --- |
| `test:typography` | A ratchet on hardcoded font sizes, app and web. Only falls. 369 → 273 (app), 150 → 137 (web). |
| `test:web-brand` | The two type scales and the two rhythm tables agree, step for step and leading for leading. |
| `test:android-dialog-theme` | The dialog palette is the Warsha palette, and the plugin says what it cannot fix. |
| `test:backend-target-gate` | No certification run can produce evidence about a backend it did not prove. |
| `design-sweep` flow | Both languages, both widths, with overflow, tap-target and composed-name checks per state. |

## Still open in this programme

| | |
| --- | --- |
| The trade picker itself | Redesigned but **NOT YET SEEN**: the QA account advanced past step 3, so the selector is no longer on its path. Needs reaching from the profile editor. |
| Customer journey screens | Typography converted; none rendered. |
| Job lifecycle states | `JobOperationsPanel` converted; none rendered. |
| 320dp pass on the redesign | The sweep covers it; not yet run against a build carrying all of it. |
| Dark theme | Every finding above was found in light. Dark is unrendered this programme. |
| 1.3x text scale | Unrendered this programme. |

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
API 35, running a locally built APK in supabase mode. Note that a plain `.env` build points at warsha-DEVELOPMENT, not Production — irrelevant to layout and text, which is all the evidence here depends on, but decisive for anything authenticated.

Arabic is reached with `adb shell cmd locale set-app-locales com.warsha.app
--locales ar-EG`. Setting `system_locales` alone does **not** work, and neither
does clearing app data: Warsha keeps its own language preference and defaults to
English. That per-app locale is also what exposed the mirroring defect, because
it makes the *platform* Arabic as well as the app — which is the configuration a
real Egyptian user has and the one a developer almost never tests.
