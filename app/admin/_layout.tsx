import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandCard, BrandLoadingState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { AdminProvider, useAdmin } from '@/src/admin/admin-context';

/**
 * WPS-017 operations guard.
 *
 * This is not a hidden route. It is a separate, explicitly guarded surface:
 *
 * 1. the build must opt in (`EXPO_PUBLIC_ADMIN_SURFACE`);
 * 2. the server must report the platform as ready — production fails closed
 *    because it requires a second factor and no provider is configured;
 * 3. the signed-in account must hold at least one staff capability.
 *
 * None of these three is the authorization control. Every screen below reads
 * and writes only through capability-gated RPCs, so refusing to render is a
 * usability decision, not a security boundary.
 */
function AdminGate() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { session, loading, surfaceEnabled, text } = useAdmin();

  if (!surfaceEnabled) return <AdminNotice title={text('surfaceDisabled')} />;
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <BrandLoadingState label={text('a11yLoading')} />
      </SafeAreaView>
    );
  }
  if (!session.platformReady) {
    return <AdminNotice title={text('platformUnavailable')} detail={text('platformUnavailableDetail')} />;
  }
  if (!session.isStaff) {
    return <AdminNotice title={text('notStaff')} detail={text('notStaffDetail')} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="queue/[queueKey]" />
      <Stack.Screen name="case/[assignmentId]" />
      <Stack.Screen name="search" />
      <Stack.Screen name="analytics" />
      <Stack.Screen name="configuration" />
      <Stack.Screen name="campaigns" />
      <Stack.Screen name="incidents" />
      <Stack.Screen name="audit" />
    </Stack>
  );
}

function AdminNotice({ title, detail }: { title: string; detail?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.centre}>
        <BrandCard style={styles.card}>
          <AppText accessibilityRole="header" style={styles.title}>{title}</AppText>
          {detail ? <AppText style={styles.detail}>{detail}</AppText> : null}
        </BrandCard>
      </View>
    </SafeAreaView>
  );
}

export default function AdminLayout() {
  return (
    <AdminProvider>
      <AdminGate />
    </AdminProvider>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { maxWidth: 480, gap: spacing.sm },
  title: { ...typography.h3, fontWeight: typography.semibold },
  detail: { ...typography.bodySmall, color: colors.textSecondary },
});
