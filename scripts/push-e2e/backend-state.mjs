/**
 * What the SERVER believes about this account's push registration.
 *
 * The device half of the push proof is observable on screen; the backend half
 * is not. A release build's Hermes console does not reach logcat, so "the app
 * got a token and told the server" cannot be read from the device at all — and
 * the thing that actually matters to a person receiving a notification is
 * whether the SERVER has a live association for their account.
 *
 * So this asks the server, the same way the app does: sign in across the
 * worker-auth boundary, then call `get_my_push_state` with that session. No
 * service key, no direct table access, no RLS bypass — every answer here is one
 * the account could get about itself.
 *
 * It prints state, never credentials. The access token, the refresh token and
 * the publishable key never reach stdout, because this output is meant to be
 * pasted into a report.
 *
 * Usage:
 *   node scripts/push-e2e/backend-state.mjs
 *     WARSHA_SUPABASE_URL  project URL
 *     WARSHA_SUPABASE_KEY  publishable/anon key
 *     WARSHA_QA_CREDS      path to the QA credentials JSON (phone, password)
 */
import { readFileSync } from 'node:fs';

const url = process.env.WARSHA_SUPABASE_URL;
const key = process.env.WARSHA_SUPABASE_KEY;
const credsPath = process.env.WARSHA_QA_CREDS ?? 'D:/Warsha-Temp/qa-worker.json';

if (!url || !key) {
  console.error('WARSHA_SUPABASE_URL and WARSHA_SUPABASE_KEY are required.');
  process.exit(2);
}

const creds = JSON.parse(readFileSync(credsPath, 'utf8'));

/** Cross the worker-auth boundary exactly as `worker-auth-client.ts` does. */
async function signIn() {
  const response = await fetch(`${url}/functions/v1/worker-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ action: 'sign_in', phone: creds.phone, password: creds.password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.accessToken) {
    // Report the status and any error CODE, never the body: a failed auth
    // response can echo submitted material back.
    throw new Error(`worker-auth sign_in failed: HTTP ${response.status} ${body?.code ?? ''}`.trim());
  }
  return body.accessToken;
}

async function pushState(accessToken) {
  const response = await fetch(`${url}/rest/v1/rpc/get_my_push_state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
    body: '{}',
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`get_my_push_state: HTTP ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const token = await signIn();
console.log('sign-in: OK (token not printed)');

const state = await pushState(token);
console.log('\n=== get_my_push_state ===');
console.log(JSON.stringify(state, null, 2));

/*
 * A registration identifies a device. The token is the thing a push is
 * addressed to, so it is treated as a credential here and only its shape is
 * reported — enough to say "a real Expo token is registered" without putting
 * one in a log somebody later pastes into an issue.
 */
const rows = Array.isArray(state) ? state : [state].filter(Boolean);
console.log('\n=== summary ===');
console.log(`registrations: ${rows.length}`);
for (const row of rows) {
  const value = row?.expo_push_token ?? row?.token ?? row?.push_token ?? null;
  const shape = typeof value === 'string'
    ? `${value.slice(0, 18)}…(${value.length} chars)`
    : 'none';
  console.log(`  token=${shape} revoked=${row?.revoked_at ?? row?.revoked ?? 'no'} `
    + `platform=${row?.platform ?? '?'} language=${row?.language ?? '?'}`);
}
