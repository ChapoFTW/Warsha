import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { helpUi, manualArticle, relatedManualArticles } from '@/src/help/help-registry';
import { useLocalization } from '@/src/i18n/localization';

export default function ManualArticleScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language, isRTL } = useLocalization();
  const words = helpUi[language];
  const article = manualArticle(language, id ?? '');
  if (!article) return <SafeAreaView style={styles.safe}><EmptyState title={words.noResults} action={words.back} onAction={() => router.replace('/help')} /></SafeAreaView>;
  const related = relatedManualArticles(article);
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
    <ScreenHeader title={article.title} subtitle={article.summary} />
    <View style={styles.body}>{article.body.split('\n').map((line, index) => {
      const heading = line.match(/^##\s+(.+)/);
      if (heading) return <AppText accessibilityRole="header" key={index} style={styles.heading}>{heading[1]}</AppText>;
      if (!line.trim()) return <View key={index} style={styles.space} />;
      const list = line.match(/^(\d+\.|-)\s+(.+)/);
      return <View key={index} style={[styles.line, isRTL && styles.reverse]}>
        {list ? <AppText style={styles.marker}>{list[1]}</AppText> : null}
        <AppText style={styles.paragraph}>{list ? list[2].replaceAll('**', '') : line.replaceAll('**', '')}</AppText>
      </View>;
    })}</View>
    <AppText style={styles.reviewed}>{words.reviewed}: {article.lastReviewedDate} · v{article.version}</AppText>
    {related.length ? <View style={styles.related}><AppText style={styles.heading}>{words.related}</AppText>{related.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => router.push({ pathname: '/help/manual/[id]', params: { id: item.id } })} style={[styles.relatedRow, isRTL && styles.reverse]}><AppText style={styles.relatedTitle}>{item.title}</AppText><MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted}/></Pressable>)}</View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={words.back} onPress={() => router.replace('/help')} style={styles.back}><AppText>{words.back}</AppText></Pressable>
  </ScrollView></SafeAreaView>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg }, body: { gap: spacing.xs }, heading: { fontSize: 18, lineHeight: 26, fontWeight: typography.bold, marginTop: spacing.md }, line: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }, reverse: { flexDirection: 'row-reverse' }, marker: { minWidth: 22, color: colors.textMuted }, paragraph: { flex: 1, fontSize: 15, lineHeight: 24, color: colors.textPrimary }, space: { height: spacing.sm }, reviewed: { color: colors.textMuted, fontSize: 12 }, related: { gap: spacing.sm }, relatedRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md }, relatedTitle: { flex: 1, fontWeight: typography.semibold }, back: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
});
