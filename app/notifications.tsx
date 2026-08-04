import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingMark as ActivityIndicator } from '@/components/warsha/BrandMark';
import { EmptyState } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useNotifications } from '@/src/notifications/notification-context';
import { useEngagementText } from '@/src/notifications/notification-engagement-translations';
import { notificationCategories, type WarshaNotification } from '@/src/notifications/notification-types';
import { localeFor } from '@/src/utils/date-format';

export default function NotificationsScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const state = useNotifications(); const copy = useEngagementText(); const { isRTL } = useLocalization();
  return <SafeAreaView style={styles.safe}><FlatList
    data={state.items} keyExtractor={item => item.id} refreshing={state.refreshing} onRefresh={() => void state.reload()}
    onEndReached={() => void state.loadMore()} onEndReachedThreshold={.35} contentContainerStyle={styles.content}
    ItemSeparatorComponent={() => <View style={{ height: spacing.sm }}/>} renderItem={({ item }) => <NotificationCard item={item}/>}
    ListHeaderComponent={<View style={styles.header}>
      <View style={[styles.headerRow, isRTL && styles.reverse]}><View style={styles.headerGrow}><ScreenHeader title={copy.text('notifications')} subtitle={state.unreadCount ? `${state.unreadCount} ${copy.text('newUpdate')}` : undefined}/></View>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.text('preferencesAction')} onPress={() => router.push('/notification-preferences')} style={styles.iconButton}><MaterialIcons name="tune" size={21} color={colors.textPrimary}/></Pressable>
      </View>
      <View accessibilityRole="tablist" style={[styles.filters, isRTL && styles.reverse]}>
        <Filter selected={!state.archived} label={copy.text('current')} onPress={() => state.setArchived(false)}/>
        <Filter selected={state.archived} label={copy.text('archived')} onPress={() => state.setArchived(true)}/>
      </View>
      <View style={[styles.filters, isRTL && styles.reverse]}>
        <Filter selected={!state.category} label={copy.text('all')} onPress={() => state.setCategory(undefined)}/>
        {notificationCategories.map(category => <Filter key={category} selected={state.category === category} label={`${copy.category(category)}${state.categoryUnread[category] ? ` ${state.categoryUnread[category]}` : ''}`} onPress={() => state.setCategory(category)}/>)}
      </View>
      {!state.archived && state.unreadCount ? <Pressable accessibilityRole="button" accessibilityLabel={copy.text('markAllRead')} onPress={() => void state.markAllRead()} style={[styles.markAll, isRTL && styles.reverse]}><MaterialIcons name="done-all" size={18} color={colors.textPrimary}/><AppText style={styles.markAllText}>{copy.text('markAllRead')}</AppText></Pressable> : null}
    </View>}
    ListEmptyComponent={state.loading ? <State loading text={copy.text('notifications')}/> : state.error ? <State icon="error-outline" text={copy.text('loadError')} action={copy.text('retry')} onPress={() => void state.reload()}/> : <State icon={state.archived ? 'inventory-2' : 'notifications-none'} text={state.archived ? copy.text('archivedEmpty') : copy.text('empty')} body={state.archived ? undefined : copy.text('emptyBody')}/>}
    ListFooterComponent={state.loadingMore ? <ActivityIndicator style={styles.footer} color={colors.white}/> : state.hasMore ? <Pressable accessibilityRole="button" accessibilityLabel={copy.text('loadMore')} onPress={() => void state.loadMore()} style={styles.more}><AppText>{copy.text('loadMore')}</AppText></Pressable> : null}
  /></SafeAreaView>;
}

function Filter({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress} style={[styles.filter, selected && styles.filterSelected]}><AppText style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</AppText></Pressable>;
}

function NotificationCard({ item }: { item: WarshaNotification }) {
  const colors = useThemeColors();
  const priorityStyle = useThemedStyles(makePriorityStyle);
  const styles = useThemedStyles(makeStyles);
  const state = useNotifications(); const copy = useEngagementText(); const { isRTL } = useLocalization(); const eventCopy = copy.event(item.eventKey, item.category);
  const stateLabel = item.readAt ? copy.text('read') : copy.text('unread');
  const accessibility = `${stateLabel}. ${copy.category(item.category)}. ${copy.priority(item.priority)}. ${eventCopy.title}. ${eventCopy.body}${item.groupCount > 1 ? `. ${item.groupCount} ${copy.text('grouped')}` : ''}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibility} accessibilityHint={eventCopy.action} onPress={() => void state.open(item)} style={[styles.card, !item.readAt && styles.unreadCard, isRTL && styles.reverse]}>
    <View style={[styles.priorityMark, priorityStyle[item.priority]]}/>
    <View style={styles.grow}>
      <View style={[styles.meta, isRTL && styles.reverse]}><AppText style={styles.category}>{copy.category(item.category)}</AppText><AppText style={styles.priority}>{copy.priority(item.priority)}</AppText>{item.groupCount > 1 ? <AppText style={styles.count}>{item.groupCount}</AppText> : null}</View>
      <AppText style={styles.title}>{eventCopy.title}</AppText><AppText style={styles.body}>{eventCopy.body}</AppText>
      <View style={[styles.bottom, isRTL && styles.reverse]}><AppText style={styles.time}>{relativeTime(item.lastEventAt, copy.language, copy.text('justNow'))}</AppText>{eventCopy.action ? <AppText style={styles.action}>{eventCopy.action}</AppText> : null}</View>
    </View>
    <View style={styles.actions}>{!item.readAt ? <Pressable accessibilityRole="button" accessibilityLabel={copy.text('markRead')} hitSlop={10} style={styles.smallAction} onPress={event => { event.stopPropagation(); void state.markRead(item.id); }}><MaterialIcons name="done" size={19} color={colors.textSecondary}/></Pressable> : null}
      {!item.actionOpen ? <Pressable accessibilityRole="button" accessibilityLabel={copy.text('archive')} hitSlop={10} style={styles.smallAction} onPress={event => { event.stopPropagation(); void state.archive(item.id); }}><MaterialIcons name="archive" size={19} color={colors.textSecondary}/></Pressable> : <MaterialIcons accessibilityLabel={copy.text('actionRequired')} name="lock-outline" size={18} color={colors.textMuted}/>}</View>
  </Pressable>;
}

const makePriorityStyle = (colors: ThemeColors) => StyleSheet.create({ critical: { backgroundColor: colors.error }, action_required: { backgroundColor: colors.warning }, important: { backgroundColor: colors.white }, informational: { backgroundColor: colors.textMuted } });
function State({ icon, text, body, action, onPress, loading }: { icon?: React.ComponentProps<typeof MaterialIcons>['name']; text: string; body?: string; action?: string; onPress?: () => void; loading?: boolean }) {
  const styles = useThemedStyles(makeStyles); return <View style={styles.state}><EmptyState title={text} body={body} icon={icon} action={action} onAction={onPress} loading={loading}/></View>; }
function relativeTime(value: string, language: 'en' | 'ar', justNow: string) { const elapsed = Date.now() - Date.parse(value); const formatter = new Intl.RelativeTimeFormat(localeFor(language), { numeric: 'auto' }); if (elapsed < 60_000) return justNow; if (elapsed < 3_600_000) return formatter.format(-Math.max(1, Math.round(elapsed / 60_000)), 'minute'); if (elapsed < 86_400_000) return formatter.format(-Math.max(1, Math.round(elapsed / 3_600_000)), 'hour'); return formatter.format(-Math.max(1, Math.round(elapsed / 86_400_000)), 'day'); }

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: spacing.xxxl, maxWidth: 760, width: '100%', alignSelf: 'center', flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.lg }, headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headerGrow: { flex: 1 }, reverse: { flexDirection: 'row-reverse' },
  iconButton: { width: 44, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, filter: { minHeight: 44, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' }, filterSelected: { backgroundColor: colors.white, borderColor: colors.white }, filterText: { color: colors.textSecondary, fontSize: 12 }, filterTextSelected: { color: colors.background, fontWeight: typography.bold },
  markAll: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill }, markAllText: { fontSize: 12, fontWeight: typography.semibold },
  card: { minHeight: 136, flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface }, unreadCard: { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSoft }, priorityMark: { width: 5, alignSelf: 'stretch', borderRadius: 3 },
  grow: { flex: 1, gap: 5 }, meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }, category: { fontSize: 11, color: colors.textSecondary }, priority: { fontSize: 11, color: colors.textMuted }, count: { minWidth: 22, textAlign: 'center', fontSize: 11, color: colors.background, backgroundColor: colors.white, borderRadius: radii.pill, overflow: 'hidden' },
  title: { fontSize: 15, fontWeight: typography.bold }, body: { fontSize: 13, lineHeight: 19, color: colors.textSecondary }, bottom: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }, time: { fontSize: 11, color: colors.textMuted }, action: { fontSize: 11, color: colors.textPrimary, fontWeight: typography.semibold },
  actions: { gap: spacing.md, alignItems: 'center' }, smallAction: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, state: { minHeight: 360, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }, more: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md }, footer: { margin: spacing.lg },
});
