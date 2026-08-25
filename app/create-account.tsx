import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLockup } from '@/components/warsha/BrandMark';
import { BrandButton, BrandTextField } from '@/components/warsha/BrandUI';
import { SignupLegalAcceptance } from '@/components/warsha/SignupLegalAcceptance';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { authMessageKey } from '@/src/auth/auth-errors';
import { isValidCustomerEmail } from '@/src/auth/auth-identifier';
import { authOutcomeText } from '@/src/auth/auth-outcome-copy';
import { useAuthText } from '@/src/auth/auth-translations';
import { isValidPhone, normalizePhone } from '@/src/auth/phone-auth';
import { useLocalization } from '@/src/i18n/localization';
import {
  isSignupBusy,
  signupAfterRoleChange,
  signupConfirmationRequired,
  signupErrorKey,
  signupFailed,
  signupIdle,
  signupPendingNotice,
  signupRoleFromMetadata,
  signupSubmitting,
  signupSucceeded,
  type SignupState,
} from '@/src/auth/signup-machine';
import { signupLegalManifest, signupLegalSelectionSatisfied } from '@/src/legal/signup-legal';
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
  const [signup, setSignup] = useState<SignupState>(signupIdle);
  const [commonLegalAccepted, setCommonLegalAccepted] = useState(false);
  const [workerVerificationAccepted, setWorkerVerificationAccepted] = useState(false);

  const busy = isSignupBusy(signup);
  const pendingConfirmation = signupPendingNotice(signup);
  const errorKey = signupErrorKey(signup);
  const recoveryRole = signupRoleFromMetadata(auth.user?.user_metadata);
  const recoveryChoice = recoveryRole
    ?? (onboarding.customerRecoveryEligible ? 'customer' : null);
  const recoveringExistingSignup = Boolean(auth.user && onboarding.route === 'role_choice');

  const chooseRole = (choice: AccountRoleChoice | null) => {
    setRole(choice);
    // Changing the legal audience is a fresh decision. A customer acceptance
    // must never arrive preselected on the worker agreement, or vice versa.
    setCommonLegalAccepted(false);
    setWorkerVerificationAccepted(false);
    // An email belongs to the customer application only. Clearing it here means
    // a worker attempt can never carry a half-typed customer identifier, and a
    // customer returning to the form starts from a stated address.
    setEmail('');
    setSignup(signupAfterRoleChange());
  };

  const openSignIn = async () => {
    setSignup(signupSubmitting());
    try {
      // Role selection can be visible for an authenticated but incomplete
      // account. An explicit sign-in action means switch accounts; retaining
      // that session would make AuthGate return here immediately.
      if (auth.user) await auth.signOut();
      setSignup(signupIdle);
      router.replace('/sign-in');
    } catch (error) {
      setSignup(signupFailed(authMessageKey(error)));
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
    // Submitting discards the previous outcome first, so a stale pending
    // notice can never sit beside a fresh failure.
    setSignup(signupSubmitting());
    try {
      const result = await auth.signUp(
        name.trim(), choice === 'worker' ? null : email.trim(), password, phone,
        choice === 'worker' ? 'provider' : 'customer', language,
        signupLegalManifest(choice, language === 'ar' ? 'ar' : 'en'),
      );
      if (choice === 'customer' && result.needsEmailConfirmation) {
        // Supabase may return an obfuscated user for an existing address, so
        // this branch cannot prove account creation, sending, or delivery.
        setSignup(signupConfirmationRequired());
        return;
      }
      // The role is recorded server-side. The client's choice is an input to
      // that call, never the authority for it.
      const roleRecorded = await onboarding.selectRole(choice, result.accountId ?? undefined);
      if (!roleRecorded) throw new Error('Unable to record the account role.');
      setSignup(signupSucceeded());
    } catch (error) {
      setSignup(signupFailed(authMessageKey(error)));
    }
  };

  const retryAccountState = async () => {
    setSignup(signupSubmitting());
    await onboarding.reload();
    setSignup(signupIdle);
  };

  const resumeExistingSignup = async (choice: AccountRoleChoice) => {
    if (!auth.user) return;
    setSignup(signupSubmitting());
    const recorded = recoveryRole
      ? await onboarding.selectRole(choice, auth.user.id)
      : choice === 'customer'
        ? await onboarding.resumeCustomerSetup(auth.user.id)
        : false;
    setSignup(recorded ? signupSucceeded() : signupFailed('authError'));
  };

  // A session may exist when canonical signup was interrupted after Auth but
  // before the idempotent role RPC. Never show another credential form in that
  // state: it would ask the signed-in person to create a second identity. The
  // original metadata can resume its own role selection; a historical/manual
  // identity with no signup marker gets a safe recovery surface instead.
  if (recoveringExistingSignup) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.recovery}>
          <BrandLockup size={48} />
          <AppText accessibilityRole="header" style={styles.title}>
            {ot.text('accountSetupIncomplete')}
          </AppText>
          <AppText style={styles.note}>
            {ot.text(
              recoveryRole
                ? 'accountSetupResume'
                : recoveryChoice === 'customer'
                  ? 'accountSetupCustomerRecovery'
                  : 'accountSetupUnavailable',
            )}
          </AppText>
          {recoveryChoice ? (
            <>
              <AppText style={styles.optionTitle}>
                {ot.text(recoveryChoice === 'worker' ? 'roleWorker' : 'roleCustomer')}
              </AppText>
              <BrandButton
                label={ot.text(
                  recoveryRole ? 'roleContinue' : 'accountSetupCustomerRecoveryAction',
                )}
                loading={busy}
                onPress={() => void resumeExistingSignup(recoveryChoice)}
              />
            </>
          ) : (
            <BrandButton
              label={t('tryAgain')}
              loading={busy}
              onPress={() => void retryAccountState()}
            />
          )}
          <BrandButton
            label={t('signOut')}
            variant="ghost"
            disabled={busy}
            onPress={() => void openSignIn()}
          />
          {errorKey ? (
            <AppText accessibilityRole="alert" style={styles.error}>{t(errorKey)}</AppText>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

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
                onPress={() => chooseRole(option)}
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
          {errorKey ? (
            <AppText accessibilityRole="alert" style={styles.error}>{t(errorKey)}</AppText>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled">
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

          <SignupLegalAcceptance
            role={role}
            commonAccepted={commonLegalAccepted}
            workerVerificationAccepted={workerVerificationAccepted}
            disabled={busy}
            onCommonAcceptedChange={setCommonLegalAccepted}
            onWorkerVerificationAcceptedChange={setWorkerVerificationAccepted}
          />

          <BrandButton
            label={ot.text('createAccount')}
            loading={busy}
            disabled={
              busy || name.trim().length < 2
              || (role === 'customer' && !isValidCustomerEmail(email)) || password.length < 6
              || !isValidPhone(normalizePhone(phone))
              || !signupLegalSelectionSatisfied(
                role,
                commonLegalAccepted,
                workerVerificationAccepted,
              )
            }
            onPress={() => void createAccount(role)}
          />
        </View>

        {/* One result, one element. These are branches of a single value, so
            a pending notice and a failure cannot both be on screen. */}
        {pendingConfirmation ? (
          <View style={styles.pendingCard}>
            <AppText accessibilityRole="header" style={styles.pendingTitle}>
              {authOutcomeText(language, 'confirmationPendingTitle')}
            </AppText>
            <AppText accessibilityRole="alert" style={styles.notice}>
              {authOutcomeText(language, 'confirmationPendingBody')}
            </AppText>
            <BrandButton
              label={authOutcomeText(language, 'signInAction')}
              onPress={() => router.replace('/sign-in')}
            />
            <BrandButton
              label={authOutcomeText(language, 'forgotPasswordAction')}
              variant="secondary"
              onPress={() => router.replace('/forgot-password')}
            />
            <BrandButton
              label={authOutcomeText(language, 'resendConfirmationAction')}
              variant="ghost"
              onPress={() => router.replace('/resend-confirmation')}
            />
          </View>
        ) : errorKey ? (
          <AppText accessibilityRole="alert" style={styles.error}>{t(errorKey)}</AppText>
        ) : null}

        <BrandButton
          label={ot.text('roleQuestion')}
          variant="ghost"
          onPress={() => chooseRole(null)}
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
  recovery: {
    flex: 1,
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
  pendingCard: { width: '100%', maxWidth: 420, gap: spacing.md },
  pendingTitle: { fontSize: 20, fontWeight: typography.bold, textAlign: 'center', color: colors.textPrimary },
});
