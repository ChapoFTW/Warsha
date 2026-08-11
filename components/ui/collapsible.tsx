import { PropsWithChildren, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const styles = useThemedStyles(makeStyles);
  const [isOpen, setIsOpen] = useState(false);
  const theme = useColorScheme() ?? 'light';
  const { isRTL } = useLocalization();

  // The disclosure chevron points along the reading direction when closed and
  // downward when open. In Arabic "along the reading direction" is leftward,
  // so the closed state is mirrored rather than rotated the same way.
  const closedRotation = isRTL ? '180deg' : '0deg';

  return (
    <ThemedView>
      <TouchableOpacity
        style={[styles.heading, isRTL && styles.headingRTL]}
        onPress={() => setIsOpen((value) => !value)}
        activeOpacity={0.8}>
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          color={theme === 'light' ? Colors.light.icon : Colors.dark.icon}
          style={{ transform: [{ rotate: isOpen ? '90deg' : closedRotation }] }}
        />

        <ThemedText type="defaultSemiBold">{title}</ThemedText>
      </TouchableOpacity>
      {isOpen && <ThemedView style={styles.content}>{children}</ThemedView>}
    </ThemedView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headingRTL: { flexDirection: 'row-reverse' },
  content: {
    marginTop: 6,
    // `marginStart`, not `marginLeft`: the indent belongs on the reading edge,
    // and a physical margin would indent Arabic content away from its own
    // heading.
    marginStart: 24,
  },
});
