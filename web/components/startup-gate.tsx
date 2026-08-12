'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { Route } from 'next';
import { useEffect } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { useSession } from '@/components/session-provider';
import { webHomeFor } from '@/lib/account';

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
const PUBLIC_APP_ROUTES = ['/sign-in', '/create-account', '/account/unavailable'];

function isPublicAppRoute(path: string): boolean {
  return PUBLIC_APP_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

export function StartupGate({ children }: { children: React.ReactNode }) {
  const { resolution } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // `/app` is a rewrite target; the visitor's address bar shows the path
  // without it, and so must every comparison here.
  const path = pathname.replace(/^\/app/, '') || '/';

  let redirect: string | null = null;
  let status: 'loading' | 'redirecting' | 'render' = 'loading';

  if (resolution.status === 'loading') {
    status = 'loading';
  } else if (resolution.status === 'signed_out') {
    status = isPublicAppRoute(path) ? 'render' : 'redirecting';
    redirect = status === 'redirecting' ? '/sign-in' : null;
  } else if (resolution.status === 'choose_mode') {
    status = path === '/choose-mode' ? 'render' : 'redirecting';
    redirect = status === 'redirecting' ? '/choose-mode' : null;
  } else {
    const home = webHomeFor(resolution.target);
    // A signed-in account sitting on sign-in is sent onward; that is what
    // makes signing in land in the right place without the form knowing where.
    if (isPublicAppRoute(path) || path === '/choose-mode') {
      status = 'redirecting';
      redirect = home;
    } else if (resolution.target === 'account_blocked' && path !== '/account/unavailable') {
      status = 'redirecting';
      redirect = '/account/unavailable';
    } else if (resolution.target === 'worker_onboarding' && !path.startsWith('/worker')) {
      status = 'redirecting';
      redirect = home;
    } else if (path === '/' && home !== '/') {
      status = 'redirecting';
      redirect = home;
    } else {
      status = 'render';
    }
  }

  useEffect(() => {
    if (redirect) router.replace(redirect as Route);
  }, [redirect, router]);

  if (status !== 'render') {
    return (
      <div className={styles.startup} role="progressbar" aria-label="Loading Warsha">
        <BrandMark size={56} />
      </div>
    );
  }

  return <>{children}</>;
}
