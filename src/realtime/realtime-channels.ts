/**
 * What each Warsha domain subscribes to, described once and transported twice.
 *
 * ## Why this file exists
 *
 * The channel definitions used to live inside `realtime-service.ts`, which
 * imports the Expo Supabase client and reads `__DEV__`. That made them
 * unreachable from the browser, and the consequence was not subtle: the web had
 * no realtime at all. A customer with a request open watched a page that would
 * not change until they pressed reload, while the same customer on a phone saw
 * the quote arrive. Same product, same database, two different answers to
 * "is this current?".
 *
 * So the *description* of a subscription — its name, and the tables and filters
 * it binds — is plain data in this file, and each platform supplies only the
 * transport. Native keeps `realtimeService`; the browser has its own hook. A
 * channel added here reaches both, and neither can quietly drift into watching
 * a different set of tables from the other.
 *
 * ## The shape of every subscription
 *
 *     DATABASE CHANGE
 *       -> authorized realtime event (RLS applies; the payload carries only `id`)
 *       -> a signal, not data
 *       -> the domain refetches its authoritative query
 *       -> UI updates
 *
 * The event is deliberately treated as a doorbell rather than a delivery. A
 * `postgres_changes` payload is one row from one table at one moment; a Warsha
 * request is a request, its quotes, its deadlines and a computed count, and
 * reconstructing that from a row diff would be a second implementation of every
 * RPC. It would also be wrong under exactly the conditions realtime is worst at
 * — reconnects, out-of-order delivery, and events for rows the reader is only
 * partly entitled to. Refetching costs one round trip and cannot disagree with
 * the database.
 *
 * ## Filters are not decoration
 *
 * Every binding that can carry one does. RLS is the security boundary and
 * remains so — a filter cannot grant access to a row a policy denies — but an
 * unfiltered binding means the server evaluates and forwards every change on
 * that table to every subscriber who can see any of it, and the client wakes up
 * to sort out that most of them were not about them. `customerMarketplaceRequests`
 * bound `worker_quotes` with no filter for exactly that reason, and every
 * customer in the product received a doorbell for every quote they were
 * entitled to see anywhere.
 */

export type RealtimeTable =
  | 'notifications' | 'bookings' | 'booking_status_history' | 'booking_attachments'
  | 'reviews' | 'review_responses' | 'review_attachments'
  | 'messages' | 'message_attachments' | 'conversation_members' | 'conversation_typing'
  | 'provider_verifications' | 'provider_profiles'
  | 'financial_booking_payments' | 'provider_earnings_ledger' | 'provider_withdrawal_requests'
  | 'financial_refunds'
  | 'marketplace_requests' | 'quote_invitations' | 'worker_quotes'
  | 'booking_operations' | 'booking_operation_events' | 'job_progress_media'
  | 'booking_additional_work_requests' | 'booking_return_visits'
  | 'disputes' | 'dispute_events';

export type RealtimeBinding = { table: RealtimeTable; filter?: string };

/** A channel name and everything it listens to. */
export type RealtimeChannelSpec = { name: string; bindings: RealtimeBinding[] };

/**
 * Every subscription Warsha has, as data.
 *
 * Named by the question each answers rather than by the tables involved, so a
 * screen asks for "the customer's marketplace requests" and does not have to
 * know that answering it means watching two tables.
 */
export const realtimeChannels = {
  marketplaceProviders: (): RealtimeChannelSpec => ({
    name: 'marketplace-providers',
    bindings: [{ table: 'provider_profiles' }],
  }),

  /**
   * A customer's own requests, and the quotes on them.
   *
   * `worker_quotes` has no `customer_id` to filter on — it is joined to the
   * request — so this binding cannot be narrowed the way the others can. RLS
   * still decides what reaches the socket. The comment is here so the next
   * person does not spend an afternoon looking for the filter that is missing
   * on purpose.
   */
  customerMarketplaceRequests: (userId: string): RealtimeChannelSpec => ({
    name: `marketplace-requests:${userId}`,
    bindings: [
      { table: 'marketplace_requests', filter: `customer_id=eq.${userId}` },
      { table: 'worker_quotes' },
    ],
  }),

  /**
   * A worker's invitations and their own quotes.
   *
   * Both bindings are filtered to this provider. Capacity is derived from the
   * second: every transition that frees or consumes an open offer — submitted,
   * withdrawn, rejected, selected, or invalidated because the customer
   * cancelled the request — writes to `worker_quotes` with this provider's id,
   * including `cancel_marketplace_request`, which updates the worker's quote
   * rows rather than only the request.
   */
  workerMarketplaceInvitations: (providerId: string): RealtimeChannelSpec => ({
    name: `marketplace-invitations:${providerId}`,
    bindings: [
      { table: 'quote_invitations', filter: `provider_id=eq.${providerId}` },
      { table: 'worker_quotes', filter: `provider_id=eq.${providerId}` },
    ],
  }),

  providerVerification: (providerId: string): RealtimeChannelSpec => ({
    name: `provider-verification:${providerId}`,
    bindings: [
      { table: 'provider_verifications', filter: `provider_id=eq.${providerId}` },
      { table: 'provider_profiles', filter: `id=eq.${providerId}` },
    ],
  }),

  notifications: (userId: string): RealtimeChannelSpec => ({
    name: `notifications:${userId}`,
    bindings: [{ table: 'notifications', filter: `user_id=eq.${userId}` }],
  }),

  customerBookings: (userId: string): RealtimeChannelSpec => ({
    name: `customer-bookings:${userId}`,
    bindings: [{ table: 'bookings', filter: `customer_id=eq.${userId}` }],
  }),

  providerJobs: (providerId: string): RealtimeChannelSpec => ({
    name: `provider-jobs:${providerId}`,
    bindings: [{ table: 'bookings', filter: `provider_id=eq.${providerId}` }],
  }),

  providerFinances: (providerId: string): RealtimeChannelSpec => ({
    name: `provider-finances:${providerId}`,
    bindings: [
      { table: 'provider_earnings_ledger', filter: `provider_id=eq.${providerId}` },
      { table: 'provider_withdrawal_requests', filter: `provider_id=eq.${providerId}` },
    ],
  }),

  bookingPayment: (bookingId: string): RealtimeChannelSpec => ({
    name: `booking-payment:${bookingId}`,
    bindings: [{ table: 'financial_booking_payments', filter: `booking_id=eq.${bookingId}` }],
  }),

  providerReviews: (providerId: string): RealtimeChannelSpec => ({
    name: `provider-reviews:${providerId}`,
    bindings: [
      { table: 'reviews', filter: `provider_id=eq.${providerId}` },
      { table: 'review_responses', filter: `provider_id=eq.${providerId}` },
    ],
  }),

  bookingReview: (bookingId: string): RealtimeChannelSpec => ({
    name: `booking-review:${bookingId}`,
    bindings: [{ table: 'reviews', filter: `booking_id=eq.${bookingId}` }],
  }),

  reviewDetail: (reviewId: string): RealtimeChannelSpec => ({
    name: `review-detail:${reviewId}`,
    bindings: [
      { table: 'reviews', filter: `id=eq.${reviewId}` },
      { table: 'review_responses', filter: `review_id=eq.${reviewId}` },
      { table: 'review_attachments', filter: `review_id=eq.${reviewId}` },
    ],
  }),

  bookingDetail: (bookingId: string): RealtimeChannelSpec => ({
    name: `booking-detail:${bookingId}`,
    bindings: [
      { table: 'bookings', filter: `id=eq.${bookingId}` },
      { table: 'booking_status_history', filter: `booking_id=eq.${bookingId}` },
      { table: 'booking_attachments', filter: `booking_id=eq.${bookingId}` },
    ],
  }),

  bookingOperations: (bookingId: string): RealtimeChannelSpec => ({
    name: `booking-operations:${bookingId}`,
    bindings: [
      { table: 'booking_operations', filter: `booking_id=eq.${bookingId}` },
      { table: 'booking_operation_events', filter: `booking_id=eq.${bookingId}` },
      { table: 'job_progress_media', filter: `booking_id=eq.${bookingId}` },
      { table: 'booking_additional_work_requests', filter: `booking_id=eq.${bookingId}` },
      { table: 'booking_return_visits', filter: `booking_id=eq.${bookingId}` },
    ],
  }),

  bookingDispute: (bookingId: string): RealtimeChannelSpec => ({
    name: `booking-dispute:${bookingId}`,
    bindings: [
      { table: 'disputes', filter: `booking_id=eq.${bookingId}` },
      { table: 'dispute_events', filter: `booking_id=eq.${bookingId}` },
    ],
  }),

  bookingConversation: (bookingId: string): RealtimeChannelSpec => ({
    name: `booking-conversation:${bookingId}`,
    bindings: [
      { table: 'messages', filter: `booking_id=eq.${bookingId}` },
      { table: 'conversation_typing', filter: `booking_id=eq.${bookingId}` },
    ],
  }),

  bookingConversationInbox: (userId: string): RealtimeChannelSpec => ({
    name: `booking-conversation-inbox:${userId}`,
    bindings: [
      { table: 'conversation_members', filter: `user_id=eq.${userId}` },
      { table: 'notifications', filter: `user_id=eq.${userId}` },
    ],
  }),
} as const;

export type RealtimeChannelName = keyof typeof realtimeChannels;
