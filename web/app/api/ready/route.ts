/**
 * Readiness. Could a signed-in person actually use this deployment?
 *
 * Separate from `/api/health` because the two questions have different answers
 * and different correct responses. The web being up while Supabase is
 * unreachable is a real and common state: every page renders, and every sign-in
 * fails. Liveness says "yes" to that, correctly. Readiness says "no", also
 * correctly, and it is the one worth waking somebody for.
 *
 * ## The two dependencies, and why only these two
 *
 * PostgREST and GoTrue. Between them they are every request the browser client
 * makes that is not a socket, and either being unreachable means the same thing
 * to a person: nothing works.
 *
 * Edge Functions are deliberately NOT probed. Warsha has five, and the only way
 * to check one is to invoke it: `privacy-export` would build somebody's export,
 * `vision-extract` would spend a paid OCR call, `push-dispatch` would drain the
 * delivery queue. A health check that does work is not a health check. Their
 * health is observable where it is already recorded — `private.ocr_requests`,
 * `private.provider_health_samples`, `private.notification_delivery_attempts` —
 * which are facts about real traffic rather than about a synthetic poll.
 *
 * ## Why the result is cached for fifteen seconds
 *
 * This endpoint is unauthenticated, and it makes two outbound requests. Without
 * a cache, anybody on the internet could turn one HTTP request into two against
 * Warsha's backend, indefinitely. The cache is in module scope, so it is per
 * serverless instance rather than global — which is the honest bound, not a
 * perfect one, and still turns a flood into a trickle.
 *
 * Fifteen seconds is short enough that a monitor polling every thirty gets a
 * fresh answer every time, and long enough that a burst costs one probe.
 *
 * ## What it never returns
 *
 * The project URL, the key, any upstream response body, any error text, any
 * status code from upstream. A dependency is `ok` or it is `unreachable`, and
 * the difference between "DNS failed" and "500 from PostgREST" is a thing for
 * Warsha's logs, not for an anonymous caller.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Long enough to answer, short enough that a monitor is not left hanging. */
const PROBE_TIMEOUT_MS = 5_000;
const CACHE_MS = 15_000;

type Dependency = 'ok' | 'unreachable';
type Snapshot = {
  status: 'ok' | 'degraded';
  database: Dependency;
  auth: Dependency;
  checkedAt: string;
};

let cached: { at: number; snapshot: Snapshot } | null = null;

async function reachable(url: string, key: string): Promise<Dependency> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { apikey: key },
      signal: controller.signal,
      cache: 'no-store',
    });
    // A 401 is a reachable service refusing an unauthenticated caller, which is
    // exactly what these roots do and exactly what "reachable" means here.
    // Anything in the 5xx range is the service failing rather than refusing.
    return response.status < 500 ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

async function probe(): Promise<Snapshot> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // Not configured is not the same as down, but it is not ready either, and
    // saying which variable is missing to an anonymous caller would be a
    // configuration disclosure.
    return { status: 'degraded', database: 'unreachable', auth: 'unreachable', checkedAt: new Date().toISOString() };
  }

  const [database, auth] = await Promise.all([
    reachable(`${url}/rest/v1/`, key),
    reachable(`${url}/auth/v1/health`, key),
  ]);

  return {
    status: database === 'ok' && auth === 'ok' ? 'ok' : 'degraded',
    database,
    auth,
    checkedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const now = Date.now();
  if (!cached || now - cached.at > CACHE_MS) {
    cached = { at: now, snapshot: await probe() };
  }
  const { snapshot } = cached;

  return Response.json(
    { service: 'warsha-web', ...snapshot },
    {
      // 503 rather than 200-with-a-field: a monitor should not have to parse a
      // body to know something is wrong, and every uptime tool understands a
      // status code.
      status: snapshot.status === 'ok' ? 200 : 503,
      headers: { 'cache-control': 'no-store, max-age=0' },
    },
  );
}
