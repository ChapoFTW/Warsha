'use client';

import { useState } from 'react';

import { BrandLockup } from '@/components/brand-mark';
import { PasswordRequirements } from '@/components/password-requirements';
import { PreferenceFooter } from '@/components/preference-controls';
import { isValidCustomerEmail } from '@/src/auth/auth-identifier';
import { passwordMeetsPolicy } from '@/src/auth/password-policy';
import { appCopy } from '@/lib/app-copy';
import { signUpCustomer } from '@/lib/auth-actions';
import { signupLegalDocuments, signupLegalManifest, type SignUpFailure } from '@/lib/signup';
import { useAppLocale } from '@/lib/use-app-locale';
import { bodyLanguageFor, catalogueFor } from '@/lib/warsha';
import { authOutcomeCopy } from '@/src/auth/auth-outcome-copy';

import styles from './create-account.module.css';

/**
 * Creating a customer account, on the app origin.
 *
 * The public site explains Warsha and links here; it does not implement any of
 * this. One signup, one origin, one set of rules.
 *
 * Everything the server will check is checked here first so somebody is told
 * before a network call rather than after one — but nothing here is the
 * authority. The database re-verifies the legal manifest against its published
 * register, GoTrue enforces its own password policy, and the phone uniqueness
 * index is what actually decides whether a number is free.
 *
 * **Worker signup is deliberately absent.** A worker registers through the
 * broker, which mints a session against a synthetic identity — a server-side
 * trust boundary that must not move into a browser bundle. Workers are pointed
 * at the app, which is where that flow already lives and works.
 *
 * Anti-enumeration: every server refusal that could reveal whether an address
 * already has an account collapses into one message that says to try signing
 * in. That is true and useful whether or not the address is registered.
 */

const FAILURE_COPY: Record<SignUpFailure, string> = {
  invalid_name: 'signUpInvalidName',
  invalid_email: 'signUpInvalidEmail',
  invalid_phone: 'signUpInvalidPhone',
  weak_password: 'signUpWeakPassword',
  legal_not_accepted: 'signUpLegalRequired',
  legal_out_of_date: 'signUpLegalOutOfDate',
  already_registered_or_refused: 'signUpTrySigningIn',
  rate_limited: 'errRateLimited',
  // Distinct sentences, because they are distinct situations and the customer
  // can act differently on each. All three say plainly that no account was
  // created, which is true: Auth rolls the signup back when its own follow-up
  // work fails.
  email_delivery: 'signUpEmailUndeliverable',
  email_not_authorized: 'signUpEmailNotAuthorized',
  account_setup: 'signUpAccountSetupFailed',
  phone_unavailable: 'signUpPhoneUnavailable',
  network: 'errNetwork',
  server: 'errServer',
};

export default function CreateAccountPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const authWords = authOutcomeCopy[locale];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  /*
   * Validation appears after a field has been left, not while it is first being
   * typed into. Saying "that is not a valid email address" at the first
   * keystroke tells somebody they are wrong before they have had a chance to be
   * right; saying it on blur arrives when they have finished and are still
   * looking at the field, and from then on it updates live so a correction is
   * acknowledged immediately rather than reading as a second rejection.
   */
  const [emailTouched, setEmailTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SignUpFailure | null>(null);
  const [done, setDone] = useState<'confirm' | 'ready' | null>(null);

  const documents = signupLegalDocuments('customer');
  // The language of the text being accepted — never `fr`, because no French
  // operative text exists to accept. See `bodyLanguageFor`.
  const { language: acceptedLanguage } = bodyLanguageFor(locale);

  // Both checks run again on submit as well as on blur, because a form can be
  // submitted by a keyboard without either field ever being blurred.
  const emailValid = isValidCustomerEmail(email);
  const passwordValid = passwordMeetsPolicy(password);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    // Client-side rejection before the network, so a malformed address is
    // answered instantly rather than after a round trip that returns the same
    // answer more slowly. `signUpCustomer` and GoTrue both still enforce their
    // own rules -- this is the courtesy, not the boundary.
    if (!emailValid) { setEmailTouched(true); setFailure('invalid_email'); return; }
    if (!passwordValid) { setFailure('weak_password'); return; }
    if (!accepted) { setFailure('legal_not_accepted'); return; }
    setBusy(true);
    setFailure(null);
    // Built from the shared manifest, never assembled by hand: each acceptance
    // carries the document key, version, language and rendered hash the
    // database will compare against.
    const result = await signUpCustomer({
      name, email, phone, password,
      language: locale,
      acceptances: signupLegalManifest('customer', acceptedLanguage),
    });
    if (!result.ok) {
      setFailure(result.failure);
      setBusy(false);
      return;
    }
    setDone(result.needsEmailConfirmation ? 'confirm' : 'ready');
    setBusy(false);
  };

  if (done) {
    return (
      <div className={styles.page}>
        <main id="main" className={styles.panel}>
          <BrandLockup locale={locale} size={30} />
          <h1 className={styles.title}>
            {done === 'confirm' ? authWords.confirmationPendingTitle : words.signUpReadyTitle}
          </h1>
          <p className={styles.lead}>
            {done === 'confirm' ? authWords.confirmationPendingBody : words.signUpReadyBody}
          </p>
          {done === 'confirm' ? (
            <>
              <a className={styles.submit} href="/sign-in">{authWords.signInAction}</a>
              <a className={styles.link} href="/forgot-password">{authWords.forgotPasswordAction}</a>
              <a className={styles.link} href="/resend-confirmation">{authWords.resendConfirmationAction}</a>
            </>
          ) : (
            <a className={styles.submit} href="/">{words.signUpContinue}</a>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>

      <main id="main" className={styles.panel}>
        <BrandLockup locale={locale} size={30} />
        <h1 className={styles.title}>{words.signUpTitle}</h1>
        <p className={styles.lead}>{words.signUpLead}</p>

        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>{words.signUpName}</span>
            <input
              className={styles.input}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{words.signUpEmail}</span>
            <input
              className={styles.input}
              type="email"
              dir="ltr"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setEmailTouched(true)}
              aria-invalid={emailTouched && email.trim().length > 0 && !emailValid}
              aria-describedby={emailTouched && email.trim().length > 0 && !emailValid ? 'signup-email-error' : undefined}
              disabled={busy}
            />
            {emailTouched && email.trim().length > 0 && !emailValid ? (
              <span id="signup-email-error" className={styles.error} role="alert">{words.emailInvalid}</span>
            ) : null}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{words.signUpPhone}</span>
            <input
              className={styles.input}
              type="tel"
              dir="ltr"
              autoComplete="tel"
              inputMode="tel"
              placeholder="01xxxxxxxxx"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={busy}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{words.passwordLabel}</span>
            <input
              className={styles.input}
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
            {/* The rules, live, and the same component the reset page uses. A
                signup form that states the policy only by refusing the result
                is a form somebody fails three times in a row. */}
            <PasswordRequirements password={password} words={words} />
          </label>

          {/* The documents are listed by name and version and linked to the
              public legal centre, so accepting is a decision rather than a
              formality. The versions shown are the ones recorded. */}
          <label className={styles.consent}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              disabled={busy}
            />
            <span>
              {words.signUpAcceptPrefix}{' '}
              {documents.map((document, index) => (
                <span key={document.key}>
                  {index > 0 ? words.signUpAcceptJoin : ''}
                  <a
                    className={styles.link}
                    href={`https://usewarsha.com/${locale}/legal/${document.key.replace(/_/g, '-')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {catalogueFor(document, locale).title}
                  </a>
                  <span className={styles.version}> ({document.version})</span>
                </span>
              ))}
            </span>
          </label>

          {failure ? (
            <p className={styles.error} role="alert">{words[FAILURE_COPY[failure]]}</p>
          ) : null}

          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? words.loading : words.signUpAction}
          </button>
        </form>

        <p className={styles.foot}>
          {words.signUpHaveAccount}{' '}
          <a className={styles.link} href="/sign-in">{words.signInAction}</a>
        </p>
        <p className={styles.workerNote}>{words.signUpWorkerNote}</p>
      </main>
      {/* Below the panel, never above it. The first thing on the screen should
          be what somebody came here to do; how it is displayed comes after. */}
      <div className={styles.controls}>
        <PreferenceFooter locale={locale} />
      </div>
    </div>
  );
}
