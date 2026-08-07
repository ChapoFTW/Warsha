import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useLegal } from '@/src/legal/legal-context';
import { bodyFor, documentsForRole, legalCorpus } from '@/src/legal/legal-corpus';
import { changeClassKey, useLegalText } from '@/src/legal/legal-translations';

/**
 * The legal centre.
 *
 * Reads the corpus from the bundle, not the network. Three consequences worth
 * being deliberate about:
 *
 *   - it works signed out, so someone can read the terms before deciding
 *     whether to create an account;
 *   - it works offline, which matters for the one document a person most often
 *     wants to reread while arguing about a booking;
 *   - it opens no anonymous data surface, which is what WPS-023 section 0 was
 *     for.
 *
 * The list shows the whole corpus. Documents that need agreement and have not
 * had it are surfaced first, rather than being left for the person to find
 * among twenty-six rows.
 */
export default function LegalCentre() {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const lt = useLegalText();
  const { obligations, ready, accountKey } = useLegal();

  const role = obligations.role;
  // Signed out, every account-scoped audience is unknowable, so the whole
  // corpus is listed. That is the honest answer: none of it has been narrowed
  // to this person because there is no person yet.
  const documents = accountKey ? documentsForRole(role) : legalCorpus;
  const outstanding = obligations.obligations.filter((item) => item.outstanding);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={lt.text('centreTitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText style={styles.hint}>{lt.text('centreIntro')}</AppText>

        {ready && outstanding.length > 0 ? (
          <View style={styles.card}>
            <AppText accessibilityRole="header" style={styles.sectionTitle}>
              {lt.text('outstandingTitle')}
            </AppText>
            <AppText style={styles.hint}>{lt.text('outstandingIntro')}</AppText>
            {outstanding.map((item) => (
              <Pressable
                key={item.documentKey}
                accessibilityRole="button"
                style={[styles.row, isRTL && styles.reverse]}
                onPress={() => router.push(`/legal/document/${item.documentKey}`)}
              >
                <View style={styles.grow}>
                  <AppText style={styles.rowTitle}>
                    {bodyFor(
                      legalCorpus.find((d) => d.key === item.documentKey) ?? legalCorpus[0],
                      lt.locale,
                    ).title}
                  </AppText>
                  <AppText style={styles.hint}>
                    {`${lt.text(changeClassKey(item.changeClass))} · ${lt.text('version')} ${item.version}`}
                  </AppText>
                </View>
                <AppText style={styles.pending}>{lt.text('notAccepted')}</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <AppText accessibilityRole="header" style={styles.sectionTitle}>
            {lt.text('allDocuments')}
          </AppText>
          {documents.map((document) => (
            <Pressable
              key={document.key}
              accessibilityRole="button"
              style={[styles.row, isRTL && styles.reverse]}
              onPress={() => router.push(`/legal/document/${document.key}`)}
            >
              <View style={styles.grow}>
                <AppText style={styles.rowTitle}>{bodyFor(document, lt.locale).title}</AppText>
                <AppText style={styles.hint} numberOfLines={2}>
                  {bodyFor(document, lt.locale).summary}
                </AppText>
              </View>
              <AppText style={styles.hint}>{`${lt.text('version')} ${document.version}`}</AppText>
            </Pressable>
          ))}
        </View>
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
  sectionTitle: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  reverse: { flexDirection: 'row-reverse' },
  grow: { flexGrow: 1, flexShrink: 1, gap: spacing.xs },
  rowTitle: { fontSize: 13, fontWeight: typography.semibold, color: colors.textPrimary },
  pending: { fontSize: 12, fontWeight: typography.semibold, color: colors.textSecondary },
});
