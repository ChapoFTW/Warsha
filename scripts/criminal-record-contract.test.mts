// The client and the database must mean the same function.
//
// ## The bug this exists to prevent
//
// WPS-023 created `public.submit_my_criminal_record` with seven arguments.
// WPS-024 restated it a day later to add a rate limit, using an older parameter
// list copied from the certificate submitter: five arguments, `p_size_bytes`
// where the real one says `p_file_size_bytes`. Postgres does not complain about
// that — it is a different signature, so it became a second overload.
//
// PostgREST resolves an overload by the KEYS in the request body, and
// `onboarding-repository.ts` sent `p_size_bytes`. So every worker's criminal
// record went to the overload that could never work: it inserted a column that
// does not exist and omitted a NOT NULL one. Criminal-record submission was
// broken for four weeks.
//
// The suite stayed green the entire time, because `wps023` and the pgTAP vetting
// suite both exercise the SEVEN-argument function. The tested function and the
// called function were not the same function, and nothing compared them.
//
// ## How this file compares them
//
// Two independent sources, one shared constant:
//
//   the client       `src/onboarding/criminal-record-submission.ts`, which is
//                    the only place the RPC name and argument keys are written
//   the schema       the migration that actually defines the function
//
// The constant is not duplicated into a fixture here, because a fixture is just
// a third place for the same typo to live. The migration text is parsed instead,
// so the assertion is against what will really be applied.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CRIMINAL_RECORD_RPC,
  CRIMINAL_RECORD_RPC_ARGUMENTS,
  buildCriminalRecordPayload,
  criminalRecordStoragePath,
  isValidDeclaredName,
  normalizeDeclaredName,
} from '../src/onboarding/criminal-record-submission.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

const MIGRATIONS = 'supabase/migrations';
const files = readdirSync(MIGRATIONS).filter(name => name.endsWith('.sql')).sort();

// ---------------------------------------------------------------------------
// 1. What the migrations actually declare
// ---------------------------------------------------------------------------

interface Declared { file: string; args: string[] }

const definitions: Declared[] = [];
const drops: string[] = [];

for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8');

  // `create [or replace] function public.<name>( ... )` up to the closing paren
  // of the parameter list. Comments are stripped first so the prose in a
  // migration header cannot be mistaken for a declaration — several of these
  // files discuss this exact function at length.
  const body = sql.replace(/--[^\n]*/g, '');
  const createPattern = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${CRIMINAL_RECORD_RPC}\\s*\\(([^)]*)\\)`,
    'gi',
  );
  for (const match of body.matchAll(createPattern)) {
    const args = match[1]
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => part.split(/\s+/)[0]);
    definitions.push({ file, args });
  }

  const dropPattern = new RegExp(
    `drop\\s+function\\s+(?:if\\s+exists\\s+)?public\\.${CRIMINAL_RECORD_RPC}\\s*\\(([^)]*)\\)`,
    'gi',
  );
  for (const match of body.matchAll(dropPattern)) drops.push(match[1].trim());
}

check(definitions.length > 0,
  `the migrations declare public.${CRIMINAL_RECORD_RPC}`);

// The definition that wins is the last one applied.
const current = definitions[definitions.length - 1];

// ---------------------------------------------------------------------------
// 2. The client names the same function, with the same arguments, in order
// ---------------------------------------------------------------------------
// The load-bearing assertion, and the one that was missing.

assert.deepEqual(
  [...CRIMINAL_RECORD_RPC_ARGUMENTS],
  current.args,
  `THE CLIENT'S ARGUMENT KEYS MATCH THE FUNCTION AS DECLARED IN ${current.file}`,
);
checks += 1;

// Order matters and is asserted above by deepEqual on arrays rather than sets:
// `p_content_hash` and `p_issue_date` are BOTH optional-looking and adjacent,
// and they are swapped between the two historical signatures. A set comparison
// would have passed on the broken pair.
check(CRIMINAL_RECORD_RPC_ARGUMENTS.indexOf('p_content_hash')
  < CRIMINAL_RECORD_RPC_ARGUMENTS.indexOf('p_issue_date'),
  'the content hash precedes the issue date, as the surviving function declares');

check(CRIMINAL_RECORD_RPC_ARGUMENTS.includes('p_declared_name'),
  'THE CLIENT SENDS p_declared_name — the NOT NULL column the dead overload omitted');
check(CRIMINAL_RECORD_RPC_ARGUMENTS.includes('p_file_size_bytes'),
  'and p_file_size_bytes, not the p_size_bytes that selected the broken overload');
check(!CRIMINAL_RECORD_RPC_ARGUMENTS.includes('p_size_bytes' as never),
  'the old key is gone entirely');

// ---------------------------------------------------------------------------
// 3. Only one signature survives
// ---------------------------------------------------------------------------
// A near-identical overload is exactly how this broke. Any signature ever
// declared that is not the current one must have been dropped.

const distinct = new Map<string, Declared>();
for (const definition of definitions) distinct.set(definition.args.join(','), definition);

const currentKey = current.args.join(',');
for (const [key, definition] of distinct) {
  if (key === currentKey) continue;
  check(drops.length > 0,
    `the superseded signature from ${definition.file} (${key}) is dropped, not left as an overload`);
}

check(distinct.size <= 2,
  'at most two signatures have ever existed, and the extra one is accounted for');

// ---------------------------------------------------------------------------
// 4. The payload the client builds is exactly that shape
// ---------------------------------------------------------------------------
// Declaring the keys and then building a different object would defeat every
// assertion above, so the builder is executed rather than read.

const payload = buildCriminalRecordPayload({
  userId: '11111111-1111-4111-8111-111111111111',
  storagePath: '11111111-1111-4111-8111-111111111111/criminal-record/x.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 1024,
  contentHash: null,
  issueDate: '2026-01-01',
  documentReference: null,
  declaredName: '  Warsha   Worker  ',
});

assert.deepEqual(
  Object.keys(payload).sort(),
  [...CRIMINAL_RECORD_RPC_ARGUMENTS].sort(),
  'THE BUILT PAYLOAD CARRIES EXACTLY THE DECLARED ARGUMENTS — none missing, none invented',
);
checks += 1;

check(payload.p_declared_name === 'Warsha Worker',
  'the declared name is trimmed and its internal runs of space collapsed');
check(payload.p_document_reference === null,
  'a blank document reference is sent as null, matching what the server stores');

// ---------------------------------------------------------------------------
// 5. No surface writes these keys itself
// ---------------------------------------------------------------------------
// One authority, or the next drift is a second argument map somebody added for
// the web worker surface.

function walk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.next', 'dist', '.expo'].includes(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

const AUTHORITY = join('src', 'onboarding', 'criminal-record-submission.ts');
const sources = [...walk('src'), ...walk('app'), ...walk('components'), ...walk(join('web', 'app')),
  ...walk(join('web', 'lib')), ...walk(join('web', 'components'))];

// Matched on the two keys unique to THIS function's signatures rather than on
// every `p_` argument it takes. `p_storage_path` and `p_file_size_bytes` are
// ordinary names that several unrelated RPCs also use — verification documents,
// provider certificates — and flagging those would make this check noise that
// somebody deletes. `p_declared_name` belongs to no other function, and
// `p_size_bytes` belonged only to the dead overload.
const offenders: string[] = [];
for (const file of sources) {
  if (file.endsWith('criminal-record-submission.ts')) continue;
  const source = readFileSync(file, 'utf8');
  if (/p_declared_name|p_size_bytes/.test(source)) offenders.push(file);
}
assert.deepEqual(offenders, [],
  `ONLY ${AUTHORITY} WRITES THE RPC ARGUMENT NAMES`);
checks += 1;

// And nothing calls the RPC by name outside the authority either, so a second
// call site cannot appear with its own object literal.
const namedCallers = sources.filter(file =>
  !file.endsWith('criminal-record-submission.ts')
  && new RegExp(`rpc\\(\\s*['"\`]${CRIMINAL_RECORD_RPC}['"\`]`).test(readFileSync(file, 'utf8')));
assert.deepEqual(namedCallers, [],
  'and no surface passes the RPC name as a literal — callers use CRIMINAL_RECORD_RPC');
checks += 1;

// ---------------------------------------------------------------------------
// 6. The declared name behaves as the product decision requires
// ---------------------------------------------------------------------------
// Egyptian criminal records are usually in Arabic, sometimes French. A name
// filter written for English would reject the ordinary case.

check(normalizeDeclaredName('  محمد   أحمد  ') === 'محمد أحمد',
  'AN ARABIC NAME SURVIVES NORMALIZATION INTACT');
check(normalizeDeclaredName('Chloé   Dupont') === 'Chloé Dupont',
  'and a French name keeps its diacritics');
check(normalizeDeclaredName('ahmed hassan') === 'ahmed hassan',
  'nothing is capitalised for the worker — the document is the authority, not us');
check(isValidDeclaredName('محمد أحمد'), 'an Arabic name is valid');
check(isValidDeclaredName('Chloé Dupont'), 'a French name is valid');
check(!isValidDeclaredName('   '), 'whitespace alone is not a name');
check(!isValidDeclaredName('م'), 'a single character is below the server minimum');
check(!isValidDeclaredName('م'.repeat(121)), 'and 121 characters is above its maximum');

// The path the server and the storage policy both check.
const path = criminalRecordStoragePath('22222222-2222-4222-8222-222222222222', 'image/png');
check(path.startsWith('22222222-2222-4222-8222-222222222222/'),
  'THE STORAGE PATH BEGINS WITH THE OWNER\'S OWN ID, WHICH BOTH THE RPC AND THE POLICY REQUIRE');
check(path.endsWith('.png'), 'and carries the extension for the declared type');

console.log(`Criminal-record contract: ${checks} checks passed.`);
