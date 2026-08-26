import type { Metadata, Viewport } from 'next';

import { LanguageAccountSync } from '@/components/language-account-sync';
import { SessionProvider } from '@/components/session-provider';
import { StartupGate } from '@/components/startup-gate';
import { directionOf } from '@/lib/preferences';
import { WarshaPreferencesProvider } from '@/lib/preferences-context';
import { serverLocale } from '@/lib/server-locale';

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

/**
 * Appearance still needs a pre-paint script; language does not any more.
 *
 * The two are different problems. The visitor's appearance preference lives
 * only in their browser and cannot be known when the HTML is generated, so it
 * is applied by a synchronous script in `<head>` - before the body exists,
 * therefore before anything is painted.
 *
 * Language *is* knowable on the server now, from the `warsha-locale` cookie,
 * so `lang` and `dir` are baked into the markup and the React tree renders in
 * the right language from the first byte. The script no longer touches them:
 * doing so would move the document out of step with what React had rendered,
 * which is the split-brain state that made a page look half-translated.
 */
const applyStoredAppearance = `
(function () {
  try {
    var stored = window.localStorage.getItem('warsha:appearance:v1');
    var explicit = window.localStorage.getItem('warsha:appearance-explicit:v1') === 'true';
    if (explicit && (stored === 'light' || stored === 'dark')) {
      document.documentElement.setAttribute('data-theme', stored);
      document.documentElement.style.colorScheme = stored;
    }
  } catch (error) {
    // Storage refused. The CSS default stands.
  }
})();
`;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await serverLocale();
  return (
    <html lang={locale} dir={directionOf(locale)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyStoredAppearance }} />
      </head>
      <body>
        <WarshaPreferencesProvider initialLocale={locale}>
          <SessionProvider>
            <LanguageAccountSync />
            <StartupGate>{children}</StartupGate>
          </SessionProvider>
        </WarshaPreferencesProvider>
      </body>
    </html>
  );
}
