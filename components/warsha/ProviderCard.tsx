import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { useLocalPreferences } from '@/src/data/local-preferences';
import type { Provider } from '@/src/data/marketplace-types';
import { useLocalization } from '@/src/i18n/localization';

import {
  initialProviderMediaState,
  PROVIDER_MEDIA_HEIGHT,
  reduceProviderMediaState,
  shouldRenderProviderMedia,
} from './provider-card-media';
import { ProviderTrustIndicators } from './ProviderTrustIndicators';
import { AppText } from './Typography';

export function ProviderCard({ item, width }: { item: Provider; width: number }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL } = useLocalization();
  const { user, mode } = useAuth();
  const { isFavourite, toggleFavourite } = useLocalPreferences();
  const [mediaState, setMediaState] = useState(() => initialProviderMediaState(item.image));

  useEffect(() => {
    setMediaState(initialProviderMediaState(item.image));
  }, [item.image]);

  const hasMedia = shouldRenderProviderMedia(mediaState);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/provider/[id]', params: { id: item.id } })}
      style={[styles.card, !hasMedia && styles.cardWithoutMedia, { width }]}
    >
      {hasMedia ? (
        <View style={styles.media}>
          <Image
            source={{ uri: item.image }}
            contentFit="cover"
            contentPosition="top center"
            transition={250}
            onLoadStart={() => setMediaState((state) => reduceProviderMediaState(state, 'load-start'))}
            onLoad={() => setMediaState((state) => reduceProviderMediaState(state, 'loaded'))}
            onError={() => setMediaState((state) => reduceProviderMediaState(state, 'failed'))}
            style={styles.image}
          />
          {mediaState === 'loading' ? <View testID="provider-image-skeleton" style={styles.skeleton} /> : null}
        </View>
      ) : null}

      <View style={styles.content}>
        <View style={[styles.topRow, isRTL && styles.reverse]}>
          <View style={[styles.identity, isRTL && styles.reverse]}>
            {!hasMedia ? (
              <View accessibilityElementsHidden style={styles.avatarFallback}>
                <MaterialIcons name="person-outline" size={18} color={colors.textSecondary} />
              </View>
            ) : null}
            <AppText numberOfLines={1} style={styles.name}>{item.name}</AppText>
          </View>
          <Pressable
            accessibilityLabel={t('toggleFavourite')}
            onPress={(event) => {
              event.stopPropagation();
              void (mode === 'supabase' && !user ? router.push('/(tabs)/profile') : toggleFavourite(item.id));
            }}
            style={styles.favorite}
          >
            <MaterialIcons name={isFavourite(item.id) ? 'favorite' : 'favorite-border'} size={19} color={colors.white} />
          </Pressable>
        </View>

        <ProviderTrustIndicators identityVerified={item.verified} skillCertificateVerified={item.skillCertificateVerified} compact />

        <View style={[styles.meta, isRTL && styles.reverse]}>
          <AppText numberOfLines={1} style={styles.profession}>{t(item.profession)}</AppText>
          <AppText style={styles.profession}>{item.distance.toFixed(1)} km</AppText>
        </View>

        <View style={[styles.rating, isRTL && styles.reverse]}>
          <MaterialIcons name="star" size={14} color={colors.white} />
          <AppText style={styles.ratingText}>
            {item.rating}{' '}
            <AppText style={styles.reviewCount}>({item.reviewCount} {t('reviews')})</AppText>
          </AppText>
        </View>

        <View style={styles.divider} />
        <View style={[styles.price, isRTL && styles.reverse]}>
          <AppText numberOfLines={1} style={styles.priceLabel}>{item.available ? t('available') : item.responseTime}</AppText>
          <AppText style={styles.priceText}>{item.price} EGP</AppText>
        </View>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  cardWithoutMedia: { minHeight: 196 },
  media: { height: PROVIDER_MEDIA_HEIGHT, backgroundColor: colors.surfaceSoft },
  image: { ...StyleSheet.absoluteFillObject },
  skeleton: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surfaceElevated },
  content: { padding: spacing.lg, gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  avatarFallback: { width: 32, height: 32, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  favorite: { width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 19, fontWeight: typography.semibold, flexShrink: 1 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  profession: { flexShrink: 1, fontSize: 13, color: colors.textSecondary },
  rating: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  ratingText: { fontSize: 12, fontWeight: typography.semibold },
  reviewCount: { color: colors.textSecondary, fontSize: 11, fontWeight: typography.regular },
  divider: { height: 1, backgroundColor: colors.borderSoft },
  price: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  priceLabel: { color: colors.textSecondary, fontSize: 11, flex: 1 },
  priceText: { fontSize: 18, fontWeight: typography.bold },
});
