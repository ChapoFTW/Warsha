/**
 * A customer finds the same professionals whatever language they type in.
 *
 * The taxonomy tests prove a query resolves the right identity. This proves the
 * consequence a customer actually experiences: that typing "plumber" on an
 * Arabic screen reaches the same plumbers as typing سباك, and that neither one
 * reaches them by stepping around the rules that decide who may be shown.
 *
 * ## What is deliberately NOT relaxed
 *
 * Every search below goes through `mockSearch`, which applies the same
 * `passesFilters` the product does — service area, availability, rating,
 * completed jobs, verification, emergency, language. A search test that widened
 * its way past those would prove the feature by breaking the marketplace, so
 * the last section here asserts the filters still bite on a widened query.
 *
 * `mockSearch` is the development path. The Supabase path widens the same query
 * through `widenDiscoveryQuery` and hands it to `search_providers`, whose
 * filtering lives in the database and is not reachable from here — asserted in
 * `scripts/multilingual-search.test.mts` at the query it sends, which is the
 * boundary this side owns.
 */
import assert from 'node:assert/strict';

import { mockSearch } from '../src/discovery/mock-discovery-state.ts';
import { professions } from '../src/providers/profession-taxonomy.ts';
import { providers as mockProviders } from '../src/data/mock-data.ts';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

const LANGUAGES = ['en', 'ar', 'fr'] as const;
const idsFor = (query: string, language: typeof LANGUAGES[number], filters = {}) =>
  mockSearch(query, filters as never, 'recommended', 50, 0, language)
    .results.map((result) => result.id).sort();

// --- The examples, named -----------------------------------------------------
{
  const cases: [string, typeof LANGUAGES[number], string][] = [
    ['plumber', 'ar', 'hossam'],
    ['سباك', 'en', 'hossam'],
    ['plumber', 'fr', 'hossam'],
    ['plombier', 'en', 'hossam'],
    ['كهربائي', 'en', 'karim'],
    ['electrician', 'ar', 'karim'],
    ['نظافة', 'en', 'mariam'],
  ];
  for (const [query, language, expected] of cases) {
    const found = idsFor(query, language);
    ok(found.includes(expected),
      `"${query}" on a ${language} screen finds ${expected} — `
      + `got ${found.join(', ') || 'nobody'}`);
  }
}

// --- Every language reaches the same people ----------------------------------
/*
 * Walked across the taxonomy rather than spot-checked. The failure this guards
 * against is one language's noun quietly reaching a smaller set than another's
 * — which reads to the customer as those professionals not existing.
 */
for (const profession of professions) {
  const populated = mockProviders.some((provider) => provider.profession === profession.key);
  if (!populated) continue;

  for (const uiLanguage of LANGUAGES) {
    const sets = LANGUAGES.flatMap((termLanguage) => [
      idsFor(profession.work[termLanguage], uiLanguage),
      idsFor(profession.person[termLanguage], uiLanguage),
    ]);
    const [first, ...rest] = sets;
    ok(first.length > 0,
      `${profession.key}: somebody is found on a ${uiLanguage} screen at all`);
    for (const other of rest) {
      equal(other, first,
        `${profession.key} on a ${uiLanguage} screen: every language's word for this `
        + 'trade reaches the same professionals');
    }
  }
}

// --- The marketplace rules still decide who is shown -------------------------
/*
 * The point of the feature is reach, and the danger of reach is that it becomes
 * a way around eligibility. So: a widened query, then the same widened query
 * with a filter, and the filter has to bite.
 */
{
  const everyone = idsFor('plumber', 'ar');
  ok(everyone.length > 0, 'the widened query finds somebody to filter');

  const availableOnly = idsFor('plumber', 'ar', { availableNow: true });
  ok(availableOnly.length <= everyone.length,
    'availability still narrows a cross-language search');
  for (const id of availableOnly) {
    const provider = mockProviders.find((entry) => entry.id === id);
    ok(provider?.available,
      `${id} is returned under availableNow and is actually available — a widened `
      + 'query must not become a way past eligibility');
  }

  const verifiedOnly = idsFor('plumber', 'ar', { professionalCertificateVerified: true });
  for (const id of verifiedOnly) {
    const provider = mockProviders.find((entry) => entry.id === id);
    ok(provider?.professionalCertificateVerified,
      `${id} is returned under the verified filter and is actually verified`);
  }

  const rated = idsFor('plumber', 'ar', { minimumRating: 4.85 });
  for (const id of rated) {
    const provider = mockProviders.find((entry) => entry.id === id);
    ok((provider?.rating ?? 0) >= 4.85,
      `${id} clears the minimum rating it was filtered by`);
  }

  // A governorate nobody in the fixture works in returns nobody, however wide
  // the query was made.
  equal(idsFor('plumber', 'ar', { governorate: 'Aswan' }), [],
    'a service-area filter still excludes everyone outside it');
}

// --- A name is not widened ---------------------------------------------------
{
  const byName = idsFor('Hossam', 'en');
  ok(byName.includes('hossam'), 'a professional is still findable by name');
  ok(!byName.includes('karim'),
    'and searching a name does not widen into a trade — "Hossam" is not a plumber query');
}

console.log(`Discovery multilingual: ${checks} checks passed.`);
