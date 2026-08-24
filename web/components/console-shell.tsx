'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

import { BrandLockup } from '@/components/brand-mark';
import { PreferenceFooter } from '@/components/preference-controls';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import { visibleAreas } from '@/lib/console-areas';
import { signOut } from '@/lib/auth-actions';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from './console-shell.module.css';

/**
 * The console frame: a persistent sidebar of the areas this staff member can
 * actually reach.
 *
 * Desktop-first, unlike the customer and worker applications. An operations
 * console is used at a desk with a keyboard, and pretending otherwise would
 * cost the density the work needs. It still collapses to a single column
 * rather than overflowing, because a laptop is not always what somebody has.
 */
export function ConsoleShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session } = useStaff();
  const pathname = usePathname().replace(/^\/admin/, '') || '/';
  const areas = visibleAreas(session);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <BrandLockup locale={locale} size={22} />
        </div>

        <nav className={styles.nav} aria-label={words.navPrimary}>
          {areas.map((area) => {
            const active = area.href === '/'
              ? pathname === '/'
              : pathname.startsWith(area.href);
            return (
              <Link
                key={area.key}
                href={`/admin${area.href === '/' ? '' : area.href}` as Route}
                aria-current={active ? 'page' : undefined}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
              >
                {words[`console_${area.key}` as keyof typeof words] ?? area.key}
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFoot}>
          <button
            type="button"
            className={styles.signOut}
            onClick={() => { void signOut().then(() => { window.location.href = '/'; }); }}
          >
            {words.signOut}
          </button>
        </div>

        {/* Below sign-out, at the very bottom. Preferences are not navigation
            and must not compete with it for the narrowest surface Warsha has. */}
        <PreferenceFooter locale={locale} className={styles.sidebarPreferences} />
      </aside>

      <main id="main" className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </main>
    </div>
  );
}
