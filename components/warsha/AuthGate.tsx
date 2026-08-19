import { usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';

import { BrandLoadingMark } from '@/components/warsha/BrandMark';
import { BrandButton } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { useLocalization } from '@/src/i18n/localization';
import {
  defaultModeFor,
  routeAfterHydration,
} from '@/src/navigation/worker-route-policy';
import { startupRouteDecision } from '@/src/navigation/startup-route-policy';
import { useLegal } from '@/src/legal/legal-context';
import { useOnboarding } from '@/src/onboarding/onboarding-context';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';
import { useProviderFoundation } from '@/src/providers/provider-context';

/**
 * WPS-023 authentication-first entry.
 *
 * The whole point of this component is what it renders BEFORE it knows the
 * answer: a neutral, branded canvas that looks like nothing in particular.
 *
 * The obvious alternative — render the app and redirect once the session
 * resolves — is what Warsha did until now, and it is why the app opened onto
 * the customer home while signed out. A redirect that arrives one frame late
 * has already shown somebody a screen they should not have seen, and on a slow
 * connection "one frame" can be a second of a stranger's home screen.
 *
 * So: nothing operational renders until `ready`. The loading state is
 * deliberately not a fake signed-in shell — no tab bar, no skeleton cards, no
 * placeholder greeting. A loading screen that impersonates the app is a
 * loading screen that lies about whether you are signed in.
 *
 * Client-side routing is NOT an authorization boundary and nothing here
 * pretends otherwise. Every operation this gate steers around is independently
 * refused by RLS, a capability check, or `private.require_active_worker`. This
 * exists so people see the right screen, not so the server can trust them.
 */

export function AuthGate({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const ot = useOnboardingText();
  const { t } = useLocalization();
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const { loading: authLoading } = auth;
  const onboarding = useOnboarding();
  const provider = useProviderFoundation();
  const legal = useLegal();
  const [modeAccount, setModeAccount] = useState<string | null>(null);

  const resolvedTarget = routeAfterHydration({
    authLoading,
    onboardingReady: onboarding.ready,
    providerLoading: provider.loading,
    target: onboarding.route,
  });
  const providersReady = resolvedTarget !== null;
  const target = resolvedTarget ?? onboarding.route;
  const signedIn = onboarding.accountKey !== null;
  const modeReady = !signedIn || modeAccount === onboarding.accountKey;
  const legalReady = !signedIn
    || (legal.ready && legal.accountKey === onboarding.accountKey);
  const ready = providersReady && modeReady && legalReady;
  const accountAuthorityUnavailable = signedIn && onboarding.ready && onboarding.error;

  // Mode is initialized once per authenticated app session/account. Customer
  // mode remains available to a worker, but it is an explicit in-memory
  // choice and therefore cannot become the next cold-start default.
  useEffect(() => {
    if (!providersReady) return;
    if (!signedIn || !onboarding.accountKey) {
      if (modeAccount !== null) setModeAccount(null);
      return;
    }
    if (modeAccount === onboarding.accountKey) return;

    let current = true;
    void provider.setMode(defaultModeFor(target)).then(() => {
      if (current) setModeAccount(onboarding.accountKey);
    });
    return () => { current = false; };
  }, [modeAccount, onboarding.accountKey, provider, providersReady, signedIn, target]);

  const decision = startupRouteDecision({
    ready,
    pathname,
    target,
    mode: provider.mode,
    workerCapabilityActive: onboarding.state.workerCapabilityActive,
    legalAcceptanceRequired: signedIn
      && !legal.satisfied
      && (legal.obligations.enforced || legal.unavailable),
  });
  const decisionStatus = accountAuthorityUnavailable ? 'render' : decision.status;
  const redirect = !accountAuthorityUnavailable && decision.status === 'redirecting'
    ? decision.redirect
    : null;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  useEffect(() => {
    if (decisionStatus !== 'render') return;
    void SplashScreen.hideAsync().catch(() => {
      // Web and a few development shells do not own a native splash surface.
    });
  }, [decisionStatus]);

  if (decisionStatus !== 'render') {
    return (
      <View
        nativeID="warsha-startup-surface"
        accessibilityRole="progressbar"
        accessibilityLabel={ot.text('gatewayLoading')}
        style={styles.loading}
      >
        <BrandLoadingMark size={56} accessibilityLabel={ot.text('gatewayLoading')} />
      </View>
    );
  }

  if (accountAuthorityUnavailable) {
    return (
      <View style={styles.recovery} accessibilityRole="alert">
        <BrandLoadingMark size={56} accessibilityLabel={ot.text('gatewayLoading')} />
        <AppText style={styles.recoveryBody}>{ot.text('accountStateUnavailable')}</AppText>
        <BrandButton label={t('tryAgain')} onPress={() => void onboarding.reload()} />
        <BrandButton label={t('signOut')} variant="ghost" onPress={() => void auth.signOut()} />
      </View>
    );
  }

  return <>{children}</>;
}

const makeStyles = (colors: ThemeColors): {
  loading: ViewStyle;
  recovery: ViewStyle;
  recoveryBody: TextStyle;
} => StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  recovery: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.canvas,
  },
  recoveryBody: {
    maxWidth: 420,
    textAlign: 'center',
    color: colors.textSecondary,
  },
});
