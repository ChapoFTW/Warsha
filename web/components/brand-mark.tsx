import {
  MARK_FRAME,
  MARK_STROKE,
  MARK_TRACE,
  MARK_VIEWBOX,
} from '@warsha/brand';
import type { Locale } from '@/lib/preferences';

import styles from './brand-mark.module.css';

/**
 * The Warsha mark — "The Current".
 *
 * The geometry comes from `src/brand/mark-geometry.ts`, the same module the
 * asset generator rasterises and the same shapes Android and iOS draw. Nothing
 * here is redrawn; a stroked vector stays crisp at any density and lets one
 * drawing serve both themes.
 *
 * **The mark takes the colour of its surface**: near-black on light,
 * near-white on dark, resolved from a token that flips with the theme. That is
 * the same rule the mobile mark has always followed through the brandMark
 * appearance token, so one mark now behaves identically everywhere.
 *
 * There is no contour, outline, halo or thickened stroke. A previous version
 * drew a heavier dark path underneath so a white mark could survive a light
 * background; changing the colour is the honest fix, and it leaves the
 * geometry untouched.
 *
 * The token is resolved by the same inline head script that prevents the theme
 * flash, so the correct variant is chosen before first paint — never white on
 * white, never black on black.
 */
export function BrandMark({
  size = 26,
  title,
}: {
  size?: number;
  title?: string;
}) {
  const frame = MARK_FRAME;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={styles.mark}
    >
      <g className={styles.ink}>
        <rect
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
          rx={frame.rx}
          stroke="currentColor"
          strokeWidth={MARK_STROKE}
          strokeLinejoin="round"
        />
        <path
          d={MARK_TRACE}
          stroke="currentColor"
          strokeWidth={MARK_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
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
