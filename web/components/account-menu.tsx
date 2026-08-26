'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { signOut } from '@/lib/auth-actions';
import type { NavLink } from '@/lib/nav';

import styles from './app-shell.module.css';

/**
 * The second tier of authenticated navigation, and the session controls.
 *
 * Everything that used to sit in the header alongside the four destinations a
 * person actually navigates between — settings, addresses, help, support, the
 * role badge and Sign out — lives here, one click away.
 *
 * The interaction is the one `SiteNav` already established on the public site:
 * Escape closes and returns focus to the trigger, a pointer press outside
 * closes, and the trigger carries `aria-expanded`. Deliberately the same, so
 * the two shells behave identically for a keyboard user even though they are
 * separate components serving separate information architectures.
 *
 * Sign out is in here rather than in the header because it is a session
 * control, not a product destination. It sat next to the brand as though
 * leaving were one of the things Warsha is for.
 */
export function AccountMenu({
  links,
  label,
  mode,
  signOutLabel,
}: {
  links: readonly NavLink[];
  /** Localized name of the control itself, announced to a screen reader. */
  label: string;
  /** The role badge — a statement about the account, not a control. */
  mode?: string;
  signOutLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname().replace(/^\/app/, '') || '/';
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <div className={styles.accountMenu}>
      <button
        ref={trigger}
        type="button"
        className={styles.accountTrigger}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        {mode ? <span className={styles.modeBadge}>{mode}</span> : null}
        <span>{label}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>

      {open ? (
        <div ref={panel} className={styles.accountPanel} role="menu" aria-label={label}>
          {links.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href as Route}
                role="menuitem"
                aria-current={active ? 'page' : undefined}
                className={`${styles.accountLink} ${active ? styles.accountLinkActive : ''}`}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            role="menuitem"
            className={styles.accountSignOut}
            onClick={() => {
              setOpen(false);
              void signOut().then(() => router.replace('/sign-in' as Route));
            }}
          >
            {signOutLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
