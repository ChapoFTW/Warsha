import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { brandFontFamily, motion, spacing, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useLocalization } from '@/src/i18n/localization';

/**
 * Which ink the mark uses, expressed as the surface it sits on rather than as a
 * literal colour — which is what makes it survive a theme change untouched.
 *
 * `light` = the ordinary canvas or card. Resolves to `brandMark`: near-white on
 * the dark theme, near-black on the light theme.
 * `dark`  = a primary-action surface (a filled button, a solid brand circle).
 * Resolves to `actionPrimaryText`, which is the inverse of whatever that
 * surface is in the active theme.
 *
 * The geometry below is untouched by WPS-020. Only the ink is theme-aware.
 */
export type BrandVariant = 'light' | 'dark';
export type BrandLanguage = 'en' | 'ar';

type BrandMarkProps = {
  size?: number;
  variant?: BrandVariant;
  color?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

function brandInk(variant: BrandVariant, colors: ThemeColors) {
  return variant === 'light' ? colors.brandMark : colors.actionPrimaryText;
}

/** The Current: a protective frame containing a concealed W-shaped flow trace. */
export function BrandMark({
  size = 40,
  variant = 'light',
  color,
  accessibilityLabel = 'Warsha',
}: BrandMarkProps) {
  const colors = useThemeColors();
  const ink = color ?? brandInk(variant, colors);
  return (
    <Svg
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none">
      <Rect x="2" y="2" width="28" height="28" rx="7.2" stroke={ink} strokeWidth="2.5" />
      <Path
        d="M2 13.2 L8.4 23.2 L14 14.8 L19.6 21.2 L30 9.2"
        stroke={ink}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BrandWordmark({
  size = 40,
  variant = 'light',
  language,
}: Pick<BrandMarkProps, 'size' | 'variant'> & { language?: BrandLanguage }) {
  const styles = useThemedStyles(makeStyles);
  const colors = useThemeColors();
  const localization = useLocalization();
  const resolvedLanguage = language ?? localization.language;
  const isArabic = resolvedLanguage === 'ar';
  return (
    <Text
      accessibilityRole="text"
      style={[
        styles.wordmark,
        {
          color: brandInk(variant, colors),
          fontFamily: brandFontFamily(isArabic, 'bold'),
          fontSize: size * (isArabic ? 0.43 : 0.38),
          lineHeight: size * 0.58,
          writingDirection: isArabic ? 'rtl' : 'ltr',
        },
      ]}>
      {isArabic ? 'ورشة' : 'Warsha'}
    </Text>
  );
}

export function BrandLockup({
  size = 40,
  variant = 'light',
  language,
  layout = 'horizontal',
}: Pick<BrandMarkProps, 'size' | 'variant'> & {
  language?: BrandLanguage;
  layout?: 'horizontal' | 'stacked';
}) {
  const styles = useThemedStyles(makeStyles);
  const localization = useLocalization();
  const resolvedLanguage = language ?? localization.language;
  const isArabic = resolvedLanguage === 'ar';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={isArabic ? 'ورشة' : 'Warsha'}
      style={[
        styles.lockup,
        layout === 'horizontal' ? styles.horizontal : styles.stacked,
        layout === 'horizontal' && isArabic && styles.horizontalRTL,
      ]}>
      <BrandMark size={size} variant={variant} accessibilityLabel="" />
      <BrandWordmark size={size} variant={variant} language={resolvedLanguage === 'ar' ? 'ar' : 'en'} />
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function BrandLoadingMark({
  size = 48,
  variant = 'light',
  color,
  style,
  accessibilityLabel = 'Loading',
}: BrandMarkProps) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const ink = color ?? brandInk(variant, colors);
  const offset = useMemo(() => progress.interpolate({ inputRange: [0, 1], outputRange: [58, -32] }), [progress]);

  useEffect(() => {
    if (reducedMotion) {
      progress.stopAnimation();
      progress.setValue(0.35);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: motion.deliberate,
        useNativeDriver: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);

  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} style={style}>
      <Svg width={size} height={size} viewBox="0 0 32 32" fill="none" accessibilityElementsHidden>
        <Rect x="2" y="2" width="28" height="28" rx="7.2" stroke={ink} strokeWidth="2.5" />
        <AnimatedPath
          d="M2 13.2 L8.4 23.2 L14 14.8 L19.6 21.2 L30 9.2"
          stroke={ink}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="34 24"
          strokeDashoffset={reducedMotion ? 0 : offset}
        />
      </Svg>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  lockup: { alignItems: 'center' },
  horizontal: { flexDirection: 'row', gap: spacing.sm },
  horizontalRTL: { flexDirection: 'row-reverse' },
  stacked: { gap: spacing.sm },
  wordmark: { letterSpacing: -0.25, textAlign: 'center' },
});
