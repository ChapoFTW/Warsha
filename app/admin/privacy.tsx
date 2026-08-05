import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandLoadingState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAdmin } from '@/src/admin/admin-context';
import { privacyStaffRepository } from '@/src/privacy/privacy-staff-repository';
import type { RetentionPreview, StaffPrivacyRequest } from '@/src/privacy/privacy-staff-types';

/**
 * WPS-022 privacy operations.
 *
 * What this screen deliberately CANNOT do, and each absence is the point:
 *
 *   - it cannot read the contents of anybody's export. An export is built for
 *     one person, and there is no staff RPC that returns its manifest;
 *   - it cannot see why someone asked to leave, or which blockers they hit —
 *     only that a request exists and what state it is in;
 *   - it cannot execute retention. The only retention verb here is a preview,
 *     and the preview reports that execution is disabled;
 *   - it shows a truncated account reference, never a full identifier.
 *
 * Every read below is a capability-gated RPC and is recorded in the WPS-018
 * sensitive-access log before it returns.
 */
export default function AdminPrivacyScreen() {
  const styles = useThemedStyles(makeStyles);
  const { text, can } = useAdmin();

  const [requests, setRequests] = useState<StaffPrivacyRequest[]>([]);
  const [previews, setPreviews] = useState<RetentionPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (can('review_privacy_requests')) {
        setRequests(await privacyStaffRepository.requests(50));
      }
      if (can('review_retention')) {
        setPreviews(await privacyStaffRepository.retentionOverview());
      }
      setError(null);
    } catch {
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [can, text]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <AdminShell title="Privacy"><BrandLoadingState label="Privacy" /></AdminShell>;

  return (
    <AdminShell title="Privacy">
      {error ? <AppText style={styles.error}>{error}</AppText> : null}

      <AdminSection title="Deletion requests">
        {!can('review_privacy_requests') ? (
          <AppText style={styles.hint}>{text('errorDenied')}</AppText>
        ) : requests.length === 0 ? (
          <AppText style={styles.hint}>No deletion requests.</AppText>
        ) : (
          requests.map(request => (
            <AdminRow
              key={request.id}
              label={request.subjectRef}
              value={request.status}
              hint={`Requested ${request.requestedAt.slice(0, 10)} · ${
                request.blockerCount === 0 ? 'no blockers' : `${request.blockerCount} blocker(s)`
              }`}
              tone={request.status === 'blocked' ? 'warning' : 'neutral'}
            />
          ))
        )}
        {/* Stated on the screen, not only in a document, so nobody goes looking
            for a control that does not exist. */}
        <AppText style={styles.note}>
          Request contents are not visible to staff. An export is built for one person and is
          readable only by them.
        </AppText>
      </AdminSection>

      <AdminSection title="Retention rules">
        {!can('review_retention') ? (
          <AppText style={styles.hint}>{text('errorDenied')}</AppText>
        ) : (
          previews.map(preview => (
            <AdminRow
              key={preview.ruleKey}
              label={preview.ruleKey}
              value={preview.executionEnabled ? 'execution enabled' : 'execution disabled'}
              hint={`Legal review: ${preview.legalReviewStatus} · ${
                preview.supported
                  ? `${preview.candidateRows ?? 0} row(s) would be affected`
                  : 'no automated counter, reviewed manually'
              }`}
              tone={preview.legalReviewStatus === 'approved' ? 'neutral' : 'warning'}
            />
          ))
        )}
        <AppText style={styles.note}>
          Preview only. Nothing on this screen deletes or anonymizes anything, and production
          execution stays disabled until a duration has had professional review.
        </AppText>
      </AdminSection>
    </AdminShell>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  note: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: spacing.sm },
  error: { fontSize: 13, fontWeight: typography.semibold, color: colors.errorText },
});
