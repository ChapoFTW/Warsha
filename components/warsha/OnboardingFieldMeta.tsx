import { StyleSheet, View } from 'react-native';

import { StateBadge } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useWorkerText } from '@/src/worker/worker-copy';

export function OnboardingFieldMeta({
  label,
  required,
  privateField = false,
  purpose,
}: {
  label: string;
  required: boolean;
  privateField?: boolean;
  purpose: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const wt = useWorkerText();
  return (
    <View accessible style={styles.group}>
      <View style={[styles.row, isRTL && styles.reverse]}>
        <AppText style={styles.label}>{label}</AppText>
        <StateBadge label={required ? wt.text('required') : wt.text('optional')} compact />
        {privateField ? <StateBadge label={wt.text('privateLabel')} icon="lock" compact /> : null}
      </View>
      <AppText style={styles.purpose}>{purpose}</AppText>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  group: { gap: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  label: { fontSize: 15, lineHeight: 21, color: colors.textPrimary, fontWeight: typography.semibold },
  purpose: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
});
