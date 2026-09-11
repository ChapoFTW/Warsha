import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { useLocalPreferences } from '@/src/data/local-preferences';
import type { Provider } from '@/src/data/marketplace-types';
import { useLocalization } from '@/src/i18n/localization';
import { professionLabel } from '@/src/providers/profession-taxonomy';

import { ProviderTrustIndicators } from './ProviderTrustIndicators';
import { PressableSurface } from './PressableSurface';
import { AppText } from './Typography';

export function ProviderListItem({ provider }: { provider: Provider }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL, language } = useLocalization();
  const { user, mode } = useAuth();
  const { isFavourite, toggleFavourite } = useLocalPreferences();
  const professionText = provider.distance === null
    ? professionLabel(provider.profession, language, 'customer')
    : `${professionLabel(provider.profession, language, 'customer')} · ${provider.distance.toFixed(1)} km`;

  const toggleFavouriteAction = () => {
    void (mode === 'supabase' && !user
      ? router.push('/(tabs)/profile')
      : toggleFavourite(provider.id));
  };

  /*
   * Said once, in the order a person would ask. Left to compose its own name
   * the row read the star icon as an empty segment and swallowed the favourite
   * button's label at the end, so it announced a hole in the middle and an
   * action it could not offer. Every part here is always present, which is what
   * makes joining them safe.
   */
  const rowName = [
    provider.name,
    professionText,
    `${provider.rating} (${provider.reviewCount} ${t('reviews')})`,
    provider.available ? t('available') : provider.responseTime,
    `${t('startsAt')} ${provider.price} EGP`,
  ].filter(Boolean).join('. ');

  return (
    /* The row is the whole target, so it is the thing that answers. The
       favourite control inside it is its own pressable and gets its own,
       smaller response — a heart is a control, not a surface. */
    <PressableSurface
      accessibilityRole="button"
      accessibilityLabel={rowName}
      /* A Pressable is an accessibility element, so a Pressable inside one is
         merged away: the heart was visible to a finger and unreachable to a
         screen reader. Offering it as an action is how a reader gets it back. */
      accessibilityActions={[{ name: 'favourite', label: t('toggleFavourite') }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'favourite') toggleFavouriteAction();
      }}
      feedback="surface"
      onPress={() => router.push({ pathname: '/provider/[id]', params: { id: provider.id } })}
      style={({ pressed }) => [styles.card, isRTL && styles.reverse, pressed && styles.cardPressed]}>
      <Image source={{ uri: provider.image }} contentFit="cover" style={styles.image} />
      <View style={styles.body}>
        <View style={[styles.nameRow, isRTL && styles.reverse]}>
          <AppText numberOfLines={1} style={styles.name}>{provider.name}</AppText>
        </View>
        <ProviderTrustIndicators
          identityVerified={provider.verified}
          skillCertificateVerified={provider.skillCertificateVerified}
          compact
        />
        <AppText style={styles.profession}>{professionText}</AppText>
        <View style={[styles.rating, isRTL && styles.reverse]}>
          <MaterialIcons accessibilityElementsHidden importantForAccessibility="no" name="star" size={15} color={colors.white} />
          <AppText style={styles.ratingText}>{provider.rating}</AppText>
          <AppText style={styles.muted}>({provider.reviewCount} {t('reviews')})</AppText>
        </View>
        <View style={[styles.bottom, isRTL && styles.reverse]}>
          <View style={[styles.availability, isRTL && styles.reverse]}>
            <View style={[styles.dot, !provider.available && styles.dotOffline]} />
            <AppText style={styles.muted}>{provider.available ? t('available') : provider.responseTime}</AppText>
          </View>
          <AppText style={styles.price}>{t('startsAt')} {provider.price} EGP</AppText>
        </View>
      </View>
      {/* Hidden from the reader on purpose: it was never reachable there, and
          the row now offers the same thing as an action. A finger still gets
          the smaller, closer target. */}
      <PressableSurface
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          toggleFavouriteAction();
        }}
        style={styles.favourite}>
        <MaterialIcons name={isFavourite(provider.id) ? 'favorite' : 'favorite-border'} size={20} color={colors.textPrimary} />
      </PressableSurface>
    </PressableSurface>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface },
  cardPressed: { backgroundColor: colors.cardPressed, borderColor: colors.borderDefault },
  reverse: { flexDirection: 'row-reverse' },
  image: { width: 86, height: 110, borderRadius: radii.md, backgroundColor: colors.surfaceElevated },
  body: { flex: 1, gap: 5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 17, fontWeight: typography.semibold, flexShrink: 1 },
  profession: { fontSize: 12, color: colors.textSecondary },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 12, fontWeight: typography.semibold },
  muted: { fontSize: 11, color: colors.textMuted },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, gap: spacing.sm },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  dotOffline: { backgroundColor: colors.textMuted },
  price: { fontSize: 12, fontWeight: typography.bold },
  favourite: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
