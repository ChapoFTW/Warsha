import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLockup } from '@/components/warsha/BrandMark';
import { BrandButton } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { authMessageKey } from '@/src/auth/auth-errors';
import { useLocalization } from '@/src/i18n/localization';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';

/**
 * The signed-out gateway. This is the first Warsha screen anybody sees.
 *
 * The brand lockup carries the motto in the active language, and it appears
 * once. A privacy or sign-in screen repeating "YOUR WORK, OUR MISSION" three
 * times turns a promise into decoration.
 *
 * Help, Privacy and Terms are local, static screens rather than the signed-in
 * Help Center. That is deliberate: the Help Center's content requires an
 * authenticated read, and opening an anonymous route to serve three links on
 * this screen would widen the signed-out surface WPS-023 exists to narrow.
 */
export default function Welcome() {
  const styles = useThemedStyles(makeStyles);
  const { isRTL, t } = useLocalization();
  const ot = useOnboardingText();
  const auth = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [message, setMessage] = useState('');

  const openSignIn = async () => {
    setSigningIn(true);
    setMessage('');
    try {
      // A blocked or role-incomplete account can legitimately be routed to
      // this public-looking gateway while its Supabase session still exists.
      // "Sign in" is explicit account-switch intent, so end that session
      // before entering the public form; otherwise AuthGate correctly sends
      // the authenticated account straight back here.
      if (auth.user) await auth.signOut();
      router.replace('/sign-in');
    } catch (error) {
      setMessage(t(authMessageKey(error)));
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {/* The lockup is never mirrored. RTL changes the reading order of the
            page, not the geometry of the mark. */}
        <BrandLockup size={64} />

        <View style={styles.intro}>
          <AppText accessibilityRole="header" style={styles.title}>
            {ot.text('gatewayWelcome')}
          </AppText>
          <AppText style={styles.subtitle}>{ot.text('gatewayIntro')}</AppText>
        </View>

        <View style={styles.actions}>
          <BrandButton
            label={ot.text('signIn')}
            accessibilityLabel={ot.text('signIn')}
            loading={signingIn}
            onPress={() => void openSignIn()}
          />
          <BrandButton
            label={ot.text('createAccount')}
            variant="secondary"
            accessibilityLabel={ot.text('createAccount')}
            onPress={() => router.push('/create-account')}
          />
        </View>

        {message ? <AppText accessibilityRole="alert" style={styles.error}>{message}</AppText> : null}

        <View style={[styles.links, isRTL && styles.reverse]}>
          <BrandButton
            label={ot.text('gatewayHelp')}
            variant="ghost"
            accessibilityLabel={ot.text('gatewayHelp')}
            onPress={() => router.push('/legal/help')}
          />
          <BrandButton
            label={ot.text('gatewayPrivacy')}
            variant="ghost"
            accessibilityLabel={ot.text('gatewayPrivacy')}
            onPress={() => router.push('/legal/privacy')}
          />
          <BrandButton
            label={ot.text('gatewayTerms')}
            variant="ghost"
            accessibilityLabel={ot.text('gatewayTerms')}
            onPress={() => router.push('/legal/terms')}
          />
        </View>
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
    gap: spacing.xl,
  },
  intro: { gap: spacing.sm, maxWidth: 520 },
  title: { fontSize: 28, fontWeight: typography.bold, textAlign: 'center', color: colors.textPrimary },
  subtitle: { textAlign: 'center', color: colors.textSecondary },
  error: { textAlign: 'center', color: colors.errorText, maxWidth: 420 },
  actions: { width: '100%', maxWidth: 420, gap: spacing.md },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  reverse: { flexDirection: 'row-reverse' },
});
