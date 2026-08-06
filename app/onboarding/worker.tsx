import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BrandButton,
  BrandCard,
  BrandLoadingState,
  BrandTextField,
  StateBadge,
} from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { extractionCapability } from '@/src/onboarding/identity-extraction';
import { useOnboarding } from '@/src/onboarding/onboarding-context';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';
import {
  actionableGates,
  canAppeal,
  gateProgress,
  isAwaitingReview,
  isValidNationalId,
  needsWorkerAction,
} from '@/src/onboarding/onboarding-types';

/**
 * The worker application, and the default home for anybody whose worker
 * account is not yet active.
 *
 * Two things this screen refuses to do.
 *
 * It never shows a review deadline. Nothing measures how long a review takes
 * and nobody has committed to staffing one, so "usually within 48 hours" would
 * be a number invented to make the wait feel shorter.
 *
 * It never lists a gate the worker cannot act on. `actionableGates` filters out
 * the staff-side ones, because a to-do item somebody cannot complete is not a
 * to-do item — it is a source of support tickets.
 */
export default function WorkerOnboarding() {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const ot = useOnboardingText();
  const onboarding = useOnboarding();

  const [legalName, setLegalName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [expiry, setExpiry] = useState('');
  const [appeal, setAppeal] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');

  if (!onboarding.ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <BrandLoadingState label={ot.text('gatewayLoading')} />
      </SafeAreaView>
    );
  }

  const state = onboarding.state;
  const workerState = state.workerState;
  const progress = gateProgress(state);
  const outstanding = actionableGates(state);

  const run = async (operation: () => Promise<boolean>, success: string) => {
    setBusy(true);
    setMessage('');
    setNotice('');
    const ok = await operation();
    setBusy(false);
    if (ok) setNotice(success);
    else setMessage(ot.text('genericError'));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <AppText accessibilityRole="header" style={styles.title}>{ot.text('workerTitle')}</AppText>

        {workerState ? (
          <BrandCard style={styles.card}>
            <StateBadge
              label={ot.workerState(workerState)}
              tone={
                workerState === 'rejected' || workerState === 'suspended' ? 'error'
                  : workerState === 'correction_required' ? 'warning'
                    : workerState === 'active' || workerState === 'approved' ? 'success' : 'neutral'
              }
            />
            {isAwaitingReview(workerState) ? (
              <AppText style={styles.note}>{ot.text('stateNoTimePromise')}</AppText>
            ) : null}
            {state.latestSafeReason ? (
              <AppText style={styles.hint}>{state.latestSafeReason}</AppText>
            ) : null}
          </BrandCard>
        ) : null}

        {progress.total > 0 ? (
          <AppText
            accessibilityRole="progressbar"
            accessibilityLabel={ot.text('a11yProgress')}
            accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}
            style={styles.hint}>
            {`${ot.text('workerStepsRemaining')}: ${progress.total - progress.done}`}
          </AppText>
        ) : null}

        {needsWorkerAction(workerState) && outstanding.length > 0 ? (
          <BrandCard style={styles.card}>
            <AppText style={styles.sectionTitle}>{ot.text('workerIntro')}</AppText>
            {outstanding.map((gate) => (
              <View key={gate} style={[styles.stepRow, isRTL && styles.reverse]}>
                {/* State is carried by the badge label, not by colour alone. */}
                <StateBadge label={ot.text('a11yStepTodo')} tone="warning" compact />
                <AppText style={styles.stepLabel}>{ot.gate(gate)}</AppText>
              </View>
            ))}
          </BrandCard>
        ) : null}

        {!state.workerAgreementAccepted || !state.documentProcessingAccepted ? (
          <BrandCard style={styles.card}>
            <AppText style={styles.sectionTitle}>{ot.text('workerAgreementTitle')}</AppText>
            <AppText style={styles.hint}>{ot.text('workerAgreementBody')}</AppText>
            <AppText style={styles.hint}>{ot.text('workerDocumentConsent')}</AppText>
            <BrandButton
              label={ot.text('workerAgreementAccept')}
              loading={busy}
              disabled={busy}
              onPress={() => void run(
                () => onboarding.acceptAgreements(true, true),
                ot.text('workerAgreementAccepted'),
              )}
            />
          </BrandCard>
        ) : null}

        <BrandCard style={styles.card}>
          <AppText style={styles.sectionTitle}>{ot.text('identityTitle')}</AppText>
          <AppText style={styles.hint}>{ot.text('identityIntro')}</AppText>
          <AppText style={styles.note}>{ot.text('identityFrameGuide')}</AppText>
          <BrandButton
            label={ot.text('identityFront')}
            variant="secondary"
            onPress={() => router.push('/onboarding/identity?side=front')}
          />
          <BrandButton
            label={ot.text('identityBack')}
            variant="secondary"
            onPress={() => router.push('/onboarding/identity?side=back')}
          />
        </BrandCard>

        <BrandCard style={styles.card}>
          <AppText style={styles.sectionTitle}>{ot.text('identityFieldsTitle')}</AppText>
          <AppText style={styles.hint}>{ot.text('identityFieldsIntro')}</AppText>
          {/* No provider is configured, so this says so rather than showing a
              spinner that never resolves. */}
          {!extractionCapability.available ? (
            <AppText style={styles.note}>{ot.text('identityNoExtraction')}</AppText>
          ) : null}
          <BrandTextField label={ot.text('identityLegalName')} value={legalName} onChangeText={setLegalName} />
          <BrandTextField
            label={ot.text('identityNumber')}
            value={nationalId}
            onChangeText={setNationalId}
            keyboardType="number-pad"
            maxLength={20}
            helper={ot.text('identityNumberHelp')}
            error={nationalId.length > 0 && !isValidNationalId(nationalId)
              ? ot.text('identityNumberInvalid') : undefined}
          />
          <BrandTextField
            label={ot.text('identityDateOfBirth')}
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            placeholder="YYYY-MM-DD"
          />
          <BrandTextField
            label={ot.text('identityExpiry')}
            value={expiry}
            onChangeText={setExpiry}
            placeholder="YYYY-MM-DD"
          />
          <BrandButton
            label={ot.text('identityConfirmFields')}
            loading={busy}
            disabled={busy || legalName.trim().length < 2 || !isValidNationalId(nationalId) || !dateOfBirth.trim()}
            onPress={() => void run(async () => {
              const last4 = await onboarding.confirmIdentityFields({
                legalName: legalName.trim(),
                nationalId,
                dateOfBirth: dateOfBirth.trim(),
                expiryDate: expiry.trim() || null,
              });
              return last4 !== null;
            }, ot.text('identitySubmitted'))}
          />
          <BrandButton
            label={ot.text('identitySubmit')}
            loading={busy}
            disabled={busy}
            onPress={() => void run(() => onboarding.submitIdentity(), ot.text('identitySubmitted'))}
          />
        </BrandCard>

        <BrandCard style={styles.card}>
          <AppText style={styles.sectionTitle}>{ot.text('certificateTitle')}</AppText>
          <AppText style={styles.hint}>{ot.text('certificateWhat')}</AppText>
          {/* Model A, stated plainly. Warsha does not fetch this document. */}
          <AppText style={styles.note}>{ot.text('certificateHowIntro')}</AppText>
          <AppText style={styles.note}>{ot.text('certificatePrivacy')}</AppText>
          <BrandButton
            label={ot.text('certificateUpload')}
            variant="secondary"
            onPress={() => router.push('/onboarding/certificate')}
          />
          {state.certificateStatus ? (
            <StateBadge label={ot.certificateStatus(state.certificateStatus)} tone="neutral" />
          ) : null}
          {state.certificateSafeReason ? (
            <AppText style={styles.hint}>{state.certificateSafeReason}</AppText>
          ) : null}
        </BrandCard>

        {canAppeal(workerState) ? (
          <BrandCard style={styles.card}>
            <AppText style={styles.sectionTitle}>{ot.text('appealTitle')}</AppText>
            <AppText style={styles.hint}>{ot.text('appealIntro')}</AppText>
            <BrandTextField
              label={ot.text('appealStatement')}
              value={appeal}
              onChangeText={setAppeal}
              multiline
              error={appeal.length > 0 && appeal.trim().length < 10 ? ot.text('appealTooShort') : undefined}
            />
            <BrandButton
              label={ot.text('appealSubmit')}
              loading={busy}
              disabled={busy || appeal.trim().length < 10}
              onPress={() => void run(
                () => onboarding.submitAppeal(appeal.trim()),
                ot.text('appealSubmitted'),
              )}
            />
          </BrandCard>
        ) : null}

        {/* A pending application never removes the ability to book a plumber. */}
        <BrandCard style={styles.card}>
          <AppText style={styles.sectionTitle}>{ot.text('workerHomeBookAsCustomer')}</AppText>
          <AppText style={styles.hint}>{ot.text('workerHomeCustomerModeHint')}</AppText>
          <BrandButton
            label={ot.text('workerHomeBookAsCustomer')}
            variant="secondary"
            onPress={() => router.push('/(tabs)')}
          />
        </BrandCard>

        <BrandButton
          label={ot.text('workerHomeSupport')}
          variant="ghost"
          onPress={() => router.push('/help')}
        />

        {notice ? <AppText accessibilityRole="alert" style={styles.notice}>{notice}</AppText> : null}
        {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { padding: spacing.xl, gap: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: typography.bold, color: colors.textPrimary },
  sectionTitle: { fontSize: 16, fontWeight: typography.semibold, color: colors.textPrimary },
  hint: { color: colors.textSecondary },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  card: { gap: spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  stepLabel: { flex: 1, color: colors.textSecondary },
  error: { color: colors.errorText },
  notice: { color: colors.successText },
});
