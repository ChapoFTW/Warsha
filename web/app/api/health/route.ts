/**
 * Liveness. Is this deployment serving at all?
 *
 * Deliberately the cheapest possible answer: it touches nothing, calls nothing,
 * and cannot be made red by a backend blip. That is the entire point of
 * separating it from `/api/ready`.
 *
 * An uptime monitor polls a liveness endpoint every minute or two, forever. If
 * that endpoint reaches the database, then the monitor becomes a permanent
 * synthetic load on the database, an outage at Supabase pages somebody about
 * the WEB being down, and — worse — anybody on the internet who wants to spend
 * Warsha's database budget has an unauthenticated way to do it. Liveness that
 * checks dependencies is not liveness; it is a readiness check wearing the
 * wrong name and an amplification vector wearing neither.
 *
 * ## What it deliberately does not say
 *
 * No Supabase URL, no variable names, no counts, no versions of anything but
 * Warsha's own build, no upstream error text. Somebody probing this learns that
 * a Next.js application is running, which they already knew because it answered.
 *
 * The commit is included because it is what makes "is the deploy live yet"
 * answerable without a person, and a seven-character prefix of a hash in a
 * private repository is not a secret.
 *
 * ## What having this endpoint does NOT mean
 *
 * It does not mean Warsha is monitored. Nothing polls this. Instrumentation and
 * monitoring are separate things and only the first one is in this repository;
 * see `docs/operations/observability.md`.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'warsha-web',
      checkedAt: new Date().toISOString(),
      commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
    },
    {
      status: 200,
      headers: {
        // A cached liveness answer is a liveness answer about the past.
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}
