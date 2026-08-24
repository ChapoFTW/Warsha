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
// Both controls are menus on web. Mobile keeps its own control: same languages
// and same appearance semantics, a control shaped for the platform.
check(/role="menu"/.test(controls) && /aria-label=\{controlLabel\}/.test(controls),
  'each preference control is a labelled menu for assistive technology');
check(/role: 'menuitemradio'/.test(controls) && /'aria-checked': checked/.test(controls),
  'the chosen option is exposed as a checked radio item, not only by colour');
check(/aria-haspopup="menu"/.test(controls) && /aria-expanded=\{open\}/.test(controls),
  'the trigger states whether its menu is open');
check(/hrefLang=\{option\.lang\}/.test(controls),
  'the public language switch is still a real link with hreflang, not a scripted toggle');
check(/mode === 'path' \? `\/\$\{option\}\$\{rest\}` : undefined/.test(controls),
  'only the locale-prefixed surfaces build a path; the app surfaces still record a preference');

// --- Keyboard and dismissal -------------------------------------------------
check(/case 'ArrowDown'/.test(controls) && /case 'ArrowUp'/.test(controls)
  && /case 'Home'/.test(controls) && /case 'End'/.test(controls),
  'the menus are fully navigable by keyboard');
check(/case 'Escape'/.test(controls) && /close\(true\)/.test(controls),
  'Escape closes the menu and returns focus to the trigger');
check(/pointerdown/.test(controls),
  'a pointer press outside the menu closes it');
check(/selected: mounted \? preference : null/.test(controls),
  'no appearance is claimed as chosen until the stored value is known');

// --- Mobile is deliberately untouched ---------------------------------------
const mobileControls = readFileSync('components/warsha/GlobalPreferenceControls.tsx', 'utf8');
check(/accessibilityRole="radiogroup"/.test(mobileControls),
  'the mobile control keeps its own native semantics; the web menus did not replace it');

// --- The switchers must not overlap content ---------------------------------
const controlStyles = readFileSync('web/components/preference-controls.module.css', 'utf8');
const chromeStyles = readFileSync('web/components/site-chrome.module.css', 'utf8');
// A menu must leave the flow to sit over the page — that is what a menu is.
// The invariant that matters is unchanged: nothing is anchored to the viewport,
// so no control can end up parked on top of the footer at 380px.
check(!/position:\s*fixed/.test(controlStyles),
  'NO PREFERENCE CONTROL IS A FIXED WIDGET THAT CAN SIT ON TOP OF CONTENT');
check(/\.menuRoot\s*\{[^}]*position:\s*relative/.test(controlStyles),
  'the open menu is anchored to its own trigger, not to the viewport');
check(/max-width:\s*min\(/.test(controlStyles) && /max-height:\s*min\(/.test(controlStyles),
  'the menu is bounded by the viewport at every width and cannot clip offscreen');
// Arabic is not a mirrored afterthought: the menu is placed with logical
// properties, so it opens on the correct edge in RTL without a second rule.
check(/inset-inline-end/.test(controlStyles) && /inset-block-start/.test(controlStyles),
  'the menu is positioned with logical properties and flips correctly in Arabic');
check(!/(^|[^-])\b(left|right):\s*\d/.test(controlStyles),
  'no physical left/right offset overrides the logical placement');
// Wrapping was the defect, not the safeguard: five navigation labels breaking
// onto second lines is what made the header 122px tall at 1440px. The header
// now reorganises at explicit breakpoints and never reflows.
//
// Scoped to the header half of the stylesheet. The footer carries the
// always-available language and appearance controls and is *meant* to fold
// them onto a second line when there is not room; a whole-file check would
// forbid the correct behaviour in one place to police the incorrect one in
// another.
const chromeHeaderStyles = chromeStyles.slice(0, chromeStyles.indexOf('--- Footer'));
check(chromeHeaderStyles.length > 0, 'the header half of the stylesheet is identifiable');
check(!/flex-wrap:\s*wrap/.test(chromeHeaderStyles),
  'THE HEADER NEVER WRAPS ONTO A SECOND ROW; IT COLLAPSES INSTEAD');
check(/@media \(min-width: 720px\)/.test(chromeStyles)
  && /@media \(min-width: 1140px\)/.test(chromeStyles),
  'the header has explicit breakpoints for the menu and the preference controls');
check(/panelPreferences/.test(chromeStyles),
  'on the narrowest screens the preference controls move into the menu rather than overflowing');
check(!/z-index:\s*(9{2,}|\d{4,})/.test(controlStyles),
  'no switcher escapes stacking context to sit on top of the page');

// --- Settings: language and appearance behind one control -------------------
//
// The French public site is what proved this. `Comment fonctionne Warsha` and
// `Travailler avec Warsha` are roughly twice the width of `How it works` and
// `Work with Warsha`, and the header was also spending permanent width on two
// value-bearing dropdowns whose triggers grow with the localized word inside
// them — `Système`, `Apparence`, `حسب الجهاز`. The header gave up the most room
// in exactly the two languages whose labels needed the most.
const chromeSource = readFileSync('web/components/site-chrome.tsx', 'utf8');
const navSource = readFileSync('web/components/site-nav.tsx', 'utf8');
const appShell = readFileSync('web/components/app-shell.tsx', 'utf8');
const consoleShell = readFileSync('web/components/console-shell.tsx', 'utf8');

const headerMarkup = chromeSource.slice(
  chromeSource.indexOf('export function SiteHeader'),
  chromeSource.indexOf('export function SiteFooter'));
const footerMarkup = chromeSource.slice(chromeSource.indexOf('export function SiteFooter'));

check(/<SettingsMenu/.test(headerMarkup),
  'the public header offers one Settings control');
check(!/<LanguageSwitch|<AppearanceSwitch/.test(headerMarkup),
  'LANGUAGE AND THEME NO LONGER SIT INLINE IN THE PRIMARY HEADER ROW');

// The width the header spends on Settings must not depend on the language,
// which is the whole point. The icon variant renders the gear and no value
// label; only the `labelled` variant renders text.
const settingsSource = controls.slice(controls.indexOf('export function SettingsMenu'));
check(/<GearIcon \/>/.test(settingsSource),
  'the Settings trigger is an icon');
check(/variant === 'labelled' \?/.test(settingsSource),
  'AND RENDERS A LOCALIZED TEXT LABEL ONLY IN THE VARIANT THAT ASKS FOR ONE');
check(!/variant="labelled"/.test(headerMarkup),
  'SO THE PUBLIC HEADER COSTS THE SAME WIDTH IN ENGLISH, ARABIC AND FRENCH');
// Not silent, though: an icon-only control still has to say what it is.
check(/aria-label=\{controlLabel\}/.test(controls),
  'the icon trigger is named for a screen reader in the reader’s language');
check(/controlLabel=\{label\}/.test(settingsSource)
  && /copy\[locale\]\.settingsLabel/.test(settingsSource),
  'and that name is the localized word for Settings');

// --- Every language has the words this change introduced --------------------
for (const key of ['settingsLabel', 'footerPreferences'] as const) {
  for (const locale of ['en', 'ar', 'fr'] as const) {
    const value = copy[locale][key];
    check(typeof value === 'string' && value.length > 0,
      `${locale}.${key} exists`);
  }
  check(copy.fr[key] !== copy.en[key], `fr.${key} is genuinely French`);
  check(/[؀-ۿ]/.test(copy.ar[key]), `ar.${key} is genuinely Arabic`);
}

// --- Responsive placement ---------------------------------------------------
// One Settings entry per surface, never two competing ones, and never a second
// header row.
check(/<SettingsMenu[^>]*variant="labelled"/.test(navSource),
  'below the header breakpoint Settings lives inside the existing navigation panel');
check(!/<LanguageSwitch|<AppearanceSwitch/.test(navSource),
  'the narrow panel offers Settings rather than two separate controls');
const headerSettingsRule = /\.headerSettings \{[\s\S]*?\n\}/.exec(chromeStyles)?.[0] ?? '';
check(/display:\s*none/.test(headerSettingsRule),
  'the header control is absent on the narrowest screens');
check(/\.headerSettings \{\s*display:\s*inline-flex/.test(
  chromeStyles.slice(chromeStyles.indexOf('@media (min-width: 720px)'))),
  'AND APPEARS ONLY WHERE THE HEADER ROW CAN HOLD IT');
check(/\.panelPreferences \{\s*display:\s*none/.test(
  chromeStyles.slice(chromeStyles.indexOf('@media (min-width: 720px)'))),
  'so exactly one of the two is ever displayed — never both, never neither');

// --- Customer, worker and admin ---------------------------------------------
check(/<SettingsMenu locale=\{locale\} \/>/.test(appShell)
  && !/<LanguageSwitch|<AppearanceSwitch/.test(appShell),
  'the customer and worker header carries one Settings control');
check(/<SettingsMenu[^>]*variant="labelled"/.test(consoleShell)
  && !/<LanguageSwitch|<AppearanceSwitch/.test(consoleShell),
  'THE ADMIN SIDEBAR NO LONGER SPENDS PERMANENT SPACE ON EN/AR/FR AND LIGHT/DARK');
check(/placement="above"/.test(consoleShell),
  'and its menu opens upward, since it sits at the foot of the sidebar');

// --- The public footer keeps a way out --------------------------------------
check(/<LanguageSwitch/.test(footerMarkup) && /<AppearanceSwitch/.test(footerMarkup),
  'THE FOOTER EXPOSES LANGUAGE AND APPEARANCE FOR ANYONE WHO MISSES THE MENU');
check((footerMarkup.match(/<LanguageSwitch/g) ?? []).length === 1,
  'and does so exactly once, rather than repeating the control down the page');
check(/placement="above"/.test(footerMarkup),
  'the footer menus open upward rather than growing the page every time');
check(/footerPreferences/.test(chromeStyles),
  'the footer preference block is laid out rather than left to inline defaults');

// --- Language selection, in every language ----------------------------------
// The options are built from the shared locale list, so a fourth language is a
// data change rather than a fourth branch in a component.
check(/LOCALES\.map/.test(controls),
  'the language options come from the shared locale list');
for (const locale of ['en', 'ar', 'fr'] as const) {
  check(copy[locale].languageEnglish === 'English'
    && copy[locale].languageArabic === 'العربية'
    && copy[locale].languageFrench === 'Français',
    `the ${locale} menu names each language in that language's own script`);
}
check(/mode === 'path' \? `\/\$\{option\}\$\{rest\}` : undefined/.test(controls),
  'the locale-prefixed public site still offers real URLs, and the apps do not');
check(/mode="path"/.test(headerMarkup) && /mode="path"/.test(footerMarkup)
  && /mode="path"/.test(navSource),
  'every public-site entry point uses path mode, so localized routing is preserved');
check(!/mode="path"/.test(appShell) && !/mode="path"/.test(consoleShell),
  'AND THE UNPREFIXED APPLICATIONS STILL RECORD A PREFERENCE RATHER THAN 404ING');

// --- Theme selection and persistence ----------------------------------------
check(/appearancePreferences\.map/.test(controls),
  'the appearance options come from the shared preference list');
check(/root\.removeAttribute\('data-theme'\)/.test(controls),
  'CHOOSING SYSTEM REMOVES THE OVERRIDE, SO THE OS PREFERENCE APPLIES AGAIN');
check(/root\.setAttribute\('data-theme', next\)/.test(controls),
  'and an explicit choice sets the attribute the stylesheet reads');
// Persistence is unchanged by the move: the same keys, written in the same
// place, still separating "chosen" from "current".
check((controls.match(/window\.localStorage\.setItem/g) ?? []).length >= 4,
  'both preferences persist their value and their explicitness');
check(/warsha-locale=\$\{locale\}/.test(controls),
  'the language cookie the middleware reads is still written');
check(/dispatchEvent\(new Event\(languageChangeEvent\)\)/.test(controls),
  'and the unprefixed surfaces are still told to re-render in place');

// --- One implementation, not two --------------------------------------------
// Settings and the standalone switches must not drift apart, so they share the
// group definitions rather than each building their own.
check(/function useLanguageGroup/.test(controls) && /function useAppearanceGroup/.test(controls),
  'the language and appearance groups are defined once');
check((controls.match(/function rememberLanguage/g) ?? []).length === 1,
  'THERE IS ONE IMPLEMENTATION OF REMEMBERING A LANGUAGE, NOT ONE PER CONTROL');
check((controls.match(/role="menu"/g) ?? []).length === 1,
  'and one menu implementation, not a second framework for Settings');
check(/useLanguageGroup\(locale, mode\)/.test(settingsSource)
  && /useAppearanceGroup\(locale\)/.test(settingsSource),
  'Settings reuses those definitions rather than restating them');

// --- Keyboard and screen-reader behaviour -----------------------------------
check(/role: 'menuitemradio'/.test(controls) && /'aria-checked': checked/.test(controls),
  'each option announces itself as a choice, and which one is in effect');
check(/role="group"/.test(controls) && /aria-label=\{group\.label\}/.test(controls),
  'LANGUAGE AND APPEARANCE ARE NAMED GROUPS INSIDE THE ONE MENU');
check(/aria-hidden="true">\{group\.label\}/.test(controls),
  'and the visible group heading is not announced a second time');
check(/const flat = groups\.flatMap/.test(controls),
  'ARROW KEYS WALK EVERY OPTION IN THE MENU, ACROSS BOTH GROUPS');
for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab']) {
  check(new RegExp(`case '${key}'`).test(controls), `${key} is handled inside the menu`);
}
check(/case 'Escape': event\.preventDefault\(\); close\(true\); break;/.test(controls),
  'ESCAPE CLOSES AND RETURNS FOCUS TO THE TRIGGER');
check(/if \(returnFocus\) triggerRef\.current\?\.focus\(\)/.test(controls),
  'focus returns to the control that opened the menu');
check(/pointerdown/.test(controls) && /rootRef\.current\?\.contains/.test(controls),
  'a pointer press outside the menu closes it');
check(/aria-haspopup="menu"/.test(controls) && /aria-expanded=\{open\}/.test(controls)
  && /aria-controls=\{menuId\}/.test(controls),
  'the trigger announces that it opens a menu, its state, and which menu');

// --- RTL --------------------------------------------------------------------
// Everything added for Settings is written in logical properties, so Arabic
// mirrors without a second stylesheet.
const settingsCss = controlStyles.slice(controlStyles.indexOf('--- Settings'));
check(settingsCss.length > 0, 'the Settings rules are identifiable');
check(!/(^|[^-])\b(left|right|margin-left|margin-right|padding-left|padding-right):/
  .test(settingsCss),
  'NO PHYSICAL DIRECTION APPEARS IN THE SETTINGS RULES; ARABIC MIRRORS FOR FREE');
check(/inset-block-end/.test(controlStyles),
  'the upward-opening menu is placed with a logical property too');
check(/padding-inline-end/.test(chromeStyles),
  'and the footer heading spaces itself on the reading edge, not the left');
// The gear is symmetrical, so unlike a chevron it must NOT be mirrored.
check(/Symmetrical/.test(controls) || /needs no mirroring/.test(controls),
  'the icon choice records why it is not mirrored in Arabic');

// --- No hydration flash regression ------------------------------------------
check(/selected: mounted \? preference : null/.test(controls),
  'the appearance control still claims nothing before the stored value is known');
check(/setMounted\(true\)/.test(controls) && /useEffect/.test(controls),
  'the stored appearance is still read after mount, never during render');

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
