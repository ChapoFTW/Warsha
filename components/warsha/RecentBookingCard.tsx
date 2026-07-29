import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';
import { bookingStatusTranslationKeys } from '@/src/bookings/booking-types';
import { useBookings } from '@/src/bookings/booking-context';
import { useMarketplaceData } from '@/src/data/marketplace-context';
import { useLocalization } from '@/src/i18n/localization';
import { formatBookingDateTime, localeFor } from '@/src/utils/date-format';

import { AppText } from './Typography';

export function RecentBookingCard() {
  const { t, isRTL, language } = useLocalization();
  const { bookings } = useBookings();
  const { getProvider } = useMarketplaceData();
  const booking = [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const provider = booking ? getProvider(booking.providerId) : undefined;
  if (!booking || !provider) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('viewBookingDetails')}
      onPress={() => router.push({ pathname: '/booking/[id]', params: { id: booking.id } })}
      style={[styles.card, isRTL && styles.reverse]}>
      <Image source={{ uri: provider.image }} style={styles.avatar} />
      <View style={styles.info}>
        <AppText style={styles.name}>{provider.name}</AppText>
        <AppText style={styles.meta}>
          {booking.serviceName} · {formatBookingDateTime(booking.date, booking.time, localeFor(language), t('asap'))}
        </AppText>
        <View style={[styles.status, isRTL && styles.reverse]}>
          <MaterialIcons name="schedule" size={14} color={colors.success} />
          <AppText style={styles.statusText}>{t(bookingStatusTranslationKeys[booking.status])}</AppText>
        </View>
      </View>
      <View style={styles.button}>
        <MaterialIcons name={isRTL ? 'arrow-back' : 'arrow-forward'} size={20} color={colors.textPrimary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 108, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  reverse: { flexDirection: 'row-reverse' },
  avatar: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.surfaceSoft },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: typography.semibold },
  meta: { fontSize: 12, color: colors.textMuted },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  statusText: { fontSize: 11, color: colors.success },
  button: { width: 38, height: 38, borderRadius: 14, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
});
