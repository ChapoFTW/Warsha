/**
 * The canonical Warsha mark, as data.
 *
 * "The Current": a protective frame containing a concealed W-shaped flow
 * trace. The geometry is the one Android and iOS already draw — this module
 * does not redraw it, it names it, so that web SVG, favicons, PWA icons and
 * generated raster assets all derive from one place instead of four
 * hand-maintained copies that drift.
 *
 * Deliberately import-free so it can be executed by a Node asset generator, a
 * regression suite and a React renderer without a bundler.
 */

export const MARK_VIEWBOX = 32;

/** The frame. Stroked, never filled — the mark is line art. */
export const MARK_FRAME = {
  x: 2,
  y: 2,
  width: 28,
  height: 28,
  rx: 7.2,
} as const;

/** The concealed W. */
export const MARK_TRACE = 'M2 13.2 L8.4 23.2 L14 14.8 L19.6 21.2 L30 9.2';

/** The stroke weight the mark is drawn at, in viewBox units. */
export const MARK_STROKE = 2.5;

/**
 * The mark's ink.
 *
 * Near-black on a light surface, near-white on a dark one. The geometry is
 * identical in both cases — only the colour changes.
 *
 * An earlier version kept the mark white everywhere and drew a heavier dark
 * path underneath so it could survive a light background. That was a contour
 * compensating for a contrast problem the mark should not have had, and it is
 * gone: no outline, no halo, no thickened stroke, no plate. These are the two
 * values `constants/appearance.ts` already resolves the mobile `brandMark`
 * token to, so one mark now behaves identically on every Warsha surface.
 */
export const MARK_INK_ON_DARK = '#FAFAFA';
export const MARK_INK_ON_LIGHT = '#111111';

export type MarkTreatment =
  /** The mark alone, in the ink its surface calls for. There is no other. */
  'plain';

/** The ink a surface calls for. */
export function inkFor(surface: 'light' | 'dark'): string {
  return surface === 'light' ? MARK_INK_ON_LIGHT : MARK_INK_ON_DARK;
}

/**
 * Which treatment a surface needs.
 *
 * One, now. Kept as a function because the asset generator and the tests both
 * ask the authority rather than assuming, and because "there is exactly one
 * treatment" is a fact worth being able to assert.
 */
export function treatmentFor(_surface: 'light' | 'dark'): MarkTreatment {
  return 'plain';
}

/**
 * The mark as a standalone SVG document.
 *
 * Used by the asset generator to produce every raster Warsha ships, so a PNG
 * favicon and the header vector cannot disagree about what the logo is.
 *
 * `padding` is expressed in viewBox units and exists for platform icon rules —
 * an Android adaptive foreground needs its safe zone, and a mark drawn to the
 * edge of a 512px square gets cropped by the launcher's mask.
 */
export function markSvg(options: {
  treatment?: MarkTreatment;
  /** Defaults to the dark-surface ink; pass inkFor('light') for a light one. */
  ink?: string;
  padding?: number;
  background?: string | null;
}): string {
  const {
    ink = MARK_INK_ON_DARK,
    padding = 0,
    background = null,
  } = options;

  const size = MARK_VIEWBOX + padding * 2;
  const offset = padding;
  const frame = MARK_FRAME;

  const backgroundLayer = background
    ? `<rect x="0" y="0" width="${size}" height="${size}" fill="${background}"/>`
    : '';

  const shapes = (stroke: string, width: number) => `
    <rect x="${frame.x + offset}" y="${frame.y + offset}" width="${frame.width}" height="${frame.height}"
      rx="${frame.rx}" fill="none" stroke="${stroke}" stroke-width="${width}"
      stroke-linejoin="round"/>
    <path d="${translateTrace(offset)}" fill="none" stroke="${stroke}" stroke-width="${width}"
      stroke-linecap="round" stroke-linejoin="round"/>`;

  // One layer. The mark is drawn once, in the ink its surface calls for —
  // there is no contour pass underneath any more.
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"`,
    ` width="${size}" height="${size}" fill="none">`,
    backgroundLayer,
    shapes(ink, MARK_STROKE),
    '</svg>',
  ].join('');
}

/** Shift the trace by the icon padding without altering its shape. */
export function translateTrace(offset: number): string {
  if (offset === 0) return MARK_TRACE;
  return MARK_TRACE.replace(
    /([ML])\s*(-?[\d.]+)\s+(-?[\d.]+)/g,
    (_match, command: string, x: string, y: string) =>
      `${command}${Number(x) + offset} ${Number(y) + offset}`,
  );
}
