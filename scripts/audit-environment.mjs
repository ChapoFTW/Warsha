#!/usr/bin/env node
/**
 * WPS-018 environment, route, and asset audit.
 *
 * Three launch-blocking classes of mistake that no unit test would catch:
 * a secret shipped with a public prefix, a route that exists but is not
 * registered, and an asset referenced by configuration that is not in the repo.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const failures = [];
const notes = [];

/* ---------------------------------------------------------------------------
 * 1. Environment
 * ------------------------------------------------------------------------ */
const envExample = readFileSync('.env.example', 'utf8');
const declared = [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(match => match[1]);

for (const required of ['EXPO_PUBLIC_DATA_MODE', 'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_ADMIN_SURFACE']) {
  if (!declared.includes(required)) failures.push(`.env.example does not declare ${required}`);
}

// Anything the client reads must be declared, so a build cannot silently
// depend on a variable nobody documented.
const sourceFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(entry.name)) sourceFiles.push(full);
  }
})('src');
for (const dir of ['app', 'components']) if (existsSync(dir)) (function walk(d) {
  for (const entry of readdirSync(d, { withFileTypes: true })) {
    const full = join(d, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
  }
})(dir);

const usedPublic = new Set();
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)) usedPublic.add(match[1]);
  // A non-public secret name must never be read from the client bundle.
  for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    const name = match[1];
    // Expo injects these itself; they are platform facts, not configuration.
    if (name.startsWith('EXPO_PUBLIC_') || name === 'NODE_ENV' || name === 'EXPO_OS') continue;
    if (file.startsWith('scripts')) continue;
    failures.push(`${file}: reads non-public environment variable ${name} from client code`);
  }
}
for (const name of usedPublic) {
  if (!declared.includes(name)) failures.push(`.env.example does not declare ${name}, which the client reads`);
}

// A public-prefixed variable must never name a secret.
for (const name of declared) {
  if (/^EXPO_PUBLIC_.*(SERVICE_ROLE|SECRET|PASSWORD|PRIVATE_KEY|TOKEN)/.test(name)) {
    failures.push(`.env.example declares ${name}: a public-prefixed variable is bundled and can never hold a secret`);
  }
}

/* ---------------------------------------------------------------------------
 * 2. Routes
 * ------------------------------------------------------------------------ */
const rootLayout = readFileSync('app/_layout.tsx', 'utf8');
const topLevel = readdirSync('app', { withFileTypes: true })
  .filter(entry => !entry.name.startsWith('+') && !entry.name.startsWith('_'))
  .map(entry => entry.isDirectory() ? entry.name : entry.name.replace(/\.tsx$/, ''))
  .filter(name => name !== 'index');

for (const route of topLevel) {
  const registered = rootLayout.includes(`name="${route}"`)
    || rootLayout.includes(`name="${route}/`)
    || new RegExp(`name="${route}/\\[`).test(rootLayout);
  if (!registered) notes.push(`app/${route} is not named in the root layout Stack`);
}

// Administration is web-only. The guard that used to protect the mobile staff
// surface now lives in web/components/staff-gate.tsx, asserted by the
// web-navigation suite. What must hold here is that the surface stays gone.
if (existsSync('app/admin')) {
  failures.push('app/admin exists: administration is web-only and must not return to mobile');
}
const adminScreens = [];
for (const screen of adminScreens) {
  const text = readFileSync(screen, 'utf8');
  if (!text.includes('useAdmin') && !text.includes('AdminShell')) {
    failures.push(`${relative('.', screen)} does not use the guarded admin shell`);
  }
}

/* ---------------------------------------------------------------------------
 * 3. Assets
 * ------------------------------------------------------------------------ */
const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
const assetRefs = [];
(function collect(node) {
  if (typeof node === 'string') {
    if (node.startsWith('./assets/')) assetRefs.push(node.slice(2));
    return;
  }
  if (Array.isArray(node)) { node.forEach(collect); return; }
  if (node && typeof node === 'object') Object.values(node).forEach(collect);
})(appJson);

for (const ref of new Set(assetRefs)) {
  if (!existsSync(ref)) failures.push(`app.json references ${ref}, which does not exist`);
  else if (statSync(ref).size === 0) failures.push(`${ref} is empty`);
}

// The approved identity is "The Current". A superseded asset must not linger in
// configuration where a store submission would pick it up.
const configText = JSON.stringify(appJson);
for (const legacy of ['react-logo', 'partial-react-logo', 'splash-icon.png',
  './assets/images/icon.png', './assets/images/favicon.png', './assets/images/adaptive-icon.png']) {
  if (configText.includes(legacy)) failures.push(`app.json still references the superseded asset ${legacy}`);
}
if (!configText.includes('warsha-current-approved')) {
  failures.push('app.json does not reference the approved The Current asset set');
}

/* ---------------------------------------------------------------------------
 * 4. Mobile release configuration
 * ------------------------------------------------------------------------ */
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
for (const profile of ['development', 'preview', 'production']) {
  if (!eas.build?.[profile]) failures.push(`eas.json is missing the ${profile} build profile`);
}
if (!appJson.expo?.ios?.bundleIdentifier) notes.push('app.json has no iOS bundleIdentifier (required before a store build)');
if (!appJson.expo?.android?.package) notes.push('app.json has no Android package (required before a store build)');

for (const note of notes) console.warn(`note: ${note}`);

if (failures.length) {
  console.error('Environment audit failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Environment audit clean: ${declared.length} declared variables, ${topLevel.length} top-level routes, ${new Set(assetRefs).size} configured assets, ${notes.length} open notes.`);
