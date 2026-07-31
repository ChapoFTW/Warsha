export const EGYPT_MOBILE_PREFIXES = ['010', '011', '012', '015'] as const;

const LOCAL_PREFIX_PATTERN = EGYPT_MOBILE_PREFIXES.join('|');
const SUBSCRIBER_PREFIX_PATTERN = EGYPT_MOBILE_PREFIXES.map(prefix => prefix.slice(1)).join('|');
const EGYPT_MOBILE_LOCAL = new RegExp(`^(?:${LOCAL_PREFIX_PATTERN})\\d{8}$`);
const EGYPT_MOBILE_SUBSCRIBER = new RegExp(`^(?:${SUBSCRIBER_PREFIX_PATTERN})\\d{8}$`);
const EGYPT_MOBILE_COUNTRY = new RegExp(`^20(?:${SUBSCRIBER_PREFIX_PATTERN})\\d{8}$`);
const EGYPT_MOBILE_E164 = new RegExp(`^\\+20(?:${SUBSCRIBER_PREFIX_PATTERN})\\d{8}$`);
const ALLOWED_PHONE_CHARACTERS = /^[\d+()\-\s]+$/;

/** Normalizes supported Egyptian mobile formats without guessing foreign numbers. */
export function normalizeEgyptianPhone(input: string): string | null {
  const value = input.trim();
  if (!value || !ALLOWED_PHONE_CHARACTERS.test(value)) return null;
  if ((value.match(/\+/g) ?? []).length > 1 || value.includes('+') && !value.startsWith('+')) return null;

  const compact = value.replace(/[()\-\s]/g, '');
  let local: string;
  if (EGYPT_MOBILE_LOCAL.test(compact)) local = compact;
  else if (EGYPT_MOBILE_SUBSCRIBER.test(compact)) local = `0${compact}`;
  else if (EGYPT_MOBILE_COUNTRY.test(compact)) local = `0${compact.slice(2)}`;
  else if (EGYPT_MOBILE_E164.test(compact)) local = `0${compact.slice(3)}`;
  else return null;

  return `+20${local.slice(1)}`;
}

export function normalizePhone(input: string): string {
  return normalizeEgyptianPhone(input) ?? '';
}

export function isValidPhone(input: string): boolean {
  return normalizeEgyptianPhone(input) !== null;
}

export function isValidSmsOtp(input: string): boolean {
  return /^\d{6}$/.test(input.trim());
}
