import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingMark, BrandLockup } from '@/components/warsha/BrandMark';
import { BrandButton } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { authOutcomeText } from '@/src/auth/auth-outcome-copy';
import {
  confirmationFailurePresentation,
  type AuthRecoveryAction,
} from '@/src/auth/email-confirmation';
import { useLocalization } from '@/src/i18n/localization';

const routeForAction: Record<AuthRecoveryAction, '/sign-in' | '/forgot-password' | '/resend-confirmation' | '/create-account'> = {
  sign_in: '/sign-in',
  forgot_password: '/forgot-password',
  resend_confirmation: '/resend-confirmation',
  create_account: '/create-account',
  retry: '/resend-confirmation',
};

const keyForAction: Record<AuthRecoveryAction, 'signInAction' | 'forgotPasswordAction' | 'resendConfirmationAction' | 'createAccountAction' | 'retryAction'> = {
  sign_in: 'signInAction',
  forgot_password: 'forgotPasswordAction',
  resend_confirmation: 'resendConfirmationAction',
  create_account: 'createAccountAction',
  retry: 'retryAction',
};

export default function ConfirmCustomerEmail() {
  const styles = useThemedStyles(makeStyles);
  const auth = useAuth();
  const { language } = useLocalization();
  const text = (key: Parameters<typeof authOutcomeText>[1]) => authOutcomeText(language, key);
  const outcome = auth.emailConfirmationOutcome;
  const processing = outcome.status === 'checking' || outcome.status === 'processing';
  const complete = outcome.status === 'ready' && Boolean(auth.session);
  const presentation = !processing && !complete
    ? confirmationFailurePresentation(outcome.status === 'failed' ? outcome.failure : 'invalid')
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <BrandLockup size={54} />
        {processing ? <BrandLoadingMark size={50} /> : null}
        <AppText accessibilityRole="header" style={styles.title}>
          {processing
            ? text('confirmationProcessingTitle')
            : complete
              ? text('confirmationCompleteTitle')
              : text(presentation!.titleKey)}
        </AppText>
        <AppText accessibilityRole={complete ? undefined : 'alert'} style={styles.body}>
          {processing
            ? text('confirmationProcessingBody')
            : complete
              ? text('confirmationCompleteBody')
              : text(presentation!.bodyKey)}
        </AppText>
        {complete ? (
          <BrandButton
            label={text('continueAction')}
            onPress={() => router.replace('/')}
          />
        ) : null}
        {presentation?.actions.map((action, index) => (
          <BrandButton
            key={action}
            label={text(keyForAction[action])}
            variant={index === 0 ? 'primary' : index === 1 ? 'secondary' : 'ghost'}
            onPress={() => router.replace(routeForAction[action])}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: typography.bold,
    textAlign: 'center',
  },
  body: {
    maxWidth: 440,
    color: colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },
});
