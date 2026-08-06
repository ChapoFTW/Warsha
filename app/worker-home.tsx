import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandLoadingState, StateBadge } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useOnboarding } from '@/src/onboarding/onboarding-context';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';
import { showsCustomerModeAction } from '@/src/onboarding/onboarding-types';

/**
 * The default home for an active worker.
 *
 * It is about their work: what is available, what they have quoted, what is
 * running, what they have earned. Customer discovery is not the first thing an
 * active worker sees, because they did not open Warsha to hire a plumber.
 *
 * "Book a service" is present and secondary. A worker is also a person with a
 * broken tap, and making them sign out to be a customer would be absurd — but
 * it sits at the bottom in a single card rather than competing with the work.
 */
export default function WorkerHome() {
  const styles = useThemedStyles(makeStyles);
  const ot = useOnboardingText();
  const onboarding = useOnboarding();

  if (!onboarding.ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <BrandLoadingState label={ot.text('gatewayLoading')} />
      </SafeAreaView>
    );
  }

  const state = onboarding.state;
  const active = state.workerCapabilityActive;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <AppText accessibilityRole="header" style={styles.title}>{ot.text('workerHomeTitle')}</AppText>

        {state.workerState ? (
          <StateBadge
            label={ot.workerState(state.workerState)}
            tone={active ? 'success' : 'warning'}
          />
        ) : null}

        {/* Belt and braces. The router should never land a non-active worker
            here, and if it somehow does, the screen says so rather than
            offering actions the server will refuse. */}
        {!active ? (
          <BrandCard style={styles.card}>
            <AppText style={styles.hint}>{ot.text('workerHomePendingNotice')}</AppText>
            <BrandButton
              label={ot.text('workerTitle')}
              onPress={() => router.replace('/onboarding/worker')}
            />
          </BrandCard>
        ) : (
          <View style={styles.grid}>
            <BrandButton
              label={ot.text('workerHomeOpportunities')}
              onPress={() => router.push('/worker-quotes')}
            />
            <BrandButton
              label={ot.text('workerHomeQuotes')}
              variant="secondary"
              onPress={() => router.push('/worker-quotes')}
            />
            <BrandButton
              label={ot.text('workerHomeActiveJobs')}
              variant="secondary"
              onPress={() => router.push('/provider-mode')}
            />
            <BrandButton
              label={ot.text('workerHomeEarnings')}
              variant="secondary"
              onPress={() => router.push('/provider-earnings')}
            />
            <BrandButton
              label={ot.text('workerHomeProfile')}
              variant="secondary"
              onPress={() => router.push('/provider-portfolio')}
            />
            <BrandButton
              label={ot.text('workerHomeSupport')}
              variant="ghost"
              onPress={() => router.push('/support')}
            />
          </View>
        )}

        {showsCustomerModeAction(state) ? (
          <BrandCard style={styles.card}>
            <AppText style={styles.sectionTitle}>{ot.text('workerHomeBookAsCustomer')}</AppText>
            <AppText style={styles.hint}>{ot.text('workerHomeCustomerModeHint')}</AppText>
            <BrandButton
              label={ot.text('workerHomeBookAsCustomer')}
              variant="secondary"
              onPress={() => router.push('/(tabs)')}
            />
          </BrandCard>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { padding: spacing.xl, gap: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: typography.bold, color: colors.textPrimary },
  sectionTitle: { fontSize: 16, fontWeight: typography.semibold, color: colors.textPrimary },
  hint: { color: colors.textSecondary },
  card: { gap: spacing.sm },
  grid: { gap: spacing.md },
});
