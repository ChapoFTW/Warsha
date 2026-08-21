import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import {
  isPublicAuthRoute,
  signedOutRedirect,
} from '../src/navigation/auth-route-policy.ts';
import {
  documentMetadataFor,
  languageFromPreferredLocales,
  resolveLanguage,
} from '../src/i18n/language-preference.ts';
import {
  precedence,
  resolveAppearance,
} from '../src/appearance/appearance-types.ts';

const read = (path: string) => readFileSync(path, 'utf8');
let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const equal = <T,>(actual: T, expected: T, message: string) => {
  assert.equal(actual, expected, message);
  checks += 1;
};

// Exact auth regression: public sign-in is stable while protected routes are
// rejected. Route groups, trailing slashes, and query strings cannot change
// the classification.
for (const route of ['/sign-in', '/sign-in/', '/(public)/sign-in', '/sign-in?from=welcome']) {
  check(isPublicAuthRoute(route), `${route} is a public auth route`);
  equal(signedOutRedirect(route), null, `${route} remains visible while signed out`);
}
for (const route of ['/admin', '/admin/providers', '/', '/worker']) {
  check(!isPublicAuthRoute(route), `${route} is protected`);
  equal(signedOutRedirect(route), '/welcome', `${route} returns a signed-out visitor to Welcome`);
}
check(isPublicAuthRoute('/create-account'), 'customer and worker registration remain reachable');
check(isPublicAuthRoute('/reset-password'), 'password recovery remains reachable');
check(isPublicAuthRoute('/legal/privacy'), 'signed-out legal routes remain reachable');

const welcome = read('app/welcome.tsx');
const createAccount = read('app/create-account.tsx');
check(/router\.replace\('\/sign-in'\)/.test(welcome), 'Welcome enters the canonical sign-in route');
check(/if \(auth\.user\) await auth\.signOut\(\)/.test(welcome), 'Welcome clears a hidden authenticated session before account switching');
check(/if \(auth\.user\) await auth\.signOut\(\)/.test(createAccount), 'role selection clears a hidden authenticated session before account switching');

// Language precedence and fallback.
equal(languageFromPreferredLocales([{ languageCode: 'ar', languageTag: 'ar-EG' }]), 'ar', 'Arabic device locale selects Arabic');
equal(languageFromPreferredLocales([{ languageCode: 'en', languageTag: 'en-US' }]), 'en', 'English device locale selects English');
equal(languageFromPreferredLocales([{ languageCode: 'fr', languageTag: 'fr-FR' }]), 'fr', 'French device locale selects French');
equal(languageFromPreferredLocales([{ languageCode: 'de', languageTag: 'de-DE' }]), 'en', 'an unsupported locale falls back to English');
equal(resolveLanguage({ savedLanguage: 'ar', savedExplicitly: true, preferredLocales: ['en-US'] }).language, 'ar', 'explicit Arabic overrides English platform locale');
equal(resolveLanguage({ savedLanguage: 'en', savedExplicitly: true, preferredLocales: ['ar-EG'] }).language, 'en', 'explicit English overrides Arabic platform locale');
equal(resolveLanguage({ savedLanguage: 'fr', savedExplicitly: true, preferredLocales: ['ar-EG'] }).language, 'fr', 'explicit French overrides Arabic platform locale');
equal(resolveLanguage({ savedLanguage: 'ar', savedExplicitly: false, preferredLocales: ['en-US'] }).language, 'en', 'a non-explicit cached value cannot override the platform');
equal(documentMetadataFor('ar').direction, 'rtl', 'Arabic web metadata is RTL');
equal(documentMetadataFor('en').manifest, '/manifest.webmanifest', 'English uses the default web manifest');
equal(documentMetadataFor('fr').direction, 'ltr', 'French web metadata is LTR');

// Appearance matrix and preference precedence.
for (const language of ['en', 'ar', 'fr'] as const) {
  for (const preference of ['system', 'light', 'dark'] as const) {
    const expected = preference === 'system' ? 'light' : preference;
    equal(resolveAppearance(preference, 'light'), expected, `${language} × ${preference} resolves against a light system`);
  }
}
equal(resolveAppearance('system', 'dark'), 'dark', 'System follows a dark platform');
equal(precedence({ localPreference: 'light', localIsExplicit: true, serverPreference: 'dark' }).preference, 'light', 'explicit local theme survives account changes');
equal(precedence({ localPreference: 'system', localIsExplicit: false, serverPreference: null }).preference, 'system', 'fresh theme defaults to System');

const localization = read('src/i18n/localization.tsx');
check(/getLocales\(\)/.test(localization), 'platform locale comes from Expo Localization');
check(/readLocalLanguage/.test(localization) && /writeLocalLanguage/.test(localization), 'language is synchronously read and persistently written');
check(/AppState\.addEventListener/.test(localization), 'automatic language follows Android foreground changes');
check(/documentElement\.dir/.test(localization), 'web document direction updates immediately');

const root = read('app/_layout.tsx');
check(/<GlobalPreferenceControls \/>/.test(root), 'one root-owned preference dock covers every routed surface');
const preferenceControls = read('components/warsha/GlobalPreferenceControls.tsx');
check(!/layer:\s*\{\s*position:\s*'absolute'/.test(preferenceControls),
  'the root preference dock reserves layout space instead of overlaying page headings');
check(/paddingTop: Math\.max\(insets\.top/.test(preferenceControls),
  'the root preference rail reserves the platform safe-area inset');
check(/<GlobalPreferenceControls\/>/.test(read('components/warsha/ConfigurationError.tsx')), 'the pre-router configuration error keeps both global preferences available');
check(/direction: isRTL \? 'rtl' : 'ltr'/.test(root), 'root layout direction follows the active language');
check(/GlobalPreferenceControls embedded/.test(read('components/warsha/Header.tsx')), 'customer home owns a non-overlapping shared preference slot');
// The mobile admin shell is gone: operational administration is web-only.
// What mattered here — that a surface owning its own preference slot does not
// double-render the global one — still holds for the two shells that remain.
check(!existsSync('components/warsha/AdminShell.tsx'),
  'THERE IS NO MOBILE ADMIN SHELL; ADMINISTRATION IS WEB-ONLY');
check(/GlobalPreferenceControls embedded/.test(read('app/worker/index.tsx')), 'worker home owns a non-overlapping shared preference slot');

const expo = JSON.parse(read('app.json')).expo;
equal(expo.userInterfaceStyle, 'automatic', 'native appearance follows the platform by default');
equal(expo.locales.ar, './locales/ar.json', 'Arabic native metadata is configured');
equal(expo.locales.en, './locales/en.json', 'English native metadata is configured');
equal(expo.ios.infoPlist.CFBundleAllowMixedLocalizations, true, 'iOS localized metadata is enabled');
for (const variant of ['light', 'dark', 'tinted']) {
  check(expo.ios.icon[variant].includes('warsha-current-approved-icon.png'), `iOS ${variant} icon keeps the approved asset`);
}
check(expo.android.adaptiveIcon.monochromeImage.includes('warsha-current-approved-monochrome.png'), 'Android themed icon uses the approved monochrome asset');
equal(expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'expo-localization')?.[1]?.supportsRTL, true, 'native localization plugin enables RTL support');
const splash = expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'expo-splash-screen')?.[1];
equal(splash.backgroundColor, '#F4F2EE', 'light native splash uses the light canvas');
equal(splash.dark.backgroundColor, '#080808', 'dark native splash uses the dark canvas');
check(splash.image.includes('warsha-current-approved-icon.png'), 'native splash keeps the high-resolution approved icon');

const arLocale = JSON.parse(read('locales/ar.json'));
const enLocale = JSON.parse(read('locales/en.json'));
equal(arLocale.android.app_name, 'ورشة', 'Android Arabic launcher label is native');
equal(arLocale.ios.CFBundleDisplayName, 'ورشة', 'iOS Arabic launcher label is native');
equal(enLocale.android.app_name, 'Warsha', 'unsupported native locales fall back to the English app name');

const html = read('app/+html.tsx');
check(/navigator\.languages/.test(html), 'web first paint follows the browser locale');
check(/manifest\.ar\.webmanifest/.test(html), 'web first paint selects the Arabic manifest when appropriate');
check(/document\.title/.test(html), 'web title is localized before hydration');
equal(JSON.parse(read('public/manifest.ar.webmanifest')).dir, 'rtl', 'Arabic PWA metadata is RTL');
equal(JSON.parse(read('public/manifest.webmanifest')).dir, 'ltr', 'English PWA metadata is LTR');

const eas = JSON.parse(read('eas.json'));
equal(eas.build.development.environment, 'development', 'development builds consume the governed EAS development environment');
equal(eas.build.development.env.EXPO_PUBLIC_DATA_MODE, undefined, 'development builds no longer override hosted auth with Mock mode');
equal(eas.build.base.env.EXPO_PUBLIC_DATA_MODE, 'supabase', 'all product build profiles inherit Supabase auth');

console.log(`Cross-platform auth/preferences/config: ${checks} checks passed.`);
