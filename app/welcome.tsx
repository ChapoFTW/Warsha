import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { BrandLockup } from '@/components/warsha/BrandMark';
import { BrandButton } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { authMessageKey } from '@/src/auth/auth-errors';
import { useLocalization } from '@/src/i18n/localization';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';

/**
 * The signed-out gateway. This is the first Warsha screen anybody sees.
 *
 * It used to open with "Welcome to Warsha" and "Sign in to book a service, or
 * create an account to get started" — a greeting and an instruction, which
 * between them said nothing about what Warsha is or why a stranger should be
 * let into your home. The primary button was Sign in, which is the one action a
 * first-time visitor cannot take.
 *
 * So it now leads with what Warsha does, gives two reasons to believe it, and
 * makes starting the primary action:
 *
 *   headline   the value proposition, verbatim from web/lib/copy.ts, because
 *              the marketing site and the app must not disagree about what this
 *              service is
 *   trust      two lines, each an icon and a short clause: workers are identity
 *              checked, and the price is agreed before work starts. Both are
 *              true, both are Warsha's actual differentiators, and neither
 *              appeared anywhere before a person had already committed
 *   primary    Get started, which goes to the role choice
 *   secondary  I already have an account
 *
 * Deliberately not a carousel and deliberately short. A person deciding whether
 * to try a service does not read three screens first, and every extra sentence
 * here is one more thing between them and the thing they came to do.
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
  const colors = useThemeColors();
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
            {ot.text('gatewayHeadline')}
          </AppText>
        </View>

        {/* Two reasons to believe it, each readable at a glance. The icon is
            support for the sentence, never a replacement for it: nothing here
            is carried by the icon alone. */}
        <View style={styles.trust}>
          {([
            ['verified-user', ot.text('gatewayTrustChecked')],
            ['handshake', ot.text('gatewayTrustPrice')],
          ] as const).map(([icon, label]) => (
            <View key={icon} style={[styles.trustRow, isRTL && styles.reverse]}>
              <MaterialIcons name={icon} size={20} color={colors.textPrimary} />
              <AppText style={styles.trustText}>{label}</AppText>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <BrandButton
            label={ot.text('gatewayGetStarted')}
            accessibilityLabel={ot.text('gatewayGetStarted')}
            onPress={() => router.push('/create-account')}
          />
          <BrandButton
            label={ot.text('gatewayHaveAccount')}
            variant="secondary"
            accessibilityLabel={ot.text('gatewayHaveAccount')}
            loading={signingIn}
            onPress={() => void openSignIn()}
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
  trust: { width: '100%', maxWidth: 420, gap: spacing.sm },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trustText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  title: { fontSize: 28, fontWeight: typography.bold, textAlign: 'center', color: colors.textPrimary },
  subtitle: { textAlign: 'center', color: colors.textSecondary },
  error: { textAlign: 'center', color: colors.errorText, maxWidth: 420 },
  actions: { width: '100%', maxWidth: 420, gap: spacing.md },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  reverse: { flexDirection: 'row-reverse' },
});
