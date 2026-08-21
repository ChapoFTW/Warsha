import type { CurrencyCode, MinorAmount } from './payment-types';
import type { SupportedLanguage } from '../i18n/language-preference';

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

export function formatMinor(
  amount: MinorAmount,
  language: SupportedLanguage,
  currency: CurrencyCode = 'EGP',
) {
  const value = minorValue(amount);
  const whole = (value / 100n).toString();
  const fraction = (value % 100n).toString().padStart(2, '0');
  // Hermes does not consistently accept BigInt in Intl.NumberFormat. Keep
  // authoritative arithmetic in BigInt and format its decimal string here.
  const grouped = localizeDigits(
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, language === 'ar' ? '\u066C' : language === 'fr' ? '\u202F' : ','),
    language,
  );
  const number = value % 100n === 0n
    ? grouped
    : `${grouped}${language === 'ar' ? '\u066B' : language === 'fr' ? ',' : '.'}${localizeDigits(fraction, language)}`;
  const label = currency === 'EGP' ? (language === 'ar' ? '\u062C.\u0645' : 'EGP') : currency;
  return language === 'ar' || language === 'fr' ? `${number} ${label}` : `${label} ${number}`;
}
