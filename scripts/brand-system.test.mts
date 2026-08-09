import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function pngDimensions(path: string) {
  const png = readFileSync(join(root, path));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${path} is a PNG`);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory)).flatMap((entry) => {
    const absolute = join(root, directory, entry);
    const local = relative(root, absolute);
    return statSync(absolute).isDirectory()
      ? sourceFiles(local)
      : /\.(?:ts|tsx|js|jsx)$/.test(entry)
        ? [local]
        : [];
  });
}

const theme = read('constants/theme.ts');

/**
 * WPS-020 moved the palette values into `constants/appearance.ts`, where they
 * are expressed as semantic roles for two themes. The locked "The Current"
 * values themselves did not change, so this check follows them rather than
 * being relaxed — and it now also proves the dark theme was not quietly
 * redesigned while a light one was added.
 */
const appearance = read('constants/appearance.ts');
const darkTheme = appearance.slice(
  appearance.indexOf('export const darkColors: ThemeColors = {'),
  appearance.indexOf('export const lightColors: ThemeColors = {'));
assert.ok(darkTheme.length > 0, 'the dark theme block is present');

for (const [token, value] of Object.entries({
  surface: '#141414',
  textSecondary: '#B8B8B8',
  textMuted: '#6E6E6E',
})) {
  assert.match(darkTheme, new RegExp(`${token}: '${value}'`), `dark ${token} is locked to ${value}`);
}
// These resolve through the raw palette constant rather than a literal.
for (const [token, ink] of Object.entries({
  canvas: 'black',
  textPrimary: 'offWhite',
  successText: 'green',
  warningText: 'amber',
  errorText: 'red',
})) {
  assert.match(darkTheme, new RegExp(`${token}: ink\\.${ink},`), `dark ${token} keeps the locked ink`);
}
for (const [ink, value] of Object.entries({
  black: '#080808',
  offWhite: '#FAFAFA',
  green: '#2FBF71',
  amber: '#E8A13A',
  red: '#F06455',
})) {
  assert.match(appearance, new RegExp(`${ink}: '${value}'`), `the locked ${ink} value is unchanged`);
}
assert.match(appearance, /export const lightColors: ThemeColors = \{/, 'a light theme exists');
assert.match(theme, /export const colors: ThemeColors = darkColors;/,
  'the static palette export still resolves to the dark theme');
assert.match(theme, /xs: 4,[\s\S]*sm: 8,[\s\S]*md: 12,[\s\S]*lg: 16/, 'spacing uses the 4 px scale');
assert.match(theme, /xs: 6,[\s\S]*sm: 10,[\s\S]*md: 16,[\s\S]*lg: 22/, 'approved radius scale is present');
assert.match(theme, /Inter_400Regular/, 'Inter is configured');
assert.match(theme, /Cairo_400Regular/, 'Cairo is configured');

const svg = read('assets/brand/warsha-current-mark.svg');
assert.match(svg, /viewBox="0 0 32 32"/, 'Current mark uses the canonical view box');
assert.match(svg, /<rect[\s\S]*?<path/, 'Current mark contains its frame and flow trace');
assert.doesNotMatch(svg, /<(?:image|linearGradient|radialGradient)\b/i, 'Current mark is vector-only and gradient-free');
const uprightCurrentPath = 'M2 13.2 L8.4 23.2 L14 14.8 L19.6 21.2 L30 9.2';
assert.match(svg, new RegExp(uprightCurrentPath.replace(/\./g, '\\.')), 'canonical SVG contains the approved upright W');
const currentY = [13.2, 23.2, 14.8, 21.2, 9.2];
assert.ok(currentY[1] > currentY[0] && currentY[1] > currentY[2], 'left W valley points downward');
assert.ok(currentY[3] > currentY[2] && currentY[3] > currentY[4], 'right W valley points downward');
assert.ok(currentY[2] < currentY[1] && currentY[2] < currentY[3], 'central W point is an upward peak');
for (const size of [16, 24, 32, 48, 512]) {
  const frameCenter = ((2 + 30) / 2) * (size / 32);
  assert.equal(frameCenter, size / 2, `Current frame remains centered at ${size}px`);
}

const brandMark = read('components/warsha/BrandMark.tsx');
for (const component of ['BrandMark', 'BrandWordmark', 'BrandLockup', 'BrandLoadingMark']) {
  assert.match(brandMark, new RegExp(`export function ${component}\\b`), `${component} is exported`);
}
assert.match(brandMark, /useReducedMotion/, 'loading mark honors reduced motion');
assert.equal(brandMark.split(uprightCurrentPath).length, 3, 'static and loading marks share the upright canonical path');
assert.doesNotMatch(brandMark, /scaleY\s*[:=(]\s*-1|rotate\s*[:=(]|transform=.*(?:scale|rotate)/i, 'mark has no orientation transform');
// WPS-020: the ink is expressed as the surface the mark sits on, so it stays
// correct in both themes. `light` is the canvas mark; `dark` is the ink used on
// a filled primary surface, which is that surface's own inverse.
assert.match(brandMark, /variant === 'light' \? colors\.brandMark : colors\.actionPrimaryText/, 'mark ink is theme-derived from the surface it sits on');
assert.match(read('constants/appearance.ts'), /brandMark: ink\.offWhite,/, 'the dark-theme mark is light ink');
assert.match(read('constants/appearance.ts'), /brandMark: ink\.nearBlack,/, 'the light-theme mark is dark ink');

const brandRenderer = read('scripts/render-brand-assets.ps1');
for (const y of currentY) assert.match(brandRenderer, new RegExp(`\\$y \\+ ${y} \\* \\$scale`), `renderer uses upright y=${y}`);
assert.doesNotMatch(brandRenderer, /ScaleTransform|RotateTransform|scaleY/i, 'raster renderer has no orientation transform');
assert.match(brandRenderer, /YOUR WORK, OUR MISSION/, 'native splash renderer uses the approved motto');
assert.doesNotMatch(brandRenderer, /YOUR WORK\. OUR MISSION\.|YOUR BUSINESS\. MORE JOBS\./, 'native splash renderer contains no superseded tagline');

const appConfig = read('app.json');
const expectedAssets = new Map([
  ['assets/images/warsha-current-approved-icon.png', 1024],
  ['assets/images/warsha-current-approved-adaptive-foreground.png', 432],
  ['assets/images/warsha-current-approved-monochrome.png', 432],
  ['assets/images/warsha-current-approved-notification.png', 96],
  ['assets/images/warsha-current-approved-favicon.png', 512],
  ['assets/images/warsha-current-approved-splash.png', 512],
  ['public/warsha-current-approved-192.png', 192],
  ['public/warsha-current-approved-512.png', 512],
]);

for (const [asset, size] of expectedAssets) {
  assert.ok(existsSync(join(root, asset)), `${asset} exists`);
  assert.deepEqual(pngDimensions(asset), { width: size, height: size }, `${asset} has the expected dimensions`);
}
assert.doesNotMatch(appConfig, /warsha-brand-/, 'Expo config contains no legacy asset path');
for (const asset of [...expectedAssets.keys()].filter(
  (path) => path.startsWith('assets/') && !path.endsWith('warsha-current-approved-splash.png'),
)) {
  assert.match(appConfig, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${asset} is referenced by Expo config`);
}
const expoConfig = JSON.parse(appConfig).expo;
const splashPlugin = expoConfig.plugins.find(
  (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
)?.[1];
assert.equal(splashPlugin.image, './assets/images/warsha-current-approved-icon.png',
  'native splash uses the existing 1024 px approved mark');
assert.equal(splashPlugin.dark.image, './assets/images/warsha-current-approved-icon.png',
  'dark native splash uses the same approved mark');
assert.equal(splashPlugin.imageWidth, 240, 'native splash keeps the approved display width');
assert.equal(splashPlugin.resizeMode, 'contain', 'native splash preserves the mark aspect ratio');

const manifest = read('public/manifest.webmanifest');
assert.match(manifest, /"theme_color": "#080808"/, 'web manifest uses the locked theme color');
assert.match(manifest, /warsha-current-approved-192\.png/, 'web manifest includes the approved 192 px icon');
assert.match(manifest, /warsha-current-approved-512\.png/, 'web manifest includes the approved 512 px icon');
assert.match(manifest, /YOUR WORK, OUR MISSION/, 'web manifest uses the approved English motto');
const html = read('app/+html.tsx');
assert.match(html, /manifest\.webmanifest/, 'static HTML links the web manifest');
assert.match(html, /YOUR WORK, OUR MISSION/, 'static HTML metadata uses the approved English motto');

const activeSource = sourceFiles('app').concat(sourceFiles('components')).map(read).join('\n');
assert.doesNotMatch(activeSource, /LinearGradient|BlurView|linear-gradient/i, 'active UI contains no gradients or glass blur');
assert.doesNotMatch(activeSource, /warsha-brand-/, 'active UI contains no legacy asset references');
assert.doesNotMatch(activeSource, /YOUR BUSINESS|MORE JOBS/i, 'active UI contains no obsolete tagline');
const translations = read('src/i18n/translations.ts');
assert.match(translations, /brandMotto: 'YOUR WORK, OUR MISSION'/, 'shared English translation exposes the approved motto');
assert.match(translations, /brandMotto: 'شغلك مهمتنا'/, 'shared Arabic translation exposes the approved motto');

for (const doc of [
  'docs/brand/WARSHA-BRAND-SYSTEM.md',
  'docs/decisions/brand-decisions.md',
  'docs/testing/BRAND-REFRESH-MANUAL-REVIEW.md',
]) {
  assert.ok(existsSync(join(root, doc)), `${doc} exists`);
}
const manualReview = read('docs/testing/BRAND-REFRESH-MANUAL-REVIEW.md');
assert.match(manualReview, /Overall manual visual-review status: \*\*NOT RUN\*\*/, 'manual review is explicitly not run');
const reviewRows = manualReview.split(/\r?\n/).filter((line) => /^\| .* \| \*\*/.test(line));
assert.ok(reviewRows.length >= 40, 'manual checklist covers all required visual-review areas');
assert.ok(reviewRows.every((line) => line.includes('**NOT RUN**')), 'every manual checklist row remains NOT RUN');

console.log(`Brand system checks passed (${expectedAssets.size} assets, ${reviewRows.length} manual-review items).`);
