/**
 * What Warsha exposes for monitoring, and what it refuses to expose.
 *
 * Two endpoints, and the separation between them is the substance rather than
 * a convention:
 *
 *   `/api/health`  — liveness. Touches nothing. An uptime monitor polls it
 *                    forever, so it must cost nothing and must not be able to
 *                    go red because Supabase hiccuped.
 *   `/api/ready`   — readiness. Probes PostgREST and GoTrue, because the web
 *                    serving while the backend is unreachable is a real state
 *                    in which every page renders and every sign-in fails.
 *
 * Getting that backwards is the common mistake and it has two costs: a
 * liveness check that reaches the database turns every monitor into permanent
 * synthetic load, and it hands anybody on the internet an unauthenticated way
 * to spend Warsha's database budget.
 *
 * These endpoints are INSTRUMENTATION. Nothing polls them. This file asserts
 * what the code does; it cannot and does not assert that Warsha is monitored,
 * and `docs/operations/observability.md` says so in the same words.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const match = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value, pattern, message); };
const notMatch = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.doesNotMatch(value, pattern, message); };

/**
 * Comments are stripped for the structural assertions. Both files explain at
 * length what they deliberately do NOT reach — the database, the Edge
 * Functions — and prose describing an absence must not read as the thing being
 * present.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const health = stripComments(read('web/app/api/health/route.ts'));
const ready = stripComments(read('web/app/api/ready/route.ts'));
const middleware = read('web/middleware.ts');

// ---------------------------------------------------------------------------
// 1. Liveness costs nothing
// ---------------------------------------------------------------------------
notMatch(health, /fetch\(|supabase|createClient/i,
  'LIVENESS TOUCHES NO DEPENDENCY, SO A MONITOR CANNOT BECOME LOAD');
match(health, /status: 200/, 'and answers 200 whenever the process is running');
match(health, /no-store/, 'a cached liveness answer is an answer about the past');

// ---------------------------------------------------------------------------
// 2. Readiness probes exactly the two things that matter
// ---------------------------------------------------------------------------
match(ready, /rest\/v1/, 'readiness probes PostgREST');
match(ready, /auth\/v1\/health/, 'and GoTrue');
match(ready, /status === 'ok' \? 200 : 503/,
  'AND ANSWERS 503 WHEN THEY ARE NOT REACHABLE, SO NO MONITOR HAS TO PARSE A BODY');
match(ready, /PROBE_TIMEOUT_MS/, 'each probe is bounded, so readiness cannot hang');
match(ready, /CACHE_MS/,
  'and the result is cached, so an unauthenticated flood is not amplified into the backend');
// Invoking an Edge Function to check it would do the work it exists to do.
notMatch(ready, /functions\/v1|privacy-export|vision-extract|push-dispatch/,
  'NO EDGE FUNCTION IS INVOKED BY A HEALTH CHECK — CHECKING ONE MEANS RUNNING IT');

// ---------------------------------------------------------------------------
// 3. Neither leaks anything
// ---------------------------------------------------------------------------
// Both are unauthenticated. What they return is what anybody returns.
for (const [name, source] of [['health', health], ['ready', ready]] as const) {
  const body = source.slice(source.indexOf('Response.json'));
  notMatch(body, /SUPABASE_URL|PUBLISHABLE_KEY|SERVICE_ROLE/,
    `${name} never returns a configuration value`);
  notMatch(body, /error\.message|response\.statusText|await response\.text/,
    `${name} NEVER RETURNS AN UPSTREAM ERROR OR BODY`);
}
match(ready, /'ok' : 'unreachable'|'ok'\s*:\s*'unreachable'/,
  'a dependency is reachable or it is not; the reason is for Warsha’s logs');
notMatch(ready, /count\(|from public\.|select /i,
  'and readiness reads no data at all, so it can disclose none');

// ---------------------------------------------------------------------------
// 4. One address, whichever host a monitor was pointed at
// ---------------------------------------------------------------------------
// Without the exemption the public host rewrites these into `/en/api/health`
// and the application host into `/app/api/health` — three answers to one
// question, two of them 404.
match(middleware, /pathname === '\/api\/health' \|\| pathname === '\/api\/ready'/,
  'BOTH ENDPOINTS ARE EXEMPT FROM THE LOCALE AND HOST REWRITES');
ok(middleware.indexOf("'/api/health'") < middleware.indexOf("rewriteInto('/app'"),
  'and the exemption runs before the host rewrite, not after it');

// ---------------------------------------------------------------------------
// 5. Instrumentation is not monitoring, and the documentation says so
// ---------------------------------------------------------------------------
// The failure mode this guards against is a readiness review that reads
// "health endpoints: done" and concludes somebody would be told.
ok(existsSync(join(root, 'docs/operations/observability.md')),
  'the observability authority exists');
const observability = read('docs/operations/observability.md');
match(observability, /instrumentation/i, 'it distinguishes instrumentation');
match(observability, /alerting|alert provider|on-call/i, 'from alerting');
match(observability, /\/api\/health/, 'and names the endpoints a provider should be pointed at');
match(observability, /NOT monitored|not monitored|nothing polls/i,
  'AND STATES PLAINLY THAT NOTHING POLLS THEM YET');

// The client error reporter's dangling reference to this file is now real.
const reporter = read('src/observability/client-error-reporter.ts');
match(reporter, /docs\/operations\/observability\.md/,
  'the error reporter points at the observability authority');

console.log(`Operational monitoring: ${checks} checks passed.`);
