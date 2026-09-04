/**
 * Reaching the other person on a job, by telephone.
 *
 * ## The rule, restated where the clients can see it
 *
 * A telephone number is fetched at the moment somebody presses Call, for one
 * booking they are part of, and is never stored, cached, logged or put into any
 * payload a screen renders. `get_booking_counterparty_contact` decides who the
 * counterparty is from the booking; there is no user parameter, so there is
 * nothing here that can be pointed at an arbitrary account.
 *
 * `booking_contact_is_available` answers the different, cheaper question a
 * screen actually has — "should a Call control exist here?" — and returns no
 * contact data at all. Drawing the control must never require fetching a number,
 * or every render of every booking list would pull telephone numbers it has no
 * use for.
 *
 * ## Why this module exists rather than two `supabase.rpc` calls
 *
 * Because the number must not be *kept*. A shared helper that returns a `tel:`
 * URL and forgets is much harder to misuse than an RPC result each screen holds
 * in state and then, six months later, renders "for convenience". Nothing here
 * returns the phone number to a caller that did not ask to dial it.
 */

/** The states in which Warsha considers a call appropriate. Server-authoritative. */
export type BookingContact = {
  bookingId: string;
  callerRole: 'customer' | 'worker';
  counterpartyRole: 'customer' | 'worker';
  displayName: string;
  /** Null when the counterparty has no number on file. Not an error. */
  phone: string | null;
  callable: boolean;
};

/** The domain code the RPC raises when the booking is not in a callable state. */
export const BOOKING_CONTACT_UNAVAILABLE_CODE = 'WC001';
export const BOOKING_CONTACT_UNAVAILABLE_TOKEN = 'booking_contact_unavailable';

type ErrorLike = { code?: unknown; message?: unknown };

export function isBookingContactUnavailable(reason: unknown): boolean {
  const error = reason as ErrorLike | null | undefined;
  if (!error || typeof error !== 'object') return false;
  if (error.code === BOOKING_CONTACT_UNAVAILABLE_CODE) return true;
  return typeof error.message === 'string' && error.message.includes(BOOKING_CONTACT_UNAVAILABLE_TOKEN);
}

export function parseBookingContact(value: unknown): BookingContact | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const role = raw.callerRole === 'worker' ? 'worker' : raw.callerRole === 'customer' ? 'customer' : null;
  if (!role || typeof raw.bookingId !== 'string') return null;
  const phone = typeof raw.phone === 'string' && raw.phone.trim().length > 0 ? raw.phone.trim() : null;
  return {
    bookingId: raw.bookingId,
    callerRole: role,
    counterpartyRole: role === 'customer' ? 'worker' : 'customer',
    displayName: typeof raw.displayName === 'string' ? raw.displayName : '',
    phone,
    // Recomputed rather than trusted: a `callable: true` with no number would
    // render a control that cannot work.
    callable: phone !== null,
  };
}

/**
 * A number as a `tel:` URI, or null if it is not one that can be dialled.
 *
 * Egyptian numbers arrive from `auth.users.phone` in E.164 (`+2010…`), but a
 * number typed into a profile may carry spaces, dashes or parentheses. `tel:`
 * tolerates none of that reliably across platforms, so everything that is not a
 * digit or a leading plus is removed.
 *
 * Returning null rather than a best guess is the point: a malformed number
 * should make the Call action absent, not make it open a dialler with rubbish
 * in it. The brief's requirement is "no crashes"; the honest version of that is
 * "no action that cannot work".
 */
export function telUri(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/\D/g, '');
  // Shorter than seven digits is not a telephone number anywhere Warsha
  // operates; longer than fifteen exceeds E.164 and is a data error.
  if (digits.length < 7 || digits.length > 15) return null;
  return `tel:${plus}${digits}`;
}
