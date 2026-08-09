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
    document.documentElement.style.colorScheme = scheme;
    document.documentElement.style.backgroundColor = canvas;
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', canvas);
    var colorScheme = document.querySelector('meta[name="color-scheme"]');
    if (colorScheme) colorScheme.setAttribute('content', scheme);

    var storedLanguage = window.localStorage.getItem(${JSON.stringify(languageStorageKey)});
    var explicitLanguage = window.localStorage.getItem(${JSON.stringify(languageExplicitKey)}) === 'true';
    var preferredLanguage = explicitLanguage && (storedLanguage === 'ar' || storedLanguage === 'en')
      ? storedLanguage
      : ((navigator.languages && navigator.languages[0]) || navigator.language || 'en');
    var language = String(preferredLanguage).toLowerCase().split(/[-_]/)[0] === 'ar' ? 'ar' : 'en';
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
        <script dangerouslySetInnerHTML={{ __html: bootstrapAppearance }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
