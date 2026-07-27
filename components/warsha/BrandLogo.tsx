import Svg, { Circle, Path } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';
import { AppText } from './Typography';
import { colors, typography } from '@/constants/theme';

type BrandVariant = 'light' | 'dark';
type BrandLogoProps = { size?: number; variant?: BrandVariant; wordmark?: boolean; tagline?: boolean; layout?: 'horizontal' | 'stacked' };

function brandInk(variant: BrandVariant) { return variant === 'light' ? colors.white : colors.background; }

export function BrandIcon({ size = 40, variant = 'light' }: Pick<BrandLogoProps, 'size' | 'variant'>) {
  const ink = brandInk(variant);
  return <Svg accessibilityRole="image" accessibilityLabel="Warsha" width={size} height={size} viewBox="0 0 100 100">
    <Path d="M30 17C21 26 20 46 32 63" fill="none" stroke={ink} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M32 63L50 29L68 63" fill="none" stroke={ink} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M70 17C79 26 80 46 68 63" fill="none" stroke={ink} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx="50" cy="19" r="5.5" fill={ink} />
  </Svg>;
}

export function BrandWordmark({ size = 40, variant = 'light' }: Pick<BrandLogoProps, 'size' | 'variant'>) {
  return <AppText style={[styles.wordmark, { color: brandInk(variant), fontSize: size * 0.37, lineHeight: size * 0.45 }]}>WARSHA</AppText>;
}

export function BrandLogo({ size = 40, variant = 'light', wordmark = false, tagline = false, layout = tagline ? 'stacked' : 'horizontal' }: BrandLogoProps) {
  if (!wordmark && !tagline) return <BrandIcon size={size} variant={variant} />;
  return <View accessible accessibilityRole="image" accessibilityLabel="Warsha. Your work. Our mission." style={[styles.lockup, layout === 'horizontal' && styles.horizontal]}>
    <BrandIcon size={size} variant={variant} />
    {wordmark ? <BrandWordmark size={size} variant={variant} /> : null}
    {tagline ? <AppText style={[styles.tagline, { color: variant === 'light' ? colors.textSecondary : '#666666', fontSize: size * 0.12, lineHeight: size * 0.16 }]}>YOUR WORK. OUR MISSION.</AppText> : null}
  </View>;
}

const styles = StyleSheet.create({
  lockup: { alignItems: 'center', gap: 4 },
  horizontal: { flexDirection: 'row', gap: 10 },
  wordmark: { fontWeight: typography.medium, letterSpacing: 7, textAlign: 'center' },
  tagline: { fontWeight: typography.medium, letterSpacing: 1.6, textAlign: 'center' },
});
