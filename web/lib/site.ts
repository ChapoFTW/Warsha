/**
 * Where the public site lives.
 *
 * `web/middleware.ts` has always known the canonical host, because it redirects
 * `www.` and every non-canonical host to it. Nothing else could read that
 * knowledge — it was a module-local constant — so `robots.ts` and `sitemap.ts`
 * would each have had to restate the domain, which is how three copies of a
 * hostname end up disagreeing after a migration.
 *
 * One export, read by everything that needs to write an absolute URL.
 */
export const CANONICAL_HOST = 'usewarsha.com';
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;
