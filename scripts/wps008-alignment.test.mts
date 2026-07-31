import {
  COMPLETED_CHAT_WINDOW_MS,
  isBookingChatWritable,
} from '../src/chat/chat-lifecycle.ts';
import {
  isValidPhone,
  isValidSmsOtp,
  normalizePhone,
} from '../src/auth/phone-auth.ts';

function equal<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const completedAt = '2026-07-29T12:00:00.000Z';
const completedBooking = {
  status: 'completed' as const,
  history: [{ status: 'completed' as const, at: completedAt }],
};

equal(normalizePhone('+20 (100) 123-4567'), '+201001234567', 'phone formatting is normalized');
equal(isValidPhone('+201001234567'), true, 'Egyptian E.164 phone is accepted');
equal(isValidPhone('01001234567'), true, 'Egyptian local phone format is accepted');
equal(isValidPhone('+0201001234567'), false, 'invalid E.164 country prefix is rejected');
equal(isValidSmsOtp('123456'), true, 'six-digit SMS OTP is accepted');
equal(isValidSmsOtp('12345'), false, 'short SMS OTP is rejected');
equal(COMPLETED_CHAT_WINDOW_MS, 172_800_000, 'completed chat window is exactly 48 hours');
equal(isBookingChatWritable({ status: 'confirmed', history: [] }, Date.parse(completedAt)), true, 'active booking chat is writable');
equal(isBookingChatWritable({ status: 'cancelled', history: [] }, Date.parse(completedAt)), false, 'cancelled booking chat locks immediately');
equal(isBookingChatWritable(completedBooking, Date.parse(completedAt) + COMPLETED_CHAT_WINDOW_MS - 1), true, 'completed chat remains writable before 48 hours');
equal(isBookingChatWritable(completedBooking, Date.parse(completedAt) + COMPLETED_CHAT_WINDOW_MS), false, 'completed chat locks exactly at 48 hours');
equal(isBookingChatWritable({ status: 'disputed', history: completedBooking.history }, Date.parse(completedAt) + COMPLETED_CHAT_WINDOW_MS), false, 'post-completion status cannot extend chat');
equal(isBookingChatWritable({ status: 'completed', history: [] }, Date.parse(completedAt)), false, 'missing completion evidence fails closed');

console.log('WPS-008 alignment unit tests passed: 13 assertions.');
