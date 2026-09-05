'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useWarshaRealtime } from '@/lib/use-warsha-realtime';
import {
  isRequestConversationClosed,
  newMessageClientId,
  parseRequestConversation,
  type RequestConversation as Conversation,
} from '@/src/chat/request-conversation';
import { realtimeChannels } from '@/src/realtime/realtime-channels';

import styles from '@/components/product-surface.module.css';

/**
 * The conversation about a request, for whichever side is looking at it.
 *
 * One component for both parties. The server decides who may read and who may
 * write, and it decides which messages are `mine`, so there is nothing here
 * that differs between a customer and a worker except the words on the button.
 *
 * ## Sending
 *
 * Optimistic, with a client id. The message appears the instant it is typed —
 * the person who wrote it should not wait for a round trip to see their own
 * words — and the client id makes a retry after a timeout safe: the server
 * treats a repeat of the same id as the same message, so a client that stopped
 * waiting cannot create a duplicate. On failure the optimistic row is removed
 * and THE TEXT IS PUT BACK IN THE BOX, because losing what somebody typed
 * because the network hiccuped is the least forgivable failure a chat can have.
 *
 * ## Receiving
 *
 * A realtime signal triggers a refetch of the thread rather than an append of
 * the payload. That is what makes duplication impossible: the optimistic row
 * and the realtime event are not two sources to reconcile, because the realtime
 * event carries nothing to reconcile with. The server's list replaces whatever
 * is on screen, and the server's list is the truth.
 */
export function RequestConversationPanel({
  requestId,
  providerId,
  words,
  closedHint,
}: {
  requestId: string;
  providerId: string;
  /** The locale's copy. The two callers resolve their words differently. */
  words: Record<string, string>;
  /** Shown when the thread has become read-only. */
  closedHint?: string;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<{ id: string; body: string }[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc('get_request_conversation', {
      p_request_id: requestId, p_provider_id: providerId, p_limit: 50,
    });
    if (error) { setLoadFailed(true); return; }
    setLoadFailed(false);
    const parsed = parseRequestConversation(data);
    setConversation(parsed);
    // Anything the server now knows about is no longer pending. Matching on the
    // body rather than the id because the server assigns its own id; the client
    // id is an idempotency key, not the message's identity.
    if (parsed) {
      setPending((current) => current.filter(
        (item) => !parsed.messages.some((message) => message.mine && message.body === item.body),
      ));
    }
  }, [requestId, providerId]);

  useEffect(() => { void load(); }, [load]);
  useWarshaRealtime(realtimeChannels.requestConversation(requestId), () => { void load(); });

  useEffect(() => {
    // Newest at the bottom, as a chat should be.
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [conversation, pending]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setFailure(null);
    const clientId = newMessageClientId();
    setPending((current) => [...current, { id: clientId, body }]);
    setDraft('');
    const { error } = await supabase().rpc('send_request_message', {
      p_request_id: requestId, p_provider_id: providerId, p_body: body, p_client_id: clientId,
    });
    if (error) {
      setPending((current) => current.filter((item) => item.id !== clientId));
      // The text goes back in the box. A failed send that also swallows what
      // somebody wrote asks them to type it twice.
      setDraft(body);
      setFailure(isRequestConversationClosed(error) ? words.messageClosed : words.messageFailed);
      if (isRequestConversationClosed(error)) await load();
    } else {
      await load();
    }
    setBusy(false);
  }, [busy, draft, load, providerId, requestId, words]);

  if (loadFailed) {
    return <p className={styles.error} role="alert">{words.messageLoadFailed}</p>;
  }

  const canSend = conversation?.canSend ?? false;
  const messages = conversation?.messages ?? [];

  return (
    <div className={styles.subpanel}>
      <div ref={scroller} className={styles.conversation} aria-live="polite" aria-atomic="false">
        {messages.length === 0 && pending.length === 0 ? (
          <p className={styles.muted}>{words.messageEmpty}</p>
        ) : (
          <ul className={styles.list}>
            {messages.map((message) => (
              <li key={message.id} className={message.mine ? styles.messageMine : styles.messageTheirs}>
                {message.body}
              </li>
            ))}
            {pending.map((item) => (
              // `aria-busy` rather than a spinner: a reader is told the message
              // has not landed yet without a moving thing beside every line.
              <li key={item.id} className={styles.messageMine} aria-busy="true" data-pending="true">
                {item.body}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canSend ? (
        <div className={styles.searchRow}>
          <label className={styles.field}>
            <span className={styles.label}>{words.messagePlaceholder}</span>
            <input
              className={styles.input}
              value={draft}
              maxLength={2000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}
              disabled={busy}
            />
          </label>
          <button type="button" className={styles.action} disabled={busy || draft.trim().length === 0}
            onClick={() => void send()}>{words.messageSend}</button>
        </div>
      ) : (
        <p className={styles.note}>{closedHint ?? words.messageClosed}</p>
      )}

      {failure ? <p className={styles.error} role="alert">{failure}</p> : null}
    </div>
  );
}
