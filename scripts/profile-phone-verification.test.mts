import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { safeAuthDiagnostic, authMessageKey, SafeAuthError } from '../src/auth/auth-errors.ts';
import { isLocalDevelopmentPhoneFixture, readPhoneAuthAvailability } from '../src/auth/phone-auth-capability.ts';
import { clearAuthSingleFlightsForTests, runAuthSingleFlight } from '../src/auth/auth-request-guard.ts';
import { isValidPhone, normalizePhone } from '../src/auth/phone-auth.ts';
import { translations } from '../src/i18n/translations.ts';

let assertions = 0;
function equal<T>(actual: T, expected: T, message: string) {
  assertions += 1;
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}
function ok(value: unknown, message: string) {
  assertions += 1;
  if (!value) throw new Error(message);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const profileSource = readFileSync(join(repoRoot, 'app/(tabs)/profile.tsx'), 'utf8');
const authContextSource = readFileSync(join(repoRoot, 'src/auth/auth-context.tsx'), 'utf8');

// --- Save name action ---
equal(translations.en.saveName, 'Save name', 'English save-name label');
equal(translations.ar.saveName, 'حفظ الاسم', 'Arabic save-name label');
ok(translations.en.nameSaved.length > 0 && translations.ar.nameSaved.length > 0, 'save-name success copy exists in both languages');
ok(profileSource.includes("t('saveName')"), 'profile save button uses the saveName key');
ok(!profileSource.includes("t('saveAddress')"), 'profile no longer borrows the booking saveAddress key');
equal(translations.en.saveAddress, 'Save address', 'booking address action keeps its own key');
ok(profileSource.includes("supabaseCustomerProfileRepository.update({ displayName: name.trim(), preferredLanguage: preferred })"), 'saving the name updates only display name and language');
ok(!/save = async[\s\S]{0,400}?address/i.test(profileSource), 'name save path never references address data');
ok(profileSource.includes("setNotice(t('nameSaved'))"), 'a visible success state follows a saved name');
ok(/disabled=\{busy \|\| name\.trim\(\)\.length < 2\}/.test(profileSource), 'save button blocks duplicate submissions while busy');

// --- Egyptian phone normalization (regression anchor) ---
equal(normalizePhone('01099221106'), '+201099221106', 'local format normalizes to E.164');
equal(isValidPhone('01399221106'), false, 'unsupported prefix stays rejected');

// --- Environment capability behavior ---
equal(readPhoneAuthAvailability({ external: { phone: false } }), false, 'hosted disabled phone auth fails closed');
equal(isLocalDevelopmentPhoneFixture('+201099221106') && isLocalDevelopmentPhoneFixture('+201000000008'), true, 'both documented local OTP fixtures are permitted');
ok(authContextSource.indexOf('assertPhoneAuthAvailable(normalized)') < authContextSource.indexOf('auth.updateUser({ phone: normalized })'), 'capability is checked before any phone mutation is attempted');
equal(translations.en.authPhoneUnavailable, 'Phone verification is not enabled for this environment yet.', 'exact English phone-disabled message');
equal(translations.ar.authPhoneUnavailable, 'تأكيد رقم الموبايل مش متفعل في النسخة دي لسه.', 'exact Arabic phone-disabled message');

// --- Error mapping: specific safe states ---
equal(safeAuthDiagnostic('phone-change-request', { code: 'phone_provider_disabled', status: 422 }).message, 'Phone authentication is unavailable.', 'provider-disabled maps to the phone-unavailable state');
equal(safeAuthDiagnostic('phone-change-request', { code: 'phone_exists', status: 422 }).message, 'The phone number belongs to another account.', 'phone owned by another account is a distinct state');
equal(safeAuthDiagnostic('phone-change-request', new Error('A user with this phone number has already been registered')).message, 'The phone number belongs to another account.', 'message-based phone-exists variant maps identically');
equal(safeAuthDiagnostic('phone-change-request', new Error('New phone number should be different from the current phone number')).message, 'The phone number is already verified on this account.', 'same-phone update maps to already-verified');
equal(safeAuthDiagnostic('phone-change-verify', { code: 'invalid_otp', status: 403 }).message, 'The OTP is invalid.', 'invalid OTP state');
equal(safeAuthDiagnostic('phone-change-verify', { code: 'otp_expired', status: 403 }).message, 'The OTP has expired.', 'expired OTP state');
equal(safeAuthDiagnostic('phone-change-request', { code: 'over_sms_send_rate_limit', status: 429 }).message, 'The authentication request was rate limited.', 'rate limit state');
equal(safeAuthDiagnostic('phone-change-request', { status: 401 }).message, 'The authenticated session is unavailable.', 'stale session state');
equal(safeAuthDiagnostic('phone-change-request', Object.assign(new Error('Failed to fetch'), { status: 0 })).message, 'The authentication network request failed.', 'network/unreachable local Supabase state');
equal(safeAuthDiagnostic('phone-change-request', { code: 'sms_send_failed', status: 500 }).message, 'The authentication server failed.', 'SMS delivery failure is a retryable server state');
equal(safeAuthDiagnostic('phone-change-request', { code: 'auth_capability_unavailable', status: 404 }).message, 'The authentication server failed.', 'capability probe failure is retryable, not generic');
equal(safeAuthDiagnostic('phone-change-request', { code: 'sms_send_failed', status: 500 }).retryable, true, 'server failures are marked retryable');
equal(safeAuthDiagnostic('phone-change-request', new Error('completely unknown')).message, 'Authentication failed.', 'unexpected failures fall back to the generic non-retryable state');
equal(safeAuthDiagnostic('phone-change-request', new Error('completely unknown')).retryable, false, 'unexpected failures are non-retryable');

// --- Sanitized logging contract ---
const diagnostic = safeAuthDiagnostic('phone-change-request', Object.assign(new Error('Authorization: Bearer secret-token; otp=123456'), { status: 422, code: 'phone_exists' }));
equal(Object.keys(diagnostic).sort().join(','), 'code,environment,message,mode,operation,retryable,status', 'diagnostics expose only the approved safe fields');
ok(!JSON.stringify(diagnostic).includes('secret-token') && !JSON.stringify(diagnostic).includes('123456'), 'diagnostics never serialize tokens, headers, or OTP values');

// --- Customer-to-worker upgrade flow ---
ok(authContextSource.includes("if (currentUser.phone_confirmed_at && normalizePhone(currentUser.phone ?? '') === normalized) return 'already_verified'"), 'an already-verified phone short-circuits without a mutation');
ok(authContextSource.includes("requestWorkerPhoneChange: (phone: string) => Promise<'code_sent' | 'already_verified'>"), 'phone-change request reports whether a code was actually sent');
ok(authContextSource.includes("verifyOtp({ phone: normalized, token: token.trim(), type: 'phone_change' })"), 'customer upgrade verifies via phone_change, preserving the email session');
ok(profileSource.includes("status === 'already_verified'"), 'profile recovers a stale session by continuing when the phone is already verified');
ok(profileSource.includes('setPhone((current) => current || userPhone)'), 'a session refresh cannot wipe a phone number mid-entry');
ok(!profileSource.includes('[auth.mode, auth.user, t]'), 'the profile effect keys on primitive session values, not user object identity');

// --- UX states on the profile screen ---
ok(profileSource.includes("at('phoneVerifyTitle')"), 'enrollment panel has the Verify your phone heading');
ok(profileSource.includes("at('sendCodePreview')"), 'normalized number is previewed before sending');
ok(profileSource.includes("at('sendingCode')"), 'sending state is shown while the request is in flight');
ok(profileSource.split("at('resendOtp')").length >= 3, 'both OTP surfaces offer a resend action');
ok(profileSource.includes("setNotice(at('codeSent'))"), 'a sent code is confirmed visibly');
equal(translations.en.authPhoneInUse, 'This phone number is already linked to another account.', 'English phone-in-use message');
equal(translations.ar.authPhoneInUse, 'رقم الموبايل ده مسجل بحساب تاني.', 'Arabic phone-in-use message');
equal(authMessageKey(new SafeAuthError('authPhoneInUse')), 'authPhoneInUse', 'safe errors surface their specific translation key');
ok(!profileSource.includes("setMessage(at('phoneRequired'))"), 'the phone-required explanation is not duplicated as an error message');

// --- Duplicate taps and resend (single flight, generic result) ---
clearAuthSingleFlightsForTests();
let sends = 0;
let releaseBarrier!: () => void;
const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
const firstSend = runAuthSingleFlight<'code_sent'>('change:+201000000008', async () => { sends += 1; await barrier; return 'code_sent'; });
const duplicateSend = runAuthSingleFlight<'code_sent'>('change:+201000000008', async () => { sends += 1; return 'code_sent'; });
equal(firstSend, duplicateSend, 'a double tap coalesces into one request');
releaseBarrier();
equal(await firstSend, 'code_sent', 'the shared request resolves with the send status');
equal(sends, 1, 'the network request ran exactly once for the double tap');
await runAuthSingleFlight('change:+201000000008', async () => { sends += 1; return 'code_sent'; });
equal(sends, 2, 'an explicit resend after completion is allowed');

console.log(`Profile and phone verification regression tests passed: ${assertions} assertions.`);
