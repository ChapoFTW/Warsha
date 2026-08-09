export const PUBLIC_ROUTES = [
  '/welcome',
  '/sign-in',
  '/create-account',
  '/reset-password',
  '/legal',
] as const;
export const publicAuthRoutePrefixes = PUBLIC_ROUTES;

function canonicalPathname(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] || '/';
  const segments = withoutQuery
    .split('/')
    .filter(Boolean)
    // Expo route groups do not normally appear in usePathname(), but ignoring
    // them makes classification safe if a route is grouped later.
    .filter(segment => !/^\(.+\)$/.test(segment));
  return segments.length ? `/${segments.join('/')}` : '/';
}

export function isPublicAuthRoute(
  pathname: string,
  routes: readonly string[] = PUBLIC_ROUTES,
): boolean {
  const canonical = canonicalPathname(pathname);
  return routes.some(route =>
    canonical === route || canonical.startsWith(`${route}/`));
}

/** Null means the signed-out visitor remains on the requested public route. */
export function signedOutRedirect(pathname: string): '/welcome' | null {
  return isPublicAuthRoute(pathname) ? null : '/welcome';
}
