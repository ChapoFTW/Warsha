import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';


/**
 * Vertical rhythm has an authority on both platforms, and the primitives use it.
 *
 * Mobile always had `spacing`; web had radii and a gutter, so 981 spacing
 * declarations across 37 files invented their own pixels. These checks fail if
 * the web scale disappears, if the form primitives stop using it, or if the two
 * relationships that carry the hierarchy collapse back into a single gap.
 */

let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const read = (path: string) => readFileSync(path, 'utf8');

// --- Both platforms declare a scale -----------------------------------------
const globals = read('web/app/globals.css');
// `constants/theme.ts` imports without a file extension, so it is read as source
// rather than imported. The values are what matter, not the module graph.
const themeSource = read('constants/theme.ts');
const spacingBlock = themeSource.slice(
  themeSource.indexOf('export const spacing'),
  themeSource.indexOf('export type SpacingToken'));
const spacing: Record<string, number> = Object.fromEntries(
  [...spacingBlock.matchAll(/(\w+):\s*(\d+)/g)].map(([, key, px]) => [key, Number(px)]));
for (const token of ['xs', 'sm', 'md', 'lg', 'xl', '2xl']) {
  check(new RegExp(`--space-${token}:`).test(globals), `web declares --space-${token}`);
}
for (const token of ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const) {
  check(typeof spacing[token] === 'number', `mobile declares spacing.${token}`);
}
check(spacing.xs < spacing.sm && spacing.sm < spacing.md && spacing.md < spacing.lg
  && spacing.lg < spacing.xl && spacing.xl < spacing.xxl,
  'the mobile scale increases monotonically');

// --- The semantic relationships exist ---------------------------------------
const SEMANTIC = [
  'field-label', 'field-help', 'field-gap',
  'section-gap', 'action-gap', 'action-between', 'panel',
];
for (const token of SEMANTIC) {
  check(new RegExp(`--space-${token}:`).test(globals),
    `web names the relationship --space-${token}`);
}

const value = (token: string): number => {
  const match = globals.match(new RegExp(`--space-${token}:\\s*(\\d+)px`));
  assert.ok(match, `--space-${token} has a pixel value`);
  return Number(match![1]);
};

// The hierarchy the eye depends on, asserted as arithmetic rather than trusted.
check(value('field-help') < value('field-label'),
  'HELPER TEXT SITS CLOSER TO ITS CONTROL THAN THE LABEL DOES');
check(value('field-label') < value('field-gap'),
  'AND A LABEL IS NEARER ITS CONTROL THAN ONE FIELD IS TO THE NEXT');
check(value('action-gap') > value('field-gap'),
  'a primary action is separated more than two fields are');
check(value('panel') >= value('field-gap'),
  'panel padding is at least as generous as the rhythm inside it');

// --- The primitives actually use them ---------------------------------------
const primitives = [
  'web/components/governed-actions.module.css',
  'web/components/console-table.module.css',
  // The customer and worker product surfaces share this one.
  'web/components/product-surface.module.css',
];
for (const path of primitives) {
  const css = read(path);
  check(/\.field\s*\{[^}]*var\(--space-field-help\)/.test(css),
    `${path} builds its field gap from the token`);
  check(/\.label\s*\{[^}]*--space-field-label/.test(css),
    `${path} gives the label its extra space from the token`);
  check(!/\.field\s*\{[^}]*gap:\s*\d+px/.test(css),
    `${path} HAS NO HARDCODED FIELD GAP LEFT`);
  check(/margin-top:\s*var\(--space-action-gap\)/.test(css),
    `${path} SEPARATES ACTIONS FROM THE CONTENT ABOVE THEM`);
}

// A helper-text primitive must exist wherever forms are built, or pages borrow
// a style meant for something else — which is how a heading ended up styled as
// a field label.
for (const path of primitives) {
  check(/^\.hint\s*\{/m.test(read(path)), `${path} has a helper-text primitive`);
}
check(/^\.sectionTitle\s*\{/m.test(read('web/components/console-table.module.css')),
  'a section heading is distinct from a field label');

// --- No page reaches around the system --------------------------------------
const staffForm = read('web/components/staff-role-actions.tsx');
check(!/style=\{\{\s*flex:/.test(staffForm),
  'THE STAFF FORM NO LONGER POSITIONS FIELDS WITH INLINE FLEX STYLES');
check(/styles\.sectionTitle/.test(staffForm),
  'its heading uses the heading style, not the field label style');
check(/styles\.formActions/.test(staffForm),
  'and its submit sits in a spaced action group');

// --- Direction-safe spacing --------------------------------------------------
// Physical left/right offsets do not mirror in Arabic.
for (const path of primitives) {
  const css = read(path);
  check(!/(^|[^-])(margin|padding)-(left|right):/m.test(css),
    `${path} uses logical properties so Arabic mirrors correctly`);
}

// --- Touch targets ----------------------------------------------------------
for (const path of primitives) {
  const css = read(path);
  const targets = [...css.matchAll(/min-height:\s*(\d+)px/g)].map((m) => Number(m[1]));
  check(targets.every((height) => height >= 40),
    `${path} keeps interactive targets at a usable height`);
}

// --- Spacing is never faked with empty elements ------------------------------
const componentFiles = readdirSync('web/components')
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => join('web/components', name));
for (const path of componentFiles) {
  const source = read(path);
  check(!/<div[^>]*className=\{[^}]*spacer/i.test(source),
    `${path} creates spacing with layout, not spacer elements`);
}


// --- Responsive collapse keeps its rhythm ------------------------------------
const productSurface = read('web/components/product-surface.module.css');
check(/\.field\s*\{[^}]*margin-bottom:\s*var\(--space-field-gap\)/.test(productSurface),
  'each field carries the field-to-field gap itself, so a collapsed column keeps it');
check(/\.formGrid\s*\{[^}]*gap:\s*0 var\(--space-lg\)/.test(productSurface),
  'AND THE GRID OWNS ONLY THE COLUMN GAP, SO COLLAPSING NEVER DOUBLES THE SPACE');


// --- Marketing calls to action ----------------------------------------------
// The form primitives never governed this surface. "Start your application"
// sat directly after a paragraph with no wrapper and no top margin, so it
// touched the sentence above it. These checks fail if that returns.
const marketingCss = read('web/app/[locale]/page.module.css');
const marketingPage = read('web/app/[locale]/page.tsx');

check(/^\.ctaGroup\s*\{/m.test(marketingCss),
  'the marketing surface has a call-to-action group primitive');
check(/\.ctaGroup\s*\{[^}]*margin-top:\s*var\(--space-action-gap\)/.test(marketingCss),
  'AND IT SEPARATES THE ACTION FROM THE COPY ABOVE IT');
check(/\.ctaGroup\s*\{[^}]*gap:\s*var\(--space-action-between\)/.test(marketingCss),
  'with the shared gap between adjacent actions');
check(/\.heroActions\s*\{[^}]*margin-top:\s*var\(--space-action-gap\)/.test(marketingCss),
  'the hero actions use the same token rather than their own number');

// Every marketing call to action is inside a group. A bare `.primaryCta` or
// `.secondaryCta` is exactly the regression that shipped.
const ctaUses = [...marketingPage.matchAll(/className=\{styles\.(primaryCta|secondaryCta)\}/g)];
check(ctaUses.length > 0, 'the marketing page still renders calls to action');
const groupedRegions = [...marketingPage.matchAll(
  /className=\{styles\.(ctaGroup|heroActions)\}([\s\S]*?)<\/div>/g)]
  .map(([, , inner]) => inner).join('\n');
const groupedCtas = [...groupedRegions.matchAll(/className=\{styles\.(primaryCta|secondaryCta)\}/g)];
check(groupedCtas.length === ctaUses.length,
  `EVERY MARKETING CTA SITS IN AN ACTION GROUP (${groupedCtas.length}/${ctaUses.length})`);

// --- Auth surfaces: the customer's first impression --------------------------
for (const path of [
  'web/components/auth-panel.module.css',
  'web/components/staff-sign-in.module.css',
]) {
  const css = read(path);
  check(/\.field\s*\{[^}]*var\(--space-field-help\)/.test(css),
    `${path} uses the shared field rhythm`);
  check(/\.submit\s*\{[^}]*margin-top:\s*calc\(var\(--space-action-gap\)/.test(css),
    `${path} LIFTS ITS SUBMIT TO THE CALL-TO-ACTION SEPARATION`);
}

// --- Compact actions must not inherit CTA separation -------------------------
// Table pagination and row actions stay tight; separation is a property of the
// content-following group, never of the button itself.
const consoleCss = read('web/components/console-table.module.css');
check(!/\.pagerButtons\s*\{[^}]*var\(--space-action-gap\)/.test(consoleCss),
  'COMPACT TABLE ACTIONS DO NOT INHERIT THE CALL-TO-ACTION GAP');
check(!/\.rowLink\s*\{[^}]*margin-top:\s*var\(--space-action-gap\)/.test(consoleCss),
  'nor do inline row actions');

// The hierarchy must be visible, not merely ordered: a call to action is
// separated meaningfully more than two fields are.
check(value('action-gap') - value('field-gap') >= 8,
  'A CALL TO ACTION IS CLEARLY, NOT MARGINALLY, MORE SEPARATED THAN A FIELD');


// --- The native app was audited, not assumed ---------------------------------
// Mobile already separates actions from the copy above them using its own
// scale, so it was deliberately left unchanged. This records that, so nobody
// "fixes" mobile to mirror a web defect it never had.
const brandUi = read('components/warsha/BrandUI.tsx');
check(/emptyAction:\s*\{[^}]*marginTop:\s*spacing\.\w+/.test(brandUi),
  'THE NATIVE EMPTY-STATE ACTION IS ALREADY SEPARATED FROM ITS COPY');
const nativeButton = brandUi.slice(brandUi.indexOf('  button: {'));
const nativeButtonHeight = Number((nativeButton.match(/minHeight:\s*(\d+)/) ?? [])[1]);
check(nativeButtonHeight >= 44,
  `and the native button target is at least 44 (${nativeButtonHeight})`);
// Dimensions may be numbers; *spacing* must come from the scale.
check(!/(marginTop|marginBottom|gap|padding):\s*\d+/.test(brandUi),
  'native spacing comes from the scale, not from loose numbers');

console.log(`Spacing system: ${checks} checks passed.`);
