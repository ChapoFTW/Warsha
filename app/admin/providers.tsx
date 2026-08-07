import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandLoadingState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAdmin } from '@/src/admin/admin-context';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import {
  providerStaffRepository,
  type ProviderHealthEntry,
  type ProviderRegistryEntry,
} from '@/src/providers/provider-staff-repository';

/**
 * WPS-024 external providers — registry and health.
 *
 * Staff only, inside the WPS-017 guarded shell, and gated again on
 * `review_legal_governance` because the server will demand it anyway.
 *
 * Two things this screen deliberately cannot show:
 *
 *   A CREDENTIAL. It shows the NAME of the secret a provider needs, so a
 *   reviewer knows what to rotate. No server function returns a value, so no
 *   amount of clicking reaches one.
 *
 *   A PERSON. Health is counted per provider and per operation, never per
 *   account. An operations screen that could answer "what did this worker
 *   submit" would be a second route to identity data behind a different
 *   capability, and the first thing anyone would do with it is look somebody up.
 *
 * "No data" is shown as no data, not as healthy. A provider nobody has called
 * since Tuesday is not working — it is unobserved, and a green figure against
 * an empty window is the kind of reassurance that gets believed during an
 * incident.
 */
export default function AdminProvidersScreen() {
  const styles = useThemedStyles(makeStyles);
  const { text, can } = useAdmin();

  const [registry, setRegistry] = useState<ProviderRegistryEntry[]>([]);
  const [health, setHealth] = useState<ProviderHealthEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const permitted = can('review_legal_governance');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (permitted) {
        const [registryRows, healthRows] = await Promise.all([
          providerStaffRepository.registry(),
          providerStaffRepository.health(),
        ]);
        setRegistry(registryRows);
        setHealth(healthRows);
      }
      setError(null);
    } catch {
      // Fail closed. An unreadable registry reads as "you cannot see this",
      // never as "nothing is registered" — the second would suggest Warsha
      // depends on no external service at all.
      setRegistry([]);
      setHealth([]);
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [permitted, text]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <AdminShell title="External providers">
        <BrandLoadingState label="External providers" />
      </AdminShell>
    );
  }

  return (
    <AdminShell title="External providers">
      {error ? <AppText style={styles.error}>{error}</AppText> : null}

      <AdminSection title="Registry">
        {!permitted ? (
          <AppText style={styles.hint}>{text('errorDenied')}</AppText>
        ) : registry.length === 0 ? (
          <AppText style={styles.hint}>No providers are registered.</AppText>
        ) : (
          registry.map((entry) => (
            <AdminRow
              key={entry.providerKey}
              label={entry.displayName}
              value={entry.enabled ? 'Enabled' : statusLabel(entry.status)}
              hint={`${entry.capabilityRole}${entry.fillsRole ? ' · fills the role' : ''} · ${
                entry.executionContext
              } · ${entry.introducedByWps} · ${
                entry.credentialSecretName ?? 'no credential'
              }`}
              tone={entry.enabled ? 'neutral' : 'warning'}
            />
          ))
        )}
        <AppText style={styles.note}>
          The secret NAME is shown so a reviewer knows what to rotate. No function returns a secret
          value, and no capability grants one.
        </AppText>
      </AdminSection>

      <AdminSection title="Health">
        {!permitted ? (
          <AppText style={styles.hint}>{text('errorDenied')}</AppText>
        ) : health.length === 0 ? (
          <AppText style={styles.hint}>No providers are registered.</AppText>
        ) : (
          health.map((entry) => (
            <AdminRow
              key={entry.providerKey}
              label={entry.displayName}
              value={availabilityLabel(entry)}
              hint={healthHint(entry)}
              tone={
                entry.consecutiveFailures >= 3
                  ? 'error'
                  : entry.consecutiveFailures > 0 || entry.totalTimeouts > 0
                    ? 'warning'
                    : 'neutral'
              }
            />
          ))
        )}
        <AppText style={styles.note}>
          Availability counts successes against calls actually made. A refusal by Warsha&apos;s own
          kill switch is excluded: counting our decision against a supplier would make the figure
          meaningless during exactly the incident it exists for.
        </AppText>
        <AppText style={styles.note}>
          Health is counted per provider and per operation. No account, no document and no extracted
          value is recorded here, so this screen cannot be used to look up a person.
        </AppText>
      </AdminSection>
    </AdminShell>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Active';
    case 'configured_not_enabled': return 'Configured, off';
    case 'implemented_awaiting_credential': return 'Awaiting credential';
    case 'approved_not_implemented': return 'Approved, not built';
    case 'retired': return 'Retired';
    default: return status;
  }
}

/** Never a percentage for an empty window. Unobserved is its own answer. */
function availabilityLabel(entry: ProviderHealthEntry): string {
  if (entry.samples24h === 0) return 'Not observed';
  if (entry.availability24h === null) return 'Not observed';
  return `${(entry.availability24h * 100).toFixed(1)}%`;
}

function healthHint(entry: ProviderHealthEntry): string {
  if (entry.samples24h === 0) {
    return entry.lastSuccessAt
      ? `No calls in 24h · last success ${entry.lastSuccessAt.slice(0, 16).replace('T', ' ')}`
      : 'No call has ever been recorded';
  }
  const latency = entry.latencyP95Ms !== null ? `p95 ${entry.latencyP95Ms} ms` : 'no latency recorded';
  return `${entry.samples24h} calls · ${latency} · ${entry.consecutiveFailures} consecutive failures`
    + ` · ${entry.totalTimeouts} timeouts · ${entry.totalRetries} retries`
    + ` · ${entry.providerVersion ?? 'version unknown'}`;
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
