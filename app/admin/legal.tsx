import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandLoadingState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAdmin } from '@/src/admin/admin-context';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import {
  emptyGovernanceOverview,
  legalStaffRepository,
  type LegalGovernanceOverview,
} from '@/src/legal/legal-staff-repository';

/**
 * WPS-024 legal governance.
 *
 * Inside `AdminShell`, the WPS-017 guarded shell: the admin layout checks
 * `surfaceEnabled`, `platformReady` and `isStaff` before this renders, and
 * `can()` gates the content on the capability the server will demand anyway.
 *
 * Counts, never people. The server function this reads returns how many
 * accounts accepted and declined each version and cannot return which — a
 * reviewer confirming that eleven workers declined the new terms has no
 * business knowing which eleven, and the surface is built so the question
 * cannot be asked.
 *
 * There is no publish control, and that is deliberate rather than unfinished.
 * Publishing a version means editing the corpus, recomputing its hash, arguing
 * about its change class and shipping a migration; a button here would produce
 * a register row pointing at text that does not exist. The RPC is implemented,
 * capability-checked, dual-control and covered by pgTAP. Recorded in WES-024 §9.
 */
export default function AdminLegalScreen() {
  const styles = useThemedStyles(makeStyles);
  const { text, can } = useAdmin();

  const [overview, setOverview] = useState<LegalGovernanceOverview>(emptyGovernanceOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (can('review_legal_governance')) {
        setOverview(await legalStaffRepository.overview());
      }
      setError(null);
    } catch {
      // Fail closed: an unreadable register reads as "you cannot see this",
      // never as "there is nothing registered".
      setOverview(emptyGovernanceOverview);
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [can, text]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <AdminShell title="Legal governance"><BrandLoadingState label="Legal governance" /></AdminShell>;
  }

  const permitted = can('review_legal_governance');

  return (
    <AdminShell title="Legal governance">
      {error ? <AppText style={styles.error}>{error}</AppText> : null}

      <AdminSection title="Published documents">
        {!permitted ? (
          <AppText style={styles.hint}>{text('errorDenied')}</AppText>
        ) : overview.documents.length === 0 ? (
          <AppText style={styles.hint}>No documents are registered.</AppText>
        ) : (
          overview.documents.map((document) => (
            <AdminRow
              key={document.documentKey}
              label={document.documentKey}
              value={`v${document.version}`}
              hint={`${document.changeClass} · effective ${document.effectiveAt}${
                document.requiresAcceptance
                  ? ` · ${document.accepted} accepted, ${document.declined} declined`
                  : ' · incorporated by reference'
              }`}
            />
          ))
        )}
        <AppText style={styles.note}>
          Acceptance figures are counts. This screen cannot show which accounts accepted or
          declined, and no capability grants that.
        </AppText>
      </AdminSection>

      <AdminSection title="Subprocessors">
        {!permitted ? (
          <AppText style={styles.hint}>{text('errorDenied')}</AppText>
        ) : (
          overview.subprocessors.map((entry) => (
            <AdminRow
              key={entry.key}
              label={entry.name}
              value={entry.status === 'in_use' ? 'In use' : entry.status === 'retired' ? 'Retired' : 'Approved, not integrated'}
              hint={`Agreement ${entry.agreementStatus}${
                entry.trainingProhibited ? ' · training prohibited' : ' · TRAINING NOT PROHIBITED'
              }`}
              tone={entry.status === 'in_use' && !entry.trainingProhibited ? 'warning' : 'neutral'}
            />
          ))
        )}
        <AppText style={styles.note}>
          Moving a subprocessor from approved to in use is a material change: a new version of the
          privacy documents, an updated register, and renewed acceptance before any data reaches it.
        </AppText>
      </AdminSection>

      <AdminSection title="Machine processing">
        {!permitted ? (
          <AppText style={styles.hint}>{text('errorDenied')}</AppText>
        ) : (
          overview.aiUses.map((use) => (
            <AdminRow
              key={use.key}
              label={use.name}
              value={use.status === 'in_use' ? 'In use' : 'Approved, not integrated'}
              hint={`${use.coversIdentityData ? 'Identity data' : 'No identity data'} · ${
                use.permittedForTraining ? 'TRAINING PERMITTED' : 'not used for training'
              }`}
              tone={use.permittedForTraining ? 'warning' : 'neutral'}
            />
          ))
        )}
        <AppText style={styles.note}>
          A database constraint prevents a declared use from covering identity data and being
          permitted for training at the same time. Changing that requires a migration, not a
          setting.
        </AppText>
      </AdminSection>

      <AdminSection title="Processing activities">
        {!permitted ? (
          <AppText style={styles.hint}>{text('errorDenied')}</AppText>
        ) : (
          overview.processingActivities.map((activity) => (
            <AdminRow
              key={activity.key}
              label={activity.name}
              value={activity.reviewStatus}
              tone={activity.reviewStatus === 'approved' ? 'neutral' : 'warning'}
            />
          ))
        )}
        <AppText style={styles.note}>
          Every lawful basis is recorded as proposed and pending legal review. None has been
          confirmed by advice, and no compliance position should be stated on this basis.
        </AppText>
      </AdminSection>

      <AdminSection title="Enforcement">
        <AdminRow
          label="Legal centre"
          value={overview.configuration.legalCentreEnabled ? 'Enabled' : 'Disabled'}
        />
        <AdminRow
          label="Re-consent gate"
          value={overview.configuration.reconsentEnforced ? 'Enforced' : 'Not enforced'}
          hint={`Grace ${overview.configuration.graceDays} days`}
        />
        <AppText style={styles.note}>
          Enabling the re-consent gate blocks booking and worker capability for every account with
          an outstanding material agreement. Nobody has accepted a version that did not exist
          before this release, so enabling it without a migration path would block everyone at once.
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
