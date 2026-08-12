'use client';

import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { appCopy } from '@/lib/app-copy';
import { parseAddresses, type Address } from '@/lib/customer';
import {
  currentBrowserLocation,
  describeCoordinates,
  getLocationCapability,
  newPlaceSessionToken,
  resolvePlace,
  searchAddresses,
  type PlaceSuggestion,
} from '@/lib/location';
import { customerNav } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/product-surface.module.css';

type Draft = {
  label: string;
  addressLine: string;
  governorate: string;
  district: string;
  building: string;
  floor: string;
  apartment: string;
  landmark: string;
  serviceNotes: string;
};

const EMPTY: Draft = {
  label: '', addressLine: '', governorate: '', district: '', building: '',
  floor: '', apartment: '', landmark: '', serviceNotes: '',
};

type Coordinate = {
  latitude: number;
  longitude: number;
  source: 'device_location' | 'address_search';
};

/** Customer service addresses, through the same RLS and pin-confirmation RPC as mobile. */
export default function AddressesPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;

  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editorId, setEditorId] = useState<'new' | string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [coordinateChanged, setCoordinateChanged] = useState(false);
  const [searchAvailable, setSearchAvailable] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [sessionToken, setSessionToken] = useState(newPlaceSessionToken);
  const [editorFailure, setEditorFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase()
      .from('addresses')
      .select('id,label,address_line,governorate,district,building,floor,apartment,landmark,'
        + 'service_notes,instructions,is_default,latitude,longitude')
      .is('deleted_at', null)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) { setFailed(true); return; }
    setAddresses(parseAddresses(data));
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void getLocationCapability().then((capability) => {
      setSearchAvailable(capability.searchAvailable);
    });
  }, []);

  const makeDefault = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    const { error } = await supabase().rpc('set_default_address', { address_id: id });
    if (error) setFailed(true);
    else await load();
    setBusyId(null);
  };

  const openNew = () => {
    setEditorId('new');
    setDraft(EMPTY);
    setCoordinate(null);
    setCoordinateChanged(false);
    setSearchText('');
    setSuggestions([]);
    setSessionToken(newPlaceSessionToken());
    setEditorFailure(null);
  };

  const openEdit = (address: Address) => {
    setEditorId(address.id);
    setDraft({
      label: address.label,
      addressLine: address.addressLine,
      governorate: address.governorate,
      district: address.district ?? '',
      building: address.building,
      floor: address.floor,
      apartment: address.apartment,
      landmark: address.landmark,
      serviceNotes: address.serviceNotes,
    });
    setCoordinate(address.latitude !== null && address.longitude !== null
      ? { latitude: address.latitude, longitude: address.longitude, source: 'device_location' }
      : null);
    setCoordinateChanged(false);
    setSearchText('');
    setSuggestions([]);
    setSessionToken(newPlaceSessionToken());
    setEditorFailure(null);
  };

  const useCurrent = async () => {
    if (busyId) return;
    setBusyId('location');
    setEditorFailure(null);
    try {
      const position = await currentBrowserLocation();
      setCoordinate({ ...position, source: 'device_location' });
      setCoordinateChanged(true);
      const place = await describeCoordinates(position.latitude, position.longitude);
      if (place) setDraft((current) => ({ ...current, addressLine: place.formattedAddress }));
    } catch (reason) {
      const code = typeof reason === 'object' && reason && 'code' in reason
        ? Number((reason as { code: unknown }).code) : 0;
      setEditorFailure(code === 1 ? words.addressLocationPermission : words.addressLocationFailed);
    }
    setBusyId(null);
  };

  const runSearch = async () => {
    if (!searchAvailable || searchText.trim().length < 3 || searching) return;
    setSearching(true);
    setEditorFailure(null);
    const result = await searchAddresses(searchText, sessionToken);
    setSuggestions(result);
    if (result.length === 0) setEditorFailure(words.addressSearchNone);
    setSearching(false);
  };

  const chooseSuggestion = async (suggestion: PlaceSuggestion) => {
    if (searching) return;
    setSearching(true);
    setEditorFailure(null);
    const place = await resolvePlace(suggestion.placeId, sessionToken);
    if (!place) {
      setEditorFailure(words.addressLocationFailed);
    } else {
      setDraft((current) => ({ ...current, addressLine: place.formattedAddress }));
      setCoordinate({
        latitude: place.latitude,
        longitude: place.longitude,
        source: 'address_search',
      });
      setCoordinateChanged(true);
      setSuggestions([]);
      setSearchText(place.formattedAddress);
    }
    setSearching(false);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editorId || busyId || !draft.label.trim() || !draft.addressLine.trim()
        || !draft.governorate.trim() || !coordinate) return;
    setBusyId('save');
    setEditorFailure(null);
    const client = supabase();
    let addressId = editorId === 'new' ? null : editorId;

    if (editorId === 'new') {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData.user) {
        setEditorFailure(words.addressSaveFailed);
        setBusyId(null);
        return;
      }
      const { data, error } = await client.from('addresses').insert({
        customer_id: userData.user.id,
        label: draft.label.trim(),
        address_line: draft.addressLine.trim(),
        street: draft.addressLine.trim(),
        governorate: draft.governorate.trim(),
        district: draft.district.trim() || null,
        building: draft.building.trim() || null,
        floor: draft.floor.trim() || null,
        apartment: draft.apartment.trim() || null,
        landmark: draft.landmark.trim() || null,
        service_notes: draft.serviceNotes.trim() || null,
        instructions: draft.serviceNotes.trim() || null,
        is_default: (addresses?.length ?? 0) === 0,
      }).select('id').single();
      if (error || !data?.id) {
        setEditorFailure(words.addressSaveFailed);
        setBusyId(null);
        return;
      }
      addressId = String(data.id);
    } else {
      const { error } = await client.from('addresses').update({
        label: draft.label.trim(),
        address_line: draft.addressLine.trim(),
        street: draft.addressLine.trim(),
        governorate: draft.governorate.trim(),
        district: draft.district.trim() || null,
        building: draft.building.trim() || null,
        floor: draft.floor.trim() || null,
        apartment: draft.apartment.trim() || null,
        landmark: draft.landmark.trim() || null,
        service_notes: draft.serviceNotes.trim() || null,
        instructions: draft.serviceNotes.trim() || null,
      }).eq('id', editorId);
      if (error) {
        setEditorFailure(words.addressSaveFailed);
        setBusyId(null);
        return;
      }
    }

    if (addressId && (editorId === 'new' || coordinateChanged)) {
      const { error } = await client.rpc('confirm_my_service_address', {
        p_address_id: addressId,
        p_latitude: coordinate.latitude,
        p_longitude: coordinate.longitude,
        p_pin_source: coordinate.source,
        p_building: draft.building.trim() || null,
        p_floor: draft.floor.trim() || null,
        p_apartment: draft.apartment.trim() || null,
        p_landmark: draft.landmark.trim() || null,
        p_service_notes: draft.serviceNotes.trim() || null,
      });
      if (error) {
        if (editorId === 'new') {
          await client.from('addresses').update({
            deleted_at: new Date().toISOString(), is_default: false,
          }).eq('id', addressId);
        }
        setEditorFailure(words.addressSaveFailed);
        setBusyId(null);
        return;
      }
    }

    await load();
    setEditorId(null);
    setBusyId(null);
  };

  const remove = async (address: Address) => {
    if (busyId || !globalThis.confirm(words.addressDeleteConfirm)) return;
    setBusyId(address.id);
    const { error } = await supabase().from('addresses').update({
      deleted_at: new Date().toISOString(), is_default: false,
    }).eq('id', address.id);
    if (error) setFailed(true);
    else await load();
    setBusyId(null);
  };

  return (
    <AppShell nav={customerNav(words)} mode={words.modeCustomer}>
      <div className={styles.head}>
        <h1 className={styles.title}>{words.addressesTitle}</h1>
        <button type="button" className={styles.action} onClick={openNew}>{words.addressAdd}</button>
      </div>
      <p className={styles.lead}>{words.addressesLead}</p>

      {editorId ? (
        <form className={styles.panel} onSubmit={save}>
          <h2 className={styles.sectionTitle}>
            {editorId === 'new' ? words.addressAdd : words.addressEdit}
          </h2>

          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={() => void useCurrent()} disabled={busyId !== null}>
              {busyId === 'location' ? words.loading : words.addressUseCurrent}
            </button>
          </div>

          {searchAvailable ? (
            <div className={styles.searchRow}>
              <label className={styles.field}>
                <span className={styles.label}>{words.addressSearch}</span>
                <input className={styles.input} value={searchText}
                  onChange={(event) => setSearchText(event.target.value)} />
              </label>
              <button type="button" className={styles.secondary}
                onClick={() => void runSearch()}
                disabled={searchText.trim().length < 3 || searching}>
                {searching ? words.loading : words.discoverSearchAction}
              </button>
            </div>
          ) : (
            <p className={styles.note}>{words.addressSearchUnavailable}</p>
          )}

          {suggestions.length > 0 ? (
            <ul className={styles.list}>
              {suggestions.map((suggestion) => (
                <li key={suggestion.placeId} className={styles.row}>
                  <button type="button" className={styles.rowTitle}
                    onClick={() => void chooseSuggestion(suggestion)}>
                    {suggestion.primary}
                  </button>
                  <span className={styles.cardMeta}>{suggestion.secondary}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {coordinate ? <p className={styles.ok} role="status">{words.addressLocationSaved}</p> : null}

          <AddressFields draft={draft} setDraft={setDraft} words={words} disabled={busyId !== null} />

          {editorFailure ? <p className={styles.error} role="alert">{editorFailure}</p> : null}
          <div className={styles.actions}>
            <button type="submit" className={styles.action}
              disabled={busyId !== null || !coordinate || !draft.label.trim()
                || !draft.addressLine.trim() || !draft.governorate.trim()}>
              {busyId === 'save' ? words.loading : words.saveChanges}
            </button>
            <button type="button" className={styles.secondary} onClick={() => setEditorId(null)}>
              {words.cancel}
            </button>
          </div>
        </form>
      ) : null}

      <section className={styles.panel}>
        {failed ? (
          <>
            <p className={styles.error} role="alert">{words.loadFailed}</p>
            <button type="button" className={styles.secondary} onClick={() => void load()}>{words.retry}</button>
          </>
        ) : addresses === null ? (
          <p className={styles.muted}>{words.loading}</p>
        ) : addresses.length === 0 ? (
          <p className={styles.muted}>{words.addressesNone}</p>
        ) : (
          <ul className={styles.list}>
            {addresses.map((address) => (
              <li key={address.id} className={styles.row}>
                <span className={styles.cardName}>{address.label}</span>
                <span className={styles.cardMeta}>{address.addressLine}</span>
                <div className={styles.rowMeta}>
                  <span className={styles.badge}>{address.governorate}</span>
                  {address.district ? <span className={styles.badge}>{address.district}</span> : null}
                  {address.isDefault ? (
                    <span className={`${styles.badge} ${styles.badgeStrong}`}>{words.addressDefault}</span>
                  ) : (
                    <button type="button" className={styles.secondary}
                      onClick={() => void makeDefault(address.id)} disabled={busyId !== null}>
                      {busyId === address.id ? words.loading : words.addressMakeDefault}
                    </button>
                  )}
                  <button type="button" className={styles.secondary}
                    onClick={() => openEdit(address)} disabled={busyId !== null}>{words.editAction}</button>
                  <button type="button" className={styles.danger}
                    onClick={() => void remove(address)} disabled={busyId !== null}>{words.deleteAction}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function AddressFields({
  draft,
  setDraft,
  words,
  disabled,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  words: Record<string, string>;
  disabled: boolean;
}) {
  const field = (key: keyof Draft, label: string, required = false) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input className={styles.input} value={draft[key]} required={required} disabled={disabled}
        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
    </label>
  );
  return (
    <div className={styles.formGrid}>
      {field('label', words.addressLabel, true)}
      {field('addressLine', words.addressLine, true)}
      {field('governorate', words.addressGovernorate, true)}
      {field('district', words.addressDistrict)}
      {field('building', words.addressBuilding)}
      {field('floor', words.addressFloor)}
      {field('apartment', words.addressApartment)}
      {field('landmark', words.addressLandmark)}
      {field('serviceNotes', words.addressServiceNotes)}
    </div>
  );
}
