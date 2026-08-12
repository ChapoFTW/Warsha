'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge, Identifier, Timestamp } from '@/components/console-bits';
import { EnforcementPanel } from '@/components/enforcement-action';
import { VettingDecisionPanel } from '@/components/vetting-decision';
import { appCopy } from '@/lib/app-copy';
import {
  parseVettingDetail,
  subjectRefFor,
  type VettingCaseDetail,
  type VettingGate,
} from '@/lib/console-decisions';
import type { Locale } from '@/lib/preferences';
import type { StaffSession } from '@/lib/staff';
import { supabase } from '@/lib/supabase';

import styles from './account-detail.module.css';
import actions from './governed-actions.module.css';
import table from './console-table.module.css';

/**
 * A worker's vetting case: the evidence, then the decision.
 *
 * The evidence comes from `staff_worker_vetting_detail`, which is keyed by the
 * pseudonymous subject reference. An operator who reached this from an account
 * lookup already holds the user id, so the reference is derived from it — the
 * same SHA-256 the server computes. That is not a way round the queue's
 * pseudonymity: the hash is one-way, the queue still hands out only references,
 * and this RPC still demands `review_worker_vetting` and logs the access.
 *
 * **Gates are shown, not judged.** `activate` is refused by the server unless
 * every activation gate passes independently, so the console displays them and
 * lets the refusal be the server's. Deciding here whether activation "should"
 * work would be a second opinion that eventually disagrees.
 *
 * **The OCR trail carries no confidence and no extracted value**, because the
 * function returns neither — deliberately, so a reviewer cannot defer to a
 * machine's certainty about a document they are supposed to be looking at.
 */
export function WorkerCase({
  userId,
  locale,
  session,
  onChanged,
}: {
  userId: string;
  locale: Locale;
  session: StaffSession;
  onChanged: () => Promise<void>;
}) {
  const words = appCopy[locale] as Record<string, string>;
  const [detail, setDetail] = useState<VettingCaseDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'refused' | 'none'>('loading');

  const mayReview = session.capabilities.includes('review_worker_vetting');

  const load = useCallback(async () => {
    if (!mayReview) { setState('refused'); return; }
    setState('loading');
    const reference = await subjectRefFor(userId);
    if (!reference) { setState('refused'); return; }
    const { data, error } = await supabase()
      .rpc('staff_worker_vetting_detail', { p_subject_ref: reference });
    if (error) {
      // "Unknown case" means this account never entered worker onboarding,
      // which is an ordinary answer rather than a failure.
      setState(/unknown case/i.test(error.message ?? '') ? 'none' : 'refused');
      setDetail(null);
      return;
    }
    const parsed = parseVettingDetail(data);
    setDetail(parsed);
    setState(parsed ? 'ready' : 'none');
  }, [userId, mayReview]);

  useEffect(() => { void load(); }, [load]);

  const reload = useCallback(async () => {
    await load();
    await onChanged();
  }, [load, onChanged]);

  if (state === 'refused') {
    return (
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.caseTitle}</h3>
        <p className={styles.withheld}>{words.caseRefused}</p>
      </section>
    );
  }

  if (state === 'loading') {
    return (
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.caseTitle}</h3>
        <p className={table.muted}>{words.loading}</p>
      </section>
    );
  }

  if (state === 'none' || !detail) {
    return (
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.caseTitle}</h3>
        <p className={table.muted}>{words.caseNone}</p>
      </section>
    );
  }

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.caseTitle}</h3>

        <div className={styles.subject}>
          <Badge tone="strong">
            {words[`state_${detail.workerState}`] ?? detail.workerState ?? '—'}
          </Badge>
          <Badge tone="quiet">
            {words[`tier_${detail.capabilityTier}`] ?? detail.capabilityTier}
          </Badge>
          <Identifier value={detail.subjectRef} short />
        </div>

        <Gates
          title={words.caseActivationGates}
          gates={detail.gates}
          words={words}
          empty={words.caseNoGates}
        />
        <Gates
          title={words.caseProvisionalGates}
          gates={detail.provisionalGates}
          words={words}
          empty={words.caseNoGates}
        />

        <div className={styles.facts} style={{ marginTop: 14 }}>
          <div className={styles.fact}>
            <span className={styles.factLabel}>{words.caseFieldsConfirmed}</span>
            <span className={styles.factValue}>
              {detail.fieldsConfirmedByWorker ? words.consoleYes : words.consoleNo}
            </span>
          </div>
          {detail.certificate ? (
            <div className={styles.fact}>
              <span className={styles.factLabel}>{words.caseCertificate}</span>
              <span className={styles.factValue}>
                {words[`certificateStatus_${detail.certificate.status}`] ?? detail.certificate.status}
              </span>
            </div>
          ) : null}
        </div>

        {detail.documents.length > 0 ? (
          <div className={table.scroll} style={{ marginTop: 14 }}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th>{words.caseDocument}</th>
                  <th>{words.colStatus}</th>
                  <th>{words.caseCapture}</th>
                  <th>{words.caseSide}</th>
                </tr>
              </thead>
              <tbody>
                {detail.documents.map((document) => (
                  <tr key={`${document.documentType}:${document.pageSide ?? ''}`}>
                    <td>{words[`document_${document.documentType}`] ?? document.documentType}</td>
                    <td><Badge tone="quiet">{document.status}</Badge></td>
                    <td>{document.captureSource ?? '—'}</td>
                    <td>{document.pageSide ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={table.muted} style={{ marginTop: 12 }}>{words.caseNoDocuments}</p>
        )}

        {detail.extractionRuns.length > 0 ? (
          <>
            <p className={actions.note} style={{ marginTop: 14 }}>{words.caseOcrNote}</p>
            <div className={table.scroll}>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th>{words.caseDocument}</th>
                    <th>{words.caseOutcome}</th>
                    <th>{words.caseFields}</th>
                    <th>{words.colTime}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.extractionRuns.map((run, index) => (
                    <tr key={`${run.documentType}:${run.requestedAt}:${index}`}>
                      <td>{words[`document_${run.documentType}`] ?? run.documentType}</td>
                      <td><Badge tone="quiet">{run.outcome}</Badge></td>
                      <td>{run.fieldsExtracted ?? '—'}</td>
                      <td>
                        <Timestamp value={run.requestedAt} locale={locale}
                          timeZone={session.displayTimezone} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <VettingDecisionPanel
        userId={userId}
        workerState={detail.workerState}
        locale={locale}
        onDecided={reload}
      />

      <EnforcementPanel
        subjectUserId={userId}
        locale={locale}
        onRecorded={reload}
      />
    </>
  );
}

/** Gates as a list of pass/fail, named by the server's own keys. */
function Gates({
  title,
  gates,
  words,
  empty,
}: {
  title: string;
  gates: VettingGate[];
  words: Record<string, string>;
  empty: string;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <span className={actions.title}>{title}</span>
      {gates.length === 0 ? (
        <p className={table.muted}>{empty}</p>
      ) : (
        <ul className={styles.chips}>
          {gates.map((gate) => (
            <li key={gate.key}>
              <Badge tone={gate.passed ? 'quiet' : 'strong'}>
                {(words[`gate_${gate.key}`] ?? gate.key)}
                {gate.passed ? ' ✓' : ' ✗'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
