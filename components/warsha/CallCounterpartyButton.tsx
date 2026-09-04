import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet } from 'react-native';

import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import {
  isBookingContactUnavailable,
  parseBookingContact,
  telUri,
} from '@/src/bookings/booking-contact';
import { useLocalization } from '@/src/i18n/localization';
import { getSupabaseClient } from '@/src/lib/supabase';
import { environment } from '@/src/config/environment';

import { PressableSurface } from './PressableSurface';
import { AppText } from './Typography';

/**
 * Call the other person on this job.
 *
 * ## When it exists
 *
 * Only when the server says a call is appropriate. `booking_contact_is_available`
 * is asked on mount and whenever the booking's status changes; a false answer
 * removes the control rather than disabling it, because a Call button that
 * cannot call is worse than no Call button.
 *
 * That question is deliberately separate from fetching the number. Asking for a
 * telephone number in order to decide whether to draw a button would pull
 * numbers into every booking screen that renders, which is the habit the whole
 * design exists to prevent.
 *
 * ## What it does when pressed
 *
 * Fetches the number, opens the dialler, and keeps nothing. The number is a
 * local constant inside one function call: it is not stored in state, not
 * logged, and not returned anywhere a render can reach.
 *
 * ## Every way this can fail, and what happens
 *
 *   the relationship ended between render and press  the server refuses; the
 *                                                    reason is shown and the
 *                                                    control disappears
 *   the counterparty has no number on file           an explanation pointing at
 *                                                    the chat, which does work
 *   the number is malformed                          the same, because
 *                                                    `telUri` returns null
 *                                                    rather than a guess
 *   the device cannot dial (a tablet, a simulator)   an explanation, not a
 *                                                    silent no-op
 *   anything else                                    a safe generic failure;
 *                                                    the underlying error is
 *                                                    never shown to the user
 *
 * None of these throw. A telephone call is a convenience on top of a job that
 * still works without it.
 */
export function CallCounterpartyButton({
  bookingId,
  counterpartyRole,
  counterpartyName,
  bookingStatus,
}: {
  bookingId: string;
  /** Which side the OTHER person is on, so the label is theirs, not the caller's. */
  counterpartyRole: 'customer' | 'worker';
  counterpartyName?: string;
  /** Re-asks the server when the job moves on, so the control keeps up with it. */
  bookingStatus?: string;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useLocalization();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  const label = t(counterpartyRole === 'worker' ? 'callWorker' : 'callCustomer');
  const who = counterpartyName?.trim() || label;

  useEffect(() => {
    // Mock mode has no telephone numbers and no RPC to ask. The control is
    // absent rather than broken, which is what every other server-backed
    // affordance does in mock mode.
    if (environment.dataMode === 'mock' || !bookingId) { setAvailable(false); return; }
    let active = true;
    void getSupabaseClient()
      .rpc('booking_contact_is_available', { p_booking_id: bookingId })
      .then(({ data, error }) => {
        if (active) setAvailable(!error && data === true);
      });
    return () => { active = false; };
  }, [bookingId, bookingStatus]);

  const call = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await getSupabaseClient()
        .rpc('get_booking_counterparty_contact', { p_booking_id: bookingId });
      if (error) {
        // The relationship ended between drawing the button and pressing it.
        if (isBookingContactUnavailable(error)) {
          setAvailable(false);
          Alert.alert(t('callUnavailable'));
        } else {
          Alert.alert(t('callFailed'));
        }
        return;
      }
      const contact = parseBookingContact(data);
      const uri = telUri(contact?.phone);
      if (!uri) {
        Alert.alert(t('callNoNumber').replace('{name}', contact?.displayName?.trim() || who));
        return;
      }
      // `canOpenURL` is the honest check for a device with no telephony. It is
      // asked before dialling rather than after, so a tablet gets an
      // explanation instead of a button that appears to do nothing.
      if (!(await Linking.canOpenURL(uri))) {
        Alert.alert(t('callDeviceUnsupported'));
        return;
      }
      await Linking.openURL(uri);
    } catch {
      Alert.alert(t('callFailed'));
    } finally {
      setBusy(false);
    }
  }, [bookingId, busy, t, who]);

  if (!available) return null;

  return (
    <PressableSurface
      accessibilityRole="button"
      accessibilityLabel={t('callAccessibility').replace('{name}', who)}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={() => void call()}
      style={styles.button}>
      <MaterialIcons
        accessibilityElementsHidden
        importantForAccessibility="no"
        name="call"
        size={18}
        color={colors.textPrimary}
      />
      <AppText style={styles.label}>{label}</AppText>
    </PressableSurface>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  label: { fontSize: 14, lineHeight: 20, fontWeight: typography.semibold, color: colors.textPrimary },
});
