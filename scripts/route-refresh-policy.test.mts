/**
 * The cost model, executed rather than asserted in prose.
 *
 * `docs/architecture/live-arrival-tracking.md` measured that recalculating a
 * route on every GPS sample costs an order of magnitude more than the same
 * journeys on triggers, and holds the rates with the SKU and retrieval date
 * they came from. The whole design rests on one number: sixteen billed
 * requests for a twenty-minute journey.
 *
 * A number in a document is a claim. This simulates journeys sample by sample
 * and counts what the policy would actually spend, so the claim is a property
 * of the code and fails loudly if a threshold is edited without the arithmetic
 * being redone.
 *
 * The journeys below are synthetic coordinates in Cairo. No network, no device,
 * no billed request — which is the point: the expensive thing is proven cheap
 * before anything is switched on.
 */
import assert from 'node:assert/strict';

import {
  ROUTE_REFRESH,
  afterRecalculation,
  deviationMeters,
  distanceMeters,
  shouldRecalculateRoute,
  type LatLng,
  type RouteRefreshState,
} from '../src/tracking/route-refresh-policy.ts';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

// --- The geometry has to be right before the policy means anything ----------
const ABDIN: LatLng = { latitude: 30.0444, longitude: 31.2483 };
const TAHRIR: LatLng = { latitude: 30.0444, longitude: 31.2357 };

{
  // Abdin to Tahrir is about 1.2km due west along the same latitude.
  const metres = distanceMeters(ABDIN, TAHRIR);
  ok(metres > 1_100 && metres < 1_300, `Abdin to Tahrir measures ~1.2km, got ${Math.round(metres)}m`);
  equal(Math.round(distanceMeters(ABDIN, ABDIN)), 0, 'a point is no distance from itself');
}

{
  // A straight two-vertex path with a wide gap. Distance to the nearest VERTEX
  // would report ~600m for someone standing exactly on the line halfway along;
  // the honest answer is zero, and getting this wrong bills for every straight
  // stretch of motorway.
  const path = [ABDIN, TAHRIR];
  const halfway: LatLng = { latitude: 30.0444, longitude: (31.2483 + 31.2357) / 2 };
  ok(deviationMeters(halfway, path) < 1,
    'a point on the line between two distant vertices is ON the route, not 600m off it');

  // One block north of that midpoint.
  const northOfIt: LatLng = { latitude: 30.0454, longitude: halfway.longitude };
  const off = deviationMeters(northOfIt, path);
  ok(off > 90 && off < 130, `a block off the route measures ~110m, got ${Math.round(off)}m`);

  equal(deviationMeters(ABDIN, []), Number.POSITIVE_INFINITY,
    'no route means infinitely far from it, so a route is always fetched');
  ok(deviationMeters(ABDIN, [ABDIN, ABDIN]) < 1,
    'a duplicated vertex is a real thing in a polyline and does not divide by zero');
}

// --- A journey that goes to plan --------------------------------------------
/**
 * A journey, sample by sample, counting what the policy would actually spend.
 *
 * Distance is a parameter rather than an assumption, because speed is what
 * decides the answer and the first version of this hid it. A twenty-minute
 * journey covering 2km and one covering 13km are different products of the same
 * duration, and the movement trigger behaves differently in each.
 */
function simulate({
  minutes, kilometres, sampleMs, deviateAt = [], optimisticMinutes,
}: {
  minutes: number;
  /** How far the professional actually travels. Duration alone decides nothing. */
  kilometres: number;
  sampleMs: number;
  /** Sample indices at which the professional leaves the route. */
  deviateAt?: readonly number[];
  /**
   * Every route promises arrival this many minutes from now, and is wrong every
   * time -- traffic worse than any estimate predicted. Omitted, the estimates
   * are honest and simply track the remaining distance.
   */
  optimisticMinutes?: number;
}) {
  const start = 1_700_000_000_000;
  const samples = Math.round((minutes * 60_000) / sampleMs);

  // A straight route east across Cairo. One degree of longitude at this
  // latitude is about 96km, so this converts kilometres into a real span.
  const span = kilometres / 96;
  const vertices = Math.max(2, minutes + 1);
  const path: LatLng[] = Array.from({ length: vertices }, (_, index) => ({
    latitude: 30.0444,
    longitude: 31.2357 + (index / (vertices - 1)) * span,
  }));

  const promiseAt = (now: number, progress: number) => (optimisticMinutes === undefined
    ? now + (1 - progress) * minutes * 60_000
    : now + optimisticMinutes * 60_000);

  let state: RouteRefreshState = {
    routedAt: start, routedFrom: path[0], path, etaAt: promiseAt(start, 0), reroutes: 0,
  };
  let calls = 1; // the initial route
  const reasons: Record<string, number> = {};

  for (let index = 0; index < samples; index += 1) {
    const now = start + index * sampleMs;
    const progress = index / samples;
    const onRoute: LatLng = {
      latitude: 30.0444,
      longitude: 31.2357 + progress * span,
    };
    // A deviation sample sits a few hundred metres north of the line.
    const position = deviateAt.includes(index)
      ? { latitude: onRoute.latitude + 0.0035, longitude: onRoute.longitude }
      : onRoute;

    const decision = shouldRecalculateRoute(state, position, now);
    if (!decision.recalculate) continue;

    calls += 1;
    reasons[decision.reason] = (reasons[decision.reason] ?? 0) + 1;
    state = afterRecalculation(state, decision.reason, {
      routedAt: now,
      routedFrom: position,
      path,
      /* A fresh route answers with a NEW arrival time. Re-promising the old one
         would model a Routes API that never revises anything, and would make
         the staleness rule look like it spins when the fault was the fixture. */
      etaAt: promiseAt(now, progress),
    });
  }
  return { calls, reasons, samples };
}

{
  // The journey the cost model is built on: twenty minutes across Cairo at the
  // city's average traffic speed, which is about 6.7km.
  const journey = simulate({ minutes: 20, kilometres: 6.7, sampleMs: 5_000 });
  equal(journey.samples, 240, 'a 20-minute journey at 5s sampling is 240 GPS samples');
  ok(journey.calls <= 16,
    `THE COST MODEL HOLDS: ${journey.calls} billed requests, not the 240 a naive implementation spends`);
  ok(journey.calls >= 10,
    `and the route is still refreshed often enough to be true (${journey.calls} requests)`);
  ok(!journey.reasons.deviation, 'a journey that goes to plan spends no reroute allowance');
}

{
  // A crawl. The ceiling is the only thing keeping the ETA honest here, and it
  // must not stop firing just because nobody is moving.
  const crawl = simulate({ minutes: 20, kilometres: 1.5, sampleMs: 5_000 });
  ok(crawl.calls <= 16, `a slow journey is no more expensive: ${crawl.calls} requests`);
  ok((crawl.reasons.ceiling ?? 0) >= 10,
    'and the ceiling carries it, because movement never reaches its threshold');
}

{
  // A fast journey covers more ground, so more of the route really has changed
  // and it costs more. That is correct rather than unfortunate -- but it has to
  // be BOUNDED, and stated, rather than discovered on a bill.
  const fast = simulate({ minutes: 20, kilometres: 16, sampleMs: 5_000 });
  ok(fast.calls <= 18,
    `A FAST JOURNEY IS STILL BOUNDED: ${fast.calls} requests for 16km in 20 minutes`);
  // At 48km/h the ceiling and the movement threshold are almost exactly tied,
  // and the ceiling is checked first, so it wins. Movement is a safety valve
  // rather than a second freshness rule, and this is what quiet looks like.
  ok(!fast.reasons.movement,
    'and the ceiling still carries it, because movement is not a second ceiling');
}

{
  // The ring road: 25km in twenty minutes, faster than the ceiling anticipates.
  // This is the journey the movement trigger exists for, and it must fire.
  const motorway = simulate({ minutes: 20, kilometres: 25, sampleMs: 5_000 });
  ok((motorway.reasons.movement ?? 0) > 0,
    'the safety valve opens when progress genuinely outruns the ceiling');
  ok(motorway.calls <= 24,
    `and it is bounded even then: ${motorway.calls} requests for 25km in 20 minutes`);
}

// --- A journey that goes badly ----------------------------------------------
{
  // Lost: off the route at fifteen separate moments. This is the journey that
  // would otherwise recalculate without limit and bill for every wrong turn.
  const lost = simulate({
    minutes: 20,
    kilometres: 6.7,
    sampleMs: 5_000,
    deviateAt: Array.from({ length: 15 }, (_, index) => 20 + index * 12),
  });
  equal(lost.reasons.deviation, ROUTE_REFRESH.rerouteAllowance,
    'a thoroughly lost professional spends the reroute allowance and no more');
  ok(lost.calls <= 20,
    `A PATHOLOGICAL JOURNEY IS STILL BOUNDED: ${lost.calls} requests, not one per wrong turn`);
}

// --- A journey that overruns its ETA ----------------------------------------
{
  /*
   * Every estimate says one more minute, and the journey takes twenty.
   *
   * Traffic worse than any prediction. The promised arrival keeps passing while
   * the professional is still moving, and refreshing is right: the alternative
   * is a screen asserting they have already arrived. What must NOT happen is a
   * refresh on every GPS sample once the promise lapses, which is what the
   * first version did and what the floor now prevents.
   *
   * One minute rather than three, and the reason is worth recording: at three
   * the ceiling refreshed the promise every ninety seconds and it never lapsed
   * at all. That is the design working -- staleness is a backstop for promises
   * shorter than the ceiling, not the ordinary path -- but it means the backstop
   * has to be exercised with a promise short enough to actually expire.
   */
  const overrun = simulate({
    minutes: 20, kilometres: 6.7, sampleMs: 5_000, optimisticMinutes: 1,
  });
  ok((overrun.reasons['eta-stale'] ?? 0) > 0,
    'a passed ETA refreshes rather than leaving a false arrival time on screen');
  ok(overrun.calls <= 24,
    `and an ETA that is wrong all journey is still bounded: ${overrun.calls} requests`);
}

// --- Individual triggers, in isolation --------------------------------------
const base: RouteRefreshState = {
  routedAt: 1_000_000,
  routedFrom: TAHRIR,
  path: [TAHRIR, ABDIN],
  etaAt: 1_000_000 + 20 * 60_000,
  reroutes: 0,
};

equal(shouldRecalculateRoute({ ...base, path: [] }, TAHRIR, base.routedAt),
  { recalculate: true, reason: 'no-route' },
  'no route at all is always fetched');

equal(shouldRecalculateRoute(base, TAHRIR, base.routedAt + 1_000),
  { recalculate: false },
  'a sample seconds after a fresh route, having barely moved, buys nothing');

equal(shouldRecalculateRoute(base, TAHRIR, base.routedAt + ROUTE_REFRESH.ceilingMs),
  { recalculate: true, reason: 'ceiling' },
  'the ceiling fires so an ETA cannot silently age past usefulness');

{
  // Far off route, allowance spent: the ceiling governs from here, and nothing
  // else. This is the case that decides whether a bad journey is bounded.
  const spent = { ...base, reroutes: ROUTE_REFRESH.rerouteAllowance };
  const wayOff: LatLng = { latitude: 30.0800, longitude: 31.2400 };
  ok(deviationMeters(wayOff, base.path) > ROUTE_REFRESH.deviationMeters,
    'the test position really is off the route, so the assertion below means something');
  equal(shouldRecalculateRoute(spent, wayOff, base.routedAt + 1_000),
    { recalculate: false },
    'once the allowance is spent, deviation stops billing and the ceiling takes over');
  equal(shouldRecalculateRoute(spent, wayOff, base.routedAt + ROUTE_REFRESH.ceilingMs),
    { recalculate: true, reason: 'ceiling' },
    'and the ceiling still refreshes it, so the route is stale but never wrong for long');
}

// --- The allowance is spent only by the thing it is for ----------------------
{
  const spentByDeviation = afterRecalculation(base, 'deviation', {
    routedAt: 1, routedFrom: TAHRIR, path: base.path, etaAt: 2,
  });
  equal(spentByDeviation.reroutes, 1, 'a reroute spends the allowance');
  for (const reason of ['ceiling', 'movement', 'eta-stale', 'no-route'] as const) {
    const after = afterRecalculation(base, reason, {
      routedAt: 1, routedFrom: TAHRIR, path: base.path, etaAt: 2,
    });
    equal(after.reroutes, 0, `a ${reason} refresh does not spend the reroute allowance`);
  }
}

// --- The thresholds are the ones the cost model was built on ----------------
// Editing one of these changes the bill. They are asserted so the arithmetic
// above cannot be quietly invalidated by a tuning pass.
equal(ROUTE_REFRESH.ceilingMs, 90_000, 'the ceiling is 90s, which is what 16 calls per journey assumes');
equal(ROUTE_REFRESH.rerouteAllowance, 2, 'and two genuine reroutes are allowed');
ok(ROUTE_REFRESH.floorMs > 0 && ROUTE_REFRESH.floorMs < ROUTE_REFRESH.ceilingMs,
  'A FLOOR EXISTS AND SITS BELOW THE CEILING, so no trigger can bill on every GPS sample');
ok(ROUTE_REFRESH.deviationMeters >= 100,
  'the deviation threshold is generous, because city GPS drift must not bill as a wrong turn');
// The movement trigger must not undercut the ceiling, or it silently becomes
// the thing setting the bill -- which is what the first version of this did.
ok(ROUTE_REFRESH.movementMeters >= 1_000,
  'MOVEMENT DOES NOT UNDERCUT THE CEILING: below ~1.2km it sets the bill instead of the ceiling');

console.log(`Route refresh policy: ${checks} checks passed.`);
