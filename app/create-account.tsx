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
import { useAuthText } from '@/src/auth/auth-translations';
import { isValidPhone, normalizePhone } from '@/src/auth/phone-auth';
import { useLocalization } from '@/src/i18n/localization';
import { useOnboarding } from '@/src/onboarding/onboarding-context';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';
import type { AccountRoleChoice } from '@/src/onboarding/onboarding-types';

/**
 * Account creation begins with the role question, and the role is a real
 * choice rather than a default with a switch beside it.
 *
 * The important honesty here: choosing Worker starts an application. It does
 * not make anybody a worker, and the hint under the option says so before the
 * choice is made rather than after. The server records the choice; nothing
 * about the client's selection grants a privilege.
 */
export default function CreateAccount() {
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL, language } = useLocalization();
  const at = useAuthText();
  const ot = useOnboardingText();
  const auth = useAuth();
  const onboarding = useOnboarding();

  const [role, setRole] = useState<AccountRoleChoice | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');

  const openSignIn = async () => {
    setBusy(true);
    setMessage('');
    try {
      // Role selection can be visible for an authenticated but incomplete
      // account. An explicit sign-in action means switch accounts; retaining
      // that session would make AuthGate return here immediately.
      if (auth.user) await auth.signOut();
      router.replace('/sign-in');
    } catch (error) {
      setMessage(t(authMessageKey(error)));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Customers register with name, email, password and phone. Workers register
   * with name, phone and password; the trusted broker owns the hidden Auth
   * identity and no worker email confirmation exists.
   *
   * The phone number is REQUIRED and validated, and it is not verified. Warsha
   * needs to be able to reach a customer whose worker is at the door and a
   * worker whose job has moved — that is a contact detail, and it is collected
   * as one. Proving the handset is a separate, explicit action that does not
   * stand between somebody and an account.
   */
  const createAccount = async (choice: AccountRoleChoice) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await auth.signUp(
        name.trim(), choice === 'worker' ? null : email.trim(), password, phone,
        choice === 'worker' ? 'provider' : 'customer', language,
      );
      if (choice === 'customer' && result.needsEmailConfirmation) {
        // Supabase may return an obfuscated user for an existing address, so
        // this branch cannot prove account creation, sending, or delivery.
        setNotice(at('customerConfirmationPending'));
        return;
      }
      // The role is recorded server-side. The client's choice is an input to
      // that call, never the authority for it.
      const roleRecorded = await onboarding.selectRole(choice, result.accountId ?? undefined);
      if (!roleRecorded) throw new Error('Unable to record the account role.');
    } catch (error) {
      setMessage(t(authMessageKey(error)));
    } finally {
      setBusy(false);
    }
  };

  if (!role) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.page}>
          <BrandLockup size={48} />
          <AppText accessibilityRole="header" style={styles.title}>
            {ot.text('roleQuestion')}
          </AppText>

          <View style={styles.options} accessibilityRole="radiogroup">
            {(['customer', 'worker'] as AccountRoleChoice[]).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected: false, checked: false }}
                accessibilityLabel={`${ot.text(option === 'customer' ? 'roleCustomer' : 'roleWorker')}. ${
                  ot.text(option === 'customer' ? 'roleCustomerHint' : 'roleWorkerHint')}`}
                accessibilityHint={ot.text('a11yRoleNotSelected')}
                onPress={() => setRole(option)}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
                <AppText style={styles.optionTitle}>
                  {ot.text(option === 'customer' ? 'roleCustomer' : 'roleWorker')}
                </AppText>
                <AppText style={styles.optionHint}>
                  {ot.text(option === 'customer' ? 'roleCustomerHint' : 'roleWorkerHint')}
                </AppText>
              </Pressable>
            ))}
          </View>

          <AppText style={styles.note}>{ot.text('roleBothNote')}</AppText>

          <BrandButton
            label={ot.text('signIn')}
            variant="ghost"
            loading={busy}
            onPress={() => void openSignIn()}
          />
          {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <BrandLockup size={48} />
        <AppText accessibilityRole="header" style={styles.title}>
          {ot.text(role === 'customer' ? 'roleCustomer' : 'roleWorker')}
        </AppText>

        <View style={styles.form}>
          <BrandTextField
            label={t('fullName')}
            value={name}
            onChangeText={setName}
            textContentType="name"
            style={{ textAlign: isRTL ? 'right' : 'left' }}
          />

          {role === 'customer' ? (
            <BrandTextField
              label={t('email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
            />
          ) : null}
          <BrandTextField
            label={t('password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
          />
          <BrandTextField
            label={at('phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="telephoneNumber"
            helper={at('phoneContactHint')}
          />

          {role === 'worker' ? (
            <>
              <AppText style={styles.note}>{at('workerRegistrationNoEmail')}</AppText>
              <AppText style={styles.note}>{ot.text('roleWorkerHint')}</AppText>
            </>
          ) : null}

          <BrandButton
            label={ot.text('createAccount')}
            loading={busy}
            disabled={
              busy || name.trim().length < 2
              || (role === 'customer' && !email.trim()) || password.length < 6
              || !isValidPhone(normalizePhone(phone))
            }
            onPress={() => void createAccount(role)}
          />
        </View>

        {notice ? <AppText accessibilityRole="alert" style={styles.notice}>{notice}</AppText> : null}
        {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}

        <BrandButton
          label={ot.text('roleQuestion')}
          variant="ghost"
          onPress={() => { setRole(null); setMessage(''); setNotice(''); }}
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
  title: { fontSize: 26, fontWeight: typography.bold, textAlign: 'center', color: colors.textPrimary },
  options: { width: '100%', maxWidth: 420, gap: spacing.md },
  option: {
    minHeight: 88,
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  optionPressed: { backgroundColor: colors.surfacePressed },
  optionTitle: { fontSize: 18, fontWeight: typography.semibold, color: colors.textPrimary },
  optionHint: { color: colors.textSecondary },
  note: { color: colors.textMuted, textAlign: 'center', maxWidth: 420 },
  form: { width: '100%', maxWidth: 420, gap: spacing.md },
  error: { color: colors.errorText, textAlign: 'center', maxWidth: 420 },
  notice: { color: colors.successText, textAlign: 'center', maxWidth: 420 },
});
