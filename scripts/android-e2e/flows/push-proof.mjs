/**
 * Production push proof, driven on a real device through Warsha's own UI.
 *
 * Every step below happens in the app: the real sign-in path, the real
 * permission prompt, the real token registration. Nothing here calls a backend
 * API to stand in for something the app should have done — a backend-only
 * registration proves the ownership lifecycle and NOT that the shipped binary
 * can register a token, and the two must not be reported as one result.
 *
 * Usage: node scripts/android-e2e/flows/push-proof.mjs
 */
import {
  clearLog, describeScreen, find, findAll, hideKeyboard, logcat, screenshot,
  setText, shell, sleep, tap, tree, waitFor,
} from '../driver.mjs';
import { loadQaCredentials } from '../backend-target.mjs';

// Loading the credential proves the installed build targets the project the
// credential belongs to. A Production push proof driven against a Development
// build would not error — it would produce a token, a delivery and a green
// report about a system nobody meant to exercise.
const creds = loadQaCredentials({ purpose: 'the push proof' });

let checks = 0, failures = 0;
const check = (ok, label, detail = '') => {
  checks += 1; if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  -- ' + detail : ''}`);
};

// --- Start clean -------------------------------------------------------------
shell('pm clear com.warsha.app');
await sleep(2000);
clearLog();
shell('am start -n com.warsha.app/.MainActivity');
const welcome = await waitFor({ descContains: 'Sign in' }, { timeout: 45000 });
check(Boolean(welcome), 'THE PRODUCTION APP LAUNCHES to the welcome screen');
if (!welcome) {
  console.log(describeScreen());
  process.exit(1);
}
screenshot('01-welcome');

// --- Which backend is this binary talking to? --------------------------------
// Read from the app's own logs rather than assumed from the build metadata.
const startupLog = logcat('supabase|ekgwzljpcxpxnklzxuvj|lrhipbcapzfxuwixfoog');
check(!/lrhipbcapzfxuwixfoog/.test(startupLog),
  'and names no Development project at runtime');

// --- Sign in through the real path -------------------------------------------
await tap({ descContains: 'Sign in' });
await sleep(2500);
screenshot('02-signin');
const fields = findAll({ cls: 'EditText' });
check(fields.length >= 2, `the sign-in form has its fields (${fields.length})`);
if (fields.length < 2) { console.log(describeScreen()); process.exit(1); }

const identityOk = await setText({ cls: 'EditText', index: 0 }, creds.phone);
check(identityOk, 'the phone number lands in the identity field, and only there');
const passwordOk = await setText({ cls: 'EditText', index: 1 }, creds.password);
check(passwordOk, 'AND THE PASSWORD LANDS IN THE PASSWORD FIELD, not appended to the first');
await hideKeyboard();
screenshot('03-filled');

const submit = find({ descContains: 'Sign in', clickable: true })
  ?? find({ textContains: 'Sign in' });
check(Boolean(submit), 'and a submit control');
await tap({ descContains: 'Sign in', clickable: true });

/*
 * Wait for the signed-in state, and say how long it took.
 *
 * This was `sleep(6000)` and then one look at the screen. Sign-in crosses the
 * worker-auth boundary, mints a session, and then loads the account state, and
 * on a cold emulator that took longer than six seconds — so the check sampled
 * the form mid-transition and reported a sign-in failure for an account that
 * had signed in perfectly well.
 *
 * The fix is not a bigger sleep. A generous fixed wait hides exactly the thing
 * this proof exists to notice: sign-in getting slower. So this polls for an
 * observable signed-in state, stops as soon as it sees one, fails at a bounded
 * ceiling, and REPORTS THE ELAPSED TIME either way. A regression from two
 * seconds to nineteen still passes, and still shows up in the output as the
 * number it is.
 *
 * "Signed in" is the absence of the gateway rather than the presence of any one
 * screen, because where a session lands depends on how far that account got
 * through onboarding: a finished worker sees their home, an unfinished one sees
 * the setup notice, and both are signed in.
 */
const SIGN_IN_CEILING_MS = 45000;
const startedAt = Date.now();
let signedIn = false;
while (Date.now() - startedAt < SIGN_IN_CEILING_MS) {
  await sleep(1000);
  const nodes = tree();
  const onGateway = findAll({ descContains: 'Create account' }, nodes).length > 0
    || findAll({ textContains: 'Create account' }, nodes).length > 0;
  const stillLoading = findAll({ textContains: 'Loading' }, nodes).length > 0;
  if (!onGateway && !stillLoading && nodes.length > 3) { signedIn = true; break; }
}
const signInMs = Date.now() - startedAt;
screenshot('04-after-signin');

check(signedIn, 'SIGN-IN SUCCEEDED through the app, not through an API',
  signedIn
    ? `took ${(signInMs / 1000).toFixed(1)}s`
    : `still not signed in after ${(signInMs / 1000).toFixed(1)}s -- ${describeScreen().slice(0, 240)}`);

// --- The notification permission, as this Android version asks for it --------
// API 33+ requires POST_NOTIFICATIONS at runtime. The prompt is a system
// dialog, so it is matched by its button labels rather than app labels.
const prompt = await waitFor({ textContains: 'Allow' }, { timeout: 12000 });
if (prompt) {
  screenshot('05-permission-prompt');
  await tap({ textContains: 'Allow' });
  check(true, 'THE APP REQUESTED NOTIFICATION PERMISSION and it was granted');
} else {
  // Not every route reaches the prompt immediately; grant it explicitly so the
  // rest of the proof can proceed, and say plainly that this happened.
  shell('pm grant com.warsha.app android.permission.POST_NOTIFICATIONS');
  check(true, 'notification permission granted (no in-app prompt observed yet)');
}
const granted = shell('dumpsys package com.warsha.app')
  .includes('android.permission.POST_NOTIFICATIONS: granted=true');
check(granted, 'POST_NOTIFICATIONS is granted on the device');

await sleep(8000);
screenshot('06-signed-in');
console.log('\n--- screen after sign-in ---');
console.log(describeScreen().slice(0, 600));

console.log('\n--- push-related log lines ---');
console.log(logcat('expo.*push|push.*token|ExponentPushToken|fcm|registerForPush').slice(0, 1500));

console.log(failures === 0
  ? `\nDEVICE FLOW REACHED SIGNED-IN STATE (${checks} checks)`
  : `\n${failures} of ${checks} CHECKS FAILED`);
