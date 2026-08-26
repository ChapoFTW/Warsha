import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';

import { copy } from '@/lib/copy';
import { directionOf, isLocale, LOCALES, type Locale } from '@/lib/preferences';
import { WarshaPreferencesProvider } from '@/lib/preferences-context';

import '../globals.css';

/**
 * Appearance is applied before first paint; language is applied by the server.
 *
 * These are different problems with different right answers. The language of a
 * page is knowable when the HTML is generated, so `lang` and `dir` are baked
 * into the markup and an Arabic reader never sees a frame of English. The
 * appearance preference lives in the visitor's browser and cannot be known at
 * build time, so it is read by a synchronous script in `<head>` — before the
 * body exists, therefore before anything is painted.
 *
 * Reading it in an effect instead would paint dark, then correct to light, on
 * every single visit. That flash is exactly what WPS-020 forbids on mobile.
 */
const applyStoredAppearance = `
(function () {
  try {
    var stored = window.localStorage.getItem('warsha:appearance:v1');
    var explicit = window.localStorage.getItem('warsha:appearance-explicit:v1') === 'true';
    if (explicit && (stored === 'light' || stored === 'dark')) {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (error) {
    // No stored preference resolves to the device scheme via CSS, which is
    // the documented default and needs no script at all.
  }
})();
`;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const words = copy[locale];
  const siteTitle: Record<Locale, string> = {
    en: 'Warsha — home services in Egypt',
    ar: 'ورشة — خدمات المنزل في مصر',
    fr: 'Warsha — services à domicile en Égypte',
  };
  const openGraphLocale: Record<Locale, string> = {
    en: 'en_EG',
    ar: 'ar_EG',
    fr: 'fr_EG',
  };
  const alternateOpenGraphLocales = LOCALES
    .filter((option) => option !== locale)
    .map((option) => openGraphLocale[option]);

  return {
    metadataBase: new URL('https://usewarsha.com'),
    title: {
      default: siteTitle[locale],
      template: `%s · ${words.brand}`,
    },
    description: words.heroBody,
    applicationName: words.brand,
    // Every supported language is a real generated route, so these alternates point at
    // pages that exist. An hreflang naming a 404 is worse than none.
    alternates: {
      canonical: `/${locale}`,
      languages: { en: '/en', ar: '/ar', fr: '/fr' },
    },
    openGraph: {
      type: 'website',
      siteName: words.brand,
      locale: openGraphLocale[locale],
      alternateLocale: alternateOpenGraphLocales,
      title: siteTitle[locale],
      description: words.heroBody,
      url: `/${locale}`,
      images: [{
        url: '/warsha-og.png',
        width: 512,
        height: 512,
        alt: words.brand,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      images: ['/warsha-og.png'],
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#080808' },
    { media: '(prefers-color-scheme: light)', color: '#F4F2EE' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;

  return (
    <html lang={typed} dir={directionOf(typed)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyStoredAppearance }} />
      </head>
      <body>
        {/* `localeIsRouted`: on the public site the address *is* the language.
            The middleware has already sent anybody with an explicit preference
            to their own locale, so route and preference agree by the time this
            renders - and the switch here navigates rather than re-rendering,
            because a real URL is what makes an Arabic page shareable. The
            provider is still present so appearance, and the preference writes
            the language control performs, go through the one store. */}
        <WarshaPreferencesProvider initialLocale={typed} localeIsRouted>
          <a className="skip-link" href="#main">{copy[typed].skipToContent}</a>
          {children}
        </WarshaPreferencesProvider>
      </body>
    </html>
  );
}
