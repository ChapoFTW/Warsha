import type { MetadataRoute } from 'next';

import { CANONICAL_ORIGIN } from '@/lib/site';

/**
 * What a crawler is invited to read.
 *
 * The public site is the only Warsha surface that wants to be indexed. The
 * application and the staff console are separate origins — `app.usewarsha.com`
 * and `admin.usewarsha.com` — and this file is served from the public origin,
 * so it does not speak for them. They carry their own `noindex, nofollow,
 * nocache` in their metadata, which is the control that actually applies to
 * them; a `Disallow` written here would not.
 *
 * `/app` and `/admin` are still listed. On the public host the middleware
 * redirects those paths to the home page rather than serving anything, so the
 * disallow costs a crawler one fewer pointless request and states the intent
 * plainly for anyone reading the file.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/app', '/admin', '/api'],
      },
    ],
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  };
}
