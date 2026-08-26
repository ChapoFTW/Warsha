'use client';

import { classifySignInIdentity } from '@/src/auth/auth-identifier';
import { safeAuthDiagnostic } from '@/src/auth/auth-errors';
import { confirmationResendErrorIsNeutral } from '@/src/auth/email-confirmation';
import { passwordMeetsPolicy } from '@/src/auth/password-policy';
import type { SupportedLanguage } from '@/src/i18n/language-preference';

import {
  classifySignUpError,
  diagnoseSignUpError,
  emailAcceptable,
  isCurrentSignupLegalManifest,
  nameAcceptable,
  normalizeEgyptianPhone,
  passwordAcceptable,
  phoneAcceptable,
  type SignupLegalAcceptance,
  type SignUpResult,
} from './signup.ts';
import { clearAllDrafts } from './draft-store.ts';
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

/**
 * Signing out clears the drafts as well as the session.
 *
 * A half-written request is not account data and does not belong to the
 * device once the person who wrote it has left it. Drafts are erased *before*
 * the sign-out call, so a network failure mid-sign-out cannot leave the work
 * of one account sitting on a machine somebody else is about to use. The
 * stored envelope also records whose draft it is and is refused on read when
 * that does not match, so this is the tidy path rather than the guarantee.
 */
export async function signOut(): Promise<void> {
  clearAllDrafts();
  await supabase().auth.signOut();
}

/**
 * Ask Auth to email a recovery link.
 *
 * **This never reports whether the address has an account**, and the absence of
 * that answer is the feature. Supabase deliberately succeeds for an unknown
 * address, and the caller is told the same thing either way, so the form cannot
 * be used to discover who is registered. Only transport and rate-limit
 * failures — facts about this request rather than about that person — are
 * distinguishable.
 *
 * The link is sent back to this origin. `app.usewarsha.com` requests a link to
 * `app.usewarsha.com/reset-password`; the app requests a `warsha://` link to
 * its own screen. Neither borrows the other's redirect, which is what lets web
 * recovery work without touching native configuration.
 */
export type ResetRequestFailure = 'invalid_email' | 'rate_limited' | 'network' | 'server';

export type ResetRequestResult =
  | { ok: true }
  | { ok: false; failure: ResetRequestFailure };

export async function requestPasswordReset(email: string): Promise<ResetRequestResult> {
  if (!emailAcceptable(email)) return { ok: false, failure: 'invalid_email' };
  try {
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (!error) return { ok: true };
    const status = (error as { status?: number }).status ?? 0;
    if (status === 429) return { ok: false, failure: 'rate_limited' };
    if (status === 0) return { ok: false, failure: 'network' };
    // Anything else is ours, not theirs. In particular a 4xx about the address
    // is not surfaced as "no such account" — see above.
    return { ok: false, failure: 'server' };
  } catch {
    return { ok: false, failure: 'network' };
  }
}

/**
 * Request a new signup confirmation without revealing account state.
 *
 * Confirmed, unknown, and otherwise ineligible addresses receive the same
 * neutral accepted result. Only request-level failures (validation, rate
 * limit, transport, service) are visible to the caller.
 */
export async function requestEmailConfirmation(email: string): Promise<ResetRequestResult> {
  if (!emailAcceptable(email)) return { ok: false, failure: 'invalid_email' };
  try {
    const { error } = await supabase().auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (!error) return { ok: true };
    if (confirmationResendErrorIsNeutral(error)) {
      console.warn('[Warsha confirmation resend]', safeAuthDiagnostic('confirmation-resend', error));
      return { ok: true };
    }
    const status = (error as { status?: number }).status ?? 0;
    if (status === 429) return { ok: false, failure: 'rate_limited' };
    if (status === 0) return { ok: false, failure: 'network' };
    return { ok: false, failure: 'server' };
  } catch {
    return { ok: false, failure: 'network' };
  }
}

/**
 * Set a new password on the session a recovery link established.
 *
 * `updateUser` is the same call `app/reset-password.tsx` makes, against the
 * same Auth. The policy check in front of it reads
 * `src/auth/password-policy.ts`, so the browser asks for exactly the password
 * the app would.
 */
export type PasswordUpdateFailure =
  | 'weak_password'
  | 'same_password'
  | 'session_expired'
  | 'rate_limited'
  | 'network'
  | 'server';

export type PasswordUpdateResult =
  | { ok: true }
  | { ok: false; failure: PasswordUpdateFailure };

export async function updatePassword(password: string): Promise<PasswordUpdateResult> {
  if (!passwordMeetsPolicy(password)) return { ok: false, failure: 'weak_password' };
  try {
    const { error } = await supabase().auth.updateUser({ password });
    if (!error) return { ok: true };
    const status = (error as { status?: number }).status ?? 0;
    const code = (error as { code?: string }).code ?? '';
    if (code === 'same_password') return { ok: false, failure: 'same_password' };
    if (code === 'weak_password') return { ok: false, failure: 'weak_password' };
    if (status === 401 || status === 403) return { ok: false, failure: 'session_expired' };
    if (status === 429) return { ok: false, failure: 'rate_limited' };
    if (status === 0) return { ok: false, failure: 'network' };
    return { ok: false, failure: 'server' };
  } catch {
    return { ok: false, failure: 'network' };
  }
}

/**
 * Close the recovery session once the password has been changed.
 *
 * Global scope, deliberately, and for the same reason the app does it: a
 * password reset is what somebody does when they believe their account is
 * compromised, so every other session that password could have opened is
 * revoked. Signing in again with the new password is the point, not an
 * inconvenience.
 */
export async function finishPasswordRecovery(): Promise<void> {
  await supabase().auth.signOut({ scope: 'global' }).catch(() => undefined);
}

/**
 * Create a customer account.
 *
 * The same `supabase.auth.signUp` call the app makes, with the same user
 * metadata keys, so an account created in a browser is indistinguishable from
 * one created on a phone — same `display_name`, `preferred_language`,
 * `account_role` and `contact_phone`, read by the same triggers.
 *
 * Legal acceptance is verified against the shared manifest before the call and
 * carried in the metadata; the database checks it again against its published
 * register and remains authoritative.
 *
 * Worker registration is deliberately NOT here. It goes through the worker
 * broker (`registerWorker`), which mints a session against a synthetic identity
 * and is a server-side trust boundary — calling it from a browser bundle would
 * move that boundary into the client.
 */
export async function signUpCustomer(input: {
  name: string;
  email: string;
  password: string;
  phone: string;
  language: SupportedLanguage;
  acceptances: readonly SignupLegalAcceptance[];
}): Promise<SignUpResult> {
  if (!nameAcceptable(input.name)) return { ok: false, failure: 'invalid_name' };
  if (!emailAcceptable(input.email)) return { ok: false, failure: 'invalid_email' };
  if (!phoneAcceptable(input.phone)) return { ok: false, failure: 'invalid_phone' };
  if (!passwordAcceptable(input.password)) return { ok: false, failure: 'weak_password' };
  const legalLanguage = input.language === 'ar' ? 'ar' : 'en';
  if (!isCurrentSignupLegalManifest('customer', legalLanguage, input.acceptances)) {
    return { ok: false, failure: 'legal_out_of_date' };
  }

  try {
    const { data, error } = await supabase().auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        data: {
          display_name: input.name.trim(),
          preferred_language: input.language,
          account_role: 'customer',
          contact_phone: normalizeEgyptianPhone(input.phone),
          legal_acceptances: input.acceptances,
        },
      },
    });
    if (error) {
      // The whole error, not just its message: the provider's `code` and HTTP
      // status classify far more reliably than prose, and reading only the
      // message is what turned "Error sending confirmation email" into a
      // generic "something went wrong on our side".
      reportSignUpDiagnostic(error);
      return { ok: false, failure: classifySignUpError(error) };
    }
    // A session means confirmation is disabled; otherwise the address must be
    // confirmed before the account can be used.
    return { ok: true, needsEmailConfirmation: !data.session };
  } catch (thrown) {
    // A throw here is usually a transport failure, but not always -- classify
    // it the same way rather than asserting it was the network.
    reportSignUpDiagnostic(thrown);
    return { ok: false, failure: classifySignUpError(thrown) };
  }
}

/**
 * What engineering sees when a signup fails. The customer never sees any of it.
 *
 * The payload is built from a fixed message table plus the provider's own code
 * and HTTP status -- never its prose, and never anything the person typed. No
 * address, no password, no token, so it is safe wherever browser logs end up.
 */
function reportSignUpDiagnostic(error: unknown): void {
  try {
    console.warn('[Warsha signup]', diagnoseSignUpError(error));
  } catch {
    // Diagnostics must never be the reason a signup failure goes unreported.
  }
}
