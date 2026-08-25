import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { providers as mockProviders } from '../src/data/mock-data.ts';
import { requestWorkLabel } from '../src/marketplace-intelligence/request-work-label.ts';
import {
  professionLabel,
  withSelectedProfessions,
} from '../src/providers/profession-taxonomy.ts';
import {
  catalogueServiceLabel,
  cataloguedServiceReferenceLabel,
} from '../src/services/specific-services.ts';
import { parseBookings } from '../web/lib/customer.ts';
import { parseEarnings, parseWorkerBookings, parseWorkerProfile } from '../web/lib/worker.ts';

let checks = 0;
function equal<T>(actual: T, expected: T, label: string) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
}

const leakService = {
  id: '00000000-0000-4000-8000-000000000001',
  categoryId: 'plumbing',
  translationKey: 'plumbing-leak-repair',
  name: 'Leak repair',
  price: 0,
  pricingType: 'quote' as const,
  duration: '',
};
const heaterService = {
  id: '00000000-0000-4000-8000-000000000002',
  categoryId: 'water-heater-repair',
  translationKey: 'water-heater-no-hot-water',
  name: 'No hot water',
  price: 0,
  pricingType: 'quote' as const,
  duration: '',
};
const catalogue = [leakService, heaterService];

for (const provider of mockProviders) {
  for (const service of provider.services) {
    check(Boolean(service.translationKey),
      `${provider.id}/${service.id} mock service carries stable catalogue identity`);
    check(catalogueServiceLabel(service, 'ar') !== service.name,
      `${provider.id}/${service.id} mock service does not render its English name in Arabic`);
  }
}

// Real browser booking parsing: a stored English snapshot must not become the
// visible label after the joined catalogue key crosses the DB boundary.
const customerBooking = parseBookings([{
  id: 'booking-customer',
  service_id: leakService.id,
  service_name_snapshot: 'Leak repair',
  services: { translation_key: leakService.translationKey },
}])[0];
check(Boolean(customerBooking), 'the customer booking parser accepts a DB-shaped row');
equal(customerBooking.serviceTranslationKey, leakService.translationKey,
  'the customer booking parser carries the joined service key');
equal(
  (['en', 'ar', 'fr', 'en'] as const)
    .map(language => cataloguedServiceReferenceLabel(customerBooking, catalogue, language)),
  ['Leak repair', '\u0625\u0635\u0644\u0627\u062d \u062a\u0633\u0631\u064a\u0628', 'R\u00e9paration de fuite', 'Leak repair'],
  'a persisted booking relabels EN -> AR -> FR -> EN from stable identity',
);

// The UUID is a second compatibility route for projections that have not yet
// embedded a key. The stored snapshot remains reserved for truly unknown rows.
equal(cataloguedServiceReferenceLabel({
  serviceId: leakService.id,
  serviceTranslationKey: null,
  serviceName: 'Old English snapshot',
}, catalogue, 'fr'), 'R\u00e9paration de fuite',
'a known UUID resolves through the live catalogue when the embedded key is absent');
equal(cataloguedServiceReferenceLabel({
  serviceId: leakService.id,
  serviceTranslationKey: 'retired-translation-key',
  serviceName: 'Old English snapshot',
}, catalogue, 'fr'), 'R\u00e9paration de fuite',
'a known UUID resolves through the live catalogue when the embedded key is obsolete');
for (const language of ['en', 'ar', 'fr'] as const) {
  equal(cataloguedServiceReferenceLabel({
    serviceId: 'withdrawn-service',
    serviceTranslationKey: null,
    serviceName: 'Historical inspection',
  }, catalogue, language), 'Historical inspection',
  `an unknown historical service keeps its preserved snapshot in ${language}`);
}

// Worker direct-booking history crosses a separate parser and therefore gets
// its own boundary assertion instead of relying on customer coverage.
const workerBooking = parseWorkerBookings([{
  id: 'booking-worker',
  service_id: leakService.id,
  service_name_snapshot: 'Leak repair',
  services: { translation_key: leakService.translationKey },
}])[0];
equal(workerBooking.serviceTranslationKey, leakService.translationKey,
  'the worker booking parser carries the joined service key');
equal(cataloguedServiceReferenceLabel(workerBooking, catalogue, 'ar'),
  '\u0625\u0635\u0644\u0627\u062d \u062a\u0633\u0631\u064a\u0628',
  'worker booking history renders Arabic from the same authority');

const earnings = parseEarnings({
  providerId: 'provider-one',
  transactions: [{
    id: 'earning-one',
    bookingId: 'booking-worker',
    serviceId: leakService.id,
    serviceTranslationKey: leakService.translationKey,
    service: 'Leak repair',
  }],
});
check(Boolean(earnings), 'the worker earnings parser accepts an RPC-shaped object');
equal(earnings?.transactions[0]?.serviceTranslationKey, leakService.translationKey,
  'the worker earnings parser carries the booking service key');
equal(earnings ? cataloguedServiceReferenceLabel({
  serviceId: earnings.transactions[0].serviceId,
  serviceTranslationKey: earnings.transactions[0].serviceTranslationKey,
  serviceName: earnings.transactions[0].service,
}, catalogue, 'fr') : '', 'R\u00e9paration de fuite',
'worker financial history localizes its booking service');

// Worker-profile RPCs return camelCase JSON. Prove the real parser preserves
// translationKey and the profile editor can render it in every locale.
const workerProfile = parseWorkerProfile({
  id: 'provider-one',
  profession: 'waterHeaterTechnician',
  categoryIds: ['water-heater-repair'],
  services: [{
    serviceId: heaterService.id,
    translationKey: heaterService.translationKey,
    name: heaterService.name,
  }],
});
check(Boolean(workerProfile), 'the worker profile parser accepts an RPC-shaped object');
equal(workerProfile?.services[0]?.translationKey, heaterService.translationKey,
  'the worker profile parser preserves the service key');
equal(workerProfile ? catalogueServiceLabel(workerProfile.services[0], 'fr') : '',
  'Pas d\u2019eau chaude', 'the worker profile service renders in French');

// Marketplace requests and invitations store category/service identities, not
// presentation strings. A withdrawn/unknown id is humanized rather than leaked.
equal(requestWorkLabel({
  categoryId: 'water-heater-repair', serviceId: heaterService.id,
}, catalogue, 'en'), 'Water-heater repair \u00b7 No hot water',
'a worker opportunity combines localized category and service labels');
equal(requestWorkLabel({ categoryId: 'retired-special-work' }, [], 'en'),
  'Retired special work', 'an unknown historical category never exposes its slug');

// Profession identities are re-homed in the shared taxonomy, and selecting
// them removes the withdrawn catch-all before a worker saves again.
const rehomed = withSelectedProfessions({
  profession: 'locksmith',
  specialties: ['profession:locksmith'],
  categoryIds: ['general-maintenance'],
}, ['locksmith']);
equal(rehomed.categoryIds, ['locksmithing'],
  'editing a locksmith profile replaces general-maintenance with locksmithing');
equal(professionLabel('waterHeaterTechnician', 'fr'), 'Technicien chauffe-eau',
  'a re-homed profession has canonical French copy');
equal(professionLabel('retired_special-worker', 'en'), 'Retired special worker',
  'an unknown historical profession is humanized rather than rendered as a key');

// Presentation-boundary guard. These are the customer and worker surfaces
// that display a persisted service reference. The predicate is intentionally
// small and mutation-tested below so it fails if a future edit restores a
// snapshot/name expression at the render site.
const referenceConsumers = [
  'app/(tabs)/chat.tsx',
  'app/(tabs)/orders.tsx',
  'app/booking/[id].tsx',
  'app/conversation/[bookingId].tsx',
  'app/provider-job/[id].tsx',
  'components/warsha/ProviderJobsContent.tsx',
  'components/warsha/RecentBookingCard.tsx',
  'web/app/app/jobs/page.tsx',
  'web/app/app/worker/jobs/page.tsx',
  'app/provider-earnings.tsx',
  'web/app/app/worker/earnings/page.tsx',
] as const;
function assertReferenceConsumer(source: string, file: string) {
  assert.match(source, /cataloguedServiceReferenceLabel\(/,
    `${file} resolves persisted service identity through the shared authority`);
  assert.doesNotMatch(source, />\s*\{(?:booking|job|item)\.serviceName\}\s*</,
    `${file} never presents the English snapshot directly`);
  assert.doesNotMatch(source, />\s*\{item\.service\}\s*</,
    `${file} never presents an earnings snapshot directly`);
}
for (const file of referenceConsumers) {
  assertReferenceConsumer(readFileSync(file, 'utf8'), file);
  checks += 2;
}

const serviceRowConsumers = [
  'app/booking/new/[providerId].tsx',
  'app/onboarding/worker.tsx',
  'app/provider/[id].tsx',
  'app/provider-portfolio.tsx',
  'app/worker/profile.tsx',
  'web/components/worker-profile-editor.tsx',
] as const;
function assertServiceRowConsumer(source: string, file: string) {
  assert.match(source, /catalogueServiceLabel\(/,
    `${file} resolves service rows through the shared authority`);
  assert.doesNotMatch(source, />\s*\{(?:service|item|option)\.name\}\s*</,
    `${file} never presents the stored English row name directly`);
}
for (const file of serviceRowConsumers) {
  assertServiceRowConsumer(readFileSync(file, 'utf8'), file);
  checks += 2;
}

// Long catalogue/profession labels must be allowed to wrap. The selected
// modules are the narrowest native cards and the web pills that previously
// forced all contents onto one line.
{
  const chat = readFileSync('app/(tabs)/chat.tsx', 'utf8');
  check(!/styles\.service[^>]*numberOfLines=\{1\}/.test(chat),
    'chat service labels are not clipped to one line');
  for (const file of [
    'components/warsha/ProviderCard.tsx',
    'components/warsha/DiscoveryResultCard.tsx',
  ]) {
    const source = readFileSync(file, 'utf8');
    check(!/numberOfLines=\{1\} style=\{styles\.profession\}/.test(source),
      `${file} lets long French profession labels wrap`);
  }
  const categoryCard = readFileSync('components/warsha/CategoryCard.tsx', 'utf8');
  check(!/numberOfLines=\{1\}/.test(categoryCard) && /minHeight:112/.test(categoryCard),
    'narrow category cards wrap long localized labels and grow vertically');
  const webStyles = readFileSync('web/components/product-surface.module.css', 'utf8');
  check(/\.workLabel\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/.test(webStyles),
    'web category/service pills opt into wrapping instead of overflow');
}

// Mutation checks prove the guards above are capable of detecting the precise
// regressions they claim to prevent, rather than merely passing current code.
{
  const source = readFileSync('app/(tabs)/orders.tsx', 'utf8');
  const mutated = source.replace('{serviceLabel}', '{booking.serviceName}');
  check(mutated !== source, 'the booking snapshot mutation changes the fixture');
  assert.throws(() => assertReferenceConsumer(mutated, 'mutated orders'),
    /never presents the English snapshot directly/);
  checks += 1;
}
{
  const source = readFileSync('app/provider/[id].tsx', 'utf8');
  const mutated = source.replace(
    '>{catalogueServiceLabel(service, language)}</AppText>',
    '>{service.name}</AppText>',
  );
  check(mutated !== source, 'the provider service-name mutation changes the fixture');
  assert.throws(() => assertServiceRowConsumer(mutated, 'mutated provider profile'),
    /never presents the stored English row name directly/);
  checks += 1;
}

// The forward migration is also a consumer boundary: each structured RPC must
// project the stable identity, and new worker saves must use the active DB
// catalogue rather than the retired hard-coded category list.
{
  const migration = readFileSync(
    'supabase/migrations/202608250006_catalogue_consumer_authority.sql', 'utf8',
  );
  check(/'translationKey', s\.translation_key/.test(migration),
    'worker-profile RPC projects service translationKey');
  check(/'serviceTranslationKey', service\.translation_key/.test(migration),
    'conversation RPC projects serviceTranslationKey');
  check(/get_my_provider_earnings\(\)[\s\S]*?'serviceId', b\.service_id,[\s\S]*?'serviceTranslationKey', service\.translation_key/.test(migration),
    'worker earnings RPC projects service identity and key');
  check(/get_my_booking_receipt\(p_booking_id uuid\)[\s\S]*?'serviceId', b\.service_id,[\s\S]*?'serviceTranslationKey', service\.translation_key/.test(migration),
    'receipt RPC projects service identity and key while retaining its snapshot');
  check(/'translationKey', s\.translation_key,[\s\S]*?'providerCount'/.test(migration),
    'search suggestions project service translationKey');
  check(/from public\.service_categories sc[\s\S]*?sc\.is_active[\s\S]*?sc\.deleted_at is null/.test(migration),
    'worker saves validate categories from the active database catalogue');
  check(!/c\.value not in \('plumbing'/.test(migration),
    'the old ten-category allow-list is absent');
  for (const [profession, category] of [
    ['locksmith', 'locksmithing'],
    ['aluminumWorker', 'alumetal'],
    ['tiler', 'flooring-tiling'],
    ['mason', 'renovation-finishing'],
    ['gardener', 'gardening'],
    ['pestControlWorker', 'pest-control'],
    ['waterHeaterTechnician', 'water-heater-repair'],
  ]) {
    check(migration.includes(`when '${profession}' then '${category}'`),
      `${profession} is re-homed to ${category}`);
  }
}

console.log(`Catalogue consumer authority: ${checks} checks passed.`);
