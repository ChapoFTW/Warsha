import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  addressResolutionState,
  classifyBrowserLocationError,
  parsePlaceSuggestions,
  parseResolvedPlace,
  resolvedAddressFields,
  shouldRequestSuggestions,
  ADDRESS_QUERY_MINIMUM,
} from '../src/providers/location-address.ts';
import {
  matchEgyptArea,
  matchEgyptGovernorate,
  resolveEgyptLocation,
} from '../src/locations/egypt-location-matching.ts';
import { resolveLocationExperienceAvailability } from '../src/providers/location-experience-policy.ts';
import { appCopy as appCopyForAddresses } from '../web/lib/app-copy.ts';
import {
  googleMapsProvider,
  structuredAddressComponents,
} from '../supabase/functions/_shared/google-maps-provider.ts';

let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
}
function equal<T>(actual: T, expected: T, label: string) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}
const read = (path: string) => readFileSync(path, 'utf8');

const full = parseResolvedPlace({
  placeId: 'place-1',
  formattedAddress: '10 Tahrir Street',
  governorate: 'Cairo',
  district: 'Abdeen',
  latitude: 30.0444,
  longitude: 31.2357,
});
check(full !== null, 'a complete provider result is accepted');
equal(addressResolutionState(full), 'resolved', 'a complete address is resolved');
// The provider says "Abdeen"; the CAPMAS/OCHA dataset says "Abdin". Governorate
// and area are a controlled taxonomy on every surface, so what lands in them is
// the dataset's name -- the provider's spelling would match no option and leave
// the field looking answered while it was not.
equal(resolvedAddressFields(full!), {
  addressLine: '10 Tahrir Street', governorate: 'Cairo', district: 'Abdin',
}, 'structured provider fields map onto the canonical taxonomy, not through it');

const partial = parseResolvedPlace({
  placeId: '', formattedAddress: 'Unnamed road, Cairo', governorate: 'Cairo',
  district: null, latitude: 30.01, longitude: 31.2,
});
equal(addressResolutionState(partial), 'partial', 'missing locality is reported as partial');
equal(addressResolutionState(null), 'lookup_failed', 'missing reverse-geocode result is truthful');
equal(addressResolutionState(partial, 'formatted'), 'resolved',
  'worker matching can use a resolved label with its preselected work area');

const manuallyEdited = {
  label: 'Home', addressLine: 'Old', governorate: 'Old', district: 'Old',
  building: 'Building 7', floor: '3', apartment: '12', landmark: 'Pharmacy',
  ...resolvedAddressFields(full!),
};
equal(manuallyEdited.building, 'Building 7', 'provider fill preserves manually editable building data');
equal(manuallyEdited.floor, '3', 'provider fill preserves manually editable floor data');
equal(manuallyEdited.apartment, '12', 'provider fill preserves manually editable apartment data');

equal(classifyBrowserLocationError({ code: 1 }), 'permission_denied',
  'browser permission denial is distinct');
equal(classifyBrowserLocationError({ code: 2 }), 'unavailable',
  'browser location unavailability is distinct');
equal(classifyBrowserLocationError({ code: 3 }), 'timed_out',
  'browser location timeout is distinct');
equal(classifyBrowserLocationError(new Error('unsupported')), 'unsupported',
  'a browser without geolocation is distinct');

equal(parsePlaceSuggestions([
  { placeId: 'one', primary: 'Tahrir Square', secondary: 'Cairo' },
  { placeId: '', primary: 'invalid', secondary: '' },
]).length, 1, 'malformed autocomplete rows are discarded');

equal(structuredAddressComponents([
  { longText: 'Cairo Governorate', types: ['administrative_area_level_1'] },
  { longText: 'Abdeen', types: ['administrative_area_level_2'] },
]), { governorate: 'Cairo Governorate', district: 'Abdeen' },
'Places New address components map to governorate and area');
equal(structuredAddressComponents([
  { long_name: 'Giza Governorate', types: ['administrative_area_level_1'] },
  { long_name: 'Dokki', types: ['sublocality_level_1'] },
]), { governorate: 'Giza Governorate', district: 'Dokki' },
'Geocoding address components map to the same provider-neutral fields');

const originalFetch = globalThis.fetch;
const originalDeno = (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
let requestBody: Record<string, unknown> | null = null;
try {
  (globalThis as typeof globalThis & { Deno: unknown }).Deno = {
    env: { get: (name: string) => name === 'GOOGLE_MAPS_SERVER_KEY' ? 'deterministic-test-key' : undefined },
  };
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({
      suggestions: [{
        placePrediction: {
          placeId: 'place-1',
          structuredFormat: {
            mainText: { text: 'ميدان التحرير' },
            secondaryText: { text: 'القاهرة' },
          },
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const mocked = await googleMapsProvider.autocomplete('ميدان التحرير', 'session-token', 'ar');
  const capturedRequestBody = requestBody as Record<string, unknown> | null;
  equal(mocked.kind, 'ok', 'autocomplete succeeds against a deterministic provider mock');
  equal(capturedRequestBody?.languageCode, 'ar', 'Arabic UI requests Arabic provider results');
  check(capturedRequestBody?.sessionToken === 'session-token', 'the billing session token spans autocomplete');
} finally {
  globalThis.fetch = originalFetch;
  if (originalDeno === undefined) delete (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
  else (globalThis as typeof globalThis & { Deno?: unknown }).Deno = originalDeno;
}

const capabilityOn = {
  mapsAvailable: true, searchAvailable: true, manualPinAlwaysAvailable: true as const,
  pinRequiredBeforeBooking: true as const, mapRendererKey: 'google_native_sdk',
};
check(resolveLocationExperienceAvailability({
  dataMode: 'supabase', capability: capabilityOn,
  descriptor: {
    providerKey: 'provider', rendererKey: 'google_native_sdk',
    requiresPublishableRenderKey: true, attribution: 'Map data',
    defaultViewport: { latitude: 30, longitude: 31, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    serverCredentialAvailable: true,
  },
}).addressSearchAvailable, 'search is available only when registry and server credential agree');
check(!resolveLocationExperienceAvailability({
  dataMode: 'supabase', capability: capabilityOn,
  descriptor: {
    providerKey: 'provider', rendererKey: 'google_native_sdk',
    requiresPublishableRenderKey: true, attribution: 'Map data',
    defaultViewport: { latitude: 30, longitude: 31, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    serverCredentialAvailable: false,
  },
}).addressSearchAvailable, 'a missing server credential fails closed');

const webSearch = read('web/components/address-search.tsx');
for (const token of ['setTimeout', '350', 'role="combobox"', 'role="listbox"',
  "event.key === 'ArrowDown'", "event.key === 'ArrowUp'", "event.key === 'Enter'",
  "event.key === 'Escape'", "language === 'ar' ? 'rtl' : 'ltr'"]) {
  check(webSearch.includes(token), `web autocomplete includes ${token}`);
}
const webAddress = read('web/app/app/addresses/page.tsx');
check(/setCoordinate\(\{ \.\.\.position, source: 'device_location' \}\)/.test(webAddress)
  && /describeCoordinates\(position\.latitude, position\.longitude, locale\)/.test(webAddress),
  'current browser coordinates are preserved separately and reverse geocoded');
check(/resolvedAddressFields\(place\)/.test(webAddress),
  'customer web fills the shared structured address fields');
check(/saveInFlight\.current/.test(webAddress), 'customer web suppresses duplicate saves');
check(/aria-describedby/.test(webAddress) && /formOptional/.test(webAddress),
  'address helper text and optionality are persistently accessible');

const mobileAddress = read('app/onboarding/address.tsx');
check(/resolutionRequirement="structured"/.test(mobileAddress)
  && /setGovernorate\(fields\.governorate\)/.test(mobileAddress)
  && /setDistrict\(fields\.district\)/.test(mobileAddress),
  'Android and iOS customer onboarding fill provider-derived structured fields');
const picker = read('components/warsha/AddressLocationPicker.tsx');
check(!/value \? copy\.locationSaved/.test(picker)
  && /resolution === 'resolved'/.test(picker),
  'mobile never calls coordinates alone a resolved address');

const webLocation = read('web/lib/location.ts');
check(/operation: 'render_descriptor'/.test(webLocation)
  && /serverCredentialAvailable/.test(webLocation),
  'web availability checks both governed capability and Edge credential presence');
check(!/GOOGLE_MAPS_SERVER_KEY|service.role/i.test(webLocation + webSearch),
  'no server credential or service role reaches browser location code');

const addressMigration = read('supabase/migrations/202608080001_wps023_authentication_role_onboarding_worker_vetting.sql');
check(/where id = p_address_id and customer_id = v_user and deleted_at is null/.test(addressMigration),
  'pin confirmation remains owner-scoped and excludes deleted addresses');
check(/latitude = p_latitude[\s\S]*longitude = p_longitude[\s\S]*pin_confirmed_at/.test(addressMigration),
  'the authoritative confirmation RPC preserves exact coordinates and confirmation state');
const addressRls = read('supabase/migrations/202607200003_security_storage.sql');
check(/addresses_own_all[\s\S]*customer_id=\(select auth\.uid\(\)\)/.test(addressRls),
  'cross-account address access remains blocked by RLS');

// ---------------------------------------------------------------------------
// Selecting a suggestion must not search for what was just selected
// ---------------------------------------------------------------------------
//
// Picking a prediction fills the box with the chosen address. Searching keyed
// off the text alone, so that fill was indistinguishable from typing: the box
// re-searched the selected address and offered the same suggestion back. A
// debounce cannot fix it -- the request is not early, it is unwanted -- so the
// text carries where it came from and the origin decides.
const CTX = { available: true, disabled: false };
const CHOSEN = '15 Khaled Ibn Al Walid, Al Bitash Sharq, Dekheila, Alexandria Governorate';

check(shouldRequestSuggestions({ text: 'Khaled', origin: 'typed' }, CTX),
  'typing enough characters searches');
check(!shouldRequestSuggestions({ text: CHOSEN, origin: 'selected' }, CTX),
  'SELECTING A SUGGESTION DOES NOT SEARCH FOR THE ADDRESS IT JUST SELECTED');
check(shouldRequestSuggestions({ text: `${CHOSEN}, flat 4`, origin: 'typed' }, CTX),
  'AND EDITING IT AFTERWARDS RESUMES SEARCHING NORMALLY');
// The gate is the origin, not the length: the selected text is long, and a
// length rule would have let it straight through.
check(CHOSEN.trim().length > ADDRESS_QUERY_MINIMUM,
  'the selected address is long enough that only the origin can stop it');
check(!shouldRequestSuggestions({ text: 'Kh', origin: 'typed' }, CTX),
  'a query below the minimum does not spend a request');
check(!shouldRequestSuggestions({ text: 'Khaled', origin: 'typed' },
  { available: false, disabled: false }),
  'a disabled provider is never called');
check(!shouldRequestSuggestions({ text: 'Khaled', origin: 'typed' },
  { available: true, disabled: true }),
  'nor is a disabled form');

const searchSource = readFileSync('web/components/address-search.tsx', 'utf8');
check(/origin: 'selected'/.test(searchSource) && /origin: 'typed'/.test(searchSource),
  'the component stores the origin rather than inferring it');
check(/shouldRequestSuggestions\(query, \{ available, disabled \}\)/.test(searchSource),
  'and gates the request through the shared predicate, not a local copy');
check(/setQuery\(\{ text: place\.formattedAddress, origin: 'selected' \}\)/.test(searchSource),
  'CHOOSING A SUGGESTION MARKS THE TEXT AS SELECTED');
check(/onChange=\{\(event\) => setQuery\(\{ text: event\.target\.value, origin: 'typed' \}\)\}/
  .test(searchSource),
  'and the next keystroke marks it typed again');
check(/setSuggestions\(\[\]\)/.test(searchSource),
  'selection closes the suggestion list');
// The race the origin alone would not close.
check(/generation !== requestGeneration\.current/.test(searchSource),
  'a superseded response is discarded rather than applied late');
check(!/setTimeout\([^)]*\b(800|1000|1500|2000)\b/.test(searchSource),
  'NO TIMEOUT HACK STANDS IN FOR THE STATE MODEL');

// ---------------------------------------------------------------------------
// Google's administrative names mapped onto Warsha's canonical taxonomy
// ---------------------------------------------------------------------------
//
// The provider and the CAPMAS/OCHA dataset name the same places differently.
// Exact equality was the only matcher, so Governorate stayed on "Choose a
// governorate" and Area stayed disabled while the street line filled in
// perfectly -- which is what made it look arbitrary rather than broken.

// The address the defect was reported against.
{
  const resolved = resolveEgyptLocation({
    governorate: 'Alexandria Governorate', district: 'Dekheila',
  });
  equal(resolved.governorate?.option.id, 'EG02',
    'ALEXANDRIA GOVERNORATE RESOLVES TO THE CANONICAL ALEXANDRIA');
  equal(resolved.governorate?.option.en, 'Alexandria',
    'and stores the dataset name, not the provider one');
  equal(resolved.area?.option.en, 'Al Dikhila',
    'AND DEKHEILA RESOLVES TO AL DIKHILA DESPITE THE TRANSLITERATION');
}

// Representative Cairo and Giza.
equal(resolveEgyptLocation({ governorate: 'Cairo Governorate', district: 'Nasr City' })
  .area?.option.en, 'Nasr City', 'a Cairo address resolves both levels');
equal(resolveEgyptLocation({ governorate: 'Giza Governorate', district: 'Dokki' })
  .governorate?.option.id, 'EG21', 'a Giza address resolves its governorate');
equal(matchEgyptGovernorate('Giza Governorate')?.option.en, 'Giza',
  'and Giza is matched by name, suffix removed');

// Arabic, which the provider returns when the interface is Arabic.
equal(matchEgyptGovernorate('محافظة الإسكندرية')?.option.id, 'EG02',
  'THE ARABIC ADMINISTRATIVE NAME RESOLVES TOO');
equal(matchEgyptArea('EG02', 'الدخيلة')?.option.en, 'Al Dikhila',
  'including an Arabic area name against a dataset entry written "قسم الدخيلة"');

// Refusing to guess is the point.
equal(resolveEgyptLocation({ governorate: 'Atlantis Governorate', district: 'Nowhere' })
  .governorate, null, 'AN UNRECOGNISED GOVERNORATE IS NOT GUESSED AT');
equal(matchEgyptArea('EG02', 'Al Bitash'), null,
  'a neighbourhood that is not a dataset area is left for manual selection');
// "Agouza" and "Giza" reduce to the same consonants. Two candidates means the
// heuristic cannot tell them apart, and filing an address under the wrong
// district silently is worse than asking.
equal(matchEgyptArea('EG21', 'Agouza'), null,
  'AN AMBIGUOUS TRANSLITERATION RESOLVES TO NOTHING RATHER THAN A COIN FLIP');
equal(matchEgyptArea('EG02', ''), null, 'an empty value resolves to nothing');
equal(matchEgyptGovernorate(null), null, 'and so does a missing one');
equal(matchEgyptArea('EG99', 'Dekheila'), null,
  'an area is never matched against a governorate that does not exist');

// One pipeline, so the two entry points cannot diverge.
{
  const place = {
    placeId: 'x', formattedAddress: CHOSEN,
    governorate: 'Alexandria Governorate', district: 'Dekheila',
    latitude: 31.13, longitude: 29.77,
  };
  const fields = resolvedAddressFields(place);
  equal(fields.governorate, 'Alexandria',
    'the shared field resolver returns the canonical governorate');
  equal(fields.district, 'Al Dikhila', 'and the canonical area');
  equal(fields.addressLine, CHOSEN, 'and the formatted address unchanged');
  const unmappable = resolvedAddressFields({ ...place, governorate: 'Nowhere', district: 'Nowhere' });
  equal(unmappable.governorate, undefined,
    'AN UNMAPPABLE VALUE IS OMITTED, NEVER PASSED THROUGH RAW');
  equal(unmappable.district, undefined, 'and neither is its area');
  equal(unmappable.addressLine, CHOSEN, 'while the street line still populates');
}
const addressPage = readFileSync('web/app/app/addresses/page.tsx', 'utf8');
check((addressPage.match(/resolvedAddressFields\(/g) ?? []).length >= 2,
  'BOTH SELECTION AND CURRENT LOCATION GO THROUGH THE SAME RESOLVER');
const sharedResolver = readFileSync('src/providers/location-address.ts', 'utf8');
check(/resolveEgyptLocation\(/.test(sharedResolver),
  'and that resolver is where the canonical mapping happens, once');

// ---------------------------------------------------------------------------
// The form claims space by content, not in equal tracks
// ---------------------------------------------------------------------------
const surfaceCss = readFileSync('web/components/product-surface.module.css', 'utf8');
const formGrid = /\.formGrid \{[\s\S]*?\n\}/.exec(surfaceCss)?.[0] ?? '';
check(formGrid.length > 0, 'the address form grid is defined');
check(!/repeat\(auto-fit, minmax\(220px, 1fr\)\)/.test(formGrid),
  'EVERY FIELD NO LONGER GETS AN IDENTICAL TRACK');
check(/repeat\(12, minmax\(0, 1fr\)\)/.test(formGrid),
  'the grid has twelve columns for fields to claim space in');
check(/minmax\(0, 1fr\)/.test(formGrid),
  'tracks may shrink below their content, so a long value cannot widen the page');
check(/align-items: start/.test(formGrid),
  'a long help text does not stretch the controls beside it');
check(/\.formGrid > \* \{ min-width: 0; \}/.test(surfaceCss),
  'and no grid item can overflow horizontally');
for (const span of ['span12', 'span6', 'span5', 'span4', 'span3']) {
  check(new RegExp(`\\.${span} \\{ grid-column: span \\d+; \\}`).test(surfaceCss),
    `the ${span} width exists`);
}
check(/@media \(max-width: 1080px\)/.test(surfaceCss),
  'medium widths reduce the grid rather than reflowing field by field');
check(/@media \(max-width: 680px\)/.test(surfaceCss),
  'and narrow widths collapse to a single column');
{
  const narrow = surfaceCss.slice(surfaceCss.indexOf('@media (max-width: 680px)'));
  check(/grid-template-columns: minmax\(0, 1fr\)/.test(narrow),
    'MOBILE IS ONE FULL-WIDTH COLUMN');
  check(/\.span12, \.span6, \.span5, \.span4, \.span3 \{ grid-column: span 1; \}/.test(narrow),
    'and every field spans it');
}
// Physical directions would need a mirrored rule; grid follows the writing mode.
check(!/(^|[^-])\b(margin-left|margin-right|padding-left|padding-right|left|right):/
  .test(formGrid),
  'the grid is free of physical directions, so Arabic mirrors without a second rule');

// The address line is the longest value on the form and was the one truncated.
check(/\{field\('addressLine'[^)]*'span12'\)\}/.test(addressPage),
  'THE ADDRESS LINE TAKES THE FULL WIDTH');
check(/\{field\('floor'[^)]*'span3'\)\}/.test(addressPage)
  && /\{field\('apartment'[^)]*'span3'\)\}/.test(addressPage),
  'while floor and apartment take the narrow widths their content needs');
{
  const order = ['addressLine', 'governorateField', 'areaField', 'building',
    'floor', 'apartment', 'landmark', 'label', 'serviceNotes'];
  const positions = order.map((name) => addressPage.indexOf(name,
    addressPage.indexOf('className={styles.formGrid}')));
  check(positions.every((at, index) => index === 0 || at > positions[index - 1]),
    'the fields render in the intended order');
  check(positions[order.indexOf('label')] > positions[order.indexOf('addressLine')],
    'ADDRESS NAME COMES AFTER THE ADDRESS IT NAMES, NOT BEFORE IT');
}

// ---------------------------------------------------------------------------
// A control's size follows its function
// ---------------------------------------------------------------------------
//
// The web had 66 button-like rules using 41 combinations of type size, padding
// and height -- 11 font sizes, 28 paddings -- because every surface picked its
// own numbers. That is how a card's Edit button ended up the size of a landing
// page call to action, and how a role badge ended up the same shape as the Sign
// out button beside it. These assert the hierarchy, not pixel snapshots.
const globalsCss = readFileSync('web/app/globals.css', 'utf8');
for (const token of [
  '--control-h-lg', '--control-h-md', '--control-h-sm',
  '--control-font-lg', '--control-font-md', '--control-font-sm',
  '--control-pad-lg', '--control-pad-md', '--control-pad-sm',
  '--badge-font', '--badge-pad', '--badge-radius',
]) {
  check(new RegExp(`${token}:`).test(globalsCss), `${token} is defined once, centrally`);
}

// No button-like control may declare a raw height any more; that is the number
// that made them disagree. Checked per control class rather than per file: a
// page shell's 100dvh and a textarea's 96px are not controls.
{
  const CONTROLS: [string, string][] = [
    ['web/components/product-surface.module.css', 'action'],
    ['web/components/product-surface.module.css', 'secondary'],
    ['web/components/product-surface.module.css', 'danger'],
    ['web/components/product-surface.module.css', 'compactAction'],
    ['web/components/console-table.module.css', 'submit'],
    ['web/components/console-table.module.css', 'pagerButton'],
    ['web/components/governed-actions.module.css', 'submit'],
    ['web/components/governed-actions.module.css', 'cancel'],
    ['web/components/governed-actions.module.css', 'choice'],
    ['web/components/reauth-dialog.module.css', 'primary'],
    ['web/components/reauth-dialog.module.css', 'secondary'],
    ['web/components/staff-gate.module.css', 'refusalLink'],
    ['web/components/app-shell.module.css', 'signOut'],
    ['web/components/console-shell.module.css', 'signOut'],
    ['web/components/site-chrome.module.css', 'signIn'],
    ['web/components/site-chrome.module.css', 'cta'],
    ['web/components/auth-panel.module.css', 'submit'],
    ['web/components/staff-sign-in.module.css', 'submit'],
  ];
  for (const [sheet, name] of CONTROLS) {
    const css = readFileSync(sheet, 'utf8');
    const rule = new RegExp('\\.' + name + ' \\{[\\s\\S]*?\\n\\}').exec(css)?.[0] ?? '';
    check(rule.length > 0, `${name} is defined in ${sheet.split('/').pop()}`);
    check(/min-height: var\(--control-h-(lg|md|sm)\)/.test(rule),
      `${sheet.split('/').pop()} .${name} takes its height from the scale`);
    check(!/min-height:\s*\d+px/.test(rule),
      `and declares no hand-picked height`);
  }
}

// --- The standard action tier: one shape, three emphases -------------------
// Destructive was its own size -- 14px and 10px/16px against the secondary's
// 14.5px and 12px/20px -- which is why Edit and Delete never matched. Emphasis
// is colour and weight; the shape is shared.
{
  const rule = (name: string) =>
    new RegExp(`\\.${name} \\{[\\s\\S]*?\\n\\}`).exec(surfaceCss)?.[0] ?? '';
  const action = rule('action');
  const secondary = rule('secondary');
  const danger = rule('danger');
  for (const [name, css] of [['action', action], ['secondary', secondary],
    ['danger', danger]] as [string, string][]) {
    check(/font-size: var\(--control-font-md\)/.test(css),
      `${name} uses the standard action type size`);
    check(/padding: var\(--control-pad-md\)/.test(css),
      `${name} uses the standard action padding`);
    check(/min-height: var\(--control-h-md\)/.test(css),
      `${name} uses the standard action height`);
  }
  check(/background: var\(--brand\)/.test(action),
    'the primary action is the only one that fills');
  check(/color: var\(--text-secondary\)/.test(secondary)
    && /color: var\(--text-primary\)/.test(danger),
    'AND DESTRUCTIVE STILL READS DIFFERENTLY FROM SECONDARY, BY COLOUR NOT SIZE');
}

// --- Compact: an action inside a card is not a call to action --------------
{
  const compact = /\.compactAction \{[\s\S]*?\n\}/.exec(surfaceCss)?.[0] ?? '';
  check(compact.length > 0, 'the compact tier exists');
  check(/font-size: var\(--control-font-sm\)/.test(compact)
    && /padding: var\(--control-pad-sm\)/.test(compact)
    && /min-height: var\(--control-h-sm\)/.test(compact),
    'A CARD ACTION IS THE COMPACT SIZE, NOT THE STANDARD ONE');
  // Forcing two labels to a shared width pads them to fit each other rather
  // than their own text. They match because they share a size.
  check(!/min-width/.test(compact),
    'AND CARRIES NO ARBITRARY WIDTH FLOOR');
  check(!/(background|border-color)\s*:/.test(compact),
    'the compact tier sets no colour, so emphasis survives it');
  check(/@media \(max-width: 420px\)[\s\S]{0,120}\.compactAction \{[^}]*flex: 1 1 auto/
    .test(surfaceCss),
    'on a narrow row compact actions may grow rather than sit tiny');
}
{
  const cardActions = addressPage.slice(addressPage.indexOf('styles.rowMeta'));
  check(/\$\{styles\.secondary\} \$\{styles\.compactAction\}/.test(cardActions)
    && /\$\{styles\.danger\} \$\{styles\.compactAction\}/.test(cardActions),
    'Edit and Delete are compact card actions');
  check((cardActions.match(/styles\.compactAction/g) ?? []).length >= 3,
    'and Make default, in the same row, is the same kind of thing');
  check(!/peerAction/.test(addressPage) && !/peerAction/.test(surfaceCss),
    'the oversized peer treatment is gone, not merely unused');
}

// --- A badge is not a size of button ---------------------------------------
// The role marker carried the same square radius and bordered box as the Sign
// out beside it, so CUSTOMER read as a second control rather than a statement.
{
  const shell = readFileSync('web/components/app-shell.module.css', 'utf8');
  const badge = /\.modeBadge \{[\s\S]*?\n\}/.exec(shell)?.[0] ?? '';
  check(/border-radius: var\(--badge-radius\)/.test(badge),
    'THE ROLE BADGE IS A PILL, SO IT CANNOT BE MISTAKEN FOR A BUTTON');
  check(/font-size: var\(--badge-font\)/.test(badge) && /padding: var\(--badge-pad\)/.test(badge),
    'at the badge size every other status marker uses');
  check(!/min-height/.test(badge),
    'and claims no control height, because it is not a control');
  const signOut = /\.signOut \{[\s\S]*?\n\}/.exec(shell)?.[0] ?? '';
  check(/min-height: var\(--control-h-sm\)/.test(signOut),
    'while Sign out beside it is a header action with a declared height');
}
// Status markers everywhere are pills, not squares.
for (const [sheet, name] of [
  ['web/components/product-surface.module.css', 'badge'],
  ['web/app/admin/page.module.css', 'chip'],
  ['web/app/admin/page.module.css', 'chipQuiet'],
  ['web/components/console-table.module.css', 'chip'],
] as [string, string][]) {
  const css = readFileSync(sheet, 'utf8');
  const rule = new RegExp(`\\.${name} \\{[\\s\\S]*?\\n\\}`).exec(css)?.[0] ?? '';
  check(rule.length > 0, `${name} is defined in ${sheet.split('/').pop()}`);
  check(/border-radius: (var\(--badge-radius\)|999px)/.test(rule),
    `${name} is a pill, not a square that looks pressable`);
}

// --- Unrelated controls were not swept up ----------------------------------
// The landing page's calls to action are deliberately the largest thing on the
// page and are consistent with each other; they are not the standard tier.
{
  const landing = readFileSync('web/app/[locale]/page.module.css', 'utf8');
  const primary = /\.primaryCta \{[\s\S]*?\n\}/.exec(landing)?.[0] ?? '';
  const secondary = /\.secondaryCta \{[\s\S]*?\n\}/.exec(landing)?.[0] ?? '';
  check(/font-size: 16px/.test(primary) && /font-size: 16px/.test(secondary),
    'THE LANDING CALLS TO ACTION WERE LEFT AS THEIR OWN DELIBERATE TIER');
  check(/padding: 14px 28px/.test(primary) && /padding: 14px 28px/.test(secondary),
    'and still agree with each other');
}
// A form field is not a button. Fields and buttons share a HEIGHT on purpose --
// a select beside a button should align -- and a sweep keyed on that height
// once pulled input typography into the control scale with it. They keep their
// own type size.
{
  const consoleCss = readFileSync('web/components/console-table.module.css', 'utf8');
  check(/\.input \{[\s\S]*?font-size: 15px/.test(consoleCss),
    'FORM FIELDS KEEP THEIR OWN TYPE SIZE, NOT THE BUTTON SCALE (console input)');
  check(/\.select \{[\s\S]*?font-size: 14\.5px/.test(consoleCss),
    'and a select keeps the size it had (console select)');
  check(/\.input, \.select, \.textarea \{[\s\S]*?font-size: 15px/.test(surfaceCss),
    'and so do the product surfaces');
}

// Navigation is text, not a control, and keeps its own type.
{
  const chrome = readFileSync('web/components/site-chrome.module.css', 'utf8');
  const navLink = /\.navLink \{[\s\S]*?\n\}/.exec(chrome)?.[0] ?? '';
  check(/font-size: 14px/.test(navLink) && !/min-height/.test(navLink),
    'primary navigation was not turned into a row of buttons');
}

console.log(`Address/location regressions: ${checks} checks passed.`);