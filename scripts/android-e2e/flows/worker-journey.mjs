/**
 * Walk the worker journey on a device and photograph every screen it reaches.
 *
 * The question this exists to answer is not "does it work" — the deterministic
 * suites already answer that — but the one a technician actually faces:
 *
 *   WHAT IS HAPPENING?   WHAT DO I DO NOW?   WHAT HAPPENS NEXT?
 *
 * and whether each is answerable without reading a paragraph. That cannot be
 * decided from JSX. A screen whose source shows a clear primary button can
 * render with that button under the fold; a state whose name reads fine in a
 * type union can reach the screen as "provisionally active"; an Arabic screen
 * that is obviously mirrored in code can still draw a Latin-pointing chevron.
 *
 * So this taps through and writes PNGs plus the accessibility tree of each
 * screen. The tree is the more useful artefact of the two: it is what a screen
 * reader would say, and a screen whose tree is a wall of prose is a screen a
 * low-literacy worker cannot use, however good it looks.
 *
 * Requires a build made with EXPO_PUBLIC_DATA_MODE=mock. Mock mode sets an
 * accountKey, so the app is signed in and the authenticated journey is
 * reachable with no backend — which on this machine is the only way to reach it
 * at all, the host's TLS being intercepted by antivirus. Mock mode is
 * INADMISSIBLE for anything before sign-in; see docs/ux/product-journey-audit.md.
 *
 * Usage: node scripts/android-e2e/flows/worker-journey.mjs [--tag name]
 */
import { existsSync } from 'node:fs';
import {
  describeScreen, find, findAll, hideKeyboard, install, screenshot, scrollDown,
  setText, shell, sleep, tap,
} from '../driver.mjs';

const PACKAGE = 'com.warsha.app';
const argv = process.argv.slice(2);
const tagIndex = argv.indexOf('--tag');
const tag = tagIndex >= 0 ? argv[tagIndex + 1] : 'worker';

let step = 0;
const reached = [];

/** Photograph the current screen and print what a screen reader would say. */
function record(name) {
  step += 1;
  const label = `${String(step).padStart(2, '0')}-${name}`;
  screenshot(`${tag}-${label}`);
  reached.push(label);
  const tree = describeScreen();
  console.log(`\n=== ${label} ===`);
  console.log(tree.slice(0, 900));
  // A crude but honest readability signal: how much prose is on screen, and how
  // many things can be tapped. One tappable thing and 400 characters of text is
  // a reading exercise; six tappable things and 40 characters is a menu.
  const words = tree.replace(/\[tap\]/g, ' ').split(/\s+/).filter(Boolean).length;
  const taps = (tree.match(/\[tap\]/g) ?? []).length;
  console.log(`--- ${words} words, ${taps} tappable ---`);
  return tree;
}

/** Tap the first selector that matches, and say which one did. */
async function tapAny(selectors, { timeout = 6000 } = {}) {
  for (const selector of selectors) {
    if (find(selector)) {
      await tap(selector, { timeout });
      await sleep(2500);
      return selector;
    }
  }
  return null;
}

const apk = process.env.WARSHA_APK;
if (apk) {
  if (!existsSync(apk)) {
    console.error(`WARSHA_APK does not exist: ${apk}`);
    process.exit(1);
  }
  const { ok, detail } = install(apk);
  console.log(ok ? 'installed' : `INSTALL FAILED: ${detail}`);
  if (!ok) process.exit(1);
}

console.log(`device: API ${shell('getprop ro.build.version.sdk').trim()}`);

shell(`pm clear ${PACKAGE}`);
await sleep(2500);
shell(`monkey -p ${PACKAGE} -c android.intent.category.LAUNCHER 1`);
await sleep(12000);

record('entry');

/*
 * Get to the role choice, then pick Worker.
 *
 * The selectors are deliberately narrow. `textContains: 'Worker'` matched the
 * gateway's trust line — "Workers are identity checked" — and reported that it
 * had chosen a role while standing on the same screen. A selector loose enough
 * to hit the wrong element is worse than one that finds nothing, because it
 * fails silently and everything after it photographs the wrong journey.
 */
await tapAny([
  { descContains: 'Get started' },
  { textContains: 'Get started' },
  { descContains: 'يلا نبدأ' },
]);
await sleep(3000);
record('role-choice');

const chose = await tapAny([
  // The role card's accessible name is "Professional. Offer your services…",
  // so anchoring on the period distinguishes the card from prose that merely
  // mentions professionals — the gateway's trust line does exactly that.
  { descContains: 'Professional. ' },
  { descContains: 'صنايعي. ' },
]);
console.log(chose ? `\n-> chose worker via ${JSON.stringify(chose)}` : '\n-> could not find the worker role');
if (chose) record('after-role-worker');

/*
 * Fill and submit the registration, because everything worth auditing is behind
 * it.
 *
 * Mock mode accepts a registration without a backend, so this creates a
 * synthetic professional and walks on. The values are obviously synthetic and
 * the build points at Development, never Production — no real account is
 * touched.
 */
async function completeSignup() {
  const fields = findAll({ cls: 'EditText' });
  if (fields.length < 3) {
    console.log(`\n-> expected 3 fields on the signup form, found ${fields.length}`);
    return false;
  }
  // Order matters and is asserted rather than assumed: the form is name, phone,
  // password since the UX-008 reorder, and typing a password into the phone box
  // is exactly the failure `setText` was written to catch.
  await setText({ cls: 'EditText', index: 0 }, 'Warsha QA Professional');
  await setText({ cls: 'EditText', index: 1 }, '01012345678');
  await setText({ cls: 'EditText', index: 2 }, 'Warsha!QA9pass');
  await hideKeyboard();

  // Both consents are separate decisions and neither is pre-selected, so both
  // have to be pressed. That is the point of them.
  // 'I agree' and not 'I agree to Warsha': the second consent reads "I agree to
  // the Worker Verification Policy", so the narrower string checked one box,
  // left the other unchecked, and Create account stayed correctly disabled —
  // which looked like a broken button rather than a working gate.
  // Scroll the consents into view before looking for them.
  //
  // UIAutomator only reports what is on screen, so running the search first
  // found nothing and reported "consents checked: 0" while the boxes sat one
  // screen below. Filling the password also grows the form — the checklist
  // expands from one line to five rules — which pushes them further down than
  // they were when the screen opened.
  for (let i = 0; i < 8; i += 1) {
    if (find({ descContains: 'I agree' }) ?? find({ descContains: 'أوافق' })) break;
    await scrollDown();
  }

  // Clickable nodes only, and one tap per row.
  //
  // React Native puts the accessible name on the pressable row AND on the text
  // inside it, so a consent appears twice in the tree at the same coordinates.
  // Tapping every match therefore checked each box and immediately unchecked
  // it, and Create account stayed correctly disabled — a working gate that
  // looked like a broken button. Rows are de-duplicated by their vertical
  // centre, which is what makes two nodes the same control.
  const seen = new Set();
  for (const label of ['I agree', 'أوافق']) {
    for (const node of findAll({ descContains: label, clickable: true })) {
      if (!node.bounds || seen.has(node.bounds.cy)) continue;
      seen.add(node.bounds.cy);
      shell(`input tap ${node.bounds.cx} ${node.bounds.cy}`);
      await sleep(700);
    }
  }
  console.log(`   consents checked: ${seen.size}`);

  // The action is below the legal block, which is why UX-008 called it buried.
  for (let i = 0; i < 6; i += 1) {
    if (find({ descContains: 'Create account' }) ?? find({ descContains: 'إنشاء حساب' })) break;
    await scrollDown();
  }
  const pressed = await tapAny([
    { descContains: 'Create account' },
    { descContains: 'إنشاء حساب' },
  ]);
  await sleep(6000);
  return Boolean(pressed);
}

if (chose) {
  const submitted = await completeSignup();
  console.log(submitted ? '\n-> registration submitted' : '\n-> could not submit registration');
  if (submitted) record('after-signup');
}

/*
 * From here the journey is a sequence of "continue"-shaped steps whose labels
 * differ per screen. Rather than hard-code a script that breaks the moment a
 * screen is reordered, this presses whatever the screen offers as its forward
 * action and photographs wherever it lands, stopping when nothing moves.
 *
 * A step that finds no forward action is itself the finding: it is a screen
 * where a worker would also not know what to do next.
 */
const forward = [
  { descContains: 'Continue' }, { textContains: 'Continue' },
  { descContains: 'Next' }, { textContains: 'Next' },
  { descContains: 'Get started' }, { textContains: 'Get started' },
  { descContains: 'Start' }, { textContains: 'Start' },
  { descContains: 'استمرار' }, { textContains: 'استمرار' },
  { descContains: 'التالي' }, { textContains: 'التالي' },
];

for (let i = 0; i < 12; i += 1) {
  const before = describeScreen();
  const pressed = await tapAny(forward);
  if (!pressed) {
    console.log(`\n-> no forward action on this screen; stopping after ${step} screens`);
    break;
  }
  const after = describeScreen();
  if (after === before) {
    console.log('\n-> screen did not change; stopping');
    break;
  }
  record(`step-${i + 1}`);
}

console.log(`\n${reached.length} screens photographed:`);
console.log(reached.map((r) => `  ${tag}-${r}.png`).join('\n'));
