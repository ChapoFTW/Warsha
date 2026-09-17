'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Route } from 'next';

import { supabase } from '@/lib/supabase';
import { intlLocale, type Locale } from '@/lib/preferences';
import {
  accountHasRestriction,
  appealStatementIsValid,
  parseAccountTrustStatus,
  type AccountTrustStatus,
} from '@/src/account-standing/account-restriction';

import styles from '@/components/product-surface.module.css';

/**
 * What a restriction on this account means, and the way to appeal it.
 *
 * Restrictions are enforced by the server (202609170006); this section only
 * tells the person. It renders nothing for an account with nothing applied, so
 * nobody in good standing is shown a "status" they have no reason to read.
 * A restricted person keeps this page, support and their privacy tools whatever
 * the restriction, which is why it lives on the account page.
 *
 * The appeal goes through `submit_trust_appeal` with the action the status
 * names; one appeal per action, which the server enforces too.
 */
export function AccountStanding({ words, locale }: { words: Record<string, string>; locale: Locale }) {
  const [status, setStatus] = useState<AccountTrustStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);
  const [appealFailed, setAppealFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase().rpc('get_my_trust_status');
    const parsed = error ? null : parseAccountTrustStatus(data);
    if (!parsed) { setFailed(true); return; }
    setStatus(parsed);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const appeal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!status?.appealableActionId || !appealStatementIsValid(statement) || busy) return;
    setBusy(true);
    setAppealFailed(false);
    const { error } = await supabase().rpc('submit_trust_appeal', {
      p_enforcement_action_id: status.appealableActionId,
      p_statement: statement.trim(),
      p_idempotency_key: `appeal:${status.appealableActionId}`,
    });
    if (error) setAppealFailed(true);
    else { setStatement(''); await load(); }
    setBusy(false);
  };

  if (failed) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{words.standingTitle}</h2>
        <p className={styles.error} role="alert">{words.standingLoadFailed}</p>
        <button type="button" className={styles.secondary} onClick={() => void load()}>{words.retry}</button>
      </section>
    );
  }
  if (!status || !accountHasRestriction(status)) return null;

  const until = status.restrictionExpiresAt
    ? new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' })
      .format(new Date(status.restrictionExpiresAt))
    : null;

  return (
    <section className={styles.panel} aria-labelledby="account-standing-title">
      <h2 id="account-standing-title" className={styles.sectionTitle}>{words.standingTitle}</h2>
      {status.restriction !== 'none' ? (
        <p className={styles.lead}>{words[`standing_${status.restriction}`]}</p>
      ) : null}
      {status.communicationRestricted ? <p className={styles.muted}>{words.standingCommunication}</p> : null}
      {status.reviewRestricted ? <p className={styles.muted}>{words.standingReviews}</p> : null}
      {status.publicReason ? (
        <div className={styles.fact}>
          <span className={styles.factLabel}>{words.standingReason}</span>
          <span className={styles.factValue}>{status.publicReason}</span>
        </div>
      ) : null}
      {until ? (
        <div className={styles.fact}>
          <span className={styles.factLabel}>{words.standingUntil}</span>
          <span className={styles.factValue}>{until}</span>
        </div>
      ) : null}

      {status.appeal ? (
        <>
          <p className={styles.note} role="status">
            {words[`standingAppeal_${status.appeal.status}`] ?? words.standingAppeal_submitted}
          </p>
          {status.appeal.decisionNote ? <p className={styles.muted}>{status.appeal.decisionNote}</p> : null}
        </>
      ) : status.canAppeal ? (
        <form onSubmit={appeal} className={styles.field}>
          <label className={styles.field}>
            <span className={styles.label}>{words.standingAppealLabel}</span>
            <textarea className={styles.textarea} value={statement} maxLength={2000}
              onChange={(event) => setStatement(event.target.value)} disabled={busy} />
          </label>
          <span className={styles.hint}>{words.standingAppealHint}</span>
          {appealFailed ? <p className={styles.error} role="alert">{words.standingAppealFailed}</p> : null}
          <button type="submit" className={styles.action} disabled={busy || !appealStatementIsValid(statement)}>
            {busy ? words.loading : words.standingAppealSend}
          </button>
        </form>
      ) : null}

      <p className={styles.muted}>{words.standingSupport}</p>
      <Link className={styles.secondary} href={'/support' as Route}>{words.standingSupportLink}</Link>
    </section>
  );
}
