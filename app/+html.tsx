import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { darkColors, lightColors } from '@/constants/appearance';
import { appearanceStorageKey } from '@/src/appearance/appearance-types';
import { languageExplicitKey, languageStorageKey } from '@/src/i18n/language-preference';

/**
 * The web document shell.
 *
 * This is a **static** file: it is rendered at export time, so it cannot know
 * the visitor's preference. Without help, the browser would paint the default
 * background and React would then hydrate and repaint — the flash WPS-020
 * forbids, and the one place a React fix cannot reach, because it happens
 * before React exists.
 *
 * The inline script runs synchronously in `<head>` before the first paint and
 * sets the page background from the same key the app writes. It does nothing
 * else: the app takes over on hydration and is the authority from that moment.
 */
const bootstrapAppearance = `
(function () {
  try {
    var stored = window.localStorage.getItem(${JSON.stringify(appearanceStorageKey)});
    var scheme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    var canvas = scheme === 'light' ? ${JSON.stringify(lightColors.canvas)} : ${JSON.stringify(darkColors.canvas)};
    var mark = scheme === 'light' ? ${JSON.stringify(lightColors.brandMark)} : ${JSON.stringify(darkColors.brandMark)};
    document.documentElement.style.colorScheme = scheme;
    document.documentElement.style.backgroundColor = canvas;
    document.documentElement.style.setProperty('--warsha-startup-canvas', canvas);
    document.documentElement.style.setProperty('--warsha-startup-mark', mark);
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', canvas);
    var colorScheme = document.querySelector('meta[name="color-scheme"]');
    if (colorScheme) colorScheme.setAttribute('content', scheme);

    var storedLanguage = window.localStorage.getItem(${JSON.stringify(languageStorageKey)});
    var explicitLanguage = window.localStorage.getItem(${JSON.stringify(languageExplicitKey)}) === 'true';
    var preferredLanguage = explicitLanguage && (storedLanguage === 'ar' || storedLanguage === 'en' || storedLanguage === 'fr')
      ? storedLanguage
      : ((navigator.languages && navigator.languages[0]) || navigator.language || 'en');
    var candidate = String(preferredLanguage).toLowerCase().split(/[-_]/)[0];
    var language = candidate === 'ar' || candidate === 'fr' ? candidate : 'en';
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.title = language === 'ar' ? 'ورشة' : 'Warsha';
    var manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) manifest.setAttribute('href', language === 'ar' ? '/manifest.ar.webmanifest' : '/manifest.webmanifest');
  } catch (error) {
    // A blocked localStorage must never stop the page rendering. The default
    // background stands and the app corrects it on hydration.
  }
})();
`;

// Static rendering cannot know a browser's stored preference. These variables
// are set by the synchronous head script above, and !important intentionally
// overrides only the exported neutral startup surface. Once React hydrates,
// AuthGate paints the same values through the normal appearance provider.
const startupSurfaceStyle = `
:root {
  --warsha-startup-canvas: ${darkColors.canvas};
  --warsha-startup-mark: ${darkColors.brandMark};
}
#warsha-startup-surface {
  background-color: var(--warsha-startup-canvas) !important;
}
#warsha-startup-surface svg rect,
#warsha-startup-surface svg path {
  stroke: var(--warsha-startup-mark) !important;
}
`;

// Runs during body parsing, before first paint, after the statically rendered
// startup node exists. There is no visible loading copy, but its assistive label
// must not announce English on an Arabic cold start before React hydrates.
const localizeStartupAccessibility = `
(function () {
  var language = document.documentElement.lang;
  var label = language === 'ar' ? 'جاري تحميل ورشة' : (language === 'fr' ? 'Chargement de Warsha' : 'Loading Warsha');
  var surface = document.getElementById('warsha-startup-surface');
  if (!surface) return;
  surface.setAttribute('lang', document.documentElement.lang);
  surface.setAttribute('dir', document.documentElement.dir);
  surface.setAttribute('aria-label', label);
  surface.querySelectorAll('[role="progressbar"]').forEach(function (node) {
    node.setAttribute('aria-label', label);
  });
})();
`;

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en" dir="auto">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        {/* Both tags are rewritten by the script below, and again by the app. */}
        <meta name="theme-color" content={darkColors.canvas} />
        <meta name="color-scheme" content="light dark" />
        <meta name="description" content="YOUR WORK, OUR MISSION" />
        <title>Warsha</title>
        <meta property="og:site_name" content="Warsha" />
        <meta property="og:description" content="YOUR WORK, OUR MISSION" />
        <link id="warsha-manifest" rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/warsha-current-approved-192.png" />
        <link rel="apple-touch-icon" href="/warsha-current-approved-192.png" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: startupSurfaceStyle }} />
        <script dangerouslySetInnerHTML={{ __html: bootstrapAppearance }} />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: localizeStartupAccessibility }} />
      </body>
    </html>
  );
}
