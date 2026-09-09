/**
 * The device driver must not put a credential into its own output.
 *
 * This is not hypothetical and it is not about a masked field. `setText`
 * verifies that a value landed where it was aimed, and when it has not, it says
 * what the field holds instead — which is the correct diagnostic and was the
 * leak. A password typed while focus was still on the phone field made the
 * phone field's contents the thing worth printing, and the QA account's
 * password went into a transcript and had to be rotated.
 *
 * The masked field was never the hole. It reports its mask, so quoting it gives
 * nothing away. The hole was the ORDINARY field, whose contents are ordinary
 * right up to the moment a secret goes astray into it — which is precisely the
 * case the diagnostic exists to report. The message that leaks is the message
 * that fires; they cannot be separated by being careful.
 *
 * So the invariant is structural: a screen holding any masked field is a screen
 * where nothing is quoted. Asserted here rather than on a device, because a
 * leak is not something to discover by reproducing it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };

const source = readFileSync('scripts/android-e2e/driver.mjs', 'utf8');

/** Comments here describe the leak in detail; they must not be searched. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

const setText = code.slice(code.indexOf('export async function setText'), code.indexOf('export async function type'));
ok(setText.length > 500, 'the setText body was located');

// --- Sensitivity is decided by the screen, not by the caller remembering -----
ok(
  /const sensitive = secret \?\?/.test(setText),
  'a caller may declare a value secret',
);
ok(
  /\.some\(\(n\) => n\.masked\)/.test(setText),
  'and a screen containing any masked field is sensitive regardless',
);
ok(
  !/secret\s*=\s*false/.test(setText),
  'sensitivity is not defaulted to false, which would make the screen check dead',
);

// --- Nothing is quoted on such a screen -------------------------------------
const quoting = [...setText.matchAll(/console\.log\([^\n]*JSON\.stringify\([^\n]*\)/g)].map((m) => m[0]);
ok(quoting.length > 0, 'the non-sensitive diagnostic still exists and is useful');
for (const line of quoting) {
  ok(
    !/siblings|others/.test(line),
    `sibling contents are never quoted: ${line.slice(0, 60)}`,
  );
}

// The quoted branch must be unreachable when the screen holds a password.
const guarded = /if \(written\?\.masked \|\| sensitive\) \{[\s\S]*?\} else \{[\s\S]*?JSON\.stringify\(value\)/.test(setText);
ok(guarded, 'the quoting branch sits in the else of the sensitivity check');

// --- Drift is still reported, because that is the actual defect --------------
ok(
  /text went astray/.test(setText),
  'typing into the wrong field is still reported',
);
ok(
  /drifted/.test(setText) && /siblings\.filter/.test(setText),
  'drift is reported as a count of affected fields',
);

// --- Masked fields keep the treatment they already had -----------------------
ok(
  /written\.text\.length === String\(value\)\.length/.test(setText),
  'a masked field is still verified by length rather than by content',
);

// --- No other part of the driver prints field text ---------------------------
// `describeScreen` prints labels, which are the product's own copy; that is the
// point of it. What must not happen is a field's VALUE reaching stdout.
const printsFieldText = [...code.matchAll(/console\.log\([^\n]*\bn\.text\b[^\n]*\)/g)];
ok(
  printsFieldText.length === 0,
  'no logging path prints a raw node value from a loop over fields',
);

console.log(`Device driver secrecy: ${checks} checks passed.`);
