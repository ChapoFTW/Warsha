import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  humanizeServiceKey, serviceCategoryDescription, serviceCategoryLabel,
} from '../src/i18n/service-labels.ts';

/**
 * Customer-facing surfaces must never render a backend identifier.
 *
 * Arabic customers were shown `satellite-tv-installation` because web resolved
 * the category's translation key against its own copy catalogue, which has
 * never contained those entries, and fell back to the raw id. Mobile reads the
 * shared authority and was always correct. These checks fail if web drifts back
 * to its own catalogue or reintroduces an id fallback.
 */

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

// The canonical list comes from the seed, so this tracks the backend rather
// than a copy of it that can go stale.
const seed = readFileSync('supabase/seed.sql', 'utf8');
const categoryRows = [...seed.matchAll(/\('([a-z0-9-]+)','(\w+)','(\w+)'/g)]
  .map(([, id, translationKey, descriptionKey]) => ({ id, translationKey, descriptionKey }));

check(categoryRows.length >= 10,
  `the seeded service categories are readable (found ${categoryRows.length})`);

const LANGUAGES = ['en', 'ar', 'fr'] as const;

for (const row of categoryRows) {
  for (const language of LANGUAGES) {
    const label = serviceCategoryLabel(row.translationKey, language, row.id);
    check(label.length > 0, `${row.id} has a ${language} name`);
    check(label !== row.id,
      `${row.id} DOES NOT RENDER ITS BACKEND ID IN ${language.toUpperCase()}`);
    check(label !== row.translationKey,
      `${row.id} does not render its translation key in ${language}`);
    check(!/[-_]/.test(label) || /\s/.test(label),
      `${row.id} does not render a slug shape in ${language}`);
    const description = serviceCategoryDescription(row.descriptionKey, language);
    check(description !== row.descriptionKey,
      `${row.id} does not render its description key in ${language}`);
  }
  // Arabic must be genuinely different text, not an English fallback.
  check(serviceCategoryLabel(row.translationKey, 'ar', row.id)
    !== serviceCategoryLabel(row.translationKey, 'en', row.id),
    `${row.id} IS ACTUALLY TRANSLATED INTO ARABIC, NOT FALLING BACK TO ENGLISH`);
}

// The specific values from the reported defect.
equal(serviceCategoryLabel('electrical', 'ar', 'electrical'), 'كهرباء',
  'electrical reads as كهرباء in Arabic');
equal(serviceCategoryLabel('satelliteTv', 'ar', 'satellite-tv-installation'),
  'تركيب دش وتلفزيون',
  'satellite-tv-installation reads as Arabic words, not a slug');
equal(serviceCategoryLabel('electrical', 'fr', 'electrical'), 'Électricité',
  'and French is a real translation rather than English');

// An unseeded category still must not reach a customer as an identifier.
equal(humanizeServiceKey('satellite-tv-installation'), 'Satellite tv installation',
  'an unknown key degrades to words, never to a slug');
equal(serviceCategoryLabel('not_a_real_key', 'en', 'some-new-category'),
  'Some new category',
  'AN UNRESOLVED CATEGORY NEVER RENDERS ITS RAW ID');

// --- The render sites must not reintroduce the fallback ---------------------
const renderSites = [
  'web/app/app/discover/page.tsx',
  'web/app/app/requests/new/page.tsx',
  'web/app/admin/analytics/page.tsx',
];
for (const path of renderSites) {
  const source = readFileSync(path, 'utf8');
  check(!/words\[category\.translationKey\]|copy\[item\.translationKey\]/.test(source),
    `${path} resolves categories through the shared authority`);
  check(!/\?\?\s*category\.id|\?\?\s*item\.id/.test(source),
    `${path} HAS NO RAW-ID FALLBACK LEFT`);
}

// Web must read the shared catalogue, not grow a second one.
const resolver = readFileSync('src/i18n/service-labels.ts', 'utf8');
check(/from '\.\/translations\.ts'/.test(resolver),
  'the resolver lives beside the shared translation authority both clients use');

console.log(`Service labels: ${checks} checks passed.`);
