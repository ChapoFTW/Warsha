'use client';

import { useState } from 'react';

import { Badge, Empty, Identifier, Timestamp } from '@/components/console-bits';
import { ConsoleShell } from '@/components/console-shell';
import { ReauthDialog } from '@/components/reauth-dialog';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import {
  BINDABLE_ENVIRONMENTS, bindingOffer, bindingReasonValid, BINDING_REASON_MIN,
  parseVerification, projectRefFromSupabaseUrl, summarizeVerification,
  type BindableEnvironment, type VerificationResult,
} from '@/lib/platform';
import { isReauthRefusal, reauthNeedFor } from '@/lib/reauth';
import { hasCapability } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/governed-actions.module.css';
import table from '@/components/console-table.module.css';
import page from './page.module.css';

/**
 * Platform environment and release verification.
 *
 * Two existing database authorities, given the operator interface they never
 * had. `staff_bind_platform_environment` is why a hosted project could sit on
 * its `local` bootstrap row indefinitely: the RPC needs a real staff session,
 * so the Supabase SQL editor cannot call it either, and until now nothing in
 * the console could.
 *
 * Nothing here weakens what the database enforces. The capability, the session,
 * the fresh-authentication window, the expected-current-environment check, the
 * expected-project-ref check and the one-way semantics all still live in the
 * RPC and still refuse. This page's guards only decide what to *offer*, so an
 * operator is not invited to compose an action that will be rejected.
 *
 * The project reference is read from the connection the browser is already
 * using rather than typed, because an operator retyping an internal identifier
 * is a transcription error waiting to be audited.
 */
export default function PlatformPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session, refresh } = useStaff();

  const mayBind = hasCapability(session, 'manage_feature_flags');
  const mayVerify = hasCapability(session, 'view_audit_logs');
  const need = reauthNeedFor(session, 'manage_feature_flags');

  const projectRef = projectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const offer = bindingOffer(session, projectRef);

  const [target, setTarget] = useState<BindableEnvironment>('development');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [askReauth, setAskReauth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bound, setBound] = useState(false);

  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const environmentName = (key: string) =>
    key === 'development' ? words.platformEnvDevelopment
      : key === 'staging' ? words.platformEnvStaging
        : key === 'production' ? words.platformEnvProduction
          : words.platformEnvUnconfigured;

  async function bind() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase().rpc('staff_bind_platform_environment', {
      p_expected_current_environment: 'local',
      p_target_environment: target,
      p_expected_project_ref: projectRef,
      p_reason: reason.trim(),
    });
    if (rpcError) {
      if (isReauthRefusal(rpcError)) setAskReauth(true);
      else setError(rpcError.message);
    } else {
      setBound(true);
      setConfirming(false);
      // The session carries the environment, so it must be re-read before the
      // banner and this page can stop describing the old state.
      await refresh();
    }
    setBusy(false);
  }

  async function verify() {
    setVerifyBusy(true);
    setVerifyError(null);
    const { data, error: rpcError } = await supabase().rpc('verify_platform_release');
    if (rpcError) {
      if (isReauthRefusal(rpcError)) setAskReauth(true);
      else setVerifyError(rpcError.message);
      setVerification(null);
    } else {
      setVerification(parseVerification(data));
    }
    setVerifyBusy(false);
  }

  const summary = verification ? summarizeVerification(verification) : null;

  return (
    <ConsoleShell title={words.platformTitle}>
      <p className={table.lead}>{words.platformLead}</p>

      {askReauth ? (
        <ReauthDialog
          capability="manage_feature_flags"
          onClose={() => setAskReauth(false)}
          onSuccess={() => setAskReauth(false)}
        />
      ) : null}

      {/* --- Platform environment ------------------------------------------ */}
      <section className={styles.block} aria-labelledby="environment">
        <h2 id="environment" className={styles.title}>{words.platformEnvHeading}</h2>
        <p className={styles.lead}>{words.platformEnvExplain}</p>

        <dl className={page.facts}>
          <div>
            <dt>{words.platformEnvCurrent}</dt>
            <dd>
              <Badge tone={offer.kind === 'bound' ? 'plain' : 'strong'}>
                {offer.kind === 'bound'
                  ? environmentName(offer.environment)
                  : words.platformEnvUnconfigured}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>{words.platformEnvProject}</dt>
            <dd>{projectRef ? <Identifier value={projectRef} /> : '—'}</dd>
          </div>
        </dl>

        {!mayBind ? (
          <p className={table.error}>{words.platformEnvNoCapability}</p>
        ) : bound || offer.kind === 'bound' ? (
          <p className={styles.hint} role="status">
            {bound ? words.platformEnvBound : words.platformEnvAlreadyBound}
          </p>
        ) : offer.kind === 'unavailable' ? (
          // Fail closed. Nothing actionable is offered when the state does not
          // match the transition the RPC will accept.
          <p className={table.error} role="alert">{words.platformEnvBlocked}</p>
        ) : !confirming ? (
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="target">
                {words.platformEnvTarget}
              </label>
              <select
                id="target"
                className={styles.select}
                value={target}
                onChange={(event) => setTarget(event.target.value as BindableEnvironment)}
              >
                {BINDABLE_ENVIRONMENTS.map((option) => (
                  <option key={option} value={option}>{environmentName(option)}</option>
                ))}
              </select>
              <p className={styles.hint}>{words.platformEnvTargetHint}</p>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="reason">
                {words.platformEnvReason}
              </label>
              <textarea
                id="reason"
                className={styles.textarea}
                value={reason}
                minLength={BINDING_REASON_MIN}
                onChange={(event) => setReason(event.target.value)}
                placeholder={words.platformEnvReasonPlaceholder}
              />
              <p className={styles.hint}>{words.platformEnvReasonHint}</p>
            </div>

            {need.kind === 'stale' ? (
              <p className={styles.hint}>{words.reauthRequired}</p>
            ) : null}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.submit}
                disabled={!bindingReasonValid(reason)}
                onClick={() => setConfirming(true)}
              >
                {words.platformEnvReview}
              </button>
            </div>
          </div>
        ) : (
          // The confirmation states the whole change in plain language. No
          // internal identifier has to be retyped to prove intent.
          <div className={styles.impact} role="group" aria-label={words.platformEnvConfirmTitle}>
            <strong>{words.platformEnvConfirmTitle}</strong>
            <ul className={styles.impactList}>
              <li>{words.platformEnvConfirmFrom} {words.platformEnvUnconfigured}</li>
              <li>{words.platformEnvConfirmTo} {environmentName(target)}</li>
              <li>{words.platformEnvConfirmProject} {projectRef}</li>
              <li>{words.platformEnvConfirmNoDeploy}</li>
              <li>{words.platformEnvConfirmOneWay}</li>
            </ul>
            {error ? <p className={table.error} role="alert">{error}</p> : null}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.submit}
                disabled={busy}
                onClick={() => { void bind(); }}
              >
                {busy ? words.loading : words.platformEnvConfirmAction}
              </button>
              <button
                type="button"
                className={styles.choice}
                disabled={busy}
                onClick={() => { setConfirming(false); setError(null); }}
              >
                {words.cancel}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* --- Release verification ------------------------------------------ */}
      <section className={styles.block} aria-labelledby="verification">
        <h2 id="verification" className={styles.title}>{words.platformVerifyHeading}</h2>
        <p className={styles.lead}>{words.platformVerifyExplain}</p>

        {!mayVerify ? (
          <p className={table.error}>{words.platformVerifyNoCapability}</p>
        ) : (
          <>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.submit}
                disabled={verifyBusy}
                onClick={() => { void verify(); }}
              >
                {verifyBusy ? words.loading : words.platformVerifyRun}
              </button>
            </div>

            {verifyError ? (
              <p className={table.error} role="alert">{verifyError}</p>
            ) : null}

            {verification && summary ? (
              <div className={table.panel}>
                <dl className={page.facts}>
                  <div>
                    <dt>{words.platformVerifyOutcome}</dt>
                    <dd>
                      <Badge tone={summary.blocking ? 'strong' : 'plain'}>
                        {summary.blocking
                          ? words.platformVerifyBlocked
                          : words.platformVerifyClear}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt>{words.consoleEnvironment}</dt>
                    <dd>{environmentName(verification.environment ?? '')}</dd>
                  </div>
                  <div>
                    <dt>{words.platformVerifyWhen}</dt>
                    <dd><Timestamp value={verification.generatedAt} locale={locale} /></dd>
                  </div>
                  <div>
                    <dt>{words.platformVerifyPassedCount}</dt>
                    <dd>{summary.passed.length}</dd>
                  </div>
                </dl>

                {summary.unexpectedFailures.length ? (
                  <div className={styles.impact} role="alert">
                    <strong>{words.platformVerifyUnexpected}</strong>
                    <ul className={styles.impactList}>
                      {summary.unexpectedFailures.map((entry) => (
                        <li key={entry.check}>
                          {entry.description} <Identifier value={entry.check} />
                        </li>
                      ))}
                    </ul>
                    <p className={styles.hint}>{words.platformVerifyUnexpectedAction}</p>
                  </div>
                ) : null}

                {/* Never hidden: a known failure that disappears from its own
                    verification is worth nothing. */}
                {summary.expectedFailures.length ? (
                  <div className={styles.impact}>
                    <strong>{words.platformVerifyExpected}</strong>
                    <ul className={styles.impactList}>
                      {summary.expectedFailures.map((entry) => (
                        <li key={entry.check}>
                          {entry.description} <Identifier value={entry.check} />
                        </li>
                      ))}
                    </ul>
                    <p className={styles.hint}>{words.platformVerifyExpectedNote}</p>
                  </div>
                ) : null}

                <button
                  type="button"
                  className={styles.choice}
                  aria-expanded={showRaw}
                  onClick={() => setShowRaw((open) => !open)}
                >
                  {words.platformVerifyTechnical}
                </button>
                {showRaw ? (
                  <pre className={page.raw}>
                    {JSON.stringify(verification, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : verifyBusy ? null : (
              <div className={table.panel}><Empty>{words.platformVerifyIdle}</Empty></div>
            )}
          </>
        )}
      </section>
    </ConsoleShell>
  );
}
