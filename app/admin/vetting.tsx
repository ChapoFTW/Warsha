import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandLoadingState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAdmin } from '@/src/admin/admin-context';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { onboardingStaffRepository } from '@/src/onboarding/onboarding-staff-repository';
import { emptyVettingQueue, type StaffVettingQueue } from '@/src/onboarding/onboarding-staff-types';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';

/**
 * WPS-023 worker vetting queue.
 *
 * Inside `AdminShell`, which is the WPS-017 guarded shell: the admin layout
 * checks `surfaceEnabled`, `platformReady` and `isStaff` before this renders at
 * all, and `can()` gates each section on the capability the server will demand
 * anyway.
 *
 * What this screen deliberately shows, and nothing more: an opaque reference, a
 * lifecycle state, how long the case has waited, and whether a certificate
 * exists. No name, no email, no phone, no identifier, no storage path. A queue
 * is a work list, not a directory of people — opening a case is a separate,
 * capability-checked, access-logged call.
 *
 * There is no decision control here yet, and that is deliberate rather than
 * unfinished. Recording an adverse decision requires a reason, recorded
 * evidence, a fresh session and — for a rejection — a second person. A
 * half-built control that lets somebody begin that and not finish it is worse
 * than no control. The decision RPCs exist, are granted, are capability-checked
 * and are covered by pgTAP; the surface stays read-only until the decision UI
 * has been designed against the runbooks. Recorded in WES-023 §9.
 */
export default function AdminVettingScreen() {
  const styles = useThemedStyles(makeStyles);
  const { text, can } = useAdmin();
  const ot = useOnboardingText();

  const [queue, setQueue] = useState<StaffVettingQueue>(emptyVettingQueue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (can('review_worker_vetting')) {
        setQueue(await onboardingStaffRepository.queue(50));
      }
      setError(null);
    } catch {
      // Fail closed: an unreadable queue reads as "you cannot see this", never
      // as "there is nothing to review".
      setQueue(emptyVettingQueue);
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [can, text]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <AdminShell title="Worker vetting"><BrandLoadingState label="Worker vetting" /></AdminShell>;
  }

  return (
    <AdminShell title="Worker vetting">
      {error ? <AppText style={styles.error}>{error}</AppText> : null}

      <AdminSection title="Applications waiting">
        {!can('review_worker_vetting') ? (
          <AppText style={styles.hint}>{text('errorDenied')}</AppText>
        ) : queue.cases.length === 0 ? (
          <AppText style={styles.hint}>No applications are waiting for review.</AppText>
        ) : (
          queue.cases.map((item) => (
            <AdminRow
              key={item.subjectRef}
              label={item.subjectRef.slice(0, 12)}
              value={ot.workerState(item.workerState)}
              hint={`${item.hasCertificate ? 'Certificate submitted' : 'No certificate yet'}${
                item.waitingSince ? ` · waiting since ${item.waitingSince.slice(0, 10)}` : ''
              }`}
              tone={item.priority === 'high' ? 'warning' : 'neutral'}
            />
          ))
        )}
        {/* Stated on the screen, not only in a document, so nobody goes looking
            for a control that does not exist. */}
        <AppText style={styles.note}>
          Opening a case is a separate, logged action under its own capability. Decisions are
          recorded through the vetting runbooks and are not yet available from this screen.
        </AppText>
      </AdminSection>

      <AdminSection title="Certificate handling">
        <AppText style={styles.note}>
          A criminal-record certificate can be opened only with the
          `review_criminal_records` capability, and every open is recorded against the reviewer.
          Offence detail is never stored where a worker, a customer, or this screen can reach it.
        </AppText>
        <AppText style={styles.note}>
          The vetting policy `wps023-v1` is not legally approved. Adverse decisions on that basis
          should be escalated rather than taken routinely.
        </AppText>
      </AdminSection>
    </AdminShell>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  error: { color: colors.errorText, paddingHorizontal: spacing.lg },
  hint: { color: colors.textSecondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  note: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
