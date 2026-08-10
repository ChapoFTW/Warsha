import type { TranslationKey } from '@/src/i18n/translations';

/**
 * The signup screen has exactly one result at a time.
 *
 * It used to keep two independent strings — a green "notice" and a red
 * "message" — and clear only one of them when a new attempt started. A person
 * whose first attempt reached the confirmation-pending state and whose second
 * attempt failed was therefore shown both at once: an invitation to check an
 * inbox, directly above a statement that the account was not created. Both
 * cannot be true, and the person cannot tell which one is.
 *
 * Representing the result as one value makes that class of bug unrepresentable
 * rather than merely fixed: there is nowhere to put a second result.
 */

export type SignupState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'confirmation_required' }
  | { status: 'success' }
  | { status: 'actionable_error'; messageKey: TranslationKey };

export const signupIdle: SignupState = { status: 'idle' };

/** A new attempt discards the previous outcome before any await. */
export function signupSubmitting(): SignupState {
  return { status: 'submitting' };
}

export function signupConfirmationRequired(): SignupState {
  return { status: 'confirmation_required' };
}

export function signupSucceeded(): SignupState {
  return { status: 'success' };
}

export function signupFailed(messageKey: TranslationKey): SignupState {
  return { status: 'actionable_error', messageKey };
}

export function isSignupBusy(state: SignupState): boolean {
  return state.status === 'submitting';
}

/**
 * The pending notice and the error are read through these, so a caller cannot
 * render one without having excluded the other.
 */
export function signupPendingNotice(state: SignupState): boolean {
  return state.status === 'confirmation_required';
}

export function signupErrorKey(state: SignupState): TranslationKey | null {
  return state.status === 'actionable_error' ? state.messageKey : null;
}

/**
 * Changing the audience is a different application with different mandatory
 * agreements. Carrying a customer result onto the worker form would describe
 * an attempt that no longer exists.
 */
export function signupAfterRoleChange(): SignupState {
  return signupIdle;
}
