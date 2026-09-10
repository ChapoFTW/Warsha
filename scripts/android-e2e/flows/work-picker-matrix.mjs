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
import { apply, combinations, resetDevice } from '../appearance-matrix.mjs';

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

async function waitForContent({ timeout = 40_000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const nodes = tree();
    if (!/Loading Warsha|تحميل|Chargement/i.test(nodes.map(label).join(' '))
      && nodes.filter((node) => label(node)).length >= 4) return true;
    await sleep(1000);
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

/** Register once per configuration: `pm clear` is what makes each run equal. */
async function reachPicker(combination) {
  shell('pm clear com.warsha.app');
  await sleep(2600);
  apply(combination);
  await sleep(1200);
  shell('am start -n com.warsha.app/.MainActivity');
  if (!await waitForContent()) return false;

  await tap(START, { optional: true, settle: 3200 });
  if (!await tap(ROLE, { optional: true, settle: 3200 })) return false;

  const phone = `010123${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, '0')}`;
  await setText({ cls: 'EditText', index: 0 }, 'Warsha Design QA');
  await setText({ cls: 'EditText', index: 1 }, phone);
  await setText({ cls: 'EditText', index: 2 }, 'Warsha!QA9pass');
  shell('input keyevent 111');
  await sleep(900);

  // Each consent exactly once, decided by the state uiautomator reports.
  for (let pass = 0; pass < 6; pass += 1) {
    const pending = tree().find((node) => node.bounds && node.clickable
      && node.cls.includes('CheckBox'));
    if (!pending) break;
    const before = describeScreen(tree());
    shell(`input tap ${pending.bounds.cx} ${pending.bounds.cy}`);
    await sleep(900);
    if (describeScreen(tree()) === before) break;
    shell('input swipe 540 1700 540 1100 300');
    await sleep(900);
  }

  if (!await tap(CREATE, { optional: true, settle: 14_000 })) return false;
  await waitForContent();

  const consent = tree().find((node) => node.bounds && node.clickable
    && node.cls.includes('CheckBox'));
  if (consent) { shell(`input tap ${consent.bounds.cx} ${consent.bounds.cy}`); await sleep(900); }
  await tap(ACCEPT, { optional: true, settle: 7000 });

  if (await tap(ADD_PHOTO, { optional: true, settle: 4500 })) {
    await tap(GALLERY, { settle: 8000 });
    const photo = tree().find((node) => node.bounds && node.clickable
      && /Photo taken on|صورة|Photo/i.test(label(node)));
    if (photo) { shell(`input tap ${photo.bounds.cx} ${photo.bounds.cy}`); await sleep(8000); }
    await tap(USE_PHOTO, { optional: true, settle: 15_000 });
  }
  await tap(SAVE, { optional: true, settle: 8000 });

  return Boolean(target(OPEN_PICKER));
}

await installPhotoFixture('com.warsha.app');

try {
  for (const combination of combinations()) {
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
