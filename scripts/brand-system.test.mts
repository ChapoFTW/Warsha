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
for (const [token, value] of Object.entries({
  background: '#080808',
  surface: '#141414',
  textPrimary: '#FAFAFA',
  textSecondary: '#B8B8B8',
  textMuted: '#6E6E6E',
  success: '#2FBF71',
  warning: '#E8A13A',
})) {
  assert.match(theme, new RegExp(`${token}: '${value}'`), `${token} is locked to ${value}`);
}
assert.match(theme, /xs: 4,[\s\S]*sm: 8,[\s\S]*md: 12,[\s\S]*lg: 16/, 'spacing uses the 4 px scale');
assert.match(theme, /xs: 6,[\s\S]*sm: 10,[\s\S]*md: 16,[\s\S]*lg: 22/, 'approved radius scale is present');
assert.match(theme, /Inter_400Regular/, 'Inter is configured');
assert.match(theme, /Cairo_400Regular/, 'Cairo is configured');

const svg = read('assets/brand/warsha-current-mark.svg');
assert.match(svg, /viewBox="0 0 32 32"/, 'Current mark uses the canonical view box');
assert.match(svg, /<rect[\s\S]*?<path/, 'Current mark contains its frame and flow trace');
assert.doesNotMatch(svg, /<(?:image|linearGradient|radialGradient)\b/i, 'Current mark is vector-only and gradient-free');

const brandMark = read('components/warsha/BrandMark.tsx');
for (const component of ['BrandMark', 'BrandWordmark', 'BrandLockup', 'BrandLoadingMark']) {
  assert.match(brandMark, new RegExp(`export function ${component}\\b`), `${component} is exported`);
}
assert.match(brandMark, /useReducedMotion/, 'loading mark honors reduced motion');

const appConfig = read('app.json');
const expectedAssets = new Map([
  ['assets/images/warsha-current-icon.png', 1024],
  ['assets/images/warsha-current-adaptive-foreground.png', 432],
  ['assets/images/warsha-current-monochrome.png', 432],
  ['assets/images/warsha-current-notification.png', 96],
  ['assets/images/warsha-current-favicon.png', 512],
  ['assets/images/warsha-current-splash.png', 512],
  ['public/warsha-icon-192.png', 192],
  ['public/warsha-icon-512.png', 512],
]);

for (const [asset, size] of expectedAssets) {
  assert.ok(existsSync(join(root, asset)), `${asset} exists`);
  assert.deepEqual(pngDimensions(asset), { width: size, height: size }, `${asset} has the expected dimensions`);
}
assert.doesNotMatch(appConfig, /warsha-brand-/, 'Expo config contains no legacy asset path');
for (const asset of [...expectedAssets.keys()].filter((path) => path.startsWith('assets/'))) {
  assert.match(appConfig, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${asset} is referenced by Expo config`);
}

const manifest = read('public/manifest.webmanifest');
assert.match(manifest, /"theme_color": "#080808"/, 'web manifest uses the locked theme color');
assert.match(manifest, /warsha-icon-192\.png/, 'web manifest includes the 192 px icon');
assert.match(manifest, /warsha-icon-512\.png/, 'web manifest includes the 512 px icon');
const html = read('app/+html.tsx');
assert.match(html, /manifest\.webmanifest/, 'static HTML links the web manifest');

const activeSource = sourceFiles('app').concat(sourceFiles('components')).map(read).join('\n');
assert.doesNotMatch(activeSource, /LinearGradient|BlurView|linear-gradient/i, 'active UI contains no gradients or glass blur');
assert.doesNotMatch(activeSource, /warsha-brand-/, 'active UI contains no legacy asset references');
assert.doesNotMatch(activeSource, /YOUR BUSINESS|MORE JOBS/i, 'active UI contains no obsolete tagline');

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
