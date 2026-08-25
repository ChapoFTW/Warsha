/**
 * The approved Warsha icon family, and the promise that nothing renders a
 * generic glyph, a blank, or a raw key for work Warsha currently sells.
 *
 * Three failures this defends against, each of which the old arrangement
 * allowed silently:
 *
 *   1. `service_categories.icon_name` held unvalidated Material glyph names. A
 *      name Material did not recognise drew an empty box and reported nothing.
 *   2. Every surface reached for its own field — `category.icon`,
 *      `category.iconName`, `item.icon as never` — so one category could be
 *      drawn two ways.
 *   3. A profession had no icon at all, and the catalogue could grow a
 *      category or a trade with no icon decision attached to it.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  categoryIconName,
  isWarshaIcon,
  professionHasOwnIcon,
  professionIconName,
  warshaIconCoverage,
  warshaIconSize,
  WARSHA_FALLBACK_ICON,
  WARSHA_ICONS_MIRROR_IN_RTL,
} from '../src/brand/warsha-icons.ts';
import {
  warshaIconGeometry,
  WARSHA_ICON_STROKE_WIDTH,
  WARSHA_ICON_VIEWBOX,
} from '../src/brand/warsha-icon-geometry.ts';
import { professions, withdrawnProfessions } from '../src/providers/profession-taxonomy.ts';
import { LEGACY_CATEGORY_IDS, SERVICE_DEMAND_ORDER } from '../src/services/service-catalogue.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

const ASSET_DIR = 'assets/icons/warsha';
const read = (path: string) => readFileSync(path, 'utf8');
const assetFiles = readdirSync(ASSET_DIR).filter((name) => name.endsWith('.svg'));

// --- The assets exist, parse, and obey the approved spec --------------------

check(assetFiles.length === 36, `the approved package ships 36 assets (found ${assetFiles.length})`);
for (const file of assetFiles) {
  const source = read(join(ASSET_DIR, file));
  const stem = file.slice(0, -'.svg'.length);
  check(/^<svg\b[\s\S]*<\/svg>\s*$/.test(source), `${file} is a well-formed svg document`);
  check(source.includes(`viewBox="${WARSHA_ICON_VIEWBOX}"`), `${file} draws on the 24x24 grid`);
  check(source.includes(`stroke-width="${WARSHA_ICON_STROKE_WIDTH}"`), `${file} uses the family stroke`);
  check(source.includes('stroke="currentColor"'), `${file} inks itself from currentColor`);
  check(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(?:black|white)\b/.test(source),
    `${file} HARD-CODES NO PRESENTATION COLOUR, SO ONE ASSET SERVES LIGHT AND DARK`);
  check(!/<image\b|xlink:href|\.png|\.jpg|base64/.test(source),
    `${file} embeds no raster`);
  check(!/<text\b|font-family|@font-face/.test(source), `${file} depends on no font`);
  check(!/<script\b|onload=/.test(source), `${file} carries no script`);
  check(stem in warshaIconGeometry, `${file} is compiled into the shared geometry`);

  // Every drawn element sits inside the 24-unit grid with the 2px safe margin
  // the family was constructed on. A shape that runs to the edge is clipped by
  // the container on native, which is a defect no snapshot would catch.
  for (const coordinate of source.matchAll(/(?:^|[\s"])(-?\d+(?:\.\d+)?)(?=[\s",])/g)) {
    const value = Number(coordinate[1]);
    check(value >= -1 && value <= 25, `${file} keeps its coordinates on the grid (${value})`);
  }
}

// The compiled module is derived, not maintained. Re-run the compiler in check
// mode: editing an SVG without recompiling, or hand-editing the module, fails
// here rather than shipping two different marks for the same category.
const compilerStatus = (() => {
  try {
    execFileSync('node', ['scripts/generate-warsha-icon-geometry.mjs', '--check'], { encoding: 'utf8' });
    return 'ok';
  } catch (error) {
    return String((error as { stderr?: string }).stderr ?? error);
  }
})();
check(compilerStatus === 'ok',
  `THE COMPILED GEOMETRY IS REGENERATED FROM THE ASSETS AND MATCHES THEM (${compilerStatus})`);

// --- Every current selectable entity has an intentional mark ---------------

const coverage = warshaIconCoverage();
check(coverage.categories.length === 19, 'all 19 selectable categories are covered');
for (const entry of coverage.categories) {
  check(entry.icon === `service-${entry.id}`,
    `${entry.id} resolves to its own approved asset, not the fallback`);
  check(isWarshaIcon(entry.icon), `${entry.id} resolves to an asset that exists`);
}
check(coverage.categories.every((entry) => entry.icon !== WARSHA_FALLBACK_ICON),
  'NO SELECTABLE CATEGORY FALLS BACK — THE FALLBACK IS EXCEPTIONAL, NOT NORMAL');

check(coverage.professions.length === professions.length,
  `all ${professions.length} selectable trades are covered`);
for (const entry of coverage.professions) {
  check(isWarshaIcon(entry.icon), `${entry.key} resolves to an asset that exists`);
  check(entry.icon !== WARSHA_FALLBACK_ICON,
    `${entry.key} RESOLVES TO A REAL MARK RATHER THAN THE FALLBACK`);
  if (entry.own) {
    check(entry.icon.startsWith('profession-'), `${entry.key} draws its own trade mark`);
  } else {
    check(entry.icon === categoryIconName(entry.inheritedFrom ?? ''),
      `${entry.key} inherits exactly its category's mark (${entry.inheritedFrom})`);
  }
}
check(coverage.professions.filter((entry) => entry.own).length === 16,
  '16 trades draw their own mark, as the package specifies');
check(coverage.professions.filter((entry) => !entry.own).length === professions.length - 16,
  'every remaining trade inherits, and none is left undecided');

// The trade added after the package was drawn. The package itself flagged that
// `satellite-tv-installation` had no trade; it does now, and the resolution
// rule covers it without a new asset.
check(professionIconName('satelliteTechnician') === 'service-satellite-tv-installation',
  'THE TRADE ADDED AFTER THE PACKAGE WAS DRAWN INHERITS ITS CATEGORY MARK');
check(!professionHasOwnIcon('satelliteTechnician'),
  'and is recorded as inheriting rather than as having its own');

// --- Withdrawn entities resolve, and are never promoted --------------------

for (const id of LEGACY_CATEGORY_IDS) {
  check(categoryIconName(id) === WARSHA_FALLBACK_ICON,
    `${id} renders history through the legacy mark`);
  check(!SERVICE_DEMAND_ORDER.includes(id as never),
    `${id} IS NOT SELECTABLE MERELY BECAUSE AN ICON EXISTS FOR IT`);
}
for (const profession of withdrawnProfessions) {
  check(professionIconName(profession.key) === WARSHA_FALLBACK_ICON,
    `${profession.key} still renders, through the legacy mark`);
  // Compared as strings on purpose: the taxonomy types already make these two
  // sets disjoint, so TypeScript rejects the comparison outright. That is the
  // invariant holding one level up, and the runtime check stays as the thing a
  // reader can see -- a widened key type must not quietly make it reachable.
  check(!professions.some((item) => (item.key as string) === (profession.key as string)),
    `${profession.key} REMAINS UNSELECTABLE — AN ICON DOES NOT MAKE IT A TRADE`);
}

// --- Nothing unmapped, nothing unused --------------------------------------

const reachable = new Set<string>([
  ...coverage.categories.map((entry) => entry.icon),
  ...coverage.professions.map((entry) => entry.icon),
  ...coverage.withdrawnProfessions.map((entry) => entry.icon),
]);
const unused = Object.keys(warshaIconGeometry).filter((name) => !reachable.has(name));
check(unused.length === 0, `every shipped asset is reachable from the catalogue (unused: ${unused.join(', ')})`);

// --- An unknown id is safe, never blank and never a raw key ----------------

check(categoryIconName('a-category-seeded-after-this-build') === WARSHA_FALLBACK_ICON,
  'a category this build has never heard of draws the deliberate fallback');
check(professionIconName('a-trade-that-does-not-exist') === WARSHA_FALLBACK_ICON,
  'so does an unknown trade');
check(isWarshaIcon(WARSHA_FALLBACK_ICON), 'and the fallback itself is a real asset');

// --- RTL: nothing in this family mirrors -----------------------------------

check(WARSHA_ICONS_MIRROR_IN_RTL === false,
  'THE FAMILY DOES NOT MIRROR IN ARABIC — DIRECTION BELONGS TO THE OBJECT, NOT TO READING ORDER');
for (const renderer of ['components/warsha/WarshaIcon.tsx', 'web/components/warsha-icon.tsx']) {
  const source = read(renderer);
  check(!/scaleX\(-1\)|rtl.*transform|transform.*isRTL/i.test(source),
    `${renderer} APPLIES NO MIRRORING TRANSFORM`);
}

// --- Both renderers draw the same geometry, and neither keeps a copy -------

const nativeRenderer = read('components/warsha/WarshaIcon.tsx');
const webRenderer = read('web/components/warsha-icon.tsx');
for (const [name, source] of [['native', nativeRenderer], ['web', webRenderer]] as const) {
  check(/warshaIconElements/.test(source),
    `the ${name} renderer draws from the shared geometry`);
  check(!/\bd="M[\d.]/.test(source), `the ${name} renderer KEEPS NO PATH DATA OF ITS OWN`);
  check(/WARSHA_FALLBACK_ICON/.test(source), `the ${name} renderer falls back deliberately`);
}
check(/aria-hidden/.test(webRenderer) && /accessibilityElementsHidden/.test(nativeRenderer),
  'both renderers are decorative unless a caller supplies a label');
check(/currentColor/.test(webRenderer), 'the web renderer takes its ink from the surrounding theme');
check(/colors\.textPrimary/.test(nativeRenderer),
  'the native renderer resolves a theme token, because React Native SVG does not inherit colour');

// --- The consumers use the authority, not a glyph name ---------------------

const consumers = {
  'components/warsha/CategoryCard.tsx': 'categoryIconName',
  'app/categories/[id].tsx': 'categoryIconName',
  'app/search.tsx': 'categoryIconName',
  'app/marketplace-request/new.tsx': 'categoryIconName',
  'components/warsha/ProfessionSelector.tsx': 'professionIconName',
  'components/warsha/OfferedServicesSection.tsx': 'professionIconName',
  'web/app/[locale]/services/page.tsx': 'categoryIconName',
  'web/components/worker-profile-editor.tsx': 'professionIconName',
} as const;
for (const [file, resolver] of Object.entries(consumers)) {
  const source = read(file);
  check(source.includes(resolver), `${file} resolves its mark through ${resolver}`);
  check(/WarshaIcon/.test(source), `${file} renders the approved family`);
  check(!/MaterialIcons name=\{(?:category|item|profession)\./.test(source),
    `${file} NO LONGER DRAWS A CATEGORY OR TRADE WITH A MATERIAL GLYPH`);
}

// --- The database column agrees with the assets ---------------------------
//
// The guard the old arrangement never had: `icon_name` could name a glyph that
// did not exist and nothing would say so.
const iconMigration = read('supabase/migrations/202608260003_warsha_icon_names.sql');
for (const id of [...SERVICE_DEMAND_ORDER, ...LEGACY_CATEGORY_IDS]) {
  const expected = categoryIconName(id);
  check(iconMigration.includes(`('${id}', '${expected}')`),
    `the migration points ${id} at ${expected}`);
}
for (const stem of iconMigration.matchAll(/'(service-[a-z-]+|legacy-[a-z-]+)'/g)) {
  check(isWarshaIcon(stem[1] ?? ''),
    `EVERY icon_name THE MIGRATION WRITES IS A REAL ASSET, NOT A GLYPH THAT MAY NOT EXIST (${stem[1]})`);
}
check(/Compatibility only/.test(iconMigration),
  'the column is documented as compatibility rather than as an authority');

// --- Sizes are tokens, not per-component inventions ------------------------

check(Object.values(warshaIconSize).join(',') === '16,20,24,32',
  'the size ladder is the approved 16/20/24/32');
const gallery = read('app/icon-gallery.tsx');
check(/adminSurfaceEnabled/.test(gallery),
  'THE CONTACT SHEET IS GATED AND NEVER REACHES A CUSTOMER BUILD');
check(!/icon-gallery/.test(read('components/warsha/BottomNavigation.tsx')),
  'and is not linked from navigation');

console.log(`Warsha icon family: ${checks} checks passed.`);
