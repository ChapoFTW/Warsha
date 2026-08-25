import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, EmptyState } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { WarshaIcon } from '@/components/warsha/WarshaIcon';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { warshaIconCoverage } from '@/src/brand/warsha-icons';
import { adminSurfaceEnabled } from '@/src/config/environment';
import { useLocalization } from '@/src/i18n/localization';
import { professionLabel } from '@/src/providers/profession-taxonomy';
import { serviceCategoryLabel } from '@/src/i18n/service-labels';
import { serviceCategoryTranslationKey } from '@/src/services/service-catalogue';

/**
 * Every approved mark the product can reach, at the sizes it draws them.
 *
 * An engineering surface, not a product one. Icon defects are visual — a mark
 * that is unreadable at 16px, two marks with the same silhouette, an accent
 * that fills too much of the live area — and none of them fail a test. This
 * puts all fifty-five resolutions on one screen so a person can see them
 * together instead of hunting the app for one card at a time.
 *
 * Gated behind the same flag as the staff surface and reachable only by typing
 * the route: it is never linked from navigation, so it cannot appear in a
 * customer's or a worker's product.
 *
 * The theme is the device's. To check the family in dark, switch the device —
 * that exercises the same token path the real screens use, where a hard-coded
 * preview would not.
 */
export default function IconGalleryScreen() {
  const styles = useThemedStyles(makeStyles);
  const colors = useThemeColors();
  const { language } = useLocalization();

  if (!adminSurfaceEnabled) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState
          title="Not available"
          body="The icon gallery is an engineering surface and is not enabled in this build."
          action="Back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const coverage = warshaIconCoverage();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenHeader title="Warsha icon family" subtitle={`${coverage.categories.length} categories · ${coverage.professions.length} trades`} />

        <AppText style={styles.section}>Categories</AppText>
        <View style={styles.grid}>
          {coverage.categories.map(entry => (
            <View key={entry.id} style={styles.cell}>
              <View style={styles.ground}><WarshaIcon name={entry.icon} size="lg" /></View>
              <AppText style={styles.caption}>
                {serviceCategoryLabel(serviceCategoryTranslationKey(entry.id), language, entry.id)}
              </AppText>
            </View>
          ))}
        </View>

        <AppText style={styles.section}>Trades with their own mark</AppText>
        <View style={styles.grid}>
          {coverage.professions.filter(entry => entry.own).map(entry => (
            <View key={entry.key} style={styles.cell}>
              <View style={styles.ground}><WarshaIcon name={entry.icon} size="lg" /></View>
              <AppText style={styles.caption}>{professionLabel(entry.key, language)}</AppText>
            </View>
          ))}
        </View>

        <AppText style={styles.section}>Trades inheriting their category&apos;s mark</AppText>
        <View style={styles.grid}>
          {coverage.professions.filter(entry => !entry.own).map(entry => (
            <View key={entry.key} style={styles.cell}>
              <View style={styles.ground}><WarshaIcon name={entry.icon} size="lg" /></View>
              <AppText style={styles.caption}>{professionLabel(entry.key, language)}</AppText>
              <AppText style={styles.inherited}>via {entry.inheritedFrom}</AppText>
            </View>
          ))}
        </View>

        <AppText style={styles.section}>Withdrawn — history only</AppText>
        <View style={styles.grid}>
          {coverage.withdrawnProfessions.map(entry => (
            <View key={entry.key} style={styles.cell}>
              <View style={styles.ground}><WarshaIcon name={entry.icon} size="lg" /></View>
              <AppText style={styles.caption}>{professionLabel(entry.key, language)}</AppText>
            </View>
          ))}
        </View>

        {/* The sizes the containers actually use, so a mark that dissolves at
            16px is visible here rather than in a customer's list row. */}
        <AppText style={styles.section}>Size ladder</AppText>
        {coverage.categories.slice(0, 6).map(entry => (
          <View key={entry.id} style={styles.ladder}>
            {[16, 20, 24, 32, 40].map(size => (
              <View key={size} style={styles.ladderCell}>
                <WarshaIcon name={entry.icon} size={size} color={colors.textSecondary} />
                <AppText style={styles.inherited}>{size}</AppText>
              </View>
            ))}
          </View>
        ))}

        <BrandButton label="Back" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  section: { marginTop: spacing.lg, fontSize: 17, fontWeight: typography.bold, color: colors.textPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell: { width: 96, alignItems: 'center', gap: spacing.xs },
  ground: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.surfaceSoft },
  caption: { fontSize: 11, lineHeight: 15, textAlign: 'center', color: colors.textSecondary },
  inherited: { fontSize: 10, color: colors.textMuted },
  ladder: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xs },
  ladderCell: { alignItems: 'center', gap: 2 },
});
