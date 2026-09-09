/**
 * Phase A activation, performed through the governed staff authority.
 *
 * The owner's part of this is authentication and nothing else: sign in to
 * Production as a `super_administrator`, satisfy MFA, and be recently
 * authenticated. This script does the technical work with that session, which
 * is the division of labour `docs/operations/operating-model.md` describes —
 * the console deliberately does not carry an activation button for exactly this
 * reason.
 *
 * ## The session is treated as a credential
 *
 * `WARSHA_STAFF_TOKEN` is read, used as a bearer token, and never printed,
 * echoed, written to a file, or included in any error message. What is reported
 * is what the SERVER says about the session — assurance level, freshness in
 * seconds — which is the part that matters and none of which identifies anybody.
 *
 * ## It refuses to guess
 *
 * The environment is read from the live backend and compared with the
 * environment being requested before anything is written. `staff_set_push_
 * configuration` performs the same check itself and would refuse a mismatch —
 * this is the same refusal, reached earlier and with a clearer message.
 *
 * ## It will not mutate without being told to
 *
 * Default is a dry run. `--confirm` is required to write, so an accidental
 * invocation reports the state it would have changed and changes nothing.
 *
 * Usage:
 *   node scripts/push-e2e/activate.mjs                 report only
 *   node scripts/push-e2e/activate.mjs --confirm       perform Phase A
 *   node scripts/push-e2e/activate.mjs --phase b --confirm
 *   node scripts/push-e2e/activate.mjs --stand-down --confirm
 *
 *   WARSHA_STAFF_TOKEN  Production staff access token (never printed)
 */
import { resolvePublicKey } from './public-key.mjs';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const confirm = has('--confirm');
const standDown = has('--stand-down');
const phase = (valueOf('--phase', 'a') || 'a').toLowerCase();

const staffToken = process.env.WARSHA_STAFF_TOKEN;
if (!staffToken) {
  console.error(
    'WARSHA_STAFF_TOKEN is not set.\n\n'
    + 'This needs a Production staff session held by an account with the\n'
    + '`manage_notification_configuration` capability (only super_administrator\n'
    + 'carries it), with MFA satisfied and authenticated within the last 15\n'
    + 'minutes. The token is used in memory and never printed or stored.');
  process.exit(2);
}

const resolved = await resolvePublicKey({ apkPath: process.env.WARSHA_APK });
const { url, key } = resolved;

const tokenShape = `${staffToken.length} chars`;
console.log(`project ${url}`);
console.log(`staff session supplied (${tokenShape}, not printed)\n`);

async function rpc(name, payload, { auth = staffToken } = {}) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${auth}`,
    },
    body: JSON.stringify(payload ?? {}),
  });
  const text = await response.text();
  if (!response.ok) {
    // PostgREST echoes the SQL error, which is the useful part. It contains no
    // credential material — these functions raise on capability and freshness,
    // never on the token's contents.
    let detail = text.slice(0, 400);
    try { detail = JSON.parse(text).message ?? detail; } catch { /* keep raw */ }
    const error = new Error(`${name}: HTTP ${response.status} — ${detail}`);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

// --- 1. Which platform is this ---------------------------------------------
const platform = await rpc('get_platform_operational_status', {});
const environment = platform?.environment;
console.log('=== platform ===');
console.log(`environment           : ${environment}`);
console.log(`launch phase          : ${platform?.launchPhase}`);
console.log(`active kill switches  : ${(platform?.activeSwitches ?? []).join(', ') || 'none'}`);
console.log(`read-only maintenance : ${platform?.readOnlyMaintenance}`);

if (environment !== 'production') {
  console.error(
    `\nRefusing to continue: this backend reports "${environment}", not production.`);
  process.exit(3);
}

// --- 2. Is the session actually good enough --------------------------------
// Asked before anything is written, so a stale session produces a clear
// "sign in again" rather than a refusal from inside the activation call.
console.log('\n=== staff session ===');
let session;
try {
  session = await rpc('staff_reauthenticate', {});
} catch (error) {
  console.error(String(error.message));
  console.error(
    '\nThe session did not satisfy the staff gate. That is one of:\n'
    + '  - the account holds no staff capability\n'
    + '  - MFA is not satisfied (AAL2 required in Production)\n'
    + '  - the sign-in is older than the re-authentication window\n'
    + 'Sign in again and re-run. Nothing was changed.');
  process.exit(4);
}
console.log(`assurance level  : ${session?.assuranceLevel}`);
console.log(`freshness        : ${session?.freshnessSeconds}s`);
console.log(`reauth valid     : ${session?.reauthValid}`);

if (session?.reauthValid !== true) {
  console.error('\nRefusing to continue: the session is not freshly authenticated.');
  process.exit(4);
}

// --- 3. What is about to change --------------------------------------------
const target = standDown
  ? { provider: 'disabled', registration: false, delivery: false,
      reason: 'Stand push down after the end-to-end proof' }
  : phase === 'b'
    ? { provider: 'expo', registration: true, delivery: true,
        reason: 'Enable delivery for the synthetic QA push proof on the QA device only' }
    : { provider: 'expo', registration: true, delivery: false,
        reason: 'Enable token registration for the Production push proof, delivery stays off' };

console.log('\n=== intended change ===');
console.log(`provider              : ${target.provider}`);
console.log(`token registration    : ${target.registration}`);
console.log(`push delivery         : ${target.delivery}`);
console.log(`reason                : ${target.reason}`);

if (!confirm) {
  console.log('\nDry run. Nothing was changed. Re-run with --confirm to apply.');
  process.exit(0);
}

// --- 4. Apply, through the one governed writer -----------------------------
const result = await rpc('staff_set_push_configuration', {
  p_environment: 'production',
  p_provider: target.provider,
  p_token_registration_enabled: target.registration,
  p_push_delivery_enabled: target.delivery,
  p_reason: target.reason,
});

console.log('\n=== applied ===');
console.log(JSON.stringify(result, null, 2));
console.log(
  '\nAn audit row was written: action `push_configuration_changed`, capability\n'
  + '`manage_notification_configuration`, carrying the before and after values.');
