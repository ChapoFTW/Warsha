/**
 * The backup gate, and the one narrow way through it.
 *
 * Warsha cannot currently claim a verified Production restore point — gap G22
 * in the backup runbook says the plan is unconfirmed and no restore has ever
 * been performed. The deployment workflow therefore accepts either a real
 * `PRE_MIGRATION_BACKUP_REF`, or an owner-recorded exception pinned to one
 * migration's content.
 *
 * The whole value of that mechanism is that it stays narrow. A gate with a
 * general escape hatch is not a gate, so what is asserted here is mostly what
 * the validator REFUSES: wildcards, blanket words, unapproved migrations, the
 * wrong environment, and — the one that matters most — a migration whose
 * content has changed since it was approved.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

const VALIDATOR = 'scripts/verify-backup-exception.mjs';
const REGISTER = 'docs/operations/migration-backup-exceptions.json';
const APPROVED = '202609090002_push_configuration_authority.sql';
const MIGRATION_PATH = `supabase/migrations/${APPROVED}`;

/** Runs the validator and reports only whether it approved. */
const decide = (migration: string, environment: string) => {
  try {
    execFileSync('node', [VALIDATOR, migration, environment], { encoding: 'utf8', stdio: 'pipe' });
    return 'accepted';
  } catch {
    return 'refused';
  }
};

// --- Refusals ---------------------------------------------------------------
// Every value somebody might reach for to make a red deployment go green.
for (const wildcard of ['*', '**', 'all', 'any', 'true', 'yes', 'skip', 'skip-backup',
  'no-backup', 'none', '.', '-', 'migrations', '']) {
  equal(decide(wildcard, 'production'), 'refused',
    `"${wildcard || '(empty)'}" is refused — there is no blanket exception`);
}

equal(decide('202601010001_not_real.sql', 'production'), 'refused',
  'a migration that does not exist is refused');
equal(decide('202609010001_push_delivery_authority.sql', 'production'), 'refused',
  'A REAL BUT UNAPPROVED MIGRATION IS REFUSED — approval is per migration');
equal(decide(APPROVED, 'staging'), 'refused',
  'the approved migration is refused in an environment it was not approved for');
equal(decide('not-a-filename', 'production'), 'refused',
  'something that is not a migration filename is refused');
equal(decide('../../etc/passwd', 'production'), 'refused',
  'a path traversal is refused before anything is read');

// --- The one acceptance -----------------------------------------------------
equal(decide(APPROVED, 'production'), 'accepted',
  'the owner-approved migration is accepted in production');

// --- The content pin --------------------------------------------------------
/**
 * The assertion the mechanism exists for. An exception approves a migration AS
 * REVIEWED; if its content changes, the approval must stop applying, or
 * "approved" quietly comes to mean "named".
 *
 * The migration is modified and restored inside a try/finally, and the restore
 * is verified afterwards, because a test that leaves a mutated migration behind
 * is worse than no test.
 */
const original = readFileSync(MIGRATION_PATH, 'utf8');
let afterMutation = 'not run';
try {
  writeFileSync(MIGRATION_PATH, `${original}\n-- a byte that was not reviewed\n`);
  afterMutation = decide(APPROVED, 'production');
} finally {
  writeFileSync(MIGRATION_PATH, original);
}
equal(afterMutation, 'refused',
  'A MIGRATION EDITED AFTER APPROVAL IS REFUSED — the exception pins content, not just a name');
equal(readFileSync(MIGRATION_PATH, 'utf8'), original,
  'and the test restored the migration exactly');
equal(decide(APPROVED, 'production'), 'accepted',
  'the restored migration is accepted again, proving the restore was byte-exact');

// --- The register itself ----------------------------------------------------
const register = JSON.parse(readFileSync(REGISTER, 'utf8')) as {
  exceptions: {
    migration: string; sha256: string; environment: string; reason: string;
    evidence: { rollback: string } & Record<string, unknown>;
  }[];
};
/**
 * This used to assert "exactly one exception exists". That was the right
 * instinct and the wrong mechanism: a second migration legitimately needed one,
 * and a hard count only forces whoever adds the third to edit the number —
 * which teaches the habit it was meant to prevent.
 *
 * So the ceiling is low and watched, and the real rigour is per entry: every
 * exception must name a migration that exists, pin its current content, give a
 * reason worth reading, and carry the evidence the decision rested on.
 */
ok(register.exceptions.length <= 3,
  `${register.exceptions.length} exceptions recorded — this list is a watched ceiling, `
  + 'not a place to keep adding rows');

const migrations = register.exceptions.map((e) => e.migration);
equal(new Set(migrations).size, migrations.length,
  'no migration is excepted twice, so it is always clear which decision applies');

for (const entry of register.exceptions) {
  const contents = readFileSync(`supabase/migrations/${entry.migration}`, 'utf8');
  const hash = createHash('sha256').update(contents.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
  equal(entry.sha256, hash, `${entry.migration}: the recorded hash matches the file on disk today`);
  ok(entry.reason.length >= 40, `${entry.migration}: the reason is long enough to be a reason`);
  ok(/G22/.test(entry.reason) || /restore/i.test(entry.reason),
    `${entry.migration}: names the restore-capability gap rather than hiding it`);
  ok(entry.evidence && typeof entry.evidence === 'object',
    `${entry.migration}: carries the evidence the decision rested on`);
  ok(typeof entry.evidence.rollback === 'string' && entry.evidence.rollback.length > 10,
    `${entry.migration}: STATES ITS ROLLBACK — an exception without one is a hope`);
}

// --- The gap stays open -----------------------------------------------------
const runbook = readFileSync('docs/operations/backup-runbook.md', 'utf8');
ok(/No backup is claimed to be working/.test(runbook),
  'THE BACKUP RUNBOOK STILL SAYS NO BACKUP IS VERIFIED');
ok(/G22/.test(runbook), 'and G22 is still named there');
const validator = readFileSync(VALIDATOR, 'utf8');
ok(/G22 .*REMAINS OPEN|REMAINS OPEN/.test(validator),
  'and the validator says so on every acceptance, so nobody reads it as closed');

// --- No reusable skip switch -----------------------------------------------
const workflow = readFileSync('.github/workflows/deploy-database.yml', 'utf8');
ok(/backup_exception:/.test(workflow), 'the workflow takes a named exception');
ok(/type: string/.test(workflow.slice(workflow.indexOf('backup_exception:'))),
  'AND IT IS A FILENAME, NOT A CHECKBOX');
ok(!/skip_backup|skip-backup:|force_deploy/.test(workflow),
  'there is no reusable skip-backups switch anywhere in the workflow');
ok(/Both a restore point and a backup exception were supplied/.test(workflow),
  'supplying both a backup and an exception is refused rather than silently preferred');
ok(/verify-backup-exception\.mjs/.test(workflow),
  'and the decision is delegated to the validator rather than inlined in bash');

// --- The declared set must equal the deployment set ------------------------
/**
 * The gap the first real deployment exposed. An exception was validated for the
 * migration somebody named, while `db push` would have applied two. The extra
 * one was harmless — a single UPDATE of lock-screen copy — but nothing had
 * looked at it, and an approval that does not cover the whole set is not an
 * approval.
 */
const SECOND = '202609090001_professional_is_the_user_facing_role.sql';
const BOTH = `${SECOND},${APPROVED}`;

const decideSet = (declared: string, pending: string) => {
  try {
    execFileSync('node', [VALIDATOR, '--declared', declared, '--environment', 'production',
      '--pending', pending], { encoding: 'utf8', stdio: 'pipe' });
    return 'accepted';
  } catch { return 'refused'; }
};

equal(decideSet(APPROVED, BOTH), 'refused',
  'DECLARING ONE MIGRATION WHILE TWO WOULD BE APPLIED IS REFUSED');
equal(decideSet(BOTH, APPROVED), 'refused',
  'naming a migration that is not part of the deployment is refused');
equal(decideSet(BOTH, BOTH), 'accepted',
  'and a declared set matching the deployment set exactly is accepted');
equal(decideSet('', BOTH), 'refused', 'an empty declaration is refused');

// The workflow must take the pending set from the CLI, not from the operator.
ok(/supabase db push --linked --dry-run/.test(workflow),
  'THE WORKFLOW COMPUTES WHAT WOULD BE PUSHED RATHER THAN TRUSTING THE INPUT');
ok(/--pending/.test(workflow), 'and passes it to the validator to compare against');
ok(/No migrations are pending/.test(workflow),
  'a deployment that would change nothing does not get an exception recorded against it');

console.log(`Backup exception gate: ${checks} checks passed.`);
