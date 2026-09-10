/**
 * The axes a screen has to survive, and how to actually set them.
 *
 * A redesign judged in one configuration is judged in the easiest one. Every
 * defect this programme has found so far appeared on exactly one axis and not
 * the others: the role card's invisible icon well was a LIGHT-theme bug that
 * dark rendered correctly, and the service-area form pushed its first control
 * off the bottom only at 320dp.
 *
 * ## Dark is set on the device, not in Warsha
 *
 * Warsha resolves Light/Dark/System itself and defaults to System, so putting
 * the DEVICE in night mode is what a person who has never opened Warsha's
 * settings actually experiences — and it is the configuration the app is in for
 * most of its users. `cmd uimode night yes` is the platform's own switch.
 *
 * Setting it through Warsha's settings screen would test a different thing: the
 * preference, not the appearance. Both matter; this is the second one.
 *
 * ## Font scale is a system setting and stays one
 *
 * `settings put system font_scale` is what the accessibility slider writes.
 * Warsha reads it through the platform like every other app, so nothing here
 * tells the product it is being tested.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const ADB = process.env.WARSHA_ADB
  ?? (existsSync('D:\\Dev\\Android\\Sdk\\platform-tools\\adb.exe')
    ? 'D:\\Dev\\Android\\Sdk\\platform-tools\\adb.exe'
    : 'adb');

const adb = (args) => execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const shell = (command) => adb(['shell', command]);

/**
 * 320dp is Warsha's compact floor and 411dp the ordinary Android phone.
 *
 * Expressed as pixel size plus density rather than as dp, because that is what
 * `wm` takes — and because getting the density wrong gives a device the right
 * number of pixels and the wrong number of dp, which looks like a layout bug.
 */
export const VIEWPORTS = [
  { name: '411dp', size: '1080x2400', density: 420 },
  { name: '320dp', size: '720x1600', density: 360 },
];

export const LANGUAGES = ['en-US', 'ar-EG', 'fr-FR'];

export const APPEARANCES = ['light', 'dark'];

/** Default, and the scale the accessibility guidance treats as the real test. */
export const TEXT_SCALES = [1.0, 1.3];

export function setViewport(viewport) {
  shell(`wm size ${viewport.size}`);
  shell(`wm density ${viewport.density}`);
}

export function setAppearance(appearance) {
  shell(`cmd uimode night ${appearance === 'dark' ? 'yes' : 'no'}`);
}

export function setTextScale(scale) {
  shell(`settings put system font_scale ${scale}`);
}

export function setLanguage(language, packageName = 'com.warsha.app') {
  shell(`cmd locale set-app-locales ${packageName} --locales ${language}`);
}

/**
 * Put the device back the way it was found.
 *
 * Not politeness: a run that leaves the device at 1.3x and dark makes the NEXT
 * run's evidence quietly wrong, and nothing in a screenshot says which
 * configuration produced it.
 */
export function resetDevice(packageName = 'com.warsha.app') {
  shell('wm size reset');
  shell('wm density reset');
  shell('cmd uimode night no');
  shell('settings put system font_scale 1.0');
  shell(`cmd locale set-app-locales ${packageName} --locales en-US`);
}

/** Every combination, named so a screenshot filename says what it is. */
export function* combinations({
  viewports = VIEWPORTS,
  languages = LANGUAGES,
  appearances = APPEARANCES,
  textScales = TEXT_SCALES,
} = {}) {
  for (const viewport of viewports) {
    for (const appearance of appearances) {
      for (const scale of textScales) {
        for (const language of languages) {
          yield {
            viewport,
            appearance,
            scale,
            language,
            name: `${viewport.name}-${appearance}-${scale}x-${language}`,
          };
        }
      }
    }
  }
}

/**
 * Apply one combination and report what the device says it is.
 *
 * Read back rather than assumed. `wm size` can be refused, `font_scale` can be
 * clamped, and a sweep that believes its own instructions produces a folder of
 * screenshots that all claim to be 320dp.
 */
export function apply(combination, packageName = 'com.warsha.app') {
  setViewport(combination.viewport);
  setAppearance(combination.appearance);
  setTextScale(combination.scale);
  setLanguage(combination.language, packageName);

  const size = shell('wm size').trim();
  const density = shell('wm density').trim();
  const scale = shell('settings get system font_scale').trim();
  const night = shell('cmd uimode night').trim();
  return {
    size: /Override size: (\S+)/.exec(size)?.[1] ?? /Physical size: (\S+)/.exec(size)?.[1],
    density: /Override density: (\d+)/.exec(density)?.[1] ?? /Physical density: (\d+)/.exec(density)?.[1],
    scale,
    night,
  };
}

// Runnable, to check that every axis on this device can actually be moved.
if (process.argv[1] && process.argv[1].endsWith('appearance-matrix.mjs')) {
  const probe = { viewport: VIEWPORTS[1], appearance: 'dark', scale: 1.3, language: 'ar-EG', name: 'probe' };
  const actual = apply(probe);
  console.log('requested  320dp / dark / 1.3x / ar-EG');
  console.log(`device says size=${actual.size} density=${actual.density} `
    + `font_scale=${actual.scale} night=${actual.night}`);
  resetDevice();
  const restored = shell('wm size').trim().replace(/\s+/g, ' ');
  console.log(`restored   ${restored}`);
}
