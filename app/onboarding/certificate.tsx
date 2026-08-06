import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandTextField, StateBadge } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useOnboarding } from '@/src/onboarding/onboarding-context';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';
import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  isAcceptedDocument,
  MAX_DOCUMENT_BYTES,
} from '@/src/onboarding/onboarding-types';

/**
 * Criminal-record certificate submission — Model A.
 *
 * The copy says, before anything else, that the worker obtains the certificate
 * themselves and that Warsha has no access to any government system. That is
 * not a disclaimer at the bottom; it is the first thing on the screen, because
 * somebody who believes Warsha will fetch it for them will sit and wait.
 *
 * Acknowledgement is a two-part act: tick the confirmation, then press submit.
 * There is no typed phrase — a typed confirmation is inaccessible to screen
 * reader and switch users, and it is not stronger than a deliberate tap.
 */
export default function CertificateSubmission() {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const ot = useOnboardingText();
  const onboarding = useOnboarding();

  const [file, setFile] = useState<{ name: string; mimeType: string; size: number } | null>(null);
  const [issueDate, setIssueDate] = useState('');
  const [reference, setReference] = useState('');
  const [declaredName, setDeclaredName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const pick = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ACCEPTED_DOCUMENT_MIME_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? '';
      const size = asset.size ?? 0;
      // Checked here so the person gets an immediate answer, and checked again
      // by the server, which is the check that counts.
      if (!isAcceptedDocument(mimeType, size)) {
        setMessage(size > MAX_DOCUMENT_BYTES
          ? ot.text('certificateTooLarge')
          : ot.text('certificateWrongFormat'));
        return;
      }
      setFile({ name: asset.name, mimeType, size });
    } catch {
      setMessage(ot.text('identityUploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!file || !onboarding.accountKey) return;
    if (new Date(issueDate).getTime() > Date.now()) {
      setMessage(ot.text('certificateFutureDate'));
      return;
    }
    setBusy(true);
    setMessage('');
    const ok = await onboarding.submitCriminalRecord({
      // The folder is the account id, which is what both the RPC and the
      // storage policy independently require.
      storagePath: `${onboarding.accountKey}/certificate-${Date.now()}`,
      mimeType: file.mimeType,
      fileSizeBytes: file.size,
      contentHash: null,
      issueDate: issueDate.trim(),
      documentReference: reference.trim() || null,
      declaredName: declaredName.trim(),
    });
    setBusy(false);
    if (!ok) setMessage(ot.text('genericError'));
  };

  const status = onboarding.state.certificateStatus;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <AppText accessibilityRole="header" style={styles.title}>{ot.text('certificateTitle')}</AppText>

        <BrandCard style={styles.card}>
          <AppText style={styles.hint}>{ot.text('certificateWhat')}</AppText>
          <AppText style={styles.note}>{ot.text('certificateHowIntro')}</AppText>
          <AppText style={styles.note}>{ot.text('certificatePrivacy')}</AppText>
        </BrandCard>

        {status ? <StateBadge label={ot.certificateStatus(status)} tone="neutral" /> : null}

        <View style={styles.form}>
          <BrandButton
            label={ot.text('certificateUpload')}
            variant="secondary"
            loading={busy}
            disabled={busy}
            onPress={() => void pick()}
          />
          <AppText style={styles.note}>{ot.text('certificateFormats')}</AppText>
          {file ? <StateBadge label={file.name} tone="success" compact /> : null}

          <BrandTextField
            label={ot.text('certificateDeclaredName')}
            value={declaredName}
            onChangeText={setDeclaredName}
          />
          <BrandTextField
            label={ot.text('certificateIssueDate')}
            value={issueDate}
            onChangeText={setIssueDate}
            placeholder="YYYY-MM-DD"
          />
          <BrandTextField
            label={ot.text('certificateReference')}
            value={reference}
            onChangeText={setReference}
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acknowledged }}
            accessibilityLabel={ot.text('certificateAcknowledge')}
            onPress={() => setAcknowledged((value) => !value)}
            style={({ pressed }) => [styles.check, isRTL && styles.reverse, pressed && styles.checkPressed]}>
            <StateBadge
              label={acknowledged ? ot.text('a11yStepDone') : ot.text('a11yStepTodo')}
              tone={acknowledged ? 'success' : 'neutral'}
              compact
            />
            <AppText style={styles.checkLabel}>{ot.text('certificateAcknowledge')}</AppText>
          </Pressable>

          <BrandButton
            label={ot.text('identitySubmit')}
            loading={busy}
            disabled={busy || !file || !acknowledged || !issueDate.trim() || declaredName.trim().length < 2}
            onPress={() => void submit()}
          />
        </View>

        <BrandButton
          label={ot.text('workerTitle')}
          variant="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding/worker'))}
        />

        {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { padding: spacing.xl, gap: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: typography.bold, color: colors.textPrimary },
  hint: { color: colors.textSecondary },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  card: { gap: spacing.sm },
  form: { gap: spacing.md },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  checkPressed: { backgroundColor: colors.surfacePressed },
  reverse: { flexDirection: 'row-reverse' },
  checkLabel: { flex: 1, color: colors.textSecondary },
  error: { color: colors.errorText },
});
