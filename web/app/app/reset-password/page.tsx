'use client';

import { useEffect, useMemo, useState } from 'react';

import { AuthScreen, AuthStateCard, SecretField, authPanelStyles as styles } from '@/components/auth-panel';
import { appCopy } from '@/lib/app-copy';
import { arrivedBy } from '@/lib/auth-callback';
import { finishPasswordRecovery, updatePassword, type PasswordUpdateFailure } from '@/lib/auth-actions';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import { authOutcomeCopy } from '@/src/auth/auth-outcome-copy';
import {
  classifyAuthCallbackFailure,
  recoveryFailurePresentation,
  type AuthCallbackFailure,
} from '@/src/auth/email-confirmation';
import { passwordRequirements } from '@/src/auth/password-policy';

import type { Route } from 'next';

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
  const [failure, setFailure] = useState<PasswordUpdateFailure | null>(null);

  useEffect(() => {
    let active = true;

    if (arrived.kind !== 'recovery' || arrived.failure) {
      setStatus({ status: 'invalid', failure: arrived.failure ?? 'invalid' });
      return () => { active = false; };
    }

    const client = supabase();

    // `getSession()` awaits the client's initialisation, and initialisation is
    // where the URL callback is exchanged. Awaiting it is therefore a
    // deterministic answer to "did the link produce a session?" — no polling,
    // no racing the auth event.
    void (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!active) return;
        setStatus(data.session
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

    // Belt and braces. On the implicit path the recovery notification is
    // deferred a tick past the session being saved, so this can only ever
    // confirm what the await above already found — never contradict it.
    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (active && event === 'PASSWORD_RECOVERY' && session) setStatus({ status: 'ready' });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [arrived]);

  const requirements = passwordRequirements(password);
  const policyMet = requirements.every((requirement) => requirement.met);
  const matched = password === confirmation && confirmation.length > 0;
  const mismatch = confirmation.length > 0 && !matched;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !policyMet || !matched) return;
    setBusy(true);
    setFailure(null);
    const result = await updatePassword(password);
    if (!result.ok) {
      setFailure(result.failure);
      setBusy(false);
      return;
    }
    setPassword('');
    setConfirmation('');
    await finishPasswordRecovery();
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
            already failed. */}
        <ul className={styles.requirements} aria-label={words.passwordRequirements}>
          {requirements.map((requirement) => (
            <li
              key={requirement.key}
              className={requirement.met ? `${styles.requirement} ${styles.requirementMet}` : styles.requirement}
            >
              <span className={styles.tick} aria-hidden="true" />
              {words[requirement.key]}
            </li>
          ))}
        </ul>

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
        <a className={styles.link} href={'/sign-in' as Route}>{words.backToSignIn}</a>
      </p>
    </AuthScreen>
  );
}
