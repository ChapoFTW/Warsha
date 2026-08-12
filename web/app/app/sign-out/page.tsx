'use client';

import { useEffect, useState } from 'react';

import { AuthStateCard } from '@/components/auth-panel';
import { appCopy } from '@/lib/app-copy';
import { signOut } from '@/lib/auth-actions';
import { useAppLocale } from '@/lib/use-app-locale';

/**
 * Signing out at a URL.
 *
 * The shells already carry a sign-out control, and that is the ordinary way
 * out. This exists for the case a control cannot serve: a link somebody can be
 * *sent*, and an address somebody can type when they are on a shared machine
 * and want the session gone without hunting for a menu.
 *
 * It confirms rather than redirecting silently, because "am I actually signed
 * out?" is the entire question being asked, and a page that flashes and lands
 * on sign-in leaves it ambiguous.
 *
 * `StartupGate` exempts this route: it must run to completion whether the
 * session it is removing was valid, expired or already gone.
 */
export default function SignOutPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    void signOut()
      .catch(() => undefined)
      .finally(() => { if (active) setDone(true); });
    return () => { active = false; };
  }, []);

  if (!done) {
    return <AuthStateCard locale={locale} title={words.signingOutTitle} busy />;
  }

  return (
    <AuthStateCard
      locale={locale}
      title={words.signedOutTitle}
      body={words.signedOutBody}
      action={words.returnToSignIn}
      href="/sign-in"
    />
  );
}
