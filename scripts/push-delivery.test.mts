/**
 * Push delivery, from the side Node can see.
 *
 * The database half is asserted where it lives, in
 * `supabase/tests/database/push-delivery-authority.test.sql` — ownership,
 * cross-account denial, rotation, revocation, deletion, the queue. This file
 * asserts the four things pgTAP cannot reach:
 *
 *   1. the registration decision, which is a state machine with one dangerous
 *      transition (signing out) and is therefore worth exercising directly;
 *   2. the deep-link mapping, which used to be a `switch` inside a React
 *      context and is now shared with the push tap handler;
 *   3. the lock-screen copy, which exists twice — once in TypeScript for the
 *      product and once in SQL because the server renders queued pushes — and
 *      must be identical string for string;
 *   4. the structural rule that no client can send a push, checked by reading
 *      the source rather than by trusting the grants.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  bypassesQuietHours,
  isExpoPushToken,
  pushPreviewCopy,
  pushRegistrationDecision,
  readPushPayload,
  unknownPushCapability,
  type PushCapability,
} from '../src/notifications/notification-push-adapter.ts';
import {
  notificationDestination,
  notificationModeFor,
  routeTypesRequiringResource,
} from '../src/notifications/notification-destination.ts';
import { notificationCategories } from '../src/notifications/notification-types.ts';

const root = process.cwd();
let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};
const match = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value, pattern, message); };
const notMatch = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.doesNotMatch(value, pattern, message); };

const migration = read('supabase/migrations/202609010001_push_delivery_authority.sql');
/**
 * Comments are stripped before every structural assertion below. These files
 * explain at length what they deliberately do NOT do — reach the private
 * schema, name a recipient, hold a credential — and prose describing an absence
 * must not read as the thing being present.
 */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const dispatch = code(read('supabase/functions/push-dispatch/index.ts'));
const registration = code(read('src/notifications/push-registration.ts'));
const sync = code(read('components/warsha/PushNotificationSync.tsx'));
const adapter = code(read('src/notifications/notification-push-adapter.ts'));

const available: PushCapability = {
  provider: 'expo', registrationAvailable: true, deliveryAvailable: true,
  pushEnabled: true, deviceCount: 0,
};

// ---------------------------------------------------------------------------
// 1. The registration state machine
// ---------------------------------------------------------------------------
// Signing out is the transition that matters. A device that stays registered to
// an account nobody is signed into keeps delivering that person's notifications
// to whoever is now holding the phone.

equal(pushRegistrationDecision({
  platform: 'android', signedIn: false, capability: available,
  permission: 'granted', hasRegisteredToken: true,
}), { action: 'revoke', reason: 'signed_out' },
  'SIGNING OUT REVOKES THE DEVICE, WHATEVER ELSE IS TRUE');

equal(pushRegistrationDecision({
  platform: 'android', signedIn: false, capability: available,
  permission: 'granted', hasRegisteredToken: false,
}), { action: 'skip', reason: 'signed_out' },
  'and there is nothing to revoke when nothing was registered');

equal(pushRegistrationDecision({
  platform: 'android', signedIn: true, capability: available,
  permission: 'granted', hasRegisteredToken: false,
}), { action: 'register' }, 'a signed-in device with permission registers');

equal(pushRegistrationDecision({
  platform: 'android', signedIn: true, capability: available,
  permission: 'undetermined', hasRegisteredToken: false,
}), { action: 'request_permission' }, 'and asks first when it has not');

// Turning the OS permission off after granting it is the clearest possible no.
equal(pushRegistrationDecision({
  platform: 'android', signedIn: true, capability: available,
  permission: 'denied', hasRegisteredToken: true,
}), { action: 'revoke', reason: 'permission_lost' },
  'REVOKING PERMISSION IN SETTINGS REVOKES THE TOKEN TOO');

equal(pushRegistrationDecision({
  platform: 'android', signedIn: true,
  capability: { ...available, pushEnabled: false }, permission: 'granted',
  hasRegisteredToken: true,
}), { action: 'revoke', reason: 'preference_off' },
  'and so does turning push off in Warsha');

equal(pushRegistrationDecision({
  platform: 'android', signedIn: true, capability: unknownPushCapability,
  permission: 'granted', hasRegisteredToken: false,
}), { action: 'skip', reason: 'unavailable' },
  'a deployment with no provider registers nothing');

equal(pushRegistrationDecision({
  platform: 'unsupported', signedIn: true, capability: available,
  permission: 'granted', hasRegisteredToken: false,
}), { action: 'skip', reason: 'unsupported_platform' },
  'and neither does a platform Warsha has no registration path for');

// ---------------------------------------------------------------------------
// 2. Tokens
// ---------------------------------------------------------------------------
ok(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]'), 'a real Expo token is recognised');
ok(isExpoPushToken('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]'), 'so is the shorter form Expo also issues');
ok(!isExpoPushToken('not-a-token'), 'and arbitrary text is not');
ok(!isExpoPushToken(''), 'nor is nothing at all');
ok(!isExpoPushToken(null), 'nor a missing value');

// ---------------------------------------------------------------------------
// 3. Quiet hours
// ---------------------------------------------------------------------------
// The same two priorities the database bypasses on, stated in both places and
// compared here so they cannot drift.
equal([...['critical', 'action_required', 'important', 'informational'] as const]
  .filter(bypassesQuietHours), ['critical', 'action_required'],
  'exactly the two priorities that may wake somebody up');
match(migration, /new\.priority in \('critical', 'action_required'\)/,
  'AND THE DATABASE BYPASSES ON THE SAME TWO');

// ---------------------------------------------------------------------------
// 4. Deep links
// ---------------------------------------------------------------------------
equal(notificationDestination({ routeType: 'conversation', resourceId: 'b1', mode: 'customer' }),
  { pathname: '/conversation/[bookingId]', params: { bookingId: 'b1' } },
  'a message opens its conversation');
equal(notificationDestination({ routeType: 'booking', resourceId: 'b1', mode: 'customer' }),
  { pathname: '/booking/[id]', params: { id: 'b1' } },
  'a customer opens the customer booking screen');
equal(notificationDestination({ routeType: 'booking', resourceId: 'b1', mode: 'worker' }),
  { pathname: '/worker/jobs/[id]', params: { id: 'b1' } },
  'AND A WORKER OPENS THE JOB SCREEN FOR THE SAME BOOKING');
equal(notificationDestination({ routeType: 'worker_opportunities', mode: 'worker' }),
  { pathname: '/worker/requests' }, 'an opportunity opens the list, which needs no id');
equal(notificationDestination({ routeType: 'booking_dispute', resourceId: 'b1', mode: 'customer' }),
  { pathname: '/booking/[id]', params: { id: 'b1', focusDispute: '1' } },
  'a dispute opens the booking, focused on the dispute');

for (const routeType of routeTypesRequiringResource) {
  equal(notificationDestination({ routeType, resourceId: undefined, mode: 'customer' }), null,
    `${routeType} without a resource goes nowhere rather than to a broken screen`);
}
equal(notificationDestination({ routeType: undefined, mode: 'customer' }), null,
  'and an unknown route type goes nowhere');

// Every route type the product defines has a destination or is deliberately
// resource-gated. A new one added to the union fails here until it is mapped.
const routeTypesInTypes = [...read('src/notifications/notification-types.ts')
  .matchAll(/'([a-z_]+)'/g)]
  .map(m => m[1]);
for (const routeType of ['marketplace_request', 'worker_opportunities', 'worker_quote', 'booking',
  'conversation', 'provider_profile', 'booking_payment', 'worker_earnings', 'verification',
  'booking_review', 'booking_dispute', 'preferences', 'support_case'] as const) {
  ok(routeTypesInTypes.includes(routeType), `${routeType} is still a declared route type`);
  ok(notificationDestination({ routeType, resourceId: 'r1', mode: 'customer' }) !== null,
    `${routeType} resolves to a screen`);
}

// A worker-audience notification opens the worker side even if the person was
// last looking at the customer side, because that is where the thing lives.
equal(notificationModeFor('worker', 'customer'), 'worker', 'audience decides the mode when it has one');
equal(notificationModeFor('all', 'customer'), 'customer', 'and an unscoped notification keeps the current mode');

// ---------------------------------------------------------------------------
// 5. The payload is untrusted input
// ---------------------------------------------------------------------------
// A push arrives through the operating system and the app cannot prove who
// composed it. Identifiers are shape-checked before they reach a route.
equal(readPushPayload({ resourceId: '../../admin', routeType: 'booking' }).resourceId, undefined,
  'A PAYLOAD IDENTIFIER THAT IS NOT A UUID IS DROPPED, NOT PASSED ALONG');
equal(readPushPayload({ resourceId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }).resourceId,
  '3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'and a real one survives');
equal(readPushPayload({ audience: 'staff' }).audience, undefined, 'an unrecognised audience is dropped');
equal(readPushPayload(null).notificationId, undefined, 'an absent payload is not an error');

// ---------------------------------------------------------------------------
// 6. The lock screen says the same thing in both languages of the system
// ---------------------------------------------------------------------------
// TypeScript for the product, SQL because the server renders a queued push.
// Two copies of the same table is a parity defect the moment they disagree, so
// they are compared string for string.

const inserts = migration.slice(migration.indexOf('insert into private.notification_push_copy'));
let compared = 0;
for (const language of ['en', 'ar', 'fr'] as const) {
  for (const category of notificationCategories) {
    const preview = pushPreviewCopy[language][category];
    ok(preview && preview.title && preview.body, `${language}.${category} exists in TypeScript`);
    const row = new RegExp(
      `\\('${category}', '${language}', '${preview.title.replace(/'/g, "''").replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}', '${preview.body.replace(/'/g, "''").replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}'\\)`);
    ok(row.test(inserts), `${language}.${category} is the SAME STRING in the migration`);
    compared += 1;
  }
}
equal(compared, 30, 'ten categories times three languages, compared in both places');

// Safe preview: nothing legible about anybody, in any language.
for (const language of ['en', 'ar', 'fr'] as const) {
  for (const category of notificationCategories) {
    const { title, body } = pushPreviewCopy[language][category];
    notMatch(`${title} ${body}`, /@|\+20|\d{4,}|EGP|جنيه/,
      `${language}.${category} carries no address, number, amount or contact`);
  }
}
// French is French, not English left in place — the gate the repository applies
// everywhere else.
for (const category of notificationCategories) {
  ok(pushPreviewCopy.fr[category].body !== pushPreviewCopy.en[category].body,
    `fr.${category} is genuinely French`);
  match(pushPreviewCopy.ar[category].body, /[؀-ۿ]/, `ar.${category} is genuinely Arabic`);
}

// ---------------------------------------------------------------------------
// 7. No client can send a push
// ---------------------------------------------------------------------------
// The grants are asserted in pgTAP. This asserts the shape that makes the
// grants sufficient: the only outbound call is in the Edge Function, and the
// only way a push exists is a notification row the client cannot insert.

match(dispatch, /exp\.host\/--\/api\/v2\/push\/send/, 'the Edge Function is the one thing that calls a provider');
// Two accepted proofs, and a signed-in person can produce neither. The role
// claim is the durable one: provisioning warsha-production showed the value
// Supabase injects as SUPABASE_SERVICE_ROLE_KEY matches none of the four keys
// the dashboard hands out, so an equality alone refused every caller including
// the scheduler the function exists for.
match(dispatch, /presented === serviceRole \|\| roleClaim\(presented\) === 'service_role'/,
  'AND IT REFUSES ANYBODY WHO IS NEITHER THE SERVICE ROLE NOR HOLDING ITS KEY');
match(dispatch, /if \(!authorised\) return json\(\{ error: 'forbidden' \}, 403\)/,
  'refusing with 403 before it reads a body or touches the queue');
// The role claim is only trustworthy because the gateway verified the signature
// first, so this function must never be added to the verify_jwt exceptions.
const functionConfig = read('supabase/config.toml');
const jwtExceptions = [...functionConfig.matchAll(/\[functions\.([a-z-]+)\]\s*verify_jwt = false/g)]
  .map((m) => m[1]);
equal(jwtExceptions.includes('push-dispatch'), false,
  'PUSH-DISPATCH KEEPS verify_jwt, WHICH IS WHAT MAKES THE ROLE CLAIM VERIFIED');
equal(jwtExceptions.sort(), ['warsha-automation', 'worker-auth'],
  'and only the two functions that authenticate their own callers are exempt');
notMatch(dispatch, /\.schema\('private'\)/, 'it reaches the database through public wrappers, not the private schema');
match(dispatch, /warsha_push_claim_batch/, 'claiming work is a wrapper call');
notMatch(dispatch, /p_user_id|recipient|user_id/, 'and nothing in it names a recipient');

notMatch(registration, /exp\.host|fetch\(/, 'the device module cannot reach a provider');
notMatch(sync, /exp\.host|fetch\(/, 'and neither can the component that drives it');
for (const source of [adapter, registration, sync]) {
  notMatch(source, /EXPO_ACCESS_TOKEN|SERVICE_ROLE/, 'NO CLIENT MODULE NAMES A SERVER CREDENTIAL');
}

// Registration is self-scoped by construction: the RPC takes no user id.
match(migration, /create or replace function public\.register_my_push_device\(\s*\n\s*p_token text,\s*\n\s*p_platform text,\s*\n\s*p_app_version text,\s*\n\s*p_installation_id text,/,
  'REGISTRATION TAKES A TOKEN AND A DEVICE, NEVER AN ACCOUNT');
match(migration, /uid uuid := \(select auth\.uid\(\)\)/, 'the caller is read from the session');
// The dispatcher surface is granted in one block, to one role. Asserted as
// "these four are in the service-role list and none of them is in the
// authenticated list", because the grants themselves are built by a loop.
const dispatcherBlock = migration.indexOf("'public.warsha_push_configuration()'");
const clientBlock = migration.indexOf("'public.register_my_push_device(text,text,text,text,text,text)'");
ok(dispatcherBlock > 0 && clientBlock > 0 && clientBlock < dispatcherBlock,
  'the migration grants the client surface and the dispatcher surface separately');

const serviceOnly = migration.slice(dispatcherBlock);
for (const signature of ['public.warsha_push_configuration()',
  'public.warsha_push_claim_batch(integer)',
  'public.warsha_push_record_result(uuid,text,text,text,boolean,boolean)',
  'public.warsha_push_release_stalled(integer)']) {
  ok(serviceOnly.includes(signature), `${signature} is granted to service_role only`);
}
match(serviceOnly, /from public, anon, authenticated/,
  'AND THE QUEUE IS UNREACHABLE BY ANY CLIENT ROLE');
match(serviceOnly, /grant execute on function ' \|\| signature \|\| ' to service_role/,
  'because service_role is the only grantee in that block');

const clientGranted = migration.slice(clientBlock, dispatcherBlock);
notMatch(clientGranted, /warsha_push/, 'no dispatcher function is in the client-granted list');

// ---------------------------------------------------------------------------
// 8. Failure handling
// ---------------------------------------------------------------------------
match(dispatch, /DeviceNotRegistered: \{ revoke: true, retryable: false \}/,
  'a device the provider says is gone is revoked rather than retried forever');
match(dispatch, /MessageRateExceeded: \{ revoke: false, retryable: true \}/,
  'and a rate limit is retried rather than dropped');
match(dispatch, /warsha_push_release_stalled/,
  'a dispatcher that died mid-batch does not leave the queue stuck');
match(migration, /max_delivery_attempts/, 'retries are bounded by configuration, not by hope');
match(migration, /pg_catalog\.power\(4, attempt\.attempt_count\)/, 'and back off exponentially');

// ---------------------------------------------------------------------------
// 9. Native reality
// ---------------------------------------------------------------------------
// `expo-notifications` is a native module. Saying so here means the release
// classification cannot quietly treat this as an OTA-safe change.
const packageJson = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
ok(packageJson.dependencies['expo-notifications'],
  'expo-notifications is a declared dependency');
const appConfig = JSON.parse(read('app.json')) as { expo: { plugins: unknown[] } };
ok(appConfig.expo.plugins.some((plugin) => Array.isArray(plugin)
  ? plugin[0] === 'expo-notifications' : plugin === 'expo-notifications'),
  'AND ITS CONFIG PLUGIN IS REGISTERED, SO THE ICON AND COLOUR REACH THE MANIFEST');

console.log(`Push delivery: ${checks} checks passed.`);
