import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Navigation may not point at a route that does not exist.
 *
 * This suite exists because three shipped links returned 404 in production for
 * as long as the authenticated app had been live: the customer nav offered
 * /notifications and /support, the worker nav offered /worker/verification, and
 * none of the three had a page. Every one of them was written by hand in a
 * `nav` array, looked entirely correct in review, and could only be caught by
 * following it.
 *
 * A test can follow it. Nothing here checks that a page is *good* — only that
 * pressing the link lands somewhere.
 */

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

const WEB = 'web';
const APP_DIR = join(WEB, 'app');

/** Every file under web/app, so route existence is decided by the filesystem. */
function walk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, found);
    else found.push(path.split('\\').join('/'));
  }
  return found;
}

const files = walk(APP_DIR);
const sources = files.filter((file) => file.endsWith('.tsx'));

/**
 * Does a route resolve to a page?
 *
 * `web/app/app/**` is served at `app.usewarsha.com/**` by the middleware
 * rewrite, and `web/app/admin/**` at `admin.usewarsha.com/**`. A nav href of
 * `/notifications` inside the customer app therefore means
 * `web/app/app/notifications/page.tsx`, not `web/app/notifications/page.tsx`.
 */
function routeExists(basePrefix: string, href: string): boolean {
  const clean = href.split('?')[0].split('#')[0].replace(/\/$/, '');
  if (clean === '' || clean === '/') return existsSync(join(APP_DIR, basePrefix, 'page.tsx'));
  const segments = clean.replace(/^\//, '').split('/');
  const direct = join(APP_DIR, basePrefix, ...segments, 'page.tsx');
  if (existsSync(direct)) return true;
  // A dynamic segment satisfies any single value at that position.
  const candidates = [join(APP_DIR, basePrefix)];
  for (const segment of segments) {
    const next: string[] = [];
    for (const base of candidates) {
      if (existsSync(join(base, segment))) next.push(join(base, segment));
      if (existsSync(base)) {
        for (const entry of readdirSync(base)) {
          if (/^\[.+\]$/.test(entry)) next.push(join(base, entry));
        }
      }
    }
    if (next.length === 0) return false;
    candidates.splice(0, candidates.length, ...next);
  }
  return candidates.some((base) => existsSync(join(base, 'page.tsx')));
}

/**
 * Every `{ href: ..., label: ... }` entry in a nav array, with the surface it
 * belongs to. The shape is specific enough that matching it does not sweep up
 * unrelated object literals.
 */
const NAV_ENTRY = /\{\s*href:\s*'([^']+)'\s*,\s*label:/g;

let navEntries = 0;
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  // Which host serves this file decides what its hrefs are relative to.
  const prefix = file.includes('/app/admin/') ? 'admin'
    : file.includes('/app/app/') ? 'app'
      : null;
  if (prefix === null) continue;

  for (const match of text.matchAll(NAV_ENTRY)) {
    const href = match[1];
    if (/^(https?:|mailto:|tel:)/.test(href)) continue;
    navEntries += 1;
    check(routeExists(prefix, href),
      `${file}: NAV LINKS TO ${href}, WHICH MUST RESOLVE TO A PAGE`);
  }
}

check(navEntries >= 8,
  `navigation entries were actually found and checked (${navEntries})`);

// The three that shipped broken. Named explicitly so deleting them is a
// deliberate act rather than a quiet regression.
for (const route of ['app/notifications', 'app/support', 'app/worker/verification']) {
  check(existsSync(join(APP_DIR, route, 'page.tsx')),
    `/${route.replace(/^app\//, '')} EXISTS — IT RETURNED 404 IN PRODUCTION ONCE`);
}

// --- The pages are real, not placeholders ----------------------------------
//
// "Do not create empty placeholder routes merely to turn 404 into 200" is the
// requirement. A page that calls no authority and renders no state is exactly
// that, so each of the three must reach a governed RPC or a governed table.
const REAL_WORK: Record<string, RegExp> = {
  'app/notifications/page.tsx': /rpc\('get_my_notifications'/,
  'app/support/page.tsx': /rpc\('open_support_case'|from\('support_tickets'\)/,
  'app/worker/verification/page.tsx': /actionableGates|rpc\('submit_my_identity_for_review'/,
};
for (const [file, pattern] of Object.entries(REAL_WORK)) {
  const text = readFileSync(join(APP_DIR, file), 'utf8');
  check(pattern.test(text), `${file} DOES REAL WORK AGAINST A GOVERNED AUTHORITY`);
  check(text.length > 1500, `${file} is a real page, not a stub`);
}

// ===========================================================================
// THE ADMIN ORIGIN ALWAYS HAS A REAL SIGNED-OUT ENTRY
// ===========================================================================
//
// admin.usewarsha.com/sign-in returned the default Next.js 404. The gate linked
// to `/sign-in`, the middleware rewrites that to `/admin/sign-in` on this
// origin, and no such route had ever been created — so the one thing an admin
// origin must never do is exactly what it did.
check(existsSync(join(APP_DIR, 'admin/sign-in/page.tsx')),
  '/sign-in EXISTS ON THE ADMIN ORIGIN — IT RETURNED A 404 IN PRODUCTION ONCE');

const gate = readFileSync(join(WEB, 'components', 'staff-gate.tsx'), 'utf8');

// Anonymous must render the form in place. A link or a redirect is what broke.
check(/status === 'anonymous'[\s\S]{0,120}<StaffSignIn/.test(gate),
  'AN ANONYMOUS OPERATOR IS SHOWN THE SIGN-IN FORM, NOT SENT SOMEWHERE');
check(!/href="\/sign-in"/.test(gate),
  'and the gate no longer links to a path this origin rewrites into a 404');

// Every href the admin surfaces point at must resolve — including hard
// `window.location` destinations, which the nav-array sweep above cannot see.
const adminSources = walk(join(APP_DIR, 'admin'))
  .filter((file) => file.endsWith('.tsx'))
  .concat([
    join(WEB, 'components', 'staff-gate.tsx'),
    join(WEB, 'components', 'console-shell.tsx'),
    join(WEB, 'components', 'staff-sign-in.tsx'),
  ]);
let adminDestinations = 0;
for (const file of adminSources) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/window\.location\.(?:href|replace)\s*(?:=|\()\s*'([^']+)'/g)) {
    const href = match[1];
    if (/^https?:/.test(href)) continue;
    adminDestinations += 1;
    check(routeExists('admin', href),
      `${file}: REDIRECTS TO ${href}, WHICH MUST RESOLVE ON THE ADMIN ORIGIN`);
  }
}
check(adminDestinations >= 2,
  `admin redirect destinations were found and checked (${adminDestinations})`);

// The four console areas must each resolve, since the sidebar renders them.
for (const area of ['users', 'verification', 'staff', 'audit']) {
  check(existsSync(join(APP_DIR, 'admin', area, 'page.tsx')),
    `the console area /${area} resolves`);
}
check(existsSync(join(APP_DIR, 'admin', 'page.tsx')), 'and the console dashboard resolves');

// Signing out must land somewhere real. `/` on this origin is the dashboard,
// which the gate then answers with the sign-in form.
const consoleShell = readFileSync(join(WEB, 'components', 'console-shell.tsx'), 'utf8');
check(/signOut\(\)/.test(consoleShell), 'the console offers sign out');

// STAFF AUTHENTICATE AS ORDINARY WARSHA IDENTITIES. No console credential store.
const staffSignIn = readFileSync(join(WEB, 'components', 'staff-sign-in.tsx'), 'utf8');
check(/classifySignInIdentity/.test(staffSignIn),
  'THE CONSOLE USES THE SHARED IDENTITY-DRIVEN SIGN-IN, NOT AN ADMIN CREDENTIAL STORE');
check(/from '@\/lib\/auth-actions'/.test(staffSignIn),
  'and the same signIn action every other surface uses');
check(!/admin_password|staff_password|adminLogin|is_admin/i.test(staffSignIn),
  'NO SEPARATE ADMIN USERNAME OR PASSWORD PATH EXISTS');
check(/type="text"/.test(staffSignIn),
  'the identifier field accepts a phone number as well as an address');
// Anti-enumeration: every credential failure maps to one shared message.
check(/invalid_credentials: 'errInvalidCredentials'/.test(staffSignIn),
  'credential failures are indistinguishable, preserving anti-enumeration');

// Authorization is still the server's answer, taken after authentication.
check(/get_staff_session/.test(gate),
  'AUTHORIZATION COMES FROM get_staff_session(), NOT FROM ANYTHING THE FORM DID');
check(/auth\.getUser\(\)/.test(gate),
  'and a stored token is validated with getUser() before it is trusted');
check(/status === 'loading'/.test(gate),
  'a resolving session shows a neutral gate, so the console cannot flash first');

// --- Administration is web-only ---------------------------------------------
//
// The platform boundary, asserted where it can regress. Backend staff
// governance is untouched; what must not come back is the mobile console.
for (const screen of [
  'app/admin', 'app/admin/index.tsx', 'app/admin/vetting.tsx',
  'components/warsha/AdminShell.tsx',
]) {
  check(!existsSync(screen), `${screen} IS ABSENT — ADMINISTRATION IS WEB-ONLY`);
}

// ===========================================================================
// THE LANGUAGE SWITCHER CANNOT INVENT A ROUTE
// ===========================================================================
//
// Changing language on admin.usewarsha.com produced /ar/users — a route that
// has never existed — and the operator could only escape by editing the address
// bar. The switcher prefixed the path unconditionally, but only the public site
// has [locale] routes. Warsha now has one rule per surface, never both.
const controls = readFileSync(join(WEB, 'components', 'preference-controls.tsx'), 'utf8');
check(/mode\?: LanguageSwitchMode/.test(controls),
  'the language switcher takes an explicit mode rather than guessing');
check(/mode = 'preference'/.test(controls),
  'AND DEFAULTS TO THE NON-NAVIGATING MODE, SO A NEW SURFACE CANNOT 404 BY OMISSION');

// Only surfaces that genuinely have [locale] routes may navigate.
const PREFIXED = ['site-chrome.tsx', 'site-nav.tsx'];
for (const file of readdirSync(join(WEB, 'components')).filter((f) => f.endsWith('.tsx'))) {
  const text = readFileSync(join(WEB, 'components', file), 'utf8');
  if (!/<LanguageSwitch/.test(text)) continue;
  const navigates = /<LanguageSwitch[^>]*mode="path"/.test(text);
  check(navigates === PREFIXED.includes(file),
    `${file}: language switching ${navigates ? 'navigates' : 'stays in place'}, matching its routing`);
}
// The app and admin shells must never navigate: no [locale] route exists there.
for (const shell of ['console-shell.tsx', 'app-shell.tsx', 'staff-sign-in.tsx']) {
  const text = readFileSync(join(WEB, 'components', shell), 'utf8');
  check(!/mode="path"/.test(text),
    `${shell} DOES NOT BUILD A LOCALE PATH — /en AND /ar DO NOT EXIST ON THAT ORIGIN`);
}
// Confirm the premise: there is genuinely no locale route under app or admin.
for (const surface of ['app', 'admin']) {
  for (const locale of ['en', 'ar']) {
    check(!existsSync(join(APP_DIR, surface, locale)),
      `/${locale} is genuinely not a route under ${surface} — which is why prefixing 404s`);
  }
}
// Switching in place must actually re-render, or the control would look broken.
const localeHook = readFileSync(join(WEB, 'lib', 'use-app-locale.ts'), 'utf8');
check(/languageChangeEvent/.test(localeHook) && /languageChangeEvent/.test(controls),
  'a same-tab language change is announced and observed, so the page updates without navigating');

// ===========================================================================
// PUBLIC AUTH ENTRY POINTS REACH THE REAL APPLICATION
// ===========================================================================
const routes = readFileSync(join(WEB, 'lib', 'routes.ts'), 'utf8');
check(/https:\/\/app\.usewarsha\.com/.test(routes),
  'the application origin is named in one place');
const chrome = readFileSync(join(WEB, 'components', 'site-chrome.tsx'), 'utf8');
check(/href=\{APP_SIGN_IN\}/.test(chrome),
  'THE PUBLIC SIGN-IN CONTROL LEADS INTO THE REAL APPLICATION, NOT A MARKETING PAGE');

// The marketing site must not grow a second authentication implementation.
for (const page of ['sign-in', 'create-account']) {
  const source = readFileSync(join(APP_DIR, '[locale]', page, 'page.tsx'), 'utf8');
  check(!/<input|<form|signInWithPassword|supabase\(/.test(source),
    `the public /${page} page IMPLEMENTS NO AUTHENTICATION OF ITS OWN`);
}
// And the destination it points at is a real route.
check(existsSync(join(APP_DIR, 'app', 'sign-in', 'page.tsx')),
  'app.usewarsha.com/sign-in is a real route');

// --- Shared authorities are read, not restated ------------------------------
const notifications = readFileSync(join(WEB, 'lib', 'notifications.ts'), 'utf8');
check(/from '\.\.\/\.\.\/src\/notifications\/notification-copy/.test(notifications),
  'THE WEB READS THE SAME NOTIFICATION COPY TABLE THE APP DOES');
check(!/'Booking accepted'|'New booking request'/.test(notifications),
  'and does not restate a single event string');

const onboarding = readFileSync(join(WEB, 'lib', 'onboarding.ts'), 'utf8');
check(/from '\.\.\/\.\.\/src\/onboarding\/onboarding-types/.test(onboarding),
  'THE WEB ROUTES WORKERS ON THE SAME GATE AUTHORITY THE APP DOES');
const verificationPage = readFileSync(join(APP_DIR, 'app/worker/verification/page.tsx'), 'utf8');
check(!/GATE_ORDER|STAFF_ONLY_GATES|\['worker_role_selected'/.test(verificationPage),
  'and does not keep a second copy of the gate ordering');

// --- The notification count bug that shipped --------------------------------
//
// `get_my_notification_counts` returns {globalUnread, categoryUnread,
// chatUnread} and requires p_mode, which has no default. The dashboard read
// `.unread` and passed no mode, so the call could not resolve and the value it
// wanted never existed.
check(/globalUnread/.test(notifications),
  'the counts parser reads globalUnread, the field the server actually sends');
const dashboards = ['app/page.tsx', 'app/worker/page.tsx']
  .map((file) => readFileSync(join(APP_DIR, file), 'utf8')).join('\n');
check(!/payload\?\.unread|data\?\.unread/.test(dashboards),
  'NO DASHBOARD READS THE `unread` FIELD, WHICH THE SERVER HAS NEVER SENT');
check(!/rpc\('get_my_notification_counts'\)/.test(dashboards),
  'AND NONE CALLS get_my_notification_counts WITHOUT p_mode, WHICH CANNOT RESOLVE');

// --- Support does not offer what the backend cannot do ----------------------
const support = readFileSync(join(APP_DIR, 'app/support/page.tsx'), 'utf8');
// Comments stripped first: this file explains *why* it does not call those two,
// and naming them in prose is the documentation, not a call.
const supportCode = support
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');
check(!/reply_support_case|get_my_support_cases/.test(supportCode),
  'SUPPORT CALLS NO RPC THAT WAS NEVER SHIPPED');
check(/newIdempotencyKey/.test(support),
  'opening a case is idempotent, so a double submit cannot open two');

console.log(`Web navigation: ${checks} checks passed.`);
