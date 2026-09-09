/**
 * What Production actually looks like, before anything is switched on.
 *
 * `docs/operations/push-activation-preflight.md` argues from the schema that
 * enabling push cannot release a backlog. That argument is sound, but it is an
 * argument. This is the observation: it asks the live Production backend what
 * it currently believes, using only the synthetic QA account and only RPCs that
 * account is entitled to call.
 *
 * No service key, no staff session, no direct table read, no RLS bypass. Every
 * answer here is one the QA account can legitimately get about itself or about
 * the platform's public posture — which is precisely why it can be run before
 * any owner authorisation exists.
 *
 * It prints state, never credentials.
 *
 * Usage:
 *   node scripts/push-e2e/preflight.mjs
 *     WARSHA_QA_CREDS  path to the QA credentials JSON (phone, password)
 */
import { readFileSync } from 'node:fs';

import { resolvePublicKey } from './public-key.mjs';

const credsPath = process.env.WARSHA_QA_CREDS ?? 'D:/Warsha-Temp/qa-worker.json';

const resolved = await resolvePublicKey({ apkPath: process.env.WARSHA_APK });
const { url, key } = resolved;
console.log(`project ${url}`);
console.log(`key fingerprint ${resolved.fingerprint} (len ${resolved.length})\n`);

const creds = JSON.parse(readFileSync(credsPath, 'utf8'));

async function signIn() {
  const response = await fetch(`${url}/functions/v1/worker-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ action: 'sign_in', phone: creds.phone, password: creds.password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.accessToken) {
    throw new Error(`worker-auth sign_in failed: HTTP ${response.status} ${body?.code ?? ''}`.trim());
  }
  return body.accessToken;
}

async function rpc(name, accessToken, payload = {}) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    return { error: `HTTP ${response.status}`, detail: text.slice(0, 160) };
  }
  return text ? JSON.parse(text) : null;
}

const token = await signIn();
console.log('sign-in: OK (token not printed)\n');

// --- Which platform is this, really -----------------------------------------
// The activation call states the environment it believes it is configuring and
// the database refuses a mismatch. This is how that belief is formed from
// evidence rather than from the project URL looking familiar.
const platform = await rpc('get_platform_operational_status', token);
console.log('=== platform ===');
console.log(JSON.stringify(platform, null, 2));

// --- The three switches, as the product sees them ---------------------------
const push = await rpc('get_my_push_state', token);
console.log('\n=== push state (QA account) ===');
console.log(JSON.stringify(push, null, 2));

// --- The conclusion, stated so a reader does not have to infer it -----------
const environment = platform?.environment ?? 'unknown';
const provider = push?.provider ?? 'unknown';
const registration = push?.registrationAvailable ?? push?.registration_available ?? null;
const delivery = push?.deliveryAvailable ?? push?.delivery_available ?? null;
const devices = push?.deviceCount ?? push?.device_count ?? null;
const switches = Array.isArray(platform?.activeSwitches) ? platform.activeSwitches : [];

console.log('\n=== preflight conclusion ===');
console.log(`environment            : ${environment}`);
console.log(`active kill switches   : ${switches.length === 0 ? 'none' : switches.join(', ')}`);
console.log(`read-only maintenance  : ${platform?.readOnlyMaintenance ?? 'unknown'}`);
console.log(`push provider          : ${provider}`);
console.log(`registration available : ${registration}`);
console.log(`delivery available     : ${delivery}`);
console.log(`devices for QA account : ${devices}`);

const safe =
  provider === 'disabled' && registration === false
  && delivery === false && devices === 0;

console.log(
  `\nPhase A precondition   : ${safe ? 'HOLDS' : 'DOES NOT HOLD — investigate before activating'}`);
if (safe) {
  console.log(
    'Push is off, nothing is registered, and nothing can be queued. Enabling\n'
    + 'token registration cannot deliver anything, because delivery stays off and\n'
    + 'the enqueue trigger is forward-only.');
}
process.exitCode = safe ? 0 : 1;
