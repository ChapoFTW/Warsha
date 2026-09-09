/**
 * When a live journey is allowed to ask Google for a new route.
 *
 * This is the first piece of live arrival tracking to be written, and that
 * ordering is deliberate. `docs/architecture/live-arrival-tracking.md` measured
 * what the obvious implementation costs: recalculating on every GPS sample, at
 * a five-second sample rate, is 720,000 billed Routes requests a month at a
 * hundred jobs a day, against 48,000 for the same journeys on triggers. That
 * note holds the money, with the SKU it came from and the date it was
 * retrieved; the figures are not repeated here, because a rate that has been
 * copied into a second place is a rate that will be stale in one of them.
 *
 * The trap named in that note is that the naive model looks *less* catastrophic
 * per call as volume grows, because it buys its way into the cheap high-volume
 * bands. It is cheapest per request exactly when the bill is largest.
 *
 * So the deviation test exists before the map does. A marker drawn first and a
 * cost model added later is a product whose worst bills arrive from the
 * journeys that went worst — the professional circling a district hunting for
 * an address is the one being charged for by the minute.
 *
 * Nothing here talks to a network, a device or a clock it was not handed. It is
 * pure arithmetic so that the cost guarantee can be asserted by simulation
 * rather than discovered on an invoice.
 */

export type LatLng = { readonly latitude: number; readonly longitude: number };

/**
 * Thresholds, and the reasoning for each. Changing one changes the bill, so
 * none of them is a free parameter.
 */
export const ROUTE_REFRESH = {
  /**
   * A ceiling, not a target.
   *
   * A journey that goes to plan needs no recalculation at all between the
   * triggers below; this exists so an ETA cannot silently age past usefulness
   * while nothing else fires. Ninety seconds over a twenty-minute journey is
   * thirteen calls, which with one initial route and the reroute allowance is
   * the sixteen the cost model was built on.
   */
  ceilingMs: 90_000,

  /**
   * Movement large enough that the remaining route is materially different.
   *
   * This has to be read together with the ceiling, and the first version of it
   * was not. At 250m it fired far more often than the ninety-second ceiling
   * did, so it -- not the ceiling -- became the thing setting the bill, and a
   * simulated twenty-minute journey spent 25 requests against the 16 the cost
   * model was built on. The parameter meant to prevent runaway cost was
   * causing it.
   *
   * 500m was the second guess and was still too tight: it is about what ninety
   * seconds covers at Cairo's AVERAGE traffic speed, so on anything faster it
   * went back to setting the bill -- 30 requests for a 16km journey.
   *
   * The reasoning that fixes it is that the ceiling already guarantees the ETA
   * is never more than ninety seconds stale. Movement is not a second freshness
   * rule; it is a safety valve for progress so rapid that the ETA has moved by
   * much more than ordinary drift. 1,200m is ninety seconds at roughly twice
   * Cairo's average speed, so it fires on a motorway run and stays quiet in
   * traffic, where the ceiling was always going to fire first anyway.
   */
  movementMeters: 1_200,

  /**
   * Distance from the route at which the professional is no longer on it.
   *
   * Generous on purpose. GPS in a dense city drifts by tens of metres against
   * building faces, and a tight threshold turns ordinary noise into billed
   * reroutes — the failure this module exists to prevent, arriving through the
   * parameter meant to prevent it.
   */
  deviationMeters: 120,

  /**
   * A floor as well as a ceiling: no two billed requests closer together.
   *
   * Without this, any trigger can spin. The simulation found it immediately --
   * the staleness rule below fired on every GPS sample for the last minute of
   * every journey, twelve billed requests to re-learn something that had not
   * changed. One misjudged threshold turning into a request every five seconds
   * is precisely the failure this module exists to prevent, so the guarantee is
   * structural rather than left to each rule to get right.
   */
  floorMs: 20_000,

  /**
   * Genuine wrong turns allowed per journey.
   *
   * After this, deviation stops triggering and the ceiling alone governs. A
   * journey that has gone badly wrong is exactly the one that would otherwise
   * recalculate without limit, and the honest answer to a professional who is
   * thoroughly lost is a route that refreshes every ninety seconds — not one
   * that refreshes on every turn and bills for each.
   */
  rerouteAllowance: 2,
} as const;

export type RouteRefreshState = {
  /** When the currently-displayed route was computed. */
  readonly routedAt: number;
  /** Where the professional was when it was computed. */
  readonly routedFrom: LatLng;
  /** The path that route follows. Empty means there is no route yet. */
  readonly path: readonly LatLng[];
  /** The arrival time that route asserted. */
  readonly etaAt: number;
  /** Deviation-triggered recalculations already spent on this journey. */
  readonly reroutes: number;
};

export type RouteRefreshReason =
  | 'no-route'
  | 'ceiling'
  | 'movement'
  | 'deviation'
  | 'eta-stale';

export type RouteRefreshDecision =
  | { readonly recalculate: false }
  | { readonly recalculate: true; readonly reason: RouteRefreshReason };

const EARTH_RADIUS_METERS = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Metres between two points.
 *
 * Equirectangular rather than haversine: over the distances a single journey
 * covers the two agree to well under a metre, this is several times cheaper,
 * and it runs on every GPS sample on a low-end phone. Warsha's thresholds are
 * tens of metres, so the approximation is far inside the tolerance that matters.
 */
export function distanceMeters(from: LatLng, to: LatLng): number {
  const meanLatitude = toRadians((from.latitude + to.latitude) / 2);
  const dx = toRadians(to.longitude - from.longitude) * Math.cos(meanLatitude);
  const dy = toRadians(to.latitude - from.latitude);
  return Math.sqrt(dx * dx + dy * dy) * EARTH_RADIUS_METERS;
}

/**
 * Metres from a point to the nearest place on a path.
 *
 * Distance to the nearest VERTEX would be wrong, and wrong in the direction
 * that costs money: a route drawn with a kilometre between vertices on a
 * motorway would read as a kilometre of deviation for someone driving straight
 * down it. So each segment is measured properly, by projecting the point onto
 * it and clamping to the segment's ends.
 */
export function deviationMeters(point: LatLng, path: readonly LatLng[]): number {
  if (path.length === 0) return Number.POSITIVE_INFINITY;
  if (path.length === 1) return distanceMeters(point, path[0]);

  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length; index += 1) {
    nearest = Math.min(nearest, distanceToSegment(point, path[index - 1], path[index]));
    if (nearest === 0) return 0;
  }
  return nearest;
}

/** Projection onto one segment, in a local flat frame. Accurate at this scale. */
function distanceToSegment(point: LatLng, start: LatLng, end: LatLng): number {
  const meanLatitude = toRadians((start.latitude + end.latitude) / 2);
  const scaleX = Math.cos(meanLatitude) * EARTH_RADIUS_METERS;
  const scaleY = EARTH_RADIUS_METERS;

  const px = toRadians(point.longitude) * scaleX;
  const py = toRadians(point.latitude) * scaleY;
  const ax = toRadians(start.longitude) * scaleX;
  const ay = toRadians(start.latitude) * scaleY;
  const bx = toRadians(end.longitude) * scaleX;
  const by = toRadians(end.latitude) * scaleY;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  // A zero-length segment is a duplicated vertex, which real polylines contain.
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Whether this GPS sample justifies a billed route request.
 *
 * Ordered by cost of being wrong rather than by likelihood. Having no route at
 * all is the only case where the screen can show nothing, so it comes first; a
 * stale ETA is the case where the screen shows something false, so it comes
 * before the merely-imprecise ones.
 *
 * @param state    what the currently-displayed route asserts
 * @param position where the professional is now
 * @param now      the caller's clock, passed in so this stays testable
 */
export function shouldRecalculateRoute(
  state: RouteRefreshState,
  position: LatLng,
  now: number,
): RouteRefreshDecision {
  if (state.path.length === 0) return { recalculate: true, reason: 'no-route' };

  /*
   * No two billed requests closer than the floor, whatever fired.
   *
   * Checked before every rule except "there is no route at all", because that
   * one is the only case where the screen has nothing to show and waiting
   * twenty seconds would mean twenty seconds of blank map.
   */
  if (now - state.routedAt < ROUTE_REFRESH.floorMs) return { recalculate: false };

  /*
   * The promised arrival has PASSED and the journey is still running.
   *
   * The first version fired a minute early, on `now >= etaAt - 60_000`, which
   * is not staleness at all: an ETA a minute away is an ETA that is about to be
   * right. It made the end of every journey the most expensive part of it.
   */
  if (now >= state.etaAt) {
    return { recalculate: true, reason: 'eta-stale' };
  }

  if (state.reroutes < ROUTE_REFRESH.rerouteAllowance
    && deviationMeters(position, state.path) > ROUTE_REFRESH.deviationMeters) {
    return { recalculate: true, reason: 'deviation' };
  }

  if (now - state.routedAt >= ROUTE_REFRESH.ceilingMs) {
    return { recalculate: true, reason: 'ceiling' };
  }

  if (distanceMeters(position, state.routedFrom) >= ROUTE_REFRESH.movementMeters) {
    return { recalculate: true, reason: 'movement' };
  }

  return { recalculate: false };
}

/**
 * The state after a recalculation, so a caller cannot forget to spend the
 * reroute allowance and turn a lost professional into an unbounded bill.
 */
export function afterRecalculation(
  state: RouteRefreshState,
  reason: RouteRefreshReason,
  next: { readonly routedAt: number; readonly routedFrom: LatLng; readonly path: readonly LatLng[]; readonly etaAt: number },
): RouteRefreshState {
  return {
    ...next,
    reroutes: reason === 'deviation' ? state.reroutes + 1 : state.reroutes,
  };
}
