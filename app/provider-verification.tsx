import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandLoadingMark as ActivityIndicator } from '@/components/warsha/BrandMark';

import { ProviderTrustIndicators } from '@/components/warsha/ProviderTrustIndicators';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/src/auth/auth-context';
import { useLocalization } from '@/src/i18n/localization';
import {
  type VerificationCopyKey,
  useVerificationText,
} from '@/src/i18n/verification-translations';
import { useVerification } from '@/src/verification/verification-context';
import {
  editableVerificationStatuses,
  normalizeNationalId,
  requiredIdentityDocumentTypes,
  type VerificationDocumentType,
  type VerificationDocument,
  type VerificationStatus,
} from '@/src/verification/verification-types';

const requiredCopy: Record<
  VerificationDocumentType,
  { title: VerificationCopyKey; help: VerificationCopyKey }
> = {
  national_id_front: { title: 'frontTitle', help: 'frontHelp' },
  national_id_back: { title: 'backTitle', help: 'backHelp' },
  selfie: { title: 'selfieTitle', help: 'selfieHelp' },
  skill_certificate: { title: 'skillCertificate', help: 'certificateOptionalHelp' },
  trade_license: { title: 'tradeLicense', help: 'certificateOptionalHelp' },
  qualification: { title: 'qualification', help: 'certificateOptionalHelp' },
  other: { title: 'otherDocument', help: 'certificateOptionalHelp' },
};

const statusCopy: Record<VerificationStatus, VerificationCopyKey> = {
  not_started: 'notStarted',
  draft: 'draft',
  submitted: 'submitted',
  under_review: 'underReview',
  approved: 'approved',
  rejected: 'rejected',
  requires_resubmission: 'requiresResubmission',
  expired: 'expired',
};

export default function ProviderVerificationScreen() {
  const { t, isRTL } = useLocalization();
  const vt = useVerificationText();
  const auth = useAuth();
  const state = useVerification();
  const verification = state.verification;
  const [step, setStep] = useState(0);
  const [nationalId, setNationalId] = useState('');
  const [showNationalId, setShowNationalId] = useState(false);
  const [hasCertificate, setHasCertificate] = useState<boolean | null>(null);
  const [showOptional, setShowOptional] = useState(false);

  useEffect(() => {
    if (!verification) return;
    if (verification.skillCertificateAnswer === 'yes') setHasCertificate(true);
    if (verification.skillCertificateAnswer === 'no') setHasCertificate(false);
    const missing = requiredIdentityDocumentTypes.findIndex(
      type => !verification.documents.some(document => document.type === type),
    );
    if (missing >= 0) setStep(missing);
    else setStep(3);
  }, [verification]);

  const documents = useMemo(
    () => new Map(verification?.documents.map(document => [document.type, document]) ?? []),
    [verification?.documents],
  );
  const editable = verification
    ? editableVerificationStatuses.includes(verification.status)
    : false;

  const pick = async (type: VerificationDocumentType, camera: boolean) => {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(vt('verification'), vt('cameraPermission'));
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(vt('verification'), vt('photoPermission'));
          return;
        }
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: false,
            quality: 0.85,
          });
      if (result.canceled) return;
      const asset = result.assets[0];
      await state.upload(type, {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      });
      const requiredIndex = requiredIdentityDocumentTypes.indexOf(type);
      if (requiredIndex >= 0) setStep(Math.min(3, requiredIndex + 1));
    } catch {
      Alert.alert(vt('verification'), vt('uploadFailed'));
    }
  };

  const remove = (type: VerificationDocumentType) => {
    const document = documents.get(type);
    if (!document) return;
    Alert.alert(vt('deletePhoto'), vt('privateDocumentHelp'), [
      { text: vt('cancel'), style: 'cancel' },
      {
        text: vt('deletePhoto'),
        style: 'destructive',
        onPress: () =>
          void state.remove(document.id).catch(() => {
            Alert.alert(vt('verification'), vt('uploadFailed'));
          }),
      },
    ]);
  };

  const submit = async () => {
    if (
      requiredIdentityDocumentTypes.some(type => !documents.has(type))
    ) {
      Alert.alert(vt('verification'), vt('missingPhotos'));
      return;
    }
    if (normalizeNationalId(nationalId).length !== 14) {
      Alert.alert(vt('verification'), vt('nationalIdInvalid'));
      return;
    }
    if (hasCertificate === null) {
      Alert.alert(vt('verification'), vt('certificateQuestion'));
      return;
    }
    if (hasCertificate && !documents.has('skill_certificate')) {
      Alert.alert(vt('verification'), vt('missingCertificate'));
      return;
    }
    try {
      await state.submit(nationalId, hasCertificate);
      setNationalId('');
      setShowNationalId(false);
    } catch {
      Alert.alert(vt('verification'), vt('submitFailed'));
    }
  };

  if (state.loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={colors.white} /></View>
      </SafeAreaView>
    );
  }
  if (!verification || state.error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.page}>
          <ScreenHeader title={vt('verification')} />
          <StateMessage icon="error-outline" title={vt('loadFailed')} />
          <LargeButton
            label={t('tryAgain')}
            icon="refresh"
            onPress={() => void state.reload()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const locked = !editable;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={() => void state.reload(true)}
            tintColor={colors.white}
          />
        }
        contentContainerStyle={[styles.page, isRTL && styles.rtl]}>
        <ScreenHeader title={vt('verification')} />
        <StatusCard verification={verification} />

        {verification.rejectionReason ? (
          <View style={styles.reason}>
            <MaterialIcons name="info-outline" size={25} color={colors.error} />
            <View style={styles.grow}>
              <AppText style={styles.cardTitle}>{vt('reason')}</AppText>
              <AppText style={styles.body}>{verification.rejectionReason}</AppText>
            </View>
          </View>
        ) : null}

        {locked ? (
          <>
            <ProviderTrustIndicators
              identityVerified={verification.identityVerified}
              skillCertificateVerified={verification.skillCertificateVerified}
            />
            <StateMessage
              icon={
                verification.status === 'approved'
                  ? 'verified'
                  : 'hourglass-top'
              }
              title={
                verification.status === 'approved'
                  ? vt('approvedHelp')
                  : vt('submittedHelp')
              }
            />
            {__DEV__ &&
            auth.mode === 'mock' &&
            ['submitted', 'under_review'].includes(verification.status) ? (
              <View style={styles.card}>
                <AppText style={styles.cardTitle}>{vt('demoReview')}</AppText>
                <LargeButton
                  label={vt('demoApprove')}
                  icon="verified"
                  busy={state.action === 'review'}
                  onPress={() => void state.simulateReview('approved')}
                />
                <LargeButton
                  label={vt('demoReject')}
                  icon="cancel"
                  onPress={() => void state.simulateReview('rejected')}
                />
                <LargeButton
                  label={vt('demoResubmit')}
                  icon="photo-camera"
                  onPress={() => void state.simulateReview('requires_resubmission')}
                />
              </View>
            ) : null}
            <LargeButton
              label={vt('done')}
              icon="work-outline"
              primary
              onPress={() => router.replace('/provider-mode')}
            />
          </>
        ) : (
          <>
            <View style={[styles.steps, isRTL && styles.reverse]}>
              {[0, 1, 2, 3].map(index => (
                <Pressable
                  key={index}
                  accessibilityRole="button"
                  accessibilityLabel={`${index + 1}`}
                  onPress={() => setStep(index)}
                  style={[styles.step, step === index && styles.stepActive]}>
                  {index < 3 && documents.has(requiredIdentityDocumentTypes[index]) ? (
                    <MaterialIcons
                      name="check"
                      size={21}
                      color={step === index ? colors.background : colors.success}
                    />
                  ) : (
                    <AppText style={step === index && styles.stepTextActive}>
                      {index + 1}
                    </AppText>
                  )}
                </Pressable>
              ))}
            </View>

            {step < 3 ? (
              <DocumentStep
                type={requiredIdentityDocumentTypes[step]}
                document={documents.get(requiredIdentityDocumentTypes[step])}
                busy={state.action === requiredIdentityDocumentTypes[step]}
                onCamera={() => void pick(requiredIdentityDocumentTypes[step], true)}
                onLibrary={() => void pick(requiredIdentityDocumentTypes[step], false)}
                onDelete={() => remove(requiredIdentityDocumentTypes[step])}
              />
            ) : (
              <View style={styles.card}>
                <View style={styles.privateRow}>
                  <MaterialIcons name="lock-outline" size={25} color={colors.success} />
                  <View style={styles.grow}>
                    <AppText style={styles.cardTitle}>{vt('privateDocument')}</AppText>
                    <AppText style={styles.body}>{vt('privateDocumentHelp')}</AppText>
                  </View>
                </View>
                <AppText style={styles.label}>{vt('nationalId')}</AppText>
                <View style={[styles.idInputRow, isRTL && styles.reverse]}>
                  <TextInput
                    accessibilityLabel={vt('nationalId')}
                    value={nationalId}
                    onChangeText={value => setNationalId(normalizeNationalId(value))}
                    keyboardType="number-pad"
                    secureTextEntry={!showNationalId}
                    maxLength={14}
                    placeholder={vt('nationalId')}
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={vt('nationalId')}
                    onPress={() => setShowNationalId(value => !value)}
                    style={styles.eye}>
                    <MaterialIcons
                      name={showNationalId ? 'visibility-off' : 'visibility'}
                      size={24}
                      color={colors.textPrimary}
                    />
                  </Pressable>
                </View>
                <AppText style={styles.help}>{vt('nationalIdHelp')}</AppText>

                <AppText style={styles.cardTitle}>{vt('certificateQuestion')}</AppText>
                <View style={[styles.choiceRow, isRTL && styles.reverse]}>
                  <Choice
                    label={vt('yes')}
                    selected={hasCertificate === true}
                    onPress={() => setHasCertificate(true)}
                  />
                  <Choice
                    label={vt('no')}
                    selected={hasCertificate === false}
                    onPress={() => setHasCertificate(false)}
                  />
                </View>
                {hasCertificate === false ? (
                  <View style={styles.helpBox}>
                    <AppText style={styles.cardTitle}>{vt('certificateHelp')}</AppText>
                    <AppText style={styles.body}>{vt('certificateOptionalHelp')}</AppText>
                  </View>
                ) : null}
                {hasCertificate === true ? (
                  <DocumentStep
                    type="skill_certificate"
                    document={documents.get('skill_certificate')}
                    busy={state.action === 'skill_certificate'}
                    compact
                    onCamera={() => void pick('skill_certificate', true)}
                    onLibrary={() => void pick('skill_certificate', false)}
                    onDelete={() => remove('skill_certificate')}
                  />
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowOptional(value => !value)}
                  style={styles.optionalToggle}>
                  <MaterialIcons
                    name={showOptional ? 'expand-less' : 'add-circle-outline'}
                    size={25}
                    color={colors.textPrimary}
                  />
                  <AppText style={styles.cardTitle}>
                    {vt(showOptional ? 'hideOptionalDocuments' : 'showOptionalDocuments')}
                  </AppText>
                </Pressable>
                {showOptional ? (
                  <View style={styles.optionalList}>
                    {(['trade_license', 'qualification', 'other'] as const).map(type => (
                      <DocumentStep
                        key={type}
                        type={type}
                        document={documents.get(type)}
                        busy={state.action === type}
                        compact
                        onCamera={() => void pick(type, true)}
                        onLibrary={() => void pick(type, false)}
                        onDelete={() => remove(type)}
                      />
                    ))}
                  </View>
                ) : null}

                <LargeButton
                  label={vt('sendForReview')}
                  icon="send"
                  primary
                  busy={state.action === 'submit'}
                  onPress={() => void submit()}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusCard({
  verification,
}: {
  verification: NonNullable<ReturnType<typeof useVerification>['verification']>;
}) {
  const vt = useVerificationText();
  return (
    <View style={styles.statusCard}>
      <View style={styles.statusIcon}>
        <MaterialIcons
          name={verification.status === 'approved' ? 'verified' : 'shield'}
          size={32}
          color={colors.background}
        />
      </View>
      <View style={styles.grow}>
        <AppText style={styles.help}>{vt('verificationStatus')}</AppText>
        <AppText style={styles.statusTitle}>{vt(statusCopy[verification.status])}</AppText>
      </View>
    </View>
  );
}

function DocumentStep({
  type,
  document,
  busy,
  compact = false,
  onCamera,
  onLibrary,
  onDelete,
}: {
  type: VerificationDocumentType;
  document?: VerificationDocument;
  busy: boolean;
  compact?: boolean;
  onCamera: () => void;
  onLibrary: () => void;
  onDelete: () => void;
}) {
  const vt = useVerificationText();
  const copy = requiredCopy[type];
  return (
    <View style={[styles.card, compact && styles.compactCard]}>
      <View style={styles.documentHeading}>
        <View style={styles.documentIcon}>
          <MaterialIcons
            name={type === 'selfie' ? 'face' : 'badge'}
            size={30}
            color={colors.textPrimary}
          />
        </View>
        <View style={styles.grow}>
          <AppText style={styles.cardTitle}>{vt(copy.title)}</AppText>
          <AppText style={styles.body}>{vt(copy.help)}</AppText>
        </View>
      </View>
      {document?.previewUrl ? (
        <Image
          source={{ uri: document.previewUrl }}
          contentFit="cover"
          style={[styles.preview, compact && styles.compactPreview]}
        />
      ) : null}
      {busy ? (
        <View style={styles.busy}><ActivityIndicator color={colors.white} /></View>
      ) : (
        <>
          <LargeButton
            label={document ? vt('replacePhoto') : vt('takePhoto')}
            icon="photo-camera"
            primary={!document}
            onPress={onCamera}
          />
          <LargeButton
            label={vt('choosePhoto')}
            icon="photo-library"
            onPress={onLibrary}
          />
          {document ? (
            <LargeButton
              label={vt('deletePhoto')}
              icon="delete-outline"
              danger
              onPress={onDelete}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function LargeButton({
  label,
  icon,
  onPress,
  primary = false,
  danger = false,
  busy = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      style={[styles.button, primary && styles.primary, danger && styles.danger]}>
      {busy ? (
        <ActivityIndicator color={primary ? colors.background : colors.white} />
      ) : (
        <MaterialIcons
          name={icon}
          size={27}
          color={primary ? colors.background : danger ? colors.error : colors.white}
        />
      )}
      <AppText
        style={[
          styles.buttonText,
          primary && styles.primaryText,
          danger && styles.dangerText,
        ]}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}>
      <MaterialIcons
        name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
        size={25}
        color={selected ? colors.background : colors.white}
      />
      <AppText style={selected && styles.choiceTextSelected}>{label}</AppText>
    </Pressable>
  );
}

function StateMessage({
  icon,
  title,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
}) {
  return (
    <View style={styles.stateMessage}>
      <MaterialIcons name={icon} size={52} color={colors.textMuted} />
      <AppText style={styles.stateTitle}>{title}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  rtl: { direction: 'rtl' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, gap: 4 },
  reverse: { flexDirection: 'row-reverse' },
  statusCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  statusIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  statusTitle: { fontSize: 21, fontWeight: typography.bold },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.surface },
  steps: { flexDirection: 'row', gap: spacing.sm },
  step: { flex: 1, minHeight: 50, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepActive: { backgroundColor: colors.white, borderColor: colors.white },
  stepTextActive: { color: colors.background, fontWeight: typography.bold },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  compactCard: { padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated },
  documentHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  documentIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  cardTitle: { fontSize: 16, fontWeight: typography.bold },
  body: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  help: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: typography.semibold },
  preview: { width: '100%', height: 240, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated },
  compactPreview: { height: 160 },
  busy: { minHeight: 72, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  primary: { backgroundColor: colors.white, borderColor: colors.white },
  danger: { borderColor: colors.error },
  buttonText: { fontSize: 16, fontWeight: typography.bold, textAlign: 'center' },
  primaryText: { color: colors.background },
  dangerText: { color: colors.error },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  idInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { flex: 1, minHeight: 58, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, color: colors.white, paddingHorizontal: spacing.lg, fontSize: 18, letterSpacing: 2 },
  eye: { width: 54, height: 54, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  choiceRow: { flexDirection: 'row', gap: spacing.md },
  choice: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  choiceSelected: { backgroundColor: colors.white, borderColor: colors.white },
  choiceTextSelected: { color: colors.background, fontWeight: typography.bold },
  helpBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated },
  optionalToggle: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  optionalList: { gap: spacing.md },
  stateMessage: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  stateTitle: { maxWidth: 430, fontSize: 17, lineHeight: 25, textAlign: 'center', color: colors.textSecondary },
});
