import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import { realtimeChannels, type RealtimeBinding, type RealtimeTable } from './realtime-channels';

export type { RealtimeTable } from './realtime-channels';
export type RealtimeChange = { table: RealtimeTable; event: 'INSERT' | 'UPDATE' | 'DELETE'; id?: string; bookingId?: string };
export type RealtimeConnection = 'connected' | 'reconnecting' | 'error';
export type RealtimeListener = (change: RealtimeChange) => void;
export type Unsubscribe = () => void;

const mockListeners = new Set<RealtimeListener>();
export function emitMockRealtime(change: RealtimeChange) {
  for (const listener of mockListeners) listener(change);
}

function mockSubscribe(listener: RealtimeListener): Unsubscribe {
  mockListeners.add(listener);
  return () => { mockListeners.delete(listener); };
}

function rowId(payload: RealtimePostgresChangesPayload<Record<string, unknown>>) {
  const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
  return typeof row.id === 'string' ? row.id : undefined;
}

/**
 * The native transport.
 *
 * WHAT EACH CHANNEL WATCHES IS NOT DECIDED HERE. It comes from
 * `realtime-channels.ts`, which the browser reads too, so a subscription cannot
 * bind one set of tables on a phone and another in a tab. This file is the
 * React Native half: the Expo Supabase client, the mock-mode short circuit, and
 * the connection callback.
 */
function subscribeChannel(
  name: string,
  bindings: readonly RealtimeBinding[],
  listener: RealtimeListener,
  connection?: (status: RealtimeConnection) => void,
): Unsubscribe {
  if (environment.dataMode === 'mock') return mockSubscribe(listener);
  const client = getSupabaseClient();
  let channel: RealtimeChannel = client.channel(name);
  for (const binding of bindings) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: binding.table, ...(binding.filter ? { filter: binding.filter } : {}), select: ['id'] }, (payload) => {
      listener({ table: binding.table, event: payload.eventType, id: rowId(payload) });
    });
  }
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') connection?.('connected');
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      if (__DEV__) console.warn('[Warsha realtime]', name, status);
      connection?.('error');
    } else if (status === 'CLOSED') connection?.('reconnecting');
  });
  return () => { void client.removeChannel(channel); };
}

type Connection = (status: RealtimeConnection) => void;

function bind(spec: { name: string; bindings: RealtimeBinding[] }) {
  return (listener: RealtimeListener, connection?: Connection) =>
    subscribeChannel(spec.name, spec.bindings, listener, connection);
}

export const realtimeService = {
  marketplaceProviders: (listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.marketplaceProviders())(listener, connection),
  customerMarketplaceRequests: (userId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.customerMarketplaceRequests(userId))(listener, connection),
  workerMarketplaceInvitations: (providerId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.workerMarketplaceInvitations(providerId))(listener, connection),
  providerVerification: (providerId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.providerVerification(providerId))(listener, connection),
  notifications: (userId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.notifications(userId))(listener, connection),
  customerBookings: (userId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.customerBookings(userId))(listener, connection),
  providerJobs: (providerId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.providerJobs(providerId))(listener, connection),
  providerFinances: (providerId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.providerFinances(providerId))(listener, connection),
  bookingPayment: (bookingId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.bookingPayment(bookingId))(listener, connection),
  providerReviews: (providerId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.providerReviews(providerId))(listener, connection),
  bookingReview: (bookingId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.bookingReview(bookingId))(listener, connection),
  reviewDetail: (reviewId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.reviewDetail(reviewId))(listener, connection),
  bookingDetail: (bookingId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.bookingDetail(bookingId))(listener, connection),
  bookingOperations: (bookingId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.bookingOperations(bookingId))(listener, connection),
  bookingDispute: (bookingId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.bookingDispute(bookingId))(listener, connection),
  bookingConversation: (bookingId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.bookingConversation(bookingId))(listener, connection),
  requestConversation: (requestId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.requestConversation(requestId))(listener, connection),
  bookingConversationInbox: (userId: string, listener: RealtimeListener, connection?: Connection) =>
    bind(realtimeChannels.bookingConversationInbox(userId))(listener, connection),
};
