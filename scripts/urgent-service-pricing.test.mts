import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { translations } from '../src/i18n/translations.ts';

/**
 * The urgent-service tier: what it is called, and what it says it costs.
 *
 * Two defects sat here together, and the second is the dangerous one.
 *
 *   THE NAME. The tier was "Emergency booking", and in Arabic "طلب طوارئ" under
 *   a heading reading "خدمات الطوارئ". In English that is a pricing tier; in
 *   Arabic طوارئ carries an ambulance-and-police weight that English "emergency"
 *   does not, so the same product presented itself as a staffed emergency
 *   channel to Arabic readers and as an urgent plumber to everyone else. Warsha
 *   does not staff an emergency channel and must not appear to.
 *
 *   THE PRICE. The copy announced "a fictional 250 EGP surcharge" — development
 *   placeholder text pointed at real customers — and the client's fallback
 *   constant really was 250 while the SERVER computes the surcharge from
 *   `provider_services.emergency_surcharge_egp`, which is per provider, per
 *   service, and defaults to 0. A customer whose service had no configured
 *   surcharge was shown 250 EGP, agreed to a total 250 EGP too high, and was
 *   charged nothing. A price quoted to a customer has to come from the same
 *   place the charge comes from.
 *
 * So these assertions are about agreement: the client agrees with the server
 * about the amount, and the three languages agree with each other about what
 * the product is.
 */

let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks += 1; };
const equal = (actual: unknown, expected: unknown, label: string) => {
  assert.deepEqual(actual, expected, label); checks += 1;
};

const read = (...parts: string[]) => readFileSync(resolve(process.cwd(), ...parts), 'utf8');
const screen = read('app', 'booking', 'new', '[providerId].tsx');
const migration = read('supabase', 'migrations', '202607200012_production_audit_hardening.sql');

// ===========================================================================
// 1. THE SERVER IS THE AUTHORITY ON THE AMOUNT
// ===========================================================================

check(/emergency_surcharge_egp/.test(migration),
  'the booking RPC computes the surcharge from the provider service row');
check(/case when p_booking_type = 'emergency' then service_row\.emergency_surcharge_egp else 0 end/
  .test(migration),
  'AND CHARGES ZERO WHEN THE SERVICE HAS NO CONFIGURED SURCHARGE');

// The client's fallback must be the server's default. Anything else quotes a
// price the server will not charge.
check(/const EMERGENCY = 0;/.test(screen),
  'THE CLIENT FALLBACK IS ZERO, MATCHING THE SERVER DEFAULT');
check(!/const EMERGENCY = 250/.test(screen),
  'and the 250 that disagreed with the server is gone');

// ===========================================================================
// 2. NO LOCALE INVENTS AN AMOUNT
// ===========================================================================

const EMERGENCY_KEYS = [
  'emergency', 'emergencyWarning', 'emergencyWarningNoFee', 'emergencySurcharge',
] as const;

for (const locale of ['en', 'ar', 'fr'] as const) {
  for (const key of EMERGENCY_KEYS) {
    const value = String(translations[locale][key]);
    check(value.length > 0, `${locale}.${key} exists`);
    check(!/250/.test(value), `${locale}.${key} DOES NOT HARDCODE 250`);
    check(!/٢٥٠/.test(value), `${locale}.${key} does not hardcode 250 in Arabic digits`);
    check(!/fictional|تجريبية|fictif/i.test(value),
      `${locale}.${key} DOES NOT DESCRIBE ITS OWN PRICING AS FICTIONAL`);
  }
  // The amount is interpolated, so the string has to have somewhere to put it.
  check(String(translations[locale].emergencyWarning).includes('{amount}'),
    `${locale}.emergencyWarning TAKES THE AMOUNT DYNAMICALLY`);
  // And the zero-surcharge variant must not promise a fee at all.
  check(!String(translations[locale].emergencyWarningNoFee).includes('{amount}'),
    `${locale}.emergencyWarningNoFee names no amount, because there is none`);
}

// ===========================================================================
// 3. URGENT SERVICE, NOT AN EMERGENCY SERVICE
// ===========================================================================

equal(translations.en.emergency, 'Urgent booking', 'English calls it an urgent booking');
equal(translations.en.emergencyProviders, 'Urgent services', 'and the heading says urgent services');
check(!/emergency/i.test(String(translations.en.emergencyProviders)),
  'the English heading no longer reads as an emergency service');

// Arabic is where the framing actually mattered.
check(/عاجلة/.test(String(translations.ar.emergency)),
  'ARABIC CALLS IT AN URGENT SERVICE REQUEST');
check(!/طوارئ/.test(String(translations.ar.emergency)),
  'AND NO LONGER USES طوارئ, WHICH READS AS AMBULANCE-AND-POLICE');
check(!/طوارئ/.test(String(translations.ar.emergencyProviders)),
  'nor in the discovery heading');
check(/العاجلة/.test(String(translations.ar.emergencyProviders)),
  'which now says urgent services');
for (const key of EMERGENCY_KEYS) {
  check(!/طوارئ/.test(String(translations.ar[key])),
    `ar.${key} carries no emergency-services framing`);
}

check(/urgent/i.test(String(translations.fr.emergency)), 'French calls it urgent');
check(!/d'urgence|d’urgence/i.test(String(translations.fr.emergencyProviders)),
  'and the French heading is Services urgents rather than Services d’urgence');

// Localised, not copied.
for (const key of EMERGENCY_KEYS) {
  check(String(translations.ar[key]) !== String(translations.en[key]),
    `ar.${key} is localized`);
  check(String(translations.fr[key]) !== String(translations.en[key]),
    `fr.${key} is localized`);
}

// ===========================================================================
// 4. THE SCREEN SHOWS THE REAL NUMBER, OR NO NUMBER
// ===========================================================================

check(/pricing\.emergencySurcharge > 0/.test(screen),
  'the screen chooses its wording from the actual surcharge');
check(/emergencyWarningNoFee/.test(screen),
  'AND SAYS NOTHING ABOUT A FEE WHEN THERE IS NONE');
check(/t\("emergencyWarning"\)\.replace\(\s*\n?\s*"\{amount\}"/.test(screen)
  || /replace\(\s*"\{amount\}"/.test(screen),
  'and interpolates the amount rather than trusting a constant in the string');
check(/formatNumber\(pricing\.emergencySurcharge, language\)/.test(screen),
  'formatted with the reader’s own numerals');

console.log(`Urgent-service pricing and copy: ${checks} checks passed.`);
