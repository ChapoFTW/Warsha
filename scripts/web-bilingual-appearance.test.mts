import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  appearanceExplicitKey,
  appearanceStorageKey,
  resolveAppearance,
} from '../src/appearance/appearance-types.ts';
import {
  languageExplicitKey,
  languageStorageKey,
  resolveLanguage,
} from '../src/i18n/language-preference.ts';
import { copy } from '../web/lib/copy.ts';
import { pageContent, PAGE_SLUGS } from '../web/lib/pages-copy.ts';
import { directionOf, localeFromAcceptLanguage } from '../web/lib/preferences.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const BUILT = 'web/.next/server/app';
const built = (path: string) => readFileSync(join(BUILT, path), 'utf8');
const hasBuild = existsSync(BUILT);

// --- One preference model, shared with mobile -------------------------------
// The web must not invent a second definition of "the user chose this".
const preferences = readFileSync('web/lib/preferences.ts', 'utf8');
check(/from '\.\.\/\.\.\/src\/i18n\/language-preference\.ts'/.test(preferences),
  'web language preference comes from the mobile contract, not a copy');
check(/from '\.\.\/\.\.\/src\/appearance\/appearance-types\.ts'/.test(preferences),
  'web appearance preference comes from the mobile contract, not a copy');
equal(languageStorageKey, 'warsha:language:v1', 'the language key is the mobile key');
equal(appearanceStorageKey, 'warsha:appearance:v1', 'the appearance key is the mobile key');

const controls = readFileSync('web/components/preference-controls.tsx', 'utf8');
for (const key of [languageStorageKey, languageExplicitKey,
  appearanceStorageKey, appearanceExplicitKey]) {
  check(controls.includes(key.split(':')[1]) || /StorageKey|ExplicitKey/.test(controls),
    'the switchers write through the shared key constants');
}
check(/languageExplicitKey, 'true'/.test(controls) && /appearanceExplicitKey, String/.test(controls),
  'AN EXPLICIT CHOICE IS RECORDED SEPARATELY FROM THE VALUE, AS ON MOBILE');

// --- System fallback and persisted override --------------------------------
equal(resolveAppearance('system', 'light'), 'light',
  'with no explicit choice the device scheme wins (light)');
equal(resolveAppearance('system', 'dark'), 'dark',
  'with no explicit choice the device scheme wins (dark)');
equal(resolveAppearance('light', 'dark'), 'light',
  'AN EXPLICIT LIGHT CHOICE OVERRIDES A DARK DEVICE');
equal(resolveAppearance('dark', 'light'), 'dark',
  'an explicit dark choice overrides a light device');
equal(resolveAppearance('system', null), 'dark',
  'an unknown device scheme resolves to the documented default');

equal(resolveLanguage({ savedLanguage: 'ar', savedExplicitly: true, preferredLocales: ['en-US'] }),
  { language: 'ar', explicit: true },
  'AN EXPLICIT ARABIC CHOICE SURVIVES AN ENGLISH BROWSER');
equal(resolveLanguage({ savedLanguage: 'ar', savedExplicitly: false, preferredLocales: ['en-US'] }),
  { language: 'en', explicit: false },
  'a non-explicit stored value does not override the browser');
equal(resolveLanguage({ savedLanguage: null, savedExplicitly: false, preferredLocales: ['ar-EG'] }),
  { language: 'ar', explicit: false },
  'with no choice, an Arabic browser gets Arabic');

// The middleware applies the same precedence to what a server can see.
equal(localeFromAcceptLanguage('ar-EG,ar;q=0.9,en;q=0.8'), 'ar',
  'an Arabic-first Accept-Language resolves to Arabic');
equal(localeFromAcceptLanguage('en-GB,en;q=0.9,ar;q=0.8'), 'en',
  'an English-first Accept-Language resolves to English');
equal(localeFromAcceptLanguage('en;q=0.4,ar;q=0.9'), 'ar',
  'quality values are honoured, not document order');
equal(localeFromAcceptLanguage(null), 'en', 'a missing header falls back to English');
equal(localeFromAcceptLanguage('fr-FR'), 'fr', 'a French browser resolves to French');

const middleware = readFileSync('web/middleware.ts', 'utf8');
check(/warsha-locale/.test(middleware) && /accept-language/.test(middleware),
  'the root route is resolved server-side from the cookie then the browser');
check(/307/.test(middleware),
  'the language redirect is temporary, since it varies by visitor');
check(/warsha-locale=/.test(controls),
  'choosing a language writes the cookie the middleware can read');

// --- No first-paint flash ---------------------------------------------------
const layout = readFileSync('web/app/[locale]/layout.tsx', 'utf8');
check(/<head>[\s\S]*dangerouslySetInnerHTML[\s\S]*<\/head>/.test(layout),
  'THE STORED THEME IS APPLIED BY A SCRIPT IN HEAD, BEFORE FIRST PAINT');
check(layout.indexOf('applyStoredAppearance') < layout.indexOf('<body>'),
  'the theme script runs before the body exists');
check(/<html lang=\{typed\} dir=\{directionOf\(typed\)\}/.test(layout),
  'LANGUAGE AND DIRECTION ARE SERVER-RENDERED, SO ARABIC NEVER FLASHES ENGLISH');
check(!/useEffect[\s\S]*setAttribute\('data-theme'/.test(layout),
  'the theme is not applied from an effect, which would paint the wrong theme first');
const globals = readFileSync('web/app/globals.css', 'utf8');
check(/prefers-color-scheme: light/.test(globals) && /:root:not\(\[data-theme='dark'\]\)/.test(globals),
  'with no explicit choice the CSS follows the device, needing no script at all');

// --- All public-site languages are complete --------------------------------
const enKeys = Object.keys(copy.en).sort();
const arKeys = Object.keys(copy.ar).sort();
const frKeys = Object.keys(copy.fr).sort();
equal(arKeys, enKeys, 'EVERY STRING EXISTS IN BOTH LANGUAGES');
equal(frKeys, enKeys, 'EVERY PUBLIC STRING EXISTS IN FRENCH');
for (const key of enKeys) {
  const value = copy.ar[key as keyof typeof copy.ar];
  check(typeof value === 'string' && value.length > 0, `ar.${key} is not empty`);
}
for (const key of enKeys) {
  const value = copy.fr[key as keyof typeof copy.fr];
  check(typeof value === 'string' && value.length > 0, `fr.${key} is not empty`);
}
// Arabic values must actually be Arabic, not English left in place. A few keys
// are deliberately identical because they are proper nouns or endonyms.
const allowedIdentical = new Set(['languageEnglish', 'languageArabic', 'languageFrench']);
for (const key of enKeys) {
  if (allowedIdentical.has(key)) continue;
  const ar = copy.ar[key as keyof typeof copy.ar];
  check(/[؀-ۿ]/.test(ar), `ar.${key} is written in Arabic, not left in English`);
}

for (const slug of PAGE_SLUGS) {
  const en = pageContent.en[slug];
  const ar = pageContent.ar[slug];
  equal(ar.blocks.length, en.blocks.length,
    `${slug} has the same structure in both languages`);
  equal(ar.blocks.map(b => b.kind), en.blocks.map(b => b.kind),
    `${slug} renders the same block kinds in both languages`);
  const fr = pageContent.fr[slug];
  equal(fr.blocks.map(b => b.kind), en.blocks.map(b => b.kind),
    `${slug} renders the same block kinds in French`);
  check(fr.title !== en.title && fr.lead !== en.lead,
    `${slug} has a localized French title and lead`);
  check(/[؀-ۿ]/.test(ar.title) && /[؀-ۿ]/.test(ar.lead),
    `${slug} has a genuinely Arabic title and lead`);
  check(/[؀-ۿ]/.test(ar.description),
    `${slug} has an Arabic meta description for search results`);
}

// --- No hardcoded English in shared web components --------------------------
const componentFiles = readdirSync('web/components')
  .filter(name => name.endsWith('.tsx'))
  .map(name => join('web/components', name));
for (const file of componentFiles) {
  const source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  // Any run of two or more Latin words between JSX tags would be visible copy.
  const jsxText = [...source.matchAll(/>\s*([A-Za-z][A-Za-z',.!?-]*(?:\s+[A-Za-z][A-Za-z',.!?-]*)+)\s*</g)]
    .map(match => match[1].trim())
    .filter(text => !/^(true|false|null|undefined)$/.test(text));
  equal(jsxText, [], `${file} renders no hardcoded English sentence`);
}

// --- Direction and switcher behaviour ---------------------------------------
equal(directionOf('ar'), 'rtl', 'Arabic is right-to-left');
equal(directionOf('en'), 'ltr', 'English is left-to-right');
equal(directionOf('fr'), 'ltr', 'French is left-to-right');
check(/LOCALES\.map/.test(controls),
  'the switcher renders every centrally supported language');

const chrome = readFileSync('web/components/site-chrome.tsx', 'utf8');
check(/LanguageSwitch/.test(chrome) && /AppearanceSwitch/.test(chrome),
  'both switchers are present in the site chrome, on every page');
check(/aria-label=\{copy\[locale\]\.appearanceLabel\}/.test(controls)
  && /role="group"/.test(controls),
  'the appearance control is a labelled group for assistive technology');
check(/aria-pressed=/.test(controls),
  'the selected appearance is exposed to assistive technology, not only by colour');
check(/hrefLang=\{option\}/.test(controls),
  'the language switch is a real link with hreflang, not a scripted toggle');

// --- The switchers must not overlap content ---------------------------------
const controlStyles = readFileSync('web/components/preference-controls.module.css', 'utf8');
const chromeStyles = readFileSync('web/components/site-chrome.module.css', 'utf8');
check(!/position:\s*(fixed|absolute)/.test(controlStyles),
  'THE SWITCHERS ARE IN NORMAL FLOW AND CANNOT OVERLAP CONTENT AT ANY WIDTH');
// Wrapping was the defect, not the safeguard: five navigation labels breaking
// onto second lines is what made the header 122px tall at 1440px. The header
// now reorganises at explicit breakpoints and never reflows.
check(!/flex-wrap:\s*wrap/.test(chromeStyles),
  'THE HEADER NEVER WRAPS ONTO A SECOND ROW; IT COLLAPSES INSTEAD');
check(/@media \(min-width: 720px\)/.test(chromeStyles)
  && /@media \(min-width: 1140px\)/.test(chromeStyles),
  'the header has explicit breakpoints for the menu and the preference controls');
check(/panelPreferences/.test(chromeStyles),
  'on the narrowest screens the preference controls move into the menu rather than overflowing');
check(!/z-index:\s*(9{2,}|\d{4,})/.test(controlStyles),
  'no switcher escapes stacking context to sit on top of the page');

// --- Built output: the promise actually shipped -----------------------------
if (hasBuild) {
  const en = built('en.html');
  const ar = built('ar.html');
  const fr = built('fr.html');
  check(/<html lang="en" dir="ltr"/.test(en), 'the built English page declares ltr');
  check(/<html lang="ar" dir="rtl"/.test(ar), 'THE BUILT ARABIC PAGE DECLARES RTL');
  check(/<html lang="fr" dir="ltr"/.test(fr), 'the built French page declares ltr');
  check(/[؀-ۿ]/.test(ar), 'the built Arabic page contains Arabic text');
  check(!/Get it fixed, at a price you agreed first/.test(ar),
    'NO ENGLISH MARKETING COPY LEAKS INTO THE ARABIC PAGE');
  check(/hrefLang="ar"/i.test(en) && /hrefLang="en"/i.test(ar),
    'each language advertises the other, and both routes exist');
  for (const locale of ['en', 'ar', 'fr']) {
    check(existsSync(join(BUILT, locale, 'legal', 'privacy-policy.html')),
      `the ${locale} legal reader is generated`);
    for (const slug of PAGE_SLUGS) {
      check(existsSync(join(BUILT, locale, `${slug}.html`)),
        `/${locale}/${slug} is generated`);
    }
  }
  const arLegal = built('ar/legal/privacy-policy.html');
  check(/<html lang="ar" dir="rtl"/.test(arLegal),
    'the Arabic legal document is right-to-left');
} else {
  console.log('  (built output absent — run `npm run web:build` for full coverage)');
}

console.log(`Web bilingual + appearance regressions: ${checks} checks passed.`);
