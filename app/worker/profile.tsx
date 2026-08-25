import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandLoadingState, BrandTextField, EmptyState } from '@/components/warsha/BrandUI';
import { EgyptLocationSelector } from '@/components/warsha/EgyptLocationSelector';
import { ProfessionSelector } from '@/components/warsha/ProfessionSelector';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { WorkerPhotoPicker } from '@/components/warsha/WorkerPhotoPicker';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useMarketplaceData } from '@/src/data/marketplace-context';
import { useLocalization } from '@/src/i18n/localization';
import { useProviderText } from '@/src/i18n/provider-translations';
import { useWorkerProfileText } from '@/src/i18n/worker-profile-translations';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { listProviderServiceOptions } from '@/src/providers/provider-repository';
import { professionLabel, selectedProfessionKeys, withSelectedProfessions } from '@/src/providers/profession-taxonomy';
import { MARKETPLACE_MANAGED_RADIUS_KM, type ProviderDraft, type ProviderMediaInput } from '@/src/providers/provider-types';
import { useWorkerText } from '@/src/worker/worker-copy';
import { catalogueServiceLabel } from '@/src/services/specific-services';

export default function WorkerProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const { categories } = useMarketplaceData();
  const { t, language } = useLocalization();
  const pt = useProviderText();
  const profileText = useWorkerProfileText();
  const wt = useWorkerText();
  const state = useProviderFoundation();
  const [draft, setDraft] = useState<ProviderDraft | null>(null);
  const [experienceInput, setExperienceInput] = useState('');
  const [serviceOptions, setServiceOptions] = useState<{ id: string; name: string; translationKey?: string | null }[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const optionsRequest = useRef(0);

  useEffect(() => {
    if (!state.profile) return;
    setDraft(state.profile);
    setExperienceInput(state.profile.experienceYears > 0 ? String(state.profile.experienceYears) : '');
  }, [state.profile]);

  const loadOptions = useCallback(async () => {
    const request = ++optionsRequest.current;
    setOptionsLoading(true);
    try {
      const next = await listProviderServiceOptions();
      if (request === optionsRequest.current) setServiceOptions(next);
    } catch {
      if (request === optionsRequest.current) setServiceOptions([]);
    } finally {
      if (request === optionsRequest.current) setOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOptions();
    return () => { optionsRequest.current += 1; };
  }, [loadOptions]);

  if (state.loading) return <Page><BrandLoadingState label={wt.text('myProfile')} /></Page>;
  if (!draft) return <Page><EmptyState title={wt.text('myProfile')} body={pt('retry')} action={wt.text('retry')} onAction={() => void state.reload()} /></Page>;

  const savePhoto = async (input: ProviderMediaInput) => {
    try {
      const photo = await state.replaceAvatar(input);
      setDraft(current => current ? { ...current, avatarPath: photo.storagePath, avatarUrl: photo.previewUrl } : current);
    } catch {
      throw new Error(profileText('photoReplaceFailed'));
    }
  };

  const save = async () => {
    if (draft.displayName.trim().length < 2 || selectedProfessionKeys(draft).length === 0) {
      Alert.alert(pt('providerProfile'), profileText('profileRequired'));
      return;
    }
    try {
      await state.save(draft, false);
      Alert.alert(profileText('saved'));
    } catch {
      Alert.alert(pt('providerProfile'), pt('retry'));
    }
  };

  const updateArea = (area: { governorate: string; district: string }) => {
    setDraft(current => current ? {
      ...current,
      serviceRadiusKm: MARKETPLACE_MANAGED_RADIUS_KM,
      areas: [{ ...area, radiusKm: MARKETPLACE_MANAGED_RADIUS_KM }],
    } : current);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <ScreenHeader title={wt.text('myProfile')} />

        <BrandCard style={styles.card}>
          <AppText style={styles.title}>{draft.displayName || wt.text('fullName')}</AppText>
          <AppText style={styles.muted}>{professionLabel(draft.profession, language) || wt.text('profession')}</AppText>
          <WorkerPhotoPicker currentUri={draft.avatarUrl} uploading={state.saving} onUse={savePhoto} />
          <BrandTextField label={wt.text('fullName')} value={draft.displayName} maxLength={100} onChangeText={displayName => setDraft(current => current ? { ...current, displayName } : current)} />
          <AppText style={styles.title}>{wt.text('professionPlural')}</AppText>
          <ProfessionSelector selected={selectedProfessionKeys(draft)} onChange={keys => setDraft(current => current ? withSelectedProfessions(current, keys) : current)} />
          <BrandTextField label={wt.text('about')} value={draft.about} multiline maxLength={500} helper={profileText('aboutCount')} onChangeText={about => setDraft(current => current ? { ...current, about } : current)} />
          <BrandTextField
            label={wt.text('experience')}
            value={experienceInput}
            placeholder={wt.text('experienceExample')}
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={value => {
              if (!/^\d{0,2}$/.test(value)) return;
              setExperienceInput(value);
              setDraft(current => current ? { ...current, experienceYears: value === '' ? 0 : Math.min(80, Number(value)) } : current);
            }}
          />
        </BrandCard>

        <BrandCard style={styles.card}>
          <AppText style={styles.title}>{wt.text('services')}</AppText>
          <View style={styles.wrap}>
            {categories.map(category => (
              <Chip key={category.id} label={t(category.label)} selected={draft.categoryIds.includes(category.id)} onPress={() => setDraft(current => current ? { ...current, categoryIds: current.categoryIds.includes(category.id) ? current.categoryIds.filter(id => id !== category.id) : [...current.categoryIds, category.id] } : current)} />
            ))}
          </View>
          {optionsLoading ? <AppText style={styles.muted}>{wt.text('continueJourney')}</AppText> : (
            <View style={styles.wrap}>
              {serviceOptions.map(option => (
                <Chip key={option.id} label={catalogueServiceLabel(option, language)} selected={draft.services.some(item => item.serviceId === option.id)} onPress={() => setDraft(current => current ? { ...current, services: current.services.some(item => item.serviceId === option.id) ? current.services.filter(item => item.serviceId !== option.id) : [...current.services, { serviceId: option.id, translationKey: option.translationKey, name: option.name }] } : current)} />
              ))}
            </View>
          )}
        </BrandCard>

        <BrandCard style={styles.card}>
          <AppText style={styles.title}>{wt.text('areaTitle')}</AppText>
          <EgyptLocationSelector
            governorate={draft.areas[0]?.governorate ?? ''}
            district={draft.areas[0]?.district ?? ''}
            onChange={updateArea}
          />
        </BrandCard>

        <BrandCard style={styles.card}>
          <BrandButton label={profileText('portfolio')} icon="photo-library" variant="secondary" onPress={() => router.push('/provider-portfolio')} />
          <BrandButton label={profileText('certificates')} icon="workspace-premium" variant="secondary" onPress={() => router.push('/provider-certificates')} />
          <BrandButton label={wt.text('verification')} icon="verified-user" variant="secondary" onPress={() => router.push('/worker/verification')} />
        </BrandCard>

        <BrandButton label={pt('saveDraft')} icon="save" loading={state.saving} onPress={() => void save()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><AppText style={selected && styles.chipSelectedText}>{label}</AppText></Pressable>;
}

function Page({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <SafeAreaView style={styles.safe}><View style={styles.state}>{children}</View></SafeAreaView>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  state: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  card: { gap: spacing.md },
  title: { fontSize: 18, fontWeight: typography.bold },
  muted: { color: colors.textMuted, lineHeight: 20 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated },
  chipSelected: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipSelectedText: { color: colors.background, fontWeight: typography.semibold },
});
