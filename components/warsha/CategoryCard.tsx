import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { categoryIconName } from '@/src/brand/warsha-icons';
import { Category } from '@/src/data/mock-data';
import { useLocalization } from '@/src/i18n/localization';

import { AppText } from './Typography';
import { WarshaIcon } from './WarshaIcon';

/**
 * A service category, as a customer meets it.
 *
 * The mark is Warsha's own, resolved from the category id through the shared
 * icon authority rather than from `service_categories.icon_name` — a column
 * holding unvalidated Material glyph names, where a name Material did not know
 * drew an empty box and said nothing.
 *
 * The container follows the approved spec: a 48px squircle on `surfaceSoft`
 * holding a 24px icon, which is the 12px optical padding the family was drawn
 * for. The icon is decorative; the localized name beside it is what a screen
 * reader announces.
 */
export function CategoryCard({ item }: { item: Category }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useLocalization();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/categories/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={styles.iconGround}>
        <WarshaIcon name={categoryIconName(item.id)} size="lg" />
      </View>
      <AppText style={styles.label}>{t(item.label)}</AppText>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { width: 104, minHeight: 112, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  iconGround: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.surfaceSoft },
  label: { fontSize: 12, lineHeight: 17, fontWeight: typography.medium, textAlign: 'center' },
});
