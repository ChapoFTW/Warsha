import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandLoadingState, BrandTextField, StateBadge } from '@/components/warsha/BrandUI';
import { EgyptLocationSelector } from '@/components/warsha/EgyptLocationSelector';
import { OfferedServicesSection } from '@/components/warsha/OfferedServicesSection';
import { OnboardingFieldMeta } from '@/components/warsha/OnboardingFieldMeta';
import { ProfessionSelector } from '@/components/warsha/ProfessionSelector';
import { AppText } from '@/components/warsha/Typography';
import { WorkerPhotoPicker } from '@/components/warsha/WorkerPhotoPicker';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useOnboarding } from '@/src/onboarding/onboarding-context';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';
import { canAppeal, isAwaitingReview } from '@/src/onboarding/onboarding-types';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { listProviderServiceOptions } from '@/src/providers/provider-repository';
import {
  describeProviderSaveFailure,
  logProviderSaveFailure,
  type ProviderSaveProblem,
} from '@/src/providers/provider-save-errors';
import {
  selectedProfessionKeys,
  withdrawnProfessionSelections,
} from '@/src/providers/profession-taxonomy';
import {
  historicalOfferedServices,
  tradeSections,
  tradeSelectionProblem,
  withOfferedService,
  withProfessionServices,
  withTradeSelection,
} from '@/src/providers/worker-trade-selection';
import {
  emptyProviderDraft,
  MARKETPLACE_MANAGED_RADIUS_KM,
  type ProviderDraft,
  type ProviderMediaInput,
} from '@/src/providers/provider-types';
import { useDraftState } from '@/src/drafts/draft-context';
import { useWorkerText } from '@/src/worker/worker-copy';
import { workerJourneyProgress } from '@/src/worker/worker-onboarding-policy';
import type { CatalogueServiceRow } from '@/src/services/specific-services';

const sameTradeSet = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && [...left].sort().join('|') === [...right].sort().join('|');

function tradeSnapshot(profile: ProviderDraft) {
  return {
    professionKeys: selectedProfessionKeys(profile).map(String),
    serviceIds: profile.services.map(item => item.serviceId),
  };
}

/** Re-apply a stored trade delta on top of a freshly loaded profile. */
function applyTradeDelta(
  profile: ProviderDraft,
  professionKeys: readonly string[],
  serviceIds: readonly string[],
  catalogue: readonly CatalogueServiceRow[],
): ProviderDraft {
  let next = withTradeSelection(profile, professionKeys, catalogue);
  for (const row of catalogue) {
    if (serviceIds.includes(row.id)) next = withOfferedService(next, row, true, catalogue);
  }
  return next;
}

export default function WorkerOnboarding() {
  const styles = useThemedStyles(makeStyles);
  const ot = useOnboardingText();
  const wt = useWorkerText();
  const onboarding = useOnboarding();
  const provider = useProviderFoundation();
  const [draft, setDraft] = useState<ProviderDraft>(provider.profile ?? emptyProviderDraft);
  const [experienceInput, setExperienceInput] = useState('');
  const [options, setOptions] = useState<CatalogueServiceRow[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [appeal, setAppeal] = useState('');
  const hydratedProfile = useRef<string | null>(null);

  /*
   * Step 3's unsaved choices, and the server state they were made against.
   *
   * A *delta*, never a copy of the profile. Restoring a whole stored profile
   * later would re-apply values the account may have changed elsewhere; storing
   * only what the worker chose, together with the baseline they chose it
   * against, means it is re-applied to fresh server data and abandoned outright
   * if that data moved on. Web applies the identical rule — see
   * `web/components/worker-profile-editor.tsx`.
   */
  const [tradeDraft, setTradeDraft, resetTradeDraft] = useDraftState<{
    baselineProfessionKeys: string[];
    baselineServiceIds: string[];
    professionKeys: string[];
    serviceIds: string[];
  } | null>('worker_trade', null);
  const tradeDraftRef = useRef(tradeDraft);
  tradeDraftRef.current = tradeDraft;
  const serverTrade = useRef<{ professionKeys: string[]; serviceIds: string[] } | null>(null);

  useEffect(() => {
    const profile = provider.profile;
    if (!profile) return;
    const key = profile.id ?? onboarding.accountKey ?? 'profile';
    if (hydratedProfile.current === key) return;
    hydratedProfile.current = key;
    setExperienceInput(profile.experienceYears > 0 ? String(profile.experienceYears) : '');
    serverTrade.current = tradeSnapshot(profile);
    setDraft(profile);
  }, [onboarding.accountKey, provider.profile]);

  /*
   * Re-apply the unsaved trade delta, once — and only once the catalogue has
   * arrived, because `withTradeSelection` filters a selection against it and
   * would silently drop every offered service if handed an empty list. If the
   * server's trades have moved on since the delta was written, it is abandoned
   * rather than allowed to win.
   */
  const tradeRestored = useRef(false);
  useEffect(() => {
    if (tradeRestored.current) return;
    const profile = provider.profile;
    const server = serverTrade.current;
    if (!profile || !server || options.length === 0) return;
    tradeRestored.current = true;
    const stored = tradeDraftRef.current;
    if (!stored) return;
    if (!sameTradeSet(stored.baselineProfessionKeys, server.professionKeys)
      || !sameTradeSet(stored.baselineServiceIds, server.serviceIds)) {
      resetTradeDraft('discarded');
      return;
    }
    if (sameTradeSet(stored.professionKeys, server.professionKeys)
      && sameTradeSet(stored.serviceIds, server.serviceIds)) return;
    setDraft(applyTradeDelta(profile, stored.professionKeys, stored.serviceIds, options));
  }, [options, provider.profile, resetTradeDraft]);

  /**
   * Record the unsaved trade selection, or drop it once it matches the server
   * again. Every trade control goes through here rather than calling `setDraft`
   * directly, so there is one place that decides what is unsaved.
   */
  const applyTrade = (next: (current: ProviderDraft) => ProviderDraft) => {
    setDraft(current => {
      const updated = next(current);
      const server = serverTrade.current;
      const chosen = tradeSnapshot(updated);
      if (!server) return updated;
      if (sameTradeSet(server.professionKeys, chosen.professionKeys)
        && sameTradeSet(server.serviceIds, chosen.serviceIds)) {
        resetTradeDraft('discarded');
      } else {
        setTradeDraft({
          baselineProfessionKeys: server.professionKeys,
          baselineServiceIds: server.serviceIds,
          professionKeys: chosen.professionKeys,
          serviceIds: chosen.serviceIds,
        });
      }
      return updated;
    });
  };

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      setOptions(await listProviderServiceOptions());
    } catch {
      setOptions([]);
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  useEffect(() => { void loadOptions(); }, [loadOptions]);
  useEffect(() => {
    if (onboarding.state.workerCapabilityActive) router.replace('/worker');
  }, [onboarding.state.workerCapabilityActive]);

  if (!onboarding.ready || provider.loading) {
    return <SafeAreaView style={styles.safe}><BrandLoadingState label={wt.text('journeyTitle')} /></SafeAreaView>;
  }

  const state = onboarding.state;
  const progress = workerJourneyProgress(state);

  const run = async (operation: () => Promise<boolean>) => {
    setBusy(true);
    setMessage('');
    const ok = await operation();
    setBusy(false);
    if (!ok) setMessage(ot.text('genericError'));
  };

  /**
   * What a failed save tells the worker.
   *
   * A backend refusal a worker can act on gets the sentence that says how; only
   * a genuine server fault falls through to the generic apology. The raw
   * PostgREST error is preserved on the way past and logged in development, so
   * the next reproduction of a save failure names its own cause instead of
   * requiring one to be inferred from "Something went wrong."
   */
  const saveProblemMessage = (problem: ProviderSaveProblem): string => {
    switch (problem) {
      case 'profession_required': return wt.text('professionRequired');
      case 'service_required': return wt.text('serviceRequired');
      case 'profession_withdrawn': return wt.text('professionWithdrawn');
      case 'service_outside_profession': return wt.text('serviceOutsideProfession');
      case 'profile_incomplete': return wt.text('profileIncomplete');
      case 'area_invalid': return wt.text('areaInvalid');
      default: return ot.text('genericError');
    }
  };

  const saveDraft = async (next: ProviderDraft): Promise<boolean> => {
    setBusy(true);
    setMessage('');
    try {
      await provider.save(next, false);
      setDraft(next);
      await onboarding.reload();
      return true;
    } catch (reason) {
      const failure = describeProviderSaveFailure(reason);
      logProviderSaveFailure('worker onboarding save', failure);
      setMessage(saveProblemMessage(failure.problem));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const savePhoto = async (input: ProviderMediaInput) => {
    setBusy(true);
    setMessage('');
    try {
      const photo = await provider.replaceAvatar(input);
      setDraft(current => ({ ...current, avatarPath: photo.storagePath, avatarUrl: photo.previewUrl }));
      await onboarding.reload();
    } catch {
      setMessage(ot.text('genericError'));
      throw new Error('Unable to save worker photo');
    } finally {
      setBusy(false);
    }
  };

  const saveBasic = () => {
    const years = experienceInput === '' ? 0 : Number(experienceInput);
    if (!draft.avatarPath || draft.displayName.trim().length < 2 || !Number.isInteger(years) || years < 0 || years > 80) {
      setMessage(wt.text('requiredFields'));
      return;
    }
    void saveDraft({ ...draft, experienceYears: years });
  };

  const saveTrade = () => {
    // Two distinct failures got one sentence. A worker who has chosen a trade
    // and no jobs was told "Please complete this step first", which does not
    // say which half is missing.
    const problem = tradeSelectionProblem(draft);
    if (problem) {
      setMessage(problem === 'profession_required'
        ? wt.text('professionRequired')
        : wt.text('serviceRequired'));
      return;
    }
    // Saved: the selection is the server's, so the unsaved copy ends and the
    // baseline moves with it.
    void saveDraft(draft).then(saved => {
      if (!saved) return;
      serverTrade.current = tradeSnapshot(draft);
      resetTradeDraft('submitted');
    });
  };

  const saveArea = async () => {
    const area = draft.areas[0];
    if (!area?.governorate.trim() || !area.district.trim()) {
      setMessage(wt.text('requiredFields'));
      return;
    }
    const next = {
      ...draft,
      serviceRadiusKm: MARKETPLACE_MANAGED_RADIUS_KM,
      areas: [{ ...area, radiusKm: MARKETPLACE_MANAGED_RADIUS_KM }],
    };
    const saved = await saveDraft(next);
    if (saved && !state.gates.current_address_provided) {
      router.replace({ pathname: '/onboarding/address', params: { returnTo: 'worker' } });
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}>
          <AppText accessibilityRole="header" style={styles.title}>{wt.text('journeyTitle')}</AppText>
          <AppText
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: progress.total, now: progress.current }}
            style={styles.progressText}>
            {wt.text('journeyStep')} {progress.current} / {progress.total}
          </AppText>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(progress.current / progress.total) * 100}%` }]} /></View>
        </View>

        {state.workerState ? (
          <StateBadge
            label={ot.workerState(state.workerState)}
            tone={state.workerState === 'rejected' || state.workerState === 'suspended' ? 'error' : state.workerState === 'correction_required' ? 'warning' : 'neutral'}
          />
        ) : null}

        {onboarding.refreshing ? <BrandLoadingState label={wt.text('loadingNextStep')} /> : null}

        {!onboarding.refreshing && progress.step === 'welcome' ? (
          <JourneyCard icon="waving-hand" title={wt.text('welcomeTitle')} body={wt.text('welcomeBody')}>
            <AppText style={styles.note}>{ot.text('workerAgreementBody')}</AppText>
            <AppText style={styles.note}>{ot.text('workerDocumentConsent')}</AppText>
            <BrandButton
              label={ot.text('workerAgreementAccept')}
              loading={busy}
              onPress={() => void run(() => onboarding.acceptAgreements(true, true))}
            />
          </JourneyCard>
        ) : null}

        {!onboarding.refreshing && progress.step === 'basic_information' ? (
          <JourneyCard icon="person" title={wt.text('basicTitle')} body={wt.text('basicBody')}>
            <OnboardingFieldMeta label={wt.text('addPhoto')} required purpose={wt.text('photoPurpose')} />
            <WorkerPhotoPicker currentUri={draft.avatarUrl} uploading={busy} onUse={savePhoto} />
            <OnboardingFieldMeta label={wt.text('fullName')} required purpose={wt.text('fullNamePurpose')} />
            <BrandTextField accessibilityLabel={wt.text('fullName')} value={draft.displayName} maxLength={100} onChangeText={displayName => setDraft(current => ({ ...current, displayName }))} />
            <OnboardingFieldMeta label={wt.text('about')} required={false} purpose={wt.text('aboutPurpose')} />
            <BrandTextField accessibilityLabel={wt.text('about')} value={draft.about} maxLength={500} multiline helper={wt.text('aboutExample')} onChangeText={about => setDraft(current => ({ ...current, about }))} />
            <OnboardingFieldMeta label={wt.text('experience')} required={false} purpose={wt.text('experiencePurpose')} />
            <BrandTextField accessibilityLabel={wt.text('experience')} value={experienceInput} placeholder={wt.text('experienceExample')} keyboardType="number-pad" maxLength={2} onChangeText={value => /^\d{0,2}$/.test(value) && setExperienceInput(value)} />
            <BrandButton label={wt.text('saveContinue')} loading={busy} onPress={saveBasic} />
          </JourneyCard>
        ) : null}

        {!onboarding.refreshing && progress.step === 'trade' ? (
          <JourneyCard icon="handyman" title={wt.text('tradeTitle')} body={wt.text('tradeBody')}>
            <OnboardingFieldMeta label={wt.text('professionPlural')} required purpose={wt.text('professionPurpose')} />
            {/* One question at a time: the trade names the work, so the work
                cannot be offered before the trade has been chosen. */}
            <ProfessionSelector
              selected={selectedProfessionKeys(draft)}
              onChange={keys => applyTrade(current => withTradeSelection(current, keys, options))}
            />
            {withdrawnProfessionSelections(draft).length ? (
              <AppText accessibilityRole="alert" style={styles.note}>
                {wt.text('withdrawnProfessionNotice')}
              </AppText>
            ) : null}

            <OnboardingFieldMeta label={wt.text('services')} required purpose={wt.text('servicesBody')} />
            {optionsLoading ? <BrandLoadingState label={wt.text('services')} /> : null}
            {!optionsLoading && selectedProfessionKeys(draft).length === 0 ? (
              <AppText style={styles.note}>{wt.text('chooseProfessionFirst')}</AppText>
            ) : null}
            {!optionsLoading && selectedProfessionKeys(draft).length > 0 ? (
              <OfferedServicesSection
                sections={tradeSections(draft, options)}
                historicalServices={historicalOfferedServices(draft, options)}
                disabled={busy}
                onToggleService={(service, offered) =>
                  applyTrade(current => withOfferedService(current, service, offered, options))}
                onToggleAll={(professionKey, offered) =>
                  applyTrade(current => withProfessionServices(current, professionKey, offered, options))}
              />
            ) : null}
            {!optionsLoading && options.length === 0 ? <BrandButton label={wt.text('retry')} variant="secondary" onPress={() => void loadOptions()} /> : null}
            <BrandButton label={wt.text('saveContinue')} loading={busy} onPress={saveTrade} />
          </JourneyCard>
        ) : null}

        {!onboarding.refreshing && progress.step === 'service_area' ? (
          <JourneyCard icon="location-on" title={wt.text('areaTitle')} body={wt.text('areaBody')}>
            <OnboardingFieldMeta label={wt.text('governorate')} required purpose={wt.text('governoratePurpose')} />
            <OnboardingFieldMeta label={wt.text('district')} required purpose={wt.text('districtPurpose')} />
            <EgyptLocationSelector
              governorate={draft.areas[0]?.governorate ?? ''}
              district={draft.areas[0]?.district ?? ''}
              onChange={area => setDraft(current => ({
                ...current,
                areas: [{ ...area, radiusKm: MARKETPLACE_MANAGED_RADIUS_KM }],
              }))}
            />
            {!state.gates.current_address_provided
              ? <OnboardingFieldMeta label={wt.text('addAddress')} required privateField purpose={wt.text('currentAddressPurpose')} />
              : null}
            <BrandButton label={state.gates.current_address_provided ? wt.text('saveContinue') : wt.text('addAddress')} loading={busy} onPress={() => void saveArea()} />
          </JourneyCard>
        ) : null}

        {!onboarding.refreshing && progress.step === 'identity' ? (
          <JourneyCard icon="badge" title={wt.text('identityTitle')} body={wt.text('identityBody')}>
            <OnboardingFieldMeta label={wt.text('identityTitle')} required privateField purpose={wt.text('identityPurpose')} />
            <BrandButton label={wt.text('continueJourney')} onPress={() => router.push('/worker/verification')} />
          </JourneyCard>
        ) : null}

        {!onboarding.refreshing && progress.step === 'criminal_record' ? (
          <JourneyCard icon="description" title={wt.text('certificateTitle')} body={wt.text('certificateBody')}>
            <OnboardingFieldMeta label={wt.text('certificateTitle')} required privateField purpose={wt.text('certificatePurpose')} />
            <AppText style={styles.note}>{ot.text('certificatePrivacy')}</AppText>
            <BrandButton label={wt.text('continueJourney')} onPress={() => router.push('/worker/verification?step=certificate')} />
          </JourneyCard>
        ) : null}

        {!onboarding.refreshing && progress.step === 'review' ? (
          <JourneyCard icon="task-alt" title={wt.text('reviewJourneyTitle')} body={wt.text('reviewJourneyBody')}>
            {state.latestSafeReason ? <AppText style={styles.note}>{state.latestSafeReason}</AppText> : null}
            {state.workerState && isAwaitingReview(state.workerState) ? <AppText style={styles.note}>{ot.text('stateNoTimePromise')}</AppText> : null}
            <BrandButton label={wt.text('retry')} variant="secondary" onPress={onboarding.reload} />
          </JourneyCard>
        ) : null}

        {canAppeal(state.workerState) ? (
          <JourneyCard icon="gavel" title={ot.text('appealTitle')} body={ot.text('appealIntro')}>
            <BrandTextField label={ot.text('appealStatement')} value={appeal} onChangeText={setAppeal} multiline />
            <BrandButton label={ot.text('appealSubmit')} loading={busy} disabled={appeal.trim().length < 10} onPress={() => void run(() => onboarding.submitAppeal(appeal.trim()))} />
          </JourneyCard>
        ) : null}

        {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
        <BrandButton label={wt.text('support')} variant="ghost" onPress={() => router.push('/support')} />
      </ScrollView>
    </SafeAreaView>
  );
}

function JourneyCard({ icon, title, body, children }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string; body: string; children: React.ReactNode }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <BrandCard style={styles.card}>
      <View style={styles.stepIcon}><MaterialIcons name={icon} size={32} color={colors.textPrimary} /></View>
      <AppText style={styles.sectionTitle}>{title}</AppText>
      <AppText style={styles.body}>{body}</AppText>
      {children}
    </BrandCard>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  heading: { gap: spacing.sm },
  title: { fontSize: 26, lineHeight: 33, fontWeight: typography.bold, color: colors.textPrimary },
  progressText: { color: colors.textSecondary, fontSize: 13 },
  progressTrack: { height: 8, overflow: 'hidden', borderRadius: radii.full, backgroundColor: colors.surfaceElevated },
  progressFill: { height: '100%', borderRadius: radii.full, backgroundColor: colors.textPrimary },
  card: { gap: spacing.md },
  stepIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, backgroundColor: colors.surfaceElevated },
  sectionTitle: { fontSize: 21, lineHeight: 28, fontWeight: typography.bold, color: colors.textPrimary },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 23 },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  error: { color: colors.errorText },
});
