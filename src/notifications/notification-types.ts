export const notificationCategories = [
  'marketplace', 'bookings', 'messages', 'payments', 'worker_account',
  'reviews', 'disputes', 'security', 'system', 'support',
] as const;

export type NotificationCategory = typeof notificationCategories[number];

/**
 * Ordered most urgent first. This is a runtime list, like the categories above,
 * so anything that has to cover every priority — the mark colours, a test that
 * checks they are distinguishable — can be checked for exhaustiveness rather
 * than trusted to have kept up.
 */
export const notificationPriorities = [
  'critical', 'action_required', 'important', 'informational',
] as const;

export type NotificationPriority = typeof notificationPriorities[number];
export type NotificationAudience = 'customer' | 'worker' | 'all';
export type NotificationMode = 'customer' | 'worker';
export type NotificationRouteType =
  | 'marketplace_request' | 'worker_opportunities' | 'worker_quote' | 'booking'
  | 'conversation' | 'provider_profile' | 'booking_payment' | 'worker_earnings'
  | 'verification' | 'booking_review' | 'booking_dispute' | 'preferences' | 'support_case';

export type WarshaNotification = {
  id: string;
  type: string;
  eventKey: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  audience: NotificationAudience;
  actionType?: string;
  routeType?: NotificationRouteType;
  resourceId?: string;
  bookingId?: string;
  providerId?: string;
  dedupeKey?: string;
  groupFamily?: 'conversation' | 'marketplace_quotes';
  groupKey?: string;
  groupCount: number;
  requiredAction: boolean;
  actionOpen: boolean;
  readAt?: string;
  archivedAt?: string;
  createdAt: string;
  lastEventAt: string;
};

export type NotificationPage = { items: WarshaNotification[]; hasMore: boolean };
export type NotificationCounts = {
  globalUnread: number;
  categoryUnread: Partial<Record<NotificationCategory, number>>;
  chatUnread: number;
};

export type QuietHours = { enabled: boolean; start?: string; end?: string; timezone: string };
export type NotificationPreferences = {
  categories: Record<NotificationCategory, boolean>;
  inAppEnabled: true;
  /**
   * Whether this person asked for push, and whether this deployment can send
   * it. Both were the literal `false` until push delivery existed; they are
   * booleans now because the same build runs against a project with delivery
   * switched on and one without.
   */
  pushEnabled: boolean;
  pushAvailable: boolean;
  genericPreviews: boolean;
  quietHours: QuietHours;
};

export type NotificationRoute =
  | { status: 'ok'; routeType: NotificationRouteType; resourceId?: string }
  | { status: 'no_action' | 'stale' | 'inaccessible' };

export type NotificationListOptions = {
  offset?: number;
  beforeId?: string;
  archived?: boolean;
  category?: NotificationCategory;
};
