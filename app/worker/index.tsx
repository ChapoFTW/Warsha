import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandLoadingState, StateBadge } from '@/components/warsha/BrandUI';
import { GlobalPreferenceControls } from '@/components/warsha/GlobalPreferenceControls';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useOnboarding } from '@/src/onboarding/onboarding-context';
import { useProviderJobs } from '@/src/provider-jobs/provider-job-context';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { useVerification } from '@/src/verification/verification-context';
import {
  countActiveWorkerJobs,
  countNewWorkerRequests,
  workerDashboardPriority,
} from '@/src/worker/worker-dashboard-policy';
import { useWorkerText } from '@/src/worker/worker-copy';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export default function WorkerDashboard() {
  const styles = useThemedStyles(makeStyles);
  const colors = useThemeColors();
  const wt = useWorkerText();
  const onboarding = useOnboarding();
  const provider = useProviderFoundation();
  const jobs = useProviderJobs();
  const verification = useVerification();

  if (!onboarding.ready || provider.loading || jobs.loading || verification.loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <BrandLoadingState label={wt.text('homeTitle')} />
      </SafeAreaView>
    );
  }

  const newRequests = countNewWorkerRequests(jobs.jobs);
  const activeJobs = countActiveWorkerJobs(jobs.jobs);
  const priority = workerDashboardPriority({
    workerState: onboarding.state.workerState,
    verificationStatus: verification.verification?.status ?? null,
    jobs: jobs.jobs,
    available: provider.profile?.isAvailable ?? false,
  });

  const requestService = async () => {
    await provider.setMode('customer');
    router.replace('/');
  };

  const primary = (() => {
    switch (priority.kind) {
      case 'suspended':
        return {
          icon: 'pause-circle-outline' as IconName,
          title: wt.text('suspendedTitle'),
          body: onboarding.state.latestSafeReason || wt.text('suspendedBody'),
          action: wt.text('suspendedAction'),
          onPress: () => router.push('/support'),
          tone: 'danger' as const,
        };
      case 'active_job':
        return {
          icon: 'handyman' as IconName,
          title: wt.text('activeJobTitle'),
          body: wt.text('activeJobBody'),
          action: wt.text('activeJobAction'),
          onPress: () => router.push({ pathname: '/worker/jobs/[id]', params: { id: priority.jobId } }),
          tone: 'primary' as const,
        };
      case 'new_requests':
        return {
          icon: 'notifications-active' as IconName,
          title: wt.newRequestsTitle(priority.count),
          body: wt.text('newRequestsBody'),
          action: wt.text('newRequestsAction'),
          onPress: () => router.push('/worker/requests'),
          tone: 'primary' as const,
        };
      case 'complete_verification':
        return {
          icon: 'verified-user' as IconName,
          title: wt.text('verifyTitle'),
          body: onboarding.state.latestSafeReason || wt.text('verifyBody'),
          action: wt.text('verifyAction'),
          onPress: () => router.push('/worker/verification'),
          tone: 'warning' as const,
        };
      case 'under_review':
        return {
          icon: 'hourglass-top' as IconName,
          title: wt.text('reviewTitle'),
          body: wt.text('reviewBody'),
          action: wt.text('reviewAction'),
          onPress: () => router.push('/worker/verification'),
          tone: 'neutral' as const,
        };
      case 'available':
        return {
          icon: 'check-circle' as IconName,
          title: wt.text('waitingTitle'),
          body: wt.text('waitingBody'),
          tone: 'success' as const,
        };
      case 'unavailable':
        return {
          icon: 'work-off' as IconName,
          title: wt.text('unavailableTitle'),
          body: wt.text('unavailableBody'),
          action: wt.text('goAvailable'),
          onPress: () => void provider.setAvailability(true),
          tone: 'neutral' as const,
        };
    }
  })();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View style={styles.grow}>
            <AppText accessibilityRole="header" style={styles.title}>{wt.text('homeTitle')}</AppText>
            <StateBadge
              label={provider.profile?.isAvailable ? wt.text('available') : wt.text('unavailable')}
              tone={provider.profile?.isAvailable ? 'success' : 'neutral'}
              compact
            />
          </View>
          <GlobalPreferenceControls embedded />
          <HeaderAction icon="chat-bubble-outline" label={wt.text('messages')} onPress={() => router.push('/chat')} />
          <HeaderAction icon="notifications-none" label={wt.text('notifications')} onPress={() => router.push('/notifications')} />
        </View>

        <PrimaryTaskCard {...primary} />

        <View style={styles.actions}>
          <ActionTile icon="inbox" label={wt.text('newRequests')} count={newRequests} onPress={() => router.push('/worker/requests')} />
          <ActionTile icon="handyman" label={wt.text('myJobs')} count={activeJobs} onPress={() => router.push('/worker/jobs')} />
          <ActionTile icon="verified-user" label={wt.text('verification')} onPress={() => router.push('/worker/verification')} />
          <ActionTile icon="account-balance-wallet" label={wt.text('earnings')} onPress={() => router.push('/worker/earnings')} />
          <ActionTile icon="person-outline" label={wt.text('myProfile')} onPress={() => router.push('/worker/profile')} />
          <ActionTile icon="support-agent" label={wt.text('support')} onPress={() => router.push('/support')} />
          <ActionTile icon="settings" label={wt.text('settings')} onPress={() => router.push('/worker/settings')} />
        </View>

        <BrandCard style={styles.customerCard}>
          <MaterialIcons name="home-repair-service" size={30} color={colors.textPrimary} />
          <View style={styles.grow}>
            <AppText style={styles.actionTitle}>{wt.text('requestService')}</AppText>
            <AppText style={styles.body}>{wt.text('requestServiceHint')}</AppText>
          </View>
          <BrandButton label={wt.text('requestService')} variant="secondary" onPress={() => void requestService()} />
        </BrandCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function HeaderAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.headerAction}>
      <MaterialIcons name={icon} size={23} color={colors.textPrimary} />
    </Pressable>
  );
}

function PrimaryTaskCard({
  icon,
  title,
  body,
  action,
  onPress,
  tone,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: string;
  onPress?: () => void;
  tone: 'primary' | 'success' | 'warning' | 'neutral' | 'danger';
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <BrandCard style={[styles.primaryCard, styles[`primary_${tone}`]]}>
      <View style={styles.primaryIcon}>
        <MaterialIcons name={icon} size={36} color={colors.textPrimary} />
      </View>
      <AppText style={styles.primaryTitle}>{title}</AppText>
      <AppText style={styles.primaryBody}>{body}</AppText>
      {action && onPress ? <BrandButton label={action} onPress={onPress} style={styles.primaryButton} /> : null}
    </BrandCard>
  );
}

function ActionTile({ icon, label, count, onPress }: { icon: IconName; label: string; count?: number; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.actionTile}>
      <View style={styles.actionIcon}><MaterialIcons name={icon} size={27} color={colors.textPrimary} /></View>
      <AppText style={styles.actionTitle}>{label}</AppText>
      {count ? <View style={styles.count}><AppText style={styles.countText}>{count > 99 ? '99+' : count}</AppText></View> : null}
      <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1, gap: spacing.xs },
  title: { fontSize: 28, lineHeight: 34, fontWeight: typography.bold, color: colors.textPrimary },
  headerAction: { width: 52, height: 52, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  primaryCard: { minHeight: 240, justifyContent: 'center', gap: spacing.md, borderWidth: 1 },
  primary_primary: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceElevated },
  primary_success: { borderColor: colors.successBorder, backgroundColor: colors.successSoft },
  primary_warning: { borderColor: colors.warningBorder, backgroundColor: colors.warningSoft },
  primary_neutral: { borderColor: colors.border, backgroundColor: colors.surface },
  primary_danger: { borderColor: colors.errorBorder, backgroundColor: colors.errorSoft },
  primaryIcon: { width: 64, height: 64, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  primaryTitle: { fontSize: 23, lineHeight: 30, fontWeight: typography.bold, color: colors.textPrimary },
  primaryBody: { fontSize: 15, lineHeight: 23, color: colors.textSecondary },
  primaryButton: { alignSelf: 'stretch', minHeight: 58 },
  actions: { gap: spacing.sm },
  actionTile: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionIcon: { width: 46, height: 46, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  actionTitle: { flex: 1, fontSize: 16, fontWeight: typography.semibold, color: colors.textPrimary },
  count: { minWidth: 30, height: 30, paddingHorizontal: spacing.sm, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.textPrimary },
  countText: { color: colors.background, fontSize: 12, fontWeight: typography.bold },
  customerCard: { gap: spacing.md },
  body: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
});
