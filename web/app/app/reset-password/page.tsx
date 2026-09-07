'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AuthScreen, AuthStateCard, SecretField, authPanelStyles as styles } from '@/components/auth-panel';
import { appCopy } from '@/lib/app-copy';
import { arrivedBy, callbackCredential } from '@/lib/auth-callback';
import { finishPasswordRecovery, updatePassword, type PasswordUpdateFailure } from '@/lib/auth-actions';
import { recoverySupabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import { authOutcomeCopy } from '@/src/auth/auth-outcome-copy';
import {
  classifyAuthCallbackFailure,
  recoveryFailurePresentation,
  type AuthCallbackFailure,
} from '@/src/auth/email-confirmation';
import { PasswordRequirements } from '@/components/password-requirements';
import { passwordMeetsPolicy } from '@/src/auth/password-policy';

import type { Route } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Setting a new password from a recovery link.
 *
 * Three facts shape this screen, and each one was learned the hard way.
 *
 * **A recovery link establishes a session.** By the time anything renders, the
 * visitor looks signed in. `StartupGate` therefore exempts this route entirely
 * — otherwise the account would be resolved and sent to its home page, and the
 * link would appear broken while working perfectly. That exact race is what
 * made valid reset links show the expired card on mobile.
 *
 * **The URL is gone by the time an effect runs.** `detectSessionInUrl`
 * consumes the token and calls `history.replaceState`, correctly, so the
 * question "what kind of link brought you here?" can only be answered from the
 * snapshot `lib/auth-callback` takes at module load.
 *
 * **A session is not a grant to change a password.** Somebody who types this
 * path while signed in has not proved they hold the mailbox, so arriving
 * without a recovery callback shows the invalid-link card rather than the form.
 * That is the mobile screen's rule (`recoveryStatus !== 'ready'`), applied to
 * what a browser can observe.
 *
 * Finishing signs out *globally*, on purpose: a password reset is what somebody
 * does when they think their account is compromised, so every session that
 * password could have opened is revoked.
 */

const FAILURE_COPY: Record<PasswordUpdateFailure, string> = {
  weak_password: 'passwordRequirements',
  same_password: 'errSamePassword',
  session_expired: 'errSessionExpired',
  rate_limited: 'errRateLimited',
  network: 'errNetwork',
  server: 'errServer',
};

type Status =
  | { status: 'checking' | 'ready' | 'done' }
  | { status: 'invalid'; failure: AuthCallbackFailure };

export default function ResetPasswordPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const authWords = authOutcomeCopy[locale];

  // Read once. The snapshot is module scope, so this is stable across renders
  // and unaffected by anything supabase-js does to the address bar.
  const arrived = useMemo(() => arrivedBy(), []);

  const [status, setStatus] = useState<Status>({ status: 'checking' });
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  // Held so the submit handler sets the password on the SAME contained
  // client the credential was exchanged onto, never on the shared one.
  const [recoveryClient, setRecoveryClient] = useState<SupabaseClient | null>(null);
  const [failure, setFailure] = useState<PasswordUpdateFailure | null>(null);

  useEffect(() => {
    let active = true;

    if (arrived.kind !== 'recovery' || arrived.failure) {
      setStatus({ status: 'invalid', failure: arrived.failure ?? 'invalid' });
      return () => { active = false; };
    }

    /*
     * The credential is exchanged HERE, onto a client that persists nothing.
     *
     * It used to be exchanged by `detectSessionInUrl` during initialisation of
     * the SHARED client, which wrote a full application session to this
     * origin's storage before any new password existed. That session was a
     * normal `authenticated` JWT: reproduced against a live stack, it read the
     * account's own profile, addresses, bookings and notifications through
     * PostgREST. Routing could not contain it, because the token itself was
     * valid everywhere.
     *
     * `recoverySupabase()` persists nothing and refreshes nothing, so this
     * grant exists in one closure for the length of one form submission.
     */
    const credential = callbackCredential();
    if (!credential) {
      setStatus({ status: 'invalid', failure: 'session_mismatch' });
      return () => { active = false; };
    }

    const client = recoverySupabase();
    setRecoveryClient(client);

    void (async () => {
      try {
        const { data, error } = await client.auth.setSession({
          access_token: credential.accessToken,
          refresh_token: credential.refreshToken,
        });
        if (!active) return;
        setStatus(data.session && !error
          ? { status: 'ready' }
          : { status: 'invalid', failure: 'session_mismatch' });
      } catch (error) {
        if (active) setStatus({
          status: 'invalid',
          failure: classifyAuthCallbackFailure(
            error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown },
          ),
        });
      }
    })();

    return () => { active = false; };
  }, [arrived]);

  const policyMet = passwordMeetsPolicy(password);
  const matched = password === confirmation && confirmation.length > 0;
  const mismatch = confirmation.length > 0 && !matched;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !policyMet || !matched) return;
    setBusy(true);
    setFailure(null);
    if (!recoveryClient) { setBusy(false); return; }
    const result = await updatePassword(password, recoveryClient);
    if (!result.ok) {
      setFailure(result.failure);
      setBusy(false);
      return;
    }
    setPassword('');
    setConfirmation('');
    await finishPasswordRecovery(recoveryClient);
    setStatus({ status: 'done' });
    setBusy(false);
  };

  if (status.status === 'checking') {
    return <AuthStateCard locale={locale} title={words.resetTitle} busy />;
  }

  if (status.status === 'invalid') {
    const presentation = recoveryFailurePresentation(status.failure);
    return (
      <AuthStateCard
        locale={locale}
        title={authWords[presentation.titleKey]}
        body={authWords[presentation.bodyKey]}
        actions={[
          { label: authWords.forgotPasswordAction, href: '/forgot-password' },
          { label: authWords.signInAction, href: '/sign-in' },
        ]}
      />
    );
  }

  if (status.status === 'done') {
    return (
      <AuthStateCard
        locale={locale}
        title={words.passwordUpdatedTitle}
        body={words.passwordUpdatedBody}
        action={words.returnToSignIn}
        href="/sign-in"
      />
    );
  }

  return (
    <AuthScreen locale={locale}>
      <h1 className={styles.title}>{words.resetTitle}</h1>
      <p className={styles.lead}>{words.resetLead}</p>

      <form className={styles.form} onSubmit={submit} noValidate>
        <SecretField
          label={words.newPassword}
          value={password}
          onChange={setPassword}
          visible={showPassword}
          onToggle={() => setShowPassword((current) => !current)}
          showLabel={words.showPassword}
          hideLabel={words.hidePassword}
          showShort={words.revealShow}
          hideShort={words.revealHide}
          disabled={busy}
        />

        {/* Every rule, always visible, each showing whether it is satisfied —
            rather than one sentence that only appears once the attempt has
            already failed. Shared with signup, so the two cannot describe
            different policies. */}
        <PasswordRequirements password={password} words={words as unknown as Record<string, string>} />

        <SecretField
          label={words.confirmPassword}
          value={confirmation}
          onChange={setConfirmation}
          visible={showConfirmation}
          onToggle={() => setShowConfirmation((current) => !current)}
          showLabel={words.showPassword}
          hideLabel={words.hidePassword}
          showShort={words.revealShow}
          hideShort={words.revealHide}
          disabled={busy}
        />

        {mismatch ? <p className={styles.error} role="alert">{words.passwordMismatch}</p> : null}
        {failure ? <p className={styles.error} role="alert">{words[FAILURE_COPY[failure]]}</p> : null}

        <button className={styles.submit} type="submit" disabled={busy || !policyMet || !matched}>
          {busy ? words.updatingPassword : words.updatePassword}
        </button>
      </form>

      <p className={styles.foot}>
        <Link className={styles.link} href={'/sign-in' as Route}>{words.backToSignIn}</Link>
      </p>
    </AuthScreen>
  );
}
