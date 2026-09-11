import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from './BrandLogo';
import { GlobalPreferenceControls } from './GlobalPreferenceControls';
import { AppText } from './Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';

/**
 * What somebody sees when the app cannot reach its backend configuration.
 *
 * This screen used to read "Supabase configuration required", and under it:
 * "Set the Supabase URL and publishable key, or use mock data mode, then
 * restart Expo." In all three languages.
 *
 * It is the whole screen. Whoever opens the app sees it and nothing else. A
 * customer cannot set a publishable key, does not have Expo, and has never
 * heard of Supabase — and the one thing they CAN do, which is come back later,
 * was the one thing the screen did not say.
 *
 * So the screen says that, and the detail moves to where the person who can act
 * on it actually looks. In development it is still on screen, in English,
 * unlocalised — it is a note to an engineer, not product copy — and it is
 * logged either way, so a device that reaches this state in a build somebody
 * else is running still leaves evidence.
 */
const DEVELOPER_DETAIL = 'Set EXPO_PUBLIC_SUPABASE_URL and '
  + 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or turn on mock data mode, then '
  + 'restart the dev server.';

export function ConfigurationError() {
  const s = useThemedStyles(makeS);
  const { t } = useLocalization();

  useEffect(() => {
    console.warn(`[Warsha] Backend configuration missing. ${DEVELOPER_DETAIL}`);
  }, []);

  return (
    <SafeAreaView style={s.safe}>
      <GlobalPreferenceControls />
      <View style={s.content}>
        <BrandLogo size={64} />
        <AppText style={s.title}>{t('configurationRequired')}</AppText>
        <AppText style={s.body}>{t('configurationInstructions')}</AppText>
        {__DEV__ ? <AppText style={s.developer}>{DEVELOPER_DETAIL}</AppText> : null}
      </View>
    </SafeAreaView>
  );
}

const makeS = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  /* The two lines a user reads were already the h2 and bodySmall steps by
     value; they now say so, which is how `test:typography` counts them. */
  title: { ...typography.h2, fontWeight: typography.semibold, textAlign: 'center' },
  body: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  /* Only ever rendered under __DEV__, and deliberately quieter than the copy a
     user reads, so it cannot be mistaken for part of the product. `caption` is
     the smallest step on the scale, which is the right one for a note to an
     engineer sitting under the message a person is meant to read. */
  developer: {
    ...typography.caption,
    letterSpacing: 0,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
