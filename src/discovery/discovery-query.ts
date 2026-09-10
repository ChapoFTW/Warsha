/**
 * Widening a customer's query to every language the trade is known by.
 *
 * This is deliberately NOT in `discovery-types.ts`. That file is import-free on
 * purpose so the filter and sort rules can be executed directly by the Node
 * regression suite without a bundler, and reaching into the profession taxonomy
 * from it would quietly end that. The rules stay executable; the vocabulary
 * lives here.
 *
 * ## What this is for
 *
 * The provider search runs in the database, and since 202608310004 it already
 * matches service and category names in English, Arabic and French. What it
 * cannot know is that "plumber", "سباك" and "plombier" are one trade — that
 * lives in the profession taxonomy, on this side of the wire.
 *
 * So the query is resolved to identities here and widened to their own approved
 * labels. No migration, and no second copy of the vocabulary: Warsha already
 * knows its taxonomy in three languages, so nothing here calls a translator.
 */
import type { Language } from '../i18n/translations.ts';
import { expandProfessionQuery } from '../providers/profession-taxonomy.ts';

import { normalizeDiscoveryQuery } from './discovery-types.ts';

/**
 * The query to send to `search_providers`.
 *
 * Joined with the `OR` that `websearch_to_tsquery` understands, and multi-word
 * terms are quoted so "Pool maintenance" stays one phrase rather than becoming
 * two lexemes that must both appear.
 *
 * The original query stays in the list. A customer may be searching a
 * professional's name, or a service term no profession covers, and widening has
 * to add reach rather than replace it — a query matching no trade is sent
 * exactly as it was typed.
 */
/*
 * `search_providers` does `v_query := left(v_query, 100)`.
 *
 * A hundred characters, counted by the database and not negotiable from here.
 * Widening "plumber" to its six labels is already eighty-odd, and a vaguer
 * query that resolves two trades would run past the cut -- which does not
 * error, it silently truncates mid-phrase and sends a term nobody typed.
 *
 * So the budget is spent deliberately: the query as typed first, because that
 * is what the customer actually asked for, then whole phrases in rank order
 * while they fit. A phrase is never cut in half.
 */
const QUERY_BUDGET = 100;

export function widenDiscoveryQuery(query: string, language: Language): string {
  const base = normalizeDiscoveryQuery(query);
  if (!base) return '';

  /*
   * Two identities, not six.
   *
   * The RPC also uses this text for its spelling-tolerance fallback --
   * `word_similarity(lower(v_query), display_name)` -- which compares the WHOLE
   * string against a professional's name. Every phrase added makes that
   * comparison less like the thing the customer typed, so widening buys reach
   * at the cost of the fallback and should buy only what it needs.
   */
  const terms = expandProfessionQuery(base, language, { limit: 2 });
  if (!terms.length) return base;

  const quoted = (term: string) => `"${term.replace(/"/g, ' ').trim()}"`;
  const phrases: string[] = [quoted(base)];
  let length = phrases[0].length;

  for (const term of terms) {
    const phrase = quoted(term);
    if (phrases.includes(phrase) || phrase.length <= 2) continue;
    const cost = phrase.length + ' OR '.length;
    if (length + cost > QUERY_BUDGET) break;
    phrases.push(phrase);
    length += cost;
  }
  return phrases.join(' OR ');
}
