'use client';

import { useCallback, useEffect, useState } from 'react';

import { AppShell, useAccount } from '@/components/app-shell';
import { appCopy } from '@/lib/app-copy';
import {
  newIdempotencyKey,
  parseCaseDetail,
  parseCaseSummaries,
  subjectValid,
  SUBJECT_MAX,
  SUPPORT_CATEGORIES,
  type SupportCaseDetail,
  type SupportCaseSummary,
} from '@/lib/support';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from './support.module.css';

/**
 * Support.
 *
 * Three real things: the cases this account has opened, one case in detail,
 * and a form that opens a new one. Each is backed by an authority that exists
 * — the list by the owner-scoped RLS policy on `support_tickets`, the detail by
 * `get_my_support_case`, the intake by `open_support_case`.
 *
 * There is deliberately **no reply box**. `reply_support_case` is called by the
 * mobile repository but was never shipped, so a reply field here would compose
 * a message with nowhere to send it. The case detail says replies happen by
 * email instead of pretending otherwise.
 */
export default function SupportPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const account = useAccount();
  const mode = account?.roles.worker && !account?.roles.customer ? 'worker' : 'customer';

  const [cases, setCases] = useState<SupportCaseSummary[] | null>(null);
  const [openCase, setOpenCase] = useState<SupportCaseDetail | null>(null);
  const [composing, setComposing] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadCases = useCallback(async () => {
    setFailed(false);
    // Read through the owner-scoped RLS policy. There is no list RPC, and the
    // policy is the governing authority: `requester_id = auth.uid()`.
    const { data, error } = await supabase()
      .from('support_tickets')
      .select('id,category,subject,status,priority,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) setFailed(true);
    else setCases(parseCaseSummaries(data));
  }, []);

  useEffect(() => { void loadCases(); }, [loadCases]);

  const showCase = async (id: string) => {
    const { data, error } = await supabase().rpc('get_my_support_case', { p_case_id: id });
    if (!error) setOpenCase(parseCaseDetail(data));
  };

  return (
    <AppShell nav={navFor(mode, words)} mode={mode === 'worker' ? words.modeWorker : words.modeCustomer}>
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
        <CaseDetail detail={openCase} words={words} onClose={() => setOpenCase(null)} />
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{words.supportYourCases}</h2>
        {failed ? (
          <p className={styles.muted}>{words.loadFailed}</p>
        ) : cases === null ? (
          <p className={styles.muted}>{words.loading}</p>
        ) : cases.length === 0 ? (
          <p className={styles.muted}>{words.supportNoCases}</p>
        ) : (
          <ul className={styles.list}>
            {cases.map((row) => (
              <li key={row.id} className={styles.case}>
                <button type="button" className={styles.caseOpen} onClick={() => void showCase(row.id)}>
                  {row.subject}
                </button>
                <div className={styles.caseMeta}>
                  <span className={styles.badge}>
                    {(words as Record<string, string>)[`supportCategory_${row.category}`] ?? row.category}
                  </span>
                  <span className={styles.badge}>
                    {(words as Record<string, string>)[`supportStatus_${row.status}`] ?? row.status}
                  </span>
                  <time className={styles.when} dateTime={row.created_at}>
                    {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
                      dateStyle: 'medium',
                    }).format(new Date(row.created_at))}
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
  const [failure, setFailure] = useState<string | null>(null);
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
      setFailure(/rate limit/i.test(error.message ?? '')
        ? words.supportRateLimited
        : words.supportOpenFailed);
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

      {failure ? <p className={styles.failure} role="alert">{failure}</p> : null}

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

function CaseDetail({
  detail,
  words,
  onClose,
}: {
  detail: SupportCaseDetail;
  words: Record<string, string>;
  onClose: () => void;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.sectionTitle}>{detail.subject}</h2>
        <button type="button" className={styles.secondary} onClick={onClose}>{words.close}</button>
      </div>

      <div className={styles.caseMeta}>
        <span className={styles.badge}>
          {words[`supportStatus_${detail.status}`] ?? detail.status}
        </span>
        <span className={styles.badge}>
          {words[`supportCategory_${detail.category}`] ?? detail.category}
        </span>
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
              <p className={styles.messageBody}>{message.body}</p>
            </li>
          ))}
        </ul>
      )}

      {/* No reply field: `reply_support_case` was never shipped, so a box here
          would compose a message with nowhere to send it. */}
      <p className={styles.note}>{words.supportReplyByEmail}</p>
    </section>
  );
}

function navFor(mode: 'customer' | 'worker', words: Record<string, string>) {
  return mode === 'worker'
    ? [
      { href: '/worker', label: words.navHome },
      { href: '/worker/verification', label: words.navVerification },
      { href: '/notifications', label: words.navNotifications },
      { href: '/support', label: words.navSupport },
    ]
    : [
      { href: '/', label: words.navHome },
      { href: '/notifications', label: words.navNotifications },
      { href: '/support', label: words.navSupport },
    ];
}
