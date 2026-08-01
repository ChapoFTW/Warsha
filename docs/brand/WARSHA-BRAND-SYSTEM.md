# Warsha Brand System

## Status and authority

Status: implemented visual system, pending manual visual acceptance.

The authority order for this implementation is:

1. `docs/constitution/Warsha-Constitution.md`
2. `docs/brand/Warsha marketplace logo design.pdf`
3. this implementation guide

The product remains Warsha's independent-worker marketplace. Brand work must not alter marketplace, financial, authentication, trust, privacy, RLS, or account-isolation behavior.

## Primary mark: The Current

The Current is Warsha's sole active primary mark. It combines:

- a rounded protective frame; and
- one continuous, concealed W-shaped flow trace that enters and exits the frame.

The mark is structural rather than illustrative. It must not be replaced with tools, buildings, hard hats, construction symbols, the previous W-and-dot mark, or another trade-specific cliché.

The canonical vector is `assets/brand/warsha-current-mark.svg`. Product UI reconstructs the same geometry with `react-native-svg` in `components/warsha/BrandMark.tsx`. Raster assets are generated from the same coordinates by `scripts/render-brand-assets.ps1`; PDF screenshots are never used as product assets.

### Geometry and clear space

- Canonical view box: 32 by 32.
- Frame: x/y 2, width/height 28, corner radius 7.2, stroke 2.5.
- Flow trace: `M2 13.2 L8.4 23.2 L14 14.8 L19.6 21.2 L30 9.2`.
- In screen coordinates the first and third points are upper peaks, the second and fourth points are lower valleys, and the final point exits high. This orientation is canonical and must read as an upright W.
- Strokes use round caps and round joins.
- Minimum UI size: 16 px for the mark alone.
- Recommended clear space: at least one frame-stroke width around the mark; use a larger 4 px token at normal UI sizes.
- Do not stretch, rotate, skew, fill, outline twice, crop, add shadows, or add gradients.

## Brand components

- `BrandMark`: mark alone.
- `BrandWordmark`: localized `Warsha` or `ورشة` wordmark.
- `BrandLockup`: mark plus localized wordmark, horizontal or stacked.
- `BrandLoadingMark`: frame plus a travelling flow trace; becomes static when reduced motion is enabled.
- `BrandLogo`: compatibility wrapper for older call sites. New code should use the explicit components above.

English uses Inter. Arabic uses Cairo. Lockups follow the active app language and the surrounding RTL layout. The wordmark is never mechanically uppercased in product UI.

## Color

| Token | Value | Use |
| --- | --- | --- |
| Background | `#080808` | App and native splash background |
| Surface | `#141414` | Cards, controls, fields |
| Primary text / logo | `#FAFAFA` | Primary copy and mark |
| Secondary text | `#B8B8B8` | Supporting copy |
| Muted text | `#6E6E6E` | Metadata and disabled context |
| Success | `#2FBF71` | Verified, completed, released |
| Attention | `#E8A13A` | Restrained warnings and pending attention |

Error uses the implementation token `#F06455`, only for errors and destructive states. Success, attention, and error surfaces use approximately 13% tinted fills on dark surfaces; they are not solid color panels.

No gradients, glassmorphism, glow, blur-glass, or decorative color fills are allowed.

## Typography

- English: Inter 400, 500, 600, 700.
- Arabic: Cairo 400, 500, 600, 700.
- Display: 34/40.
- H1: 28/34.
- H2: 22/28.
- H3: 17/23.
- Body: 15/24.
- Small body: 13/20.
- Caption/label: 11/16 with restrained tracking.

Use sentence case. Labels should be short and concrete. Worker-facing Arabic must remain natural Egyptian Arabic. Do not use excessive all-caps or wide tracking in Arabic.

## Layout tokens

The spacing base is 4 px: 4, 8, 12, 16, 24, 32, and 48.

The radius scale is locked to 6, 10, 16, 22, and full-round. Use:

- 6 or 10 for compact controls and buttons;
- 10 or 16 for fields and standard cards;
- 22 for hero cards, large media, and sheets;
- full-round only for pills, avatars, and circular controls.

Elevation comes from a low-opacity black shadow plus a thin light border. Surfaces must never look glossy or translucent.

## Components and states

### Buttons

- Primary: `#FAFAFA` fill, `#080808` text.
- Secondary: transparent fill, restrained light border.
- Ghost: no border or fill.
- Destructive: error-tinted surface and error border/text.
- Minimum interactive height: 44; default branded button height: 48.
- Disabled state reduces opacity but preserves shape and label.

### Cards

Standard cards use the surface token, a 16 px radius, and restrained border light. Hero marketplace and worker cards may use 22 px. Information hierarchy must remain scope, worker, price/status, and action; brand styling must not change workflow order.

### Fields and controls

Fields use the surface token, primary input text, muted placeholder text, a 10 px radius, and an explicit label. Error text is associated with the field and announced where supported. RTL fields right-align and use Cairo.

### Badges

Verification, success, attention, error, and neutral states use the shared `StateBadge`. Avoid a badge zoo: only product states that help a person decide or act should receive a badge.

### Loading and empty states

Major loading states use `BrandLoadingMark`, never a spinner. The frame remains stable while the flow trace travels; reduced-motion users see a static mark. Empty states use a restrained outline icon, one direct title, optional supporting text, and at most one recovery action.

### Iconography and imagery

Icons are single-weight, rounded, abstract, and calm. Do not add trade-tool or stock-construction iconography. Existing marketplace/provider photography remains content, not brand decoration. Photography must retain a dark overlay when text is placed over it.

## Asset family

| Asset | Purpose |
| --- | --- |
| `warsha-current-approved-icon.png` | iOS and legacy Android app icon, 1024 px |
| `warsha-current-approved-adaptive-foreground.png` | Android adaptive foreground, 432 px transparent |
| `warsha-current-approved-monochrome.png` | Android themed icon mask, 432 px transparent |
| `warsha-current-approved-notification.png` | Android notification icon, 96 px grayscale/transparent |
| `warsha-current-approved-splash.png` | Native splash lockup, transparent |
| `warsha-current-approved-favicon.png` | Expo web favicon source |
| `public/warsha-current-approved-192.png` | Web manifest icon |
| `public/warsha-current-approved-512.png` | Web manifest icon |

`public/manifest.webmanifest` and `app/+html.tsx` connect the web asset family. The old `warsha-brand-*` PNGs are retained only as inactive repository history and must not be referenced by Expo config, product UI, generated web output, or documentation examples.

## Motion and accessibility

- UI transitions: 150-250 ms.
- Mark lockup/loading motion: 400-600 ms.
- Easing: calm cubic-bezier equivalent to `(0.4, 0, 0.2, 1)`.
- No bounce, overshoot, decorative rotation, or endless spinner.
- Reduced-motion preference disables the travelling animation.
- Interactive targets remain at least 44 by 44.
- Primary and secondary text/token pairs must be checked on physical devices before visual acceptance.

## Refresh and rebuild requirements

| Change | Required action |
| --- | --- |
| Theme, React components, or translations only | Expo restart; clear Metro cache if stale |
| Font package or font map change | Expo restart with Metro cache clear |
| App icon, adaptive icon, monochrome icon, notification icon, or native splash | Native development rebuild |
| Previously installed development build still shows an old icon/splash | Uninstall the app, then install the rebuilt binary |
| App Store/TestFlight/production icon or splash | New EAS build |
| Favicon, web manifest, or `app/+html.tsx` | New web export/deploy; hard-refresh browser cache |

Do not claim manual visual acceptance until `docs/testing/BRAND-REFRESH-MANUAL-REVIEW.md` has recorded device results.
