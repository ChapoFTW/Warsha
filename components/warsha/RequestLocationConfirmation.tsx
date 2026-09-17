import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AddressLocationPicker } from '@/components/warsha/AddressLocationPicker';
import type { PinPosition } from '@/components/warsha/AddressMap';
import { BrandButton, BrandCard } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useAddresses } from '@/src/addresses/address-context';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import type { Address } from '@/src/bookings/booking-types';
import { useAddressFormText, useAddressLocationPickerCopy } from '@/src/i18n/address-form-copy';
import type { PinSource } from '@/src/onboarding/onboarding-types';

/**
 * Confirming where a saved address is, from inside the request form.
 *
 * A request needs a confirmed pin (202609170007). An address saved before that
 * rule, or whose coordinates were never confirmed, would otherwise be a dead
 * end: selectable, then refused. This is the way through, without leaving the
 * form, so nothing the Customer wrote is at risk.
 *
 * The picker decides what counts as a location, as it does everywhere else: a
 * device fix, a pin dropped on a map, or a place the address search resolved —
 * which is how a map that cannot draw still confirms. A search that resolves
 * nothing gives no coordinates, and the button stays disabled: nothing is
 * invented and nothing is sent.
 */
export function RequestLocationConfirmation({ address }: { address: Address }) {
  const styles = useThemedStyles(makeStyles);
  const addressText = useAddressFormText();
  // The picker's own fallback note invites the reader to type the address;
  // this card has no address fields, so it says what is still possible here.
  const pickerCopy = {
    ...useAddressLocationPickerCopy(),
    providerUnavailable: addressText('confirmLocationPickerUnavailable'),
    mapUnavailable: addressText('confirmLocationPickerUnavailable'),
  };
  const { confirmPin } = useAddresses();
  const [pin, setPin] = useState<PinPosition | null>(null);
  const [source, setSource] = useState<PinSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    if (!pin || !source) return;
    setBusy(true);
    setFailed(false);
    try {
      await confirmPin(address.id, { latitude: pin.latitude, longitude: pin.longitude, pinSource: source });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BrandCard style={styles.card}>
      <AppText accessibilityRole="header" style={styles.title}>{addressText('confirmLocationTitle')}</AppText>
      <AppText style={styles.body}>{addressText('confirmLocationBody')}</AppText>
      <AddressLocationPicker
        key={address.id}
        value={pin}
        copy={pickerCopy}
        onChange={(position, pinSource) => {
          setPin(position);
          setSource(pinSource);
          setFailed(false);
        }}
      />
      <BrandButton
        label={addressText('confirmLocationAction')}
        loading={busy}
        disabled={busy || !pin || !source}
        onPress={() => void confirm()}
      />
      {failed ? (
        <AppText accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>
          {addressText('confirmLocationFailed')}
        </AppText>
      ) : null}
    </BrandCard>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { gap: spacing.md },
  title: { ...typography.h3, fontWeight: typography.semibold, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  error: { color: colors.errorText },
});
