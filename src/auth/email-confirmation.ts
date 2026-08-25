import type { AuthOutcomeCopyKey } from './auth-outcome-copy.ts';

export type AuthCallbackKind = 'signup' | 'recovery';

export type AuthCallbackParameters = {
  kind: AuthCallbackKind | null;
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  error?: string;
  errorCode?: string;
  errorDescription?: string;
};

export type AuthCallbackFailure =
  | 'expired'
  | 'used'
  | 'expired_or_used'
  | 'invalid'
  | 'session_mismatch'
  | 'identity_conflict'
  | 'network'
  | 'service';

export type AuthCallbackOutcome =
  | { status: 'idle' | 'checking' | 'processing' | 'ready' }
  | { status: 'failed'; failure: AuthCallbackFailure };

export type AuthRecoveryAction =
  | 'sign_in'
  | 'forgot_password'
  | 'resend_confirmation'
  | 'create_account'
  | 'retry';

export type AuthFailurePresentation = {
  titleKey: AuthOutcomeCopyKey;
  bodyKey: AuthOutcomeCopyKey;
  actions: readonly AuthRecoveryAction[];
};

type CallbackErrorShape = {
  code?: unknown;
  status?: unknown;
  name?: unknown;
  message?: unknown;
  error?: unknown;
  errorCode?: unknown;
  errorDescription?: unknown;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Normalize provider callback evidence into Warsha product states.
 *
 * Stable Supabase codes win. Provider prose is used only to retain a nuance a
 * code does not carry (notably an explicitly stated reused link). Supabase
 * commonly reports a reused email link as `otp_expired`, so the ambiguous
 * `expired_or_used` state is deliberate whenever the provider itself does not
 * reveal which occurred.
 */
export function classifyAuthCallbackFailure(error: CallbackErrorShape): AuthCallbackFailure {
  const code = text(error.errorCode || error.code || error.error).toLowerCase();
  const status = Number(error.status ?? 0);
  const name = text(error.name);
  const message = text(error.errorDescription || error.message).toLowerCase();

  if (/already[ -]?used|used already|consumed/.test(message)) return 'used';
  if (code === 'otp_expired') {
    return /invalid.*expired|expired.*invalid/.test(message) ? 'expired_or_used' : 'expired';
  }
  if (/\bexpired\b/.test(message)) return 'expired';
  if (code === 'bad_code_verifier' || code === 'flow_state_not_found'
    || code === 'bad_oauth_state' || code === 'bad_oauth_callback') return 'session_mismatch';
  if (code === 'identity_already_exists' || code === 'email_exists' || code === 'phone_exists'
    || code === 'manual_linking_disabled') return 'identity_conflict';
  if (status === 0 && (/network|fetch|timeout/.test(message) || name === 'AuthRetryableFetchError')) {
    return 'network';
  }
  if (code === 'request_timeout') return 'network';
  if (status >= 500 || code === 'unexpected_failure' || code === 'otp_disabled') return 'service';
  return 'invalid';
}

/** Return a failure only when the URL itself proves the callback cannot run. */
export function callbackFailureFromParameters(
  parameters: AuthCallbackParameters,
): AuthCallbackFailure | null {
  if (parameters.error || parameters.errorCode || parameters.errorDescription) {
    return classifyAuthCallbackFailure(parameters);
  }
  if (!parameters.code && (!parameters.accessToken || !parameters.refreshToken)) return 'invalid';
  return null;
}

/** One recovery policy, rendered equivalently by web, Android, and iOS. */
export function confirmationFailurePresentation(
  failure: AuthCallbackFailure,
): AuthFailurePresentation {
  switch (failure) {
    case 'expired':
      return {
        titleKey: 'confirmationExpiredTitle',
        bodyKey: 'confirmationExpiredBody',
        actions: ['resend_confirmation', 'sign_in'],
      };
    case 'used':
      return {
        titleKey: 'confirmationUsedTitle',
        bodyKey: 'confirmationUsedBody',
        actions: ['sign_in', 'forgot_password'],
      };
    case 'expired_or_used':
      return {
        titleKey: 'confirmationExpiredOrUsedTitle',
        bodyKey: 'confirmationExpiredOrUsedBody',
        actions: ['sign_in', 'resend_confirmation', 'forgot_password'],
      };
    case 'session_mismatch':
      return {
        titleKey: 'confirmationSessionMismatchTitle',
        bodyKey: 'confirmationSessionMismatchBody',
        actions: ['resend_confirmation', 'sign_in'],
      };
    case 'identity_conflict':
      return {
        titleKey: 'existingAccountTitle',
        bodyKey: 'existingEmailBody',
        actions: ['sign_in', 'forgot_password'],
      };
    case 'network':
    case 'service':
      return {
        titleKey: 'confirmationServiceTitle',
        bodyKey: 'confirmationServiceBody',
        actions: ['resend_confirmation', 'sign_in'],
      };
    default:
      return {
        titleKey: 'confirmationInvalidTitle',
        bodyKey: 'confirmationInvalidBody',
        actions: ['sign_in', 'create_account'],
      };
  }
}

export function recoveryFailurePresentation(
  failure: AuthCallbackFailure,
): AuthFailurePresentation {
  switch (failure) {
    case 'expired':
      return { titleKey: 'recoveryExpiredTitle', bodyKey: 'recoveryExpiredBody', actions: ['forgot_password', 'sign_in'] };
    case 'used':
      return { titleKey: 'recoveryUsedTitle', bodyKey: 'recoveryUsedBody', actions: ['sign_in', 'forgot_password'] };
    case 'expired_or_used':
      return { titleKey: 'recoveryExpiredOrUsedTitle', bodyKey: 'recoveryExpiredOrUsedBody', actions: ['sign_in', 'forgot_password'] };
    case 'session_mismatch':
      return { titleKey: 'recoverySessionMismatchTitle', bodyKey: 'recoverySessionMismatchBody', actions: ['forgot_password', 'sign_in'] };
    case 'network':
    case 'service':
      return { titleKey: 'recoveryServiceTitle', bodyKey: 'recoveryServiceBody', actions: ['forgot_password', 'sign_in'] };
    default:
      return { titleKey: 'recoveryInvalidTitle', bodyKey: 'recoveryInvalidBody', actions: ['forgot_password', 'sign_in'] };
  }
}

/**
 * A resend form must not reveal confirmed, unknown, or otherwise ineligible
 * addresses. Identity-dependent 4xx responses therefore receive the same
 * neutral accepted result. Transport, rate-limit, and service failures remain
 * actionable because they describe this request rather than the account.
 */
export function confirmationResendErrorIsNeutral(error: CallbackErrorShape): boolean {
  const status = Number(error.status ?? 0);
  const code = text(error.code).toLowerCase();
  const actionable = new Set([
    'captcha_failed',
    'email_provider_disabled',
    'email_send_failed',
    'over_email_send_rate_limit',
    'over_request_rate_limit',
    'request_timeout',
    'signup_disabled',
    'unexpected_failure',
  ]);
  return status >= 400 && status < 500 && status !== 429 && !actionable.has(code);
}

export function safeAuthCallbackDiagnostic(
  kind: AuthCallbackKind,
  outcome: AuthCallbackOutcome,
  evidence: CallbackErrorShape = {},
) {
  const rawCode = text(evidence.errorCode || evidence.code || evidence.error);
  const status = Number(evidence.status ?? 0);
  return {
    operation: 'auth-callback' as const,
    kind,
    state: outcome.status,
    failure: outcome.status === 'failed' ? outcome.failure : undefined,
    code: /^[a-z0-9_]{1,64}$/i.test(rawCode) ? rawCode : undefined,
    status: status >= 100 && status <= 599 ? status : undefined,
  };
}

export type CustomerSignUpResult = {
  needsEmailConfirmation: boolean;
  accountId: string | null;
};

type SignUpResponseShape = {
  session: unknown | null;
  user: {
    id?: string | null;
    confirmation_sent_at?: string | null;
  } | null;
};

/**
 * Supabase documents two password-signup outcomes: a returned session when
 * confirmation is disabled, or a returned user with no session when email
 * confirmation is required. The returned user can be deliberately obfuscated
 * for a duplicate signup, including plausible timestamps, so no response field
 * is treated as proof that an account was created or an email was sent.
 */
export function customerSignUpResult(data: SignUpResponseShape): CustomerSignUpResult {
  if (data.session) {
    return {
      needsEmailConfirmation: false,
      accountId: data.user?.id ?? null,
    };
  }

  return {
    needsEmailConfirmation: true,
    accountId: data.user?.id ?? null,
  };
}

/** Parse both implicit-token and PKCE Auth redirects without logging secrets. */
export function readAuthCallbackParameters(url: string): AuthCallbackParameters {
  const queryStart = url.indexOf('?');
  const fragmentStart = url.indexOf('#');
  const queryEnd = fragmentStart >= 0 ? fragmentStart : url.length;
  const query = queryStart >= 0 ? url.slice(queryStart + 1, queryEnd) : '';
  const fragment = fragmentStart >= 0 ? url.slice(fragmentStart + 1) : '';
  const parameters = new URLSearchParams(query);
  new URLSearchParams(fragment).forEach((value, key) => parameters.set(key, value));

  const type = parameters.get('type')?.toLowerCase();
  const path = url.split(/[?#]/, 1)[0].toLowerCase();
  const kind = type === 'recovery' || path.includes('reset-password')
    ? 'recovery'
    : type === 'signup' || type === 'email' || path.includes('auth/confirm')
      ? 'signup'
      : null;

  return {
    kind,
    accessToken: parameters.get('access_token') ?? undefined,
    refreshToken: parameters.get('refresh_token') ?? undefined,
    code: parameters.get('code') ?? undefined,
    error: parameters.get('error') ?? undefined,
    errorCode: parameters.get('error_code') ?? undefined,
    errorDescription: parameters.get('error_description') ?? undefined,
  };
}
