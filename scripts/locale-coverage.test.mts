/**
 * A locale that falls back is a locale nobody notices is missing.
 *
 * Warsha's copy tables are written as `{ ...baseCopy.en, ...overrides }`, which
 * is a sound structure and completely silent about what has not been
 * translated: every key resolves to a real string, so no screen shows a blank,
 * no lookup throws, and no test fails. On 2026-09-10 that silence was hiding
 * 163 of 182 onboarding keys and 83 of 102 discovery keys still in English.
 *
 * What that looked like in the product: a French professional asked to accept
 * "Professional terms" with an "I accept" button, on a legal consent screen. A
 * French customer asked "Where do you need the work done?" on the address step.
 * A French customer searching with an English placeholder, filtering by
 * "Minimum rating", and reading "No professionals matched".
 *
 * So this counts what falls through. Some strings are legitimately identical
 * across languages — Distance, Latitude, Notes, and a brand name are the same
 * word in French — and those are listed rather than guessed at, because a rule
 * that skipped short strings would also skip "Search" and "Filters".
 *
 * ## What this cannot see
 *
 * Only copy tables that Node can import are checked. Several import a `.tsx`
 * somewhere in their chain, and Node's type stripping does not do JSX — those
 * are named below rather than quietly omitted, so the coverage of the coverage
 * check is itself visible.
 */
import assert from 'node:assert/strict';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

/*
 * Identical in English and French on purpose. Each is the same word in both
 * languages, or a name that does not translate.
 */
const SHARED_WITH_FRENCH: Record<string, string[]> = {
  'translations.translations': [
    'alumetal',    // the Egyptian trade's own name, evidenced in service-demand-ranking.md
    'categories',  // "Categories" / "Catégories" differ only by an accent the key does not carry
    'currency',    // EGP
    'notes',       // "Notes"
    'service',     // "Service"
    'serviceStep', // "Service"
  ],
  'notification-copy.copy': ['notifications'],
  'onboarding-copy.onboardingCopy': ['addressLatitude', 'addressLongitude'],
  'discovery-copy.discoveryCopy': ['sortDistance'],
  'legal-copy.legalCopy': [],
  'growth-copy.growthCopy': [],
  'auth-outcome-copy.authOutcomeCopy': [],
};

/*
 * Copy tables Node cannot import: something in the chain is a `.tsx`, and type
 * stripping does not transform JSX. Listed so the gap is countable rather than
 * invisible — the way to close it is to keep copy tables free of component
 * imports, not to weaken this file.
 */
const NOT_RUNTIME_AUDITABLE = [
  'src/auth/auth-translations.ts',
  'src/chat/chat-translations.ts',
  'src/discovery/discovery-translations.ts',
  'src/disputes/dispute-translations.ts',
  'src/growth/growth-translations.ts',
  'src/i18n/address-form-copy.ts',
  'src/i18n/payment-translations.ts',
  'src/i18n/provider-job-translations.ts',
  'src/i18n/provider-translations.ts',
  'src/i18n/verification-translations.ts',
  'src/i18n/worker-profile-translations.ts',
  'src/job-operations/job-operation-translations.ts',
  'src/legal/legal-translations.ts',
  'src/marketplace-intelligence/marketplace-translations.ts',
  'src/notifications/notification-engagement-translations.ts',
  'src/notifications/notification-translations.ts',
  'src/onboarding/onboarding-translations.ts',
];
ok(NOT_RUNTIME_AUDITABLE.length > 0,
  'the tables this cannot reach are named, so the gap in the audit is itself visible');

const MODULES = [
  ['translations', '../src/i18n/translations.ts'],
  ['notification-copy', '../src/notifications/notification-copy.ts'],
  ['onboarding-copy', '../src/onboarding/onboarding-copy.ts'],
  ['discovery-copy', '../src/discovery/discovery-copy.ts'],
  ['legal-copy', '../src/legal/legal-copy.ts'],
  ['growth-copy', '../src/growth/growth-copy.ts'],
  ['auth-outcome-copy', '../src/auth/auth-outcome-copy.ts'],
] as const;

const tablesChecked: string[] = [];

for (const [name, path] of MODULES) {
  const module = await import(path) as Record<string, unknown>;

  for (const [exportName, value] of Object.entries(module)) {
    const table = value as Record<string, Record<string, unknown>> | null;
    if (!table || typeof table !== 'object') continue;
    const { en, ar, fr } = table;
    if (!en || !ar || !fr || typeof en !== 'object') continue;

    const id = `${name}.${exportName}`;
    tablesChecked.push(id);
    const keys = Object.keys(en).filter((key) => typeof en[key] === 'string');
    ok(keys.length > 0, `${id}: has strings to check`);

    // Arabic shares no vocabulary with English, so anything identical there is
    // a forgotten translation with no exceptions worth arguing about.
    const arabicFallthrough = keys.filter((key) => ar[key] === en[key]);
    equal(arabicFallthrough, [],
      `${id}: these Arabic strings are still English — ${arabicFallthrough.slice(0, 8).join(', ')}`);

    const frenchFallthrough = keys.filter((key) => fr[key] === en[key]);
    equal(frenchFallthrough.sort(), [...(SHARED_WITH_FRENCH[id] ?? [])].sort(),
      `${id}: the French strings identical to English are exactly the ones that are `
      + 'the same word in both languages. A new one is a translation that was not written, '
      + 'and the spread hides it because every key still resolves to something');

    // Every locale carries every key, or a lookup silently returns undefined
    // and renders as an empty string rather than as anything anyone can see.
    for (const [locale, values] of [['ar', ar], ['fr', fr]] as const) {
      const absent = keys.filter((key) => !(key in values));
      equal(absent, [], `${id}/${locale}: every key is present — ${absent.slice(0, 6).join(', ')}`);
    }
  }
}

/*
 * The tables found are pinned, not counted. Two of the modules listed above
 * export their copy in a shape this does not recognise as a locale table, and
 * a count would let one of the recognised ones vanish without a word -- which
 * is the same silence the whole file exists to break.
 */
equal(tablesChecked.sort(), [
  'auth-outcome-copy.authOutcomeCopy',
  'discovery-copy.discoveryCopy',
  'notification-copy.copy',
  'onboarding-copy.onboardingCopy',
  'translations.translations',
], 'the copy tables reachable at runtime are exactly the ones expected — one '
  + 'disappearing means a table stopped being auditable, not that it became correct');

console.log(`Locale coverage: ${checks} checks passed across ${tablesChecked.length} copy tables.`);
