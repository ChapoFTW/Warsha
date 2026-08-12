'use client';

import { useEffect, useState } from 'react';

import {
  currentBrowserLocation,
  describeCoordinates,
  getLocationCapability,
  newPlaceSessionToken,
  resolvePlace,
  searchAddresses,
  type PlaceSuggestion,
} from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import type { WorkerArea } from '@/lib/worker';
import { workerCopy } from '@/lib/worker-copy';

import styles from './product-surface.module.css';

type Pin = {
  latitude: number;
  longitude: number;
  source: 'device_location' | 'address_search';
  address: string;
};

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
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [token, setToken] = useState(newPlaceSessionToken);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void getLocationCapability().then((capability) => setSearchAvailable(capability.searchAvailable));
  }, []);

  const current = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const position = await currentBrowserLocation();
      const place = await describeCoordinates(position.latitude, position.longitude);
      setPin({
        ...position,
        source: 'device_location',
        address: place?.formattedAddress || [area.district, area.governorate].filter(Boolean).join(', '),
      });
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  const search = async () => {
    if (busy || !searchAvailable || query.trim().length < 3) return;
    setBusy(true);
    setFailed(false);
    const result = await searchAddresses(query, token);
    setSuggestions(result);
    if (result.length === 0) setFailed(true);
    setBusy(false);
  };

  const choose = async (suggestion: PlaceSuggestion) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const place = await resolvePlace(suggestion.placeId, token);
    if (!place) setFailed(true);
    else {
      setPin({
        latitude: place.latitude,
        longitude: place.longitude,
        source: 'address_search',
        address: place.formattedAddress,
      });
      setQuery(place.formattedAddress);
      setSuggestions([]);
    }
    setBusy(false);
  };

  const save = async () => {
    if (!pin || busy) return;
    setBusy(true);
    setFailed(false);
    const client = supabase();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) {
      setFailed(true);
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
      setFailed(true);
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
      setFailed(true);
    } else {
      setToken(newPlaceSessionToken());
      await onSaved();
    }
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
      {searchAvailable ? (
        <div className={styles.searchRow}>
          <label className={styles.field}>
            <span className={styles.label}>{words.workLocationSearch}</span>
            <input className={styles.input} value={query} onChange={(event) => setQuery(event.target.value)} disabled={busy} />
          </label>
          <button type="button" className={styles.secondary} onClick={() => void search()} disabled={busy || query.trim().length < 3}>
            {words.workLocationSearchAction}
          </button>
        </div>
      ) : <p className={styles.note}>{words.workLocationSearchUnavailable}</p>}
      {suggestions.length > 0 ? (
        <ul className={styles.list}>
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId} className={styles.row}>
              <button type="button" className={styles.rowTitle} onClick={() => void choose(suggestion)}>{suggestion.primary}</button>
              <span className={styles.cardMeta}>{suggestion.secondary}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {pin ? <p className={styles.ok} role="status">{words.workLocationSaved}</p> : null}
      {failed ? <p className={styles.error} role="alert">{words.workLocationFailed}</p> : null}
      <button type="button" className={styles.action} onClick={() => void save()} disabled={busy || !pin}>
        {words.workLocationContinue}
      </button>
    </section>
  );
}
