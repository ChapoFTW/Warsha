import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLoadingState, EmptyState } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useSupport } from '@/src/support/support-context';
import { supportRepository } from '@/src/support/support-repository';
import { useSupportText } from '@/src/support/support-translations';
import type { HelpCategoryDetail } from '@/src/support/support-types';

export default function HelpCategoryScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { key } = useLocalSearchParams<{ key: string }>();
  const support = useSupport();
  const copy = useSupportText();
  const { language } = useLocalization();
  const [category, setCategory] = useState<HelpCategoryDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    if (language === 'fr' || !support.accountKey || !key) return;
    setState('loading');
    try {
      setCategory(await supportRepository.getHelpCategory(support.accountKey, key, support.locale));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [key, language, support.accountKey, support.locale]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (language === 'fr') router.replace('/help'); }, [language]);

  if (language === 'fr') return <SafeAreaView style={styles.safe}><BrandLoadingState label={copy.text('loading')} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      {state === 'loading' ? <BrandLoadingState label={copy.text('loading')} /> : null}
      {state === 'error' ? <EmptyState
        icon="error-outline"
        title={copy.text('loadError')}
        action={copy.text('retry')}
        onAction={() => void load()}
      /> : null}
      {state === 'ready' && category ? <>
        <ScreenHeader title={category.title} subtitle={category.summary} />
        <View style={styles.list}>
          {category.articles.map(article => <Pressable
            key={article.slug}
            accessibilityRole="button"
            accessibilityLabel={`${article.title}. ${article.summary}`}
            onPress={() => router.push({ pathname: '/help/article/[slug]', params: { slug: article.slug } })}
            style={[styles.row, copy.isRTL && styles.reverse]}>
            <View style={styles.grow}>
              <AppText style={styles.title}>{article.title}</AppText>
              <AppText style={styles.body}>{article.summary}</AppText>
            </View>
            <MaterialIcons
              name={copy.isRTL ? 'chevron-left' : 'chevron-right'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>)}
        </View>
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg, maxWidth: 760, width: '100%', alignSelf: 'center' },
  reverse: { flexDirection: 'row-reverse' },
  grow: { flex: 1, gap: 3 },
  list: { gap: spacing.sm },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  title: { fontSize: 15, fontWeight: typography.semibold },
  body: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
});
