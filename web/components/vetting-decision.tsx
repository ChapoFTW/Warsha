'use client';

import { useState } from 'react';

import { ReauthDialog } from '@/components/reauth-dialog';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import {
  classifyDecisionError,
  decisionsFrom,
  evidenceValid,
  isAdverse,
  reasonCodeValid,
  safeReasonValid,
  EVIDENCE_MIN,
  SAFE_REASON_MAX,
  VETTING_DECISION_CAPABILITY,
  VETTING_DECISION_TARGET,
  VETTING_REASON_CODES,
  type DecisionRefusal,
  type VettingDecision,
} from '@/lib/console-decisions';
import type { Locale } from '@/lib/preferences';
import { reauthNeedFor } from '@/lib/reauth';
import { supabase } from '@/lib/supabase';

import styles from './governed-actions.module.css';

/**
 * Deciding a worker application.
 *
 * Every rule below is the database's, restated so an operator composes a
 * decision the server will accept rather than discovering the refusal after
 * writing three paragraphs.
 *
 * **Only legal moves are offered.** `private.worker_transition_allowed` decides
 * what a staff actor may do from the current state, and a decision that is not
 * reachable is not shown at all. A dropdown of all nine would be a list of
 * things that mostly cannot happen.
 *
 * **Capability follows the decision, not the form.** Approving needs
 * `review_criminal_records`; activating needs `activate_worker`; rejecting and
 * suspending need `reject_worker_application`. Each is checked separately, and
 * the freshness dialogue is opened for the capability the chosen decision
 * actually requires.
 *
 * **An adverse decision carries evidence.** `reject` and `suspend` demand a
 * private note of at least ten characters, because — in the migration's own
 * words — "a rejection with an empty note is a rejection nobody can review
 * later". The note is never shown to the worker; the safe reason is.
 *
 * **Activation is refused unless every gate passes.** The server checks the
 * gates independently, so the console shows them rather than deciding for
 * itself whether activation will work.
 *
 * Nothing here grants a product role, because there is no such thing to grant:
 * worker access is `private.worker_capability_active`, a verdict computed from
 * this state machine. Activating *is* the grant.
 */

const FAILURE_COPY: Record<DecisionRefusal, string> = {
  reauth: 'decisionReauth',
  'dual-control': 'decisionDualControl',
  capability: 'decisionCapability',
  'gates-unsatisfied': 'decisionGates',
  'invalid-transition': 'decisionInvalidTransition',
  'reason-required': 'decisionReasonRequired',
  'evidence-required': 'decisionEvidenceRequired2',
  'report-required': 'decisionReportRequired',
  duplicate: 'decisionDuplicate',
  'not-found': 'decisionNotFound',
  unknown: 'decisionFailed',
};

export function VettingDecisionPanel({
  userId,
  workerState,
  locale,
  onDecided,
}: {
  userId: string;
  workerState: string | null;
  locale: Locale;
  onDecided: () => Promise<void>;
}) {
  const words = appCopy[locale] as Record<string, string>;
  const { session, refresh } = useStaff();

  const [decision, setDecision] = useState<VettingDecision | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [safeReason, setSafeReason] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DecisionRefusal | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [reauthFor, setReauthFor] = useState<string | null>(null);

  const available = decisionsFrom(workerState);

  if (available.length === 0) {
    return (
      <section className={styles.block}>
        <h3 className={styles.title}>{words.decisionTitle}</h3>
        <p className={styles.note}>{words.decisionNoneAvailable}</p>
      </section>
    );
  }

  const capability = decision ? VETTING_DECISION_CAPABILITY[decision] : '';
  const need = decision ? reauthNeedFor(session, capability) : null;
  const adverse = decision ? isAdverse(decision) : false;

  const complete = Boolean(decision)
    && reasonCodeValid(reasonCode)
    && safeReasonValid(safeReason)
    && (!adverse || evidenceValid(privateNote));

  const reset = () => {
    setDecision(null);
    setReasonCode('');
    setSafeReason('');
    setPrivateNote('');
    setFailure(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!decision || !complete || busy) return;
    setBusy(true);
    setFailure(null);
    const { error } = await supabase().rpc('staff_worker_vetting_decision', {
      p_user_id: userId,
      p_decision: decision,
      p_reason_code: reasonCode.trim(),
      p_safe_reason: safeReason.trim(),
      // Null rather than an empty string when there is nothing to record: an
      // empty note would create an evidence row containing nothing.
      p_private_note: privateNote.trim() || null,
    });
    if (error) {
      const refusal = classifyDecisionError(error.message);
      setFailure(refusal);
      // Only a freshness refusal is worth a dialog. A capability refusal means
      // the role does not hold it, and re-authenticating would loop forever.
      if (refusal === 'reauth') setReauthFor(capability);
      setBusy(false);
      return;
    }
    setDone(words[`decision_${decision}`] ?? decision);
    reset();
    await onDecided();
    setBusy(false);
  };

  return (
    <section className={styles.block}>
      <h3 className={styles.title}>{words.decisionTitle}</h3>
      <p className={styles.lead}>{words.decisionLead}</p>

      {done ? <p className={styles.done} role="status">{words.decisionRecorded} {done}</p> : null}

      <div className={styles.choices}>
        {available.map((candidate) => {
          const candidateCapability = VETTING_DECISION_CAPABILITY[candidate];
          // Missing the capability disables the control rather than hiding it:
          // an operator should be able to see that a decision exists and that
          // somebody else has to make it.
          const held = session.capabilities.includes(candidateCapability);
          const on = decision === candidate;
          const className = [
            styles.choice,
            on ? styles.choiceOn : '',
            isAdverse(candidate) ? styles.choiceAdverse : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={candidate}
              type="button"
              className={className}
              disabled={!held || busy}
              aria-pressed={on}
              title={held ? undefined : `${words.decisionNeedsCapability} ${candidateCapability}`}
              onClick={() => { setDecision(on ? null : candidate); setFailure(null); setDone(null); }}
            >
              {words[`decision_${candidate}`] ?? candidate}
            </button>
          );
        })}
      </div>

      {decision ? (
        <form className={styles.form} onSubmit={submit}>
          {/* What this will do, before it is done. Stated from the state
              machine rather than described in general terms. */}
          <div className={styles.impact}>
            <strong>{words.decisionImpact}</strong>
            <ul className={styles.impactList}>
              <li>
                {words.decisionMovesTo}{' '}
                {words[`state_${VETTING_DECISION_TARGET[decision]}`]
                  ?? VETTING_DECISION_TARGET[decision]}
              </li>
              <li>{words.decisionLocksRole}</li>
              {decision === 'activate' || decision === 'reinstate' ? (
                <li>{words.decisionPublishes}</li>
              ) : null}
              {adverse ? <li>{words.decisionUnpublishes}</li> : null}
              <li>{words.decisionAudited} {capability}</li>
            </ul>
          </div>

          {need && need.kind === 'stale' ? (
            <p className={styles.note}>{words.decisionWillAskReauth}</p>
          ) : null}

          <label className={styles.field}>
            <span className={styles.label}>{words.decisionReasonCode}</span>
            <input
              className={styles.input}
              list="vetting-reason-codes"
              dir="ltr"
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
              disabled={busy}
            />
            <datalist id="vetting-reason-codes">
              {VETTING_REASON_CODES.map((code) => <option key={code} value={code} />)}
            </datalist>
            <span className={styles.hint}>{words.decisionReasonCodeHint}</span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{words.decisionSafeReason}</span>
            <textarea
              className={styles.textarea}
              rows={3}
              maxLength={SAFE_REASON_MAX}
              value={safeReason}
              onChange={(event) => setSafeReason(event.target.value)}
              disabled={busy}
            />
            <span className={styles.hint}>{words.decisionSafeReasonHint}</span>
            <span className={styles.counter}>{safeReason.trim().length} / {SAFE_REASON_MAX}</span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              {adverse ? words.decisionEvidenceRequired : words.decisionEvidenceOptional}
            </span>
            <textarea
              className={styles.textarea}
              rows={4}
              value={privateNote}
              onChange={(event) => setPrivateNote(event.target.value)}
              disabled={busy}
            />
            <span className={styles.hint}>
              {adverse ? `${words.decisionEvidenceHint} ${EVIDENCE_MIN}` : words.decisionEvidenceNever}
            </span>
          </label>

          {failure ? (
            <p className={styles.error} role="alert">{words[FAILURE_COPY[failure]]}</p>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={reset} disabled={busy}>
              {words.cancel}
            </button>
            <button type="submit" className={styles.submit} disabled={!complete || busy}>
              {busy ? words.loading : words.decisionRecord}
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
