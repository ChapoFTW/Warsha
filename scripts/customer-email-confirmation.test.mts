import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifyAuthFailure } from '../src/auth/auth-errors.ts';
import {
  customerSignUpResult,
  readAuthCallbackParameters,
} from '../src/auth/email-confirmation.ts';

let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const signedIn = customerSignUpResult({
  session: { access_token: 'not-a-real-token' },
  user: { id: 'customer-session', confirmation_sent_at: null },
});
assert.deepEqual(signedIn, {
  needsEmailConfirmation: false,
  accountId: 'customer-session',
});
checks += 1;

const confirmationRequired = customerSignUpResult({
  session: null,
  user: { id: 'customer-confirm', confirmation_sent_at: '2026-08-09T00:00:00Z' },
});
assert.deepEqual(confirmationRequired, {
  needsEmailConfirmation: true,
  accountId: 'customer-confirm',
});
checks += 1;

const acceptanceUnverified = customerSignUpResult({
  session: null,
  user: { id: 'obfuscated-or-pending', confirmation_sent_at: null },
});
check(acceptanceUnverified.needsEmailConfirmation, 'no-session signup requires confirmation');
check(!('confirmationRequestAccepted' in acceptanceUnverified),
  'signup result never turns response metadata into a delivery claim');

assert.deepEqual(
  readAuthCallbackParameters(
    'warsha://auth/confirm#access_token=access&refresh_token=refresh&type=signup'),
  { kind: 'signup', accessToken: 'access', refreshToken: 'refresh', code: undefined, error: undefined },
);
checks += 1;
assert.deepEqual(
  readAuthCallbackParameters('https://warsha.example/auth/confirm?code=pkce-code'),
  { kind: 'signup', accessToken: undefined, refreshToken: undefined, code: 'pkce-code', error: undefined },
);
checks += 1;
check(readAuthCallbackParameters(
  'warsha://reset-password#access_token=access&refresh_token=refresh&type=recovery').kind === 'recovery',
'password recovery remains a separate callback');
check(readAuthCallbackParameters(
  'warsha://auth/confirm#error=access_denied&error_description=Expired').error === 'Expired',
'confirmation callback retains a safe invalid-link signal');

check(classifyAuthFailure({ code: 'email_address_not_authorized', status: 403 }, 'sign-up')
  === 'authEmailDeliveryRestricted', 'default-service recipient restrictions are specific');
check(classifyAuthFailure({ code: 'email_send_failed', status: 500 }, 'sign-up')
  === 'authEmailDeliveryFailed', 'provider delivery failure is specific');
check(classifyAuthFailure({ code: 'over_email_send_rate_limit', status: 429 }, 'sign-up')
  === 'authRateLimited', 'email rate limits remain retry guidance');
check(classifyAuthFailure({ status: 429, message: 'Error sending confirmation email' }, 'sign-up')
  === 'authRateLimited', 'HTTP rate limits take precedence over generic provider wording');
check(classifyAuthFailure({ code: 'user_already_exists', status: 422 }, 'sign-up')
  === 'authSignupUnavailable', 'duplicate signup does not disclose account existence');

const authContext = readFileSync('src/auth/auth-context.tsx', 'utf8');
const createAccount = readFileSync('app/create-account.tsx', 'utf8');
const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');
const callbackScreen = readFileSync('app/auth/confirm.tsx', 'utf8');
const authCopy = readFileSync('src/auth/auth-translations.ts', 'utf8');
const translations = readFileSync('src/i18n/translations.ts', 'utf8');
const webAppCopy = readFileSync('web/lib/app-copy.ts', 'utf8');
const authRoutes = readFileSync('src/navigation/auth-route-policy.ts', 'utf8');
const workerBroker = readFileSync('supabase/functions/worker-auth/index.ts', 'utf8');
const migration = readFileSync(
  'supabase/migrations/202608190001_customer_email_confirmation_onboarding.sql', 'utf8');

check(/emailRedirectTo:\s*Linking\.createURL\('auth\/confirm'\)/.test(authContext),
  'customer signup supplies a cross-platform confirmation callback');
check(/exchangeCodeForSession/.test(authContext) && /auth\.setSession/.test(authContext),
  'callback supports PKCE and implicit-token responses');
check(/customerConfirmationPending/.test(createAccount),
  'canonical customer registration uses the non-enumerating pending state');
check(!/auth\.signUp\(/.test(profile) && /router\.push\('\/create-account'\)/.test(profile),
  'signed-out profile delegates account creation to the canonical legal-gated surface');
check(!/setNotice\(t\('checkEmail'\)\)/.test(createAccount),
  'create-account no longer reports a bare email-sent claim');
check(/confirmationInvalidBody/.test(callbackScreen) && /confirmationProcessingBody/.test(callbackScreen),
  'callback renders processing and invalid states');
check(authRoutes.includes("'/auth/confirm'"), 'confirmation callback remains reachable while signed out');
check(authCopy.includes('cannot verify sending or delivery'), 'English status copy is explicit about evidence');
check(authCopy.includes('ما تقدرش تتأكد من الإرسال أو الوصول'),
  'Arabic status copy is explicit about evidence');
const webPendingCopy = [...webAppCopy.matchAll(/signUpCheckEmailBody: '([^']+)'/g)]
  .map(match => match[1]);
check(webPendingCopy.length === 2, 'web confirmation-pending copy exists in both languages');
check(webPendingCopy.every(copy => !/we sent|sent you|بعتنا|بعتنالك/i.test(copy)),
  'web never turns a no-session signup response into an email-sent claim');
check(webPendingCopy.some(copy => copy.includes('cannot verify sending or delivery'))
  && webPendingCopy.some(copy => copy.includes('ما تقدرش تتأكد من الإرسال أو الوصول')),
  'web explains the same evidence boundary in English and Arabic');
check(translations.includes('authEmailDeliveryRestricted')
  && translations.includes('authEmailDeliveryFailed')
  && translations.includes('authSignupUnavailable'),
'English and Arabic error keys are registered');
check(/after update of email_confirmed_at on auth\.users/.test(migration),
  'onboarding begins from the authoritative email-confirmation transition');
check(/on conflict \(user_id\) do nothing/.test(migration),
  'confirmation handoff is idempotent');
check(/worker_auth_identities/.test(migration) && /account_role' = 'provider'/.test(migration),
  'trusted worker identities are excluded from customer confirmation handoff');
check(/email_confirm:\s*true/.test(workerBroker),
  'worker registration remains immediately usable without customer confirmation');
check(!/signInWithOtp|verifyOtp|sms\.signIn/i.test(workerBroker),
  'worker registration still sends no OTP or SMS');
check(!/worker-auth\.invalid/.test(callbackScreen),
  'confirmation UI cannot surface synthetic worker identity details');

console.log(`Customer email confirmation regressions: ${checks} checks passed.`);
