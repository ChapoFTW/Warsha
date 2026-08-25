'use client';

import { useEffect, useMemo, useState } from 'react';

import { AuthStateCard } from '@/components/auth-panel';
import { arrivedBy } from '@/lib/auth-callback';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import { authOutcomeCopy } from '@/src/auth/auth-outcome-copy';
import {
  classifyAuthCallbackFailure,
  confirmationFailurePresentation,
  safeAuthCallbackDiagnostic,
  type AuthCallbackFailure,
  type AuthRecoveryAction,
} from '@/src/auth/email-confirmation';

/**
 * Where a confirmation email lands.
 *
 * `signUpCustomer` has always sent people here — `emailRedirectTo` names this
 * path — and until now the path did not exist, so every customer who created an
 * account in a browser and did the one thing the email asked reached a 404 on
 * their own account origin. The route is named by the code that sends the
 * email; it cannot be optional.
 *
 * The confirmation itself is Auth's work, done during client initialisation.
 * This page reports the outcome and gives one way forward. It does not redirect
 * on its own: somebody who has just confirmed an address deserves to be told
 * that it worked, not to be dropped onto a dashboard and left to infer it.
 *
 * `StartupGate` exempts this route, so the session the link established does
 * not cause the visitor to be routed away before they can read the result.
 */

type Status =
  | { status: 'checking' | 'confirmed' }
  | { status: 'failed'; failure: AuthCallbackFailure };

const hrefForAction: Record<AuthRecoveryAction, string> = {
  sign_in: '/sign-in',
  forgot_password: '/forgot-password',
  resend_confirmation: '/resend-confirmation',
  create_account: '/create-account',
  retry: '/resend-confirmation',
};

const keyForAction: Record<AuthRecoveryAction, 'signInAction' | 'forgotPasswordAction' | 'resendConfirmationAction' | 'createAccountAction' | 'retryAction'> = {
  sign_in: 'signInAction',
  forgot_password: 'forgotPasswordAction',
  resend_confirmation: 'resendConfirmationAction',
  create_account: 'createAccountAction',
  retry: 'retryAction',
};

export default function ConfirmEmailPage() {
  const locale = useAppLocale();
  const authWords = authOutcomeCopy[locale];
  const arrived = useMemo(() => arrivedBy(), []);
  const [status, setStatus] = useState<Status>({ status: 'checking' });

  useEffect(() => {
    let active = true;

    if (arrived.failure) {
      setStatus({ status: 'failed', failure: arrived.failure });
      console.warn('[Warsha auth callback]', arrived.diagnostic);
      return () => { active = false; };
    }

    void (async () => {
      try {
        // Awaiting the session awaits initialisation, which is where the link's
        // credential was exchanged. A session here means Auth accepted it.
        const { data } = await supabase().auth.getSession();
        if (!active) return;
        setStatus(data.session
          ? { status: 'confirmed' }
          : { status: 'failed', failure: 'session_mismatch' });
      } catch (error) {
        if (active) {
          const failure = classifyAuthCallbackFailure(
            error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown },
          );
          const outcome = { status: 'failed' as const, failure };
          console.warn('[Warsha auth callback]', safeAuthCallbackDiagnostic('signup', outcome, error as { code?: unknown; status?: unknown }));
          setStatus(outcome);
        }
      }
    })();

    return () => { active = false; };
  }, [arrived]);

  if (status.status === 'checking') {
    return (
      <AuthStateCard
        locale={locale}
        title={authWords.confirmationProcessingTitle}
        body={authWords.confirmationProcessingBody}
        busy
      />
    );
  }

  if (status.status === 'failed') {
    const presentation = confirmationFailurePresentation(status.failure);
    return (
      <AuthStateCard
        locale={locale}
        title={authWords[presentation.titleKey]}
        body={authWords[presentation.bodyKey]}
        actions={presentation.actions.map((action) => ({
          label: authWords[keyForAction[action]],
          href: hrefForAction[action],
        }))}
      />
    );
  }

  return (
    <AuthStateCard
      locale={locale}
      title={authWords.confirmationCompleteTitle}
      body={authWords.confirmationCompleteBody}
      action={authWords.continueAction}
      // Deliberately the root, not a guessed destination. The startup gate reads
      // the account's real state and routes from there, so this page never has
      // to decide which product somebody belongs in.
      href="/"
    />
  );
}
