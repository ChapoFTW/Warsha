import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { authMessageKey } from '@/src/auth/auth-errors';
import { isValidCustomerEmail } from '@/src/auth/auth-identifier';
import { authOutcomeText } from '@/src/auth/auth-outcome-copy';
import { useLocalization } from '@/src/i18n/localization';

import { BrandLockup } from './BrandMark';
import { BrandButton, BrandTextField } from './BrandUI';
import { AppText } from './Typography';

export function EmailAuthRequestScreen({ kind }: { kind: 'password_reset' | 'confirmation' }) {
  const styles = useThemedStyles(makeStyles);
  const auth = useAuth();
  const { language, t } = useLocalization();
  const text = (key: Parameters<typeof authOutcomeText>[1]) => authOutcomeText(language, key);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    if (busy || !isValidCustomerEmail(email)) return;
    setBusy(true);
    setMessage('');
    try {
      if (kind === 'confirmation') await auth.requestEmailConfirmation(email.trim());
      else await auth.requestPasswordReset(email.trim());
      setSent(true);
    } catch (error) {
      setMessage(t(authMessageKey(error)));
    } finally {
      setBusy(false);
    }
  };

  const title = kind === 'confirmation' ? 'resendTitle' : 'forgotTitle';
  const body = kind === 'confirmation' ? 'resendBody' : 'forgotBody';
  const sentTitle = kind === 'confirmation' ? 'resendSentTitle' : 'forgotSentTitle';
  const sentBody = kind === 'confirmation' ? 'resendSentBody' : 'forgotSentBody';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
        <BrandLockup size={52} />
        <AppText accessibilityRole="header" style={styles.title}>{text(sent ? sentTitle : title)}</AppText>
        <AppText style={styles.body}>{text(sent ? sentBody : body)}</AppText>
        {!sent ? (
          <View style={styles.form}>
            <BrandTextField
              label={text('emailLabel')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              editable={!busy}
            />
            {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
            <BrandButton
              label={busy ? text('loading') : text('sendAction')}
              loading={busy}
              disabled={busy || !isValidCustomerEmail(email)}
              onPress={() => void submit()}
            />
          </View>
        ) : null}
        <BrandButton
          label={text('backToSignInAction')}
          variant={sent ? 'primary' : 'ghost'}
          onPress={() => router.replace('/sign-in')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: { maxWidth: 440, color: colors.textPrimary, fontSize: 27, fontWeight: typography.bold, textAlign: 'center' },
  body: { maxWidth: 440, color: colors.textSecondary, lineHeight: 22, textAlign: 'center' },
  form: { width: '100%', maxWidth: 420, gap: spacing.md },
  error: { color: colors.errorText, textAlign: 'center' },
});
