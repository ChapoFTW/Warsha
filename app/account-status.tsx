import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandLoadingState, BrandTextField } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import {
  accountHasRestriction,
  appealStatementIsValid,
  type AccountTrustStatus,
} from '@/src/account-standing/account-restriction';
import { trustRepository } from '@/src/account-standing/trust-repository';
import { useTrustText, type TrustCopyKey } from '@/src/account-standing/trust-translations';

/**
 * What a restriction on this account means, and the way to appeal it.
 *
 * The server enforces restrictions (202609170006); this screen only tells the
 * person, from `get_my_trust_status`. Whatever the restriction, the account,
 * this screen, support and privacy stay reachable. The appeal goes through
 * `submit_trust_appeal` against the action the status names; the server
 * accepts one per action.
 */
export default function AccountStatusScreen() {
  const styles = useThemedStyles(makeStyles);
  const tt = useTrustText();
  const { language } = useLocalization();
  const [status, setStatus] = useState<AccountTrustStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);
  const [appealFailed, setAppealFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try { setStatus(await trustRepository.status()); }
    catch { setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const appeal = async () => {
    if (!status?.appealableActionId || !appealStatementIsValid(statement) || busy) return;
    setBusy(true);
    setAppealFailed(false);
    try {
      await trustRepository.appeal(status.appealableActionId, statement);
      setStatement('');
      await load();
    } catch {
      setAppealFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const until = status?.restrictionExpiresAt
    ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : language === 'fr' ? 'fr-EG' : 'en-EG',
      { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(status.restrictionExpiresAt))
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={tt('title')} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {failed ? (
          <BrandCard style={styles.card}>
            <AppText accessibilityRole="alert" style={styles.error}>{tt('loadFailed')}</AppText>
            <BrandButton label={tt('retry')} variant="secondary" onPress={() => void load()} />
          </BrandCard>
        ) : !status ? (
          <BrandLoadingState label={tt('title')} />
        ) : !accountHasRestriction(status) ? (
          <BrandCard style={styles.card}>
            <AppText style={styles.lead}>{tt('goodStanding')}</AppText>
          </BrandCard>
        ) : (
          <BrandCard style={styles.card}>
            {status.restriction !== 'none' ? (
              <AppText style={styles.lead}>{tt(status.restriction as TrustCopyKey)}</AppText>
            ) : null}
            {status.communicationRestricted ? <AppText style={styles.body}>{tt('communication')}</AppText> : null}
            {status.reviewRestricted ? <AppText style={styles.body}>{tt('reviews')}</AppText> : null}
            {status.publicReason ? (
              <View style={styles.fact}>
                <AppText style={styles.factLabel}>{tt('reason')}</AppText>
                <AppText style={styles.body}>{status.publicReason}</AppText>
              </View>
            ) : null}
            {until ? (
              <View style={styles.fact}>
                <AppText style={styles.factLabel}>{tt('until')}</AppText>
                <AppText style={styles.body}>{until}</AppText>
              </View>
            ) : null}

            {status.appeal ? (
              <View style={styles.fact}>
                <AppText accessibilityLiveRegion="polite" style={styles.body}>
                  {tt(`appeal_${status.appeal.status}` as TrustCopyKey) ?? tt('appeal_submitted')}
                </AppText>
                {status.appeal.decisionNote ? <AppText style={styles.body}>{status.appeal.decisionNote}</AppText> : null}
              </View>
            ) : status.canAppeal ? (
              <View style={styles.fact}>
                <BrandTextField
                  label={tt('appealLabel')}
                  helper={tt('appealHint')}
                  value={statement}
                  onChangeText={setStatement}
                  maxLength={2000}
                  multiline
                  editable={!busy}
                />
                {appealFailed ? (
                  <AppText accessibilityRole="alert" style={styles.error}>{tt('appealFailed')}</AppText>
                ) : null}
                <BrandButton
                  label={tt('appealSend')}
                  loading={busy}
                  disabled={busy || !appealStatementIsValid(statement)}
                  onPress={() => void appeal()}
                />
              </View>
            ) : null}
          </BrandCard>
        )}

        <BrandCard style={styles.card}>
          <AppText style={styles.body}>{tt('support')}</AppText>
          <BrandButton label={tt('supportLink')} variant="secondary" onPress={() => router.push('/support')} />
        </BrandCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  card: { gap: spacing.md },
  lead: { ...typography.body, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  fact: { gap: spacing.xs },
  factLabel: { fontSize: 13, color: colors.textMuted },
  error: { color: colors.errorText },
});
