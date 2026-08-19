import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  productRolesFor,
  resolveAccount,
  webHomeFor,
  PREFERRED_MODE_KEY,
  isProductMode,
} from '../web/lib/account.ts';
import { emptyOnboardingState, routeFor } from '../src/onboarding/onboarding-types.ts';
import { classifySignInIdentity } from '../src/auth/auth-identifier.ts';
import { customerSetupRecoveryEligible } from '../src/auth/signup-machine.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const readWeb = (...parts: string[]) => readFileSync(join('web', ...parts), 'utf8');

// --- One backend, one set of rules ------------------------------------------
const account = readWeb('lib', 'account.ts');
check(/from '\.\.\/\.\.\/src\/onboarding\/onboarding-types\.ts'/.test(account),
  'THE WEB IMPORTS THE SHARED ROLE AUTHORITY RATHER THAN RESTATING IT');
check(/export \{ routeFor/.test(account),
  'the web resolves destinations with the same pure function as mobile');
const provider = readWeb('components', 'session-provider.tsx');
check(/rpc\('get_my_onboarding_state'\)/.test(provider),
  'account state comes from the same RPC the mobile client calls');
check(/from\('user_roles'\)/.test(provider)
  && /from\('customer_profiles'\)/.test(provider)
  && !/provider_profiles|from\('profiles'\)/.test(provider),
  'legacy recovery reads only the signed-in account evidence exposed by existing RLS');
check(customerSetupRecoveryEligible({ roles: ['customer'], hasCustomerProfile: true })
  && !customerSetupRecoveryEligible({ roles: ['customer', 'provider'], hasCustomerProfile: true }),
  'web and mobile share the same exact-customer recovery predicate');

// --- No second auth system ---------------------------------------------------
const browserClient = readWeb('lib', 'supabase-browser.ts');
check(/NEXT_PUBLIC_SUPABASE_URL/.test(browserClient)
  && /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/.test(browserClient),
  'the web uses the publishable key of the same project');
check(!/service_role|SERVICE_ROLE/i.test(browserClient + provider + account),
  'NO SERVICE ROLE CREDENTIAL EXISTS IN THE SESSION LAYER');
check(/persistSession: true/.test(browserClient) && /autoRefreshToken: true/.test(browserClient),
  'a reload lands on the same account rather than the sign-in page');
check(/flowType: 'pkce'/.test(browserClient),
  'customer confirmation links use the same PKCE flow as mobile');

// --- Identity-driven sign-in -------------------------------------------------
const auth = readWeb('lib', 'auth-actions.ts');
check(/classifySignInIdentity/.test(auth),
  'the identifier shape selects the credential path');
check(!/customer.{0,12}or.{0,12}worker/i.test(auth) && !/chooseRole|selectRole/.test(auth),
  'SIGN-IN NEVER ASKS SOMEBODY WHICH KIND OF ACCOUNT THEY HAVE');
equal(classifySignInIdentity('person@example.com')?.kind, 'customer_email',
  'an address routes to email/password authentication');
equal(classifySignInIdentity('01099221105')?.kind, 'worker_phone',
  'a phone number routes to the worker broker');
equal(classifySignInIdentity('nonsense'), null,
  'an unusable identifier is refused before any network call');
check(/action: 'sign_in'/.test(auth) && /'worker-auth'/.test(auth),
  'worker sign-in goes through the existing governed broker');
// Comments discuss the synthetic identity precisely because keeping it out of
// anything a person can see is the point; only executable code is checked.
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check(!/auth\.warsha\.invalid|synthetic/i.test(withoutComments(auth)),
  'THE SYNTHETIC WORKER IDENTITY IS NEVER NAMED IN EXECUTABLE WEB CODE');

// Anti-enumeration: a wrong password and an unknown account are one answer.
check(/failure: 'invalid_credentials'/.test(auth),
  'credential failures collapse to one non-enumerating outcome');
const emailBranch = auth.slice(auth.indexOf("customer_email'"), auth.indexOf('Worker: the broker'));
check(!/user_not_found|email_not_found|does not exist/i.test(emailBranch),
  'no branch distinguishes an unknown address from a wrong password');

// Every broker code maps to something actionable.
const broker = readFileSync('supabase/functions/worker-auth/index.ts', 'utf8');
const brokerCodes = new Set([...broker.matchAll(/code: '([a-z_]+)'/g)].map(m => m[1]));
for (const code of brokerCodes) {
  check(new RegExp(`\\b${code}\\b`).test(auth),
    `the web maps broker code ${code} rather than collapsing it`);
}

// --- Nothing renders before the account is known -----------------------------
equal(resolveAccount({ authSettled: false, signedIn: false, state: null, preferredMode: null }),
  { status: 'loading' },
  'NOTHING RENDERS WHILE AUTH IS UNRESOLVED');
equal(resolveAccount({ authSettled: true, signedIn: false, state: null, preferredMode: null }),
  { status: 'signed_out' },
  'a settled signed-out session resolves to signed out');
equal(resolveAccount({ authSettled: true, signedIn: true, state: null, preferredMode: null }),
  { status: 'loading' },
  'A SESSION WITHOUT ACCOUNT STATE NEVER GUESSES A PRODUCT');
equal(resolveAccount({
  authSettled: true,
  signedIn: true,
  state: null,
  accountStateError: true,
  preferredMode: null,
}), { status: 'error' },
  'AN ACCOUNT RPC FAILURE TERMINATES ON RECOVERY INSTEAD OF INFINITE LOADING');
check(/auth\.getUser\(\)/.test(provider),
  'a stored session is validated with the server before it is trusted');
check(/signOut\(\{ scope: 'local' \}\)/.test(provider),
  'a stale session resolves safely to signed out');
check(/setAccountStateError\(true\)/.test(provider)
    && /accountStateError/.test(provider),
  'the web preserves the distinction between an in-flight account read and a failed one');

const startupGate = readWeb('components', 'startup-gate.tsx');
check(/resolution\.status === 'error'[\s\S]{0,100}status = 'recovery'/.test(startupGate),
  'a failed web account authority renders a retryable neutral recovery surface');
check(/resolution\.target === 'role_choice'[\s\S]{0,100}status = 'recovery'/.test(startupGate),
  'a historical Auth-only web identity cannot be redirected to the missing role route');
check(/void refresh\(\)/.test(startupGate) && /'\/sign-out'/.test(startupGate),
  'web recovery offers retry and safe account switching without mounting a product shell');
check(/customerRecoveryEligible/.test(startupGate)
  && /resumeCustomerSetup\(\)/.test(startupGate),
  'eligible web customers receive a credential-free governed recovery action');
check(/readCustomerRecoveryEligibility\(userId\)[\s\S]*rpc\('select_my_account_role',\s*\{[\s\S]*p_role: 'customer'/.test(provider),
  'web rechecks RLS evidence immediately before the single existing customer role RPC');
check(/customerRecoveryInFlight\.current/.test(provider)
  && /customerRecoveryBusy/.test(provider),
  'web recovery prevents concurrent duplicate submissions');
check(!/updateUser|raw_user_meta_data|service_role/i.test(provider),
  'recovery neither mutates Auth metadata nor introduces privileged credentials');

// --- Role resolution ---------------------------------------------------------
const customerOnly = { ...emptyOnboardingState, roleSelected: true, intendedRole: 'customer' as const, addressConfirmed: true };
const workerActive = {
  ...emptyOnboardingState, roleSelected: true, intendedRole: 'worker' as const,
  workerCapabilityActive: true, workerState: 'active' as never,
};

equal(productRolesFor(customerOnly), { customer: true, worker: false, both: false },
  'an account with no worker capability is a customer only');
equal(productRolesFor(workerActive).worker, true,
  'the server-computed capability is what makes somebody a worker');
check(!productRolesFor({ ...emptyOnboardingState, intendedRole: 'worker' as const }).worker,
  'APPLYING TO BE A WORKER DOES NOT MAKE SOMEBODY ONE');

const customerResolved = resolveAccount({
  authSettled: true, signedIn: true, state: customerOnly, preferredMode: null,
});
equal(customerResolved.status, 'resolved', 'a customer-only account resolves without a chooser');
check(customerResolved.status === 'resolved' && customerResolved.target === 'customer_home',
  'a customer-only account lands in the customer experience');

const dualNoPreference = resolveAccount({
  authSettled: true, signedIn: true, state: workerActive, preferredMode: null,
});
check(dualNoPreference.status === 'resolved' && dualNoPreference.target === 'worker_home',
  'AN ACTIVE WORKER WITH NO SESSION CHOICE RETURNS TO THE CANONICAL WORKER HOME');

const dualPrefersCustomer = resolveAccount({
  authSettled: true, signedIn: true, state: workerActive, preferredMode: 'customer',
});
check(dualPrefersCustomer.status === 'resolved' && dualPrefersCustomer.target === 'customer_home',
  'a recorded customer preference is honoured rather than defaulting to worker');
const dualPrefersWorker = resolveAccount({
  authSettled: true, signedIn: true, state: workerActive, preferredMode: 'worker',
});
check(dualPrefersWorker.status === 'resolved' && dualPrefersWorker.target === 'worker_home',
  'a recorded worker preference is honoured');

// A worker still in onboarding has one next step and is never asked to choose.
const workerOnboarding = {
  ...emptyOnboardingState, roleSelected: true, intendedRole: 'worker' as const,
  workerCapabilityActive: false,
};
const onboardingResolved = resolveAccount({
  authSettled: true, signedIn: true, state: workerOnboarding, preferredMode: null,
});
equal(onboardingResolved.status, 'resolved',
  'an incomplete worker is routed, not asked to pick a product');

// Blocked and role-less accounts keep the shared authority's answer.
equal(routeFor({ ...emptyOnboardingState, accountBanned: true }, true), 'account_blocked',
  'a blocked account is recognised by the shared rule');
equal(routeFor(emptyOnboardingState, true), 'role_choice',
  'an account with no recorded role goes to the role authority');
equal(routeFor(null, false), 'gateway', 'no session means the gateway');

// --- Destinations -------------------------------------------------------------
equal(webHomeFor('customer_home'), '/', 'the customer home is the application root');
equal(webHomeFor('worker_home'), '/worker', 'the worker home is its own tree');
equal(webHomeFor('worker_onboarding'), '/worker/onboarding',
  'an incomplete worker resumes onboarding');
equal(webHomeFor('customer_address'), '/addresses',
  'an incomplete customer reaches the real governed address surface');
equal(webHomeFor('account_blocked'), '/account/unavailable',
  'a blocked account gets an explanation, not a product');
equal(webHomeFor('role_choice'), '/account/unavailable',
  'a historical role-less account has a real fail-closed fallback route');
equal(webHomeFor('gateway'), '/sign-in', 'no session lands on sign-in');
const addressesPage = readWeb('app', 'app', 'addresses', 'page.tsx');
check(/confirm_my_service_address/.test(addressesPage)
    && /await refreshAccount\(\)/.test(addressesPage),
  'confirming the first web address refreshes onboarding authority before navigating home');

// --- Preference storage --------------------------------------------------------
check(PREFERRED_MODE_KEY.startsWith('warsha:'),
  'the product-mode preference uses the Warsha key namespace');
check(/sessionStorage\.getItem\(PREFERRED_MODE_KEY\)/.test(provider)
    && /JSON\.stringify\(\{ userId: session\.user\.id, mode \}\)/.test(provider),
  'CUSTOMER MODE FOR A WORKER IS SESSION- AND IDENTITY-SCOPED AND DOES NOT SURVIVE A COLD START');
check(/setState\(null\)[\s\S]{0,180}setPreferredMode\(readPreferredMode\(next\.user\.id\)\)/.test(provider),
  'A NEW AUTH IDENTITY CANNOT RENDER WITH THE PREVIOUS IDENTITY ACCOUNT STATE OR MODE');
check(/accountGeneration\.current !== generation/.test(provider)
    && /const generation = \+\+accountGeneration\.current/.test(provider),
  'A STALE ACCOUNT HYDRATION RESPONSE CANNOT OVERWRITE THE CURRENT AUTH IDENTITY');
check(/sessionStorage\.removeItem\(PREFERRED_MODE_KEY\)/.test(provider),
  'sign-out clears the session-scoped product mode before the next sign-in');
check(isProductMode('customer') && isProductMode('worker') && !isProductMode('admin'),
  'only real product modes are accepted');
check(!/admin|staff/i.test(account),
  'STAFF ACCESS IS NOT A PRODUCT MODE AND CANNOT BE REACHED BY CHOOSING ONE');

console.log(`Web auth + session regressions: ${checks} checks passed.`);
