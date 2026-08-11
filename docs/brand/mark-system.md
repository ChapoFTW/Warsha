# The Warsha mark

One drawing, two treatments, every asset generated from it.

## The mark

"The Current": a protective frame containing a concealed W-shaped flow trace.
On a 32-unit viewBox, stroked at 2.5, frame radius 7.2. It is **line art** —
nothing in it is filled.

The geometry lives in **`src/brand/mark-geometry.ts`** and nowhere else. The
web component imports it, the asset generator rasterises it, and the mobile
component draws the same values. There is no second copy to keep in sync,
because the fortnight the public site shipped a plain rounded square happened
precisely because nobody could tell by looking whether an asset was current.

## Two treatments, not two logos

The mark is **white**. What changes is whether it needs an edge.

| Surface | Treatment | Why |
| --- | --- | --- |
| Dark | **plain** — white mark alone | Already legible; an outline nobody can see costs weight everybody can |
| Light | **contoured** — white mark, thin dark edge | A white line on paper disappears |

The contour is **the same paths at a greater stroke width, drawn underneath**.
It follows the logo. It is not a box, a plate, a badge or a background, and the
audit fails the build if a filled rectangle ever appears behind the mark.

Contour weight is `+0.9` viewBox units — `0.45` per side. Chosen by looking at
it at every size Warsha ships:

| Rendered | Per side | Reads as |
| --- | --- | --- |
| 16px favicon | 0.22px | present, never muddy |
| 26px header | 0.37px | a clean edge |
| 192px PWA | 2.7px | proportional |
| 512px splash | 7.2px | still an edge, not an outline |

Heavier reads as an outline at 512 and swallows the trace at 16. That is the
failure the number exists to avoid.

## Which format where

Format follows the surface, not consistency for its own sake.

| Surface | Format | Why |
| --- | --- | --- |
| Web header, footer, in-page | **SVG**, inline | Sharp at any density; `currentColor` lets one drawing serve both themes |
| Favicon, PWA, Apple touch | **PNG**, transparent | What browsers and launchers reliably accept |
| Social / OG | **PNG**, opaque | Chat clients composite onto unknown backgrounds |
| Android / iOS launcher | **PNG** | The platforms require raster |

A clean vector is never flattened to PNG for tidiness.

## Backgrounds

**In ordinary UI the mark sits transparently on whatever surface it lands on.**
No plate, ever.

The one legitimate exception is an OS launcher icon, because iOS requires an
opaque square and Android composites a background layer itself. Even there the
composition must be deliberate — see the native section below.

## Generating assets

```
npm run brand:generate
```

`sharp` is deliberately **not** a project dependency: it is a large native
package needed only when the mark itself changes. Point the script at any
directory that has it:

```
WARSHA_SHARP_PATH=/path/with/node_modules npm run brand:generate
```

Output is committed. This is not a build step — regenerating binaries on every
build makes every diff noisy and every review pointless.

## Current native state, and what it needs

`app.json` still points at `assets/images/warsha-current-approved-*`. Those
assets **bake the mark onto an opaque black square at roughly 48% of the
canvas** — the "tiny symbol in a large black square" problem.

Replacements are generated into `assets/images/candidate/`:

| Candidate | Purpose |
| --- | --- |
| `warsha-icon-ios-1024.png` | iOS; opaque square as the platform requires, mark composed at ~78% |
| `warsha-adaptive-foreground-1024.png` | Android adaptive foreground; **transparent**, safe-zone padded |
| `warsha-monochrome-1024.png` | Android 13+ themed icon; flat white for the OS to tint |
| `warsha-mark-transparent-1024.png` | General raster mark, contoured, any surface |

They are **not wired into `app.json`**, deliberately. Adopting them changes the
store and home-screen identity and **requires a new native build** — an OTA
cannot change a launcher icon. That is a decision to take deliberately, with
the candidates in front of you, not a side effect of a web change.

Android and iOS do **not** switch launcher icons by system theme, and Warsha
does not pretend otherwise. The themed-icon candidate is the only supported
form of that, and only on Android 13+.

## What the tests prevent

`npm run test:brand-assets` (77 checks) and `npm run test:web-brand` (44):

- a generic placeholder square standing in for the mark;
- a filled rectangle baked behind the logo in ordinary UI;
- geometry drifting between web, mobile and generated rasters;
- the wrong contrast variant for a surface;
- a favicon or PWA icon shipping without transparency;
- the old baked-square asset reappearing as the web favicon;
- a service worker added merely to look like an app.
