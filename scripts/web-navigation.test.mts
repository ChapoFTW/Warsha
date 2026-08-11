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
