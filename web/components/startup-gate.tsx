'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { Route } from 'next';
import { useEffect } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { useSession } from '@/components/session-provider';
import { webHomeFor } from '@/lib/account';
import { appCopy } from '@/lib/app-copy';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from './startup-gate.module.css';

/**
 * The web equivalent of the mobile startup gate.
 *
 * The rule is the same and it exists for the same reason: **a redirect is not
 * permission to render the page being replaced.** React effects run after
 * paint, so a gate that renders the app and navigates away in an effect has
 * already shown somebody a screen they were not entitled to — for a frame on a
 * fast connection, for a visible second on a slow one.
 *
 * So there are three states and only one of them mounts children:
 *
 *   loading      — auth or account state unresolved; neutral mark
 *   redirecting  — destination known, current path wrong; still neutral
 *   render       — this path is correct for this account
 *
 * Signed-out visitors may see the public account routes (sign-in) and nothing
 * else. Signed-in visitors are moved off them.
 */

/** Routes a signed-out visitor may reach on the application origin. */
// Creating an account is necessarily something a signed-out person does, so it
// belongs here beside sign-in. Leaving it out made the route unreachable: the
// gate bounced every anonymous visitor to /sign-in, which is the same class of
// defect as the admin origin's missing signed-out entry.
const PUBLIC_APP_ROUTES = ['/sign-in', '/create-account', '/forgot-password', '/resend-confirmation', '/account/unavailable'];

/**
 * Routes the gate must never move anybody off, signed in or out.
 *
 * These own a session's lifecycle rather than consuming one, so the ordinary
 * question — "does this account belong on this page?" — is the wrong question
 * to ask about them.
 *
 * `/reset-password` is the one that matters. A recovery link *establishes a
 * session*, so by the time this gate resolves, the visitor looks like an
 * ordinary signed-in account and would be sent to their home page — bouncing
 * them out of the password form the link existed to open. That is precisely the
 * failure that made valid reset links look expired on mobile, and it must not
 * be rebuilt here in a different shape.
 *
 * The page itself, not this gate, decides whether the visitor actually arrived
 * with a recovery grant; somebody who simply types the path is shown the
 * invalid-link card.
 */
const CALLBACK_APP_ROUTES = ['/reset-password', '/auth/confirm', '/sign-out'];

function matches(routes: readonly string[], path: string): boolean {
  return routes.some((route) => path === route || path.startsWith(`${route}/`));
}

function isPublicAppRoute(path: string): boolean {
  return matches(PUBLIC_APP_ROUTES, path);
}

function isCallbackAppRoute(path: string): boolean {
  return matches(CALLBACK_APP_ROUTES, path);
}

export function StartupGate({ children }: { children: React.ReactNode }) {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const {
    resolution,
    customerRecoveryEligible,
    customerRecoveryBusy,
    customerRecoveryError,
    resumeCustomerSetup,
    refresh,
  } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // `/app` is a rewrite target; the visitor's address bar shows the path
  // without it, and so must every comparison here.
  const path = pathname.replace(/^\/app/, '') || '/';

  let redirect: string | null = null;
  let status: 'loading' | 'redirecting' | 'render' | 'recovery' = 'loading';

  if (isCallbackAppRoute(path)) {
    // Checked before the resolution is even consulted, including while it is
    // still loading: these pages must paint immediately, because the thing they
    // are waiting for is the very session the gate is waiting for.
    status = 'render';
  } else if (resolution.status === 'loading') {
    status = 'loading';
  } else if (resolution.status === 'error') {
    status = 'recovery';
  } else if (resolution.status === 'signed_out') {
    status = isPublicAppRoute(path) ? 'render' : 'redirecting';
    redirect = status === 'redirecting' ? '/sign-in' : null;
  } else if (resolution.status === 'choose_mode') {
    status = path === '/choose-mode' ? 'render' : 'redirecting';
    redirect = status === 'redirecting' ? '/choose-mode' : null;
  } else {
    if (resolution.target === 'role_choice') {
      status = 'recovery';
    } else {
      const home = webHomeFor(resolution.target);
      // A signed-in account sitting on sign-in is sent onward; that is what
      // makes signing in land in the right place without the form knowing where.
      if (isPublicAppRoute(path)) {
        status = 'redirecting';
        redirect = home;
      } else if (path === '/choose-mode') {
        status = resolution.roles.both ? 'render' : 'redirecting';
        redirect = status === 'redirecting' ? home : null;
      } else if (resolution.target === 'account_blocked' && path !== '/account/unavailable') {
        status = 'redirecting';
        redirect = '/account/unavailable';
      } else if (resolution.target === 'worker_onboarding'
          && path !== '/worker/onboarding'
          && !path.startsWith('/worker/verification')
          && path !== '/notifications'
          && path !== '/support'
          && !path.startsWith('/help')) {
        status = 'redirecting';
        redirect = home;
      } else if (resolution.target === 'customer_home' && path.startsWith('/worker')) {
        status = 'redirecting';
        redirect = home;
      } else if (resolution.target === 'worker_home'
          && !path.startsWith('/worker')
          && path !== '/notifications'
          && path !== '/support'
          && !path.startsWith('/help')) {
        status = 'redirecting';
        redirect = home;
      } else if (path === '/' && home !== '/') {
        status = 'redirecting';
        redirect = home;
      } else {
        status = 'render';
      }
    }
  }

  useEffect(() => {
    if (redirect) router.replace(redirect as Route);
  }, [redirect, router]);

  if (status === 'recovery') {
    const missingSetup = resolution.status === 'resolved'
      && resolution.target === 'role_choice';
    return (
      <div className={styles.startup} role="alert">
        <div className={styles.recovery}>
          <BrandMark size={56} />
          <h1>{missingSetup ? words.accountSetupIncomplete : words.loadFailed}</h1>
          {missingSetup ? (
            <p>
              {customerRecoveryEligible
                ? words.accountSetupCustomerRecoveryBody
                : words.accountSetupIncompleteBody}
            </p>
          ) : null}
          {missingSetup && customerRecoveryError ? (
            <p role="alert">{words.accountSetupCustomerRecoveryFailed}</p>
          ) : null}
          <div className={styles.actions}>
            {missingSetup && customerRecoveryEligible ? (
              <button
                type="button"
                disabled={customerRecoveryBusy}
                onClick={() => void resumeCustomerSetup()}>
                {customerRecoveryBusy ? words.loading : words.accountSetupCustomerRecoveryAction}
              </button>
            ) : (
              <button type="button" onClick={() => void refresh()}>{words.retry}</button>
            )}
            <a aria-disabled={customerRecoveryBusy} href={customerRecoveryBusy ? undefined : '/sign-out'}>
              {words.signOut}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status !== 'render') {
    return (
      <div className={styles.startup} role="progressbar" aria-label="Loading Warsha">
        <BrandMark size={56} />
      </div>
    );
  }

  return <>{children}</>;
}
