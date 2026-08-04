import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DiscoveryResultCard } from '@/components/warsha/DiscoveryResultCard';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useDiscovery } from '@/src/discovery/discovery-context';
import { useDiscoveryText } from '@/src/discovery/discovery-translations';
import { useLocalization } from '@/src/i18n/localization';

/**
 * Recently viewed workers.
 *
 * Private, bounded, and clearable. The hint under the title is not decoration:
 * a browsing history that silently shaped who other people were shown would be
 * exactly the kind of opaque scoring WPS-020 forbids, so the screen says out
 * loud that it does not.
 */
export default function RecentlyViewedScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const dt = useDiscoveryText();
  const { recentlyViewed, clearRecentlyViewed } = useDiscovery();

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={recentlyViewed}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <DiscoveryResultCard provider={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader title={dt.text('recentlyViewed')} subtitle={`${recentlyViewed.length}`} />
            <AppText style={styles.hint}>{dt.text('recentlyViewedHint')}</AppText>
            {recentlyViewed.length ? (
              <Pressable accessibilityRole="button" accessibilityLabel={dt.text('clearRecentlyViewed')}
                onPress={clearRecentlyViewed} style={[styles.clear, isRTL && styles.reverse]}>
                <MaterialIcons name="delete-outline" size={17} color={colors.textPrimary} />
                <AppText style={styles.clearText}>{dt.text('clearRecentlyViewed')}</AppText>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.state}>
            <MaterialIcons name="history" size={38} color={colors.textMuted} />
            <AppText style={styles.stateBody}>{dt.text('recentlyViewedEmpty')}</AppText>
          </View>
        } />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, maxWidth: 720, width: '100%', alignSelf: 'center', flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  reverse: { flexDirection: 'row-reverse' },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  clear: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderDefault },
  clearText: { fontSize: 12, fontWeight: typography.semibold },
  state: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.md },
  stateBody: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
});
