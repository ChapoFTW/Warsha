import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandLoadingState, BrandTextField, StateBadge } from '@/components/warsha/BrandUI';
import { EgyptLocationSelector } from '@/components/warsha/EgyptLocationSelector';
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
import { selectedProfessionKeys, withSelectedProfessions } from '@/src/providers/profession-taxonomy';
import {
  emptyProviderDraft,
  MARKETPLACE_MANAGED_RADIUS_KM,
  type ProviderDraft,
  type ProviderMediaInput,
} from '@/src/providers/provider-types';
import { useWorkerText } from '@/src/worker/worker-copy';
import { workerJourneyProgress } from '@/src/worker/worker-onboarding-policy';

export default function WorkerOnboarding() {
  const styles = useThemedStyles(makeStyles);
  const ot = useOnboardingText();
  const wt = useWorkerText();
  const onboarding = useOnboarding();
  const provider = useProviderFoundation();
  const [draft, setDraft] = useState<ProviderDraft>(provider.profile ?? emptyProviderDraft);
  const [experienceInput, setExperienceInput] = useState('');
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [appeal, setAppeal] = useState('');
  const hydratedProfile = useRef<string | null>(null);

  useEffect(() => {
    const profile = provider.profile;
    if (!profile) return;
    const key = profile.id ?? onboarding.accountKey ?? 'profile';
    if (hydratedProfile.current === key) return;
    hydratedProfile.current = key;
    setDraft(profile);
    setExperienceInput(profile.experienceYears > 0 ? String(profile.experienceYears) : '');
  }, [onboarding.accountKey, provider.profile]);

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

  const saveDraft = async (next: ProviderDraft): Promise<boolean> => {
    setBusy(true);
    setMessage('');
    try {
      await provider.save(next, false);
      setDraft(next);
      await onboarding.reload();
      return true;
    } catch {
      setMessage(ot.text('genericError'));
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
    if (selectedProfessionKeys(draft).length === 0 || draft.services.length === 0) {
      setMessage(wt.text('requiredFields'));
      return;
    }
    void saveDraft(draft);
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
            <ProfessionSelector selected={selectedProfessionKeys(draft)} onChange={keys => setDraft(current => withSelectedProfessions(current, keys))} />
            <OnboardingFieldMeta label={wt.text('services')} required purpose={wt.text('servicesPurpose')} />
            {optionsLoading ? <BrandLoadingState label={wt.text('services')} /> : (
              <View style={styles.chips}>
                {options.map(option => {
                  const selected = draft.services.some(item => item.serviceId === option.id);
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      onPress={() => setDraft(current => ({
                        ...current,
                        services: selected
                          ? current.services.filter(item => item.serviceId !== option.id)
                          : [...current.services, { serviceId: option.id, name: option.name }],
                      }))}
                      style={[styles.chip, selected && styles.chipSelected]}>
                      <AppText>{option.name}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.full },
  chipSelected: { borderColor: colors.textPrimary, backgroundColor: colors.surfaceElevated },
  error: { color: colors.errorText },
});
