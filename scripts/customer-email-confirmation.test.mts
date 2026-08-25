import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifyAuthFailure } from '../src/auth/auth-errors.ts';
import {
  callbackFailureFromParameters,
  classifyAuthCallbackFailure,
  confirmationFailurePresentation,
  confirmationResendErrorIsNeutral,
  customerSignUpResult,
  readAuthCallbackParameters,
  safeAuthCallbackDiagnostic,
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
  { kind: 'signup', accessToken: 'access', refreshToken: 'refresh', code: undefined, error: undefined,
    errorCode: undefined, errorDescription: undefined },
);
checks += 1;
assert.deepEqual(
  readAuthCallbackParameters('https://warsha.example/auth/confirm?code=pkce-code'),
  { kind: 'signup', accessToken: undefined, refreshToken: undefined, code: 'pkce-code', error: undefined,
    errorCode: undefined, errorDescription: undefined },
);
checks += 1;
check(readAuthCallbackParameters(
  'warsha://reset-password#access_token=access&refresh_token=refresh&type=recovery').kind === 'recovery',
'password recovery remains a separate callback');
check(readAuthCallbackParameters(
  'warsha://auth/confirm#error=access_denied&error_description=Expired').errorDescription === 'Expired',
'confirmation callback retains a safe invalid-link signal');

check(classifyAuthCallbackFailure({ code: 'otp_expired', message: 'Email link is invalid or has expired' })
  === 'expired_or_used', 'ambiguous provider evidence is not presented as a known expired or reused link');
check(classifyAuthCallbackFailure({ code: 'otp_expired', message: 'Link already used' }) === 'used',
  'explicit reused-link evidence has a distinct recovery state');
check(classifyAuthCallbackFailure({ code: 'bad_code_verifier' }) === 'session_mismatch',
  'PKCE browser/device mismatch gets specific recovery guidance');
check(callbackFailureFromParameters(readAuthCallbackParameters(
  'warsha://auth/confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'))
  === 'expired_or_used', 'callback parameters flow through the shared failure model');
check(confirmationFailurePresentation('used').actions.includes('sign_in'),
  'a used confirmation link offers the real sign-in recovery action');
check(confirmationFailurePresentation('expired').actions.includes('resend_confirmation'),
  'an expired confirmation link offers the real resend action');
check(confirmationResendErrorIsNeutral({ code: 'user_not_found', status: 400 }),
  'resend does not disclose whether an address exists');
check(!confirmationResendErrorIsNeutral({ code: 'over_email_send_rate_limit', status: 429 }),
  'request-level rate limits remain actionable');
const diagnostic = safeAuthCallbackDiagnostic('signup', { status: 'failed', failure: 'expired' }, {
  code: 'otp_expired', status: 403, message: 'secret provider prose',
});
assert.deepEqual(diagnostic, {
  operation: 'auth-callback', kind: 'signup', state: 'failed', failure: 'expired', code: 'otp_expired', status: 403,
});
checks += 1;

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
check(/authOutcomeText\(language, 'confirmationPendingBody'\)/.test(createAccount),
  'canonical customer registration uses the shared non-enumerating pending state');
check(!/auth\.signUp\(/.test(profile) && /router\.push\('\/create-account'\)/.test(profile),
  'signed-out profile delegates account creation to the canonical legal-gated surface');
check(!/setNotice\(t\('checkEmail'\)\)/.test(createAccount),
  'create-account no longer reports a bare email-sent claim');
check(/confirmationFailurePresentation/.test(callbackScreen) && /confirmationProcessingBody/.test(callbackScreen),
  'callback renders processing and classified failure states');
check(authRoutes.includes("'/forgot-password'") && authRoutes.includes("'/resend-confirmation'"),
  'real recovery request routes remain reachable while signed out');
check(authRoutes.includes("'/auth/confirm'"), 'confirmation callback remains reachable while signed out');
check(authCopy.includes('cannot verify sending or delivery'), 'English status copy is explicit about evidence');
check(authCopy.includes('ما تقدرش تتأكد من الإرسال أو الوصول'),
  'Arabic status copy is explicit about evidence');
const webPendingCopy = [...webAppCopy.matchAll(/signUpCheckEmailBody: '([^']+)'/g)]
  .map(match => match[1]);
check(webPendingCopy.length === 3, 'web confirmation-pending copy exists in every supported language');
check(webPendingCopy.every(copy => !/we sent|sent you|بعتنا|بعتنالك/i.test(copy)),
  'web never turns a no-session signup response into an email-sent claim');
check(webPendingCopy.some(copy => copy.includes('cannot verify sending or delivery'))
  && webPendingCopy.some(copy => copy.includes('ما تقدرش تتأكد من الإرسال أو الوصول')),
  'web explains the same evidence boundary in English and Arabic');
check(webPendingCopy.some(copy => copy.includes('ne peut vérifier ni son envoi ni sa réception')),
  'French web copy explains the same email-delivery evidence boundary');
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


// --- "Looks like you already have a Warsha account" --------------------------
// The reported scenario: somebody with an account registers again, and the
// confirmation link tells them only that it "cannot be used". Where Auth names
// the identity conflict, Warsha owes them the recovery path instead. This state
// had no coverage at all, so removing its detection changed nothing.
{
  for (const code of ['identity_already_exists', 'email_exists', 'phone_exists', 'manual_linking_disabled']) {
    check(classifyAuthCallbackFailure({ errorCode: code }) === 'identity_conflict',
      `${code} IS RECOGNISED AS AN EXISTING ACCOUNT, NOT A BROKEN LINK`);
  }
  const presentation = confirmationFailurePresentation('identity_conflict');
  check(presentation.titleKey === 'existingAccountTitle',
    'and is presented as an existing account');
  check(presentation.bodyKey === 'existingEmailBody',
    'with identifier-specific wording rather than "email/phone"');
  // The recovery actions must be the ones that actually help, and must exist.
  assert.deepEqual(presentation.actions, ['sign_in', 'forgot_password'],
    'OFFERING SIGN IN AND FORGOT PASSWORD, NOT "CREATE THE ACCOUNT AGAIN"');
  check(!presentation.actions.includes('create_account'),
    'never looping an existing user back into registration');
  checks += 1;

  // It must NOT swallow the other states: a genuinely broken link still reads
  // as one, or this fix would have replaced one wrong message with another.
  check(confirmationFailurePresentation('invalid').titleKey === 'confirmationInvalidTitle',
    'a malformed link still reports itself as invalid');
  check(confirmationFailurePresentation('expired').titleKey === 'confirmationExpiredTitle',
    'an expired link still reports expiry');
  check(confirmationFailurePresentation('used').titleKey === 'confirmationUsedTitle',
    'a reused link still reports reuse');
  check(confirmationFailurePresentation('session_mismatch').titleKey === 'confirmationSessionMismatchTitle',
    'a session mismatch is its own state');
  const distinct = new Set((['expired', 'used', 'expired_or_used', 'invalid',
    'session_mismatch', 'identity_conflict', 'network'] as const)
    .map((failure) => confirmationFailurePresentation(failure).titleKey));
  check(distinct.size >= 6, 'THE STATES ARE NOT CONFLATED INTO ONE MESSAGE');

  // Every action a state offers must be a real, reachable Warsha destination.
  const routes: Record<string, string> = {
    sign_in: 'web/app/app/sign-in/page.tsx',
    forgot_password: 'web/app/app/forgot-password/page.tsx',
    resend_confirmation: 'web/app/app/resend-confirmation/page.tsx',
    create_account: 'web/app/app/create-account/page.tsx',
  };
  const offered = new Set((['expired', 'used', 'expired_or_used', 'invalid',
    'session_mismatch', 'identity_conflict', 'network', 'service'] as const)
    .flatMap((failure) => confirmationFailurePresentation(failure).actions));
  for (const action of offered) {
    check(readFileSync(routes[action], 'utf8').length > 0,
      `the "${action}" recovery action points at a real screen`);
  }
  // Native must reach the same destinations, or the copy is web-only advice.
  for (const screen of ['app/forgot-password.tsx', 'app/resend-confirmation.tsx']) {
    check(readFileSync(screen, 'utf8').length > 0, `native ships ${screen}`);
  }
  const layout = readFileSync('app/_layout.tsx', 'utf8');
  check(/name="forgot-password"/.test(layout) && /name="resend-confirmation"/.test(layout),
    'AND BOTH ARE REGISTERED AS NATIVE ROUTES, SO THE CTAs ARE NOT DEAD');
  const gate = readFileSync('web/components/startup-gate.tsx', 'utf8');
  check(/'\/resend-confirmation'/.test(gate),
    'and the web gate lets a signed-out person reach the resend screen');
}

// --- Existing-account copy exists in all three languages ---------------------
{
  const copy = readFileSync('src/auth/auth-outcome-copy.ts', 'utf8');
  for (const key of ['existingAccountTitle', 'existingEmailBody', 'existingPhoneBody']) {
    const occurrences = copy.split(`${key}:`).length - 1;
    check(occurrences === 3, `${key} is written for English, Arabic and French`);
  }
  // Phone and email must not share one vague sentence.
  check(!/existingEmailBody: '[^']*email\/phone/i.test(copy),
    'Warsha never says "email/phone" when it knows which was used');
}

console.log(`Customer email confirmation regressions: ${checks} checks passed.`);
