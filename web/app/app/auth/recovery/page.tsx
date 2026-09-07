'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { AuthScreen, AuthStateCard, SecretField, authPanelStyles as styles } from '@/components/auth-panel';
import { PasswordRequirements } from '@/components/password-requirements';
import { appCopy, type AppCopyKey, type AppWords } from '@/lib/app-copy';
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

type Failure = 'weak_password' | 'expired_or_used' | 'same_password' | 'rate_limited'
  | 'mfa_required' | 'mfa_invalid' | 'mfa_expired' | 'provider_unavailable'
  | 'server' | 'invalid';

/**
 * Every failure the API can return, mapped to words a person can read.
 *
 * Typed as `AppCopyKey` rather than `string`, which is the whole point of this
 * declaration. The previous version mapped `expired_or_used` to
 * `'resetLinkInvalid'` — a key that existed on mobile and had never existed in
 * the web copy at all. `words` was cast to `Record<string, string>`, so nothing
 * objected: the lookup returned `undefined`, React rendered nothing, and a live
 * recovery failure showed an error box containing no error. Now a key that does
 * not exist is a compile error, and `Record<Failure, ...>` means a failure class
 * added to the route without copy is one too.
 */
const FAILURE_COPY: Record<Failure, AppCopyKey> = {
  weak_password: 'passwordRequirements',
  same_password: 'errSamePassword',
  expired_or_used: 'resetLinkInvalid',
  rate_limited: 'errRateLimited',
  mfa_required: 'errRecoveryCodeRequired',
  mfa_invalid: 'errRecoveryCodeInvalid',
  mfa_expired: 'errRecoveryExpired',
  provider_unavailable: 'errProviderUnavailable',
  server: 'errServer',
  invalid: 'resetLinkInvalid',
};

/** The failure classes a person can still recover from without a new email. */
const RETRYABLE: ReadonlySet<Failure> = new Set(['mfa_required', 'mfa_invalid', 'rate_limited']);

/**
 * The message, and never nothing.
 *
 * A failure class the build has never heard of still has to say something, so
 * an unknown class and an empty string both fall back to the generic sentence.
 * An empty error box is worse than a vague one: it tells somebody their attempt
 * failed and gives them no idea what to do next.
 */
function failureMessage(words: AppWords, failure: Failure): string {
  const key = FAILURE_COPY[failure];
  const message = key ? words[key] : '';
  return message && message.trim().length > 0 ? message : words.errServer;
}

export default function RecoveryPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as AppWords;
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
   * The authenticator code, asked for only by people who have one.
   *
   * A recovery session starts at aal1, and an account with a verified factor
   * cannot change its password on one — the provider refuses with
   * `insufficient_aal`, which is right: otherwise reading the mailbox would be
   * enough to defeat the authenticator.
   *
   * The code has to travel WITH the password, because the submit spends the
   * link. Discovering the requirement afterwards would mean burning somebody's
   * link to tell them something they could have been asked for. So the field is
   * here from the start, behind a disclosure so that the great majority who
   * have no authenticator never see it, and it opens itself if the server says
   * a code was needed.
   */
  const [code, setCode] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);

  /*
   * Whether the server is holding an open recovery transaction for us.
   *
   * Once it is, the emailed hash has been spent and must not be sent again —
   * the transaction stands in for it, and a retry carries only the password and
   * a fresh code. This is what makes a mistyped six-digit code cost one retry
   * instead of the whole recovery email, which is exactly how the previous
   * version failed in Production.
   */
  const [transactionOpen, setTransactionOpen] = useState(false);

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
    if (busy || !policyMet || !matched || (!tokenHash && !transactionOpen)) return;
    setStatus({ status: 'saving' });
    setFailure(null);
    try {
      const response = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The sealed transaction cookie rides along; it is HttpOnly, so this
        // page cannot read it and does not try to.
        credentials: 'same-origin',
        body: JSON.stringify({
          // Sent ONCE. After the transaction opens, the hash is spent and the
          // cookie is what identifies the recovery in progress.
          tokenHash: transactionOpen ? undefined : tokenHash,
          password,
          code: code || undefined,
        }),
      });
      const result = await response.json().catch(() => ({ ok: false, failure: 'server' }));
      if (result?.ok) {
        setPassword('');
        setConfirmation('');
        setCode('');
        setStatus({ status: 'done' });
        return;
      }
      const reported = (result?.failure ?? 'server') as Failure;
      // If the account turned out to need a code, show the field rather than
      // leaving somebody to find the disclosure themselves — and remember that
      // the server is now holding the transaction, so the next attempt is a
      // retry rather than a second spend of a hash that is already gone.
      if (reported === 'mfa_required' || reported === 'mfa_invalid') {
        setCodeOpen(true);
        setTransactionOpen(true);
        setCode('');
      }
      // These end the transaction. A further attempt would fail for a reason
      // the person cannot act on, so the form stops offering one.
      if (reported === 'mfa_expired' || reported === 'expired_or_used'
        || reported === 'invalid') setTransactionOpen(false);
      setFailure(reported);
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
        {codeOpen ? (
          <label className={styles.field}>
            <span className={styles.label}>{words.recoveryCodeLabel}</span>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))}
              disabled={busy}
              aria-describedby="recovery-code-hint"
            />
            <span id="recovery-code-hint" className={styles.foot}>{words.recoveryCodeHint}</span>
          </label>
        ) : (
          <button
            type="button"
            className={styles.link}
            onClick={() => setCodeOpen(true)}
            aria-expanded={false}
          >
            {words.recoveryCodeDisclosure}
          </button>
        )}

        {mismatch ? <p className={styles.error}>{words.passwordMismatch}</p> : null}
        {failure ? (
          <p className={styles.error} role="alert">
            {failureMessage(words, failure)}
            {RETRYABLE.has(failure) ? ` ${words.recoveryRetryHint}` : ''}
          </p>
        ) : null}

        <button
          type="submit"
          className={styles.submit}
          disabled={busy || !policyMet || !matched
            || (transactionOpen && code.length !== 6)}
        >
          {busy ? words.updatingPassword : words.updatePassword}
        </button>
      </form>
    </AuthScreen>
  );
}
