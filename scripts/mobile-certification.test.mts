/**
 * The certification inventory has to match the product it claims to inventory.
 *
 * `docs/qa/mobile-feature-certification.md` opens by saying that a feature
 * which exists in code and is not in the table is a QA defect in its own right.
 * That sentence is worth nothing if the table is maintained by hand and nobody
 * notices when it falls behind — a stale inventory reads exactly like a
 * complete one, which is the worse of the two failure modes because it is
 * quiet.
 *
 * So the job lifecycle half of the inventory is checked against
 * `src/job-operations/job-operation-types.ts`. Add a state, add a transition,
 * rename either, and this fails until the document is brought back into line.
 *
 * The parts of the inventory that are judgements rather than facts — whether a
 * row is PASS or PARTIAL, what the evidence was — are deliberately not asserted
 * here. A test cannot know whether somebody really looked at a screen, and one
 * that pretended to would be the same lie in a different file.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  OPERATION_STATES,
  operationTransitions,
  workerUpdates,
  customerUpdates,
} from '../src/job-operations/job-operation-types.ts';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

const doc = readFileSync('docs/qa/mobile-feature-certification.md', 'utf8');

// --- The lifecycle table ---------------------------------------------------
// Rows look like: | `confirmed` | 1 | `traveling` | UNTESTED |
type Row = { state: string; out: number; to: string[] };
const rows = new Map<string, Row>();
for (const line of doc.split('\n')) {
  const match = /^\|\s*`([a-z_]+)`\s*\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*[A-Z*]+\s*\|$/.exec(line.trim());
  if (!match) continue;
  const [, state, out, targets] = match;
  if (!(OPERATION_STATES as readonly string[]).includes(state!)) continue;
  rows.set(state!, {
    state: state!,
    out: Number(out),
    to: [...targets!.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!),
  });
}

ok(rows.size > 0, 'the lifecycle table was found in the document at all');

equal(
  [...rows.keys()].sort(),
  [...OPERATION_STATES].sort(),
  'EVERY OPERATION STATE HAS A ROW, AND NO ROW INVENTS ONE');

for (const state of OPERATION_STATES) {
  const row = rows.get(state)!;
  const actual = operationTransitions[state];
  equal(row.out, actual.length, `${state} declares its real number of transitions`);
  equal(row.to, [...actual], `${state} lists the states it can actually reach`);
}

// --- The totals the prose asserts ------------------------------------------
const totalTransitions = OPERATION_STATES.reduce(
  (sum, state) => sum + operationTransitions[state].length, 0);

ok(doc.includes(`**${totalTransitions} of ${totalTransitions} transitions unevidenced.**`),
  `the headline count matches the ${totalTransitions} transitions in the code`);

ok(doc.includes(`| Worker updates | ${workerUpdates.length} |`),
  'the worker update count matches the code');
ok(doc.includes(`| Customer updates | ${customerUpdates.length} |`),
  'the customer update count matches the code');

// --- Every state must still be reachable ----------------------------------
// Not a documentation check: an unreachable state is a product defect that a
// route-level inventory would never surface, because the route still renders.
const reachable = new Set<string>(['confirmed']);
for (let grew = true; grew;) {
  grew = false;
  for (const state of [...reachable]) {
    for (const next of operationTransitions[state as typeof OPERATION_STATES[number]]) {
      if (!reachable.has(next)) { reachable.add(next); grew = true; }
    }
  }
}
equal(reachable.size, OPERATION_STATES.length,
  'EVERY LIFECYCLE STATE IS REACHABLE FROM confirmed — no orphaned state');

const terminal = OPERATION_STATES.filter((s) => operationTransitions[s].length === 0);
equal(terminal, ['completed'], 'and completed is the only place a job stops');

// --- The document must not claim more than it has --------------------------
// The honesty rule, stated as a rule the document must carry rather than as a
// phrase it must avoid. The first attempt at this asserted that the words "all
// features tested" never appear, and failed immediately — they appear inside
// the prohibition itself, in quotes. A checker that cannot tell a rule from a
// violation of it is the same false-positive class the web visual gate hit.
ok(doc.includes('is not sayable while a single row is UNTESTED'),
  'THE DOCUMENT STATES THE RULE THAT FORBIDS CLAIMING COMPLETION');

// And the claim does not appear outside that quoted prohibition.
const unquoted = doc.replace(/[“”"][^“”"\n]*[“”"]/g, '');
ok(!/all features (are )?tested/i.test(unquoted),
  'and never asserts it in its own voice');
ok(doc.includes('UNTESTED'), 'while still admitting to untested rows');

console.log(`Mobile certification inventory: ${checks} checks passed.`);
