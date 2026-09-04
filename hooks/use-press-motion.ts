import { useCallback, useMemo, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

import { motion, pressFeedback } from '@/constants/theme';

import { useReducedMotion } from './use-reduced-motion';

/**
 * The one way a Warsha surface answers a finger.
 *
 * Before this, a press was `opacity: 0.72` in five files and nothing at all in
 * sixty-six others — the bottom tab bar, every category tile, every provider
 * row. The product was not unresponsive; it simply never said so.
 *
 * Two properties only, both of which the compositor can animate off the
 * JavaScript thread: `transform` and `opacity`. No layout property is touched,
 * so a press cannot cost a reflow however many of these are on screen.
 *
 * Down is faster than up. Contact should feel immediate (`motion.press`) and
 * release should settle rather than snap (`motion.quick`) — which is the whole
 * difference between a control that feels physical and one that flickers. There
 * is no overshoot on the way back: Warsha does not bounce.
 *
 * Under reduced motion the hook returns no transform at all and leaves the
 * press to `Pressable`'s own instant state. The feedback does not disappear;
 * it stops being animated, which is what the setting actually asks for.
 */
export function usePressMotion({ scale = pressFeedback.controlScale, fade = true }: {
  /** `pressFeedback.surfaceScale` for a card or tile, the default for a control. */
  scale?: number;
  /** A pressable that already changes its own ground can skip the tonal dip. */
  fade?: boolean;
} = {}) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  const run = useCallback((toValue: number, duration: number) => {
    Animated.timing(progress, {
      toValue,
      duration,
      easing: Easing.bezier(...motion.easing),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const onPressIn = useCallback(() => {
    if (reducedMotion) return;
    run(1, motion.press);
  }, [reducedMotion, run]);

  const onPressOut = useCallback(() => {
    if (reducedMotion) return;
    run(0, motion.quick);
  }, [reducedMotion, run]);

  const animatedStyle = useMemo<Animated.WithAnimatedObject<ViewStyle> | null>(() => {
    if (reducedMotion) return null;
    return {
      transform: [{
        scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }),
      }],
      ...(fade
        ? { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, pressFeedback.opacity] }) }
        : null),
    };
  }, [fade, progress, reducedMotion, scale]);

  return { onPressIn, onPressOut, animatedStyle, reducedMotion } as const;
}
