import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AdminMetric, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandLoadingState, EmptyState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAdmin } from '@/src/admin/admin-context';
import { adminRepository } from '@/src/admin/admin-repository';
import {
  formatEgpMinor,
  isSuppressedMetric,
  staffDashboards,
  type StaffAnalytics,
  type StaffDashboard,
} from '@/src/admin/admin-types';
import { findMetric, isDocumentedMetric } from '@/src/admin/metric-catalog';

/**
 * Dashboards are accessible tables, not decorative charts. Every number carries
 * its catalogued definition and its limitations, a suppressed cohort renders as
 * "hidden" rather than zero, and a period containing today is flagged partial.
 */
export default function AdminAnalyticsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { text, language, can } = useAdmin();
  const [dashboard, setDashboard] = useState<StaffDashboard>('executive');
  const [data, setData] = useState<StaffAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target: StaffDashboard) => {
    setLoading(true);
    try {
      setData(await adminRepository.getAnalytics(target));
      setError(null);
    } catch {
      setData(null);
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [text]);

  useEffect(() => { void load(dashboard); }, [dashboard, load]);

  const available = staffDashboards.filter(
    key => key !== 'financial' || can('view_financial_ledger'),
  );

  return (
    <AdminShell title={text('analyticsTitle')} subtitle={text('analyticsNoPii')} onBack>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {available.map(key => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: dashboard === key }}
            accessibilityLabel={key}
            onPress={() => setDashboard(key)}
            style={[styles.tab, dashboard === key && styles.tabActive]}>
            <AppText style={[styles.tabLabel, dashboard === key && styles.tabLabelActive]}>{key}</AppText>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? <BrandLoadingState label={text('a11yLoading')} /> : null}
      {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}

      {data ? (
        <>
          <AdminSection title={text('analyticsTimezone')}>
            <AppText style={styles.meta}>{`${data.from} → ${data.to} · ${data.timezone}`}</AppText>
            <AppText style={styles.meta}>{`${text('analyticsTimeBasis')}: ${data.timeBasis}`}</AppText>
            <AppText style={styles.meta}>{text('analyticsFreshness')}</AppText>
            {data.partial ? (
              <AppText accessibilityRole="alert" style={styles.partial}>{text('analyticsPartial')}</AppText>
            ) : null}
          </AdminSection>

          {Object.keys(data.metrics).length === 0 ? (
            <EmptyState title={text('analyticsEmpty')} icon="bar-chart" />
          ) : (
            <AdminSection title={dashboard}>
              <View accessibilityRole="summary" accessibilityLabel={text('a11yTable')}>
                {Object.entries(data.metrics)
                  .filter(([key]) => isDocumentedMetric(data.dashboard, key))
                  .map(([key, raw]) => {
                    const definition = findMetric(data.dashboard, key);
                    return (
                      <AdminMetric
                        key={key}
                        name={definition?.name ?? key}
                        value={renderValue(key, raw, language)}
                        definition={definition?.businessQuestion}
                        suppressed={isSuppressedMetric(raw)}
                        suppressedLabel={text('analyticsSuppressed')}
                        metricLabel={text('a11yMetric')}
                      />
                    );
                  })}
              </View>
            </AdminSection>
          )}
        </>
      ) : null}
    </AdminShell>
  );
}

function renderValue(key: string, raw: unknown, language: 'en' | 'ar'): string {
  if (raw === null || raw === undefined) return '—';
  if (key.endsWith('Minor')) return formatEgpMinor(raw as string, language);
  if (typeof raw === 'boolean') return raw ? 'yes' : 'no';
  if (typeof raw === 'number') return raw.toLocaleString(language === 'ar' ? 'ar-EG' : 'en-EG');
  return String(raw);
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
  meta: { ...typography.caption, color: colors.textMuted },
  partial: { ...typography.caption, color: colors.warning, marginTop: spacing.xs },
  error: { ...typography.bodySmall, color: colors.error },
});
