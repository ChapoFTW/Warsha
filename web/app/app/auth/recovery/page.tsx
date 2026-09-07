'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { AuthScreen, AuthStateCard, SecretField, authPanelStyles as styles } from '@/components/auth-panel';
import { PasswordRequirements } from '@/components/password-requirements';
import { appCopy } from '@/lib/app-copy';
import { useAppLocale } from '@/lib/use-app-locale';
import { authOutcomeCopy } from '@/src/auth/auth-outcome-copy';
import { recoveryFailurePresentation } from '@/src/auth/email-confirmation';
import { passwordMeetsPolicy } from '@/src/auth/password-policy';

/**
 * Choosing a new password from a recovery link.
 *
 * ## The rule this page exists to keep
 *
 * LOADING THIS PAGE MUST CONSUME NOTHING. It reads a token hash out of the
 * address bar and renders a form. It does not call `verifyOtp`, it does not
 * exchange a code, it does not touch a Supabase client at all, and it holds no
 * effect that could. A scanner, a link expander, a preview generator and the
 * person themselves may all fetch this URL, in any order, any number of times,
 * and the recovery authority is exactly as usable afterwards as before.
 *
 * That is the whole fix. The previous email linked to `/auth/v1/verify`, which
 * spent the token on the FIRST GET — so an automated fetch by a mail provider
 * used up the link, and the person reached a password form built on a
 * credential that had already been consumed. They typed a password and were
 * told the link had expired, which was true and unhelpable by then.
 *
 * ## What a submit does
 *
 * One POST to `/api/auth/recover`, carrying the token hash and the chosen
 * password. The exchange happens there, on the server, on a client that
 * persists nothing. This page never receives an access token, a refresh token
 * or a session, so there is nothing here for browser storage to keep or for
 * another route to inherit.
 *
 * ## Why the token hash in the URL is acceptable
 *
 * It is inert. It is not a bearer token and it authorises no API on its own;
 * it can only be exchanged, once, by the route above. It is never logged,
 * never sent to analytics, and never written to storage by this page.
 */

type Status =
  | { status: 'ready' | 'saving' | 'done' }
  | { status: 'invalid' };

type Failure = 'weak_password' | 'expired_or_used' | 'same_password' | 'rate_limited' | 'server' | 'invalid';

const FAILURE_COPY: Record<Failure, string> = {
  weak_password: 'passwordRequirements',
  same_password: 'errSamePassword',
  expired_or_used: 'resetLinkInvalid',
  rate_limited: 'errRateLimited',
  server: 'errServer',
  invalid: 'resetLinkInvalid',
};

export default function RecoveryPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const authWords = authOutcomeCopy[locale];
  const search = useSearchParams();

  // Read, not exchanged. Nothing in this component sends it anywhere except the
  // submit handler below, and only when a person presses the button.
  const tokenHash = useMemo(() => search.get('token_hash') ?? '', [search]);
  const type = useMemo(() => search.get('type') ?? '', [search]);

  const [status, setStatus] = useState<Status>(
    tokenHash && type === 'recovery' ? { status: 'ready' } : { status: 'invalid' },
  );

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  /*
   * Take the hash out of the address bar once it has been read.
   *
   * It stays in this component's state for the submit. What it stops being is
   * part of the visible URL, which is the copy that ends up in a screenshot, a
   * shared link, a bookmark, a browser-sync history and an over-the-shoulder
   * glance. `replaceState` also means a later navigation cannot leave it in the
   * back stack.
   *
   * This runs after the read above, so the form is already holding what it
   * needs; a refresh afterwards correctly shows the invalid card, because a
   * refresh genuinely no longer has a credential.
   */
  useEffect(() => {
    if (typeof window === 'undefined' || !tokenHash) return;
    if (!window.location.search.includes('token_hash')) return;
    window.history.replaceState(null, '', window.location.pathname);
  }, [tokenHash]);

  const policyMet = passwordMeetsPolicy(password);
  const matched = password === confirmation && confirmation.length > 0;
  const mismatch = confirmation.length > 0 && !matched;
  const busy = status.status === 'saving';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !policyMet || !matched || !tokenHash) return;
    setStatus({ status: 'saving' });
    setFailure(null);
    try {
      const response = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tokenHash, password }),
      });
      const result = await response.json().catch(() => ({ ok: false, failure: 'server' }));
      if (result?.ok) {
        setPassword('');
        setConfirmation('');
        setStatus({ status: 'done' });
        return;
      }
      setFailure((result?.failure ?? 'server') as Failure);
      setStatus({ status: 'ready' });
    } catch {
      setFailure('server');
      setStatus({ status: 'ready' });
    }
  };

  if (status.status === 'invalid') {
    const presentation = recoveryFailurePresentation('invalid');
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
          onToggle={() => setShowPassword((shown) => !shown)}
          showLabel={words.showPassword}
          hideLabel={words.hidePassword}
          showShort={words.revealShow}
          hideShort={words.revealHide}
          disabled={busy}
        />
        <PasswordRequirements password={password} words={words as unknown as Record<string, string>} />
        <SecretField
          label={words.confirmPassword}
          value={confirmation}
          onChange={setConfirmation}
          visible={showConfirmation}
          onToggle={() => setShowConfirmation((shown) => !shown)}
          showLabel={words.showPassword}
          hideLabel={words.hidePassword}
          showShort={words.revealShow}
          hideShort={words.revealHide}
          disabled={busy}
        />
        {mismatch ? <p className={styles.error}>{words.passwordMismatch}</p> : null}
        {failure ? <p className={styles.error} role="alert">{words[FAILURE_COPY[failure]]}</p> : null}

        <button
          type="submit"
          className={styles.submit}
          disabled={busy || !policyMet || !matched}
        >
          {busy ? words.updatingPassword : words.updatePassword}
        </button>
      </form>
    </AuthScreen>
  );
}
