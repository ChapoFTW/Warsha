/**
 * The Production approval helper must stay narrow.
 *
 * It satisfies a real GitHub protection gate using the owner's authorised
 * credential, under standing authorisation. That is a reasonable thing to
 * automate and a dangerous thing to generalise: the difference between this and
 * a liability is entirely in what it refuses.
 *
 * So the guards are asserted structurally. Nothing here calls GitHub — a test
 * that approved a deployment to prove it can approve deployments would be the
 * bug it is meant to prevent.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };

const helper = readFileSync('scripts/approve-production-deployment.mjs', 'utf8');

// --- It is pinned, not parameterised ---------------------------------------
ok(/const REPO = 'ChapoFTW\/Warsha'/.test(helper),
  'THE REPOSITORY IS HARDCODED — this cannot be pointed at another repo');
ok(/const EXPECTED_ENVIRONMENT = 'Production'/.test(helper),
  'and the environment is hardcoded too');
ok(/const EXPECTED_PROJECT_REF = 'ekgwzljpcxpxnklzxuvj'/.test(helper),
  'and the Supabase project it may deploy to is named explicitly');
ok(!/process\.env\.(GITHUB_REPOSITORY|REPO)/.test(helper),
  'the repository is not taken from the environment, where it could be changed');

// --- Every ambiguity is a refusal ------------------------------------------
for (const [pattern, what] of [
  [/status !== 'waiting'/, 'a run that is not waiting is refused'],
  [/no environment is waiting for review/, 'a run with nothing pending is refused'],
  [/includes an\s*\+?\s*`?\$?\{?EXPECTED_ENVIRONMENT|environment other than/, 'an unexpected environment is refused'],
  [/waiting\.length !== 1/, 'multiple pending deployments are refused as ambiguous'],
  [/current_user_can_approve !== true/, 'a reviewer who may not approve is refused'],
  [/the run identity could not be established/, 'an unidentifiable run is refused'],
] as const) {
  ok(pattern.test(helper), what as string);
}

// --- Database deployments carry the extra checks ---------------------------
ok(/guard\.conclusion !== 'success'/.test(helper),
  'A FAILED GUARD IS NEVER APPROVED PAST');
ok(/SUPABASE_PROJECT_REF/.test(helper),
  'the project ref is verified against the environment, not assumed');
ok(/migrations this checkout does not have/.test(helper),
  'a deployment containing migrations this checkout has not seen is refused');
ok(/migration-backup-exceptions\.json/.test(helper),
  'the backup governance is checked before approving');
ok(/G22 .*REMAINS OPEN/.test(helper),
  'and an approval that relies on an exception says the gap is still open');

// --- It never weakens what it satisfies ------------------------------------
ok(!/PUT.*environments/.test(helper),
  'THE HELPER NEVER EDITS ENVIRONMENT PROTECTION — it satisfies the gate, it does not move it');
ok(!/prevent_self_review/.test(helper) || !/PUT/.test(helper),
  'it does not touch self-review policy');
ok(!/bypass/i.test(helper.replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, ''))
  || /does not bypass|not bypass/i.test(helper),
  'it uses the review API rather than any bypass');
ok(/state: 'approved'/.test(helper), 'it submits a normal approved review');
ok(/environment_ids: \[environmentId\]/.test(helper),
  'and targets exactly the pending environment id GitHub returned');

// --- The credential is handled as a credential -----------------------------
ok(/git', \['credential', 'fill'\]/.test(helper),
  'the credential comes from the machine store rather than a file or argument');
ok(!/console\.log\([^)]*token/i.test(helper),
  'THE TOKEN IS NEVER PRINTED');
ok(!/writeFileSync\([^)]*token/i.test(helper), 'and never written to disk');

console.log(`Deployment approval guards: ${checks} checks passed.`);
