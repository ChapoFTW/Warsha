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
  ok(/tradeTitle: 'What work do you do\?'/.test(copy),
    'the trade step asks what work they do, not which noun they are');
  ok(/tradeTitle: 'بتشتغل إيه؟'/.test(copy),
    'and asks it in Egyptian Arabic the way it is actually asked');
  ok(/tradeTitle: 'Quel travail faites-vous \?'/.test(copy),
    'and in French');
}

console.log(`Profession audience: ${checks} checks passed.`);
