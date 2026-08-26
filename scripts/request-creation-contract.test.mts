import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { specificServices } from '../src/services/specific-services.ts';
import { SERVICE_DEMAND_ORDER, isLegacyCategory } from '../src/services/service-catalogue.ts';

/**
 * The contract a request must satisfy before it can exist.
 *
 * Human QA could not create a request at all. Every catalogue test passed,
 * because none of them asked the question that matters: is the marketplace
 * ACTUALLY in a state where `create_marketplace_request` will return an id.
 *
 * The real error, reproduced against the development backend as a real customer
 * with `plumbing` and no specific service, was:
 *
 *     SQLSTATE 55000  "Marketplace is temporarily unavailable"
 *
 * `create_marketplace_request` calls `private.assert_marketplace_ready` before
 * it looks at a category or a service, and that function refuses unless three
 * separate pieces of configuration are present. All three were missing, and
 * none of them has anything to do with the 171-service rollout:
 *
 *   1. `marketplace_configuration.enabled` / `.scheduler_enabled` were false.
 *      The singleton row is inserted with `values (true)` for `singleton`
 *      alone, and the only write to `enabled` anywhere is the kill switch
 *      setting it false. No activation path had ever existed.
 *   2. `marketplace_category_duration_defaults` was empty -- never seeded.
 *   3. `marketplace_capacity_configuration.road_factor` and
 *      `.average_urban_speed_kmh` were null.
 *
 * These assert the migration that supplies all three keeps supplying it, and
 * that every selectable category is covered -- because a category without a
 * duration is a category nobody can request, which is how a catalogue
 * expansion could silently break the flow again.
 */

let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
}
function equal<T>(actual: T, expected: T, label: string) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}

const migrations = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .map((name) => readFileSync(join('supabase/migrations', name), 'utf8'))
  .join('\n');

const readiness = readFileSync(
  'supabase/migrations/202608250004_marketplace_request_readiness.sql', 'utf8');

// --- Every selectable category must be requestable --------------------------
// `assert_marketplace_ready` requires a duration row for the category being
// requested. A category in the catalogue without one is a category that renders
// on the discovery screen and then refuses to accept a request.
{
  const seeded = new Set(
    [...readiness.matchAll(/\('([a-z-]+)', (\d+)\)/g)].map(([, id]) => id));
  for (const category of SERVICE_DEMAND_ORDER) {
    check(seeded.has(category),
      `${category} HAS A PLANNING DURATION, SO A REQUEST FOR IT CAN BE CREATED`);
  }
  equal(seeded.size, SERVICE_DEMAND_ORDER.length,
    'and the migration seeds exactly the selectable catalogue, no more');
  check(!seeded.has('general-maintenance'),
    'THE WITHDRAWN CATEGORY GETS NO DURATION, SO IT CANNOT BECOME REQUESTABLE');
  // Durations must be plausible: a zero or negative estimate would schedule
  // nonsense, and the column is `not null` so a missing one fails loudly.
  const minutes = [...readiness.matchAll(/\('[a-z-]+', (\d+)\)/g)].map(([, n]) => Number(n));
  check(minutes.length === SERVICE_DEMAND_ORDER.length, 'every category carries a number');
  check(minutes.every((value) => value >= 30 && value <= 480),
    'and every estimate is a plausible visit length');
}

// --- The three things that were missing -------------------------------------
{
  check(/set\s+enabled = true/.test(readiness),
    'THE MARKETPLACE IS ACTIVATED, WHICH NOTHING HAD EVER DONE');
  check(/scheduler_enabled = true/.test(readiness),
    'and so is the scheduler');
  check(/road_factor = coalesce\(road_factor, [\d.]+\)/.test(readiness)
    && /average_urban_speed_kmh = coalesce\(average_urban_speed_kmh, \d+\)/.test(readiness),
    'the travel estimates the scheduler needs are supplied');
  check(/coalesce\(/.test(readiness),
    'and supplied without overwriting a value an operator has already chosen');
  // The six values `assert_marketplace_ready` pins exactly.
  for (const [column, value] of [
    ['request_lifetime_seconds', '600'], ['initial_collection_seconds', '120'],
    ['edit_window_seconds', '300'], ['worker_no_show_seconds', '900'],
    ['useful_quote_target', '5'], ['fixed_buffer_minutes', '30'],
  ] as [string, string][]) {
    check(new RegExp(`${column} = ${value}`).test(readiness),
      `${column} is set to the value readiness demands`);
  }
}

// --- The migration proves itself --------------------------------------------
// A migration that configures readiness and does not check it is how this
// shipped broken the first time.
{
  check(/perform private\.assert_marketplace_ready\(/.test(readiness),
    'THE MIGRATION RUNS THE REAL PRECONDITION BEFORE IT FINISHES');
  check(/from public\.service_categories c[\s\S]{0,120}is_active/.test(readiness),
    'for every selectable category, not just one');
}

// --- The kill switch is still the operator control --------------------------
{
  check(/marketplace_configuration set enabled = false/.test(migrations),
    'the kill switch that disables the marketplace still exists');
  check(/kill switch/i.test(readiness),
    'and the activation migration says so rather than pretending it is the authority');
}

// --- Request creation must not depend on a provider existing ----------------
// Zero discoverable providers is "nobody available", not "your request failed".
{
  const creation = /create or replace function public\.create_marketplace_request[\s\S]*?\n\$\$;/
    .exec(migrations)?.[0] ?? '';
  check(creation.length > 0, 'the request-creation function is identifiable');
  check(!/is_provider_publicly_discoverable/.test(creation),
    'REQUEST CREATION NEVER CONSULTS PROVIDER DISCOVERABILITY');
  check(!/raise exception[^;]*provider[^;]*not found/i.test(creation),
    'and never refuses because nobody is available');
  // Null service means no restriction, not a missing value.
  check(/service_id is not null and not exists/.test(creation),
    'A NULL SERVICE IS ACCEPTED: ONLY A NON-NULL ONE IS VALIDATED');
  check(/s\.category_id=category_id/.test(creation),
    'and a non-null service must belong to the chosen category');
  check(/s\.is_active/.test(creation),
    'and must be active');
  // Nothing about price. New services are `quote`/0 and that must stay fine.
  check(!/price_egp\s*>\s*0/.test(creation),
    'NO PRICE FLOOR: A QUOTE-PRICED SERVICE AT ZERO IS VALID');
}

// --- One backend contract for all three platforms ---------------------------
{
  const web = readFileSync('web/app/app/requests/new/page.tsx', 'utf8');
  const shared = readFileSync(
    'src/marketplace-intelligence/supabase-marketplace-repository.ts', 'utf8');
  check(/rpc\('create_marketplace_request'/.test(web),
    'web creates requests through the shared RPC');
  check(/create_marketplace_request/.test(shared),
    'AND SO DOES THE SHARED REPOSITORY ANDROID AND iOS USE');
  // The same field names on both sides, or the payload means different things.
  for (const field of ['flowKind', 'categoryId', 'issueDescription', 'scheduleKind']) {
    check(web.includes(field), `web sends ${field}`);
  }
  const nativeForm = readFileSync('app/marketplace-request/new.tsx', 'utf8');
  for (const field of ['flowKind', 'categoryId', 'issueDescription', 'scheduleKind']) {
    check(nativeForm.includes(field), `native sends ${field}`);
  }
  check(/serviceId:serviceId\|\|undefined/.test(nativeForm),
    'NATIVE OMITS THE SERVICE RATHER THAN SENDING AN EMPTY STRING');
  check(/\.\.\.\(serviceId \? \{ serviceId \} : \{\}\)/.test(web),
    'and web omits it too, so both mean the same thing by "any service"');
}

// --- A stale service must never survive a category change -------------------
{
  const nativeForm = readFileSync('app/marketplace-request/new.tsx', 'utf8');
  // Both forms now compose the request as one draft object rather than seven
  // separate pieces of screen state, so the rule is expressed as a single
  // atomic change — which is stronger than two setters that a future edit could
  // separate. What must not change is that the two fields move together.
  check(/patch\(\{categoryId:item\.id,serviceId:''\}\)/.test(nativeForm),
    'NATIVE CLEARS THE SELECTED SERVICE WHEN THE CATEGORY CHANGES');
  const web = readFileSync('web/app/app/requests/new/page.tsx', 'utf8');
  check(/patch\(\{ categoryId: event\.target\.value, serviceId: '' \}\)/.test(web),
    'and web clears it too, in the same single change');
  // A persisted draft must not be a way for a stale service to come back.
  check(/serviceId: ''/.test(web) && /serviceId:''/.test(nativeForm),
    'and neither surface can restore a service without the category that owns it');
  // Every service belongs to exactly one category, so a stale id is always
  // rejectable rather than ambiguous.
  const parents = new Map<string, string>();
  for (const service of specificServices) parents.set(service.key, service.categoryId);
  equal(parents.size, specificServices.length,
    'every specific service has exactly one parent category');
  check(specificServices.every((service) => !isLegacyCategory(service.categoryId)),
    'and none is parented to a withdrawn category');
}

// --- Native must not show a slug where a name belongs -----------------------
// The category chips rendered `id.replaceAll('-',' ')`, so Android and iOS
// showed "water heater repair" while web showed the localized name. Same defect
// class as the specific-service dropdown, on a platform QA had not reached.
{
  const nativeForm = readFileSync('app/marketplace-request/new.tsx', 'utf8');
  check(!/label=\{item\.id\.replaceAll/.test(nativeForm),
    'NATIVE NEVER LABELS A CATEGORY WITH ITS RAW ID');
  check(/label=\{t\(item\.label\)\}/.test(nativeForm),
    'it resolves the localized name from the shared translation key');
}

console.log(`Request-creation contract: ${checks} checks passed.`);
