/**
 * Search understands every Warsha language at once. Display still follows one.
 *
 * An Egyptian professional with an English keyboard active types "plumber" into
 * an Arabic screen. A French-speaking customer types "plombier" into an English
 * one. Someone who knows the trade only by its English name types "electrician"
 * while the app is in Arabic. Before this, all three found nothing, because
 * search compared the query against the labels of the CURRENT language only —
 * which quietly told the user that Warsha does not offer the trade.
 *
 * That is the wrong answer to give anybody, and in Egypt it is the wrong answer
 * given most often to the people least able to work around it: switching
 * keyboards mid-task is exactly the friction the low-literacy gate exists to
 * remove.
 *
 * So the rule is a separation:
 *
 *   the query is matched against EVERY label the taxonomy holds
 *   the result is displayed with the label for the current language and audience
 *
 * Typing "plumber" into an Arabic professional screen matches the plumbing
 * identity and renders سباكة. The same query on an Arabic customer screen
 * matches the same identity and renders سباك. The English never appears; it was
 * only ever the way in.
 *
 * ## No translation happens here
 *
 * Warsha already knows its taxonomy in all three languages, so matching is a
 * lookup over strings it owns: deterministic, offline, free, and testable
 * against the whole taxonomy rather than against six examples. Nothing calls
 * out to a translator, at query time or ever.
 *
 * ## Aliases are not a second vocabulary
 *
 * The searchable terms for an identity are its own approved labels — the work
 * noun and the practitioner noun, in each language. There is no separate alias
 * list to drift out of step with the taxonomy, and none of these terms is ever
 * shown; they are how the query gets in, not what comes out.
 */
import type { Language } from '../i18n/translations.ts';

/** Every language a Warsha term can be written in. */
export const SEARCH_LANGUAGES = ['en', 'ar', 'fr'] as const;

/*
 * Combining marks, after NFD has separated them from their base letters. This
 * is what makes "electricite" find "Électricité" — a French speaker without an
 * accented keyboard, or in a hurry, should not be a different user.
 */
const COMBINING = /[̀-ͯ]/g;

/*
 * Arabic marks that carry no lexical weight in a search box.
 *
 *   ً-ٟ  the harakat — fatha, damma, kasra, shadda, sukun and friends
 *   ٰ         superscript alef
 *   ـ         tatweel, the kashida used to stretch a word for typesetting
 *
 * A professional typing سَبَّاكَة with full diacritics and one typing سباكة mean
 * the same thing, and the second is what the taxonomy stores.
 */
const ARABIC_MARKS = /[ً-ٰٟـ]/g;

/*
 * Letter forms that vary in ordinary Egyptian typing without changing the word.
 *
 *   أ إ آ ٱ → ا   hamza on the alef is routinely dropped
 *   ى → ي        alef maqsura and yaa are typed interchangeably
 *   ة → ه        ta marbuta written as haa — سباكه for سباكة
 *
 * This is deliberately short. Letters are NOT folded merely because they look
 * alike: ح ج خ share a shape and are three different letters, and folding them
 * would make search return trades that have nothing to do with the query. Each
 * substitution here is a spelling variant of the SAME word, and
 * `scripts/multilingual-search.test.mts` checks the whole taxonomy for two
 * identities colliding under them.
 */
const ARABIC_FORMS: [RegExp, string][] = [
  [/[أإآٱ]/g, 'ا'],
  [/ى/g, 'ي'],
  [/ة/g, 'ه'],
];

/**
 * The form a term is compared in. Same function for the query and the labels,
 * because a normalization applied to only one side is a bug waiting to happen.
 */
export function normalizeSearchText(value: string): string {
  let text = value.normalize('NFKC').toLowerCase();
  text = text.normalize('NFD').replace(COMBINING, '').normalize('NFC');
  text = text.replace(ARABIC_MARKS, '');
  for (const [pattern, replacement] of ARABIC_FORMS) text = text.replace(pattern, replacement);
  // A hyphen is a space someone typed differently: "smart-home" and "smart home".
  text = text.replace(/[-‐-―_]+/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

/** One searchable term, remembering which language it came from. */
export type SearchTerm = { text: string; language: Language };

/** An entity reduced to what search needs: an identity and the words for it. */
export type Searchable<T> = { entity: T; terms: SearchTerm[] };

/**
 * How well a query matches a term, and why.
 *
 * Ranked rather than boolean because a customer typing "clean" should see
 * Cleaning before a trade that merely contains the letters somewhere.
 */
const EXACT = 100;
const PREFIX = 60;
const WORD_START = 40;
const CONTAINS = 20;

/*
 * One character can only sensibly start a word. Two can look inside one.
 * Without this, "a" matches nearly every French label and the result is noise
 * that reads as the search being broken.
 */
const MIN_LENGTH_FOR_CONTAINS = 2;

function scoreTerm(query: string, term: string): number {
  if (!term) return 0;
  if (term === query) return EXACT;
  if (term.startsWith(query)) return PREFIX;
  if (query.length < MIN_LENGTH_FOR_CONTAINS) return 0;
  // A match at the start of any word inside the term — "home" in
  // "smart home installation" — is worth more than one buried mid-word.
  if (term.split(' ').some((word) => word.startsWith(query))) return WORD_START;
  return term.includes(query) ? CONTAINS : 0;
}

/**
 * Score one entity against a query, across every language it is written in.
 *
 * The current language is a tie-break and never a filter. Two identities that
 * match equally well are ordered with the one matched through the reader's own
 * language first, which keeps the common case feeling native without ever
 * hiding the match that came in through another.
 */
export function scoreSearchable<T>(
  query: string,
  searchable: Searchable<T>,
  language: Language,
): number {
  const normalized = normalizeSearchText(query);
  if (!normalized) return 0;

  let best = 0;
  for (const term of searchable.terms) {
    const score = scoreTerm(normalized, normalizeSearchText(term.text));
    if (!score) continue;
    const preferred = score + (term.language === language ? 1 : 0);
    if (preferred > best) best = preferred;
  }
  return best;
}

/**
 * Filter and rank a set of entities by a query.
 *
 * An empty query returns everything, unranked and in the order it arrived —
 * browsing is not searching, and the caller's own ordering (demand rank, for
 * the taxonomy) is the right one when nobody has typed anything.
 */
export function searchRanked<T>(
  query: string,
  searchables: Searchable<T>[],
  language: Language,
): T[] {
  if (!normalizeSearchText(query)) return searchables.map((item) => item.entity);

  return searchables
    .map((item, index) => ({ item, index, score: scoreSearchable(query, item, language) }))
    .filter((row) => row.score > 0)
    // Equal scores keep the caller's order, which is how demand ranking
    // survives a search instead of being replaced by alphabetical accident.
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((row) => row.item.entity);
}

/**
 * Every distinct term for a set of entities, for handing to a search that lives
 * somewhere else.
 *
 * The provider search runs in the database, which already matches service and
 * category names in all three languages. What it cannot do is know that
 * "plumber" and "سباك" are the same trade — that lives in this taxonomy. So the
 * client resolves the query to identities here and widens it to their terms,
 * and the query that crosses the wire carries every language's word for what
 * was asked. No migration, and no second copy of the vocabulary.
 */
export function expandQueryTerms<T>(
  query: string,
  searchables: Searchable<T>[],
  language: Language,
  { limit = 6 }: { limit?: number } = {},
): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];

  const matched = searchables
    .map((item) => ({ item, score: scoreSearchable(query, item, language) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  const terms = new Set<string>();
  for (const row of matched) for (const term of row.item.terms) terms.add(term.text);
  return [...terms];
}
