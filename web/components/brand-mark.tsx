import {
  MARK_CONTOUR_STROKE,
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
 * **The mark is white.** On a dark surface that is all it needs to be. On a
 * light surface a white line vanishes, so a thin dark contour is drawn *under*
 * it at a slightly greater stroke width — the same paths, so the edge follows
 * the logo rather than boxing it. There is no square, no plate and no second
 * logo: just the overhang of a heavier line showing at the edges of the one on
 * top.
 *
 * Which of the two appears is decided by CSS custom properties that flip with
 * the theme, so the correct contrast variant is chosen automatically and
 * before first paint — the same inline script that prevents the theme flash
 * prevents a white-on-white flash here.
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
      {/* Contour first, so the mark keeps its exact weight and only the
          overhang shows. `--warsha-mark-contour` is transparent on dark. */}
      <g className={styles.contour}>
        <rect
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
          rx={frame.rx}
          stroke="currentColor"
          strokeWidth={MARK_CONTOUR_STROKE}
          strokeLinejoin="round"
        />
        <path
          d={MARK_TRACE}
          stroke="currentColor"
          strokeWidth={MARK_CONTOUR_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

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
