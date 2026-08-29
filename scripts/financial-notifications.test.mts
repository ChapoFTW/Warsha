/**
 * Financial notification localisation, end to end.
 *
 * Warsha's payment system emits seventeen notification event keys. Until this
 * suite existed, not one of them had an entry in the shared copy table, so
 * every payment, refund, earnings, withdrawal and cash-collection notification
 * resolved to the generic "Payment update / Your payment status changed" — in
 * all three languages, on the web and on both native platforms. A worker was
 * told their earnings had "an update" rather than that they were available to
 * withdraw.
 *
 * The copy existed the whole time, complete in English, Arabic and French, in a
 * module nothing imported. This file is what stops that happening again: it
 * asserts the events the DATABASE actually emits are the events the CLIENTS can
 * render, in every language, through one table.
 *
 * The event list is not written here by hand. It is read out of the migrations
 * that emit the notifications, so an event added to the backend without copy
 * fails here rather than reaching a person as "Payment update".
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  copy,
  FINANCIAL_NOTIFICATION_EVENT_KEYS,
  legacyNotificationEventCopy,
} from '../src/notifications/notification-copy.ts';

const root = process.cwd();
let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.equal(actual, expected, message);
};

const LANGUAGES = ['en', 'ar', 'fr'] as const;
const ledger = read('supabase/migrations/202607300001_payments_earnings_ledger.sql');
const engagement = read('src/notifications/notification-engagement-translations.ts');
const wps014 = read('supabase/migrations/202608020002_wps014_notifications_engagement.sql');

// ---------------------------------------------------------------------------
// 1. The list is the database's list, not a hand-written one
// ---------------------------------------------------------------------------
// `private.localize_financial_notification` carried the payment system's own
// allow-list of financial notification types. The function is retired — it
// localised columns no client is ever sent — but the migration that created it
// is immutable history, so the list stays readable and stays the source here.

const allowList = ledger.slice(ledger.indexOf('if new.type not in ('));
const emitted = [...allowList.slice(0, allowList.indexOf(') then')).matchAll(/'([a-z_]+)'/g)]
  .map((match) => match[1]);

ok(emitted.length >= 15, 'the payment system declares its financial notification types');
for (const key of emitted) {
  ok(FINANCIAL_NOTIFICATION_EVENT_KEYS.includes(key as never),
    `EVERY TYPE THE PAYMENT SYSTEM EMITS HAS COPY (${key})`);
}

// WPS-014's catalogue adds its own payments-category events. Same rule.
const catalogued = [...wps014.matchAll(/\('([a-z_]+)','payments',/g)].map((m) => m[1]);
ok(catalogued.length > 0, 'the WPS-014 catalogue declares payments events');
for (const key of catalogued) {
  ok(FINANCIAL_NOTIFICATION_EVENT_KEYS.includes(key as never),
    `AND EVERY CATALOGUED PAYMENTS EVENT HAS COPY (${key})`);
}

// ---------------------------------------------------------------------------
// 2. Every key renders in every language, and never as the generic fallback
// ---------------------------------------------------------------------------
// The generic is what a reader saw before. Asserting "not generic" rather than
// "is a string" is the difference between testing that copy exists and testing
// that the RIGHT copy is reached.

for (const language of LANGUAGES) {
  const table = copy[language] as Record<string, string>;
  for (const key of FINANCIAL_NOTIFICATION_EVENT_KEYS) {
    const resolved = legacyNotificationEventCopy(language, key);
    ok(resolved, `${language}: ${key} resolves`);
    ok(resolved && resolved.title.trim().length > 0, `${language}: ${key} has a title`);
    ok(resolved && resolved.body.trim().length > 0, `${language}: ${key} has a body`);
    ok(resolved && resolved.body !== table.genericBody,
      `${language}: ${key} DOES NOT FALL BACK TO THE GENERIC BODY`);
    ok(resolved && resolved.title !== table.newUpdate,
      `${language}: ${key} does not fall back to the generic title`);
  }
}

// ---------------------------------------------------------------------------
// 3. Arabic and French are real translations, not English wearing a label
// ---------------------------------------------------------------------------
// This is load-bearing for French specifically. `copy.fr` spreads `rawCopy.en`,
// so an untranslated French key silently returns English, and
// `notificationEventCopy` guards against that by accepting a French entry only
// when it differs from English in BOTH title and body. A French string left as
// English therefore does not merely read badly — it falls back to the generic.

for (const key of FINANCIAL_NOTIFICATION_EVENT_KEYS) {
  const en = legacyNotificationEventCopy('en', key)!;
  const ar = legacyNotificationEventCopy('ar', key)!;
  const fr = legacyNotificationEventCopy('fr', key)!;
  ok(ar.title !== en.title && ar.body !== en.body, `${key} is genuinely translated into Arabic`);
  ok(/[؀-ۿ]/.test(ar.title) && /[؀-ۿ]/.test(ar.body),
    `${key} Arabic is written in Arabic script`);
  ok(fr.title !== en.title && fr.body !== en.body,
    `${key} FRENCH DIFFERS FROM ENGLISH, SO THE RESOLVER ACCEPTS IT`);
}

// ---------------------------------------------------------------------------
// 4. The two client tables do not disagree
// ---------------------------------------------------------------------------
// WPS-014 defines four payments events in its own `eventCopy`, which the native
// resolver consults BEFORE the shared table. Web only ever reads the shared
// table. If the two disagree, the same notification reads differently on a
// phone and in a browser, which is the parity defect the constitution names.

const governedByWps014 = ['payment_required', 'payment_failed', 'refund_failed',
  'cash_debt_threshold_warning'];
for (const key of governedByWps014) {
  for (const language of ['en', 'ar'] as const) {
    const pattern = new RegExp(
      `${key}: \\{ title: '([^']*)', body: '([^']*)'`, 'g');
    const matches = [...engagement.matchAll(pattern)];
    ok(matches.length >= 2, `${key} is defined for both languages in the engagement table`);
    const [title, body] = language === 'en'
      ? [matches[0][1], matches[0][2]]
      : [matches[1][1], matches[1][2]];
    const shared = legacyNotificationEventCopy(language, key)!;
    equal(shared.title, title, `${language}: ${key} TITLE MATCHES BETWEEN WEB AND NATIVE`);
    equal(shared.body, body, `${language}: ${key} body matches between web and native`);
  }
}

// ---------------------------------------------------------------------------
// 5. An unknown key still fails safe
// ---------------------------------------------------------------------------
// The catalogue grows server-side, and a client that has not shipped yet will
// meet keys it does not know. It must show a sentence, never a raw event key.

for (const language of LANGUAGES) {
  const table = copy[language] as Record<string, string>;
  equal(legacyNotificationEventCopy(language, 'payment_teleported_v9'), undefined,
    `${language}: an unknown financial key is reported as unknown, not guessed`);
  ok(table.newUpdate && table.genericBody,
    `${language}: and the generic pair the callers fall back to exists`);
}

// ---------------------------------------------------------------------------
// 6. No amount, balance or payment instrument in any financial string
// ---------------------------------------------------------------------------
// A notification says WHICH of your things changed and whether you must act.
// The numbers live behind the route it opens. This is a privacy rule, and a
// string is a much easier place to break it than a screen.

const forbidden = [
  /\bEGP\b/i, /\bجنيه/, /\bEUR\b/i, /[£$€]/, /\d+[.,]\d{2}\b/,
  /\bIBAN\b/i, /\bcard\b/i, /\*{4}/, /\bbalance\b/i,
];
for (const language of LANGUAGES) {
  for (const key of FINANCIAL_NOTIFICATION_EVENT_KEYS) {
    const resolved = legacyNotificationEventCopy(language, key)!;
    for (const rule of forbidden) {
      ok(!rule.test(resolved.title) && !rule.test(resolved.body),
        `${language}: ${key} CARRIES NO AMOUNT OR INSTRUMENT (${rule})`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. There is one table, and the duplicate is gone
// ---------------------------------------------------------------------------

const copySource = read('src/notifications/notification-copy.ts');
ok(/export const FINANCIAL_NOTIFICATION_EVENT_KEYS/.test(copySource),
  'the financial event list is exported from the shared table');
ok(!engagement.includes('payment-notification-translations'),
  'nothing imports the retired duplicate module');
const web = read('web/lib/notifications.ts');
ok(/notification-copy/.test(web),
  'THE BROWSER READS THE SAME TABLE THE APP READS, NOT A SECOND COPY');

console.log(`Financial notifications: ${checks} checks passed.`);
