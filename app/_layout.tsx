import {
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
} from '@expo-google-fonts/cairo';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { LocaleDirContext, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { Platform, View } from 'react-native';
import 'react-native-reanimated';

import { AuthGate } from '@/components/warsha/AuthGate';
import { ConfigurationError } from '@/components/warsha/ConfigurationError';
import { LocalDataMigrationGate } from '@/components/warsha/LocalDataMigrationGate';
import { NotificationBanner } from '@/components/warsha/NotificationBanner';
import { PushNotificationSync } from '@/components/warsha/PushNotificationSync';
import { ProviderModeOverlay } from '@/components/warsha/ProviderModeOverlay';
import { fontFamilies } from '@/constants/theme';
import { AddressProvider } from '@/src/addresses/address-context';
import { AppearanceAccountSync, AppearanceProvider, useAppearance } from '@/src/appearance/appearance-context';
import { statusBarStyle } from '@/src/appearance/appearance-types';
import { AuthProvider } from '@/src/auth/auth-context';
import { BookingProvider } from '@/src/bookings/booking-context';
import { ChatProvider } from '@/src/chat/chat-context';
import { supabaseConfigurationMissing } from '@/src/config/environment';
import { LocalPreferencesProvider } from '@/src/data/local-preferences';
import { DraftProvider } from '@/src/drafts/draft-context';
import { MarketplaceDataProvider } from '@/src/data/marketplace-context';
import { DiscoveryProvider } from '@/src/discovery/discovery-context';
import { GrowthProvider } from '@/src/growth/growth-context';
import { LanguageAccountSync, LocalizationProvider, useLocalization } from '@/src/i18n/localization';
import { LegalProvider } from '@/src/legal/legal-context';
import { MarketplaceIntelligenceProvider } from '@/src/marketplace-intelligence/marketplace-context';
import { NotificationProvider } from '@/src/notifications/notification-context';
import { OnboardingProvider } from '@/src/onboarding/onboarding-context';
import { PaymentsProvider } from '@/src/payments/payment-context';
import { PrivacyProvider } from '@/src/privacy/privacy-context';
import { ProviderJobsProvider } from '@/src/provider-jobs/provider-job-context';
import { ProviderFoundationProvider } from '@/src/providers/provider-context';
import { ReviewProvider } from '@/src/reviews/review-context';
import { SupportProvider } from '@/src/support/support-context';
import { VerificationProvider } from '@/src/verification/verification-context';

void SplashScreen.preventAutoHideAsync();

/**
 * Everything below the appearance provider, so the navigation container, the
 * status bar, and the root canvas all follow the active theme.
 *
 * A theme change rebuilds style objects and re-renders. It does **not**
 * remount: `Stack` and every provider above it keep their identity, so
 * navigation history, scroll position, form contents, and in-flight requests
 * all survive a switch between light and dark.
 */
function ThemedRoot() {
  const { colors, scheme } = useAppearance();
  const { isRTL } = useLocalization();

  const navigationTheme = useMemo(() => ({
    dark: scheme === 'dark',
    colors: {
      primary: colors.actionPrimaryBackground,
      background: colors.canvas,
      card: colors.navigationBackground,
      text: colors.textPrimary,
      border: colors.navigationBorder,
      notification: colors.brandPrimary,
    },
    fonts: {
      regular: { fontFamily: fontFamilies.latin.regular, fontWeight: '400' as const },
      medium: { fontFamily: fontFamilies.latin.medium, fontWeight: '500' as const },
      bold: { fontFamily: fontFamilies.latin.bold, fontWeight: '700' as const },
      heavy: { fontFamily: fontFamilies.latin.bold, fontWeight: '700' as const },
    },
  }), [colors, scheme]);

  // Android: the root view sits behind the React tree and behind the system
  // navigation bar in edge-to-edge mode. `expo-system-ui` is the only supported
  // way to reach it, and it is already a dependency.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => {
      // A platform that cannot set it keeps its default. Not worth surfacing.
    });
  }, [colors.canvas]);

  // Web only: keep the host document in step. React Native Web renders into a
  // document Warsha does not otherwise style, so the page background behind the
  // app, the browser chrome, and native form controls need telling directly.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.colorScheme = scheme;
    document.documentElement.style.backgroundColor = colors.canvas;
    document.documentElement.style.setProperty('--warsha-startup-canvas', colors.canvas);
    document.documentElement.style.setProperty('--warsha-startup-mark', colors.brandMark);
    document.body.style.backgroundColor = colors.canvas;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.canvas);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', scheme);
  }, [colors.brandMark, colors.canvas, scheme]);

  // Navigation presentation follows the WARSHA language, not the device.
  // React Navigation reads its direction from this context and defaults it
  // from I18nManager, which on an Arabic-configured Android device is true
  // even when Warsha is in English. Supplying it here — below the container
  // Expo Router mounts, so this value wins — makes the header, the back
  // affordance and the transitions agree with the language the reader
  // actually chose.
  //
  // This is presentation only. It does not mirror flex layout: that stays
  // the explicit per-component authority against the neutral root baseline,
  // and native system gestures stay platform-owned.
  return (
    <LocaleDirContext.Provider value={isRTL ? 'rtl' : 'ltr'}>
    <ThemeProvider value={navigationTheme}>
      {/* No `direction` here, deliberately.

          Warsha mirrors layout explicitly: Typography sets textAlign and
          writingDirection, the field primitive sets its own, and every row
          that needs mirroring applies `row-reverse` itself — 65 of them.
          Setting Yoga's `direction` on this View added a SECOND mirror
          underneath all of that, so in Arabic a `row` already ran
          right-to-left and the explicit `row-reverse` turned it back.
          Rows rendered left-to-right inside a right-aligned Arabic screen,
          with each mark stranded across the card from its label.

          Proved by measurement rather than by reading. With the DEVICE in
          English and Warsha in Arabic — which excludes I18nManager entirely
          — the gateway's trust icons still sat on the trailing edge. The
          only two mirrors left were this line and the explicit one.

          The explicit layer is the authority: it is documented in
          src/i18n/direction.ts, it is what 51 components already do, and
          rtl-direction.test.mts asserts it. This line duplicated it
          invisibly, so this line is the one that goes. */}
      <View style={{ flex: 1, backgroundColor: colors.canvas, direction: 'ltr' }}>
        {/* WPS-023. Nothing operational renders until the session and the
            onboarding state are both known, so no protected screen can appear
            for a frame before the router corrects itself. */}
        <AuthGate>
        <View style={{ flex: 1 }}>
        {/* Language and appearance are not chrome.
            They used to be a dock pinned above every routed screen, so the two
            most rarely-changed settings in the product were the most prominent
            controls on Welcome, sign-in, create-account and onboarding — three
            taps competing with the one thing each of those screens exists to
            get done. They live in Settings now; signed out, Warsha follows the
            device. See app/appearance.tsx. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="create-account" />
          <Stack.Screen name="forgot-password" />
          <Stack.Screen name="resend-confirmation" />
          <Stack.Screen name="legal/[topic]" />
          <Stack.Screen name="legal/index" />
          <Stack.Screen name="legal/consent" />
          <Stack.Screen name="legal/document/[key]" />
          <Stack.Screen name="onboarding/address" />
          <Stack.Screen name="onboarding/worker" />
          <Stack.Screen name="onboarding/identity" />
          <Stack.Screen name="onboarding/certificate" />
          <Stack.Screen name="worker" />
          <Stack.Screen name="worker-home" />
          <Stack.Screen name="search" />
          <Stack.Screen name="categories/[id]" />
          <Stack.Screen name="provider/[id]" />
          <Stack.Screen name="marketplace-request" />
          <Stack.Screen name="worker-quotes" />
          <Stack.Screen name="worker-quote" />
          <Stack.Screen name="booking" />
          <Stack.Screen name="conversation/[bookingId]" />
          <Stack.Screen name="favourites" />
          <Stack.Screen name="recently-viewed" />
          <Stack.Screen name="referrals" />
          <Stack.Screen name="appearance" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="privacy-delete" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="notification-preferences" />
          <Stack.Screen name="provider-mode" />
          <Stack.Screen name="provider-verification" />
          <Stack.Screen name="provider-portfolio" />
          <Stack.Screen name="provider-certificates" />
          <Stack.Screen name="provider-earnings" />
          <Stack.Screen name="provider-job" />
          <Stack.Screen name="reset-password" />
          <Stack.Screen name="auth/confirm" />
          <Stack.Screen name="help/index" />
          <Stack.Screen name="help/manual/[id]" />
          <Stack.Screen name="support/index" />
        </Stack>
        </View>
        </AuthGate>
        <NotificationBanner />
        <PushNotificationSync />
        <ProviderModeOverlay />
        <StatusBar style={statusBarStyle(scheme)} />
      </View>
    </ThemeProvider>
    </LocaleDirContext.Provider>
  );
}

/**
 * Expo Router renders this in place of the tree below when that tree throws.
 * Until it existed, an uncaught error was a blank screen nobody heard about.
 */
export { AppErrorBoundary as ErrorBoundary } from '@/components/warsha/AppErrorBoundary';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
  });

  useEffect(() => {
    // AuthGate owns ordinary startup and hides the native splash only after a
    // safe route is mounted. ConfigurationError sits outside that gate, so it
    // is the sole exceptional path that hides here.
    if ((fontsLoaded || fontError) && supabaseConfigurationMissing) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <AppearanceProvider>
      <LocalizationProvider>
        {supabaseConfigurationMissing ? <ConfigurationError /> : (
          <AuthProvider>
            <AppearanceAccountSync />
            {/* The account's language reaches the device the same way its
                appearance does. `profiles.preferred_language` was written by
                the profile screen and read by nothing; now a second device
                opens in the language this account already chose. */}
            <LanguageAccountSync />
            {/* Above the navigator on purpose. Work in progress that lives
                inside a screen dies when that screen is popped, replaced, or
                reclaimed by Android in the background — which is why an
                accidental back gesture used to cost a worker their whole
                onboarding step. Here it outlives every one of those, and is
                erased the moment the account changes. */}
            <DraftProvider>
            <LocalDataMigrationGate>
              <MarketplaceDataProvider>
                <MarketplaceIntelligenceProvider>
                  <LocalPreferencesProvider>
                    <DiscoveryProvider>
                      <AddressProvider>
                        <BookingProvider>
                          <ProviderFoundationProvider>
                            <VerificationProvider>
                              <ProviderJobsProvider>
                                <PaymentsProvider>
                                  <ReviewProvider>
                                    <ChatProvider>
                                      <NotificationProvider>
                                        <SupportProvider>
                                          <GrowthProvider>
                                            <PrivacyProvider>
                                              <OnboardingProvider>
                                                <LegalProvider>
                                                  <ThemedRoot />
                                                </LegalProvider>
                                              </OnboardingProvider>
                                            </PrivacyProvider>
                                          </GrowthProvider>
                                        </SupportProvider>
                                      </NotificationProvider>
                                    </ChatProvider>
                                  </ReviewProvider>
                                </PaymentsProvider>
                              </ProviderJobsProvider>
                            </VerificationProvider>
                          </ProviderFoundationProvider>
                        </BookingProvider>
                      </AddressProvider>
                    </DiscoveryProvider>
                  </LocalPreferencesProvider>
                </MarketplaceIntelligenceProvider>
              </MarketplaceDataProvider>
            </LocalDataMigrationGate>
            </DraftProvider>
          </AuthProvider>
        )}
      </LocalizationProvider>
    </AppearanceProvider>
  );
}
