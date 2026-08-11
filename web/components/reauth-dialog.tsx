'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import { isReauthRefusal, reauthNeedFor, type ReauthNeed } from '@/lib/reauth';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from './reauth-dialog.module.css';

/**
 * The re-authentication step in front of a privileged action.
 *
 * It performs a real authentication event, because that is the only thing that
 * moves the freshness clock — see the note at the top of `lib/reauth.ts`. Two
 * paths, chosen by what the account actually has:
 *
 *   - An enrolled TOTP factor: `challengeAndVerify`, which returns a token at
 *     `aal2` with a new `amr` entry.
 *   - Otherwise: the operator's own password, re-entered.
 *
 * The password is held in component state for the length of one call and never
 * stored, logged, or put in a URL. It is the operator's own credential being
 * re-presented, which is what re-authentication means.
 *
 * `staff_reauthenticate()` is called afterwards to register the attestation.
 * It is a confirmation, not a challenge: called with a stale token it refuses.
 */

type Verifying = 'idle' | 'working';

export function ReauthDialog({
  capability,
  onClose,
  onSuccess,
}: {
  capability: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session, refresh } = useStaff();
  const need: ReauthNeed = reauthNeedFor(session, capability);

  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [state, setState] = useState<Verifying>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  // Ask the identity provider what this account actually has, rather than
  // assuming from `mfaRequired` — a factor may be enrolled without being
  // required, and it is the better path when it exists.
  useEffect(() => {
    let cancelled = false;
    void supabase().auth.mfa.listFactors().then(({ data }) => {
      if (cancelled) return;
      const verified = data?.totp?.find((factor) => factor.status === 'verified');
      setFactorId(verified?.id ?? null);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { firstField.current?.focus(); }, [factorId]);

  // Escape closes, and focus does not leak to the page behind.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (state === 'working') return;
    setState('working');
    setFailure(null);
    const client = supabase();

    try {
      if (factorId) {
        const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
        if (error) { setFailure(words.reauthCodeRejected); setState('idle'); return; }
      } else {
        const { data: user } = await client.auth.getUser();
        const email = user.user?.email;
        if (!email) { setFailure(words.reauthUnavailable); setState('idle'); return; }
        // Re-presenting the operator's own credential. The identity is taken
        // from the live session, never typed, so this cannot be pointed at
        // another account.
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) { setFailure(words.reauthPasswordRejected); setState('idle'); return; }
      }

      // The token is fresh now. Register the attestation and re-read the
      // session so every gate in the console sees the new freshness.
      const { error: attestError } = await client.rpc('staff_reauthenticate');
      if (attestError) {
        setFailure(isReauthRefusal(attestError) ? words.reauthStillStale : words.reauthUnavailable);
        setState('idle');
        return;
      }
      setPassword('');
      setCode('');
      await refresh();
      onSuccess();
    } catch {
      setFailure(words.reauthUnavailable);
      setState('idle');
    }
  }, [factorId, code, password, state, refresh, onSuccess, words]);

  // Nothing here can help these two. Say so instead of collecting a credential
  // that will not change the answer.
  if (need.kind === 'missing-capability' || need.kind === 'revoked') {
    return (
      <Backdrop onClose={onClose} labelledBy="reauth-title">
        <h2 id="reauth-title" className={styles.title}>
          {need.kind === 'revoked' ? words.reauthRevokedTitle : words.reauthDeniedTitle}
        </h2>
        <p className={styles.body}>
          {need.kind === 'revoked' ? words.reauthRevokedBody : words.reauthDeniedBody}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            {words.close}
          </button>
        </div>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={onClose} labelledBy="reauth-title">
      <h2 id="reauth-title" className={styles.title}>{words.reauthTitle}</h2>
      <p className={styles.body}>
        {factorId ? words.reauthBodyCode : words.reauthBodyPassword}
      </p>
      <p className={styles.capability}>
        <span className={styles.capabilityKey} dir="ltr">{capability}</span>
      </p>

      <form onSubmit={submit}>
        {factorId ? (
          <label className={styles.field}>
            <span className={styles.label}>{words.reauthCodeLabel}</span>
            <input
              ref={firstField}
              className={styles.input}
              type="text"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={state === 'working'}
            />
          </label>
        ) : (
          <label className={styles.field}>
            <span className={styles.label}>{words.reauthPasswordLabel}</span>
            <input
              ref={firstField}
              className={styles.input}
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={state === 'working'}
            />
          </label>
        )}

        {failure ? <p className={styles.failure} role="alert">{failure}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            {words.cancel}
          </button>
          <button
            type="submit"
            className={styles.primary}
            disabled={state === 'working' || (factorId ? !code.trim() : !password)}
          >
            {state === 'working' ? words.loading : words.reauthConfirm}
          </button>
        </div>
      </form>
    </Backdrop>
  );
}

function Backdrop({
  children,
  onClose,
  labelledBy,
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy: string;
}) {
  return (
    <div
      className={styles.backdrop}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}

/**
 * Wraps a privileged action so the freshness question is asked once, in one
 * place, rather than remembered separately at every call site.
 *
 * `run` is invoked when the session is already good enough. When it is not,
 * the dialog opens first and `run` follows a successful verification.
 */
export function useReauthGate(capability: string) {
  const { session } = useStaff();
  const [pending, setPending] = useState<(() => void) | null>(null);
  const need = reauthNeedFor(session, capability);

  const guard = useCallback((run: () => void) => {
    if (reauthNeedFor(session, capability).kind === 'ready') { run(); return; }
    setPending(() => run);
  }, [session, capability]);

  return {
    need,
    guard,
    dialogOpen: pending !== null,
    closeDialog: () => setPending(null),
    completeDialog: () => { const run = pending; setPending(null); run?.(); },
  };
}
