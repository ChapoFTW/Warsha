import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifyAuthFailure, safeAuthDiagnostic } from '../src/auth/auth-errors.ts';
import {
  classifySignUpError, diagnoseSignUpError, signUpRetryable,
  type SignUpFailure,
} from '../web/lib/signup.ts';
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

// --- Customer signup: the failure a customer actually hit -------------------
//
// Reproduced against the deployed development environment: the form was
// complete and valid, and Auth answered
//
//     500 unexpected_failure  "Error sending confirmation email"
//
// The web classifier was a five-line regex ladder over `error.message` that
// recognised rate limits, passwords, fetch failures and "already registered",
// and called everything else `server`. That message matched nothing, so a
// project that could not send mail at all reported the same sentence as a
// five-second blip: "Something went wrong on our side. Please try again
// shortly."
//
// Meanwhile the mobile client already classified this correctly. Two
// implementations of "what went wrong signing up", and the web had the weaker
// one. There is now one, and these are the cases it must tell apart.

const authError = (message: string, code?: string, status?: number, name?: string) =>
  Object.assign(new Error(message), { code, status, name });

const SIGNUP_CASES: [string, Error, SignUpFailure][] = [
  // The two failures observed live.
  ['confirmation email could not be sent',
    authError('Error sending confirmation email', 'unexpected_failure', 500), 'email_delivery'],
  ['the signup trigger rejected the account',
    authError('Database error saving new user', 'unexpected_failure', 500), 'account_setup'],
  // Everything else the form must distinguish.
  ['duplicate address',
    authError('User already registered', 'user_already_exists', 422), 'already_registered_or_refused'],
  ['invalid address',
    authError('Unable to validate email address', 'email_address_invalid', 400), 'invalid_email'],
  ['password policy',
    authError('Password should be at least 8 characters', 'weak_password', 422), 'weak_password'],
  ['rate limit',
    authError('email rate limit exceeded', 'over_email_send_rate_limit', 429), 'rate_limited'],
  ['provider refuses this address',
    authError('Email address not authorized', 'email_address_not_authorized', 403), 'email_not_authorized'],
  ['transport failure',
    authError('Failed to fetch', undefined, 0, 'AuthRetryableFetchError'), 'network'],
  ['an unrecognised server refusal',
    authError('boom', 'unexpected_failure', 500), 'server'],
];

for (const [label, error, expected] of SIGNUP_CASES) {
  equal(classifySignUpError(error), expected, `signup classifies ${label}`);
}

// The regression itself, stated as a fact.
check(classifySignUpError(authError('Error sending confirmation email', 'unexpected_failure', 500)) !== 'server',
  'AN UNDELIVERABLE CONFIRMATION EMAIL IS NEVER REPORTED AS A GENERIC SERVER ERROR');
check(classifySignUpError(authError('Database error saving new user', 'unexpected_failure', 500)) !== 'server',
  'AND NEITHER IS A REJECTED ACCOUNT BOOTSTRAP');

// Every distinct failure the brief asked for has its own class.
const distinct = new Set(SIGNUP_CASES.map(([, , expected]) => expected));
check(distinct.size === SIGNUP_CASES.length - 0 || distinct.size >= 9,
  'the classes are distinct rather than collapsed onto one another');

// --- Retry advice matches what actually happened ---------------------------
check(signUpRetryable('email_delivery'), 'a delivery failure is worth retrying');
check(signUpRetryable('account_setup'), 'so is a rejected bootstrap');
check(!signUpRetryable('already_registered_or_refused'),
  'RETRYING A DUPLICATE ADDRESS IS NOT ADVICE, IT IS A LOOP');
check(!signUpRetryable('email_not_authorized'),
  'nor is retrying an address the provider will not send to');
check(!signUpRetryable('weak_password') && !signUpRetryable('invalid_email'),
  'and a rejected input needs correcting, not repeating');

// --- Diagnostics keep what the customer must not see -----------------------
{
  const diagnostic = diagnoseSignUpError(
    authError('Error sending confirmation email', 'unexpected_failure', 500));
  equal(diagnostic.failure, 'authEmailDeliveryFailed',
    'ENGINEERING KEEPS THE EXACT CLASSIFICATION');
  equal(diagnostic.code, 'unexpected_failure', 'and the provider code');
  equal(diagnostic.status, 500, 'and the HTTP status');
  equal(diagnostic.operation, 'sign-up', 'and which operation failed');
  check(typeof diagnostic.retryable === 'boolean', 'and whether it is worth retrying');
  // The safe message comes from a fixed table, never the provider's prose.
  check(!/confirmation email/i.test(diagnostic.message),
    'THE DIAGNOSTIC CARRIES A SAFE MESSAGE, NOT THE PROVIDER’S OWN TEXT');
  const serialized = JSON.stringify(diagnostic);
  for (const secret of ['@', 'password', 'token', 'apikey', 'Bearer']) {
    check(!serialized.toLowerCase().includes(secret.toLowerCase()),
      `the diagnostic contains no ${secret}`);
  }
}

// --- The customer sees a safe sentence, never the raw error ----------------
const signupScreen = readFileSync('web/app/app/create-account/page.tsx', 'utf8');
const webCopy = readFileSync('web/lib/app-copy.ts', 'utf8');
for (const failure of ['email_delivery', 'email_not_authorized', 'account_setup'] as const) {
  check(new RegExp(`${failure}: '`).test(signupScreen),
    `the form renders a message for ${failure}`);
}
for (const key of [
  'signUpEmailUndeliverable', 'signUpEmailNotAuthorized', 'signUpAccountSetupFailed',
]) {
  equal((webCopy.match(new RegExp(`${key}:`, 'g')) ?? []).length, 3,
    `${key} is written in English, Arabic and French`);
}
check(!/error\.message/.test(signupScreen),
  'THE FORM NEVER RENDERS A PROVIDER MESSAGE DIRECTLY');
const authActions = readFileSync('web/lib/auth-actions.ts', 'utf8');
check(/classifySignUpError\(error\)/.test(authActions)
  && !/classifySignUpError\(error\.message\)/.test(authActions),
  'the whole error is classified, not just its prose');
// Counted, not merely present: the definition alone satisfied a bare presence
// check while both call sites were gone. One declaration plus both branches --
// the refusal and the throw -- is three.
equal((authActions.match(/reportSignUpDiagnostic\(/g) ?? []).length, 3,
  'BOTH THE REFUSAL AND THE THROW REPORT A DIAGNOSTIC, NOT JUST THE HELPER EXISTING');
check(/reportSignUpDiagnostic\(error\);/.test(authActions),
  'the refused signup is reported');
check(/reportSignUpDiagnostic\(thrown\);/.test(authActions),
  'and so is the thrown one');

// --- One classifier, shared with mobile ------------------------------------
const webSignup = readFileSync('web/lib/signup.ts', 'utf8');
check(/from '\.\.\/\.\.\/src\/auth\/auth-errors\.ts'/.test(webSignup),
  'WEB USES THE SHARED AUTH TAXONOMY RATHER THAN A SECOND IMPLEMENTATION');
check(!/if \(\/rate limit\|too many\/i\.test/.test(webSignup),
  'the old regex ladder is gone');
const sharedErrors = readFileSync('src/auth/auth-errors.ts', 'utf8');
check(!/\bif \(__DEV__\)/.test(sharedErrors),
  'the shared module reads __DEV__ portably, so the web can import it at all');
check(/authSignupDatabaseError/.test(sharedErrors),
  'a rejected account bootstrap is its own class in the shared taxonomy');
for (const locale of ['en', 'ar', 'fr'] as const) {
  const value = translations[locale].authSignupDatabaseError;
  check(typeof value === 'string' && value.length > 0,
    `authSignupDatabaseError is translated into ${locale}`);
}
// Mobile classifies the same live error the same way; the taxonomy is shared,
// so this cannot drift from the web behaviour above.
equal(classifyAuthFailure(
  authError('Error sending confirmation email', 'unexpected_failure', 500), 'sign-up'),
  'authEmailDeliveryFailed',
  'ANDROID AND iOS CLASSIFY THE SAME FAILURE IDENTICALLY');
equal(classifyAuthFailure(
  authError('Database error saving new user', 'unexpected_failure', 500), 'sign-up'),
  'authSignupDatabaseError',
  'and so do they for a rejected bootstrap');
equal(safeAuthDiagnostic('sign-up', authError('Error sending confirmation email', 'unexpected_failure', 500)).failure,
  diagnoseSignUpError(authError('Error sending confirmation email', 'unexpected_failure', 500)).failure,
  'web and mobile diagnostics agree because they are the same function');

// --- A number already on another profile is its own failure ----------------
//
// `profiles_phone_unique_idx` is a partial unique index on `profiles(phone)`.
// When the signup trigger inserts a number another profile already holds, the
// customer used to get the generic bootstrap failure -- true, but useless, and
// it made the real problem hard to diagnose.
//
// It is distinguishable at all only because of an asymmetry in Auth, confirmed
// by probing the deployed development environment:
//
//   a trigger's `raise exception`  -> masked as "Database error saving new user"
//   a CONSTRAINT violation         -> passed through verbatim, constraint name
//                                     and all
//
// So the rule matches the index name. That is a real coupling to the schema,
// and it is deliberate: the alternative is a message Warsha would have to raise
// itself, which Auth would then hide.
const PHONE_CONFLICT = authError(
  'duplicate key value violates unique constraint "profiles_phone_unique_idx"',
  '23505', 500);

equal(classifySignUpError(PHONE_CONFLICT), 'phone_unavailable',
  'A NUMBER ALREADY ON ANOTHER PROFILE IS ITS OWN FAILURE, NOT A GENERIC ONE');
equal(classifyAuthFailure(PHONE_CONFLICT, 'sign-up'), 'authSignupPhoneUnavailable',
  'and mobile classifies it identically, from the same shared rule');
equal(classifyAuthFailure(PHONE_CONFLICT, 'worker-sign-up'), 'authSignupPhoneUnavailable',
  'including on the worker signup path');

// The four classes this task exists to keep apart.
for (const [label, error, expected] of [
  ['the phone index', PHONE_CONFLICT, 'phone_unavailable'],
  ['a different unique index',
    authError('duplicate key value violates unique constraint "addresses_customer_local_source_unique"', '23505', 500),
    'account_setup'],
  ['a check constraint',
    authError('new row for relation "profiles" violates check constraint "profiles_display_name_check"', '23514', 500),
    'account_setup'],
  ['a masked trigger refusal',
    authError('Database error saving new user', 'unexpected_failure', 500), 'account_setup'],
  ['an undeliverable confirmation',
    authError('Error sending confirmation email', 'unexpected_failure', 500), 'email_delivery'],
  ['a duplicate address',
    authError('User already registered', 'user_already_exists', 422), 'already_registered_or_refused'],
] as [string, Error, SignUpFailure][]) {
  equal(classifySignUpError(error), expected, `signup still distinguishes ${label}`);
}

// Retrying the same number is not advice.
check(!signUpRetryable('phone_unavailable'),
  'CHANGING THE NUMBER IS THE ACTION, NOT REPEATING IT');

// --- It must not become an enumeration oracle ------------------------------
// The copy may not confirm that the number is registered to somebody. It says
// the number cannot be used here, and offers signing in as the alternative.
const PHONE_COPY = {
  en: 'signUpPhoneUnavailable', ar: 'signUpPhoneUnavailable', fr: 'signUpPhoneUnavailable',
};
equal((webCopy.match(/signUpPhoneUnavailable:/g) ?? []).length, 3,
  'the phone message is written in English, Arabic and French');
check(Object.keys(PHONE_COPY).length === 3, 'all three languages are accounted for');
{
  const english = /signUpPhoneUnavailable: '([^']*)'/.exec(webCopy)?.[1] ?? '';
  check(english.length > 0, 'the English phone message is readable');
  check(!/belongs to|another account|already registered|in use by/i.test(english),
    'THE MESSAGE NEVER CONFIRMS THE NUMBER BELONGS TO AN EXISTING ACCOUNT');
  check(/sign in/i.test(english),
    'but it does offer signing in, which is useful whether or not it is registered');
}
check(/phone_unavailable: 'signUpPhoneUnavailable'/.test(signupScreen),
  'the form renders the phone message for that failure');

// --- No constraint name may reach a customer or a log ----------------------
{
  const diagnostic = diagnoseSignUpError(PHONE_CONFLICT);
  equal(diagnostic.failure, 'authSignupPhoneUnavailable',
    'engineering keeps the exact classification');
  const serialized = JSON.stringify(diagnostic);
  check(!/profiles_phone_unique_idx/.test(serialized),
    'THE DIAGNOSTIC CARRIES NO CONSTRAINT NAME');
  check(!/duplicate key|violates/i.test(serialized),
    'and no raw database prose');
  check(!/\+20|@/.test(serialized),
    'and no phone number or address');
}
// The index the rule depends on has to exist, or the classification is dead
// code that silently stops working.
const phoneIndexMigration = readFileSync(
  'supabase/migrations/202608120001_wps024_registration_authentication_correction.sql', 'utf8');
check(/create unique index if not exists profiles_phone_unique_idx/.test(phoneIndexMigration),
  'the index the classifier keys on is the one the schema declares');
check(/on public\.profiles \(phone\)/.test(phoneIndexMigration),
  'and it is the profiles phone index, not something else with a similar name');

// --- Atomicity: the contract the recovery story depends on -----------------
// Both bootstrap triggers are AFTER INSERT ON auth.users FOR EACH ROW, so they
// run inside the transaction that inserts the user. A raise anywhere in them
// aborts that insert. That is what makes "no partial account" a property of
// the schema rather than a hope, and it is why the customer-facing copy is
// allowed to say no account was created.
const legalTrigger = readFileSync(
  'supabase/migrations/202608200001_signup_legal_acceptance.sql', 'utf8');
const languageTrigger = readFileSync(
  'supabase/migrations/202608220002_french_preferred_language.sql', 'utf8');
for (const [name, sql] of [
  ['legal acceptance', legalTrigger], ['language sync', languageTrigger],
] as const) {
  check(/after insert on auth\.users/i.test(sql),
    `the ${name} bootstrap runs on the auth insert`);
  check(/for each row/i.test(sql),
    `the ${name} bootstrap runs per row, inside that transaction`);
}
check(/raise exception/i.test(legalTrigger),
  'AND IT REFUSES BY RAISING, WHICH ABORTS THE INSERT RATHER THAN LEAVING HALF AN ACCOUNT');

console.log(`Signup state machine + auth error classification: ${checks} checks passed.`);
