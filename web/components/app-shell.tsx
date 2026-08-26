'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

import { AccountMenu } from '@/components/account-menu';
import { BrandLockup } from '@/components/brand-mark';
import { PreferenceFooter } from '@/components/preference-controls';
import { useSession } from '@/components/session-provider';
import { appCopy } from '@/lib/app-copy';
import { useAppLocale } from '@/lib/use-app-locale';
import type { RoleNavigation } from '@/lib/nav';

import styles from './app-shell.module.css';

/**
 * The frame around every signed-in page.
 *
 * A top bar, not a bottom tab strip. The mobile client's tabs are right for a
 * thumb; on a pointer surface they waste the axis the content needs and read
 * as a phone screenshot. Navigation is URL-driven so a job can be linked,
 * bookmarked and opened in a new tab.
 *
 * It takes a `RoleNavigation`, not a list. The old signature accepted one flat
 * array and rendered every element of it as a persistent link, which is how the
 * customer header came to carry nine destinations: the shell had no way to be
 * told that Addresses and Home are not the same kind of thing. The tiers are a
 * product decision and live in `lib/nav.ts`; this only renders them.
 */
export function AppShell({
  children,
  navigation,
  mode,
}: {
  children: React.ReactNode;
  navigation: RoleNavigation;
  mode?: string;
}) {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const pathname = usePathname().replace(/^\/app/, '') || '/';

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Link href={'/' as Route} className={styles.brand} aria-label={words.home}>
            <BrandLockup locale={locale} size={24} />
          </Link>

          <nav className={styles.nav} aria-label={words.navPrimary}>
            {navigation.primary.map((item) => {
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
            <AccountMenu
              links={navigation.account}
              label={words.navAccount}
              mode={mode}
              signOutLabel={words.signOut}
            />
          </div>
        </div>
      </header>

      <main id="main" className={styles.main}>{children}</main>

      {/* The application has no marketing footer, so this is it: the one strip
          at the bottom of every customer and worker page that carries the
          preferences the header used to. Reachable from every route, rather
          than only from Account. */}
      <footer className={styles.footer}>
        <PreferenceFooter locale={locale} />
      </footer>
    </div>
  );
}

/** Read the resolved account without each page importing the context. */
export function useAccount() {
  const { resolution } = useSession();
  return resolution.status === 'resolved' ? resolution : null;
}
