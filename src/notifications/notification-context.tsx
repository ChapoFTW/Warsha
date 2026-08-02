import { router } from 'expo-router';
import { AppState, Alert } from 'react-native';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { useChatVisibility } from '@/src/chat/chat-context';
import { dataErrorKey } from '@/src/data/data-errors';
import type { TranslationKey } from '@/src/i18n/translations';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { realtimeService } from '@/src/realtime/realtime-service';
import { useEngagementText } from './notification-engagement-translations';
import { notificationAccountId } from './notification-policy';
import { notificationRepository } from './notification-repository';
import type { NotificationCategory, NotificationCounts, NotificationMode, WarshaNotification } from './notification-types';

type Value = {
  items: WarshaNotification[];
  unreadCount: number;
  chatUnreadCount: number;
  categoryUnread: NotificationCounts['categoryUnread'];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  archived: boolean;
  category?: NotificationCategory;
  error: TranslationKey | null;
  banner: WarshaNotification | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  setArchived: (value: boolean) => void;
  setCategory: (value?: NotificationCategory) => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  archive: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  open: (item: WarshaNotification) => Promise<void>;
  hideBanner: () => void;
};

const Context = createContext<Value | null>(null);
const emptyCounts: NotificationCounts = { globalUnread: 0, chatUnread: 0, categoryUnread: {} };
function merge(items: WarshaNotification[]) { const unique = new Map(items.map(item => [item.id, item])); return [...unique.values()].sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt)); }
function logNotificationError(scope: string, reason: unknown) { if (__DEV__) { const error = reason as { code?: string; status?: number }; console.warn(`[Warsha ${scope}]`, { code: error?.code, status: error?.status, category: dataErrorKey(reason) }); } }

export function NotificationProvider({ children }: PropsWithChildren) {
  const auth = useAuth(); const provider = useProviderFoundation(); const { activeBookingId } = useChatVisibility(); const copy = useEngagementText();
  const notificationMode: NotificationMode = provider.mode === 'provider' ? 'worker' : 'customer';
  const accountId = notificationAccountId(auth.mode, auth.user?.id, provider.mode);
  const scope = accountId ? `${accountId}:${notificationMode}` : '';
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const mounted = useRef(true); const generation = useRef(0); const openLock = useRef(new Set<string>()); const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [items, setItems] = useState<WarshaNotification[]>([]); const itemsRef = useRef(items); itemsRef.current = items;
  const [loadedScope, setLoadedScope] = useState(''); const [counts, setCounts] = useState<NotificationCounts>(emptyCounts);
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [loadingMore, setLoadingMore] = useState(false); const [hasMore, setHasMore] = useState(false);
  const [archived, setArchived] = useState(false); const [category, setCategory] = useState<NotificationCategory>(); const [error, setError] = useState<TranslationKey | null>(null); const [banner, setBanner] = useState<WarshaNotification | null>(null);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; if (reconcileTimer.current) clearTimeout(reconcileTimer.current); }; }, []);
  const reload = useCallback(async () => {
    const target = scope; const request = ++generation.current;
    if (!target || !accountId) { setItems([]); setLoadedScope(''); setCounts(emptyCounts); setHasMore(false); setError(null); setLoading(false); setRefreshing(false); setBanner(null); return; }
    setRefreshing(true);
    try {
      const [page, nextCounts] = await Promise.all([
        notificationRepository.list(accountId, notificationMode, { archived, category }), notificationRepository.counts(accountId, notificationMode),
      ]);
      if (mounted.current && scopeRef.current === target && generation.current === request) { setItems(merge(page.items)); setLoadedScope(target); setCounts(nextCounts); setHasMore(page.hasMore); setError(null); }
    } catch (reason) {
      logNotificationError('notifications', reason);
      if (mounted.current && scopeRef.current === target && generation.current === request) { setItems([]); setLoadedScope(target); setCounts(emptyCounts); setHasMore(false); setError(dataErrorKey(reason)); }
    } finally { if (mounted.current && scopeRef.current === target && generation.current === request) { setLoading(false); setRefreshing(false); } }
  }, [accountId, archived, category, notificationMode, scope]);

  useEffect(() => { generation.current += 1; openLock.current.clear(); setItems([]); setLoadedScope(''); setCounts(emptyCounts); setBanner(null); setHasMore(false); setError(null); setLoading(true); void reload(); }, [reload, scope]);
  useEffect(() => {
    if (!accountId || !scope) return;
    const target = scope; let firstConnection = true;
    const reconcile = (showBanner: boolean) => {
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
      reconcileTimer.current = setTimeout(() => {
        const known = new Map(itemsRef.current.map(item => [item.id, { groupCount: item.groupCount, lastEventAt: item.lastEventAt }]));
        void Promise.all([notificationRepository.list(accountId, notificationMode, { archived, category }), notificationRepository.counts(accountId, notificationMode)]).then(([page, nextCounts]) => {
          if (!mounted.current || scopeRef.current !== target) return;
          const next = merge(page.items); setItems(next); setLoadedScope(target); setCounts(nextCounts); setHasMore(page.hasMore);
          if (showBanner && !archived) {
            const arrived = next.find(item => {
              const previous = known.get(item.id);
              return !previous || item.groupCount > previous.groupCount || item.lastEventAt > previous.lastEventAt;
            });
            if (arrived && arrived.bookingId !== activeBookingId) setBanner(arrived);
          }
        }).catch(reason => { if (scopeRef.current === target) { logNotificationError('notification realtime reconcile', reason); setError(dataErrorKey(reason)); } });
      }, 120);
    };
    const unsubscribe = realtimeService.notifications(accountId, change => reconcile(change.event === 'INSERT' || change.event === 'UPDATE'), status => { if (status === 'connected') { if (firstConnection) firstConnection = false; else void reload(); } });
    return () => { unsubscribe(); if (reconcileTimer.current) { clearTimeout(reconcileTimer.current); reconcileTimer.current = null; } };
  }, [accountId, activeBookingId, archived, category, notificationMode, reload, scope]);
  useEffect(() => { const subscription = AppState.addEventListener('change', state => { if (state === 'active') void reload(); }); return () => subscription.remove(); }, [reload]);

  const markRead = useCallback(async (id: string) => { if (!accountId) return; const target = scope; try { await notificationRepository.markRead(accountId, notificationMode, id); const nextCounts = await notificationRepository.counts(accountId, notificationMode); if (scopeRef.current !== target) return; const now = new Date().toISOString(); setItems(current => current.map(item => item.id === id ? { ...item, readAt: item.readAt ?? now } : item)); setCounts(nextCounts); setBanner(current => current?.id === id ? null : current); } catch (reason) { if (scopeRef.current === target) { logNotificationError('notification read', reason); setError(dataErrorKey(reason)); } } }, [accountId, notificationMode, scope]);
  const markAllRead = useCallback(async () => { if (!accountId) return; const target = scope; try { await notificationRepository.markAllRead(accountId, notificationMode); const nextCounts = await notificationRepository.counts(accountId, notificationMode); if (scopeRef.current !== target) return; const now = new Date().toISOString(); setItems(current => current.map(item => ({ ...item, readAt: item.readAt ?? now }))); setCounts(nextCounts); setBanner(null); } catch (reason) { if (scopeRef.current === target) { logNotificationError('notification mark all', reason); setError(dataErrorKey(reason)); } } }, [accountId, notificationMode, scope]);
  const archive = useCallback(async (id: string) => { if (!accountId) return; const target = scope; try { await notificationRepository.archive(accountId, notificationMode, id); const nextCounts = await notificationRepository.counts(accountId, notificationMode); if (scopeRef.current !== target) return; setItems(current => current.filter(item => item.id !== id)); setCounts(nextCounts); setBanner(current => current?.id === id ? null : current); } catch (reason) { if (scopeRef.current === target) { logNotificationError('notification archive', reason); Alert.alert(copy.text('notifications'), copy.text('archiveBlocked')); } } }, [accountId, copy, notificationMode, scope]);
  const open = useCallback(async (item: WarshaNotification) => {
    if (!accountId || openLock.current.has(item.id)) return; openLock.current.add(item.id);
    try {
      const route = await notificationRepository.resolveRoute(accountId, notificationMode, item.id);
      if (!item.readAt) await markRead(item.id);
      if (route.status !== 'ok') { Alert.alert(copy.text('notifications'), copy.text(route.status === 'no_action' ? 'noAction' : route.status)); return; }
      const id = route.resourceId;
      switch (route.routeType) {
        case 'marketplace_request': if (id) router.push({ pathname: '/marketplace-request/[id]', params: { id } }); break;
        case 'worker_opportunities': router.push('/worker-quotes'); break;
        case 'worker_quote': if (id) router.push({ pathname: '/worker-quote/[id]', params: { id } }); break;
        case 'booking': if (id) router.push(notificationMode === 'worker' ? { pathname: '/provider-job/[id]', params: { id } } : { pathname: '/booking/[id]', params: { id } }); break;
        case 'conversation': if (id) router.push({ pathname: '/conversation/[bookingId]', params: { bookingId: id } }); break;
        case 'provider_profile': if (id) router.push({ pathname: '/provider/[id]', params: { id } }); break;
        case 'booking_payment': if (id) router.push({ pathname: '/booking/[id]', params: { id, focusPayment: '1' } }); break;
        case 'worker_earnings': router.push('/provider-earnings'); break;
        case 'verification': router.push('/provider-verification'); break;
        case 'booking_review': if (id) router.push({ pathname: '/booking/[id]', params: { id, focusReview: '1' } }); break;
        case 'booking_dispute': if (id) router.push({ pathname: '/booking/[id]', params: { id, focusDispute: '1' } }); break;
        case 'preferences': router.push('/notification-preferences'); break;
      }
    } finally { openLock.current.delete(item.id); }
  }, [accountId, copy, markRead, notificationMode]);
  const loadMore = useCallback(async () => { if (!accountId || loadingMore || !hasMore) return; const target = scope; setLoadingMore(true); try { const last = itemsRef.current.at(-1); const page = await notificationRepository.list(accountId, notificationMode, { offset: itemsRef.current.length, before: last?.lastEventAt, beforeId: last?.id, archived, category }); if (scopeRef.current !== target) return; setItems(current => merge([...current, ...page.items])); setLoadedScope(target); setHasMore(page.hasMore); } catch (reason) { if (scopeRef.current === target) { logNotificationError('notification pagination', reason); setError(dataErrorKey(reason)); } } finally { if (mounted.current && scopeRef.current === target) setLoadingMore(false); } }, [accountId, archived, category, hasMore, loadingMore, notificationMode, scope]);
  const visibleItems = useMemo(() => loadedScope === scope ? items : [], [items, loadedScope, scope]);
  const value = useMemo<Value>(() => ({ items: visibleItems, unreadCount: loadedScope === scope ? counts.globalUnread : 0, chatUnreadCount: loadedScope === scope ? counts.chatUnread : 0, categoryUnread: loadedScope === scope ? counts.categoryUnread : {}, loading, refreshing, loadingMore, hasMore, archived, category, error, banner: loadedScope === scope ? banner : null, reload, loadMore, setArchived, setCategory, markRead, markAllRead, archive, dismiss: archive, open, hideBanner: () => setBanner(null) }), [archive, archived, banner, category, counts, error, hasMore, loadMore, loadedScope, loading, loadingMore, markAllRead, markRead, open, refreshing, reload, scope, visibleItems]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNotifications() { const value = useContext(Context); if (!value) throw new Error('useNotifications must be used inside NotificationProvider'); return value; }
