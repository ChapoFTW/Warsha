import { readFileSync } from 'node:fs';

import { safeAuthDiagnostic } from '../src/auth/auth-errors.ts';
import { isLocalDevelopmentPhoneFixture, readPhoneAuthAvailability } from '../src/auth/phone-auth-capability.ts';
import { clearAuthSingleFlightsForTests, runAuthSingleFlight } from '../src/auth/auth-request-guard.ts';
import { isValidPhone, isValidSmsOtp, normalizePhone } from '../src/auth/phone-auth.ts';
import { classifySupabaseTarget } from '../src/config/environment.ts';
import {
  assertImportSession,
  buildLocalImportPlan,
  LocalDataFormatError,
} from '../src/migration/local-data-import-plan.ts';

let assertions = 0;
function equal<T>(actual: T, expected: T, message: string) {
  assertions += 1;
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}
function ok(value: unknown, message: string) {
  assertions += 1;
  if (!value) throw new Error(message);
}
function throws(task: () => unknown, expected: new (...args: never[]) => Error, message: string) {
  assertions += 1;
  try { task(); } catch (error) {
    if (error instanceof expected) return;
    throw new Error(`${message}: wrong error ${String(error)}`);
  }
  throw new Error(`${message}: did not throw`);
}

const acceptedPhones = ['01099221106', '1099221106', '201099221106', '+201099221106', '+20 (109) 922-1106'];
for (const value of acceptedPhones) equal(normalizePhone(value), '+201099221106', `${value} normalizes`);
for (const value of ['0109922110', '01399221106', '+9715099221106', '2010992211067', '010.9922.1106', '+0201099221106']) {
  equal(isValidPhone(value), false, `${value} is rejected without country guessing`);
}
equal(isValidSmsOtp('123456'), true, 'valid OTP is accepted');
equal(isValidSmsOtp('12345'), false, 'short OTP is rejected');
equal(isValidSmsOtp('12345a'), false, 'non-numeric OTP is rejected');

equal(safeAuthDiagnostic('worker-otp-verify', { code: 'otp_expired', status: 403 }).message, 'The OTP has expired.', 'expired OTP is distinct');
equal(safeAuthDiagnostic('worker-otp-verify', { code: 'invalid_otp', status: 403 }).message, 'The OTP is invalid.', 'invalid OTP is distinct');
equal(safeAuthDiagnostic('worker-otp-request', { code: 'over_request_rate_limit', status: 429 }).message, 'The authentication request was rate limited.', 'rate limits are actionable');
const signUpServerFailure = safeAuthDiagnostic('sign-up', { code: 'unexpected_failure', status: 500 });
equal(signUpServerFailure.failure, 'authSignupServerError', 'sign-up server failures have an operation-specific user state');
equal(signUpServerFailure.code, 'unexpected_failure', 'diagnostics preserve the real safe server code');
equal(signUpServerFailure.status, 500, 'diagnostics preserve the real HTTP status');
equal(signUpServerFailure.message, 'The account creation service failed.', 'sign-up failures are not described as sign-in failures');
const redacted = safeAuthDiagnostic('worker-otp-request', new Error('Authorization: Bearer secret-token'));
equal(redacted.message.includes('secret-token'), false, 'diagnostics do not serialize raw messages or headers');
equal(readPhoneAuthAvailability({ external: { phone: true } }), true, 'enabled phone provider is accepted');
equal(readPhoneAuthAvailability({ external: { phone: false } }), false, 'disabled phone provider fails closed');
equal(readPhoneAuthAvailability({}), false, 'missing capability fails closed');
equal(isLocalDevelopmentPhoneFixture('+201099221106'), true, 'documented local phone fixture is allowed');
equal(isLocalDevelopmentPhoneFixture('+201099221107'), false, 'unmapped local phone cannot reach the fake provider');
equal(classifySupabaseTarget('supabase', 'http://192.168.1.10:54321'), 'local', 'LAN target is local');
equal(classifySupabaseTarget('supabase', 'https://project.supabase.co'), 'hosted', 'production target is hosted');
equal(classifySupabaseTarget('supabase', undefined), 'unconfigured', 'missing production target fails closed');

clearAuthSingleFlightsForTests();
let calls = 0;
let release!: () => void;
const barrier = new Promise<void>(resolve => { release = resolve; });
const first = runAuthSingleFlight('same-phone', async () => { calls += 1; await barrier; });
const duplicate = runAuthSingleFlight('same-phone', async () => { calls += 1; });
equal(first, duplicate, 'simultaneous duplicate OTP requests share one promise');
release();
await Promise.all([first, duplicate]);
equal(calls, 1, 'simultaneous duplicate OTP request runs once');
await runAuthSingleFlight('same-phone', async () => { calls += 1; });
equal(calls, 2, 'explicit resend after completion is allowed');

const address = {
  id: 'home-1', label: 'Home', governorate: 'Cairo', district: 'Dokki', street: 'Tahrir',
  building: '21', floor: '3', apartment: '8', landmark: '', instructions: 'Call on arrival', isDefault: true,
};
const providerId = '11111111-1111-4111-8111-111111111111';
const plan = buildLocalImportPlan(JSON.stringify([address, address]), JSON.stringify([providerId, providerId, 'hossam']));
equal(plan.addresses.length, 1, 'duplicate local addresses are deduplicated for retry safety');
equal(plan.addresses[0]?.local_source_id, 'home-1', 'local address identity is preserved');
ok(plan.addresses[0]?.address_line.includes('Call on arrival'), 'all supported address details are preserved');
equal(plan.favouriteProviderIds.length, 1, 'duplicate favourite UUIDs are deduplicated');
equal(plan.skippedFavouriteCount, 1, 'legacy non-UUID favourite is safely skipped');
equal(buildLocalImportPlan(null, null).addresses.length, 0, 'first import with no supported data is safe');
throws(() => buildLocalImportPlan('{bad json', null), LocalDataFormatError, 'malformed address data fails before network writes');
throws(() => buildLocalImportPlan(null, JSON.stringify([42])), LocalDataFormatError, 'malformed favourites fail before network writes');
assertImportSession('user-a', 'user-a', 'supabase'); assertions += 1;
throws(() => assertImportSession('user-a', 'user-b', 'supabase'), Error, 'account switch fails closed');
throws(() => assertImportSession('user-a', undefined, 'supabase'), Error, 'missing auth fails closed');
throws(() => assertImportSession('user-a', 'user-a', 'mock'), Error, 'mock mode cannot invoke remote import');

const migrationClient = readFileSync('src/migration/local-data-migration.ts', 'utf8');
ok(migrationClient.includes("rpc('import_local_customer_data'"), 'supported data uses the transactional RPC');
ok(!migrationClient.includes('p_bookings') && !migrationClient.includes('attachment'), 'bookings and files are excluded from import writes');
const migrationSql = readFileSync('supabase/migrations/202608010001_device_p1_fixes.sql', 'utf8');
ok(migrationSql.includes('p_expected_user_id <> uid'), 'database rejects account switches');
ok(migrationSql.includes('on conflict(customer_id, local_source_id) do update'), 'address retry is idempotent');
ok(migrationSql.includes('security definer') && migrationSql.includes("set search_path = ''"), 'import RPC has hardened execution context');

const authContext = readFileSync('src/auth/auth-context.tsx', 'utf8');
// WPS-024 correction. Registration no longer creates an account by SMS code,
// so there is no `shouldCreateUser` to keep distinct. What must stay true is
// that registration touches no OTP primitive at all.
ok(!authContext.includes('signInWithOtp'), 'REGISTRATION CREATES NO ACCOUNT BY SMS CODE');
ok(!authContext.includes('requestWorkerOtp') && !authContext.includes('verifyWorkerOtp'),
  'the registration and sign-in OTP pair is gone');
ok(authContext.includes('contact_phone: normalized'),
  'registration carries the contact number as metadata, not as an auth factor');
ok(authContext.includes('auth.updateUser({ phone: normalized })'), 'phone confirmation remains covered');
ok(authContext.includes("type: 'phone_change'"), 'phone confirmation verifies the phone-change OTP');
ok(authContext.includes('await assertPhoneAuthAvailable(normalized)'), 'phone requests preflight server capability');
ok(authContext.includes("requireCurrentUser('phone-change-verify')"), 'confirmation validates the resulting server session');

// The preflight belongs to the phone-change flow and to nothing else. If it
// ever reappears above `signUp`, registration is depending on Phone Auth again.
ok(authContext.indexOf('assertPhoneAuthAvailable(normalized)') > authContext.indexOf('signUp:'),
  'THE PHONE CAPABILITY PREFLIGHT SITS BELOW SIGN-UP, NOT INSIDE IT');
const signUpBody = authContext.slice(
  authContext.indexOf('signUp: async'),
  authContext.indexOf('requestWorkerPhoneChange:'),
);
ok(!signUpBody.includes('assertPhoneAuthAvailable'),
  'SIGN-UP DOES NOT PREFLIGHT PHONE AUTH');
ok(!signUpBody.includes('Otp') && !signUpBody.includes('otp'),
  'SIGN-UP CONTAINS NO OTP CALL');

const rootLayout = readFileSync('app/_layout.tsx', 'utf8');
for (const stale of ['booking/new/[providerId]', 'booking/[id]', 'addresses', 'provider-job/[id]']) {
  ok(!rootLayout.includes(`<Stack.Screen name="${stale}"`), `stale root declaration ${stale} is absent`);
}
ok(rootLayout.includes('<Stack.Screen name="booking"'), 'booking child navigator is declared by segment');
ok(rootLayout.includes('<Stack.Screen name="provider-job"'), 'provider-job child navigator is declared by segment');

const appConfig = readFileSync('app.json', 'utf8');
for (const asset of ['warsha-current-approved-icon.png', 'warsha-current-approved-adaptive-foreground.png', 'warsha-current-approved-monochrome.png', 'warsha-current-approved-notification.png', 'warsha-current-approved-favicon.png']) {
  ok(appConfig.includes(asset), `${asset} is wired into Expo app config`);
}
equal((appConfig.match(/warsha-current-approved-icon\.png/g) ?? []).length, 6,
  'the 1024 px approved icon is used for the app icon, iOS variants, and both splash themes');
ok(!appConfig.includes('warsha-current-approved-splash.png'),
  'the 512 px splash raster is not enlarged by the native launch screen');
const brandRenderer = readFileSync('scripts/render-brand-assets.ps1', 'utf8');
ok(brandRenderer.includes('Draw-CurrentMark'), 'approved Current mark renderer is used');
ok(!brandRenderer.includes('YOUR BUSINESS. MORE JOBS.'), 'obsolete business tagline is absent');
ok(!brandRenderer.includes('YOUR WORK. OUR MISSION.'), 'stale tagline is absent');
ok(brandRenderer.includes('YOUR WORK, OUR MISSION'), 'approved motto is present');
const headerSource = readFileSync('components/warsha/Header.tsx', 'utf8');
const profileSource = readFileSync('app/(tabs)/profile.tsx', 'utf8');
ok(headerSource.includes('<BrandLockup'), 'global header uses the reusable Current lockup');
ok(profileSource.includes('<BrandLockup'), 'auth and loading profile UI uses the reusable Current lockup');
ok(!/warsha-brand-(?:icon|splash|adaptive-foreground|monochrome|favicon)\.png/.test(`${appConfig}\n${rootLayout}\n${headerSource}\n${profileSource}`), 'active product config and UI have no legacy brand asset imports');
const localAuthConfig = readFileSync('supabase/config.toml', 'utf8');
ok(localAuthConfig.includes('"+201099221106" = "123456"'), 'documented local Egyptian OTP fixture is configured');
ok(localAuthConfig.includes('local-test-only-no-real-sms'), 'local provider uses an explicit non-secret placeholder');
ok(!/AC[0-9a-f]{32}|SK[0-9a-f]{32}|auth_token\s*=|api_secret\s*=/i.test(localAuthConfig), 'no real SMS provider credentials are introduced');

console.log(`Device P1 regression tests passed: ${assertions} assertions.`);
