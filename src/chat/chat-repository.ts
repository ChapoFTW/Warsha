import { File } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import { emitMockRealtime } from '@/src/realtime/realtime-service';
import {
  disabledCommunicationCapabilities,
  likelyOffPlatformContact,
  safeAttachmentName,
} from './communication-policy';
import { isBookingChatActivated, isBookingChatWritable } from './chat-lifecycle';
import type {
  AbuseCategory,
  BookingMessage,
  ChatInboxItem,
  ChatPage,
  ChatRepository,
  MessageDraft,
  QuickReplyKey,
} from './chat-types';

const PAGE_SIZE = 30;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const BUCKET = 'chat-attachments';
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'application/pdf']);
const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const messageId = () => `mock-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const keyFor = (accountId: string, bookingId: string) => `warsha:chat:v2:${accountId}:${bookingId}`;
const readKeyFor = (accountId: string, bookingId: string) => `warsha:chat-read:v1:${accountId}:${bookingId}`;
const reportKeyFor = (accountId: string) => `warsha:chat-reports:v1:${accountId}`;
const delivery = (row: Record<string, unknown>) => row.read_at ? 'read' : row.delivered_at ? 'delivered' : 'sent';

function optional(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

function mapMessage(row: Record<string, unknown>): BookingMessage {
  const attachments = Array.isArray(row.message_attachments)
    ? row.message_attachments as Record<string, unknown>[]
    : [];
  const metadata = row.metadata && typeof row.metadata === 'object'
    ? row.metadata as Record<string, unknown>
    : {};
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    senderId: optional(row.sender_id),
    kind: String(row.message_type) as BookingMessage['kind'],
    body: optional(row.body),
    systemEvent: optional(metadata.event),
    quickReplyKey: optional(metadata.quick_reply_key) as QuickReplyKey | undefined,
    metadata,
    createdAt: String(row.created_at),
    deliveredAt: optional(row.delivered_at),
    readAt: optional(row.read_at),
    delivery: delivery(row),
    attachments: attachments.map((item) => ({
      id: String(item.id),
      path: String(item.storage_path),
      mimeType: String(item.mime_type ?? 'application/octet-stream'),
      fileName: optional(item.file_name),
      byteSize: typeof item.byte_size === 'number' ? item.byte_size : undefined,
      url: optional(item.signed_url),
    })),
  };
}

function mapInbox(row: Record<string, unknown>): ChatInboxItem {
  return {
    bookingId: String(row.bookingId),
    serviceId: optional(row.serviceId),
    serviceTranslationKey: optional(row.serviceTranslationKey),
    serviceName: String(row.serviceName ?? ''),
    status: String(row.status) as ChatInboxItem['status'],
    counterpartName: String(row.counterpartName ?? ''),
    lastMessageAt: optional(row.lastMessageAt),
    lastMessageKind: optional(row.lastMessageKind) as ChatInboxItem['lastMessageKind'],
    unreadCount: Number(row.unreadCount ?? 0),
    writable: Boolean(row.writable),
    writableUntil: optional(row.writableUntil),
  };
}

async function mockRead(accountId: string, bookingId: string): Promise<BookingMessage[]> {
  try {
    return JSON.parse((await Storage.getItem(keyFor(accountId, bookingId))) ?? '[]') as BookingMessage[];
  } catch {
    return [];
  }
}

async function mockWrite(accountId: string, bookingId: string, messages: BookingMessage[]) {
  await Storage.setItem(keyFor(accountId, bookingId), JSON.stringify(messages));
}

export async function appendMockDisputeConversationEvent(input: {
  bookingId: string;
  eventId: string;
  eventType: string;
  actor: 'customer' | 'worker' | 'staff' | 'system';
  note?: string;
}) {
  if (environment.dataMode !== 'mock') return;
  const isResponse = ['customer_response', 'worker_response', 'worker_accepted_responsibility', 'worker_contested'].includes(input.eventType);
  const message: BookingMessage = {
    id: `mock-dispute-message-${input.eventId}`,
    bookingId: input.bookingId,
    senderId: isResponse ? input.actor === 'customer' ? 'mock-customer' : 'mock-user' : undefined,
    kind: isResponse ? 'text' : 'system',
    body: isResponse ? input.note : undefined,
    systemEvent: isResponse ? undefined : `dispute_${input.eventType}`,
    metadata: { source_event_id: input.eventId, event: isResponse ? 'dispute_response' : `dispute_${input.eventType}` },
    createdAt: new Date().toISOString(),
    attachments: [],
    delivery: 'sent',
  };
  await Promise.all(['mock-customer', 'mock-user'].map(async accountId => {
    const current = await mockRead(accountId, input.bookingId);
    if (!current.some(item => item.id === message.id)) await mockWrite(accountId, input.bookingId, [...current, message]);
  }));
  emitMockRealtime({ table: 'messages', event: 'INSERT', id: message.id, bookingId: input.bookingId });
}

const mockRepository: ChatRepository = {
  async list(bookingId, accountId, offset = 0): Promise<ChatPage> {
    const items = (await mockRead(accountId, bookingId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items: items.slice(offset, offset + PAGE_SIZE), hasMore: offset + PAGE_SIZE < items.length };
  },
  async inbox(bookings, accountId) {
    const items = await Promise.all(bookings.filter(isBookingChatActivated).map(async (booking) => {
      const messages = await mockRead(accountId, booking.id);
      const lastReadAt = await Storage.getItem(readKeyFor(accountId, booking.id));
      const last = messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return {
        bookingId: booking.id,
        serviceId: booking.serviceId,
        serviceTranslationKey: booking.serviceTranslationKey ?? undefined,
        serviceName: booking.serviceName,
        status: booking.status,
        counterpartName: booking.customerName ?? '',
        lastMessageAt: last?.createdAt,
        lastMessageKind: last?.kind,
        unreadCount: messages.filter((message) => message.senderId !== accountId && (!lastReadAt || message.createdAt > lastReadAt)).length,
        writable: isBookingChatWritable(booking),
      } satisfies ChatInboxItem;
    }));
    return items.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
  },
  async send(booking, accountId, draft) {
    if (!isBookingChatWritable(booking)) throw new Error('Booking chat is read-only');
    const bookingId = booking.id;
    const now = new Date().toISOString();
    const attachment = draft.attachment ? [{
      id: messageId(),
      path: draft.attachment.uri,
      mimeType: draft.attachment.mimeType ?? 'application/octet-stream',
      fileName: safeAttachmentName(draft.attachment.fileName),
      url: draft.attachment.uri,
    }] : [];
    const message: BookingMessage = {
      id: messageId(),
      bookingId,
      senderId: accountId,
      kind: draft.kind,
      body: draft.kind === 'text' ? draft.body : undefined,
      quickReplyKey: draft.kind === 'quick_reply' ? draft.body as QuickReplyKey : undefined,
      createdAt: now,
      attachments: attachment,
      delivery: 'sent',
    };
    const current = await mockRead(accountId, bookingId);
    const next = [...current, message];
    if (draft.kind === 'text' && likelyOffPlatformContact(draft.body ?? '')) {
      next.push({
        id: messageId(),
        bookingId,
        kind: 'system',
        systemEvent: 'off_platform_reminder',
        createdAt: new Date(Date.now() + 1).toISOString(),
        attachments: [],
        delivery: 'sent',
      });
    }
    await mockWrite(accountId, bookingId, next);
    emitMockRealtime({ table: 'messages', event: 'INSERT', id: message.id, bookingId });
    return message;
  },
  async markRead(bookingId, accountId) {
    await Storage.setItem(readKeyFor(accountId, bookingId), new Date().toISOString());
  },
  async setTyping(bookingId, accountId, typing) {
    emitMockRealtime({ table: 'conversation_typing', event: typing ? 'INSERT' : 'DELETE', bookingId, id: accountId });
  },
  async typing() { return []; },
  async capabilities(booking) { return disabledCommunicationCapabilities(booking); },
  async report(bookingId, accountId, category, details, messageIdValue, idempotencyKey) {
    const raw = await Storage.getItem(reportKeyFor(accountId));
    const reports = raw ? JSON.parse(raw) as Record<string, unknown>[] : [];
    const existing = reports.find((report) => report.idempotencyKey === idempotencyKey);
    if (existing) return String(existing.id);
    const id = `mock-report-${Date.now()}`;
    reports.push({ id, bookingId, category, details, messageId: messageIdValue, idempotencyKey, createdAt: new Date().toISOString() });
    await Storage.setItem(reportKeyFor(accountId), JSON.stringify(reports));
    return id;
  },
};

async function signedMessages(rows: Record<string, unknown>[]) {
  const client = getSupabaseClient();
  return Promise.all(rows.map(async (row) => {
    const attachments = Array.isArray(row.message_attachments)
      ? row.message_attachments as Record<string, unknown>[]
      : [];
    if (attachments.length) {
      const { data, error } = await client.storage.from(BUCKET)
        .createSignedUrls(attachments.map((item) => String(item.storage_path)), 3600);
      if (error) throw error;
      row.message_attachments = attachments.map((item, index) => ({ ...item, signed_url: data?.[index]?.signedUrl }));
    }
    return mapMessage(row);
  }));
}

function normalizedMimeType(value: string | null | undefined) {
  return value === 'image/jpg' ? 'image/jpeg' : value;
}

async function uploadAttachment(bookingId: string, attachment: NonNullable<MessageDraft['attachment']>) {
  const client = getSupabaseClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Authentication required');
  const file = new File(attachment.uri);
  if (!file.exists || file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) throw new Error('Attachment exceeds size limit');
  const mimeType = normalizedMimeType(attachment.mimeType || file.type);
  if (!mimeType || !ACCEPTED_TYPES.has(mimeType)) throw new Error('Unsupported attachment type');
  const extension = EXTENSION[mimeType];
  const path = `${bookingId}/${auth.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const { error } = await client.storage.from(BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: mimeType, upsert: false });
  if (error) throw error;
  return { path, mimeType, fileName: safeAttachmentName(attachment.fileName), byteSize: file.size };
}

const MESSAGE_SELECT = 'id,booking_id,conversation_id,sender_id,message_type,body,metadata,created_at,delivered_at,read_at,message_attachments(id,storage_path,mime_type,file_name,byte_size,created_at)';

const supabaseRepository: ChatRepository = {
  async list(bookingId, _accountId, offset = 0) {
    const { data, error } = await getSupabaseClient().from('messages')
      .select(MESSAGE_SELECT)
      .eq('booking_id', bookingId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE);
    if (error) throw error;
    const rows = data ?? [];
    return {
      items: await signedMessages(rows.slice(0, PAGE_SIZE) as unknown as Record<string, unknown>[]),
      hasMore: rows.length > PAGE_SIZE,
    };
  },
  async inbox() {
    const { data, error } = await getSupabaseClient().rpc('get_my_booking_conversations');
    if (error) throw error;
    return (data ?? []).map((row: unknown) => mapInbox(row as Record<string, unknown>));
  },
  async send(booking, _accountId, draft) {
    const bookingId = booking.id;
    let uploaded: { path: string; mimeType: string; fileName: string; byteSize: number } | undefined;
    let messageCommitted = false;
    let rpcAttempted = false;
    try {
      if (draft.attachment) uploaded = await uploadAttachment(bookingId, draft.attachment);
      rpcAttempted = true;
      const { data, error } = await getSupabaseClient().rpc('send_booking_message_v2', {
        p_booking_id: bookingId,
        p_message_type: draft.kind,
        p_body: draft.body ?? null,
        p_attachment_path: uploaded?.path ?? null,
        p_attachment_mime_type: uploaded?.mimeType ?? null,
        p_attachment_file_name: uploaded?.fileName ?? null,
        p_client_id: draft.clientId,
      });
      if (error) throw error;
      messageCommitted = true;
      const { data: row, error: fetchError } = await getSupabaseClient().from('messages')
        .select(MESSAGE_SELECT)
        .eq('id', String(data))
        .single();
      if (fetchError) throw fetchError;
      const message = (await signedMessages([row as unknown as Record<string, unknown>]))[0];
      if (uploaded && !message.attachments.some((attachment) => attachment.path === uploaded?.path)) {
        await getSupabaseClient().storage.from(BUCKET).remove([uploaded.path]);
      }
      return message;
    } catch (reason) {
      const serverRejected = typeof (reason as { code?: unknown })?.code === 'string'
        && /^[0-9A-Z]{5}$/.test(String((reason as { code: string }).code));
      if (uploaded && !messageCommitted && (!rpcAttempted || serverRejected)) {
        await getSupabaseClient().storage.from(BUCKET).remove([uploaded.path]);
      }
      throw reason;
    }
  },
  async markRead(bookingId) {
    const { error } = await getSupabaseClient().rpc('mark_booking_messages_read', { p_booking_id: bookingId });
    if (error) throw error;
  },
  async setTyping(bookingId, _accountId, typing) {
    const { error } = await getSupabaseClient().rpc('set_booking_typing', { p_booking_id: bookingId, p_typing: typing });
    if (error) throw error;
  },
  async typing(bookingId) {
    const { data, error } = await getSupabaseClient().from('conversation_typing')
      .select('user_id')
      .eq('booking_id', bookingId)
      .gt('expires_at', new Date().toISOString());
    if (error) throw error;
    return (data ?? []).map((item) => String(item.user_id));
  },
  async capabilities(booking) {
    const { data, error } = await getSupabaseClient().rpc('get_booking_communication_capabilities', { p_booking_id: booking.id });
    if (error) throw error;
    const row = data as Record<string, unknown>;
    return {
      chatActivated: Boolean(row.chatActivated),
      chatWritable: Boolean(row.chatWritable),
      chatWritableUntil: optional(row.chatWritableUntil),
      callRelayAvailable: Boolean(row.callRelayAvailable),
      callRelayReason: String(row.callRelayReason ?? 'not_configured') as 'not_configured' | 'provider_unavailable',
      safetyReportAvailable: Boolean(row.safetyReportAvailable),
    };
  },
  async report(bookingId: string, _accountId: string, category: AbuseCategory, details: string, messageIdValue: string | undefined, idempotencyKey: string) {
    const { data, error } = await getSupabaseClient().rpc('report_booking_communication_abuse', {
      p_booking_id: bookingId,
      p_category: category,
      p_details: details.trim() || null,
      p_message_id: messageIdValue ?? null,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    return String(data);
  },
};

export const chatRepository: ChatRepository = environment.dataMode === 'supabase' ? supabaseRepository : mockRepository;
