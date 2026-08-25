import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseServices } from '../web/lib/customer.ts';
import {
  catalogueServiceLabel, orderedCatalogueServices, specificServiceLabel,
} from '../src/services/specific-services.ts';

/**
 * The dropdown, exercised the way the page builds it.
 *
 * Human QA found plumbing rendering "Blocked drain", "Home inspection", "Leak
 * repair" in an Arabic interface. Every existing test passed, because they all
 * proved the same thing: that a translation EXISTS. None of them proved the
 * screen consumes it.
 *
 * That is the gap this file closes. It starts from a payload shaped like the
 * one the RPC returns, runs it through the real `parseServices`, applies the
 * real ordering and the real resolver, and asserts on the strings that would
 * appear inside `<option>`. A test that reached into the catalogue and read
 * `service.ar` directly would pass while the page rendered English -- which is
 * exactly what happened.
 *
 * The alphabetical order in the QA report was the tell: `Blocked drain, Home
 * inspection, Leak repair` is the server's `order by s.name`, not the
 * catalogue's. Losing the key loses the ordering and the language together, so
 * both are asserted here.
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

/** Shaped exactly like `get_marketplace_catalog_v2().services`, snake_case included. */
function catalogPayload() {
  return {
    services: [
      // Deliberately in the server's alphabetical order, and deliberately
      // including the row that predates keys.
      { id: 'uuid-blocked', category_id: 'plumbing', name: 'Blocked drain', translation_key: 'plumbing-blocked-drain' },
      { id: 'uuid-legacy', category_id: 'plumbing', name: 'Home inspection', translation_key: 'plumbing-inspection' },
      { id: 'uuid-leak', category_id: 'plumbing', name: 'Leak repair', translation_key: 'plumbing-leak-repair' },
      { id: 'uuid-tapfix', category_id: 'plumbing', name: 'Tap repair', translation_key: 'plumbing-tap-repair' },
      // A row with no key at all: the compatibility path.
      { id: 'uuid-unkeyed', category_id: 'plumbing', name: 'Some old service', translation_key: null },
      { id: 'uuid-lock', category_id: 'locksmithing', name: 'Key copying', translation_key: 'locksmith-key-copy' },
    ],
  };
}

/**
 * The page's derivation -- the real one, not a copy of it.
 *
 * This used to reproduce the ordering and labelling inline, mirroring what the
 * form did. Then native grew the same control and the rule existed in three
 * places, so it moved into `src/services` and both screens now call it. Calling
 * it here too means this test exercises the shipped code path rather than a
 * lookalike that can pass on its own terms while the page breaks.
 */
function optionLabels(categoryId: string, locale: 'en' | 'ar' | 'fr'): string[] {
  return orderedCatalogueServices(parseServices(catalogPayload()), categoryId)
    .map((service) => catalogueServiceLabel(service, locale));
}

// --- The parser must not drop the key ---------------------------------------
// If it does, every rank collapses to MAX_SAFE_INTEGER, the order stays as the
// server sent it, and every label falls through to the English `name`. One
// missing field produces the whole reported symptom.
{
  const services = parseServices(catalogPayload());
  equal(services.length, 6, 'every service row survives parsing');
  const blocked = services.find((service) => service.id === 'uuid-blocked');
  equal(blocked?.translationKey, 'plumbing-blocked-drain',
    'THE PARSER CARRIES translation_key THROUGH AS translationKey');
  equal(services.filter((service) => service.translationKey).length, 5,
    'and every keyed row keeps its key');
  equal(services.find((service) => service.id === 'uuid-unkeyed')?.translationKey, null,
    'while an unkeyed row is honestly null rather than invented');
}

// --- This is the QA failure, as a test --------------------------------------
{
  const arabic = optionLabels('plumbing', 'ar');
  check(!arabic.includes('Blocked drain'),
    'AN ARABIC INTERFACE NEVER RENDERS "Blocked drain"');
  check(!arabic.includes('Home inspection'),
    'nor "Home inspection", the row that predates keys');
  check(!arabic.includes('Leak repair'), 'nor "Leak repair"');
  check(arabic.includes('مواسير مسدودة'), 'IT RENDERS THE ARABIC LABEL INSTEAD');
  check(arabic.includes('معاينة سباكة'),
    'including for the legacy row, which now resolves through its key');
  // Nothing in the list may be Latin script for a keyed service.
  const keyed = arabic.filter((label) => label !== 'Some old service');
  check(keyed.every((label) => /[؀-ۿ]/.test(label)),
    'every keyed option is Arabic, not one of them left in English');
}
{
  const french = optionLabels('plumbing', 'fr');
  check(!french.includes('Blocked drain'), 'a French interface does not render English either');
  check(french.includes('Canalisation bouchée'), 'IT RENDERS THE FRENCH LABEL');
  check(french.includes('Diagnostic plomberie'), 'including for the legacy row');
}
{
  const english = optionLabels('plumbing', 'en');
  check(english.includes('Blocked drain'), 'English still renders English');
  check(english.includes('Plumbing inspection'),
    'and the legacy row shows its catalogue name rather than its stored one');
}

// --- Ordering comes from the key too ----------------------------------------
// The server sends alphabetical; the catalogue decides what a customer sees.
{
  const english = optionLabels('plumbing', 'en');
  equal(english[0], 'Leak repair',
    'THE CATALOGUE ORDER WINS, NOT THE SERVER\'S ALPHABETICAL ONE');
  check(english.indexOf('Leak repair') < english.indexOf('Blocked drain'),
    'so the common job leads');
  equal(english[english.length - 1], 'Some old service',
    'and a row this build does not know sorts last rather than first');
}

// --- The same id must change label with the language ------------------------
// Pre-localizing the payload once, in English, would produce exactly the defect
// QA found: correct on first paint, wrong the moment somebody switches.
{
  const sequence = ['en', 'ar', 'fr', 'en'] as const;
  const seen = sequence.map((locale) => optionLabels('plumbing', locale)[0]);
  equal(seen, ['Leak repair', 'إصلاح تسريب', 'Réparation de fuite', 'Leak repair'],
    'EN -> AR -> FR -> EN RECOMPUTES FROM THE KEY EVERY TIME');
  check(new Set(seen).size === 3,
    'and the three languages genuinely differ rather than sharing a cached string');
}
// A second category, so this is not a plumbing-shaped fix.
{
  equal(optionLabels('locksmithing', 'ar')[0], 'نسخ مفاتيح',
    'locksmithing localizes too');
  equal(optionLabels('locksmithing', 'fr')[0], 'Reproduction de clés',
    'in French as well');
}

// --- The unkeyed row is the only thing allowed to show its stored name ------
{
  for (const locale of ['en', 'ar', 'fr'] as const) {
    const labels = optionLabels('plumbing', locale);
    equal(labels.filter((label) => label === 'Some old service').length, 1,
      `the unkeyed row falls back to its stored name in ${locale}`);
  }
}

// --- The page must actually use this path -----------------------------------
// The derivation above is a copy. These assert the real screen is built the
// same way, so the copy cannot drift into a version that only passes here.
{
  const form = readFileSync('web/app/app/requests/new/page.tsx', 'utf8');
  check(/catalogueServiceLabel\(service, locale\)/.test(form),
    'THE FORM RESOLVES THE LABEL FROM THE KEY AND THE ACTIVE LOCALE');
  const shared = readFileSync('src/services/specific-services.ts', 'utf8');
  check(/\|\| service\.name/.test(shared),
    'with the stored name as a fallback, not as the normal path');
  // The exact pattern that shipped the bug.
  const optionBlock = /<option key=\{service\.id\}[\s\S]{0,240}?<\/option>/.exec(form)?.[0] ?? '';
  check(optionBlock.length > 0, 'the service option is identifiable');
  check(!/>\{service\.name\}</.test(optionBlock),
    'AND NEVER RENDERS service.name DIRECTLY FOR A KEYED SERVICE');
  check(/orderedServices\.map/.test(form),
    'the list is the catalogue-ordered one, not the raw server order');
  check(/orderedCatalogueServices\(services, categoryId\)/.test(form),
    'ordered by the shared catalogue, through the derivation native also uses');
  check(/locale/.test(form) && /useAppLocale/.test(form),
    'and the locale it resolves with is the live one, not a captured constant');
  // Recomputation: the memo must depend on the data, and the label call must sit
  // inside render so a locale change re-runs it.
  check(/\[services, categoryId\]/.test(form),
    'the ordering memo depends on the data it orders');
  const renderIndex = form.indexOf('catalogueServiceLabel(service, locale)');
  const memoIndex = form.indexOf('const orderedServices');
  check(renderIndex > memoIndex,
    'the label is resolved at render, so switching language relabels without refetching');
}
{
  const parser = readFileSync('web/lib/customer.ts', 'utf8');
  check(/translationKey: str\(row\.translation_key\)/.test(parser),
    'the parser reads the snake_case field the server actually sends');
  const serviceType = /export type Service = \{[\s\S]*?\n\};/.exec(parser)?.[0] ?? '';
  check(/translationKey: string \| null/.test(serviceType),
    'and the type carries it, so dropping it is a compile error');
}

// --- The other consumer: job history ----------------------------------------
// `service_name_snapshot` is the English name recorded at booking time. It is
// the right fallback and the wrong normal case, which is the same defect the
// request form had, in a place QA had not looked yet.
{
  const jobs = readFileSync('web/app/app/jobs/page.tsx', 'utf8');
  check(/services\(translation_key\)/.test(jobs),
    'THE JOBS QUERY ASKS FOR THE SERVICE KEY, NOT JUST THE SNAPSHOT');
  check(/function serviceLabel\(booking: Booking, locale: Locale\)/.test(jobs),
    'and resolves it through one helper, so the call sites cannot disagree');
  check(/specificServiceLabel\(booking\.serviceTranslationKey, locale\)/.test(jobs),
    'using the shared resolver and the live locale');
  check(/\|\| booking\.serviceName/.test(jobs),
    'with the historical snapshot as the fallback');
  check(!/>\{booking\.serviceName\}</.test(jobs),
    'AND NEVER RENDERS THE ENGLISH SNAPSHOT DIRECTLY');
  const parser = readFileSync('web/lib/customer.ts', 'utf8');
  check(/serviceTranslationKey: str\(record\(row\.services\)\.translation_key\)/.test(parser),
    'the booking parser carries the joined key through');
}

console.log(`Specific-service rendering: ${checks} checks passed.`);
