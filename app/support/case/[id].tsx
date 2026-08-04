import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandCard, BrandLoadingState, BrandTextField, EmptyState, StateBadge } from '@/components/warsha/BrandUI';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useSupport } from '@/src/support/support-context';
import { supportRepository } from '@/src/support/support-repository';
import { useSupportText } from '@/src/support/support-translations';
import type { SupportCaseDetail, SupportStatus } from '@/src/support/support-types';

const tone: Record<SupportStatus, 'neutral' | 'success' | 'warning' | 'error'> = {
  open: 'warning', in_progress: 'neutral', waiting_participant: 'warning',
  escalated: 'error', resolved: 'success', closed: 'neutral',
};

/**
 * A support case thread.
 *
 * Every permission on this screen — can reply, can reopen, can attach, survey
 * available — is read from the server response. The client never decides that a
 * reopen window is still open; it renders what the server said.
 */
export default function SupportCaseScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const support = useSupport();
  const copy = useSupportText();
  const [detail, setDetail] = useState<SupportCaseDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [surveyComment, setSurveyComment] = useState('');

  const load = useCallback(async () => {
    if (!support.accountKey || !id) return;
    setState('loading');
    try {
      setDetail(await supportRepository.getCase(support.accountKey, id));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [id, support.accountKey]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await load();
      await support.reloadCases();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : copy.text('loadError'));
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') {
    return <SafeAreaView style={styles.safe}><View style={styles.center}>
      <BrandLoadingState label={copy.text('loading')} />
    </View></SafeAreaView>;
  }
  if (state === 'error' || !detail) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}>
      <EmptyState icon="error-outline" title={copy.text('notFound')} action={copy.text('retry')} onAction={() => void load()} />
    </View></SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={detail.subject} subtitle={copy.category(detail.category)} />
      <View style={[styles.badgeRow, copy.isRTL && styles.reverse]}>
        <StateBadge label={copy.status(detail.status)} tone={tone[detail.status]} />
      </View>

      <View accessibilityRole="list" style={styles.thread}>
        {detail.messages.map(message => <View
          key={message.id}
          accessible
          accessibilityLabel={`${message.fromMe ? copy.text('reply') : copy.text('contactSupport')}. ${message.body}`}
          style={[
            styles.bubble,
            message.fromMe ? styles.bubbleMine : styles.bubbleTheirs,
            copy.isRTL && (message.fromMe ? styles.alignStart : styles.alignEnd),
          ]}>
          <AppText style={styles.bubbleText}>{message.body}</AppText>
        </View>)}
      </View>

      {detail.attachments.length > 0 ? <BrandCard style={styles.card}>
        <AppText style={styles.sectionTitle}>{copy.text('attachments')}</AppText>
        {detail.attachments.map(attachment => <View
          key={attachment.id}
          accessible
          accessibilityLabel={attachment.fileName}
          style={[styles.attachment, copy.isRTL && styles.reverse]}>
          <MaterialIcons
            name={attachment.mimeType === 'application/pdf' ? 'picture-as-pdf' : 'image'}
            size={20}
            color={colors.textSecondary}
          />
          <AppText numberOfLines={1} style={styles.attachmentName}>{attachment.fileName}</AppText>
        </View>)}
      </BrandCard> : null}

      {detail.canReply ? <BrandCard style={styles.card}>
        <BrandTextField
          label={copy.text('reply')}
          placeholder={copy.text('replyPlaceholder')}
          value={reply}
          onChangeText={setReply}
          multiline
          numberOfLines={4}
          maxLength={4000}
          error={actionError ?? undefined}
        />
        <BrandButton
          label={copy.text('sendReply')}
          icon="send"
          loading={busy}
          disabled={reply.trim().length < 1 || busy}
          onPress={() => void run(async () => {
            await supportRepository.reply(support.accountKey!, detail.caseId, reply,
              `reply-${detail.caseId}-${Date.now().toString(36)}`);
            setReply('');
          })}
        />
      </BrandCard> : <BrandCard style={styles.card}>
        <AppText style={styles.notice}>{copy.text('caseClosed')}</AppText>
      </BrandCard>}

      {detail.status === 'resolved' && !detail.canReopen ? <BrandCard style={styles.card}>
        <AppText style={styles.notice}>
          {detail.reopenedCount >= 3 ? copy.text('reopenLimit') : copy.text('reopenWindowPassed')}
        </AppText>
      </BrandCard> : null}

      {detail.canReopen ? <BrandCard style={styles.card}>
        <BrandTextField
          label={copy.text('reopenReason')}
          value={reply}
          onChangeText={setReply}
          multiline
          numberOfLines={3}
          maxLength={2000}
        />
        <BrandButton
          label={copy.text('reopen')}
          variant="secondary"
          icon="refresh"
          loading={busy}
          disabled={reply.trim().length < 3 || busy}
          onPress={() => void run(async () => {
            await supportRepository.reopen(support.accountKey!, detail.caseId, reply,
              `reopen-${detail.caseId}-${Date.now().toString(36)}`);
            setReply('');
          })}
        />
      </BrandCard> : null}

      {detail.surveyAvailable ? <BrandCard style={styles.card}>
        <AppText style={styles.sectionTitle}>{copy.text('survey')}</AppText>
        <AppText style={styles.notice}>{copy.text('surveyBody')}</AppText>
        <View accessibilityRole="radiogroup" style={[styles.scoreRow, copy.isRTL && styles.reverse]}>
          {[1, 2, 3, 4, 5].map(value => <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected: score === value }}
            accessibilityLabel={`${value}`}
            onPress={() => setScore(value)}
            style={[styles.scoreButton, score === value && styles.scoreSelected]}>
            <MaterialIcons
              name={score != null && value <= score ? 'star' : 'star-border'}
              size={26}
              color={score != null && value <= score ? colors.white : colors.textMuted}
            />
          </Pressable>)}
        </View>
        <BrandTextField
          label={copy.text('surveyComment')}
          value={surveyComment}
          onChangeText={setSurveyComment}
          multiline
          numberOfLines={3}
          maxLength={1000}
        />
        <BrandButton
          label={copy.text('surveySubmit')}
          icon="check"
          loading={busy}
          disabled={score == null || busy}
          onPress={() => void run(() => supportRepository.submitSatisfaction(
            support.accountKey!, detail.caseId, score!, surveyComment.trim() || undefined))}
        />
      </BrandCard> : null}

      {detail.satisfactionScore != null ? <BrandCard style={styles.card}>
        <AppText style={styles.notice}>{copy.text('surveyThanks')}</AppText>
      </BrandCard> : null}
    </ScrollView>
  </SafeAreaView>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md, maxWidth: 760, width: '100%', alignSelf: 'center' },
  reverse: { flexDirection: 'row-reverse' },
  badgeRow: { flexDirection: 'row', gap: spacing.sm },
  thread: { gap: spacing.sm },
  bubble: { maxWidth: '86%', padding: spacing.md, borderRadius: radii.lg, borderWidth: 1 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.surfaceElevated, borderColor: colors.borderSoft },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border },
  alignStart: { alignSelf: 'flex-start' },
  alignEnd: { alignSelf: 'flex-end' },
  bubbleText: { fontSize: 14, lineHeight: 21 },
  card: { gap: spacing.md },
  sectionTitle: { fontSize: 14, fontWeight: typography.semibold },
  notice: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  attachment: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  attachmentName: { flex: 1, fontSize: 13 },
  scoreRow: { flexDirection: 'row', gap: spacing.sm },
  scoreButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  scoreSelected: { borderColor: colors.white },
});
