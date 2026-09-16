import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const appConfig = readFileSync('app.config.js', 'utf8');
const environmentGuard = readFileSync('scripts/qa-preview-environment.mjs', 'utf8');
const releaseGuard = readFileSync('scripts/qa-release.mjs', 'utf8');
const runbook = readFileSync('docs/operations/qa-preview-runbook.md', 'utf8');

let checks = 0;
function check(value: unknown, message: string) {
  assert.ok(value, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.equal(actual, expected, message);
  checks += 1;
}

const development = eas.build.development;
const preview = eas.build.preview;
const production = eas.build.production;

equal(development.developmentClient, true, 'Development remains a development client');
equal(development.distribution, 'internal', 'Development remains internally distributed');
equal(development.channel, 'development', 'Development stays on its own channel');
equal(development.environment, 'development', 'Development uses Development EAS variables');

check(preview.developmentClient !== true, 'Preview is not a development client');
equal(preview.distribution, 'internal', 'Preview is internal distribution');
equal(preview.channel, 'preview', 'Preview receives only the Preview channel');
equal(preview.environment, 'preview', 'Preview uses only the Preview EAS environment');
equal(preview.android?.buildType, 'apk', 'Android Preview produces an installable APK');
equal(eas.build.base.env.EXPO_PUBLIC_DATA_MODE, 'supabase', 'product builds default to Supabase mode');

equal(production.channel, 'production', 'Production stays on its own channel');
equal(production.environment, 'production', 'Production uses only Production variables');
check(new Set([development.channel, preview.channel, production.channel]).size === 3,
  'Development, Preview and Production channels are disjoint');
check(!JSON.stringify(preview).includes('staging'), 'Preview no longer targets the obsolete staging channel');

equal(app.extra.eas.projectId, '6c8fbcda-6bb2-40b2-b8db-3b0ce127525f',
  'the app is bound to the Warsha EAS project');
equal(app.updates.url, 'https://u.expo.dev/6c8fbcda-6bb2-40b2-b8db-3b0ce127525f',
  'EAS Update URL is project-specific');
/*
 * This asked for `appVersion`, and said it was there so that "runtime
 * compatibility follows the native app version". It did not do that.
 *
 * `appVersion` follows the DECLARED version, which has been 1.0.0 since the
 * first build. So every binary Warsha has ever produced shares one runtime
 * version, and an update published against 1.0.0 is considered compatible with
 * all of them — including binaries built before a native dependency changed.
 * The policy's own caveat is exactly this: forget to bump the version when the
 * native runtime changes and you have a mismatch. Nothing here ever bumped it.
 *
 * `fingerprint` is a hash of what actually affects the native project
 * (@expo/fingerprint, SDK 54), so it changes when the native layer changes and
 * holds still for JS-only work — which is both halves of what this line was
 * always claiming. The requirement did not move; the mechanism that satisfies
 * it did. See docs/operations/release-management-runbook.md.
 */
equal(app.runtimeVersion.policy, 'fingerprint',
  'runtime compatibility follows the native layer itself, not a version string nobody bumps');
check(app.version !== undefined, 'a human-facing app version is still declared');

/*
 * The fingerprint must hold still for anything that is not the native layer.
 *
 * `app.config.js` stamps `extra.build = { commit, dirty, builtAt }` into the
 * evaluated config, and the fingerprint hashes the evaluated config. Without
 * skipping `extra`, two fingerprints generated seconds apart differed
 * (49237f0d… and 19cfbaac…): every build its own runtime version, and no update
 * ever applicable to any binary. Versions are skipped for the same reason — an
 * `autoIncrement` build number is identity, not native compatibility.
 *
 * This is checked against the config file rather than by running the
 * fingerprint, because the regression is someone deleting a line here, and a
 * deterministic suite should not depend on evaluating the whole native project.
 */
{
  const fingerprintConfig = createRequire(join(process.cwd(), 'package.json'))('./fingerprint.config.js') as
    { sourceSkips?: string[] };
  const skips = fingerprintConfig?.sourceSkips ?? [];
  check(skips.includes('ExpoConfigExtraSection'),
    'the build stamp in extra cannot move the runtime version, so updates stay applicable');
  check(skips.includes('ExpoConfigVersions'),
    'a build number or version bump cannot move the runtime version either');
  check(!skips.includes('ExpoConfigAll'),
    'but the native config itself is still fingerprinted — skipping all of it would let an incompatible update through');
  check(/builtAt/.test(appConfig) ? skips.includes('ExpoConfigExtraSection') : true,
    'a time-varying value in the app config is only safe while extra is skipped');
}
check(/^\d+\.\d+\.\d+$/.test(app.version), 'the app version is explicit and releasable');
check(Boolean(pkg.dependencies['expo-updates']), 'expo-updates is installed in the native runtime');

for (const dependency of [
  'expo-camera', 'expo-location', 'expo-image-picker', 'expo-document-picker',
  'expo-secure-store', 'expo-sqlite', 'react-native-maps',
]) {
  check(Boolean(pkg.dependencies[dependency]), `Preview includes ${dependency}`);
}

check(appConfig.includes("requiredRenderKey('GOOGLE_MAPS_ANDROID_RENDER_KEY')"),
  'Android Maps native configuration fails closed');
check(appConfig.includes("requiredRenderKey('GOOGLE_MAPS_IOS_RENDER_KEY')"),
  'iOS Maps native configuration fails closed');
check(!JSON.stringify(eas).includes('GOOGLE_MAPS_SERVER_KEY'),
  'no server Maps credential is written into EAS build profiles');
check(!JSON.stringify(eas).includes('SUPABASE_SERVICE_ROLE_KEY'),
  'no Supabase service credential is written into EAS build profiles');
check(!JSON.stringify(eas).includes('EXPO_PUBLIC_SUPABASE_URL'),
  'the hosted backend URL is not committed in a build profile');
check(environmentGuard.includes('lrhipbcapzfxuwixfoog.supabase.co'),
  'the runtime environment guard pins Preview to warsha-development');
check(environmentGuard.includes('GOOGLE_MAPS_SERVER_KEY')
  && environmentGuard.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'the runtime environment guard rejects server credentials');
check(environmentGuard.includes("EXPO_PUBLIC_ADMIN_SURFACE !== 'enabled'"),
  'the Preview environment guard preserves the internal QA admin surface');

const runtimeFiles: string[] = [];
function walk(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name) && statSync(path).size < 2_000_000) runtimeFiles.push(path);
  }
}
for (const directory of ['app', 'components', 'src']) walk(directory);
const localEndpoint = /https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d{1,3}\.\d{1,3})(?::\d+)?/i;
for (const file of runtimeFiles) {
  check(!localEndpoint.test(readFileSync(file, 'utf8')), `${file} has no hard-coded local endpoint`);
}

for (const script of ['qa:status', 'qa:validate', 'qa:update', 'qa:build:android']) {
  check(Boolean(pkg.scripts[script]), `${script} is available`);
}
/**
 * The release gate must actually run every audit that governs a shipped
 * property.
 *
 * `audit:appearance` was defined and wired into `audit:all`, but not into
 * `qa:validate` — so a commit that put a colour literal outside the theme
 * definition reached origin/main with the gate reporting green. A gate that
 * cannot see a class of failure does not prevent it. Each of these is asserted
 * by name so removing one is a deliberate act with a failing test attached.
 */
for (const audit of ['audit:migrations', 'audit:secrets', 'audit:appearance', 'check:mojibake']) {
  check(pkg.scripts[audit], `${audit} exists as a script`);
  check(releaseGuard.includes(`'${audit}'`),
    `THE RELEASE GATE ACTUALLY RUNS ${audit}, NOT ONLY audit:all`);
}

check(releaseGuard.includes("'--channel', 'preview'"), 'the OTA command is locked to Preview');
check(releaseGuard.includes("'--environment', 'preview'"), 'QA commands are locked to Preview variables');
check(releaseGuard.includes("['env:exec', 'preview'"),
  'Preview exports execute inside the remote Preview EAS environment');
check(releaseGuard.includes("'expo', 'config', '--type', 'public', '--json'"),
  'the resolved Expo project and runtime are checked before export');
check(releaseGuard.includes('--ota-compatible'), 'OTA publication requires an explicit compatibility decision');
check(!releaseGuard.includes("'--channel', 'production'"), 'the QA release command cannot publish to Production');

for (const phrase of [
  'No Expo Go', 'No Metro', 'warsha-development', '`preview` channel',
  'New Preview build', 'OTA-compatible', 'rollback', 'Apple', 'Web QA',
]) {
  check(runbook.includes(phrase), `the runbook documents ${phrase}`);
}

// ---------------------------------------------------------------------------
// The Firebase config file, and where it is allowed to be missing
// ---------------------------------------------------------------------------
// `google-services.json` carries the FCM sender id an Android binary needs to
// register a push token. It is deliberately NOT committed, which means every
// context that reads the app config has to cope with its absence -- except the
// one that builds the binary.
//
// The first version of this guard threw everywhere but the EAS metadata read
// and broke CI on the spot: a checkout has no file, and CI reads this config
// for `expo config`, three exports and the WPS-024 suite, none of which produce
// an Android artifact. These assertions pin the narrower contract.

check(/googleServicesFile: googleServicesFile\(\)/.test(appConfig),
  'THE ANDROID CONFIG WIRES googleServicesFile');
check(/process\.env\.GOOGLE_SERVICES_JSON/.test(appConfig),
  'it prefers the EAS file environment variable');
check(/existsSync\(LOCAL_GOOGLE_SERVICES\)/.test(appConfig),
  'and falls back to the project root, so a local prebuild works');
check(/if \(!process\.env\.EAS_BUILD_RUNNER\) return undefined;/.test(appConfig),
  'A MISSING FILE IS NOT FATAL OFF THE BUILD WORKER — that is what broke CI');
check(/missing on the build worker/.test(appConfig),
  'and IS fatal on it, so no binary ships unable to register a token');

// The file must never be committed: it is fetched per environment, and a
// committed one would silently pin every build to whichever project it came
// from.
check(readFileSync('.gitignore', 'utf8').split('\n')
  .some((line) => line.trim() === 'google-services.json'),
  'AND THE FILE ITSELF IS GITIGNORED');

console.log(`QA Preview pipeline regressions: ${checks} checks passed.`);
