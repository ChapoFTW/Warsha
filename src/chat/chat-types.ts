import type { Booking, BookingStatus } from '@/src/bookings/booking-types';

export const QUICK_REPLY_KEYS = [
  'on_my_way',
  'arrived',
  'need_access',
  'confirm_address',
  'running_10_late',
  'thank_you',
] as const;

export type QuickReplyKey = (typeof QUICK_REPLY_KEYS)[number];
export type MessageKind = 'text' | 'image' | 'file' | 'quick_reply' | 'system' | 'status' | 'running_late';
export type DeliveryState = 'sent' | 'delivered' | 'read';

export type ChatAttachment = {
  id: string;
  path: string;
  mimeType: string;
  fileName?: string;
  byteSize?: number;
  url?: string;
};

export type BookingMessage = {
  id: string;
  bookingId: string;
  senderId?: string;
  kind: MessageKind;
  body?: string;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
  systemEvent?: string;
  quickReplyKey?: QuickReplyKey;
  metadata?: Record<string, unknown>;
  attachments: ChatAttachment[];
  delivery: DeliveryState;
};

export type ChatPage = { items: BookingMessage[]; hasMore: boolean };

export type MessageDraft = {
  kind: 'text' | 'image' | 'file' | 'quick_reply';
  body?: string;
  attachment?: { uri: string; mimeType?: string | null; fileName?: string | null };
  clientId: string;
};

export type ChatInboxItem = {
  bookingId: string;
  serviceId?: string;
  serviceTranslationKey?: string;
  serviceName: string;
  status: BookingStatus;
  counterpartName: string;
  lastMessageAt?: string;
  lastMessageKind?: MessageKind;
  unreadCount: number;
  writable: boolean;
  writableUntil?: string;
};

export type CommunicationCapabilities = {
  chatActivated: boolean;
  chatWritable: boolean;
  chatWritableUntil?: string;
  callRelayAvailable: boolean;
  callRelayReason: 'not_configured' | 'provider_unavailable';
  safetyReportAvailable: boolean;
};

export const ABUSE_CATEGORIES = [
  'harassment',
  'threats',
  'hate',
  'sexual_content',
  'spam_scam',
  'off_platform_pressure',
  'privacy',
  'unsafe_behavior',
  'other',
] as const;
export type AbuseCategory = (typeof ABUSE_CATEGORIES)[number];

export type ChatRepository = {
  list: (bookingId: string, accountId: string, offset?: number) => Promise<ChatPage>;
  inbox: (bookings: Booking[], accountId: string) => Promise<ChatInboxItem[]>;
  send: (booking: Booking, accountId: string, draft: MessageDraft) => Promise<BookingMessage>;
  markRead: (bookingId: string, accountId: string) => Promise<void>;
  setTyping: (bookingId: string, accountId: string, typing: boolean) => Promise<void>;
  typing: (bookingId: string, accountId: string) => Promise<string[]>;
  capabilities: (booking: Booking) => Promise<CommunicationCapabilities>;
  report: (bookingId: string, accountId: string, category: AbuseCategory, details: string, messageId: string | undefined, idempotencyKey: string) => Promise<string>;
};
