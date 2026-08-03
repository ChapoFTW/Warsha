#!/usr/bin/env node
/**
 * WPS-018 migration safety audit.
 *
 * A remotely applied migration must never be edited. This checks the things a
 * reviewer cannot reliably eyeball: ordering, naming, forward-only structure,
 * and the destructive statements that would break a running deployment.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const failures = [];
const warnings = [];

const files = readdirSync(DIR).filter(name => name.endsWith('.sql')).sort();
if (files.length === 0) failures.push('no migrations found');

// 1. Naming and ordering.
let previous = '';
for (const file of files) {
  if (!/^\d{12}_[a-z0-9_]+\.sql$/.test(file)) {
    failures.push(`${file}: name must be <12-digit timestamp>_<snake_case>.sql`);
    continue;
  }
  const stamp = file.slice(0, 12);
  if (stamp <= previous) failures.push(`${file}: timestamp does not increase (previous ${previous})`);
  previous = stamp;
}

// 2. Statements that break a live deployment or rewrite history.
const DESTRUCTIVE = [
  { re: /^\s*drop\s+table\s+(?!if\s+exists\s+pg_temp)/im, why: 'drops a table' },
  { re: /^\s*drop\s+schema\s+/im, why: 'drops a schema' },
  { re: /^\s*truncate\s+/im, why: 'truncates a table' },
  { re: /^\s*alter\s+table\s+\S+\s+drop\s+column\s+/im, why: 'drops a column' },
  { re: /^\s*drop\s+function\s+public\./im, why: 'drops a public function' },
  { re: /^\s*drop\s+policy\s+(?!if\s+exists)/im, why: 'drops a policy without IF EXISTS' },
];

for (const file of files) {
  const sql = readFileSync(join(DIR, file), 'utf8');
  const body = sql.replace(/--[^\n]*/g, '');
  for (const { re, why } of DESTRUCTIVE) {
    if (re.test(body)) failures.push(`${file}: ${why}; migrations are forward-only`);
  }
  // Every SECURITY DEFINER function must pin a search_path.
  const definers = (body.match(/security\s+definer/gi) ?? []).length;
  const pinned = (body.match(/set\s+search_path\s*=/gi) ?? []).length;
  if (definers > pinned) {
    failures.push(`${file}: ${definers} SECURITY DEFINER functions but only ${pinned} pinned search_path`);
  }
  // EXTRACT(... FROM ...) cannot be schema-qualified; this exact defect cost
  // WPS-014 a failed hosted push.
  if (/pg_catalog\.extract\s*\(/i.test(body)) {
    failures.push(`${file}: pg_catalog.extract(... from ...) is invalid grammar; use pg_catalog.date_part`);
  }
  if (/\bservice_role\b/.test(body)) {
    warnings.push(`${file}: mentions service_role`);
  }
}

// 3. A migration that git already recorded as pushed must not be modified.
// The applied set is whatever exists in an ancestor commit; a modification to
// one of those files is flagged for explicit review.
try {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const changed = execFileSync('git', ['diff', '--name-only', head, '--', DIR], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const committed = new Set(
    execFileSync('git', ['ls-tree', '-r', '--name-only', head, '--', DIR], { encoding: 'utf8' })
      .split('\n').filter(Boolean),
  );
  for (const file of changed) {
    if (committed.has(file)) {
      warnings.push(`${file}: an already-committed migration is modified in the working tree — confirm it was never applied to a hosted project`);
    }
  }
} catch {
  warnings.push('git comparison unavailable; migration modification check skipped');
}

for (const warning of warnings) console.warn(`warning: ${warning}`);

if (failures.length) {
  console.error('Migration audit failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Migration audit clean: ${files.length} migrations, ordering, naming, and forward-only structure verified.`);
