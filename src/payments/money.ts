import type { CurrencyCode, MinorAmount } from './payment-types';

const MAX_MINOR = 1_000_000_000n;
const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

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

function localizeDigits(value: string, language: 'en' | 'ar') {
  return language === 'ar'
    ? value.replace(/\d/g, digit => arabicDigits[Number(digit)])
    : value;
}

export function formatMinor(
  amount: MinorAmount,
  language: 'en' | 'ar',
  currency: CurrencyCode = 'EGP',
) {
  const value = minorValue(amount);
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, '0');
  const grouped = new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-EG', {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(whole);
  const number = value % 100n === 0n
    ? grouped
    : `${grouped}${language === 'ar' ? '٫' : '.'}${localizeDigits(fraction, language)}`;
  const label = currency === 'EGP' ? (language === 'ar' ? 'ج.م' : 'EGP') : currency;
  return language === 'ar' ? `${number} ${label}` : `${label} ${number}`;
}
