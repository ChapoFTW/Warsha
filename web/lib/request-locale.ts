import { cache } from 'react';

import type { Locale } from './preferences.ts';

/**
 * The locale of the request being rendered, for the one component that cannot
 * be told it any other way.
 *
 * A not-found boundary is given no route params. `[locale]/not-found.tsx`
 * therefore read the locale from a request header the middleware sets — which
 * worked, and cost more than anyone noticed: a dynamic API anywhere in a route's
 * render tree opts that whole route out of static generation, and a not-found
 * boundary is in every route's tree. All 114 public pages silently stopped being
 * prerendered on 2026-09-08 and started being server-rendered per request. The
 * build emitted six static routes where it had emitted a hundred and twenty, and
 * `test:web-build-output` has been failing on it since.
 *
 * `cache()` is not a dynamic API. It gives one object per request, so the layout
 * — which does have the locale, and runs before anything beneath it — can leave
 * it where the boundary will find it, and the pages above stay static.
 *
 * Deliberately narrow: this is a handoff between two components in one request,
 * not a general store. Anything that can take the locale as a prop or a param
 * must do that instead. There is exactly one component in Warsha that cannot.
 */
const slot = cache((): { locale: Locale | null } => ({ locale: null }));

/** Called by `[locale]/layout.tsx`, which is in the tree for every locale route. */
export function rememberRequestLocale(locale: Locale): void {
  slot().locale = locale;
}

/**
 * The remembered locale, or null when there is none to remember — an address
 * with no valid locale in it, or a render outside a locale layout. The caller
 * decides what to do about that; a 404 is already a failure and failing to
 * render one is worse than rendering it in the wrong language.
 */
export function requestLocale(): Locale | null {
  return slot().locale;
}
