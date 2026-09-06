'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ConsoleShell } from '@/components/console-shell';
import { appCopy } from '@/lib/app-copy';
import {
  codeLooksComplete, enrolmentGate, failureMessage, manualKeyGroups, normalizeCode,
  reachedAal2, rotationComplete, rotationFactorName, STAFF_FACTOR_NAME,
  type AccountFacts, type EnrolmentFailure, type EnrolmentGate, type RotationStep,
} from '@/lib/staff-mfa';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import table from '@/components/console-table.module.css';
import styles from './page.module.css';

/**
 * Your own second factor.
 *
 * Warsha could challenge an authenticator and could not create one. The console
 * has done `challengeAndVerify` since WPS-018, but `mfa.enroll` was called
 * nowhere in the codebase, so a staff member who needed `aal2` — which is every
 * staff member once `mfa_required` is on — had no first-party way to get there.
 * The only remaining route was an administrator driving the API on somebody
 * else's behalf, which puts the seed in a second person's hands and is exactly
 * the thing a second factor is supposed to rule out.
 *
 * ## Where the secret lives
 *
 * In this browser tab, in component state, for the length of one enrolment.
 * Supabase Auth generates it inside the caller's own session; it is rendered as
 * a QR code and a manual key, and it is dropped the moment the factor verifies.
 * It is never sent to a Warsha server, never put in an RPC argument, never
 * written to a table, never logged, and never interpolated into an error.
 * Provider error text is not rendered at all here — see `failureMessage` — for
 * the same reason: a message can quote the request that produced it.
 *
 * ## Why there is no "enrol for" control
 *
 * `mfa.enroll` takes no account parameter. It enrols on the session that calls
 * it, and there is no argument shape that aims it elsewhere. This page holds no
 * user id, reads no account list, and offers no subject picker, so the
 * one-person property is structural rather than a check somebody could delete.
 *
 * ## The unverified factor
 *
 * Enrolling creates a factor in `unverified` state. Abandoning the flow without
 * removing it leaves clutter that a future `listFactors` has to reason about,
 * so cancelling — and unmounting mid-flow — unenrols it.
 */

type Stage = 'loading' | 'gate' | 'showing' | 'verifying' | 'done' | 'replaced';

export default function SecurityPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];

  const [stage, setStage] = useState<Stage>('loading');
  const [gate, setGate] = useState<EnrolmentGate>('no-account');
  const [account, setAccount] = useState<AccountFacts | null>(null);

  // The seed, for as long as one enrolment takes. Nothing reads these except
  // the markup below.
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [keyShown, setKeyShown] = useState(false);

  const [code, setCode] = useState('');
  const [failure, setFailure] = useState<EnrolmentFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const codeField = useRef<HTMLInputElement>(null);

  // Replacement state. `oldFactorId` is the factor being retired; it is removed
  // at exactly one point in this file, after the new factor has verified AND
  // raised the session to aal2.
  const [rotation, setRotation] = useState<RotationStep>('idle');
  const [oldFactorId, setOldFactorId] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState('');

  // Kept in a ref so the unmount cleanup can see the current value without
  // re-running and unenrolling a factor that is still being used.
  const pendingFactor = useRef<string | null>(null);
  useEffect(() => { pendingFactor.current = stage === 'showing' || stage === 'verifying' ? factorId : null; },
    [factorId, stage]);

  const readState = useCallback(async () => {
    const client = supabase();
    const [{ data: userData }, { data: factorData }] = await Promise.all([
      client.auth.getUser(),
      client.auth.mfa.listFactors(),
    ]);
    const user = userData.user;
    const facts: AccountFacts | null = user
      ? { email: user.email ?? null, emailConfirmedAt: user.email_confirmed_at ?? null }
      : null;
    const verifiedFactors = (factorData?.totp ?? []).filter((factor) => factor.status === 'verified');
    setAccount(facts);
    setGate(enrolmentGate(facts, verifiedFactors.length));
    setOldFactorId(verifiedFactors[0]?.id ?? null);
    setStage('gate');
  }, []);

  useEffect(() => { void readState().catch(() => setStage('gate')); }, [readState]);

  // Leaving mid-enrolment must not strand an unverified factor.
  useEffect(() => () => {
    const stranded = pendingFactor.current;
    if (stranded) void supabase().auth.mfa.unenroll({ factorId: stranded }).catch(() => undefined);
  }, []);

  const forget = useCallback(() => {
    setQrCode(null);
    setSecret(null);
    setKeyShown(false);
    setCode('');
  }, []);

  const begin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const { data, error } = await supabase().auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: STAFF_FACTOR_NAME,
      });
      if (error || !data) { setFailure('start'); setBusy(false); return; }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStage('showing');
    } catch {
      setFailure('unavailable');
    }
    setBusy(false);
  }, [busy]);

  useEffect(() => { if (stage === 'showing') codeField.current?.focus(); }, [stage]);

  /**
   * Step one of a replacement: prove possession of the factor being retired.
   *
   * `challengeAndVerify` against the CURRENT factor does two jobs at once. It
   * establishes that whoever is asking for a rotation is holding the
   * authenticator today — a password alone must not be enough to swap the
   * second factor — and it raises this session to `aal2`, which is the level
   * this account requires. Doing it here rather than reading the session's
   * existing level means the flow does not depend on how the operator signed in.
   */
  const confirmCurrent = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !oldFactorId || !codeLooksComplete(currentCode)) return;
    setBusy(true);
    setFailure(null);
    const client = supabase();
    try {
      const { error } = await client.auth.mfa.challengeAndVerify({
        factorId: oldFactorId,
        code: normalizeCode(currentCode),
      });
      if (error) { setFailure('current-rejected'); setBusy(false); return; }

      const { data: level } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!reachedAal2(level?.currentLevel)) {
        setFailure('not-aal2'); setBusy(false); return;
      }

      // Only now is a second factor enrolled. The old one is still verified and
      // still works, which is what keeps the account from ever having none.
      const { data, error: enrolError } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: rotationFactorName(new Date()),
      });
      if (enrolError || !data) { setFailure('start'); setBusy(false); return; }
      setCurrentCode('');
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setRotation('scan-new');
      setStage('showing');
    } catch {
      setFailure('unavailable');
    }
    setBusy(false);
  }, [busy, currentCode, oldFactorId]);

  const beginReplacement = useCallback(() => {
    setFailure(null);
    setCurrentCode('');
    setRotation('confirm-current');
  }, []);

  const abandonReplacement = useCallback(async () => {
    const stranded = factorId;
    forget();
    setFactorId(null);
    setCurrentCode('');
    setRotation('idle');
    setFailure(null);
    setStage('gate');
    // Removes the UNVERIFIED new factor. The old one is untouched: it is only
    // ever removed on the success path below.
    if (stranded) await supabase().auth.mfa.unenroll({ factorId: stranded }).catch(() => undefined);
  }, [factorId, forget]);

  const cancel = useCallback(async () => {
    const stranded = factorId;
    forget();
    setFactorId(null);
    setStage('gate');
    setFailure(null);
    if (stranded) await supabase().auth.mfa.unenroll({ factorId: stranded }).catch(() => undefined);
  }, [factorId, forget]);

  const confirm = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !factorId || !codeLooksComplete(code)) return;
    setBusy(true);
    setFailure(null);
    setStage('verifying');
    const client = supabase();
    try {
      const { data: challenge, error: challengeError } =
        await client.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge) {
        setFailure('unavailable'); setStage('showing'); setBusy(false); return;
      }
      const { error: verifyError } = await client.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: normalizeCode(code),
      });
      if (verifyError) {
        // A rotation that fails here changes NOTHING. The old factor was never
        // touched, and the caller can retry or abandon.
        setFailure(rotation === 'scan-new' ? 'old-kept' : 'code-rejected');
        setStage('showing'); setBusy(false); return;
      }

      // Verified. The seed has no further purpose, so it stops existing here
      // rather than at the end of the function.
      forget();

      // Proving the session actually reached the level every staff gate reads.
      // "The code was accepted" and "this session is aal2" are different claims.
      const { data: level } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!reachedAal2(level?.currentLevel)) {
        setFailure('not-aal2'); setStage('gate'); setBusy(false);
        await readState().catch(() => undefined);
        return;
      }

      // THE ONLY PLACE THE OLD FACTOR IS REMOVED, and it is reached only after
      // the new factor has been verified AND has carried this session to aal2.
      // Until this line runs the account holds two verified factors, which is
      // the state that makes a rotation safe rather than a gamble.
      if (rotation === 'scan-new' && oldFactorId && oldFactorId !== factorId) {
        const { error: removeError } = await client.auth.mfa.unenroll({ factorId: oldFactorId });
        if (removeError) {
          // The new factor works; the old one merely outlived its welcome.
          // Reporting rather than pretending, and the account is not at risk:
          // it holds two working factors, not none.
          setFailure('unavailable');
          setStage('gate'); setBusy(false);
          await readState().catch(() => undefined);
          return;
        }
        const { data: after } = await client.auth.mfa.listFactors();
        const remaining = (after?.totp ?? [])
          .filter((f) => f.status === 'verified')
          .map((f) => f.id);
        if (!rotationComplete(remaining, factorId, oldFactorId)) {
          setFailure('unavailable');
          setStage('gate'); setBusy(false);
          await readState().catch(() => undefined);
          return;
        }
        setOldFactorId(factorId);
        setFactorId(null);
        setRotation('idle');
        setStage('replaced');
        setGate('already-enrolled');
        setBusy(false);
        return;
      }

      setFactorId(null);
      setStage('done');
      setGate('already-enrolled');
    } catch {
      setFailure('unavailable');
      setStage('showing');
    }
    setBusy(false);
  }, [busy, code, factorId, forget, readState, rotation, oldFactorId]);

  const groups = secret ? manualKeyGroups(secret) : [];

  return (
    <ConsoleShell title={words.mfaTitle}>
      <p className={table.lead}>{words.mfaLead}</p>

      {failure ? (
        <p className={styles.failure} role="alert">{failureMessage(failure, words)}</p>
      ) : null}

      {stage === 'loading' ? <p className={styles.note}>{words.loading}</p> : null}

      {stage === 'gate' && gate === 'no-account' ? (
        <p className={styles.note}>{words.mfaUnavailable}</p>
      ) : null}

      {stage === 'gate' && gate === 'email-unconfirmed' ? (
        <section className={styles.panel}>
          <h2 className={styles.heading}>{words.mfaEmailNeededTitle}</h2>
          <p className={styles.note}>{words.mfaEmailNeededBody}</p>
        </section>
      ) : null}

      {stage === 'replaced' ? (
        <section className={styles.panel}>
          <h2 className={styles.heading}>{words.mfaReplaceDoneTitle}</h2>
          <p className={styles.note}>{words.mfaReplaceDoneBody}</p>
        </section>
      ) : null}

      {stage === 'done' || (stage === 'gate' && gate === 'already-enrolled' && rotation === 'idle') ? (
        <section className={styles.panel}>
          <h2 className={styles.heading}>
            {stage === 'done' ? words.mfaDoneTitle : words.mfaEnrolledTitle}
          </h2>
          <p className={styles.note}>
            {stage === 'done' ? words.mfaDoneBody : words.mfaEnrolledBody}
          </p>

          {/* Rotation lives here rather than behind an administrator, because
              the person who needs to replace a factor is the person holding it,
              and Warsha's only administrator is that same person. */}
          <h3 className={styles.subheading}>{words.mfaReplaceTitle}</h3>
          <p className={styles.note}>{words.mfaReplaceBody}</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={beginReplacement}
            disabled={busy || !oldFactorId}
          >
            {words.mfaReplaceAction}
          </button>
        </section>
      ) : null}

      {stage === 'gate' && rotation === 'confirm-current' ? (
        <section className={styles.panel}>
          <h2 className={styles.heading}>{words.mfaCurrentTitle}</h2>
          <p className={styles.note}>{words.mfaCurrentBody}</p>
          <form className={styles.form} onSubmit={(event) => void confirmCurrent(event)}>
            <label className={styles.label} htmlFor="mfa-current-code">
              {words.mfaCurrentCodeLabel}
            </label>
            <input
              id="mfa-current-code"
              className={styles.code}
              value={currentCode}
              onChange={(event) => setCurrentCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              dir="ltr"
              required
            />
            <div className={styles.buttons}>
              <button
                type="submit"
                className={styles.action}
                disabled={busy || !codeLooksComplete(currentCode)}
              >
                {busy ? words.loading : words.mfaCurrentAction}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => void abandonReplacement()}
                disabled={busy}
              >
                {words.mfaCancelAction}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {stage === 'gate' && gate === 'ready' ? (
        <section className={styles.panel}>
          <h2 className={styles.heading}>{words.mfaStartTitle}</h2>
          <p className={styles.note}>{words.mfaStartBody}</p>
          {account?.email ? (
            <p className={styles.account}>
              {words.mfaForAccount} <bdi dir="ltr">{account.email}</bdi>
            </p>
          ) : null}
          <button type="button" className={styles.action} onClick={() => void begin()} disabled={busy}>
            {busy ? words.loading : words.mfaStartAction}
          </button>
        </section>
      ) : null}

      {(stage === 'showing' || stage === 'verifying') && secret ? (
        <section className={styles.panel}>
          <h2 className={styles.heading}>
            {rotation === 'scan-new' ? words.mfaReplaceScanTitle : words.mfaScanTitle}
          </h2>
          <p className={styles.note}>
            {rotation === 'scan-new' ? words.mfaReplaceScanBody : words.mfaScanBody}
          </p>

          <div className={styles.enrolment}>
            {/*
              * The QR is a convenience and never the only route. Its alt text
              * describes what it is rather than encoding the key, because alt
              * text is read aloud in rooms with other people in them and is
              * copied into bug reports.
              */}
            {qrCode ? (
              <img className={styles.qr} src={qrCode} alt={words.mfaQrAlt} width={200} height={200} />
            ) : null}

            <div className={styles.manual}>
              <h3 className={styles.subheading}>{words.mfaManualTitle}</h3>
              <p className={styles.note}>{words.mfaManualBody}</p>
              {keyShown ? (
                <p className={styles.key} dir="ltr" aria-label={words.mfaManualTitle}>
                  {groups.map((group, index) => (
                    <code key={index} className={styles.keyGroup}>{group}</code>
                  ))}
                </p>
              ) : null}
              <button
                type="button"
                className={styles.secondary}
                aria-expanded={keyShown}
                onClick={() => setKeyShown((shown) => !shown)}
              >
                {keyShown ? words.mfaManualHide : words.mfaManualShow}
              </button>
            </div>
          </div>

          <form className={styles.form} onSubmit={(event) => void confirm(event)}>
            <label className={styles.label} htmlFor="mfa-code">{words.mfaCodeLabel}</label>
            <input
              id="mfa-code"
              ref={codeField}
              className={styles.code}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              dir="ltr"
              required
            />
            <div className={styles.buttons}>
              <button
                type="submit"
                className={styles.action}
                disabled={busy || !codeLooksComplete(code)}
              >
                {stage === 'verifying' ? words.loading : words.mfaConfirmAction}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => void (rotation === 'scan-new' ? abandonReplacement() : cancel())}
                disabled={busy}
              >
                {words.mfaCancelAction}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </ConsoleShell>
  );
}
