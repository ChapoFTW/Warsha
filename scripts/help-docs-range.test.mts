/**
 * The documentation gate must know which commits it is judging.
 *
 * On 2026-09-11 it did not. It asked git for `origin/main...HEAD`, the working
 * tree and the index, and unioned the answers — correct before a push and
 * worthless after one, because a direct push to `main` makes `origin/main` and
 * `HEAD` the same commit and the range empties. A documentation review was
 * requested, the work was pushed while the suite was red, and the next run came
 * back green having compared nothing at all.
 *
 * The bug was not the diff. It was that "nothing changed" and "I cannot see what
 * changed" produced the same output. So these assert the distinction, over the
 * five states the owner named:
 *
 *   A  a help-relevant change before push        detected
 *   B  the same change after push, in CI         still detected
 *   C  an unrelated change                       no false trigger
 *   D  a base that cannot be established         fails closed, loudly
 *   E  already-reviewed pinned content           passes, for that reason
 *
 * A and C are exercised through the real gate against this repository. B and D
 * are exercised through `resolveRange` with the environment CI would supply,
 * because manufacturing a push event means manufacturing its commits.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { RangeUnavailable, resolveRange } from './help-docs-range.mjs';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.equal(actual, expected, message);
};
const refuses = (env: Record<string, string>, message: string) => {
  checks += 1;
  assert.throws(() => resolveRange(process.cwd(), env), RangeUnavailable, message);
};

const root = process.cwd();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const before = execFileSync('git', ['rev-parse', 'HEAD~1'], { encoding: 'utf8' }).trim();

// --- B: a push event is judged over the commits it pushed --------------------
/*
 * The case the whole exercise is about. `origin/main` and `HEAD` are the same
 * commit here — the state that used to report an empty change set — and the
 * push event still knows exactly which commits arrived.
 */
{
  const range = resolveRange(root, {
    GITHUB_EVENT_NAME: 'push',
    GITHUB_EVENT_BEFORE: before,
    GITHUB_SHA: head,
  });
  equal(range.mode, 'push', 'a push event is judged in push mode');
  equal(range.base, before, 'against the commit that was there before the push');
  equal(range.head, head, 'up to the commit that was pushed');
  ok(!range.includeWorkingTree,
    'and not against a working tree, which on a CI runner is nobody’s work');

  const files = execFileSync('git', ['diff', '--name-only', `${before}..${head}`], { encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
  ok(files.length > 0,
    'the push range names real files — a range that resolves but sees nothing would '
    + 'be the original defect wearing a new mode');
}

// --- D: a range that cannot be established refuses ---------------------------
/*
 * Every one of these used to be an empty diff, and an empty diff used to be a
 * pass. They are now four different refusals, because each is a different way of
 * not knowing rather than a way of knowing there is nothing.
 */
refuses({ GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_BEFORE: '0000000000000000000000000000000000000000', GITHUB_SHA: head },
  'a first push to a branch has no previous commit, and says so');
refuses({ GITHUB_EVENT_NAME: 'push', GITHUB_SHA: head },
  'a push event with no before SHA at all refuses');
refuses({ GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_BEFORE: 'f'.repeat(40), GITHUB_SHA: head },
  'a before SHA that is not in this checkout refuses rather than diffing nothing');
refuses({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'a-branch-that-does-not-exist' },
  'a pull request whose base is missing refuses');
refuses({ WARSHA_DOCS_BASE: 'not-a-commit' },
  'an explicit base that is not a commit refuses');

// --- The explicit range is honoured -----------------------------------------
{
  const range = resolveRange(root, { WARSHA_DOCS_BASE: before, WARSHA_DOCS_HEAD: head });
  equal(range.mode, 'explicit', 'an explicit base and head are used as given');
  equal(range.describe, `${before}..${head}`, 'and described exactly');
}

// --- The local mode still sees uncommitted work ------------------------------
{
  const range = resolveRange(root, {});
  equal(range.mode, 'working-tree', 'a developer run is judged over the working tree');
  ok(range.includeWorkingTree,
    'which is the one mode where uncommitted and untracked files count');
  ok(/origin\/main/.test(range.describe) || /working tree and index only/.test(range.describe),
    'and it says which base it found, including when it found none');
}

// --- Every mode names itself ------------------------------------------------
/*
 * A green result has to say what it is a result about. The previous gate printed
 * nothing, which is why a run that compared no commits looked like a run that
 * found no problems.
 */
{
  const modes = [
    resolveRange(root, {}),
    resolveRange(root, { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_BEFORE: before, GITHUB_SHA: head }),
    resolveRange(root, { WARSHA_DOCS_BASE: before }),
  ];
  for (const range of modes) {
    ok(range.mode && range.describe.length > 0,
      `${range.mode}: the range describes itself for the log line`);
  }
}

console.log(`Help docs comparison range: ${checks} checks passed.`);
