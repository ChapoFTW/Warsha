import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingMark, BrandLockup } from '@/components/warsha/BrandMark';
import { BrandButton } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { useAuthText } from '@/src/auth/auth-translations';

export default function ConfirmCustomerEmail() {
  const styles = useThemedStyles(makeStyles);
  const auth = useAuth();
  const at = useAuthText();
  const processing = auth.emailConfirmationStatus === 'checking'
    || auth.emailConfirmationStatus === 'processing';
  const complete = auth.emailConfirmationStatus === 'ready' && Boolean(auth.session);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <BrandLockup size={54} />
        {processing || complete ? <BrandLoadingMark size={50} /> : null}
        <AppText accessibilityRole="header" style={styles.title}>
          {at(processing
            ? 'confirmationProcessingTitle'
            : complete
              ? 'confirmationCompleteTitle'
              : 'confirmationInvalidTitle')}
        </AppText>
        <AppText accessibilityRole={complete ? undefined : 'alert'} style={styles.body}>
          {at(processing
            ? 'confirmationProcessingBody'
            : complete
              ? 'confirmationCompleteBody'
              : 'confirmationInvalidBody')}
        </AppText>
        {!processing && !complete ? (
          <BrandButton
            label={at('confirmationReturnToSignIn')}
            onPress={() => router.replace('/sign-in')}
          />
        ) : null}
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
