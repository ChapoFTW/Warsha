/**
 * Every notification the backend can send must be readable, everywhere.
 *
 * Warsha's event catalogue holds 108 events. Before 2026-08-29, nineteen of them
 * resolved to real copy on both platforms in all three languages. The other
 * eighty-nine fell through to the generic category line, so an approved worker
 * and a REJECTED worker were shown the same sentence — "Your worker account has
 * an update" — and a data export being ready looked identical to a profile
 * edit. Forty had English and Arabic in the native `eventCopy` and nothing on
 * the web, because the browser reads only the shared table.
 *
 * `financial-notifications.test.mts` already guards the seventeen financial
 * events. This file guards the whole catalogue, and it takes the list from the
 * MIGRATIONS rather than from a copy of it, so an event added to the backend
 * without copy fails here instead of reaching a person as "an update".
 *
 * The resolution chain it models, which is not obvious from either file:
 *
 *   web    → `legacyNotificationEventCopy(locale, key)` only.
 *   native → `eventCopy[lang][key]` (en/ar only) → the same shared table →
 *            the generic category line.
 *   French → never consults `eventCopy`. `copy.fr` spreads the English table, so
 *            the resolver accepts a French entry ONLY when it differs from
 *            English in BOTH title and body. A French string left in English
 *            does not read badly — it disappears into the generic line.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  copy,
  legacyNotificationEventCopy,
} from '../src/notifications/notification-copy.ts';

const root = process.cwd();
let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = <T,>(actual: T, expected: T, message: string) => {
  checks += 1; assert.equal(actual, expected, message);
};

const LANGUAGES = ['en', 'ar', 'fr'] as const;

// ---------------------------------------------------------------------------
// 1. The catalogue, read out of the migration that seeds it
// ---------------------------------------------------------------------------
const migrationDir = join(root, 'supabase', 'migrations');
const allSql = readdirSync(migrationDir).filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(migrationDir, f), 'utf8')).join('\n');

// The seed is one `insert into private.notification_event_catalog(...) values`
// followed by tuples whose first two columns are the event type and category.
// Scanned INSIDE the catalogue insert statements only. A looser scan over the
// whole corpus also matches staff-queue and constraint tuples that happen to
// share the shape - `('dispute_evidence_deadlines', 'disputes', ...)` is a queue
// definition, not an event - and a test that invents events fails for the wrong
// reason.
//
// Seven migrations insert here and they disagree on whitespace: WPS-014 writes
// `('quote_received','marketplace','important'` and WPS-023 writes
// `('worker_approved', 'worker_account', 'important'`. Both are accepted; the
// fifteen events a tighter pattern missed were the worker-verification and
// privacy outcomes, which is exactly the set that was broken.
const CATEGORIES = 'marketplace|bookings|messages|payments|worker_account'
  + '|reviews|disputes|security|system|support';
const TUPLE = new RegExp(
  "\\(\\s*'([a-z_]{3,60})'\\s*,\\s*'(" + CATEGORIES + ")'\\s*,\\s*'[a-z_]+'", 'g');

const events = new Map();
let cursor = 0;
let inserts = 0;
for (;;) {
  const at = allSql.indexOf('insert into private.notification_event_catalog', cursor);
  if (at < 0) break;
  inserts += 1;
  // Bounded by the next top-level statement. The catalogue insert is followed
  // by staff-queue inserts whose tuples share this exact shape, and running
  // past the end invents seven events that do not exist.
  const rest = allSql.slice(at + 1);
  const next = rest.search(/\n(?:insert into|create |alter |comment on|revoke |grant )/);
  const statement = rest.slice(0, next > 0 ? next : 40000);
  for (const m of statement.matchAll(TUPLE)) events.set(m[1], m[2]);
  cursor = at + 1;
}
ok(inserts >= 5, `every migration that seeds the catalogue is read (${inserts})`);

ok(events.size >= 100, `the catalogue is substantive (${events.size} events)`);

// ---------------------------------------------------------------------------
// 2. Every event resolves, in every language, on both platforms
// ---------------------------------------------------------------------------
// The generic line is the failure mode, not the fallback under test: reaching it
// for a KNOWN event means the reader is told nothing they did not already know.

const genericTitles = new Set<string>();
const genericBodies = new Set<string>();
for (const language of LANGUAGES) {
  const table = copy[language] as Record<string, string>;
  genericTitles.add(table.newUpdate);
  genericBodies.add(table.genericBody);
}

for (const [key, category] of [...events].sort()) {
  for (const language of LANGUAGES) {
    const resolved = legacyNotificationEventCopy(language, key);
    ok(resolved, `${language}: ${key} (${category}) RESOLVES IN THE SHARED TABLE`);
    if (!resolved) continue;
    ok(resolved.title.trim().length > 0, `${language}: ${key} has a title`);
    ok(resolved.body.trim().length > 0, `${language}: ${key} has a body`);
    ok(!genericBodies.has(resolved.body),
      `${language}: ${key} DOES NOT FALL BACK TO THE GENERIC LINE`);
  }
}

// ---------------------------------------------------------------------------
// 3. Arabic and French are translations, not English wearing a label
// ---------------------------------------------------------------------------
for (const key of [...events.keys()].sort()) {
  const en = legacyNotificationEventCopy('en', key)!;
  const ar = legacyNotificationEventCopy('ar', key)!;
  const fr = legacyNotificationEventCopy('fr', key)!;
  ok(/[؀-ۿ]/.test(ar.title) && /[؀-ۿ]/.test(ar.body),
    `${key} Arabic is written in Arabic script`);
  ok(fr.title !== en.title && fr.body !== en.body,
    `${key} FRENCH DIFFERS FROM ENGLISH, SO THE RESOLVER ACCEPTS IT`);
}

// ---------------------------------------------------------------------------
// 4. There is ONE table of words, and a separate table of actions
// ---------------------------------------------------------------------------
// `eventCopy` used to restate the title and body of every event beside the
// shared table, and the two had drifted apart for twenty-seven of them: the same
// notification read differently on a phone and in a browser. It now carries only
// the action label, which was the one thing genuinely native about it, and which
// French never received at all.

const engagement = read('src/notifications/notification-engagement-translations.ts');
ok(!/const eventCopy/.test(engagement),
  'THE DUPLICATE TITLE AND BODY TABLE IS GONE');
ok(/const actionLabels/.test(engagement) && /const eventAction/.test(engagement),
  'and the action label is its own table');
ok(/legacyNotificationEventCopy\(language, eventKey\)/.test(engagement),
  'THE NATIVE RESOLVER READS THE SAME SHARED TABLE THE BROWSER READS');

// Every action label exists in all three languages, or a French reader gets a
// card with no way to act on it.
const labelBlock = engagement.slice(engagement.indexOf('const actionLabels'),
  engagement.indexOf('type NotificationActionKey'));
const perLanguage: Record<string, Set<string>> = {};
for (const language of LANGUAGES) {
  const at = labelBlock.indexOf(`  ${language}: {`);
  ok(at >= 0, `action labels exist for ${language}`);
  const slice = labelBlock.slice(at, labelBlock.indexOf('},', at));
  perLanguage[language] = new Set([...slice.matchAll(/^\s{4}([a-zA-Z]+):/gm)].map((m) => m[1]));
}
equal(perLanguage.ar.size, perLanguage.en.size, 'Arabic covers every action label');
equal(perLanguage.fr.size, perLanguage.en.size, 'FRENCH COVERS EVERY ACTION LABEL TOO');
ok(perLanguage.en.size >= 15, `the action vocabulary is substantive (${perLanguage.en.size})`);

// Every event that names an action names one that exists.
const actionMap = engagement.slice(engagement.indexOf('const eventAction'));
const mapped = [...actionMap.slice(0, actionMap.indexOf('};')).matchAll(/^\s{2}([a-z_]+): '([a-zA-Z]+)'/gm)];
ok(mapped.length >= 40, `events map to actions (${mapped.length})`);
for (const [, event, action] of mapped) {
  ok(perLanguage.en.has(action), `${event} names a real action (${action})`);
}

// ---------------------------------------------------------------------------
// 5. An unknown event still fails safe
// ---------------------------------------------------------------------------
for (const language of LANGUAGES) {
  const table = copy[language] as Record<string, string>;
  equal(legacyNotificationEventCopy(language, 'not_a_real_event_v9'), undefined,
    `${language}: an unknown event is reported as unknown, not guessed`);
  ok(table.newUpdate && table.genericBody,
    `${language}: and the generic pair the callers fall back to still exists`);
}

// ---------------------------------------------------------------------------
// 6. No notification copy carries an identifier or a figure
// ---------------------------------------------------------------------------
// A notification says which of your things changed. The detail lives behind the
// route it opens, and the lock-screen preview is category-generic anyway.

// Values, not topics. "Password changed" is exactly the sentence a security
// notification should carry; what may never appear is a credential, an amount,
// an account number or an internal identifier.
const forbidden = [
  /\bEGP\b/i, /[£$€]/, /\d+[.,]\d{2}\b/, /\bIBAN\b/i,
  /[0-9a-f]{8}-[0-9a-f]{4}/i, /\b\d{6,}\b/, /\bsb_(?:secret|publishable)_/,
];
for (const key of events.keys()) {
  for (const language of LANGUAGES) {
    const resolved = legacyNotificationEventCopy(language, key)!;
    for (const rule of forbidden) {
      ok(!rule.test(resolved.title) && !rule.test(resolved.body),
        `${language}: ${key} carries no identifier or figure (${rule})`);
    }
  }
}

console.log(`Notification catalogue: ${checks} checks passed across ${events.size} events.`);
