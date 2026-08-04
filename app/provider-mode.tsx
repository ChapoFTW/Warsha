import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingMark as ActivityIndicator } from '@/components/warsha/BrandMark';
import { ProviderJobsContent } from '@/components/warsha/ProviderJobsContent';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useMarketplaceData } from '@/src/data/marketplace-context';
import { useLocalization } from '@/src/i18n/localization';
import { usePaymentText } from '@/src/i18n/payment-translations';
import { useProviderText } from '@/src/i18n/provider-translations';
import { useVerificationText, type VerificationCopyKey } from '@/src/i18n/verification-translations';
import { useWorkerProfileText } from '@/src/i18n/worker-profile-translations';
import { useProviderJobs } from '@/src/provider-jobs/provider-job-context';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { listProviderServiceOptions } from '@/src/providers/provider-repository';
import { emptyProviderDraft, providerChecklist, type ProviderDraft } from '@/src/providers/provider-types';
import { useVerification } from '@/src/verification/verification-context';
import type { VerificationStatus } from '@/src/verification/verification-types';

type Section = 'jobs' | 'profile';
type ProfileStep = 'introduction' | 'services' | 'area' | 'review';

const verificationStatusCopy: Record<VerificationStatus, VerificationCopyKey> = {
  not_started: 'notStarted', draft: 'draft', submitted: 'submitted', under_review: 'underReview',
  approved: 'approved', rejected: 'rejected', requires_resubmission: 'requiresResubmission', expired: 'expired',
};

export default function ProviderMode() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const pt = useProviderText();
  const wt = useWorkerProfileText();
  const payText = usePaymentText();
  const { t, isRTL, language } = useLocalization();
  const { categories } = useMarketplaceData();
  const state = useProviderFoundation();
  const jobState = useProviderJobs();
  const verificationState = useVerification();
  const [draft, setDraft] = useState<ProviderDraft>(state.profile ?? emptyProviderDraft);
  const [section, setSection] = useState<Section>('jobs');
  const [step, setStep] = useState<ProfileStep>('introduction');
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(false);
  const optionsRequest = useRef(0);

  const loadOptions = useCallback(async () => {
    const request = ++optionsRequest.current;
    setOptionsLoading(true); setOptionsError(false);
    try {
      const value = await listProviderServiceOptions();
      if (request === optionsRequest.current) setOptions(value);
    } catch {
      if (request === optionsRequest.current) { setOptions([]); setOptionsError(true); }
    } finally {
      if (request === optionsRequest.current) setOptionsLoading(false);
    }
  }, []);

  useEffect(() => { if (state.profile) setDraft(state.profile); }, [state.profile]);
  useEffect(() => { void loadOptions(); return () => { optionsRequest.current += 1; }; }, [loadOptions]);

  const checklist = providerChecklist(draft, verificationState.verification?.identityVerified ?? false);
  const ready = Boolean(
    draft.displayName.trim().length >= 2 && draft.profession.trim().length >= 2
    && checklist.photo && checklist.introduction && checklist.services && checklist.area
    && draft.agreementAccepted,
  );

  if (state.loading) return <Page><ActivityIndicator color={colors.white} /></Page>;

  const save = async (submit = false) => {
    if (!draft.displayName.trim() || !draft.profession.trim() || submit && !ready) {
      Alert.alert(pt('foundation'), wt('profileRequired')); return;
    }
    try { await state.save(draft, submit); Alert.alert(wt('saved')); }
    catch { Alert.alert(pt('foundation'), pt('retry')); }
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert(pt('profilePhoto'), wt('photoInvalid')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      const photo = await state.replaceAvatar({ uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType });
      setDraft(current => ({ ...current, avatarPath: photo.storagePath, avatarUrl: photo.previewUrl }));
    } catch { Alert.alert(pt('profilePhoto'), wt('photoReplaceFailed')); }
  };

  const removePhoto = () => Alert.alert(pt('profilePhoto'), wt('confirmRemovePhoto'), [
    { text: wt('cancel'), style: 'cancel' },
    { text: wt('remove'), style: 'destructive', onPress: () => void state.deleteAvatar().then(() => setDraft(current => ({ ...current, avatarPath: '', avatarUrl: '' }))).catch(() => Alert.alert(pt('profilePhoto'), pt('retry'))) },
  ]);

  const steps: { id: ProfileStep; label: string }[] = [
    { id: 'introduction', label: pt('publicInfo') },
    { id: 'services', label: pt('offeredServices') },
    { id: 'area', label: pt('areasAvailability') },
    { id: 'review', label: pt('reviewSubmit') },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <ScreenHeader title={pt(section === 'profile' ? 'providerProfile' : 'jobs')} />
        <View style={[styles.nav, isRTL && styles.reverse]}>
          {(['jobs', 'profile'] as Section[]).map(item => (
            <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: section === item }} onPress={() => setSection(item)} style={[styles.navItem, section === item && styles.active]}>
              <MaterialIcons name={item === 'jobs' ? 'work-outline' : 'person-outline'} size={26} color={section === item ? colors.background : colors.textMuted} />
              <AppText style={section === item && styles.dark}>{pt(item)}</AppText>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView
        refreshControl={<RefreshControl refreshing={jobState.refreshing || verificationState.refreshing} onRefresh={() => void Promise.all([jobState.reload(true), verificationState.reload(true), state.reloadAssets()])} tintColor={colors.white} />}
        contentContainerStyle={[styles.content, isRTL && { direction: 'rtl' }]}
      >
        {section === 'jobs' ? (
          <>
            <ActionCard icon="request-quote" title={language === 'ar' ? 'عروض الأسعار' : 'Quote invitations'} help={language === 'ar' ? 'راجع الطلبات وابعت أو عدّل عرضك' : 'Review requests and send or revise your quote'} onPress={() => router.push('/worker-quotes')} isRTL={isRTL} />
            <ActionCard icon="payments" title={payText('earnings')} help={`${payText('availableWithdraw')} · ${payText('pending')} · ${payText('paidOut')}`} onPress={() => router.push('/provider-earnings')} isRTL={isRTL} />
            <VerificationSummary />
            <ProviderJobsContent />
          </>
        ) : (
          <>
            <Checklist value={checklist} />
            <View style={styles.steps}>
              {steps.map((item, index) => (
                <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: step === item.id }} onPress={() => setStep(item.id)} style={[styles.step, step === item.id && styles.active]}>
                  <AppText style={step === item.id && styles.dark}>{index + 1}</AppText>
                </Pressable>
              ))}
            </View>

            {step === 'introduction' ? (
              <Card>
                <View style={[styles.photoRow, isRTL && styles.reverse]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={wt('addPhoto')} onPress={() => void pickPhoto()} style={styles.photo}>
                    {draft.avatarUrl ? <Image source={{ uri: draft.avatarUrl }} contentFit="cover" style={styles.photo} /> : <MaterialIcons name="person" size={42} color={colors.textMuted} />}
                  </Pressable>
                  <View style={styles.photoActions}>
                    <Pressable accessibilityRole="button" onPress={() => void pickPhoto()} style={styles.outline}><AppText>{wt('addPhoto')}</AppText></Pressable>
                    {draft.avatarPath ? <Pressable accessibilityRole="button" onPress={removePhoto} style={styles.textAction}><AppText style={styles.error}>{wt('removePhoto')}</AppText></Pressable> : null}
                  </View>
                </View>
                <Field label={pt('displayName')} value={draft.displayName} maxLength={100} onChangeText={displayName => setDraft(current => ({ ...current, displayName }))} />
                <Field label={pt('profession')} value={draft.profession} maxLength={100} onChangeText={profession => setDraft(current => ({ ...current, profession }))} />
                <Field label={wt('aboutPrompt')} value={draft.about} multiline maxLength={500} onChangeText={about => setDraft(current => ({ ...current, about }))} />
                <AppText style={styles.hint}>{wt('aboutCount')}</AppText>
                <Field label={pt('experience')} value={String(draft.experienceYears)} keyboardType="number-pad" maxLength={2} onChangeText={value => setDraft(current => ({ ...current, experienceYears: Math.min(80, Number(value) || 0) }))} />
                <Field label={wt('experienceSummary')} value={draft.experienceSummary} multiline maxLength={500} onChangeText={experienceSummary => setDraft(current => ({ ...current, experienceSummary }))} />
                <Field label={wt('specialties')} value={draft.specialties.join(', ')} maxLength={520} onChangeText={value => setDraft(current => ({ ...current, specialties: value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 10) }))} />
                <AppText style={styles.hint}>{wt('selfDeclared')}</AppText>
              </Card>
            ) : null}

            {step === 'services' ? (
              <Card>
                <AppText style={styles.title}>{pt('categoriesLabel')}</AppText>
                <Wrap>{categories.map(category => <Chip key={category.id} label={t(category.label)} selected={draft.categoryIds.includes(category.id)} onPress={() => setDraft(current => ({ ...current, categoryIds: current.categoryIds.includes(category.id) ? current.categoryIds.filter(id => id !== category.id) : [...current.categoryIds, category.id] }))} />)}</Wrap>
                <AppText style={styles.title}>{pt('offeredServices')}</AppText>
                {optionsLoading ? <ActivityIndicator color={colors.white} /> : optionsError ? (
                  <Pressable accessibilityRole="button" onPress={() => void loadOptions()} style={styles.outline}><AppText>{wt('retry')}</AppText></Pressable>
                ) : <Wrap>{options.map(option => <Chip key={option.id} label={option.name} selected={draft.services.some(item => item.serviceId === option.id)} onPress={() => setDraft(current => ({ ...current, services: current.services.some(item => item.serviceId === option.id) ? current.services.filter(item => item.serviceId !== option.id) : [...current.services, { serviceId: option.id, name: option.name }] }))} />)}</Wrap>}
              </Card>
            ) : null}

            {step === 'area' ? (
              <Card>
                <Field label={pt('governorate')} value={draft.areas[0]?.governorate ?? ''} maxLength={100} onChangeText={value => setDraft(current => ({ ...current, areas: [{ governorate: value, district: current.areas[0]?.district ?? '', radiusKm: current.serviceRadiusKm }] }))} />
                <Field label={pt('district')} value={draft.areas[0]?.district ?? ''} maxLength={100} onChangeText={value => setDraft(current => ({ ...current, areas: [{ governorate: current.areas[0]?.governorate ?? '', district: value, radiusKm: current.serviceRadiusKm }] }))} />
                <Field label={pt('radius')} value={String(draft.serviceRadiusKm)} keyboardType="number-pad" maxLength={3} onChangeText={value => { const radius = Math.min(250, Math.max(1, Number(value) || 1)); setDraft(current => ({ ...current, serviceRadiusKm: radius, areas: current.areas.map(area => ({ ...area, radiusKm: radius })) })); }} />
                <Toggle label={draft.isAvailable ? pt('available') : pt('unavailable')} value={draft.isAvailable} onPress={() => { const available = !draft.isAvailable; setDraft(current => ({ ...current, isAvailable: available })); void state.setAvailability(available).catch(() => setDraft(current => ({ ...current, isAvailable: !available }))); }} />
              </Card>
            ) : null}

            {step === 'review' ? (
              <>
                <ActionCard icon="photo-library" title={wt('portfolio')} help={wt('portfolioHelp')} onPress={() => router.push('/provider-portfolio')} isRTL={isRTL} />
                <ActionCard icon="workspace-premium" title={wt('certificates')} help={wt('certificatesHelp')} onPress={() => router.push('/provider-certificates')} isRTL={isRTL} />
                <VerificationSummary />
                <Card>
                  <Toggle label={pt('agreement')} value={draft.agreementAccepted} onPress={() => setDraft(current => ({ ...current, agreementAccepted: !current.agreementAccepted }))} />
                  <Pressable accessibilityRole="button" disabled={state.saving} onPress={() => void save(false)} style={styles.outline}><AppText>{pt('saveDraft')}</AppText></Pressable>
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: state.saving || !ready }} disabled={state.saving || !ready} onPress={() => void save(true)} style={[styles.primary, !ready && styles.disabled]}>
                    {state.saving ? <ActivityIndicator color={colors.background} /> : <AppText style={styles.dark}>{pt('goLive')}</AppText>}
                  </Pressable>
                </Card>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Checklist({ value }: { value: ReturnType<typeof providerChecklist> }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const wt = useWorkerProfileText();
  const labels: Record<keyof typeof value, ReturnType<typeof wt>> = {
    photo: wt('photoDone'), introduction: wt('introDone'), services: wt('servicesDone'),
    area: wt('areaDone'), verification: wt('verificationDone'),
  };
  return <Card><AppText style={styles.title}>{wt('checklist')}</AppText><AppText style={styles.hint}>{wt('checklistHelp')}</AppText>{(Object.keys(value) as (keyof typeof value)[]).map(key => <View key={key} style={styles.checkRow}><MaterialIcons name={value[key] ? 'check-circle' : 'radio-button-unchecked'} size={22} color={value[key] ? colors.success : colors.textMuted} /><AppText style={styles.grow}>{labels[key]}</AppText>{!value[key] ? <AppText style={styles.hint}>{wt('incomplete')}</AppText> : null}</View>)}</Card>;
}

function VerificationSummary() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const state = useVerification();
  const vt = useVerificationText();
  if (state.loading) return <Card><ActivityIndicator color={colors.white} /></Card>;
  const verification = state.verification;
  const status = verification?.status ?? 'not_started';
  const action = status === 'not_started' ? vt('startVerification') : ['draft', 'rejected', 'requires_resubmission', 'expired'].includes(status) ? vt('continueVerification') : vt('reviewVerification');
  return <Card><View style={styles.verificationRow}><View style={styles.iconBox}><MaterialIcons name={verification?.identityVerified ? 'verified' : 'shield'} size={30} color={colors.background} /></View><View style={styles.grow}><AppText style={styles.title}>{vt('verification')}</AppText><AppText style={styles.hint}>{vt(verificationStatusCopy[status])}</AppText></View></View>{verification?.rejectionReason ? <AppText style={styles.error}>{verification.rejectionReason}</AppText> : null}<Pressable accessibilityRole="button" accessibilityLabel={action} onPress={() => router.push('/provider-verification')} style={styles.primary}><AppText style={styles.dark}>{action}</AppText></Pressable></Card>;
}

function ActionCard({ icon, title, help, onPress, isRTL }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string; help: string; onPress: () => void; isRTL: boolean }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={[styles.actionCard, isRTL && styles.reverse]}><View style={styles.iconBox}><MaterialIcons name={icon} size={28} color={colors.background} /></View><View style={styles.grow}><AppText style={styles.title}>{title}</AppText><AppText style={styles.hint}>{help}</AppText></View><MaterialIcons name={isRTL ? 'arrow-back' : 'arrow-forward'} size={24} color={colors.white} /></Pressable>;
}
function Page({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles); return <SafeAreaView style={styles.safe}><View style={styles.center}>{children}</View></SafeAreaView>; }
function Card({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles); return <View style={styles.card}>{children}</View>; }
function Wrap({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles); return <View style={styles.wrap}>{children}</View>; }
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles); return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.chip, selected && styles.selected]}><AppText>{label}</AppText></Pressable>; }
function Toggle({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles); return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={onPress} style={styles.toggle}><MaterialIcons name={value ? 'check-box' : 'check-box-outline-blank'} size={23} color={colors.white} /><AppText style={styles.grow}>{label}</AppText></Pressable>; }
function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles); const { isRTL } = useLocalization(); return <TextInput {...props} accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.textMuted} style={[styles.input, props.multiline && styles.multiline, { textAlign: isRTL ? 'right' : 'left' }]} />; }

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, gap: spacing.md },
  nav: { flexDirection: 'row', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  navItem: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  active: { backgroundColor: colors.white },
  dark: { color: colors.background, fontWeight: typography.bold },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg, maxWidth: 720, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md },
  actionCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, backgroundColor: colors.surface, padding: spacing.lg },
  iconBox: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: typography.bold },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  grow: { flex: 1, minWidth: 0 },
  steps: { flexDirection: 'row', gap: spacing.sm },
  step: { flex: 1, minHeight: 48, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  photo: { width: 104, height: 104, borderRadius: 32, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoActions: { flex: 1, gap: spacing.sm },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, color: colors.white, paddingHorizontal: spacing.md },
  multiline: { minHeight: 110, paddingTop: spacing.md, textAlignVertical: 'top' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: colors.white, backgroundColor: colors.surfaceSoft },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  primary: { minHeight: 56, borderRadius: radii.lg, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  outline: { minHeight: 50, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  textAction: { minHeight: 44, justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  error: { color: colors.error },
  checkRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  verificationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
