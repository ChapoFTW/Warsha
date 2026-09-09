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
 *   node scripts/verify-backup-exception.mjs --declared "a.sql,b.sql" \
 *     --environment production --pending "a.sql,b.sql"
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

const argument = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index > 0 && process.argv[index + 1] !== undefined
    ? process.argv[index + 1].trim() : fallback;
};

// Positional form kept for the simple case; the flag form is what the workflow
// uses, because it can also state what the deployment WOULD actually push.
const declaredRaw = argument('--declared', (process.argv[2] ?? '').trim());
const environment = argument('--environment', (process.argv[3] ?? '').trim());
const pendingRaw = argument('--pending', '');

const split = (value) => value.split(',').map((part) => part.trim()).filter(Boolean);
const declared = split(declaredRaw);
const pending = split(pendingRaw);

if (declared.length === 0) {
  fail('no migration was named. The exception must state exactly which '
    + 'migrations are being applied without a restore point.');
}
for (const name of declared) {
  if (WILDCARDS.has(name.toLowerCase())) {
    fail('the backup exception must name migration files, not a wildcard or a '
      + `blanket value (got "${name}"). There is no "skip backups" option.`);
  }
  if (!/^\d{12}_[a-z0-9_]+\.sql$/.test(name)) {
    fail(`"${name}" is not a migration filename. Expected the exact name, `
      + 'for example 202609090002_push_configuration_authority.sql');
  }
}
if (!environment) fail('no environment was given');

/**
 * THE CHECK THAT WAS MISSING.
 *
 * An exception used to be validated for the migration somebody named, while the
 * deployment pushed whatever happened to be pending. The first real use of this
 * gate proved the problem: an exception was approved for one migration and the
 * dry run showed TWO would be applied. The second was harmless, but nothing
 * here had looked at it, and "approved" has to mean the whole set or it means
 * very little.
 *
 * So when the workflow can say what would actually be pushed, the declared set
 * must equal it exactly — no extras riding along, and no naming a migration
 * that is not even part of this deployment.
 */
if (pending.length > 0) {
  const missing = pending.filter((name) => !declared.includes(name));
  const extra = declared.filter((name) => !pending.includes(name));
  if (missing.length > 0) {
    fail(`this deployment would apply ${missing.join(', ')}, which no exception `
      + 'covers. Every migration going in without a restore point must be approved, '
      + 'not just the one that prompted the deployment.');
  }
  if (extra.length > 0) {
    fail(`${extra.join(', ')} was named but is not part of this deployment. `
      + 'The declared set must match what would actually be pushed.');
  }
}

let register;
try {
  register = JSON.parse(readFileSync(REGISTER, 'utf8'));
} catch (error) {
  fail(`the exception register at ${REGISTER} could not be read (${error.code ?? 'unreadable'})`);
}

const approved = [];
for (const migration of declared) {
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
    fail(`the exception reason for ${migration} is too short to be a reason. Say what `
      + 'makes this migration safe without a restore point.');
  }

  // The content pin. This is what makes the exception specific rather than
  // merely named: edit the migration and the approval no longer applies.
  let contents;
  try {
    contents = readFileSync(join(MIGRATIONS, migration), 'utf8');
  } catch {
    fail(`${migration} is named in the register but does not exist in ${MIGRATIONS}`);
  }
  // Normalised to LF so a CRLF checkout does not change a migration's identity.
  const actual = createHash('sha256').update(contents.replace(/\r\n/g, '\n'), 'utf8').digest('hex');

  if (!/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) {
    fail(`the exception for ${migration} does not pin a sha256, so it would approve any content`);
  }
  if (actual !== entry.sha256) {
    fail(`${migration} has changed since the exception was approved.\n`
      + `  approved content: ${entry.sha256}\n`
      + `  current content : ${actual}\n`
      + 'The approval was for the migration as reviewed. Re-review it.');
  }

  approved.push({ migration, actual, entry, reason });
}

console.log('Backup exception ACCEPTED — no verified restore point is claimed.');
console.log(`  environment : ${environment}`);
console.log(`  migrations  : ${approved.length}`);
for (const { migration, actual, entry, reason } of approved) {
  console.log('');
  console.log(`  ${migration}`);
  console.log(`    content   : sha256 ${actual} (matches the approved content)`);
  console.log(`    approved  : ${entry.approvedBy ?? 'unrecorded'} on ${entry.approvedOn ?? 'unrecorded'}`);
  console.log(`    reason    : ${reason}`);
}
if (pending.length > 0) {
  console.log('');
  console.log(`  the declared set matches the ${pending.length} migration(s) this deployment would push`);
}
console.log('');
console.log('G22 (Production backup and restore capability) REMAINS OPEN. This');
console.log('exception is a recorded risk decision about one migration. It is not');
console.log('evidence that Warsha can restore anything, and it does not apply to');
console.log('any other migration or any future deployment.');
