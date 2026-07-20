import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

export type RealtimeTable = 'notifications' | 'bookings' | 'booking_status_history' | 'booking_attachments';
export type RealtimeChange = { table: RealtimeTable; event: 'INSERT' | 'UPDATE' | 'DELETE'; id?: string };
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

function subscribeChannel(
  name: string,
  bindings: { table: RealtimeTable; filter: string }[],
  listener: RealtimeListener,
  connection?: (status: RealtimeConnection) => void,
): Unsubscribe {
  if (environment.dataMode === 'mock') return mockSubscribe(listener);
  const client = getSupabaseClient();
  let channel: RealtimeChannel = client.channel(name);
  for (const binding of bindings) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: binding.table, filter: binding.filter }, (payload) => {
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

export const realtimeService = {
  notifications(userId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`notifications:${userId}`, [{ table: 'notifications', filter: `user_id=eq.${userId}` }], listener, connection);
  },
  customerBookings(userId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`customer-bookings:${userId}`, [{ table: 'bookings', filter: `customer_id=eq.${userId}` }], listener, connection);
  },
  providerJobs(providerId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`provider-jobs:${providerId}`, [{ table: 'bookings', filter: `provider_id=eq.${providerId}` }], listener, connection);
  },
  bookingDetail(bookingId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`booking-detail:${bookingId}`, [
      { table: 'bookings', filter: `id=eq.${bookingId}` },
      { table: 'booking_status_history', filter: `booking_id=eq.${bookingId}` },
      { table: 'booking_attachments', filter: `booking_id=eq.${bookingId}` },
    ], listener, connection);
  },
};
