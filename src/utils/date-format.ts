import type { SupportedLanguage } from '../i18n/language-preference';
import {
  formatWarshaDate,
  formatWarshaDateTime,
  formatWarshaTimestamp,
} from './warsha-time.ts';

/*
 * The three date functions below are now thin names over `warsha-time.ts`.
 *
 * They used to build `new Date(year, month - 1, day, 12)` — noon in the
 * device's zone — which keeps the right day for an offset of a few hours and
 * loses it at UTC-11. The web had the same job and did it differently, with
 * `new Date('2026-09-01')`, which ECMAScript reads as UTC midnight and which
 * showed "Aug 31" to anybody west of Greenwich. One appointment, two answers.
 *
 * There is one authority now and both surfaces call it.
 */
export function formatBookingDate(date: string, locale = 'en-EG') {
  return formatWarshaDate(date, locale);
}
export function formatBookingDateTime(
  date: string, time: string, locale = 'en-EG', asapLabel = 'ASAP',
) {
  return formatWarshaDateTime(date, time, locale, asapLabel);
}
export function formatTimestamp(value: string, locale = 'en-EG') {
  return formatWarshaTimestamp(value, locale);
}
export function toLocalISODate(value=new Date()){const year=value.getFullYear();const month=String(value.getMonth()+1).padStart(2,'0');const day=String(value.getDate()).padStart(2,'0');return `${year}-${month}-${day}`}
export function localeFor(language:SupportedLanguage){return language==='ar'?'ar-EG':language==='fr'?'fr-EG':'en-EG'}
export function formatNumber(value:number,language:SupportedLanguage){return new Intl.NumberFormat(localeFor(language),{maximumFractionDigits:1}).format(value)}
export function normalizeProblem(value:string){return value.replace(/\s+/g,' ').trim()}
