import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandLoadingState, BrandTextField, EmptyState } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { helpUi, manualArticles, searchManual, type ManualArticle } from '@/src/help/help-registry';
import { useLocalization } from '@/src/i18n/localization';
import { useSupport } from '@/src/support/support-context';
import { useSupportText } from '@/src/support/support-translations';
import type { HelpArticleSummary, HelpSearchResult, SupportSurface } from '@/src/support/support-types';
import { supportSurfaces } from '@/src/support/support-types';

/**
 * WPS-019 Help Center.
 *
 * The surface a customer came from is passed in and drives which articles are
 * offered first. Opening help from a payment screen should not begin with an
 * article about writing a quote.
 */
export default function HelpCenterScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ surface?: string }>();
  const surface = supportSurfaces.includes(params.surface as SupportSurface)
    ? params.surface as SupportSurface
    : undefined;
  const support = useSupport();
  const copy = useSupportText();
  const { language } = useLocalization();
  const manualCopy = helpUi[language];
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<HelpSearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const legacyHelpAvailable = language !== 'fr';
  useEffect(() => {
    if (legacyHelpAvailable) void support.loadHelpCenter(surface);
  }, [surface, support.locale, legacyHelpAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runSearch(value: string) {
    setQuery(value);
    if (value.trim().length < 2) { setSearchResult(null); return; }
    if (!legacyHelpAvailable) { setSearchResult(null); return; }
    setSearching(true);
    try {
      setSearchResult(await support.search(value, surface));
    } catch {
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  }

  const center = support.helpCenter;
  const manualMatches = query.trim().length >= 2 ? searchManual(language, query) : [];
  const customerManual = manualArticles(language, 'customer').filter(article => article.audience !== 'all');
  const workerManual = manualArticles(language, 'worker').filter(article => article.audience !== 'all');
  const sharedManual = manualArticles(language).filter(article => article.audience === 'all');

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={copy.text('helpCenter')} subtitle={copy.text('helpCenterIntro')} />

      <View style={styles.searchRow}>
        <BrandTextField
          value={query}
          onChangeText={value => void runSearch(value)}
          placeholder={copy.text('searchPlaceholder')}
          accessibilityLabel={copy.text('searchAction')}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.text('clearSearch')}
          onPress={() => { setQuery(''); setSearchResult(null); }}
          style={styles.clear}><MaterialIcons name="close" size={20} color={colors.textSecondary} /></Pressable> : null}
      </View>

      {searching ? <BrandLoadingState label={copy.text('loading')} /> : null}

      {query.trim().length >= 2 ? <Section title={manualCopy.manual}>
        {manualMatches.length
          ? manualMatches.map(article => <ManualArticleRow key={`${article.audience}:${article.id}`} article={article} />)
          : <AppText style={styles.categoryBody}>{manualCopy.noResults}</AppText>}
      </Section> : <>
        <AppText style={styles.categoryBody}>{manualCopy.manualIntro}</AppText>
        <Section title={manualCopy.customerGuide}>{customerManual.map(article => <ManualArticleRow key={article.id} article={article} />)}</Section>
        <Section title={manualCopy.workerGuide}>{workerManual.map(article => <ManualArticleRow key={article.id} article={article} />)}</Section>
        {sharedManual.map(article => <ManualArticleRow key={article.id} article={article} />)}
      </>}

      {legacyHelpAvailable && !searching && searchResult ? <SearchResults result={searchResult} /> : null}

      {legacyHelpAvailable && !searchResult && support.suggestions && support.suggestions.recent.length > 0 ? <Section title={copy.text('recentSearches')}>
        <View style={[styles.chips, copy.isRTL && styles.reverse]}>
          {support.suggestions.recent.map(item => <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={item}
            onPress={() => void runSearch(item)}
            style={styles.chip}><AppText style={styles.chipText}>{item}</AppText></Pressable>)}
        </View>
      </Section> : null}

      {legacyHelpAvailable && !searchResult && support.suggestions && support.suggestions.popular.length > 0 ? <Section title={copy.text('popularSearches')}>
        <View style={[styles.chips, copy.isRTL && styles.reverse]}>
          {support.suggestions.popular.map(item => <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={item}
            onPress={() => void runSearch(item)}
            style={styles.chip}><AppText style={styles.chipText}>{item}</AppText></Pressable>)}
        </View>
      </Section> : null}

      {legacyHelpAvailable && !searchResult && support.loading && !center ? <BrandLoadingState label={copy.text('loading')} /> : null}

      {legacyHelpAvailable && !searchResult && support.error && !center ? <EmptyState
        icon="error-outline"
        title={copy.text('loadError')}
        action={copy.text('retry')}
        onAction={() => void support.loadHelpCenter(surface)}
      /> : null}

      {legacyHelpAvailable && !searchResult && center ? <>
        {center.suggested.length > 0 ? <Section title={copy.text('suggestedForYou')}>
          {center.suggested.map(article => <ArticleRow key={article.slug} article={article} />)}
        </Section> : null}

        <Section title={copy.text('browseCategories')}>
          {center.categories.map(category => <Pressable
            key={category.categoryKey}
            accessibilityRole="button"
            accessibilityLabel={`${category.title}. ${category.summary}. ${category.articleCount} ${copy.text('articleCount')}`}
            onPress={() => router.push({ pathname: '/help/category/[key]', params: { key: category.categoryKey } })}
            style={[styles.categoryRow, copy.isRTL && styles.reverse]}>
            <View style={styles.categoryIcon}>
              <MaterialIcons name={category.icon as never} size={22} color={colors.textPrimary} />
            </View>
            <View style={styles.grow}>
              <AppText style={styles.categoryTitle}>{category.title}</AppText>
              <AppText style={styles.categoryBody}>{category.summary}</AppText>
            </View>
            <MaterialIcons
              name={copy.isRTL ? 'chevron-left' : 'chevron-right'}
              size={22}
              color={colors.textMuted}
            />
          </Pressable>)}
        </Section>

        {center.popular.length > 0 ? <Section title={copy.text('popularArticles')}>
          {center.popular.map(article => <ArticleRow key={article.slug} article={article} />)}
        </Section> : null}
      </> : null}

      <BrandCard style={styles.contact}>
        <AppText style={styles.contactTitle}>{copy.text('contactSupport')}</AppText>
        <AppText style={styles.contactBody}>{copy.text('contactSupportBody')}</AppText>
        <BrandButton
          label={copy.text('newCase')}
          icon="support-agent"
          onPress={() => router.push({ pathname: '/support/new', params: surface ? { surface } : {} })}
        />
        <BrandButton
          label={copy.text('myCases')}
          variant="secondary"
          icon="inbox"
          onPress={() => router.push('/support')}
        />
      </BrandCard>
    </ScrollView>
  </SafeAreaView>;
}

function ManualArticleRow({ article }: { article: ManualArticle }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${article.title}. ${article.summary}`}
    onPress={() => router.push({ pathname: '/help/manual/[id]', params: { id: article.id } })}
    style={[styles.articleRow, isRTL && styles.reverse]}>
    <View style={styles.grow}><AppText style={styles.articleTitle}>{article.title}</AppText><AppText style={styles.articleBody}>{article.summary}</AppText></View>
    <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
  </Pressable>;
}

function SearchResults({ result }: { result: HelpSearchResult }) {
  const copy = useSupportText();
  if (result.mode === 'too_short') {
    return <EmptyState icon="search" title={copy.text('queryTooShort')} />;
  }
  if (result.mode === 'empty') {
    return <EmptyState
      icon="search-off"
      title={copy.text('noResults')}
      body={copy.text('noResultsBody')}
      action={copy.text('contactSupport')}
      onAction={() => router.push('/support/new')}
    />;
  }
  return <Section title={result.mode === 'approximate' ? copy.text('approximateMatch') : copy.text('helpCenter')}>
    {result.results.map(article => <ArticleRow key={article.slug} article={article} />)}
  </Section>;
}

function ArticleRow({ article }: { article: HelpArticleSummary }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const copy = useSupportText();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${article.title}. ${article.summary}`}
    onPress={() => router.push({ pathname: '/help/article/[slug]', params: { slug: article.slug } })}
    style={[styles.articleRow, copy.isRTL && styles.reverse]}>
    <View style={styles.grow}>
      <AppText style={styles.articleTitle}>{article.title}</AppText>
      <AppText style={styles.articleBody}>{article.summary}</AppText>
    </View>
    <MaterialIcons
      name={copy.isRTL ? 'chevron-left' : 'chevron-right'}
      size={20}
      color={colors.textMuted}
    />
  </Pressable>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View accessibilityRole="summary" style={styles.section}>
    <AppText style={styles.sectionTitle}>{title}</AppText>
    <View style={styles.sectionBody}>{children}</View>
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg, maxWidth: 760, width: '100%', alignSelf: 'center' },
  reverse: { flexDirection: 'row-reverse' },
  grow: { flex: 1, gap: 3 },
  searchRow: { position: 'relative' },
  clear: { position: 'absolute', top: 8, insetInlineEnd: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: typography.semibold, color: colors.textSecondary },
  sectionBody: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill },
  chipText: { fontSize: 13, color: colors.textSecondary },
  categoryRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  categoryIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surfaceElevated },
  categoryTitle: { fontSize: 15, fontWeight: typography.semibold },
  categoryBody: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  articleRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radii.md },
  articleTitle: { fontSize: 14, fontWeight: typography.semibold },
  articleBody: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  contact: { gap: spacing.md },
  contactTitle: { fontSize: 16, fontWeight: typography.bold },
  contactBody: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
});
