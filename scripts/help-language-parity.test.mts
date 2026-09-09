/**
 * Arabic must not silently lag English.
 *
 * This exists because it did. Two help articles were updated to describe the
 * new role marks, and a third to describe how currency is chosen — in English
 * and French only. The Arabic articles were right there in the same file and
 * were missed, because the update code looked up an article by id and took the
 * first match, which is the English one.
 *
 * Nothing caught it. The help gate validates structure and indexes, and the
 * corpus already carries per-locale version drift on 15 of its 16 articles, so
 * version numbers cannot be the signal either. The only reliable check is
 * whether the MEANING actually landed in every language.
 *
 * So each entry below names a product fact and how it reads in each language.
 * Adding a fact to one locale and not the others fails here.
 *
 * This is deliberately a short list of things Warsha has decided, not an
 * attempt to diff whole articles. Translations legitimately differ in wording,
 * length and structure; what they must not differ in is what they tell somebody
 * is true.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };

type Article = { id: string; locale: string; body: string; version: number };

const primary = JSON.parse(readFileSync('docs/help/articles.json', 'utf8'));
const french = JSON.parse(readFileSync('docs/help/articles.fr.json', 'utf8'));
const articles: Article[] = [
  ...(Array.isArray(primary) ? primary : primary.articles),
  ...(Array.isArray(french) ? french : french.articles),
];

const LOCALES = ['en', 'ar', 'fr'] as const;

/** A product fact, and the shape it takes in each language. */
const FACTS: { article: string; fact: string; says: Record<typeof LOCALES[number], RegExp> }[] = [
  {
    article: 'worker-getting-started',
    fact: 'the Professional card carries a person mark and the Customer card a house',
    says: {
      en: /marked with a person/i,
      ar: /علامة شخص/,
      fr: /silhouette de personne/i,
    },
  },
  {
    article: 'customer-account-security',
    fact: 'the Customer card carries a house mark',
    says: {
      en: /marked with a house/i,
      ar: /علامة بيت/,
      fr: /porte une maison/i,
    },
  },
  {
    article: 'admin-audit-analytics',
    fact: 'currency follows the service country, never the reading language',
    says: {
      en: /service country/i,
      ar: /بلد الخدمة/,
      fr: /pays de service/i,
    },
  },
];

for (const { article: id, fact, says } of FACTS) {
  for (const locale of LOCALES) {
    const article = articles.find((entry) => entry.id === id && entry.locale === locale);
    ok(article, `${id} exists in ${locale}`);
    ok(says[locale].test(article!.body),
      `${locale.toUpperCase()} — ${id} says that ${fact}`);
  }
}

// Every article that exists at all must exist in all three languages. Arabic is
// a hard product language; an article that is English-only is a gap, not a
// translation backlog item to notice later.
const ids = [...new Set(articles.map((entry) => entry.id))];
for (const id of ids) {
  const present = LOCALES.filter((locale) =>
    articles.some((entry) => entry.id === id && entry.locale === locale));
  ok(present.length === LOCALES.length,
    `${id} EXISTS IN EVERY SUPPORTED LANGUAGE (has ${present.join(', ')})`);
}

// And no article is an empty shell in one language while carrying content in
// another — a stub passes a "does it exist" check and helps nobody.
for (const id of ids) {
  const lengths = LOCALES.map((locale) =>
    articles.find((entry) => entry.id === id && entry.locale === locale)?.body.length ?? 0);
  const shortest = Math.min(...lengths);
  const longest = Math.max(...lengths);
  ok(shortest > longest * 0.25,
    `${id} is not a stub in one language and an article in another `
    + `(${lengths.join(' / ')} characters)`);
}

console.log(`Help language parity: ${checks} checks passed across ${ids.length} articles.`);
