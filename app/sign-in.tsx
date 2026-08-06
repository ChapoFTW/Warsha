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
import { useAuthText } from '@/src/auth/auth-translations';
import { isValidPhone, isValidSmsOtp, normalizePhone } from '@/src/auth/phone-auth';
import { useLocalization } from '@/src/i18n/localization';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';

/**
 * Signing in. Both paths WPS-001 established are preserved: email and password
 * for customers, phone and a one-time code for workers.
 *
 * Error text comes from `sanitizeAuthError`, which WPS-001 wrote precisely so
 * a failed sign-in cannot be used to discover whether an account exists.
 * Nothing here re-derives a friendlier message from the raw error.
 */
export default function SignIn() {
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL } = useLocalization();
  const at = useAuthText();
  const ot = useOnboardingText();
  const auth = useAuth();

  const [path, setPath] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
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

  const submitPhone = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (otpSent) {
        await auth.verifyWorkerOtp(phone, otp, false, '');
      } else {
        await auth.requestWorkerOtp(phone, false, '');
        setOtpSent(true);
      }
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

        <View style={[styles.switcher, isRTL && styles.reverse]}>
          <BrandButton
            label={at('customerAccount')}
            variant={path === 'email' ? 'primary' : 'ghost'}
            accessibilityState={{ selected: path === 'email' }}
            onPress={() => { setPath('email'); setMessage(''); }}
            style={styles.switchOption}
          />
          <BrandButton
            label={at('workerAccount')}
            variant={path === 'phone' ? 'primary' : 'ghost'}
            accessibilityState={{ selected: path === 'phone' }}
            onPress={() => { setPath('phone'); setMessage(''); setOtpSent(false); }}
            style={styles.switchOption}
          />
        </View>

        {path === 'email' ? (
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
        ) : (
          <View style={styles.form}>
            <BrandTextField
              label={at('phone')}
              value={phone}
              onChangeText={(value) => { setPhone(value); setOtpSent(false); }}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              helper={at('phoneHint')}
            />
            {otpSent ? (
              <BrandTextField
                label={at('otp')}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
              />
            ) : null}
            <BrandButton
              label={at(otpSent ? 'verifyOtp' : 'sendOtp')}
              loading={busy}
              disabled={busy || (otpSent ? !isValidSmsOtp(otp) : !isValidPhone(normalizePhone(phone)))}
              onPress={() => void submitPhone()}
            />
          </View>
        )}

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
  switcher: { flexDirection: 'row', gap: spacing.xs, width: '100%', maxWidth: 420 },
  reverse: { flexDirection: 'row-reverse' },
  switchOption: { flex: 1 },
  form: { width: '100%', maxWidth: 420, gap: spacing.md },
  error: { color: colors.errorText, textAlign: 'center', maxWidth: 420 },
});
