import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks += 1; };
const read = (path: string) => readFileSync(path, 'utf8');

const addressCopy = read('src/i18n/address-form-copy.ts');
for (const token of [
  'Address name', 'اسم العنوان', 'Nom de l’adresse',
  // The helper names the concept and gives examples. The Arabic wording was
  // revised to read as natural Arabic rather than a translation of "label".
  'Give this address a name', 'سمِّ هذا العنوان', 'Donnez un nom à cette adresse',
  'Optional', 'اختياري', 'Facultatif',
]) check(addressCopy.includes(token), `address form authority contains ${token}`);

const booking = read('app/booking/new/[providerId].tsx');
for (const key of ['addressNameHelp', 'buildingHelp', 'floorHelp',
  'apartmentHelp', 'landmarkHelp', 'workerNotesHelp']) {
  check(booking.includes(`addressText('${key}')`), `mobile booking exposes persistent ${key}`);
}
check(/<AppText[^>]*>\{label\}<\/AppText>[\s\S]*accessibilityLabel=\{label\}/.test(booking),
  'mobile booking fields pair a visible label with an accessibility name');

const webAddress = read('web/app/app/addresses/page.tsx');
check(/<label[\s\S]*\{label\}[\s\S]*aria-describedby/.test(webAddress),
  'web address fields retain labels and associate helper text');
check(/words\.formRequired\s*:\s*words\.formOptional/.test(webAddress),
  'web address fields state required and optional status visibly');

for (const path of ['app/provider-portfolio.tsx', 'app/provider-certificates.tsx',
  'app/worker-quote/[id].tsx', 'app/provider-job/[id].tsx']) {
  const source = read(path);
  check(/<AppText[^>]*>\{label\}<\/AppText>[\s\S]*accessibilityLabel=\{label\}/.test(source),
    `${path} no longer relies on a disappearing placeholder for meaning`);
}

const workerAddress = read('app/onboarding/address.tsx');
const workerBranch = workerAddress.slice(
  workerAddress.indexOf('function WorkerCurrentLocationFlow'),
  workerAddress.indexOf('function CustomerDestinationAddressFlow'),
);
check(workerBranch.length > 0, 'worker presentation is independently inspectable');
for (const forbidden of ['addressFloor', 'addressApartment', 'addressLandmark', 'workerNotes', 'latitude', 'longitude']) {
  check(!workerBranch.includes(`text('${forbidden}')`) && !workerBranch.includes(`label={${forbidden}}`),
    `worker presentation does not render customer/raw field ${forbidden}`);
}
check(workerAddress.includes('WorkerCurrentLocationFlow'), 'worker onboarding owns a dedicated location presentation');

const repositories = read('src/repositories/supabase-user-repositories.ts');
check(repositories.includes("rpc('confirm_my_service_address'"),
  'address coordinates stay inside the governed pin-confirmation authority');
check(!/latitude[^\n]{0,60}TextInput|longitude[^\n]{0,60}TextInput/i.test(booking + webAddress + workerAddress),
  'normal customer and worker forms expose no coordinate text input');

const analytics = read('web/app/admin/analytics/page.tsx');
check(/aria-describedby="export-help"/.test(analytics) && /analyticsExportReasonHelp/.test(analytics),
  'sensitive export reason has persistent, associated guidance');

const audit = read('docs/audits/global-form-clarity-audit.md');
check(audit.includes('Intentionally retained technical terms') && audit.includes('Accessibility'),
  'the human-language audit records exceptions and accessibility changes');

console.log(`Global form clarity regressions: ${checks} checks passed.`);
