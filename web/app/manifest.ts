import type { MetadataRoute } from 'next';

import { darkColors } from '../../constants/appearance.ts';

/**
 * Install metadata for the public site.
 *
 * Deliberately modest. This is a marketing and legal-reading site, so the
 * manifest describes what it is and how it should look if somebody pins it —
 * it does not register a service worker. A worker that caches a marketing page
 * buys nothing a browser's own cache does not already provide, and it buys a
 * new class of bug where somebody reads a legal document that was current last
 * week. The legal corpus is the one thing on this site that must never be
 * served stale, which settles the question.
 *
 * `display: browser` for the same reason: standalone would strip the address
 * bar from a site whose whole job includes showing people exactly which
 * document they are reading, on which domain, before they trust it. When the
 * authenticated app exists at app.usewarsha.com, that surface is where
 * standalone display earns its place.
 *
 * The colours come from the shared appearance tokens rather than being typed
 * again, so an installed tile cannot drift from the application's own canvas.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Warsha — home services in Egypt',
    short_name: 'Warsha',
    description:
      'Warsha connects people who need home repairs and maintenance with skilled '
      + 'professionals. Describe the job, agree a price, and track it to completion.',
    start_url: '/',
    scope: '/',
    display: 'browser',
    // Egypt is the service area, and Arabic is the primary reading language.
    // `lang` names the manifest's own strings; the site itself serves both.
    lang: 'en',
    dir: 'auto',
    background_color: darkColors.canvas,
    theme_color: darkColors.canvas,
    categories: ['business', 'lifestyle', 'utilities'],
    icons: [
      {
        src: '/warsha-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/warsha-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // The adaptive foreground the Android launcher already uses: drawn
        // with the safe-zone padding a maskable icon needs, so a circular or
        // squircle mask cannot crop the mark.
        src: '/warsha-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
