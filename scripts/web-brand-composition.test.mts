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

// --- Hero uses both columns -------------------------------------------------
// Measured before the fix: the headline occupied 557px of a 1440px viewport
// and the rest of the row was empty.
check(/heroVisual/.test(home) && /heroText/.test(home),
  'the hero is a deliberate two-column composition');
// The photograph carries environment as well as the subject, so it takes
// marginally the larger share: text 47%, image 53%.
check(/grid-template-columns: minmax\(0, 0\.47fr\) minmax\(0, 0\.53fr\)/.test(heroCss),
  'THE PHOTOGRAPH GETS THE LARGER COLUMN, SINCE IT CARRIES THE CONTEXT');
// The rejected version cropped a landscape photograph into a 4:5 portrait,
// which cut the work out of the frame and left half a person.
check(!/aspect-ratio: 4 \/ 5/.test(heroCss),
  'NO PORTRAIT CROP OF A LANDSCAPE PHOTOGRAPH SURVIVES ANYWHERE');
for (const landscape of ['16 / 10', '3 / 2', '2 / 1']) {
  check(heroCss.includes(`aspect-ratio: ${landscape}`),
    `the hero uses the landscape ratio ${landscape} at one of its breakpoints`);
}
// The crop must reach the right of the frame, where his hands and the socket
// are; anything below ~70% shows the man without the work.
const positions = [...heroCss.matchAll(/object-position:\s*(\d+)%/g)].map((m) => Number(m[1]));
check(positions.length >= 4, 'the crop is tuned at every breakpoint');
check(positions.every((p) => p >= 70),
  'EVERY CROP REACHES THE WORK, NOT JUST THE WORKER');
// The blend: the empty-room side dissolves, and the subject is never faded.
check(/mask-image/.test(heroCss) && /mask-composite/.test(heroCss),
  'the photograph is masked into the page rather than sitting on it as a card');
check(!/border-radius/.test(heroCss.slice(heroCss.indexOf('.heroVisual'), heroCss.indexOf('.eyebrow'))),
  'and is not treated as a rounded card');
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
