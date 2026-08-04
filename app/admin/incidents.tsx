import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandLoadingState, EmptyState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAdmin } from '@/src/admin/admin-context';
import { adminRepository } from '@/src/admin/admin-repository';
import type { OperationalIncident } from '@/src/admin/admin-types';

/** Incidents are opened and updated by a person. No automated detection exists. */
export default function AdminIncidentsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { text } = useAdmin();
  const [incidents, setIncidents] = useState<OperationalIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setIncidents(await adminRepository.getIncidents());
      setError(null);
    } catch {
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [text]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminShell title={text('incidentsTitle')} subtitle={text('incidentsManual')} onBack>
      {loading ? <BrandLoadingState label={text('a11yLoading')} /> : null}
      {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}

      {!loading && incidents.length === 0 ? (
        <EmptyState title={text('queueEmpty')} icon="check-circle" />
      ) : null}

      {incidents.map(incident => (
        <AdminSection
          key={incident.incidentId}
          title={`${incident.incidentRef} · ${incident.category}`}
          hint={incident.internalSummary}>
          <AdminRow
            label={text('incidentSeverity')}
            value={incident.severity}
            tone={incident.severity === 'sev1' || incident.severity === 'sev2' ? 'error' : 'warning'}
          />
          <AdminRow label={text('caseStatus')} value={incident.status} />
          <AdminRow label={text('incidentCommander')} value={incident.commanderId ?? '—'} />
          <AdminRow label={text('incidentAffected')} value={incident.affectedSystems.join(', ') || '—'} />
          {incident.publicSummary ? (
            <AdminRow label={text('incidentPublicSummary')} hint={incident.publicSummary} />
          ) : null}
          <AdminRow label={text('incidentPostmortem')} value={incident.postmortemReference ?? '—'} />
          {incident.timeline.map(entry => (
            <AdminRow
              key={entry.id}
              label={entry.eventType}
              hint={`${entry.createdAt.slice(0, 16).replace('T', ' ')} · ${entry.detail}`}
            />
          ))}
        </AdminSection>
      ))}
    </AdminShell>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  error: { ...typography.bodySmall, color: colors.error },
});
