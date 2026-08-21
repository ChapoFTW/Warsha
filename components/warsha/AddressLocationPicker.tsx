import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AddressMap, type PinPosition } from '@/components/warsha/AddressMap';
import { BrandButton, BrandCard, BrandLoadingState, BrandTextField, StateBadge } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { environment } from '@/src/config/environment';
import type { PinSource } from '@/src/onboarding/onboarding-types';
import {
  addressResolutionState,
  type AddressResolutionState,
  type ResolvedPlace,
} from '@/src/providers/location-address';
import { resolveLocationExperienceAvailability, type LocationExperienceAvailability } from '@/src/providers/location-experience-policy';
import { newSessionToken, providerClients, requestDeviceFix, type PlaceSuggestion } from '@/src/providers/provider-clients';

export type AddressLocationPickerCopy = {
  useCurrentLocation: string;
  chooseOnMap: string;
  searchAddress: string;
  searchPlaceholder: string;
  locationSaved: string;
  locationPartial: string;
  addressLookupFailed: string;
  locating: string;
  resolvingAddress: string;
  locationFailed: string;
  locationPermissionDenied: string;
  locationServicesDisabled: string;
  locationDeviceUnavailable: string;
  noSearchResults: string;
  providerUnavailable: string;
  permissionOptional: string;
  mapUnavailable: string;
  mapDragHint: string;
  loading: string;
};

export function AddressLocationPicker({
  value,
  onChange,
  copy,
  resolutionRequirement = 'formatted',
}: {
  value: PinPosition | null;
  onChange: (position: PinPosition, source: PinSource, place: ResolvedPlace | null) => void;
  copy: AddressLocationPickerCopy;
  resolutionRequirement?: 'formatted' | 'structured';
}) {
  const styles = useThemedStyles(makeStyles);
  const [availability, setAvailability] = useState<LocationExperienceAvailability | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState<'device' | 'search' | 'pin' | null>(null);
  const [message, setMessage] = useState('');
  const [resolution, setResolution] = useState<AddressResolutionState | null>(null);
  const sessionToken = useRef(newSessionToken());
  const { language, isRTL } = useLocalization();

  useEffect(() => {
    let active = true;
    Promise.all([
      providerClients.locationCapability(),
      providerClients.mapRenderDescriptor(),
    ]).then(([capability, descriptor]) => {
      if (!active) return;
      setAvailability(resolveLocationExperienceAvailability({
        dataMode: environment.dataMode,
        capability,
        descriptor,
      }));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!searchOpen || !availability?.addressSearchAvailable || query.trim().length < 3) {
      setSuggestions([]);
      setBusy(current => current === 'search' ? null : current);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setBusy('search');
      providerClients.searchAddresses(query, sessionToken.current, language)
        .then(result => {
          if (active) {
            setSuggestions(result.suggestions);
            setMessage(result.outcome === 'succeeded'
              ? result.suggestions.length === 0 ? copy.noSearchResults : ''
              : result.outcome === 'unavailable' ? copy.providerUnavailable : copy.locationFailed);
          }
        })
        .finally(() => { if (active) setBusy(null); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [availability?.addressSearchAvailable, copy.locationFailed, copy.noSearchResults,
    copy.providerUnavailable, language, query, searchOpen]);

  const choosePosition = async (position: PinPosition, source: PinSource) => {
    setBusy(source === 'manual_pin' ? 'pin' : 'device');
    setMessage(copy.resolvingAddress);
    const place = availability?.addressSearchAvailable
      ? await providerClients.describePin(position.latitude, position.longitude, language)
      : null;
    const nextResolution = addressResolutionState(place, resolutionRequirement);
    onChange(position, source, place);
    setResolution(nextResolution);
    setMessage(nextResolution === 'partial'
      ? copy.locationPartial
      : nextResolution === 'lookup_failed' ? copy.addressLookupFailed : '');
    setBusy(null);
  };

  const chooseDeviceLocation = async () => {
    setBusy('device');
    setResolution(null);
    setMessage(copy.locating);
    const result = await requestDeviceFix();
    if (result.outcome !== 'succeeded') {
      setBusy(null);
      if (__DEV__) console.warn('Warsha device location unavailable', result);
      setMessage(result.outcome === 'permission_denied'
        ? copy.locationPermissionDenied
        : result.outcome === 'services_disabled'
          ? copy.locationServicesDisabled
          : result.outcome === 'provider_unavailable' || result.outcome === 'timed_out'
            ? copy.locationDeviceUnavailable
            : copy.locationFailed);
      return;
    }
    await choosePosition(result.position, 'device_location');
  };

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    setBusy('search');
    setMessage('');
    const place = await providerClients.resolvePlace(suggestion.placeId, sessionToken.current, language);
    if (!place) {
      setBusy(null);
      setMessage(copy.locationFailed);
      return;
    }
    const nextResolution = addressResolutionState(place, resolutionRequirement);
    onChange(
      { latitude: place.latitude, longitude: place.longitude },
      'address_search',
      place,
    );
    setResolution(nextResolution);
    setMessage(nextResolution === 'partial' ? copy.locationPartial : '');
    setQuery(place.formattedAddress);
    setSuggestions([]);
    setSearchOpen(false);
    sessionToken.current = newSessionToken();
    setBusy(null);
  };

  const mockPin = () => {
    const place: ResolvedPlace = {
      placeId: 'mock-cairo',
      formattedAddress: 'Cairo',
      governorate: 'Cairo',
      district: 'Downtown Cairo',
      latitude: 30.0444,
      longitude: 31.2357,
    };
    onChange({ latitude: place.latitude, longitude: place.longitude }, 'manual_pin', place);
    setResolution('resolved');
    setMessage('');
  };

  const controlsReady = availability !== null;
  const mapAvailable = availability?.interactiveMapAvailable ?? false;
  const searchAvailable = availability?.addressSearchAvailable ?? false;
  const deviceAvailable = availability?.deviceLocationAvailable ?? false;
  const loadingLabel = busy === 'device' ? copy.locating
    : busy === 'pin' ? copy.resolvingAddress : copy.loading;

  return (
    <View style={styles.group}>
      {!controlsReady ? <BrandLoadingState label={copy.loading} /> : null}
      {controlsReady ? (
        <>
          <BrandButton
            label={copy.useCurrentLocation}
            icon="my-location"
            loading={busy === 'device'}
            disabled={!deviceAvailable || busy !== null}
            onPress={() => void chooseDeviceLocation()}
          />
          {mapAvailable || environment.dataMode === 'mock' ? (
            <BrandButton
              label={copy.chooseOnMap}
              icon="map"
              variant="secondary"
              disabled={busy !== null}
              onPress={() => environment.dataMode === 'mock' ? mockPin() : setMapOpen(current => !current)}
            />
          ) : null}
          {searchAvailable ? (
            <BrandButton
              label={copy.searchAddress}
              icon="search"
              variant="secondary"
              disabled={busy !== null}
              onPress={() => setSearchOpen(current => !current)}
            />
          ) : null}
        </>
      ) : null}

      {availability?.providerUnavailable ? (
        <BrandCard style={[styles.notice, isRTL && styles.noticeRTL]}>
          <MaterialIcons name="map" size={22} />
          <AppText style={styles.noticeText}>{copy.providerUnavailable}</AppText>
        </BrandCard>
      ) : null}
      <AppText style={styles.note}>{copy.permissionOptional}</AppText>

      {searchOpen && searchAvailable ? (
        <View style={styles.searchGroup}>
          <BrandTextField
            accessibilityLabel={copy.searchAddress}
            value={query}
            onChangeText={value => { setQuery(value); setMessage(''); }}
            placeholder={copy.searchPlaceholder}
          />
          {suggestions.map(suggestion => (
            <Pressable
              key={suggestion.placeId}
              accessibilityRole="button"
              disabled={busy !== null}
              onPress={() => void selectSuggestion(suggestion)}
              style={styles.suggestion}>
              <AppText style={styles.suggestionTitle}>{suggestion.primary}</AppText>
              {suggestion.secondary ? <AppText style={styles.note}>{suggestion.secondary}</AppText> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {mapOpen && mapAvailable && availability ? (
        <AddressMap
          value={value}
          onChange={position => void choosePosition(position, 'manual_pin')}
          mapsAvailable
          rendererKey={availability.rendererKey}
          copy={{ unavailable: copy.mapUnavailable, dragHint: copy.mapDragHint }}
        />
      ) : null}

      {busy === 'pin' ? <BrandLoadingState label={loadingLabel} /> : null}
      {value && resolution === 'resolved'
        ? <StateBadge label={copy.locationSaved} icon="check-circle" tone="success" />
        : null}
      {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  group: { gap: spacing.md },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noticeRTL: { flexDirection: 'row-reverse' },
  noticeText: { flex: 1, color: colors.textSecondary, lineHeight: 21 },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  searchGroup: { gap: spacing.sm },
  suggestion: {
    minHeight: 52,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  suggestionTitle: { color: colors.textPrimary },
  error: { color: colors.errorText },
});
