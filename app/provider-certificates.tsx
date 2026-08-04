import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingMark } from '@/components/warsha/BrandMark';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { environment } from '@/src/config/environment';
import { useLocalization } from '@/src/i18n/localization';
import { useWorkerProfileText, type WorkerProfileCopyKey } from '@/src/i18n/worker-profile-translations';
import { useProviderFoundation } from '@/src/providers/provider-context';
import type { ProviderCertificate, ProviderCertificateInput, ProviderCertificateType } from '@/src/providers/provider-types';

const emptyInput: ProviderCertificateInput = { type: 'professional', title: '', issuer: '' };
const types: ProviderCertificateType[] = ['professional', 'trade_license', 'qualification', 'other'];
const typeCopy: Record<ProviderCertificateType, WorkerProfileCopyKey> = {
  professional: 'professional', trade_license: 'tradeLicense', qualification: 'qualification', other: 'other',
};

export default function ProviderCertificatesScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const wt = useWorkerProfileText();
  const state = useProviderFoundation();
  const [form, setForm] = useState<ProviderCertificateInput>(emptyInput);

  const save = async () => {
    try { await state.saveCertificate(form); setForm(emptyInput); }
    catch { Alert.alert(wt('certificates'), wt('retry')); }
  };

  const edit = (item: ProviderCertificate) => setForm({ id: item.id, type: item.type, title: item.title, issuer: item.issuer });

  const chooseDocument = async (item: ProviderCertificate) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    try { await state.uploadCertificate(item.id, { uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType }); }
    catch { Alert.alert(wt('certificates'), wt('retry')); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={wt('certificates')} />
      <ScrollView contentContainerStyle={[styles.content, isRTL && { direction: 'rtl' }]} keyboardShouldPersistTaps="handled">
        <View style={styles.notice} accessibilityRole="alert">
          <MaterialIcons name="lock" size={26} color={colors.white} />
          <View style={styles.grow}><AppText style={styles.strong}>{wt('certificatePrivacy')}</AppText><AppText style={styles.muted}>{wt('certificateOptional')}</AppText><AppText style={styles.muted}>{wt('certificateLimits')}</AppText></View>
        </View>

        <View style={styles.card}>
          <View style={[styles.row, isRTL && styles.reverse]}><View style={styles.iconBox}><MaterialIcons name="workspace-premium" size={27} color={colors.background} /></View><View style={styles.grow}><AppText style={styles.title}>{wt('skillCertificate')}</AppText><AppText style={styles.muted}>{wt('skillCertificateHelp')}</AppText></View></View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/provider-verification')} style={styles.outline}><AppText>{wt('openVerification')}</AppText></Pressable>
        </View>

        <View style={styles.card}>
          <AppText style={styles.title}>{wt('newCertificate')}</AppText>
          <AppText style={styles.label}>{wt('certificateType')}</AppText>
          <View style={styles.wrap}>{types.map(type => <Pressable key={type} accessibilityRole="radio" accessibilityState={{ checked: form.type === type }} onPress={() => setForm(current => ({ ...current, type }))} style={[styles.chip, form.type === type && styles.selected]}><AppText>{wt(typeCopy[type])}</AppText></Pressable>)}</View>
          <Field label={wt('certificateTitle')} value={form.title} maxLength={100} onChangeText={title => setForm(current => ({ ...current, title }))} />
          <Field label={wt('certificateIssuer')} value={form.issuer ?? ''} maxLength={100} onChangeText={issuer => setForm(current => ({ ...current, issuer }))} />
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: state.saving || form.title.trim().length < 2 }} disabled={state.saving || form.title.trim().length < 2} onPress={() => void save()} style={[styles.primary, form.title.trim().length < 2 && styles.disabled]}>
            {state.saving ? <BrandLoadingMark size={20} color={colors.background} /> : <AppText style={styles.dark}>{wt('saveCertificate')}</AppText>}
          </Pressable>
          {form.id ? <Pressable accessibilityRole="button" onPress={() => setForm(emptyInput)} style={styles.outline}><AppText>{wt('cancel')}</AppText></Pressable> : null}
        </View>

        {!state.certificates.length ? <AppText style={styles.empty}>{wt('noCertificates')}</AppText> : null}
        {state.certificates.map(item => {
          const editable = ['draft', 'rejected', 'expired'].includes(item.status);
          return (
            <View key={item.id} style={styles.card}>
              <View style={[styles.row, isRTL && styles.reverse]}>
                <View style={styles.iconBox}><MaterialIcons name={item.status === 'approved' ? 'verified' : 'description'} size={26} color={colors.background} /></View>
                <View style={styles.grow}><AppText style={styles.title}>{item.title}</AppText><AppText style={styles.status}>{wt(item.status)}</AppText>{item.issuer ? <AppText style={styles.muted}>{item.issuer}</AppText> : null}</View>
              </View>
              {item.rejectionReason ? <View style={styles.reason}><AppText style={styles.strong}>{wt('rejectionReason')}</AppText><AppText style={styles.error}>{item.rejectionReason}</AppText></View> : null}
              {editable ? <Pressable accessibilityRole="button" onPress={() => void chooseDocument(item)} style={styles.outline}><MaterialIcons name="upload-file" size={22} color={colors.white} /><AppText>{wt('chooseDocument')}</AppText></Pressable> : null}
              {editable && item.storagePath ? <Pressable accessibilityRole="button" disabled={state.saving} onPress={() => void state.submitCertificate(item.id).catch(() => Alert.alert(wt('certificates'), wt('retry')))} style={styles.primary}><AppText style={styles.dark}>{wt('submitCertificate')}</AppText></Pressable> : null}
              {editable ? <View style={[styles.actions, isRTL && styles.reverse]}>
                <Pressable accessibilityRole="button" onPress={() => edit(item)} style={styles.smallButton}><MaterialIcons name="edit" size={20} color={colors.white} /><AppText>{wt('manage')}</AppText></Pressable>
                <Pressable accessibilityRole="button" onPress={() => Alert.alert(wt('deleteCertificate'), item.title, [{ text: wt('cancel'), style: 'cancel' }, { text: wt('remove'), style: 'destructive', onPress: () => void state.deleteCertificate(item.id).catch(() => Alert.alert(wt('certificates'), wt('retry'))) }])} style={styles.smallButton}><MaterialIcons name="delete-outline" size={20} color={colors.error} /><AppText style={styles.error}>{wt('deleteCertificate')}</AppText></Pressable>
              </View> : null}
              {environment.dataMode === 'mock' && item.status === 'submitted' ? <View style={[styles.actions, isRTL && styles.reverse]}><Pressable accessibilityRole="button" onPress={() => void state.simulateCertificateReview(item.id, true)} style={styles.smallButton}><AppText>{wt('mockApprove')}</AppText></Pressable><Pressable accessibilityRole="button" onPress={() => void state.simulateCertificateReview(item.id, false)} style={styles.smallButton}><AppText>{wt('mockReject')}</AppText></Pressable></View> : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  return <TextInput {...props} accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.textMuted} style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} />;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.sm },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  notice: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  card: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reverse: { flexDirection: 'row-reverse' },
  grow: { flex: 1, minWidth: 0 },
  iconBox: { width: 50, height: 50, borderRadius: 17, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: typography.bold },
  strong: { fontWeight: typography.semibold, lineHeight: 21 },
  label: { fontWeight: typography.semibold },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  status: { color: colors.textSecondary, fontWeight: typography.semibold },
  error: { color: colors.error, lineHeight: 20 },
  reason: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceElevated },
  empty: { textAlign: 'center', color: colors.textMuted, padding: spacing.xl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: colors.white, backgroundColor: colors.surfaceSoft },
  input: { minHeight: 54, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, color: colors.white },
  primary: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, backgroundColor: colors.white },
  dark: { color: colors.background, fontWeight: typography.bold },
  outline: { minHeight: 50, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  smallButton: { minHeight: 46, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  disabled: { opacity: 0.4 },
});
