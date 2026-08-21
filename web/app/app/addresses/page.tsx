'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AddressSearch } from '@/components/address-search';
import { AppShell } from '@/components/app-shell';
import { useSession } from '@/components/session-provider';
import { appCopy } from '@/lib/app-copy';
import { parseAddresses, type Address } from '@/lib/customer';
import {
  currentBrowserLocation,
  describeCoordinates,
  getLocationCapability,
} from '@/lib/location';
import { customerNav } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import type { Locale } from '@/lib/preferences';
import { useAppLocale } from '@/lib/use-app-locale';
import {
  egyptAreaForStoredValue, egyptGovernorateForStoredValue,
  listEgyptAreas, listEgyptGovernorates,
} from '@/src/locations/egypt-locations';
import {
  addressResolutionState,
  classifyBrowserLocationError,
  resolvedAddressFields,
  type AddressResolutionState,
} from '@/src/providers/location-address';

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

type LocationStatus = 'idle' | 'locating' | 'resolving' | AddressResolutionState;

/** Customer service addresses, through the same RLS and pin-confirmation RPC as mobile. */
export default function AddressesPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const { refresh: refreshAccount } = useSession();

  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editorId, setEditorId] = useState<'new' | string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [coordinateChanged, setCoordinateChanged] = useState(false);
  const [searchAvailable, setSearchAvailable] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [editorFailure, setEditorFailure] = useState<string | null>(null);
  const saveInFlight = useRef(false);

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
    setLocationStatus('idle');
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
    setLocationStatus(address.latitude !== null && address.longitude !== null ? 'resolved' : 'idle');
    setEditorFailure(null);
  };

  const useCurrent = async () => {
    if (busyId) return;
    setBusyId('location');
    setEditorFailure(null);
    setLocationStatus('locating');
    try {
      const position = await currentBrowserLocation();
      setCoordinate({ ...position, source: 'device_location' });
      setCoordinateChanged(true);
      setLocationStatus('resolving');
      const place = await describeCoordinates(position.latitude, position.longitude, locale);
      if (place) {
        const fields = resolvedAddressFields(place);
        setDraft((current) => ({ ...current, ...fields }));
      }
      setLocationStatus(addressResolutionState(place));
    } catch (reason) {
      setLocationStatus('idle');
      const outcome = classifyBrowserLocationError(reason);
      setEditorFailure(outcome === 'permission_denied' ? words.addressLocationDenied
        : outcome === 'timed_out' ? words.addressLocationTimeout
          : outcome === 'unavailable' || outcome === 'unsupported'
            ? words.addressLocationUnavailable : words.addressLocationFailed);
    }
    setBusyId(null);
  };

  const chooseSearchResult = (place: import('@/src/providers/location-address').ResolvedPlace) => {
    setEditorFailure(null);
    setDraft((current) => ({ ...current, ...resolvedAddressFields(place) }));
    setCoordinate({ latitude: place.latitude, longitude: place.longitude, source: 'address_search' });
    setCoordinateChanged(true);
    setLocationStatus(addressResolutionState(place));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editorId || busyId || saveInFlight.current || !draft.label.trim() || !draft.addressLine.trim()
        || !draft.governorate.trim() || !coordinate) return;
    saveInFlight.current = true;
    setBusyId('save');
    setEditorFailure(null);
    const client = supabase();
    let addressId = editorId === 'new' ? null : editorId;

    if (editorId === 'new') {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData.user) {
        setEditorFailure(words.addressSaveFailed);
        saveInFlight.current = false;
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
        saveInFlight.current = false;
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
        saveInFlight.current = false;
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
        saveInFlight.current = false;
        setBusyId(null);
        return;
      }
    }

    await load();
    await refreshAccount();
    setEditorId(null);
    saveInFlight.current = false;
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

          {/* The confirmed pin is mandatory server-side: `confirm_my_service_address`
              refuses without one. It is therefore stated as required and
              explained here, rather than left to a silently disabled button. */}
          <h3 className={styles.sectionTitle}>
            {words.addressLocationSection}{' '}
            <span className={styles.fieldRequirement}>({words.formRequired})</span>
          </h3>
          <p className={styles.hint}>{words.addressLocationWhy}</p>

          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={() => void useCurrent()} disabled={busyId !== null}>
              {busyId === 'location' ? words.loading : words.addressUseCurrent}
            </button>
          </div>

          <AddressSearch
            available={searchAvailable}
            disabled={busyId !== null}
            language={locale}
            copy={{
              label: words.addressSearch,
              placeholder: words.addressSearchPlaceholder,
              unavailable: words.addressSearchUnavailable,
              noResults: words.addressSearchNone,
              failed: words.addressSearchFailed,
              loading: words.addressSearching,
            }}
            onSelect={chooseSearchResult}
          />

          {locationStatus !== 'idle' ? (
            <p className={locationStatus === 'resolved' ? styles.ok : styles.note} role="status">
              {locationStatus === 'locating' ? words.addressLocating
                : locationStatus === 'resolving' ? words.addressResolving
                  : locationStatus === 'resolved' ? words.addressLocationSaved
                    : locationStatus === 'partial' ? words.addressLocationPartial
                      : words.addressLookupFailed}
            </p>
          ) : null}

          <AddressFields draft={draft} setDraft={setDraft} words={words}
            language={locale} disabled={busyId !== null} />

          {editorFailure ? <p className={styles.error} role="alert">{editorFailure}</p> : null}
          {!coordinate ? (
            <p className={styles.note} role="status">
              {words.addressLocationMissing}
            </p>
          ) : null}

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
  language,
  disabled,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  words: Record<string, string>;
  language: Locale;
  disabled: boolean;
}) {
  const field = (key: keyof Draft, label: string, helper: string, required = false) => (
    <label className={styles.field}>
      <span className={styles.label}>
        {label} <span className={styles.fieldRequirement}>
          ({required ? words.formRequired : words.formOptional})
        </span>
      </span>
      <input className={styles.input} value={draft[key]} required={required} disabled={disabled}
        aria-describedby={`address-${key}-help`}
        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
      <span id={`address-${key}-help`} className={styles.hint}>{helper}</span>
    </label>
  );
  // Governorate and area are a controlled taxonomy, not free text. The list is
  // the same CAPMAS/OCHA dataset mobile uses; nothing is redefined here.
  //
  // What is stored stays the English canonical name rather than the dataset id,
  // because that is what mobile writes and what existing rows already contain,
  // and analytics groups these values by string equality. Switching new writes
  // to `EG02` would split one governorate into two buckets.
  const governorateOption = egyptGovernorateForStoredValue(draft.governorate);
  const governorateId = governorateOption?.id ?? '';
  const governorates = listEgyptGovernorates(language);
  const areas = governorateId ? listEgyptAreas(governorateId, language) : [];
  const areaOption = governorateId
    ? egyptAreaForStoredValue(governorateId, draft.district)
    : null;

  const chooseGovernorate = (id: string) => {
    const next = id ? listEgyptGovernorates(language).find(item => item.id === id) : null;
    setDraft((current) => {
      // An area only means something inside its governorate, so an incompatible
      // one is cleared rather than silently submitted against the wrong parent.
      const keep = next && egyptAreaForStoredValue(next.id, current.district);
      return { ...current, governorate: next ? next.en : '', district: keep ? current.district : '' };
    });
  };

  const selectRow = (
    id: string,
    label: string,
    helper: string,
    value: string,
    options: { id: string; en: string; ar: string; fr: string }[],
    onPick: (id: string) => void,
    required: boolean,
    disabledSelect: boolean,
    placeholder: string,
  ) => (
    <label className={styles.field}>
      <span className={styles.label}>
        {label} <span className={styles.fieldRequirement}>
          ({required ? words.formRequired : words.formOptional})
        </span>
      </span>
      <select
        className={styles.input}
        value={value}
        required={required}
        disabled={disabled || disabledSelect}
        aria-describedby={`address-${id}-help`}
        onChange={(event) => onPick(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option[language]}</option>
        ))}
      </select>
      <span id={`address-${id}-help`} className={styles.hint}>{helper}</span>
    </label>
  );

  const governorateField = selectRow(
    'governorate', words.addressGovernorate, words.addressGovernorateHelp,
    governorateId, governorates, chooseGovernorate, true, false,
    words.addressGovernorateChoose,
  );

  const areaField = selectRow(
    'district', words.addressDistrict,
    governorateId ? words.addressDistrictHelp : words.addressDistrictPickGovernorate,
    areaOption?.id ?? '', areas,
    (id) => {
      const picked = areas.find(item => item.id === id);
      setDraft((current) => ({ ...current, district: picked ? picked.en : '' }));
    },
    false, !governorateId,
    words.addressDistrictChoose,
  );

  return (
    <div className={styles.formGrid}>
      {field('label', words.addressLabel, words.addressLabelHelp, true)}
      {field('addressLine', words.addressLine, words.addressLineHelp, true)}
      {governorateField}
      {areaField}
      {field('building', words.addressBuilding, words.addressBuildingHelp)}
      {field('floor', words.addressFloor, words.addressFloorHelp)}
      {field('apartment', words.addressApartment, words.addressApartmentHelp)}
      {field('landmark', words.addressLandmark, words.addressLandmarkHelp)}
      {field('serviceNotes', words.addressServiceNotes, words.addressServiceNotesHelp)}
    </div>
  );
}
