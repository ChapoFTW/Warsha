import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  addressResolutionState,
  classifyBrowserLocationError,
  parsePlaceSuggestions,
  parseResolvedPlace,
  resolvedAddressFields,
} from '../src/providers/location-address.ts';
import { resolveLocationExperienceAvailability } from '../src/providers/location-experience-policy.ts';
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
equal(resolvedAddressFields(full!), {
  addressLine: '10 Tahrir Street', governorate: 'Cairo', district: 'Abdeen',
}, 'structured provider fields map to the existing address representation');

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

console.log(`Address/location regressions: ${checks} checks passed.`);
