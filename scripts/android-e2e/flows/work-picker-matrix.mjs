/**
 * Photograph the work picker on every axis it has to survive.
 *
 * The picker is where a professional says what they do, and it is the screen
 * the redesign was anchored on. It is also the one most exposed to the axes:
 * long Arabic and French work labels at 320dp, category headings that appear
 * only for multi-row groups, a selection state expressed in three channels at
 * once — each of which can be right in one configuration and wrong in another.
 *
 * A development build, and asserted as one. Reaching this screen means
 * registering a professional and uploading a photograph, which belongs in
 * development; what it proves is layout and text, which render identically
 * against any backend.
 *
 * Usage: node scripts/android-e2e/flows/work-picker-matrix.mjs [--tag name]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describeScreen, screenshot, setText, shell, sleep, tree } from '../driver.mjs';
import { assertBackendTarget } from '../backend-target.mjs';
import { installPhotoFixture } from '../photo-fixture.mjs';
import { acceptAllConsents } from '../consents.mjs';
import { apply, combinations, resetDevice, VIEWPORTS } from '../appearance-matrix.mjs';

const argv = process.argv.slice(2);
const tagIndex = argv.indexOf('--tag');
const tag = tagIndex >= 0 ? argv[tagIndex + 1] : 'work';
const OUT = process.env.WARSHA_TEMP ?? 'D:/Warsha-Temp/design-sweep';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

assertBackendTarget({ expect: 'development', purpose: 'the work-picker matrix' });

const label = (node) => `${node.text} ${node.desc}`.trim();

function target(names) {
  const nodes = tree();
  for (const needle of [names].flat()) {
    const hits = nodes.filter((node) => node.bounds
      && label(node).toLowerCase().includes(needle.toLowerCase()));
    const found = hits.find((node) => node.clickable) ?? hits[0];
    if (found) return found;
  }
  return null;
}

async function tap(names, { optional = false, settle = 2400 } = {}) {
  const node = target(names);
  if (!node) {
    if (optional) return false;
    throw new Error(`no control matching ${JSON.stringify([names].flat())}`);
  }
  shell(`input tap ${node.bounds.cx} ${node.bounds.cy}`);
  await sleep(settle);
  return true;
}

/**
 * Wait for the screen to STOP CHANGING, not for a fixed number of seconds.
 *
 * The first version waited for "not loading, and at least four labels", which a
 * half-drawn screen satisfies. It tapped into transitions and reported "could
 * not reach the work step" with no indication of which hop failed — a
 * diagnostic that costs more than it saves.
 */
async function settleScreen({ timeout = 45_000 } = {}) {
  const deadline = Date.now() + timeout;
  let previous = '';
  while (Date.now() < deadline) {
    const now = describeScreen(tree());
    if (now === previous && now.trim().length > 40
      && !/Loading Warsha|تحميل|Chargement/i.test(now)) return true;
    previous = now;
    await sleep(1500);
  }
  return false;
}

/** Controls named in every language this walks. */
const START = ['Get started', 'يلا نبدأ', 'Commencer', 'C’est parti'];
const ROLE = ['Professional. Offer', 'صنايعي. قدّم', 'Professionnel'];
const CREATE = ['Create account', 'إنشاء حساب', 'Créer un compte'];
const ACCEPT = ['I accept', 'أوافق', 'J’accepte'];
const ADD_PHOTO = ['Add your photo', 'ضيف صورتك', 'Ajoutez votre photo'];
const GALLERY = ['Choose from gallery', 'اختار من المعرض', 'Choisir dans la galerie'];
const USE_PHOTO = ['Use this photo', 'استخدم الصورة دي', 'Utiliser cette photo'];
const SAVE = ['Save and continue', 'احفظ وكمّل', 'Enregistrer et continuer'];
const OPEN_PICKER = ['Choose your work', 'Change your work', 'اختار شغلك', 'غيّر شغلك',
  'Choisir votre travail', 'Changer de travail'];

const findings = [];

async function capture(name, note) {
  await sleep(900);
  const nodes = tree();
  screenshot(`${tag}-${name}`);
  writeFileSync(join(OUT, `${tag}-${name}.txt`), describeScreen(nodes));

  const width = Math.max(...nodes.map((node) => node.bounds?.right ?? 0));
  const overflow = nodes.filter((node) => node.bounds && node.bounds.right > width + 1).length;
  const small = nodes.filter((node) => node.clickable && node.bounds
    && (node.bounds.right - node.bounds.left < 44 || node.bounds.bottom - node.bounds.top < 44))
    .map((node) => `${label(node).slice(0, 28)} ${node.bounds.right - node.bounds.left}x${node.bounds.bottom - node.bounds.top}`);
  const composed = nodes.filter((node) => /^\s*,/.test(node.desc ?? '')).length;
  // A row whose label is clipped is the failure long Arabic and French labels
  // actually produce, and it does not show up as overflow.
  const truncated = nodes.filter((node) => /…|\.\.\.$/.test(node.text ?? '')).map((n) => n.text.slice(0, 34));

  findings.push({ name, note, overflow, small, composed, truncated });
  const flags = [
    overflow ? `OVERFLOW ${overflow}` : '',
    small.length ? `SMALL ${small.length}` : '',
    composed ? `COMPOSED ${composed}` : '',
    truncated.length ? `TRUNCATED ${truncated.length}` : '',
  ].filter(Boolean).join('  ');
  console.log(`    ${name.padEnd(34)} ${flags || 'clean'}`);
}

/**
 * Register once per configuration and stop on the work step.
 *
 * `pm clear` before each is what makes the configurations comparable: a device
 * carrying the previous run's account skips straight past the screens being
 * photographed.
 *
 * Every hop reports itself. A walk that fails silently in the middle produces
 * an empty folder and no idea why.
 */
async function reachPicker(combination) {
  shell('pm clear com.warsha.app');
  await sleep(3000);
  apply(combination);
  await sleep(1200);
  shell('am start -n com.warsha.app/.MainActivity');

  const hop = async (name, names, { optional = false } = {}) => {
    await settleScreen();
    const node = target(names);
    if (!node) {
      if (!optional) console.log(`    ${name}: NOT FOUND`);
      return false;
    }
    shell(`input tap ${node.bounds.cx} ${node.bounds.cy}`);
    await sleep(2200);
    return true;
  };

  await hop('gateway', START, { optional: true });
  if (!await hop('role', ROLE)) return false;

  await settleScreen();
  const phone = `010123${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, '0')}`;
  await setText({ cls: 'EditText', index: 0 }, 'Warsha Design QA');
  await setText({ cls: 'EditText', index: 1 }, phone);
  await setText({ cls: 'EditText', index: 2 }, 'Warsha!QA9pass');
  shell('input keyevent 111');
  await sleep(1200);

  const { refused } = await acceptAllConsents();
  if (refused.length) {
    console.log(`    a consent refused to change: ${refused[0]}`);
    return false;
  }

  if (!await hop('create account', CREATE)) return false;
  await sleep(10_000);

  await hop('processing consent', ['I agree to Warsha processing', 'أوافق على معالجة',
    'J’accepte que Warsha'], { optional: true });
  await hop('accept', ACCEPT, { optional: true });
  await sleep(4000);

  if (await hop('add photo', ADD_PHOTO, { optional: true })) {
    await hop('gallery', GALLERY);
    await sleep(5000);
    await hop('pick photo', ['Photo taken on', 'صورة', 'Photo']);
    await sleep(6000);
    await hop('use photo', USE_PHOTO, { optional: true });
    await sleep(12_000);
  }
  await hop('save', SAVE, { optional: true });
  await sleep(6000);
  await settleScreen();

  return Boolean(target(OPEN_PICKER));
}

await installPhotoFixture('com.warsha.app');

try {
  /*
   * `--only` runs a single configuration.
   *
   * Reaching this screen means a full registration, so twenty-four
   * configurations is a long walk to discover the first one could not get
   * there. One first, then the rest.
   */
  /*
   * `--key` runs the configurations most likely to break THIS screen, rather
   * than all twenty-four. Each one costs a full registration, so the full
   * matrix is an hour; these four are where a work picker actually fails —
   * long Arabic labels in the narrowest column, dark, enlarged text, and the
   * language with the longest words.
   */
  const plan = argv.includes('--key')
    ? [
      { viewport: VIEWPORTS[1], appearance: 'light', scale: 1.0, language: 'ar-EG', name: '320dp-light-1x-ar-EG' },
      { viewport: VIEWPORTS[0], appearance: 'dark', scale: 1.0, language: 'en-US', name: '411dp-dark-1x-en-US' },
      { viewport: VIEWPORTS[0], appearance: 'light', scale: 1.3, language: 'en-US', name: '411dp-light-1.3x-en-US' },
      { viewport: VIEWPORTS[1], appearance: 'light', scale: 1.0, language: 'fr-FR', name: '320dp-light-1x-fr-FR' },
    ]
    : [...combinations()];

  for (const combination of plan) {
    console.log(`\n--- ${combination.name} ---`);
    const actual = apply(combination);
    console.log(`    device: ${actual.size} @${actual.density} scale ${actual.scale} night ${actual.night}`);

    if (!await reachPicker(combination)) {
      console.log('    could not reach the work step in this configuration');
      continue;
    }
    await capture(`${combination.name}-01-step`, combination);
    await tap(OPEN_PICKER, { settle: 2800 });
    await capture(`${combination.name}-02-picker`, combination);
  }
} finally {
  resetDevice();
}

console.log(`\n${findings.length} states captured into ${OUT}`);
const problems = findings.filter((entry) => entry.overflow || entry.small.length
  || entry.composed || entry.truncated.length);
if (problems.length) {
  console.log('\nstates needing a look:');
  for (const entry of problems) {
    console.log(`  ${entry.name}`);
    for (const item of entry.small) console.log(`    small target: ${item}`);
    for (const item of entry.truncated) console.log(`    truncated: ${JSON.stringify(item)}`);
  }
}
