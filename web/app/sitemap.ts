import type { MetadataRoute } from 'next';

import { LOCALES } from '@/lib/preferences';
import { CANONICAL_ORIGIN } from '@/lib/site';
import { legalCorpus } from '@/lib/warsha';

/**
 * Every public page, in every language, with its translations declared.
 *
 * The site is served at `/{locale}/...` and each page already emits `hreflang`
 * alternates in its metadata. A sitemap that listed only the English URLs would
 * contradict that, so each entry carries the same `alternates.languages` map:
 * one row per page, naming all three translations, rather than three unrelated
 * rows a crawler has to work out are the same document.
 *
 * The marketing pages are written here because they are a fixed set that only
 * changes when someone adds a route. The legal corpus is not — it is generated
 * from `legalCorpus`, the same list `generateStaticParams` uses to prerender
 * those pages, so a document added to the corpus appears in the sitemap without
 * anyone remembering this file exists.
 *
 * Nothing under `/app` or `/admin` appears. Those are different origins with
 * their own `noindex`, and a signed-in surface has nothing to offer a crawler.
 */

const MARKETING_PATHS = [
  '', // the home page
  '/services',
  '/categories',
  '/how-it-works',
  '/become-a-worker',
  '/trust-and-safety',
  '/help',
  '/contact',
  '/about',
  '/legal',
  '/sign-in',
  '/create-account',
] as const;

/** Roughly how often a crawler should bother, and how much it matters. */
const PRIORITY: Record<string, number> = {
  '': 1.0,
  '/services': 0.9,
  '/categories': 0.9,
  '/how-it-works': 0.8,
  '/become-a-worker': 0.8,
  '/trust-and-safety': 0.7,
  '/legal': 0.5,
};

function entry(path: string, priority: number, changeFrequency: 'weekly' | 'monthly'):
MetadataRoute.Sitemap[number] {
  return {
    url: `${CANONICAL_ORIGIN}/${LOCALES[0]}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
    alternates: {
      languages: Object.fromEntries(
        LOCALES.map((locale) => [locale, `${CANONICAL_ORIGIN}/${locale}${path}`]),
      ),
    },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const marketing = MARKETING_PATHS.map((path) =>
    entry(path, PRIORITY[path] ?? 0.6, path === '' ? 'weekly' : 'monthly'));

  // A legal document changes rarely, and when it does the change matters more
  // than a marketing tweak, so it is listed rather than left to discovery.
  const legal = legalCorpus.map((document) =>
    entry(`/legal/${document.key.replace(/_/g, '-')}`, 0.4, 'monthly'));

  return [...marketing, ...legal];
}
