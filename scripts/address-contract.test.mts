import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  egyptAreaForStoredValue, egyptGovernorateForStoredValue,
  listEgyptAreas, listEgyptGovernorates,
} from '../src/locations/egypt-locations.ts';

/**
 * The address form must agree with the database about what is required.
 *
 * `public.addresses` declares `label`, `address_line` and `governorate` NOT
 * NULL and everything else nullable, and `confirm_my_service_address` refuses
 * without a coordinate. A form that marks a field optional and then blocks on
 * it — or blocks on a coordinate without saying so — is lying to the customer.
 */

let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const equal = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const migrations = readFileSync('supabase/migrations/202607200001_core_marketplace.sql', 'utf8');
const addressesDdl = migrations.slice(
  migrations.indexOf('create table public.addresses'),
  migrations.indexOf('create table public.addresses') + 700,
);

// --- The contract, read from the migration rather than assumed --------------
for (const column of ['label', 'address_line', 'governorate']) {
  check(new RegExp(`${column} text not null`).test(addressesDdl),
    `${column} IS REQUIRED BY THE DATABASE`);
}
check(/district text(?! not null)/.test(addressesDdl),
  'district is nullable, so the area may genuinely be omitted');
check(/latitude double precision(?! not null)/.test(addressesDdl),
  'latitude is nullable at the table level');

const wps023 = readFileSync(
  'supabase/migrations/202608080001_wps023_authentication_role_onboarding_worker_vetting.sql', 'utf8');
check(/A confirmed map pin is required/.test(wps023),
  'BUT A CONFIRMED PIN IS MANDATORY AT THE CONFIRMATION RPC');
check(/manual_pin/.test(wps023),
  'and manual_pin is a first-class source so denial is never a dead end');

// --- The form agrees with the contract --------------------------------------
const page = readFileSync('web/app/app/addresses/page.tsx', 'utf8');

// Matched on the required flag rather than the whole argument list, which now
// also carries the field's grid width.
check(/\{field\('label', words\.addressLabel, words\.addressLabelHelp, true[,)]/.test(page),
  'Address name is marked required, matching the database');
check(/\{field\('addressLine', words\.addressLine, words\.addressLineHelp, true[,)]/.test(page),
  'the street address is marked required, matching the database');
for (const optional of ['building', 'floor', 'apartment', 'landmark', 'serviceNotes']) {
  check(new RegExp(`field\\('${optional}', [^)]*\\)\\}`).test(page)
    && !new RegExp(`field\\('${optional}',[^)]*, true\\)`).test(page),
    `${optional} is offered as optional, matching the database`);
  check(new RegExp(`${optional === 'serviceNotes' ? 'service_notes' : optional}: draft\\.${optional}\\.trim\\(\\) \\|\\| null`).test(page),
    `AND AN EMPTY ${optional} IS SENT AS NULL RATHER THAN AN EMPTY STRING`);
}
check(/district: draft\.district\.trim\(\) \|\| null/.test(page),
  'an omitted area is sent as null, not a placeholder');

// The coordinate gate must be explained, not merely enforced.
check(/addressLocationSection/.test(page) && /addressLocationWhy/.test(page),
  'the location requirement is stated as its own required section');
check(/addressLocationMissing/.test(page),
  'AND THE CUSTOMER IS TOLD WHY SAVING IS BLOCKED');
check(/addressLocationDenied/.test(page),
  'a denied permission explains how to recover');

// --- Governorate and area are controlled, not typed -------------------------
check(/egypt-locations/.test(page),
  'the form uses the shared CAPMAS/OCHA taxonomy');
check(!/field\('governorate'/.test(page) && !/field\('district'/.test(page),
  'GOVERNORATE AND AREA ARE NO LONGER FREE TEXT');
check(/listEgyptGovernorates\(language\)/.test(page),
  'governorate options are localized by the active language');
check(/egyptAreaForStoredValue\(next\.id, current\.district\)/.test(page),
  'changing governorate clears an area that does not belong to it');

const governorates = listEgyptGovernorates('en');
equal(governorates.length, 27, 'all 27 governorates are offered');
for (const language of ['en', 'ar', 'fr'] as const) {
  check(listEgyptGovernorates(language).every(item => item[language].length > 0),
    `every governorate has a ${language} label`);
}
const cairo = governorates.find(item => /cairo/i.test(item.en));
check(cairo, 'Cairo is present in the taxonomy');
check(cairo!.ar !== cairo!.en, 'and its Arabic label is genuinely Arabic');
check(listEgyptAreas(cairo!.id, 'en').length > 0, 'Cairo has selectable areas');
equal(listEgyptAreas('not-a-governorate', 'en'), [],
  'an unknown governorate offers no areas rather than every area');

// Existing rows stored the English name; they must keep resolving.
check(egyptGovernorateForStoredValue('Cairo')?.id === cairo!.id,
  'A ROW ALREADY STORING "Cairo" STILL RESOLVES AFTER THE CHANGE');
check(egyptGovernorateForStoredValue(cairo!.id)?.id === cairo!.id,
  'and the canonical id resolves too');
equal(egyptGovernorateForStoredValue('Nowhere'), null,
  'an unrecognised stored value is not silently mapped onto a real governorate');

// What is written stays the English canonical name, matching mobile.
check(/governorate: next \? next\.en : ''/.test(page),
  'the stored governorate is the English canonical name, as mobile writes');
check(/district: picked \? picked\.en : ''/.test(page),
  'and so is the stored area');

// --- Confirmation redirects are origin-derived, never localhost -------------
const webAuth = readFileSync('web/lib/auth-actions.ts', 'utf8');
check(/emailRedirectTo: `\$\{window\.location\.origin\}\/auth\/confirm`/.test(webAuth),
  'web confirmation is built from the serving origin, not a hardcoded host');
check(!/localhost/.test(webAuth),
  'WEB AUTH NEVER NAMES LOCALHOST; A HOSTED ORIGIN CANNOT PRODUCE ONE');
check(!/http:\/\//.test(webAuth),
  'and never downgrades to plain http');


// --- Hosted redirect contract ----------------------------------------------
// Hosted development sends confirmation and recovery links to exactly four
// explicit destinations. The Site URL is what Auth falls back to when a
// requested redirect is not allowlisted, which is how hosted development spent
// weeks emailing localhost while every client asked for the right URL.
const setupDoc = readFileSync('docs/supabase-setup.md', 'utf8');
const deliveryDoc = readFileSync('docs/operations/email-delivery-runbook.md', 'utf8');

for (const destination of [
  'https://app.usewarsha.com/auth/confirm',
  'https://app.usewarsha.com/reset-password',
  'warsha://auth/confirm',
  'warsha://reset-password',
]) {
  check(setupDoc.includes(destination),
    `the hosted allow list documents ${destination}`);
}
check(/Site URL: https:\/\/app\.usewarsha\.com/.test(setupDoc),
  'THE HOSTED SITE URL IS DOCUMENTED AS THE APP ORIGIN, NEVER LOCALHOST');
check(!/Keep `warsha:\/\/\*\*`/.test(setupDoc)
  && !/must contain `warsha:\/\/\*\*`/.test(deliveryDoc),
  'no runbook still instructs an operator to re-broaden the allow list');
check(/falls back to the Site URL/i.test(setupDoc)
  && /falls back to it/i.test(deliveryDoc),
  'both runbooks explain the fallback that caused the localhost defect');

// The local stack keeps its own localhost Site URL; it is a different file for
// a different environment and pushing it at hosted development is the defect.
const localConfig = readFileSync('supabase/config.toml', 'utf8');
check(/site_url = "http:\/\/localhost:8081"/.test(localConfig),
  'the LOCAL stack config still points at localhost, as it should');

console.log(`Address contract: ${checks} checks passed.`);
