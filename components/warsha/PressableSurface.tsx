import { forwardRef, useCallback, useState } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';

import { pressFeedback } from '@/constants/theme';
import { usePressMotion } from '@/hooks/use-press-motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  /**
   * `surface` for a card, tile or row; `control` for a button or chip. The only
   * difference is how far it travels: a large surface may move slightly more
   * before the movement becomes noticeable, a small one may not.
   */
  feedback?: 'surface' | 'control';
  /** A pressable that already swaps its own ground on press skips the tonal dip. */
  fade?: boolean;
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
};

/**
 * A `Pressable` that answers the finger.
 *
 * Before this, a press was `opacity: 0.72` in five files and nothing at all in
 * sixty-six others — the bottom tab bar, every category tile, every provider
 * row. The product was not unresponsive; it simply never said so.
 *
 * Same API as `Pressable`, including a function `style`, which is the point: a
 * component gets the feedback by using the shared primitive rather than by
 * remembering to write it. Only `transform` and `opacity` move, both off the
 * JavaScript thread, so a screen full of these costs no layout work.
 *
 * The pressed state is tracked here rather than read from `Pressable`'s render
 * prop because `Animated` has to be handed a flat style array to find the value
 * it is driving — a function reaching it would animate nothing, silently. The
 * function form still works for callers; it is resolved before Animated sees it.
 *
 * There is no ripple configuration, no haptic and no sound. Warsha's motion is
 * felt rather than watched, and a second channel on every press would be the
 * "animation demo" this primitive exists to avoid.
 */
export const PressableSurface = forwardRef<View, Props>(function PressableSurface(
  { feedback = 'control', fade = true, style, onPressIn, onPressOut, ...props },
  ref,
) {
  const [pressed, setPressed] = useState(false);
  const motion = usePressMotion({
    scale: feedback === 'surface' ? pressFeedback.surfaceScale : pressFeedback.controlScale,
    fade,
  });

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>((event) => {
    setPressed(true);
    motion.onPressIn();
    onPressIn?.(event);
  }, [motion, onPressIn]);

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>((event) => {
    setPressed(false);
    motion.onPressOut();
    onPressOut?.(event);
  }, [motion, onPressOut]);

  const resolved = typeof style === 'function'
    ? style({ pressed })
    : style;

  return (
    <AnimatedPressable
      ref={ref}
      {...props}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[resolved, motion.animatedStyle]}
    />
  );
});
