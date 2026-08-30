/**
 * When something happens, and where that "when" is anchored.
 *
 * Warsha stores two different kinds of time and they must not be formatted the
 * same way:
 *
 *   AN INSTANT — `timestamptz`, 452 columns. A moment that happened. "Created
 *   at", "paid at", "read at". Rendering it in the reader's own timezone is
 *   correct: the moment is the same everywhere, only the clock differs.
 *
 *   A WALL CLOCK — `date` and `time without time zone`. A booking's
 *   `scheduled_date` and `scheduled_time`, a worker's availability, quiet
 *   hours. "The professional arrives at two on Tuesday" is not an instant; it
 *   is a reading on a clock in Egypt, and it stays two o'clock whatever device
 *   is looking at it.
 *
 * Conflating them produced a real defect. The web read a booking's date with
 * `new Date('2026-09-01')`, and ECMAScript parses a date-only string as UTC
 * midnight — then rendered it in the device's timezone. In Cairo that is
 * harmless. In New York it displayed "Aug 31, 2026": the customer and the
 * professional were looking at different days for the same appointment.
 *
 * Native avoided it by building the date at noon local, which survives an
 * offset of a few hours but still breaks at UTC-11.
 *
 * So the two are formatted differently, on purpose:
 *
 *   a WALL CLOCK is carried and read back in a zone with no summer time, so the
 *   reading that was stored is the reading that is shown, from any device;
 *
 *   an INSTANT is rendered in `Africa/Cairo`, because Warsha is one marketplace
 *   in one country and two people discussing "the message you sent at four"
 *   must be reading the same four. The analytics surface already says this in
 *   as many words: "Reporting days use Africa/Cairo".
 */

/** Where every Warsha wall-clock reading is anchored. */
export const WARSHA_TIMEZONE = 'Africa/Cairo';

/**
 * A wall-clock reading is carried on the timeline as if it were UTC, and read
 * back as UTC, so it round-trips exactly.
 *
 * The first version of this anchored the reading at Egypt's standard offset and
 * formatted it in `Africa/Cairo`. That is wrong for half the year: 14:00 built
 * at +02:00 is 12:00 UTC, which Cairo displays as 15:00 during summer time. The
 * appointment moved by an hour because the code was clever.
 *
 * UTC has no summer time, so a clock reading placed in it and read back from it
 * is the same reading. The zone is a carrier here, not a claim about where
 * anybody is — that claim is `WARSHA_TIMEZONE`, and it is what an INSTANT is
 * rendered in.
 */
const WALL_CLOCK_ZONE = 'UTC';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d/;

/** Carries a wall-clock reading onto the timeline without reinterpreting it. */
function wallClockInstant(date: string, time?: string | null): Date | null {
  if (!DATE_ONLY.test(date)) return null;
  const clock = time && CLOCK_TIME.test(time) ? time.slice(0, 5) : '12:00';
  return new Date(`${date}T${clock}:00Z`);
}

/**
 * A wall-clock DATE, shown as stored.
 *
 * Returns the input unchanged if it is not a date — a caller showing "ASAP" or
 * an empty string should not be handed "Invalid Date".
 */
export function formatWarshaDate(date: string, locale = 'en-EG'): string {
  const at = wallClockInstant(date);
  if (!at || Number.isNaN(at.getTime())) return date;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    timeZone: WALL_CLOCK_ZONE,
  }).format(at);
}

/** A wall-clock DATE AND TIME, shown as stored. */
export function formatWarshaDateTime(
  date: string,
  time: string,
  locale = 'en-EG',
  asapLabel = 'ASAP',
): string {
  const day = formatWarshaDate(date, locale);
  if (time === 'ASAP') return `${day}, ${asapLabel}`;
  if (!CLOCK_TIME.test(time)) return `${day}, ${time}`;
  const at = wallClockInstant(date, time);
  if (!at || Number.isNaN(at.getTime())) return `${day}, ${time}`;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: WALL_CLOCK_ZONE,
  }).format(at);
}

/** A wall-clock TIME on its own — availability, quiet hours. */
export function formatWarshaTime(time: string, locale = 'en-EG'): string {
  if (!CLOCK_TIME.test(time)) return time;
  const at = wallClockInstant('2000-01-01', time);
  if (!at) return time;
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric', minute: '2-digit', timeZone: WALL_CLOCK_ZONE,
  }).format(at);
}

/**
 * An INSTANT, in Warsha's timezone.
 *
 * Deliberately Cairo rather than the device. Warsha is one marketplace in one
 * country, and a customer and a professional discussing "the message you sent
 * at four" must be reading the same four — including when one of them has a
 * device set to the wrong zone, which is far more common than travel.
 */
export function formatWarshaTimestamp(value: string, locale = 'en-EG'): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: WARSHA_TIMEZONE,
  }).format(at);
}

/** Today, as Warsha's calendar sees it rather than as the device does. */
export function warshaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: WARSHA_TIMEZONE,
  }).format(now);
  return parts;
}
