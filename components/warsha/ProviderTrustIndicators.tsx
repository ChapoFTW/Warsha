import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';
import { useVerificationText } from '@/src/i18n/verification-translations';

import { AppText } from './Typography';

export function ProviderTrustIndicators({
  identityVerified,
  skillCertificateVerified,
  compact = false,
}: {
  identityVerified: boolean;
  skillCertificateVerified?: boolean;
  compact?: boolean;
}) {
  const { isRTL } = useLocalization();
  const vt = useVerificationText();
  if (!identityVerified && !skillCertificateVerified) return null;
  return (
    <View style={[styles.wrapper, isRTL && styles.reverse]}>
      {identityVerified ? (
        <View accessible accessibilityLabel={vt('identityVerified')} style={[styles.indicator, compact && styles.compact]}>
          <MaterialIcons name="verified" size={compact ? 15 : 19} color={colors.success} />
          <AppText numberOfLines={1} style={[styles.label, compact && styles.compactLabel]}>{vt('identityVerified')}</AppText>
        </View>
      ) : null}
      {skillCertificateVerified ? (
        <View accessible accessibilityLabel={vt('skillCertificateVerified')} style={[styles.indicator, compact && styles.compact]}>
          <MaterialIcons name="workspace-premium" size={compact ? 15 : 19} color={colors.success} />
          <AppText numberOfLines={1} style={[styles.label, compact && styles.compactLabel]}>{vt('skillCertificateVerified')}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  indicator: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.surface },
  compact: { minHeight: 28, paddingHorizontal: 8, gap: 4 },
  label: { color: colors.success, fontSize: 12, fontWeight: typography.semibold },
  compactLabel: { maxWidth: 116, fontSize: 9 },
});
