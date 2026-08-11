import type { Locale } from '@/lib/preferences';

import styles from './brand-mark.module.css';

/**
 * The Warsha mark — "The Current".
 *
 * This is not a new drawing. The geometry is copied verbatim from
 * `components/warsha/BrandMark.tsx`, which the Android and iOS applications
 * render: a protective frame containing a concealed W-shaped flow trace, on a
 * 32×32 viewBox with a 2.5 stroke and a 7.2 corner radius.
 *
 * It is redrawn as inline SVG rather than imported as a PNG for two reasons
 * that matter at this size: a stroked vector stays crisp at any density and in
 * print, and `currentColor` lets one mark serve both themes. The mobile client
 * inks it with the `brandMark` token — near-white on the dark canvas,
 * near-black on the light one — and the web token of the same name resolves to
 * the same two values, so the mark is identical on every Warsha surface
 * without a second asset to keep in sync.
 */
export function BrandMark({
  size = 26,
  title,
}: {
  size?: number;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="7.2"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M2 13.2 L8.4 23.2 L14 14.8 L19.6 21.2 L30 9.2"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Mark plus wordmark, matching `BrandLockup` on mobile.
 *
 * The wordmark is the word itself in the interface font rather than a picture
 * of the word, so it inherits the Arabic face on Arabic pages exactly as the
 * mobile lockup does.
 */
export function BrandLockup({ locale, size = 26 }: { locale: Locale; size?: number }) {
  return (
    <span className={styles.lockup}>
      <BrandMark size={size} />
      <span className={styles.wordmark}>{locale === 'ar' ? 'ورشة' : 'Warsha'}</span>
    </span>
  );
}
