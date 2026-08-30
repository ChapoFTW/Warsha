/**
 * Warsha can find out that a client broke.
 *
 * There was no error boundary on any surface, no unhandled-rejection handler,
 * and no endpoint to report to: an uncaught render error was a blank screen
 * nobody heard about. These assertions are about the parts that live in the
 * repository rather than in the database — that the boundaries exist, that they
 * report, and that they do not carry a message or a stack into a log staff read.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { errorClassOf } from '../src/observability/client-error-reporter.ts';

let checks = 0;
const check = (condition: unknown, label: string) => {
  assert.ok(condition, label);
  checks += 1;
};
const equal = (actual: unknown, expected: unknown, label: string) => {
  assert.equal(actual, expected, label);
  checks += 1;
};

// --- every surface has somewhere to land ------------------------------------
for (const [surface, path] of [
  ['the application', 'web/app/app/error.tsx'],
  ['the staff console', 'web/app/admin/error.tsx'],
  ['the public site', 'web/app/[locale]/error.tsx'],
  ['native', 'components/warsha/AppErrorBoundary.tsx'],
] as const) {
  check(existsSync(path), `${surface} HAS AN ERROR BOUNDARY (${path})`);
}

const layout = readFileSync('app/_layout.tsx', 'utf8');
check(/export \{ AppErrorBoundary as ErrorBoundary \}/.test(layout),
  'and the native root layout exports it, which is what Expo Router renders');

// --- the report carries a class, and nothing that could carry a person ------
const reporter = readFileSync('src/observability/client-error-reporter.ts', 'utf8');
check(!/p_message|p_stack|\.stack\b/.test(reporter),
  'THE REPORTER SENDS NO MESSAGE AND NO STACK');
check(/catch \{/.test(reporter),
  'and it swallows its own failures, because a reporter that throws inside a boundary takes the boundary with it');

for (const path of ['web/components/route-error-view.tsx', 'components/warsha/AppErrorBoundary.tsx']) {
  const source = readFileSync(path, 'utf8');
  check(/reportClientError/.test(source), `${path} reports what it caught`);
  check(/fatal: true/.test(source), `${path} reports it as fatal, because the tree below did not render`);
  check(!/error\.message|error\.stack/.test(source),
    `${path} DOES NOT READ THE MESSAGE OR THE STACK`);
}

// The native boundary renders when the provider tree has failed, so it must not
// read from that tree.
// Comments are stripped first: the file explains at length WHY it uses no
// provider, and naming them in prose is not using them.
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const native = stripComments(readFileSync('components/warsha/AppErrorBoundary.tsx', 'utf8'));
check(!/useLocalization|useThemeColors|AppText|useAppearance/.test(native),
  'THE NATIVE BOUNDARY USES NO PROVIDER, BECAUSE IT RENDERS WHEN THE PROVIDERS FAILED');

// --- the class is established without touching anything sensitive -----------
equal(errorClassOf(new TypeError('x')), 'TypeError', 'a real error reports its class');
equal(errorClassOf('boom'), 'ThrownString', 'a thrown string is reported as one');
equal(errorClassOf(null), 'ThrownValue', 'and so is a thrown nothing');
equal(errorClassOf({ name: 'CustomError' }), 'CustomError', 'an error-shaped object reports its name');

console.log(`Client error reporting: ${checks} checks passed.`);
