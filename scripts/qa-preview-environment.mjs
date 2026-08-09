#!/usr/bin/env node

/**
 * Runtime EAS-environment guard for Preview builds and updates.
 *
 * This script reports only names and conclusions. It never prints a value.
 */

const failures = [];
const expectedHost = 'lrhipbcapzfxuwixfoog.supabase.co';

if (process.env.EXPO_PUBLIC_DATA_MODE !== 'supabase') {
  failures.push('EXPO_PUBLIC_DATA_MODE must be supabase');
}

let target;
try {
  target = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '');
} catch {
  failures.push('EXPO_PUBLIC_SUPABASE_URL is missing or invalid');
}
if (target && (target.protocol !== 'https:' || target.hostname !== expectedHost)) {
  failures.push('EXPO_PUBLIC_SUPABASE_URL is not hosted warsha-development');
}

const publishable = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!publishable || publishable.trim().length < 20) {
  failures.push('the Supabase publishable client key is missing');
}

if (process.env.EXPO_PUBLIC_ADMIN_SURFACE !== 'enabled') {
  failures.push('EXPO_PUBLIC_ADMIN_SURFACE must be enabled for internal QA');
}

for (const name of ['GOOGLE_MAPS_ANDROID_RENDER_KEY', 'GOOGLE_MAPS_IOS_RENDER_KEY']) {
  if (!process.env[name]?.trim()) failures.push(`${name} is missing`);
}

for (const forbidden of [
  'GOOGLE_MAPS_SERVER_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
]) {
  if (process.env[forbidden]) failures.push(`${forbidden} must not be available to Preview`);
}

if (failures.length) {
  console.error('Preview EAS environment check failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  'Preview EAS environment valid: hosted warsha-development, Supabase mode, '
  + 'both native Maps render variables present, no server credential exposed.',
);
