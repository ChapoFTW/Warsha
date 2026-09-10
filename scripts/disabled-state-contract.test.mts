/**
 * A filled control must not express "disabled" with opacity alone.
 *
 * `BrandButton` used to, and the render showed why it cannot. The primary
 * variant's ground is `textPrimary` — near-black in light, near-white in dark —
 * and opacity keeps the SHAPE of a filled button while only washing it. So the
 * same 42% produced two opposite results: in light a button that looked enabled
 * but quiet, and in dark a pale slab that was the brightest element on the
 * screen. On the work picker at 0 of 10 selected, the loudest thing on the page
 * was the one control that does nothing.
 *
 * The primitive is fixed. This exists because the primitive is not the only
 * place it happens: several screens hand-roll a primary button with a
 * `colors.white` fill and their own `disabled: { opacity }`, reproducing the
 * defect one screen at a time and inheriting none of the fix.
 *
 * ## What this does NOT say
 *
 * It does not ban opacity. Fading an unfilled row or an outline button
 * genuinely recedes — the work picker's rows at the ten-selection cap do
 * exactly that and render correctly.
 *
 * And the detection is FILE-level, not element-level: it finds files where a
 * solid fill and an opacity-only disabled style both appear, which is not the
 * same as their being on the same control. `OptionRow` is in the list for that
 * reason — its solid fill is the selected tick, while the opacity fades the
 * whole row, which is right. Regex cannot tell those apart across JSX, and a
 * test that pretended otherwise would be worse than one that says so.
 *
 * So this is an inventory with a ceiling, not a verdict. Each entry is marked
 * with whether it has been read.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

/** Every .tsx under the app's own source, ignoring generated and vendor trees. */
function sources(root: string, found: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(root, entry);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (entry.endsWith('.tsx')) found.push(path.replace(/\\/g, '/'));
  }
  return found;
}

const files = [...sources('app'), ...sources('components')];
ok(files.length > 40, 'the sweep found the app source, rather than an empty tree');

/*
 * A solid fill, for this purpose, is one of the grounds that inverts between
 * themes. `colors.surface` and its neighbours move WITH the theme and stay
 * quiet at any opacity; these are the ones that become the brightest thing on
 * a dark screen.
 */
const SOLID_FILL = /backgroundColor:\s*colors\.(white|textPrimary|actionPrimaryBackground)/;
/* A disabled style whose entire body is opacity — nothing else changes. */
const OPACITY_ONLY_DISABLED = /\b\w*[Dd]isabled:\s*\{\s*opacity:\s*[\d.]+\s*\}/;

const flagged = files.filter((file) => {
  const source = readFileSync(file, 'utf8');
  return SOLID_FILL.test(source) && OPACITY_ONLY_DISABLED.test(source);
}).sort();

/*
 * READ, and confirmed: each hand-rolls a primary button whose fill is
 * `colors.white` and whose disabled state is opacity on that same button. Each
 * one reproduces the defect the primitive no longer has. Unfixed, because
 * fixing them changes how five screens look and none has been rendered this
 * programme — the fix is to use `BrandButton`, and that is a change worth
 * seeing before shipping.
 */
const CONFIRMED = [
  'app/notification-preferences.tsx',
  'app/provider-certificates.tsx',
  'app/provider-earnings.tsx',
  'app/provider-portfolio.tsx',
  'app/reset-password.tsx',
];

/*
 * Flagged by co-occurrence and NOT yet read. Some of these are very likely
 * false positives in the same way `OptionRow` is. They are listed so the number
 * is honest: this is what has not been looked at, not what is known to be
 * wrong.
 */
const UNREVIEWED = [
  'app/booking/[id].tsx',
  'app/booking/new/[providerId].tsx',
  'app/conversation/[bookingId].tsx',
  'app/marketplace-request/[id].tsx',
  'app/marketplace-request/new.tsx',
  'app/provider-job/[id].tsx',
  'app/worker-quote/[id].tsx',
  'components/warsha/BookingDisputePanel.tsx',
  'components/warsha/BookingPriceAdjustmentCard.tsx',
  'components/warsha/BookingReviewCard.tsx',
  'components/warsha/JobOperationsPanel.tsx',
  'components/warsha/ProviderReviewReply.tsx',
];

/*
 * Read, and correct as they are. Kept in the list rather than excluded from the
 * scan, so that the exemption is a written judgement somebody can disagree with
 * rather than a hole in the regex.
 */
const CLEARED = [
  // The solid fill is the selected tick; the opacity fades the whole row, which
  // is what a row at the ten-selection cap should do. Rendered and correct.
  'components/warsha/OptionRow.tsx',
];

equal(flagged, [...CONFIRMED, ...UNREVIEWED, ...CLEARED].sort(),
  'the files where a solid fill meets an opacity-only disabled style are exactly the '
  + 'known ones — a new one means a screen grew its own disabled treatment instead of '
  + 'using BrandButton');

ok(CONFIRMED.length + UNREVIEWED.length + CLEARED.length === flagged.length,
  'every flagged file is accounted for in exactly one bucket');

// --- The primitive itself is out of the woods, and must stay out -------------
{
  const source = readFileSync('components/warsha/BrandUI.tsx', 'utf8');
  ok(!OPACITY_ONLY_DISABLED.test(source),
    'BrandUI does not express disabled with opacity alone — that is the defect this file is about');
  ok(/inert:\s*\{[^}]*backgroundColor:\s*colors\.transparent/.test(source),
    'a disabled BrandButton loses its fill rather than fading behind one');
  ok(/loading:\s*\{\s*opacity/.test(source),
    'and loading stays solid: it is the action happening, not an action unavailable');
}

console.log(`Disabled-state contract: ${checks} checks passed. `
  + `${CONFIRMED.length} confirmed, ${UNREVIEWED.length} unreviewed, ${CLEARED.length} cleared.`);
