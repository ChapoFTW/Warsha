import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { WarshaIcon } from '@/components/warsha-icon';
import { serviceCategoryDescription, serviceCategoryLabel } from '@/src/i18n/service-labels.ts';
import {
  SERVICE_DEMAND_ORDER,
  serviceCategoryDescriptionKey,
  serviceCategoryTranslationKey,
} from '@/src/services/service-catalogue.ts';
import { copy } from '@/lib/copy';
import { pageContent } from '@/lib/pages-copy';
import { isLocale, type Locale } from '@/lib/preferences';
import { categoryIconName } from '@/src/brand/warsha-icons.ts';
import { appHref } from '@/lib/routes';

import styles from './page.module.css';

function categoriesFor(locale: Locale) {
  return SERVICE_DEMAND_ORDER.map((id) => ({
    id,
    label: serviceCategoryLabel(serviceCategoryTranslationKey(id), locale, id),
    description: serviceCategoryDescription(serviceCategoryDescriptionKey(id), locale),
    href: appHref(`/requests/new?category=${encodeURIComponent(id)}`),
  }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const page = pageContent[locale].services;
  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: `/${locale}/services`,
      languages: { en: '/en/services', ar: '/ar/services', fr: '/fr/services' },
    },
    openGraph: {
      title: `${page.title} · ${copy[locale].brand}`,
      description: page.description,
      url: `/${locale}/services`,
    },
  };
}

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;
  const words = copy[typed];
  const page = pageContent[typed].services;
  const categories = categoriesFor(typed);
  const note = page.blocks.find(block => block.kind === 'note');

  return (
    <>
      <SiteHeader locale={typed} />

      <main id="main" className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{page.title}</h1>
          <p className={styles.lead}>{page.lead}</p>
        </header>

        <section className={styles.catalogue} aria-label={page.title}>
          {categories.map((category) => (
            <a
              key={category.id}
              href={category.href}
              className={styles.card}
              aria-label={`${words.servicesCardAction}: ${category.label}`}
              data-category-id={category.id}
            >
              {/* Decorative: the localized category name is the next element,
                  and announcing it twice helps nobody. */}
              <span className={styles.cardIcon}>
                <WarshaIcon name={categoryIconName(category.id)} size="lg" />
              </span>
              <span className={styles.cardCopy}>
                <span className={styles.cardTitle}>{category.label}</span>
                {category.description ? (
                  <span className={styles.cardBody}>{category.description}</span>
                ) : null}
              </span>
              <span className={styles.cardAction}>{words.servicesCardAction}</span>
            </a>
          ))}
        </section>

        <section className={styles.cta} aria-labelledby="services-help-title">
          <div>
            <h2 id="services-help-title" className={styles.ctaTitle}>{words.servicesCtaTitle}</h2>
            <p className={styles.ctaBody}>{words.servicesCtaBody}</p>
          </div>
          <a href={appHref('/requests/new')} className={styles.ctaAction}>
            {words.servicesCtaAction}
          </a>
        </section>

        {note?.kind === 'note' ? <p className={styles.note}>{note.text}</p> : null}
      </main>

      <SiteFooter locale={typed} />
    </>
  );
}
