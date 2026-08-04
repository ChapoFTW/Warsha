import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandLoadingState, EmptyState } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useSupport } from '@/src/support/support-context';
import { supportRepository } from '@/src/support/support-repository';
import { useSupportText } from '@/src/support/support-translations';
import type { HelpArticle } from '@/src/support/support-types';

export default function HelpArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const support = useSupport();
  const copy = useSupportText();
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [feedbackSent, setFeedbackSent] = useState(false);

  const load = useCallback(async () => {
    if (!support.accountKey || !slug) return;
    setState('loading');
    setFeedbackSent(false);
    try {
      const loaded = await supportRepository.getHelpArticle(support.accountKey, slug, support.locale);
      setArticle(loaded);
      setFeedbackSent(loaded.myFeedback != null);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [slug, support.accountKey, support.locale]);

  useEffect(() => { void load(); }, [load]);

  async function sendFeedback(helpful: boolean) {
    if (!support.accountKey || !slug) return;
    try {
      await supportRepository.submitArticleFeedback(support.accountKey, slug, helpful, support.locale);
      setFeedbackSent(true);
    } catch {
      // Feedback is advisory. A failure never blocks reading the article.
    }
  }

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      {state === 'loading' ? <BrandLoadingState label={copy.text('loading')} /> : null}
      {state === 'error' ? <EmptyState
        icon="error-outline"
        title={copy.text('notFound')}
        action={copy.text('backToHelp')}
        onAction={() => router.replace('/help')}
      /> : null}

      {state === 'ready' && article ? <>
        <ScreenHeader title={article.title} subtitle={article.summary} />

        {/* Paragraphs render as separate blocks so a screen reader announces
            them one at a time instead of as a single wall of text. */}
        <View style={styles.bodyBlock}>
          {article.body.split('\n\n').filter(Boolean).map((paragraph, index) => (
            <AppText key={index} style={styles.paragraph}>{paragraph}</AppText>
          ))}
        </View>

        <BrandCard style={styles.feedback}>
          <AppText style={styles.feedbackTitle}>
            {feedbackSent ? copy.text('thanksForFeedback') : copy.text('wasThisHelpful')}
          </AppText>
          {!feedbackSent ? <View style={[styles.feedbackRow, copy.isRTL && styles.reverse]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.text('yes')}
              onPress={() => void sendFeedback(true)}
              style={styles.feedbackButton}>
              <MaterialIcons name="thumb-up-off-alt" size={19} color={colors.textPrimary} />
              <AppText style={styles.feedbackLabel}>{copy.text('yes')}</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.text('no')}
              onPress={() => void sendFeedback(false)}
              style={styles.feedbackButton}>
              <MaterialIcons name="thumb-down-off-alt" size={19} color={colors.textPrimary} />
              <AppText style={styles.feedbackLabel}>{copy.text('no')}</AppText>
            </Pressable>
          </View> : null}
        </BrandCard>

        {article.related.length > 0 ? <View style={styles.related}>
          <AppText style={styles.sectionTitle}>{copy.text('relatedArticles')}</AppText>
          {article.related.map(item => <Pressable
            key={item.slug}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.summary}`}
            onPress={() => router.push({ pathname: '/help/article/[slug]', params: { slug: item.slug } })}
            style={[styles.relatedRow, copy.isRTL && styles.reverse]}>
            <View style={styles.grow}>
              <AppText style={styles.relatedTitle}>{item.title}</AppText>
              <AppText style={styles.relatedBody}>{item.summary}</AppText>
            </View>
            <MaterialIcons
              name={copy.isRTL ? 'chevron-left' : 'chevron-right'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>)}
        </View> : null}

        <BrandButton
          label={copy.text('contactSupport')}
          variant="secondary"
          icon="support-agent"
          onPress={() => router.push('/support/new')}
        />
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg, maxWidth: 760, width: '100%', alignSelf: 'center' },
  reverse: { flexDirection: 'row-reverse' },
  grow: { flex: 1, gap: 3 },
  bodyBlock: { gap: spacing.md },
  paragraph: { fontSize: 15, lineHeight: 24, color: colors.textPrimary },
  feedback: { gap: spacing.md },
  feedbackTitle: { fontSize: 14, fontWeight: typography.semibold },
  feedbackRow: { flexDirection: 'row', gap: spacing.md },
  feedbackButton: { minHeight: 44, minWidth: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill },
  feedbackLabel: { fontSize: 14, fontWeight: typography.medium },
  related: { gap: spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: typography.semibold, color: colors.textSecondary },
  relatedRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radii.md },
  relatedTitle: { fontSize: 14, fontWeight: typography.semibold },
  relatedBody: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
});
