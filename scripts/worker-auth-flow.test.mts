import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createWorkerAuthFlow,
  transitionWorkerAuthFlow,
  workerAuthVisibleErrorKey,
  workerOtpVisible,
} from '../src/auth/worker-auth-flow.ts';
import { classifySignInIdentity } from '../src/auth/auth-identifier.ts';
import { workerSyntheticEmail } from '../supabase/functions/_shared/worker-auth-identity.ts';

const fresh = createWorkerAuthFlow();
assert.equal(fresh.stage, 'PHONE_ENTRY', 'fresh worker sign-in starts at phone entry');
assert.equal(workerAuthVisibleErrorKey(fresh), null, 'fresh worker sign-in has no error');
assert.equal(workerOtpVisible(fresh), false, 'fresh worker sign-in hides the OTP field');
const sending = transitionWorkerAuthFlow(fresh, { type: 'SEND_STARTED' });
const codeSent = transitionWorkerAuthFlow(sending, { type: 'SEND_SUCCEEDED' });
assert.equal(codeSent.stage, 'CODE_SENT', 'successful send records CODE_SENT');
const otpEntry = transitionWorkerAuthFlow(codeSent, { type: 'OTP_PRESENTED' });
assert.equal(otpEntry.stage, 'OTP_ENTRY', 'successful send presents OTP entry');
assert.equal(workerOtpVisible(otpEntry), true, 'OTP field is visible in OTP_ENTRY');
const verifying = transitionWorkerAuthFlow(otpEntry, { type: 'VERIFY_STARTED' });
assert.equal(verifying.stage, 'VERIFYING', 'OTP submission enters VERIFYING');
const invalidCode = transitionWorkerAuthFlow(verifying, { type: 'VERIFY_FAILED', errorKey: 'authInvalidOtp' });
assert.equal(invalidCode.stage, 'OTP_ENTRY', 'invalid code keeps the user in OTP_ENTRY');
assert.equal(workerOtpVisible(invalidCode), true, 'invalid code is shown only with the OTP field visible');
assert.equal(workerAuthVisibleErrorKey(invalidCode), 'authInvalidOtp', 'invalid-code copy is visible at OTP entry');
const editedPhone = transitionWorkerAuthFlow(invalidCode, { type: 'PHONE_CHANGED' });
assert.equal(editedPhone.stage, 'PHONE_ENTRY', 'editing phone returns to phone entry');
assert.equal(workerAuthVisibleErrorKey(editedPhone), null, 'editing phone clears OTP error');
const staleOtpAtPhoneEntry = { ...fresh, errorKey: 'authInvalidOtp' as const, errorScope: 'otp' as const };
assert.equal(workerAuthVisibleErrorKey(staleOtpAtPhoneEntry), null, 'stale invalid OTP cannot render at phone entry');
const sendFailure = transitionWorkerAuthFlow(fresh, { type: 'SEND_FAILED', errorKey: 'authNetworkError' });
assert.equal(sendFailure.stage, 'PHONE_ENTRY', 'failed send remains at phone entry');
assert.equal(workerAuthVisibleErrorKey(sendFailure), 'authNetworkError', 'failed send keeps its specific send-stage error');
const impossibleOtpSendFailure = transitionWorkerAuthFlow(fresh, { type: 'SEND_FAILED', errorKey: 'authInvalidOtp' });
assert.equal(workerAuthVisibleErrorKey(impossibleOtpSendFailure), 'authServerError', 'send endpoint cannot leak invalid-code copy');
const resend = transitionWorkerAuthFlow(invalidCode, { type: 'RESEND_STARTED' });
assert.equal(resend.stage, 'OTP_ENTRY', 'resend keeps OTP entry visible');
assert.equal(workerAuthVisibleErrorKey(resend), null, 'resend clears invalid/expired code error');
const changedOtp = transitionWorkerAuthFlow(invalidCode, { type: 'OTP_CHANGED' });
assert.equal(workerAuthVisibleErrorKey(changedOtp), null, 'editing OTP clears the prior OTP error');
const verified = transitionWorkerAuthFlow(verifying, { type: 'VERIFIED' });
assert.equal(verified.stage, 'VERIFIED', 'successful OTP enters VERIFIED');
assert.equal(workerAuthVisibleErrorKey(verified), null, 'successful OTP clears all errors');
assert.deepEqual(transitionWorkerAuthFlow(invalidCode, { type: 'PATH_SWITCHED' }), fresh, 'switching Customer/Worker clears transient auth state');
assert.deepEqual(transitionWorkerAuthFlow(invalidCode, { type: 'REMOUNTED' }), fresh, 'screen remount does not restore stale error');

// ---------------------------------------------------------------------------
// WPS-024 correction: the state machine is RETAINED, and is wired to nothing
// ---------------------------------------------------------------------------
//
// Everything above still passes because the module is unchanged. It is kept
// deliberately: a future verify-phone or step-up flow will need exactly this,
// and rewriting a correct state machine from memory later is how the
// stale-error and race behaviour it encodes gets lost.
//
// What changed is that no REGISTRATION surface may drive it. These assertions
// are the ones that would fail if somebody reintroduced an SMS code as a
// condition of getting an account.

const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');
const createAccount = readFileSync('app/create-account.tsx', 'utf8');
const signIn = readFileSync('app/sign-in.tsx', 'utf8');

assert.match(profile, /useFocusEffect/, 'route focus resets transient auth state');

for (const [name, source] of [
  ['the profile screen', profile],
  ['the create-account screen', createAccount],
  ['the sign-in screen', signIn],
] as const) {
  assert.doesNotMatch(source, /requestWorkerOtp|verifyWorkerOtp/,
    `${name} drives no registration or sign-in OTP`);
  assert.doesNotMatch(source, /transitionWorkerAuthFlow/,
    `${name} does not run the OTP stage machine`);
}

// Registration collects a phone number and validates it. Collection is the
// requirement; proving the handset is not.
assert.match(createAccount, /isValidPhone\(normalizePhone\(phone\)\)/,
  'registration validates the required contact number');
assert.match(createAccount, /choice === 'worker' \? null : email\.trim\(\)/,
  'worker registration sends no user-facing email to the auth provider');
assert.doesNotMatch(createAccount, /isValidSmsOtp/,
  'REGISTRATION ASKS FOR NO VERIFICATION CODE');
assert.doesNotMatch(signIn, /isValidSmsOtp/,
  'SIGNING IN ASKS FOR NO VERIFICATION CODE');

// The one surviving OTP surface, and it is not a gate: nothing is activated,
// granted or unlocked by confirming a number.
const enrollment = profile.slice(
  profile.indexOf('const finishPhoneEnrollment'),
  profile.indexOf('if (auth.loading'),
);
assert.ok(enrollment.length > 0, 'the phone confirmation handler is present');
assert.doesNotMatch(enrollment, /provider\.activate/,
  'CONFIRMING A PHONE NUMBER GRANTS NOTHING');

// ---------------------------------------------------------------------------
// Worker phone/password broker
// ---------------------------------------------------------------------------
assert.deepEqual(classifySignInIdentity('01012345678'), {
  kind: 'worker_phone', phone: '+201012345678',
}, 'worker phone is normalized into the broker identity');
assert.deepEqual(classifySignInIdentity('CUSTOMER@EXAMPLE.COM'), {
  kind: 'customer_email', email: 'customer@example.com',
}, 'customer email remains a direct sign-in identity');
assert.equal(classifySignInIdentity('not-an-identity'), null,
  'malformed identifiers fail before any auth request');

const firstCredential = '4ca0e6f2-9cf0-4bce-8dc7-c97b09cfc113';
const secondCredential = '9ddcb865-bced-45fd-b707-f539f24e1567';
assert.equal(workerSyntheticEmail(firstCredential),
  'worker.4ca0e6f29cf04bce8dc7c97b09cfc113@auth.warsha.invalid',
  'synthetic email derives only from a UUIDv4 credential identifier');
assert.notEqual(workerSyntheticEmail(firstCredential), workerSyntheticEmail(secondCredential),
  'distinct UUID credentials cannot produce the same synthetic identity');
assert.throws(() => workerSyntheticEmail('A Worker Name'),
  'display text cannot become a synthetic auth identity');

const authContext = readFileSync('src/auth/auth-context.tsx', 'utf8');
const broker = readFileSync('supabase/functions/worker-auth/index.ts', 'utf8');
const workerMigration = readFileSync(
  'supabase/migrations/202608150001_worker_phone_password_auth.sql', 'utf8');
const repository = readFileSync('src/repositories/supabase-user-repositories.ts', 'utf8');
const profileRepository = repository.slice(
  repository.indexOf('supabaseCustomerProfileRepository'),
  repository.indexOf('async function listBookings'),
);

assert.match(authContext, /identity\.kind === 'customer_email'[\s\S]*signInWithPassword/,
  'customers still sign in directly with email and password');
assert.match(authContext, /signInWorker\(identity\.phone, password\)/,
  'workers sign in through phone/password mapping');
assert.match(authContext, /registerWorker\([\s\S]*auth\.setSession/,
  'worker registration receives a session without an email-confirmation dependency');
assert.match(authContext, /accountId:\s*data\.user\?\.id/,
  'worker registration returns the established session account for role selection');
assert.match(createAccount, /selectRole\(choice, result\.accountId \?\? undefined\)/,
  'post-registration role selection is pinned to the newly authenticated account');
assert.match(broker, /crypto\.randomUUID\(\)/,
  'the trusted broker, not display text, generates the collision-safe credential ID');
assert.match(broker, /email_confirm: true/,
  'the internal password credential is immediately usable');
assert.doesNotMatch(broker.slice(broker.indexOf('function sessionResponse'),
  broker.indexOf('function databaseRateLimited')), /email/i,
  'the broker session response does not expose the synthetic email');
assert.doesNotMatch(broker, /signInWithOtp|verifyOtp|phone_confirm\s*:|sms\.signIn/i,
  'worker registration and sign-in never call Phone Auth or SMS');
assert.match(workerMigration, /revoke all on private\.worker_auth_identities from public, anon, authenticated, service_role/,
  'no client or staff role can read the phone mapping directly');
assert.match(workerMigration, /grant execute on function public\.resolve_worker_auth_identity\(text\) to service_role/,
  'only the Edge service role can resolve phone to internal identity');
assert.doesNotMatch(profile, /auth\.user\?\.email|auth\.user\.email/,
  'profile UI never renders the raw Auth email');
assert.doesNotMatch(profileRepository, /auth\.getUser|user\?\.email|email:/,
  'profile repository never materializes the Auth email');

console.log('Worker auth regression tests passed: phone/password broker, no worker email UI, registration OTP-free.');
