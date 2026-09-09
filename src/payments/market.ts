/**
 * Which country Warsha is operating in, and therefore which currency money is.
 *
 * ## Why this exists as its own authority
 *
 * Currency was being decided by LANGUAGE. Screens rendered a price by taking a
 * number and appending `t('currency')`, a translation key whose value is 'EGP'
 * in English, 'جنيه' in Arabic and 'EGP' in French. Today that produces the
 * right answer, because every value happens to name the Egyptian pound. It
 * produces the right answer by coincidence.
 *
 * The mechanism is wrong in a way that only shows up later: it means the money
 * a customer is quoted is a property of the language they chose to read the app
 * in. Add a language — Warsha has already added French once — and somebody has
 * to remember that a currency string lives in the translation table. Miss it,
 * and a price silently changes denomination when a person switches language.
 *
 * So the derivation is fixed here, in one direction only:
 *
 *     service country -> ISO 4217 currency -> locale-aware formatting
 *
 * Language is an input to FORMATTING — digits, separators, symbol placement —
 * and never an input to WHICH CURRENCY. Egypt is EGP whether the reader has the
 * app in Arabic, English or French.
 *
 * ## Why only Egypt
 *
 * Warsha operates in Egypt. `CountryCode` admits exactly the countries Warsha
 * actually serves, so an unsupported market cannot be represented, let alone
 * quoted a price. Adding one later is a deliberate three-line act — extend the
 * union, extend `CurrencyCode`, add the row — rather than a lookup that
 * silently returns something plausible for a country nobody has launched in.
 *
 * The shape is ready for Saudi Arabia, the UAE, the UK or the US. None of them
 * is activated here, because Warsha does not serve them and a currency map that
 * answers for markets that do not exist is a way to ship a price in the wrong
 * money.
 */
import type { CurrencyCode } from './payment-types';

/** ISO 3166-1 alpha-2, restricted to markets Warsha actually serves. */
export type CountryCode = 'EG';

export const SERVICE_COUNTRIES: readonly CountryCode[] = ['EG'] as const;

/**
 * Egypt. Used where a country is not carried explicitly yet — which is most of
 * the product today, because there has only ever been one market. It is a
 * named default rather than a literal scattered through call sites, so the day
 * a second market opens there is one list of places to look.
 */
export const DEFAULT_SERVICE_COUNTRY: CountryCode = 'EG';

const CURRENCY_BY_COUNTRY: Readonly<Record<CountryCode, CurrencyCode>> = {
  EG: 'EGP',
};

/**
 * The only sanctioned way to learn what currency an amount is in.
 *
 * Never infer this from a language, a locale string, or the device region: a
 * Warsha customer in Cairo reading English is still paying Egyptian pounds, and
 * a phone set to en-US does not move Warsha to Delaware.
 */
export function currencyForCountry(
  country: CountryCode = DEFAULT_SERVICE_COUNTRY,
): CurrencyCode {
  const currency = CURRENCY_BY_COUNTRY[country];
  if (!currency) throw new Error(`Warsha does not serve ${country}`);
  return currency;
}

export function isServiceCountry(value: string): value is CountryCode {
  return (SERVICE_COUNTRIES as readonly string[]).includes(value);
}
