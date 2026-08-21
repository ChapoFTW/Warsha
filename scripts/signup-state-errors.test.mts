import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifyAuthFailure } from '../src/auth/auth-errors.ts';
import { translations } from '../src/i18n/translations.ts';
import {
  isSignupBusy,
  signupAfterRoleChange,
  signupConfirmationRequired,
  signupErrorKey,
  signupFailed,
  signupIdle,
  signupPendingNotice,
  signupSubmitting,
  signupSucceeded,
  type SignupState,
} from '../src/auth/signup-machine.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

// --- The state machine -----------------------------------------------------
// The reported defect: a pending confirmation notice and a failure rendered
// together. These assert that the two cannot coexist in any reachable state.

const states: SignupState[] = [
  signupIdle,
  signupSubmitting(),
  signupConfirmationRequired(),
  signupSucceeded(),
  signupFailed('authSignupServerError'),
];
for (const state of states) {
  check(!(signupPendingNotice(state) && signupErrorKey(state) !== null),
    `${state.status} cannot be pending and failed at the same time`);
}

check(signupPendingNotice(signupConfirmationRequired()),
  'the pending notice is shown only for confirmation_required');
check(signupErrorKey(signupFailed('authPhoneInUse')) === 'authPhoneInUse',
  'an actionable error carries the message it will render');
check(signupErrorKey(signupConfirmationRequired()) === null,
  'a pending confirmation renders no error');
check(!signupPendingNotice(signupFailed('authSignupServerError')),
  'a failure renders no pending notice');

// A second attempt after a pending first attempt is the exact reported trace.
const afterPendingThenRetry = signupSubmitting();
check(!signupPendingNotice(afterPendingThenRetry) && signupErrorKey(afterPendingThenRetry) === null,
  'starting another attempt clears the previous pending result before awaiting');
const failedSecondAttempt = signupFailed('authSignupServerError');
check(!signupPendingNotice(failedSecondAttempt),
  'a failed second attempt cannot leave the first attempt notice on screen');

check(isSignupBusy(signupSubmitting()), 'submitting is the only busy state');
for (const state of [signupIdle, signupConfirmationRequired(), signupSucceeded(),
  signupFailed('authError')]) {
  check(!isSignupBusy(state), `${state.status} is not busy`);
}
equal(signupAfterRoleChange(), signupIdle,
  'changing audience resets to idle so no result crosses between roles');

// --- Hosted failure signatures ---------------------------------------------
// Each of these was reproduced against hosted development on 2026-08-10.

// A pre-release client omits the legal manifest; the Auth trigger refuses and
// GoTrue reports a generic 500. It must not read as a transient blip only.
equal(classifyAuthFailure({ status: 500, code: 'unexpected_failure' }, 'sign-up'),
  'authSignupServerError',
  'a 500 during account creation is an operation-specific retryable failure');
equal(classifyAuthFailure({ status: 429, code: 'over_email_send_rate_limit' }, 'sign-up'),
  'authRateLimited',
  'the built-in mailer send limit is reported as rate limiting, not a server fault');
equal(classifyAuthFailure({ status: 400, code: 'email_address_not_authorized' }, 'sign-up'),
  'authEmailDeliveryRestricted',
  'a recipient the development mailer will not serve is named as such');

// --- Stale bundle: the 2026-08-10 Preview failure --------------------------
// A device still running the 2f8a2a4 bundle — which predates mandatory signup
// acceptance and therefore sends no manifest — was refused by the acceptance
// writer inside the signup transaction. GoTrue reported only "Database error
// saving new user", no account or audit entry was created, and nothing on
// screen said the app needed updating.
//
// The client cannot be told which of the two known causes applied. WPS-023
// narrowed the anon-executable surface to nine sanctioned reads and the
// signed-out legal reader calls nothing, so there is no server question a
// customer may ask before signing up, and widening that surface to answer one
// is not a trade this failure justifies. The copy therefore carries both
// remedies, and these assert it does.
const signupFailureCopy = Object.values(translations)
  .map(copy => copy.authSignupServerError);
check(signupFailureCopy.length === 3,
  'the signup failure copy exists in every supported language');
check(signupFailureCopy.every(copy => /Update Warsha|حدّث تطبيق ورشة|Mettez Warsha à jour/.test(copy)),
  'THE SIGNUP FAILURE NAMES UPDATING THE APP, WHICH A STALE BUNDLE CANNOT REPORT');
check(signupFailureCopy.every(copy => /check the details|راجع البيانات|vérifiez vos informations/i.test(copy)),
  'the signup failure also names the other known cause, a detail already in use');
check(signupFailureCopy.every(copy => !/\bemail\b|\baddress\b|بريد/i.test(copy)),
  'the signup failure never hints whether an email address already has an account');
check(classifyAuthFailure({ status: 500, code: 'unexpected_failure' }, 'sign-up')
  === 'authSignupServerError',
  'the stale-bundle refusal keeps one stable machine-readable code');

// --- Worker broker contract ------------------------------------------------
const workerClient = readFileSync('src/auth/worker-auth-client.ts', 'utf8');
const broker = readFileSync('supabase/functions/worker-auth/index.ts', 'utf8');

const brokerCodes = [...broker.matchAll(/code: '([a-z_]+)'/g)].map(match => match[1]);
const registerCodes = new Set(brokerCodes);
check(registerCodes.size >= 6, 'the broker returns a classified code for each refusal');
for (const code of registerCodes) {
  check(new RegExp(`\\b${code}\\b`).test(workerClient),
    `the client maps broker code ${code} to a specific message`);
}
check(/legal_acceptance_required/.test(broker) && /legal_acceptance_required/.test(workerClient),
  'a missing signup manifest is distinguishable from a malformed name');
check(/authOutdatedClient/.test(workerClient),
  'a contract mismatch tells somebody to update rather than to retry');
check(!/throw new SafeAuthError\('authError'\)/.test(workerClient),
  'WORKER REGISTRATION NO LONGER COLLAPSES EVERY FAILURE INTO A GENERIC MESSAGE');
check(/authNetworkError/.test(workerClient),
  'an unreadable response is reported as a connectivity failure');

// --- Copy safety -----------------------------------------------------------
const translationsSource = readFileSync('src/i18n/translations.ts', 'utf8');
const authCopy = readFileSync('src/auth/auth-translations.ts', 'utf8');
check(/authOutdatedClient/.test(translationsSource), 'the update-required message is localized');
check(Object.values(translations).every(copy => copy.authOutdatedClient.length > 0),
  'the update-required message exists in every supported language');
const pending = /customerConfirmationPending: '([^']*)'/.exec(authCopy)?.[1] ?? '';
check(pending.length > 0, 'the customer pending copy was found');
check(!/\bsent\b|\bwe (?:have )?sent\b|\bdelivered\b/i.test(pending),
  'CUSTOMER PENDING COPY NEVER CLAIMS AN EMAIL WAS SENT OR DELIVERED');

// --- Signup screen wiring --------------------------------------------------
const screen = readFileSync('app/create-account.tsx', 'utf8');
check(!/setNotice\(|setMessage\(/.test(screen),
  'the screen holds no second result string beside the state machine');
check(/setSignup\(signupSubmitting\(\)\)/.test(screen),
  'every attempt begins by discarding the previous result');
check(/pendingConfirmation \? \(/.test(screen) && /\) : errorKey \? \(/.test(screen),
  'the notice and the error are branches of one expression');
check(/setEmail\(''\)/.test(screen),
  'the customer email never survives a switch to the worker application');
check(/signupAfterRoleChange\(\)/.test(screen),
  'changing role resets the signup result');
check(/choice === 'worker' \? null : email\.trim\(\)/.test(screen),
  'a worker registration sends no email address even if one was typed');
check(/setCommonLegalAccepted\(false\)/.test(screen)
  && /setWorkerVerificationAccepted\(false\)/.test(screen),
  'legal acceptance never carries across a change of audience');

console.log(`Signup state machine + auth error classification: ${checks} checks passed.`);
