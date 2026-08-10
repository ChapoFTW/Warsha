import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  signupLegalDocuments,
  signupLegalManifest,
  signupLegalSelectionSatisfied,
} from '../src/legal/signup-legal.ts';
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

const base = {
  mode: 'customer' as const,
  workerCapabilityActive: false,
  legalAcceptanceRequired: false,
};

// A redirect decision is deliberately not a render decision. These traces
// model Expo Router reporting the old pathname for one paint before replace.
equal(startupRouteDecision({ ...base, ready: false, pathname: '/', target: 'gateway' }),
  { status: 'loading', redirect: null },
  'signed-out cold start renders only neutral loading while Auth is unresolved');
equal(startupRouteDecision({ ...base, ready: true, pathname: '/', target: 'gateway' }),
  { status: 'redirecting', redirect: '/welcome' },
  'signed-out root blocks the customer shell while replacing it with Welcome');
equal(startupRouteDecision({ ...base, ready: true, pathname: '/welcome', target: 'gateway' }),
  { status: 'render', redirect: null },
  'signed-out authority renders only after the public route is current');

equal(startupRouteDecision({ ...base, ready: false, pathname: '/', target: 'customer_home' }),
  { status: 'loading', redirect: null },
  'authenticated customer cold start waits for account authority');
equal(startupRouteDecision({ ...base, ready: true, pathname: '/', target: 'customer_home' }),
  { status: 'render', redirect: null },
  'resolved customer may render Customer Home directly');

const workerBase = { ...base, mode: 'provider' as const, workerCapabilityActive: true };
equal(startupRouteDecision({ ...workerBase, ready: false, pathname: '/', target: 'worker_home' }),
  { status: 'loading', redirect: null },
  'worker role hydration delay stays neutral');
equal(startupRouteDecision({ ...workerBase, ready: true, pathname: '/', target: 'worker_home' }),
  { status: 'redirecting', redirect: '/worker' },
  'resolved worker root never renders Customer Home while redirecting');
equal(startupRouteDecision({ ...workerBase, ready: true, pathname: '/worker', target: 'worker_home' }),
  { status: 'render', redirect: null },
  'resolved worker renders the canonical worker route');
equal(startupRouteDecision({ ...workerBase, ready: false, pathname: '/', target: 'worker_onboarding' }),
  { status: 'loading', redirect: null },
  'new worker onboarding cannot guess a shell during hydration');
equal(startupRouteDecision({ ...workerBase, ready: true, pathname: '/', target: 'worker_onboarding' }),
  { status: 'redirecting', redirect: '/onboarding/worker' },
  'new worker root remains neutral until worker onboarding is current');

// A stale token follows the same unresolved -> signed-out route sequence.
const staleTrace = [
  startupRouteDecision({ ...base, ready: false, pathname: '/', target: 'customer_home' }),
  startupRouteDecision({ ...base, ready: true, pathname: '/', target: 'gateway' }),
  startupRouteDecision({ ...base, ready: true, pathname: '/welcome', target: 'gateway' }),
];
equal(staleTrace.map(step => step.status), ['loading', 'redirecting', 'render'],
  'expired persisted session cannot render Customer Home before signed-out recovery');

equal(startupRouteDecision({
  ...base, ready: true, pathname: '/', target: 'customer_home', legalAcceptanceRequired: true,
}), { status: 'redirecting', redirect: '/legal/consent' },
  'governed material re-consent blocks product surfaces');
equal(startupRouteDecision({
  ...base, ready: true, pathname: '/legal/consent', target: 'customer_home', legalAcceptanceRequired: true,
}), { status: 'render', redirect: null },
  'renewed-acceptance screen remains reachable to authenticated accounts');

equal(signupLegalDocuments('customer').map(document => document.key),
  ['customer_terms', 'privacy_policy'],
  'customer signup uses only the current customer mandatory corpus');
equal(signupLegalDocuments('worker').map(document => document.key),
  ['worker_terms', 'privacy_policy', 'worker_verification_policy'],
  'worker signup includes independently versioned Worker Terms and verification policy');
check(!signupLegalDocuments('customer').some(document => document.key === 'location_data_policy'),
  'optional location processing is not mandatory customer acceptance');
check(!signupLegalDocuments('worker').some(document => document.key === 'location_data_policy'),
  'OS location permission is not bundled into worker legal acceptance');
check(!signupLegalSelectionSatisfied('customer', false, false),
  'unchecked customer acceptance blocks submission');
check(signupLegalSelectionSatisfied('customer', true, false),
  'customer needs the common Terms and Privacy decision only');
check(!signupLegalSelectionSatisfied('worker', true, false),
  'worker verification policy must be accepted independently');
check(signupLegalSelectionSatisfied('worker', true, true),
  'worker submission is enabled after every required decision');

for (const language of ['en', 'ar'] as const) {
  const customer = signupLegalManifest('customer', language);
  const worker = signupLegalManifest('worker', language);
  check(customer.every(item => item.language === language && /^[0-9a-f]{64}$/.test(item.renderedHash)),
    `${language} customer evidence binds exact rendered hashes`);
  check(worker.every(item => item.language === language && /^[0-9a-f]{64}$/.test(item.renderedHash)),
    `${language} worker evidence binds exact rendered hashes`);
}

const createAccount = readFileSync('app/create-account.tsx', 'utf8');
const legalComponent = readFileSync('components/warsha/SignupLegalAcceptance.tsx', 'utf8');
const legalCopy = readFileSync('src/legal/legal-copy.ts', 'utf8');
const authContext = readFileSync('src/auth/auth-context.tsx', 'utf8');
const authGate = readFileSync('components/warsha/AuthGate.tsx', 'utf8');
const rootLayout = readFileSync('app/_layout.tsx', 'utf8');
const webDocument = readFileSync('app/+html.tsx', 'utf8');
const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');
const environment = readFileSync('src/config/environment.ts', 'utf8');
const workerBroker = readFileSync('supabase/functions/worker-auth/index.ts', 'utf8');

check(/useState\(false\)/.test(createAccount), 'signup legal controls are not preselected');
check(/disabled=\{[\s\S]*signupLegalSelectionSatisfied/.test(createAccount),
  'Create Account remains disabled until the role-scoped selection is complete');
check(/documentKey="privacy_policy"/.test(legalComponent)
  && /worker_terms' : 'customer_terms'/.test(legalComponent),
  'Terms and Privacy are independent in-app legal links');
check(/documentKey="worker_verification_policy"/.test(legalComponent),
  'worker verification policy has its own readable link and decision');
check(/documentKey="location_data_policy"/.test(legalComponent),
  'Location Data Policy is readable without making OS permission mandatory');
check(legalCopy.includes('أوافق على شروط استخدام ورشة وسياسة الخصوصية'),
  'Arabic acceptance copy is a natural localized sentence');
check(/legal_acceptances:\s*legalAcceptances/.test(authContext),
  'customer Auth metadata carries the exact transient manifest');
check(/legalAcceptances/.test(workerBroker) && /legal_acceptances:\s*legalAcceptances/.test(workerBroker),
  'trusted worker broker requires and forwards the same manifest');
check(!/terms_accepted_at:\s*new Date|privacy_accepted_at:\s*new Date/.test(authContext + workerBroker),
  'clients do not invent legal acceptance timestamps');
check(!/signUp\(/.test(profile), 'secondary profile registration cannot bypass canonical signup');
check(/getSession\(\)[\s\S]*getUser\(\)/.test(authContext),
  'persisted sessions are server-validated before Auth readiness');
check(/decisionStatus !== 'render'/.test(authGate),
  'unresolved and redirecting states do not mount the application shell');
check(/legal\.obligations\.enforced \|\| legal\.unavailable/.test(authGate),
  'an unreadable enforced-consent authority fails closed to the legal surface');
check(/SplashScreen\.preventAutoHideAsync/.test(rootLayout)
  && /SplashScreen\.hideAsync/.test(authGate),
  'native splash stays owned until the safe route is renderable');
check(/useThemedStyles/.test(authGate) && /useOnboardingText/.test(authGate),
  'neutral loading uses resolved theme and localized/RTL-aware providers');
check(/warsha-startup-surface/.test(authGate)
  && /--warsha-startup-canvas/.test(webDocument)
  && /--warsha-startup-mark/.test(webDocument),
  'web static first paint applies stored/system dark or light tokens before hydration');
check(/document\.documentElement\.lang === 'ar'/.test(webDocument)
  && /جاري تحميل ورشة/.test(webDocument)
  && /surface\.setAttribute\('dir', document\.documentElement\.dir\)/.test(webDocument),
  'Arabic web startup accessibility is localized before hydration');
check(!/EXPO_PUBLIC_GOOGLE_MAPS|location_provider\s*:\s*true/.test(environment),
  'signup legal work does not activate Maps or the location provider');

// Hosted Auth re-writes the row it just created from its own in-memory copy of
// the metadata, so the manifest has to be gone before the row is ever stored.
const manifestIsolation = readFileSync(
  'supabase/migrations/202608200002_signup_legal_manifest_isolation.sql', 'utf8');
check(/before insert or update on auth\.users/.test(manifestIsolation),
  'the transient manifest is removed before storage and on every later write-back');
check(/new\.raw_user_meta_data - 'legal_acceptances'/.test(manifestIsolation),
  'acceptance hashes never reach persisted Auth metadata or issued JWTs');
check(/new\.id::text/.test(manifestIsolation),
  'carried evidence is keyed by user id so batched inserts cannot swap manifests');

console.log(`Signup legal + first-paint startup regressions: ${checks} checks passed.`);
