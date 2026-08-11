#!/usr/bin/env node
/**
 * Generate every raster Warsha brand asset from the canonical geometry.
 *
 * The mark exists once, in `src/brand/mark-geometry.ts`. Favicons, PWA icons,
 * Apple touch icons and the social image are rendered from it here rather than
 * maintained by hand, because hand-maintained variants drift: the reason the
 * web shipped a plain rounded square for a fortnight is that nobody could tell
 * by looking whether an asset was current.
 *
 * Run: npm run brand:generate
 *
 * The output is committed. This is not a build step — the assets change only
 * when the mark does, and a build that regenerates binaries on every run makes
 * every diff noisy and every review pointless.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// The geometry module is TypeScript; Node strips the types.
const { markSvg, MARK_CONTOUR, MARK_STROKE } = await import(
  pathToFileURL(join(root, 'src', 'brand', 'mark-geometry.ts')).href
);

const sharpPath = process.env.WARSHA_SHARP_PATH;
if (!sharpPath) {
  console.error(
    'Set WARSHA_SHARP_PATH to a directory containing `sharp`.\n'
    + 'sharp is a large native dependency and is deliberately not a project '
    + 'dependency: it is needed only when the mark itself changes.',
  );
  process.exit(2);
}
const { createRequire } = await import('node:module');
const requireFrom = createRequire(pathToFileURL(join(sharpPath, 'noop.cjs')).href);
const sharp = requireFrom('sharp');

/**
 * Every generated asset.
 *
 * `treatment` is the contrast decision, not a style preference:
 *
 * - `contoured` for anything that may land on a surface Warsha does not
 *   control — a browser tab strip, a launcher, a chat preview. Those are light
 *   as often as dark, and a bare white mark disappears on half of them.
 * - `plain` where Warsha owns the background and it is dark.
 *
 * `padding` is in viewBox units and exists for platform masks: an Android
 * adaptive foreground is cropped to roughly the middle two-thirds, so a mark
 * drawn to the edge loses its frame.
 */
const ASSETS = [
  // --- Web -----------------------------------------------------------------
  {
    file: 'web/app/icon.png',
    size: 512,
    treatment: 'contoured',
    note: 'browser tab; sits on light and dark tab strips',
  },
  {
    file: 'web/app/apple-icon.png',
    size: 180,
    treatment: 'contoured',
    padding: 3,
    note: 'iOS home screen bookmark',
  },
  {
    file: 'web/public/warsha-192.png',
    size: 192,
    treatment: 'contoured',
    note: 'PWA icon, any purpose',
  },
  {
    file: 'web/public/warsha-512.png',
    size: 512,
    treatment: 'contoured',
    note: 'PWA icon, any purpose',
  },
  {
    file: 'web/public/warsha-maskable-512.png',
    size: 512,
    treatment: 'contoured',
    // A maskable icon is cropped to a circle inscribed in the middle 80%.
    // 6 viewBox units of padding keeps the frame inside that safe zone.
    padding: 6,
    note: 'PWA maskable; padded for the launcher safe zone',
  },
  // --- Native launcher candidates -----------------------------------------
  // Not wired into app.json. Changing the launcher icon alters the store and
  // home-screen identity and needs a native rebuild to take effect, so these
  // are produced for review rather than swapped in silently. The current
  // approved icon puts the mark at roughly 48% of the canvas inside an opaque
  // black square; these compose it at a deliberate scale instead.
  {
    file: 'assets/images/candidate/warsha-icon-ios-1024.png',
    size: 1024,
    treatment: 'plain',
    padding: 4,
    background: '#080808',
    note: 'iOS requires an opaque square; mark scaled to fill it intentionally',
  },
  {
    file: 'assets/images/candidate/warsha-adaptive-foreground-1024.png',
    size: 1024,
    treatment: 'plain',
    padding: 10,
    note: 'Android adaptive foreground, transparent, safe-zone padded',
  },
  {
    file: 'assets/images/candidate/warsha-monochrome-1024.png',
    size: 1024,
    treatment: 'plain',
    ink: '#FFFFFF',
    padding: 10,
    note: 'Android 13+ themed icon; the OS tints this, so it is flat white',
  },
  {
    file: 'assets/images/candidate/warsha-mark-transparent-1024.png',
    size: 1024,
    treatment: 'contoured',
    padding: 2,
    note: 'general-purpose raster mark, transparent, contoured for any surface',
  },
  {
    file: 'web/public/warsha-og.png',
    size: 512,
    treatment: 'plain',
    background: '#080808',
    note: 'social preview; Warsha controls this canvas, so it is dark',
  },
];

let generated = 0;
for (const asset of ASSETS) {
  const svg = markSvg({
    treatment: asset.treatment,
    padding: asset.padding ?? 0,
    background: asset.background ?? null,
    ...(asset.ink ? { ink: asset.ink } : {}),
  });
  const target = join(root, asset.file);
  mkdirSync(dirname(target), { recursive: true });

  const png = await sharp(Buffer.from(svg), { density: 384 })
    .resize(asset.size, asset.size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  writeFileSync(target, png);
  generated += 1;
  console.log(
    `  ${asset.file.padEnd(38)} ${String(asset.size).padStart(3)}px `
    + `${asset.treatment.padEnd(9)} ${asset.background ? 'opaque' : 'transparent'}`,
  );
}

console.log(
  `\nGenerated ${generated} assets from the canonical mark `
  + `(stroke ${MARK_STROKE}, contour +${MARK_CONTOUR}).`,
);
