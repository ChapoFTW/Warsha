import type { AuthError } from '@supabase/supabase-js';

import { environment, supabaseTarget } from '../config/environment.ts';
import type { TranslationKey } from '@/src/i18n/translations';

export type AuthFailure =
  | 'authInvalidCredentials'
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
  | 'authEmailUnconfirmed'
  | 'authRateLimited'
  | 'authConfigurationError'
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
  authEmailUnconfirmed: 'The email is not confirmed.',
  authRateLimited: 'The authentication request was rate limited.',
  authConfigurationError: 'Authentication is not configured.',
  authError: 'Authentication failed.',
};

function classify(error: unknown, operation: AuthOperation = 'unknown'): AuthFailure {
  if (error instanceof SafeAuthError) return error.translationKey;
  const candidate = error as Partial<AuthError> & { code?: string; status?: number; name?: string };
  const code = String(candidate?.code ?? '').toLowerCase();
  const status = Number(candidate?.status ?? 0);
  const message = error instanceof Error ? error.message : '';
  if (code === 'invalid_credentials' || status === 400 && /invalid login credentials/i.test(message)) return 'authInvalidCredentials';
  if (code === 'phone_provider_disabled' || code === 'sms_provider_disabled') return 'authPhoneUnavailable';
  if (code === 'phone_exists' || /phone.*already (?:been )?registered|already (?:been )?registered.*phone/i.test(message)) return 'authPhoneInUse';
  if (/phone.*should be different|same.*phone number/i.test(message)) return 'authPhoneAlreadyVerified';
  if (code === 'sms_send_failed' || code === 'auth_capability_unavailable') return 'authServerError';
  if (code === 'validation_failed' && /phone/i.test(message)) return 'authInvalidPhone';
  if (code === 'otp_expired' || /otp.*expired|token.*expired/i.test(message)) return 'authOtpExpired';
  if (code === 'otp_disabled' || code === 'invalid_otp' || /token.*invalid|invalid.*token/i.test(message)) return 'authInvalidOtp';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) return 'authEmailUnconfirmed';
  if (status === 429 || code.includes('rate_limit') || code.includes('over_request')) return 'authRateLimited';
  if (status === 401 || code === 'session_not_found' || code === 'refresh_token_not_found') return 'authSessionExpired';
  if (code === 'configuration_error' || /supabase mode requires/i.test(message)) return 'authConfigurationError';
  if (status >= 500 || code === 'unexpected_failure') {
    return operation === 'sign-up' || operation === 'worker-sign-up'
      ? 'authSignupServerError' : 'authServerError';
  }
  if (status === 0 && (/network request failed|failed to fetch|networkerror|timeout/i.test(message) || candidate?.name === 'AuthRetryableFetchError')) return 'authNetworkError';
  return 'authError';
}

export function safeAuthDiagnostic(operation: AuthOperation, error: unknown) {
  const candidate = error as { code?: unknown; status?: unknown };
  const failure = classify(error, operation);
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
      || failure === 'authSignupServerError' || failure === 'authRateLimited',
  };
}

export function sanitizeAuthError(error: unknown, operation: AuthOperation = 'unknown'): SafeAuthError {
  const safe = error instanceof SafeAuthError ? error : new SafeAuthError(classify(error, operation));
  if (__DEV__) console.warn('[Warsha auth]', safeAuthDiagnostic(operation, error));
  return safe;
}

export function authMessageKey(error: unknown): TranslationKey {
  return error instanceof SafeAuthError ? error.translationKey : 'authError';
}
