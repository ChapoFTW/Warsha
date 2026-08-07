import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLockup } from '@/components/warsha/BrandMark';
import { BrandButton, BrandTextField } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { authMessageKey } from '@/src/auth/auth-errors';
import { useLocalization } from '@/src/i18n/localization';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';

/**
 * Signing in. Email and password, for customers and workers alike.
 *
 * WPS-024 correction. There was a second path here — a phone number and a code
 * sent by SMS — and it could not work: Supabase Phone Auth is disabled and no
 * SMS provider is configured, so every attempt ended at a code that was never
 * sent. A visible path that always fails is worse than no path, because the
 * person blames themselves and tries again.
 *
 * The role switcher went with it. A worker and a customer sign in the same way
 * now, so asking somebody to classify themselves before typing a password was
 * a question with no consequence.
 *
 * Error text comes from `sanitizeAuthError`, which WPS-001 wrote precisely so
 * a failed sign-in cannot be used to discover whether an account exists.
 * Nothing here re-derives a friendlier message from the raw error.
 */
export default function SignIn() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useLocalization();
  const ot = useOnboardingText();
  const auth = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submitEmail = async () => {
    setBusy(true);
    setMessage('');
    try {
      await auth.signIn(email.trim(), password);
    } catch (error) {
      setMessage(t(authMessageKey(error)));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      await auth.requestPasswordReset(email.trim());
      setMessage(t('resetSent'));
    } catch (error) {
      setMessage(t(authMessageKey(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <BrandLockup size={48} />
        <AppText accessibilityRole="header" style={styles.title}>{ot.text('signIn')}</AppText>

        <View style={styles.form}>
          <BrandTextField
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
          />
          <BrandTextField
            label={t('password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
          />
          <BrandButton
            label={ot.text('signIn')}
            loading={busy}
            disabled={busy || !email.trim() || password.length < 6}
            onPress={() => void submitEmail()}
          />
          <BrandButton
            label={t('forgotPassword')}
            variant="ghost"
            disabled={busy || !email.trim()}
            onPress={() => void resetPassword()}
          />
        </View>

        {message ? (
          <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText>
        ) : null}

        <BrandButton
          label={ot.text('createAccount')}
          variant="secondary"
          onPress={() => router.replace('/create-account')}
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
  title: { fontSize: 26, fontWeight: typography.bold, color: colors.textPrimary },
  form: { width: '100%', maxWidth: 420, gap: spacing.md },
  error: { color: colors.errorText, textAlign: 'center', maxWidth: 420 },
});
