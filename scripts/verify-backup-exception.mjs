#!/usr/bin/env node
/**
 * Decides whether a Production migration may proceed without a verified restore
 * point.
 *
 * The deployment workflow asks for exactly one of two things:
 *
 *   A. PRE_MIGRATION_BACKUP_REF names a verified restore point, or
 *   B. this validator approves a migration-specific, owner-recorded exception.
 *
 * There is deliberately no third option, and B is deliberately not a switch.
 * "Skip the backup" as a boolean input would be used once for a good reason and
 * then forever out of habit, which is how a safety gate becomes a checkbox. An
 * exception here names ONE migration and pins its content hash, so it expires
 * the moment that migration changes and cannot be pointed at anything else.
 *
 * Usage:
 *   node scripts/verify-backup-exception.mjs <migration-filename> <environment>
 *
 * Exit 0 approves the deployment. Any other exit refuses it, and says why.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const REGISTER = 'docs/operations/migration-backup-exceptions.json';
const MIGRATIONS = join('supabase', 'migrations');

/**
 * Values that would turn a specific exception into a general one. Checked
 * before anything else, because the failure mode this guards against is not a
 * typo — it is somebody reaching for the shortest thing that makes CI pass.
 */
const WILDCARDS = new Set([
  '', '*', '**', 'all', 'any', 'true', 'yes', 'none', '.', './', '-',
  'migrations', 'skip', 'skip-backup', 'no-backup',
]);

const fail = (message) => {
  console.error(`REFUSED: ${message}`);
  process.exit(1);
};

const [, , rawMigration, rawEnvironment] = process.argv;
const migration = (rawMigration ?? '').trim();
const environment = (rawEnvironment ?? '').trim();

if (WILDCARDS.has(migration.toLowerCase())) {
  fail('the backup exception must name one migration file, not a wildcard or a '
    + `blanket value (got "${migration}"). There is no "skip backups" option.`);
}
if (!/^\d{12}_[a-z0-9_]+\.sql$/.test(migration)) {
  fail(`"${migration}" is not a migration filename. Expected the exact name, `
    + 'for example 202609090002_push_configuration_authority.sql');
}
if (!environment) fail('no environment was given');

let register;
try {
  register = JSON.parse(readFileSync(REGISTER, 'utf8'));
} catch (error) {
  fail(`the exception register at ${REGISTER} could not be read (${error.code ?? 'unreadable'})`);
}

const entries = (register.exceptions ?? []).filter(
  (entry) => entry.migration === migration && entry.environment === environment);

if (entries.length === 0) {
  fail(`no owner-approved backup exception exists for ${migration} in ${environment}. `
    + 'Either record a verified PRE_MIGRATION_BACKUP_REF, or have the owner add an '
    + `entry to ${REGISTER}.`);
}
if (entries.length > 1) {
  fail(`${migration} has ${entries.length} exception entries for ${environment}; `
    + 'exactly one is expected, so it is clear which decision was taken.');
}

const [entry] = entries;

// The reason has to be a reason. A short string is how "temp" ends up in an
// audit trail as the justification for skipping a restore point.
const reason = (entry.reason ?? '').trim();
if (reason.length < 40) {
  fail('the exception reason is too short to be a reason. Say what makes this '
    + 'migration safe without a restore point.');
}

// The content pin. This is the part that makes the exception specific rather
// than merely named: edit the migration and the approval no longer applies.
let contents;
try {
  contents = readFileSync(join(MIGRATIONS, migration), 'utf8');
} catch {
  fail(`${migration} is named in the register but does not exist in ${MIGRATIONS}`);
}
// Normalised to LF so a CRLF checkout does not change a migration's identity.
const actual = createHash('sha256').update(contents.replace(/\r\n/g, '\n'), 'utf8').digest('hex');

if (!/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) {
  fail('the exception does not pin a sha256, so it would approve any content');
}
if (actual !== entry.sha256) {
  fail(`${migration} has changed since the exception was approved.\n`
    + `  approved content: ${entry.sha256}\n`
    + `  current content : ${actual}\n`
    + 'The approval was for the migration as reviewed. Re-review it.');
}

console.log('Backup exception ACCEPTED — no verified restore point is claimed.');
console.log(`  migration   : ${migration}`);
console.log(`  environment : ${environment}`);
console.log(`  content     : sha256 ${actual} (matches the approved content)`);
console.log(`  approved by : ${entry.approvedBy ?? 'unrecorded'} on ${entry.approvedOn ?? 'unrecorded'}`);
console.log(`  reason      : ${reason}`);
console.log('');
console.log('G22 (Production backup and restore capability) REMAINS OPEN. This');
console.log('exception is a recorded risk decision about one migration. It is not');
console.log('evidence that Warsha can restore anything, and it does not apply to');
console.log('any other migration or any future deployment.');
