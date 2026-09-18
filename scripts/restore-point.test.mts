import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The restore-point procedure handles a database's personal data. These are
 * the properties it must keep whatever else changes in it: it only reads the
 * linked project, it never writes a dump into the repository or unencrypted
 * to rest, it never prints what it dumped, and it proves a restore rather than
 * assuming one.
 */

let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks += 1; };
const source = readFileSync('scripts/restore-point.mjs', 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

check(/commandArgs\.includes\('reset'\) && !commandArgs\.includes\('--local'\)[\s\S]{0,80}throw/.test(code),
  'A DATABASE RESET THAT IS NOT EXPLICITLY --local IS REFUSED');
check(/commandArgs\.includes\('--linked'\) && !\['dump', 'list'\]\.some/.test(code),
  'THE LINKED PROJECT IS ONLY EVER READ: DUMP AND MIGRATION LIST');
for (const [pattern, label] of [
  [/'reset', '--local', '--no-seed', '--version', remoteHead\]/, 'the restore check resets the local database, at the remote head'],
  [/\['supabase', 'db', 'reset', '--local'\]\)/, 'and the local database is reset again afterwards'],
] as const) check(pattern.test(code), label);
check(!/db', 'push'|'--linked', '--yes'|db reset --linked/.test(code), 'it never pushes to or resets the linked project');

check(/join\(process\.env\.LOCALAPPDATA, 'Warsha', 'restore-points'/.test(code)
  && /if \(work\.startsWith\(root\)\) throw/.test(code),
  'THE WORKING FOLDER IS OUTSIDE THE REPOSITORY, AND THE SCRIPT REFUSES ONE INSIDE IT');
check(/createCipheriv\('aes-256-gcm', key, iv\)/.test(code) && /ProtectedData\]::Protect\(\$k,\$null,"CurrentUser"\)/.test(code),
  'dumps are encrypted with AES-256-GCM under a key wrapped by DPAPI for this user');
check(/rmSync\(source, \{ force: true \}\)/.test(code), 'the plaintext is deleted once encrypted');
check(/catch \(failure\) \{[\s\S]{0,200}rmSync\(schemaFile[\s\S]{0,80}rmSync\(dataFile[\s\S]{0,120}'reset', '--local'/.test(code),
  'ON ANY FAILURE THE PLAINTEXT IS REMOVED AND THE LOCAL DATABASE RESET');
check(/key\.fill\(0\)/.test(code), 'the raw key does not outlive its use');

check(!/console\.(log|error)\([^)]*(result\.stdout|dataText|kept|loader)/.test(code),
  'IT NEVER PRINTS WHAT IT DUMPED OR A COMMAND’S OUTPUT');
check(/replace\(\/=\\\(\.\*\?\\\)\/g, '=\(…\)'\)/.test(source) && /replace\(\/'\[\^'\]\*'\/g, '…'\)/.test(source),
  'a database error is reduced to its class and object; values and literals are stripped');

check(/mismatches = present\.filter\(\(table\) => restored\.get\(table\) !== expected\.get\(table\)\)/.test(code),
  'EVERY TABLE’S RESTORED ROW COUNT IS COMPARED WITH THE DUMP');
check(/absentWithRows\.length\) \{\s*throw/.test(code),
  'a table the restore target lacks is allowed only when the dump holds no rows for it');
check(/process\.exit\(mismatches\.length \? 1 : 0\)/.test(code), 'a mismatch fails the procedure');
check(/remoteOnly\.length\) throw/.test(code) && /is not a prefix of the local one/.test(code),
  'it refuses a remote ledger that has drifted from this checkout');

console.log(`Restore point: ${checks} checks passed.`);
