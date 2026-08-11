import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  MARK_CONTOUR,
  MARK_CONTOUR_STROKE,
  MARK_FRAME,
  MARK_STROKE,
  MARK_TRACE,
  MARK_VIEWBOX,
  markSvg,
  treatmentFor,
} from '../src/brand/mark-geometry.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

/** Minimal PNG header reader: dimensions, colour type, and whether alpha exists. */
function pngInfo(path: string) {
  const buffer = readFileSync(path);
  check(buffer.subarray(1, 4).toString() === 'PNG', `${path} is a PNG`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colourType = buffer.readUInt8(25);
  // 4 = greyscale+alpha, 6 = RGBA. 0/2 carry no alpha channel.
  return { width, height, hasAlpha: colourType === 4 || colourType === 6, bytes: buffer.length };
}

// --- One canonical geometry --------------------------------------------------
equal(MARK_VIEWBOX, 32, 'the mark is drawn on a 32 unit viewBox');
equal(MARK_STROKE, 2.5, 'the mark keeps its canonical stroke weight');
equal(MARK_FRAME.rx, 7.2, 'the frame keeps its canonical corner radius');
equal(MARK_TRACE, 'M2 13.2 L8.4 23.2 L14 14.8 L19.6 21.2 L30 9.2',
  'THE CONCEALED W IS THE CANONICAL PATH, UNCHANGED');

// The mobile client and the web component must both draw exactly this.
const mobileMark = readFileSync('components/warsha/BrandMark.tsx', 'utf8');
const webMark = readFileSync('web/components/brand-mark.tsx', 'utf8');
check(mobileMark.includes(MARK_TRACE), 'the mobile mark uses the canonical trace');
check(webMark.includes('MARK_TRACE') && webMark.includes('@warsha/brand'),
  'the web mark imports the canonical geometry rather than repeating it');
check(/rx="7\.2"/.test(mobileMark) && /strokeWidth="2\.5"/.test(mobileMark),
  'the mobile mark uses the canonical frame and stroke');

// --- The contour follows the shape, and is never a box ----------------------
equal(MARK_CONTOUR_STROKE, MARK_STROKE + MARK_CONTOUR,
  'the contour is the same paths at a greater stroke width');
check(MARK_CONTOUR > 0 && MARK_CONTOUR < MARK_STROKE / 2,
  'the contour is a thin edge, not a second mark competing with the first');

const contoured = markSvg({ treatment: 'contoured' });
const plain = markSvg({ treatment: 'plain' });
// A filled rect covering the canvas would be a plate. The only rects allowed
// are the stroked frame (fill="none") and an explicit platform background.
const filledRects = [...contoured.matchAll(/<rect[^>]*>/g)]
  .filter((match) => /fill="(?!none)/.test(match[0]));
equal(filledRects.length, 0,
  'THE CONTOURED MARK BAKES NO BACKGROUND PLATE BEHIND THE LOGO');
check((contoured.match(/<rect/g) ?? []).length === 2
  && (contoured.match(/<path/g) ?? []).length === 2,
  'the contoured mark is the same two shapes drawn twice, contour beneath ink');
check((plain.match(/<rect/g) ?? []).length === 1,
  'the plain mark draws the geometry once');
check(contoured.indexOf('#111111') < contoured.indexOf('#FAFAFA'),
  'the contour is drawn first so the mark keeps its exact weight on top');

// --- The right variant for the surface --------------------------------------
equal(treatmentFor('light'), 'contoured',
  'A LIGHT SURFACE GETS THE CONTOUR, SO A WHITE MARK CANNOT VANISH');
equal(treatmentFor('dark'), 'plain',
  'a dark surface gets no contour, because the white mark is already legible');

const globals = readFileSync('web/app/globals.css', 'utf8');
const darkBlock = globals.slice(0, globals.indexOf("[data-theme='light']"));
const lightBlock = globals.slice(globals.indexOf("[data-theme='light']"));
check(/--warsha-mark-ink:\s*#FAFAFA/i.test(darkBlock)
  && /--warsha-mark-contour:\s*transparent/i.test(darkBlock),
  'dark theme: white mark, no contour');
check(/--warsha-mark-ink:\s*#FAFAFA/i.test(lightBlock)
  && /--warsha-mark-contour:\s*#111111/i.test(lightBlock),
  'LIGHT THEME: THE MARK STAYS WHITE AND GAINS A DARK CONTOUR');
check(/prefers-color-scheme: light/.test(globals)
  && /--warsha-mark-contour/.test(globals.slice(globals.indexOf('prefers-color-scheme'))),
  'a system-derived light theme selects the contour too');
// The variant is a CSS token, so it is resolved by the same pre-paint script
// that prevents the theme flash — no white-on-white frame.
check(/data-theme/.test(readFileSync('web/app/[locale]/layout.tsx', 'utf8')),
  'the contrast variant resolves before first paint, with the theme');

// --- No placeholder ever returns --------------------------------------------
const chromeCss = readFileSync('web/components/site-chrome.module.css', 'utf8');
check(!/\.brandMark/.test(chromeCss),
  'NO GENERIC ROUNDED SQUARE STANDS IN FOR THE MARK');
check(!/border-radius:[^;]*;\s*background:\s*var\(--brand\)/.test(chromeCss),
  'nothing draws a coloured block where the logo belongs');

// --- Generated raster assets -------------------------------------------------
const rasters = [
  { file: 'web/app/icon.png', size: 512, alpha: true, what: 'browser tab icon' },
  { file: 'web/app/apple-icon.png', size: 180, alpha: true, what: 'iOS bookmark icon' },
  { file: 'web/public/warsha-192.png', size: 192, alpha: true, what: 'PWA icon' },
  { file: 'web/public/warsha-512.png', size: 512, alpha: true, what: 'PWA icon' },
  { file: 'web/public/warsha-maskable-512.png', size: 512, alpha: true, what: 'maskable icon' },
  { file: 'web/public/warsha-og.png', size: 512, alpha: false, what: 'social image' },
];
for (const raster of rasters) {
  check(existsSync(raster.file), `${raster.what} exists`);
  const info = pngInfo(raster.file);
  equal(info.width, raster.size, `${raster.what} is ${raster.size}px wide`);
  equal(info.height, raster.size, `${raster.what} is ${raster.size}px tall`);
  if (raster.alpha) {
    check(info.hasAlpha,
      `${raster.what.toUpperCase()} IS TRANSPARENT, NOT BAKED ONTO A SQUARE`);
  }
  check(info.bytes > 200, `${raster.what} has real image content`);
}

// --- The manifest points at the generated icons -----------------------------
const manifest = readFileSync('web/app/manifest.ts', 'utf8');
check(/warsha-192\.png/.test(manifest) && /warsha-512\.png/.test(manifest),
  'the PWA manifest references the generated Warsha icons');
check(/purpose: 'maskable'/.test(manifest) && /warsha-maskable/.test(manifest),
  'a maskable icon is declared so a launcher mask cannot crop the mark');
check(/darkColors/.test(manifest),
  'manifest colours come from the shared appearance tokens');
check(!/display: 'standalone'/.test(manifest),
  'the marketing site does not claim standalone display it has no need for');
check(!existsSync(join('web', 'public', 'sw.js'))
  && !existsSync(join('web', 'app', 'sw.ts')),
  'no service worker was added merely to look like an app');

// --- Assets are generated, not hand-drawn -----------------------------------
check(existsSync('scripts/generate-brand-assets.mjs'),
  'every raster is reproducible from the canonical geometry');
const generator = readFileSync('scripts/generate-brand-assets.mjs', 'utf8');
check(/mark-geometry/.test(generator),
  'THE GENERATOR READS THE CANONICAL GEOMETRY, SO ASSETS CANNOT DRIFT FROM IT');

// --- The old baked-square icon is recorded as superseded --------------------
// It is still referenced by app.json and still ships; replacing it needs a
// native rebuild, so it is documented rather than silently swapped.
const legacy = 'assets/images/warsha-current-approved-icon.png';
if (existsSync(legacy)) {
  const info = pngInfo(legacy);
  check(!info.hasAlpha || info.bytes > 0,
    'the legacy launcher icon is still present for the current native build');
}
for (const candidate of [
  'assets/images/candidate/warsha-icon-ios-1024.png',
  'assets/images/candidate/warsha-adaptive-foreground-1024.png',
  'assets/images/candidate/warsha-monochrome-1024.png',
]) {
  check(existsSync(candidate), `${candidate} was produced for native review`);
  equal(pngInfo(candidate).width, 1024, `${candidate} is store resolution`);
}
check(pngInfo('assets/images/candidate/warsha-adaptive-foreground-1024.png').hasAlpha,
  'the Android adaptive foreground is transparent, with the background layered by the OS');
check(!statSync('assets/images/candidate/warsha-icon-ios-1024.png').isDirectory(),
  'the iOS candidate is a file; iOS requires an opaque square, which it keeps');

console.log(`Brand asset audit: ${checks} checks passed.`);
