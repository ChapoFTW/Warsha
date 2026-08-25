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
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { serviceCategoryDescription, serviceCategoryLabel } from '../src/i18n/service-labels.ts';
import { translations } from '../src/i18n/translations.ts';
import { appCopy as appCopyForCatalogue } from '../web/lib/app-copy.ts';
import { categories as mockCategories } from '../src/data/mock-data.ts';
import { listProfessions, professions } from '../src/providers/profession-taxonomy.ts';
import {
  byServiceDemand, DEMAND_RANK_SOURCE, isLegacyCategory, isSelectableCategory,
  selectableCategories, SERVICE_DEMAND_ORDER, serviceDemandRank,
} from '../src/services/service-catalogue.ts';
import {
  matchServiceCategories, SERVICE_SEARCH_ALIASES, searchTermsFor,
} from '../src/services/service-search-aliases.ts';
import {
  specificServiceLabel, specificServices, specificServicesFor,
} from '../src/services/specific-services.ts';

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
  const label = styling?.[language] ?? '';
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

// The ranks this migration set have since been superseded: the catalogue
// expansion withdrew `general-maintenance`, added seven categories and re-ranked
// the rest. The authoritative comparison is against that later migration, and it
// lives further down in "One ordering authority for web, Android and iOS".
check(/'plumbing', 1/.test(migration),
  'this migration established the first explicit demand ranks');

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

// `general-maintenance` has left this list because it has left the catalogue.
// Every trade it was hiding is now a household category in its own right, so
// the list is longer than it was, not shorter.
const HOUSEHOLD = ['plumbing', 'electrical', 'ac', 'cleaning', 'appliance-repair',
  'carpentry', 'painting', 'moving-help', 'pest-control', 'water-heater-repair',
  'flooring-tiling', 'renovation-finishing', 'alumetal', 'locksmithing',
  'gardening'] as const;
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
// `general-maintenance` was a launch identifier and is no longer selectable, so
// it is asserted separately: withdrawn from new work, still resolvable, so the
// requests, quotes and bookings that reference it remain valid.
check(!isSelectableCategory('general-maintenance') && isLegacyCategory('general-maintenance'),
  'THE WITHDRAWN LAUNCH IDENTIFIER STILL RESOLVES FOR THE RECORDS THAT USE IT');

const LAUNCH = ['plumbing', 'electrical', 'carpentry', 'ac', 'cleaning', 'painting',
  'appliance-repair', 'satellite-tv-installation', 'moving-help'];
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

// ---------------------------------------------------------------------------
// The catch-all is gone, and nothing it hid was lost
// ---------------------------------------------------------------------------
//
// `general-maintenance` was the largest category by profession count -- fourteen
// trades, including a locksmith and an aluminium worker. That is the tell: not a
// service customers asked for, but the drawer everything specific got put in.
check(!SERVICE_DEMAND_ORDER.includes('general-maintenance' as never),
  'GENERAL MAINTENANCE CANNOT BE SELECTED FOR NEW WORK');
check(!isSelectableCategory('general-maintenance'),
  'and the selection guard refuses it by name');
check(isLegacyCategory('general-maintenance'),
  'BUT IT IS WITHDRAWN, NOT DELETED, SO OLD RECORDS STILL RENDER');
// Withdrawn is not the same as unknown: an id this build has never seen is a
// category seeded after it shipped and must still be offered.
check(!isLegacyCategory('some-future-category'),
  'a category from a later build is not mistaken for a withdrawn one');
equal(serviceDemandRank('general-maintenance'), Number.MAX_SAFE_INTEGER,
  'a withdrawn category sorts last rather than first if it appears at all');
// It still has to read as words, in every language.
for (const language of ['en', 'ar', 'fr'] as const) {
  const label = serviceCategoryLabel('generalMaintenance', language, 'general-maintenance');
  check(label.length > 0 && label !== 'general-maintenance',
    `a historical record renders in ${language}, not as a slug`);
}
// The filter every surface is meant to use.
{
  const rows = [
    { id: 'general-maintenance' }, { id: 'locksmithing' }, { id: 'plumbing' },
  ];
  const offered = selectableCategories(rows, (row) => row.id).map((row) => row.id);
  equal(offered, ['plumbing', 'locksmithing'],
    'SELECTABLE CATEGORIES DROPS THE WITHDRAWN ONE AND ORDERS THE REST BY DEMAND');
}

// Every trade the catch-all was hiding has a concrete home. If any of these had
// nowhere to go, the category was load-bearing and removing it just moved the
// problem somewhere else.
// Widened deliberately: the taxonomy is `as const`, so TypeScript already
// proves no profession names the withdrawn category -- comparing the narrowed
// union to it is a type error, not a test. This keeps the runtime guarantee
// stated for a reader, and for any future entry typed more loosely.
check(professions.every((item) => (item.categoryId as string) !== 'general-maintenance'),
  'NO PROFESSION IS STILL FILED UNDER THE CATCH-ALL');
for (const [key, category] of [
  ['locksmith', 'locksmithing'],
  ['aluminumWorker', 'alumetal'],
  ['glassWorker', 'alumetal'],
  ['tiler', 'flooring-tiling'],
  ['mason', 'renovation-finishing'],
  ['gypsumWorker', 'renovation-finishing'],
  ['gardener', 'gardening'],
  ['pestControlWorker', 'pest-control'],
  ['waterHeaterTechnician', 'water-heater-repair'],
] as [string, string][]) {
  const profession = professions.find((item) => item.key === key);
  check(profession !== undefined, `${key} still exists as a trade`);
  equal(profession?.categoryId, category, `${key} is filed under ${category}`);
}
// The two genuinely vague trades went with the category that hid them.
for (const key of ['handyman', 'generalMaintenance']) {
  check(!professions.some((item) => item.key === key),
    `${key} is withdrawn -- it is the same drawer at worker level`);
}

// ---------------------------------------------------------------------------
// The expanded catalogue
// ---------------------------------------------------------------------------
for (const id of [
  'plumbing', 'electrical', 'ac', 'cleaning', 'appliance-repair', 'carpentry',
  'painting', 'moving-help', 'pest-control', 'locksmithing', 'alumetal',
  'water-heater-repair', 'satellite-tv-installation', 'barber', 'hairdressing',
  'personal-styling',
] as const) {
  check(SERVICE_DEMAND_ORDER.includes(id),
    `${id} is offered`);
}
check(SERVICE_DEMAND_ORDER.includes('locksmithing'),
  'LOCKSMITHING IS PRESENT EVEN THOUGH IT FRONTS NO EGYPTIAN MARKETPLACE');

// Ranks are dense and unique from 1, or the migration and this module cannot
// be compared.
{
  const ranks = SERVICE_DEMAND_ORDER.map((id) => serviceDemandRank(id));
  equal(ranks, ranks.map((_, index) => index + 1),
    'ranks are dense and unique from 1');
  equal(new Set(SERVICE_DEMAND_ORDER).size, SERVICE_DEMAND_ORDER.length,
    'and no category appears twice');
}

// Ordering is a researched prior, and says so.
equal(DEMAND_RANK_SOURCE, 'cold_start_research',
  'THE ORDER IS LABELLED AS RESEARCH, NOT AS OBSERVED WARSHA DEMAND');

// Urgent and recurring household work outranks everything else.
{
  const rank = (id: string) => serviceDemandRank(id);
  check(rank('plumbing') < rank('barber') && rank('electrical') < rank('barber'),
    'urgent household trades outrank grooming');
  check(rank('cleaning') < rank('ac'),
    'CLEANING OUTRANKS AIR CONDITIONING: IT RECURS, AND AC IS SEASONAL');
  check(rank('personal-styling') === SERVICE_DEMAND_ORDER.length,
    'PERSONAL STYLING IS LAST AND IS NOT ARTIFICIALLY PROMOTED');
  check(rank('personal-styling') > rank('locksmithing'),
    'and stays below even the trades that front no marketplace');
  check(rank('barber') !== rank('hairdressing'),
    'barber and hairdressing stay distinct, as the profession model requires');
}

// ---------------------------------------------------------------------------
// Every category is a real word in all three languages
// ---------------------------------------------------------------------------
for (const id of SERVICE_DEMAND_ORDER) {
  const mock = mockCategories.find((item) => item.id === id);
  check(mock !== undefined, `${id} is in the shared mock catalogue`);
  for (const language of ['en', 'ar', 'fr'] as const) {
    // The real question is whether the key RESOLVES, not whether the result
    // looks like a slug: the English for `plumbing` is legitimately "Plumbing",
    // so no string comparison can tell a translation from a fallback.
    const dictionary = translations[language] as unknown as Record<string, unknown>;
    check(typeof dictionary[mock!.label] === 'string'
      && (dictionary[mock!.label] as string).length > 0,
      `${id} resolves a real ${language} name rather than falling back`);
    const label = serviceCategoryLabel(mock!.label, language, id);
    check(label.length > 0, `${id} has a ${language} name`);
    const descriptions = translations[language] as unknown as Record<string, unknown>;
    check(typeof descriptions[mock!.description] === 'string',
      `${id} resolves a real ${language} description rather than falling back`);
    const description = serviceCategoryDescription(mock!.description, language);
    check(typeof description === 'string' && description.length > 0,
      `${id} has a ${language} description`);
  }
}
// Arabic and French must not silently be the English string.
for (const id of SERVICE_DEMAND_ORDER) {
  const mock = mockCategories.find((item) => item.id === id)!;
  const en = serviceCategoryLabel(mock.label, 'en', id);
  const ar = serviceCategoryLabel(mock.label, 'ar', id);
  check(ar !== en, `${id} IS NOT SILENTLY ENGLISH ON AN ARABIC CARD`);
  check(/[؀-ۿ]/.test(ar), `${id} has a genuinely Arabic name`);
}

// ---------------------------------------------------------------------------
// Search finds a category by what people actually type
// ---------------------------------------------------------------------------
// Matching the displayed title is why a locksmith was unreachable: nobody
// searches "locksmithing", and the title is localized so a query in the wrong
// language missed everything.
for (const id of SERVICE_DEMAND_ORDER) {
  const aliases = SERVICE_SEARCH_ALIASES[id];
  check(aliases !== undefined, `${id} carries search vocabulary`);
  for (const language of ['en', 'ar', 'fr'] as const) {
    check(aliases[language].length >= 3,
      `${id} has ${language} search terms, not just a translated title`);
  }
  check(/[؀-ۿ]/.test(aliases.ar.join('')), `${id} Arabic terms are Arabic`);
  check(searchTermsFor(id).length >= 9, `${id} is findable by several words`);
}

for (const [query, expected] of [
  ['lock', 'locksmithing'], ['key', 'locksmithing'], ['locksmith', 'locksmithing'],
  ['قفل', 'locksmithing'], ['مفاتيح', 'locksmithing'], ['كالون', 'locksmithing'],
  ['serrurier', 'locksmithing'], ['clé', 'locksmithing'],
  ['alumetal', 'alumetal'], ['الوميتال', 'alumetal'], ['aluminium', 'alumetal'],
  ['سخان', 'water-heater-repair'], ['water heater', 'water-heater-repair'],
  ['chauffe-eau', 'water-heater-repair'],
  ['صراصير', 'pest-control'], ['cockroach', 'pest-control'],
  ['desinsectisation', 'pest-control'],
  ['بلاط', 'flooring-tiling'], ['carrelage', 'flooring-tiling'],
  ['جبس', 'renovation-finishing'], ['plâtre', 'renovation-finishing'],
  ['جنينة', 'gardening'], ['jardinage', 'gardening'],
  ['دش', 'satellite-tv-installation'],
  ['تكييف', 'ac'], ['clim', 'ac'],
] as [string, string][]) {
  check(matchServiceCategories(query).includes(expected as never),
    `searching "${query}" finds ${expected}`);
}
// A two-letter query must not drag in every word that happens to contain it.
equal(matchServiceCategories('ac'), ['ac'],
  'A SHORT QUERY MATCHES WORDS, NOT SUBSTRINGS OF UNRELATED ONES');
// Language-agnostic: the query is matched against every language's vocabulary.
check(matchServiceCategories('تكييف').includes('ac')
  && matchServiceCategories('ac').includes('ac'),
  'a category is reachable from any of the three languages');
// Withdrawn categories are not discoverable.
check(!matchServiceCategories('general maintenance').includes('general-maintenance' as never),
  'THE WITHDRAWN CATEGORY IS NOT SEARCHABLE');

// ---------------------------------------------------------------------------
// One ordering authority for web, Android and iOS
// ---------------------------------------------------------------------------
equal(mockCategories.map((item) => item.id), [...SERVICE_DEMAND_ORDER],
  'THE SHARED MOCK CATALOGUE IS THE SHARED ORDER, NOT A SECOND COPY');
{
  const migration = readFileSync(
    'supabase/migrations/202608240001_service_catalogue_expansion.sql', 'utf8');
  // The migration writes every rank as one set, so the unique constraint sees
  // the finished arrangement rather than each intermediate step. Parsed from
  // that block and compared as an order, not matched line by line.
  const rankBlock = migration.slice(migration.indexOf('set demand_rank = ranked.rank'));
  const migrationOrder = [...rankBlock.matchAll(/\('([a-z-]+)', (\d+)\)/g)]
    .map(([, id, rank]) => ({ id, rank: Number(rank) }))
    .sort((left, right) => left.rank - right.rank);
  equal(migrationOrder.map((row) => row.id), [...SERVICE_DEMAND_ORDER],
    'THE MIGRATION RANKS EVERY CATEGORY EXACTLY AS THE SHARED MODULE DOES');
  equal(migrationOrder.map((row) => row.rank),
    SERVICE_DEMAND_ORDER.map((_, index) => index + 1),
    'and the ranks are dense from 1 on both sides');
  check(/set demand_rank = null/.test(migration),
    'the rank space is cleared first, since the constraint forbids a duplicate mid-flight');
  check(/is_active = false[\s\S]{0,120}general-maintenance/.test(migration),
    'and withdraws the catch-all rather than deleting it');
  check(!/delete from public\.service_categories/i.test(migration),
    'NO HISTORICAL CATEGORY ROW IS DESTROYED');
}

// The web parses the catalogue through the shared authority, so a client that
// shipped before the migration ran still refuses to offer the catch-all.
{
  const customer = readFileSync('web/lib/customer.ts', 'utf8');
  check(/isLegacyCategory\(category\.id\)/.test(customer),
    'WEB FILTERS WITHDRAWN CATEGORIES THROUGH THE SHARED MODULE');
  check(/byServiceDemand\(\(category\) => category\.id\)/.test(customer),
    'and orders what remains by the shared demand rank, not by server order');
  check(/from '\.\.\/\.\.\/src\/services\/service-catalogue\.ts'/.test(customer),
    'reading the same module Android and iOS read, not a web copy');
}

// --- Alumetal is called Alumetal ---------------------------------------------
// The trade's own name in Egypt, and a loan word, so it is the same in English
// and French. That is deliberate: "Aluminium doors & windows" described the work
// but was not what anybody calls it.
equal(translations.en.alumetal, 'Alumetal', 'the English name is the trade name');
equal(translations.ar.alumetal, 'ألوميتال', 'THE ARABIC NAME IS THE ARABIC SPELLING OF IT');
equal(translations.fr.alumetal, 'Alumetal', 'and French uses the same loan word');
// A loan word carries no meaning for somebody who has not met it, so the
// description and the aliases have to do the work the name no longer does.
for (const language of ['en', 'ar', 'fr'] as const) {
  const description = translations[language].alumetalDescription as string;
  check(description.length > 0, `the ${language} description explains the trade`);
}
for (const term of ['aluminium', 'aluminum', 'alumetal', 'window', 'windows', 'door', 'doors']) {
  check(SERVICE_SEARCH_ALIASES.alumetal.en.includes(term),
    `English search still reaches Alumetal by "${term}"`);
}
for (const term of ['ألوميتال', 'الوميتال', 'شباك', 'شبابيك', 'أبواب']) {
  check(SERVICE_SEARCH_ALIASES.alumetal.ar.includes(term),
    `Arabic search still reaches Alumetal by "${term}"`);
}
for (const term of ['alumetal', 'aluminium', 'fenêtre', 'porte']) {
  check(SERVICE_SEARCH_ALIASES.alumetal.fr.includes(term),
    `French search still reaches Alumetal by "${term}"`);
}
for (const query of ['aluminium', 'aluminum', 'الوميتال', 'شباك', 'fenêtre', 'alumetal']) {
  check(matchServiceCategories(query).includes('alumetal'),
    `searching "${query}" still finds Alumetal`);
}
// Renaming must not have loosened matching: a two-letter query still matches
// words, not substrings of unrelated ones.
equal(matchServiceCategories('ac'), ['ac'],
  'WORD-AWARE MATCHING SURVIVES THE RENAME');

// --- The aliases are actually consulted --------------------------------------
// A vocabulary nothing reads is worse than none: it passes its own tests and
// changes nothing a customer experiences. Discovery filtered on the localized
// label and the English id, so a category was reachable in one language and
// invisible in the other two.
{
  const discover = readFileSync('web/app/app/discover/page.tsx', 'utf8');
  check(/matchServiceCategories\(query\)/.test(discover),
    'CUSTOMER DISCOVERY SEARCHES THE SHARED ALIAS VOCABULARY');
  check(/service-search-aliases/.test(discover),
    'reading the same module Android and iOS can, not a web copy');
  check(/byAlias\.has\(category\.id\)/.test(discover),
    'and an alias hit is enough on its own, whatever the interface language');
}

// --- Every catalogue icon resolves to a real glyph ---------------------------
//
// `supabase-adapter.ts` casts the stored value straight to the icon type --
// `String(row.icon_name) as Category['icon']` -- so TypeScript validates the
// shared mock catalogue and never sees what the database actually holds. Four of
// the seven names introduced with the expansion did not exist in MaterialIcons:
// `water-heater`, `flooring`, `renovation`, `garden`. They read like icon names,
// which is why nobody questioned them, and an unknown name renders whatever the
// font falls back to -- on a screen no test could read.
{
  const glyphs = JSON.parse(readFileSync(
    'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialIcons.json',
    'utf8')) as Record<string, number>;
  const available = new Set(Object.keys(glyphs));
  check(available.size > 1000, 'the MaterialIcons glyph map is the real one');

  for (const category of mockCategories) {
    check(available.has(category.icon),
      `${category.id} renders a real glyph, not a fallback (${category.icon})`);
  }

  // What the database is actually told to store, across every migration that
  // writes an icon. Reading the SQL rather than the module is the point: the
  // module is typed and the database is not.
  const iconWrites = new Map<string, string>();
  for (const file of readdirSync('supabase/migrations').filter((n) => n.endsWith('.sql'))) {
    const sql = readFileSync(join('supabase/migrations', file), 'utf8');
    // Scoped to statements that actually touch service_categories. A blanket
    // scan over every migration matches tuples from unrelated tables -- the
    // first version of this test read an image-format row and asked why "webp"
    // was not an icon.
    for (const [statement] of sql.matchAll(
      /insert into public\.service_categories[\s\S]*?;/g)) {
      for (const [, id, icon] of statement.matchAll(
        /\('([a-z-]+)', '[A-Za-z]+', '[A-Za-z]+', '([a-z-]+)'/g)) {
        iconWrites.set(id, icon);
      }
    }
    for (const [, icon, id] of sql.matchAll(
      /update public\.service_categories set icon_name = '([a-z-]+)'\s+where id = '([a-z-]+)'/g)) {
      iconWrites.set(id, icon);
    }
  }
  check(iconWrites.size > 0, 'the migrations do write icon names');
  for (const [id, icon] of iconWrites) {
    check(available.has(icon),
      `THE DATABASE STORES A REAL GLYPH FOR ${id}, NOT "${icon}"`);
  }
  // And the two sources must agree, or a customer sees one icon in mock mode
  // and a different one against the real backend.
  const byId = new Map(mockCategories.map((c) => [c.id, c.icon]));
  for (const [id, icon] of iconWrites) {
    // A withdrawn category is absent from the shared catalogue by design; the
    // database keeps its icon so history still renders.
    if (isLegacyCategory(id) || !byId.has(id)) continue;
    equal(icon, byId.get(id),
      `${id} has the same icon in the database as in the shared catalogue`);
  }
}

// ---------------------------------------------------------------------------
// Specific services: what the customer is actually asking for
// ---------------------------------------------------------------------------
//
// `public.services` stored a display string in `name` and nothing else. Five
// rows existed in the whole product, and the request form rendered
// `service.name` directly -- so an Arabic customer choosing plumbing was
// offered "Home inspection" and "Leak repair" in English, and a customer
// choosing any of the other fifteen categories was offered nothing at all.

// --- Every category has an intentional strategy -----------------------------
for (const category of SERVICE_DEMAND_ORDER) {
  const services = specificServicesFor(category);
  check(services.length >= 6,
    `${category} offers a useful set of specific services (${services.length})`);
  check(services.every((service) => service.categoryId === category),
    `${category} owns every service listed under it`);
}
check(specificServices.length >= 150,
  'the catalogue is comprehensive rather than a token sample');

// --- Identity ---------------------------------------------------------------
{
  const keys = specificServices.map((service) => service.key);
  equal(new Set(keys).size, keys.length, 'EVERY SPECIFIC SERVICE HAS A UNIQUE KEY');
  check(keys.every((key) => /^[a-z][a-z0-9-]*$/.test(key)),
    'and a key that is machine identity, not prose');
  // Exactly one parent, and a real one.
  for (const service of specificServices) {
    check(SERVICE_DEMAND_ORDER.includes(service.categoryId),
      `${service.key} names a category that exists`);
    check(!isLegacyCategory(service.categoryId),
      `${service.key} IS NOT PARENTED TO A WITHDRAWN CATEGORY`);
  }
  equal(specificServicesFor('general-maintenance'), [],
    'the withdrawn category offers no specific services for new work');
}

// --- Ordering is deterministic ---------------------------------------------
{
  const first = specificServicesFor('plumbing').map((service) => service.key);
  const again = specificServicesFor('plumbing').map((service) => service.key);
  equal(first, again, 'the order is stable between calls');
  check(first[0] === 'plumbing-leak-repair',
    'the common job leads rather than the diagnostic one');
  check(first[first.length - 1] === 'plumbing-inspection',
    'and the survey is last, where somebody who knows what they need can skip it');
}

// --- This is the QA bug: a label in the wrong language ----------------------
// The dropdown showed English to every reader. A test that only checked the
// English name would have passed while the defect shipped, so this checks that
// the three languages genuinely differ and that each resolves.
for (const service of specificServices) {
  for (const language of ['en', 'ar', 'fr'] as const) {
    const label = specificServiceLabel(service.key, language);
    check(typeof label === 'string' && label.length > 0,
      `${service.key} resolves a ${language} label`);
    check(label !== service.key,
      `${service.key} never shows its own key to a customer`);
  }
  const ar = specificServiceLabel(service.key, 'ar')!;
  check(/[؀-ۿ]/.test(ar),
    `${service.key} IS ARABIC IN ARABIC, NOT ENGLISH LEFT IN PLACE`);
  check(specificServiceLabel(service.key, 'ar') !== specificServiceLabel(service.key, 'en'),
    `${service.key} does not silently fall back to English`);
}
// Switching language changes what is on screen.
{
  const key = 'plumbing-blocked-drain';
  const en = specificServiceLabel(key, 'en');
  const ar = specificServiceLabel(key, 'ar');
  const fr = specificServiceLabel(key, 'fr');
  check(en !== ar && en !== fr && ar !== fr,
    'CHANGING LANGUAGE CHANGES THE VISIBLE SPECIFIC-SERVICE LABEL');
  equal(en, 'Blocked drain', 'the English reads naturally');
  equal(ar, 'مواسير مسدودة', 'and the Arabic is what an Egyptian customer would say');
}
// An unknown key resolves to nothing, so a caller falls back rather than
// rendering a slug. That is the compatibility path for pre-key rows.
equal(specificServiceLabel('some-legacy-row', 'ar'), null,
  'an unknown key resolves to null so the row can fall back to its own name');

// --- Category boundaries ----------------------------------------------------
// The point of removing the catch-all was not to rebuild it one level down.
for (const [key, expected] of [
  ['water-heater-no-hot-water', 'water-heater-repair'],
  ['water-heater-install', 'water-heater-repair'],
  ['pest-cockroaches', 'pest-control'],
  ['flooring-ceramic-install', 'flooring-tiling'],
  ['alumetal-window-install', 'alumetal'],
  ['locksmith-key-copy', 'locksmithing'],
] as [string, string][]) {
  const service = specificServices.find((item) => item.key === key);
  check(service !== undefined, `${key} exists`);
  equal(service?.categoryId, expected, `${key} SITS UNDER ${expected}, NOT A GENERIC TRADE`);
}
// No category may quietly become the new dumping ground.
check(!specificServices.some((service) => /^(other|general|misc)/i.test(service.key)),
  'NO "OTHER" OR "GENERAL" CATCH-ALL SERVICE EXISTS');
// Targeted at catch-all phrasing, not the word "general": "General preventive
// treatment" is a specific pest-control job -- a whole-home preventive spray --
// and refusing it would be the heuristic misfiring, not a bucket being caught.
check(!specificServices.some((service) => /^other/i.test(service.en)),
  'and none is hiding behind a friendlier English name');
check(!specificServices.some((service) => /other .*(work|services?)$/i.test(service.en)),
  'nor behind an "Other ... work" phrasing');

// --- The database agrees with the module ------------------------------------
{
  const migration = readFileSync(
    'supabase/migrations/202608250002_specific_service_catalogue.sql', 'utf8');
  const seeded = [...migration.matchAll(/\('([a-z-]+)', '(?:[^']|'')*', '([a-z0-9-]+)', 'quote'/g)]
    .map(([, category, key]) => ({ category, key }));
  equal(seeded.length, specificServices.length,
    'THE MIGRATION SEEDS EXACTLY THE SHARED CATALOGUE');
  equal(seeded.map((row) => row.key), specificServices.map((service) => service.key),
    'in the same order, so the dropdown reads the same everywhere');
  equal(seeded.map((row) => row.category), specificServices.map((service) => service.categoryId),
    'and under the same parents');
  check(/add column if not exists translation_key/.test(migration),
    'the key is a column, not a convention');
  check(/on conflict \(translation_key\) do nothing/.test(migration),
    'RE-RUNNING NEVER OVERWRITES A PRE-EXISTING ROW OR ITS PRICE');
  check(/update public\.services set translation_key = '[a-z-]+' where id = '[0-9a-f-]+'/.test(migration),
    'and the rows that predate keys are given one rather than replaced');
  check(!/delete from public\.services/i.test(migration),
    'NO HISTORICAL SERVICE ROW IS DESTROYED');
}

// --- Both surfaces consume the shared authority ------------------------------
// The ordering and labelling rule moved into `src/services` when native grew
// the same picker, so these follow it there rather than pinning web's inlined
// copy of it -- which no longer exists.
{
  const form = readFileSync('web/app/app/requests/new/page.tsx', 'utf8');
  const shared = readFileSync('src/services/specific-services.ts', 'utf8');
  check(/catalogueServiceLabel\(service, locale\)/.test(form),
    'THE REQUEST FORM RENDERS THE LOCALIZED LABEL, NOT THE ENGLISH ROW NAME');
  check(/specificServiceLabel\(service\.translationKey, language\)\) \|\| service\.name/.test(shared),
    'falling back to the row name only when no key resolves');
  check(/specificServicesFor\(categoryId\)/.test(shared),
    'and orders the dropdown by the shared catalogue');
  const picker = readFileSync('components/warsha/SpecificServiceSelector.tsx', 'utf8');
  check(/orderedCatalogueServices\(/.test(picker) && /catalogueServiceLabel\(/.test(picker),
    'AND ANDROID AND iOS RESOLVE THROUGH THE SAME TWO FUNCTIONS');
  check(/from '@\/src\/services\/specific-services'/.test(form),
    'reading the same module Android and iOS can, not a web copy');
  // "Any service in this category" must stay the optional, non-restricting choice.
  check(/<option value="">\{words\.requestAnyService\}<\/option>/.test(form),
    'ANY SERVICE IS THE EMPTY VALUE, SO IT STORES NO SERVICE IDENTITY');
  check(/\.\.\.\(serviceId \? \{ serviceId \} : \{\}\)/.test(form),
    'and is omitted from the payload rather than sent as a fake id');
  const parser = readFileSync('web/lib/customer.ts', 'utf8');
  check(/translationKey: str\(row\.translation_key\)/.test(parser),
    'the parser carries the key through from the server');
}
for (const locale of ['en', 'ar', 'fr'] as const) {
  const copy = (appCopyForCatalogue[locale] as Record<string, string>).requestAnyService;
  check(typeof copy === 'string' && copy.length > 0,
    `"Any service in this category" is localized in ${locale}`);
}
check((appCopyForCatalogue.ar as Record<string, string>).requestAnyService
  !== (appCopyForCatalogue.en as Record<string, string>).requestAnyService,
  'and is not English on an Arabic screen');

// --- Specific services feed discovery ---------------------------------------
// A customer does not necessarily know the trade. "Blocked drain" contains no
// word about plumbing.
for (const [query, expected] of [
  ['blocked drain', 'plumbing'],
  ['مواسير مسدودة', 'plumbing'],
  ['canalisation bouchée', 'plumbing'],
  ['bedbugs', 'pest-control'],
  ['بق الفراش', 'pest-control'],
  ['نسخ مفاتيح', 'locksmithing'],
  ['keratin', 'hairdressing'],
] as [string, string][]) {
  check(matchServiceCategories(query).includes(expected as never),
    `searching "${query}" leads to ${expected}`);
}
// And the precision that vocabulary could easily have destroyed.
equal(matchServiceCategories('ac'), ['ac'],
  'A SHORT QUERY STILL MATCHES WHOLE WORDS, NOT "ACCOMPAGNEMENT"');
equal(matchServiceCategories('keratin'), ['hairdressing'],
  'and "keratin" is not a rodent problem because it contains "rat"');
check(!matchServiceCategories('blocked drain').includes('locksmithing' as never),
  'nor is a blocked drain a locksmith job because it contains "lock"');

console.log(`Service catalogue: ${checks} checks passed.`);
