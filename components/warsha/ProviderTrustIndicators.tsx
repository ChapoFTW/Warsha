import { StyleSheet, View } from 'react-native';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useVerificationText } from '@/src/i18n/verification-translations';

import { StateBadge } from './BrandUI';

export function ProviderTrustIndicators({
  identityVerified,
  skillCertificateVerified,
  professionalCertificateVerified,
  compact = false,
}: {
  identityVerified: boolean;
  skillCertificateVerified?: boolean;
  professionalCertificateVerified?: boolean;
  compact?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { isRTL, language } = useLocalization();
  const vt = useVerificationText();
  if (!identityVerified && !skillCertificateVerified && !professionalCertificateVerified) return null;
  return (
    <View style={[styles.wrapper, isRTL && styles.reverse]}>
      {identityVerified ? (
        <StateBadge label={vt('identityVerified')} tone="success" icon="verified" compact={compact} />
      ) : null}
      {skillCertificateVerified ? (
        <StateBadge label={vt('skillCertificateVerified')} tone="success" icon="workspace-premium" compact={compact} />
      ) : null}
      {professionalCertificateVerified ? (
        <StateBadge label={language === 'ar' ? 'شهادة مهنية موثقة' : 'Professional certificate verified'} tone="success" icon="verified-user" compact={compact} />
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  wrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
});
