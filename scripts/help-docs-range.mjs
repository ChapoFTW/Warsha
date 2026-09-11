/**
 * Which commits `test:help-docs` is judging, and saying so out loud.
 *
 * ## The defect this exists for
 *
 * The gate used to ask git three questions — `origin/main...HEAD`, the working
 * tree, and the index — and union the answers. That is exactly right before a
 * push and worthless after one: a direct push to `main` makes `origin/main` and
 * `HEAD` the same commit, the range empties, and the gate reports that nothing
 * changed.
 *
 * On 2026-09-11 a documentation review was requested, the work was pushed while
 * the suite was red, and the next run came back green. Nothing had been
 * reviewed. The trigger had left with the push.
 *
 * "Nothing changed" and "I cannot see what changed" are different states and
 * were being reported identically. That is the whole bug, and the fix is to
 * establish a NAMED range, fail closed when one cannot be found, and print which
 * one was used so a green result says what it is a result about.
 *
 * ## The modes
 *
 * | mode | range | when |
 * | --- | --- | --- |
 * | `explicit` | `WARSHA_DOCS_BASE..WARSHA_DOCS_HEAD` | anything that knows its own range |
 * | `push` | `GITHUB_EVENT_BEFORE..GITHUB_SHA` | CI on a push — the authoritative one, and the one that catches a push past a red gate |
 * | `pull-request` | `origin/<base>...HEAD` | CI on a pull request |
 * | `working-tree` | upstream merge-base, plus index and untracked | a developer before pushing |
 *
 * A push whose `before` is all zeroes is a new branch with no previous commit.
 * That is not an empty change set; it is an unknown one, and it refuses.
 */
import { execFileSync } from 'node:child_process';

const ZERO = /^0{7,40}$/;

const git = (root, args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

const exists = (root, ref) => Boolean(ref) && git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);

export class RangeUnavailable extends Error {}

/**
 * Resolve the comparison range, or refuse.
 *
 * @returns {{mode: string, base: string|null, head: string, describe: string,
 *   diffArgs: string[][], includeWorkingTree: boolean}}
 */
export function resolveRange(root, env = process.env) {
  const head = env.GITHUB_SHA || 'HEAD';

  if (env.WARSHA_DOCS_BASE) {
    const base = env.WARSHA_DOCS_BASE;
    const target = env.WARSHA_DOCS_HEAD || head;
    if (!exists(root, base)) {
      throw new RangeUnavailable(
        `WARSHA_DOCS_BASE is set to "${base}", which is not a commit in this repository.`);
    }
    return {
      mode: 'explicit',
      base,
      head: target,
      describe: `${base}..${target}`,
      diffArgs: [['diff', '--name-only', `${base}..${target}`]],
      includeWorkingTree: false,
    };
  }

  if (env.GITHUB_EVENT_NAME === 'push') {
    const before = env.GITHUB_EVENT_BEFORE;
    if (!before || ZERO.test(before)) {
      throw new RangeUnavailable(
        'This is a push event with no previous commit to compare against '
        + `(GITHUB_EVENT_BEFORE=${JSON.stringify(before ?? null)}). A first push to a `
        + 'branch has no range, so the documentation impact of its commits cannot be '
        + 'established here. Set WARSHA_DOCS_BASE to the intended base commit.');
    }
    if (!exists(root, before)) {
      throw new RangeUnavailable(
        `The push event names ${before} as the previous commit, and it is not in this `
        + 'checkout. A shallow clone cannot answer what changed: fetch enough history '
        + '(actions/checkout with fetch-depth: 0) or set WARSHA_DOCS_BASE.');
    }
    return {
      mode: 'push',
      base: before,
      head,
      describe: `${before}..${head}`,
      diffArgs: [['diff', '--name-only', `${before}..${head}`]],
      includeWorkingTree: false,
    };
  }

  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    const base = env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : null;
    if (!exists(root, base)) {
      throw new RangeUnavailable(
        `A pull request against ${JSON.stringify(env.GITHUB_BASE_REF ?? null)}, whose base `
        + 'is not in this checkout. Fetch it, or set WARSHA_DOCS_BASE.');
    }
    return {
      mode: 'pull-request',
      base,
      head,
      describe: `${base}...${head}`,
      diffArgs: [['diff', '--name-only', `${base}...${head}`]],
      includeWorkingTree: false,
    };
  }

  /*
   * A developer, before pushing. The upstream is the base when there is one;
   * without it the working tree and index are still authoritative for the
   * changes that exist, and that is said rather than assumed.
   */
  const upstream = exists(root, 'origin/main') ? 'origin/main' : null;
  const diffArgs = upstream ? [['diff', '--name-only', `${upstream}...HEAD`]] : [];
  return {
    mode: 'working-tree',
    base: upstream,
    head: 'HEAD',
    describe: upstream
      ? `${upstream}...HEAD, plus the working tree and index`
      : 'the working tree and index only — no origin/main to compare against',
    diffArgs,
    includeWorkingTree: true,
  };
}
