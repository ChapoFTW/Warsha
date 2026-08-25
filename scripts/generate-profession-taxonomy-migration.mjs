/**
 * Emit the SQL seed for `public.professions` and
 * `public.profession_service_categories` from the shared taxonomy.
 *
 * The mapping has exactly one author: `src/providers/profession-taxonomy.ts`.
 * Web, Android and iOS read it directly; the database needs the same facts to
 * refuse a payload that a stale or hand-made client sends, and generating the
 * rows is how the two stay the same fact rather than two facts that agree
 * today. `wps025-worker-experience.test.mts` asserts the emitted SQL still
 * matches the module, so editing one without the other fails the suite.
 *
 * Usage: node --experimental-strip-types scripts/generate-profession-taxonomy-migration.mjs
 */
import { professions, withdrawnProfessions } from '../src/providers/profession-taxonomy.ts';
import { specificServicesFor } from '../src/services/specific-services.ts';

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

export function professionRowsSql() {
  const active = professions.map((profession, index) =>
    `  (${quote(profession.key)}, ${quote(profession.categoryId)}, ${index + 1}, true)`);
  // Withdrawn trades keep the catch-all category they named, so an old profile
  // still resolves to something rather than to a dangling reference.
  const withdrawn = withdrawnProfessions.map((profession, index) =>
    `  (${quote(profession.key)}, 'general-maintenance', ${professions.length + index + 1}, false)`);
  return [...active, ...withdrawn].join(',\n');
}

export function professionCategoryRowsSql() {
  const rows = [];
  for (const profession of professions) {
    profession.serviceCategoryIds.forEach((categoryId, index) => {
      rows.push(`  (${quote(profession.key)}, ${quote(categoryId)}, ${index + 1})`);
    });
  }
  return rows.join(',\n');
}

export function professionServicePruningSql() {
  const statements = [];
  for (const profession of professions) {
    const categoryKeys = profession.serviceCategoryIds
      .flatMap(categoryId => specificServicesFor(categoryId).map(service => service.key));
    if (categoryKeys.length === profession.serviceKeys.length
      && categoryKeys.every(key => profession.serviceKeys.includes(key))) continue;
    statements.push(
      `delete from public.profession_services ps\n`
      + `using public.services s\n`
      + `where ps.service_id = s.id and ps.profession_id = ${quote(profession.key)}\n`
      + `  and s.translation_key not in (${profession.serviceKeys.map(quote).join(', ')});`,
    );
  }
  return statements.join('\n\n');
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
  || process.argv[1]?.endsWith('generate-profession-taxonomy-migration.mjs')) {
  console.log('-- professions');
  console.log(professionRowsSql());
  console.log('-- profession_service_categories');
  console.log(professionCategoryRowsSql());
  console.log('-- profession_services specialist pruning');
  console.log(professionServicePruningSql());
}
