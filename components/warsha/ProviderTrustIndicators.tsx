import { StyleSheet, View } from 'react-native';

import { spacing } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';
import { useVerificationText } from '@/src/i18n/verification-translations';

import { StateBadge } from './BrandUI';

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
        <StateBadge label={vt('identityVerified')} tone="success" icon="verified" compact={compact} />
      ) : null}
      {skillCertificateVerified ? (
        <StateBadge label={vt('skillCertificateVerified')} tone="success" icon="workspace-premium" compact={compact} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
});
