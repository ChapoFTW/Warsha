import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandLoadingState, EmptyState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAdmin } from '@/src/admin/admin-context';
import { adminRepository } from '@/src/admin/admin-repository';
import {
  caseStatusTone,
  formatAge,
  priorityTone,
  sortQueueItems,
  staffQueueKeys,
  type StaffQueueKey,
  type StaffQueueView,
} from '@/src/admin/admin-types';

/**
 * A queue list shows a safe identifier, age, priority, status, owner, reason,
 * and deadline — and nothing private. The private detail lives on the case.
 */
export default function AdminQueueScreen() {
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ queueKey?: string }>();
  const { text, language } = useAdmin();
  const [queue, setQueue] = useState<StaffQueueView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queueKey = staffQueueKeys.includes(params.queueKey as StaffQueueKey)
    ? params.queueKey as StaffQueueKey
    : null;

  const load = useCallback(async () => {
    if (!queueKey) { setError(text('errorNotFound')); setLoading(false); return; }
    setLoading(true);
    try {
      setQueue(await adminRepository.getQueue(queueKey));
      setError(null);
    } catch {
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [queueKey, text]);

  useEffect(() => { void load(); }, [load]);

  const items = queue ? sortQueueItems(queue.items) : [];

  return (
    <AdminShell title={queue?.displayName ?? text('homeQueues')} onBack>
      {loading ? <BrandLoadingState label={text('a11yLoading')} /> : null}
      {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}

      {queue && queue.targetResponseHours !== null ? (
        <AppText style={styles.meta}>{`${text('queueTarget')}: ${queue.targetResponseHours}h`}</AppText>
      ) : null}

      {queue && items.length === 0 && queue.backlog.length === 0 ? (
        <EmptyState title={text('queueEmpty')} icon="inbox" />
      ) : null}

      {items.length > 0 ? (
        <AdminSection title={text('queueOpen')}>
          {items.map(item => (
            <AdminRow
              key={item.assignmentId}
              label={item.subjectId}
              hint={[
                item.reasonCode ?? '',
                `${text('caseAge')} ${formatAge(item.ageSeconds, language)}`,
                item.assignedToName ?? text('caseUnassigned'),
                item.overdue ? text('queueOverdue') : '',
              ].filter(Boolean).join(' · ')}
              value={text(statusCopyKey(item.status))}
              tone={item.overdue ? 'error' : caseStatusTone(item.status)}
              accessibilityLabel={[
                `${text('a11yCaseStatus')}: ${text(statusCopyKey(item.status))}`,
                `${text('a11yCasePriority')}: ${text(priorityCopyKey(item.priority))}`,
                item.overdue ? text('a11yOverdue') : '',
              ].filter(Boolean).join(', ')}
              onPress={() => router.push(`/admin/case/${item.assignmentId}`)}
            />
          ))}
        </AdminSection>
      ) : null}

      {queue && queue.backlog.length > 0 ? (
        <AdminSection title={text('queueBacklog')} hint={text('caseDomainNote')}>
          {queue.backlog.map(item => (
            <AdminRow
              key={item.subjectId}
              label={item.subjectId}
              hint={[item.reasonCode ?? '', new Date(item.createdAt).toISOString().slice(0, 16).replace('T', ' ')]
                .filter(Boolean).join(' · ')}
              value={text(priorityCopyKey(item.priority))}
              tone={priorityTone(item.priority)}
            />
          ))}
        </AdminSection>
      ) : null}
    </AdminShell>
  );
}

function statusCopyKey(status: StaffQueueView['items'][number]['status']) {
  switch (status) {
    case 'unassigned': return 'statusUnassigned' as const;
    case 'assigned': return 'statusAssigned' as const;
    case 'in_progress': return 'statusInProgress' as const;
    case 'waiting_participant': return 'statusWaitingParticipant' as const;
    case 'waiting_provider': return 'statusWaitingProvider' as const;
    case 'escalated': return 'statusEscalated' as const;
    case 'resolved': return 'statusResolved' as const;
    default: return 'statusClosed' as const;
  }
}

function priorityCopyKey(priority: StaffQueueView['items'][number]['priority']) {
  switch (priority) {
    case 'urgent': return 'priorityUrgent' as const;
    case 'high': return 'priorityHigh' as const;
    case 'normal': return 'priorityNormal' as const;
    default: return 'priorityLow' as const;
  }
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  error: { ...typography.bodySmall, color: colors.error },
  meta: { ...typography.caption, color: colors.textMuted },
});
