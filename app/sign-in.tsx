import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLockup } from '@/components/warsha/BrandMark';
import { BrandButton, BrandTextField } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { authMessageKey } from '@/src/auth/auth-errors';
import { classifySignInIdentity } from '@/src/auth/auth-identifier';
import { useAuthText } from '@/src/auth/auth-translations';
import { useLocalization } from '@/src/i18n/localization';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';

/**
 * Customers sign in with email and password. Workers sign in with their
 * contact phone and password; the trusted auth broker resolves that phone to
 * an opaque internal email/password identity without exposing it here.
 *
 * WPS-024 correction. There was a second path here — a phone number and a code
 * sent by SMS — and it could not work: Supabase Phone Auth is disabled and no
 * SMS provider is configured, so every attempt ended at a code that was never
 * sent. A visible path that always fails is worse than no path, because the
 * person blames themselves and tries again.
 *
 * There is no account-type selector, and removing it fixed a real failure:
 * the selector cross-checked the identifier against a self-declared role, so a
 * worker who left it on Customer and typed their phone number was told their
 * credentials were invalid. They were not — the form was.
 *
 * Nobody is asked what kind of account they have. `classifySignInIdentity`
 * reads the shape of what was typed and `auth.signIn` routes on that alone:
 * an email goes to Supabase password auth, a phone to the trusted worker
 * broker. The product role is resolved after authentication, from server
 * state, by the same route authority the rest of the app uses.
 *
 * Error text comes from `sanitizeAuthError`, which WPS-001 wrote precisely so
 * a failed sign-in cannot be used to discover whether an account exists.
 * Nothing here re-derives a friendlier message from the raw error.
 */
export default function SignIn() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useLocalization();
  const ot = useOnboardingText();
  const at = useAuthText();
  const auth = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    // The identifier decides the authentication path. A person who registered
    // with a phone types a phone; nobody has to know that this routes through
    // the worker broker, or that it corresponds to a product role at all.
    if (!classifySignInIdentity(identifier)) {
      setMessage(at('signInIdentityInvalid'));
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await auth.signIn(identifier.trim(), password);
    } catch (error) {
      setMessage(t(authMessageKey(error)));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    const identity = classifySignInIdentity(identifier);
    if (identity?.kind !== 'customer_email') return;
    setBusy(true);
    setMessage('');
    try {
      await auth.requestPasswordReset(identity.email);
      setMessage(t('resetSent'));
    } catch (error) {
      setMessage(t(authMessageKey(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled">
        <BrandLockup size={48} />
        <AppText accessibilityRole="header" style={styles.title}>{ot.text('signIn')}</AppText>

        <View style={styles.form}>
          <AppText style={styles.modeHelp}>{at('signInIdentityHint')}</AppText>
          <BrandTextField
            label={at('signInIdentity')}
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
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
            disabled={busy || password.length < 6 || !classifySignInIdentity(identifier)}
            onPress={() => void submit()}
          />
          {classifySignInIdentity(identifier)?.kind === 'customer_email' ? (
            <BrandButton
              label={t('forgotPassword')}
              variant="ghost"
              disabled={busy}
              onPress={() => void resetPassword()}
            />
          ) : null}
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
  modeHelp: { color: colors.textSecondary, lineHeight: 21 },
  error: { color: colors.errorText, textAlign: 'center', maxWidth: 420 },
});
