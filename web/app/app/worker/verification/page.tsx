'use client';

import { useState } from 'react';

import { AppShell, useAccount } from '@/components/app-shell';
import { appCopy } from '@/lib/app-copy';
import { workerNav } from '@/lib/nav';
import {
  actionableGates,
  canAppeal,
  gateProgress,
  isAwaitingReview,
  needsWorkerAction,
} from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from './verification.module.css';

/**
 * Worker verification.
 *
 * Every judgement on this page comes from `src/onboarding/onboarding-types.ts`
 * — the same module the mobile app routes on. `actionableGates` already knows
 * which gates a worker can act on and which are staff decisions they can only
 * wait for; `isAwaitingReview`, `needsWorkerAction` and `canAppeal` already
 * encode what each worker state means. Restating any of that here would be a
 * second authority, and the two would disagree the first time a gate moved.
 *
 * WPS-025 asks for simplicity for workers, so this shows one clear next thing
 * and a plain list of what is left — not a form with twelve fields.
 *
 * Document capture is deliberately not offered here. Identity photographs and
 * the criminal-record certificate are taken with a camera under
 * `record_my_identity_capture` and `submit_my_criminal_record`, and a desktop
 * file picker is a worse and riskier path for the most sensitive record Warsha
 * holds. The page says to use the app for that step rather than pretending.
 */
export default function WorkerVerificationPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const account = useAccount();
  const state = account?.state ?? null;

  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<'sent' | 'failed' | null>(null);

  const gates = actionableGates(state);
  const progress = gateProgress(state);
  const awaiting = isAwaitingReview(state?.workerState ?? null);
  const needsAction = needsWorkerAction(state?.workerState ?? null);
  const mayAppeal = canAppeal(state?.workerState ?? null);

  const gateLabel = (gate: string) =>
    (words as Record<string, string>)[`gate_${gate}`] ?? gate;

  const submitForReview = async () => {
    setBusy(true);
    setOutcome(null);
    const { error } = await supabase().rpc('submit_my_identity_for_review');
    setOutcome(error ? 'failed' : 'sent');
    setBusy(false);
  };

  return (
    <AppShell nav={workerNav(words)} mode={words.modeWorker}>
      <h1 className={styles.title}>{words.workerVerificationTitle}</h1>

      {state === null ? (
        <p className={styles.muted}>{words.loading}</p>
      ) : state.workerCapabilityActive ? (
        <section className={styles.status}>
          <p className={styles.statusTitle}>{words.workerActive}</p>
          <p className={styles.muted}>{words.workerActiveBody}</p>
        </section>
      ) : (
        <>
          <section className={styles.status}>
            <p className={styles.statusTitle}>
              {awaiting ? words.workerVerificationPending
                : needsAction ? words.workerNeedsAction
                  : words.workerOnboardingIncomplete}
            </p>
            {/* The worker-safe reason, when the server has one. It is written
                for the person it is about; staff evidence is never sent here. */}
            {state.latestSafeReason ? (
              <p className={styles.reason}>{state.latestSafeReason}</p>
            ) : null}
            {progress.total > 0 ? (
              <p className={styles.progress}>
                {words.gateProgress
                  .replace('{done}', String(progress.done))
                  .replace('{total}', String(progress.total))}
              </p>
            ) : null}
          </section>

          {gates.length > 0 ? (
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>{words.workerRemainingSteps}</h2>
              <ol className={styles.gates}>
                {gates.map((gate, index) => (
                  <li key={gate} className={index === 0 ? styles.gateNext : styles.gate}>
                    <span className={styles.gateLabel}>{gateLabel(gate)}</span>
                    {index === 0 ? (
                      <span className={styles.gateBadge}>{words.gateNext}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
              <p className={styles.note}>{words.verificationUseApp}</p>
            </section>
          ) : awaiting ? (
            <section className={styles.panel}>
              <p className={styles.muted}>{words.verificationNothingToDo}</p>
            </section>
          ) : null}

          {/* Offered only when the state genuinely accepts it. A submit button
              that the server refuses is the failure this work exists to end. */}
          {needsAction && gates.length === 0 ? (
            <button
              type="button"
              className={styles.action}
              onClick={() => void submitForReview()}
              disabled={busy}
            >
              {busy ? words.loading : words.verificationSubmit}
            </button>
          ) : null}

          {outcome === 'sent' ? (
            <p className={styles.ok} role="status">{words.verificationSubmitted}</p>
          ) : outcome === 'failed' ? (
            <p className={styles.failure} role="alert">{words.verificationSubmitFailed}</p>
          ) : null}

          {mayAppeal ? (
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>{words.verificationAppealTitle}</h2>
              <p className={styles.muted}>{words.verificationAppealBody}</p>
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
