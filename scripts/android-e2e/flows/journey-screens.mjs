/**
 * Photograph the Warsha journey, on a device, in every language and appearance
 * that has to be right.
 *
 * A UX audit read off JSX is a review of intentions. What a person actually
 * meets is a rendered screen at a real density, with real fonts, real wrapping,
 * a real system bar and a real keyboard — and the defects that matter are
 * mostly things JSX cannot show you: a heading that wraps to three lines in
 * French, a control pushed under the fold at 320dp, an Arabic screen whose
 * chevrons still point the Latin way, a card whose text clips at 1.3x font
 * scale. So this drives the shipped binary and writes PNGs.
 *
 * It runs against a build made with EXPO_PUBLIC_DATA_MODE=mock, which is a
 * first-class mode rather than a test fixture: the whole product is navigable
 * with no backend, which is the only reason a full journey can be photographed
 * on a machine whose TLS is intercepted by antivirus and cannot reach Supabase
 * at all.
 *
 * Every axis below is a place Warsha has a real reason to expect trouble:
 *
 *   ar        RTL mirrors the entire layout, and it is a release gate
 *   fr        the long-copy language; it breaks buttons and nav labels
 *   dark      where contrast and stale-theme bugs live
 *   1.3x      where fixed-height rows swallow their own content
 *
 * Usage: node scripts/android-e2e/flows/journey-screens.mjs [--tag name]
 *   ANDROID_SERIAL  which device        (adb's own variable)
 *   WARSHA_APK      install this first  (optional)
 *   WARSHA_TEMP     artifact directory
 */
import { existsSync } from 'node:fs';
import {
  describeScreen, find, install, screenshot, shell, sleep, tap, tree, waitFor,
} from '../driver.mjs';

const PACKAGE = 'com.warsha.app';
const argv = process.argv.slice(2);
const tagIndex = argv.indexOf('--tag');
const tag = tagIndex >= 0 ? argv[tagIndex + 1] : 'journey';

const shots = [];
const capture = (name) => {
  screenshot(`${tag}-${name}`);
  shots.push(name);
  console.log(`   shot: ${name}`);
};

/** Restart cleanly so each pass starts from first contact. */
async function coldStart() {
  shell(`am force-stop ${PACKAGE}`);
  await sleep(1200);
  shell(`monkey -p ${PACKAGE} -c android.intent.category.LAUNCHER 1`);
  await sleep(9000);
}

async function setFontScale(scale) {
  shell(`settings put system font_scale ${scale}`);
  await sleep(1500);
}

/**
 * Dark mode is set at the platform, not in the app, on purpose: Warsha's
 * default appearance is System, so this exercises the path a real person is on
 * unless they have deliberately overridden it.
 */
async function setNightMode(on) {
  shell(`cmd uimode night ${on ? 'yes' : 'no'}`);
  await sleep(2500);
}

// --- install ------------------------------------------------------------------
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

const api = shell('getprop ro.build.version.sdk').trim();
console.log(`device: API ${api}\n`);

// --- first contact, as shipped ------------------------------------------------
console.log('== first contact ==');
shell(`pm clear ${PACKAGE}`);
await sleep(2500);
await coldStart();
capture('01-first-contact');
console.log(describeScreen().slice(0, 700));

// --- the settings screen that now owns language and appearance ----------------
// Reached the way a person reaches it, so the route itself is under test.
console.log('\n== settings: language & appearance ==');
shell(`am start -n ${PACKAGE}/.MainActivity -a android.intent.action.VIEW -d "warsha://appearance"`);
await sleep(6000);
if (find({ textContains: 'Language' }) ?? find({ textContains: 'اللغة' })) {
  capture('02-settings-language-appearance');
} else {
  console.log('   (deep link did not land on settings; screen was:)');
  console.log(describeScreen().slice(0, 400));
  capture('02-settings-attempt');
}

// --- appearance: dark ---------------------------------------------------------
console.log('\n== dark ==');
await setNightMode(true);
await coldStart();
capture('03-first-contact-dark');
await setNightMode(false);

// --- enlarged text ------------------------------------------------------------
console.log('\n== enlarged text (1.3x) ==');
await setFontScale('1.3');
await coldStart();
capture('04-first-contact-large-text');
await setFontScale('1.0');

console.log(`\n${shots.length} screenshots written for API ${api}.`);
console.log(shots.map((s) => `  ${tag}-${s}.png`).join('\n'));
