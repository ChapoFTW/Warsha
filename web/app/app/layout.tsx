import type { Metadata, Viewport } from 'next';

import { SessionProvider } from '@/components/session-provider';
import { StartupGate } from '@/components/startup-gate';

import '../globals.css';

/**
 * The authenticated application shell, served from `app.usewarsha.com`.
 *
 * Nothing here is indexed: these pages are somebody's account, and a search
 * engine that reaches one has been served a page it should never have seen.
 */
export const metadata: Metadata = {
  title: { default: 'Warsha', template: '%s · Warsha' },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#080808' },
    { media: '(prefers-color-scheme: light)', color: '#F4F2EE' },
  ],
  width: 'device-width',
  initialScale: 1,
};

const applyStoredAppearance = `
(function () {
  try {
    var stored = window.localStorage.getItem('warsha:appearance:v1');
    var explicit = window.localStorage.getItem('warsha:appearance-explicit:v1') === 'true';
    if (explicit && (stored === 'light' || stored === 'dark')) {
      document.documentElement.setAttribute('data-theme', stored);
    }
    var lang = window.localStorage.getItem('warsha:language:v1');
    if (lang === 'ar' || lang === 'en' || lang === 'fr') {
      document.documentElement.setAttribute('lang', lang);
      document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    }
  } catch (error) {
    // Storage refused. The CSS default and the server-rendered language stand.
  }
})();
`;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyStoredAppearance }} />
      </head>
      <body>
        <SessionProvider>
          <StartupGate>{children}</StartupGate>
        </SessionProvider>
      </body>
    </html>
  );
}
