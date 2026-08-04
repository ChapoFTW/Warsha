# The Warsha Appearance System

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Authority | Below `docs/brand/WARSHA-BRAND-SYSTEM.md`; implements WPS-020 Part A |
| Source of truth | `constants/appearance.ts` |
| Enforced by | `scripts/audit-appearance.mjs`, `scripts/wps020-search-discovery-appearance.test.mts` |

The approved motto is unchanged and is not repeated on every screen:

> **YOUR WORK, OUR MISSION**
> **شغلك مهمتنا**

---

## 1. The principle

Before WPS-020, colour was decided when a JavaScript module was first evaluated.
934 references to a frozen palette meant a Warsha screen could only ever be
dark, and nothing short of a relaunch could change it.

WPS-020 changes *when* colour is decided, not what Warsha looks like. Dark is
reproduced value for value. Light is a new expression of the same system.

A component now names a **role** — `cardBackground`, `textMuted`,
`actionPrimaryBackground` — and the active theme answers. No product file may
name a colour, and the audit fails the build if one does.

## 2. Why a role and not a value

`colors.white` was used 184 times. In the dark theme it meant *the primary
action surface*: a white button with black text. Mechanically inverting it for
light mode would have produced a white button on a white card.

That single token is the whole argument. A palette of values cannot be themed,
because the value does not record what it was for. A palette of roles can.

`white` still exists, aliased to `actionPrimaryBackground`, so 184 call sites
resolve correctly in both themes without being rewritten. The audit forbids new
uses.

## 3. The three preferences

| Preference | English | Arabic | Behaviour |
| --- | --- | --- | --- |
| System | System | حسب الجهاز | Follows the device or browser, live |
| Light | Light | فاتح | Always light |
| Dark | Dark | داكن | Always dark |

`system` is persisted as `system`, never as the scheme it happens to resolve to
right now. Storing the resolved value would silently convert "follow my phone"
into "always dark" the first time it was saved — and the person would never find
out, because it would look correct until they changed their phone.

## 4. The dark theme is preserved

Every dark value is the locked "The Current" palette, unchanged:

| Role | Value |
| --- | --- |
| canvas | `#080808` |
| surface | `#141414` |
| surfaceElevated | `#191919` |
| textPrimary | `#FAFAFA` |
| textSecondary | `#B8B8B8` |
| textMuted | `#6E6E6E` |
| successText | `#2FBF71` |
| warningText | `#E8A13A` |
| errorText | `#F06455` |
| borderDefault | `rgba(250,250,250,0.14)` |

The regression suite asserts each of these literally, so a future change to the
dark theme has to be deliberate.

## 5. The light theme is designed

Not inverted. Not filtered. Three decisions carry most of its character.

**The canvas is paper, not a screen.** `#F4F2EE` — a warm off-white — instead of
pure white. Pure white at full brightness is fatiguing, and it makes a service
marketplace look like a form. Cards are then `#FFFFFF` against it, so elevation
is expressed by *lightness rising*: the same direction as the dark theme, where
surfaces also rise toward the light.

**Text is near-black, not black.** `#111111`. Pure black on pure white is the
highest-contrast pairing available and is also the harshest; near-black on warm
paper is calmer and still far above any contrast floor.

**Status colour splits into a mark and a text role.** `#2FBF71` on white is
about 2:1 and would be unreadable as text. So `successText` becomes `#17703D`
while `brandPrimary` keeps the real green for dots, ticks, and verified marks.
The brand green is still the brand green; it just stops pretending to be legible
body text.

| Role | Dark | Light |
| --- | --- | --- |
| canvas | `#080808` | `#F4F2EE` |
| surface | `#141414` | `#FFFFFF` |
| textPrimary | `#FAFAFA` | `#111111` |
| textSecondary | `#B8B8B8` | `#57544E` |
| actionPrimaryBackground | `#FAFAFA` | `#111111` |
| actionPrimaryText | `#080808` | `#FAFAFA` |
| successText | `#2FBF71` | `#17703D` |
| warningText | `#E8A13A` | `#8A5A0B` |
| errorText | `#F06455` | `#B3271A` |
| brandPrimary | `#2FBF71` | `#2FBF71` |

Four roles are identical in both themes **by design**, and the audit knows their
names: `transparent`, `actionSecondaryBackground` (a secondary action is an
outline on either ground), `brandPrimary`, and `brandOnPrimary`. Every other
role must differ, or the audit fails — a role copied between themes is almost
always a role nobody designed.

One role is deliberately dark in both: `imageScrim`. It sits over photography,
and a photograph has no theme.

## 6. The logo

The geometry is untouched. The regression suite asserts the SVG path
byte-for-byte, because "we adjusted the logo slightly for light mode" is exactly
the kind of drift a brand system exists to prevent.

Only the ink changes, and it is expressed as the surface the mark sits on:

| `variant` | Means | Dark theme | Light theme |
| --- | --- | --- | --- |
| `light` (default) | On canvas or a card | Near-white | Near-black |
| `dark` | On a filled primary surface | Near-black | Near-white |

Because `variant` describes the *surface* rather than a colour, every existing
call site stayed correct in both themes without being touched — including the
mark inside a primary button, which flips with the button.

The mark is never placed inside a permanent tile to dodge theme switching, and
it is never mirrored for RTL. The wordmark switches script; the mark does not
move.

## 7. Which surfaces Warsha actually controls

Being precise about this matters more than the feature does.

| Surface | Controlled | How |
| --- | --- | --- |
| Every Warsha screen | **Yes** | `useThemedStyles` / `useThemeColors` |
| Navigation container | **Yes** | React Navigation theme, rebuilt per appearance |
| Status bar content | **Yes** | `expo-status-bar`, `light` on dark, `dark` on light |
| Android root view and navigation bar background | **Yes** | `expo-system-ui` |
| Web document background, `theme-color`, `color-scheme` | **Yes** | Inline script before paint, then the app |
| Web form controls and scrollbars | **Yes, indirectly** | `color-scheme` on the document element |
| iOS/Android **native launch screen** | **No** | See below |
| PWA manifest `theme_color` | **No** | A manifest has one value; there is no per-scheme form |
| Keyboard appearance | **No** | Not wired; would need a per-input prop pass |

**The native launch screen stays dark in both appearances.** This is a stated
limitation, not an oversight. `expo-splash-screen` does support a `dark` variant,
but the only splash artwork that exists is a light-ink mark intended for a dark
ground; a light launch screen would show an invisible logo. Producing a dark-ink
splash asset is the brand system's authority, not WPS-020's. So: a dark launch
screen hands over to whichever appearance the app resolves.

`userInterfaceStyle` moved from `"dark"` to `"automatic"`. This was mandatory —
with it pinned to `dark`, iOS reports dark to the app regardless of the device
setting, and "System" could never have worked.

## 8. No flash, and no lost work

Two separate problems, solved separately.

**Startup.** The local preference is read *synchronously*, in the state
initializer, before the first render. There is no frame in which the app has
rendered but not yet decided. On native this is `expo-sqlite/kv-store`'s
`getItemSync`; on web it is `localStorage`, because the web build of expo-sqlite
is WASM-backed and has no synchronous read. Static web export cannot know the
visitor's choice at all, so an inline script in `<head>` paints the correct
background before React exists.

**Switching.** Changing the theme rebuilds style objects and re-renders. It does
not remount. `Stack` and every provider keep their identity, so navigation
history, scroll position, form contents, and in-flight requests all survive. The
audit asserts the root is not keyed on the scheme, because keying it would be
the obvious and completely invisible way to break this.

## 9. Accessibility rules this system enforces

- **Colour never carries meaning alone.** Availability is a filled or outlined
  dot *and* the words "Available now". Each verification is a named badge with
  its own icon.
- **Selection carries a shape.** The appearance selector uses radio semantics
  and a checked/unchecked glyph, not only a highlight.
- **Dimming is not decoration.** `opacity` below 0.5 is reserved for genuinely
  disabled controls. The result card is asserted not to dim anything.
- **Focus is visible.** `borderFocus` and `inputFocus` are first-class roles in
  both themes rather than a browser default.
- **Placeholders are readable.** `inputPlaceholder` is a designed role, not
  `textMuted` at reduced opacity.

Measured contrast has **not** been verified on a device. See
`docs/testing/WPS-020-ACCESSIBILITY-REVIEW.md`, which states exactly what was
computed and what was not.
