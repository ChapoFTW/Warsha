import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { formatMinor } from '../src/payments/money.ts';
import { formatNumber, localeFor } from '../src/utils/date-format.ts';
import {
  directionOf, intlLocale, localeFromAcceptLanguage,
} from '../web/lib/preferences.ts';
import {
  languageFromPreferredLocales, languageMetadata, supportedLanguages,
} from '../src/i18n/language-preference.ts';
import { translations } from '../src/i18n/translations.ts';
import { copy as notificationCopy } from '../src/notifications/notification-copy.ts';
import { supportCopy } from '../src/support/support-copy.ts';
import { appCopy } from '../web/lib/app-copy.ts';
import { frenchAppCopyOverrides } from '../web/lib/app-copy.fr.ts';

let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks += 1; };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks += 1; };
const read = (path: string) => readFileSync(path, 'utf8');

equal([...supportedLanguages], ['en', 'ar', 'fr'], 'the central locale inventory is EN/AR/FR');
equal(languageMetadata.fr.label, 'Français', 'the language selector uses the French endonym');
equal(languageMetadata.fr.direction, 'ltr', 'French direction comes from central metadata');
equal(directionOf('fr'), 'ltr', 'web French is LTR');
equal(intlLocale('fr'), 'fr-EG', 'web formatting uses the Egyptian French locale');
equal(localeFor('fr'), 'fr-EG', 'mobile formatting uses the Egyptian French locale');
equal(languageFromPreferredLocales(['fr-FR']), 'fr', 'mobile detects a French device locale');
equal(localeFromAcceptLanguage('fr-FR,fr;q=0.9,en;q=0.8'), 'fr', 'web detects a French browser locale');
check(formatMinor('123456', 'fr').includes('1\u202f234,56'), 'French currency uses narrow-space grouping and decimal comma');
check(formatNumber(1234.5, 'fr').includes(','), 'French number formatting is locale aware');

const requiredMobileKeys = [
  'home', 'searchPlaceholder', 'bookService', 'newBooking', 'selectAddress',
  'signIn', 'signUp', 'forgotPassword', 'authInvalidCredentials', 'addressRequired',
] as const;
for (const key of requiredMobileKeys) {
  check(translations.fr[key].length > 0, `mobile fr.${key} exists`);
  check(String(translations.fr[key]) !== String(translations.en[key]), `mobile fr.${key} is localized`);
}

const requiredWebKeys = [
  'navHome', 'navRequests', 'navEarnings', 'navVerification', 'navHelp',
  'signInTitle', 'signUpTitle', 'addressesTitle', 'supportTitle', 'analyticsTitle',
] as const;
for (const key of requiredWebKeys) {
  check(appCopy.fr[key].length > 0, `web fr.${key} exists`);
  check(String(appCopy.fr[key]) !== String(appCopy.en[key]), `web fr.${key} is localized`);
}
const acceptedFrenchCognates = new Set([
  'navNotifications', 'notifications', 'consoleSession', 'analyticsColDate', 'auditSource',
  'colAction', 'source_configuration_history', 'pagerPage', 'category_messages',
  'supportMessageCount', 'detailEnforcement', 'caseDocument', 'enforcement_suspension',
  'reason_discrimination', 'currencyEgp', 'quoteMinutes',
  // "Warsha Production" is the same in French. Development and Staging are
  // genuinely translated alongside it, so this is a cognate, not a fallback.
  'platformEnvProduction',
  // A vendor's product name, and a word French spells the same way.
  'providerMapsName', 'providerActionsTitle',
]);
const untranslatedAppKeys = Object.keys(appCopy.en).filter(key =>
  appCopy.en[key as keyof typeof appCopy.en] === appCopy.fr[key as keyof typeof appCopy.fr]
  && !acceptedFrenchCognates.has(key));
equal(untranslatedAppKeys, [], 'authenticated web has no unreviewed English fallback in French');
equal(
  Object.keys(frenchAppCopyOverrides).filter(key => !(key in appCopy.en)),
  [],
  'French authenticated-web overrides contain only canonical copy keys',
);
equal(Object.keys(translations.fr).sort(), Object.keys(translations.en).sort(), 'mobile French has every canonical key');
const acceptedMobileCognates = new Set(['serviceStep', 'notes', 'currency', 'categories', 'service']);
equal(
  Object.keys(translations.en).filter(key =>
    translations.en[key as keyof typeof translations.en] === translations.fr[key as keyof typeof translations.fr]
    && !acceptedMobileCognates.has(key)),
  [],
  'mobile has no unreviewed English fallback in French',
);
equal(Object.keys(notificationCopy.fr).sort(), Object.keys(notificationCopy.en).sort(), 'French notifications have every canonical key');
equal(
  Object.keys(notificationCopy.en).filter(key =>
    notificationCopy.en[key as keyof typeof notificationCopy.en] === notificationCopy.fr[key as keyof typeof notificationCopy.fr]
    && key !== 'notifications'),
  [],
  'notifications have no unreviewed English fallback in French',
);
equal(Object.keys(supportCopy.fr).sort(), Object.keys(supportCopy.en).sort(), 'French support UI has every canonical key');
equal(
  Object.keys(supportCopy.en).filter(key =>
    supportCopy.en[key as keyof typeof supportCopy.en] === supportCopy.fr[key as keyof typeof supportCopy.fr]
    && key !== 'articleCount'),
  [],
  'support UI has no English fallback in French',
);
const mobileHelp = read('app/help/index.tsx');
check(/legacyHelpAvailable = language !== 'fr'/.test(mobileHelp),
  'French Help uses the complete generated manual instead of English-only legacy knowledge-base content');

const middleware = read('web/middleware.ts');
check(middleware.includes("'fr'"), 'middleware accepts the /fr locale');
const publicLayout = read('web/app/[locale]/layout.tsx');
check(/directionOf\(typed\)/.test(publicLayout), 'public route direction is locale-derived');
check(publicLayout.includes('Warsha — services à domicile en Égypte'),
  'French public metadata has a localized site title');
check(publicLayout.includes("fr: 'fr_EG'"),
  'French Open Graph metadata uses the French Egyptian locale');
const appStartup = read('web/app/app/layout.tsx');
check(/lang === 'fr'/.test(appStartup) || /language === 'fr'/.test(appStartup) || /value === 'fr'/.test(appStartup),
  'authenticated web startup accepts persisted French before first paint');
const htmlStartup = read('app/+html.tsx');
check(htmlStartup.includes('Chargement de Warsha'), 'mobile/web export neutral startup has French copy');

const terminology = JSON.parse(read('docs/localization/terminology.json')) as { terms: { key: string; en: string; ar: string; fr: string }[] };
equal(terminology.terms.length, 23, 'the canonical terminology covers all required concepts');
for (const term of terminology.terms) {
  check(Boolean(term.en && term.ar && term.fr), `${term.key} has EN/AR/FR terminology`);
}

const helpIndex = JSON.parse(read('docs/help/help-index.json')) as { locales: string[]; articles: { id: string; locale: string }[] };
equal(helpIndex.locales, ['en', 'ar', 'fr'], 'documentation index is three-locale');
const articleIds = new Set(helpIndex.articles.map(article => article.id));
for (const id of articleIds) {
  const locales = helpIndex.articles.filter(article => article.id === id).map(article => article.locale).sort();
  equal(locales, ['ar', 'en', 'fr'], `${id} has three documentation variants`);
}

console.log(`French localization regressions: ${checks} checks passed.`);
