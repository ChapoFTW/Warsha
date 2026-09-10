/**
 * Photograph the redesign, in both languages and at both widths, on the
 * shipped binary.
 *
 * A design change reviewed in a diff is a review of intentions. What decides
 * whether a screen is better is the rendered thing at a real density with real
 * fonts and real wrapping — and the failures that matter here are mostly ones a
 * diff cannot show: a title that grew from 24px to 28px and now wraps to three
 * lines in Arabic, a grouped list whose headings crowd the rows beneath them, a
 * selection mark that reads as a smudge.
 *
 * Both widths, because a phone is not one shape. 411dp is the ordinary Android
 * phone and 320dp is the floor Warsha supports, and every layout defect this
 * programme has found so far appeared at one and not the other: the role card's
 * invisible icon well showed at 411dp, the service-area form pushed its first
 * control off the bottom at 320dp.
 *
 * Signed-out states only, deliberately. The authenticated journey needs the
 * Production QA account and belongs in a flow that loads it; everything below
 * is reachable before any account exists, which makes it repeatable and safe to
 * run against a device nobody has signed in on.
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

/**
 * The controls this walk needs, named in each language.
 *
 * Read off the rendered accessibility tree rather than guessed from the
 * translation file: the first version of this looked for "Sign in" on a screen
 * whose button says "I already have an account", found nothing, and reported a
 * clean sweep of two states instead of four.
 */
const CONTROLS = {
  'en-US': { signIn: 'I already have an account', start: 'Get started', back: 'Sign in' },
  'ar-EG': { signIn: 'عندي حساب بالفعل', start: 'يلا نبدأ', back: 'تسجيل الدخول' },
};

/** 320dp is Warsha's floor; 411dp is the ordinary phone this AVD reports. */
const VIEWPORTS = [
  { name: '411dp', size: '1080x2400', density: 420 },
  { name: '320dp', size: '720x1600', density: 360 },
];

const label = (node) => `${node.text} ${node.desc}`.trim();
const findAll = (needle) => tree().filter((node) => node.bounds
  && label(node).toLowerCase().includes(needle.toLowerCase()));
const tappable = (needle) => {
  const hits = findAll(needle);
  return hits.find((node) => node.clickable) ?? hits[0] ?? null;
};

async function tap(needle, { optional = false, settle = 1800 } = {}) {
  const node = tappable(needle);
  if (!node) {
    if (optional) return false;
    throw new Error(`no control matching "${needle}"`);
  }
  shell(`input tap ${node.bounds.cx} ${node.bounds.cy}`);
  await sleep(settle);
  return true;
}

const findings = [];

/**
 * One state: a PNG, the tree, and the measurements a person cannot eyeball.
 *
 * Overflow and tap-target size are checked here rather than left to the eye,
 * because both are the kind of defect that looks fine in a screenshot and is
 * wrong by two pixels.
 */
async function capture(name) {
  await sleep(800);
  const nodes = tree();
  const png = screenshot(`${tag}-${name}`);

  const width = Math.max(...nodes.map((node) => node.bounds?.right ?? 0));
  const overflowing = nodes.filter((node) => node.bounds && node.bounds.right > width + 1);
  const small = nodes.filter((node) => node.clickable && node.bounds
    && (node.bounds.right - node.bounds.left < 44 || node.bounds.bottom - node.bounds.top < 44))
    .map((node) => `${label(node).slice(0, 30)} ${node.bounds.right - node.bounds.left}x${node.bounds.bottom - node.bounds.top}`);
  // A decorative child contributing an empty segment to a composed name.
  const composed = nodes.filter((node) => /^\s*,/.test(node.desc ?? ''))
    .map((node) => node.desc.slice(0, 40));

  writeFileSync(join(OUT, `${tag}-${name}.txt`), describeScreen(nodes));
  findings.push({ name, png, overflow: overflowing.length, small, composed });

  const flags = [
    overflowing.length ? `OVERFLOW ${overflowing.length}` : '',
    small.length ? `SMALL ${small.length}` : '',
    composed.length ? `COMPOSED-NAME ${composed.length}` : '',
  ].filter(Boolean).join('  ');
  console.log(`  ${name.padEnd(34)} ${flags || 'clean'}`);
}

async function walk(viewport, language) {
  const controls = CONTROLS[language];
  console.log(`\n--- ${viewport.name} ${language} ---`);

  shell(`cmd locale set-app-locales com.warsha.app --locales ${language}`);
  shell('am force-stop com.warsha.app');
  await sleep(1400);
  shell('am start -n com.warsha.app/.MainActivity');
  await sleep(7000);

  await capture(`${viewport.name}-${language}-01-gateway`);

  if (await tap(controls.signIn, { optional: true })) {
    await capture(`${viewport.name}-${language}-02-sign-in`);
    shell('input keyevent 4');
    await sleep(1800);
  }

  if (await tap(controls.start, { optional: true })) {
    await capture(`${viewport.name}-${language}-03-role-choice`);
    shell('input keyevent 4');
    await sleep(1800);
  }
}

for (const viewport of VIEWPORTS) {
  shell(`wm size ${viewport.size}`);
  shell(`wm density ${viewport.density}`);
  await sleep(2500);
  for (const language of ['en-US', 'ar-EG']) {
    await walk(viewport, language);
  }
}

// Leave the device as it was found: English, and the AVD's own dimensions.
shell('cmd locale set-app-locales com.warsha.app --locales en-US');
shell('wm size reset');
shell('wm density reset');

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
