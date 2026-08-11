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
  check(pattern.test(webMark), `THE WEB MARK USES THE SAME ${name.toUpperCase()} AS ANDROID AND iOS`);
}
check(/currentColor/.test(webMark),
  'the web mark inks itself from the theme rather than hard-coding a colour');
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
check(/@media \(min-width: 1140px\)/.test(chromeCss),
  'inline navigation appears only where the labels genuinely fit');
check(/menuButton/.test(chromeCss) && /navPanel/.test(chromeCss),
  'below that width the navigation collapses rather than growing the header');
check(!/flex-wrap:\s*wrap/.test(chromeCss),
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
check(/grid-template-columns: minmax\(0, 1\.05fr\) minmax\(0, 0\.95fr\)/.test(heroCss),
  'THE HERO GIVES THE SECOND COLUMN REAL WIDTH RATHER THAN LEAVING DEAD SPACE');
check(/aria-hidden="true"/.test(home),
  'the decorative visual is hidden from assistive technology');
check(/mask-image: radial-gradient/.test(heroCss),
  'the visual dissolves into the canvas instead of ending on a hard crop');
check(/@media \(min-width: 900px\)/.test(heroCss),
  'the second column appears only where it has room; it is dropped, never squashed');
check(/opacity: 0\.1[0-9]?/.test(heroCss),
  'the mark sits behind the headline rather than competing with it');

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
// The icons must be the approved brand files, not a re-export of something else.
const approved = readFileSync('assets/images/warsha-current-approved-favicon.png');
check(readFileSync(join('web', 'app', 'icon.png')).equals(approved),
  'the favicon is byte-identical to the approved brand favicon the app ships');

// --- Direction ---------------------------------------------------------------
check(/inset-inline-start/.test(chromeCss) && /margin-inline-end/.test(chromeCss),
  'header layout uses logical properties, so RTL falls out of dir');
check(!/margin-left|margin-right|left:\s*\d|right:\s*\d/.test(chromeCss),
  'NO PHYSICAL DIRECTION IS HARD-CODED IN THE HEADER');
check(!/margin-left|margin-right/.test(heroCss),
  'the hero holds no physical margins that would strand Arabic');

console.log(`Web brand + composition regressions: ${checks} checks passed.`);
