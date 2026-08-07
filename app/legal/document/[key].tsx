import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { bodyFor, findDocument } from '@/src/legal/legal-corpus';
import { useLegal } from '@/src/legal/legal-context';
import { changeClassKey, useLegalText } from '@/src/legal/legal-translations';

/**
 * The document reader.
 *
 * Renders the bundled text, which is the text the hash covers. There is no
 * fetch here on purpose: a reader that pulled the words from the server would
 * be showing a second copy that could differ from the one the acceptance hash
 * was computed over, and the whole binding would become decorative.
 *
 * Two things are always visible, never behind a disclosure:
 *
 *   - which language governs, because a person accepting the Arabic text of an
 *     English-authoritative agreement is entitled to know that before they tap;
 *   - whether the Arabic is a full text or a summary. Fourteen of the
 *     twenty-six documents carry an Arabic summary rather than a parallel
 *     text, and presenting a summary as the agreement would be the more
 *     comfortable lie.
 */
export default function LegalDocumentScreen() {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const lt = useLegalText();
  const params = useLocalSearchParams<{ key?: string }>();
  const { accountKey, accept, obligations } = useLegal();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const document = findDocument(params.key ?? '');
  if (!document) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={lt.text('centreTitle')} />
        <View style={styles.state}>
          <AppText style={styles.stateBody}>{lt.text('unavailable')}</AppText>
        </View>
      </SafeAreaView>
    );
  }

  const body = bodyFor(document, lt.locale);
  const outstanding = obligations.obligations.find(
    (item) => item.documentKey === document.key && item.outstanding,
  );
  const canAccept = Boolean(accountKey) && document.requiresAcceptance && Boolean(outstanding);

  const onAccept = async () => {
    setBusy(true);
    const ok = await accept(document.key, document.version, lt.locale, 'legal_centre');
    setBusy(false);
    if (ok) {
      router.back();
      return;
    }
    setNotice(lt.text('acceptFailed'));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={body.title} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <AppText style={styles.summary}>{body.summary}</AppText>
          <AppText style={styles.meta}>
            {`${lt.text('version')} ${document.version} · ${lt.text('published')} ${document.publishedAt} · ${lt.text('effective')} ${document.effectiveAt}`}
          </AppText>
          <AppText style={styles.meta}>
            {`${lt.text(changeClassKey(document.changeClass))}: ${document.changeSummary[lt.locale]}`}
          </AppText>
          <AppText style={styles.governing}>
            {document.authoritativeLanguage === 'ar'
              ? lt.text('authoritativeArabic')
              : lt.text('authoritativeEnglish')}
          </AppText>
          {lt.locale === 'ar' && document.arabicIsSummary ? (
            <AppText style={styles.governing}>{lt.text('arabicIsSummary')}</AppText>
          ) : null}
        </View>

        {body.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <AppText accessibilityRole="header" style={styles.heading}>
              {section.heading}
            </AppText>
            {section.body.map((paragraph) => (
              <AppText key={paragraph} style={styles.paragraph}>
                {paragraph}
              </AppText>
            ))}
            {(section.bullets ?? []).map((bullet) => (
              <View key={bullet} style={[styles.bulletRow, isRTL && styles.reverse]}>
                <AppText style={styles.bulletMark}>•</AppText>
                <AppText style={styles.bulletText}>{bullet}</AppText>
              </View>
            ))}
          </View>
        ))}

        {canAccept ? (
          <View style={styles.card}>
            <AppText style={styles.meta}>{lt.text('acceptingMeans')}</AppText>
            {notice ? <AppText style={styles.notice}>{notice}</AppText> : null}
            <BrandButton label={lt.text('acceptLabel')} onPress={() => void onAccept()} disabled={busy} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  summary: { fontSize: 14, lineHeight: 21, color: colors.textPrimary },
  meta: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  governing: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  notice: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  section: { gap: spacing.sm },
  heading: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary },
  paragraph: { fontSize: 13, lineHeight: 21, color: colors.textSecondary },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  reverse: { flexDirection: 'row-reverse' },
  bulletMark: { fontSize: 13, lineHeight: 21, color: colors.textMuted },
  bulletText: { flexGrow: 1, flexShrink: 1, fontSize: 13, lineHeight: 21, color: colors.textSecondary },
  state: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.md },
  stateBody: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
});
