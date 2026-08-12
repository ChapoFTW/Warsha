import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appCopy } from '../web/lib/app-copy.ts';
import {
  canUseConsole,
  environmentLabel,
  hasCapability,
  NO_STAFF_SESSION,
  parseStaffSession,
} from '../web/lib/staff.ts';

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
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// --- Origins are separated by host ------------------------------------------
const middleware = readWeb('middleware.ts');
check(/app\.\$\{CANONICAL_HOST\}/.test(middleware) && /admin\.\$\{CANONICAL_HOST\}/.test(middleware),
  'the application and console are served from their own hosts');
check(/rewriteInto\('\/app'/.test(middleware) && /rewriteInto\('\/admin'/.test(middleware),
  'each host renders its own tree');
check(/pathname\.startsWith\('\/app'\)[\s\S]{0,240}NextResponse\.redirect/.test(middleware),
  'THE PUBLIC HOST CANNOT REACH AN AUTHENTICATED PATH');

// --- Nothing authenticated is indexable or cached ---------------------------
for (const [tree, label] of [['app', 'application'], ['admin', 'console']] as const) {
  const layout = readWeb('app', tree, 'layout.tsx');
  check(/robots: \{ index: false, follow: false, nocache: true \}/.test(layout),
    `the ${label} origin is noindex, nofollow and nocache`);
  check(/warsha:appearance:v1/.test(layout),
    `the ${label} applies the stored theme before first paint`);
}

// --- The startup gate never renders the wrong product -----------------------
const gate = readWeb('components', 'startup-gate.tsx');
check(/'loading' \| 'redirecting' \| 'render'/.test(gate),
  'the gate has three states and only one of them mounts children');
check(/if \(status !== 'render'\)/.test(gate),
  'NOTHING OPERATIONAL RENDERS UNTIL THE ACCOUNT IS RESOLVED');
check(/router\.replace/.test(gate) && !/router\.push/.test(gate),
  'the gate replaces rather than pushes, so there is no back door');
const loadingBranch = gate.slice(gate.indexOf("if (status !== 'render')"), gate.indexOf('return <>{children}'));
check(!/Tabs|Skeleton|Dashboard|nav/i.test(loadingBranch),
  'THE LOADING STATE DOES NOT IMPERSONATE A SIGNED-IN APPLICATION');
check(/isPublicAppRoute/.test(gate),
  'a signed-out visitor may reach only the account-entry routes');

// --- Sign-in is identity-driven ---------------------------------------------
const signIn = readWeb('app', 'app', 'sign-in', 'page.tsx');
check(/classifySignInIdentity/.test(signIn),
  'the typed identifier decides whether the credential path is email or phone');
check(!/chooseRole|accountType|radiogroup/.test(signIn),
  'SIGN-IN NEVER ASKS SOMEBODY WHICH KIND OF ACCOUNT THEY HAVE');
const signInCode = strip(signIn);
check(/type="text"/.test(signInCode) && !/type="email"/.test(signInCode),
  'the identifier field accepts a phone number, not only an address');
check(!/inputMode="email"/.test(signInCode),
  'the keyboard is not narrowed to an address, which would hide the digits');
check(/dir="ltr"/.test(signIn),
  'identifier and password read left-to-right inside an Arabic page');
check(!/auth\.warsha\.invalid|synthetic/i.test(strip(signIn)),
  'the synthetic worker identity is never named');
const failureKeys = ['invalid_identifier', 'invalid_credentials', 'rate_limited',
  'outdated_client', 'network', 'server'];
for (const key of failureKeys) {
  check(signIn.includes(key), `the form maps the ${key} failure to actionable copy`);
}

// --- The dual-role chooser is post-authentication ---------------------------
const chooser = readWeb('app', 'app', 'choose-mode', 'page.tsx');
check(/chooseMode/.test(chooser),
  'the chooser records the preference rather than asking every visit');
check(/useSession/.test(chooser),
  'only an authenticated, resolved account reaches the chooser');
check(existsSync(join('web', 'app', 'app', 'account', 'unavailable', 'page.tsx')),
  'a blocked account gets an explanation rather than a product');

// --- Staff authority is server-computed -------------------------------------
const staffGate = readWeb('components', 'staff-gate.tsx');
check(/rpc\('get_staff_session'\)/.test(staffGate),
  'the console asks the server whether this account is staff');
check(/auth\.getUser\(\)/.test(staffGate),
  'a stored admin token is validated before the console loads');
check(!/service_role|SERVICE_ROLE/i.test(staffGate + readWeb('lib', 'staff.ts')),
  'NO SERVICE ROLE CREDENTIAL EXISTS IN THE CONSOLE');

equal(parseStaffSession(null), NO_STAFF_SESSION,
  'an unreadable staff response is treated as no staff access');
equal(parseStaffSession({ isStaff: 'yes', roles: 'admin' }).isStaff, false,
  'A TRUTHY-LOOKING VALUE IS NOT STAFF ACCESS; ONLY TRUE IS');
equal(parseStaffSession({ isStaff: true, roles: ['support'], capabilities: ['x'], platformReady: true }).roles,
  ['support'], 'roles come through as the server sent them');
check(!canUseConsole(parseStaffSession({ isStaff: true, platformReady: false })),
  'an unbound platform cannot honestly label its environment, so the console is refused');
check(canUseConsole(parseStaffSession({ isStaff: true, platformReady: true })),
  'a staff account on a ready platform may use the console');
check(!hasCapability(NO_STAFF_SESSION, 'anything'),
  'a non-staff session has no capabilities');
check(hasCapability(parseStaffSession({ isStaff: true, capabilities: ['manage_users'] }), 'manage_users'),
  'a granted capability is reported');
check(!hasCapability(parseStaffSession({ isStaff: true, capabilities: ['manage_users'] }), 'grant_staff_role'),
  'AN UNGRANTED CAPABILITY IS NEVER INFERRED FROM ANOTHER');
equal(environmentLabel(parseStaffSession({ isStaff: true, environment: 'development' })), 'DEVELOPMENT',
  'the environment is stated so QA data is not mistaken for production');
check(/environment !== 'PRODUCTION'/.test(staffGate),
  'a non-production console is banner-labelled on every page');

// --- Both languages, everywhere ---------------------------------------------
const enKeys = Object.keys(appCopy.en).sort();
const arKeys = Object.keys(appCopy.ar).sort();
equal(arKeys, enKeys, 'EVERY APPLICATION STRING EXISTS IN BOTH LANGUAGES');
for (const key of enKeys) {
  const value = appCopy.ar[key as keyof typeof appCopy.ar];
  check(/[؀-ۿ]/.test(value), `ar.${key} is written in Arabic`);
}

// No component may hold a visible English sentence.
for (const file of [
  ['app', 'app', 'page.tsx'], ['app', 'app', 'worker', 'page.tsx'],
  ['app', 'app', 'sign-in', 'page.tsx'], ['app', 'app', 'choose-mode', 'page.tsx'],
  ['app', 'app', 'discover', 'page.tsx'], ['app', 'app', 'requests', 'page.tsx'],
  ['app', 'app', 'requests', 'new', 'page.tsx'], ['app', 'app', 'addresses', 'page.tsx'],
  ['app', 'app', 'jobs', 'page.tsx'], ['app', 'app', 'account', 'page.tsx'],
  ['components', 'app-shell.tsx'],
] as const) {
  const source = strip(readWeb(...file));
  const jsxText = [...source.matchAll(/>\s*([A-Za-z][A-Za-z',.!?-]*(?:\s+[A-Za-z][A-Za-z',.!?-]*)+)\s*</g)]
    .map((m) => m[1].trim())
    .filter((t) => !/^(true|false|null|undefined)$/.test(t));
  equal(jsxText, [], `${file.join('/')} renders no hardcoded English sentence`);
}

// --- The customer web journey uses the same product authorities as mobile --
const customer = readWeb('lib', 'customer.ts');
const discovery = readWeb('app', 'app', 'discover', 'page.tsx');
const requestForm = readWeb('app', 'app', 'requests', 'new', 'page.tsx');
const requests = readWeb('app', 'app', 'requests', 'page.tsx');
const addresses = readWeb('app', 'app', 'addresses', 'page.tsx');
const jobs = readWeb('app', 'app', 'jobs', 'page.tsx');
const account = readWeb('app', 'app', 'account', 'page.tsx');
const location = readWeb('lib', 'location.ts');

for (const rpc of ['get_marketplace_catalog_v2', 'get_discovery_home', 'search_providers']) {
  check(new RegExp(`rpc\\('${rpc}'`).test(discovery),
    `customer discovery consumes ${rpc}`);
}
check(/create_marketplace_request/.test(requestForm) && /paymentCompatibility: 'either'/.test(requestForm),
  'request creation uses the marketplace authority and sends the required payment compatibility');
check(/Boolean\(addressId\)/.test(requestForm)
  && /filter\(\(entry\) => entry\.latitude !== null && entry\.longitude !== null\)/.test(requestForm),
  'A REQUEST CANNOT BE SUBMITTED WITHOUT AN ADDRESS THAT HAS A CONFIRMED PIN');
check(/select_worker_quote/.test(requests),
  'the customer may choose a quote through the optimistic-concurrency authority');
check(!/confirm_selected_quote/.test(strip(requests)),
  'THE CUSTOMER NEVER CALLS THE WORKER-ONLY QUOTE CONFIRMATION RPC');
check(/selection_pending_confirmation/.test(requests),
  'the selected quote is shown as waiting for its worker rather than falsely booked');
check(/confirm_my_service_address/.test(addresses),
  'new or relocated addresses are confirmed through the governed pin authority');
check(/location-proxy/.test(location) && /get_location_capability/.test(location),
  'browser location uses the same runtime provider gate and server proxy as mobile');
check(/deleted_at: new Date\(\)\.toISOString\(\)/.test(addresses),
  'address deletion preserves history through the existing soft-delete model');
for (const rpc of ['cancel_customer_booking', 'reschedule_customer_booking',
  'accept_provider_reschedule', 'reject_provider_reschedule']) {
  check(new RegExp(`rpc\\('${rpc}'`).test(jobs), `customer jobs consume ${rpc}`);
}
check(/reschedulableStatuses/.test(readWeb('..', 'src', 'bookings', 'booking-types.ts')),
  'mobile and web share the database-exact reschedule states');
check(/select\('display_name,phone'\)/.test(account) && !/\.email|user\.email/.test(strip(account)),
  'THE ACCOUNT PAGE SHOWS CONTACT PROFILE DATA, NEVER THE AUTH IDENTITY EMAIL');
check(/parseCategories|parseServices|parseProviderSearch|parseBookings/.test(customer),
  'governed customer payloads have typed fail-closed parsers');

// --- Direction and theme ------------------------------------------------------
const locale = readWeb('lib', 'use-app-locale.ts');
check(/languageStorageKey/.test(locale),
  'the application reads the same language key the mobile client writes');
check(/directionOf\(current\)/.test(locale) && /setAttribute\('dir'/.test(locale),
  'direction is applied at the document root, not per component');
for (const css of ['components/app-shell.module.css', 'app/app/sign-in/page.module.css']) {
  const source = readFileSync(join('web', css), 'utf8');
  check(!/margin-left|margin-right|text-align:\s*left/.test(source),
    `${css} holds no physical direction that would strand Arabic`);
}

console.log(`Web application surfaces: ${checks} checks passed.`);
