'use client';

import { useState } from 'react';

import { AuthScreen, authPanelStyles as styles } from '@/components/auth-panel';
import { requestEmailConfirmation, type ResetRequestFailure } from '@/lib/auth-actions';
import { useAppLocale } from '@/lib/use-app-locale';
import { authOutcomeCopy } from '@/src/auth/auth-outcome-copy';

const FAILURE_COPY: Record<ResetRequestFailure, 'invalid_email' | 'rate_limited' | 'network' | 'server'> = {
  invalid_email: 'invalid_email',
  rate_limited: 'rate_limited',
  network: 'network',
  server: 'server',
};

export default function ResendConfirmationPage() {
  const locale = useAppLocale();
  const words = authOutcomeCopy[locale];
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ResetRequestFailure | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const result = await requestEmailConfirmation(email);
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
        <h1 className={styles.title}>{words.resendSentTitle}</h1>
        <p className={styles.lead}>{words.resendSentBody}</p>
        <a className={styles.submit} href="/sign-in">{words.backToSignInAction}</a>
      </AuthScreen>
    );
  }

  const failureText = failure === 'invalid_email'
    ? words.invalidEmailError
    : failure === 'rate_limited'
      ? words.rateLimitedError
      : words.sendFailedError;

  return (
    <AuthScreen locale={locale}>
      <h1 className={styles.title}>{words.resendTitle}</h1>
      <p className={styles.lead}>{words.resendBody}</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        <label className={styles.field}>
          <span className={styles.label}>{words.emailLabel}</span>
          <input
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
        </label>
        {failure ? <p className={styles.error} role="alert" data-failure={FAILURE_COPY[failure]}>{failureText}</p> : null}
        <button className={styles.submit} type="submit" disabled={busy}>
          {busy ? words.loading : words.sendAction}
        </button>
      </form>
      <p className={styles.foot}><a className={styles.link} href="/sign-in">{words.backToSignInAction}</a></p>
    </AuthScreen>
  );
}
