import { environment, supabaseTarget } from '../config/environment.ts';
import type { TranslationKey } from '../i18n/translations.ts';

/**
 * The shape this module actually reads off a rejected auth call.
 *
 * Declared structurally rather than imported from `@supabase/supabase-js`.
 * This module is shared by the Expo app and the Next app, which install their
 * dependencies separately: a package import here resolves from the repository
 * root, which exists on a developer machine and does not exist in a web-only
 * deployment build. The type contributed nothing the intersection below did not
 * already state, and the dependency broke the deploy.
 */
type RejectedAuthCall = {
  code?: string;
  status?: number;
  name?: string;
  message?: string;
};

export type AuthFailure =
  | 'authInvalidCredentials'
  | 'authInvalidEmail'
  | 'authWeakPassword'
  | 'authInvalidPhone'
  | 'authPhoneInUse'
  | 'authPhoneAlreadyVerified'
  | 'authInvalidOtp'
  | 'authOtpExpired'
  | 'authPhoneUnavailable'
  | 'authSessionExpired'
  | 'authNetworkError'
  | 'authServerError'
  | 'authSignupServerError'
  | 'authSignupDatabaseError'
  | 'authEmailUnconfirmed'
  | 'authEmailDeliveryRestricted'
  | 'authEmailDeliveryFailed'
  | 'authSignupUnavailable'
  | 'authRateLimited'
  | 'authConfigurationError'
  | 'authOutdatedClient'
  | 'authError';

export type AuthOperation =
  | 'session'
  | 'password-sign-in'
  | 'worker-password-sign-in'
  | 'sign-up'
  | 'worker-sign-up'
  | 'worker-otp-request'
  | 'worker-otp-verify'
  | 'phone-change-request'
  | 'phone-change-verify'
  | 'password-reset'
  | 'sign-out'
  | 'unknown';

export class SafeAuthError extends Error {
  readonly translationKey: AuthFailure;

  constructor(translationKey: AuthFailure) {
    super(translationKey);
    this.name = 'SafeAuthError';
    this.translationKey = translationKey;
  }
}

const SAFE_MESSAGES: Record<AuthFailure, string> = {
  authInvalidCredentials: 'Credentials were rejected.',
  authInvalidEmail: 'The email address is invalid.',
  authWeakPassword: 'The password does not meet account requirements.',
  authInvalidPhone: 'The phone number is invalid.',
  authPhoneInUse: 'The phone number belongs to another account.',
  authPhoneAlreadyVerified: 'The phone number is already verified on this account.',
  authInvalidOtp: 'The OTP is invalid.',
  authOtpExpired: 'The OTP has expired.',
  authPhoneUnavailable: 'Phone authentication is unavailable.',
  authSessionExpired: 'The authenticated session is unavailable.',
  authNetworkError: 'The authentication network request failed.',
  authServerError: 'The authentication server failed.',
  authSignupServerError: 'The account creation service failed.',
  authSignupDatabaseError: 'Account setup was rejected while the account was being created.',
  authEmailUnconfirmed: 'The email is not confirmed.',
  authEmailDeliveryRestricted: 'The email delivery service rejected the recipient.',
  authEmailDeliveryFailed: 'The confirmation request could not be sent.',
  authSignupUnavailable: 'The signup request could not be completed.',
  authRateLimited: 'The authentication request was rate limited.',
  authConfigurationError: 'Authentication is not configured.',
  authOutdatedClient: 'This build and the authentication service disagree about the request contract.',
  authError: 'Authentication failed.',
};

export function classifyAuthFailure(error: unknown, operation: AuthOperation = 'unknown'): AuthFailure {
  if (error instanceof SafeAuthError) return error.translationKey;
  const candidate = error as RejectedAuthCall;
  const code = String(candidate?.code ?? '').toLowerCase();
  const status = Number(candidate?.status ?? 0);
  const message = error instanceof Error ? error.message : '';
  if (code === 'invalid_credentials' || status === 400 && /invalid login credentials/i.test(message)) return 'authInvalidCredentials';
  if (
    operation === 'sign-up'
    && (code === 'email_address_invalid' || code === 'invalid_email' || code === 'validation_failed' && /email/i.test(message))
  ) return 'authInvalidEmail';
  if (
    operation === 'sign-up'
    && (code === 'weak_password' || code === 'validation_failed' && /password/i.test(message))
  ) return 'authWeakPassword';
  if (code === 'phone_provider_disabled' || code === 'sms_provider_disabled') return 'authPhoneUnavailable';
  if (code === 'phone_exists' || /phone.*already (?:been )?registered|already (?:been )?registered.*phone/i.test(message)) return 'authPhoneInUse';
  if (/phone.*should be different|same.*phone number/i.test(message)) return 'authPhoneAlreadyVerified';
  if (code === 'sms_send_failed' || code === 'auth_capability_unavailable') return 'authServerError';
  if (code === 'validation_failed' && /phone/i.test(message)) return 'authInvalidPhone';
  if (code === 'otp_expired' || /otp.*expired|token.*expired/i.test(message)) return 'authOtpExpired';
  if (code === 'otp_disabled' || code === 'invalid_otp' || /token.*invalid|invalid.*token/i.test(message)) return 'authInvalidOtp';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) return 'authEmailUnconfirmed';
  if (status === 429 || code.includes('rate_limit') || code.includes('over_request')) return 'authRateLimited';
  if (
    operation === 'sign-up'
    && (code === 'email_address_not_authorized' || /email address not authorized/i.test(message))
  ) return 'authEmailDeliveryRestricted';
  if (
    operation === 'sign-up'
    && (
      code === 'email_provider_disabled'
      || code === 'email_send_failed'
      || /error sending (?:confirmation )?email|smtp/i.test(message)
    )
  ) return 'authEmailDeliveryFailed';
  if (
    operation === 'sign-up'
    && (
      code === 'signup_disabled'
      || code === 'captcha_failed'
      || code === 'user_already_exists'
      || code === 'email_exists'
      || /user already registered|already.*registered/i.test(message)
    )
  ) return 'authSignupUnavailable';
  if (status === 401 || code === 'session_not_found' || code === 'refresh_token_not_found') return 'authSessionExpired';
  if (code === 'configuration_error' || /supabase mode requires/i.test(message)) return 'authConfigurationError';
  if (
    (operation === 'sign-up' || operation === 'worker-sign-up')
    && /database error (?:saving|granting)|error (?:saving|creating) new user/i.test(message)
  ) return 'authSignupDatabaseError';
  if (status >= 500 || code === 'unexpected_failure') {
    return operation === 'sign-up' || operation === 'worker-sign-up'
      ? 'authSignupServerError' : 'authServerError';
  }
  if (status === 0 && (/network request failed|failed to fetch|networkerror|timeout/i.test(message) || candidate?.name === 'AuthRetryableFetchError')) return 'authNetworkError';
  return 'authError';
}

export function safeAuthDiagnostic(operation: AuthOperation, error: unknown) {
  const candidate = error as { code?: unknown; status?: unknown };
  const failure = classifyAuthFailure(error, operation);
  const code = typeof candidate?.code === 'string' && /^[a-z0-9_]{1,64}$/i.test(candidate.code)
    ? candidate.code
    : undefined;
  const statusValue = Number(candidate?.status ?? 0);
  return {
    operation,
    environment: supabaseTarget,
    mode: environment.dataMode,
    failure,
    code,
    status: statusValue >= 100 && statusValue <= 599 ? statusValue : undefined,
    message: SAFE_MESSAGES[failure],
    retryable: failure === 'authNetworkError' || failure === 'authServerError'
      || failure === 'authSignupServerError' || failure === 'authRateLimited'
      || failure === 'authSignupDatabaseError',
  };
}

/**
 * `__DEV__` is a React Native global. This module is now shared with the web,
 * where it does not exist, so it is read off `globalThis` rather than
 * referenced bare — an undeclared identifier would be a build error in the
 * bundler that does not define it.
 */
function developmentBuild(): boolean {
  return (globalThis as { __DEV__?: boolean }).__DEV__ === true;
}

export function sanitizeAuthError(error: unknown, operation: AuthOperation = 'unknown'): SafeAuthError {
  const safe = error instanceof SafeAuthError ? error : new SafeAuthError(classifyAuthFailure(error, operation));
  if (developmentBuild()) console.warn('[Warsha auth]', safeAuthDiagnostic(operation, error));
  return safe;
}

export function authMessageKey(error: unknown): TranslationKey {
  return error instanceof SafeAuthError ? error.translationKey : 'authError';
}
