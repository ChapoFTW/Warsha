import type { Metadata, Viewport } from 'next';

import './globals.css';

/**
 * Theme is resolved before first paint, in the document head.
 *
 * The mobile client learned this the hard way: a theme applied after
 * hydration shows a light flash to somebody who chose dark, and a route
 * decided after paint shows a screen that is about to be replaced. The web
 * has the same failure and the same fix — decide before anything is drawn.
 */
const bootstrapTheme = `
(function () {
  try {
    var stored = window.localStorage.getItem('warsha.theme');
    var lang = window.localStorage.getItem('warsha.language');
    var root = document.documentElement;
    if (stored === 'light' || stored === 'dark') root.setAttribute('data-theme', stored);
    if (lang === 'ar' || lang === 'en') {
      root.setAttribute('lang', lang);
      root.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    }
  } catch (error) {
    // A browser refusing storage is not a reason to fail to render.
  }
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL('https://usewarsha.com'),
  title: {
    default: 'Warsha — home services in Egypt',
    template: '%s · Warsha',
  },
  description:
    'Warsha connects people who need home repairs and maintenance with skilled '
    + 'professionals. Describe the job, agree a price, and track it to completion.',
  applicationName: 'Warsha',
  openGraph: {
    type: 'website',
    siteName: 'Warsha',
    locale: 'en_EG',
    alternateLocale: 'ar_EG',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0f1115' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootstrapTheme }} />
      </head>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
