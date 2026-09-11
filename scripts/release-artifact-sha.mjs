/**
 * Does the staged artifact actually contain the commit we mean to promote?
 *
 * ## The incident this exists for
 *
 * 2026-09-11. A preview had been deployed, it had returned a URL, Vercel
 * reported `readyState: READY`, and a full browser gate had passed against it
 * — 510 checks green. Two commits then landed. Promoting "the preview" at that
 * point would have published an artifact that predated both, while every
 * signal on the screen said the release had been verified.
 *
 * It was caught by comparing the preview against `git log` by hand. That is not
 * a control; it is a person remembering. This is the control.
 *
 * ## What may not be used as evidence of freshness
 *
 * - the deployment's creation time. A build takes minutes and commits take
 *   seconds; "recent" and "current" are different properties.
 * - `readyState: READY`. That says the build finished, not what it built.
 * - the existence of a preview URL. A URL from ten minutes ago looks exactly
 *   like a URL from ten seconds ago.
 *
 * None of those are read here. The artifact is asked what it contains, over the
 * network, from the running deployment, and the answer is compared to the SHA
 * the release intends to ship.
 *
 * ## Fail closed
 *
 * Every uncertain outcome is a failure: the endpoint unreachable, the field
 * absent, the value null, a mismatch, or a build whose source state is unknown.
 * A release gate that passes when it cannot tell is worse than no gate, because
 * it is quoted as evidence.
 *
 * Usage:
 *   node scripts/release-artifact-sha.mjs --url https://<deployment>
 *   node scripts/release-artifact-sha.mjs --url https://<deployment> --sha <full sha>
 *
 * `--sha` defaults to the current `HEAD`, which is the common case: deploy,
 * gate, promote, without moving in between.
 */
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (name) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : undefined;
};

const url = (arg('url') ?? '').replace(/\/$/, '');
if (!url) {
  console.error('Usage: node scripts/release-artifact-sha.mjs --url <deployment url> [--sha <sha>]');
  process.exit(2);
}

const intended = arg('sha')
  ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

/*
 * `--promoted` verifies a live domain AFTER promotion, where the only durable
 * claim is the commit. See the source-state check below for why.
 */
const promoted = argv.includes('--promoted');

/*
 * Refusal is a thrown sentinel rather than `process.exit`.
 *
 * Calling `process.exit` with a socket still open trips a libuv assertion on
 * Windows — `!(handle->flags & UV_HANDLE_CLOSING)` — which prints after the
 * refusal and makes a correct, deliberate failure look like a crash in the gate
 * itself. A release gate whose failure output is indistinguishable from a bug
 * in the release gate will be treated as a bug in the release gate.
 */
class Refused extends Error {}

const fail = (message, detail) => {
  throw new Refused(detail ? `${message}\n\n  ${detail}` : message);
};

console.log(`Release artifact check`);
console.log(`  deployment : ${url}`);
console.log(`  intended   : ${intended}`);
console.log(`  stage      : ${promoted ? 'after promotion (commit only)' : 'staged (commit and clean tree)'}`);

try {
  let payload;
  try {
    const response = await fetch(`${url}/api/health`, {
      headers: { 'cache-control': 'no-cache' },
      redirect: 'follow',
    });
    if (!response.ok) {
      fail(`/api/health answered ${response.status}.`,
        'The artifact could not be asked what it contains, so it cannot be promoted.');
    }
    payload = await response.json();
  } catch (error) {
    fail('/api/health could not be reached.', String(error?.message ?? error));
  }

  const served = payload?.commit;
  const source = payload?.source;
  console.log(`  served     : ${served ?? '(absent)'}`);
  console.log(`  source     : ${source ?? '(absent)'}`);

  if (!served) {
    fail('The deployment reports no commit.',
      'Either it predates the commit field or git metadata never reached the build. '
      + 'Either way the artifact cannot vouch for its own contents.');
  }

  /*
   * `/api/health` publishes a seven-character prefix deliberately — the route's
   * own comment reasons about that — so the comparison is prefix against prefix,
   * both derived from full SHAs on this side.
   */
  if (!intended.startsWith(served)) {
    fail(`The deployment contains ${served}, and the release intends ${intended.slice(0, 7)}.`,
      'This is the stale-preview case: a deployment that is ready, reachable and '
      + 'already gated, and built from a different source than the one being released.');
  }

  /*
   * The clean-tree claim is checkable on the STAGED artifact, and only there.
   *
   * `deploy:web` stamps `WARSHA_SOURCE_STATE` with `--env`, which is an
   * override on that one deployment. Promotion creates a new deployment record,
   * which resolves its runtime environment from the project rather than from
   * the preview's overrides, so the stamp does not survive — Production reports
   * the right commit and a null source.
   *
   * The honest response is to check each claim where it can be checked, not to
   * pretend. Before promoting, the clean tree is required; that is the moment it
   * decides anything. After promoting, the commit is what remains provable, and
   * it is the claim that matters live: this domain serves that commit.
   *
   * The alternative — setting the stamp as a project-level Production variable —
   * would make it read `clean` forever regardless of the tree it was built from,
   * which is a worse answer than no answer.
   */
  if (!promoted && source !== 'clean') {
    fail(`The deployment's source state is ${source ?? 'unknown'}, not clean.`,
      'A build from a dirty tree carries files that are in no commit, while '
      + 'truthfully reporting the SHA of the last one. Deploy with `npm run '
      + 'deploy:web`, which refuses a dirty tree and stamps this field.');
  }

  if (promoted) {
    console.log(`\nThis domain serves ${served}, which is the commit that was released.`);
  } else {
    console.log(`\nThe staged artifact contains ${served}, which is the commit being `
      + 'released, built from a clean tree.');
    console.log('Safe to promote THIS deployment.');
  }
} catch (error) {
  if (!(error instanceof Refused)) throw error;
  console.error('');
  console.error('RELEASE ARTIFACT CHECK FAILED');
  console.error('');
  console.error(`  ${error.message}`);
  console.error('');
  console.error('  Do not promote this deployment. Deploy again from the intended');
  console.error('  source state and re-run this check against the new URL.');
  console.error('');
  process.exitCode = 1;
}
