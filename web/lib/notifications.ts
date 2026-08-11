import {
  legacyNotificationEventCopy,
  type NotificationCopyKey,
  copy as notificationCopy,
} from '../../src/notifications/notification-copy.ts';

/**
 * Notifications for the browser, on the same authority the app uses.
 *
 * The titles and bodies come from `src/notifications/notification-copy.ts` —
 * the same table Android and iOS read. Restating those strings here would be a
 * parity defect the moment one side gained an event the other did not, and
 * this product has forty of them.
 *
 * The RPCs are `get_my_notifications`, `get_my_notification_counts`,
 * `mark_notification_read`, `mark_all_notifications_read` and
 * `archive_notification`, all of which take `p_mode`. Mode is not cosmetic:
 * `private.notification_mode_allowed` refuses a mode the account does not hold,
 * so a customer cannot read a worker's notifications by asking nicely.
 */

export type NotificationMode = 'customer' | 'worker';

/** The nine categories the RPC validates. Anything else raises 22023. */
export const NOTIFICATION_CATEGORIES = [
  'marketplace', 'bookings', 'messages', 'payments', 'worker_account',
  'reviews', 'disputes', 'security', 'system',
] as const;

export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

export type WebNotification = {
  id: string;
  eventKey: string;
  category: string;
  priority: string;
  audience: string;
  actionType: string | null;
  routeType: string | null;
  resourceId: string | null;
  groupCount: number | null;
  requiredAction: boolean;
  actionOpen: boolean;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  lastEventAt: string;
};

export function parseNotifications(value: unknown): WebNotification[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is WebNotification =>
    Boolean(row) && typeof (row as WebNotification).id === 'string');
}

/**
 * What `get_my_notification_counts` actually returns.
 *
 * `{globalUnread, categoryUnread, chatUnread}` — not `{unread}`. The customer
 * dashboard read `.unread`, which has never existed, and would have shown zero
 * forever had the call succeeded at all. It did not: `p_mode` has no default,
 * so calling the function with no arguments cannot resolve server-side.
 */
export type NotificationCounts = {
  globalUnread: number;
  chatUnread: number;
  categoryUnread: Record<string, number>;
};

export function parseCounts(value: unknown): NotificationCounts {
  const raw = (value ?? {}) as Record<string, unknown>;
  const num = (key: string) => (typeof raw[key] === 'number' ? raw[key] as number : 0);
  const categories = raw.categoryUnread;
  return {
    globalUnread: num('globalUnread'),
    chatUnread: num('chatUnread'),
    categoryUnread: categories && typeof categories === 'object'
      ? categories as Record<string, number>
      : {},
  };
}

/**
 * The title and body for one notification, in the reader's language.
 *
 * `legacyNotificationEventCopy` returns undefined for an event the table does
 * not know. That happens — the catalogue grows server-side — so the fallback is
 * the same generic pair the app falls back to, never a raw `event_key` shown to
 * somebody as if it were a sentence.
 */
export function notificationText(
  locale: 'en' | 'ar',
  eventKey: string,
): { title: string; body: string } {
  const known = legacyNotificationEventCopy(locale, eventKey);
  if (known) return { title: known.title, body: known.body };
  const table = notificationCopy[locale] as Record<NotificationCopyKey, string>;
  return { title: table.newUpdate, body: table.genericBody };
}

/** The shared chrome strings — "Mark all as read" and friends — also shared. */
export function notificationChrome(locale: 'en' | 'ar') {
  const table = notificationCopy[locale] as Record<string, string>;
  return {
    title: table.notifications,
    markAllRead: table.markAllRead,
    markRead: table.markRead,
    dismiss: table.dismiss,
    empty: table.empty,
    emptyBody: table.emptyBody,
    loadError: table.loadError,
    retry: table.retry,
    loadMore: table.loadMore,
  };
}

/**
 * The keyset cursor the RPC actually pages on.
 *
 * `get_my_notifications` compares `(last_event_at, id) < (p_before, p_before_id)`
 * — a keyset, not an offset. Passing only the timestamp would silently drop or
 * repeat rows whenever two notifications share one, which they do whenever a
 * batch is written.
 */
export type NotificationCursor = { before: string; beforeId: string } | null;

export function cursorFrom(items: WebNotification[]): NotificationCursor {
  const last = items[items.length - 1];
  return last ? { before: last.lastEventAt, beforeId: last.id } : null;
}

/** The RPC caps `p_limit` at 50 and refuses anything outside 1..50. */
export const NOTIFICATION_PAGE_SIZE = 20;
