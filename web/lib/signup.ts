import {
  classifyAuthFailure, safeAuthDiagnostic, type AuthFailure,
} from '../../src/auth/auth-errors.ts';
import {
  isCurrentSignupLegalManifest,
  signupLegalDocuments,
  signupLegalManifest,
  type SignupLegalAcceptance,
  type SignupRole,
} from '../../src/legal/signup-legal.ts';

/**
 * Web account creation, on the same authority the app uses.
 *
 * The legal manifest is the part that must not be reimplemented. Warsha binds
 * every acceptance to a document key, a version, a language and the SHA-256 of
 * the rendered text, and `legal_acceptances` is append-only. A web-only
 * approximation of that would produce acceptances the database cannot verify,
 * which is worse than no acceptance at all — so this module reads
 * `src/legal/signup-legal.ts`, the same module the mobile client calls.
 *
 * `isCurrentSignupLegalManifest` is defence in depth, not the authority: the
 * database performs the same comparison against its published register and
 * remains authoritative. Checking here means somebody is told before a network
 * call rather than after one.
 */
export {
  isCurrentSignupLegalManifest,
  signupLegalDocuments,
  signupLegalManifest,
  type SignupLegalAcceptance,
  type SignupRole,
};

/** What account creation can fail with, kept indistinguishable where it must be. */
export type SignUpFailure =
  | 'invalid_name'
  | 'invalid_email'
  | 'invalid_phone'
  | 'weak_password'
  | 'legal_not_accepted'
  | 'legal_out_of_date'
  /**
   * Deliberately shared by "this address already has an account" and several
   * other server refusals.
   *
   * Supabase does not tell an anonymous caller whether an address exists, and
   * Warsha must not either: a signup form that answers that question is an
   * account-enumeration oracle. The person is told to try signing in, which is
   * true and useful whether or not the address is registered.
   */
  | 'already_registered_or_refused'
  | 'rate_limited'
  /**
   * The account was NOT created: Auth could not send the confirmation email,
   * and it rolls the signup back when the mailer fails.
   *
   * This used to land in `server` — "Something went wrong on our side" — which
   * is what a customer saw on the deployed development environment while the
   * real cause was that the project could not deliver mail at all. Same
   * sentence for a five-second blip and a completely unusable signup.
   */
  | 'email_delivery'
  /**
   * The provider refused to send to this specific address. Distinct from a
   * delivery failure because retrying will not help: it is the address, not
   * the moment.
   */
  | 'email_not_authorized'
  /** Account setup was rejected while the account was being created. */
  | 'account_setup'
  | 'network'
  | 'server';

export type SignUpResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; failure: SignUpFailure };

/** Warsha's minimum. The database and GoTrue both enforce their own. */
export const PASSWORD_MIN = 8;

export function passwordAcceptable(password: string): boolean {
  return password.length >= PASSWORD_MIN;
}

export function nameAcceptable(name: string): boolean {
  return name.trim().length >= 2;
}

/**
 * Egyptian mobile numbers, in the shape the worker broker expects.
 *
 * Not a second validator: the same normalisation the app performs, so a number
 * accepted on a phone is accepted in a browser and vice versa.
 */
export function normalizeEgyptianPhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+20')) return digits;
  if (digits.startsWith('20')) return `+${digits}`;
  if (digits.startsWith('0')) return `+20${digits.slice(1)}`;
  if (digits.startsWith('1')) return `+20${digits}`;
  return digits;
}

export function phoneAcceptable(input: string): boolean {
  return /^\+201[0-25]\d{8}$/.test(normalizeEgyptianPhone(input));
}

export function emailAcceptable(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.length > 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Map a server refusal without leaking which accounts exist.
 *
 * Everything that could distinguish "registered" from "not registered"
 * collapses into one outcome.
 */
/**
 * Web's signup failures, derived from the shared auth taxonomy.
 *
 * This used to be a five-line regex ladder over `error.message`, and it was
 * weaker than the classifier the mobile client already had: it read only the
 * message, never the provider's `code` or HTTP status, and anything it did not
 * recognise became `server`. "Error sending confirmation email" matched none of
 * its patterns, so a project that could not send mail at all reported the same
 * "Something went wrong on our side" as a transient blip.
 *
 * Two implementations of "what went wrong signing up" is one too many, so this
 * one is gone. `classifyAuthFailure` is the authority for every Warsha surface;
 * this only projects its result onto the smaller vocabulary the signup form
 * renders.
 */
const FAILURE_OF_AUTH: Partial<Record<AuthFailure, SignUpFailure>> = {
  authInvalidEmail: 'invalid_email',
  authWeakPassword: 'weak_password',
  authInvalidPhone: 'invalid_phone',
  authRateLimited: 'rate_limited',
  authEmailDeliveryFailed: 'email_delivery',
  authEmailDeliveryRestricted: 'email_not_authorized',
  authSignupDatabaseError: 'account_setup',
  authNetworkError: 'network',
  // Every server refusal a signup form must not tell apart for the caller:
  // "this address already has an account", signup disabled, captcha refused.
  // Answering which one would make the form an account-enumeration oracle.
  authSignupUnavailable: 'already_registered_or_refused',
};

export function classifySignUpError(error: unknown): SignUpFailure {
  const failure = classifyAuthFailure(
    typeof error === 'string' ? new Error(error) : error,
    'sign-up',
  );
  return FAILURE_OF_AUTH[failure] ?? 'server';
}

/**
 * What engineering gets to see, and the customer never does.
 *
 * The safe message is drawn from a fixed table rather than the provider's
 * text, and no address, password or token is included.
 */
export function diagnoseSignUpError(error: unknown) {
  return safeAuthDiagnostic('sign-up', error);
}

/** Whether trying the same details again could plausibly succeed. */
export function signUpRetryable(failure: SignUpFailure): boolean {
  return failure === 'network' || failure === 'server'
    || failure === 'email_delivery' || failure === 'account_setup'
    || failure === 'rate_limited';
}
