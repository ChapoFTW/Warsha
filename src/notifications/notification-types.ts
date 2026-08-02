export const notificationCategories = [
  'marketplace', 'bookings', 'messages', 'payments', 'worker_account',
  'reviews', 'disputes', 'security', 'system',
] as const;

export type NotificationCategory = typeof notificationCategories[number];
export type NotificationPriority = 'critical' | 'action_required' | 'important' | 'informational';
export type NotificationAudience = 'customer' | 'worker' | 'all';
export type NotificationMode = 'customer' | 'worker';
export type NotificationRouteType =
  | 'marketplace_request' | 'worker_opportunities' | 'worker_quote' | 'booking'
  | 'conversation' | 'provider_profile' | 'booking_payment' | 'worker_earnings'
  | 'verification' | 'booking_review' | 'booking_dispute' | 'preferences';

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
  pushEnabled: false;
  pushAvailable: false;
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
