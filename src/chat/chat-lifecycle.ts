import type { Booking } from '@/src/bookings/booking-types';

export const COMPLETED_CHAT_WINDOW_MS = 48 * 60 * 60 * 1000;
const ACTIVATED = new Set([
  'confirmed',
  'provider_on_the_way',
  'provider_arrived',
  'job_started',
  'work_in_progress',
  'completed',
  'disputed',
  'refunded',
  'no_show',
]);

export function isBookingChatActivated(booking: Pick<Booking, 'status' | 'history'>) {
  return ACTIVATED.has(booking.status) || booking.history.some((event) => ACTIVATED.has(event.status));
}

export function bookingCompletedAt(booking: Pick<Booking, 'history'>) {
  const completion = booking.history.find((event) => event.status === 'completed');
  return completion ? Date.parse(completion.at) : undefined;
}

export function bookingChatWritableUntil(booking: Pick<Booking, 'status' | 'history'>) {
  if (!isBookingChatActivated(booking) || booking.status === 'cancelled') return undefined;
  const completedAt = bookingCompletedAt(booking);
  return completedAt === undefined || !Number.isFinite(completedAt) ? undefined : completedAt + COMPLETED_CHAT_WINDOW_MS;
}

export function isBookingChatWritable(booking: Pick<Booking, 'status' | 'history'>, now = Date.now()) {
  if (!isBookingChatActivated(booking) || booking.status === 'cancelled') return false;
  const completedAt = bookingCompletedAt(booking);
  if (completedAt === undefined) return !['completed', 'disputed', 'refunded'].includes(booking.status);
  return Number.isFinite(completedAt) && now < completedAt + COMPLETED_CHAT_WINDOW_MS;
}
