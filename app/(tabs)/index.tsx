import { router } from 'expo-router';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryCard } from '@/components/warsha/CategoryCard';
import { DiscoveryResultCard } from '@/components/warsha/DiscoveryResultCard';
import { Header } from '@/components/warsha/Header';
import { RecentBookingCard } from '@/components/warsha/RecentBookingCard';
import { SearchBar } from '@/components/warsha/SearchBar';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useBookings } from '@/src/bookings/booking-context';
import { useMarketplaceData } from '@/src/data/marketplace-context';
import { useDiscovery } from '@/src/discovery/discovery-context';
import { useDiscoveryText } from '@/src/discovery/discovery-translations';
import type { DiscoveryProviderCard } from '@/src/discovery/discovery-types';
import { useLocalization } from '@/src/i18n/localization';
import { useMarketplaceText } from '@/src/marketplace-intelligence/marketplace-translations';

function SectionHeader({ title, hint, action, onAction }: { title: string; hint?: string; action?: string; onAction?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  return (
    <View style={styles.section}>
      <View style={[styles.sectionHeader, isRTL && styles.reverse]}>
        <AppText style={styles.sectionTitle}>{title}</AppText>
        {action && onAction ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${action} ${title}`} hitSlop={10} onPress={onAction}>
            <AppText style={styles.action}>{action}</AppText>
          </Pressable>
        ) : null}
      </View>
      {hint ? <AppText style={styles.sectionHint}>{hint}</AppText> : null}
    </View>
  );
}

/**
 * Each discovery section answers exactly one question, and a section with no
 * answer is not rendered at all. An empty "Workers you saved" shelf teaches
 * someone that the home screen is padding.
 */
function DiscoveryShelf({ title, hint, action, onAction, providers }: {
  title: string; hint?: string; action?: string; onAction?: () => void; providers: DiscoveryProviderCard[];
}) {
  const styles = useThemedStyles(makeStyles);
  if (!providers.length) return null;
  return (
    <>
      <SectionHeader title={title} hint={hint} action={action} onAction={onAction} />
      <View style={styles.shelf}>
        {providers.slice(0, 3).map(provider => <DiscoveryResultCard key={provider.id} provider={provider} />)}
      </View>
    </>
  );
}

export default function HomeScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL } = useLocalization();
  const mt = useMarketplaceText();
  const dt = useDiscoveryText();
  const { categories, providers } = useMarketplaceData();
  const { bookings } = useBookings();
  const { home } = useDiscovery();
  const hasRecent = bookings.some(booking => providers.some(provider => provider.id === booking.providerId));

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { maxWidth: 720 }]}>
        <Header />
        <View style={styles.controls}>
          <SearchBar />
          <Pressable accessibilityRole="button" accessibilityLabel={mt('getQuotes')}
            onPress={() => router.push('/marketplace-request/new')} style={styles.getQuotes}>
            <AppText style={styles.getQuotesText}>{mt('getQuotes')}</AppText>
          </Pressable>
        </View>

        {/* "What do you need help with?" */}
        <SectionHeader title={dt.text('discoverTitle')} />
        <FlatList horizontal inverted={isRTL} showsHorizontalScrollIndicator={false} data={categories}
          keyExtractor={item => item.id} renderItem={({ item }) => <CategoryCard item={item} />}
          ItemSeparatorComponent={() => <View style={{ width: 9 }} />} contentContainerStyle={styles.horizontalContent} />

        {/* "Continue where you left off." */}
        <DiscoveryShelf
          title={dt.text('continueLooking')}
          action={dt.text('viewAll')}
          onAction={() => router.push('/recently-viewed')}
          providers={home?.recentlyViewed ?? []} />

        {/* "Workers you saved." */}
        <DiscoveryShelf
          title={dt.text('savedWorkers')}
          action={dt.text('viewAll')}
          onAction={() => router.push('/favourites')}
          providers={home?.favourites ?? []} />

        {/* "Who is available near you?" */}
        <DiscoveryShelf
          title={dt.text('availableNearby')}
          action={dt.text('viewAll')}
          onAction={() => router.push({ pathname: '/search', params: { filters: '1' } })}
          providers={home?.availableNearby ?? []} />

        {/* "Who has a proven record?" */}
        <DiscoveryShelf
          title={dt.text('trustedWorkers')}
          hint={dt.text('trustedWorkersHint')}
          providers={home?.trustedWorkers ?? []} />

        {hasRecent ? (
          <>
            <SectionHeader title={t('recentBookings')} action={t('viewAll')} onAction={() => router.push('/(tabs)/orders')} />
            <RecentBookingCard />
          </>
        ) : null}
        <View style={{ height: spacing.sm }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { width: '100%', alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  controls: { gap: spacing.md },
  getQuotes: { minHeight: 52, borderRadius: 16, backgroundColor: colors.actionPrimaryBackground, alignItems: 'center', justifyContent: 'center' },
  getQuotesText: { color: colors.actionPrimaryText, fontWeight: typography.bold },
  horizontalContent: { paddingVertical: 1 },
  section: { gap: 3, marginTop: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reverse: { flexDirection: 'row-reverse' },
  sectionTitle: { fontSize: 19, fontWeight: typography.semibold },
  sectionHint: { fontSize: 11, color: colors.textMuted },
  shelf: { gap: spacing.md },
  action: { fontSize: 13, color: colors.textSecondary },
});
