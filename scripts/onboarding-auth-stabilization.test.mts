import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifyAuthFailure } from '../src/auth/auth-errors.ts';
import { isValidCustomerEmail } from '../src/auth/auth-identifier.ts';
import { classifyDeviceLocationError } from '../src/providers/device-location-policy.ts';
import { resolveLocationExperienceAvailability } from '../src/providers/location-experience-policy.ts';
import { isWorkerOnboardingContinuation } from '../src/navigation/worker-route-policy.ts';
import { listEgyptAreas, listEgyptGovernorates } from '../src/locations/egypt-locations.ts';
import { privacyCopy } from '../src/privacy/privacy-copy.ts';

const read = (path: string) => readFileSync(path, 'utf8');
let checks = 0;
const check = (condition: unknown, label: string) => {
  assert.ok(condition, label);
  checks += 1;
};
const equal = <T,>(actual: T, expected: T, label: string) => {
  assert.equal(actual, expected, label);
  checks += 1;
};

// Sign-in preserves the two credential authorities without asking anybody
// which one they are.
//
// The selector this used to assert has been removed. It cross-checked the
// typed identifier against a self-declared role, so a worker who left it on
// Customer and entered their phone number was told the credentials were
// invalid — they were not, the form was. The identifier's shape now selects
// the credential path, and the product role is resolved after authentication
// from server state.
const signIn = read('app/sign-in.tsx');
check(!signIn.includes('accessibilityRole="radiogroup"')
  && !signIn.includes("(['customer', 'worker'] as const)"),
  'SIGN-IN NO LONGER ASKS SOMEBODY TO DECLARE A ROLE BEFORE AUTHENTICATING');
check(signIn.includes("at('signInIdentity')"),
  'one identifier field serves both credential kinds');
check(signIn.includes('!classifySignInIdentity(identifier)'),
  'the only pre-flight check is whether the identifier is usable');
check(!signIn.includes("mode === 'customer'") && !signIn.includes("mode === 'worker'"),
  'no label, keyboard or validation branch depends on a declared role');
check(signIn.includes("at('signInIdentityHint')"),
  'one hint explains what to type, without naming an account type');
// Recovery is a capability of an email address, not of a role: a worker has no
// mailbox to recover to, so the affordance appears only for a customer email.
check(signIn.includes("classifySignInIdentity(identifier)?.kind === 'customer_email' ?"),
  'password recovery remains customer-email only');
check(signIn.includes("if (identity?.kind !== 'customer_email') return;"),
  'the recovery handler refuses anything that is not a customer email');

equal(isValidCustomerEmail('customer@example.com'), true, 'a normal customer email passes local validation');
equal(isValidCustomerEmail('not-an-email'), false, 'a malformed customer email fails before the network');
equal(classifyAuthFailure({ code: 'email_address_invalid', status: 400 }, 'sign-up'),
  'authInvalidEmail', 'Supabase invalid-email errors have safe actionable copy');
equal(classifyAuthFailure({ code: 'weak_password', status: 422 }, 'sign-up'),
  'authWeakPassword', 'Supabase weak-password errors have safe actionable copy');
equal(classifyAuthFailure({ code: 'user_already_exists', status: 400 }, 'sign-up'),
  'authSignupUnavailable', 'duplicate signup remains anti-enumeration safe');
equal(classifyAuthFailure({ code: 'unexpected_failure', status: 500 }, 'sign-up'),
  'authSignupServerError', 'server-side signup failures remain retryable and non-enumerating');

// The exact identity-loop regression: verification can satisfy onboarding,
// while jobs and requests remain blocked until capability is granted.
check(isWorkerOnboardingContinuation('/worker/verification'),
  'worker identity CTA may enter canonical verification during onboarding');
check(isWorkerOnboardingContinuation('/worker/verification?step=certificate'),
  'certificate deep links remain onboarding continuations');
check(!isWorkerOnboardingContinuation('/worker/jobs'),
  'incomplete workers cannot enter operational jobs');
const startupPolicy = read('src/navigation/startup-route-policy.ts');
check(startupPolicy.includes('!isWorkerOnboardingContinuation(input.pathname)'),
  'the central route gate applies the onboarding-continuation exception');

// Egypt administrative selection is dataset-backed and dependent.
const governorates = listEgyptGovernorates('en');
equal(governorates.length, 27, 'the canonical Egypt dataset has 27 governorates');
check(listEgyptAreas(governorates[0].id, 'en').length > 0,
  'district options are scoped to the selected governorate');
const selector = read('components/warsha/EgyptLocationSelector.tsx');
check(selector.includes("onChange({ governorate: option.en, district: '' })"),
  'changing governorate clears an incompatible district');
const address = read('app/onboarding/address.tsx');
const customerAddress = address.slice(address.indexOf('function CustomerDestinationAddressFlow'));
check(customerAddress.includes('<EgyptLocationSelector'),
  'customer profile onboarding renders the structured selector');
check(!customerAddress.includes("ot.text('addressNotes')")
  && customerAddress.includes("instructions: ''")
  && customerAddress.includes('serviceNotes: null'),
  'profile onboarding cannot render or persist job-specific worker notes');

// Foreground device coordinates stay independent of Maps and classify every
// actionable native state. A lower-accuracy retry exists for cold Android
// location providers, without background permission or a map-provider bypass.
equal(classifyDeviceLocationError({ message: 'Location request timed out' }).outcome,
  'timed_out', 'native timeout text maps to the actionable timeout state');
equal(classifyDeviceLocationError({ code: 'E_LOCATION_SETTINGS_UNSATISFIED' }).outcome,
  'services_disabled', 'unsatisfied Android device settings are distinct');
equal(classifyDeviceLocationError({ message: 'Permission denied' }).outcome,
  'permission_denied', 'permission denial is distinct');
equal(classifyDeviceLocationError({ code: 'E_LOCATION_UNAVAILABLE' }).outcome,
  'provider_unavailable', 'an unavailable OS location provider is distinct');
const providerClient = read('src/providers/provider-clients.ts');
check(providerClient.includes('Location.Accuracy.Balanced')
  && providerClient.includes('Location.Accuracy.Low'),
  'device location uses one bounded coarse fallback after a balanced request');
check(providerClient.includes('requestForegroundPermissionsAsync')
  && !providerClient.includes('requestBackgroundPermissionsAsync'),
  'device location requests foreground permission only');
const unavailable = resolveLocationExperienceAvailability({
  dataMode: 'supabase',
  capability: {
    mapsAvailable: false,
    searchAvailable: false,
    manualPinAlwaysAvailable: true,
    pinRequiredBeforeBooking: true,
    mapRendererKey: null,
  },
  descriptor: null,
});
check(unavailable.deviceLocationAvailable
  && !unavailable.interactiveMapAvailable
  && !unavailable.addressSearchAvailable,
  'device location stays enabled while governed Maps and Places remain off');
const picker = read('components/warsha/AddressLocationPicker.tsx');
check(picker.includes("{mapAvailable || environment.dataMode === 'mock' ? (")
  && picker.includes('{searchAvailable ? ('),
  'unavailable map/search actions are explained instead of shown as mysterious disabled controls');

// The privacy surface remains useful while separately governed destructive
// services are off.
const privacy = read('app/privacy.tsx');
check(!privacy.includes('if (ready && !overview.available)'),
  'privacy no longer collapses to the old placeholder');
for (const section of [
  'locationTitle', 'storedTitle', 'consentTitle', 'historyTitle', 'exportTitle',
  'deactivateTitle', 'deleteTitle', 'communicationsTitle', 'articlesTitle',
]) {
  check(privacy.includes(`pt.text('${section}')`), `privacy renders ${section}`);
}
check(privacy.includes('overview.exportAvailable')
  && privacy.includes('overview.deletionAvailable')
  && privacy.includes('overview.available'),
  'export, deletion and account pause retain their independent server gates');
check(privacy.includes('Alert.alert') && privacy.includes('historyConfirmAction'),
  'irreversible history clearing requires confirmation');
equal(Object.keys(privacyCopy.en).sort().join('|'), Object.keys(privacyCopy.ar).sort().join('|'),
  'all privacy controls have English and Arabic copy');

// Shared preference chrome reserves space and follows safe areas.
const preferenceControls = read('components/warsha/GlobalPreferenceControls.tsx');
check(!/rail:\s*\{[^}]*position:\s*'absolute'/s.test(preferenceControls),
  'the global preference rail is not absolutely overlaid');
check(preferenceControls.includes('paddingTop: Math.max(insets.top, spacing.sm)'),
  'the global rail reserves safe-area space');
check(preferenceControls.includes('flexShrink: 0'),
  'large-font preference controls retain measured layout height');

const expo = JSON.parse(read('app.json')).expo;
const locationPlugin = expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'expo-location');
equal(locationPlugin[1].isIosBackgroundLocationEnabled, false, 'iOS background location stays disabled');
equal(locationPlugin[1].isAndroidBackgroundLocationEnabled, false, 'Android background location stays disabled');

console.log(`Onboarding/auth stabilization regressions: ${checks} checks passed.`);
