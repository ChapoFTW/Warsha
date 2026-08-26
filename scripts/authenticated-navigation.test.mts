/**
 * Authenticated navigation: what is persistent, what is one click away, and the
 * promise that the second tier cannot drift back into the first.
 *
 * The defect this exists to prevent: `lib/nav.ts` was already the single
 * authority, and it still produced a nine-destination customer header, because
 * it returned ONE FLAT ARRAY and `AppShell` rendered every element of it as a
 * persistent link. Consolidating the lists had removed the duplication and left
 * the ranking problem untouched — so the header grew from eight to nine and
 * nothing objected.
 *
 * Every guard below is therefore about RANK and ROLE, not about whether a
 * single list exists.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { appCopy } from '../web/lib/app-copy.ts';
import {
  allDestinations,
  customerNavigation,
  workerNavigation,
  workerOnboardingNavigation,
  PRIMARY_NAV_LIMIT,
  type RoleNavigation,
} from '../web/lib/nav.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
const read = (path: string) => readFileSync(path, 'utf8');
const LOCALES = ['en', 'ar', 'fr'] as const;

// --- A. The obsolete giant customer set is gone ----------------------------

const customer = customerNavigation(appCopy.en as unknown as Record<string, string>);
check(customer.primary.length === 4,
  `THE CUSTOMER HEADER CARRIES FOUR DESTINATIONS, NOT NINE (found ${customer.primary.length})`);
check(customer.primary.length <= PRIMARY_NAV_LIMIT,
  'and stays within the declared primary limit');
assert.deepEqual(customer.primary.map((item) => item.href), ['/', '/discover', '/requests', '/jobs'],
  'the customer primary tier is exactly land, find, ask, follow');
checks += 1;

// J. The five reclassified destinations cannot casually creep back up.
for (const href of ['/addresses', '/notifications', '/support', '/help', '/account']) {
  check(!customer.primary.some((item) => item.href === href),
    `${href} IS NOT A PERSISTENT CUSTOMER DESTINATION`);
  check(customer.account.some((item) => item.href === href),
    `${href} remains reachable from the account tier`);
}

// B. Nothing was removed while reducing the header.
const CUSTOMER_DESTINATIONS = [
  '/', '/discover', '/requests', '/jobs',
  '/addresses', '/notifications', '/support', '/help', '/account',
];
assert.deepEqual(allDestinations(customer).map((item) => item.href).sort(),
  [...CUSTOMER_DESTINATIONS].sort(),
  'EVERY DESTINATION THE OLD HEADER OFFERED IS STILL REACHABLE');
checks += 1;

// --- C/D. Roles get their own navigation ------------------------------------

const worker = workerNavigation(appCopy.en as unknown as Record<string, string>);
check(worker.primary.length === 4, 'the worker header carries four destinations');
assert.deepEqual(worker.primary.map((item) => item.href),
  ['/worker', '/worker/opportunities', '/worker/jobs', '/worker/earnings'],
  'the worker primary tier is the working day, not account settings');
checks += 1;
for (const href of ['/worker/profile', '/worker/verification', '/support', '/help', '/notifications']) {
  check(worker.account.some((item) => item.href === href),
    `a worker keeps ${href} in the account tier`);
}
check(allDestinations(worker).every((item) => item.href !== '/discover' && item.href !== '/addresses'),
  'A WORKER IS NOT GIVEN CUSTOMER NAVIGATION');
check(allDestinations(customer).every((item) => !item.href.startsWith('/worker')),
  'A CUSTOMER IS NOT GIVEN WORKER NAVIGATION');
check(allDestinations(customer).every((item) => !item.href.startsWith('/admin'))
  && allDestinations(worker).every((item) => !item.href.startsWith('/admin')),
  'neither role is given admin navigation');

// A worker mid-onboarding is not sent to destinations they cannot use, and the
// scoping lives here rather than inline in the page that needs it.
const onboarding = workerOnboardingNavigation(appCopy.en as unknown as Record<string, string>);
check(onboarding.primary.length === 1 && onboarding.primary[0]?.href === '/worker/onboarding',
  'an unfinished worker is pointed at the step they are on');
check(!allDestinations(onboarding).some((item) => item.href === '/worker/opportunities'),
  'and is not offered opportunities they cannot take yet');
check(onboarding.account.some((item) => item.href === '/worker/verification'),
  'while verification stays one click away');

// --- I. One authority: no page keeps its own list ---------------------------

const SHELL_PAGES = [
  'web/app/app/page.tsx', 'web/app/app/discover/page.tsx', 'web/app/app/requests/page.tsx',
  'web/app/app/requests/new/page.tsx', 'web/app/app/jobs/page.tsx', 'web/app/app/addresses/page.tsx',
  'web/app/app/notifications/page.tsx', 'web/app/app/support/page.tsx', 'web/app/app/help/page.tsx',
  'web/app/app/account/page.tsx', 'web/app/app/worker/page.tsx', 'web/app/app/worker/jobs/page.tsx',
  'web/app/app/worker/earnings/page.tsx', 'web/app/app/worker/opportunities/page.tsx',
  'web/app/app/worker/profile/page.tsx', 'web/app/app/worker/verification/page.tsx',
  'web/app/app/worker/onboarding/page.tsx',
] as const;
for (const page of SHELL_PAGES) {
  const source = read(page);
  // A page that serves both roles picks between the two authorities with a
  // ternary, so the call is not always adjacent to `navigation={`. What matters
  // is that the value comes from this file and not from a literal.
  check(/(?:customerNavigation|workerNavigation|workerOnboardingNavigation)\(/.test(source)
    && /from '@\/lib\/nav'/.test(source),
    `${page} takes its navigation from the shared authority`);
  check(!/navigation=\{\[/.test(source) && !/nav=\{\[/.test(source),
    `${page} DEFINES NO NAVIGATION LIST OF ITS OWN`);
}

// --- H. One primary navigation at a time, and the shell renders only `primary` ---

const shell = read('web/components/app-shell.tsx');
check(/navigation\.primary\.map/.test(shell),
  'THE HEADER RENDERS ONLY THE PRIMARY TIER');
check(!/navigation\.account\.map/.test(shell),
  'and never spills the account tier into the header row');
check(/AccountMenu/.test(shell), 'the account tier is rendered by the account control');
check(!/signOut\(\)/.test(shell),
  'sign out is a session control in the account menu, not a header destination');

const shellCss = read('web/components/app-shell.module.css');
const wideNav = /@media \(min-width: 860px\)\s*\{[\s\S]*?\.nav \{ display: flex; \}/.test(shellCss);
const narrowNav = /@media \(max-width: 859px\)[\s\S]*?\.nav \{[\s\S]*?display: flex;/.test(shellCss);
check(wideNav && narrowNav,
  'the primary row has one wide arrangement and one narrow arrangement');
check(/\.nav \{\s*display: none;/.test(shellCss),
  'and is hidden by default so the two arrangements cannot both apply');
check(/inset-inline-end/.test(shellCss),
  'THE ACCOUNT PANEL IS ANCHORED LOGICALLY, SO IT OPENS INWARD IN ARABIC TOO');

// --- E. The public site does not consume authenticated navigation -----------

for (const publicFile of ['web/components/site-chrome.tsx', 'web/components/site-nav.tsx']) {
  const source = read(publicFile);
  check(!/lib\/nav|customerNavigation|workerNavigation|AppShell/.test(source),
    `${publicFile} DOES NOT REACH INTO AUTHENTICATED NAVIGATION`);
}
const appShellFiles = [shell, read('web/components/account-menu.tsx')];
for (const source of appShellFiles) {
  check(!/site-chrome|site-nav|lib\/copy/.test(source),
    'the authenticated shell does not reach into public marketing navigation');
}

// --- F/G. Every destination resolves in all three languages -----------------

for (const locale of LOCALES) {
  const words = appCopy[locale] as unknown as Record<string, string>;
  for (const navigation of [customerNavigation(words), workerNavigation(words), workerOnboardingNavigation(words)]) {
    for (const item of allDestinations(navigation as RoleNavigation)) {
      check(typeof item.label === 'string' && item.label.trim().length > 0,
        `${item.href} HAS A REAL ${locale.toUpperCase()} LABEL, NOT A RAW KEY`);
      check(!/^nav[A-Z]/.test(item.label), `${item.href} does not leak its translation key in ${locale}`);
    }
  }
  // A label identical to English in Arabic would mean the key fell through.
  if (locale === 'ar') {
    const arabic = customerNavigation(words).primary.map((item) => item.label).join('');
    check(/[؀-ۿ]/.test(arabic),
      'THE ARABIC CUSTOMER HEADER IS ARABIC, NOT AN ENGLISH FALLBACK');
  }
}

// --- Mutation checks: prove the important guards can actually fail ----------
//
// A guard that cannot fail is worse than no guard, because it reports safety.
const mutations: [string, () => boolean][] = [
  ['a sixth primary destination', () => {
    const mutated = { ...customer, primary: [...customer.primary, { href: '/help', label: 'Help' }] };
    return mutated.primary.length <= PRIMARY_NAV_LIMIT;
  }],
  ['addresses promoted back to primary', () => {
    const mutated = { ...customer, primary: [...customer.primary, { href: '/addresses', label: 'Addresses' }] };
    return !mutated.primary.some((item) => item.href === '/addresses');
  }],
  ['a destination dropped entirely', () => {
    const mutated = { primary: customer.primary, account: customer.account.slice(1) };
    return allDestinations(mutated).length === CUSTOMER_DESTINATIONS.length;
  }],
];
for (const [name, guard] of mutations) {
  check(guard() === false, `the guard against ${name} FAILS when it should`);
}

console.log(`Authenticated navigation: ${checks} checks passed.`);
