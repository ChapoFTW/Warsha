import type { CurrencyCode, MinorAmount } from './payment-types';
import type { SupportedLanguage } from '../i18n/language-preference';
import { currencyForCountry, DEFAULT_SERVICE_COUNTRY, type CountryCode } from './market.ts';

const MAX_MINOR = 1_000_000_000n;
const arabicDigits = ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669'];

export function minor(value: string | bigint): MinorAmount {
  const parsed = typeof value === 'bigint' ? value : BigInt(value);
  if (parsed < 0n || parsed > MAX_MINOR) throw new Error('Invalid money amount');
  return parsed.toString();
}

export function minorValue(value: MinorAmount): bigint {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > MAX_MINOR) throw new Error('Invalid money amount');
  return parsed;
}

export function addMinor(...values: MinorAmount[]): MinorAmount {
  return minor(values.reduce((sum, value) => sum + minorValue(value), 0n));
}

export function subtractMinor(value: MinorAmount, deduction: MinorAmount): MinorAmount {
  const result = minorValue(value) - minorValue(deduction);
  if (result < 0n) throw new Error('Money amount cannot be negative');
  return minor(result);
}

export function compareMinor(left: MinorAmount, right: MinorAmount) {
  const difference = minorValue(left) - minorValue(right);
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

export function calculateCommissionMinor(gross: MinorAmount, commissionBps = 1000): MinorAmount {
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
    throw new Error('Invalid commission policy');
  }
  return minor((minorValue(gross) * BigInt(commissionBps)) / 10_000n);
}

export function egpDecimalToMinor(value: string): MinorAmount {
  const normalized = value.trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Invalid EGP amount');
  const [whole, fraction = ''] = normalized.split('.');
  return minor(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
}

function localizeDigits(value: string, language: SupportedLanguage) {
  return language === 'ar'
    ? value.replace(/\d/g, digit => arabicDigits[Number(digit)])
    : value;
}

/**
 * Groups and localises a decimal string. Language decides digits and
 * separators — Arabic-Indic digits with the Arabic thousands and decimal
 * marks, French with a narrow no-break space — and nothing else.
 *
 * Those marks are written as escapes rather than literal characters because
 * one of them, U+202F, is invisible in an editor and survives a careless edit
 * as an ordinary space — a spacing bug nobody can see in a diff.
 */
function localizeNumber(whole: string, fraction: string | null, language: SupportedLanguage) {
  const grouped = localizeDigits(
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, language === 'ar' ? '\u066C' : language === 'fr' ? '\u202F' : ','),
    language,
  );
  if (fraction === null) return grouped;
  const point = language === 'ar' ? '\u066B' : language === 'fr' ? ',' : '.';
  return `${grouped}${point}${localizeDigits(fraction, language)}`;
}

/**
 * The currency's name as this reader sees it. Note that this is a LABEL for a
 * currency already decided by country — it is not how the currency is chosen.
 */
function currencyLabel(currency: CurrencyCode, language: SupportedLanguage) {
  if (currency !== 'EGP') return currency;
  return language === 'ar' ? '\u062C.\u0645' : 'EGP';
}

/**
 * Where the label goes. One rule, so a quote on one screen cannot read
 * "EGP 250" while the same quote on the next reads "250 EGP".
 *
 * Arabic and French put the currency after the amount, English before it. In
 * Arabic the whole string sits inside an RTL paragraph, so the amount and its
 * label are laid out right-to-left as one unit and neither is reversed.
 */
function composeMoney(number: string, currency: CurrencyCode, language: SupportedLanguage) {
  const label = currencyLabel(currency, language);
  return language === 'ar' || language === 'fr' ? `${number} ${label}` : `${label} ${number}`;
}

export function formatMinor(
  amount: MinorAmount,
  language: SupportedLanguage,
  currency: CurrencyCode = 'EGP',
) {
  const value = minorValue(amount);
  const whole = (value / 100n).toString();
  // Hermes does not consistently accept BigInt in Intl.NumberFormat. Keep
  // authoritative arithmetic in BigInt and format its decimal string here.
  const fraction = value % 100n === 0n ? null : (value % 100n).toString().padStart(2, '0');
  return composeMoney(localizeNumber(whole, fraction, language), currency, language);
}

/**
 * The money formatter screens should reach for.
 *
 * Currency comes from the COUNTRY, never from the language. `formatMinor`
 * remains for callers that already hold a `CurrencyCode` — both compose through
 * the same label and placement rules, so they cannot disagree.
 */
export function formatMoney(
  amount: MinorAmount,
  { language, country = DEFAULT_SERVICE_COUNTRY }: { language: SupportedLanguage; country?: CountryCode },
) {
  return formatMinor(amount, language, currencyForCountry(country));
}

/**
 * The same presentation for amounts still held in MAJOR units.
 *
 * Parts of the product predate minor-unit money and carry a plain number of
 * pounds — `service.price`, `transportationFee`, `emergencySurcharge`. Those
 * values are NOT converted here: converting them to minor units would multiply
 * by 100 and invite a float rounding difference in a price a customer is
 * quoted. The number is formatted as given, so the amount a person sees is the
 * amount the product stored, and only its presentation changes.
 */
export function formatMoneyMajor(
  amount: number,
  { language, country = DEFAULT_SERVICE_COUNTRY }: { language: SupportedLanguage; country?: CountryCode },
) {
  if (!Number.isFinite(amount)) return formatMoney('0', { language, country });
  const negative = amount < 0;
  const absolute = Math.abs(amount);
  const whole = Math.trunc(absolute).toString();
  const cents = Math.round((absolute - Math.trunc(absolute)) * 100);
  const fraction = cents === 0 ? null : cents.toString().padStart(2, '0');
  const rendered = composeMoney(
    localizeNumber(whole, fraction, language), currencyForCountry(country), language);
  return negative ? `-${rendered}` : rendered;
}

/**
 * A price range, composed by the authority rather than by the screen.
 *
 * A filter chip wants "EGP 0–500", not "EGP 0–EGP 500". The currency is named
 * once and the placement still follows the language, so Arabic reads
 * "٠–٥٠٠ ج.م" with the label after the pair and English reads "EGP 0–500" with
 * it before. A screen doing this by hand is how one chip ends up disagreeing
 * with the next.
 */
export function formatMoneyRangeMajor(
  from: number,
  to: number,
  { language, country = DEFAULT_SERVICE_COUNTRY }: { language: SupportedLanguage; country?: CountryCode },
) {
  const render = (value: number) => {
    const absolute = Math.abs(Number.isFinite(value) ? value : 0);
    const cents = Math.round((absolute - Math.trunc(absolute)) * 100);
    return localizeNumber(
      Math.trunc(absolute).toString(),
      cents === 0 ? null : cents.toString().padStart(2, '0'),
      language,
    );
  };
  // An en dash, and never a hyphen: this is a range, not a subtraction.
  return composeMoney(`${render(from)}–${render(to)}`, currencyForCountry(country), language);
}
