import { Text, TextProps } from 'react-native';
import { colors, typography } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';

export function AppText({ style, ...props }: TextProps) {
  const { isRTL } = useLocalization();
  return <Text {...props} style={[{ color: colors.textPrimary, fontFamily: typography.family, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' }, style]} />;
}
