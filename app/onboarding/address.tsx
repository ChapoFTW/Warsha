import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandTextField, StateBadge } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useAddresses } from '@/src/addresses/address-context';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useOnboarding } from '@/src/onboarding/onboarding-context';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';
import { locationCapability } from '@/src/onboarding/location-provider';
import { isValidCoordinate } from '@/src/onboarding/onboarding-types';

/**
 * Confirming a service location.
 *
 * The rule this screen enforces, from WPS-023: GPS permission is optional and
 * a confirmed pin is mandatory. Those are compatible because placing the pin
 * manually is a first-class path, not a fallback — it is presented as the
 * working option, and the two provider-backed options are shown as
 * unavailable rather than hidden.
 *
 * Hiding them would be the easier design and the worse one. Somebody who
 * expects "use my location" and cannot find it assumes the app is broken;
 * somebody who sees it greyed out with a reason knows where they stand.
 */
export default function CustomerAddressOnboarding() {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const ot = useOnboardingText();
  const onboarding = useOnboarding();
  const addresses = useAddresses();

  const [governorate, setGovernorate] = useState('');
  const [district, setDistrict] = useState('');
  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const parsedLatitude = latitude.trim() === '' ? null : Number(latitude);
  const parsedLongitude = longitude.trim() === '' ? null : Number(longitude);
  const coordinatesValid = isValidCoordinate(parsedLatitude, parsedLongitude);
  const detailsComplete = governorate.trim().length > 0 && street.trim().length > 0;

  const confirm = async () => {
    if (!coordinatesValid || parsedLatitude === null || parsedLongitude === null) {
      setMessage(ot.text('addressPinInvalid'));
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const created = await addresses.add({
        label: 'Home',
        governorate: governorate.trim(),
        district: district.trim(),
        street: street.trim(),
        building: building.trim(),
        floor: floor.trim(),
        apartment: apartment.trim(),
        landmark: landmark.trim(),
        instructions: notes.trim(),
        isDefault: true,
      });
      const confirmed = await onboarding.confirmAddress({
        addressId: created.id,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        pinSource: 'manual_pin',
        building: building.trim() || null,
        floor: floor.trim() || null,
        apartment: apartment.trim() || null,
        landmark: landmark.trim() || null,
        serviceNotes: notes.trim() || null,
      });
      if (!confirmed) setMessage(ot.text('genericError'));
    } catch {
      setMessage(ot.text('genericError'));
    } finally {
      setBusy(false);
    }
  };

  if (onboarding.state.addressConfirmed) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.page}>
          <AppText accessibilityRole="header" style={styles.title}>
            {ot.text('addressConfirmed')}
          </AppText>
          <StateBadge label={ot.text('addressConfirmed')} tone="success" />
          <AppText style={styles.hint}>{ot.text('a11yPinConfirmed')}</AppText>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <AppText accessibilityRole="header" style={styles.title}>{ot.text('addressTitle')}</AppText>
        <AppText style={styles.hint}>{ot.text('addressIntro')}</AppText>

        <BrandCard style={styles.card}>
          <AppText style={styles.sectionTitle}>{ot.text('addressPlaceOnMap')}</AppText>
          {/* Shown, not hidden, and shown with the reason. */}
          <View style={[styles.pathRow, isRTL && styles.reverse]}>
            <AppText style={styles.pathLabel}>{ot.text('addressUseLocation')}</AppText>
            <StateBadge
              label={ot.text('addressUnavailable')}
              tone={locationCapability.deviceLocation ? 'success' : 'neutral'}
              compact
            />
          </View>
          <View style={[styles.pathRow, isRTL && styles.reverse]}>
            <AppText style={styles.pathLabel}>{ot.text('addressSearch')}</AppText>
            <StateBadge
              label={ot.text('addressUnavailable')}
              tone={locationCapability.addressSearch ? 'success' : 'neutral'}
              compact
            />
          </View>
          <AppText style={styles.note}>{ot.text('addressLocationUnavailableNote')}</AppText>
          <AppText style={styles.note}>{ot.text('addressPermissionOptional')}</AppText>
        </BrandCard>

        <View style={styles.form}>
          <BrandTextField label={ot.text('addressGovernorate')} value={governorate} onChangeText={setGovernorate} />
          <BrandTextField label={ot.text('addressCity')} value={district} onChangeText={setDistrict} />
          <BrandTextField label={ot.text('addressStreet')} value={street} onChangeText={setStreet} />
          <BrandTextField label={ot.text('addressBuilding')} value={building} onChangeText={setBuilding} />
          <BrandTextField label={ot.text('addressFloor')} value={floor} onChangeText={setFloor} />
          <BrandTextField label={ot.text('addressApartment')} value={apartment} onChangeText={setApartment} />
          <BrandTextField label={ot.text('addressLandmark')} value={landmark} onChangeText={setLandmark} />
          <BrandTextField label={ot.text('addressNotes')} value={notes} onChangeText={setNotes} multiline />
          <BrandTextField
            label={ot.text('addressLatitude')}
            value={latitude}
            onChangeText={setLatitude}
            keyboardType="numbers-and-punctuation"
            helper={ot.text('addressPinRequired')}
          />
          <BrandTextField
            label={ot.text('addressLongitude')}
            value={longitude}
            onChangeText={setLongitude}
            keyboardType="numbers-and-punctuation"
          />
          <BrandButton
            label={ot.text('addressConfirm')}
            loading={busy}
            disabled={busy || !coordinatesValid || !detailsComplete}
            onPress={() => void confirm()}
          />
        </View>

        {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { padding: spacing.xl, gap: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: typography.bold, color: colors.textPrimary },
  sectionTitle: { fontSize: 16, fontWeight: typography.semibold, color: colors.textPrimary },
  hint: { color: colors.textSecondary },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  card: { gap: spacing.sm },
  pathRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  pathLabel: { flex: 1, color: colors.textSecondary },
  form: { gap: spacing.md },
  error: { color: colors.errorText },
});
