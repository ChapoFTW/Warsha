import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { brandFontFamily, radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import {
  isRequestConversationClosed,
  newMessageClientId,
  parseRequestConversation,
  type RequestConversation as Conversation,
} from '@/src/chat/request-conversation';
import { environment } from '@/src/config/environment';
import { useLocalization } from '@/src/i18n/localization';
import { getSupabaseClient } from '@/src/lib/supabase';
import { realtimeService } from '@/src/realtime/realtime-service';

import { BrandButton } from './BrandUI';
import { AppText } from './Typography';

/**
 * The conversation about a request, before there is a booking.
 *
 * One component for both parties: the server decides who may read, who may
 * write, and which messages are the reader's own, so nothing here differs
 * between a customer and a worker.
 *
 * SENDING IS OPTIMISTIC AND IDEMPOTENT. The message appears the instant it is
 * typed — the person who wrote it should not wait for a round trip to see their
 * own words — and carries a client id, so a retry after a timeout is the same
 * message rather than a second one. On failure the optimistic row is removed
 * and THE TEXT GOES BACK IN THE BOX: losing what somebody typed because the
 * connection hiccuped is the least forgivable thing a chat can do.
 *
 * RECEIVING IS A REFETCH, NOT AN APPEND. A realtime event triggers a reload of
 * the thread rather than appending its payload, which is what makes duplication
 * impossible — the optimistic row and the event are not two sources to
 * reconcile, because the event carries nothing to reconcile with. The server's
 * list replaces what is on screen, and the server's list is the truth.
 */
export function RequestConversation({
  requestId,
  providerId,
}: {
  requestId: string;
  providerId: string;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL } = useLocalization();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [pending, setPending] = useState<{ id: string; body: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const listRef = useRef<FlatList<{ id: string; body: string; mine: boolean }>>(null);

  const load = useCallback(async () => {
    if (environment.dataMode === 'mock') { setLoadFailed(false); return; }
    const { data, error } = await getSupabaseClient().rpc('get_request_conversation', {
      p_request_id: requestId, p_provider_id: providerId, p_limit: 50,
    });
    if (error) { setLoadFailed(true); return; }
    setLoadFailed(false);
    const parsed = parseRequestConversation(data);
    setConversation(parsed);
    // Anything the server now knows about stops being pending. Matched on the
    // body because the server assigns its own id — the client id is an
    // idempotency key, not the message's identity.
    if (parsed) {
      setPending((current) => current.filter(
        (item) => !parsed.messages.some((message) => message.mine && message.body === item.body),
      ));
    }
  }, [providerId, requestId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (environment.dataMode === 'mock') return;
    // Reconnecting is also a reason to reload: everything that arrived while
    // the socket was down was never delivered.
    return realtimeService.requestConversation(requestId, () => { void load(); },
      (status) => { if (status === 'connected') void load(); });
  }, [load, requestId]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setFailure(null);
    const clientId = newMessageClientId();
    setPending((current) => [...current, { id: clientId, body }]);
    setDraft('');
    const { error } = await getSupabaseClient().rpc('send_request_message', {
      p_request_id: requestId, p_provider_id: providerId, p_body: body, p_client_id: clientId,
    });
    if (error) {
      setPending((current) => current.filter((item) => item.id !== clientId));
      setDraft(body);
      setFailure(isRequestConversationClosed(error) ? t('messageClosed') : t('messageFailed'));
    }
    await load();
    setBusy(false);
  }, [busy, draft, load, providerId, requestId, t]);

  if (loadFailed) {
    return <AppText accessibilityRole="alert" style={styles.error}>{t('messageLoadFailed')}</AppText>;
  }

  const rows = [
    ...(conversation?.messages ?? []).map((message) => ({ id: message.id, body: message.body, mine: message.mine })),
    ...pending.map((item) => ({ id: item.id, body: item.body, mine: true })),
  ];

  return (
    <View style={styles.panel}>
      {rows.length === 0 ? (
        <AppText style={styles.empty}>{t('messageEmpty')}</AppText>
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}>
              <AppText style={item.mine ? styles.mineText : styles.theirsText}>{item.body}</AppText>
            </View>
          )}
        />
      )}

      {conversation?.canSend ? (
        <View style={[styles.composer, isRTL && styles.reverse]}>
          <TextInput
            accessibilityLabel={t('messagePlaceholder')}
            placeholder={t('messagePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            maxLength={2000}
            editable={!busy}
            style={[styles.input, { fontFamily: brandFontFamily(isRTL), textAlign: isRTL ? 'right' : 'left' }]}
          />
          <BrandButton label={t('messageSend')} disabled={busy || draft.trim().length === 0}
            onPress={() => void send()} style={styles.send} />
        </View>
      ) : (
        <AppText style={styles.closed}>{t('messageClosed')}</AppText>
      )}

      {failure ? <AppText accessibilityRole="alert" style={styles.error}>{failure}</AppText> : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  panel: { gap: spacing.md },
  // A bounded height rather than a growing list: a thread that lengthens the
  // screen pushes the composer below the fold, which is the one control the
  // reader needs.
  list: { maxHeight: 260 },
  listContent: { gap: spacing.sm, paddingVertical: spacing.xs },
  bubble: { maxWidth: '82%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md },
  // Ground as well as side. An alignment-only distinction disappears the moment
  // the whole column flips for Arabic.
  mine: { alignSelf: 'flex-end', backgroundColor: colors.actionPrimaryBackground },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  mineText: { ...typography.bodySmall, color: colors.actionPrimaryText },
  theirsText: { ...typography.bodySmall, color: colors.textPrimary },
  empty: { ...typography.bodySmall, color: colors.textMuted },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  input: {
    flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
    backgroundColor: colors.surface, color: colors.textPrimary, fontSize: 15,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  send: { minWidth: 96 },
  closed: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, color: colors.error },
});
