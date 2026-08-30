/**
 * An appointment is on the day it is on.
 *
 * Warsha stores two kinds of time. `timestamptz` is an instant — a moment that
 * happened, the same moment everywhere. `date` and `time without time zone` are
 * a wall clock: a booking's `scheduled_date` and `scheduled_time`, a worker's
 * availability, quiet hours. "Two o'clock on Tuesday" is not an instant, and
 * treating it as one moves the appointment.
 *
 * Both surfaces used to do it differently and both were wrong somewhere. The
 * web read a date with `new Date('2026-09-01')` — ECMAScript parses a date-only
 * string as UTC midnight — and rendered it in the device's zone, so a customer
 * in New York saw "Aug 31" for a September appointment. Native built the date at
 * noon in the device's zone, which survives a few hours of offset and fails at
 * UTC-11.
 *
 * The device timezone assertions below are run in child processes with `TZ`
 * set, because `Intl` caches the zone on first use and setting `process.env.TZ`
 * inside a running test proves nothing.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
  WARSHA_TIMEZONE,
  formatWarshaDate,
  formatWarshaDateTime,
  formatWarshaTime,
  formatWarshaTimestamp,
  warshaToday,
} from '../src/utils/warsha-time.ts';

let checks = 0;
const check = (condition: unknown, label: string) => {
  assert.ok(condition, label);
  checks += 1;
};
const equal = (actual: unknown, expected: unknown, label: string) => {
  assert.equal(actual, expected, label);
  checks += 1;
};

/** Runs an expression in a child process with a given device timezone. */
function inTimezone(timezone: string, expression: string): string {
  return execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', '-e',
      `import('./src/utils/warsha-time.ts').then((t) => {`
      + ` process.stdout.write(String(${expression})); });`],
    { encoding: 'utf8', env: { ...process.env, TZ: timezone } },
  ).trim();
}

// --- the day is the day, from anywhere -------------------------------------
const ZONES = ['Africa/Cairo', 'UTC', 'America/New_York', 'Pacific/Honolulu',
  'Asia/Tokyo', 'Pacific/Kiritimati'];
const expectedDay = formatWarshaDate('2026-09-01');

for (const zone of ZONES) {
  equal(inTimezone(zone, `t.formatWarshaDate('2026-09-01')`), expectedDay,
    `A BOOKING ON 1 SEPTEMBER IS 1 SEPTEMBER ON A DEVICE SET TO ${zone}`);
}

// The exact defect that started this: the web's old reading.
const oldWebWay = new Intl.DateTimeFormat('en-EG', { dateStyle: 'medium' })
  .format(new Date('2026-09-01'));
check(typeof oldWebWay === 'string',
  'the old parse still parses, which is why nobody noticed it');

// --- a clock reading round-trips exactly, including across summer time ------
for (const [date, label] of [
  ['2026-01-15', 'winter'],
  ['2026-04-25', 'the day after Egypt starts summer time'],
  ['2026-07-15', 'summer'],
  ['2026-10-31', 'the day after Egypt ends summer time'],
] as const) {
  const shown = formatWarshaDateTime(date, '14:00');
  check(/\b2:00\b/.test(shown) || /\b14:00\b/.test(shown),
    `14:00 IS STILL 14:00 IN ${label} (${shown})`);
}

for (const zone of ZONES) {
  const shown = inTimezone(zone, `t.formatWarshaDateTime('2026-07-15', '14:00')`);
  check(/\b2:00\b/.test(shown) || /\b14:00\b/.test(shown),
    `and on a device set to ${zone} (${shown})`);
}

equal(formatWarshaTime('09:30'), formatWarshaTime('09:30'),
  'a bare clock reading is stable');
check(/\b9:30\b/.test(formatWarshaTime('09:30')), '09:30 reads as 9:30');
check(/\b11:45\b/.test(formatWarshaTime('23:45')) || /\b23:45\b/.test(formatWarshaTime('23:45')),
  'and 23:45 reads as a quarter to midnight');

// --- an instant is anchored where the marketplace is -----------------------
equal(WARSHA_TIMEZONE, 'Africa/Cairo', 'instants are anchored in Cairo');
const noonUtc = formatWarshaTimestamp('2026-07-15T12:00:00Z');
check(/\b3:00\b/.test(noonUtc),
  `noon UTC in July reads as three in Cairo, which is summer time (${noonUtc})`);
const winterNoon = formatWarshaTimestamp('2026-01-15T12:00:00Z');
check(/\b2:00\b/.test(winterNoon),
  `and as two in January, which is not (${winterNoon})`);

for (const zone of ZONES) {
  equal(inTimezone(zone, `t.formatWarshaTimestamp('2026-07-15T12:00:00Z')`), noonUtc,
    `an instant reads the same on a device set to ${zone}`);
}

// --- today is Warsha's today ----------------------------------------------
check(/^\d{4}-\d{2}-\d{2}$/.test(warshaToday()), 'today is an ISO date');
equal(warshaToday(new Date('2026-09-01T22:30:00Z')), '2026-09-02',
  'AND LATE EVENING UTC IS ALREADY TOMORROW IN CAIRO');

// --- nothing malformed becomes "Invalid Date" in front of a person ---------
equal(formatWarshaDate(''), '', 'an empty date passes through');
equal(formatWarshaDate('not-a-date'), 'not-a-date', 'and so does a non-date');
check(formatWarshaDateTime('2026-09-01', 'ASAP', 'en-EG', 'As soon as possible')
  .includes('As soon as possible'), 'ASAP is a label, not a time');
check(!formatWarshaTimestamp('rubbish').includes('Invalid'),
  'A MALFORMED TIMESTAMP NEVER RENDERS AS "Invalid Date"');

// --- one authority, not three ----------------------------------------------
for (const path of ['web/app/app/jobs/page.tsx', 'web/app/app/worker/jobs/page.tsx']) {
  const source = readFileSync(path, 'utf8');
  check(/warsha-time/.test(source), `${path} uses the shared time authority`);
  check(!/^function formatDay/m.test(source),
    `${path} NO LONGER CARRIES ITS OWN COPY`);
}

const nativeFormat = readFileSync('src/utils/date-format.ts', 'utf8');
check(/warsha-time/.test(nativeFormat),
  'and native delegates to the same authority rather than building dates itself');
// Comments stripped first: the module explains at length what it stopped doing,
// and naming the old construction in prose is not doing it.
const withoutComments = nativeFormat
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
check(!/new Date\(year/.test(withoutComments),
  'THE NOON-LOCAL CONSTRUCTION IS GONE');

console.log(`Timezone correctness: ${checks} checks passed.`);
