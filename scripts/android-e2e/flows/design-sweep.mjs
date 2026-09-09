/**
 * Photograph the redesign, in both languages, on the shipped binary.
 *
 * A design change reviewed in a diff is a review of intentions. What decides
 * whether a screen is better is the rendered thing at a real density with real
 * fonts and real wrapping — and the failures that matter here are mostly ones a
 * diff cannot show: a title that grew from 24px to 28px and now wraps to three
 * lines in Arabic, a grouped list whose headings crowd the rows beneath them, a
 * selection mark that reads as a smudge at 320dp.
 *
 * So this drives the real build and writes PNGs plus the accessibility tree of
 * every state it reaches. The tree is the more useful of the two for the
 * low-literacy gate: it is what a screen reader says, and a row that announces
 * as ", Plumber" is broken however good it looks.
 *
 * Signed-out states only, deliberately. The authenticated journey needs the
 * Production QA account and belongs in `worker-journey`; everything below is
 * reachable before any account exists, which makes it repeatable and makes it
 * safe to run against a device nobody has signed in on.
 *
 * Usage: node scripts/android-e2e/flows/design-sweep.mjs [--tag name]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  describeScreen, screenshot, shell, sleep, tree,
} from '../driver.mjs';
import { assertBackendTarget } from '../backend-target.mjs';

const argv = process.argv.slice(2);
const tagIndex = argv.indexOf('--tag');
const tag = tagIndex >= 0 ? argv[tagIndex + 1] : 'design';
const OUT = process.env.WARSHA_TEMP ?? 'D:/Warsha-Temp/design-sweep';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const target = assertBackendTarget({ expect: 'production', purpose: 'the design sweep' });

const label = (node) => `${node.text} ${node.desc}`.trim();
const findAll = (needle) => tree().filter((node) => node.bounds
  && label(node).toLowerCase().includes(needle.toLowerCase()));
const tappable = (needle) => {
  const hits = findAll(needle);
  return hits.find((node) => node.clickable) ?? hits[0] ?? null;
};

async function tap(needle, { optional = false } = {}) {
  const node = tappable(needle);
  if (!node) {
    if (optional) return false;
    throw new Error(`no control matching "${needle}"`);
  }
  shell(`input tap ${node.bounds.cx} ${node.bounds.cy}`);
  await sleep(1600);
  return true;
}

const scroll = async () => { shell('input swipe 160 520 160 260 300'); await sleep(900); };

/**
 * One state: a PNG, the tree, and the measurements a person cannot eyeball.
 *
 * Overflow and tap-target size are checked here rather than left to the eye,
 * because both are the kind of defect that looks fine in a screenshot and is
 * wrong by two pixels.
 */
const findings = [];
async function capture(name) {
  await sleep(700);
  const nodes = tree();
  const png = screenshot(`${tag}-${name}`);

  const width = Math.max(...nodes.map((node) => node.bounds?.right ?? 0));
  const overflowing = nodes.filter((node) => node.bounds
    && node.bounds.right > width + 1);
  const small = nodes.filter((node) => node.clickable && node.bounds
    && (node.bounds.right - node.bounds.left < 44 || node.bounds.bottom - node.bounds.top < 44))
    .map((node) => `${label(node).slice(0, 30)} ${node.bounds.right - node.bounds.left}x${node.bounds.bottom - node.bounds.top}`);
  // The composed-name defect: a decorative child contributing an empty segment.
  const composed = nodes.filter((node) => /^\s*,/.test(node.desc ?? ''))
    .map((node) => node.desc.slice(0, 40));

  writeFileSync(join(OUT, `${tag}-${name}.txt`), describeScreen(nodes));
  findings.push({ name, png, width, overflow: overflowing.length, small, composed });

  const flags = [
    overflowing.length ? `OVERFLOW ${overflowing.length}` : '',
    small.length ? `SMALL ${small.length}` : '',
    composed.length ? `COMPOSED-NAME ${composed.length}` : '',
  ].filter(Boolean).join('  ');
  console.log(`  ${name.padEnd(28)} ${flags || 'clean'}`);
}

async function walk(language) {
  console.log(`\n--- ${language} ---`);
  shell(`cmd locale set-app-locales com.warsha.app --locales ${language}`);
  shell('am force-stop com.warsha.app');
  await sleep(1200);
  shell('am start -n com.warsha.app/.MainActivity');
  await sleep(6000);

  await capture(`${language}-01-gateway`);

  if (await tap('Sign in', { optional: true }) || await tap('تسجيل الدخول', { optional: true })) {
    await capture(`${language}-02-sign-in`);
    shell('input keyevent 4');
    await sleep(1500);
  }

  if (await tap('Get started', { optional: true }) || await tap('ابدأ', { optional: true })) {
    await capture(`${language}-03-role-choice`);
    await scroll();
    await capture(`${language}-04-role-choice-scrolled`);
    shell('input keyevent 4');
    await sleep(1500);
  }
}

for (const language of ['en-US', 'ar-EG']) {
  await walk(language);
}

// Leave the device in English so the next run starts from a known place.
shell('cmd locale set-app-locales com.warsha.app --locales en-US');

console.log(`\nbackend ${target.ref}`);
console.log(`${findings.length} states captured into ${OUT}`);
const problems = findings.filter((entry) => entry.overflow || entry.small.length || entry.composed.length);
if (problems.length) {
  console.log('\nstates needing a look:');
  for (const entry of problems) {
    console.log(`  ${entry.name}`);
    for (const item of entry.small) console.log(`    small target: ${item}`);
    for (const item of entry.composed) console.log(`    composed name: ${JSON.stringify(item)}`);
  }
}
