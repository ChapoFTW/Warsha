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
 * The contour.
 *
 * The mark is white. On a light surface a white line disappears, so a thin
 * dark edge is drawn *under* it — the same paths at a greater stroke width, so
 * the contour follows the geometry rather than boxing it. Nothing is redrawn
 * and nothing is filled: there is no square, only a slightly heavier line
 * showing at the edges of the one that sits on top.
 *
 * `0.9` viewBox units total means `0.45` on each side. Chosen by looking at it
 * at every size Warsha ships:
 *
 *   16px favicon → 0.22px per side: present, never muddy
 *   32px favicon → 0.45px per side
 *   26px header  → 0.37px per side
 *   192px PWA    → 2.7px per side
 *   512px splash → 7.2px per side
 *
 * Going heavier reads as an outline at 512 and swallows the trace at 16, which
 * is the failure this number exists to avoid.
 */
export const MARK_CONTOUR = 0.9;
export const MARK_CONTOUR_STROKE = MARK_STROKE + MARK_CONTOUR;

export type MarkTreatment =
  /** White mark, dark contour. For light surfaces. */
  | 'contoured'
  /** White mark alone. For dark surfaces, where it is already legible. */
  | 'plain';

/**
 * Which treatment a surface needs.
 *
 * A dark surface does not get a contour: the instruction is to add one only
 * where it earns its place, and an outline drawn around a white mark on near
 * black is a detail nobody can see paying for weight everybody can.
 */
export function treatmentFor(surface: 'light' | 'dark'): MarkTreatment {
  return surface === 'light' ? 'contoured' : 'plain';
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
  treatment: MarkTreatment;
  ink?: string;
  contour?: string;
  padding?: number;
  background?: string | null;
}): string {
  const {
    treatment,
    ink = '#FAFAFA',
    contour = '#111111',
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

  // The contour is drawn first so the mark sits on top of it and keeps its
  // exact weight; only the overhang shows.
  const contourLayer = treatment === 'contoured'
    ? shapes(contour, MARK_CONTOUR_STROKE)
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">${backgroundLayer}${contourLayer}${shapes(ink, MARK_STROKE)}</svg>`;
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
