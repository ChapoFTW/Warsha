'use client';

import { useState } from 'react';

import { BrandLockup } from '@/components/brand-mark';
import { AppearanceSwitch, LanguageSwitch } from '@/components/preference-controls';
import { appCopy } from '@/lib/app-copy';
import { signIn, type SignInFailure } from '@/lib/auth-actions';
import { useAppLocale } from '@/lib/use-app-locale';
import { classifySignInIdentity } from '@/src/auth/auth-identifier';

import styles from './staff-sign-in.module.css';

/**
 * Signing in to the staff console.
 *
 * The same identity-driven authentication every other Warsha surface uses.
 * There is no admin credential store, no separate staff username, and no
 * console-only login path — a staff member is an ordinary Warsha account that
 * happens to hold a role grant. `classifySignInIdentity` routes an address to
 * password auth and a number to the worker broker exactly as it does on the
 * customer app, because a staff member may well be a worker too.
 *
 * Authorization is a separate question answered afterwards, by
 * `get_staff_session()` on the server. Authenticating here proves who somebody
 * is; it grants nothing. That separation is why this form can be shown to
 * anybody without it being a security surface.
 *
 * Anti-enumeration is preserved: every credential failure returns the same
 * message, so this page cannot be used to discover which addresses exist.
 */

const FAILURE_COPY: Record<SignInFailure, keyof typeof appCopy.en> = {
  invalid_identifier: 'errInvalidIdentifier',
  invalid_credentials: 'errInvalidCredentials',
  rate_limited: 'errRateLimited',
  outdated_client: 'errOutdatedClient',
  network: 'errNetwork',
  server: 'errServer',
};

export function StaffSignIn({ onSignedIn }: { onSignedIn?: () => void }) {
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
    // Authentication succeeded. Whether this account may use the console is
    // decided by the server on the next call, not here.
    setBusy(false);
    onSignedIn?.();
  };

  return (
    <div className={styles.page}>
      <div className={styles.controls}>
        <LanguageSwitch locale={locale} />
        <AppearanceSwitch locale={locale} />
      </div>

      <main id="main" className={styles.panel}>
        <BrandLockup locale={locale} size={30} />
        <h1 className={styles.title}>{words.consoleSignInTitle}</h1>
        <p className={styles.lead}>{words.consoleSignInLead}</p>

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

        {/* No "create an account" link. Console access is granted, never
            self-served, and offering registration here would imply otherwise. */}
        <p className={styles.foot}>{words.consoleSignInNote}</p>
      </main>
    </div>
  );
}
