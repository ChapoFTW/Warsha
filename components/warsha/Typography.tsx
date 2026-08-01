import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { brandFontFamily, type BrandFontWeight, colors } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';

function styleWeight(style: TextProps['style']): BrandFontWeight {
  const weight = StyleSheet.flatten(style)?.fontWeight as TextStyle['fontWeight'];
  if (weight === '700' || weight === '800' || weight === '900' || weight === 'bold') return 'bold';
  if (weight === '600') return 'semibold';
  if (weight === '500') return 'medium';
  return 'regular';
}

export function AppText({ style, ...props }: TextProps) {
  const { isRTL } = useLocalization();
  const family = brandFontFamily(isRTL, styleWeight(style));
  return (
    <Text
      {...props}
      style={[
        {
          color: colors.textPrimary,
          fontFamily: family,
          textAlign: isRTL ? 'right' : 'left',
          writingDirection: isRTL ? 'rtl' : 'ltr',
        },
        style,
      ]}
    />
  );
}
