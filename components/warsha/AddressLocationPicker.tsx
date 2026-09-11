import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AddressMap, type PinPosition } from '@/components/warsha/AddressMap';
import { BrandButton, BrandCard, BrandLoadingState, BrandTextField } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
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
  /* The resolved-location card reuses `locationSaved` for its heading —
     "Address found" already says the right thing — and needs one new word
     for the way back. */
  changeAddress: string;
  mapLoading: string;
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
  const colors = useThemeColors();
  const [availability, setAvailability] = useState<LocationExperienceAvailability | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState<'device' | 'search' | 'pin' | null>(null);
  /*
   * The renderer said it could not draw a map.
   *
   * Separate from `interactiveMapAvailable`, which is the server's answer
   * about this deployment and is known before anything mounts. This is the
   * map that was supposed to work and did not, and the difference matters:
   * the route has to stop being offered either way, but only this case can
   * happen after somebody has already pressed it.
   */
  const [mapFailed, setMapFailed] = useState(false);
  const [message, setMessage] = useState('');
  /*
   * What KIND of thing the message is.
   *
   * One state used to carry both "Locating…" and "We could not get that
   * location", and it was rendered in the error colour with
   * `accessibilityRole="alert"`. So progress appeared in red and interrupted a
   * screen reader as an alert — and for a reader who takes the colour before
   * the words, which is the low-literacy case this product is built around, a
   * working location lookup looked like a failed one.
   */
  const [tone, setTone] = useState<'progress' | 'notice' | 'error'>('progress');
  const say = (text: string, kind: 'progress' | 'notice' | 'error' = 'error') => {
    setMessage(text);
    setTone(kind);
  };
  const [resolution, setResolution] = useState<AddressResolutionState | null>(null);
  /* The human-readable address the geocoder returned, kept so the card can
     say it. `query` used to hold it, which meant the only record of where
     somebody was lived in a text box they could type over. */
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
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
            if (result.outcome === 'succeeded') {
              say(result.suggestions.length === 0 ? copy.noSearchResults : '', 'notice');
            } else {
              say(result.outcome === 'unavailable'
                ? copy.providerUnavailable : copy.locationFailed, 'error');
            }
          }
        })
        .finally(() => { if (active) setBusy(null); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [availability?.addressSearchAvailable, copy.locationFailed, copy.noSearchResults,
    copy.providerUnavailable, language, query, searchOpen]);

  const choosePosition = async (position: PinPosition, source: PinSource) => {
    setBusy(source === 'manual_pin' ? 'pin' : 'device');
    say(copy.resolvingAddress, 'progress');
    const place = availability?.addressSearchAvailable
      ? await providerClients.describePin(position.latitude, position.longitude, language)
      : null;
    const nextResolution = addressResolutionState(place, resolutionRequirement);
    onChange(position, source, place);
    setResolution(nextResolution);
    /* A pin dropped on the map and a fix from the device both get described by
       the same reverse-geocode, so both can name themselves too. */
    setResolvedAddress(place?.formattedAddress ?? null);
    // Both of these tell the reader what to do next rather than reporting a
    // failure of theirs, so neither is an alert.
    say(nextResolution === 'partial'
      ? copy.locationPartial
      : nextResolution === 'lookup_failed' ? copy.addressLookupFailed : '', 'notice');
    setBusy(null);
  };

  const chooseDeviceLocation = async () => {
    setBusy('device');
    setResolution(null);
    say(copy.locating, 'progress');
    const result = await requestDeviceFix();
    if (result.outcome !== 'succeeded') {
      setBusy(null);
      if (__DEV__) console.warn('Warsha device location unavailable', result);
      say(result.outcome === 'permission_denied'
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
    say('', 'progress');
    const place = await providerClients.resolvePlace(suggestion.placeId, sessionToken.current, language);
    if (!place) {
      setBusy(null);
      say(copy.locationFailed, 'error');
      return;
    }
    const nextResolution = addressResolutionState(place, resolutionRequirement);
    onChange(
      { latitude: place.latitude, longitude: place.longitude },
      'address_search',
      place,
    );
    setResolution(nextResolution);
    say(nextResolution === 'partial' ? copy.locationPartial : '', 'notice');
    setResolvedAddress(place.formattedAddress);
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
    setResolvedAddress(place.formattedAddress);
    say('', 'progress');
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
          {(mapAvailable && !mapFailed) || environment.dataMode === 'mock' ? (
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
            onChangeText={value => { setQuery(value); say('', 'progress'); }}
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
          copy={{ unavailable: copy.mapUnavailable, dragHint: copy.mapDragHint,
            loading: copy.mapLoading }}
          onUnavailable={() => { setMapFailed(true); setMapOpen(false); }}
        />
      ) : null}

      {busy === 'pin' ? <BrandLoadingState label={loadingLabel} /> : null}

      {/*
        * What a resolved location looks like when there is no map to look at.
        *
        * A map is how somebody CHECKS a location; it is not how Warsha knows
        * one. The coordinates come from the geocoder — `selectSuggestion`
        * resolves the place and records it as `address_search`, which is a
        * first-class pin source the server validates like any other — so a map
        * that cannot paint is a missing picture, not a missing answer.
        *
        * Before this, that distinction was invisible. The place was resolved,
        * the screen's Continue had quietly enabled, and the largest thing on
        * screen was a grey rectangle saying the map was unavailable. It read as
        * a failure, and somebody who believed it would go back and try again.
        *
        * So the resolved place says itself, in words: the address the geocoder
        * returned, named, with the way back to change it. Shown whether or not
        * the map drew — a confirmation is worth having either way, and a state
        * that only appears when something is broken is a state nobody has seen
        * before the day it matters.
        */}
      {/* `resolved` or `partial` only. `lookup_failed` means Warsha has a
          coordinate but could not put a name to it — a card headed "Address
          found" with nothing under it would be a worse answer than the
          message that path already shows. Map failure and geocoding failure
          are different failures and get different screens. */}
      {value && (resolution === 'resolved' || resolution === 'partial') ? (
        <BrandCard style={styles.resolved}>
          <View style={[styles.resolvedHead, isRTL && styles.noticeRTL]}>
            <View style={styles.resolvedMark}>
              <MaterialIcons name="place" size={24} color={colors.textPrimary} />
            </View>
            <View style={styles.resolvedCopy}>
              <AppText style={styles.resolvedTitle}>{copy.locationSaved}</AppText>
              {resolvedAddress ? (
                <AppText style={styles.resolvedAddress}>{resolvedAddress}</AppText>
              ) : null}
              {resolution === 'partial' ? (
                <AppText style={styles.note}>{copy.locationPartial}</AppText>
              ) : null}
            </View>
          </View>
          {searchAvailable ? (
            <BrandButton
              label={copy.changeAddress}
              variant="secondary"
              size="compact"
              disabled={busy !== null}
              onPress={() => { setSearchOpen(true); setQuery(''); setSuggestions([]); }}
            />
          ) : null}
        </BrandCard>
      ) : null}
      {message ? (
        /* Only a failure is an alert. Progress and advice are announced
           politely, so a screen reader is not interrupted to be told that
           something is still happening. */
        <AppText
          accessibilityRole={tone === 'error' ? 'alert' : undefined}
          accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
          style={tone === 'error' ? styles.error : styles.status}>
          {message}
        </AppText>
      ) : null}
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
  /* Progress and advice: the ordinary secondary voice, not the red one. */
  status: { color: colors.textSecondary },
  /* The resolved-location card. Same well and same rhythm as `ChoiceCard`, so
     the two read as one family rather than two people's idea of a card. */
  resolved: { gap: spacing.md },
  resolvedHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  resolvedMark: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.canvas,
  },
  resolvedCopy: { flex: 1, gap: spacing.xs },
  resolvedTitle: { ...typography.h3, fontWeight: typography.semibold, color: colors.textPrimary },
  resolvedAddress: { ...typography.body, color: colors.textPrimary },
});
