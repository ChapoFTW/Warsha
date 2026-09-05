import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandLoadingState, BrandTextField, StateBadge } from '@/components/warsha/BrandUI';
import { DocumentCamera, type CapturedDocument } from '@/components/warsha/DocumentCamera';
import { OnboardingFieldMeta } from '@/components/warsha/OnboardingFieldMeta';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useVerificationText } from '@/src/i18n/verification-translations';
import { useOnboarding } from '@/src/onboarding/onboarding-context';
import { isValidDeclaredName } from '@/src/onboarding/criminal-record-submission';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';
import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  captureWarnings,
  isAcceptedDocument,
  isValidNationalId,
  MAX_DOCUMENT_BYTES,
} from '@/src/onboarding/onboarding-types';
import { candidateFillsField, offersRetake } from '@/src/verification/identity-extraction-flow';
import { useIdentityExtraction } from '@/src/verification/use-identity-extraction';
import { useVerification } from '@/src/verification/verification-context';
import {
  editableVerificationStatuses,
  normalizeNationalId,
  type VerificationDocument,
} from '@/src/verification/verification-types';
import { useWorkerText } from '@/src/worker/worker-copy';

type IdentityType = 'national_id_front' | 'national_id_back';
type CertificateFile = { uri: string; name: string; mimeType: string; size: number };
const statusCopy = {
  not_started: 'notStarted',
  draft: 'draft',
  submitted: 'submitted',
  under_review: 'underReview',
  approved: 'approved',
  rejected: 'rejected',
  requires_resubmission: 'requiresResubmission',
  expired: 'expired',
} as const;

export default function WorkerVerificationJourney() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL } = useLocalization();
  const params = useLocalSearchParams<{ step?: string }>();
  const vt = useVerificationText();
  const ot = useOnboardingText();
  const wt = useWorkerText();
  const onboarding = useOnboarding();
  const verificationState = useVerification();
  const verification = verificationState.verification;
  const documents = useMemo(
    () => new Map(verification?.documents.map(document => [document.type, document]) ?? []),
    [verification?.documents],
  );
  const [step, setStep] = useState(0);
  const [legalName, setLegalName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [hasSkillCertificate, setHasSkillCertificate] = useState(false);
  const [certificate, setCertificate] = useState<CertificateFile | null>(null);
  const [certificateIssueDate, setCertificateIssueDate] = useState('');
  const [declaredName, setDeclaredName] = useState('');
  // Tracked separately from the value so an empty field the worker deliberately
  // cleared is not helpfully refilled from their profile a render later.
  const [declaredNameTouched, setDeclaredNameTouched] = useState(false);
  const [certificateAcknowledged, setCertificateAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  /**
   * Read a document after it is uploaded, and tell the worker what happened.
   *
   * This is the caller the extraction backend never had. It is not on the
   * critical path: `phase` is a message and two optional buttons, and no value
   * it can take stops somebody typing their details in by hand.
   */
  const extraction = useIdentityExtraction({ onCandidates: () => onboarding.reload() });

  /*
   * A candidate SUGGESTS; the worker confirms or corrects. `candidateFillsField`
   * holds the whole rule — never over something already typed, never a masked
   * value, never one the server marked as needing manual entry — so a change to
   * what may be pre-filled is one edit in a tested module rather than three
   * conditions in an effect.
   */
  useEffect(() => {
    for (const candidate of onboarding.candidates) {
      const fills = (current: string) => candidateFillsField({
        candidateValue: candidate.candidateValue,
        masked: candidate.masked,
        requiresManualEntry: candidate.requiresManualEntry,
        currentValue: current,
      });
      if (candidate.fieldKey === 'legal_name_ar' && fills(legalName)) setLegalName(candidate.candidateValue!);
      if (candidate.fieldKey === 'date_of_birth' && fills(dateOfBirth)) setDateOfBirth(candidate.candidateValue!);
      if (candidate.fieldKey === 'id_expiry_date' && fills(expiryDate)) setExpiryDate(candidate.candidateValue!);
    }
  }, [dateOfBirth, expiryDate, legalName, onboarding.candidates]);

  /*
   * The declared name is prefilled from the legal name the worker already
   * confirmed on the identity step, purely as a convenience.
   *
   * Deliberately NOT wired into the `candidateFillsField` loop above. That loop
   * is fed by OCR, and OCR must never be the authority for this field: the
   * reviewer's whole job is to compare what the worker typed against what the
   * document says, so a value the worker did not confirm would defeat the check
   * it exists for. A confirmed legal name is a different thing — the worker
   * already submitted it as their own.
   *
   * It fills once, only into an untouched empty field, and never replaces an
   * edit. The criminal record may show a different spelling from the ID, and
   * that difference is exactly what a reviewer needs to see.
   */
  useEffect(() => {
    if (declaredNameTouched || declaredName) return;
    const confirmed = legalName.trim();
    if (confirmed.length >= 2) setDeclaredName(confirmed);
  }, [declaredName, declaredNameTouched, legalName]);

  useEffect(() => {
    if (!verification) return;
    const gates = onboarding.state.gates;
    const next = !documents.has('national_id_front') || !gates.national_id_front_uploaded ? 0
      : !documents.has('national_id_back') || !gates.national_id_back_uploaded ? 1
        : !documents.has('selfie') ? 2
          : !gates.identity_fields_confirmed
            || editableVerificationStatuses.includes(verification.status)
            || ['account_created', 'onboarding_incomplete', 'identity_required', 'correction_required'].includes(onboarding.state.workerState ?? '') ? 3
            : !gates.criminal_record_uploaded ? 4 : 5;
    setStep(params.step === 'certificate' && !gates.criminal_record_uploaded ? 4 : next);
    setHasSkillCertificate(verification.documents.some(document => document.type === 'skill_certificate'));
  }, [documents, onboarding.state.gates, onboarding.state.workerState, params.step, verification]);

  if (verificationState.loading || !onboarding.ready) {
    return <SafeAreaView style={styles.safe}><BrandLoadingState label={vt('verification')} /></SafeAreaView>;
  }
  if (!verification || verificationState.error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.page}>
          <ScreenHeader title={vt('verification')} />
          <BrandCard style={styles.card}><AppText style={styles.body}>{vt('loadFailed')}</AppText><BrandButton label={wt.text('retry')} onPress={() => void verificationState.reload()} /></BrandCard>
        </View>
      </SafeAreaView>
    );
  }

  const uploadIdentity = async (
    type: IdentityType,
    uri: string,
    source: 'camera' | 'library',
    warnings: string[],
    fileName?: string | null,
    mimeType?: string | null,
  ) => {
    setBusy(true);
    setMessage('');
    try {
      const document = await verificationState.upload(type, { uri, fileName, mimeType });
      const recorded = await onboarding.recordCapture({
        documentId: document.id,
        captureSource: source,
        contentHash: null,
        qualityFlags: warnings,
        pageSide: type === 'national_id_front' ? 'front' : 'back',
      });
      if (!recorded) throw new Error('Capture metadata was not recorded');
      onboarding.reload();
      setStep(type === 'national_id_front' ? 1 : 2);
      // Reading the card is a convenience that runs after the upload has
      // already succeeded. It is deliberately not awaited into the upload's
      // failure path: a provider that cannot read the photograph must never
      // make the worker think the upload did not work.
      void extraction.request(type, document.storagePath);
    } catch {
      setMessage(ot.text('identityUploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const acceptCameraDocument = (type: IdentityType, capture: CapturedDocument) => {
    void uploadIdentity(type, capture.originalUri, 'camera', capture.warnings);
  };

  const chooseIdentity = async (type: IdentityType) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await uploadIdentity(
      type,
      asset.uri,
      'library',
      captureWarnings({ width: asset.width, height: asset.height, sharpness: null, brightestFraction: null }),
      asset.fileName,
      asset.mimeType,
    );
  };

  const recordExisting = async (type: IdentityType, document: VerificationDocument) => {
    setBusy(true);
    const ok = await onboarding.recordCapture({
      documentId: document.id,
      captureSource: 'file',
      contentHash: null,
      qualityFlags: [],
      pageSide: type === 'national_id_front' ? 'front' : 'back',
    });
    setBusy(false);
    if (ok) {
      onboarding.reload();
      setStep(type === 'national_id_front' ? 1 : 2);
    } else setMessage(ot.text('genericError'));
  };

  const pickSelfie = async (camera: boolean) => {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setMessage(vt('cameraPermission'));
        return;
      }
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, cameraType: ImagePicker.CameraType.front })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    setMessage('');
    try {
      const asset = result.assets[0];
      await verificationState.upload('selfie', { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType });
      setStep(3);
    } catch {
      setMessage(vt('uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const chooseSkillCertificate = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      const asset = result.assets[0];
      await verificationState.upload('skill_certificate', { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType });
      setHasSkillCertificate(true);
    } catch {
      setMessage(vt('uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const submitIdentity = async () => {
    if (legalName.trim().length < 2 || !isValidNationalId(nationalId) || !dateOfBirth.trim()) {
      setMessage(wt.text('requiredFields'));
      return;
    }
    if (hasSkillCertificate && !documents.has('skill_certificate')) {
      setMessage(vt('missingCertificate'));
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const confirmed = await onboarding.confirmIdentityFields({
        legalName: legalName.trim(),
        nationalId,
        dateOfBirth: dateOfBirth.trim(),
        expiryDate: expiryDate.trim() || null,
      });
      if (confirmed === null) throw new Error('Identity fields were not confirmed');
      if (editableVerificationStatuses.includes(verification.status)) {
        await verificationState.submit(nationalId, hasSkillCertificate);
      }
      const submitted = await onboarding.submitIdentity();
      if (!submitted) throw new Error('Identity lifecycle was not submitted');
      setNationalId('');
      onboarding.reload();
      setStep(4);
    } catch {
      setMessage(vt('submitFailed'));
    } finally {
      setBusy(false);
    }
  };

  const pickCriminalRecord = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [...ACCEPTED_DOCUMENT_MIME_TYPES],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? '';
    const size = asset.size ?? 0;
    if (!isAcceptedDocument(mimeType, size)) {
      setMessage(size > MAX_DOCUMENT_BYTES ? ot.text('certificateTooLarge') : ot.text('certificateWrongFormat'));
      return;
    }
    setCertificate({ uri: asset.uri, name: asset.name, mimeType, size });
    setMessage('');
  };

  /*
   * idle -> validating -> submitting -> success, or a contextual error and a
   * retry. `busy` is cleared on every path, including the ones that return
   * early, so the button can never be left spinning on a screen the worker has
   * to force-quit to escape.
   *
   * Nothing a database returns is shown. A rate-limit refusal reads from the
   * shared EN/AR/FR error copy, a field problem names the field, and anything
   * else falls back to the generic sentence — a worker must never be shown a
   * SQLSTATE, an RPC name or a storage error.
   */
  const submitCriminalRecord = async () => {
    if (!certificate || !certificateIssueDate.trim() || !certificateAcknowledged) {
      setMessage(wt.text('requiredFields'));
      return;
    }
    if (!isValidDeclaredName(declaredName)) {
      setDeclaredNameTouched(true);
      setMessage(vt('declaredNameInvalid'));
      return;
    }
    if (new Date(certificateIssueDate).getTime() > Date.now()) {
      setMessage(ot.text('certificateFutureDate'));
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const ok = await onboarding.submitCriminalRecord({
        uri: certificate.uri,
        mimeType: certificate.mimeType,
        fileSizeBytes: certificate.size,
        contentHash: null,
        issueDate: certificateIssueDate.trim(),
        declaredName,
      });
      if (!ok) {
        setMessage(
          onboarding.lastFailure === 'rate_limited' ? t('authRateLimited')
            : onboarding.lastFailure === 'invalid_input' ? vt('declaredNameInvalid')
              : ot.text('genericError'));
        return;
      }
      onboarding.reload();
      router.replace('/onboarding/worker');
    } finally {
      setBusy(false);
    }
  };

  const identityType: IdentityType | null = step === 0 ? 'national_id_front' : step === 1 ? 'national_id_back' : null;
  const identityDocument = identityType ? documents.get(identityType) : undefined;
  const identityGate = identityType
    ? onboarding.state.gates[identityType === 'national_id_front' ? 'national_id_front_uploaded' : 'national_id_back_uploaded']
    : false;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.page, isRTL && styles.rtl]} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={vt('verification')} />
        <View style={styles.progressRow}>
          {[0, 1, 2, 3, 4].map(index => <View key={index} style={[styles.progressDot, index <= step && styles.progressDotActive]} />)}
        </View>
        <StateBadge label={vt(statusCopy[verification.status])} tone={verification.status === 'approved' ? 'success' : 'neutral'} />

        {identityType ? (
          <BrandCard style={styles.card}>
            <AppText style={styles.title}>{ot.text(identityType === 'national_id_front' ? 'identityFront' : 'identityBack')}</AppText>
            <AppText style={styles.body}>{ot.text('identityFrameGuide')}</AppText>
            <OnboardingFieldMeta
              label={ot.text(identityType === 'national_id_front' ? 'identityFront' : 'identityBack')}
              required
              privateField
              purpose={wt.text('identityPurpose')}
            />
            {identityDocument?.previewUrl ? <Image source={{ uri: identityDocument.previewUrl }} contentFit="contain" style={styles.preview} /> : null}
            {identityDocument && !identityGate ? <BrandButton label={wt.text('continueJourney')} loading={busy} onPress={() => void recordExisting(identityType, identityDocument)} /> : null}
            {!identityDocument || identityGate ? (
              <DocumentCamera
                documentLabel={ot.text(identityType === 'national_id_front' ? 'identityFront' : 'identityBack')}
                onCaptured={capture => acceptCameraDocument(identityType, capture)}
                onFallbackRequested={() => void chooseIdentity(identityType)}
                copy={{
                  permissionTitle: vt('verification'),
                  permissionBody: ot.text('identityCameraPermission'),
                  grantPermission: ot.text('identityCapture'),
                  useUploadInstead: ot.text('identityChoose'),
                  capture: ot.text('identityCapture'),
                  retake: ot.text('identityRetake'),
                  usePhoto: wt.text('saveContinue'),
                  frameHint: ot.text('identityFrameGuide'),
                  warning: warning => ot.captureWarning(warning),
                }}
              />
            ) : null}
          </BrandCard>
        ) : null}

        {step === 2 ? (
          <BrandCard style={styles.card}>
            <AppText style={styles.title}>{vt('selfieTitle')}</AppText>
            <AppText style={styles.body}>{vt('selfieHelp')}</AppText>
            <OnboardingFieldMeta label={vt('selfieTitle')} required privateField purpose={wt.text('identityPurpose')} />
            {documents.get('selfie')?.previewUrl ? <Image source={{ uri: documents.get('selfie')!.previewUrl }} contentFit="cover" style={styles.selfie} /> : null}
            <BrandButton label={vt(documents.has('selfie') ? 'replacePhoto' : 'takePhoto')} icon="photo-camera" loading={busy} onPress={() => void pickSelfie(true)} />
            <BrandButton label={vt('choosePhoto')} icon="photo-library" variant="secondary" onPress={() => void pickSelfie(false)} />
            {documents.has('selfie') ? <BrandButton label={wt.text('continueJourney')} variant="secondary" onPress={() => setStep(3)} /> : null}
          </BrandCard>
        ) : null}

        {step === 3 ? (
          <BrandCard style={styles.card}>
            <AppText style={styles.title}>{ot.text('identityFieldsTitle')}</AppText>
            <AppText style={styles.body}>{ot.text('identityFieldsIntro')}</AppText>

            {/* What automatic reading did, said plainly and never as a verdict.
                `unavailable` and `unreadable` are both ordinary: the fields
                below work identically in every phase, which is why none of
                these sentences contains the word "failed". */}
            {extraction.phase !== 'idle' ? (
              <View style={styles.extraction}>
                <AppText accessibilityRole={extraction.phase === 'reading' ? undefined : 'alert'} style={styles.body}>
                  {extraction.phase === 'reading' ? t('identityExtractionReading')
                    : extraction.phase === 'complete' ? t('identityExtractionComplete')
                      : extraction.phase === 'unreadable' ? t('identityExtractionUnreadable')
                        : t('identityExtractionUnavailable')}
                </AppText>
                {offersRetake(extraction.phase) ? (
                  <BrandButton
                    label={t('identityExtractionReadAgain')}
                    variant="secondary"
                    onPress={() => void extraction.request(
                      'national_id_front',
                      documents.get('national_id_front')?.storagePath,
                      { requestedByWorker: true },
                    )}
                  />
                ) : null}
                {/* Stated in every phase, including success. A worker who is
                    told a machine read their card should be told in the same
                    breath that a person decides. */}
                <AppText style={styles.note}>{t('identityExtractionAssistiveNote')}</AppText>
              </View>
            ) : null}

            <OnboardingFieldMeta label={ot.text('identityLegalName')} required privateField purpose={wt.text('identityPurpose')} />
            <BrandTextField label={ot.text('identityLegalName')} value={legalName} onChangeText={setLegalName} />
            <OnboardingFieldMeta label={ot.text('identityNumber')} required privateField purpose={wt.text('identityPurpose')} />
            <BrandTextField label={ot.text('identityNumber')} value={nationalId} onChangeText={value => setNationalId(normalizeNationalId(value))} keyboardType="number-pad" maxLength={14} secureTextEntry helper={ot.text('identityNumberHelp')} />
            <OnboardingFieldMeta label={ot.text('identityDateOfBirth')} required privateField purpose={wt.text('identityPurpose')} />
            <BrandTextField label={ot.text('identityDateOfBirth')} value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" />
            <OnboardingFieldMeta label={ot.text('identityExpiry')} required={false} privateField purpose={wt.text('identityPurpose')} />
            <BrandTextField label={ot.text('identityExpiry')} value={expiryDate} onChangeText={setExpiryDate} placeholder="YYYY-MM-DD" />
            <OnboardingFieldMeta label={vt('certificateQuestion')} required={false} privateField purpose={wt.text('certificatePurpose')} />
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: hasSkillCertificate }} onPress={() => setHasSkillCertificate(value => !value)} style={styles.check}>
              <MaterialIcons name={hasSkillCertificate ? 'check-box' : 'check-box-outline-blank'} size={25} color={colors.textPrimary} />
              <AppText style={styles.grow}>{vt('certificateQuestion')}</AppText>
            </Pressable>
            {hasSkillCertificate ? <BrandButton label={documents.has('skill_certificate') ? vt('replacePhoto') : vt('addCertificate')} variant="secondary" onPress={() => void chooseSkillCertificate()} /> : null}
            <BrandButton label={vt('sendForReview')} loading={busy || verificationState.action === 'submit'} onPress={() => void submitIdentity()} />
          </BrandCard>
        ) : null}

        {step === 4 ? (
          <BrandCard style={styles.card}>
            <AppText style={styles.title}>{ot.text('certificateTitle')}</AppText>
            <AppText style={styles.body}>{ot.text('certificateHowIntro')}</AppText>
            <AppText style={styles.note}>{ot.text('certificatePrivacy')}</AppText>
            <OnboardingFieldMeta label={ot.text('certificateUpload')} required privateField purpose={wt.text('certificatePurpose')} />
            <BrandButton label={ot.text('certificateUpload')} variant="secondary" onPress={() => void pickCriminalRecord()} />
            {certificate ? <StateBadge label={certificate.name} tone="success" compact /> : null}
            <OnboardingFieldMeta label={ot.text('certificateIssueDate')} required privateField purpose={wt.text('certificatePurpose')} />
            <BrandTextField label={ot.text('certificateIssueDate')} value={certificateIssueDate} onChangeText={setCertificateIssueDate} placeholder="YYYY-MM-DD" />
            <OnboardingFieldMeta label={vt('declaredName')} required privateField purpose={wt.text('certificatePurpose')} />
            <BrandTextField
              label={vt('declaredName')}
              value={declaredName}
              onChangeText={value => { setDeclaredNameTouched(true); setDeclaredName(value); }}
              helper={vt('declaredNameHelp')}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <OnboardingFieldMeta label={ot.text('certificateAcknowledge')} required privateField purpose={wt.text('certificatePurpose')} />
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: certificateAcknowledged }} onPress={() => setCertificateAcknowledged(value => !value)} style={styles.check}>
              <MaterialIcons name={certificateAcknowledged ? 'check-box' : 'check-box-outline-blank'} size={25} color={colors.textPrimary} />
              <AppText style={styles.grow}>{ot.text('certificateAcknowledge')}</AppText>
            </Pressable>
            <BrandButton label={ot.text('identitySubmit')} loading={busy} onPress={() => void submitCriminalRecord()} />
          </BrandCard>
        ) : null}

        {step === 5 ? (
          <BrandCard style={styles.statusCard}>
            <MaterialIcons name={verification.status === 'approved' ? 'verified' : 'hourglass-top'} size={48} color={colors.textPrimary} />
            <AppText style={styles.title}>{verification.status === 'approved' ? vt('approvedHelp') : vt('submittedHelp')}</AppText>
            <BrandButton label={wt.text('backHome')} onPress={() => router.replace('/worker')} />
          </BrandCard>
        ) : null}

        {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  extraction: { gap: spacing.sm, paddingVertical: spacing.sm },
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  rtl: { direction: 'rtl' },
  progressRow: { flexDirection: 'row', gap: spacing.sm },
  progressDot: { flex: 1, height: 7, borderRadius: radii.full, backgroundColor: colors.surfaceElevated },
  progressDotActive: { backgroundColor: colors.textPrimary },
  card: { gap: spacing.md },
  title: { fontSize: 21, lineHeight: 28, fontWeight: typography.bold, color: colors.textPrimary },
  body: { fontSize: 14, lineHeight: 22, color: colors.textSecondary },
  note: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  preview: { width: '100%', height: 210, borderRadius: radii.md, backgroundColor: colors.surfaceElevated },
  selfie: { width: 180, height: 180, alignSelf: 'center', borderRadius: radii.full, backgroundColor: colors.surfaceElevated },
  check: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  statusCard: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  error: { color: colors.errorText },
});
