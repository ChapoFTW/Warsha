/**
 * Every word for a trade finds that trade, whatever language the screen is in.
 *
 * The app language decides what a result LOOKS like. It must not decide what
 * search can understand. An Egyptian professional with an English keyboard
 * active types "plumber" into an Arabic screen; a French-speaking customer
 * types "plombier" into an English one. Before this, both found nothing — which
 * does not read as "search is language-limited", it reads as Warsha not
 * offering the trade.
 *
 * So this walks the WHOLE taxonomy rather than the handful of examples that get
 * quoted when the feature is described. Six terms per identity, three
 * languages, both audiences, every one of them expected to arrive at the same
 * canonical key. A taxonomy entry with a missing French practitioner noun is
 * invisible until a French speaker types it.
 */
import assert from 'node:assert/strict';

import {
  listProfessions,
  professionLabel,
  professionSearchTerms,
  professions,
  expandProfessionQuery,
} from '../src/providers/profession-taxonomy.ts';
import { normalizeSearchText, scoreSearchable } from '../src/search/multilingual-search.ts';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

const LANGUAGES = ['en', 'ar', 'fr'] as const;

// --- The complete matrix: six terms, three screens, one identity -------------
for (const profession of professions) {
  const terms = professionSearchTerms(profession);
  equal(terms.length, 6, `${profession.key}: six searchable terms — a work and a person noun in each language`);

  for (const term of terms) {
    for (const uiLanguage of LANGUAGES) {
      const found = listProfessions(uiLanguage, term.text);
      ok(found.some((item) => item.key === profession.key),
        `${profession.key}: "${term.text}" (${term.language}) finds it on a ${uiLanguage} screen`);
    }
  }
}

// --- What matched does not change what is shown ------------------------------
/*
 * The failure this guards against is the result rendering in the language of
 * the query. Typing "plumber" into an Arabic screen must produce سباكة, not
 * Plumbing — the English was the way in, not the answer.
 */
for (const uiLanguage of LANGUAGES) {
  for (const profession of professions) {
    for (const term of professionSearchTerms(profession)) {
      const [first] = listProfessions(uiLanguage, term.text)
        .filter((item) => item.key === profession.key);
      if (!first) continue;
      equal(professionLabel(first.key, uiLanguage, 'professional'), profession.work[uiLanguage],
        `${profession.key}: matched by "${term.text}" but a professional still reads `
        + `the ${uiLanguage} work label`);
      equal(professionLabel(first.key, uiLanguage, 'customer'), profession.person[uiLanguage],
        `${profession.key}: matched by "${term.text}" but a customer still reads `
        + `the ${uiLanguage} person noun`);
    }
  }
}

// --- The examples, named, so a regression says which one broke ---------------
{
  const cases: [string, typeof LANGUAGES[number], string][] = [
    ['plumber', 'ar', 'plumbing'],
    ['electrician', 'ar', 'electrical'],
    ['سباك', 'en', 'plumbing'],
    ['كهربائي', 'en', 'electrical'],
    ['plumber', 'fr', 'plumbing'],
    ['plombier', 'en', 'plumbing'],
    ['plomberie', 'ar', 'plumbing'],
    ['nettoyage', 'ar', 'cleaning'],
    ['cleaner', 'ar', 'cleaning'],
  ];
  for (const [query, uiLanguage, key] of cases) {
    const found = listProfessions(uiLanguage, query);
    ok(found.some((item) => item.key === key),
      `"${query}" on a ${uiLanguage} screen resolves ${key}`);
    equal(found[0]?.key, key,
      `"${query}" on a ${uiLanguage} screen ranks ${key} first, rather than merely including it`);
  }
}

// --- Partial input ------------------------------------------------------------
{
  const cases: [string, string][] = [
    ['plumb', 'plumbing'],
    ['كهرب', 'electrical'],
    ['plomb', 'plumbing'],
    ['electric', 'electrical'],
    ['نظاف', 'cleaning'],
  ];
  for (const [query, key] of cases) {
    ok(listProfessions('en', query).some((item) => item.key === key),
      `partial "${query}" finds ${key}`);
  }
}

// --- Normalization, and the limits of it -------------------------------------
{
  equal(normalizeSearchText('  Électricité  '), 'electricite',
    'accents fold and whitespace collapses, so a French speaker without an accented keyboard is not a different user');
  equal(normalizeSearchText('Smart-Home'), 'smart home', 'a hyphen is a space someone typed differently');
  equal(normalizeSearchText('سَبَّاكَة'), 'سباكه', 'harakat come off');
  equal(normalizeSearchText('ســباكة'), 'سباكه', 'tatweel comes off');
  equal(normalizeSearchText('إسكندرية'), 'اسكندريه', 'hamza on the alef folds');

  ok(listProfessions('en', 'سباكه').some((item) => item.key === 'plumbing'),
    'سباكه with a haa finds سباكة — the spelling people actually type');
  ok(listProfessions('en', 'electricite').some((item) => item.key === 'electrical'),
    'électricité without its accents still finds the trade');
}

// --- Folding must not merge two different trades ------------------------------
/*
 * The danger of Arabic normalization is folding letters that merely look alike.
 * ح ج خ share a shape and are three different letters. This checks the actual
 * consequence rather than the rule: no two professions may end up sharing a
 * normalized term, because that is the point at which a query stops being able
 * to tell them apart.
 */
{
  const owners = new Map<string, string[]>();
  for (const profession of professions) {
    for (const term of professionSearchTerms(profession)) {
      const normalized = normalizeSearchText(term.text);
      const seen = owners.get(normalized) ?? [];
      if (!seen.includes(profession.key)) seen.push(profession.key);
      owners.set(normalized, seen);
    }
  }
  /*
   * One collision is deliberate, and it is an improvement rather than damage.
   *
   * بناء is Construction's work noun. بنّاء is Mason's person noun. They differ
   * by a single shadda, which nobody types into a search box, so stripping
   * harakat merges them — and somebody searching بناء wants building work, of
   * which both of these are. Mason stays separately reachable through its own
   * work noun مباني.
   *
   * Listed rather than excused by a looser rule: a new collision is a question
   * about whether two trades have stopped being distinguishable, and it should
   * arrive as a failure that somebody answers.
   */
  const ACCEPTED_COLLISIONS: Record<string, string[]> = {
    'بناء': ['constructionWorker', 'mason'],
  };

  for (const [normalized, keys] of owners) {
    if (keys.length === 1) continue;
    equal(keys.sort(), (ACCEPTED_COLLISIONS[normalized] ?? []).sort(),
      `"${normalized}" normalizes to the same text for ${keys.join(' and ')} — `
      + 'either the fold is merging two unrelated trades, or this is a deliberate '
      + 'merge that belongs in ACCEPTED_COLLISIONS with the reason written down');
  }
}

// --- Short and empty input ----------------------------------------------------
{
  equal(listProfessions('en', '').length, professions.length,
    'an empty query browses the whole list rather than searching it');
  equal(listProfessions('en', '   ').length, professions.length,
    'and so does whitespace');

  // One character can start a word but not be looked for inside one, or nearly
  // every French label matches and the result reads as search being broken.
  const single = listProfessions('en', 'a');
  ok(single.length < professions.length,
    'a single character does not match everything');
  ok(single.every((item) => professionSearchTerms(item)
    .some((term) => normalizeSearchText(term.text).split(' ').some((word) => word.startsWith('a')))),
    'every single-character match starts a word, rather than being buried inside one');
}

// --- Ranking prefers the reader's language without ever excluding others ------
{
  /*
   * The tie-break must not become a filter. An Arabic screen searching an
   * English word has to return the trade — that is the whole feature — so this
   * asserts the match survives, not merely that ordering is pleasant.
   */
  for (const profession of professions) {
    for (const uiLanguage of LANGUAGES) {
      const foreign = professionSearchTerms(profession)
        .filter((term) => term.language !== uiLanguage);
      for (const term of foreign) {
        ok(listProfessions(uiLanguage, term.text).some((item) => item.key === profession.key),
          `${profession.key}: a ${term.language} term still resolves on a ${uiLanguage} screen`);
      }
    }
  }

  // An exact match outranks a partial one, whichever language each came in by.
  const exact = scoreSearchable('Plumbing', {
    entity: null,
    terms: [{ text: 'Plumbing', language: 'en' }],
  }, 'en');
  const partial = scoreSearchable('Plumb', {
    entity: null,
    terms: [{ text: 'Plumbing', language: 'en' }],
  }, 'en');
  ok(exact > partial, 'an exact match scores above a prefix match');
}

// --- Widening a query for a search that runs elsewhere ------------------------
/*
 * The provider search runs in the database and already matches service and
 * category names in all three languages. What it cannot know is that "plumber"
 * and "سباك" are one trade — that lives in the taxonomy. So the client widens
 * the query to the identity's own terms before sending it.
 */
{
  const widened = expandProfessionQuery('plumber', 'ar');
  ok(widened.includes('سباكة'), 'widening "plumber" carries the Arabic work noun to the backend');
  ok(widened.includes('سباك'), 'and the Arabic person noun');
  ok(widened.includes('Plomberie'), 'and the French one');
  equal(expandProfessionQuery('', 'en'), [],
    'an empty query widens to nothing rather than to the entire taxonomy');

  const nonsense = expandProfessionQuery('zzzzqqq', 'en');
  equal(nonsense, [], 'a query matching nothing widens to nothing');
}

// --- The widened query fits the budget the database enforces ----------------
/*
 * `search_providers` does `v_query := left(v_query, 100)`. A hundred
 * characters, counted server-side, and truncation is silent: it does not error,
 * it cuts mid-phrase and sends a term nobody typed.
 *
 * Walked across every profession and every one of its six labels rather than
 * spot-checked, because the query that runs over is the one nobody thought to
 * try — a vague word matching two long trades in the language with the longest
 * words.
 */
{
  const { widenDiscoveryQuery } = await import('../src/discovery/discovery-query.ts');
  const BUDGET = 100;

  for (const profession of professions) {
    for (const term of professionSearchTerms(profession)) {
      for (const language of LANGUAGES) {
        const widened = widenDiscoveryQuery(term.text, language);
        ok(widened.length <= BUDGET,
          `"${term.text}" on ${language} widens to ${widened.length} characters — `
          + `over the ${BUDGET} the database keeps, so it would be cut mid-phrase`);
        // Never cut: an odd number of quotes means half a phrase went in.
        equal((widened.match(/"/g) ?? []).length % 2, 0,
          `"${term.text}" on ${language} widens to whole phrases, not half of one`);
      }
    }
  }

  // Short, vague words are the ones that resolve several trades at once.
  for (const query of ['clean', 'tech', 'work', 'a', 'ال', 'de', 'صيانة']) {
    for (const language of LANGUAGES) {
      const widened = widenDiscoveryQuery(query, language);
      ok(widened.length <= BUDGET,
        `"${query}" on ${language} widens to ${widened.length} characters`);
    }
  }

  // A query matching no trade crosses the wire exactly as typed.
  equal(widenDiscoveryQuery('Hossam Adel', 'en'), 'Hossam Adel',
    'a professional’s name is not widened, and not quoted, and not changed');
}

// --- Categories and specific services, in every language ---------------------
/*
 * Requirement said to give categories and specific services the same treatment
 * as professions. Most of it was already there: `SERVICE_SEARCH_ALIASES` has
 * carried a per-language vocabulary since the locksmith was found to be
 * unreachable, and `specificTermsByCategory` folds every service's three labels
 * into the same matcher.
 *
 * What was missing is the proof across the WHOLE catalogue rather than the
 * handful of examples the feature gets described with. A service whose French
 * label was never written is invisible until a French customer types it, and
 * the fallback means it still renders something.
 */
{
  const { matchServiceCategories } = await import('../src/services/service-search-aliases.ts');
  const { specificServices } = await import('../src/services/specific-services.ts');

  ok(specificServices.length > 40, 'the whole catalogue is being walked, not a sample');

  for (const service of specificServices) {
    for (const language of LANGUAGES) {
      const label = service[language];
      ok(typeof label === 'string' && label.trim().length > 0,
        `${service.key}: has a ${language} label at all`);

      const matched = matchServiceCategories(label);
      ok(matched.includes(service.categoryId),
        `${service.key}: its ${language} label "${label}" reaches ${service.categoryId} — `
        + 'a customer typing the service they want, in any language, finds the trade that does it');
    }
  }

  // And the category's own name, in each language, reaches it.
  for (const [query, categoryId] of [
    ['plumbing', 'plumbing'], ['سباكة', 'plumbing'], ['plomberie', 'plumbing'],
    ['electrician', 'electrical'], ['كهربائي', 'electrical'], ['électricien', 'electrical'],
    ['كالون', 'locksmithing'], ['serrurier', 'locksmithing'],
  ] as const) {
    ok(matchServiceCategories(query).includes(categoryId),
      `"${query}" reaches the ${categoryId} category whatever the interface language`);
  }
}

// --- One folding, shared -----------------------------------------------------
/*
 * The category matcher and the profession search must normalise identically, or
 * a spelling reaches one and not the other. They did not, briefly: this file's
 * subject grew a second implementation of a folding `foldSearchTerm` already
 * did. Asserted rather than trusted, because two functions agreeing today is
 * not the same as one function.
 */
{
  const { foldSearchTerm } = await import('../src/services/service-search-aliases.ts');
  for (const sample of ['Électricité', 'سَبَّاكَة', 'ســباكة', 'إسكندرية', 'Smart-Home', '  spaced  ']) {
    equal(foldSearchTerm(sample), normalizeSearchText(sample),
      `"${sample}" folds the same way for categories and for professions`);
  }
}

console.log(`Multilingual search: ${checks} checks passed.`);
