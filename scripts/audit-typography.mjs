#!/usr/bin/env node
/**
 * How much of Warsha is on its own type scale.
 *
 * `constants/theme.ts` defines seven steps — display, h1, h2, h3, body,
 * bodySmall, caption — with the line heights and letter-spacing that make a
 * page hold together. When this was first run, nine files used them and
 * seventy-one did not, between them naming fifteen different font sizes: 9,
 * 10, 11, 12, 13, 14, 15, 16, 17, 18, 22, 24, 26, 27, 28.
 *
 * That is the measurable form of "it looks primitive". Fifteen sizes is not a
 * hierarchy, it is an absence of one, and it is why two adjacent cards can feel
 * subtly misaligned without anything being wrong on either. Most of the values
 * are drift rather than intent: the worker onboarding screen used 26/33 where
 * h1 is 28/34, 21/28 where h2 is 22/28, 15/23 where body is 15/24, and 13/20
 * which IS bodySmall exactly.
 *
 * ## Why a ratchet and not a ban
 *
 * Seventy-one files cannot be converted in one change and verified honestly —
 * a font size is a layout input, and a blind rewrite would reflow screens
 * nobody looked at. A hard ban would therefore have to be switched off, and a
 * check that is off is not a check.
 *
 * So this counts, and the count may only fall. Converting a screen lowers the
 * budget; adding a new hardcoded size raises it and fails. It is the same
 * shape as the backup-exception ceiling, for the same reason: a number that
 * only moves one way turns a large migration into something that finishes.
 *
 * Run with `--update` to record a lower budget after converting files.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BUDGET_FILE = 'docs/ux/typography-budget.json';

/**
 * Files that may legitimately name a size.
 *
 * The scale itself, obviously. The brand mark's wordmark is drawn geometry
 * rather than product text, and the icon gallery exists to render sizes.
 */
const EXEMPT = new Set([
  'constants/theme.ts',
  'constants/appearance.ts',
  'components/warsha/Typography.tsx',
  'app/icon-gallery.tsx',
]);

const files = execFileSync('git', ['ls-files', 'app', 'components', 'src', 'hooks'], {
  encoding: 'utf8',
}).trim().split(/\r?\n/).filter((path) => /\.tsx?$/.test(path) && !EXEMPT.has(path));

/** Comments explain sizes; they do not set them. */
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

const offenders = [];
let total = 0;
for (const path of files) {
  const code = stripComments(readFileSync(path, 'utf8'));
  const hits = [...code.matchAll(/fontSize:\s*(\d+)/g)];
  if (!hits.length) continue;
  total += hits.length;
  offenders.push({ path, count: hits.length, sizes: [...new Set(hits.map((h) => h[1]))].sort((a, b) => a - b) });
}
offenders.sort((left, right) => right.count - left.count);

const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
const update = process.argv.includes('--update');

const adopting = files.filter((path) => /typography\.(display|h1|h2|h3|body|bodySmall|caption)\b/
  .test(readFileSync(path, 'utf8'))).length;

console.log(`type scale: ${adopting} files adopt it, ${offenders.length} still name sizes`);
console.log(`hardcoded font sizes: ${total} (budget ${budget.maximum})`);
console.log('\nlargest remaining, convert these first:');
for (const entry of offenders.slice(0, 12)) {
  console.log(`  ${String(entry.count).padStart(3)}  ${entry.path}  [${entry.sizes.join(' ')}]`);
}

if (update) {
  writeFileSync(BUDGET_FILE, `${JSON.stringify({ ...budget, maximum: total, recorded: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
  console.log(`\nbudget lowered to ${total}`);
  process.exit(0);
}

if (total > budget.maximum) {
  console.error(`\nFAIL: ${total - budget.maximum} more hardcoded font size(s) than the budget allows.`);
  console.error('Use a step from `typography` in constants/theme.ts. If a size genuinely has no');
  console.error('home on the scale, the scale is what should change — not this number upward.');
  process.exit(1);
}

if (total < budget.maximum) {
  console.log(`\n${budget.maximum - total} under budget. Run with --update to record the gain.`);
}
console.log('\nok');
