import Storage from 'expo-sqlite/kv-store';
import { File } from 'expo-file-system';

import type { Booking } from '@/src/bookings/booking-types';
import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import { emitMockRealtime } from '@/src/realtime/realtime-service';
import type { BookingMessage, ChatPage, MessageDraft } from './chat-types';
import { isBookingChatWritable } from './chat-lifecycle';

const PAGE_SIZE = 30;
const BUCKET = 'chat-attachments';
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const keyFor = (bookingId: string) => `warsha:chat:v1:${bookingId}`;
const messageId = () => `mock-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const delivery = (row: Record<string, unknown>) => row.read_at ? 'read' : row.delivered_at ? 'delivered' : 'sent';

function mapMessage(row: Record<string, unknown>): BookingMessage {
  const attachments = Array.isArray(row.message_attachments) ? row.message_attachments as Record<string, unknown>[] : [];
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  return { id: String(row.id), bookingId: String(row.booking_id), senderId: typeof row.sender_id === 'string' ? row.sender_id : undefined, kind: String(row.message_type) as BookingMessage['kind'], body: typeof row.body === 'string' ? row.body : undefined, systemEvent: typeof metadata.event === 'string' ? metadata.event : undefined, createdAt: String(row.created_at), deliveredAt: typeof row.delivered_at === 'string' ? row.delivered_at : undefined, readAt: typeof row.read_at === 'string' ? row.read_at : undefined, delivery: delivery(row), attachments: attachments.map(item => ({ id: String(item.id), path: String(item.storage_path), mimeType: String(item.mime_type ?? 'image/jpeg'), url: typeof item.signed_url === 'string' ? item.signed_url : undefined })) };
}

async function mockRead(bookingId: string): Promise<BookingMessage[]> { try { return JSON.parse((await Storage.getItem(keyFor(bookingId))) ?? '[]') as BookingMessage[]; } catch { return []; } }
async function mockWrite(bookingId: string, messages: BookingMessage[]) { await Storage.setItem(keyFor(bookingId), JSON.stringify(messages)); }

const mockRepository = {
  async list(bookingId: string, offset = 0): Promise<ChatPage> { const items = (await mockRead(bookingId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); return { items: items.slice(offset, offset + PAGE_SIZE), hasMore: offset + PAGE_SIZE < items.length }; },
  async send(booking: Booking, draft: MessageDraft): Promise<BookingMessage> { if (!isBookingChatWritable(booking)) throw new Error('Booking chat is read-only'); const bookingId=booking.id; const now = new Date().toISOString(); const attachment = draft.attachment ? [{ id: messageId(), path: draft.attachment.uri, mimeType: draft.attachment.mimeType ?? 'image/jpeg', url: draft.attachment.uri }] : []; const message: BookingMessage = { id: messageId(), bookingId, senderId: 'mock-user', kind: draft.kind, body: draft.body, createdAt: now, attachments: attachment, delivery: 'sent' }; const current = await mockRead(bookingId); await mockWrite(bookingId, [...current, message]); emitMockRealtime({ table: 'messages', event: 'INSERT', id: message.id, bookingId }); return message; },
  async markRead(bookingId: string) { const current = await mockRead(bookingId); const now = new Date().toISOString(); await mockWrite(bookingId, current.map(item => item.senderId === 'mock-user' ? item : { ...item, deliveredAt: item.deliveredAt ?? now, readAt: item.readAt ?? now, delivery: 'read' })); },
  async setTyping(bookingId: string, typing: boolean) { emitMockRealtime({ table: 'conversation_typing', event: typing ? 'INSERT' : 'DELETE', bookingId }); },
  async typing() { return [] as string[]; },
};

async function signedMessages(rows: Record<string, unknown>[]) {
  const client = getSupabaseClient();
  return Promise.all(rows.map(async row => { const attachments = Array.isArray(row.message_attachments) ? row.message_attachments as Record<string, unknown>[] : []; if (attachments.length) { const { data } = await client.storage.from(BUCKET).createSignedUrls(attachments.map(item => String(item.storage_path)), 3600); row.message_attachments = attachments.map((item, index) => ({ ...item, signed_url: data?.[index]?.signedUrl })); } return mapMessage(row); }));
}
async function uploadAttachment(bookingId: string, attachment: NonNullable<MessageDraft['attachment']>) {
  const client = getSupabaseClient(); const { data: auth, error: authError } = await client.auth.getUser(); if (authError) throw authError; if (!auth.user) throw new Error('Authentication required');
  const file = new File(attachment.uri); if (file.size > 8 * 1024 * 1024) throw new Error('Image exceeds size limit');
  const extension = file.extension || '.jpg'; const path = `${bookingId}/${auth.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`; const mimeType = attachment.mimeType || file.type || 'image/jpeg'; if (!ACCEPTED_IMAGE_TYPES.has(mimeType)) throw new Error('Unsupported image type');
  const { error } = await client.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: mimeType, upsert: false }); if (error) throw error;
  return { path, mimeType };
}
const supabaseRepository = {
  async list(bookingId: string, offset = 0): Promise<ChatPage> { const { data, error } = await getSupabaseClient().from('messages').select('id,booking_id,conversation_id,sender_id,message_type,body,metadata,created_at,delivered_at,read_at,message_attachments(id,storage_path,mime_type,created_at)').eq('booking_id', bookingId).is('deleted_at', null).order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE); if (error) throw error; const rows = data ?? []; return { items: await signedMessages((rows.slice(0, PAGE_SIZE)) as Record<string, unknown>[]), hasMore: rows.length > PAGE_SIZE }; },
  async send(booking: Booking, draft: MessageDraft): Promise<BookingMessage> { const bookingId=booking.id; let uploaded: { path: string; mimeType: string } | undefined; try { if (draft.attachment) uploaded = await uploadAttachment(bookingId, draft.attachment); const { data, error } = await getSupabaseClient().rpc('send_booking_message', { p_booking_id: bookingId, p_message_type: draft.kind, p_body: draft.body ?? null, p_attachment_path: uploaded?.path ?? null, p_attachment_mime_type: uploaded?.mimeType ?? null, p_client_id: draft.clientId }); if (error) throw error; const { data: row, error: fetchError } = await getSupabaseClient().from('messages').select('id,booking_id,conversation_id,sender_id,message_type,body,metadata,created_at,delivered_at,read_at,message_attachments(id,storage_path,mime_type,created_at)').eq('id', String(data)).single(); if (fetchError) throw fetchError; return (await signedMessages([row as Record<string, unknown>]))[0]; } catch (reason) { if (uploaded) await getSupabaseClient().storage.from(BUCKET).remove([uploaded.path]); throw reason; } },
  async markRead(bookingId: string) { const { error } = await getSupabaseClient().rpc('mark_booking_messages_read', { p_booking_id: bookingId }); if (error) throw error; },
  async setTyping(bookingId: string, typing: boolean) { const { error } = await getSupabaseClient().rpc('set_booking_typing', { p_booking_id: bookingId, p_typing: typing }); if (error) throw error; },
  async typing(bookingId: string) { const { data, error } = await getSupabaseClient().from('conversation_typing').select('user_id').eq('booking_id', bookingId).gt('expires_at', new Date().toISOString()); if (error) throw error; return (data ?? []).map(item => String(item.user_id)); },
};

export const chatRepository = environment.dataMode === 'supabase' ? supabaseRepository : mockRepository;
