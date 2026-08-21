'use client';

import { useEffect, useRef, useState } from 'react';

import { AddressSearch } from '@/components/address-search';
import {
  currentBrowserLocation,
  describeCoordinates,
  getLocationCapability,
} from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import type { WorkerArea } from '@/lib/worker';
import { workerCopy } from '@/lib/worker-copy';
import {
  addressResolutionState,
  classifyBrowserLocationError,
  type AddressResolutionState,
  type ResolvedPlace,
} from '@/src/providers/location-address';

import styles from './product-surface.module.css';

type Pin = {
  latitude: number;
  longitude: number;
  source: 'device_location' | 'address_search';
  address: string;
};

type LocationStatus = 'idle' | 'locating' | 'resolving' | AddressResolutionState;

/**
 * Worker-only presentation over the shared location infrastructure.
 *
 * It intentionally never asks for floor, apartment, access instructions or
 * raw coordinates. Those describe a customer's destination, not a worker's
 * private matching location. Coordinates are acquired from the browser or a
 * provider result and passed straight to the existing confirmation authority.
 */
export function WorkerLocation({ area, onSaved }: { area: WorkerArea; onSaved: () => Promise<void> }) {
  const locale = useAppLocale();
  const words = workerCopy[locale];
  const [pin, setPin] = useState<Pin | null>(null);
  const [searchAvailable, setSearchAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const saveInFlight = useRef(false);

  useEffect(() => {
    void getLocationCapability().then((capability) => setSearchAvailable(capability.searchAvailable));
  }, []);

  const current = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setLocationStatus('locating');
    try {
      const position = await currentBrowserLocation();
      setLocationStatus('resolving');
      const place = await describeCoordinates(position.latitude, position.longitude, locale);
      setPin({
        ...position,
        source: 'device_location',
        address: place?.formattedAddress || [area.district, area.governorate].filter(Boolean).join(', '),
      });
      setLocationStatus(addressResolutionState(place, 'formatted'));
    } catch (reason) {
      setLocationStatus('idle');
      const outcome = classifyBrowserLocationError(reason);
      setFailure(outcome === 'permission_denied' ? words.workLocationPermissionDenied
        : outcome === 'timed_out' ? words.workLocationTimeout
          : outcome === 'unavailable' || outcome === 'unsupported'
            ? words.workLocationUnavailable : words.workLocationFailed);
    }
    setBusy(false);
  };

  const choose = (place: ResolvedPlace) => {
    setFailure(null);
    setPin({
      latitude: place.latitude,
      longitude: place.longitude,
      source: 'address_search',
      address: place.formattedAddress,
    });
    setLocationStatus(addressResolutionState(place, 'formatted'));
  };

  const save = async () => {
    if (!pin || busy || saveInFlight.current) return;
    saveInFlight.current = true;
    setBusy(true);
    setFailure(null);
    const client = supabase();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) {
      setFailure(words.workLocationFailed);
      saveInFlight.current = false;
      setBusy(false);
      return;
    }
    const { data, error } = await client.from('addresses').insert({
      customer_id: userData.user.id,
      label: 'Work location',
      address_line: pin.address,
      street: pin.address,
      governorate: area.governorate,
      district: area.district || null,
      building: null,
      floor: null,
      apartment: null,
      landmark: null,
      service_notes: null,
      instructions: null,
      is_default: true,
    }).select('id').single();
    if (error || !data?.id) {
      setFailure(words.workLocationFailed);
      saveInFlight.current = false;
      setBusy(false);
      return;
    }
    const addressId = String(data.id);
    const { error: confirmError } = await client.rpc('confirm_my_service_address', {
      p_address_id: addressId,
      p_latitude: pin.latitude,
      p_longitude: pin.longitude,
      p_pin_source: pin.source,
      p_building: null,
      p_floor: null,
      p_apartment: null,
      p_landmark: null,
      p_service_notes: null,
    });
    if (confirmError) {
      await client.from('addresses').update({ deleted_at: new Date().toISOString(), is_default: false }).eq('id', addressId);
      setFailure(words.workLocationFailed);
    } else {
      await onSaved();
    }
    saveInFlight.current = false;
    setBusy(false);
  };

  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>{words.onboardingAreaTitle}</h2>
      <p className={styles.muted}>{words.onboardingLocationRequired}</p>
      <div className={styles.facts}>
        <div className={styles.fact}><span className={styles.factLabel}>{words.workerGovernorate}</span><span className={styles.factValue}>{area.governorate}</span></div>
        <div className={styles.fact}><span className={styles.factLabel}>{words.workerArea}</span><span className={styles.factValue}>{area.district}</span></div>
      </div>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button type="button" className={styles.action} onClick={() => void current()} disabled={busy}>
          {busy ? words.loading : words.workLocationUseCurrent}
        </button>
      </div>
      <AddressSearch
        available={searchAvailable}
        disabled={busy}
        language={locale}
        copy={{
          label: words.workLocationSearch,
          placeholder: words.workLocationSearchPlaceholder,
          unavailable: words.workLocationSearchUnavailable,
          noResults: words.workLocationSearchNone,
          failed: words.workLocationSearchFailed,
          loading: words.workLocationSearching,
        }}
        onSelect={choose}
      />
      {locationStatus !== 'idle' ? (
        <p className={locationStatus === 'resolved' ? styles.ok : styles.note} role="status">
          {locationStatus === 'locating' ? words.workLocationLocating
            : locationStatus === 'resolving' ? words.workLocationResolving
              : locationStatus === 'resolved' ? words.workLocationSaved
                : locationStatus === 'partial' ? words.workLocationPartial
                  : words.workLocationLookupFailed}
        </p>
      ) : null}
      {failure ? <p className={styles.error} role="alert">{failure}</p> : null}
      <button type="button" className={styles.action} onClick={() => void save()} disabled={busy || !pin}>
        {words.workLocationContinue}
      </button>
    </section>
  );
}
