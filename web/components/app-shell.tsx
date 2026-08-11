'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';

import { BrandLockup } from '@/components/brand-mark';
import { AppearanceSwitch, LanguageSwitch } from '@/components/preference-controls';
import { useSession } from '@/components/session-provider';
import { appCopy } from '@/lib/app-copy';
import { signOut } from '@/lib/auth-actions';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from './app-shell.module.css';

/**
 * The frame around every signed-in page.
 *
 * A top bar, not a bottom tab strip. The mobile client's tabs are right for a
 * thumb; on a pointer surface they waste the axis the content needs and read
 * as a phone screenshot. Navigation is URL-driven so a job can be linked,
 * bookmarked and opened in a new tab.
 */
export function AppShell({
  children,
  nav,
  mode,
}: {
  children: React.ReactNode;
  nav: readonly { href: string; label: string }[];
  mode?: string;
}) {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const pathname = usePathname().replace(/^\/app/, '') || '/';
  const router = useRouter();

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Link href={'/' as Route} className={styles.brand} aria-label={words.home}>
            <BrandLockup locale={locale} size={24} />
          </Link>

          <nav className={styles.nav} aria-label={words.navPrimary}>
            {nav.map((item) => {
              const active = item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  aria-current={active ? 'page' : undefined}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <span className={styles.spacer} />

          <div className={styles.actions}>
            {mode ? <span className={styles.modeBadge}>{mode}</span> : null}
            <LanguageSwitch locale={locale} />
            <AppearanceSwitch locale={locale} />
            <button
              type="button"
              className={styles.signOut}
              onClick={() => {
                void signOut().then(() => router.replace('/sign-in' as Route));
              }}
            >
              {words.signOut}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className={styles.main}>{children}</main>
    </div>
  );
}

/** Read the resolved account without each page importing the context. */
export function useAccount() {
  const { resolution } = useSession();
  return resolution.status === 'resolved' ? resolution : null;
}
