'use client';

import { classifySignInIdentity } from '@/src/auth/auth-identifier';

import { supabase } from './supabase.ts';

/**
 * Signing in, without asking anybody what kind of account they have.
 *
 * The identifier's shape selects the credential path — an address goes to
 * Supabase password auth, a phone number to the trusted worker broker — and
 * `classifySignInIdentity` is the same function the mobile client uses to make
 * that decision. Nobody is asked to declare a role, and the synthetic address
 * behind a worker account is never shown or mentioned.
 */

export type SignInFailure =
  | 'invalid_identifier'
  | 'invalid_credentials'
  | 'rate_limited'
  | 'outdated_client'
  | 'network'
  | 'server';

export type SignInResult =
  | { ok: true }
  | { ok: false; failure: SignInFailure };

/**
 * Broker codes mapped to something a person can act on.
 *
 * Every code the worker broker can return has an entry. The previous mobile
 * fallback collapsed a stale build, a duplicate phone and a transport failure
 * into one apology, which is the answer that helps nobody.
 */
const BROKER_FAILURES: Record<string, SignInFailure> = {
  invalid_phone: 'invalid_identifier',
  invalid_credentials: 'invalid_credentials',
  rate_limited: 'rate_limited',
  legal_acceptance_required: 'outdated_client',
  legal_acceptance_stale: 'outdated_client',
  invalid_request: 'outdated_client',
  method_not_allowed: 'outdated_client',
  unavailable: 'server',
  signup_failed: 'server',
  phone_in_use: 'invalid_credentials',
};

async function brokerCode(error: unknown): Promise<string | null> {
  const context = (error as { context?: { clone?: () => Response } })?.context;
  const response = context?.clone?.() ?? (context as Response | undefined);
  if (!response?.json) return null;
  try {
    const payload = await response.json() as { code?: unknown };
    return typeof payload?.code === 'string' ? payload.code : null;
  } catch {
    return null;
  }
}

export async function signIn(identifier: string, password: string): Promise<SignInResult> {
  const identity = classifySignInIdentity(identifier);
  if (!identity) return { ok: false, failure: 'invalid_identifier' };

  const client = supabase();

  if (identity.kind === 'customer_email') {
    const { error } = await client.auth.signInWithPassword({
      email: identity.email,
      password,
    });
    if (!error) return { ok: true };
    // Anti-enumeration: a wrong password and an unknown address produce the
    // same answer, because distinguishing them is how somebody discovers who
    // has an account.
    const status = (error as { status?: number }).status ?? 0;
    if (status === 429) return { ok: false, failure: 'rate_limited' };
    if (status >= 500) return { ok: false, failure: 'server' };
    if (status === 0) return { ok: false, failure: 'network' };
    return { ok: false, failure: 'invalid_credentials' };
  }

  // Worker: the broker resolves the phone to an internal identity and returns
  // session tokens. The synthetic address never reaches this code.
  const { data, error } = await client.functions.invoke('worker-auth', {
    body: { action: 'sign_in', phone: identity.phone, password },
  });

  if (error) {
    const code = await brokerCode(error);
    if (!code) return { ok: false, failure: 'network' };
    return { ok: false, failure: BROKER_FAILURES[code] ?? 'server' };
  }

  const tokens = data as { accessToken?: string; refreshToken?: string } | null;
  if (!tokens?.accessToken || !tokens.refreshToken) {
    return { ok: false, failure: 'server' };
  }

  const { error: sessionError } = await client.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  return sessionError ? { ok: false, failure: 'server' } : { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}
