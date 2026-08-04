import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandLoadingState, EmptyState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAdmin } from '@/src/admin/admin-context';
import { adminRepository } from '@/src/admin/admin-repository';
import { auditSources, type AuditRow, type AuditSource } from '@/src/admin/admin-types';

/**
 * Read-only audit explorer. Nothing here can be edited or deleted, no secret is
 * shown, there is no unrestricted export, and opening it is itself recorded.
 */
export default function AdminAuditScreen() {
  const styles = useThemedStyles(makeStyles);
  const { text } = useAdmin();
  const [source, setSource] = useState<AuditSource>('staff_audit');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target: AuditSource) => {
    setLoading(true);
    try {
      setRows(await adminRepository.searchAudit(target));
      setError(null);
    } catch {
      setRows([]);
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [text]);

  useEffect(() => { void load(source); }, [load, source]);

  return (
    <AdminShell title={text('auditTitle')} subtitle={text('auditReadOnly')} onBack>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {auditSources.map(key => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: source === key }}
            accessibilityLabel={`${text('auditSource')}: ${key}`}
            onPress={() => setSource(key)}
            style={[styles.tab, source === key && styles.tabActive]}>
            <AppText style={[styles.tabLabel, source === key && styles.tabLabelActive]}>{key}</AppText>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? <BrandLoadingState label={text('a11yLoading')} /> : null}
      {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}

      {!loading && rows.length === 0 ? <EmptyState title={text('analyticsEmpty')} icon="fact-check" /> : null}

      {rows.length > 0 ? (
        <AdminSection title={source} hint={text('auditSelfLogged')}>
          {rows.map(row => (
            <AdminRow
              key={row.id}
              label={row.action}
              hint={[
                row.at.slice(0, 16).replace('T', ' '),
                `${text('auditActor')}: ${row.actorId ?? '—'}`,
                `${text('auditTarget')}: ${row.entityType}${row.entityId ? ` ${row.entityId}` : ''}`,
              ].join(' · ')}
              value={typeof row.breakGlass === 'boolean' && row.breakGlass ? 'break-glass' : undefined}
              tone="error"
            />
          ))}
        </AdminSection>
      ) : null}
    </AdminShell>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  tabs: { gap: spacing.sm, paddingBottom: spacing.sm },
  tab: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.surfaceElevated, borderColor: colors.borderStrong },
  tabLabel: { ...typography.caption, color: colors.textSecondary },
  tabLabelActive: { color: colors.textPrimary, fontWeight: typography.semibold },
  error: { ...typography.bodySmall, color: colors.error },
});
