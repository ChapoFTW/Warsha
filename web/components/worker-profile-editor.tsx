'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSession } from '@/components/session-provider';
import { parseServices, type Service } from '@/lib/customer';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import {
  MARKETPLACE_MANAGED_RADIUS_KM,
  parseWorkerProfile,
  type WorkerProfile,
} from '@/lib/worker';
import { workerCopy } from '@/lib/worker-copy';
import {
  describeProviderSaveFailure,
  logProviderSaveFailure,
  type ProviderSaveProblem,
} from '@/src/providers/provider-save-errors.ts';
import {
  listProfessions,
  professionLabel,
  selectedProfessionKeys,
  withdrawnProfessionSelections,
  type ProfessionKey,
} from '@/src/providers/profession-taxonomy.ts';
import {
  historicalOfferedServices,
  tradeSections,
  tradeSelectionProblem,
  withOfferedService,
  withProfessionServices,
  withTradeSelection,
} from '@/src/providers/worker-trade-selection.ts';
import { catalogueServiceLabel } from '@/src/services/specific-services.ts';
import {
  egyptGovernorateForStoredValue,
  listEgyptAreas,
  listEgyptGovernorates,
} from '@/src/locations/egypt-locations.ts';

import styles from './product-surface.module.css';

type Section = 'basic' | 'trade' | 'area' | 'all';

export function WorkerProfileEditor({
  section = 'all',
  onSaved,
}: {
  section?: Section;
  onSaved?: (profile: WorkerProfile) => Promise<void> | void;
}) {
  const locale = useAppLocale();
  const words = workerCopy[locale];
  const { session } = useSession();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [draft, setDraft] = useState<WorkerProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [failed, setFailed] = useState(false);
  const [problem, setProblem] = useState<ProviderSaveProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const client = supabase();
    const [{ data: profileData, error: profileError }, { data: catalogData, error: catalogError }] = await Promise.all([
      client.rpc('get_my_worker_profile'),
      client.rpc('get_marketplace_catalog_v2'),
    ]);
    const next = parseWorkerProfile(profileData);
    if (profileError || catalogError || !next) {
      setFailed(true);
      return;
    }
    setProfile(next);
    setDraft(next);
    setServices(parseServices(catalogData));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => draft ? selectedProfessionKeys(draft) : [], [draft]);
  const professionOptions = listProfessions(locale);
  const governorates = listEgyptGovernorates(locale);
  const governorate = draft?.areas[0]?.governorate ?? '';
  const governorateOption = egyptGovernorateForStoredValue(governorate);
  const areas = governorateOption ? listEgyptAreas(governorateOption.id, locale) : [];

  const toggleProfession = (key: ProfessionKey) => {
    if (!draft) return;
    const keys = selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
    // Removing a trade takes its jobs out of the payload with it. Web had no
    // rule for that at all, so a worker who changed their mind was saved as
    // offering work they had just stopped claiming.
    setDraft(withTradeSelection(draft, keys, services));
  };

  const toggleService = (service: Service, offered: boolean) => {
    if (!draft) return;
    setDraft(withOfferedService(draft, service, offered, services));
  };

  const toggleProfessionServices = (professionKey: string, offered: boolean) => {
    if (!draft) return;
    setDraft(withProfessionServices(draft, professionKey, offered, services));
  };

  /** The sentence a worker can act on, or `null` for a genuine server fault. */
  const problemMessage = (value: ProviderSaveProblem): string | null => {
    switch (value) {
      case 'profession_required': return words.workerProfessionRequired;
      case 'service_required': return words.workerServiceRequired;
      case 'profession_withdrawn': return words.workerProfessionWithdrawn;
      case 'service_outside_profession': return words.workerServiceOutsideProfession;
      case 'profile_incomplete': return words.workerProfileIncomplete;
      case 'area_invalid': return words.workerAreaInvalid;
      default: return null;
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || busy) return;
    const years = Number(draft.experienceYears);
    const basicValid = draft.displayName.trim().length >= 2 && years >= 0 && years <= 80;
    const tradeProblem = tradeSelectionProblem(draft);
    const area = draft.areas[0];
    const areaValid = Boolean(area?.governorate.trim() && area?.district.trim());
    if ((section === 'trade' || section === 'all') && tradeProblem) {
      // Saying which half is missing, rather than refusing in silence as this
      // form used to: an unexplained disabled save is the same defect as an
      // unexplained generic error.
      setProblem(tradeProblem);
      setFailed(false);
      setSaved(false);
      return;
    }
    if ((section === 'basic' && !basicValid)
        || (section === 'area' && !areaValid)
        || (section === 'all' && (!basicValid || !areaValid))) {
      setProblem(section === 'area' ? 'area_invalid' : 'profile_incomplete');
      setFailed(false);
      setSaved(false);
      return;
    }

    setBusy(true);
    setFailed(false);
    setProblem(null);
    setSaved(false);
    const normalized = {
      ...draft,
      displayName: draft.displayName.trim(),
      about: draft.about.trim(),
      experienceSummary: draft.experienceSummary.trim(),
      experienceYears: years,
      serviceRadiusKm: MARKETPLACE_MANAGED_RADIUS_KM,
      areas: draft.areas.map((item) => ({ ...item, radiusKm: MARKETPLACE_MANAGED_RADIUS_KM })),
    };
    const { error } = await supabase().rpc('save_provider_foundation', {
      p_profile: normalized,
      p_submit: false,
    });
    if (error) {
      const failure = describeProviderSaveFailure(error);
      logProviderSaveFailure('worker profile save', failure);
      if (problemMessage(failure.problem)) setProblem(failure.problem);
      else setFailed(true);
    } else {
      const { data } = await supabase().rpc('get_my_worker_profile');
      const next = parseWorkerProfile(data) ?? normalized;
      setProfile(next);
      setDraft(next);
      setSaved(true);
      await onSaved?.(next);
    }
    setBusy(false);
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file || !draft || !session?.user.id || photoBusy) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type)
        || file.size < 1 || file.size > 5 * 1024 * 1024) {
      setFailed(true);
      return;
    }
    setPhotoBusy(true);
    setFailed(false);
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${session.user.id}/avatar/web-${globalThis.crypto.randomUUID()}.${extension}`;
    const client = supabase();
    const { error: uploadError } = await client.storage.from('profile-images').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      setFailed(true);
      setPhotoBusy(false);
      return;
    }
    const oldPath = draft.avatarPath || null;
    const { error: setError } = await client.rpc('set_my_provider_profile_photo', {
      p_storage_path: path,
      p_expected_current: oldPath,
    });
    if (setError) {
      await client.storage.from('profile-images').remove([path]);
      setFailed(true);
    } else {
      if (oldPath) await client.storage.from('profile-images').remove([oldPath]);
      const next = { ...draft, avatarPath: path };
      setDraft(next);
      setProfile(next);
      setSaved(true);
      await onSaved?.(next);
    }
    setPhotoBusy(false);
  };

  if (!draft) {
    return (
      <section className={styles.panel}>
        {failed ? (
          <><p className={styles.error} role="alert">{words.workerProfileFailed}</p>
            <button type="button" className={styles.secondary} onClick={() => void load()}>{words.retry}</button></>
        ) : <p className={styles.muted}>{words.loading}</p>}
      </section>
    );
  }

  const showBasic = section === 'basic' || section === 'all';
  const showTrade = section === 'trade' || section === 'all';
  const showArea = section === 'area' || section === 'all';

  return (
    <form className={styles.panel} onSubmit={save}>
      {showBasic ? (
        <>
          <label className={styles.field}>
            <span className={styles.label}>{words.workerName}</span>
            <input className={styles.input} value={draft.displayName} minLength={2} maxLength={100}
              onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} disabled={busy} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{words.workerAbout}</span>
            <textarea className={styles.textarea} value={draft.about} maxLength={500}
              onChange={(event) => setDraft({ ...draft, about: event.target.value })} disabled={busy} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{words.workerExperience}</span>
            <input className={styles.input} type="number" min={0} max={80} value={draft.experienceYears}
              onChange={(event) => setDraft({ ...draft, experienceYears: Number(event.target.value) })} disabled={busy} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{words.onboardingPhotoRequired}</span>
            <input className={styles.input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={(event) => void uploadPhoto(event.target.files?.[0])} disabled={busy || photoBusy} />
            {draft.avatarPath ? <span className={styles.ok}>{words.workerPhotoSaved}</span> : null}
          </label>
        </>
      ) : null}

      {showTrade ? (
        <>
          <fieldset className={styles.field}>
            <legend className={styles.label}>{words.workerProfession}</legend>
            <p className={styles.muted}>{words.workerProfessionBody}</p>
            <div className={styles.grid}>
              {professionOptions.map((item) => (
                <label key={item.key} className={styles.card}>
                  <input type="checkbox" checked={selected.includes(item.key)}
                    onChange={() => toggleProfession(item.key)} disabled={busy} />
                  <span className={styles.cardName}>{item[locale]}</span>
                </label>
              ))}
            </div>
            {withdrawnProfessionSelections(draft).length ? (
              <p className={styles.error} role="alert">{words.workerWithdrawnProfessionNotice}</p>
            ) : null}
          </fieldset>
          {/* The jobs live UNDER the trade that performs them. `<details>` is
              the browser's own disclosure control -- keyboard, screen reader
              and find-in-page all work without a custom widget, which is the
              web counterpart of the native accordion rather than a copy of it. */}
          <fieldset className={styles.field}>
            <legend className={styles.label}>{words.workerServices}</legend>
            <p className={styles.muted}>{words.workerServicesBody}</p>
            {tradeSections(draft, services).length === 0 ? (
              <p className={styles.muted}>{words.workerChooseProfessionFirst}</p>
            ) : null}
            {tradeSections(draft, services).map((tradeSection) => {
              const count = tradeSection.selectedServiceIds.length;
              const all = count > 0 && count === tradeSection.services.length;
              return (
                <details key={tradeSection.professionKey} className={styles.panel} open={selected.length === 1}>
                  <summary className={styles.label}>
                    {professionLabel(tradeSection.professionKey, locale)}
                    {' — '}
                    {count === 0
                      ? words.workerNoServicesChosen
                      : count === 1
                        ? words.workerOneServiceSelected
                        : words.workerServicesSelected.replace('{count}', String(count))}
                  </summary>
                  {tradeSection.services.length === 0 ? (
                    <p className={styles.muted}>{words.workerNoServicesAvailable}</p>
                  ) : (
                    <>
                      <label className={styles.card}>
                        <input type="checkbox" checked={all} disabled={busy}
                          onChange={() => toggleProfessionServices(tradeSection.professionKey, !all)} />
                        <span className={styles.cardName}>{words.workerSelectAllServices}</span>
                      </label>
                      <div className={styles.grid}>
                        {tradeSection.services.map((service) => {
                          const on = tradeSection.selectedServiceIds.includes(service.id);
                          return (
                            <label key={service.id} className={styles.card}>
                              <input type="checkbox" checked={on} disabled={busy}
                                onChange={() => toggleService(service, !on)} />
                              <span className={styles.cardName}>{catalogueServiceLabel(service, locale)}</span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </details>
              );
            })}
            {historicalOfferedServices(draft, services).length ? (
              <div className={styles.panel}>
                <p className={styles.label}>{words.workerHistoricalServicesTitle}</p>
                <p className={styles.muted}>{words.workerHistoricalServicesBody}</p>
                <div className={styles.grid}>
                  {historicalOfferedServices(draft, services).map(service => (
                    <div key={service.serviceId} className={styles.card}>
                      <span className={styles.cardName}>
                        {(service.translationKey
                          ? catalogueServiceLabel(service, locale)
                          : service.name)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </fieldset>
        </>
      ) : null}

      {showArea ? (
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.label}>{words.workerGovernorate}</span>
            <select className={styles.select} value={governorateOption?.id ?? ''} disabled={busy}
              onChange={(event) => {
                const selectedGovernorate = listEgyptGovernorates('en').find((item) => item.id === event.target.value);
                setDraft({ ...draft, areas: selectedGovernorate
                  ? [{ governorate: selectedGovernorate.en, district: '', radiusKm: MARKETPLACE_MANAGED_RADIUS_KM }]
                  : [] });
              }}>
              <option value="">—</option>
              {governorates.map((item) => <option key={item.id} value={item.id}>{item[locale]}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{words.workerArea}</span>
            <select className={styles.select} value={draft.areas[0]?.district ?? ''} disabled={busy || !governorateOption}
              onChange={(event) => setDraft({ ...draft, areas: [{
                governorate,
                district: event.target.value,
                radiusKm: MARKETPLACE_MANAGED_RADIUS_KM,
              }] })}>
              <option value="">—</option>
              {areas.map((item) => <option key={item.id} value={item.en}>{item[locale]}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      {problem ? <p className={styles.error} role="alert">{problemMessage(problem)}</p> : null}
      {failed ? <p className={styles.error} role="alert">{words.workerProfileFailed}</p> : null}
      {saved ? <p className={styles.ok} role="status">{words.workerProfileSaved}</p> : null}
      <button type="submit" className={styles.action} disabled={busy || photoBusy || draft === profile}>
        {busy ? words.loading : words.workerSaveDraft}
      </button>
    </form>
  );
}
