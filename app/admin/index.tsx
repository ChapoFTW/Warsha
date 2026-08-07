import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandButton, BrandLoadingState, EmptyState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAdmin } from '@/src/admin/admin-context';
import { adminRepository } from '@/src/admin/admin-repository';
import { priorityTone, type StaffHome } from '@/src/admin/admin-types';

/** Operational home: prioritized queues, personal workload, and platform state. */
export default function AdminHomeScreen() {
  const styles = useThemedStyles(makeStyles);
  const { session, text, can, refresh, reauthenticate, revokeSessions } = useAdmin();
  const [home, setHome] = useState<StaffHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHome(await adminRepository.getHome());
      setError(null);
    } catch {
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [text]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminShell title={text('homeTitle')} subtitle={session.roles.join(' · ')}>
      {loading ? <BrandLoadingState label={text('a11yLoading')} /> : null}
      {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}

      {home ? (
        <AdminSection title={text('homeMyCases')}>
          <AdminRow label={text('homeMyCases')} value={String(home.myOpenCases)} />
          <AdminRow
            label={text('homeMyOverdue')}
            value={String(home.myOverdueCases)}
            tone={home.myOverdueCases > 0 ? 'error' : 'neutral'}
          />
          <AdminRow
            label={text('homeIncidents')}
            value={String(home.activeIncidents)}
            tone={home.activeIncidents > 0 ? 'warning' : 'neutral'}
          />
          <AppText style={styles.footnote}>
            {`${text('homeUpdated')} ${new Date(home.generatedAt).toLocaleString(
              session.displayTimezone ? 'en-EG' : 'en-EG',
              { timeZone: session.displayTimezone ?? 'Africa/Cairo' },
            )}`}
          </AppText>
        </AdminSection>
      ) : null}

      {home && home.queues.length === 0 ? (
        <EmptyState title={text('homeNoQueues')} body={text('homeNoQueuesDetail')} icon="lock" />
      ) : null}

      {home && home.queues.length > 0 ? (
        <AdminSection title={text('homeQueues')}>
          {home.queues.map(queue => (
            <AdminRow
              key={queue.queueKey}
              label={queue.displayName}
              value={String(queue.openAssignments + queue.backlog)}
              tone={queue.overdue > 0 ? 'error' : priorityTone(queue.defaultPriority) === 'error' ? 'warning' : 'neutral'}
              hint={`${text('queueAssignedToMe')} ${queue.assignedToMe} · ${text('queueOverdue')} ${queue.overdue} · ${text('queueBacklog')} ${queue.backlog}`}
              accessibilityLabel={`${text('a11yQueueCard')}: ${queue.displayName}, ${queue.openAssignments} ${text('queueOpen')}, ${queue.overdue} ${text('queueOverdue')}`}
              onPress={() => router.push(`/admin/queue/${queue.queueKey}`)}
            />
          ))}
        </AdminSection>
      ) : null}

      <AdminSection title={text('platformTitle')}>
        {can('safe_search') ? (
          <AdminRow label={text('searchTitle')} icon="search" onPress={() => router.push('/admin/search')} />
        ) : null}
        {can('view_analytics') ? (
          <AdminRow label={text('analyticsTitle')} icon="insights" onPress={() => router.push('/admin/analytics')} />
        ) : null}
        {can('manage_marketplace_configuration') || can('manage_notification_configuration')
          || can('approve_configuration') || can('manage_feature_flags') || can('manage_kill_switches') ? (
            <AdminRow label={text('configTitle')} icon="tune" onPress={() => router.push('/admin/configuration')} />
          ) : null}
        {can('manage_incidents') ? (
          <AdminRow label={text('incidentsTitle')} icon="report" onPress={() => router.push('/admin/incidents')} />
        ) : null}
        {can('view_audit_logs') ? (
          <AdminRow label={text('auditTitle')} icon="fact-check" onPress={() => router.push('/admin/audit')} />
        ) : null}
      </AdminSection>

      {/*
        WPS-024 governance. These screens existed as routes before they were
        reachable, which meant a staff surface nobody could navigate to — the
        registry and the health of every external provider were one direct URL
        away from being unfindable. Capability-gated exactly as the server is.
      */}
      {can('review_legal_governance') || can('review_worker_vetting') ? (
        <AdminSection title="Governance">
          {can('review_legal_governance') ? (
            <AdminRow label="Legal governance" icon="gavel" onPress={() => router.push('/admin/legal')} />
          ) : null}
          {can('review_legal_governance') ? (
            <AdminRow label="External providers" icon="cloud-queue" onPress={() => router.push('/admin/providers')} />
          ) : null}
          {can('review_worker_vetting') ? (
            <AdminRow label="Worker vetting" icon="badge" onPress={() => router.push('/admin/vetting')} />
          ) : null}
        </AdminSection>
      ) : null}

      <AdminSection title={text('reauthRequired')} hint={text('reauthDetail')}>
        <View style={styles.actions}>
          <BrandButton
            label={session.reauthValid ? text('reauthDone') : text('reauthAction')}
            variant={session.reauthValid ? 'secondary' : 'primary'}
            icon="verified-user"
            disabled={session.reauthValid}
            onPress={() => { void reauthenticate(); }}
          />
          <BrandButton
            label={text('revokeSessions')}
            variant="secondary"
            icon="logout"
            onPress={() => { void revokeSessions(); }}
          />
          <BrandButton label={text('confirmProceed')} variant="ghost" icon="refresh" onPress={() => { void refresh(); void load(); }} />
        </View>
      </AdminSection>
    </AdminShell>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  error: { ...typography.bodySmall, color: colors.error },
  footnote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  actions: { gap: spacing.sm },
});
