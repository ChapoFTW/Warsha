/**
 * WPS-020 — Search, Discovery, Personalization & Appearance.
 *
 * Contract checks over the appearance system, the discovery client, the Mock
 * parity layer, the migration, and every surface. Database behaviour is
 * asserted by `supabase/tests/database/search-discovery-appearance.test.sql`;
 * this file asserts what the client guarantees.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { darkColors, lightColors, platformCanvas, type ThemeColors } from '../constants/appearance.ts';
import {
  appearancePreferences,
  appearanceStorageKey,
  isAppearancePreference,
  precedence,
  resolveAppearance,
  resolvedAppearances,
  statusBarStyle,
} from '../src/appearance/appearance-types.ts';
import { discoveryCopy } from '../src/discovery/discovery-copy.ts';
import {
  activeFilterCount,
  activeFilterKeys,
  availableSorts,
  discoveryMaxPageSize,
  discoveryPageSize,
  discoveryQueryMaxLength,
  discoverySearchModes,
  discoverySorts,
  emptyDiscoveryFilters,
  hasLocation,
  normalizeDiscoveryQuery,
  recentSearchLimit,
  recentlyViewedLimit,
  removeFilter,
} from '../src/discovery/discovery-types.ts';
import {
  mockClearRecentlyViewed,
  mockClearSearches,
  mockFilterMetadata,
  mockHome,
  mockRecentlyViewed,
  mockRecordSearch,
  mockRecordView,
  mockSearch,
  mockSuggestions,
  resetMockDiscovery,
} from '../src/discovery/mock-discovery-state.ts';
import { providers as mockProviders } from '../src/data/mock-data.ts';

let checks = 0;
function check(condition: boolean, label: string) {
  checks += 1;
  assert.ok(condition, label);
}
function is<T>(actual: T, expected: T, label: string) {
  checks += 1;
  assert.equal(actual, expected, label);
}
function has(haystack: string, pattern: RegExp, label: string) {
  checks += 1;
  assert.match(haystack, pattern, label);
}
function lacks(haystack: string, pattern: RegExp, label: string) {
  checks += 1;
  assert.doesNotMatch(haystack, pattern, label);
}

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/**
 * Source with comments removed.
 *
 * Every "this must NOT appear" assertion runs against this rather than the raw
 * file, so a comment explaining why something is absent cannot itself fail the
 * check that it is absent.
 */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The same idea for SQL, whose comments start with a double dash. */
const sqlCodeOf = (source: string) => source.replace(/^\s*--.*$/gm, '');

const appearanceSource = read('constants/appearance.ts');
const themeSource = read('constants/theme.ts');
const contextSource = read('src/appearance/appearance-context.tsx');
const storageSource = read('src/appearance/appearance-storage.ts');
const storageWebSource = read('src/appearance/appearance-storage.web.ts');
const repositorySource = read('src/appearance/appearance-repository.ts');
const rootLayout = read('app/_layout.tsx');
const htmlShell = read('app/+html.tsx');
const appConfig = JSON.parse(read('app.json')) as { expo: Record<string, unknown> };
const migration = read('supabase/migrations/202608050001_wps020_search_discovery_personalization_appearance.sql');
const pgTap = read('supabase/tests/database/search-discovery-appearance.test.sql');
const discoveryTypes = read('src/discovery/discovery-types.ts');
const discoveryRepository = read('src/discovery/discovery-repository.ts');
const discoveryContext = read('src/discovery/discovery-context.tsx');
const mockState = read('src/discovery/mock-discovery-state.ts');
const searchScreen = read('app/search.tsx');
const appearanceScreen = read('app/appearance.tsx');
const recentlyViewedScreen = read('app/recently-viewed.tsx');
const homeScreen = read('app/(tabs)/index.tsx');
const profileScreen = read('app/(tabs)/profile.tsx');
const resultCard = read('components/warsha/DiscoveryResultCard.tsx');
const brandMark = read('components/warsha/BrandMark.tsx');
const auditScript = read('scripts/audit-appearance.mjs');
const wpsDocument = read('docs/wps/WPS-020-search-discovery-personalization-appearance.md');
const wesDocument = read('docs/wes/WES-020-search-discovery-personalization-appearance.md');
const manualPlan = read('docs/testing/WPS-020-MANUAL-ALPHA.md');
const manualResults = read('docs/testing/WPS-020-MANUAL-RESULTS.md');
const appearanceDoc = read('docs/brand/WARSHA-APPEARANCE-SYSTEM.md');
const storageDecision = read('docs/decisions/appearance-preference-storage.md');
const accessibilityReview = read('docs/testing/WPS-020-ACCESSIBILITY-REVIEW.md');
const architectureAudit = read('docs/architecture/search-discovery-architecture.md');

// ---------------------------------------------------------------------------
// Appearance: three preferences, resolved deterministically
// ---------------------------------------------------------------------------
is(appearancePreferences.length, 3, 'exactly three appearance preferences exist');
check(appearancePreferences.includes('system'), 'system is a preference');
check(appearancePreferences.includes('light'), 'light is a preference');
check(appearancePreferences.includes('dark'), 'dark is a preference');
is(resolvedAppearances.length, 2, 'only two appearances are ever painted');
check(!(resolvedAppearances as readonly string[]).includes('system'),
  'system is never a resolved appearance');

is(resolveAppearance('dark', 'light'), 'dark', 'an explicit dark choice ignores a light device');
is(resolveAppearance('light', 'dark'), 'light', 'an explicit light choice ignores a dark device');
is(resolveAppearance('system', 'light'), 'light', 'system follows a light device');
is(resolveAppearance('system', 'dark'), 'dark', 'system follows a dark device');
is(resolveAppearance('system', null), 'dark',
  'an unknown device scheme resolves to Warsha established dark appearance');
is(resolveAppearance('system', undefined), 'dark', 'an absent device scheme resolves to dark');

check(isAppearancePreference('system'), 'system validates');
check(!isAppearancePreference('auto'), 'an unknown value is rejected');
check(!isAppearancePreference(null), 'null is rejected');
check(!isAppearancePreference(undefined), 'undefined is rejected');

is(statusBarStyle('dark'), 'light', 'a dark appearance uses light status-bar content');
is(statusBarStyle('light'), 'dark', 'a light appearance uses dark status-bar content');

// Precedence is deterministic and documented.
is(precedence({ localPreference: 'light', localIsExplicit: true, serverPreference: 'dark' }).preference,
  'light', 'an explicit local choice wins over the server');
is(precedence({ localPreference: 'light', localIsExplicit: true, serverPreference: 'dark' }).pushToServer,
  true, 'a local choice that differs is pushed to the server');
is(precedence({ localPreference: 'light', localIsExplicit: true, serverPreference: 'light' }).pushToServer,
  false, 'a local choice that already matches is not re-pushed');
is(precedence({ localPreference: 'system', localIsExplicit: false, serverPreference: 'dark' }).preference,
  'dark', 'a fresh install adopts the account preference');
is(precedence({ localPreference: null, localIsExplicit: false, serverPreference: null }).preference,
  'system', 'with nothing stored anywhere, the default is system');
is(precedence({ localPreference: 'dark', localIsExplicit: false, serverPreference: null }).preference,
  'dark', 'a non-explicit local value is kept when the account has none');
is(precedence({ localPreference: 'dark', localIsExplicit: false, serverPreference: null }).pushToServer,
  true, 'that value is then saved to the account');

// ---------------------------------------------------------------------------
// Semantic tokens
// ---------------------------------------------------------------------------
const roles = Object.keys(darkColors) as (keyof ThemeColors)[];
check(roles.length >= 60, 'the semantic role set is comprehensive');
for (const role of roles) {
  check(typeof lightColors[role] === 'string' && lightColors[role].length > 0,
    `light defines the ${role} role`);
}
for (const role of Object.keys(lightColors) as (keyof ThemeColors)[]) {
  check(typeof darkColors[role] === 'string', `dark defines the ${role} role`);
}

// Every family the specification names is present.
for (const role of [
  'canvas', 'canvasElevated', 'surface', 'surfaceElevated', 'surfacePressed', 'surfaceSelected', 'overlay', 'scrim',
  'textPrimary', 'textSecondary', 'textMuted', 'textInverse', 'textDisabled', 'textLink',
  'borderSubtle', 'borderDefault', 'borderStrong', 'borderFocus',
  'actionPrimaryBackground', 'actionPrimaryText', 'actionSecondaryBackground', 'actionSecondaryText',
  'actionDangerBackground', 'actionDangerText', 'actionDisabledBackground', 'actionDisabledText',
  'successBackground', 'successText', 'warningBackground', 'warningText',
  'errorBackground', 'errorText', 'informationBackground', 'informationText',
  'brandPrimary', 'brandOnPrimary', 'brandMark', 'brandWordmark',
  'inputBackground', 'inputBorder', 'inputText', 'inputPlaceholder', 'inputFocus', 'inputError',
  'navigationBackground', 'navigationBorder', 'navigationActive', 'navigationInactive',
  'cardBackground', 'cardBorder', 'cardShadow', 'cardPressed',
  'skeletonBase', 'skeletonHighlight', 'loadingMark',
] as const) {
  check(role in darkColors, `the ${role} role exists`);
}

// The dark theme is preserved value for value, not redesigned.
is(darkColors.canvas, '#080808', 'the dark canvas is the locked Warsha near-black');
is(darkColors.surface, '#141414', 'the dark surface is unchanged');
is(darkColors.surfaceElevated, '#191919', 'the dark elevated surface is unchanged');
is(darkColors.textPrimary, '#FAFAFA', 'the dark primary text is unchanged');
is(darkColors.textSecondary, '#B8B8B8', 'the dark secondary text is unchanged');
is(darkColors.textMuted, '#6E6E6E', 'the dark muted text is unchanged');
is(darkColors.successText, '#2FBF71', 'the brand green is unchanged in dark');
is(darkColors.warningText, '#E8A13A', 'the warning amber is unchanged in dark');
is(darkColors.errorText, '#F06455', 'the error red is unchanged in dark');
is(darkColors.borderDefault, 'rgba(250,250,250,0.14)', 'the dark default border is unchanged');
is(darkColors.background, darkColors.canvas, 'the legacy background alias still resolves to the canvas');
is(darkColors.white, darkColors.actionPrimaryBackground,
  'the legacy white alias resolves to the primary action, which is what it always meant');

// Light is designed, not inverted.
check(lightColors.canvas !== '#FFFFFF', 'the light canvas is a warm off-white, not harsh pure white');
check(lightColors.surface === '#FFFFFF', 'light cards are white so elevation still rises toward the light');
check(lightColors.canvas !== darkColors.canvas, 'the canvas differs between themes');
check(lightColors.textPrimary !== '#000000', 'light primary text is near-black, not pure black');
is(lightColors.white, lightColors.actionPrimaryBackground,
  'the legacy white alias resolves to near-black in light, which is what makes buttons survive');
check(lightColors.actionPrimaryBackground !== lightColors.actionPrimaryText,
  'a light primary button is not invisible');
check(lightColors.successText !== darkColors.successText,
  'status text darkens in light rather than keeping an unreadable brand green');
is(lightColors.brandPrimary, darkColors.brandPrimary,
  'the brand green itself is the same colour on any ground');
is(lightColors.brandMark, lightColors.textPrimary, 'the light-theme mark is dark ink');
is(darkColors.brandMark, darkColors.textPrimary, 'the dark-theme mark is light ink');

// The scrim over photography stays dark in both, because a photo has no theme.
check(lightColors.imageScrim.startsWith('rgba(24,22,19'),
  'the light image scrim is still a darkening, because it sits over a photograph');

is(platformCanvas.dark, darkColors.canvas, 'the platform canvas matches the dark theme');
is(platformCanvas.light, lightColors.canvas, 'the platform canvas matches the light theme');

// No inversion filter anywhere. A browser-style inversion would be a CSS filter
// or a React Native `filter` prop — not the word "inverted" in a comment
// explaining why the light theme deliberately is not one.
lacks(codeOf(appearanceSource), /filter:\s*\[?['"`]?invert/i, 'the theme applies no inversion filter');
lacks(codeOf(rootLayout), /filter:\s*\[?['"`]?invert/i, 'the root layout applies no inversion filter');
lacks(codeOf(rootLayout), /invert\(/i, 'the root layout uses no CSS invert function');

// ---------------------------------------------------------------------------
// Startup: no flash
// ---------------------------------------------------------------------------
has(contextSource, /useState\(\(\) => \{\s*const stored = readLocalAppearance\(\)/,
  'the local preference is read synchronously in the state initializer');
has(storageSource, /getItemSync/, 'the native store reads synchronously');
has(storageWebSource, /localStorage\.getItem/, 'the web store reads synchronously');
lacks(codeOf(storageSource), /await |\.then\(/, 'the native read has no asynchronous step before the first frame');
has(htmlShell, /dangerouslySetInnerHTML/, 'the web shell paints before hydration');
// The shell interpolates the shared constant rather than repeating the string,
// which is what makes it impossible for the two to drift apart.
has(htmlShell, /localStorage\.getItem\(\$\{JSON\.stringify\(appearanceStorageKey\)\}\)/,
  'the web shell reads the same key constant the app writes');
has(htmlShell, /from '@\/src\/appearance\/appearance-types'/,
  'the web shell imports that constant rather than hardcoding it');
is(appearanceStorageKey, 'warsha:appearance:v1', 'the local key is stable');
has(htmlShell, /prefers-color-scheme/, 'the web shell honours the browser preference');
has(rootLayout, /statusBarStyle\(scheme\)/, 'the status bar follows the resolved appearance');
has(rootLayout, /SystemUI\.setBackgroundColorAsync/, 'the Android root view follows the appearance');
has(rootLayout, /document\.documentElement\.style\.colorScheme/,
  'the web document colour scheme follows the appearance');
has(rootLayout, /meta\[name="theme-color"\]/, 'the browser theme colour follows the appearance');

// A theme change must not remount the tree.
lacks(codeOf(rootLayout), /key=\{scheme\}|key=\{colors/, 'the root is not keyed on the theme, so nothing remounts');
has(contextSource, /useMemo\(\(\) => factory\(colors\), \[colors, factory\]\)/,
  'stylesheets are rebuilt on a theme change rather than components being recreated');

// The OS must be allowed to report both appearances.
is(appConfig.expo.userInterfaceStyle, 'automatic',
  'the app no longer forces the operating system to report dark');

// ---------------------------------------------------------------------------
// Appearance persistence and isolation
// ---------------------------------------------------------------------------
has(contextSource, /precedence\(\{/, 'the documented precedence rule is applied on an account transition');
has(contextSource, /accountRef\.current\.key !== target/,
  'a response for a previous account is discarded');
has(contextSource, /AppearanceAccountSync/, 'the account link is pushed up rather than pulled down');
has(repositorySource, /environment\.dataMode === 'mock'/, 'the repository branches on the data mode');
is((repositorySource.match(/dataMode === 'mock'/g) ?? []).length, 2,
  'both repository methods have an explicit Mock branch');
has(repositorySource, /Mock mode has no server preference at all/,
  'the Mock behaviour is explained rather than left as a silent stub');
lacks(codeOf(repositorySource), /localStorage|kv-store/, 'the repository never writes the local store on a server failure');
has(contextSource, /setLocal\(\{ preference: next, explicit: true \}\);\s*\n\s*writeLocalAppearance/,
  'a choice is written locally before any network call');

// ---------------------------------------------------------------------------
// Appearance settings screen
// ---------------------------------------------------------------------------
has(appearanceScreen, /accessibilityRole="radiogroup"/, 'the control is a radio group');
has(appearanceScreen, /accessibilityRole="radio"/, 'each option is a radio');
has(appearanceScreen, /accessibilityState=\{\{ selected, checked: selected \}\}/,
  'the selected state is exposed to a screen reader');
has(appearanceScreen, /accessibilityHint=/, 'each option explains itself');
has(appearanceScreen, /accessibilityLiveRegion="polite"/,
  'the resolved appearance is announced when it changes');
has(appearanceScreen, /radio-button-checked/, 'selection carries a shape, not only a colour');
lacks(codeOf(appearanceScreen), /Save|save\(/, 'there is no Save button; the choice is the preview');
lacks(codeOf(appearanceScreen), /reload|restart/i, 'no restart is required');
has(profileScreen, /router\.push\('\/appearance'\)/, 'appearance is reachable from the profile');
has(profileScreen, /router\.push\('\/recently-viewed'\)/, 'history is reachable from the profile');
has(rootLayout, /Stack\.Screen name="appearance"/, 'the appearance route is registered');
has(rootLayout, /Stack\.Screen name="recently-viewed"/, 'the history route is registered');

// The three labels, in both languages, exactly as specified.
is(discoveryCopy.en.appearanceSystem, 'System', 'the English system label is exact');
is(discoveryCopy.en.appearanceLight, 'Light', 'the English light label is exact');
is(discoveryCopy.en.appearanceDark, 'Dark', 'the English dark label is exact');
is(discoveryCopy.ar.appearanceSystem, 'حسب الجهاز', 'the Arabic system label is exact');
is(discoveryCopy.ar.appearanceLight, 'فاتح', 'the Arabic light label is exact');
is(discoveryCopy.ar.appearanceDark, 'داكن', 'the Arabic dark label is exact');

// ---------------------------------------------------------------------------
// The colour boundary holds
// ---------------------------------------------------------------------------
has(auditScript, /STATIC_PALETTE_ALLOWED/, 'the audit names the files allowed to import the static palette');
has(auditScript, /COLOUR_LITERAL/, 'the audit forbids colour literals outside the theme');
has(auditScript, /is missing the "\$\{token\}" role|missing the/, 'the audit checks token completeness');
has(themeSource, /Product components must not import it/,
  'the static palette export states its boundary in the file itself');
for (const source of [searchScreen, appearanceScreen, recentlyViewedScreen, homeScreen, resultCard]) {
  lacks(codeOf(source), /#[0-9a-fA-F]{6}\b/, 'a WPS-020 surface holds no hex literal');
  lacks(codeOf(source), /\brgba?\(/, 'a WPS-020 surface holds no rgba literal');
  has(source, /useThemedStyles|useThemeColors/, 'a WPS-020 surface reads the runtime palette');
}

// The brand mark follows the surface it sits on, and its geometry is untouched.
has(brandMark, /variant === 'light' \? colors\.brandMark : colors\.actionPrimaryText/,
  'the mark ink is theme-derived');
has(brandMark, /d="M2 13\.2 L8\.4 23\.2 L14 14\.8 L19\.6 21\.2 L30 9\.2"/,
  'the logo path is byte-identical: WPS-020 changes ink, never geometry');
has(brandMark, /viewBox="0 0 32 32"/, 'the logo viewBox is unchanged');
lacks(codeOf(brandMark), /scaleX\(-1\)|transform: \[\{ scaleX/, 'the logo is never mirrored for RTL');
lacks(codeOf(read('components/warsha/BrandLogo.tsx')), /scaleX/, 'the logo wrapper never mirrors either');

// The approved motto is untouched.
const translations = read('src/i18n/translations.ts');
has(translations, /brandMotto: 'YOUR WORK, OUR MISSION'/, 'the English motto is exact');
has(translations, /brandMotto: 'شغلك مهمتنا'/, 'the Arabic motto is exact');
lacks(JSON.stringify(discoveryCopy), /OUR MISSION|شغلك مهمتنا/,
  'the WPS-020 vocabulary does not restate the motto');

// ---------------------------------------------------------------------------
// Discovery contracts
// ---------------------------------------------------------------------------
is(discoverySorts.length, 5, 'five sorts are offered');
check(!(discoverySorts as readonly string[]).includes('response_time'),
  'response time is not offered: there is no numeric response time to sort by');
has(discoveryTypes, /`response_time` is deliberately\s*\n \* absent/,
  'the omission of response time is explained in the contract, not left silent');
is(discoverySearchModes.length, 4, 'four search outcomes exist');
for (const mode of ['browse', 'exact', 'approximate', 'empty'] as const) {
  check((discoverySearchModes as readonly string[]).includes(mode), `${mode} is a search outcome`);
}
is(discoveryPageSize, 20, 'the page size is twenty');
is(discoveryMaxPageSize, 50, 'the maximum page size is fifty');
is(recentSearchLimit, 10, 'recent searches are bounded at ten');
is(recentlyViewedLimit, 20, 'recently viewed is bounded at twenty');
is(discoveryQueryMaxLength, 100, 'a query is bounded at one hundred characters');

is(normalizeDiscoveryQuery('  leaking   TAP  '), 'leaking TAP', 'a query is trimmed and collapsed');
is(normalizeDiscoveryQuery('x'.repeat(200)).length, 100, 'an over-long query is truncated');

is(activeFilterCount(emptyDiscoveryFilters), 0, 'no filters means no badge');
is(activeFilterCount({ availableNow: true, minimumRating: 4 }), 2, 'two filters count as two');
is(activeFilterCount({ availableNow: false }), 0, 'an unset toggle is not an active filter');
is(activeFilterCount({ minimumRating: 0 }), 0, 'a zero threshold is not an active filter');
is(activeFilterCount({ latitude: 30, longitude: 31 }), 0,
  'a granted location is context, not a filter the user set');
is(activeFilterKeys({ categoryId: 'plumbing', governorate: 'Cairo' }).length, 2,
  'each active filter is individually removable');
is(activeFilterCount(removeFilter({ categoryId: 'plumbing', availableNow: true }, 'categoryId')), 1,
  'removing one filter leaves the rest');

check(!hasLocation(emptyDiscoveryFilters), 'no location by default');
check(hasLocation({ latitude: 30, longitude: 31 }), 'a full coordinate pair counts as a location');
check(!hasLocation({ latitude: 30 }), 'half a coordinate is not a location');
check(!availableSorts(emptyDiscoveryFilters).includes('distance'),
  'distance sorting is not offered without a location');
check(availableSorts({ latitude: 30, longitude: 31 }).includes('distance'),
  'distance sorting appears once a location exists');
is(availableSorts(emptyDiscoveryFilters).length, 4, 'four sorts are offerable without a location');

// ---------------------------------------------------------------------------
// Mock parity
// ---------------------------------------------------------------------------
const repositoryMethods = [...discoveryRepository.matchAll(/^  async (\w+)\(/gm)].map(m => m[1]);
is(repositoryMethods.length, 9, 'the discovery repository exposes nine methods');
is((discoveryRepository.match(/environment\.dataMode === 'mock'/g) ?? []).length, repositoryMethods.length,
  'every repository method has an explicit Mock branch');
lacks(codeOf(mockState), /from '@\/src\/lib\/supabase'/, 'Mock imports no Supabase module');
lacks(codeOf(mockState), /getSupabaseClient|createClient/, 'Mock constructs no Supabase client');
lacks(codeOf(mockState), /\.rpc\(|\.from\(|fetch\(/, 'Mock performs no network call');
has(mockState, /reads the SAME mock catalog/, 'Mock reuses the shared catalog rather than a private dataset');

resetMockDiscovery();
const browse = mockSearch('', {}, 'recommended');
is(browse.mode, 'browse', 'Mock reports a browse for an empty query');
is(browse.totalCount, mockProviders.length, 'Mock browse returns the whole catalog');
is(mockSearch('zzzqqqnothingatall', {}, 'recommended').mode, 'empty',
  'Mock reports the same explicit empty state the server does');
check(['exact', 'approximate'].includes(mockSearch(mockProviders[0].name, {}, 'recommended').mode),
  'Mock finds a worker by name');
is(mockSearch('', {}, 'recommended', 2, 0).results.length, 2, 'Mock honours the page size');
is(mockSearch('', {}, 'recommended', 2, 0).hasMore, mockProviders.length > 2,
  'Mock reports whether more results exist');
check(mockSearch('', {}, 'recommended', 2, 0).results[0].id !== mockSearch('', {}, 'recommended', 2, 2).results[0].id,
  'Mock page two does not repeat page one');
is(mockSearch('', { availableNow: true }, 'recommended').results.every(r => r.isAvailable), true,
  'Mock applies the available-now filter');
is(mockSearch('', { emergencyAvailable: true }, 'recommended').results.every(r => r.emergencyAvailable), true,
  'Mock applies the emergency filter');
is(mockSearch('', {}, 'rating').results[0].ratingAverage >= mockSearch('', {}, 'rating').results.at(-1)!.ratingAverage,
  true, 'Mock sorts by rating');
is(mockSearch('', {}, 'recommended').rankingPolicyVersion, 'best-value-v1',
  'Mock reports the same ranking policy version as the server');
is(mockSearch('', {}, 'recommended').results.every(r => r.distanceKm === null), true,
  'Mock returns no distance when no location was given');
is(mockSearch('', { latitude: 30, longitude: 31 }, 'recommended').results.every(r => r.distanceKm !== null), true,
  'Mock returns a distance once a location is given');

// Mock account isolation.
mockRecordSearch('account-a', 'leaking tap');
mockRecordSearch('account-a', 'Leaking   Tap');
is(mockSuggestions('account-a').recentSearches.length, 1, 'Mock normalizes a repeat search');
is(mockSuggestions('account-b').recentSearches.length, 0, 'Mock isolates recent searches by account');
for (let index = 0; index < 15; index += 1) mockRecordSearch('account-a', `query ${index}`);
is(mockSuggestions('account-a').recentSearches.length, recentSearchLimit,
  'Mock bounds recent searches at the same limit the database enforces');
mockRecordView('account-a', mockProviders[0].id);
mockRecordView('account-a', mockProviders[0].id);
is(mockRecentlyViewed('account-a').length, 1, 'Mock records a repeat view once');
is(mockRecentlyViewed('account-b').length, 0, 'Mock isolates history by account');
is(mockRecentlyViewed(null).length, 0, 'Mock returns no history without an account');
mockRecordView('account-a', 'not-a-real-provider');
is(mockRecentlyViewed('account-a').length, 1, 'Mock never records an unknown worker');
mockClearSearches('account-a');
is(mockSuggestions('account-a').recentSearches.length, 0, 'Mock clears recent searches');
mockClearRecentlyViewed('account-a');
is(mockRecentlyViewed('account-a').length, 0, 'Mock clears history');

const home = mockHome(null, []);
is(home.personalized, false, 'the signed-out Mock home says it is not personalized');
is(home.favourites.length, 0, 'the signed-out Mock home carries no favourites');
is(mockHome('account-a', [mockProviders[0].id]).favourites.length, 1,
  'the signed-in Mock home reads the existing favourites store');
check(mockFilterMetadata().sorts.length === discoverySorts.length,
  'Mock offers exactly the sorts the contract defines');
is(mockFilterMetadata().distanceRequiresLocation, true,
  'Mock tells the client that distance needs a location, exactly as the server does');
check(mockSuggestions(null).commonServices.length > 0, 'Mock derives common services from the catalog');
resetMockDiscovery();

// ---------------------------------------------------------------------------
// Account isolation in the context
// ---------------------------------------------------------------------------
has(discoveryContext, /generation\.current \+= 1/, 'the discovery context guards against stale responses');
has(discoveryContext, /loadedAccount === accountKey/, 'nothing is rendered for a different account');
has(discoveryContext, /isCurrent \? recentlyViewed : \[\]/, 'history is hidden during an account transition');

// ---------------------------------------------------------------------------
// Search surface
// ---------------------------------------------------------------------------
has(searchScreen, /discoveryRepository\.search\(/, 'the screen asks the server for results');
lacks(codeOf(searchScreen), /\.filter\(\s*provider =>|results\.filter\(/,
  'the screen never filters an already-fetched page and calls it a result set');
has(searchScreen, /mode === 'approximate'/, 'an approximate result is labelled as approximate');
has(searchScreen, /mode === 'empty'/, 'an explicit empty state exists');
has(searchScreen, /searchLoading/, 'a loading state exists');
has(searchScreen, /searchRetry/, 'a retry exists');
has(searchScreen, /searchOffline/, 'an offline explanation exists');
has(searchScreen, /loadMore/, 'pagination exists');
has(searchScreen, /endOfResults/, 'the end of results is stated');
has(searchScreen, /resetFilters/, 'filters can be reset');
has(searchScreen, /removeFilter\(current, key\)/, 'a single filter can be removed');
has(searchScreen, /router\.setParams/, 'the query is reflected in the URL for web');
has(searchScreen, /offerableSorts/, 'only offerable sorts are rendered');
has(searchScreen, /metadata\.emergencyAvailable \?/,
  'the emergency filter appears only when the server says a worker offers it');
has(searchScreen, /Labelled "common", never "popular"/,
  'the suggestion label is explained in the code that renders it');
lacks(codeOf(searchScreen), /popular|Popular|trending|Trending/,
  'nothing on the search surface claims popularity or trending');
lacks(codeOf(searchScreen), /sponsored|promoted|Sponsored|Promoted|advert/i,
  'there is no sponsored or promoted placement');

// ---------------------------------------------------------------------------
// Results never communicate by colour alone
// ---------------------------------------------------------------------------
has(resultCard, /Every state carries an icon and a word, never a colour alone/,
  'the card states its accessibility rule');
has(resultCard, /provider\.isAvailable \? dt\.text\('availableNow'\) : dt\.text\('unavailableNow'\)/,
  'availability is announced in words');
has(resultCard, /accessibilityState=\{\{ selected: saved \}\}/, 'the favourite state is announced');
has(resultCard, /noReviewsYet/, 'no reviews is stated rather than shown as a zero');
has(resultCard, /radio-button-unchecked/, 'unavailability carries a distinct shape');
lacks(codeOf(resultCard), /opacity: 0\.[0-4]/, 'inactive content is not dimmed by default');

// ---------------------------------------------------------------------------
// Personalization and privacy boundaries
// ---------------------------------------------------------------------------
lacks(sqlCodeOf(migration), /openai|anthropic|gpt|embedding|vector_store|llm/i,
  'no AI or external inference is used anywhere in discovery');
lacks(codeOf(discoveryRepository), /algolia|elastic|typesense|meilisearch|openai/i,
  'no external search or personalization provider is selected');
lacks(sqlCodeOf(migration), /sponsored|promoted|bid_amount|ad_placement|paid_placement/i,
  'nothing in the migration can express paid placement');
has(migration, /Contains no advertising, no paid placement, no behavioural profiling/,
  'the migration states its boundaries');
has(migration, /Analytics carries the SHAPE of the search and never its text/,
  'search text is deliberately excluded from analytics');
has(migration, /'queryLength', pg_catalog\.length\(v_query\)/,
  'only the query length is recorded, never the query');
lacks(sqlCodeOf(migration), /'query', v_query.*record_operational_event/s,
  'the query text never reaches the operational log');
has(migration, /private\.record_operational_event/, 'analytics uses the WPS-018 authority');
lacks(sqlCodeOf(migration), /create table private\.discovery_events|create table public\.analytics/,
  'no second analytics pipeline is created');

// Ranking authority.
has(migration, /an APPLICATION of WPS-008's `best-value-v1`, not a new formula/,
  'the recommendation states its authority');
has(migration, /ranking_policy->>'fairnessBound'/, 'the fairness bound is read from the policy');
has(migration, /ranking_policy->>'newWorkerBound'/, 'the new-worker bound is read from the policy');
has(migration, /It writes no `private\.marketplace_candidate_scores` row/,
  'browsing is stated not to consume marketplace opportunity');
has(migration, /0\.45/, 'the published rating weight is applied verbatim');
has(migration, /0\.20/, 'the published experience weight is applied verbatim');
has(migration, /0\.27/, 'the published distance weight is applied verbatim');

// Location privacy.
has(migration, /Area LABEL only/, 'the projection returns an area label, never geometry');
has(migration, /'distanceKm', case when p_distance_km is null then null else pg_catalog\.round/,
  'distance is rounded before it leaves the database');
lacks(sqlCodeOf(migration), /'latitude', |'longitude', /,
  'no coordinate is ever placed in a public projection');
lacks(read('src/discovery/discovery-repository.ts'), /watchPosition|getCurrentPosition|background/i,
  'there is no continuous or background location collection');

// Discoverability is never restated.
is((migration.match(/private\.is_provider_publicly_discoverable/g) ?? []).length >= 8, true,
  'every read path calls the existing gate');
lacks(sqlCodeOf(migration), /create or replace function private\.is_provider_publicly_discoverable/,
  'WPS-020 does not redefine the discoverability gate');
lacks(sqlCodeOf(migration), /create or replace function public\.get_marketplace_catalog/,
  'WPS-020 does not rewrite the catalog read');
lacks(sqlCodeOf(migration), /create table.*favourite/i, 'WPS-020 creates no second favourites table');
lacks(sqlCodeOf(migration), /drop table|drop policy if exists (?!user_)/,
  'WPS-020 drops no pre-existing table, and only its own policies');

// ---------------------------------------------------------------------------
// Localization
// ---------------------------------------------------------------------------
const englishKeys = Object.keys(discoveryCopy.en).sort();
const arabicKeys = Object.keys(discoveryCopy.ar).sort();
is(arabicKeys.join('|'), englishKeys.join('|'), 'both languages expose an identical key set');
check(englishKeys.length >= 90, 'the vocabulary covers the whole surface');
for (const key of englishKeys) {
  const value = discoveryCopy.ar[key as keyof typeof discoveryCopy.ar];
  check(/[؀-ۿ]/.test(value), `the Arabic value for ${key} contains Arabic script`);
}
for (const key of englishKeys) {
  const value = discoveryCopy.en[key as keyof typeof discoveryCopy.en];
  check(value.trim().length > 0, `the English value for ${key} is not empty`);
  check(!/[؀-ۿ]/.test(value), `the English value for ${key} contains no Arabic script`);
}
for (const source of [searchScreen, appearanceScreen, recentlyViewedScreen, resultCard]) {
  has(source, /isRTL/, 'every WPS-020 surface handles RTL');
}
has(searchScreen, /textAlign: isRTL \? 'right' : 'left'/, 'the search field aligns for RTL');
has(searchScreen, /isRTL && styles\.reverse/, 'filter chips reverse for RTL');
has(appearanceScreen, /isRTL && styles\.reverse/, 'the appearance selector reverses for RTL');

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
has(wpsDocument, /^\| Version \| 1\.0 \|/m, 'WPS-020 is version 1.0');
has(wpsDocument, /LOCKED/, 'WPS-020 is locked');
has(wesDocument, /ENGINEERING BASELINE/, 'WES-020 is the engineering baseline');
has(wesDocument, /WPS-008/, 'WES-020 records the marketplace authority it defers to');
has(appearanceDoc, /YOUR WORK, OUR MISSION/, 'the appearance document records the approved motto');
has(storageDecision, /precedence/i, 'the storage decision documents precedence');
has(storageDecision, /Signing out/i, 'the storage decision documents sign-out behaviour');
has(accessibilityReview, /NOT RUN|not been executed/i,
  'the accessibility review states plainly that it has not been executed on a device');
has(architectureAudit, /What already exists/, 'the Phase 1 audit records what existed');
has(architectureAudit, /"Recommended" does not use the recommendation authority/,
  'the audit records the ranking-label defect it found');

// Manual cases start as NOT RUN. Every one of them.
const caseRows = manualResults.split('\n').filter(line => /^\| [A-Z]\d+ \|/.test(line));
check(caseRows.length >= 22, 'the visual matrix covers at least the required device and locale cases');
for (const row of caseRows) {
  check(/NOT RUN/.test(row), `manual case row is initialized as NOT RUN: ${row.slice(0, 24)}`);
}
// Scoped to case rows: the summary table legitimately contains the word PASS
// next to a count of zero.
lacks(caseRows.join('\n'), /\|\s*(PASS|PASSED|passed|FAIL|BLOCKED)\s*\|/,
  'no manual case is recorded with any executed outcome');
is(caseRows.filter(row => /NOT RUN/.test(row)).length, caseRows.length,
  'every manual case row is NOT RUN');
has(manualResults, /\| NOT RUN \| \d+ \|/, 'the summary counts every case as NOT RUN');
for (const label of ['iPhone dark', 'iPhone light', 'Android dark', 'Android light',
  'web dark', 'web light', 'Reduced Motion', 'screen reader', 'OLED', 'tablet']) {
  has(manualPlan, new RegExp(label.replace(/ /g, '\\s+'), 'i'), `the visual matrix includes ${label}`);
}

// The pgTAP suite covers the properties that fail silently.
has(pgTap, /a draft worker and an unverified worker are excluded/, 'hidden workers are asserted unreachable');
has(pgTap, /no combination of permissive filters reveals a hidden worker/, 'filters are asserted unable to widen the gate');
has(pgTap, /a second account does not see the first account history/, 'cross-account denial is asserted');
has(pgTap, /anonymous history reads are refused at the grant/, 'anonymous denial is asserted');
has(pgTap, /recent search history is bounded at ten by the database/, 'bounded history is asserted');
has(pgTap, /no result carries a coordinate, a contact, a document/, 'projection safety is asserted');
has(pgTap, /browsing writes no matching-run score/, 'ranking non-interference is asserted');
has(pgTap, /system is stored as system, never as the resolved scheme/, 'preference fidelity is asserted');
has(pgTap, /page two does not repeat page one/, 'stable pagination is asserted');

console.log(`WPS-020 search, discovery and appearance: ${checks} checks passed.`);
