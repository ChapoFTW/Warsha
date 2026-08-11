#!/usr/bin/env node
/**
 * WPS-020 appearance audit.
 *
 * Colour became a runtime decision. This proves it stayed one.
 *
 * Three properties, each of which would fail silently without a check — a
 * hardcoded colour looks completely correct in whichever theme it was written
 * for, and nobody notices until someone switches:
 *
 *   1. No product file imports the static `colors` palette. It resolves at
 *      module-evaluation time, so anything using it is frozen in dark.
 *   2. No product file contains a raw colour literal. Only the theme
 *      definition may hold one.
 *   3. Both themes define every semantic role. A missing token would be
 *      `undefined` at runtime, which React Native renders as transparent.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** The only files allowed to name a literal colour value. */
const PALETTE_FILES = new Set([
  'constants/appearance.ts',
  'constants/theme.ts',
]);

/**
 * The brand geometry is governed, not exempted.
 *
 * `src/brand/mark-geometry.ts` legitimately names the mark's ink and contour:
 * it is the canonical geometry authority, it is deliberately import-free
 * because the Node asset generator consumes it, and the mark's physical
 * appearance is not a theme-variant runtime colour.
 *
 * But "this file may hold colours" would be a blanket suppression, and the next
 * invented colour would land here unnoticed — which is exactly how an amber
 * that Warsha does not own got written once already. So the rule is narrower:
 * this file may name a colour *only if the canonical palette already defines
 * that exact value*. An arbitrary literal still fails, and the mark can no
 * longer drift away from the app it appears in.
 */
const GOVERNED_BRAND_FILES = new Set(['src/brand/mark-geometry.ts']);

/**
 * Files allowed to import the static dark palette, each for a stated reason.
 * `app/+html.tsx` is rendered at export time and has no React tree to read a
 * hook from; the appearance modules define the palettes themselves.
 */
const STATIC_PALETTE_ALLOWED = new Set([
  'app/+html.tsx',
  'constants/theme.ts',
  'constants/appearance.ts',
  'src/appearance/appearance-context.tsx',
  'hooks/use-theme-color.ts',
]);

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/;

/**
 * Every hex value the canonical palette defines, upper-cased so `#fafafa` and
 * `#FAFAFA` are the same colour — which they are, and a case difference is not
 * a reason to fail a build.
 */
const canonicalColours = new Set(
  [...readFileSync('constants/appearance.ts', 'utf8').matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
    .map((match) => match[0].toUpperCase()),
);

const files = execFileSync('git', ['ls-files', 'app', 'components', 'src', 'hooks', 'constants'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter(file => /\.tsx?$/.test(file));

const findings = [];
let scanned = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  scanned += 1;

  // 1. Static palette import.
  if (!STATIC_PALETTE_ALLOWED.has(file)) {
    const themeImport = text.match(/import \{([^}]*)\} from '@\/constants\/theme';/);
    const names = themeImport ? themeImport[1].split(',').map(part => part.trim()) : [];
    if (names.includes('colors') || names.includes('darkColors') || names.includes('lightColors')) {
      findings.push(`${file}: imports the static palette; use useThemeColors()/useThemedStyles()`);
    }
    if (/from '@\/constants\/appearance'/.test(text)) {
      findings.push(`${file}: imports the theme definition directly; use the appearance context`);
    }
  }

  // 2. Colour literals outside the palette definition.
  if (!PALETTE_FILES.has(file)) {
    const governed = GOVERNED_BRAND_FILES.has(file);
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!COLOUR_LITERAL.test(line)) continue;
      // A literal inside a comment is documentation, not a rendered colour.
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (!COLOUR_LITERAL.test(code)) continue;
      if (governed) {
        // Every literal must already exist in the canonical palette.
        for (const literal of code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
          if (!canonicalColours.has(literal.toUpperCase())) {
            findings.push(
              `${file}:${index + 1}: ${literal} is not a colour constants/appearance.ts defines`,
            );
          }
        }
        // `rgb()`/`rgba()` has no canonical form to compare against, so the
        // brand authority may not use one at all.
        if (/\brgba?\s*\(/.test(code)) {
          findings.push(`${file}:${index + 1}: the brand authority names colours as hex, not rgb()`);
        }
        continue;
      }
      findings.push(`${file}:${index + 1}: colour literal outside the theme definition`);
    }
  }
}

// 3. Token completeness. Read the source rather than importing it, so the audit
// does not need a TypeScript loader and cannot be fooled by a runtime default.
const appearance = readFileSync('constants/appearance.ts', 'utf8');
function tokenNames(blockName) {
  const start = appearance.indexOf(`export const ${blockName}: ThemeColors = {`);
  if (start < 0) return null;
  const end = appearance.indexOf('\n};', start);
  return new Set([...appearance.slice(start, end).matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map(match => match[1]));
}
const typeStart = appearance.indexOf('export type ThemeColors = {');
const typeEnd = appearance.indexOf('\n};', typeStart);
const declared = new Set([...appearance.slice(typeStart, typeEnd).matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map(m => m[1]));
const dark = tokenNames('darkColors');
const light = tokenNames('lightColors');

if (!dark || !light) {
  findings.push('constants/appearance.ts: could not read darkColors and lightColors');
} else {
  for (const token of declared) {
    if (!dark.has(token)) findings.push(`darkColors is missing the "${token}" role`);
    if (!light.has(token)) findings.push(`lightColors is missing the "${token}" role`);
  }
  for (const token of light) {
    if (!dark.has(token)) findings.push(`darkColors is missing the "${token}" role defined in light`);
  }
  // A role with the same value in both themes is usually a role that was
  // copied rather than designed. Four are deliberate exceptions: transparency
  // has no theme, a secondary action is an outline on both grounds, and the
  // brand green is the brand green whatever it sits on.
  const SHARED_BY_DESIGN = new Set([
    'transparent', 'actionSecondaryBackground', 'brandPrimary', 'brandOnPrimary',
  ]);
  const valueOf = (block, token) => {
    const start = appearance.indexOf(`export const ${block}: ThemeColors = {`);
    const end = appearance.indexOf('\n};', start);
    const match = appearance.slice(start, end).match(new RegExp(`^\\s{2}${token}:\\s*(.+?),\\s*$`, 'm'));
    return match ? match[1] : null;
  };
  let identical = 0;
  for (const token of declared) {
    if (SHARED_BY_DESIGN.has(token)) continue;
    const a = valueOf('darkColors', token);
    const b = valueOf('lightColors', token);
    if (a !== null && a === b) identical += 1;
  }
  if (identical > 0) {
    findings.push(`${identical} role(s) hold an identical value in both themes; a designed light theme should differ`);
  }
}

if (findings.length) {
  console.error('Appearance audit failed:');
  for (const finding of [...new Set(findings)]) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log(`Appearance audit clean: ${scanned} files, ${declared.size} semantic roles defined in both themes, no colour literal outside the theme definition.`);
