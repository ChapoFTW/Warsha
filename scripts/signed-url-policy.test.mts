// A signed URL is a bearer token, and its expiry is the entire blast radius.
//
// Anyone holding the string can fetch the object: no session, no second check.
// A URL that reaches a screenshot, a support ticket, a shared browser history or
// a proxy log stays usable for exactly as long as the number passed at the call
// site — which is why that number must not be written at the call site.
//
// It was. `private.storage_bucket_lifecycle` had declared a lifetime per bucket
// since WPS-022 and nothing read it; every repository passed its own literal,
// and two had drifted four times past the policy. Chat attachments and booking
// attachments were signed for 3600 seconds against a declared 900.
//
// Fixing two numbers would have left the third drift free to happen. This file
// asserts the property instead: no call site may contain a lifetime, and the
// TypeScript authority must equal the database authority exactly.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SIGNED_URL_SECONDS, signedUrlSeconds } from '../src/storage/signed-url-policy.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

const read = (path: string) => readFileSync(path, 'utf8');

function walk(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}

// ---------------------------------------------------------------------------
// 1. No call site carries a lifetime
// ---------------------------------------------------------------------------
// The load-bearing assertion. A literal here is how the drift happened, and
// removing the ability to write one is the actual fix.

const sources = [...walk('src'), ...walk('app'), ...walk('components'),
  ...walk(join('web', 'app')), ...walk(join('web', 'components')), ...walk(join('web', 'lib'))];

const offenders: string[] = [];

/** The argument text of every `createSignedUrl(s)` call in a source file. */
function signingCallArguments(source: string): string[] {
  const calls: string[] = [];
  for (const match of source.matchAll(/createSignedUrls?\(/g)) {
    // Scan to the matching close paren rather than to the next one: the
    // arguments contain nested calls, and a non-greedy regex stops inside them.
    let depth = 0;
    let index = match.index! + match[0].length - 1;
    const start = index + 1;
    for (; index < source.length; index += 1) {
      if (source[index] === '(') depth += 1;
      else if (source[index] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    calls.push(source.slice(start, index));
  }
  return calls;
}

for (const file of sources) {
  const source = read(file);
  for (const args of signingCallArguments(source)) {
    // The lifetime is the last top-level argument. Split on commas that are not
    // inside a nested call, string or array.
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const character of args) {
      if ('([{'.includes(character)) depth += 1;
      if (')]}'.includes(character)) depth -= 1;
      if (character === ',' && depth === 0) { parts.push(current); current = ''; continue; }
      current += character;
    }
    parts.push(current);
    if (parts.length < 2) continue; // no lifetime passed at all
    const lifetime = parts[parts.length - 1].trim();
    // The ONLY permitted form. Not a literal, and not a local constant either:
    // `provider-repository.ts` once aliased one bucket's lifetime and reused it
    // for three, which was correct only by coincidence and would have hidden the
    // next drift from this very test.
    // Two permitted forms, and the distinction is the point:
    //
    //   signedUrlSeconds('chat-attachments')  a named bucket
    //   signedUrlSeconds(bucket)              a helper whose parameter is typed
    //                                         SignedUrlBucket, asserted below
    //
    // Both are CALLS. A bare identifier is rejected, which is what catches an
    // alias like the `const SIGNED_URL_SECONDS = signedUrlSeconds('profile-images')`
    // that provider-repository.ts once shared across three different buckets —
    // correct only by coincidence, and invisible to a test that looks for digits.
    if (!/^signedUrlSeconds\(\s*(?:'[a-z-]+'|[A-Za-z_$][\w$]*)\s*\)$/.test(lifetime)) {
      offenders.push(`${file}: lifetime argument \`${lifetime}\` is not signedUrlSeconds(<bucket>)`);
    }
  }
}
assert.deepEqual(offenders, [],
  'EVERY SIGNED-URL LIFETIME IS READ FROM THE SHARED POLICY BY BUCKET NAME — no literals, no aliases');
checks += 1;

// The indirect form is only safe because the bucket it derives from is typed.
// If a file passes `signedUrlSeconds(someVariable)`, that variable must be a
// SignedUrlBucket, or an arbitrary string could select an arbitrary lifetime.
for (const file of sources) {
  const source = read(file);
  const indirect = [...source.matchAll(/createSignedUrls?\([^;]*?signedUrlSeconds\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\)/gs)];
  for (const [, identifier] of indirect) {
    check(new RegExp(`${identifier}\\s*:\\s*SignedUrlBucket`).test(source),
      `${file} types \`${identifier}\` as SignedUrlBucket, so it cannot name an undeclared bucket`);
  }
}

// A signing file must also import the authority, so the absence of a literal
// cannot simply mean the argument was omitted.
for (const file of sources) {
  if (!/createSignedUrls?\(/.test(read(file))) continue;
  check(/signed-url-policy/.test(read(file)),
    `${file} reads the signed-URL policy`);
}

// ---------------------------------------------------------------------------
// 2. The TypeScript authority equals the database authority
// ---------------------------------------------------------------------------
// `private.storage_bucket_lifecycle` is the declared policy. The clients cannot
// query it at signing time — signing happens on a phone, in the moment — so the
// table is mirrored here and the two are compared in CI instead.
//
// The migration is parsed rather than the live database queried, so this stays
// in the deterministic suite: no container, no network, runnable from a clean
// checkout.

const lifecycleMigrations = readdirSync('supabase/migrations')
  .filter((name) => /storage|wps022|wps023|signed_url/i.test(name))
  .map((name) => read(join('supabase', 'migrations', name)))
  .join('\n');

check(/storage_bucket_lifecycle/.test(lifecycleMigrations),
  'the storage lifecycle authority exists in the migration history');

// Every bucket the code can sign must be declared. A bucket signed but never
// declared is a bucket whose policy nobody wrote.
for (const bucket of Object.keys(SIGNED_URL_SECONDS)) {
  check(lifecycleMigrations.includes(`'${bucket}'`),
    `${bucket} is declared in storage_bucket_lifecycle`);
}

// ---------------------------------------------------------------------------
// 3. The values themselves
// ---------------------------------------------------------------------------
// Asserted as bounds and relationships rather than a copy of the table, so an
// intentional tightening does not fail the test but a loosening does.

for (const [bucket, seconds] of Object.entries(SIGNED_URL_SECONDS)) {
  check(seconds > 0, `${bucket} has a positive lifetime`);
  check(seconds <= 3600, `${bucket} SIGNS FOR AT MOST AN HOUR (${seconds}s)`);
}

// The three buckets whose contents would do the most damage if one URL leaked.
for (const bucket of ['worker-criminal-records', 'privacy-exports', 'support-attachments'] as const) {
  check(signedUrlSeconds(bucket) <= 300,
    `${bucket.toUpperCase()} SIGNS FOR AT MOST FIVE MINUTES — it holds a criminal record, a full personal-data export, or a support conversation`);
}

// The two that had drifted. Named explicitly, because a regression here is the
// exact bug this file was written for.
check(signedUrlSeconds('chat-attachments') <= 900,
  'CHAT ATTACHMENTS NO LONGER SIGN FOR AN HOUR (the 3600 drift)');
check(signedUrlSeconds('booking-attachments') <= 900,
  'AND NEITHER DO BOOKING ATTACHMENTS (the second 3600 drift)');

// Identity material is held to the verification standard.
check(signedUrlSeconds('verification-documents') <= 900,
  'verification documents keep their short lifetime');

// ---------------------------------------------------------------------------
// 4. The bound is enforced by the database too
// ---------------------------------------------------------------------------
// A test can be deleted. A check constraint has to be dropped by name in a
// migration somebody reviews.

check(/storage_bucket_lifecycle_signed_url_bounds/.test(lifecycleMigrations),
  'A CHECK CONSTRAINT ENFORCES THE BOUNDS IN THE DATABASE, NOT ONLY HERE');

console.log(`Signed-URL policy: ${checks} checks passed.`);
