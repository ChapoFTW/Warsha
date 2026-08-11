'use client';

import type { Locale } from '@/lib/preferences';

import styles from './console-table.module.css';

/**
 * The small pieces every console table repeats: a status badge, a timestamp,
 * an identifier, a waiting duration.
 *
 * They live together because they carry rules that are easy to get subtly
 * wrong in four separate places — identifiers must not be reordered by an
 * Arabic paragraph, timestamps must state the zone they are in, and a badge
 * must not invent a colour Warsha does not have.
 */

/**
 * A status badge.
 *
 * Warsha is monochrome — there is no green "good" and no red "bad" in the
 * design system, and inventing one here would be inventing brand. Emphasis
 * comes from weight and border instead: `strong` for the state that needs an
 * operator's attention, plain for everything else.
 */
export function Badge({
  children,
  tone = 'plain',
}: {
  children: React.ReactNode;
  tone?: 'plain' | 'strong' | 'quiet';
}) {
  const className = tone === 'strong'
    ? `${styles.badge} ${styles.badgeStrong}`
    : tone === 'quiet'
      ? `${styles.badge} ${styles.badgeQuiet}`
      : styles.badge;
  return <span className={className}>{children}</span>;
}

/** An identifier: monospace, left-to-right, and never silently truncated. */
export function Identifier({ value, short }: { value: string | null; short?: boolean }) {
  if (!value) return <span className={styles.muted}>—</span>;
  return (
    <span className={styles.mono} dir="ltr" title={value}>
      {short ? `${value.slice(0, 8)}…` : value}
    </span>
  );
}

/**
 * A timestamp in the console's declared display timezone.
 *
 * The zone is stated rather than assumed. An operator reading an audit trail
 * needs to know whether 03:00 was three in the morning where the action
 * happened or where they happen to be sitting.
 */
export function Timestamp({
  value,
  locale,
  timeZone,
}: {
  value: string | null | undefined;
  locale: Locale;
  timeZone?: string;
}) {
  if (!value) return <span className={styles.muted}>—</span>;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return <span className={styles.mono}>{value}</span>;
  const formatted = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timeZone || undefined,
  }).format(at);
  return <time dateTime={at.toISOString()} className={styles.timestamp}>{formatted}</time>;
}

/**
 * How long something has been waiting, in the coarsest honest unit.
 *
 * A vetting queue is read to answer "what has waited too long", so days and
 * hours are the useful resolution. `Intl.RelativeTimeFormat` keeps this correct
 * in Arabic, where the plural rules are not English's.
 */
export function Waiting({ since, locale }: { since: string | null; locale: Locale }) {
  if (!since) return <span className={styles.muted}>—</span>;
  const at = new Date(since);
  if (Number.isNaN(at.getTime())) return <span className={styles.muted}>—</span>;
  const seconds = (Date.now() - at.getTime()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    numeric: 'auto',
  });
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    seconds >= 86400 ? [-Math.floor(seconds / 86400), 'day']
      : seconds >= 3600 ? [-Math.floor(seconds / 3600), 'hour']
        : [-Math.floor(seconds / 60), 'minute'];
  return <span className={styles.waiting}>{format.format(amount, unit)}</span>;
}

/** An empty-state line that says why the table is empty, not just that it is. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className={styles.muted}>{children}</p>;
}
