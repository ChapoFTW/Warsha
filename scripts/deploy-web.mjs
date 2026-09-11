/**
 * Stage a web deployment from a source state that can be proven afterwards.
 *
 * Two things the bare `vercel deploy` cannot do, both of which the stale-preview
 * incident on 2026-09-11 turned out to need:
 *
 *   1. Refuse a dirty tree. `VERCEL_GIT_COMMIT_SHA` is the SHA of HEAD whether
 *      or not the files being uploaded match it, so a deploy from a dirty tree
 *      produces an artifact that truthfully names a commit it does not contain.
 *      Releases require a clean exact validated source state; this is where that
 *      becomes mechanical rather than remembered.
 *
 *   2. Stamp that fact into the build, so `test:release-artifact` can check it
 *      over the network later instead of trusting whoever ran the deploy.
 *
 * It prints the URL and the SHA together, because those two facts belong in the
 * same sentence — the whole incident was them being separated.
 *
 * Usage:
 *   node scripts/deploy-web.mjs              stage a preview
 *   node scripts/deploy-web.mjs --allow-dirty  local experiment; never promote it
 */
import { execFileSync, spawnSync } from 'node:child_process';

const allowDirty = process.argv.includes('--allow-dirty');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const status = git('status', '--porcelain');
const sha = git('rev-parse', 'HEAD');
const subject = git('log', '-1', '--format=%s');

if (status && !allowDirty) {
  console.error(
    'REFUSING TO DEPLOY A DIRTY TREE\n\n'
    + `${status.split('\n').map((line) => `  ${line}`).join('\n')}\n\n'`
    + '  The build would report the SHA of HEAD while containing files that are\n'
    + '  in no commit at all. Commit or stash first.\n\n'
    + '  `--allow-dirty` exists for a local experiment. A deployment made that\n'
    + '  way is stamped `dirty` and the release gate will refuse to promote it.\n',
  );
  process.exit(1);
}

const sourceState = status ? 'dirty' : 'clean';
console.log(`Staging a deployment of ${sha.slice(0, 7)} — ${subject}`);
console.log(`  source state: ${sourceState}\n`);

/*
 * `--env`, not `--build-env`.
 *
 * `/api/health` is `force-dynamic`: it runs in the serverless function at
 * request time, where build-time variables do not exist. Stamping with
 * `--build-env` produced a deployment carrying the right commit and reporting
 * `source: null` — which the release gate correctly refused, and which is how
 * this was found. Both are passed now: the runtime one is what the route reads,
 * and the build one costs nothing and keeps the value available to anything
 * evaluated during the build later.
 */
const result = spawnSync(
  'npx',
  [
    '--yes', 'vercel@latest', 'deploy', '--yes',
    '--env', `WARSHA_SOURCE_STATE=${sourceState}`,
    '--build-env', `WARSHA_SOURCE_STATE=${sourceState}`,
  ],
  { encoding: 'utf8', shell: process.platform === 'win32' },
);

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
process.stdout.write(output);

if (result.status !== 0) {
  console.error(`\nvercel deploy exited ${result.status}.`);
  process.exit(result.status || 1);
}

const url = [...output.matchAll(/https:\/\/[a-z0-9-]+\.vercel\.app/g)].pop()?.[0];
if (!url) {
  console.error('\nThe deployment succeeded but no URL could be read from its output.');
  process.exit(1);
}

console.log('\n--- staged ---');
console.log(`  url    : ${url}`);
console.log(`  commit : ${sha}`);
console.log('\nNext, and before promoting:');
console.log(`  node scripts/release-artifact-sha.mjs --url ${url}`);
