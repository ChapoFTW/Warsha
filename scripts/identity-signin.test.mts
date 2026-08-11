import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifySignInIdentity, isSyntheticWorkerIdentity, visibleContactEmail }
  from '../src/auth/auth-identifier.ts';
import { classifyAuthFailure } from '../src/auth/auth-errors.ts';
import { homeRouteFor, defaultModeFor } from '../src/navigation/worker-route-policy.ts';
import { startupRouteDecision } from '../src/navigation/startup-route-policy.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const signIn = readFileSync('app/sign-in.tsx', 'utf8');
const webSignIn = readFileSync('web/app/[locale]/sign-in/page.tsx', 'utf8');
const authContext = readFileSync('src/auth/auth-context.tsx', 'utf8');

// --- Nobody is asked to classify their own account -------------------------
// The defect: the selector cross-checked the identifier against a declared
// role, so a worker who left it on Customer and typed their phone number was
// told the credentials were invalid. They were not; the form was.
check(!/setMode|accountMode|'customer' \| 'worker'>/.test(signIn),
  'MOBILE SIGN-IN HOLDS NO CUSTOMER/WORKER SELECTION STATE');
check(!/accessibilityRole="radiogroup"/.test(signIn),
  'mobile sign-in offers no account-type radio group');
check(!/customerAccount|workerAccount/.test(signIn),
  'mobile sign-in never labels the person a customer or a worker');
check(!/mode === 'customer'|mode === 'worker'/.test(signIn),
  'no branch in sign-in depends on a self-declared role');
check(/signInIdentity'\)/.test(signIn) && /signInIdentityHint/.test(signIn),
  'mobile sign-in asks for an identifier with neutral wording');

check(!/signInCustomerBody|signInWorkerBody/.test(webSignIn),
  'WEB SIGN-IN NO LONGER SPLITS INTO TWO AUDIENCE CARDS');
check(/signInOneAccount/.test(webSignIn) && /signInIdentity/.test(webSignIn),
  'web sign-in states that one sign-in serves everyone');

// --- The identifier alone selects the credential path ----------------------
equal(classifySignInIdentity('person@example.com'),
  { kind: 'customer_email', email: 'person@example.com' },
  'an address routes to email/password authentication');
equal(classifySignInIdentity('01099221105'),
  { kind: 'worker_phone', phone: '+201099221105' },
  'a local phone number routes to the worker broker');
equal(classifySignInIdentity('+201099221105'),
  { kind: 'worker_phone', phone: '+201099221105' },
  'an international phone number routes the same way');
equal(classifySignInIdentity('not-an-identifier'), null,
  'an unusable identifier is refused before any network call');
equal(classifySignInIdentity(''), null, 'an empty identifier is refused');
check(/if \(!classifySignInIdentity\(identifier\)\)/.test(signIn),
  'the only pre-flight check is whether the identifier is usable at all');
check(/identity\.kind === 'customer_email'/.test(authContext)
  && /signInWorker\(identity\.phone/.test(authContext),
  'auth routes on the identifier shape, not on anything the person selected');

// --- Wrong credentials stay non-enumerating --------------------------------
equal(classifyAuthFailure({ status: 400, code: 'invalid_credentials' }, 'password-sign-in'),
  'authInvalidCredentials',
  'a wrong password is reported without revealing whether the account exists');
equal(classifyAuthFailure({ status: 400, code: 'invalid_credentials' }, 'worker-password-sign-in'),
  'authInvalidCredentials',
  'A WRONG WORKER PASSWORD IS INDISTINGUISHABLE FROM AN UNKNOWN PHONE NUMBER');
check(/sanitizeAuthError\(error,/.test(authContext),
  'sign-in failures pass through the sanitiser rather than raw provider text');

// --- The synthetic worker identity stays hidden ----------------------------
const syntheticUser = {
  app_metadata: { worker_synthetic_identity: true },
  email: 'worker.0123456789abcdef0123456789abcdef@auth.warsha.invalid',
} as never;
check(isSyntheticWorkerIdentity(syntheticUser), 'a synthetic worker identity is recognised');
equal(visibleContactEmail(syntheticUser), null,
  'A WORKER IS NEVER SHOWN THE SYNTHETIC ADDRESS BEHIND THEIR ACCOUNT');
check(!/auth\.warsha\.invalid/.test(signIn + webSignIn),
  'neither sign-in surface mentions the synthetic address');

// --- Role is resolved after authentication, from server state --------------
// These are the states the gate resolves once the session exists. The client
// never guesses: `target` comes from account hydration.
equal(homeRouteFor('customer_home'), '/', 'a customer-only account lands on the customer home');
equal(homeRouteFor('worker_home'), '/worker', 'a worker-only account lands on the worker home');
equal(homeRouteFor('worker_onboarding'), '/onboarding/worker',
  'an incomplete worker resumes onboarding rather than an operational shell');
equal(homeRouteFor('role_choice'), '/create-account',
  'an account with no recorded role is sent to the role authority, not guessed');
equal(defaultModeFor('worker_home'), 'provider',
  'a dual-capable account opens in its worker experience by default');
equal(defaultModeFor('customer_home'), 'customer',
  'a customer-only account opens in the customer experience');

const base = { mode: 'customer' as const, workerCapabilityActive: false, legalAcceptanceRequired: false };
equal(startupRouteDecision({ ...base, ready: false, pathname: '/', target: 'customer_home' }),
  { status: 'loading', redirect: null },
  'NO EXPERIENCE IS CHOSEN BEFORE ACCOUNT STATE HAS RESOLVED');
equal(startupRouteDecision({ ...base, ready: true, pathname: '/', target: 'worker_home',
  mode: 'provider', workerCapabilityActive: true }),
  { status: 'redirecting', redirect: '/worker' },
  'a worker-only account is routed to the worker experience after resolution');
equal(startupRouteDecision({ ...base, ready: true, pathname: '/', target: 'customer_home' }),
  { status: 'render', redirect: null },
  'a customer-only account is routed to the customer experience after resolution');

// A stale session resolves to signed-out without ever painting a product shell.
equal([
  startupRouteDecision({ ...base, ready: false, pathname: '/', target: 'customer_home' }),
  startupRouteDecision({ ...base, ready: true, pathname: '/', target: 'gateway' }),
  startupRouteDecision({ ...base, ready: true, pathname: '/welcome', target: 'gateway' }),
].map(step => step.status), ['loading', 'redirecting', 'render'],
  'A STALE SESSION FALLS BACK TO SIGNED-OUT WITHOUT SHOWING AN ACCOUNT');
check(/auth\.getUser\(\)/.test(authContext),
  'a persisted session is validated with the server before it is trusted');

// --- Staff access is never inferred on the client --------------------------
const gate = readFileSync('components/warsha/AuthGate.tsx', 'utf8');
check(!/admin|staff/i.test(gate),
  'THE STARTUP GATE NEVER ROUTES ANYBODY INTO ADMIN; STAFF ACCESS IS CAPABILITY-GATED SERVER-SIDE');
const routePolicy = readFileSync('src/navigation/startup-route-policy.ts', 'utf8');
check(!/admin|staff/i.test(routePolicy),
  'the route policy has no notion of staff, so it cannot guess one');

console.log(`Identity-driven sign-in regressions: ${checks} checks passed.`);
