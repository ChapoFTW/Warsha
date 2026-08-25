'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { copy } from '@/lib/copy';
import type { Locale } from '@/lib/preferences';

import styles from './site-chrome.module.css';

/**
 * Primary navigation, and the disclosure it collapses into.
 *
 * The previous header put five labels, two preference controls and two calls
 * to action in one flex row. Past roughly 1100px of content the row ran out of
 * width, flex shrank the links, and every label wrapped onto a second line —
 * which is why the header measured 122px at 1440px, where there was obviously
 * enough room. The header was not too tall; it was the right height for
 * two-line navigation nobody wanted.
 *
 * So the links no longer wrap (`white-space: nowrap`), and below the width
 * where they genuinely fit they collapse into this button rather than growing
 * the header. Collapsing is a decision; wrapping was an accident.
 */
export function SiteNav({
  locale,
  links,
}: {
  locale: Locale;
  links: readonly { href: Route; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const words = copy[locale];
  const pathname = usePathname();

  // Escape closes and returns focus to the control that opened it, which is
  // what a keyboard user expects and what a pointer user never notices.
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
    <>
      <nav className={styles.nav} aria-label={words.navPrimary}>
        {links.map((item) => (
          <Link key={item.href} href={item.href} className={styles.navLink}
            aria-current={pathname === item.href ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>

      <button
        ref={trigger}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls="warsha-nav-panel"
        aria-label={words.navMenu}
        onClick={() => setOpen((value) => !value)}
      >
        {/* Three bars, or a cross when open. Neither is directional, so
            neither mirrors in Arabic. */}
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          {open ? (
            <path
              d="M5 5 L15 15 M15 5 L5 15"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M3 6 H17 M3 10 H17 M3 14 H17"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      {open ? (
        <div id="warsha-nav-panel" ref={panel} className={styles.navPanel}>
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navPanelLink}
              aria-current={pathname === item.href ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
