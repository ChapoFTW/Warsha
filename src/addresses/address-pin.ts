import type { Address } from '@/src/bookings/booking-types';

/**
 * Whether an address has a location its owner confirmed.
 *
 * Coordinates alone are not that. Since 202609170007 the server treats a pin as
 * confirmed only when `confirm_my_service_address` wrote it, refuses to let a
 * client stamp `pin_confirmed_at` itself, withdraws the confirmation when the
 * coordinates move any other way, and refuses a request from an address
 * without it. This reads the same fact, so a form never offers to send a
 * request the server will refuse.
 */
export function addressHasConfirmedPin(address: Pick<Address, 'latitude' | 'longitude' | 'pinConfirmed'>): boolean {
  return address.pinConfirmed === true
    && typeof address.latitude === 'number'
    && typeof address.longitude === 'number';
}

/** The refusal `create_marketplace_request` raises for an unconfirmed location. */
export const UNCONFIRMED_LOCATION_MESSAGE = 'Verified request location required';

type ErrorLike = { code?: unknown; message?: unknown };

/**
 * Whether a failed request was refused for its location. Matched on the
 * SQLSTATE and the message together: 55000 alone is any "not in a state to do
 * that", and the mock repository raises the same message without a code.
 */
export function isUnconfirmedLocationError(reason: unknown): boolean {
  const error = reason as ErrorLike | null | undefined;
  if (!error || typeof error !== 'object') return false;
  if (typeof error.message !== 'string' || !error.message.includes(UNCONFIRMED_LOCATION_MESSAGE)) return false;
  return error.code === undefined || error.code === '55000';
}
