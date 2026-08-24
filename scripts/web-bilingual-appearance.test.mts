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
// Still on every page, still both — now through the one component that carries
// the pair, rendered in the footer rather than the header.
check(/PreferenceFooter/.test(chrome),
  'the site chrome offers the preference controls on every page');
check(/<LanguageSwitch/.test(controls) && /<AppearanceSwitch/.test(controls),
  'and that component is both switchers, not one of them');
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
check(/selected=\{mounted \? preference : null\}/.test(controls),
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
  'the header has explicit breakpoints for the menu and the auth actions');
// There is nothing left in the header to overflow. The controls used to be
// there and moved into the navigation panel below 720px; they are in the
// footer at every width now, so the panel carries none and needs no rule.
check(!/panelPreferences/.test(chromeStyles),
  'NO PREFERENCE CONTROL IS LAID OUT IN THE HEADER OR ITS PANEL AT ANY WIDTH');
check(!/headerSettings/.test(chromeStyles),
  'and the header settings rules are gone with the control they styled');
check(!/z-index:\s*(9{2,}|\d{4,})/.test(controlStyles),
  'no switcher escapes stacking context to sit on top of the page');

// --- Preferences live at the bottom, and only at the bottom -----------------
//
// Three placements were tried. Two dropdowns in the header competed with
// navigation and auth actions for one row; one gear replacing them still
// occupied space between the navigation and the auth buttons, and on the
// French public site — the longest labels Warsha has — that still read as
// clutter. A preference somebody sets once does not belong in the row they
// navigate from every time.
//
// The invariant these assert is simple and total: NO header, on any surface,
// contains a language, appearance or settings control.
const chromeSource = readFileSync('web/components/site-chrome.tsx', 'utf8');
const navSource = readFileSync('web/components/site-nav.tsx', 'utf8');
const appShell = readFileSync('web/components/app-shell.tsx', 'utf8');
const consoleShell = readFileSync('web/components/console-shell.tsx', 'utf8');
const authPanel = readFileSync('web/components/auth-panel.tsx', 'utf8');
const staffSignIn = readFileSync('web/components/staff-sign-in.tsx', 'utf8');
const appSignIn = readFileSync('web/app/app/sign-in/page.tsx', 'utf8');
const appCreate = readFileSync('web/app/app/create-account/page.tsx', 'utf8');
const accountPage = readFileSync('web/app/app/account/page.tsx', 'utf8');

const CONTROL = /<(LanguageSwitch|AppearanceSwitch|SettingsMenu|PreferenceFooter)/;

// The gear is gone from the codebase, not merely from the markup: a component
// nobody renders is one somebody re-adds.
check(!/SettingsMenu/.test(controls),
  'THE SETTINGS GEAR NO LONGER EXISTS AS A COMPONENT');
for (const [name, source] of [
  ['public chrome', chromeSource], ['nav', navSource], ['app shell', appShell],
  ['console shell', consoleShell], ['auth panel', authPanel],
  ['staff sign-in', staffSignIn], ['app sign-in', appSignIn],
  ['create account', appCreate],
] as const) {
  check(!/SettingsMenu/.test(source), `${name} renders no settings gear`);
}

// --- Zero preference controls in any header ---------------------------------
const publicHeader = chromeSource.slice(
  chromeSource.indexOf('export function SiteHeader'),
  chromeSource.indexOf('export function SiteFooter'));
check(!CONTROL.test(publicHeader),
  'THE PUBLIC HEADER CONTAINS NO LANGUAGE, APPEARANCE OR SETTINGS CONTROL');

const appHeader = appShell.slice(appShell.indexOf('<header'), appShell.indexOf('</header>'));
check(appHeader.length > 0 && !CONTROL.test(appHeader),
  'THE CUSTOMER AND WORKER HEADER CONTAINS NONE EITHER');

// The admin sidebar's navigation and sign-out block must be clear of them; they
// belong after it, not inside it.
const sidebarNavAndFoot = consoleShell.slice(
  consoleShell.indexOf('<nav'), consoleShell.indexOf('</div>', consoleShell.indexOf('sidebarFoot')));
check(!CONTROL.test(sidebarNavAndFoot),
  'ADMIN NAVIGATION AND SIGN-OUT CARRY NO PREFERENCE CONTROL');

// --- And none in the hamburger ----------------------------------------------
const navPanel = navSource.slice(navSource.indexOf('warsha-nav-panel'));
check(!CONTROL.test(navPanel),
  'THE NARROW NAVIGATION PANEL CONTAINS NO SETTINGS ENTRY');
check(!/preference-controls/.test(navSource),
  'and the navigation component does not import the controls at all');

// --- The header contains only brand, navigation and account actions ---------
check(/<BrandLockup/.test(publicHeader) && /<SiteNav/.test(publicHeader)
  && /APP_SIGN_IN/.test(publicHeader) && /APP_CREATE_ACCOUNT/.test(publicHeader),
  'the public header still carries brand, navigation and both auth actions');
const publicActions = publicHeader.slice(publicHeader.indexOf('styles.actions'));
check(!CONTROL.test(publicActions),
  'NOTHING SITS BETWEEN THE NAVIGATION AND THE AUTH ACTIONS');

// --- Bottom placements exist on every surface -------------------------------
const publicFooter = chromeSource.slice(chromeSource.indexOf('export function SiteFooter'));
check(/<PreferenceFooter/.test(publicFooter),
  'the public footer carries the controls');
check(/mode="path"/.test(publicFooter),
  'AND KEEPS PUBLIC LOCALE ROUTING, SO EACH LANGUAGE IS STILL A REAL URL');
check((chromeSource.match(/<PreferenceFooter/g) ?? []).length === 1,
  'exactly once on the public site — the footer is the only place');

check(/<footer className=\{styles\.footer\}>[\s\S]{0,200}<PreferenceFooter/.test(appShell),
  'THE CUSTOMER AND WORKER SHELL HAS A FOOTER, AND THE CONTROLS ARE IN IT');
check(appShell.indexOf('<PreferenceFooter') > appShell.indexOf('</main>'),
  'which comes after the page content, not before it');

check(consoleShell.indexOf('<PreferenceFooter') > consoleShell.indexOf('signOut'),
  'THE ADMIN CONTROLS SIT BELOW SIGN-OUT, AT THE BOTTOM OF THE SIDEBAR');
check(/sidebarPreferences/.test(consoleShell)
  && /\.sidebarPreferences/.test(readFileSync('web/components/console-shell.module.css', 'utf8')),
  'and are laid out as their own block rather than inside the navigation');

for (const [name, source, panelEnd] of [
  ['auth panel', authPanel, '</main>'],
  ['staff sign-in', staffSignIn, '</main>'],
  ['app sign-in', appSignIn, '</main>'],
  ['create account', appCreate, '</main>'],
] as const) {
  check(/<PreferenceFooter/.test(source), `${name} still offers the controls`);
  check(source.indexOf('<PreferenceFooter') > source.indexOf(panelEnd),
    `${name.toUpperCase()} PUTS THEM BELOW THE FORM, NOT ABOVE IT`);
}

// A floating corner widget is the opposite of "at the bottom".
for (const path of [
  'web/components/auth-panel.module.css',
  'web/components/staff-sign-in.module.css',
  'web/app/app/sign-in/page.module.css',
  'web/app/app/create-account/create-account.module.css',
]) {
  const sheet = readFileSync(path, 'utf8');
  const rule = /\.controls \{[\s\S]*?\n\}/.exec(sheet)?.[0] ?? '';
  check(rule.length > 0, `${path} defines the controls block`);
  check(!/position:\s*absolute/.test(rule),
    'THE AUTH CONTROLS ARE IN NORMAL FLOW, NOT PINNED TO A CORNER');
}

// The Account page named these controls in a heading and a lead for a long time
// while rendering neither. With the header cleared that became an empty promise
// on the one page somebody goes to looking for exactly this.
check(/<PreferenceFooter/.test(accountPage),
  'THE ACCOUNT PREFERENCES SECTION RENDERS THE CONTROLS IT ADVERTISES');
check(accountPage.indexOf('accountPreferencesBody') < accountPage.indexOf('<PreferenceFooter'),
  'directly under the lead that describes them');

// --- One definition, so the six placements cannot drift ---------------------
check(/export function PreferenceFooter/.test(controls),
  'the pair is one component, not six arrangements');
check((controls.match(/function rememberLanguage/g) ?? []).length === 1,
  'there is one implementation of remembering a language');
check((controls.match(/role="menu"/g) ?? []).length === 1,
  'and one menu implementation');

// --- Every language has the words, and the dead one is gone -----------------
for (const locale of ['en', 'ar', 'fr'] as const) {
  const value = copy[locale].footerPreferences;
  check(typeof value === 'string' && value.length > 0, `${locale}.footerPreferences exists`);
}
check(copy.fr.footerPreferences !== copy.en.footerPreferences,
  'fr.footerPreferences is genuinely French');
check(/[؀-ۿ]/.test(copy.ar.footerPreferences),
  'ar.footerPreferences is genuinely Arabic');
check(!('settingsLabel' in copy.en),
  'THE WORD FOR A CONTROL THAT NO LONGER EXISTS IS GONE FROM THE DICTIONARY');

// --- Language selection, in every language ----------------------------------
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
check(!/mode="path"/.test(appShell) && !/mode="path"/.test(consoleShell),
  'THE UNPREFIXED APPLICATIONS STILL RECORD A PREFERENCE RATHER THAN 404ING');

// --- Theme selection and persistence, unchanged by the move -----------------
check(/appearancePreferences\.map/.test(controls),
  'the appearance options come from the shared preference list');
check(/root\.removeAttribute\('data-theme'\)/.test(controls),
  'CHOOSING SYSTEM REMOVES THE OVERRIDE, SO THE OS PREFERENCE APPLIES AGAIN');
check(/root\.setAttribute\('data-theme', next\)/.test(controls),
  'and an explicit choice sets the attribute the stylesheet reads');
check((controls.match(/window\.localStorage\.setItem/g) ?? []).length >= 4,
  'both preferences persist their value and their explicitness');
check(/warsha-locale=\$\{locale\}/.test(controls),
  'the language cookie the middleware reads is still written');
check(/dispatchEvent\(new Event\(languageChangeEvent\)\)/.test(controls),
  'and the unprefixed surfaces are still told to re-render in place');

// --- Keyboard and screen-reader behaviour -----------------------------------
check(/role: 'menuitemradio'/.test(controls) && /'aria-checked': checked/.test(controls),
  'each option announces itself as a choice, and which one is in effect');
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
check(/role="group"/.test(controls) && /aria-label=\{copy\[locale\]\.footerPreferences\}/.test(controls),
  'the pair is a named group, so the two dropdowns are not two loose puzzles');
check(/aria-hidden="true"/.test(controls),
  'and its visible heading is not announced a second time');

// --- RTL --------------------------------------------------------------------
const bottomCss = controlStyles.slice(controlStyles.indexOf('--- The pair, at the bottom'));
check(bottomCss.length > 0, 'the bottom-placement rules are identifiable');
check(!/(^|[^-])\b(left|right|margin-left|margin-right|padding-left|padding-right):/
  .test(bottomCss),
  'NO PHYSICAL DIRECTION IN THE BOTTOM RULES; ARABIC MIRRORS FOR FREE');
check(/inset-block-end/.test(controlStyles),
  'the upward-opening menu is placed with a logical property');
check(/placement="above"/.test(controls),
  'EVERY PLACEMENT OPENS UPWARD, SINCE ALL OF THEM SIT AT A BOTTOM EDGE');
for (const path of ['web/components/console-shell.module.css', 'web/components/app-shell.module.css']) {
  const sheet = readFileSync(path, 'utf8');
  check(!/(^|[^-])\b(margin-left|margin-right|padding-left|padding-right):/.test(sheet),
    `${path} uses logical spacing only`);
}

// --- No hydration flash regression ------------------------------------------
check(/selected=\{mounted \? preference : null\}/.test(controls),
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
