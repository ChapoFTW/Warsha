'use client';

import { useState } from 'react';

import { BrandLockup } from '@/components/brand-mark';
import { PreferenceFooter } from '@/components/preference-controls';
import { appCopy } from '@/lib/app-copy';
import { signIn, type SignInFailure } from '@/lib/auth-actions';
import { useAppLocale } from '@/lib/use-app-locale';
import { classifySignInIdentity } from '@/src/auth/auth-identifier';

import styles from './page.module.css';

/**
 * Sign in.
 *
 * One identifier field. Whether an account can hire, work or both is a
 * property of the account, and the only honest place to read it is after
 * authentication, from the server. The shape of what is typed selects the
 * credential path — an address to password auth, a number to the trusted
 * worker broker — and that is an implementation detail nobody is asked to
 * understand.
 *
 * The field is `type="text"`, not `type="email"`: a browser that validates an
 * email address would reject a phone number, which is exactly the person this
 * form must not turn away.
 */

const FAILURE_COPY: Record<SignInFailure, keyof typeof appCopy.en> = {
  invalid_identifier: 'errInvalidIdentifier',
  invalid_credentials: 'errInvalidCredentials',
  rate_limited: 'errRateLimited',
  outdated_client: 'errOutdatedClient',
  network: 'errNetwork',
  server: 'errServer',
};

export default function SignInPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SignInFailure | null>(null);

  const usable = Boolean(classifySignInIdentity(identifier)) && password.length >= 6;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const result = await signIn(identifier, password);
    if (!result.ok) {
      setFailure(result.failure);
      setBusy(false);
      return;
    }
    // The gate takes over: it resolves the account and routes to the product
    // this person is entitled to. Nothing here decides that.
  };

  return (
    <div className={styles.page}>

      <main id="main" className={styles.panel}>
        <BrandLockup locale={locale} size={30} />
        <h1 className={styles.title}>{words.signInTitle}</h1>
        <p className={styles.lead}>{words.signInLead}</p>

        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>{words.identityLabel}</span>
            <input
              className={styles.input}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              dir="ltr"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              disabled={busy}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{words.passwordLabel}</span>
            <input
              className={styles.input}
              type="password"
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
          </label>

          {failure ? (
            <p className={styles.error} role="alert">{words[FAILURE_COPY[failure]]}</p>
          ) : null}

          <button className={styles.submit} type="submit" disabled={!usable || busy}>
            {busy ? words.signingIn : words.signInAction}
          </button>
        </form>

        {/* Both destinations are on this origin. The link out to the marketing
            site's explainer was correct only while the real signup did not
            exist; sending somebody to another origin to read about creating an
            account, when they can create one here, is a detour. */}
        <p className={styles.foot}>
          <a className={styles.link} href="/forgot-password">{words.forgotPassword}</a>
        </p>

        <p className={styles.foot}>
          {words.noAccount}{' '}
          <a className={styles.link} href="/create-account">
            {words.createOne}
          </a>
        </p>
      </main>
      {/* Below the panel, never above it. The first thing on the screen should
          be what somebody came here to do; how it is displayed comes after. */}
      <div className={styles.controls}>
        <PreferenceFooter locale={locale} />
      </div>
    </div>
  );
}
