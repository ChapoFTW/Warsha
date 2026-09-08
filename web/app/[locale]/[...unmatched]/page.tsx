import { notFound } from 'next/navigation';

/**
 * Every address under a locale that names no real page.
 *
 * This route exists so that a wrong address is still a Warsha address.
 *
 * Next.js only uses a nested `not-found.tsx` for an explicit `notFound()`
 * call. A URL that matches no route at all is handled at the root of `app/`
 * instead — and Warsha has no root layout, because `[locale]/layout.tsx` is
 * the thing that renders `<html>` with the language and direction on it. So an
 * unmatched Arabic address never reached any Warsha layout, and Next served
 * its own English, direction-less default page.
 *
 * A catch-all segment turns "matched nothing" into "matched this", which puts
 * the locale layout back in the tree. `notFound()` then renders
 * `[locale]/not-found.tsx` inside it, with the right `lang`, the right `dir`,
 * and a real HTTP 404 — a soft 404 that answered 200 would be worse than the
 * bug being fixed, because search engines would index the dead addresses.
 *
 * Next resolves specific segments before a catch-all, so this cannot shadow a
 * real page; it only ever runs when nothing else matched.
 */
export default function UnmatchedLocaleRoute(): never {
  notFound();
}
