/**
 * The service catalogue, its cold-start demand order, and the promise that the
 * order is honest about where it came from.
 *
 * Two things are being defended here. First, that Barber, Hairdressing and
 * Personal styling exist once, in the canonical authority, rather than as
 * separate lists per client that drift. Second, that customer-facing choosers
 * present services in researched demand order rather than alphabetically or in
 * whatever order somebody typed the seed — and that nothing anywhere calls that
 * order "popular on Warsha", because Warsha has no traffic to measure yet.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { serviceCategoryDescription, serviceCategoryLabel } from '../src/i18n/service-labels.ts';
import { categories as mockCategories } from '../src/data/mock-data.ts';
import { listProfessions, professions } from '../src/providers/profession-taxonomy.ts';
import {
  byServiceDemand, DEMAND_RANK_SOURCE, SERVICE_DEMAND_ORDER, serviceDemandRank,
} from '../src/services/service-catalogue.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const read = (path: string) => readFileSync(path, 'utf8');
/** SQL without its comments — an explanation of a defect is not the defect. */
const sql = (path: string) => read(path).replace(/^\s*--.*$/gm, '');
const migrationText = read('supabase/migrations/202608230004_service_catalogue_demand_rank.sql');
const migration = sql('supabase/migrations/202608230004_service_catalogue_demand_rank.sql');
const seed = read('supabase/seed.sql');
const LANGUAGES = ['en', 'ar', 'fr'] as const;

// --- The three additions exist, once, in the canonical authority ------------

const NEW = [
  { id: 'barber', key: 'barber', profession: 'barber' },
  { id: 'hairdressing', key: 'hairdressing', profession: 'hairdresser' },
  { id: 'personal-styling', key: 'personalStyling', profession: 'personalStylist' },
] as const;

for (const entry of NEW) {
  check(SERVICE_DEMAND_ORDER.includes(entry.id),
    `${entry.id} EXISTS IN THE CANONICAL CATALOGUE`);
  check(new RegExp(`\\('${entry.id}', '${entry.key}'`).test(migration),
    `${entry.id} is seeded by the migration with its translation key`);
  check(seed.includes(`('${entry.id}','${entry.key}'`),
    `${entry.id} is present in the local seed, so mock and hosted agree`);
  check(professions.some((p) => p.key === entry.profession && p.categoryId === entry.id),
    `${entry.id} has a worker profession mapped to it`);
}

// Personal styling is fashion, not hair. The whole point of the correction.
const styling = professions.find((p) => p.key === 'personalStylist');
check(styling !== undefined, 'the personal stylist profession exists');
for (const language of LANGUAGES) {
  const label = (styling as Record<string, string>)[language];
  check(!/hair|شعر|cheveu|coiffe/i.test(label),
    `THE ${language.toUpperCase()} PERSONAL STYLIST LABEL IS NOT A HAIRDRESSER`);
}
check(!/hairStylist|hair-styling|hair_stylist/i.test(migration + seed),
  'no Hair Stylist service was introduced anywhere');
for (const id of SERVICE_DEMAND_ORDER) {
  check(id !== ('dj' as string) && !/^dj-/.test(id), `no DJ category was introduced (${id})`);
}

// --- One authority, not a list per client -----------------------------------

equal(mockCategories.map((c) => c.id), [...SERVICE_DEMAND_ORDER],
  'MOCK DATA RENDERS THE CANONICAL ORDER, NOT ITS OWN');
check(!/c\.id in \(/.test(migration),
  'the catalogue RPC no longer filters to a hardcoded launch allowlist');

const migrationRanks = [...migration.matchAll(/\('([a-z-]+)', (\d+)\)/g)]
  .map(([, id, rank]) => ({ id, rank: Number(rank) }))
  .sort((left, right) => left.rank - right.rank);
equal(migrationRanks.map((row) => row.id), [...SERVICE_DEMAND_ORDER],
  'THE DATABASE RANKS AND THE SHARED CLIENT MODULE AGREE EXACTLY');

// --- Every requestable service is ranked, uniquely and deterministically ----

const ranks = SERVICE_DEMAND_ORDER.map((id) => serviceDemandRank(id));
equal(ranks, Array.from({ length: SERVICE_DEMAND_ORDER.length }, (_, i) => i + 1),
  'every active requestable service has a dense rank starting at 1');
equal(new Set(ranks).size, ranks.length, 'RANKS ARE UNIQUE');
check(/create unique index service_categories_active_demand_rank_key/.test(migration),
  'and the database enforces that uniqueness among active categories');
check(/order by c\.demand_rank nulls last, c\.sort_order, c\.id/.test(migration),
  'ordering carries an explicit deterministic tie-break after the rank');
check(serviceDemandRank('a-category-from-a-later-build') === Number.MAX_SAFE_INTEGER,
  'an unknown category sorts last rather than first');

// A ranking that could be mistaken for measured demand would be a lie.
equal(DEMAND_RANK_SOURCE, 'cold_start_research',
  'THE RANKING DECLARES ITSELF A RESEARCHED PRIOR, NOT WARSHA DEMAND');
check(/demand_rank_source in \('cold_start_research', 'observed'\)/.test(migration),
  'and the database records which of the two produced the current order');
check(/NOT observed Warsha/.test(migrationText),
  'the column comment says plainly that this is not observed demand');

// --- Household trades come first --------------------------------------------

const HOUSEHOLD = ['plumbing', 'electrical', 'ac', 'cleaning', 'appliance-repair',
  'carpentry', 'painting', 'general-maintenance', 'moving-help'] as const;
for (const trade of HOUSEHOLD) {
  for (const entry of NEW) {
    check(serviceDemandRank(trade) < serviceDemandRank(entry.id),
      `${trade} IS OFFERED BEFORE ${entry.id}`);
  }
}
equal(SERVICE_DEMAND_ORDER[0], 'plumbing', 'plumbing leads the cold-start order');
check(serviceDemandRank('personal-styling') === SERVICE_DEMAND_ORDER.length,
  'personal styling is last, not promoted for being new');

// --- No gender rule, anywhere ------------------------------------------------
// "Primarily women's hair services" is positioning. It is not an access rule,
// and nothing in the catalogue may turn it into one.

const GENDERED = /\b(gender|male_only|female_only|women_only|men_only|is_female|is_male)\b|نساء فقط|رجال فقط/i;
for (const source of [migration, seed, read('src/services/service-catalogue.ts'),
  read('src/providers/profession-taxonomy.ts')]) {
  check(!GENDERED.test(source),
    'NO GENDER ELIGIBILITY, FILTER OR AUTHORIZATION EXISTS FOR ANY SERVICE');
}
const hairdressing = professions.find((p) => p.key === 'hairdresser');
check(hairdressing !== undefined
  && !/women|female|نساء|femme/i.test(Object.values(hairdressing).join(' ')),
  'and the hairdressing labels state no gender restriction');

// --- Existing identifiers survive --------------------------------------------

const LAUNCH = ['plumbing', 'electrical', 'carpentry', 'ac', 'cleaning', 'painting',
  'appliance-repair', 'satellite-tv-installation', 'moving-help', 'general-maintenance'];
for (const id of LAUNCH) {
  check(SERVICE_DEMAND_ORDER.includes(id as never),
    `the stored identifier "${id}" is still active, so existing requests remain valid`);
}
check(!/alter table public\.service_categories[\s\S]{0,200}rename/i.test(migration),
  'NO EXISTING IDENTIFIER IS RENAMED TO IMPROVE DISPLAY COPY');
for (const entry of NEW) {
  check(/^[a-z0-9-]+$/.test(entry.id),
    `the new identifier "${entry.id}" follows the existing naming convention`);
}

// --- Real localized labels in all three languages ----------------------------

for (const entry of NEW) {
  for (const language of LANGUAGES) {
    const label = serviceCategoryLabel(entry.key, language);
    check(label.length > 0 && label !== entry.id && label !== entry.key,
      `${entry.id} has a real ${language} label, not a humanized identifier`);
    const description = serviceCategoryDescription(`${entry.key}Description`, language);
    check(typeof description === 'string' && description.length > 10,
      `${entry.id} has a real ${language} description`);
  }
  // Arabic must be Arabic script, not a transliteration left as a placeholder.
  check(/[؀-ۿ]/.test(serviceCategoryLabel(entry.key, 'ar')),
    `THE ARABIC LABEL FOR ${entry.id} IS WRITTEN IN ARABIC`);
  check(/[؀-ۿ]/.test(serviceCategoryDescription(`${entry.key}Description`, 'ar') ?? ''),
    `and so is its description, so RTL renders words rather than a slug`);
}
// Terminology chosen for Egypt rather than translated word-for-word.
equal(serviceCategoryLabel('hairdressing', 'ar'), 'كوافير',
  'hairdressing uses the ordinary Egyptian word, not a literal rendering');
equal(serviceCategoryLabel('personalStyling', 'fr'), 'Conseil en image',
  'personal styling uses the standard French term, not a calque');

// --- Choosers render in demand order, not alphabetically ---------------------

const alphabetical = [...SERVICE_DEMAND_ORDER]
  .map((id) => serviceCategoryLabel(id === 'ac' ? 'acRepair' : id, 'en'))
  .sort((left, right) => left.localeCompare(right, 'en'));
const asRendered = mockCategories.map((c) => serviceCategoryLabel(c.label, 'en'));
check(JSON.stringify(asRendered) !== JSON.stringify(alphabetical),
  'CUSTOMER SERVICE SELECTORS DO NOT RENDER ALPHABETICALLY');
check(!/order by entry->>'translationKey'/.test(migration),
  'AND SEARCH SUGGESTIONS NO LONGER RE-SORT THEIR OWN RANKING ALPHABETICALLY');
check(/row_number\(\) over \(order by c\.demand_rank nulls last/.test(migration),
  'the suggestion ordinal is carried out of the subquery so it cannot be lost');

// Worker trade selection may use the same order, but must hide nothing.
for (const language of LANGUAGES) {
  const listed = listProfessions(language);
  equal(listed.length, professions.length,
    `NO TRADE IS HIDDEN FROM WORKERS IN ${language.toUpperCase()}`);
  const listedRanks = listed.map((item) => serviceDemandRank(item.categoryId));
  equal(listedRanks, [...listedRanks].sort((a, b) => a - b),
    `worker trade selection is in demand order in ${language}`);
}
// Professions sharing a category tie on rank and then fall back to the
// localized label, so their order within a category is language-specific by
// design. The sequence of categories is not.
equal(listProfessions('en').map((p) => p.categoryId),
  listProfessions('ar').map((p) => p.categoryId),
  'AND THE SEQUENCE OF TRADES BY CATEGORY IS THE SAME IN EVERY LANGUAGE');
check(listProfessions('en', 'plumb').every((p) => /plumb/i.test(p.en)),
  'a worker searching their trade still filters on their own words');

// --- Relevance beats popularity in search ------------------------------------
// The demand rank orders choosers. It must never reorder a result set the user
// asked a question of.

const discovery = read('supabase/migrations/202608050001_wps020_search_discovery_personalization_appearance.sql');
const searchBody = discovery.slice(discovery.indexOf('function public.search_providers'));
check(!/demand_rank/.test(searchBody.slice(0, 8000)),
  'SEARCH RELEVANCE IS NOT OVERRIDDEN BY THE GLOBAL DEMAND RANKING');
check(!/demand_rank/.test(migration.slice(migration.indexOf("'commonServices'"))),
  'and the common-services list still ranks by real provider counts, not the prior');

// --- The tie-break helper is deterministic -----------------------------------

const sample = [{ id: 'personal-styling' }, { id: 'plumbing' }, { id: 'barber' }];
equal([...sample].sort(byServiceDemand((item) => item.id)).map((item) => item.id),
  ['plumbing', 'barber', 'personal-styling'],
  'the shared comparator orders by demand');
const tied = [{ id: 'unknown-b' }, { id: 'unknown-a' }];
equal([...tied].sort(byServiceDemand((item) => item.id,
  (left, right) => left.id.localeCompare(right.id))).map((item) => item.id),
  ['unknown-a', 'unknown-b'],
  'and equal ranks fall through to the caller\'s explicit tie-break');

console.log(`Service catalogue: ${checks} checks passed.`);
