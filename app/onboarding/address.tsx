import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressLocationPicker, type AddressLocationPickerCopy } from '@/components/warsha/AddressLocationPicker';
import { BrandButton, BrandCard, BrandLoadingState, BrandTextField } from '@/components/warsha/BrandUI';
import { EgyptLocationSelector } from '@/components/warsha/EgyptLocationSelector';
import { OnboardingFieldMeta } from '@/components/warsha/OnboardingFieldMeta';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useAddresses } from '@/src/addresses/address-context';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useOnboarding } from '@/src/onboarding/onboarding-context';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';
import type { PinSource } from '@/src/onboarding/onboarding-types';
import { useProviderFoundation } from '@/src/providers/provider-context';
import type { PinPosition } from '@/src/providers/map-renderer-types';
import type { ProviderAreaInput } from '@/src/providers/provider-types';
import { useWorkerText } from '@/src/worker/worker-copy';

/**
 * One route and one location infrastructure, with two deliberately separate
 * presentations. A worker establishes a private matching coordinate. A
 * customer describes a destination where a booked worker must arrive.
 */
export default function AddressOnboardingRoute() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const onboarding = useOnboarding();
  const provider = useProviderFoundation();
  const wt = useWorkerText();
  const returnToWorker = returnTo === 'worker' || onboarding.state.intendedRole === 'worker';

  if (returnToWorker && provider.loading) {
    return <SafeAreaView style={{ flex: 1 }}><BrandLoadingState label={wt.text('workLocationTitle')} /></SafeAreaView>;
  }

  if (returnToWorker) {
    return <WorkerCurrentLocationFlow area={provider.profile?.areas[0] ?? null} />;
  }

  return <CustomerDestinationAddressFlow />;
}

function WorkerCurrentLocationFlow({ area }: { area: ProviderAreaInput | null }) {
  const styles = useThemedStyles(makeStyles);
  const wt = useWorkerText();
  const ot = useOnboardingText();
  const onboarding = useOnboarding();
  const addresses = useAddresses();
  const [pin, setPin] = useState<PinPosition | null>(null);
  const [pinSource, setPinSource] = useState<PinSource | null>(null);
  const [formattedAddress, setFormattedAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const pickerCopy: AddressLocationPickerCopy = {
    useCurrentLocation: wt.text('useCurrentLocation'),
    chooseOnMap: wt.text('chooseLocationOnMap'),
    searchAddress: wt.text('searchAddress'),
    searchPlaceholder: wt.text('searchAddressPlaceholder'),
    locationSaved: wt.text('locationSaved'),
    locationFailed: wt.text('locationFailed'),
    locationPermissionDenied: wt.text('locationPermissionDenied'),
    locationServicesDisabled: wt.text('locationServicesDisabled'),
    locationDeviceUnavailable: wt.text('locationDeviceUnavailable'),
    noSearchResults: wt.text('locationNoResults'),
    providerUnavailable: wt.text('locationProviderUnavailable'),
    permissionOptional: wt.text('locationPermissionOptional'),
    mapUnavailable: wt.text('locationProviderUnavailable'),
    mapDragHint: wt.text('mapDragHint'),
    loading: wt.text('locationLoading'),
  };

  const confirm = async () => {
    if (!area || !pin || !pinSource) {
      setMessage(wt.text('locationRequired'));
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const internalAddressLine = formattedAddress?.trim()
        || [area.district, area.governorate].filter(Boolean).join(', ');
      const created = await addresses.add({
        label: 'Work location',
        governorate: area.governorate,
        district: area.district,
        street: internalAddressLine,
        building: '',
        floor: '',
        apartment: '',
        landmark: '',
        instructions: '',
        isDefault: true,
      });
      const confirmed = await onboarding.confirmAddress({
        addressId: created.id,
        latitude: pin.latitude,
        longitude: pin.longitude,
        pinSource,
      });
      if (!confirmed) setMessage(ot.text('genericError'));
      else router.replace('/onboarding/worker');
    } catch {
      setMessage(ot.text('genericError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <AppText accessibilityRole="header" style={styles.title}>{wt.text('workLocationTitle')}</AppText>
        <OnboardingFieldMeta
          label={wt.text('workLocationTitle')}
          required
          privateField
          purpose={wt.text('workLocationIntro')}
        />

        {area ? (
          <BrandCard style={styles.areaCard}>
            <AppText style={styles.sectionTitle}>{wt.text('selectedWorkArea')}</AppText>
            <View style={styles.areaRow}>
              <AppText style={styles.areaLabel}>{wt.text('governorate')}</AppText>
              <AppText style={styles.areaValue}>{area.governorate}</AppText>
            </View>
            <View style={styles.areaRow}>
              <AppText style={styles.areaLabel}>{wt.text('district')}</AppText>
              <AppText style={styles.areaValue}>{area.district}</AppText>
            </View>
          </BrandCard>
        ) : (
          <BrandCard><AppText style={styles.error}>{wt.text('workAreaMissing')}</AppText></BrandCard>
        )}

        <AddressLocationPicker
          value={pin}
          copy={pickerCopy}
          onChange={(position, source, address) => {
            setPin(position);
            setPinSource(source);
            setFormattedAddress(address);
            setMessage('');
          }}
        />

        <BrandButton
          label={wt.text('continueJourney')}
          loading={busy}
          disabled={busy || !area || !pin || !pinSource}
          onPress={() => void confirm()}
        />
        {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CustomerDestinationAddressFlow() {
  const styles = useThemedStyles(makeStyles);
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
  const [pin, setPin] = useState<PinPosition | null>(null);
  const [pinSource, setPinSource] = useState<PinSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const pickerCopy: AddressLocationPickerCopy = {
    useCurrentLocation: ot.text('addressUseLocation'),
    chooseOnMap: ot.text('addressChooseMap'),
    searchAddress: ot.text('addressSearch'),
    searchPlaceholder: ot.text('addressSearchPlaceholder'),
    locationSaved: ot.text('addressLocationSaved'),
    locationFailed: ot.text('addressLocationFailed'),
    locationPermissionDenied: ot.text('addressLocationPermissionDenied'),
    locationServicesDisabled: ot.text('addressLocationServicesDisabled'),
    locationDeviceUnavailable: ot.text('addressLocationDeviceUnavailable'),
    noSearchResults: ot.text('addressNoSearchResults'),
    providerUnavailable: ot.text('addressLocationUnavailableNote'),
    permissionOptional: ot.text('addressPermissionOptional'),
    mapUnavailable: ot.text('addressLocationUnavailableNote'),
    mapDragHint: ot.text('addressMapDragHint'),
    loading: ot.text('addressLocationLoading'),
  };

  const detailsComplete = governorate.trim().length > 0
    && district.trim().length > 0
    && street.trim().length > 0;

  const confirm = async () => {
    if (!pin || !pinSource || !detailsComplete) {
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
        // A saved profile address is not a booking. Job-specific access notes
        // are collected when the customer creates the request that needs them.
        instructions: '',
        isDefault: true,
      });
      const confirmed = await onboarding.confirmAddress({
        addressId: created.id,
        latitude: pin.latitude,
        longitude: pin.longitude,
        pinSource,
        building: building.trim() || null,
        floor: floor.trim() || null,
        apartment: apartment.trim() || null,
        landmark: landmark.trim() || null,
        serviceNotes: null,
      });
      if (!confirmed) setMessage(ot.text('genericError'));
      else router.replace('/');
    } catch {
      setMessage(ot.text('genericError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <AppText accessibilityRole="header" style={styles.title}>{ot.text('addressTitle')}</AppText>
        <AppText style={styles.hint}>{ot.text('addressIntro')}</AppText>

        <AddressLocationPicker
          value={pin}
          copy={pickerCopy}
          onChange={(position, source, address) => {
            setPin(position);
            setPinSource(source);
            if (address && !street.trim()) setStreet(address);
            setMessage('');
          }}
        />

        <View style={styles.form}>
          <EgyptLocationSelector
            governorate={governorate}
            district={district}
            onChange={area => {
              setGovernorate(area.governorate);
              setDistrict(area.district);
            }}
            copy={{
              governorate: ot.text('addressGovernorate'),
              district: ot.text('addressCity'),
              selectGovernorate: ot.text('addressSelectGovernorate'),
              selectDistrict: ot.text('addressSelectDistrict'),
              search: ot.text('addressSearchAdministrativeArea'),
              close: ot.text('close'),
            }}
          />
          <BrandTextField label={ot.text('addressStreet')} value={street} onChangeText={setStreet} />
          <BrandTextField label={ot.text('addressBuilding')} value={building} onChangeText={setBuilding} />
          <BrandTextField label={ot.text('addressFloor')} value={floor} onChangeText={setFloor} />
          <BrandTextField label={ot.text('addressApartment')} value={apartment} onChangeText={setApartment} />
          <BrandTextField label={ot.text('addressLandmark')} value={landmark} onChangeText={setLandmark} />
          <BrandButton
            label={ot.text('addressConfirm')}
            loading={busy}
            disabled={busy || !pin || !pinSource || !detailsComplete}
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
  page: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: typography.bold, color: colors.textPrimary },
  sectionTitle: { fontSize: 16, fontWeight: typography.semibold, color: colors.textPrimary },
  hint: { color: colors.textSecondary, lineHeight: 22 },
  areaCard: { gap: spacing.md },
  areaRow: { gap: spacing.xs },
  areaLabel: { color: colors.textMuted, fontSize: 13 },
  areaValue: { color: colors.textPrimary, fontSize: 16, fontWeight: typography.semibold },
  form: { gap: spacing.md },
  error: { color: colors.errorText },
});
