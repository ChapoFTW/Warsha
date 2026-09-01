import Storage from 'expo-sqlite/kv-store';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import { emitMockRealtime } from '@/src/realtime/realtime-service';
import { notificationDefinition } from './notification-policy';
import { reconcileMockReminderSimulations, recordMockReminderSimulation, suppressMockReminderSimulations } from './notification-reminder-simulation';
import {
  notificationCategories,
  type NotificationCategory,
  type NotificationCounts,
  type NotificationListOptions,
  type NotificationMode,
  type NotificationPage,
  type NotificationPreferences,
  type NotificationRoute,
  type NotificationRouteType,
  type WarshaNotification,
} from './notification-types';

const PAGE_SIZE = 20;
const VERSION = 'v2';
const safeMockId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;

const categoryDefaults = Object.fromEntries(notificationCategories.map(category => [category, true])) as Record<NotificationCategory, boolean>;
export const defaultNotificationPreferences: NotificationPreferences = {
  categories: categoryDefaults,
  inAppEnabled: true,
  pushEnabled: false,
  pushAvailable: false,
  genericPreviews: true,
  quietHours: { enabled: false, timezone: 'Africa/Cairo' },
};

function inboxKey(accountId: string) { return `warsha:notifications:${VERSION}:${accountId}`; }
function preferencesKey(accountId: string) { return `warsha:notification-preferences:${VERSION}:${accountId}`; }

function seed(accountId: string): WarshaNotification[] {
  const worker = accountId === 'mock-user';
  const definition = notificationDefinition(worker ? 'new_booking_request' : 'booking_confirmed');
  const createdAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
  return [{
    id: `mock-notification-seed-${worker ? 'worker' : 'customer'}`,
    type: worker ? 'new_booking_request' : 'booking_confirmed',
    eventKey: worker ? 'new_booking_request' : 'booking_confirmed',
    ...definition,
    resourceId: 'MOCK-JOB-1', bookingId: 'MOCK-JOB-1', groupCount: 1,
    actionOpen: definition.requiredAction, createdAt, lastEventAt: createdAt,
  }];
}

async function mockRead(accountId: string) {
  const raw = await Storage.getItem(inboxKey(accountId));
  if (!raw) { const initial = seed(accountId); await Storage.setItem(inboxKey(accountId), JSON.stringify(initial)); return initial; }
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed as WarshaNotification[] : []; } catch { return []; }
}
async function mockWrite(accountId: string, items: WarshaNotification[]) { await Storage.setItem(inboxKey(accountId), JSON.stringify(items)); }

async function mockPreferences(accountId: string): Promise<NotificationPreferences> {
  const raw = await Storage.getItem(preferencesKey(accountId));
  if (!raw) { await Storage.setItem(preferencesKey(accountId), JSON.stringify(defaultNotificationPreferences)); return defaultNotificationPreferences; }
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      ...defaultNotificationPreferences, ...parsed,
      categories: { ...categoryDefaults, ...parsed.categories },
      pushEnabled: false, pushAvailable: false, inAppEnabled: true,
      quietHours: { ...defaultNotificationPreferences.quietHours, ...parsed.quietHours },
    };
  } catch { return defaultNotificationPreferences; }
}

function resourceFor(routeType: NotificationRouteType | undefined, bookingId?: string, providerId?: string) {
  if (routeType === 'provider_profile' || routeType === 'verification') return providerId;
  if (['booking', 'conversation', 'booking_payment', 'booking_review', 'booking_dispute'].includes(routeType ?? '')) return bookingId;
}

function resolveCompletedActions(items: WarshaNotification[], eventKey: string, bookingId?: string) {
  const resolvesBooking = /(completed|cancelled|refunded|rejected|inspection_approved)$/.test(eventKey);
  const resolvesPayment = /^(payment_confirmed|payment_successful|refund_completed)$/.test(eventKey);
  const resolvesVerification = eventKey === 'verification_approved';
  const resolvesDispute = /^dispute_(resolved|closed|cancelled)$/.test(eventKey);
  if (!resolvesBooking && !resolvesPayment && !resolvesVerification && !resolvesDispute) return;
  for (const item of items) {
    if (!item.requiredAction || !item.actionOpen) continue;
    if (resolvesVerification && item.category === 'worker_account') item.actionOpen = false;
    else if (bookingId && item.bookingId === bookingId && (resolvesBooking || resolvesPayment || resolvesDispute)) item.actionOpen = false;
  }
}

export async function createMockNotification(
  type: string,
  bookingId?: string,
  providerId?: string,
  dedupeKey?: string,
  recipientAccountId?: string,
  explicitResourceId?: string,
  reminderResourceId?: string,
) {
  if (environment.dataMode !== 'mock') return;
  const eventKey = type.toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'system_update';
  const definition = notificationDefinition(eventKey);
  const accountId = recipientAccountId ?? (definition.audience === 'worker' ? 'mock-user' : 'mock-customer');
  const preferences = await mockPreferences(accountId);
  if (!definition.mandatoryInApp && preferences.categories[definition.category] === false) return;
  const items = await mockRead(accountId);
  const sourceKey = dedupeKey ?? `${eventKey}:${bookingId ?? providerId ?? 'account'}`;
  if (items.some(item => item.dedupeKey === sourceKey)) return;
  resolveCompletedActions(items, eventKey, bookingId);
  const resourceId = explicitResourceId ?? resourceFor(definition.routeType, bookingId, providerId);
  const reminderAccountId = ['marketplace_booking_confirmed', 'quote_confirmation_expired'].includes(eventKey) ? 'mock-user' : accountId;
  await suppressMockReminderSimulations(reminderAccountId, eventKey, reminderResourceId ?? resourceId);
  if (['booking_completed', 'booking_cancelled', 'booking_refunded', 'booking_rejected', 'operation_completed'].includes(eventKey)) {
    await Promise.all(['mock-customer', 'mock-user'].map(recipient => suppressMockReminderSimulations(recipient, eventKey, bookingId ?? resourceId)));
  }
  const groupKey = definition.groupFamily && resourceId ? `${definition.groupFamily}:${resourceId}` : undefined;
  const now = new Date().toISOString();
  const grouped = groupKey ? items.find(item => item.groupKey === groupKey && !item.readAt && !item.archivedAt) : undefined;
  if (grouped) {
    grouped.groupCount += 1; grouped.lastEventAt = now; grouped.dedupeKey = sourceKey;
    await mockWrite(accountId, items);
    await reconcileMockReminderSimulations(accountId, items);
    emitMockRealtime({ table: 'notifications', event: 'UPDATE', id: grouped.id }); return;
  }
  const item: WarshaNotification = {
    id: `mock-notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type, eventKey, ...definition, resourceId, bookingId, providerId, dedupeKey: sourceKey,
    groupKey, groupCount: 1, actionOpen: definition.requiredAction, createdAt: now, lastEventAt: now,
  };
  await mockWrite(accountId, [item, ...items]);
  await recordMockReminderSimulation(accountId, item);
  await reconcileMockReminderSimulations(accountId, [item, ...items]);
  emitMockRealtime({ table: 'notifications', event: 'INSERT', id: item.id });
}

function mapNotification(value: unknown): WarshaNotification {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const eventKey = String(row.eventKey ?? row.event_key ?? row.type ?? 'system_update');
  const definition = notificationDefinition(eventKey);
  const routeType = (row.routeType ?? row.route_type ?? definition.routeType) as NotificationRouteType | undefined;
  const resourceId = typeof (row.resourceId ?? row.resource_id) === 'string' ? String(row.resourceId ?? row.resource_id) : undefined;
  return {
    id: String(row.id), type: eventKey, eventKey,
    category: (row.category as NotificationCategory) ?? definition.category,
    priority: (row.priority as WarshaNotification['priority']) ?? definition.priority,
    audience: (row.audience as WarshaNotification['audience']) ?? definition.audience,
    actionType: typeof (row.actionType ?? row.action_type) === 'string' ? String(row.actionType ?? row.action_type) : undefined,
    routeType, resourceId,
    bookingId: routeType && ['booking', 'conversation', 'booking_payment', 'booking_review', 'booking_dispute'].includes(routeType) ? resourceId : undefined,
    groupFamily: (row.groupFamily ?? row.group_family) as WarshaNotification['groupFamily'],
    groupCount: Math.max(1, Number(row.groupCount ?? row.group_count ?? 1)),
    requiredAction: Boolean(row.requiredAction ?? row.required_action ?? definition.requiredAction),
    actionOpen: Boolean(row.actionOpen ?? row.action_open),
    readAt: typeof (row.readAt ?? row.read_at) === 'string' ? String(row.readAt ?? row.read_at) : undefined,
    archivedAt: typeof (row.archivedAt ?? row.archived_at) === 'string' ? String(row.archivedAt ?? row.archived_at) : undefined,
    createdAt: String(row.createdAt ?? row.created_at),
    lastEventAt: String(row.lastEventAt ?? row.last_event_at ?? row.createdAt ?? row.created_at),
  };
}

function mapCounts(value: unknown): NotificationCounts {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const categories = row.categoryUnread && typeof row.categoryUnread === 'object' ? row.categoryUnread as Record<string, unknown> : {};
  return { globalUnread: Number(row.globalUnread ?? 0), chatUnread: Number(row.chatUnread ?? 0), categoryUnread: Object.fromEntries(Object.entries(categories).map(([key, total]) => [key, Number(total)])) };
}

type Repository = {
  list(accountId: string, mode: NotificationMode, options?: NotificationListOptions & { before?: string }): Promise<NotificationPage>;
  counts(accountId: string, mode: NotificationMode): Promise<NotificationCounts>;
  markRead(accountId: string, mode: NotificationMode, id: string): Promise<void>;
  markAllRead(accountId: string, mode: NotificationMode): Promise<void>;
  archive(accountId: string, mode: NotificationMode, id: string): Promise<void>;
  preferences(accountId: string): Promise<NotificationPreferences>;
  updatePreferences(accountId: string, value: NotificationPreferences): Promise<NotificationPreferences>;
  resolveRoute(accountId: string, mode: NotificationMode, id: string): Promise<NotificationRoute>;
};

const mockRepository: Repository = {
  async list(accountId, mode, options = {}) {
    const offset = options.offset ?? 0;
    const items = (await mockRead(accountId)).filter(item =>
      (item.audience === 'all' || item.audience === mode)
      && Boolean(item.archivedAt) === Boolean(options.archived)
      && (!options.category || item.category === options.category),
    ).sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt));
    return { items: items.slice(offset, offset + PAGE_SIZE), hasMore: offset + PAGE_SIZE < items.length };
  },
  async counts(accountId, mode) {
    const items = (await mockRead(accountId)).filter(item => (item.audience === 'all' || item.audience === mode) && !item.archivedAt && !item.readAt);
    const categoryUnread: Partial<Record<NotificationCategory, number>> = {};
    for (const item of items) categoryUnread[item.category] = (categoryUnread[item.category] ?? 0) + 1;
    return { globalUnread: items.length, categoryUnread, chatUnread: 0 };
  },
  async markRead(accountId, mode, id) {
    const items = await mockRead(accountId); const item = items.find(value => value.id === id && (value.audience === 'all' || value.audience === mode) && !value.archivedAt);
    if (!item) throw new Error('Notification is not available');
    item.readAt ??= new Date().toISOString(); await mockWrite(accountId, items); emitMockRealtime({ table: 'notifications', event: 'UPDATE', id });
  },
  async markAllRead(accountId, mode) {
    const items = await mockRead(accountId); const now = new Date().toISOString(); let changed = false;
    for (const item of items) if (!item.archivedAt && !item.readAt && (item.audience === 'all' || item.audience === mode)) { item.readAt = now; changed = true; }
    if (changed) { await mockWrite(accountId, items); emitMockRealtime({ table: 'notifications', event: 'UPDATE' }); }
  },
  async archive(accountId, mode, id) {
    const items = await mockRead(accountId); const item = items.find(value => value.id === id && (value.audience === 'all' || value.audience === mode) && !value.archivedAt);
    if (!item) throw new Error('Notification is not available');
    if (item.requiredAction && item.actionOpen) throw new Error('Resolve this action before archiving it');
    const now = new Date().toISOString(); item.archivedAt = now; item.readAt ??= now;
    await mockWrite(accountId, items); emitMockRealtime({ table: 'notifications', event: 'UPDATE', id });
  },
  preferences: mockPreferences,
  async updatePreferences(accountId, value) {
    const next: NotificationPreferences = { ...value, categories: { ...categoryDefaults, ...value.categories }, inAppEnabled: true, pushEnabled: false, pushAvailable: false };
    await Storage.setItem(preferencesKey(accountId), JSON.stringify(next)); return next;
  },
  async resolveRoute(accountId, mode, id) {
    const item = (await mockRead(accountId)).find(value => value.id === id && (value.audience === 'all' || value.audience === mode));
    if (!item) return { status: 'inaccessible' };
    if (!item.routeType) return { status: 'no_action' };
    if (['worker_opportunities', 'worker_earnings', 'verification'].includes(item.routeType) && mode !== 'worker') return { status: 'inaccessible' };
    if (!['worker_opportunities', 'worker_earnings', 'verification', 'preferences'].includes(item.routeType) && (!item.resourceId || !safeMockId.test(item.resourceId))) return { status: 'stale' };
    return { status: 'ok', routeType: item.routeType, resourceId: item.resourceId };
  },
};

async function rpc<T>(name: string, parameters?: Record<string, unknown>) {
  const { data, error } = await getSupabaseClient().rpc(name, parameters);
  if (error) throw error; return data as T;
}

const supabaseRepository: Repository = {
  async list(_accountId, mode, options = {}) {
    const data = await rpc<unknown[]>('get_my_notifications', { p_mode: mode, p_before: options.before ?? null, p_before_id: options.beforeId ?? null, p_limit: PAGE_SIZE + 1, p_archived: options.archived ?? false, p_category: options.category ?? null });
    const items = (data ?? []).map(mapNotification);
    return { items: items.slice(0, PAGE_SIZE), hasMore: items.length > PAGE_SIZE };
  },
  async counts(_accountId, mode) { return mapCounts(await rpc('get_my_notification_counts', { p_mode: mode })); },
  async markRead(_accountId, mode, id) { await rpc('mark_notification_read', { p_notification_id: id, p_mode: mode }); },
  async markAllRead(_accountId, mode) { await rpc('mark_all_notifications_read', { p_mode: mode }); },
  async archive(_accountId, mode, id) { await rpc('archive_notification', { p_notification_id: id, p_mode: mode }); },
  async preferences() { return await rpc<NotificationPreferences>('get_my_notification_preferences'); },
  async updatePreferences(_accountId, value) { return await rpc<NotificationPreferences>('update_my_notification_preferences', { p_preferences: { categories: value.categories, genericPreviews: value.genericPreviews, quietHours: value.quietHours, pushEnabled: value.pushEnabled } }); },
  async resolveRoute(_accountId, mode, id) { return await rpc<NotificationRoute>('resolve_notification_route', { p_notification_id: id, p_mode: mode }); },
};

export const notificationRepository: Repository = environment.dataMode === 'supabase' ? supabaseRepository : mockRepository;
