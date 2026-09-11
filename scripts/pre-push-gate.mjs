/**
 * The validation boundary, enforced instead of remembered.
 *
 * ## What this exists for
 *
 * On 2026-09-11 work left this machine twice while a check was red. Both times
 * the cause was the same shape: the checks and the publication ran in one shell
 * command, so the result arrived after the push. A gate read too late is a gate
 * that did not run.
 *
 * Discipline was the only thing standing between a red check and `origin/main`,
 * and discipline is not a control. This is.
 *
 * ## Why these four, and not `test:all`
 *
 * `typecheck`, `lint` and `test:help-docs` are nine, four and one seconds. They
 * are also precisely the checks that escaped: the type error was invisible to
 * the regression suite, because `--experimental-strip-types` removes types
 * without checking them, and the documentation gate's authority ends the moment
 * you push.
 *
 * `audit:accessible-names` is here for a different reason and costs under a
 * second. Nothing else catches what it catches: a control that composes its own
 * name over a decorative icon is invisible in a screenshot, invisible to the
 * type system, and perfectly legible to a screen reader as a leading comma. It
 * reached customers twice before there was a rule for it.
 *
 * `test:all` is ten minutes. A hook that costs ten minutes gets bypassed, and a
 * bypassed hook is worse than no hook because it looks like protection. CI runs
 * the full suite on the pushed range; this runs what is fast and what history
 * says actually gets past a person.
 *
 * ## What it will not do
 *
 * It will not decide anything for you. It refuses the push and prints the
 * failing command so the result is read before the work is published, which is
 * the whole point. `--no-verify` bypasses it, and AGENTS.md already says not to
 * skip hooks — that is a rule for a person to keep, not a lock.
 */
import { spawnSync } from 'node:child_process';

const CHECKS = ['typecheck', 'lint', 'test:help-docs', 'audit:accessible-names'];

console.log('Pre-push: validation before publication.\n');

const failed = [];
for (const name of CHECKS) {
  const started = Date.now();
  const result = spawnSync('npm', ['run', name], {
    stdio: 'pipe',
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const ok = result.status === 0;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(24)} ${seconds}s`);
  if (!ok) failed.push({ name, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` });
}

if (failed.length === 0) {
  console.log('\nAll pre-push checks passed. Publishing.');
  process.exit(0);
}

console.error('\nPUSH REFUSED\n');
for (const { name, output } of failed) {
  console.error(`--- ${name} ---`);
  const lines = output.split(/\r?\n/).filter((line) => line.trim());
  for (const line of lines.slice(-25)) console.error(`  ${line}`);
  console.error('');
}
console.error('Read the failure, fix it, then push. The result of a check that arrives');
console.error('after the push is not a result anybody acted on.\n');
process.exit(1);
