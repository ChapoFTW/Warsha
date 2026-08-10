import { usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { BrandLoadingMark } from '@/components/warsha/BrandMark';
import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import {
  defaultModeFor,
  homeRouteFor,
  isWorkerOnboardingContinuation,
  routeAfterHydration,
  routeSurface,
} from '@/src/navigation/worker-route-policy';
import { isPublicAuthRoute, PUBLIC_ROUTES, signedOutRedirect } from '@/src/navigation/auth-route-policy';
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
  const router = useRouter();
  const pathname = usePathname();
  const { loading: authLoading } = useAuth();
  const onboarding = useOnboarding();
  const provider = useProviderFoundation();
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
  const ready = providersReady && modeReady;

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

  useEffect(() => {
    if (!ready) return;

    if (target === 'gateway') {
      // A signed-out session on a public route stays where it is. Bouncing
      // somebody off the sign-in screen back to the gateway would make signing
      // in impossible.
      const redirect = signedOutRedirect(pathname);
      if (redirect) router.replace(redirect);
      return;
    }

    // Signed in and sitting on a signed-out route: send them onward. This is
    // what makes sign-in and account creation land in the right place without
    // either screen having to know where that is.
    if (isPublicAuthRoute(pathname, PUBLIC_ROUTES)) {
      router.replace(homeRouteFor(target));
      return;
    }

    const surface = routeSurface(pathname);

    if (target === 'account_blocked') {
      router.replace(homeRouteFor(target));
      return;
    }

    // A missing role is not a customer role. If an interrupted registration
    // or a deep link reaches an operational surface before role selection is
    // recorded, return to the role authority instead of leaving the customer
    // shell visible.
    if (target === 'role_choice') {
      router.replace(homeRouteFor(target));
      return;
    }

    // A worker application is one continuous journey. Until capability is
    // granted, customer and worker operational shells cannot become an escape
    // hatch from the required next step. Shared legal/support routes remain.
    if (
      target === 'worker_onboarding'
      && surface !== 'shared'
      && !isWorkerOnboardingContinuation(pathname)
    ) {
      router.replace(homeRouteFor(target));
      return;
    }

    if (target === 'worker_home') {
      if (surface === 'worker') {
        if (provider.mode !== 'provider') void provider.setMode('provider');
        if (pathname === '/worker-home' || pathname === '/provider-mode') {
          router.replace(homeRouteFor(target));
        }
        return;
      }

      // Customer surfaces are available only after the worker explicitly
      // chooses the service-request experience in this app session.
      if (surface === 'customer' && provider.mode !== 'customer') {
        router.replace(homeRouteFor(target));
      }
      return;
    }

    // A customer cannot enter worker operations merely by knowing a route.
    // A dual-role account with server-confirmed worker capability may still
    // enter explicitly; the server remains the authorization boundary.
    if (
      (target === 'customer_home' || target === 'customer_address')
      && surface === 'worker'
      && !onboarding.state.workerCapabilityActive
    ) {
      router.replace(homeRouteFor(target));
      return;
    }

    if (target === 'customer_address' && pathname === '/') {
      router.replace(homeRouteFor(target));
    }
  }, [onboarding.state.workerCapabilityActive, pathname, provider, ready, router, target]);

  if (!ready) {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel={ot.text('gatewayLoading')} style={styles.loading}>
        <BrandLoadingMark size={56} accessibilityLabel={ot.text('gatewayLoading')} />
      </View>
    );
  }

  return <>{children}</>;
}

const makeStyles = (colors: ThemeColors): { loading: ViewStyle } => StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
});
