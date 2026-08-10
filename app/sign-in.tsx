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
 * The visible account-mode selector changes labels, keyboard, validation and
 * recovery affordances; it never changes an account role or server authority.
 * People therefore choose the identity they actually have without learning
 * about the worker's synthetic internal email.
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

  const [mode, setMode] = useState<'customer' | 'worker'>('customer');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    const identity = classifySignInIdentity(identifier);
    if (
      !identity
      || mode === 'customer' && identity.kind !== 'customer_email'
      || mode === 'worker' && identity.kind !== 'worker_phone'
    ) {
      setMessage(t('authInvalidCredentials'));
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
    if (mode !== 'customer') return;
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
          <View accessibilityRole="radiogroup" style={styles.modeGroup}>
            {(['customer', 'worker'] as const).map(option => {
              const selected = mode === option;
              const label = at(option === 'customer' ? 'customerAccount' : 'workerAccount');
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: selected, selected }}
                  onPress={() => {
                    setMode(option);
                    setIdentifier('');
                    setMessage('');
                  }}
                  style={[styles.modeOption, selected && styles.modeOptionSelected]}>
                  <AppText style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{label}</AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText style={styles.modeHelp}>
            {at(mode === 'customer' ? 'customerSignInHint' : 'workerSignInHint')}
          </AppText>
          <BrandTextField
            label={at(mode === 'customer' ? 'customerEmail' : 'workerPhone')}
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType={mode === 'customer' ? 'email-address' : 'phone-pad'}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={mode === 'customer' ? 'emailAddress' : 'telephoneNumber'}
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
            disabled={
              busy
              || password.length < 6
              || (mode === 'customer'
                ? classifySignInIdentity(identifier)?.kind !== 'customer_email'
                : classifySignInIdentity(identifier)?.kind !== 'worker_phone')
            }
            onPress={() => void submit()}
          />
          {mode === 'customer' && classifySignInIdentity(identifier)?.kind === 'customer_email' ? (
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
  modeGroup: {
    flexDirection: 'row',
    padding: spacing.xs,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  modeOption: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  modeOptionSelected: { backgroundColor: colors.surfaceSelected },
  modeLabel: { color: colors.textSecondary, fontWeight: typography.semibold },
  modeLabelSelected: { color: colors.textPrimary },
  modeHelp: { color: colors.textSecondary, lineHeight: 21 },
  error: { color: colors.errorText, textAlign: 'center', maxWidth: 420 },
});
