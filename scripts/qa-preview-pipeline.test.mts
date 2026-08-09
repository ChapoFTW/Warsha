import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
equal(app.runtimeVersion.policy, 'appVersion', 'runtime compatibility follows the native app version');
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

console.log(`QA Preview pipeline regressions: ${checks} checks passed.`);
