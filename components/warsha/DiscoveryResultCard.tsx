import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { useLocalPreferences } from '@/src/data/local-preferences';
import { useDiscovery } from '@/src/discovery/discovery-context';
import { useDiscoveryText } from '@/src/discovery/discovery-translations';
import type { DiscoveryProviderCard } from '@/src/discovery/discovery-types';
import { useLocalization } from '@/src/i18n/localization';
import { professionLabel } from '@/src/providers/profession-taxonomy';

import { PressableSurface } from './PressableSurface';
import { AppText } from './Typography';

/**
 * A search or discovery result.
 *
 * Every state carries an icon and a word, never a colour alone: availability is
 * a filled/outlined dot plus "Available now", and each verification is a named
 * badge. Someone who cannot distinguish green from grey loses nothing.
 */
export function DiscoveryResultCard({ provider }: { provider: DiscoveryProviderCard }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL, language } = useLocalization();
  const dt = useDiscoveryText();
  const { user, mode } = useAuth();
  const { isFavourite, toggleFavourite } = useLocalPreferences();
  const { recordView } = useDiscovery();
  const saved = isFavourite(provider.id);

  const open = () => {
    recordView(provider.id);
    router.push({ pathname: '/provider/[id]', params: { id: provider.id } });
  };

  const reviews = provider.reviewCount === 0
    ? dt.text('noReviewsYet')
    : `${provider.reviewCount} ${provider.reviewCount === 1 ? dt.text('oneReviewLabel') : dt.text('reviewsLabel')}`;

  return (
    <PressableSurface
      accessibilityRole="button"
      feedback="surface"
      accessibilityLabel={`${provider.displayName}. ${provider.isAvailable ? dt.text('availableNow') : dt.text('unavailableNow')}. ${reviews}`}
      onPress={open}
      style={({ pressed }) => [styles.card, isRTL && styles.reverse, pressed && styles.pressed]}>
      {provider.avatarRef
        ? <Image source={{ uri: provider.avatarRef }} contentFit="cover" style={styles.image} />
        : <View style={[styles.image, styles.imageFallback]}><MaterialIcons name="person" size={30} color={colors.textMuted} /></View>}
      <View style={styles.body}>
        <AppText numberOfLines={1} style={styles.name}>{provider.displayName}</AppText>
        <AppText style={styles.profession}>
          {professionLabel(provider.professionKey, language)}
          {provider.areaLabel ? ` · ${provider.areaLabel}` : ''}
          {provider.distanceKm !== null ? ` · ${provider.distanceKm} ${dt.text('kilometresAway')}` : ''}
        </AppText>

        <View style={[styles.badges, isRTL && styles.reverse]}>
          {provider.identityVerified ? <Badge icon="verified-user" label={dt.text('verifiedIdentity')} /> : null}
          {provider.skillCertificateVerified ? <Badge icon="workspace-premium" label={dt.text('verifiedSkill')} /> : null}
          {provider.professionalCertificateVerified ? <Badge icon="school" label={dt.text('verifiedCertificate')} /> : null}
          {provider.emergencyAvailable ? <Badge icon="bolt" label={dt.text('emergencyAvailable')} /> : null}
        </View>

        <View style={[styles.metrics, isRTL && styles.reverse]}>
          <View style={[styles.inline, isRTL && styles.reverse]}>
            <MaterialIcons name="star" size={15} color={colors.textPrimary} />
            <AppText style={styles.rating}>{provider.ratingAverage.toFixed(1)}</AppText>
            <AppText style={styles.muted}>({reviews})</AppText>
          </View>
          <AppText style={styles.muted}>{provider.completedJobs} {dt.text('jobsLabel')}</AppText>
        </View>

        <View style={[styles.bottom, isRTL && styles.reverse]}>
          <View style={[styles.inline, isRTL && styles.reverse]}>
            <MaterialIcons
              name={provider.isAvailable ? 'circle' : 'radio-button-unchecked'}
              size={10}
              color={provider.isAvailable ? colors.successText : colors.textMuted} />
            <AppText style={styles.muted}>
              {provider.isAvailable ? dt.text('availableNow') : provider.responseTimeLabel ?? dt.text('unavailableNow')}
            </AppText>
          </View>
          {provider.startingPriceEgp !== null
            ? <AppText style={styles.price}>{dt.text('startingFrom')} {provider.startingPriceEgp} {t('currency')}</AppText>
            : null}
        </View>
      </View>

      <PressableSurface
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={saved ? dt.text('removeFavourite') : dt.text('addFavourite')}
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          if (mode === 'supabase' && !user) { router.push('/(tabs)/profile'); return; }
          toggleFavourite(provider.id);
        }}
        style={styles.favourite}>
        <MaterialIcons name={saved ? 'favorite' : 'favorite-border'} size={20} color={colors.textPrimary} />
      </PressableSurface>
    </PressableSurface>
  );
}

function Badge({ icon, label }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  return (
    <View style={[styles.badge, isRTL && styles.reverse]}>
      <MaterialIcons name={icon} size={12} color={colors.textSecondary} />
      <AppText style={styles.badgeText}>{label}</AppText>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
  pressed: { backgroundColor: colors.cardPressed },
  reverse: { flexDirection: 'row-reverse' },
  image: { width: 86, height: 110, borderRadius: radii.md, backgroundColor: colors.surfaceElevated },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 5 },
  name: { fontSize: 17, fontWeight: typography.semibold },
  profession: { flexShrink: 1, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated },
  badgeText: { fontSize: 9, color: colors.textSecondary },
  metrics: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  rating: { fontSize: 12, fontWeight: typography.semibold },
  muted: { fontSize: 11, color: colors.textMuted },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, gap: spacing.sm },
  price: { fontSize: 12, fontWeight: typography.bold },
  favourite: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
