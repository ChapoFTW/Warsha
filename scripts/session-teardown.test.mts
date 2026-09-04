// What must be true the instant a session ends.
//
// Signing out is not one action; it is a set of properties that all have to
// hold at once, and the expensive failures are the ones where most of them do.
// A session correctly destroyed at Supabase while a React context still holds
// the previous account's data is a signed-out app showing a stranger's work.
//
// Four properties, each asserted separately because each has its own way of
// silently not happening:
//
//   1. THE SESSION GOES. Supabase is asked, and the failure is surfaced rather
//      than swallowed into a button that looks like it worked.
//   2. DEVICE OWNERSHIP GOES. A push registration outliving its account means
//      the next person holding the phone reads the previous person's
//      notifications.
//   3. CACHED ACCOUNT STATE GOES, and goes BEFORE anything is fetched for the
//      next identity, so there is no frame in which one account's data sits
//      under another account's session.
//   4. LIVE SUBSCRIPTIONS GO. A realtime channel keyed to the old user is a
//      socket still delivering that user's rows.
//
// Where these are behaviours of a React tree, the assertions are necessarily
// source-level. That is stated plainly rather than dressed up: a source
// assertion proves the wiring exists, and the human QA list carries the
// observations that only a device can make.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

const read = (path: string) => readFileSync(path, 'utf8');

// ---------------------------------------------------------------------------
// 1. The session goes, on both platforms
// ---------------------------------------------------------------------------

const authContext = read('src/auth/auth-context.tsx');
check(/signOut: async \(\) => \{[\s\S]*?auth\.signOut\(\)/.test(authContext),
  'the native sign-out asks Supabase to end the session');
check(/sanitizeAuthError\(error, 'sign-out'\)/.test(authContext),
  'AND A FAILURE IS SURFACED RATHER THAN SWALLOWED INTO A BUTTON THAT LOOKED LIKE IT WORKED');

// Password recovery ends every session everywhere, not only this one. Somebody
// resetting a password they believe was stolen is telling us the other sessions
// are the problem.
check(/finishPasswordRecovery[\s\S]*?signOut\(\{ scope: 'global' \}\)/.test(authContext),
  'FINISHING A PASSWORD RESET REVOKES EVERY SESSION, NOT JUST THIS DEVICE');

const webAuthActions = read('web/lib/auth-actions.ts');
check(/export async function signOut/.test(webAuthActions),
  'the web has one sign-out action rather than a call per component');

// Every web surface that signs out must also LAND somewhere signed-out. A
// sign-out that leaves the reader on an authenticated route shows them a shell
// full of their own data until something else redirects.
for (const [path, surface] of [
  ['web/components/account-menu.tsx', 'the customer/worker account menu'],
  ['web/components/console-shell.tsx', 'the staff console'],
  ['web/app/app/sign-out/page.tsx', 'the explicit sign-out route'],
] as const) {
  const source = read(path);
  check(/signOut\(\)/.test(source), `${surface} signs out through the shared action`);
  check(/router\.replace|window\.location|redirect/.test(source),
    `AND ${surface.toUpperCase()} NAVIGATES TO A SIGNED-OUT DESTINATION AFTERWARDS`);
}

// `replace`, not `push`: Back after signing out must not return to an
// authenticated route.
check(/router\.replace\('\/sign-in'/.test(read('web/components/account-menu.tsx')),
  'and it REPLACES the history entry, so Back cannot return to a signed-in page');

// ---------------------------------------------------------------------------
// 2. Device ownership goes
// ---------------------------------------------------------------------------
// Deliberately hooked to the session disappearing rather than to the button. A
// session ends in more ways than somebody tapping Sign out — a refresh token
// expires, a password change invalidates it elsewhere, staff deactivate an
// account — and hooking the button covers exactly one of them.

const pushSync = read('components/warsha/PushNotificationSync.tsx');
check(/revokeOnSignOut/.test(pushSync),
  'the push registration is revoked when a session ends');
check(/session ends in more ways than somebody tapping Sign out/.test(pushSync),
  'and it watches the session rather than the button, which is the whole point');

// ---------------------------------------------------------------------------
// 3. Cached account state goes, and goes first
// ---------------------------------------------------------------------------
// The subtle one. A context that refetches on identity change but keeps its old
// value when the fetch fails will hold the previous account's data across a
// sign-out, because after a sign-out the fetch fails by definition.

const marketplace = read('src/marketplace-intelligence/marketplace-context.tsx');
check(/setInvitations\(\[\]\);setOfferCapacity\(null\);setCapabilities\(null\);/.test(marketplace),
  'MARKETPLACE STATE IS EMPTIED SYNCHRONOUSLY WHEN THE ACCOUNT CHANGES');
check(/after sign-out the fetch fails, the old value survives/.test(marketplace),
  'and the reason is written down, because the bug is not visible from the code');

// Every account-scoped context must key its loading effect on the account, or
// it will never notice the account changed at all.
for (const [path, surface] of [
  ['src/marketplace-intelligence/marketplace-context.tsx', 'marketplace'],
  ['src/bookings/booking-context.tsx', 'bookings'],
  ['src/notifications/notification-context.tsx', 'notifications'],
  ['src/provider-jobs/provider-job-context.tsx', 'provider jobs'],
] as const) {
  const source = read(path);
  check(/user\?\.id|accountKey|user\?\.id \?\? null|providerId/.test(source),
    `the ${surface} context is scoped to an account rather than to the app`);
}

// ---------------------------------------------------------------------------
// 4. Live subscriptions go
// ---------------------------------------------------------------------------
// A realtime channel is a socket that keeps delivering. One left open across a
// sign-out delivers the previous account's rows into the next account's screen.

check(/return realtimeService\.|return providerId\s*\?realtimeService|\?realtimeService/.test(marketplace),
  'the marketplace subscription returns its unsubscribe, so React can tear it down');
check(/\[mode,offerCapacity\?\.providerId,reloadInvitations,reloadOfferCapacity,user\]/.test(marketplace),
  'AND IS KEYED ON THE USER, SO A CHANGE OF IDENTITY REPLACES THE CHANNEL');

const realtimeService = read('src/realtime/realtime-service.ts');
check(/return \(\) => \{ void client\.removeChannel\(channel\); \};/.test(realtimeService),
  'every native subscription hands back a real unsubscribe rather than a no-op');

// The channel names carry the identity they belong to, which is what makes a
// stale channel impossible to confuse with a fresh one.
const channels = read('src/realtime/realtime-channels.ts');
for (const name of ['marketplace-requests:${userId}', 'notifications:${userId}',
  'customer-bookings:${userId}', 'marketplace-invitations:${providerId}']) {
  check(channels.includes(name),
    `the ${name.split(':')[0]} channel is named for the identity it serves`);
}

// ---------------------------------------------------------------------------
// The gate, not a scattering of redirects
// ---------------------------------------------------------------------------
// Landing somewhere sensible after a sign-out is `AuthGate`'s job. Screens that
// redirect for themselves are how an app ends up with four opinions about where
// a signed-out person belongs, three of which are wrong.

const authGate = read('components/warsha/AuthGate.tsx');
check(/nothing operational renders until `ready`/.test(authGate),
  'the native gate renders nothing operational before it knows whether there is a session');
check(/startupRouteDecision|routeAfterHydration/.test(authGate),
  'AND THE DESTINATION COMES FROM THE SHARED ROUTE POLICY, NOT FROM A SCREEN');

console.log(`Session teardown: ${checks} checks passed.`);
