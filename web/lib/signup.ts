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
export function classifySignUpError(message: string | undefined): SignUpFailure {
  const text = message ?? '';
  if (/rate limit|too many/i.test(text)) return 'rate_limited';
  if (/password/i.test(text)) return 'weak_password';
  if (/fetch|network/i.test(text)) return 'network';
  if (/already|registered|exists|duplicate|unique/i.test(text)) {
    return 'already_registered_or_refused';
  }
  return 'server';
}
