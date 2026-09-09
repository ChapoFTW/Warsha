/**
 * The system dialogs are Warsha's, and stay Warsha's.
 *
 * `Alert.alert` is the platform dialog and eighteen screens use it. Every one
 * rendered in Android's stock accent — teal on a default device, a colour that
 * exists nowhere else in the product — with ALL CAPS buttons against a product
 * that is sentence case everywhere. Warsha's own surfaces looked designed, and
 * the moment a decision mattered the dialog looked like a different app.
 *
 * A config plugin fixes all eighteen at once by pointing the activity's
 * `alertDialogTheme` at a Warsha overlay. That means the colours live in a
 * Gradle resource file, which cannot import TypeScript, so they are literals —
 * and a literal palette that nobody checks is a palette that drifts. This is
 * the check, and it is the same argument `test:web-brand` already makes for the
 * web tokens.
 *
 * `android/` is gitignored build output, so the plugin source is what is
 * asserted here. Whether the generated `styles.xml` actually contains it is a
 * question for a build, not for a unit test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { darkColors, lightColors } from '../constants/appearance.ts';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

const PLUGIN = 'plugins/warsha-android-dialog-theme.js';
const source = readFileSync(PLUGIN, 'utf8');

/*
 * The plugin's comments describe the mistakes it corrects, by name. Searching
 * the raw text for a wrong resource name therefore matches the paragraph
 * explaining why it is wrong -- which is the fifth time in this repository that
 * an assertion has matched the prose about a construct rather than the
 * construct. Comment-stripping is standard here for exactly that reason.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

/** The literal table the plugin writes into `colors.xml`. */
function table(name: 'LIGHT' | 'DARK'): Record<string, string> {
  const block = source.slice(source.indexOf(`const ${name} = {`));
  const body = block.slice(0, block.indexOf('};'));
  return Object.fromEntries(
    [...body.matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)].map((match) => [match[1], match[2]]),
  );
}

// --- The literals are the palette -------------------------------------------
// A dialog is an elevated surface, its text is primary text, and its buttons
// are the primary action. Those three roles already exist; nothing here is a
// new colour, which is the point.
for (const [name, palette] of [['LIGHT', lightColors], ['DARK', darkColors]] as const) {
  const values = table(name);
  equal(
    values.warshaDialogBackground,
    palette.surfaceElevated,
    `${name}: the dialog sits on the elevated surface role`,
  );
  equal(
    values.warshaDialogText,
    palette.textPrimary,
    `${name}: dialog text is the primary text role`,
  );
  equal(
    values.warshaDialogAction,
    palette.actionPrimaryBackground,
    `${name}: dialog buttons are the primary action role`,
  );
}

// A dialog whose text matches its ground is unreadable. Cheap to assert, and
// exactly the failure a careless palette edit would introduce.
for (const [name, values] of [['LIGHT', table('LIGHT')], ['DARK', table('DARK')]] as const) {
  ok(
    values.warshaDialogText !== values.warshaDialogBackground,
    `${name}: dialog text is not the same colour as the dialog`,
  );
  ok(
    values.warshaDialogAction !== values.warshaDialogBackground,
    `${name}: dialog buttons are not the same colour as the dialog`,
  );
}

// Light and dark must actually differ, or one of them is wrong.
ok(
  table('LIGHT').warshaDialogBackground !== table('DARK').warshaDialogBackground,
  'the two appearances give the dialog different grounds',
);

// --- It reaches every call site ---------------------------------------------
ok(
  /alertDialogTheme/.test(source),
  'the activity theme points at the Warsha dialog, so no screen has to opt in',
);
ok(
  /parent: 'ThemeOverlay\.AppCompat\.Dialog\.Alert'/.test(source),
  'it is an overlay, so it changes the dialog and inherits everything else',
);
// The first version of this named `ThemeOverlay.AppCompat.DayNight.Dialog.Alert`
// and this assertion passed, because a check that reads a file can confirm a
// string is present and cannot confirm AppCompat defines it. The build caught
// it. Kept as a reminder of what a source-shape assertion cannot know.
ok(
  !/DayNight\.Dialog/.test(code),
  'and not the DayNight variant of it, which AppCompat does not define',
);
ok(
  /android:colorBackground/.test(code) && !/'android:background'/.test(code),
  'the panel colour is colorBackground, which does not leak into child views',
);
ok(
  /throw new Error\('AppTheme is missing/.test(source),
  'a missing AppTheme fails the build rather than silently skipping the theme',
);

// --- Sentence case, because Arabic has no case ------------------------------
ok(
  /'android:textAllCaps': 'false'/.test(source),
  'dialog buttons are sentence case, matching every other Warsha button',
);

// --- It is registered -------------------------------------------------------
const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
const plugins: unknown[] = appJson.expo.plugins;
ok(
  plugins.some((plugin) => plugin === './plugins/warsha-android-dialog-theme'),
  'the plugin is registered, or none of the above reaches a build',
);

// --- The limit is stated, not hidden ----------------------------------------
// A DayNight resource follows the SYSTEM night setting, and Warsha resolves its
// own Light/Dark/System preference in JavaScript. Someone who picks Dark inside
// Warsha on a light phone still gets a light dialog. That is real, it is not
// fixable in a compile-time resource, and a reader of this plugin must not have
// to discover it on a device.
ok(
  /does NOT fix/.test(source) && /SYSTEM night setting/.test(source),
  'the plugin says plainly what it cannot fix',
);

console.log(`Android dialog theme: ${checks} checks passed.`);
