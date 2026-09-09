/**
 * Money is a property of the country, never of the language.
 *
 * ## The bug this exists to prevent
 *
 * Warsha rendered prices by taking a number and appending `t('currency')` — a
 * translation key. Its value is 'EGP' in English, 'جنيه' in Arabic and 'EGP' in
 * French, so the output was correct. It was correct by coincidence: the
 * mechanism made the currency of a quoted price a property of the language the
 * reader had selected.
 *
 * That is the kind of thing that stays right until it doesn't. Warsha has
 * already added a third language once. Add a fourth, forget the currency key,
 * and a price silently changes denomination when somebody switches language.
 *
 * So the rule is asserted here rather than remembered:
 *
 *     country -> ISO 4217 currency -> locale-aware formatting
 *
 * ## What is deliberately NOT asserted
 *
 * That no `$` character appears anywhere in the repository. Dollar signs are
 * legitimate in regex backreferences, template literals, shell snippets, and in
 * vendor pricing documentation — Google bills the Routes API in USD and saying
 * so in EGP would be a lie. The scan below targets money Warsha shows its own
 * users, and nothing else.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

import { formatMoney, formatMoneyMajor, formatMinor } from '../src/payments/money.ts';
import {
  currencyForCountry, isServiceCountry, SERVICE_COUNTRIES, DEFAULT_SERVICE_COUNTRY,
} from '../src/payments/market.ts';
import { egpFromMinor } from '../web/lib/worker.ts';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

const LANGUAGES = ['en', 'ar', 'fr'] as const;

// --- 1. The derivation runs one way ----------------------------------------
equal(currencyForCountry('EG'), 'EGP', 'EGYPT IS EGP');
equal(currencyForCountry(), 'EGP', 'and the default service country is Egypt');
equal([...SERVICE_COUNTRIES], ['EG'], 'only Egypt is activated — no unserved market can be quoted');
equal(DEFAULT_SERVICE_COUNTRY, 'EG', 'the default is named rather than scattered as a literal');
ok(isServiceCountry('EG'), 'Egypt is recognised');
ok(!isServiceCountry('US'), 'AND A COUNTRY WARSHA DOES NOT SERVE IS NOT');

// A market Warsha has not launched must fail loudly rather than return
// something plausible. A silent fallback here prices a job in the wrong money.
checks += 1;
assert.throws(() => currencyForCountry('SA' as never), /does not serve/,
  'an unsupported country throws instead of guessing a currency');

// --- 2. Language never changes the currency --------------------------------
const rendered = LANGUAGES.map((language) => formatMoney('125000', { language }));
for (const [index, language] of LANGUAGES.entries()) {
  const text = rendered[index]!;
  ok(text.includes('EGP') || text.includes('ج.م'),
    `${language} names Egyptian pounds`);
  ok(!text.includes('$'), `${language} NEVER RENDERS A DOLLAR SIGN`);
  ok(!/USD|dollar/i.test(text), `${language} never names dollars`);
}

// The same amount, three languages: three presentations, one currency.
ok(new Set(rendered).size === 3, 'each language formats the amount differently');
equal(
  LANGUAGES.map((language) => currencyForCountry(DEFAULT_SERVICE_COUNTRY)),
  ['EGP', 'EGP', 'EGP'],
  'CHANGING LANGUAGE DOES NOT CHANGE THE CURRENCY');

// --- 3. Locale conventions -------------------------------------------------
equal(formatMoney('125000', { language: 'en' }), 'EGP 1,250',
  'English puts the code first with a comma group');
equal(formatMoney('125000', { language: 'ar' }), '١٬٢٥٠ ج.م',
  'ARABIC USES ARABIC-INDIC DIGITS, THE ARABIC THOUSANDS MARK, AND ج.م AFTER THE AMOUNT');
equal(formatMoney('125000', { language: 'fr' }), '1 250 EGP',
  'French groups with a narrow no-break space and puts the code last');

// Fractions follow the same locale rules.
equal(formatMoney('9950', { language: 'ar' }), '٩٩٫٥٠ ج.م',
  'Arabic uses the Arabic decimal mark');
equal(formatMoney('9950', { language: 'fr' }), '99,50 EGP', 'French uses a comma decimal');

// --- 4. Bidi: the label sits on the correct side ---------------------------
// In Arabic the currency follows the amount; in English it leads. Getting this
// backwards is how "250 EGP" becomes "EGP ٢٥٠" in an RTL paragraph and reads
// as a different value entirely.
ok(formatMoney('25000', { language: 'ar' }).endsWith('ج.م'),
  'Arabic puts the currency after the amount, as the RTL paragraph expects');
ok(formatMoney('25000', { language: 'en' }).startsWith('EGP'),
  'and English puts it before');
ok(!/[٠-٩]/.test(formatMoney('25000', { language: 'en' })),
  'English never leaks Arabic-Indic digits');
ok(/[٠-٩]/.test(formatMoney('25000', { language: 'ar' })),
  'and Arabic always uses them');

// --- 5. The two amount representations agree -------------------------------
// Minor-unit money (the ledger) and major-unit money (older UI values) must not
// present differently, or the same price reads two ways on two screens.
for (const language of LANGUAGES) {
  equal(formatMoneyMajor(1250, { language }), formatMoney('125000', { language }),
    `${language}: major and minor units present identically`);
}
equal(formatMoneyMajor(99.5, { language: 'en' }), 'EGP 99.50',
  'a major-unit fraction keeps two decimals');
equal(formatMoneyMajor(0, { language: 'en' }), 'EGP 0', 'zero is still money');
equal(formatMoneyMajor(Number.NaN, { language: 'en' }), 'EGP 0',
  'a malformed amount renders zero rather than "EGP NaN"');

// `formatMinor` keeps its existing contract for callers that hold a currency.
equal(formatMinor('125000', 'en', 'EGP'), formatMoney('125000', { language: 'en' }),
  'the currency-explicit formatter agrees with the country-derived one');

// --- 6. No screen invents its own money ------------------------------------
/**
 * The structural half. A formatter is only an authority if everything uses it,
 * so this walks the product surfaces and fails on the two patterns that were
 * actually there: a number with `t('currency')` appended, and a bare price
 * interpolated next to a currency word.
 */
const PRODUCT_DIRS = ['app', 'components', 'src', 'web/app', 'web/components', 'web/lib'];
const CODE = new Set(['.ts', '.tsx']);
const files: string[] = [];
const walk = (dir: string) => {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (CODE.has(extname(full))) files.push(full);
  }
};
for (const dir of PRODUCT_DIRS) walk(dir);
ok(files.length > 100, 'the product scan found a realistic number of files');

const offenders: string[] = [];
for (const file of files) {
  // The authority itself and its tests are allowed to name currencies.
  if (file.includes(join('src', 'payments'))) continue;
  const source = readFileSync(file, 'utf8');
  // A number rendered next to the translated currency word.
  if (/\{?\s*t\(["']currency["']\)/.test(source)) offenders.push(`${file}: appends t('currency')`);
  // A hardcoded currency label placed by a screen rather than the formatter.
  if (/["'`]\s*(EGP|ج\.م)\s*["'`]\s*\}?\s*<\//.test(source)) offenders.push(`${file}: hardcodes a currency label`);
}
equal(offenders, [], 'NO SCREEN FORMATS MONEY ITSELF — every one goes through the money authority');

// --- 7. No dollar-denominated product money --------------------------------
// A future accidental "$250" on an Egyptian Warsha screen fails here.
const dollarAmounts: string[] = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(/\$\s?\d[\d,.]*/g)) {
      // `${...}` template interpolation is not money.
      if (match[0].startsWith('${')) continue;
      // A regex backreference — `'$1 $2'` in a replacement string — is not
      // money either. This is the exemption named precisely rather than a
      // blanket "ignore short matches" rule, which would also hide a real $5.
      if (/^\$\d$/.test(match[0]) && /\.replace\s*\(/.test(line)) continue;
      dollarAmounts.push(`${file}:${index + 1}: ${match[0]}`);
    }
  }
}
equal(dollarAmounts, [], 'NO PRODUCT SURFACE RENDERS A DOLLAR AMOUNT');

// --- 8. The web and the app agree, character for character ----------------
/**
 * The same booking must not quote two different-looking totals depending on
 * which surface a person opens it in.
 *
 * The web had its own `Intl.NumberFormat` with a hardcoded EGP. It rendered
 * "EGP 1,250.00" where the app rendered "EGP 1,250", and in Arabic it emitted
 * directional marks and a trailing dot the app never produced. Both now go
 * through the same authority, so this is an equality assertion rather than a
 * "looks similar" one.
 */
for (const language of LANGUAGES) {
  equal(egpFromMinor('125000', language), formatMoney('125000', { language }),
    `${language}: WEB AND APP RENDER THE SAME PRICE IDENTICALLY`);
}
equal(egpFromMinor('not-a-number', 'en'), formatMoney('0', { language: 'en' }),
  'a malformed server amount still renders as money rather than as NaN');

// And no web surface has grown its own currency formatter again.
const webCurrencyFormatters: string[] = [];
for (const file of files) {
  if (!file.startsWith('web')) continue;
  const source = readFileSync(file, 'utf8');
  if (/NumberFormat\([^)]*\{[^}]*currency:/s.test(source)
    || /style:\s*['"]currency['"]/.test(source)) {
    webCurrencyFormatters.push(file);
  }
}
equal(webCurrencyFormatters, [],
  'NO WEB SURFACE FORMATS CURRENCY WITH ITS OWN Intl.NumberFormat');

console.log(`Currency authority: ${checks} checks passed.`);
