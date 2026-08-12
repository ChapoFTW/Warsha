'use client';

import { useEffect, useMemo, useState } from 'react';

import { AuthStateCard } from '@/components/auth-panel';
import { appCopy } from '@/lib/app-copy';
import { arrivedBy } from '@/lib/auth-callback';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

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

type Status = 'checking' | 'confirmed' | 'failed';

export default function ConfirmEmailPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const arrived = useMemo(() => arrivedBy(), []);
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let active = true;

    if (arrived.refused) {
      setStatus('failed');
      return () => { active = false; };
    }

    void (async () => {
      try {
        // Awaiting the session awaits initialisation, which is where the link's
        // credential was exchanged. A session here means Auth accepted it.
        const { data } = await supabase().auth.getSession();
        if (!active) return;
        setStatus(data.session ? 'confirmed' : 'failed');
      } catch {
        if (active) setStatus('failed');
      }
    })();

    return () => { active = false; };
  }, [arrived]);

  if (status === 'checking') {
    return (
      <AuthStateCard
        locale={locale}
        title={words.confirmCheckingTitle}
        body={words.confirmCheckingBody}
        busy
      />
    );
  }

  if (status === 'failed') {
    return (
      <AuthStateCard
        locale={locale}
        title={words.confirmFailedTitle}
        body={words.confirmFailedBody}
        action={words.returnToSignIn}
        href="/sign-in"
      />
    );
  }

  return (
    <AuthStateCard
      locale={locale}
      title={words.confirmedTitle}
      body={words.confirmedBody}
      action={words.continueAction}
      // Deliberately the root, not a guessed destination. The startup gate reads
      // the account's real state and routes from there, so this page never has
      // to decide which product somebody belongs in.
      href="/"
    />
  );
}
