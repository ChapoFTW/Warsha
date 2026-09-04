import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { darkColors, lightColors } from '../constants/appearance.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

const readWeb = (...parts: string[]) => readFileSync(join('web', ...parts), 'utf8');

const mobileMark = readFileSync('components/warsha/BrandMark.tsx', 'utf8');
const webMark = readWeb('components', 'brand-mark.tsx');
const chrome = readWeb('components', 'site-chrome.tsx');
const chromeCss = readWeb('components', 'site-chrome.module.css');
const heroCss = readWeb('app', '[locale]', 'page.module.css');
const home = readWeb('app', '[locale]', 'page.tsx');
const layout = readWeb('app', '[locale]', 'layout.tsx');

// --- The mark is the real one ----------------------------------------------
// The header used a plain rounded <span> as a stand-in while the canonical
// mark already shipped on Android and iOS. These assert the web draws the same
// geometry, not a lookalike.
const geometry = [
  { name: 'frame corner radius', pattern: /rx="7\.2"/ },
  { name: 'frame stroke width', pattern: /strokeWidth="2\.5"/ },
  { name: 'frame box', pattern: /x="2"[\s\S]{0,80}width="28"[\s\S]{0,40}height="28"/ },
  { name: 'flow trace', pattern: /M2 13\.2 L8\.4 23\.2 L14 14\.8 L19\.6 21\.2 L30 9\.2/ },
  { name: '32 unit viewBox', pattern: /viewBox="0 0 32 32"/ },
];
for (const { name, pattern } of geometry) {
  check(pattern.test(mobileMark), `the mobile mark defines the ${name}`);
}
// The web no longer repeats those literals: it imports them from
// `src/brand/mark-geometry.ts`, which is stronger than matching the same
// numbers in two files and hoping they stay equal. `test:brand-assets`
// asserts that module holds the canonical values.
check(/from '@warsha\/brand'/.test(webMark),
  'THE WEB MARK IMPORTS THE CANONICAL GEOMETRY RATHER THAN RESTATING IT');
for (const symbol of ['MARK_FRAME', 'MARK_TRACE', 'MARK_STROKE', 'MARK_VIEWBOX']) {
  check(webMark.includes(symbol), `the web mark draws from ${symbol}`);
}
check(/currentColor/.test(webMark),
  'the web mark inks itself from the theme rather than hard-coding a colour');
check(!/MARK_CONTOUR|contour/i.test(webMark.replace(/\/\*[\s\S]*?\*\//g, '')),
  'THE WEB MARK DRAWS NO CONTOUR — IT CHANGES COLOUR WITH ITS SURFACE INSTEAD');
check(/BrandLockup/.test(chrome) && !/brandMark/.test(chromeCss),
  'THE HEADER RENDERS THE CANONICAL LOCKUP, NOT A PLACEHOLDER SQUARE');
check(!/border-radius:\s*7px[\s\S]{0,80}background:\s*var\(--brand\)/.test(chromeCss),
  'the generic rounded-square stand-in is gone');

// --- Header height is a consequence of not wrapping ------------------------
// Measured before the fix: 122px at 1440px, with all five labels on two lines.
check(/white-space:\s*nowrap/.test(chromeCss),
  'NAVIGATION LABELS DO NOT WRAP, WHICH IS WHAT MADE THE HEADER 122PX TALL');
const navLink = /\.navLink \{[\s\S]*?\n\}/.exec(chromeCss)?.[0] ?? '';
check(/white-space:\s*nowrap/.test(navLink), 'each navigation link is unbreakable');
check(/flex-shrink:\s*0/.test(navLink), 'navigation links are not shrunk into wrapping');
check(/min-height:\s*60px/.test(chromeCss), 'the header declares a compact fixed row height');
// The breakpoint is a CONSEQUENCE of how many labels the header carries, so
// pinning it to a number made this rule wrong the moment the public
// information architecture narrowed from five primary links to two. What must
// stay true is that inline navigation is gated behind a declared width at all,
// that the width is stated once and agreed with by the comment above it, and
// that it is high enough for the collapse to still happen on a phone.
const navBreakpoint = /--+[\s\S]{0,400}?(\d{3,4})px is where[\s\S]*?@media \(min-width: (\d{3,4})px\) \{\s*\.nav \{\s*display: flex;/
  .exec(chromeCss);
check(navBreakpoint !== null,
  'inline navigation appears only above one declared, explained width');
check(navBreakpoint?.[1] === navBreakpoint?.[2],
  'the declared breakpoint and the reason given for it are the same number');
check(Number(navBreakpoint?.[2] ?? 0) >= 720,
  'inline navigation still collapses on a phone rather than crowding the header');
check(/menuButton/.test(chromeCss) && /navPanel/.test(chromeCss),
  'below that width the navigation collapses rather than growing the header');
// Scoped to the header. The footer is *supposed* to wrap — it lays copyright
// and the preference controls on one base line and folds them onto two when
// there is not room — and a whole-file check could not tell the difference
// between that and the header defect this rule exists to prevent.
const headerCss = chromeCss.slice(0, chromeCss.indexOf('--- Footer'));
check(headerCss.length > 0, 'the header section of the stylesheet is identifiable');
check(!/flex-wrap:\s*wrap/.test(headerCss),
  'nothing in the header wraps onto a second row at any width');

// --- The disclosure is usable by keyboard ----------------------------------
const nav = readWeb('components', 'site-nav.tsx');
check(/aria-expanded=\{open\}/.test(nav) && /aria-controls=/.test(nav),
  'the menu button announces its state and what it controls');
check(/Escape/.test(nav) && /trigger\.current\?\.focus\(\)/.test(nav),
  'Escape closes the menu and returns focus to the control that opened it');
check(/aria-label=\{words\.navMenu\}/.test(nav),
  'the menu button is labelled in the reader’s language');

// --- The hero is one composition, not two blocks ----------------------------
// What this replaced: the photograph sat in its own column with the page gutter
// around all four of its edges, so it read as a rectangle pasted beside the
// text rather than as the hero. The two-column split, and the mask gradient
// that tried to soften the seam it created, are both deliberately gone.
check(/heroVisual/.test(home) && /heroText/.test(home),
  'the hero still names its picture and its copy separately');
// They are siblings now, not nested: above 900px they occupy the same grid
// cell, which is what makes the picture the composition rather than a column
// inside it.
check(/grid-area: hero/.test(heroCss),
  'THE PHOTOGRAPH AND THE COPY SHARE ONE GRID CELL, SO THE PICTURE IS THE HERO');
check(/justify-self: left/.test(heroCss),
  'the copy is placed over the room rather than on a reading edge, because the photograph is never mirrored');

// --- No gradient. Anywhere. -------------------------------------------------
// Warsha has a no-gradient rule and a mask gradient is a gradient wearing a
// different name. The previous hero dissolved one edge with `mask-image` and
// feathered two more; every one of those is forbidden here now, which is a
// strictly stronger assertion than the one it replaces.
for (const forbidden of ['mask-image', 'mask-composite', 'linear-gradient', 'radial-gradient', 'conic-gradient', 'backdrop-filter', 'blur(']) {
  check(!heroCss.includes(forbidden),
    `NO ${forbidden.toUpperCase()} IN THE HERO — WARSHA DOES NOT FADE, FEATHER OR BLUR`);
}
// The contrast treatment is one flat colour, not a transition. A gradient here
// would have a direction, and a direction would have to be mirrored in Arabic.
check(/background: rgb\(8 8 8 \/ \d+%\)/.test(heroCss),
  'the veil is a single flat wash of the canvas ink');
check((heroCss.match(/background: rgb\(8 8 8 \/ \d+%\)/g) ?? []).length === 2,
  'at exactly two strengths: one where type sits on the picture and one where it does not');

// --- The crop still reaches the work ---------------------------------------
// The rejected version cropped a landscape photograph into a 4:5 portrait,
// which cut the work out of the frame and left half a person.
check(!/aspect-ratio: 4 \/ 5/.test(heroCss),
  'NO PORTRAIT CROP OF A LANDSCAPE PHOTOGRAPH SURVIVES ANYWHERE');
for (const landscape of ['16 / 10', '2 / 1']) {
  check(heroCss.includes(`aspect-ratio: ${landscape}`),
    `the stacked composition uses the landscape ratio ${landscape} at one of its breakpoints`);
}
// Above 900px the picture takes whatever height the copy asks for, so it has no
// declared ratio at all — `cover` is what keeps it from stretching there.
check(/aspect-ratio: auto/.test(heroCss),
  'and the full-bleed composition declares no ratio, because the layout gives it one');
// The crop must reach the right of the frame, where his hands and the socket
// are; anything below ~70% shows the man without the work.
const positions = [...heroCss.matchAll(/object-position:\s*(\d+)%/g)].map((m) => Number(m[1]));
check(positions.length >= 4, 'the crop is tuned at every breakpoint');
check(positions.every((p) => p >= 70),
  'EVERY CROP REACHES THE WORK, NOT JUST THE WORKER');
// No card treatment survives: a photograph with visible edges inside a page is
// a picture of a photograph.
const visualBlock = heroCss.slice(heroCss.indexOf('.heroVisual'), heroCss.indexOf('.eyebrow'));
check(!/border-radius/.test(visualBlock), 'and is not treated as a rounded card');
check(!/box-shadow/.test(visualBlock) && !/border:/.test(visualBlock),
  'nor given a border or a shadow, which would draw the edge back on');
// The hero visual is a photograph now, not a decorative mark, so it is
// informative and carries real localized alt text rather than aria-hidden.
check(/alt={words.heroImageAlt}/.test(home),
  'THE HERO PHOTOGRAPH CARRIES LOCALIZED ALT TEXT, NOT aria-hidden');
check(!/<BrandMark size={5dd}/.test(home),
  'THE GIANT DECORATIVE MARK IS GONE FROM THE HERO');
check(/object-fit: cover/.test(heroCss) && /aspect-ratio/.test(heroCss),
  'the photograph fills a declared box, so it can neither stretch nor shift layout');
check((heroCss.match(/object-position/g) ?? []).length >= 3,
  'the crop is tuned per breakpoint so the subject survives narrow viewports');
check(!/scaleX(-1)|transform:s*scaleX/.test(heroCss),
  'THE PHOTOGRAPH IS NEVER MIRRORED FOR RTL');
// The second column is a photograph now, so it is present at every width with
// its own composition rather than dropped below 900px.
check(/@media \(min-width: 900px\)/.test(heroCss),
  'the layout still has a desktop breakpoint for the side-by-side composition');
check(!/display: none/.test(heroCss.slice(heroCss.indexOf('.heroVisual'), heroCss.indexOf('.heroPhoto'))),
  'MOBILE KEEPS THE PHOTOGRAPH RATHER THAN HIDING IT');

// --- No invented brand ------------------------------------------------------
const globals = readWeb('app', 'globals.css');
const token = (block: string, name: string) =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1].trim().toLowerCase() ?? null;
const darkBlock = globals.slice(0, globals.indexOf("[data-theme='light']"));
const lightBlock = globals.slice(globals.indexOf("[data-theme='light']"));
check(token(darkBlock, '--canvas') === darkColors.canvas.toLowerCase(),
  'the dark canvas is the mobile dark canvas');
check(token(lightBlock, '--canvas') === lightColors.canvas.toLowerCase(),
  'the light canvas is the mobile light canvas');
check(token(darkBlock, '--brand') === darkColors.brandMark.toLowerCase(),
  'THE BRAND INK IS THE MOBILE BRAND MARK COLOUR, NOT AN INVENTED ACCENT');
check(token(lightBlock, '--brand') === lightColors.brandMark.toLowerCase(),
  'the light brand ink matches mobile too');
// Warsha's identity is monochrome. A yellow or orange accent would mean
// somebody redesigned the brand rather than polishing it.
check(!/#f5c542|#ffb800|#ffc107|#e0a800/i.test(globals + chromeCss + heroCss),
  'no accent colour was introduced alongside the monochrome identity');

// --- One motion table, two platforms ----------------------------------------
// The palette is already asserted equal on both sides above. Motion is the same
// kind of value and needs the same protection: a duration that drifts on one
// platform is a product where a button on the phone and the same button in the
// browser answer a finger at different speeds, and nobody would ever file that
// as a bug.
//
// Before this pass the web had no `transition` declaration at all — six hover
// rules, every one of them snapping — so there was nothing to keep in step.
const globalsCss = readWeb('app', 'globals.css');
const motionToken = (name: string) =>
  new RegExp(String.raw`--motion-${name}:\s*([0-9.]+)ms;`).exec(globalsCss)?.[1] ?? null;

// `constants/theme.ts` is read as text rather than imported, for the same
// reason `constants/appearance.ts` is imported and it is not: theme imports its
// palette without a file extension, which Node's type stripper will not
// resolve. Parsing the numbers out is the honest way to compare two tables that
// live on two platforms.
const themeSource = readFileSync(join('constants', 'theme.ts'), 'utf8');
const nativeMotion = (name: string) =>
  Number(new RegExp(String.raw`\b${name}: (\d+),`).exec(themeSource)?.[1] ?? NaN);
const nativeEasing = /easing: \[([^\]]+)\]/.exec(themeSource)?.[1].split(',').map((v) => v.trim()) ?? [];

for (const [name, expected] of [
  ['press', nativeMotion('press')],
  ['fast', nativeMotion('quick')],
  ['standard', nativeMotion('standard')],
  ['emphasis', nativeMotion('emphasised')],
  ['brand', nativeMotion('deliberate')],
] as const) {
  check(Number(motionToken(name)) === expected,
    `the web --motion-${name} is the mobile motion value (${expected}ms), not a second opinion`);
}
check(nativeMotion('standard') === 220 && nativeEasing.length === 4,
  'the mobile motion table parsed as expected, so the comparison above means something');
const bezier = `cubic-bezier(${nativeEasing.join(', ')})`;
check(globalsCss.includes(`--ease-standard: ${bezier}`),
  'ONE EASING CURVE, AND IT IS THE ONE constants/theme.ts DECLARES');

// Motion is a response, not decoration. These are the shapes Warsha has ruled
// out, and a stylesheet is where one of them would reappear first.
for (const banned of ['cubic-bezier(0.68', 'infinite', 'alternate', 'rotate(']) {
  check(!globalsCss.includes(banned) && !heroCss.includes(banned) && !chromeCss.includes(banned),
    `NO ${banned} — WARSHA DOES NOT BOUNCE, LOOP OR ROTATE`);
}
const controlScale = Number(/controlScale: ([0-9.]+),/.exec(themeSource)?.[1] ?? NaN);
const surfaceScale = Number(/surfaceScale: ([0-9.]+),/.exec(themeSource)?.[1] ?? NaN);
check(controlScale > 0.97 && controlScale < 1 && surfaceScale > 0.96 && surfaceScale < controlScale,
  'the native press scale stays imperceptible as a number and legible as a feeling, and a surface travels further than a control');

// --- Reduced motion is honoured, delays included ----------------------------
// Crushing the duration is not enough on its own. An animation with a fill mode
// and a 190ms delay still hides its element for 190ms after the duration has
// gone to zero, so a reader who asked for less motion was shown a blank hero
// instead of a still one.
const reduced = globalsCss.slice(globalsCss.indexOf('@media (prefers-reduced-motion: reduce)'));
check(/animation-duration: 0\.01ms !important/.test(reduced), 'reduced motion collapses every duration');
check(/animation-delay: 0ms !important/.test(reduced), 'AND EVERY DELAY, OR THE HERO IS BLANK INSTEAD OF STILL');
check(/transition-delay: 0ms !important/.test(reduced), 'transitions lose their delays too');
check(/--motion-standard: 0\.01ms/.test(reduced) && /--lift-control: 0px/.test(reduced),
  'and the tokens themselves collapse, so anything reading them agrees');

// The section reveal must never be the reason content fails to appear.
const reveal = readWeb('components', 'reveal.tsx');
check(/prefers-reduced-motion: reduce/.test(reveal),
  'the reveal opts out of its own observer under reduced motion');
check(/getBoundingClientRect\(\)\.top < window\.innerHeight/.test(reveal),
  'a section already on screen is never hidden in order to be revealed');
check(/boundingClientRect\.top < 0/.test(reveal) && /100000px/.test(reveal),
  'A SECTION SCROLLED PAST WITHOUT INTERSECTING STILL ARRIVES, RATHER THAN STAYING INVISIBLE');
check(/observer\.disconnect\(\)/.test(reveal), 'and it happens once, not every time it re-enters');

// --- Browser and share branding --------------------------------------------
check(existsSync(join('web', 'app', 'icon.png')),
  'THE BROWSER TAB HAS A WARSHA ICON RATHER THAN A FRAMEWORK DEFAULT');
check(existsSync(join('web', 'app', 'apple-icon.png')), 'iOS bookmarks have a Warsha icon');
check(existsSync(join('web', 'public', 'warsha-og.png')), 'shared links carry a Warsha image');
check(/warsha-og\.png/.test(layout) && /images:/.test(layout),
  'Open Graph and Twitter metadata reference the Warsha image');
// The favicon is no longer a copy of the shipped PNG: that asset bakes the
// mark onto an opaque black square, which is exactly what a tab strip must not
// receive. It is now generated from the canonical geometry with a transparent
// background and the contour treatment, so it reads on light and dark tabs
// alike. `test:brand-assets` asserts its dimensions, transparency and origin.
const legacyFavicon = readFileSync('assets/images/warsha-current-approved-favicon.png');
check(!readFileSync(join('web', 'app', 'icon.png')).equals(legacyFavicon),
  'THE FAVICON IS NOT THE OLD BAKED-SQUARE ASSET');
check(existsSync('scripts/generate-brand-assets.mjs'),
  'the favicon is reproducible from the canonical mark');

// --- Direction ---------------------------------------------------------------
check(/inset-inline-start/.test(chromeCss) && /margin-inline-end/.test(chromeCss),
  'header layout uses logical properties, so RTL falls out of dir');
check(!/margin-left|margin-right|left:\s*\d|right:\s*\d/.test(chromeCss),
  'NO PHYSICAL DIRECTION IS HARD-CODED IN THE HEADER');
check(!/margin-left|margin-right/.test(heroCss),
  'the hero holds no physical margins that would strand Arabic');

console.log(`Web brand + composition regressions: ${checks} checks passed.`);
