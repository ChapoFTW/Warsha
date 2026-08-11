import { notFound } from 'next/navigation';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { pageContent, type PageSlug } from '@/lib/pages-copy';
import { isLocale, type Locale } from '@/lib/preferences';

import styles from './content-page.module.css';

/**
 * One renderer for every public content page.
 *
 * The pages differ in what they say, not in how they are built, so the layout
 * lives here once and each route supplies only a slug. That is also what makes
 * the two languages structurally identical: both render the same block list
 * through the same component, so Arabic cannot quietly lose a section.
 */
export async function ContentPage({
  slug,
  params,
}: {
  slug: PageSlug;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;
  const page = pageContent[typed][slug];

  const cards = page.blocks.filter((block) => block.kind === 'card');
  const flow = page.blocks.filter((block) => block.kind !== 'card');

  return (
    <>
      <SiteHeader locale={typed} />

      <main id="main" className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{page.title}</h1>
          <p className={styles.lead}>{page.lead}</p>
        </header>

        {cards.length ? (
          <div className={styles.cardGrid}>
            {cards.map((block, index) => (
              block.kind === 'card' ? (
                <div key={index} className={styles.card}>
                  <h2 className={styles.cardTitle}>{block.title}</h2>
                  <p className={styles.cardBody}>{block.text}</p>
                </div>
              ) : null
            ))}
          </div>
        ) : null}

        {flow.length ? (
          <div className={styles.prose}>
            {flow.map((block, index) => {
              if (block.kind === 'heading') {
                return <h2 key={index} className={styles.heading}>{block.text}</h2>;
              }
              if (block.kind === 'paragraph') {
                return <p key={index} className={styles.paragraph}>{block.text}</p>;
              }
              if (block.kind === 'list') {
                return (
                  <ul key={index} className={styles.list}>
                    {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
                  </ul>
                );
              }
              return <p key={index} className={styles.note}>{block.text}</p>;
            })}
          </div>
        ) : null}
      </main>

      <SiteFooter locale={typed} />
    </>
  );
}

export function contentMetadata(slug: PageSlug) {
  return async ({ params }: { params: Promise<{ locale: string }> }) => {
    const { locale } = await params;
    if (!isLocale(locale)) return {};
    const page = pageContent[locale][slug];
    return {
      title: page.title,
      description: page.description,
      alternates: {
        canonical: `/${locale}/${slug}`,
        languages: { en: `/en/${slug}`, ar: `/ar/${slug}` },
      },
      openGraph: {
        title: `${page.title} · ${locale === 'ar' ? 'ورشة' : 'Warsha'}`,
        description: page.description,
        url: `/${locale}/${slug}`,
      },
    };
  };
}
