import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { bodyFor, findDocument } from '@/src/legal/legal-corpus';
import { useLegal } from '@/src/legal/legal-context';
import {
  changeClassKey,
  guaranteeKey,
  restrictionKey,
  useLegalText,
  type LegalTextKey,
} from '@/src/legal/legal-translations';
import { mayRestrictOnDecline, type LegalDocumentKey } from '@/src/legal/legal-types';

/**
 * The re-consent screen.
 *
 * The rules that shape it, all of them about not being coercive:
 *
 *   - "I do not agree" is a real button, the same size as the other one. A
 *     decline that has to be hunted for is a decline that gets tapped past.
 *   - The consequences of declining come from the SERVER, and only for change
 *     classes that may restrict anything. An editorial change shows "nothing
 *     stops working", because nothing does.
 *   - What survives a decline is shown next to what stops. A screen that lists
 *     only losses is an argument, not a choice.
 *   - Nothing is recorded by arriving here, by scrolling, or by leaving.
 *     Inactivity never becomes consent.
 *   - The document is one tap away and the change summary is on this screen,
 *     so nobody has to agree to something described only as "our terms".
 */
export default function LegalConsentScreen() {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const lt = useLegalText();
  const { obligations, accept, decline, ready, unavailable } = useLegal();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<LegalDocumentKey | null>(null);
  const [consequences, setConsequences] = useState<{
    restricts: string[];
    alwaysAvailable: string[];
  } | null>(null);

  const outstanding = obligations.obligations.filter((item) => item.outstanding);

  if (ready && !unavailable && outstanding.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={lt.text('reconsentTitle')} />
        <View style={styles.state}>
          <AppText style={styles.stateBody}>{lt.text('noAcceptances')}</AppText>
        </View>
      </SafeAreaView>
    );
  }

  const onAccept = async (key: LegalDocumentKey, version: string) => {
    setBusy(true);
    const ok = await accept(key, version, lt.locale, 'reconsent');
    setBusy(false);
    if (!ok) setNotice(lt.text('acceptFailed'));
  };

  const onDecline = async (key: LegalDocumentKey, version: string) => {
    setBusy(true);
    const result = await decline(key, version, lt.locale, null);
    setBusy(false);
    setConfirming(null);
    setConsequences(result);
    if (!result) setNotice(lt.text('acceptFailed'));
  };

  const labelsFor = (keys: readonly string[], map: (k: string) => LegalTextKey | null): string[] =>
    keys.map(map).filter((k): k is LegalTextKey => k !== null).map((k) => lt.text(k));

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={lt.text('reconsentTitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText style={styles.hint}>{lt.text('reconsentIntro')}</AppText>
        {notice ? <AppText style={styles.notice}>{notice}</AppText> : null}

        {outstanding.map((item) => {
          const document = findDocument(item.documentKey);
          const title = document ? bodyFor(document, lt.locale).title : item.documentKey;
          const isConfirming = confirming === item.documentKey;
          const restrictive = mayRestrictOnDecline(item.changeClass);

          return (
            <View key={item.documentKey} style={styles.card}>
              <AppText accessibilityRole="header" style={styles.sectionTitle}>
                {title}
              </AppText>
              <AppText style={styles.meta}>
                {`${lt.text(changeClassKey(item.changeClass))} · ${lt.text('version')} ${item.version} · ${lt.text('effective')} ${item.effectiveAt}`}
              </AppText>
              <AppText style={styles.label}>{lt.text('changeSummary')}</AppText>
              <AppText style={styles.paragraph}>{item.changeSummary}</AppText>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/legal/document/${item.documentKey}`)}
                style={styles.readRow}
              >
                <AppText style={styles.readText}>{lt.text('readDocument')}</AppText>
              </Pressable>

              {isConfirming ? (
                <View style={styles.declinePanel}>
                  <AppText accessibilityRole="header" style={styles.label}>
                    {lt.text('declineTitle')}
                  </AppText>
                  {restrictive ? (
                    <AppText style={styles.paragraph}>{lt.text('declineStops')}</AppText>
                  ) : (
                    <AppText style={styles.paragraph}>{lt.text('declineNothingStops')}</AppText>
                  )}
                  <AppText style={styles.paragraph}>{lt.text('declineKeeps')}</AppText>
                  {labelsFor(
                    ['read_records', 'export_data', 'support', 'appeals', 'close_account'],
                    guaranteeKey,
                  ).map((label) => (
                    <AppText key={label} style={styles.bullet}>{`• ${label}`}</AppText>
                  ))}
                  <View style={[styles.actions, isRTL && styles.reverse]}>
                    <BrandButton
                      label={lt.text('declineCancel')}
                      variant="secondary"
                      onPress={() => setConfirming(null)}
                      disabled={busy}
                    />
                    <BrandButton
                      label={lt.text('declineConfirm')}
                      variant="secondary"
                      onPress={() => void onDecline(item.documentKey, item.version)}
                      disabled={busy}
                    />
                  </View>
                </View>
              ) : (
                <View style={[styles.actions, isRTL && styles.reverse]}>
                  <BrandButton
                    label={lt.text('acceptLabel')}
                    onPress={() => void onAccept(item.documentKey, item.version)}
                    disabled={busy}
                  />
                  <BrandButton
                    label={lt.text('declineLabel')}
                    variant="secondary"
                    onPress={() => setConfirming(item.documentKey)}
                    disabled={busy}
                  />
                </View>
              )}
              <AppText style={styles.hint}>{lt.text('acceptingMeans')}</AppText>
            </View>
          );
        })}

        {consequences ? (
          <View style={styles.card}>
            <AppText accessibilityRole="header" style={styles.sectionTitle}>
              {lt.text('declineTitle')}
            </AppText>
            {consequences.restricts.length > 0 ? (
              <>
                <AppText style={styles.paragraph}>{lt.text('declineStops')}</AppText>
                {labelsFor(consequences.restricts, restrictionKey).map((label) => (
                  <AppText key={label} style={styles.bullet}>{`• ${label}`}</AppText>
                ))}
              </>
            ) : (
              <AppText style={styles.paragraph}>{lt.text('declineNothingStops')}</AppText>
            )}
            <AppText style={styles.paragraph}>{lt.text('declineKeeps')}</AppText>
            {labelsFor(consequences.alwaysAvailable, guaranteeKey).map((label) => (
              <AppText key={label} style={styles.bullet}>{`• ${label}`}</AppText>
            ))}
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
  sectionTitle: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary },
  label: { fontSize: 13, fontWeight: typography.semibold, color: colors.textPrimary },
  paragraph: { fontSize: 13, lineHeight: 21, color: colors.textSecondary },
  bullet: { fontSize: 13, lineHeight: 21, color: colors.textSecondary },
  meta: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  notice: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  readRow: { minHeight: 44, justifyContent: 'center' },
  readText: { fontSize: 13, fontWeight: typography.semibold, color: colors.textPrimary },
  declinePanel: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  state: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.md },
  stateBody: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
});
