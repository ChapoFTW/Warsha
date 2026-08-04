import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingMark as ActivityIndicator } from '@/components/warsha/BrandMark';
import { EmptyState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { useBookings } from '@/src/bookings/booking-context';
import { bookingStatusTranslationKeys, type Booking } from '@/src/bookings/booking-types';
import { chatRepository } from '@/src/chat/chat-repository';
import { useChatText } from '@/src/chat/chat-translations';
import type { ChatInboxItem, MessageKind } from '@/src/chat/chat-types';
import { useLocalization } from '@/src/i18n/localization';
import { useProviderJobs } from '@/src/provider-jobs/provider-job-context';
import { realtimeService } from '@/src/realtime/realtime-service';
import { formatTimestamp, localeFor } from '@/src/utils/date-format';

export default function ChatInboxScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { mode, user } = useAuth();
  const bookings = useBookings();
  const jobs = useProviderJobs();
  const { language, isRTL, t } = useLocalization();
  const ct = useChatText();
  const accountId = mode === 'mock' ? 'mock-user' : user?.id ?? null;
  const mounted = useRef(true);
  const generation = useRef(0);
  const [items, setItems] = useState<ChatInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const allBookings = useMemo(() => {
    const unique = new Map<string, Booking>();
    for (const booking of [...bookings.bookings, ...jobs.jobs]) unique.set(booking.id, booking);
    return [...unique.values()];
  }, [bookings.bookings, jobs.jobs]);
  const bookingRef = useRef(allBookings);
  bookingRef.current = allBookings;

  const load = useCallback(async (refresh = false) => {
    const target = accountId;
    const request = ++generation.current;
    if (!target) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const next = await chatRepository.inbox(bookingRef.current, target);
      if (!mounted.current || request !== generation.current) return;
      setItems(next);
      setError(false);
    } catch {
      if (mounted.current && request === generation.current) {
        setItems([]);
        setError(true);
      }
    } finally {
      if (mounted.current && request === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [accountId]);

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    setItems([]);
    setError(false);
    void load();
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [load]);
  useEffect(() => {
    if (!accountId) return;
    let first = true;
    const unsubscribe = realtimeService.bookingConversationInbox(accountId, () => void load(true), (status) => {
      if (status === 'connected') {
        if (first) first = false;
        else void load(true);
      }
    });
    return unsubscribe;
  }, [accountId, load]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load(true);
    });
    return () => subscription.remove();
  }, [load]);
  useEffect(() => { void load(true); }, [allBookings, load]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.bookingId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.white} />}
        contentContainerStyle={[styles.content, !items.length && styles.grow]}
        ListHeaderComponent={<View style={styles.header}><AppText style={styles.heading}>{ct('inboxTitle')}</AppText></View>}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.counterpartName}. ${item.serviceName}. ${item.unreadCount} ${ct('unread')}`}
          onPress={() => router.push({ pathname: '/conversation/[bookingId]', params: { bookingId: item.bookingId } })}
          style={[styles.card, isRTL && styles.reverse, item.unreadCount > 0 && styles.unreadCard]}
        >
          <View style={[styles.avatar, item.unreadCount > 0 && styles.avatarUnread]}><MaterialIcons name="chat-bubble-outline" size={22} color={item.unreadCount > 0 ? colors.background : colors.textSecondary} /></View>
          <View style={styles.text}>
            <View style={[styles.between, isRTL && styles.reverse]}><AppText style={[styles.name, isRTL && styles.rtl]} numberOfLines={1}>{item.counterpartName || item.serviceName}</AppText>{item.lastMessageAt ? <AppText style={styles.time}>{formatTimestamp(item.lastMessageAt, localeFor(language))}</AppText> : null}</View>
            <AppText style={[styles.service, isRTL && styles.rtl]} numberOfLines={1}>{item.serviceName}</AppText>
            <View style={[styles.between, isRTL && styles.reverse]}><AppText style={[styles.preview, isRTL && styles.rtl]} numberOfLines={1}>{messageKindLabel(item.lastMessageKind, ct)}</AppText><AppText style={styles.status}>{t(bookingStatusTranslationKeys[item.status])}</AppText></View>
          </View>
          {item.unreadCount > 0 ? <View accessibilityLabel={`${item.unreadCount} ${ct('unread')}`} style={styles.badge}><AppText style={styles.badgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</AppText></View> : null}
        </Pressable>}
        ListEmptyComponent={loading
          ? <View style={styles.state}><ActivityIndicator color={colors.white} /></View>
          : error
            ? <View style={styles.state}><EmptyState title={ct('loadError')} icon="error-outline" action={ct('retry')} onAction={() => void load()} /></View>
            : <View style={styles.state}><EmptyState title={ct('inboxEmpty')} body={ct('inboxEmptyBody')} icon="chat-bubble-outline" /></View>}
      />
    </SafeAreaView>
  );
}

function messageKindLabel(kind: MessageKind | undefined, ct: ReturnType<typeof useChatText>) {
  if (!kind) return ct('empty');
  if (kind === 'image') return ct('photo');
  if (kind === 'file') return ct('file');
  if (kind === 'quick_reply') return ct('quickReplies');
  return kind === 'text' ? ct('newMessage') : ct('system');
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl },
  grow: { flexGrow: 1 },
  header: { paddingBottom: spacing.lg },
  heading: { fontSize: 28, lineHeight: 34, fontWeight: typography.bold },
  card: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  unreadCard: { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSoft },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  avatarUnread: { backgroundColor: colors.white },
  text: { flex: 1, gap: 4 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  name: { flex: 1, fontSize: 15, fontWeight: typography.bold },
  service: { color: colors.textSecondary, fontSize: 12 },
  preview: { flex: 1, color: colors.textMuted, fontSize: 11 },
  status: { color: colors.textMuted, fontSize: 9 },
  time: { color: colors.textMuted, fontSize: 10 },
  badge: { minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  badgeText: { color: colors.background, fontSize: 10, fontWeight: typography.bold },
  state: { minHeight: 420, flex: 1, alignItems: 'center', justifyContent: 'center' },
});
