import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandButton, BrandLoadingState, BrandTextField } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { colors, spacing, typography } from '@/constants/theme';
import { useAdmin } from '@/src/admin/admin-context';
import { adminRepository } from '@/src/admin/admin-repository';
import { caseStatusTone, isCaseOpen, type CaseStatus, type StaffCase } from '@/src/admin/admin-types';

/**
 * Case detail. The operational record here is a pointer to the authoritative
 * domain record, never a copy of it: resolving a dispute, deciding an appeal,
 * or approving a refund still happens in the specification that owns it.
 */
export default function AdminCaseScreen() {
  const params = useLocalSearchParams<{ assignmentId?: string }>();
  const { session, text, can } = useAdmin();
  const [record, setRecord] = useState<StaffCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const assignmentId = typeof params.assignmentId === 'string' ? params.assignmentId : null;

  const load = useCallback(async () => {
    if (!assignmentId) { setError(text('errorNotFound')); setLoading(false); return; }
    setLoading(true);
    try {
      setRecord(await adminRepository.getCase(assignmentId));
      setError(null);
    } catch {
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [assignmentId, text]);

  useEffect(() => { void load(); }, [load]);

  const act = useCallback(async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      setError(null);
      await load();
    } catch (thrown) {
      // A version clash is the expected outcome when two reviewers overlap; it
      // is reported plainly rather than silently retried.
      const message = thrown instanceof Error ? thrown.message : '';
      setError(/changed since you opened it/i.test(message) ? text('caseStale') : text('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }, [load, text]);

  const transition = (status: CaseStatus) => {
    if (!record) return;
    void act(() => adminRepository.transitionCase(
      record.assignmentId, status, record.lockVersion,
      `case:${record.assignmentId}:${status}:${record.lockVersion}`,
      note.trim() || undefined,
    ));
  };

  return (
    <AdminShell title={text('caseTitle')} subtitle={record?.subjectId} onBack>
      {loading ? <BrandLoadingState label={text('a11yLoading')} /> : null}
      {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}

      {record ? (
        <>
          <AdminSection title={text('caseSubject')} hint={text('caseDomainNote')}>
            <AdminRow label={text('caseStatus')} value={record.status} tone={caseStatusTone(record.status)} />
            <AdminRow label={text('casePriority')} value={record.priority} />
            <AdminRow label={text('caseAssignee')} value={record.assignedTo ?? text('caseUnassigned')} />
            <AdminRow label={text('caseDue')} value={record.dueAt ? record.dueAt.slice(0, 16).replace('T', ' ') : '—'} />
            <AdminRow label={text('caseSubject')} value={record.subjectType} hint={record.subjectId} />
          </AdminSection>

          {isCaseOpen(record.status) ? (
            <AdminSection title={text('caseNextAction')}>
              <View style={styles.actions}>
                {record.assignedTo === null && session.staffId ? (
                  <BrandButton
                    label={text('caseClaim')}
                    icon="how-to-reg"
                    loading={busy}
                    onPress={() => {
                      if (!session.staffId) return;
                      void act(() => adminRepository.claimCase(
                        record.assignmentId, session.staffId!, record.lockVersion,
                        `claim:${record.assignmentId}:${record.lockVersion}`,
                      ));
                    }}
                  />
                ) : null}
                <BrandButton label={text('caseStart')} variant="secondary" icon="play-arrow" loading={busy} onPress={() => transition('in_progress')} />
                <BrandButton label={text('caseWaitParticipant')} variant="secondary" icon="hourglass-empty" loading={busy} onPress={() => transition('waiting_participant')} />
                <BrandButton label={text('caseEscalate')} variant="secondary" icon="trending-up" loading={busy} onPress={() => transition('escalated')} />
                <BrandButton label={text('caseResolve')} variant="secondary" icon="check" loading={busy} onPress={() => transition('resolved')} />
                <BrandButton label={text('caseClose')} variant="danger" icon="lock" loading={busy} onPress={() => transition('closed')} />
              </View>
            </AdminSection>
          ) : null}

          <AdminSection title={text('casePrivateNotes')} hint={text('casePrivateNoteHint')}>
            {record.privateNotes.length === 0
              ? <AppText style={styles.muted}>{text('queueEmpty')}</AppText>
              : record.privateNotes.map(entry => (
                <AdminRow
                  key={entry.id}
                  label={entry.note}
                  hint={entry.createdAt.slice(0, 16).replace('T', ' ')}
                />
              ))}
            <BrandTextField
              label={text('caseAddNote')}
              value={note}
              onChangeText={setNote}
              multiline
              accessibilityLabel={text('caseAddNote')}
            />
            <BrandButton
              label={text('caseAddNote')}
              variant="secondary"
              icon="note-add"
              loading={busy}
              disabled={note.trim().length < 3 || !can('assign_cases')}
              onPress={() => {
                void act(async () => {
                  await adminRepository.addCaseNote(
                    record.assignmentId, note.trim(),
                    `note:${record.assignmentId}:${record.privateNotes.length}`,
                  );
                  setNote('');
                });
              }}
            />
          </AdminSection>

          <AdminSection title={text('caseHistory')}>
            {record.events.map(entry => (
              <AdminRow
                key={entry.id}
                label={entry.action}
                hint={[
                  `${entry.fromStatus ?? '—'} → ${entry.toStatus}`,
                  entry.createdAt.slice(0, 16).replace('T', ' '),
                  entry.note ?? '',
                ].filter(Boolean).join(' · ')}
              />
            ))}
          </AdminSection>
        </>
      ) : null}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.bodySmall, color: colors.error },
  muted: { ...typography.caption, color: colors.textMuted },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
