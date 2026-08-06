import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { BrandLoadingMark } from '@/components/warsha/BrandMark';
import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAuth } from '@/src/auth/auth-context';
import { useOnboarding } from '@/src/onboarding/onboarding-context';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';
import type { RouteTarget } from '@/src/onboarding/onboarding-types';

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

const PUBLIC_ROUTES = ['/welcome', '/sign-in', '/create-account', '/reset-password', '/legal'];

const TARGET_ROUTES: Record<RouteTarget, string> = {
  gateway: '/welcome',
  role_choice: '/create-account',
  customer_address: '/onboarding/address',
  customer_home: '/(tabs)',
  worker_onboarding: '/onboarding/worker',
  worker_home: '/worker-home',
  account_blocked: '/welcome',
};

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const ot = useOnboardingText();
  const router = useRouter();
  const pathname = usePathname();
  const { loading: authLoading } = useAuth();
  const onboarding = useOnboarding();

  const ready = onboarding.ready && !authLoading;
  const target = onboarding.route;

  useEffect(() => {
    if (!ready) return;

    if (target === 'gateway') {
      // A signed-out session on a public route stays where it is. Bouncing
      // somebody off the sign-in screen back to the gateway would make signing
      // in impossible.
      if (!isPublicRoute(pathname)) router.replace(TARGET_ROUTES.gateway);
      return;
    }

    // Signed in and sitting on a signed-out route: send them onward. This is
    // what makes sign-in and account creation land in the right place without
    // either screen having to know where that is.
    if (isPublicRoute(pathname)) {
      router.replace(TARGET_ROUTES[target]);
      return;
    }

    // A worker who has not been activated cannot sit on the worker home, and a
    // customer without a confirmed pin cannot skip the address step. Every
    // other route is left alone: this gate decides entry, not navigation.
    if (target === 'worker_onboarding' && pathname.startsWith('/worker-home')) {
      router.replace(TARGET_ROUTES.worker_onboarding);
      return;
    }
    if (target === 'customer_address' && pathname === '/') {
      router.replace(TARGET_ROUTES.customer_address);
    }
  }, [pathname, ready, router, target]);

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
