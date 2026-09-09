#!/usr/bin/env node
/**
 * Build a Warsha Android release APK, and be honest about whether it worked.
 *
 * ## Why this exists
 *
 * A release build was run as `gradlew assembleRelease ... | tail`, which reports
 * the exit code of `tail`. Gradle failed after thirty minutes; the pipeline
 * returned 0; a watcher recorded success; and the next step tried to install a
 * five-hour-old APK. Every individual step behaved reasonably and the result was
 * a confident false positive.
 *
 * The same session also produced the other half of that mistake: a watcher that
 * waited for the APK to become "newer than app/_layout.tsx", a file nobody had
 * edited that day, so the condition was true immediately and the watch ended
 * before the build began.
 *
 * So success here requires ALL of:
 *
 *   1. Gradle exits zero — the real exit code, never a pipe's.
 *   2. Gradle actually printed BUILD SUCCESSFUL.
 *   3. An APK exists and is newer than a marker taken before the build started.
 *
 * Any one of those missing is a failure, loudly. A build helper that can report
 * success without an artifact is not a build helper.
 *
 * ## Environment
 *
 * The Expo config is evaluated by Gradle during `createReleaseUpdatesResources`,
 * and app.config.js requires the Maps render keys — including the iOS one,
 * because the config is one document describing both platforms and is evaluated
 * whole. The Expo CLI loads `.env` automatically; a Gradle-spawned Node process
 * does not inherit that, which is why the build failed with
 * "GOOGLE_MAPS_IOS_RENDER_KEY is missing or empty" while `npx expo` worked.
 *
 * This loads `.env` and passes it through, so there is one env authority — the
 * file the CLI already uses — rather than a second list maintained here. Values
 * are never printed; only which names were found.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const APK = join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const REQUIRED_ENV = [
  'GOOGLE_MAPS_ANDROID_RENDER_KEY',
  'GOOGLE_MAPS_IOS_RENDER_KEY',
];

const fail = (message) => { console.error(`BUILD REFUSED: ${message}`); process.exit(1); };

/** Reads .env into a plain object. The file the Expo CLI already owns. */
function envFile(path = '.env') {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const fromFile = envFile();
const env = { ...fromFile, ...process.env };

// Report presence, never values.
for (const name of REQUIRED_ENV) {
  const value = env[name];
  console.log(`${name.padEnd(32)} ${value ? `present (${value.length} chars)` : 'MISSING'}`);
  if (!value) {
    fail(`${name} is not set. app.config.js is evaluated during the Gradle `
      + 'updates-resources task and requires it. Put it in .env, which is the '
      + 'same file the Expo CLI reads.');
  }
}

/**
 * Gradle does not know the JS bundle depends on EXPO_PUBLIC_* values.
 *
 * Changing only the backend the app points at leaves every Gradle input
 * identical, so `assembleRelease` reports BUILD SUCCESSFUL, reuses the cached
 * bundle, and produces no APK at all — or worse, on a machine where the APK
 * already exists, an APK whose bundle still points at the previous backend.
 *
 * That is not hypothetical. A release build was made with .env (development),
 * then rebuilt with Production values, and Gradle did nothing. The third
 * success condition below caught it, but only after the fact.
 *
 * So the values that actually reach the bundle are fingerprinted, and when the
 * fingerprint changes the bundle task's outputs are removed to force it to run
 * again. The fingerprint is a hash: no secret is written to disk.
 */
const BUNDLE_TARGET_STAMP = join('android', 'app', 'build', 'warsha-bundle-target.sha256');
const BUNDLE_OUTPUTS = [
  join('android', 'app', 'build', 'generated', 'assets', 'createBundleReleaseJsAndAssets'),
  join('android', 'app', 'build', 'generated', 'res', 'createBundleReleaseJsAndAssets'),
  join('android', 'app', 'build', 'generated', 'assets', 'createReleaseUpdatesResources'),
];

const bundleTarget = createHash('sha256').update(JSON.stringify({
  url: env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  key: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  mode: env.EXPO_PUBLIC_DATA_MODE ?? '',
  adminSurface: env.EXPO_PUBLIC_ADMIN_SURFACE ?? '',
})).digest('hex');

const previousTarget = existsSync(BUNDLE_TARGET_STAMP)
  ? readFileSync(BUNDLE_TARGET_STAMP, 'utf8').trim() : '';

const host = (() => {
  try { return new URL(env.EXPO_PUBLIC_SUPABASE_URL ?? '').hostname.split('.')[0]; }
  catch { return 'unset'; }
})();
console.log(`backend target                   ${host} (fingerprint ${bundleTarget.slice(0, 12)})`);

if (previousTarget && previousTarget !== bundleTarget) {
  console.log('backend target CHANGED since the last build — clearing the bundle so');
  console.log('gradle cannot reuse one built for a different backend.');
  for (const output of BUNDLE_OUTPUTS) rmSync(output, { recursive: true, force: true });
}

// The marker is taken NOW, so "is the APK new" is answered against this build
// rather than against an unrelated file's timestamp.
const startedAt = Date.now();
const previous = existsSync(APK) ? statSync(APK).mtimeMs : 0;
console.log(`\nprevious APK: ${previous ? new Date(previous).toISOString() : 'none'}`);
console.log('running gradlew assembleRelease…\n');

// Resolved against the android/ directory rather than left to PATH: with
// shell:true on Windows a bare 'gradlew.bat' is looked up in PATH, not in cwd,
// and the build fails with 'not recognized as an internal or external command'.
const gradle = join(process.cwd(), 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const result = spawnSync(gradle, [
  'assembleRelease',
  `-PreactNativeArchitectures=${process.env.WARSHA_ABI ?? 'x86_64'}`,
  '--console=plain',
], { cwd: 'android', env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, shell: process.platform === 'win32' });

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

// 1. The real exit code, from spawnSync — no pipe in between.
if (result.status !== 0) {
  const why = /\* What went wrong:[\s\S]{0,600}/.exec(output);
  console.error(why ? why[0] : output.slice(-2000));
  fail(`gradle exited ${result.status}`);
}

// 2. Gradle's own verdict. An exit code alone has been wrong before.
if (!/BUILD SUCCESSFUL/.test(output)) {
  fail('gradle exited zero but never printed BUILD SUCCESSFUL');
}

// 3. An artifact that belongs to THIS build.
if (!existsSync(APK)) fail(`gradle reported success but ${APK} does not exist`);
const built = statSync(APK);
if (built.mtimeMs < startedAt) {
  fail(`gradle reported success but ${APK} is older than this build `
    + `(${new Date(built.mtimeMs).toISOString()}). Nothing was produced.`);
}

mkdirSync(join('android', 'app', 'build'), { recursive: true });
writeFileSync(BUNDLE_TARGET_STAMP, bundleTarget);

const duration = Math.round((Date.now() - startedAt) / 1000);
console.log(`\nBUILD SUCCESSFUL in ${duration}s`);
console.log(`APK: ${APK}`);
console.log(`     ${built.size} bytes, ${new Date(built.mtimeMs).toISOString()}`);
