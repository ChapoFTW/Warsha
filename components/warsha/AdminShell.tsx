import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing, typography } from '@/constants/theme';
import { useAdmin } from '@/src/admin/admin-context';
import { environmentTone } from '@/src/admin/admin-types';

import { BrandCard, StateBadge } from './BrandUI';
import { AppText } from './Typography';

/**
 * WPS-017 operational shell.
 *
 * Restrained application of The Current: serious, dense, and legible on a small
 * laptop. No decoration, no motto, no consumer imagery. The environment badge
 * is always visible because acting in the wrong environment is the costliest
 * mistake available here.
 */
export function AdminShell({
  title,
  subtitle,
  children,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: boolean;
  action?: ReactNode;
}) {
  const { session, simulated, isRTL, text } = useAdmin();
  const environment = session.environment ?? 'local';
  const environmentLabel = environment === 'production'
    ? text('environmentProduction')
    : environment === 'staging' ? text('environmentStaging') : text('environmentLocal');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={[styles.header, isRTL && styles.reverse]}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text('confirmCancel')}
            onPress={() => router.back()}
            style={styles.back}>
            <MaterialIcons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={20} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <View style={styles.headerCopy}>
          <AppText numberOfLines={1} style={styles.title}>{title}</AppText>
          <AppText numberOfLines={2} style={styles.subtitle}>{subtitle ?? text('platformSubtitle')}</AppText>
        </View>
        <View
          accessible
          accessibilityLabel={`${text('a11yEnvironment')}: ${environmentLabel}`}>
          <StateBadge
            label={environmentLabel}
            tone={environmentTone(environment)}
            icon={environment === 'production' ? 'warning' : 'dns'}
            compact
          />
        </View>
      </View>

      {environment === 'production' ? (
        <BrandCard style={styles.warning}>
          <AppText accessibilityRole="alert" style={styles.warningText}>{text('environmentWarning')}</AppText>
        </BrandCard>
      ) : null}

      {simulated ? (
        <BrandCard style={styles.simulated}>
          <AppText style={styles.simulatedText}>{text('simulatedData')}</AppText>
        </BrandCard>
      ) : null}

      {action ? <View style={styles.action}>{action}</View> : null}

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A dense operational row. Tables beat charts for staff work. */
export function AdminRow({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  value?: string;
  hint?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'error';
  icon?: ComponentProps<typeof MaterialIcons>['name'];
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { isRTL } = useAdmin();
  const body = (
    <View style={[styles.row, isRTL && styles.reverse]}>
      {icon ? <MaterialIcons name={icon} size={18} color={colors.textSecondary} /> : null}
      <View style={styles.rowCopy}>
        <AppText style={styles.rowLabel}>{label}</AppText>
        {hint ? <AppText style={styles.rowHint}>{hint}</AppText> : null}
      </View>
      {value !== undefined ? <StateBadge label={value} tone={tone} compact /> : null}
      {onPress ? (
        <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color={colors.textMuted} />
      ) : null}
    </View>
  );
  if (!onPress) {
    return <View accessible accessibilityLabel={accessibilityLabel ?? label}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

export function AdminSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText accessibilityRole="header" style={styles.sectionTitle}>{title}</AppText>
      {hint ? <AppText style={styles.sectionHint}>{hint}</AppText> : null}
      <BrandCard style={styles.sectionCard}>{children}</BrandCard>
    </View>
  );
}

/**
 * A metric is never rendered as a bare number: it carries its name, its
 * definition, and — when the server suppressed a small cohort — an explicit
 * "hidden" rather than a misleading zero.
 */
export function AdminMetric({
  name,
  value,
  definition,
  suppressed = false,
  suppressedLabel,
  metricLabel,
}: {
  name: string;
  value: string;
  definition?: string;
  suppressed?: boolean;
  suppressedLabel: string;
  metricLabel: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${metricLabel}: ${name}, ${suppressed ? suppressedLabel : value}`}
      style={styles.metric}>
      <AppText style={styles.metricName}>{name}</AppText>
      <AppText style={[styles.metricValue, suppressed && styles.metricSuppressed]}>
        {suppressed ? suppressedLabel : value}
      </AppText>
      {definition ? <AppText style={styles.metricDefinition}>{definition}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  reverse: { flexDirection: 'row-reverse' },
  back: {
    width: 40,
    height: 40,
    borderRadius: radii.xs,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: typography.semibold },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  warning: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
    padding: spacing.md,
  },
  warningText: { ...typography.bodySmall, color: colors.error, fontWeight: typography.semibold },
  simulated: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
  },
  simulatedText: { ...typography.caption, color: colors.warning, fontWeight: typography.semibold },
  action: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.caption, color: colors.textSecondary, fontWeight: typography.semibold },
  sectionHint: { ...typography.caption, color: colors.textMuted },
  sectionCard: { padding: spacing.md, gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingVertical: spacing.xs,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowLabel: { ...typography.bodySmall, fontWeight: typography.medium },
  rowHint: { ...typography.caption, color: colors.textMuted },
  pressed: { opacity: 0.7 },
  metric: { gap: 2, paddingVertical: spacing.sm, minHeight: 48 },
  metricName: { ...typography.caption, color: colors.textSecondary },
  metricValue: { fontSize: 20, lineHeight: 26, fontWeight: typography.semibold },
  metricSuppressed: { fontSize: 13, lineHeight: 20, color: colors.textMuted, fontWeight: typography.regular },
  metricDefinition: { ...typography.caption, color: colors.textMuted },
});
