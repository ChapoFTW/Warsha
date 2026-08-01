import type { Booking } from '@/src/bookings/booking-types';
import { bookingChatWritableUntil, isBookingChatActivated, isBookingChatWritable } from './chat-lifecycle.ts';
import type { CommunicationCapabilities } from './chat-types';

const PHONE_PATTERN = /(?:\+?20[\s-]*1[0125]|01[0125])([\s-]*\d){8}/i;
const CONTACT_PATTERN = /whats[\s-]*app|واتساب|واتس\s*اب/i;

export function likelyOffPlatformContact(body: string) {
  return PHONE_PATTERN.test(body) || CONTACT_PATTERN.test(body);
}

export function disabledCommunicationCapabilities(booking: Booking): CommunicationCapabilities {
  const writableUntil = bookingChatWritableUntil(booking);
  return {
    chatActivated: isBookingChatActivated(booking),
    chatWritable: isBookingChatWritable(booking),
    chatWritableUntil: writableUntil ? new Date(writableUntil).toISOString() : undefined,
    callRelayAvailable: false,
    callRelayReason: 'not_configured',
    safetyReportAvailable: isBookingChatActivated(booking),
  };
}

export function safeAttachmentName(value: string | null | undefined) {
  const normalized = (value ?? 'document.pdf')
    .replace(/[\\/\u0000-\u001f\u007f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return normalized || 'document.pdf';
}
