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

  /*
   * The web. Checked because it uses the same spread, and found sound: every
   * one of these is the same word in French, a brand, or a vendor's name.
   * Listed individually anyway — "Services" being identical is a fact about
   * French, and the next string to fall through will not be.
   */
  'web-copy.copy': [
    'brand', 'footerWarsha',                       // Warsha
    'navServices', 'footerServices',               // Services
    'navMenu',                                     // Menu
    'footerContact',                               // Contact
    'legalVersion',                                // Version
    // Language names are shown in their own script, in every locale.
    'languageEnglish', 'languageArabic', 'languageFrench',
  ],
  'web-app-copy.appCopy': [
    'navNotifications', 'notifications', 'category_messages',
    'consoleSession', 'providerActionsTitle', 'analyticsColDate', 'auditSource',
    'colAction', 'source_configuration_history', 'caseDocument',
    'detailEnforcement', 'enforcement_suspension', 'reason_discrimination',
    'supportMessageCount', 'quoteMinutes', 'pagerPage',
    'currencyEgp',                                 // EGP
    'platformEnvProduction',                       // Warsha Production
    'providerMapsName', 'providerMapsName_vision', // vendor product names
  ],
  'web-worker-copy.workerCopy': ['earningsMinimum'],
};

/*
 * Arabic legitimately shares three strings with English, and only these: the
 * language names, which every locale shows in their own script so a reader can
 * find their own language without already reading the current one.
 */
const SHARED_WITH_ARABIC: Record<string, string[]> = {
  'web-copy.copy': ['languageEnglish', 'languageArabic', 'languageFrench'],
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
  // The web restates its own copy, with the same spread and the same risk.
  ['web-copy', '../web/lib/copy.ts'],
  ['web-app-copy', '../web/lib/app-copy.ts'],
  ['web-worker-copy', '../web/lib/worker-copy.ts'],
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
    equal(arabicFallthrough.sort(), [...(SHARED_WITH_ARABIC[id] ?? [])].sort(),
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

// --- No parenthetical agreement in French -----------------------------------
/*
 * "sélectionné(s)" and "{done} étape(s) sur {total} terminée(s)" are visibly
 * template artefacts: a developer hedging a plural they did not want to
 * resolve. They read as unfinished software, which is exactly the impression
 * this programme exists to remove, and they appeared on the work picker's
 * counter and the onboarding progress line.
 *
 * This is narrow on purpose. It matches the parenthesised agreement suffix and
 * nothing else — a French string is free to contain parentheses for any other
 * reason, and banning those would force worse copy.
 */
{
  const PARENTHETICAL_AGREEMENT = /\((?:s|e|es|ne|nes)\)/;
  for (const [name, path] of MODULES) {
    const module = await import(path) as Record<string, unknown>;
    for (const [exportName, value] of Object.entries(module)) {
      const table = value as Record<string, Record<string, unknown>> | null;
      if (!table?.fr || typeof table.fr !== 'object') continue;
      for (const [key, text] of Object.entries(table.fr)) {
        if (typeof text !== 'string') continue;
        ok(!PARENTHETICAL_AGREEMENT.test(text),
          `${name}.${exportName}.${key}: "${text}" hedges a plural in brackets — `
          + 'choose the form the sentence actually needs');
      }
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
  'web-app-copy.appCopy',
  'web-copy.copy',
  'web-worker-copy.workerCopy',
], 'the copy tables reachable at runtime are exactly the ones expected — one '
  + 'disappearing means a table stopped being auditable, not that it became correct');

console.log(`Locale coverage: ${checks} checks passed across ${tablesChecked.length} copy tables.`);
