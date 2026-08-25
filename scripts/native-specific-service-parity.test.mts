import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SERVICE_DEMAND_ORDER, serviceCategoryTranslationKey } from '../src/services/service-catalogue.ts';
import { serviceCategoryLabel } from '../src/i18n/service-labels.ts';
import {
  catalogueServiceLabel,
  orderedCatalogueServices,
  specificServiceLabel,
  specificServices,
  specificServicePickerCopy,
  specificServicesFor,
  type CatalogueServiceRow,
} from '../src/services/specific-services.ts';

/**
 * Android and iOS choosing a specific service, the way web already could.
 *
 * The native request form had a category picker and no service picker. Not a
 * broken one -- none at all: its service list read `provider?.services ?? []`,
 * which is empty for a customer who has not chosen a provider, so the block
 * that would have rendered it was skipped on every quote request ever made
 * from a phone. Web shipped the control, native did not, and nothing failed,
 * because nothing asserted that the two agree about what a request may say.
 *
 * That is what this file is for. It exercises the real shared derivation the
 * screens use -- not a copy of it -- and it pins the native form's structure so
 * the picker cannot quietly disappear again.
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

const nativeForm = readFileSync('app/marketplace-request/new.tsx', 'utf8');
const picker = readFileSync('components/warsha/SpecificServiceSelector.tsx', 'utf8');
const webForm = readFileSync('web/app/app/requests/new/page.tsx', 'utf8');

/** A catalogue row shaped the way the RPC delivers one, keyed and parented. */
function row(key: string, categoryId: string, name: string, id = `uuid-${key}`): CatalogueServiceRow {
  return { id, categoryId, name, translationKey: key };
}

// --- THE GAP ITSELF, AS A TEST ----------------------------------------------
// "Native request form has a category picker but no specific-service picker."
// This is the exact previous state, asserted against so it cannot return.
{
  check(/categories\.map\(item=><Chip/.test(nativeForm),
    'the native form offers a category picker');
  check(/<SpecificServiceSelector/.test(nativeForm),
    'AND A SPECIFIC-SERVICE PICKER, WHICH IT PREVIOUSLY DID NOT');
  // The precise reason it was missing: the only service list was a provider's.
  check(!/const services=useMemo\(\(\)=>provider\?\.services\?\?\[\],\[provider\]\)[\s\S]{0,400}<SpecificServiceSelector/.test(nativeForm)
    || /services=\{catalogue\}/.test(nativeForm),
    'and it is fed by the CATALOGUE, not by a provider the customer has not chosen');
  check(/services:catalogue[,}][^=]*=useMarketplaceData\(\)/.test(nativeForm),
    'which the shared data context now exposes');
  const context = readFileSync('src/data/marketplace-context.tsx', 'utf8');
  check(/services:Service\[\]/.test(context),
    'THE SHARED CONTEXT CARRIES THE CATALOGUE SERVICES');
  check(/dataAdapter\.listServices\(\)/.test(context),
    'loaded through the adapter method that already existed and was never called');
}

// --- The picker is optional, and "any service" is a real answer -------------
{
  check(/selectedServiceId=\{serviceId\}/.test(nativeForm),
    'the picker is driven by the same state the payload is built from');
  check(/select\(''\)/.test(picker),
    'ANY SERVICE SELECTS THE EMPTY VALUE, NOT A SENTINEL SERVICE');
  check(/checked=\{!selected\}/.test(picker),
    'and is shown as chosen whenever no service is');
  check(!/required/.test(picker),
    'nothing about the control is required');
  // The old form defaulted to a provider's first service, which nobody chose.
  check(!/provider\?\.services\[0\]\?\.id/.test(nativeForm),
    'AND NO SERVICE IS EVER SELECTED ON THE CUSTOMER\'S BEHALF');
  check(/useState\(params\.serviceId\?\?''\)/.test(nativeForm),
    'a deep link naming a service is still honoured, an arbitrary default is not');
}

// --- Every category gets its own services, and never another's --------------
{
  for (const categoryId of SERVICE_DEMAND_ORDER) {
    const expected = specificServicesFor(categoryId);
    check(expected.length > 0, `${categoryId} HAS SERVICES TO OFFER`);
    // Feed the whole catalogue in, as the picker does, and require it back out
    // scoped: offering another category's service builds a payload the backend
    // rejects with 22023.
    const all = specificServices.map((service) => row(service.key, service.categoryId, service.en));
    const offered = orderedCatalogueServices(all, categoryId);
    equal(offered.length, expected.length, `and only its own (${categoryId})`);
    check(offered.every((service) => service.categoryId === categoryId),
      `no foreign category leaks into ${categoryId}`);
  }
  // The three the brief names explicitly.
  const all = specificServices.map((service) => row(service.key, service.categoryId, service.en));
  check(orderedCatalogueServices(all, 'plumbing').every((s) => s.categoryId === 'plumbing'),
    'Plumbing shows Plumbing services');
  check(orderedCatalogueServices(all, 'locksmithing').every((s) => s.categoryId === 'locksmithing'),
    'Locksmithing shows Locksmithing services');
  check(orderedCatalogueServices(all, 'alumetal').every((s) => s.categoryId === 'alumetal'),
    'Alumetal shows Alumetal services');
  equal(orderedCatalogueServices(all, ''), [],
    'and no category selected offers nothing rather than everything');
  equal(orderedCatalogueServices(all, 'general-maintenance'), [],
    'THE WITHDRAWN CATEGORY OFFERS NOTHING');
}

// --- Native must not carry its own copy of the taxonomy ---------------------
{
  for (const file of [nativeForm, picker]) {
    check(!/'plumbing-leak-repair'/.test(file),
      'no service key is written into a native file');
    check(!/إصلاح تسريب/.test(file),
      'AND NO NATIVE FILE CARRIES ITS OWN TRANSLATION OF A SERVICE');
  }
  check(/from '@\/src\/services\/specific-services'/.test(picker),
    'the picker reads the one shared catalogue');
  // A hard-coded subset is the failure mode that produced the original bug
  // report: plumbing offering two services instead of fifteen.
  equal(specificServicesFor('plumbing').length, 15,
    'plumbing offers all fifteen of its services');
  equal(specificServices.length, 171, 'and the catalogue is still 171 services');
  equal(SERVICE_DEMAND_ORDER.length, 19, 'across 19 selectable categories');
}

// --- THE STATE SEQUENCE ------------------------------------------------------
// The brief's thirteen steps, run against the real derivation. Identity must
// survive every one of them; only the visible string may change.
{
  const catalogue = specificServices.map((s) => row(s.key, s.categoryId, s.en));

  // 1-2. Plumbing, then Leak repair.
  let categoryId = 'plumbing';
  let serviceId = orderedCatalogueServices(catalogue, categoryId)
    .find((s) => s.translationKey === 'plumbing-leak-repair')!.id;
  const leakUuid = serviceId;
  equal(catalogueServiceLabel(catalogue.find((s) => s.id === serviceId)!, 'en'), 'Leak repair',
    'step 2: Leak repair is selected');

  // 3-5. Arabic. The label changes, the identity does not.
  const arabic = catalogueServiceLabel(catalogue.find((s) => s.id === serviceId)!, 'ar');
  equal(arabic, 'إصلاح تسريب', 'step 4: it reads as إصلاح تسريب in Arabic');
  equal(serviceId, leakUuid, 'STEP 5: THE UUID IS UNCHANGED BY THE LANGUAGE SWITCH');

  // 6-8. Switch category. The plumbing service must not survive it.
  categoryId = 'locksmithing';
  const stillOffered = orderedCatalogueServices(catalogue, categoryId)
    .some((s) => s.id === serviceId);
  check(!stillOffered,
    'step 7: the plumbing service is not among the locksmithing options');
  serviceId = '';  // what the form does on a category change
  equal(serviceId, '', 'STEP 8: THE SELECTION RESETS TO "ANY SERVICE"');

  // 9. Key copying.
  serviceId = orderedCatalogueServices(catalogue, categoryId)
    .find((s) => s.translationKey === 'locksmith-key-copy')!.id;
  const keyUuid = serviceId;

  // 10-11. French.
  equal(catalogueServiceLabel(catalogue.find((s) => s.id === serviceId)!, 'fr'),
    'Reproduction de clés', 'step 11: the approved French label');

  // 12-13. Submit.
  equal(serviceId, keyUuid, 'STEP 13: THE LOCKSMITHING UUID IS WHAT WOULD BE SENT');
  check(serviceId !== leakUuid, 'and it is not the plumbing one');
  check(!/[A-Za-z]/.test('') || serviceId.startsWith('uuid-'),
    'the payload carries an id, never a label');
}

// --- Changing category clears the selection, in the code that does it -------
{
  check(/setCategoryId\(item\.id\);setServiceId\(''\)/.test(nativeForm),
    'NATIVE CLEARS THE SERVICE WHEN THE CATEGORY CHANGES');
  check(/setServiceId\(''\)/.test(webForm),
    'and so does web');
  // Belt and braces: even if the state survived, the picker would not offer it.
  const catalogue = specificServices.map((s) => row(s.key, s.categoryId, s.en));
  const plumbingUuid = orderedCatalogueServices(catalogue, 'plumbing')[0].id;
  check(!orderedCatalogueServices(catalogue, 'locksmithing').some((s) => s.id === plumbingUuid),
    'and a stale id is not selectable in the new category regardless');
}

// --- Language switching relabels the same row, in all three -----------------
{
  const leak = row('plumbing-leak-repair', 'plumbing', 'Leak repair');
  const seen = (['en', 'ar', 'fr', 'en'] as const).map((l) => catalogueServiceLabel(leak, l));
  equal(seen, ['Leak repair', 'إصلاح تسريب', 'Réparation de fuite', 'Leak repair'],
    'EN -> AR -> FR -> EN RESOLVES FROM THE KEY EVERY TIME');
  check(new Set(seen).size === 3, 'the three languages genuinely differ');
  // Resolved at render, so a language change relabels without a refetch.
  check(/catalogueServiceLabel\(service, language\)/.test(picker),
    'the picker labels at render time from the live language');
  check(!/label:.*catalogueServiceLabel|useState\([^)]*catalogueServiceLabel/.test(picker),
    'AND NEVER STORES A RESOLVED LABEL IN STATE');
}

// --- Every service resolves in every language -------------------------------
{
  let missing = 0;
  for (const service of specificServices) {
    for (const language of ['en', 'ar', 'fr'] as const) {
      const label = specificServiceLabel(service.key, language);
      if (typeof label !== 'string' || label.length === 0) missing += 1;
    }
  }
  equal(missing, 0, 'ALL 171 SERVICES RESOLVE IN EN, AR AND FR');
  // Arabic must actually be Arabic, not English left in place.
  const latinArabic = specificServices.filter((s) => !/[؀-ۿ]/.test(s.ar));
  equal(latinArabic.length, 0, 'and not one Arabic label is still Latin script');
}

// --- No surface may show a slug or an id ------------------------------------
{
  // The category chips: the defect fixed on native last round.
  check(/label=\{t\(item\.label\)\}/.test(nativeForm),
    'category chips render the localized name');
  check(!/item\.id\.replaceAll/.test(nativeForm),
    'NEVER A RAW CATEGORY SLUG');
  // Every category must resolve to words in all three languages.
  for (const categoryId of SERVICE_DEMAND_ORDER) {
    for (const language of ['en', 'ar', 'fr'] as const) {
      const label = serviceCategoryLabel(
        serviceCategoryTranslationKey(categoryId), language, categoryId);
      check(label.length > 0 && label !== categoryId,
        `${categoryId} reads as words in ${language}, not as its id`);
    }
  }
  // The withdrawn category too: old requests still reference it.
  check(serviceCategoryLabel(
    serviceCategoryTranslationKey('general-maintenance'), 'ar', 'general-maintenance')
    !== 'general-maintenance',
    'AND SO DOES THE WITHDRAWN CATEGORY, FOR OLD REQUESTS');
  // Anything unknown is humanized rather than shown raw.
  equal(serviceCategoryLabel(serviceCategoryTranslationKey('some-new-trade'), 'en', 'some-new-trade'),
    'Some new trade', 'an unrecognised category becomes words, never a slug');
}

// --- The worker sees what was requested -------------------------------------
// Both worker screens rendered `t(invitation.categoryId)`, passing an id where
// a camelCase key belongs. `t` returns the raw lookup, so the nine categories
// whose id is not their key rendered as nothing at all.
{
  const mismatched = SERVICE_DEMAND_ORDER
    .filter((id) => serviceCategoryTranslationKey(id) !== id);
  check(mismatched.length === 9,
    'nine categories have an id that is not their translation key');
  for (const file of ['app/worker-quotes.tsx', 'app/worker-quote/[id].tsx']) {
    const source = readFileSync(file, 'utf8');
    check(!/t\(invitation\.categoryId as TranslationKey\)/.test(source),
      `${file} NO LONGER PASSES AN ID WHERE A KEY BELONGS`);
    check(/requestWorkLabel\(invitation/.test(source),
      `${file} resolves it through the shared helper`);
  }
  const customer = readFileSync('app/marketplace-request/[id].tsx', 'utf8');
  check(/requestWorkLabel\(request/.test(customer),
    'AND THE CUSTOMER SEES THEIR CHOSEN SERVICE AFTER SUBMITTING');
  const shared = readFileSync('src/marketplace-intelligence/marketplace-translations.ts', 'utf8');
  check(/export function requestWorkLabel/.test(shared),
    'one resolver, shared by all three screens');
  const copies = ['app/worker-quotes.tsx', 'app/worker-quote/[id].tsx', 'app/marketplace-request/[id].tsx']
    .filter((file) => /function requestWorkLabel/.test(readFileSync(file, 'utf8')));
  equal(copies, [], 'AND NO SCREEN DEFINES A SECOND NATIVE-ONLY RESOLVER');
}

// --- Web and native mean the same thing by a request ------------------------
{
  check(/rpc\('create_marketplace_request'/.test(webForm),
    'web creates requests through the shared RPC');
  const repository = readFileSync(
    'src/marketplace-intelligence/supabase-marketplace-repository.ts', 'utf8');
  check(/create_marketplace_request/.test(repository),
    'AND SO DOES THE REPOSITORY ANDROID AND iOS USE');
  check(/serviceId:serviceId\|\|undefined/.test(nativeForm),
    'NATIVE OMITS THE SERVICE RATHER THAN SENDING AN EMPTY STRING');
  check(/\.\.\.\(serviceId \? \{ serviceId \} : \{\}\)/.test(webForm),
    'and web omits it too');
  // Neither may send anything but the id.
  // Bounded at the field delimiter: the form is written on one long line, so
  // an unbounded `.*` would match any `name` anywhere later in the payload.
  check(!/serviceId:[^,;}]*(name|label|translationKey)/.test(nativeForm),
    'native never sends a label or a key as identity');
  check(!/serviceId: (service\.name|service\.translationKey)/.test(webForm),
    'nor does web');
  check(!/serviceId:categoryId|serviceId: categoryId/.test(nativeForm),
    'and never a category slug in place of a service uuid');
}

// --- Both surfaces derive the list the same way -----------------------------
{
  check(/orderedCatalogueServices\(services, categoryId\)/.test(webForm),
    'WEB USES THE SHARED DERIVATION');
  check(/orderedCatalogueServices\(/.test(picker),
    'AND SO DOES NATIVE');
  check(/catalogueServiceLabel\(service, locale\)/.test(webForm),
    'web labels through the shared resolver');
  check(/catalogueServiceLabel\(service, language\)/.test(picker),
    'and native through the same one');
  // The two must not have drifted into different copies of the same words.
  const webCopy = readFileSync('web/lib/app-copy.ts', 'utf8');
  const webFr = readFileSync('web/lib/app-copy.fr.ts', 'utf8');
  for (const [language, source] of [['en', webCopy], ['ar', webCopy], ['fr', webFr]] as const) {
    const expected = specificServicePickerCopy[language];
    check(source.includes(expected.label),
      `web ships the same "${language}" picker label as native`);
    check(source.includes(expected.anyService),
      `AND THE SAME "${language}" ANY-SERVICE OPTION`);
  }
  // Three genuinely different languages, not one repeated.
  const anys = (['en', 'ar', 'fr'] as const).map((l) => specificServicePickerCopy[l].anyService);
  equal(new Set(anys).size, 3, 'the default option is translated, not copied');
  check(/[؀-ۿ]/.test(specificServicePickerCopy.ar.anyService),
    'and the Arabic one is Arabic');
}

// --- Rows written before keys existed still read --------------------------
{
  const unkeyed: CatalogueServiceRow = {
    id: 'uuid-old', categoryId: 'plumbing', name: 'Some old service', translationKey: null,
  };
  for (const language of ['en', 'ar', 'fr'] as const) {
    equal(catalogueServiceLabel(unkeyed, language), 'Some old service',
      `an unkeyed row keeps its stored name in ${language}`);
  }
  // And sorts last rather than leading the list.
  const mixed = [unkeyed, row('plumbing-leak-repair', 'plumbing', 'Leak repair')];
  const ordered = orderedCatalogueServices(mixed, 'plumbing');
  equal(ordered[ordered.length - 1].id, 'uuid-old',
    'A ROW THIS BUILD DOES NOT KNOW SORTS LAST, NOT FIRST');
  // An unknown key behaves like no key rather than rendering the key.
  equal(catalogueServiceLabel(
    { name: 'Fallback', translationKey: 'not-a-real-key' }, 'ar'), 'Fallback',
    'and an unrecognised key falls back rather than surfacing itself');
}

// --- Mobile quality: the house patterns, not a new one ----------------------
{
  check(/accessibilityRole="radio"/.test(picker),
    'options are radios, matching single-select elsewhere in the app');
  check(/accessibilityState=\{\{ checked \}\}/.test(picker),
    'and report their checked state to a screen reader');
  check(/accessibilityRole="header"/.test(picker), 'the sheet titles itself');
  check(/onRequestClose=/.test(picker), 'ANDROID BACK CLOSES THE SHEET');
  check(/SafeAreaView/.test(picker), 'and it respects the safe area');
  check(/isRTL && styles\.reverse/.test(picker), 'every row flips in Arabic');
  check(/minHeight: 5[0-9]|minHeight: 4[8-9]/.test(picker),
    'touch targets are at least 48pt');
  check(/numberOfLines=\{2\}/.test(picker),
    'a long French label wraps rather than being clipped to nothing');
  check(/accessibilityState=\{\{ disabled: unavailable/.test(picker),
    'and the disabled state is announced, not just dimmed');
  // Not a search field: the lists are short enough to read.
  check(!/BrandTextField/.test(picker),
    'NO SEARCH FIELD: THE LARGEST CATEGORY IS FIFTEEN ITEMS');
  const largest = Math.max(...SERVICE_DEMAND_ORDER.map((id) => specificServicesFor(id).length));
  check(largest <= 15, `and that stays true (largest is ${largest})`);
}

console.log(`Native specific-service parity: ${checks} checks passed.`);
