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
export function widenDiscoveryQuery(query: string, language: Language): string {
  const base = normalizeDiscoveryQuery(query);
  if (!base) return '';

  const terms = expandProfessionQuery(base, language);
  if (!terms.length) return base;

  const phrases = [base, ...terms]
    // A quote inside a term would end the phrase early and change the query.
    .map((term) => `"${term.replace(/"/g, ' ').trim()}"`)
    .filter((term) => term.length > 2);
  return [...new Set(phrases)].join(' OR ');
}
