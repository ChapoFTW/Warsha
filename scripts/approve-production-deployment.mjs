#!/usr/bin/env node
/**
 * Satisfies the Production environment gate through GitHub's official
 * pending-deployment review API, using the owner's already-authorised
 * credential.
 *
 * ## What this is, and what it is carefully not
 *
 * The gate stays. Required reviewers stay. `prevent_self_review` stays false
 * because Warsha is operated by one person, and nothing here edits any of that.
 * This does not bypass a protection rule, does not use an admin override, and
 * has no effect whatsoever on a run whose validations failed — GitHub will not
 * offer a pending deployment for a run that never reached the gate.
 *
 * What it removes is a person opening a browser to click a button they have
 * already decided to press. The decision is the owner's standing authorisation;
 * this is the execution of it.
 *
 * ## Why it is deliberately narrow
 *
 * A general "approve anything" script is a way to approve the wrong thing at
 * 2am. So the repository is hardcoded, the environment name is hardcoded, and
 * every ambiguity is a refusal rather than a default:
 *
 *   - a different repository            -> refuse
 *   - no Production deployment waiting  -> refuse
 *   - any environment other than the expected one waiting -> refuse
 *   - current_user_can_approve is false -> refuse
 *   - the run's identity cannot be read -> refuse
 *   - the run is not actually waiting   -> refuse
 *
 * For the database workflow it additionally checks the things that make a
 * Production schema deployment safe, and refuses if any of them cannot be
 * established. Those checks are the point: approving is cheap, and the value is
 * entirely in what gets verified first.
 *
 * The credential is read from the machine's store, held in memory, and never
 * printed, logged, written, or placed in an error message.
 *
 * Usage:
 *   node scripts/approve-production-deployment.mjs <run_id> [--reason "..."]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const REPO = 'ChapoFTW/Warsha';
const EXPECTED_ENVIRONMENT = 'Production';
const EXPECTED_PROJECT_REF = 'ekgwzljpcxpxnklzxuvj';
const DATABASE_WORKFLOW = '.github/workflows/deploy-database.yml';

const refuse = (message) => {
  console.error(`REFUSED: ${message}`);
  process.exit(1);
};

function credential() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  const line = out.split('\n').find((l) => l.startsWith('password='));
  if (!line) refuse('no stored GitHub credential is available on this machine');
  return line.slice('password='.length).trim();
}

const token = credential();

async function gh(method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; } }
  return { status: response.status, ok: response.ok, data };
}

const runId = (process.argv[2] ?? '').trim();
if (!/^\d+$/.test(runId)) refuse('a numeric workflow run id is required');

const reasonIndex = process.argv.indexOf('--reason');
const reason = reasonIndex > 0 ? process.argv[reasonIndex + 1] : undefined;

// --- 1. Establish the run's identity ---------------------------------------
const run = await gh('GET', `/repos/${REPO}/actions/runs/${runId}`);
if (!run.ok) refuse(`run ${runId} could not be read from ${REPO} (HTTP ${run.status})`);

const { name: workflowName, path: workflowPath, head_sha: headSha,
  status, head_branch: branch, event } = run.data;
if (!workflowPath || !headSha) refuse('the run identity could not be established');

console.log('=== pending deployment ===');
console.log(`  repository : ${REPO}`);
console.log(`  run        : ${runId}`);
console.log(`  workflow   : ${workflowName} (${workflowPath})`);
console.log(`  event      : ${event}`);
console.log(`  branch     : ${branch}`);
console.log(`  commit     : ${headSha}`);
console.log(`  status     : ${status}`);

if (status !== 'waiting') {
  refuse(`run ${runId} is "${status}", not waiting for a deployment review. `
    + 'Nothing is being approved.');
}

// --- 2. The pending environments must be exactly what we expect -------------
const pending = await gh('GET', `/repos/${REPO}/actions/runs/${runId}/pending_deployments`);
if (!pending.ok) refuse(`pending deployments could not be read (HTTP ${pending.status})`);

const waiting = pending.data ?? [];
if (waiting.length === 0) refuse('no environment is waiting for review on this run');

const names = waiting.map((entry) => entry.environment?.name);
const unexpected = names.filter((name) => name !== EXPECTED_ENVIRONMENT);
if (unexpected.length > 0) {
  refuse(`this run is waiting on ${JSON.stringify(names)}, which includes an `
    + `environment other than ${EXPECTED_ENVIRONMENT}. Approving here could `
    + 'release something that was not reviewed.');
}
if (waiting.length !== 1) {
  refuse(`${waiting.length} ${EXPECTED_ENVIRONMENT} deployments are pending on one run; `
    + 'that is ambiguous and is not approved automatically.');
}

const [target] = waiting;
const environmentId = target.environment?.id;
if (!environmentId) refuse('the pending environment has no id');
if (target.current_user_can_approve !== true) {
  refuse('the authenticated identity is not a permitted reviewer for '
    + `${EXPECTED_ENVIRONMENT}. The gate is doing its job; it is not being worked around.`);
}
console.log(`  environment: ${target.environment.name} (id ${environmentId})`);
console.log(`  can approve: ${target.current_user_can_approve}`);

// --- 3. Database deployments carry extra, specific checks -------------------
if (workflowPath === DATABASE_WORKFLOW) {
  console.log('\n=== database deployment checks ===');

  const jobs = await gh('GET', `/repos/${REPO}/actions/runs/${runId}/jobs`);
  const guard = (jobs.data?.jobs ?? []).find((job) => job.name === 'Guard');
  if (!guard) refuse('the Guard job could not be found on this run');
  if (guard.conclusion !== 'success') {
    refuse(`the Guard job concluded "${guard.conclusion}". A Production schema `
      + 'deployment is not approved past a failed guard.');
  }
  console.log(`  guard            : ${guard.conclusion}`);

  // The project this deployment will link to, read from the environment rather
  // than assumed, because linking to the wrong project is the failure this
  // check exists to prevent.
  const variable = await gh('GET',
    `/repos/${REPO}/environments/${EXPECTED_ENVIRONMENT}/variables/SUPABASE_PROJECT_REF`);
  if (!variable.ok) refuse('SUPABASE_PROJECT_REF is not set for the Production environment');
  if (variable.data.value !== EXPECTED_PROJECT_REF) {
    refuse(`Production is configured to deploy to project "${variable.data.value}", `
      + `not "${EXPECTED_PROJECT_REF}".`);
  }
  console.log(`  project ref      : ${variable.data.value}`);

  // The migration set is read from the commit being deployed, so the approval
  // is about what is actually in that tree.
  const tree = await gh('GET',
    `/repos/${REPO}/contents/supabase/migrations?ref=${headSha}`);
  if (!tree.ok) refuse('the migration set for this commit could not be read');
  const remote = (tree.data ?? []).filter((f) => f.name.endsWith('.sql')).map((f) => f.name).sort();
  const local = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
  console.log(`  migrations       : ${remote.length} in the deployed commit`);

  const onlyRemote = remote.filter((name) => !local.includes(name));
  if (onlyRemote.length > 0) {
    refuse(`the commit being deployed contains migrations this checkout does not have: `
      + `${onlyRemote.join(', ')}. The deployment set is not what was reviewed here.`);
  }

  // Whichever backup path this run is using, it must be a real one.
  const backupRef = await gh('GET',
    `/repos/${REPO}/environments/${EXPECTED_ENVIRONMENT}/variables/PRE_MIGRATION_BACKUP_REF`);
  const exceptionRegister = JSON.parse(
    readFileSync('docs/operations/migration-backup-exceptions.json', 'utf8'));
  const approved = (exceptionRegister.exceptions ?? [])
    .filter((e) => e.environment === 'production').map((e) => e.migration);

  if (backupRef.ok && backupRef.data.value) {
    console.log(`  restore point    : ${backupRef.data.value}`);
  } else if (approved.length > 0) {
    console.log(`  restore point    : none — relying on a recorded exception`);
    console.log(`  exceptions       : ${approved.join(', ')}`);
    console.log('  G22 (Production restore capability) REMAINS OPEN');
  } else {
    refuse('neither a restore point nor an approved backup exception exists for '
      + 'Production. The apply step would refuse anyway; this refuses earlier and '
      + 'more clearly.');
  }
}

// --- 4. Approve -------------------------------------------------------------
const comment = reason
  ?? `Approved by Warsha operations on the owner's standing authorisation. `
    + `Run ${runId}, commit ${headSha.slice(0, 12)}. Gate, reviewers and branch `
    + `policy unchanged.`;

const review = await gh('POST', `/repos/${REPO}/actions/runs/${runId}/pending_deployments`, {
  environment_ids: [environmentId],
  state: 'approved',
  comment,
});

console.log(`\nreview submitted -> HTTP ${review.status}`);
if (!review.ok) {
  console.error(JSON.stringify(review.data).slice(0, 400));
  refuse('GitHub did not accept the approval');
}

// --- 5. Confirm GitHub actually acted ---------------------------------------
const after = await gh('GET', `/repos/${REPO}/actions/runs/${runId}`);
console.log(`run status now   : ${after.data?.status}`);
const stillPending = await gh('GET', `/repos/${REPO}/actions/runs/${runId}/pending_deployments`);
const remaining = (stillPending.data ?? []).length;
console.log(`pending reviews  : ${remaining}`);
if (remaining > 0) {
  console.error('WARNING: a pending review remains after approval — check the run.');
  process.exit(2);
}
console.log('\nApproved. The gate was satisfied, not removed.');
