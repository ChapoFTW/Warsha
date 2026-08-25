import type { FunctionsError } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/src/lib/supabase';

import { SafeAuthError, type AuthFailure } from './auth-errors';
import type { SignupLegalAcceptance } from '@/src/legal/signup-legal';
import type { SupportedLanguage } from '@/src/i18n/language-preference';

type WorkerSessionTokens = { accessToken: string; refreshToken: string };

type WorkerRegistration = {
  fullName: string;
  phone: string;
  password: string;
  language: SupportedLanguage;
  legalAcceptances: readonly SignupLegalAcceptance[];
};

async function responseCode(error: FunctionsError): Promise<string | null> {
  const context = error.context as {
    clone?: () => { json?: () => Promise<unknown> };
    json?: () => Promise<unknown>;
  } | undefined;
  const response = context?.clone?.() ?? context;
  if (!response?.json) return null;
  try {
    const payload = await response.json() as { code?: unknown };
    return typeof payload?.code === 'string' ? payload.code : null;
  } catch {
    return null;
  }
}

/**
 * Every code the broker can return has a message that tells somebody what to
 * do next. The previous fallback collapsed a stale-client contract mismatch, a
 * transport failure and an unknown server state into "Something went wrong",
 * which is the one answer that helps nobody: a duplicate phone number is fixed
 * by using another number, an outdated build is fixed by updating, and neither
 * is fixed by pressing the button again.
 */
const WORKER_AUTH_FAILURES: Record<string, AuthFailure> = {
  invalid_phone: 'authInvalidPhone',
  // Registration is public. Confirming that a submitted number belongs to an
  // account would turn this endpoint into a phone-number enumeration oracle.
  // The neutral state still suggests signing in or trying another number.
  phone_in_use: 'authSignupPhoneUnavailable',
  invalid_credentials: 'authInvalidCredentials',
  rate_limited: 'authRateLimited',
  legal_acceptance_required: 'authOutdatedClient',
  legal_acceptance_stale: 'authOutdatedClient',
  // The client validates name and phone before calling, so a rejected shape
  // means this build and the broker disagree about the contract.
  invalid_request: 'authOutdatedClient',
  method_not_allowed: 'authOutdatedClient',
  unavailable: 'authServerError',
  signup_failed: 'authServerError',
};

async function invokeWorkerAuth(body: Record<string, unknown>): Promise<WorkerSessionTokens> {
  const { data, error } = await getSupabaseClient().functions.invoke('worker-auth', { body });
  if (error) {
    const code = await responseCode(error);
    const failure = code ? WORKER_AUTH_FAILURES[code] : undefined;
    if (failure) throw new SafeAuthError(failure);
    // No readable code at all is a transport or gateway problem, not an
    // application answer. Saying so is more actionable than a generic apology.
    throw new SafeAuthError(code ? 'authServerError' : 'authNetworkError');
  }
  const tokens = data as Partial<WorkerSessionTokens> | null;
  if (!tokens?.accessToken || !tokens.refreshToken) throw new SafeAuthError('authServerError');
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export function registerWorker(input: WorkerRegistration): Promise<WorkerSessionTokens> {
  return invokeWorkerAuth({
    action: 'register',
    fullName: input.fullName,
    phone: input.phone,
    password: input.password,
    language: input.language,
    legalAcceptances: input.legalAcceptances,
  });
}

export function signInWorker(phone: string, password: string): Promise<WorkerSessionTokens> {
  return invokeWorkerAuth({ action: 'sign_in', phone, password });
}
