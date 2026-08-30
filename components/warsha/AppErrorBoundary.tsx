import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';

import { lightColors } from '@/constants/appearance';
import { getSupabaseClient } from '@/src/lib/supabase';
import { reportClientError } from '@/src/observability/client-error-reporter';

/**
 * What a person sees when the application throws, and how Warsha finds out.
 *
 * Expo Router renders a layout's exported `ErrorBoundary` in place of the tree
 * below it. That tree is every Warsha provider — localization, theme, auth,
 * appearance — so this component is rendering precisely because some of them
 * are not.
 *
 * Which is why it uses none of them.
 *
 * No `useLocalization`, no `useThemeColors`, no `AppText`: each is a provider
 * read, and a crash screen that depends on the thing that crashed is a blank
 * screen with extra steps. The words are English deliberately, and that is the
 * one place in Warsha where a hard-coded English string is the correct answer
 * rather than a defect — a person meeting this needs a button that works, not a
 * translated one that might not render.
 *
 * The colours are still Warsha's own. `lightColors` is a plain module export,
 * not a hook, so the brand palette can be read without entering the context
 * that failed. Light is chosen unconditionally because the appearance
 * preference lives in the provider tree this screen is standing in for.
 *
 * The report carries the error's class and nothing else — see
 * `client-error-reporter.ts` for why there is no message and no stack.
 */
export function AppErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  useEffect(() => {
    void reportClientError(
      (name, args) => getSupabaseClient().rpc(name, args),
      { surface: 'native', error, component: 'root', fatal: true },
    );
  }, [error]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Warsha stopped responding</Text>
      <Text style={styles.body}>
        Something went wrong on this screen. Your account and your bookings are
        not affected.
      </Text>
      <Pressable accessibilityRole="button" style={styles.button} onPress={retry}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: lightColors.canvas,
  },
  title: { fontSize: 20, fontWeight: '700', color: lightColors.textPrimary, textAlign: 'center' },
  body: { fontSize: 15, color: lightColors.textSecondary, textAlign: 'center', lineHeight: 21 },
  button: {
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 24,
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: lightColors.actionPrimaryBackground,
  },
  buttonText: { color: lightColors.actionPrimaryText, fontSize: 16, fontWeight: '600' },
});
