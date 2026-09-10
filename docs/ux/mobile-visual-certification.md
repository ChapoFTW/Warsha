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

## The anchor screen, rendered

`pick-01-grouped.png` and `pick-02-selected.png`, on a DEVELOPMENT build — a
throwaway professional registered through the real signup, the real consents and
the real photo picker, because the Production QA account had already advanced
past this step. Layout and text render identically against either backend; this
is offered as evidence about the former and nothing else, and
`assertBackendTarget({ expect: 'development' })` is in the capture so it cannot
be mistaken for the Production journey's.

| | Before | After |
| --- | --- | --- |
| Structure | 34 rows, flat | Short sections under the category names customers browse — Plumbing, Electrical, Cleaning, AC repair |
| Row | Hairline rectangle, stock `check-box-outline-blank` at 26px | A card, the trade's own mark leading, the state mark trailing |
| Selected | A one-pixel border changing colour | Ground shifts to `surfaceSelected`, border thickens to 2px and darkens, mark fills solid with a tick, label goes semibold |
| Counter | Grey footnote | Legible, bidi-isolated, and it says what happens at the cap |
| Accessible names | Every trade announced `", Plumber"` | **Zero composed names**, measured on the rendered tree |

The counter renders `⁦2 / 10⁩` in the accessibility tree — U+2066 and U+2069
around the fraction, doing their job.

**One thing left unresolved rather than fixed.** The UNSELECTED mark is
`borderDefault`, 13% ink on white, which is faint on its own. Beside a selected
row it reads clearly, because the contrast between the two states is the thing
being judged. Left as it is deliberately: strengthening it would flatten exactly
the difference that makes the selected state obvious, and that trade is a
judgement worth making with more than one screen in front of you.

## Still open in this programme

| | |
| --- | --- |
| ~~The trade picker~~ | **RENDERED AND VERIFIED**, 411dp, English. See below. |
| Customer journey screens | Typography converted; none rendered. |
| Job lifecycle states | `JobOperationsPanel` converted; none rendered. |
| 320dp pass on the redesign | The sweep covers it; not yet run against a build carrying all of it. |
| Dark theme | Every finding above was found in light. Dark is unrendered this programme. |
| 1.3x text scale | Unrendered this programme. |

---

# Work-type language — 2026-09-10

The owner's reading was that the generated labels sounded machine-made:
"General plumbing", "General electrical work", "Air-conditioning work", and a
screen headed "Your work". The instruction was explicit about how NOT to fix the
category/row duplication — *"Do not solve this by renaming the row to 'General
plumbing'. That is exactly the wrong solution."*

## What the labels became

All thirty-six work labels are the plain noun, in three languages. Extra words
survive only where they separate two things: Pool maintenance beside Plumbing,
Smart-home installation beside Electrical. Arabic drops عام / أعمال / خدمات;
French drops "générale" and "travaux de".

Two English labels were naming a **material where French already named the
work**, which the render did not show and the taxonomy did:

| Key | Was | Now | Settled by |
| --- | --- | --- | --- |
| `glassWorker` | Glass · Vitrerie | **Glazing** | its four jobs are window install, window repair, glass replacement, shower cabins |
| `gypsumWorker` | Gypsum · Plâtrerie | **Plastering** | its first service is literally `renovation-plastering` |

`aluminumWorker` stays **Aluminium**, and the category keeps the heading name
**Alumetal**: `docs/product/service-demand-ranking.md` records FilKhedma, Egypt's
largest home-services platform, publishing Alumetal as a category. It is the
market's word, chosen with evidence, not jargon to clean up.

Arabic `أنظمة الأمن` → `أنظمة أمن`, matching its own practitioner label
`فني أنظمة أمن`. The definite article reads as a topic heading; the row is an
answer to a question.

## The heading, and why it is gone

**V-P2 — RESOLVED.** Category headings are removed from the picker entirely.

They were right when the rows were person nouns: "Plumbing" above Plumber and
Pool technician named something the rows did not. Plain work nouns took that
away — the category name turned out to BE one of its rows.

Two attempts to keep it, both rejected on evidence rather than taste:

| Attempt | What the evidence said |
| --- | --- |
| Drop it only where it collides with a row | The list's SHAPE became language-dependent — three headings in English, two in Arabic, four in French — because collision is a property of a translation, not of the grouping. It also left **"Flooring & tiling" directly above Tiling and Flooring**, since no single row equalled the whole heading. Visible at 411dp in `411dp-light-1.3x-en-US-list-04.png`. |
| Decide per category, recorded once | Did not escape it. The Arabic heading for `alumetal` is ألوميتال, which is exactly its own first row — caught by `scripts/profession-audience.test.mts`, not by me. One heading survived in thirty-four rows, which reads as an accident rather than as structure. |

What finds a section now is its first row — "Plumbing", full width, with an icon
and a touch target — which for a professional who does not read fluently is a
louder landmark than a grey caption, not a quieter one. The grouping is
unchanged; the spacing carries it, as it already did for the seventeen
categories that never had a heading.

## V-P1 — the disabled button was the loudest element on the screen

Found by looking, and invisible in the tokens.

`disabled` was `opacity: 0.42`, applied over a primary variant whose ground is
`textPrimary` — near-black in light, near-white in dark. Opacity preserves the
shape of a filled button and only washes it, so 42% of two opposite grounds
behaves in two opposite ways and neither is "inert":

| Theme | Evidence | What it read as |
| --- | --- | --- |
| Dark | `411dp-dark-1x-en-US-list-00.png` | A pale slab, the brightest thing on the screen — at **0 / 10 selected**, when Done does nothing |
| Light 1.3x | `411dp-light-1.3x-en-US-list-04.png` | A mid-grey filled button with a pale label — an enabled button gone quiet |

Fixed in the shared primitive: a disabled button loses its fill. Transparent
ground, quietest border, muted label. **Loading is kept separate** — a loading
button is the action happening and stays solid at 72%, refusing the press
without pretending to be unavailable.

This is a shared-primitive change, so it is certified on the work picker only;
every other disabled button in the app inherits it uncertified.

## Evidence

`D:/Warsha-Temp/wm-2026-09-10T04-38-20/`, one folder per run, stamped with when
the run started. The sweep photographs the **whole list** rather than the first
viewport and accounts for what it saw: each run prints `34/34 work labels seen`
or names the ones it never reached, so "the whole list was inspected" is proved
by the run rather than claimed about a folder of images.

| Axis | Evidence | Verdict |
| --- | --- | --- |
| EN · 411dp · dark · 1x | `411dp-dark-1x-en-US-list-00..06` | **PASS** — 34/34, no truncation, no overflow |
| EN · 411dp · light · 1.3x | `411dp-light-1.3x-en-US-list-00..07` | **PASS** — 34/34, subtitle wraps to two lines without clipping |
| AR RTL · 320dp | — | **NOT YET** — see below |
| FR · 320dp | — | **NOT YET** — see below |

## Three harness defects this exposed

Worth recording because each one produced a confident wrong answer.

**A control below the fold is not a missing control.** Arabic at 320dp reported
`create account: NOT FOUND` and gave up, while English at 411dp walked straight
through — which reads exactly like a localization defect on the screen the
low-literacy gate cares most about. The string was correct; the form is taller
than a 320dp screen and, once the consent boxes are ticked, the button sits
below the fold. The walk only looked at what was already visible. It now scrolls
before concluding anything, and photographs the screen it gave up on.

**One shared folder made a stopped run look like a live one.** Runs wrote into
one directory under a reusable tag, so a previous run's screenshots sat there
wearing the names the current run was about to write. Four-hour-old leftovers
were read as live output, a healthy sweep was declared hung, and it was killed
five minutes into its first registration. Each run now gets its own stamped
folder.

**`adb` had no timeout.** `uiautomator dump` waits for the window to report idle
and an endless animation never does, which would block the sweep indefinitely
while holding the device — neither progressing nor failing. Two minutes now, and
a stall is reported as a stall.

## Still open on this screen

| | |
| --- | --- |
| Arabic RTL at 320dp | The walk reached the work step only after the scroll fix; not yet rendered on a build carrying the removed headings. **Arabic remains a hard gate.** |
| French at 320dp | Same. French has the longest labels — `Spécialiste des revêtements de sol` at 34 characters is customer-facing, on a different surface. |
| Selected state at the 10 cap | Rendered in an earlier pass; not re-rendered since the labels changed. |
| Every other disabled button | Inherits the primitive change uncertified. |

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
