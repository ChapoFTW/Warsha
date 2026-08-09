import type { FunctionsError } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/src/lib/supabase';

import { SafeAuthError } from './auth-errors';

type WorkerSessionTokens = { accessToken: string; refreshToken: string };

type WorkerRegistration = {
  fullName: string;
  phone: string;
  password: string;
  language: 'en' | 'ar';
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

async function invokeWorkerAuth(body: Record<string, unknown>): Promise<WorkerSessionTokens> {
  const { data, error } = await getSupabaseClient().functions.invoke('worker-auth', { body });
  if (error) {
    const code = await responseCode(error);
    if (code === 'invalid_phone') throw new SafeAuthError('authInvalidPhone');
    if (code === 'phone_in_use') throw new SafeAuthError('authPhoneInUse');
    if (code === 'invalid_credentials') throw new SafeAuthError('authInvalidCredentials');
    if (code === 'rate_limited') throw new SafeAuthError('authRateLimited');
    if (code === 'unavailable' || code === 'signup_failed') {
      throw new SafeAuthError('authServerError');
    }
    throw new SafeAuthError('authError');
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
  });
}

export function signInWorker(phone: string, password: string): Promise<WorkerSessionTokens> {
  return invokeWorkerAuth({ action: 'sign_in', phone, password });
}
