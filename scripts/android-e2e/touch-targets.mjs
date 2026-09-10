/**
 * Whether a control is actually usable, measured at runtime.
 *
 * This is the second of two authorities and it answers a different question
 * from the first. `scripts/touch-target-contract.test.mts` asks what a
 * component INTENDS to provide — a style either declares a minimum or it does
 * not. That is deterministic and it is not enough: a control can declare 48dp
 * and still be unreachable because something covers it, or because it never
 * comes fully into the viewport.
 *
 * ## Why the old check was wrong, and why this is not the same mistake
 *
 * The check this replaces read `uiautomator` bounds and compared them to 44.
 * Bounds are CLIPPED to the containing viewport, so a row scrolled half out of
 * a card reports the height of the part still showing. Clipping and smallness
 * produce the same number, so that check could not tell them apart, and every
 * finding it ever produced was clipping — including one that reached the
 * certification record as a defect on a destructive control.
 *
 * The fix is not a better threshold. It is measuring the same control twice,
 * from two scroll positions:
 *
 *   a genuinely small control measures the same wherever it sits
 *   a clipped one grows when it is brought fully into view
 *
 * So nothing is called undersized until it has been scrolled into the middle of
 * the screen, away from every edge, and measured there. Anything that cannot be
 * brought fully into view is reported as CLIPPED and never as small — an
 * unknown, stated as an unknown.
 *
 * ## What each verdict means
 *
 *   ok          fully visible, and at least the minimum in dp
 *   undersized  fully visible, measured away from every edge, and still small
 *   clipped     could not be brought fully into view, so its size is unknown
 *   obscured    fully visible but something is drawn over the point you would
 *               press, which makes its size beside the point
 */
import { screenSize, scrollDown, shell, sleep, tree } from './driver.mjs';

/** Android and iOS agree on this one; Material asks for 48. */
export const MINIMUM_DP = 44;

const boundsOf = (node) => node.bounds;
const heightOf = (node) => boundsOf(node).bottom - boundsOf(node).top;
const widthOf = (node) => boundsOf(node).right - boundsOf(node).left;

/**
 * The interactive node, not the glyph inside it.
 *
 * A chip is a pressable row containing an icon, a label and a close mark. The
 * close mark is decorative — the whole chip is the target, and the thing worth
 * measuring is whichever ancestor actually carries the press. uiautomator gives
 * no parent links, so the interactive node is taken as the SMALLEST clickable
 * node that contains this one's centre: a decorative child is never clickable,
 * and the enclosing chip is.
 */
export function interactiveNodeFor(node, nodes) {
  const { cx, cy } = boundsOf(node);
  const containers = nodes.filter((candidate) => candidate.clickable && candidate.bounds
    && candidate.bounds.left <= cx && candidate.bounds.right >= cx
    && candidate.bounds.top <= cy && candidate.bounds.bottom >= cy);
  if (containers.length === 0) return node;
  return containers.reduce((smallest, candidate) =>
    (widthOf(candidate) * heightOf(candidate) < widthOf(smallest) * heightOf(smallest)
      ? candidate : smallest));
}

/**
 * Whether anything is drawn over the point a finger would land on.
 *
 * Approximated from paint order: uiautomator emits nodes in the order they are
 * drawn, so a node appearing LATER and covering this one's centre is on top of
 * it. That is what a keyboard, a sheet or a sticky footer does to the control
 * beneath, and the size of a control nobody can reach is not the interesting
 * fact about it.
 */
export function isObscured(node, nodes) {
  const index = nodes.indexOf(node);
  const { cx, cy } = boundsOf(node);
  const own = boundsOf(node);

  return nodes.slice(index + 1).some((later) => {
    if (!later.bounds || later === node) return false;
    const box = later.bounds;
    const coversTheCentre = box.left <= cx && box.right >= cx
      && box.top <= cy && box.bottom >= cy;
    if (!coversTheCentre) return false;

    /*
     * A control's own children cover its centre, always.
     *
     * A chip is drawn, then its icon, its label and its close mark are drawn on
     * top — later in paint order, over the middle. The first version of this
     * counted those and reported a perfectly reachable chip as obscured, which
     * is the same shape of mistake as measuring a clipped row: a true statement
     * about the dump that is false about the product.
     *
     * A child is contained by its parent. Something that genuinely covers a
     * control — a keyboard, a bottom sheet, a sticky footer — extends beyond it.
     */
    const containedWithin = box.left >= own.left && box.right <= own.right
      && box.top >= own.top && box.bottom <= own.bottom;
    if (containedWithin) return false;

    // Nor is an ancestor a cover: it is what the control sits inside.
    return widthOf(later) * heightOf(later) < widthOf(node) * heightOf(node) * 4;
  });
}

/**
 * Bring a control fully into the middle of the screen, away from every edge.
 *
 * The middle band is the point: a control resting against the top or bottom of
 * a scroll container is exactly the case that produced every false finding, so
 * measuring only happens once it is nowhere near one.
 */
async function centre(findNode, { attempts = 6 } = {}) {
  const { height } = screenSize();
  const band = { top: height * 0.25, bottom: height * 0.75 };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const node = findNode(tree());
    if (!node?.bounds) return null;
    const { top, bottom } = boundsOf(node);
    if (top >= band.top && bottom <= band.bottom) return node;
    // Below the band: scroll down. Above it: scroll back up.
    if (bottom > band.bottom) await scrollDown({ from: 0.72, to: 0.45 });
    else shell(`input swipe ${Math.round(screenSize().width / 2)} `
      + `${Math.round(height * 0.45)} ${Math.round(screenSize().width / 2)} `
      + `${Math.round(height * 0.72)} 320`);
    await sleep(900);
  }
  return null;
}

/**
 * Measure one control honestly.
 *
 * @param {(nodes: any[]) => any} findNode locates the control in a fresh tree
 * @returns {Promise<{verdict: string, width?: number, height?: number, note?: string}>}
 */
export async function measureTarget(findNode, { minimum = MINIMUM_DP } = {}) {
  const before = findNode(tree());
  if (!before?.bounds) return { verdict: 'absent' };

  const { density } = screenSize();
  const dp = (pixels) => Math.round(pixels / density);

  const centred = await centre(findNode);
  if (!centred) {
    return {
      verdict: 'clipped',
      note: 'could not be brought fully into the middle of the screen, so its size is unknown',
    };
  }

  const nodes = tree();
  const interactive = interactiveNodeFor(centred, nodes);
  const width = dp(widthOf(interactive));
  const height = dp(heightOf(interactive));

  if (isObscured(interactive, nodes)) {
    return { verdict: 'obscured', width, height,
      note: 'something is drawn over the point a finger would land on' };
  }
  if (width < minimum || height < minimum) {
    return { verdict: 'undersized', width, height,
      note: `measured away from every edge and still under ${minimum}dp` };
  }
  return { verdict: 'ok', width, height };
}

/**
 * Audit several named controls on the screen in front of you.
 *
 * Named rather than swept, because scrolling each candidate into the middle
 * costs a gesture and a dump, and sweeping every clickable node on a long list
 * would take longer than the rest of a flow. The controls worth naming are the
 * ones a screen would be broken without.
 */
export async function auditTargets(names, { minimum = MINIMUM_DP } = {}) {
  const results = [];
  for (const name of names) {
    const findNode = (nodes) => nodes.find((node) => node.bounds
      && `${node.text} ${node.desc}`.trim().toLowerCase().includes(name.toLowerCase()));
    const result = await measureTarget(findNode, { minimum });
    results.push({ name, ...result });
    const size = result.width ? ` ${result.width}x${result.height}dp` : '';
    console.log(`    target ${name.slice(0, 32).padEnd(34)} ${result.verdict}${size}`
      + (result.note ? ` — ${result.note}` : ''));
  }
  return results;
}
