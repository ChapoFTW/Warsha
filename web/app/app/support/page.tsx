'use client';

import { useCallback, useEffect, useState } from 'react';

import { AppShell, useAccount } from '@/components/app-shell';
import { appCopy } from '@/lib/app-copy';
import { customerNav, workerNav } from '@/lib/nav';
import {
  classifySupportError,
  newIdempotencyKey,
  parseCaseDetail,
  parseCaseSummaries,
  reopenReasonValid,
  replyValid,
  subjectValid,
  REOPEN_MAX,
  REPLY_MAX,
  SUBJECT_MAX,
  SUPPORT_CATEGORIES,
  type SupportCaseDetail,
  type SupportCaseSummary,
  type SupportFailure,
} from '@/lib/support';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from './support.module.css';

/**
 * Support: a conversation, not a form that swallows things.
 *
 * The list, the case, the history and the reply are each backed by an RPC that
 * exists — `get_my_support_cases`, `get_my_support_case`, `reply_support_case`,
 * `reopen_support_case`, `submit_support_satisfaction`.
 *
 * The reply box was missing for one reason: an earlier audit recorded
 * `reply_support_case` as absent, because it only matched single-line function
 * signatures and every real definition spans several. The page then told people
 * to reply by email — a plausible sentence about a capability that had been
 * there the whole time.
 *
 * **What may be done is asked, never worked out.** `canReply`, `canReopen` and
 * `surveyAvailable` are computed by `get_my_support_case` — the reopen rule
 * alone is three separate conditions including a fourteen-day window — so this
 * page renders the answer instead of re-deriving it and eventually disagreeing.
 *
 * **Staff notes are not hidden here; they never arrive.** Both read RPCs filter
 * to `visibility = 'participants'`, so an internal note is not in the payload
 * the browser receives.
 */
export default function SupportPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const account = useAccount();
  const mode = account?.roles.worker && !account?.roles.customer ? 'worker' : 'customer';

  const [cases, setCases] = useState<SupportCaseSummary[] | null>(null);
  const [openCase, setOpenCase] = useState<SupportCaseDetail | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadCases = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase().rpc('get_my_support_cases');
    if (error) setFailed(true);
    else setCases(parseCaseSummaries(data));
  }, []);

  useEffect(() => { void loadCases(); }, [loadCases]);

  const showCase = useCallback(async (id: string) => {
    setOpeningId(id);
    const { data, error } = await supabase().rpc('get_my_support_case', { p_case_id: id });
    setOpeningId(null);
    if (!error) setOpenCase(parseCaseDetail(data));
  }, []);

  // After any write the case is re-read rather than patched locally. The server
  // may have moved the status, closed the reply window or spent a reopen, and
  // guessing which would be the start of the two surfaces disagreeing.
  const refreshCase = useCallback(async (id: string) => {
    const { data } = await supabase().rpc('get_my_support_case', { p_case_id: id });
    const detail = parseCaseDetail(data);
    if (detail) setOpenCase(detail);
    await loadCases();
  }, [loadCases]);

  return (
    <AppShell nav={mode === 'worker' ? workerNav(words) : customerNav(words)} mode={mode === 'worker' ? words.modeWorker : words.modeCustomer}>
      <div className={styles.head}>
        <h1 className={styles.title}>{words.supportTitle}</h1>
        <button
          type="button"
          className={styles.action}
          onClick={() => { setComposing(true); setOpenCase(null); }}
        >
          {words.supportOpenCase}
        </button>
      </div>
      <p className={styles.lead}>{words.supportLead}</p>

      {composing ? (
        <NewCase
          locale={locale}
          words={words}
          onCancel={() => setComposing(false)}
          onOpened={async (id) => { setComposing(false); await loadCases(); await showCase(id); }}
        />
      ) : null}

      {openCase ? (
        <CaseDetail
          detail={openCase}
          words={words}
          locale={locale}
          onClose={() => setOpenCase(null)}
          onChanged={() => refreshCase(openCase.caseId)}
        />
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{words.supportYourCases}</h2>
        {failed ? (
          <>
            <p className={styles.muted}>{words.loadFailed}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={() => void loadCases()}>
                {words.retry}
              </button>
            </div>
          </>
        ) : cases === null ? (
          <p className={styles.muted}>{words.loading}</p>
        ) : cases.length === 0 ? (
          <p className={styles.muted}>{words.supportNoCases}</p>
        ) : (
          <ul className={styles.list}>
            {cases.map((row) => (
              <li key={row.caseId} className={styles.case}>
                <button
                  type="button"
                  className={styles.caseOpen}
                  onClick={() => void showCase(row.caseId)}
                  disabled={openingId === row.caseId}
                  aria-current={openCase?.caseId === row.caseId ? 'true' : undefined}
                >
                  {row.subject}
                </button>
                <div className={styles.caseMeta}>
                  <span className={styles.badge}>
                    {words[`supportCategory_${row.category}`] ?? row.category}
                  </span>
                  <span className={styles.badge}>
                    {words[`supportStatus_${row.status}`] ?? row.status}
                  </span>
                  <span className={styles.badge}>
                    {row.messageCount} {words.supportMessageCount}
                  </span>
                  <time className={styles.when} dateTime={row.lastReplyAt ?? row.createdAt}>
                    {formatWhen(row.lastReplyAt ?? row.createdAt, locale)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
function CaseDetail({
  detail,
  words,
  locale,
  onClose,
  onChanged,
}: {
  detail: SupportCaseDetail;
  words: Record<string, string>;
  locale: 'en' | 'ar';
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <section className={styles.panel} aria-label={detail.subject}>
      <div className={styles.head}>
        <h2 className={styles.sectionTitle}>{detail.subject}</h2>
        <button type="button" className={styles.secondary} onClick={onClose}>{words.close}</button>
      </div>

      <div className={styles.caseMeta}>
        <span className={styles.badge}>{words[`supportStatus_${detail.status}`] ?? detail.status}</span>
        <span className={styles.badge}>{words[`supportCategory_${detail.category}`] ?? detail.category}</span>
        {detail.reopenedCount > 0 ? (
          <span className={styles.badge}>{words.supportReopenedTimes} {detail.reopenedCount}</span>
        ) : null}
      </div>

      {detail.messages.length === 0 ? (
        <p className={styles.muted}>{words.supportNoMessages}</p>
      ) : (
        <ul className={styles.thread}>
          {detail.messages.map((message) => (
            <li
              key={message.id}
              className={`${styles.message} ${message.fromMe ? styles.messageMine : ''}`}
            >
              {/* Who wrote it comes from the server's `fromMe`. Warsha's side is
                  labelled by role, never by a staff member's name. */}
              <p className={styles.messageWho}>
                {message.fromMe ? words.supportFromYou : words.supportFromWarsha}
                <time className={styles.when} dateTime={message.createdAt}>
                  {formatWhen(message.createdAt, locale, true)}
                </time>
              </p>
              <p className={styles.messageBody}>{message.body}</p>
            </li>
          ))}
        </ul>
      )}

      {detail.canReply ? (
        <Reply caseId={detail.caseId} words={words} onSent={onChanged} />
      ) : detail.canReopen ? (
        <Reopen caseId={detail.caseId} words={words} onReopened={onChanged} />
      ) : (
        <p className={styles.note}>{words.supportClosedNote}</p>
      )}

      {detail.surveyAvailable ? (
        <Satisfaction caseId={detail.caseId} words={words} onSubmitted={onChanged} />
      ) : detail.satisfactionScore !== null ? (
        <p className={styles.note}>{words.supportRated} {detail.satisfactionScore}/5</p>
      ) : null}

      {detail.events.length > 0 ? (
        <details className={styles.history}>
          <summary className={styles.historySummary}>{words.supportHistory}</summary>
          <ol className={styles.historyList}>
            {detail.events.map((event) => (
              <li key={event.id} className={styles.historyRow}>
                <span>
                  {words[`supportAction_${event.action}`] ?? event.action}
                  {event.toStatus ? ` · ${words[`supportStatus_${event.toStatus}`] ?? event.toStatus}` : ''}
                </span>
                <span className={styles.when}>
                  {event.actorRole === 'staff' ? words.supportByWarsha : words.supportByYou}
                  {' · '}
                  {formatWhen(event.createdAt, locale, true)}
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

/**
 * Replying.
 *
 * The idempotency key is minted once per composed message and replaced only
 * after a send succeeds, so a double-click or a retry over a dropped response
 * returns the existing message rather than posting the paragraph twice.
 */
function Reply({
  caseId,
  words,
  onSent,
}: {
  caseId: string;
  words: Record<string, string>;
  onSent: () => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SupportFailure | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !replyValid(body)) return;
    setBusy(true);
    setFailure(null);
    const { error } = await supabase().rpc('reply_support_case', {
      p_case_id: caseId,
      p_body: body.trim(),
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      setFailure(classifySupportError(error.message));
      setBusy(false);
      return;
    }
    setBody('');
    setIdempotencyKey(newIdempotencyKey());
    await onSent();
    setBusy(false);
  };

  return (
    <form className={styles.reply} onSubmit={send}>
      <label className={styles.field}>
        <span className={styles.label}>{words.supportReplyLabel}</span>
        <textarea
          className={styles.textarea}
          rows={4}
          value={body}
          maxLength={REPLY_MAX}
          onChange={(event) => setBody(event.target.value)}
          disabled={busy}
        />
      </label>

      {failure ? (
        <p className={styles.failure} role="alert">{words[FAILURE_COPY[failure]]}</p>
      ) : null}

      <div className={styles.actions}>
        <button type="submit" className={styles.action} disabled={busy || !replyValid(body)}>
          {busy ? words.loading : words.supportSendReply}
        </button>
      </div>
    </form>
  );
}

/** Reopening, offered only when the server said it is possible. */
function Reopen({
  caseId,
  words,
  onReopened,
}: {
  caseId: string;
  words: Record<string, string>;
  onReopened: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SupportFailure | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !reopenReasonValid(reason)) return;
    setBusy(true);
    setFailure(null);
    const { error } = await supabase().rpc('reopen_support_case', {
      p_case_id: caseId,
      p_reason: reason.trim(),
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      setFailure(classifySupportError(error.message));
      setBusy(false);
      return;
    }
    setReason('');
    setIdempotencyKey(newIdempotencyKey());
    await onReopened();
    setBusy(false);
  };

  return (
    <form className={styles.reply} onSubmit={send}>
      <p className={styles.note}>{words.supportReopenNote}</p>
      <label className={styles.field}>
        <span className={styles.label}>{words.supportReopenLabel}</span>
        <textarea
          className={styles.textarea}
          rows={3}
          value={reason}
          maxLength={REOPEN_MAX}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
        />
      </label>

      {failure ? (
        <p className={styles.failure} role="alert">{words[FAILURE_COPY[failure]]}</p>
      ) : null}

      <div className={styles.actions}>
        <button type="submit" className={styles.action} disabled={busy || !reopenReasonValid(reason)}>
          {busy ? words.loading : words.supportReopenAction}
        </button>
      </div>
    </form>
  );
}

/** How it went. One to five, comment optional, offered once. */
function Satisfaction({
  caseId,
  words,
  onSubmitted,
}: {
  caseId: string;
  words: Record<string, string>;
  onSubmitted: () => Promise<void>;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || score === null) return;
    setBusy(true);
    setFailed(false);
    const { error } = await supabase().rpc('submit_support_satisfaction', {
      p_case_id: caseId,
      p_score: score,
      p_comment: comment.trim() || null,
    });
    if (error) {
      setFailed(true);
      setBusy(false);
      return;
    }
    await onSubmitted();
    setBusy(false);
  };

  return (
    <form className={styles.reply} onSubmit={send}>
      <fieldset className={styles.scoreSet}>
        <legend className={styles.label}>{words.supportRateLabel}</legend>
        <div className={styles.scoreRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className={score === value ? `${styles.score} ${styles.scoreOn}` : styles.score}
              onClick={() => setScore(value)}
              aria-pressed={score === value}
              disabled={busy}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>

      <label className={styles.field}>
        <span className={styles.label}>{words.supportRateComment}</span>
        <textarea
          className={styles.textarea}
          rows={2}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          disabled={busy}
        />
      </label>

      {failed ? <p className={styles.failure} role="alert">{words.supportGenericFailed}</p> : null}

      <div className={styles.actions}>
        <button type="submit" className={styles.action} disabled={busy || score === null}>
          {busy ? words.loading : words.supportRateSend}
        </button>
      </div>
    </form>
  );
}

function NewCase({
  locale,
  words,
  onCancel,
  onOpened,
}: {
  locale: 'en' | 'ar';
  words: Record<string, string>;
  onCancel: () => void;
  onOpened: (caseId: string) => Promise<void>;
}) {
  const [category, setCategory] = useState<string>('booking_help');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SupportFailure | null>(null);
  // One key per form, not per click: a double submit must not open two cases.
  const [idempotencyKey] = useState(newIdempotencyKey);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !subjectValid(subject) || !body.trim()) return;
    setBusy(true);
    setFailure(null);
    const { data, error } = await supabase().rpc('open_support_case', {
      p_category: category,
      p_subject: subject.trim(),
      p_body: body.trim(),
      p_idempotency_key: idempotencyKey,
      p_linked_type: null,
      p_linked_id: null,
      p_origin_surface: 'help_center',
      p_locale: locale,
    });
    if (error) {
      setFailure(classifySupportError(error.message));
      setBusy(false);
      return;
    }
    const caseId = (data as { caseId?: string } | null)?.caseId;
    if (caseId) await onOpened(caseId);
    setBusy(false);
  };

  return (
    <form className={styles.panel} onSubmit={submit}>
      <h2 className={styles.sectionTitle}>{words.supportOpenCase}</h2>

      <label className={styles.field}>
        <span className={styles.label}>{words.supportCategory}</span>
        <select
          className={styles.select}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          disabled={busy}
        >
          {SUPPORT_CATEGORIES.map((key) => (
            <option key={key} value={key}>{words[`supportCategory_${key}`] ?? key}</option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{words.supportSubject}</span>
        <input
          className={styles.input}
          value={subject}
          maxLength={SUBJECT_MAX}
          onChange={(event) => setSubject(event.target.value)}
          disabled={busy}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{words.supportBody}</span>
        <textarea
          className={styles.textarea}
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={busy}
        />
      </label>

      {failure ? (
        <p className={styles.failure} role="alert">{words[FAILURE_COPY[failure]]}</p>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>
          {words.cancel}
        </button>
        <button
          type="submit"
          className={styles.action}
          disabled={busy || !subjectValid(subject) || !body.trim()}
        >
          {busy ? words.loading : words.supportSend}
        </button>
      </div>
    </form>
  );
}

/** Every refusal the support RPCs raise has a sentence somebody can act on. */
const FAILURE_COPY: Record<SupportFailure, string> = {
  closed: 'supportCaseClosed',
  not_found: 'supportNotFound',
  rate_limited: 'supportRateLimited',
  too_long: 'supportTooLong',
  reopen_exhausted: 'supportReopenExhausted',
  reopen_window_passed: 'supportReopenWindowPassed',
  failed: 'supportGenericFailed',
};

function formatWhen(value: string, locale: 'en' | 'ar', withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(date);
}
