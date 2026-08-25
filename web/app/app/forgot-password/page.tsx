'use client';

import { useState } from 'react';

import { AuthScreen, authPanelStyles as styles } from '@/components/auth-panel';
import { appCopy } from '@/lib/app-copy';
import { requestPasswordReset, type ResetRequestFailure } from '@/lib/auth-actions';
import { useAppLocale } from '@/lib/use-app-locale';
import { authOutcomeCopy } from '@/src/auth/auth-outcome-copy';

import type { Route } from 'next';

/**
 * Asking for a password reset link.
 *
 * **This page must never reveal whether an address has an account.** A form
 * that answers that question is an account-enumeration oracle, and the fact
 * that it is a helpful answer is exactly why it is a dangerous one. So a
 * successful request and a request for an address nobody has ever used produce
 * the same screen, with wording that is true in both cases.
 *
 * Only failures that are properties of *this request* — the address is not
 * shaped like an address, we are being rate limited, the network is gone — are
 * reported differently, because none of them says anything about who is
 * registered.
 *
 * Workers are told plainly that this is not their route. A worker signs in with
 * a phone number against the broker; there is no address to send a link to, and
 * silently sending nothing would be the cruellest possible outcome.
 */

const FAILURE_COPY: Record<ResetRequestFailure, string> = {
  invalid_email: 'signUpInvalidEmail',
  rate_limited: 'errRateLimited',
  network: 'errNetwork',
  server: 'errServer',
};

export default function ForgotPasswordPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const authWords = authOutcomeCopy[locale];

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ResetRequestFailure | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const result = await requestPasswordReset(email);
    if (!result.ok) {
      setFailure(result.failure);
      setBusy(false);
      return;
    }
    setSent(true);
    setBusy(false);
  };

  if (sent) {
    return (
      <AuthScreen locale={locale} centred>
        <h1 className={styles.title}>{authWords.forgotSentTitle}</h1>
        <p className={styles.lead}>{authWords.forgotSentBody}</p>
        <p className={styles.note}>{words.forgotSentAgain}</p>
        <a className={styles.submit} href={'/sign-in' as Route}>{authWords.backToSignInAction}</a>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen locale={locale}>
      <h1 className={styles.title}>{authWords.forgotTitle}</h1>
      <p className={styles.lead}>{authWords.forgotBody}</p>

      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="recovery-email">{authWords.emailLabel}</label>
          <input
            id="recovery-email"
            className={styles.input}
            type="email"
            dir="ltr"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
        </div>

        {failure ? (
          <p className={styles.error} role="alert">{words[FAILURE_COPY[failure]]}</p>
        ) : null}

        <button className={styles.submit} type="submit" disabled={busy}>
          {busy ? authWords.loading : authWords.sendAction}
        </button>
      </form>

      <p className={styles.foot}>
        <a className={styles.link} href={'/sign-in' as Route}>{authWords.backToSignInAction}</a>
      </p>
      <p className={styles.note}>{words.forgotWorkerNote}</p>
    </AuthScreen>
  );
}
