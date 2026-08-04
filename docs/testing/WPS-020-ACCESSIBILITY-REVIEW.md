# WPS-020 Accessibility Review — Search, Discovery & Appearance

| Field | Value |
| --- | --- |
| Specification | WPS-020 v1.0 |
| Method | Contrast ratios **computed from the palette** in `constants/appearance.ts`; structural properties asserted by `scripts/wps020-search-discovery-appearance.test.mts` |
| On-device verification | **NOT RUN** |
| Screen-reader verification | **NOT RUN** |
| Certification | **None claimed.** No accessibility audit was performed by anyone. |

Read the method line before the results. Every number below was calculated from
declared colour values using the WCAG 2.1 relative-luminance formula, with alpha
composited over the surface it actually sits on. Nothing was sampled from a
rendered screen, on any device, in any browser.

That distinction matters. A computed ratio proves the palette is sound. It says
nothing about a colour-managed display, a low-brightness OLED, a screen with a
blue-light filter on, or text rendered at a scale nobody tested.

---

## 1. Computed contrast

Threshold key: **AA** ≥ 4.5:1 (normal text) · **AA large** ≥ 3:1 (large or
non-text) · below 3:1 flagged.

| Pair | Dark | | Light | |
| --- | --- | --- | --- | --- |
| `textPrimary` on `canvas` | 19.19:1 | AA | 16.89:1 | AA |
| `textPrimary` on `surface` | 17.65:1 | AA | 18.88:1 | AA |
| `textSecondary` on `surface` | 9.29:1 | AA | 7.54:1 | AA |
| `textMuted` on `surface` | **3.61:1** | AA large | 5.55:1 | AA |
| `actionPrimaryText` on `actionPrimaryBackground` | 19.19:1 | AA | 18.09:1 | AA |
| `successText` on `successBackground` | 7.13:1 | AA | 4.78:1 | AA |
| `warningText` on `warningBackground` | 7.66:1 | AA | 4.56:1 | AA |
| `errorText` on `errorBackground` | 5.59:1 | AA | 5.07:1 | AA |
| `informationText` on `informationBackground` | 7.56:1 | AA | 5.44:1 | AA |
| `successText` on `surface` | 7.73:1 | AA | 6.14:1 | AA |
| `warningText` on `surface` | 8.41:1 | AA | 5.92:1 | AA |
| `errorText` on `surface` | 5.84:1 | AA | 6.52:1 | AA |
| `inputText` on `inputBackground` | 17.65:1 | AA | 18.88:1 | AA |
| `inputPlaceholder` on `inputBackground` | **3.61:1** | AA large | 4.85:1 | AA |
| `navigationActive` on `navigationBackground` | 17.65:1 | AA | 18.88:1 | AA |
| `navigationInactive` on `navigationBackground` | **3.61:1** | AA large | 5.55:1 | AA |
| `textDisabled` on `surface` | 2.08:1 | below 3:1 | 2.31:1 | below 3:1 |
| `actionDisabledText` on `actionDisabledBackground` | 3.04:1 | AA large | 3.56:1 | AA large |

## 2. Findings

### F1 — Three dark-theme greys fall below 4.5:1, and were **not** changed

`textMuted`, `inputPlaceholder`, and `navigationInactive` all resolve to
`#6E6E6E` and reach 3.61:1 on `surface`. They are used at 11px, which is normal
text, so this is below AA and above AA-large.

**They were left alone deliberately.** `#6E6E6E` is part of the locked "The
Current" palette, and WPS-020's authority is appearance mechanics, not the
brand's values. Darkening — lightening, here — the established dark theme to fix
a contrast ratio is a brand decision that belongs to the brand system, made
knowingly, once, for the whole product. Making it silently inside a search-and-
theme change would be the wrong way to arrive at it.

**Recorded as an open brand item.** Raising `textMuted` to roughly `#8A8A8A`
would reach 4.5:1 on `surface` while remaining recognisably muted. That is a
proposal, not a change.

### F2 — Light-theme greys **were** changed, and here is why that is consistent

The light theme is new, so its values are WPS-020's to design and nothing is
being overridden. Four were darkened during this review after the first
computation came in below threshold:

| Role | First draft | Now | Ratio on `surface` |
| --- | --- | --- | --- |
| `textMuted` | `#807C74` | `#6B6862` | 4.16 → 5.55 |
| `inputPlaceholder` | `#8E8A82` | `#75716A` | 3.44 → 4.85 |
| `navigationInactive` | `#807C74` | `#6B6862` | 4.16 → 5.55 |
| `actionDisabledText` | `#8E8A82` | `#78746C` | 2.63 → 3.56 |

The light theme therefore meets AA everywhere the dark theme does not. That
asymmetry is real and is stated rather than smoothed over.

### F3 — Disabled text is below 3:1 in both themes, by design

WCAG 1.4.3 explicitly exempts disabled controls. `textDisabled` is only applied
to genuinely disabled controls, and disabled state is never signalled by colour
alone — the control is unpressable and its label is unchanged, so a screen reader
announces it correctly regardless.

The related rule the regression suite enforces: **`opacity` below 0.5 is not a
default treatment.** "Dimmed" was becoming Warsha's way of saying "less
important", which makes both themes look tired and makes low-vision use harder.
The WPS-020 result card is asserted to contain no such dimming.

### F4 — The brand green cannot be body text on white, and no longer pretends to be

`#2FBF71` on `#FFFFFF` is 2.02:1. In light mode `successText` is therefore
`#17703D` (6.14:1) while `brandPrimary` keeps `#2FBF71` for dots, ticks, and
verified marks — non-text elements, where 3:1 applies and the mark is
accompanied by a word anyway.

## 3. Structural properties (asserted, not observed)

Each of these is enforced by the regression suite and would fail the build:

| Property | Where |
| --- | --- |
| Appearance selector uses radio semantics with a selected state | `app/appearance.tsx` |
| The resolved appearance is announced when it changes | `accessibilityLiveRegion="polite"` |
| Selection carries a shape, not only a colour | `radio-button-checked` glyph |
| Availability is announced in words, not only as a coloured dot | `DiscoveryResultCard` |
| Verification badges each carry an icon **and** a label | `DiscoveryResultCard` |
| "No reviews yet" is stated rather than shown as a bare `0` | `DiscoveryResultCard` |
| The favourite control announces its selected state | `accessibilityState` |
| Filter and sort chips announce their selected state | `app/search.tsx` |
| Sort chips are a radio group with hints explaining the ranking | `app/search.tsx` |
| Touch targets are at least 44×44 | `minHeight: 44` throughout |
| Every WPS-020 surface handles RTL | `isRTL` in all four |
| The logo is never mirrored | asserted against `BrandMark` and `BrandLogo` |
| Reduced Motion stops the loading mark | `hooks/use-reduced-motion.ts`, pre-existing |
| Focus and placeholder are first-class roles in both themes | `borderFocus`, `inputFocus`, `inputPlaceholder` |

## 4. What has not been verified

- **Nothing on a device.** No iOS, Android, or browser run of any kind.
- **No screen reader.** VoiceOver and TalkBack announcements are asserted from
  source properties, which is not the same as hearing them.
- **No keyboard traversal on web**, including RTL focus order.
- **No dynamic type testing.** Layouts are built to grow, and that has not been
  observed growing.
- **No sampled contrast** on any real display, at any brightness, with any
  accessibility filter enabled.
- **No user testing** with anyone who has a visual, motor, or cognitive
  impairment.
- **No third-party audit and no certification.**

Manual cases B15–B22 and H1–H12 in `docs/testing/WPS-020-MANUAL-ALPHA.md` cover
this ground. All of them are **NOT RUN**.
