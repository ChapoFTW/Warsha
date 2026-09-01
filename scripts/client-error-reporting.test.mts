/**
 * Warsha can find out that a client broke.
 *
 * There was no error boundary on any surface, no unhandled-rejection handler,
 * and no endpoint to report to: an uncaught render error was a blank screen
 * nobody heard about. These assertions are about the parts that live in the
 * repository rather than in the database — that the boundaries exist, that they
 * report, and that they do not carry a message or a stack into a log staff read.
 *
 * The boundaries were the first half. The second half is everything a boundary
 * cannot see: an unhandled promise rejection, an error in an event handler, a
 * throw outside the React tree. Those were still silent until
 * `global-error-handlers.ts`, and the section at the bottom is about them.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { errorClassOf } from '../src/observability/client-error-reporter.ts';
import {
  globalReportCeiling,
  installGlobalErrorHandlers,
} from '../src/observability/global-error-handlers.ts';

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

// ---------------------------------------------------------------------------
// The failures no boundary sees
// ---------------------------------------------------------------------------
// Exercised against a fake global rather than a real one, because the whole
// point of the module is that it attaches to whatever the platform provides.

type Reported = { name: string; component: string | null; fatal: boolean };

function fakeTarget() {
  const listeners = new Map<string, (event: unknown) => void>();
  let nativeHandler: ((error: unknown, isFatal?: boolean) => void) | undefined;
  const previous = (_error: unknown, _isFatal?: boolean) => { previousCalls += 1; };
  let previousCalls = 0;
  return {
    listeners,
    get previousCalls() { return previousCalls; },
    get nativeHandler() { return nativeHandler; },
    target: {
      addEventListener: (type: string, listener: (event: unknown) => void) => { listeners.set(type, listener); },
      removeEventListener: (type: string) => { listeners.delete(type); },
      ErrorUtils: {
        getGlobalHandler: () => previous,
        setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => { nativeHandler = handler; },
      },
    },
  };
}

function collectingRpc(sink: Reported[]) {
  return ((_name: string, args: Record<string, unknown>) => {
    sink.push({
      name: String(args.p_name), component: (args.p_component as string) ?? null,
      fatal: Boolean(args.p_fatal),
    });
    return Promise.resolve(undefined);
  }) as never;
}

const reported: Reported[] = [];
const fake = fakeTarget();
const uninstall = installGlobalErrorHandlers({
  rpc: collectingRpc(reported), surface: 'web', target: fake.target,
});

check(fake.listeners.has('unhandledrejection'),
  'AN UNHANDLED PROMISE REJECTION IS NOW HEARD — THE MOST COMMON SILENT FAILURE');
check(fake.listeners.has('error'), 'and so is an error thrown outside the React tree');
check(typeof fake.nativeHandler === 'function',
  'and React Native’s global JS handler is installed too');

fake.listeners.get('unhandledrejection')?.({ reason: new TypeError('x') });
equal(reported.at(-1)?.name, 'TypeError', 'a rejection is reported by its class');
equal(reported.at(-1)?.component, 'promise', 'and identified as a rejection rather than a render');
equal(reported.at(-1)?.fatal, false, 'a rejection is not fatal — the app is still running');

fake.listeners.get('error')?.({ error: new RangeError('y') });
equal(reported.at(-1)?.name, 'RangeError', 'a window error is reported by its class');

fake.nativeHandler?.(new EvalError('z'), true);
equal(reported.at(-1)?.name, 'EvalError', 'a native global error is reported');
equal(reported.at(-1)?.fatal, true, 'and a fatal one is reported as fatal');
check(fake.previousCalls === 1,
  'THE PREVIOUS HANDLER STILL RUNS, SO THE RED BOX AND THE CRASH ARE NOT SWALLOWED');

// A render loop must not become a request loop on somebody's battery.
const before = reported.length;
for (let i = 0; i < globalReportCeiling * 3; i += 1) {
  fake.listeners.get('error')?.({ error: new TypeError('loop') });
}
check(reported.length - before <= globalReportCeiling,
  'A LOOPING FAILURE STOPS REPORTING RATHER THAN FLATTENING A BATTERY');

uninstall();
check(!fake.listeners.has('error') && !fake.listeners.has('unhandledrejection'),
  'and the handlers can be removed again, so a fast refresh does not stack them');

// A reporter that throws inside a global handler re-enters the handler that
// called it. Losing a report is acceptable; looping is not.
const throwing = fakeTarget();
installGlobalErrorHandlers({
  rpc: (() => { throw new Error('reporter is broken'); }) as never,
  surface: 'native', target: throwing.target,
});
let rethrew = false;
try { throwing.listeners.get('error')?.({ error: new Error('x') }); } catch { rethrew = true; }
check(!rethrew, 'A BROKEN REPORTER NEVER THROWS OUT OF THE HANDLER IT WAS CALLED FROM');

// Both surfaces install them, and neither invented a second reporting path.
for (const path of ['components/warsha/PushNotificationSync.tsx', 'web/components/global-error-reporting.tsx']) {
  const source = readFileSync(path, 'utf8');
  check(/installGlobalErrorHandlers/.test(source), `${path} installs the global handlers`);
  check(!/console\.error|Sentry|Bugsnag|Crashlytics/.test(source),
    `${path} reports through report_client_error and nothing else`);
}
check(/<GlobalErrorReporting \/>/.test(readFileSync('web/lib/preferences-context.tsx', 'utf8')),
  'the web installs them once, from the provider all three trees share');

console.log(`Client error reporting: ${checks} checks passed.`);
