'use client';

import { useState } from 'react';

import { ReauthDialog } from '@/components/reauth-dialog';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import {
  classifyDecisionError,
  enforcementCapability,
  evidenceSummaryValid,
  mayCarryExpiry,
  permanentBanRequiresReport,
  publicReasonValid,
  ENFORCEMENT_ACTIONS,
  ENFORCEMENT_REASON_CODES,
  EVIDENCE_SUMMARY_MAX,
  PUBLIC_REASON_MAX,
  type DecisionRefusal,
} from '@/lib/console-decisions';
import type { Locale } from '@/lib/preferences';
import { newIdempotencyKey, isUuid } from '@/lib/staff-mutations';
import { supabase } from '@/lib/supabase';

import styles from './governed-actions.module.css';

/**
 * Recording an enforcement action.
 *
 * `staff_record_enforcement_action` writes to `trust_enforcement_actions`,
 * which has an update trigger that raises "Enforcement history is immutable".
 * Nothing recorded here can be edited or withdrawn afterwards — the backend's
 * own inverse is a *new* action of type `restoration`, and that is the only
 * undo this offers. No "unban" button is invented, because the schema does not
 * model one.
 *
 * Three constraints belong to a permanent ban alone, and all three are the
 * table's:
 *
 *   - it needs `approve_permanent_ban` rather than
 *     `issue_temporary_restriction`, and consumes dual control on top;
 *   - it must cite a report that was investigated
 *     (`trust_enforcement_actions_no_automatic_ban_check`);
 *   - it may never carry an expiry (`..._expiry_check`).
 *
 * The public reason is shown to the person it is about; the evidence summary
 * never is. Both are required — the table refuses an action with fewer than
 * three characters of evidence, which is its way of saying that an
 * unexplained enforcement action is not an acceptable record.
 */

const FAILURE_COPY: Record<DecisionRefusal, string> = {
  reauth: 'decisionReauth',
  'dual-control': 'decisionDualControl',
  capability: 'decisionCapability',
  'gates-unsatisfied': 'decisionGates',
  'invalid-transition': 'decisionInvalidTransition',
  'reason-required': 'decisionReasonRequired',
  'evidence-required': 'decisionEvidenceRequired2',
  'report-required': 'enforcementReportRequired',
  duplicate: 'decisionDuplicate',
  'not-found': 'decisionNotFound',
  unknown: 'decisionFailed',
};

export function EnforcementPanel({
  subjectUserId,
  locale,
  onRecorded,
}: {
  subjectUserId: string;
  locale: Locale;
  onRecorded: () => Promise<void>;
}) {
  const words = appCopy[locale] as Record<string, string>;
  const { session, refresh } = useStaff();

  const [action, setAction] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [publicReason, setPublicReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [reportId, setReportId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DecisionRefusal | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [reauthFor, setReauthFor] = useState<string | null>(null);
  // One key per composed action. `unique (idempotency_key)` on the table means
  // a retry after a dropped response cannot record the same action twice.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const capability = action ? enforcementCapability(action) : '';
  const held = action ? session.capabilities.includes(capability) : false;
  const needsReport = action ? permanentBanRequiresReport(action) : false;
  const canExpire = action ? mayCarryExpiry(action) : false;

  const complete = Boolean(action)
    && ENFORCEMENT_REASON_CODES.includes(reasonCode)
    && publicReasonValid(publicReason)
    && evidenceSummaryValid(evidence)
    && (!needsReport || isUuid(reportId));

  const reset = () => {
    setAction(null);
    setReasonCode('');
    setPublicReason('');
    setEvidence('');
    setReportId('');
    setExpiresAt('');
    setFailure(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!action || !complete || busy) return;
    setBusy(true);
    setFailure(null);
    const { error } = await supabase().rpc('staff_record_enforcement_action', {
      p_subject_user_id: subjectUserId,
      p_action_type: action,
      p_reason_code: reasonCode,
      p_public_reason: publicReason.trim(),
      p_evidence_summary: evidence.trim(),
      p_idempotency_key: idempotencyKey,
      p_report_id: needsReport && isUuid(reportId) ? reportId.trim() : null,
      // A permanent ban may never carry an expiry; the table refuses one.
      p_expires_at: canExpire && expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    if (error) {
      const refusal = classifyDecisionError(error.message);
      setFailure(refusal);
      if (refusal === 'reauth') setReauthFor(capability);
      setBusy(false);
      return;
    }
    setDone(words[`enforcement_${action}`] ?? action);
    setIdempotencyKey(newIdempotencyKey());
    reset();
    await onRecorded();
    setBusy(false);
  };

  return (
    <section className={styles.block}>
      <h3 className={styles.title}>{words.enforcementTitle}</h3>
      <p className={styles.lead}>{words.enforcementLead}</p>

      {done ? <p className={styles.done} role="status">{words.enforcementRecorded} {done}</p> : null}

      <div className={styles.choices}>
        {ENFORCEMENT_ACTIONS.map((candidate) => {
          const candidateCapability = enforcementCapability(candidate);
          const allowed = session.capabilities.includes(candidateCapability);
          const on = action === candidate;
          const className = [
            styles.choice,
            on ? styles.choiceOn : '',
            candidate === 'permanent_ban' || candidate === 'suspension' ? styles.choiceAdverse : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={candidate}
              type="button"
              className={className}
              disabled={!allowed || busy}
              aria-pressed={on}
              title={allowed ? undefined : `${words.decisionNeedsCapability} ${candidateCapability}`}
              onClick={() => { setAction(on ? null : candidate); setFailure(null); setDone(null); }}
            >
              {words[`enforcement_${candidate}`] ?? candidate}
            </button>
          );
        })}
      </div>

      {action ? (
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.impact}>
            <strong>{words.decisionImpact}</strong>
            <ul className={styles.impactList}>
              <li>{words.enforcementImmutable}</li>
              <li>{words.enforcementPublicSeen}</li>
              <li>{words.decisionAudited} {capability}</li>
              {action === 'permanent_ban' ? <li>{words.enforcementDualControl}</li> : null}
              {action === 'permanent_ban' ? <li>{words.enforcementNoExpiry}</li> : null}
              {action === 'restoration' ? <li>{words.enforcementRestorationNote}</li> : null}
            </ul>
          </div>

          {!held ? <p className={styles.note}>{words.decisionNeedsCapability} {capability}</p> : null}

          <label className={styles.field}>
            <span className={styles.label}>{words.decisionReasonCode}</span>
            <select
              className={styles.select}
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
              disabled={busy}
            >
              <option value="">{words.enforcementChooseReason}</option>
              {ENFORCEMENT_REASON_CODES.map((code) => (
                <option key={code} value={code}>{words[`reason_${code}`] ?? code}</option>
              ))}
            </select>
            {/* A closed list here, unlike vetting: this column is a check
                constraint listing exactly these twenty-one values. */}
            <span className={styles.hint}>{words.enforcementReasonHint}</span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{words.enforcementPublicReason}</span>
            <textarea
              className={styles.textarea}
              rows={2}
              maxLength={PUBLIC_REASON_MAX}
              value={publicReason}
              onChange={(event) => setPublicReason(event.target.value)}
              disabled={busy}
            />
            <span className={styles.hint}>{words.enforcementPublicReasonHint}</span>
            <span className={styles.counter}>{publicReason.trim().length} / {PUBLIC_REASON_MAX}</span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{words.enforcementEvidence}</span>
            <textarea
              className={styles.textarea}
              rows={4}
              maxLength={EVIDENCE_SUMMARY_MAX}
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              disabled={busy}
            />
            <span className={styles.hint}>{words.enforcementEvidenceHint}</span>
          </label>

          {needsReport ? (
            <label className={styles.field}>
              <span className={styles.label}>{words.enforcementReport}</span>
              <input
                className={styles.input}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={reportId}
                onChange={(event) => setReportId(event.target.value.trim())}
                disabled={busy}
              />
              <span className={styles.hint}>{words.enforcementReportHint}</span>
            </label>
          ) : null}

          {canExpire ? (
            <label className={styles.field}>
              <span className={styles.label}>{words.enforcementExpires}</span>
              <input
                className={styles.input}
                type="datetime-local"
                dir="ltr"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                disabled={busy}
              />
              <span className={styles.hint}>{words.enforcementExpiresHint}</span>
            </label>
          ) : null}

          {failure ? (
            <p className={styles.error} role="alert">{words[FAILURE_COPY[failure]]}</p>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={reset} disabled={busy}>
              {words.cancel}
            </button>
            <button type="submit" className={styles.submit} disabled={!complete || busy || !held}>
              {busy ? words.loading : words.enforcementRecord}
            </button>
          </div>
        </form>
      ) : null}

      {reauthFor ? (
        <ReauthDialog
          capability={reauthFor}
          onClose={() => setReauthFor(null)}
          onSuccess={() => { setReauthFor(null); void refresh(); }}
        />
      ) : null}
    </section>
  );
}
