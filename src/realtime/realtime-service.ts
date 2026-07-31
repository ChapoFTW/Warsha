import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

export type RealtimeTable = 'notifications' | 'bookings' | 'booking_status_history' | 'booking_attachments' | 'reviews' | 'review_responses' | 'review_attachments' | 'messages' | 'message_attachments' | 'conversation_typing' | 'provider_verifications' | 'provider_profiles' | 'financial_booking_payments' | 'provider_earnings_ledger' | 'provider_withdrawal_requests' | 'financial_refunds' | 'marketplace_requests' | 'quote_invitations' | 'worker_quotes';
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

function subscribeChannel(
  name: string,
  bindings: { table: RealtimeTable; filter?: string }[],
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

export const realtimeService = {
  marketplaceProviders(listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel('marketplace-providers', [{ table: 'provider_profiles' }], listener, connection);
  },
  customerMarketplaceRequests(userId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`marketplace-requests:${userId}`, [
      { table: 'marketplace_requests', filter: `customer_id=eq.${userId}` },
      { table: 'worker_quotes' },
    ], listener, connection);
  },
  workerMarketplaceInvitations(providerId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`marketplace-invitations:${providerId}`, [
      { table: 'quote_invitations', filter: `provider_id=eq.${providerId}` },
      { table: 'worker_quotes', filter: `provider_id=eq.${providerId}` },
    ], listener, connection);
  },
  providerVerification(providerId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`provider-verification:${providerId}`, [{ table: 'provider_verifications', filter: `provider_id=eq.${providerId}` }, { table: 'provider_profiles', filter: `id=eq.${providerId}` }], listener, connection);
  },
  notifications(userId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`notifications:${userId}`, [{ table: 'notifications', filter: `user_id=eq.${userId}` }], listener, connection);
  },
  customerBookings(userId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`customer-bookings:${userId}`, [{ table: 'bookings', filter: `customer_id=eq.${userId}` }], listener, connection);
  },
  providerJobs(providerId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`provider-jobs:${providerId}`, [{ table: 'bookings', filter: `provider_id=eq.${providerId}` }], listener, connection);
  },
  providerFinances(providerId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`provider-finances:${providerId}`, [
      { table: 'provider_earnings_ledger', filter: `provider_id=eq.${providerId}` },
      { table: 'provider_withdrawal_requests', filter: `provider_id=eq.${providerId}` },
    ], listener, connection);
  },
  bookingPayment(bookingId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`booking-payment:${bookingId}`, [
      { table: 'financial_booking_payments', filter: `booking_id=eq.${bookingId}` },
    ], listener, connection);
  },
  providerReviews(providerId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`provider-reviews:${providerId}`, [{ table: 'reviews', filter: `provider_id=eq.${providerId}` }, { table: 'review_responses', filter: `provider_id=eq.${providerId}` }], listener, connection);
  },
  bookingReview(bookingId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`booking-review:${bookingId}`, [{ table: 'reviews', filter: `booking_id=eq.${bookingId}` }], listener, connection);
  },
  reviewDetail(reviewId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`review-detail:${reviewId}`, [{ table: 'reviews', filter: `id=eq.${reviewId}` }, { table: 'review_responses', filter: `review_id=eq.${reviewId}` }, { table: 'review_attachments', filter: `review_id=eq.${reviewId}` }], listener, connection);
  },
  bookingDetail(bookingId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`booking-detail:${bookingId}`, [
      { table: 'bookings', filter: `id=eq.${bookingId}` },
      { table: 'booking_status_history', filter: `booking_id=eq.${bookingId}` },
      { table: 'booking_attachments', filter: `booking_id=eq.${bookingId}` },
    ], listener, connection);
  },
  bookingConversation(bookingId: string, listener: RealtimeListener, connection?: (status: RealtimeConnection) => void) {
    return subscribeChannel(`booking-conversation:${bookingId}`, [
      { table: 'messages', filter: `booking_id=eq.${bookingId}` },
      { table: 'conversation_typing', filter: `booking_id=eq.${bookingId}` },
    ], listener, connection);
  },
};
