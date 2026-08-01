import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { brandFontFamily, colors, motion, spacing } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useLocalization } from '@/src/i18n/localization';

export type BrandVariant = 'light' | 'dark';
export type BrandLanguage = 'en' | 'ar';

type BrandMarkProps = {
  size?: number;
  variant?: BrandVariant;
  color?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

function brandInk(variant: BrandVariant) {
  return variant === 'light' ? colors.textPrimary : colors.background;
}

/** The Current: a protective frame containing a concealed W-shaped flow trace. */
export function BrandMark({
  size = 40,
  variant = 'light',
  color,
  accessibilityLabel = 'Warsha',
}: BrandMarkProps) {
  const ink = color ?? brandInk(variant);
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
  const localization = useLocalization();
  const resolvedLanguage = language ?? localization.language;
  const isArabic = resolvedLanguage === 'ar';
  return (
    <Text
      accessibilityRole="text"
      style={[
        styles.wordmark,
        {
          color: brandInk(variant),
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
      <BrandWordmark size={size} variant={variant} language={resolvedLanguage} />
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
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const ink = color ?? brandInk(variant);
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

const styles = StyleSheet.create({
  lockup: { alignItems: 'center' },
  horizontal: { flexDirection: 'row', gap: spacing.sm },
  horizontalRTL: { flexDirection: 'row-reverse' },
  stacked: { gap: spacing.sm },
  wordmark: { letterSpacing: -0.25, textAlign: 'center' },
});
