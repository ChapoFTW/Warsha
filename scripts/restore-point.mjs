#!/usr/bin/env node
/**
 * Take a logical restore point of the linked Supabase project, prove it
 * restores, encrypt it at rest, and print only evidence that is safe to keep.
 *
 *   node scripts/restore-point.mjs --environment development --expect-ref <project-ref>
 *
 * The owner's rule (2026-09-17): no Production migration that changes
 * existing data without a verified restore point; a self-managed logical
 * backup is acceptable where managed backups are not available. Dumps are
 * never committed, never written unencrypted into the repository, never
 * printed, and persist only encrypted, outside the repository, readable only
 * by this Windows user (DPAPI). What is recorded is evidence, not data: sizes,
 * hashes of the ciphertext, table row counts and whether the restore matched.
 *
 * Steps:
 *  1. Guards: the linked project is the one named; the remote migration ledger
 *     is a prefix of the local one (no remote-only migration, no drift).
 *  2. Dump the schema and the data (`supabase db dump --linked`), into a
 *     working folder under %LOCALAPPDATA%, never the repository.
 *  3. Prove it restores: reset the LOCAL database to the remote's migration
 *     head without seeds, empty every table the dump carries, load the data
 *     with triggers held, and compare every table's row count with the dump.
 *  4. Encrypt both files (AES-256-GCM, a fresh key wrapped with DPAPI for this
 *     user) and delete the plaintext.
 *  5. Reset the LOCAL database to the current migrations, so no restored data
 *     stays behind.
 *
 * It never resets, pushes to or writes to the linked project. Every `db reset`
 * here carries `--local`, and the script refuses to run one without it.
 */
import { spawnSync } from 'node:child_process';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]?.startsWith('--') ? 'true' : all[index + 1] ?? 'true']);
  return pairs;
}, []));
const environment = args.environment;
const expectedRef = args['expect-ref'];
if (!['development', 'production'].includes(environment) || !expectedRef) {
  console.error('usage: node scripts/restore-point.mjs --environment development|production --expect-ref <project-ref>');
  process.exit(2);
}
if (process.platform !== 'win32') {
  console.error('This procedure protects the key with Windows DPAPI and runs on the operator\'s Windows machine only.');
  process.exit(2);
}

const root = resolve(import.meta.dirname, '..');
const DOCKER = process.env.WARSHA_DOCKER ?? 'docker';
const DB_CONTAINER = 'supabase_db_warsha';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const work = join(process.env.LOCALAPPDATA, 'Warsha', 'restore-points', `${environment}-${stamp}`);
if (work.startsWith(root)) throw new Error('refusing to write a restore point inside the repository');
mkdirSync(work, { recursive: true });

/** Run a command; its output is captured and never printed. */
function run(command, commandArgs, { input, allowFailure = false } = {}) {
  if (command === 'npx' && commandArgs.includes('reset') && !commandArgs.includes('--local')) {
    throw new Error('refusing a database reset that is not explicitly --local');
  }
  if (command === 'npx' && commandArgs.includes('--linked') && !['dump', 'list'].some((verb) => commandArgs.includes(verb))) {
    throw new Error('the linked project is only ever read (dump, migration list)');
  }
  const result = spawnSync(command, commandArgs, {
    cwd: root, input, encoding: 'utf8', maxBuffer: 1024 * 1024 * 512, shell: process.platform === 'win32' && command === 'npx',
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  });
  if (result.status !== 0 && !allowFailure) {
    // The exit status and the step, never the output: it may carry a
    // connection string or data. A database error is reduced to its class and
    // the object it names — values, keys and literals are stripped.
    const reason = String(result.stderr ?? '').split('\n')
      .filter((line) => /^(psql:[^:]*:\d+: )?ERROR:|^CONTEXT:/.test(line))
      .map((line) => line.replace(/^psql:[^:]*:\d+: /, '')
        .replace(/=\(.*?\)/g, '=(…)').replace(/: ".*"$/, ': "…"').replace(/line \d+: .*/, 'line …')
        .replace(/'[^']*'/g, '…').slice(0, 200))
      .slice(0, 4).join(' | ');
    if (reason) console.error(`  ${reason}`);
    throw new Error(`${command} ${commandArgs.filter((part) => !part.includes('/') && !part.includes('\\')).slice(0, 4).join(' ')} failed with status ${result.status}`);
  }
  return result.stdout ?? '';
}

const step = (message) => console.log(`- ${message}`);

// --- 1. Guards -----------------------------------------------------------------
const linkedRef = readFileSync(join(root, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linkedRef !== expectedRef) throw new Error(`the linked project is ${linkedRef}, not ${expectedRef}`);
step(`linked project is ${linkedRef}`);

const listing = run('npx', ['supabase', 'migration', 'list', '--linked']);
const ledger = JSON.parse(listing.slice(listing.indexOf('{'))).migrations;
const remoteOnly = ledger.filter((row) => row.remote && !row.local).map((row) => row.remote);
if (remoteOnly.length) throw new Error(`the remote has migrations this checkout does not: ${remoteOnly.join(', ')}`);
const applied = ledger.filter((row) => row.remote).map((row) => row.remote);
const pending = ledger.filter((row) => row.local && !row.remote).map((row) => row.local);
const firstPending = ledger.findIndex((row) => !row.remote);
if (firstPending >= 0 && ledger.slice(firstPending).some((row) => row.remote)) {
  throw new Error('the remote ledger is not a prefix of the local one');
}
const remoteHead = applied.at(-1);
step(`remote head ${remoteHead}; ${pending.length} local migration(s) not yet applied`);

const schemaFile = join(work, 'schema.sql');
const dataFile = join(work, 'data.sql');
let evidenceFiles;
let expected;
let totalRows;
let mismatches;
let skippedEmpty = [];
try {
  // --- 2. Dump ---------------------------------------------------------------------
  run('npx', ['supabase', 'db', 'dump', '--linked', '-f', schemaFile]);
  run('npx', ['supabase', 'db', 'dump', '--linked', '--data-only', '--use-copy', '-f', dataFile]);
  step(`dumped schema (${statSync(schemaFile).size} bytes) and data (${statSync(dataFile).size} bytes) outside the repository`);

  /** Row counts per table, read from the COPY blocks of the data dump. */
  function dumpCounts(text) {
    const counts = new Map();
    let table = null;
    let rows = 0;
    for (const line of text.split('\n')) {
      if (table === null) {
        const match = /^COPY ("?[\w$]+"?\."?[\w$]+"?) \(/.exec(line);
        if (match) { table = match[1].replaceAll('"', ''); rows = 0; }
      } else if (line === '\\.' || line === '\\.\r') {
        counts.set(table, (counts.get(table) ?? 0) + rows);
        table = null;
      } else {
        rows += 1;
      }
    }
    return counts;
  }
  const dataText = readFileSync(dataFile, 'utf8');
  expected = dumpCounts(dataText);
  totalRows = [...expected.values()].reduce((sum, value) => sum + value, 0);
  step(`the dump carries ${expected.size} tables and ${totalRows} rows`);

  // --- 3. Prove it restores ---------------------------------------------------------
  run('npx', ['supabase', 'db', 'reset', '--local', '--no-seed', '--version', remoteHead]);
  step(`local database reset to ${remoteHead} without seeds`);
  // The auth and storage services migrate their own schemas after a reset, in
  // the background. Load nothing until those schemas have stopped changing.
  const managedShape = () => run(DOCKER, ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At'],
    { input: "select count(*) from information_schema.columns where table_schema in ('auth','storage');" }).trim();
  const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  let shape = managedShape();
  for (let settled = 0, attempts = 0; settled < 3 && attempts < 60; attempts += 1) {
    pause(5000);
    const next = managedShape();
    settled = next === shape && next !== '0' ? settled + 1 : 0;
    shape = next;
  }
  step(`auth and storage schemas settled (${shape} columns)`);
  const quoted = (name) => name.split('.').map((part) => `"${part}"`).join('.');
  // Holding triggers needs a superuser; locally that is supabase_admin.
  const admin = (sql, extra = []) => run(DOCKER,
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...extra], { input: sql });

  // A table the source has and the restore target does not — a managed schema
  // (auth, storage) a service version ahead of the local one — is allowed only
  // if the dump holds no rows for it. Every row must be proven to restore.
  const sequences = [...dataText.matchAll(/SELECT pg_catalog\.setval\('([^']+)'/g)].map((match) => match[1]);
  const presence = admin(
    [...expected.keys()].map((table) => `select 't', '${table}', to_regclass('${quoted(table)}') is not null`)
      .concat(sequences.map((sequence) => `select 's', '${sequence.replaceAll("'", "''")}', to_regclass('${sequence.replaceAll("'", "''")}') is not null`))
      .join(' union all ') + ';', ['-At', '-F', '\t']).trim().split('\n').filter(Boolean).map((line) => line.split('\t'));
  const absentTables = presence.filter(([kind, , present]) => kind === 't' && present !== 't').map(([, name]) => name);
  const absentSequences = new Set(presence.filter(([kind, , present]) => kind === 's' && present !== 't').map(([, name]) => name));
  const absentWithRows = absentTables.filter((table) => expected.get(table) > 0);
  if (absentWithRows.length) {
    throw new Error(`tables with rows are missing from the restore target: ${absentWithRows.join(', ')}`);
  }
  const absent = new Set(absentTables);
  let skipping = false;
  const kept = [];
  for (const line of dataText.split('\n')) {
    const copy = /^COPY ("?[\w$]+"?\."?[\w$]+"?) \(/.exec(line);
    if (copy && absent.has(copy[1].replaceAll('"', ''))) { skipping = true; continue; }
    if (skipping) { if (line === '\\.' || line === '\\.\r') skipping = false; continue; }
    const setval = /^SELECT pg_catalog\.setval\('([^']+)'/.exec(line);
    if (setval && absentSequences.has(setval[1])) continue;
    kept.push(line);
  }
  const present = [...expected.keys()].filter((table) => !absent.has(table));
  admin([
    'SET session_replication_role = replica;',
    present.length ? `TRUNCATE ${present.map(quoted).join(', ')} CASCADE;` : '',
    kept.join('\n'),
    'SET session_replication_role = origin;',
  ].join('\n'), ['-q', '-1']);

  const countSql = present.map((table) => `select '${table}', count(*) from ${quoted(table)}`).join(' union all ') || 'select 1 where false';
  const restored = new Map(admin(`${countSql};`, ['-At', '-F', '\t']).trim().split('\n').filter(Boolean).map((line) => {
    const [table, count] = line.split('\t');
    return [table, Number(count)];
  }));
  mismatches = present.filter((table) => restored.get(table) !== expected.get(table))
    .map((table) => ({ table, dumped: expected.get(table), restored: restored.get(table) ?? null }));
  skippedEmpty = absentTables;
  step(mismatches.length ? `RESTORE MISMATCH in ${mismatches.length} table(s)`
    : `restored ${present.length} tables with the dumped row count`
      + (absentTables.length ? `; ${absentTables.length} empty table(s) the local services do not have: ${absentTables.join(', ')}` : ''));

  // --- 4. Encrypt at rest ---------------------------------------------------------------
  const key = randomBytes(32);
  const sha256 = (path) => new Promise((done) => {
    const hash = createHash('sha256');
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('end', () => done(hash.digest('hex')));
  });
  const files = [];
  for (const source of [schemaFile, dataFile]) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(readFileSync(source)), cipher.final()]);
    const target = `${source}.enc`;
    writeFileSync(target, Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
    rmSync(source, { force: true });
    files.push({ name: `${source.split(/[\\/]/).pop()}.enc`, bytes: statSync(target).size, sha256: await sha256(target) });
  }
  // The key, wrapped for this Windows user only. PowerShell reads it from stdin.
  const wrapped = run('powershell', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName System.Security; $k=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); '
    + '[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect($k,$null,"CurrentUser"))'],
    { input: key.toString('base64') }).trim();
  key.fill(0);
  writeFileSync(join(work, 'key.dpapi'), wrapped);
  step('both files encrypted (AES-256-GCM, key wrapped with DPAPI for this user); plaintext deleted');
  evidenceFiles = files;
} catch (failure) {
  // Whatever happened, no plaintext dump and no restored data stay behind.
  rmSync(schemaFile, { force: true });
  rmSync(dataFile, { force: true });
  try { run('npx', ['supabase', 'db', 'reset', '--local']); } catch { /* reported below */ }
  console.error(`- FAILED: ${failure instanceof Error ? failure.message : 'unknown failure'}; plaintext removed, local database reset`);
  process.exit(1);
}

// --- 5. Leave no restored data behind ---------------------------------------------
run('npx', ['supabase', 'db', 'reset', '--local']);
step('local database reset to the current migrations; the restored data is gone');

const evidence = {
  reference: `logical:${environment}:${linkedRef}:${stamp}:${evidenceFiles[1].sha256.slice(0, 16)}`,
  environment, projectRef: linkedRef, takenAt: new Date().toISOString(), remoteHead, pendingMigrations: pending,
  files: evidenceFiles, tables: expected.size, rows: totalRows,
  restoreCheck: { target: 'local Supabase at the remote migration head', tablesCompared: expected.size - skippedEmpty.length,
    mismatches, emptyTablesAbsentLocally: skippedEmpty },
  storage: 'Database only. Storage objects (photos, documents) are not in a database dump.',
  location: 'Encrypted under %LOCALAPPDATA%\\Warsha\\restore-points on the operator machine; never in the repository.',
};
writeFileSync(join(work, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
process.exit(mismatches.length ? 1 : 0);
