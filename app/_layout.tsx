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
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { ConfigurationError } from '@/components/warsha/ConfigurationError';
import { LocalDataMigrationGate } from '@/components/warsha/LocalDataMigrationGate';
import { NotificationBanner } from '@/components/warsha/NotificationBanner';
import { ProviderModeOverlay } from '@/components/warsha/ProviderModeOverlay';
import { colors, fontFamilies } from '@/constants/theme';
import { AddressProvider } from '@/src/addresses/address-context';
import { AuthProvider } from '@/src/auth/auth-context';
import { BookingProvider } from '@/src/bookings/booking-context';
import { ChatProvider } from '@/src/chat/chat-context';
import { supabaseConfigurationMissing } from '@/src/config/environment';
import { LocalPreferencesProvider } from '@/src/data/local-preferences';
import { MarketplaceDataProvider } from '@/src/data/marketplace-context';
import { LocalizationProvider } from '@/src/i18n/localization';
import { MarketplaceIntelligenceProvider } from '@/src/marketplace-intelligence/marketplace-context';
import { NotificationProvider } from '@/src/notifications/notification-context';
import { PaymentsProvider } from '@/src/payments/payment-context';
import { ProviderJobsProvider } from '@/src/provider-jobs/provider-job-context';
import { ProviderFoundationProvider } from '@/src/providers/provider-context';
import { ReviewProvider } from '@/src/reviews/review-context';
import { SupportProvider } from '@/src/support/support-context';
import { VerificationProvider } from '@/src/verification/verification-context';

const navigationTheme = {
  dark: true,
  colors: {
    primary: colors.white,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.white,
  },
  fonts: {
    regular: { fontFamily: fontFamilies.latin.regular, fontWeight: '400' as const },
    medium: { fontFamily: fontFamilies.latin.medium, fontWeight: '500' as const },
    bold: { fontFamily: fontFamilies.latin.bold, fontWeight: '700' as const },
    heavy: { fontFamily: fontFamilies.latin.bold, fontWeight: '700' as const },
  },
};

void SplashScreen.preventAutoHideAsync();

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
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <LocalizationProvider>
      {supabaseConfigurationMissing ? <ConfigurationError /> : (
        <AuthProvider>
          <LocalDataMigrationGate>
            <MarketplaceDataProvider>
              <MarketplaceIntelligenceProvider>
                <LocalPreferencesProvider>
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
                                    <ThemeProvider value={navigationTheme}>
                                      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
                                        <Stack.Screen name="(tabs)" />
                                        <Stack.Screen name="search" />
                                        <Stack.Screen name="categories/[id]" />
                                        <Stack.Screen name="provider/[id]" />
                                        <Stack.Screen name="marketplace-request" />
                                        <Stack.Screen name="worker-quotes" />
                                        <Stack.Screen name="worker-quote" />
                                        <Stack.Screen name="booking" />
                                        <Stack.Screen name="conversation/[bookingId]" />
                                        <Stack.Screen name="favourites" />
                                        <Stack.Screen name="notifications" />
                                        <Stack.Screen name="notification-preferences" />
                                        <Stack.Screen name="provider-mode" />
                                        <Stack.Screen name="provider-verification" />
                                        <Stack.Screen name="provider-portfolio" />
                                        <Stack.Screen name="provider-certificates" />
                                        <Stack.Screen name="provider-earnings" />
                                        <Stack.Screen name="provider-job" />
                                        <Stack.Screen name="reset-password" />
                                        <Stack.Screen name="help" />
                                        <Stack.Screen name="support" />
                                        <Stack.Screen name="admin" />
                                      </Stack>
                                      <NotificationBanner />
                                      <ProviderModeOverlay />
                                      <StatusBar style="light" />
                                    </ThemeProvider>
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
                </LocalPreferencesProvider>
              </MarketplaceIntelligenceProvider>
            </MarketplaceDataProvider>
          </LocalDataMigrationGate>
        </AuthProvider>
      )}
    </LocalizationProvider>
  );
}
