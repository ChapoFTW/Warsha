/**
 * A professional describes WORK. A customer is shown a PERSON.
 *
 * Warsha asked professionals to pick "Plumber" from a list, which is asking
 * someone to choose a noun for themselves. "Plumbing" asks what they actually
 * do — the same profession, the same stored key, a question they can answer
 * without thinking about it.
 *
 * The failure this guards against is the two forms quietly collapsing back into
 * one: a new screen that reaches for the wrong noun, a translation that copies
 * the person form into the work slot, a taxonomy entry added with only half its
 * labels. So this asserts the SEMANTIC CONTRACT — which surfaces resolve which
 * form — rather than that any two strings differ.
 *
 * It deliberately does NOT require the two to be different strings. Some fields
 * legitimately name the work and the person with the same word in some
 * languages, and a test demanding difference would force awkward copy to
 * satisfy itself.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  professionLabel,
  professions,
  withdrawnProfessions,
} from '../src/providers/profession-taxonomy.ts';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

const LANGUAGES = ['en', 'ar', 'fr'] as const;

// --- Complete coverage, every profession, every language, both forms --------
// The whole taxonomy is enumerated rather than sampled: a missing Arabic work
// label is invisible until an Arabic-speaking professional opens the picker.
for (const profession of [...professions, ...withdrawnProfessions]) {
  for (const language of LANGUAGES) {
    for (const form of ['work', 'person'] as const) {
      const label = profession[form][language];
      ok(typeof label === 'string' && label.trim().length > 0,
        `${profession.key}: ${language} ${form} label exists`);
    }
  }
}

// --- No English left standing in Arabic or French ---------------------------
// A Latin-script Arabic label is the signature of a forgotten translation, and
// it reads to an Egyptian professional as the product not being finished.
for (const profession of [...professions, ...withdrawnProfessions]) {
  for (const form of ['work', 'person'] as const) {
    ok(/[؀-ۿ]/.test(profession[form].ar),
      `${profession.key}: the Arabic ${form} label is Arabic, not an English fallback`);
    ok(profession[form].fr !== profession[form].en || /^[A-Z][a-z]+$/.test(profession[form].en),
      `${profession.key}: the French ${form} label is not a copy of the English one`);
  }
}

// --- The contract: which audience resolves which form -----------------------
for (const profession of professions) {
  for (const language of LANGUAGES) {
    equal(professionLabel(profession.key, language, 'professional'), profession.work[language],
      `${profession.key}/${language}: a PROFESSIONAL is shown the work`);
    equal(professionLabel(profession.key, language, 'customer'), profession.person[language],
      `${profession.key}/${language}: a CUSTOMER is shown the person`);
  }
}

// --- The screens are on the right side of it --------------------------------
/*
 * Read off the source rather than rendered, because what is being asserted is
 * that a given surface ASKS for a given audience — a question about the call,
 * not about the pixels. The rendered check is a separate concern and lives in
 * the visual certification.
 */
const audienceOf = (path: string) => {
  const source = readFileSync(path, 'utf8');
  return {
    professional: /professionLabel\([^)]*'professional'\)/.test(source)
      || /profession\.work\[/.test(source),
    customer: /professionLabel\([^)]*'customer'\)/.test(source)
      || /profession\.person\[/.test(source),
  };
};

const PROFESSIONAL_SURFACES = [
  'components/warsha/ProfessionSelector.tsx',
  'components/warsha/OfferedServicesSection.tsx',
  'app/worker/profile.tsx',
  // The same professional, on the web. `web` sits outside the root tsconfig, so
  // a taxonomy change can break it while `npm run typecheck` stays green — this
  // is the only thing holding the web editor to the same audience as the app.
  'web/components/worker-profile-editor.tsx',
];
const CUSTOMER_SURFACES = [
  'app/provider/[id].tsx',
  'components/warsha/DiscoveryResultCard.tsx',
  'components/warsha/ProviderListItem.tsx',
];

for (const path of PROFESSIONAL_SURFACES) {
  const audience = audienceOf(path);
  ok(audience.professional, `${path} resolves the WORK label`);
  ok(!audience.customer,
    `${path} does not reach for the person noun — a professional is not shown a title here`);
}

for (const path of CUSTOMER_SURFACES) {
  const audience = audienceOf(path);
  ok(audience.customer, `${path} resolves the PERSON label`);
  ok(!audience.professional,
    `${path} does not reach for the work noun — a customer hires a plumber, not a plumbing`);
}

// --- Searching finds a trade by either noun ---------------------------------
// A professional who has always called themselves a plumber will type
// "plumber". Finding nothing would read as Warsha not offering the trade.
{
  const { listProfessions } = await import('../src/providers/profession-taxonomy.ts');
  for (const [language, work, person] of [
    ['en', 'plumbing', 'plumber'],
    ['ar', 'سباكة', 'سباك'],
    ['fr', 'plomberie', 'plombier'],
  ] as const) {
    ok(listProfessions(language, work).some((p) => p.key === 'plumbing'),
      `${language}: searching the work finds it`);
    ok(listProfessions(language, person).some((p) => p.key === 'plumbing'),
      `${language}: searching the person noun finds it too`);
  }
}

// --- The stored identity never moved ----------------------------------------
// Presentation changed; the key a profile, request, quote and review all point
// at did not. If this fails, existing professionals have been re-classified.
{
  const keys = professions.map((p) => p.key);
  for (const expected of ['plumbing', 'electrical', 'cleaning', 'carpentry', 'acRepair',
    'poolTechnician', 'personalStylist']) {
    ok(keys.includes(expected as typeof keys[number]),
      `the stored key "${expected}" is unchanged by a copy change`);
  }
  equal(keys.length, new Set(keys).size, 'and no profession was duplicated to carry a second noun');
}

// --- The professional-facing copy asks about work ---------------------------
{
  const copy = readFileSync('src/worker/worker-copy.ts', 'utf8');
  ok(/tradeTitle: 'What do you do\?'/.test(copy),
    'the step asks what they do, not which noun they are');
  ok(/tradeTitle: 'بتشتغل إيه؟'/.test(copy),
    'and asks it in Egyptian Arabic the way it is actually asked');
  ok(/tradeTitle: 'Que faites-vous \?'/.test(copy),
    'and in French');
  ok(/searchProfessions: 'Search work'/.test(copy),
    'and the search box is a short phrase rather than a taxonomy label');
}

// --- Every work label is one somebody actually certified ---------------------
/*
 * A copy audit, not a word ban.
 *
 * The first pass at these labels produced "General plumbing", "General
 * electrical work" and "Air-conditioning work" — filler invented to stop a row
 * repeating its category heading, which is a layout problem being solved with
 * vocabulary. No plumber describes themselves as doing general plumbing.
 *
 * Banning "general", "work" and "services" outright would be the same mistake
 * in reverse: some future label will legitimately need one of those words, and
 * a rule that forbids them forces a worse phrase. So the approved set is
 * enumerated here instead. Adding a profession means adding its label to this
 * list, which is exactly the moment someone should be reading it aloud after
 * the question "what do you do?".
 */
const CERTIFIED_WORK_LABELS = new Set([
  'Plumbing', 'Pool maintenance',
  'Electrical', 'Smart-home installation', 'Security systems',
  'Cleaning', 'Air conditioning',
  'Appliance repair', 'Home electronics',
  'Carpentry', 'Furniture repair', 'Furniture making', 'Upholstery',
  'Painting', 'Interior decoration',
  'Furniture moving', 'Pest control', 'Water heaters',
  'Tiling', 'Flooring',
  'Renovation', 'Construction', 'Masonry', 'Plastering',
  'Aluminium', 'Glazing', 'Welding',
  'Satellite and TV', 'Locks and keys',
  'Gardening', 'Landscaping',
  'Barbering', 'Hairdressing', 'Personal styling',
  // Withdrawn: never selectable, still rendered for a stored profile.
  'Home maintenance', 'Household upkeep',
]);

for (const profession of [...professions, ...withdrawnProfessions]) {
  ok(CERTIFIED_WORK_LABELS.has(profession.work.en),
    `${profession.key}: "${profession.work.en}" is a certified work label — `
    + 'add it to CERTIFIED_WORK_LABELS after reading it aloud after "what do you do?"');
}

// The filler that prompted the audit, named so it cannot come back quietly.
for (const profession of professions) {
  ok(!/^General /i.test(profession.work.en),
    `${profession.key}: no "General X" — the plain noun already says it`);
  ok(!/^عام |\bعامة$| عام$/.test(profession.work.ar),
    `${profession.key}: no Arabic "عام" filler`);
  ok(!/\bgénérale?\b/i.test(profession.work.fr),
    `${profession.key}: no French "générale" filler`);
}

// --- A professional selector never falls back to the person noun ------------
// The fallback in `professionLabel` exists for keys from before this taxonomy.
// Every CURRENT profession must resolve a real work label, or a professional
// somewhere is being shown a title for themselves.
for (const profession of professions) {
  for (const language of LANGUAGES) {
    const work = professionLabel(profession.key, language, 'professional');
    ok(work !== profession.person[language] || profession.work[language] === profession.person[language],
      `${profession.key}/${language}: the professional form is not the person form by accident`);
  }
}

// --- The work picker shows no category headings -----------------------------
/*
 * It used to show one per group, correctly: when the rows were person nouns,
 * "Plumbing" above Plumber and Pool technician named something the rows did
 * not. Plain work nouns removed that gap -- the category name became one of its
 * own rows -- and every attempt to keep the heading where it still fit made
 * things worse rather than better:
 *
 *   drop it on collision   the list's SHAPE became language-dependent, three
 *                          headings in English against two in Arabic and four
 *                          in French, because collision is a property of a
 *                          translation and not of the grouping. It also kept
 *                          "Flooring & tiling" directly above Tiling and
 *                          Flooring, where no single row matched the whole.
 *   decide per category    did not escape it: the Arabic heading for alumetal
 *                          is ألوميتال, which is exactly its own first row.
 *                          One heading survived in thirty-four rows, which
 *                          reads as an accident rather than as structure.
 *
 * The first row of each group is the better heading -- a full row with an icon
 * and a touch target instead of a small grey caption -- which for a
 * professional who does not read fluently is the stronger signal.
 *
 * This is pinned because the reasoning is invisible in the diff: the obvious
 * "improvement" is to put the headings back.
 */
{
  const source = readFileSync('components/warsha/ProfessionSelector.tsx', 'utf8');
  ok(!/serviceCategoryTranslationKey/.test(source),
    'the work picker does not resolve a category heading — the row carrying the '
    + "category's own name is the heading, and it can be chosen");
  ok(!/sectionTitle/.test(source),
    'and it has no heading style left to render one with');
  // The grouping itself must survive: this is about the label, not the seams.
  ok(/categoryId/.test(source) && /sectionRows/.test(source),
    'the rows are still grouped by category — the spacing carries it');
}

console.log(`Profession audience: ${checks} checks passed.`);
